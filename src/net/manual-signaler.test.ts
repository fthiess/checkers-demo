import { describe, expect, it } from "vitest";
import { createManualSignaler, SignalError } from "./manual-signaler.ts";
import { decodeBlock } from "./signal-block.ts";
import type { WebRtcTransport } from "./webrtc-transport.ts";

/*
 * The signaler's job is entirely about what happens either side of the transport, so the
 * transport here is a stub that records what it was handed. What is worth checking is that
 * the two layers stay separate — the transport must only ever see SDP — and that the
 * mistakes a person actually makes with two blocks and two boxes produce a sentence they can
 * act on rather than a browser exception.
 */

function stubTransport() {
  const seen: RTCSessionDescriptionInit[] = [];

  const transport = {
    createOffer: () => Promise.resolve({ type: "offer" as const, sdp: "offer-sdp" }),
    acceptOffer: (offer: RTCSessionDescriptionInit) => {
      seen.push(offer);
      return Promise.resolve({ type: "answer" as const, sdp: "answer-sdp" });
    },
    acceptAnswer: (answer: RTCSessionDescriptionInit) => {
      seen.push(answer);
      return Promise.resolve();
    },
  } as unknown as WebRtcTransport;

  return { transport, seen };
}

async function errorFrom(action: () => Promise<unknown>): Promise<SignalError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof SignalError) return error;
    throw error;
  }
  throw new Error("expected the call to be rejected");
}

// One creator and one joiner, wired to their own stubs, taken as far as a given step.
async function exchange() {
  const creator = stubTransport();
  const joiner = stubTransport();
  const creatorSignaler = createManualSignaler(creator.transport);
  const joinerSignaler = createManualSignaler(joiner.transport);

  const offer = await creatorSignaler.createOffer();
  const answer = await joinerSignaler.acceptOffer(offer);
  return { creator, joiner, creatorSignaler, joinerSignaler, offer, answer };
}

describe("a complete exchange", () => {
  it("carries the creator's offer to the joiner's transport as plain sdp", async () => {
    const { joiner } = await exchange();
    expect(joiner.seen[0]).toEqual({ type: "offer", sdp: "offer-sdp" });
  });

  it("carries the joiner's answer back to the creator's transport", async () => {
    const { creator, creatorSignaler, answer } = await exchange();
    await creatorSignaler.acceptAnswer(answer);
    expect(creator.seen[0]).toEqual({ type: "answer", sdp: "answer-sdp" });
  });

  it("never shows the transport a block", async () => {
    // The point of D-22: if a block ever reached the transport, swapping in a different
    // signaler would mean changing the transport too.
    const { creator, joiner } = await exchange();
    for (const description of [...creator.seen, ...joiner.seen]) {
      expect(description.sdp).not.toMatch(/^[CU][A-Za-z0-9_-]{20,}$/);
    }
  });

  it("labels the two blocks so they cannot be confused", async () => {
    const { offer, answer } = await exchange();
    const decodedOffer = await decodeBlock(offer);
    const decodedAnswer = await decodeBlock(answer);
    expect(decodedOffer.ok && decodedOffer.block.kind).toBe("offer");
    expect(decodedAnswer.ok && decodedAnswer.block.kind).toBe("answer");
  });

  it("returns the joiner's answer under the session the creator started", async () => {
    const { offer, answer } = await exchange();
    const decodedOffer = await decodeBlock(offer);
    const decodedAnswer = await decodeBlock(answer);
    expect(decodedAnswer.ok && decodedAnswer.block.sessionId).toBe(
      decodedOffer.ok ? decodedOffer.block.sessionId : "",
    );
  });
});

describe("the mistakes two people actually make", () => {
  it("tells the joiner when they pasted a reply into the joining box", async () => {
    const { answer } = await exchange();
    const fresh = createManualSignaler(stubTransport().transport);
    expect((await errorFrom(() => fresh.acceptOffer(answer))).code).toBe("wrongKind");
  });

  it("tells the creator when they pasted an invitation into the reply box", async () => {
    const { creatorSignaler, offer } = await exchange();
    expect((await errorFrom(() => creatorSignaler.acceptAnswer(offer))).code).toBe("wrongKind");
  });

  it("tells the creator when the reply belongs to a different invitation", async () => {
    const first = await exchange();
    const second = await exchange();
    const error = await errorFrom(() => first.creatorSignaler.acceptAnswer(second.answer));
    expect(error.code).toBe("wrongSession");
  });

  it("refuses a reply before an invitation exists", async () => {
    const { answer } = await exchange();
    const fresh = createManualSignaler(stubTransport().transport);
    expect((await errorFrom(() => fresh.acceptAnswer(answer))).code).toBe("outOfOrder");
  });

  it("passes a decoding failure through with its own explanation", async () => {
    const fresh = createManualSignaler(stubTransport().transport);
    const error = await errorFrom(() => fresh.acceptOffer("not a block"));
    expect(error.code).toBe("unknownEncoding");
    expect(error.message).toContain("connection block");
  });

  it("explains an empty paste rather than throwing something opaque", async () => {
    const fresh = createManualSignaler(stubTransport().transport);
    expect((await errorFrom(() => fresh.acceptOffer("  "))).code).toBe("empty");
  });
});

describe("block length", () => {
  it("is unknown until a block has been produced", () => {
    expect(createManualSignaler(stubTransport().transport).lastBlockLength).toBeNull();
  });

  it("records the length of the block just produced", async () => {
    const { creatorSignaler, offer, joinerSignaler, answer } = await exchange();
    expect(creatorSignaler.lastBlockLength).toBe(offer.length);
    expect(joinerSignaler.lastBlockLength).toBe(answer.length);
  });
});
