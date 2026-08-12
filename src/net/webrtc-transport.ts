/**
 * WebRTC transport (DESIGN.md §4.1, §4.5, R-3, R-9).
 *
 * Implements `protocol/`'s `Transport` over an `RTCDataChannel`, and additionally exposes
 * the SDP-level offer/answer exchange. It deliberately knows nothing about how those get
 * from one browser to the other: `ManualSignaler` (task 1.3) wraps these three methods with
 * the compression and base64url encoding that make a block survivable by an email client
 * (R-6). The transport's business is the connection; the blob format is someone else's.
 *
 * The exchange is **non-trickle**: `createOffer` and `acceptOffer` resolve only once ICE
 * gathering has finished, so the description they return already carries every candidate.
 * A copy-and-paste channel cannot deliver candidates incrementally, which is what makes
 * that the only workable shape here (§4.5).
 */

import type { InboundMessage, OutboundMessage } from "../protocol/messages.ts";
import type { Transport, TransportStatus, Unsubscribe } from "../protocol/transport.ts";
import { createCodec, type DecodeFailureCode } from "./codec.ts";

// A free public STUN server (R-3). No TURN relay is configured, so some NAT combinations
// will simply fail to connect — an accepted limitation of the peer-to-peer option (D-1,
// §4.5), reported plainly rather than worked around.
const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

// §4.5 requires gathering to be bounded by a timer so a hopeless network reports failure in
// finite time (R-9). Five seconds is a starting value to be tuned against real connections,
// not a measured one.
const DEFAULT_GATHERING_TIMEOUT_MS = 5000;

const DATA_CHANNEL_LABEL = "checkers";

export interface ProtocolFailure {
  readonly code: DecodeFailureCode;
  readonly detail: string;
}

export interface WebRtcTransportOptions {
  readonly iceServers?: readonly RTCIceServer[];
  readonly gatheringTimeoutMs?: number;
  // Injected so the transport can be unit-tested against a fake: `RTCPeerConnection` does
  // not exist outside a browser, and this project adds no dependency to simulate one.
  readonly createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
}

export interface WebRtcTransport extends Transport {
  createOffer(): Promise<RTCSessionDescriptionInit>;
  acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
  acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
  // Not part of §4.1's Transport. A peer can send bytes that do not decode, and the four
  // methods of Transport give nowhere to report that — dropping them silently is the one
  // option that is definitely wrong. Whether a malformed message should also draw an
  // `error` reply is a session-level question, left open until game/ exists (issue filed).
  onProtocolError(handler: (failure: ProtocolFailure) => void): Unsubscribe;
}

export function createWebRtcTransport(options: WebRtcTransportOptions = {}): WebRtcTransport {
  const gatheringTimeoutMs = options.gatheringTimeoutMs ?? DEFAULT_GATHERING_TIMEOUT_MS;
  const makePeerConnection =
    options.createPeerConnection ?? ((configuration) => new RTCPeerConnection(configuration));

  const connection = makePeerConnection({
    iceServers: [...(options.iceServers ?? DEFAULT_ICE_SERVERS)],
  });
  const codec = createCodec();

  const messageHandlers = new Set<(message: InboundMessage) => void>();
  const statusHandlers = new Set<(status: TransportStatus) => void>();
  const failureHandlers = new Set<(failure: ProtocolFailure) => void>();

  let channel: RTCDataChannel | null = null;
  let closed = false;
  let lastPublished: TransportStatus = "idle";

  // §4.1's six statuses map one-to-one onto RTCPeerConnection.connectionState's six values,
  // with a single deliberate exception: a peer connection can report `connected` while the
  // data channel is still opening, and calling that "connected" would promise a send path
  // that does not exist yet. Such a moment is reported as `connecting`.
  function currentStatus(): TransportStatus {
    if (closed) return "closed";
    switch (connection.connectionState) {
      case "new":
        return "idle";
      case "connecting":
        return "connecting";
      case "connected":
        return channel?.readyState === "open" ? "connected" : "connecting";
      case "disconnected":
        return "reconnecting";
      case "failed":
        return "failed";
      case "closed":
        return "closed";
      default:
        return "idle";
    }
  }

  function publishStatus(): void {
    const next = currentStatus();
    if (next === lastPublished) return;
    lastPublished = next;
    for (const handler of statusHandlers) handler(next);
  }

  function publishFailure(failure: ProtocolFailure): void {
    for (const handler of failureHandlers) handler(failure);
  }

  function handleInbound(data: unknown): void {
    if (typeof data !== "string") {
      publishFailure({ code: "malformed", detail: "expected a text frame" });
      return;
    }

    const result = codec.decode(data);
    if (!result.ok) {
      publishFailure({ code: result.code, detail: result.detail });
      return;
    }

    for (const handler of messageHandlers) handler(result.message);
  }

  function attachChannel(dataChannel: RTCDataChannel): void {
    channel = dataChannel;
    dataChannel.addEventListener("open", publishStatus);
    dataChannel.addEventListener("close", publishStatus);
    dataChannel.addEventListener("message", (event) => {
      handleInbound((event as MessageEvent).data);
    });
  }

  connection.addEventListener("connectionstatechange", publishStatus);
  connection.addEventListener("datachannel", (event) => {
    attachChannel((event as RTCDataChannelEvent).channel);
    publishStatus();
  });

  // Resolves when gathering completes, or when the timer expires — whichever comes first.
  // Expiry is not an error: a description with the candidates gathered so far is still worth
  // sending, and it is the connection attempt, not the gathering, that ultimately reports
  // failure (R-9).
  function waitForGathering(): Promise<void> {
    if (connection.iceGatheringState === "complete") return Promise.resolve();

    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        connection.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      };
      const onStateChange = (): void => {
        if (connection.iceGatheringState === "complete") finish();
      };

      const timer = setTimeout(finish, gatheringTimeoutMs);
      connection.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  return {
    async createOffer(): Promise<RTCSessionDescriptionInit> {
      // The channel is created before the offer on purpose: the offer's SDP only describes
      // a data channel that already exists when it is generated.
      attachChannel(connection.createDataChannel(DATA_CHANNEL_LABEL));

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForGathering();
      return connection.localDescription ?? offer;
    },

    async acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
      // No createDataChannel here: the joiner receives the creator's channel through the
      // `datachannel` event once the connection opens.
      await connection.setRemoteDescription(offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await waitForGathering();
      return connection.localDescription ?? answer;
    },

    async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
      await connection.setRemoteDescription(answer);
    },

    send(message: OutboundMessage): void {
      if (channel?.readyState !== "open") {
        // Throwing rather than queueing or dropping: a move that vanished silently is far
        // harder to diagnose than one that failed where it was sent.
        throw new Error("transport is not open: there is no data channel to send on");
      }
      channel.send(codec.encode(message));
    },

    onMessage(handler: (message: InboundMessage) => void): Unsubscribe {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },

    // Handlers are given the current status on subscribe, so a subscriber that arrives after
    // a transition is not left staring at a blank status until the next one.
    onStatus(handler: (status: TransportStatus) => void): Unsubscribe {
      statusHandlers.add(handler);
      handler(currentStatus());
      return () => {
        statusHandlers.delete(handler);
      };
    },

    onProtocolError(handler: (failure: ProtocolFailure) => void): Unsubscribe {
      failureHandlers.add(handler);
      return () => {
        failureHandlers.delete(handler);
      };
    },

    close(): void {
      if (closed) return;
      closed = true;
      channel?.close();
      connection.close();
      publishStatus();
    },
  };
}
