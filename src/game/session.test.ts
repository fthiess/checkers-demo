import { describe, expect, it } from "vitest";
import type { Position, Side } from "../engine/board.ts";
import { BLACK_MAN, BOARD_SIZE, createOpeningPosition, WHITE_MAN } from "../engine/board.ts";
import { stateHash } from "../engine/hash.ts";
import { applyMove, generateMoves } from "../engine/moves.ts";
import type { InboundMessage, OutboundMessage } from "../protocol/messages.ts";
import { PROTOCOL_VERSION } from "../protocol/messages.ts";
import type { Transport, TransportStatus, Unsubscribe } from "../protocol/transport.ts";
import { createSession } from "./session.ts";

/*
 * The session is the only thing that moves the position, so these tests are about the two
 * directions it moves in: a local move going out, and an opponent's coming in. The transport
 * is a stub that records what it was handed and lets a test push a message back.
 */

function stubTransport() {
  const sent: OutboundMessage[] = [];
  let deliver: ((message: InboundMessage) => void) | null = null;
  let throwOnSend = false;

  const transport: Transport = {
    send(message: OutboundMessage): void {
      if (throwOnSend) throw new Error("transport is not open");
      sent.push(message);
    },
    onMessage(handler: (message: InboundMessage) => void): Unsubscribe {
      deliver = handler;
      return () => {
        deliver = null;
      };
    },
    onStatus(_handler: (status: TransportStatus) => void): Unsubscribe {
      return () => {};
    },
    close(): void {},
  };

  return {
    transport,
    sent,
    receive(body: InboundMessage["body"], seq = 1): void {
      deliver?.({ protocolVersion: PROTOCOL_VERSION, seq, body });
    },
    breakSending(): void {
      throwOnSend = true;
    },
    get listening(): boolean {
      return deliver !== null;
    },
  };
}

function positionFrom(pieces: Record<number, number>, sideToMove: Side): Position {
  const squares = new Int8Array(BOARD_SIZE);
  for (const [index, piece] of Object.entries(pieces)) {
    squares[Number(index)] = piece;
  }
  return { squares, sideToMove, plyCount: 0 };
}

function firstOpeningMove() {
  const move = generateMoves(createOpeningPosition())[0];
  if (!move) throw new Error("expected an opening move");
  return move;
}

describe("a move made on this client", () => {
  it("advances the position", () => {
    const session = createSession();
    const move = firstOpeningMove();

    session.play(move);

    expect(session.position()).toEqual(applyMove(createOpeningPosition(), move));
  });

  it("goes out over the transport", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);

    const move = firstOpeningMove();
    session.play(move);

    expect(stub.sent).toEqual([
      {
        type: "move",
        from: move.from,
        path: [...move.path],
        captured: [...move.captured],
        stateHash: stateHash(applyMove(createOpeningPosition(), move)),
      },
    ]);
  });

  it("sends the hash of the position after the move, not before it", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);
    session.play(firstOpeningMove());

    const sent = stub.sent[0];
    if (sent?.type !== "move") throw new Error("expected a move message");
    expect(sent.stateHash).toBe(stateHash(session.position()));
    expect(sent.stateHash).not.toBe(stateHash(createOpeningPosition()));
  });

  it("is not sent anywhere before a transport exists", () => {
    const session = createSession();
    expect(() => session.play(firstOpeningMove())).not.toThrow();
  });

  it("still applies locally when the connection has dropped", () => {
    // `send` throws once the channel closes. The move was legal and the player made it, so
    // it stays on their board; the transport's own status is what reports the disconnection.
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);
    stub.breakSending();

    const move = firstOpeningMove();
    expect(() => session.play(move)).not.toThrow();
    expect(session.position()).toEqual(applyMove(createOpeningPosition(), move));
  });

  it("does not echo back to this client as an opponent move", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);

    const seen: unknown[] = [];
    session.onOpponentMove((event) => seen.push(event));
    session.play(firstOpeningMove());

    expect(seen).toEqual([]);
  });
});

describe("a move arriving from the opponent", () => {
  it("is applied to the position", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);

    const move = firstOpeningMove();
    stub.receive({
      type: "move",
      from: move.from,
      path: [...move.path],
      captured: [...move.captured],
      stateHash: "ignored-until-3.6",
    });

    expect(session.position()).toEqual(applyMove(createOpeningPosition(), move));
  });

  it("reports the move and both positions to subscribers", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);

    const events: { before: Position; after: Position }[] = [];
    session.onOpponentMove((event) => events.push(event));

    const move = firstOpeningMove();
    stub.receive({
      type: "move",
      from: move.from,
      path: [...move.path],
      captured: [...move.captured],
      stateHash: "x",
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.before).toEqual(createOpeningPosition());
    expect(events[0]?.after).toEqual(session.position());
  });

  it("recovers a crowning the wire never carried", () => {
    // `promotes` is the engine's conclusion, not the mover's claim, so it is absent from the
    // payload and has to come back from matching rather than being taken on trust.
    const session = createSession(positionFrom({ 25: BLACK_MAN }, "black"));
    const stub = stubTransport();
    session.attach(stub.transport);

    const promoting = generateMoves(session.position()).find((move) => move.promotes);
    if (!promoting) throw new Error("expected a promoting move to exist");

    const seen: boolean[] = [];
    session.onOpponentMove((event) => seen.push(event.move.promotes));
    stub.receive({
      type: "move",
      from: promoting.from,
      path: [...promoting.path],
      captured: [...promoting.captured],
      stateHash: "x",
    });

    expect(seen).toEqual([true]);
  });

  it("resolves a chain prefix rather than the longest chain from that origin", () => {
    const session = createSession(
      positionFrom({ 4: BLACK_MAN, 8: WHITE_MAN, 17: WHITE_MAN }, "black"),
    );
    const stub = stubTransport();
    session.attach(stub.transport);

    stub.receive({ type: "move", from: 4, path: [13], captured: [8], stateHash: "x" });

    expect(session.position().squares[13]).toBe(BLACK_MAN);
    expect(session.position().squares[17]).toBe(WHITE_MAN); // chain stopped early
  });

  it("ignores a move that matches nothing the engine offers", () => {
    // Ignoring is not rejecting. Reporting it to the player and halting on a state-hash
    // divergence are task 3.6's (R-57, R-35); this only records that a move it cannot
    // identify does not corrupt the board.
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);

    stub.receive({ type: "move", from: 0, path: [31], captured: [], stateHash: "x" });

    expect(session.position()).toEqual(createOpeningPosition());
  });

  it("ignores message types that are not moves", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);

    stub.receive({ type: "emote", emote: "hello" });

    expect(session.position()).toEqual(createOpeningPosition());
  });
});

describe("attaching and detaching", () => {
  it("stops listening once detached", () => {
    const stub = stubTransport();
    const session = createSession();
    const detach = session.attach(stub.transport);

    detach();
    expect(stub.listening).toBe(false);

    const move = firstOpeningMove();
    session.play(move);
    expect(stub.sent).toEqual([]);
  });

  it("drops the previous transport when a second one is attached", () => {
    // Reconnection (task 5.4) attaches twice. Leaving the first subscription live would let a
    // stale transport keep moving this position after the session had moved on.
    const first = stubTransport();
    const second = stubTransport();
    const session = createSession();

    session.attach(first.transport);
    session.attach(second.transport);

    expect(first.listening).toBe(false);

    const move = firstOpeningMove();
    first.receive({
      type: "move",
      from: move.from,
      path: [...move.path],
      captured: [...move.captured],
      stateHash: "x",
    });
    expect(session.position()).toEqual(createOpeningPosition());

    session.play(move);
    expect(first.sent).toEqual([]);
    expect(second.sent).toHaveLength(1);
  });
});
