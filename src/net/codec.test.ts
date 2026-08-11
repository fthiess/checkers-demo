import { describe, expect, it } from "vitest";
import { type MessageBody, PROTOCOL_VERSION } from "../protocol/messages.ts";
import { createCodec } from "./codec.ts";

// Every message in DESIGN.md §4.2's table, so a variant added to the schema without a codec
// arm fails here rather than in a game between two people.
const EVERY_MESSAGE: readonly MessageBody[] = [
  { type: "hello", displayName: "a player", colour: "#2f6f4f", preferredSide: "black" },
  { type: "move", from: 8, path: [12], captured: [], stateHash: "1a2b3c4d" },
  { type: "move", from: 13, path: [22, 31], captured: [17, 26], stateHash: "deadbeef" },
  { type: "resign" },
  { type: "drawOffer" },
  { type: "drawAccept" },
  { type: "drawDecline" },
  { type: "rematch", firstMover: "white" },
  { type: "emote", emote: "well-played" },
  {
    type: "sync",
    moves: [
      { from: 8, path: [12], captured: [] },
      { from: 21, path: [17], captured: [] },
    ],
    stateHash: "0f0f0f0f",
  },
  { type: "error", code: "illegalMove", detail: "not in the legal move list" },
];

// A codec instance belongs to one connection, so a round trip needs two of them: the
// sender's counter and the receiver's expectations are separate pieces of state.
function roundTrip(body: MessageBody) {
  return createCodec().decode(createCodec().encode(body));
}

describe("round trip", () => {
  for (const body of EVERY_MESSAGE) {
    it(`preserves a ${body.type} message`, () => {
      const result = roundTrip(body);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.message.body).toEqual(body);
      expect(result.message.protocolVersion).toBe(PROTOCOL_VERSION);
    });
  }

  it("carries a move as an intent, never as a board snapshot", () => {
    const result = roundTrip({
      type: "move",
      from: 13,
      path: [22, 31],
      captured: [17, 26],
      stateHash: "deadbeef",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.message.body)).not.toContain("squares");
  });
});

describe("sequence numbers", () => {
  it("stamps outgoing messages with an increasing sequence", () => {
    const codec = createCodec();
    const seqs = [1, 2, 3].map(() => JSON.parse(codec.encode({ type: "resign" })).seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it("accepts messages whose sequence advances", () => {
    const sender = createCodec();
    const receiver = createCodec();
    for (const _ of [1, 2, 3]) {
      expect(receiver.decode(sender.encode({ type: "drawOffer" })).ok).toBe(true);
    }
  });

  it("rejects a replayed message", () => {
    const sender = createCodec();
    const receiver = createCodec();
    const first = sender.encode({ type: "resign" });
    expect(receiver.decode(first).ok).toBe(true);

    const replayed = receiver.decode(first);
    expect(replayed.ok).toBe(false);
    if (replayed.ok) return;
    expect(replayed.code).toBe("outOfOrder");
  });

  it("tolerates a gap, which is harmless, while rejecting a step backwards", () => {
    const receiver = createCodec();
    expect(receiver.decode(envelope(9, { type: "resign" })).ok).toBe(true);
    expect(receiver.decode(envelope(50, { type: "resign" })).ok).toBe(true);
    expect(receiver.decode(envelope(49, { type: "resign" })).ok).toBe(false);
  });

  it("does not let a rejected message consume the number it claimed", () => {
    const receiver = createCodec();
    const bad = JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      seq: 4,
      body: { type: "emote", emote: 12 },
    });
    expect(receiver.decode(bad).ok).toBe(false);
    // 4 was never accepted, so a well-formed message may still claim it.
    expect(receiver.decode(envelope(4, { type: "resign" })).ok).toBe(true);
  });
});

function envelope(seq: number, body: unknown, protocolVersion = PROTOCOL_VERSION): string {
  return JSON.stringify({ protocolVersion, seq, body });
}

describe("rejecting what a peer should not be able to say", () => {
  it("rejects text that is not JSON", () => {
    const result = createCodec().decode("not json at all");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("malformed");
  });

  it("rejects a protocol version it does not speak, rather than tolerating it", () => {
    const result = createCodec().decode(envelope(1, { type: "resign" }, PROTOCOL_VERSION + 1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("versionMismatch");
    expect(result.detail).toContain(String(PROTOCOL_VERSION + 1));
  });

  it("rejects an unknown message type", () => {
    const result = createCodec().decode(envelope(1, { type: "surrenderEverything" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unknownType");
  });

  it.each([
    ["a move with no path", { type: "move", from: 8, path: [], captured: [], stateHash: "a" }],
    ["a move with no hash", { type: "move", from: 8, path: [12], captured: [] }],
    [
      "a move with a fractional square",
      { type: "move", from: 8.5, path: [12], captured: [], stateHash: "a" },
    ],
    [
      "a move with a negative square",
      { type: "move", from: -1, path: [12], captured: [], stateHash: "a" },
    ],
    ["a hello with no name", { type: "hello", colour: "#fff", preferredSide: "black" }],
    [
      "a hello taking a side that does not exist",
      { type: "hello", displayName: "a player", colour: "#fff", preferredSide: "green" },
    ],
    ["a rematch with no first mover", { type: "rematch" }],
    ["a sync whose moves are not moves", { type: "sync", moves: [{ from: 1 }], stateHash: "a" }],
    ["an error carrying an invented code", { type: "error", code: "somethingElse", detail: "x" }],
  ])("rejects %s", (_label, body) => {
    const result = createCodec().decode(envelope(1, body));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalidBody");
  });

  it("rejects an envelope with no body", () => {
    const result = createCodec().decode(
      JSON.stringify({ protocolVersion: PROTOCOL_VERSION, seq: 1 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("malformed");
  });

  it("does not throw on any of the above", () => {
    const codec = createCodec();
    for (const text of ["", "[]", "null", "42", '{"protocolVersion":"one"}', "{}"]) {
      expect(() => codec.decode(text)).not.toThrow();
      expect(codec.decode(text).ok).toBe(false);
    }
  });
});
