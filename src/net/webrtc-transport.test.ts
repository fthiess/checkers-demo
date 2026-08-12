import { describe, expect, it } from "vitest";
import type { TransportStatus } from "../protocol/transport.ts";
import { createCodec } from "./codec.ts";
import { createWebRtcTransport } from "./webrtc-transport.ts";

/*
 * `RTCPeerConnection` does not exist outside a browser, and this project adds no dependency
 * to simulate one, so the transport takes a connection factory and these tests drive a fake
 * through it. The fake is deliberately dumb: it records what it was asked to do and lets a
 * test move it between states by hand, which is what makes the non-trickle wait and the
 * status mapping checkable at all.
 */

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = { type }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeDataChannel extends FakeEventTarget {
  readyState: RTCDataChannelState = "connecting";
  readonly sent: string[] = [];
  closeCalls = 0;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = "closed";
    this.emit("close");
  }

  open(): void {
    this.readyState = "open";
    this.emit("open");
  }

  receive(data: unknown): void {
    this.emit("message", { data });
  }
}

class FakePeerConnection extends FakeEventTarget {
  connectionState: RTCPeerConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  readonly createdChannels: FakeDataChannel[] = [];
  closeCalls = 0;
  // How many channels existed when the offer was generated — the offer's SDP can only
  // describe a data channel that already exists, so the order is load-bearing.
  channelsWhenOfferCreated = -1;

  createDataChannel(_label: string): FakeDataChannel {
    const channel = new FakeDataChannel();
    this.createdChannels.push(channel);
    return channel;
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    this.channelsWhenOfferCreated = this.createdChannels.length;
    return Promise.resolve({ type: "offer", sdp: "offer-sdp" });
  }

  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "answer", sdp: "answer-sdp" });
  }

  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    // A real implementation begins gathering here, and localDescription grows the gathered
    // candidates as it goes; the suffix stands in for them.
    this.localDescription = { type: description.type, sdp: `${description.sdp}+candidates` };
    this.iceGatheringState = "gathering";
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    return Promise.resolve();
  }

  close(): void {
    this.closeCalls += 1;
    this.connectionState = "closed";
  }

  completeGathering(): void {
    this.iceGatheringState = "complete";
    this.emit("icegatheringstatechange");
  }

  moveTo(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.emit("connectionstatechange");
  }
}

function asPeerConnection(fake: FakePeerConnection): RTCPeerConnection {
  return fake as unknown as RTCPeerConnection;
}

function transportOver(fake: FakePeerConnection, gatheringTimeoutMs = 5000) {
  return createWebRtcTransport({
    gatheringTimeoutMs,
    createPeerConnection: () => asPeerConnection(fake),
  });
}

// Lets pending microtasks and zero-delay timers run, so a promise that should still be
// pending has had every chance to settle before the assertion says it has not.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function onlyChannel(fake: FakePeerConnection): FakeDataChannel {
  const channel = fake.createdChannels[0];
  if (!channel) throw new Error("no data channel was created");
  return channel;
}

async function connectedTransport() {
  const fake = new FakePeerConnection();
  const transport = transportOver(fake, 0);
  await transport.createOffer();
  const channel = onlyChannel(fake);
  channel.open();
  return { fake, transport, channel };
}

describe("the offer side", () => {
  it("creates the data channel before generating the offer", async () => {
    const fake = new FakePeerConnection();
    await transportOver(fake, 0).createOffer();
    expect(fake.channelsWhenOfferCreated).toBe(1);
  });

  it("does not resolve until ICE gathering completes", async () => {
    const fake = new FakePeerConnection();
    let settled = false;
    const pending = transportOver(fake).createOffer();
    void pending.then(() => {
      settled = true;
    });

    await tick();
    expect(settled).toBe(false);
    expect(fake.iceGatheringState).toBe("gathering");

    fake.completeGathering();
    await pending;
    expect(settled).toBe(true);
  });

  it("returns the gathered local description, not the bare offer", async () => {
    const fake = new FakePeerConnection();
    const description = await transportOver(fake, 0).createOffer();
    expect(description.sdp).toBe("offer-sdp+candidates");
  });

  it("gives up waiting when the gathering timer expires, rather than hanging", async () => {
    const fake = new FakePeerConnection();
    // Never completes gathering; only the bounded timer (§4.5, R-9) can resolve this.
    const description = await transportOver(fake, 0).createOffer();
    expect(fake.iceGatheringState).toBe("gathering");
    expect(description.sdp).toBe("offer-sdp+candidates");
  });
});

describe("the answer side", () => {
  it("takes the remote offer, answers it, and waits for gathering", async () => {
    const fake = new FakePeerConnection();
    const offer = { type: "offer" as const, sdp: "their-offer" };
    const answer = await transportOver(fake, 0).acceptOffer(offer);

    expect(fake.remoteDescription).toEqual(offer);
    expect(answer.sdp).toBe("answer-sdp+candidates");
  });

  it("creates no data channel of its own — it receives the caller's", async () => {
    const fake = new FakePeerConnection();
    await transportOver(fake, 0).acceptOffer({ type: "offer", sdp: "their-offer" });
    expect(fake.createdChannels).toHaveLength(0);
  });

  it("accepts the answer by setting it as the remote description", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.createOffer();
    await transport.acceptAnswer({ type: "answer", sdp: "their-answer" });
    expect(fake.remoteDescription).toEqual({ type: "answer", sdp: "their-answer" });
  });
});

describe("status", () => {
  it("gives a new subscriber the current status immediately", () => {
    const seen: TransportStatus[] = [];
    transportOver(new FakePeerConnection()).onStatus((status) => seen.push(status));
    expect(seen).toEqual(["idle"]);
  });

  it.each([
    ["connecting", "connecting"],
    ["connected", "connected"],
    ["disconnected", "reconnecting"],
    ["failed", "failed"],
    ["closed", "closed"],
  ] as const)("maps connection state %s onto transport status %s", async (state, expected) => {
    const { fake, transport } = await connectedTransport();
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo(state);
    expect(seen.at(-1)).toBe(expected);
  });

  it("reports connecting, not connected, while the data channel is still opening", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.createOffer();

    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));
    fake.moveTo("connected");
    expect(seen.at(-1)).toBe("connecting");

    onlyChannel(fake).open();
    expect(seen.at(-1)).toBe("connected");
  });

  it("does not repeat a status that has not changed", async () => {
    const { fake, transport } = await connectedTransport();
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo("connected");
    fake.moveTo("connected");
    expect(seen).toEqual(["idle", "connected"]);
  });

  it("stops delivering after unsubscribe", async () => {
    const { fake, transport } = await connectedTransport();
    const seen: TransportStatus[] = [];
    const unsubscribe = transport.onStatus((status) => seen.push(status));

    unsubscribe();
    fake.moveTo("failed");
    expect(seen).toEqual(["idle"]);
  });
});

describe("sending", () => {
  it("encodes through the codec and writes to the data channel", async () => {
    const { transport, channel } = await connectedTransport();
    transport.send({ type: "resign" });

    expect(channel.sent).toHaveLength(1);
    const [text] = channel.sent;
    expect(JSON.parse(text ?? "{}")).toMatchObject({ seq: 1, body: { type: "resign" } });
  });

  it("refuses to send before the channel is open, rather than dropping the message", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.createOffer();
    expect(() => transport.send({ type: "resign" })).toThrow(/not open/);
  });
});

describe("receiving", () => {
  it("decodes an inbound message and hands it to subscribers", async () => {
    const { transport, channel } = await connectedTransport();
    const received: unknown[] = [];
    transport.onMessage((message) => received.push(message.body));

    channel.receive(createCodec().encode({ type: "drawOffer" }));
    expect(received).toEqual([{ type: "drawOffer" }]);
  });

  it("reports a message that does not decode instead of delivering or dropping it", async () => {
    const { transport, channel } = await connectedTransport();
    const received: unknown[] = [];
    const failures: unknown[] = [];
    transport.onMessage((message) => received.push(message));
    transport.onProtocolError((failure) => failures.push(failure));

    channel.receive("not json at all");

    expect(received).toEqual([]);
    expect(failures).toEqual([{ code: "malformed", detail: "not valid JSON" }]);
  });

  it("reports a non-text frame rather than assuming it is a string", async () => {
    const { transport, channel } = await connectedTransport();
    const failures: unknown[] = [];
    transport.onProtocolError((failure) => failures.push(failure));

    channel.receive(new ArrayBuffer(8));
    expect(failures).toEqual([{ code: "malformed", detail: "expected a text frame" }]);
  });

  it("delivers to a channel that arrived through the datachannel event", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.acceptOffer({ type: "offer", sdp: "their-offer" });

    const joinersChannel = new FakeDataChannel();
    fake.emit("datachannel", { channel: joinersChannel });
    joinersChannel.open();

    const received: unknown[] = [];
    transport.onMessage((message) => received.push(message.body));
    joinersChannel.receive(createCodec().encode({ type: "resign" }));

    expect(received).toEqual([{ type: "resign" }]);
  });

  it("stops delivering after unsubscribe", async () => {
    const { transport, channel } = await connectedTransport();
    const received: unknown[] = [];
    const unsubscribe = transport.onMessage((message) => received.push(message));

    unsubscribe();
    channel.receive(createCodec().encode({ type: "resign" }));
    expect(received).toEqual([]);
  });
});

describe("closing", () => {
  it("closes both the channel and the peer connection, and reports it", async () => {
    const { fake, transport, channel } = await connectedTransport();
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    transport.close();

    expect(channel.closeCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
    expect(seen.at(-1)).toBe("closed");
  });

  it("is safe to call twice", async () => {
    const { fake, transport } = await connectedTransport();
    transport.close();
    transport.close();
    expect(fake.closeCalls).toBe(1);
  });
});
