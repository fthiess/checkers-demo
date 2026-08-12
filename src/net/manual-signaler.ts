/**
 * Manual signaling (DESIGN.md §4.5, R-5, R-6, R-7).
 *
 * Implements `protocol/`'s `Signaler` by wrapping the transport's SDP-level exchange in the
 * block encoding. This is the seam D-22 records: the transport deals in descriptions and
 * never learns what a block looks like, so the `ServerSignaler` that §9's migration
 * eventually wants can replace this file and touch nothing else.
 *
 * `Signaler`'s three methods return a `SignalBlob` and have nowhere to put a typed failure,
 * so a bad paste arrives here as a thrown `SignalError`. It carries the same code and
 * plain-language detail `decodeBlock` produced, because the person who just pasted the wrong
 * thing is the one who has to act on it (R-7).
 */

import { PROTOCOL_VERSION } from "../protocol/messages.ts";
import type { SignalBlob, Signaler } from "../protocol/transport.ts";
import {
  type BlockFailureCode,
  createSessionId,
  decodeBlock,
  encodeBlock,
  type SignalBlock,
} from "./signal-block.ts";
import type { WebRtcTransport } from "./webrtc-transport.ts";

export type SignalErrorCode = BlockFailureCode | "wrongKind" | "wrongSession" | "outOfOrder";

export class SignalError extends Error {
  readonly code: SignalErrorCode;

  constructor(code: SignalErrorCode, message: string) {
    super(message);
    this.name = "SignalError";
    this.code = code;
  }
}

export interface ManualSignaler extends Signaler {
  /**
   * The length of the last block this signaler produced, or null before it has produced one.
   *
   * Task 1.3's acceptance asks for the block length to be recorded, and §4.5's estimate of
   * roughly a thousand characters is a prediction the interface can now check rather than
   * inherit — the panel shows it, so a real measurement is taken every time anyone connects.
   */
  readonly lastBlockLength: number | null;
}

async function decodeOrThrow(blob: SignalBlob): Promise<SignalBlock> {
  const result = await decodeBlock(blob);
  if (!result.ok) throw new SignalError(result.code, result.detail);
  return result.block;
}

export function createManualSignaler(transport: WebRtcTransport): ManualSignaler {
  // The creator mints the session id with the offer; the joiner adopts whatever the offer
  // carried. Both then expect to see it again on the answer, which is what turns "you pasted
  // a block from a different conversation" into a message rather than a connection that
  // quietly never opens.
  let sessionId: string | null = null;
  let lastBlockLength: number | null = null;

  async function produce(kind: "offer" | "answer", sdp: string): Promise<SignalBlob> {
    if (!sessionId) throw new SignalError("invalidBlock", "no session has been started");
    const blob = await encodeBlock({
      protocolVersion: PROTOCOL_VERSION,
      kind,
      sessionId,
      sdp,
    });
    lastBlockLength = blob.length;
    return blob;
  }

  return {
    get lastBlockLength(): number | null {
      return lastBlockLength;
    },

    async createOffer(): Promise<SignalBlob> {
      sessionId = createSessionId();
      const description = await transport.createOffer();
      if (!description.sdp) {
        throw new SignalError("invalidBlock", "the browser produced no connection details");
      }
      return produce("offer", description.sdp);
    },

    async acceptOffer(blob: SignalBlob): Promise<SignalBlob> {
      const block = await decodeOrThrow(blob);
      if (block.kind !== "offer") {
        throw new SignalError(
          "wrongKind",
          "this is a reply block, not an invitation — the person who started the game pastes this one",
        );
      }

      sessionId = block.sessionId;
      const answer = await transport.acceptOffer({ type: "offer", sdp: block.sdp });
      if (!answer.sdp) {
        throw new SignalError("invalidBlock", "the browser produced no connection details");
      }
      return produce("answer", answer.sdp);
    },

    async acceptAnswer(blob: SignalBlob): Promise<void> {
      // Catches only the case where no session exists at all — a reply pasted before an
      // invitation was ever created. It does *not* distinguish a creator from a joiner:
      // `acceptOffer` adopts the offer's session id, so a joiner passes this check too.
      // Keeping the exchange to one pass per side is the interface's job, not this one's.
      if (!sessionId) {
        throw new SignalError("outOfOrder", "create an invitation first, then paste the reply");
      }

      const block = await decodeOrThrow(blob);
      if (block.kind !== "answer") {
        throw new SignalError(
          "wrongKind",
          "this is an invitation, not a reply — paste it into the joining box instead",
        );
      }
      if (block.sessionId !== sessionId) {
        throw new SignalError(
          "wrongSession",
          "this reply belongs to a different invitation — check you copied the right block",
        );
      }

      await transport.acceptAnswer({ type: "answer", sdp: block.sdp });
    },
  };
}
