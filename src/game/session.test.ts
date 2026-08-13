import { describe, expect, it } from "vitest";
import type { Position, Side } from "../engine/board.ts";
import { BLACK_MAN, BOARD_SIZE, createOpeningPosition, WHITE_MAN } from "../engine/board.ts";
import { stateHash } from "../engine/hash.ts";
import { applyMove, generateMoves, type Move } from "../engine/moves.ts";
import type { InboundMessage, MoveBody, OutboundMessage } from "../protocol/messages.ts";
import { PROTOCOL_VERSION } from "../protocol/messages.ts";
import type { Transport, TransportStatus, Unsubscribe } from "../protocol/transport.ts";
import { createSession, type Halt } from "./session.ts";

/*
 * The session is the only thing that moves the position, so these tests are about the two
 * directions it moves in: a local move going out, and an opponent's coming in. The transport
 * is a stub that records what it was handed and lets a test push a message back.
 */

function stubTransport() {
  const sent: OutboundMessage[] = [];
  let deliver: ((message: InboundMessage) => void) | null = null;
  let publishStatus: ((status: TransportStatus) => void) | null = null;
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
    onStatus(handler: (status: TransportStatus) => void): Unsubscribe {
      publishStatus = handler;
      return () => {
        publishStatus = null;
      };
    },
    close(): void {},
  };

  return {
    transport,
    sent,
    receive(body: InboundMessage["body"], seq = 1): void {
      deliver?.({ protocolVersion: PROTOCOL_VERSION, seq, body });
    },
    setStatus(...statuses: readonly TransportStatus[]): void {
      for (const status of statuses) publishStatus?.(status);
    },
    breakSending(): void {
      throwOnSend = true;
    },
    get listening(): boolean {
      return deliver !== null;
    },
    get watchingStatus(): boolean {
      return publishStatus !== null;
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

/**
 * A well-formed `move` message: the payload plus the hash an honest sender would have
 * computed. Since 3.6 the hash is checked, so a test that wants the *move* path has to send
 * a correct one — a placeholder now lands in the divergence arm instead.
 */
function moveMessage(from: Position, move: Move): MoveBody {
  return {
    type: "move",
    from: move.from,
    path: [...move.path],
    captured: [...move.captured],
    stateHash: stateHash(applyMove(from, move)),
  };
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
    stub.receive(moveMessage(createOpeningPosition(), move));

    expect(session.position()).toEqual(applyMove(createOpeningPosition(), move));
  });

  it("reports the move and both positions to subscribers", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);

    const events: { before: Position; after: Position }[] = [];
    session.onOpponentMove((event) => events.push(event));

    const move = firstOpeningMove();
    stub.receive(moveMessage(createOpeningPosition(), move));

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
    stub.receive(moveMessage(session.position(), promoting));

    expect(seen).toEqual([true]);
  });

  it("resolves a chain prefix rather than the longest chain from that origin", () => {
    const session = createSession(
      positionFrom({ 4: BLACK_MAN, 8: WHITE_MAN, 17: WHITE_MAN }, "black"),
    );
    const stub = stubTransport();
    session.attach(stub.transport);

    const prefix = generateMoves(session.position()).find(
      (move) => move.from === 4 && move.path.length === 1,
    );
    if (!prefix) throw new Error("expected the one-jump prefix to be generated");
    stub.receive(moveMessage(session.position(), prefix));

    expect(session.position().squares[13]).toBe(BLACK_MAN);
    expect(session.position().squares[17]).toBe(WHITE_MAN); // chain stopped early
  });

  it("never applies a move it cannot identify", () => {
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

describe("an illegal move arriving from the opponent (R-57)", () => {
  function rejected() {
    const stub = stubTransport();
    const session = createSession();
    const halts: Halt[] = [];
    session.attach(stub.transport);
    session.onHalt((halt) => halts.push(halt));

    // Legal square indices, but no move the engine offers from the opening position.
    stub.receive({ type: "move", from: 0, path: [31], captured: [], stateHash: "x" });
    return { stub, session, halts };
  }

  it("leaves the board untouched", () => {
    expect(rejected().session.position()).toEqual(createOpeningPosition());
  });

  it("returns an error to the sender (§4.2)", () => {
    const sent = rejected().stub.sent[0];
    expect(sent?.type).toBe("error");
    expect(sent?.type === "error" && sent.code).toBe("illegalMove");
  });

  it("halts play", () => {
    const { session, halts } = rejected();
    expect(session.haltReason()?.reason).toBe("illegalMove");
    expect(halts).toHaveLength(1);
  });

  it("explains itself in words a player can read", () => {
    // The halt is terminal in v1, so its message is the last thing anyone gets. It must not
    // be a protocol code.
    const detail = rejected().session.haltReason()?.detail ?? "";
    expect(detail).toMatch(/play has stopped/);
    expect(detail).not.toMatch(/stateHash|illegalMove|payload/);
  });
});

describe("a divergence between the two boards (R-35)", () => {
  function diverged() {
    const stub = stubTransport();
    const session = createSession();
    const halts: Halt[] = [];
    session.attach(stub.transport);
    session.onHalt((halt) => halts.push(halt));

    // The move itself is legal; the sender's hash of the result is not ours. This is the
    // injected divergence the task's acceptance asks for.
    const move = firstOpeningMove();
    stub.receive({ ...moveMessage(createOpeningPosition(), move), stateHash: "deadbeef" });
    return { stub, session, halts, move };
  }

  it("does not apply the move it was carrying", () => {
    // Committing a position already known to be wrong, then reporting it, would leave the
    // board contradicting the message on top of it.
    expect(diverged().session.position()).toEqual(createOpeningPosition());
  });

  it("halts play and says which two things disagreed", () => {
    const { session, stub } = diverged();
    expect(session.haltReason()?.reason).toBe("divergence");
    const sent = stub.sent[0];
    expect(sent?.type === "error" && sent.code).toBe("stateDivergence");
  });

  it("tells the player it is a bug rather than something they did", () => {
    expect(diverged().session.haltReason()?.detail).toMatch(
      /bug rather than anything either player/,
    );
  });

  it("accepts the same move when the hash does agree", () => {
    // The guard has to be the hash, not the mere presence of one.
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);
    const move = firstOpeningMove();

    stub.receive(moveMessage(createOpeningPosition(), move));

    expect(session.haltReason()).toBeNull();
    expect(session.position()).toEqual(applyMove(createOpeningPosition(), move));
  });
});

describe("once halted", () => {
  function haltedSession() {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);
    stub.receive({ type: "move", from: 0, path: [31], captured: [], stateHash: "x" });
    return { stub, session };
  }

  it("refuses to play a local move", () => {
    const { session } = haltedSession();
    session.play(firstOpeningMove());
    expect(session.position()).toEqual(createOpeningPosition());
  });

  it("refuses a further move from the opponent, even a valid one", () => {
    const { stub, session } = haltedSession();
    const before = stub.sent.length;

    stub.receive(moveMessage(createOpeningPosition(), firstOpeningMove()), 2);

    expect(session.position()).toEqual(createOpeningPosition());
    expect(stub.sent).toHaveLength(before);
  });

  it("halts once, not once per message", () => {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);
    const halts: Halt[] = [];
    session.onHalt((halt) => halts.push(halt));

    stub.receive({ type: "move", from: 0, path: [31], captured: [], stateHash: "x" }, 1);
    stub.receive({ type: "move", from: 0, path: [31], captured: [], stateHash: "x" }, 2);

    expect(halts).toHaveLength(1);
  });

  it("tells a handler that subscribes afterwards", () => {
    const { session } = haltedSession();
    const late: Halt[] = [];
    session.onHalt((halt) => late.push(halt));
    expect(late).toHaveLength(1);
  });
});

describe("an error arriving from the opponent", () => {
  function peerComplained() {
    const stub = stubTransport();
    const session = createSession();
    session.attach(stub.transport);
    stub.receive({ type: "error", code: "illegalMove", detail: "not legal here" });
    return { stub, session };
  }

  it("halts play, because the peer rejecting our move means the boards disagree", () => {
    expect(peerComplained().session.haltReason()?.reason).toBe("peerRejected");
  });

  it("is never answered, which is what stops two clients replying forever", () => {
    expect(peerComplained().stub.sent).toEqual([]);
  });
});

describe("two clients moving at the same moment", () => {
  // Wires two real sessions to each other so a message sent by one is delivered to the other
  // synchronously. Closer to the live case than a stub, and the only way to see what the two
  // ends do to each other.
  function connectedPair() {
    const inbox: Record<string, (message: InboundMessage) => void> = {};
    const build = (self: string, peer: string) => {
      let seq = 0;
      const transport: Transport = {
        send(body: OutboundMessage): void {
          seq += 1;
          inbox[peer]?.({ protocolVersion: PROTOCOL_VERSION, seq, body });
        },
        onMessage(handler): Unsubscribe {
          inbox[self] = handler;
          return () => {
            delete inbox[self];
          };
        },
        onStatus(): Unsubscribe {
          return () => {};
        },
        close(): void {},
      };
      const session = createSession();
      session.attach(transport);
      return session;
    };
    return { a: build("a", "b"), b: build("b", "a") };
  }

  it("halts both of them, because neither can make the other's move any more", () => {
    // Documented rather than prevented: turn ownership is task 5.1's, and until it exists
    // either client can move either colour. Applying your own move flips `sideToMove`, so the
    // move the other player sent a moment earlier is no longer one this engine can generate.
    // This is R-35 working, but it is also the likeliest way a live game ends by accident.
    const { a, b } = connectedPair();
    const opening = generateMoves(createOpeningPosition());
    const first = opening[0];
    const second = opening[1];
    if (!first || !second) throw new Error("expected two distinct opening moves");

    a.play(first);
    b.play(second);

    expect(a.haltReason()?.reason).toBe("illegalMove");
    expect(b.haltReason()?.reason).toBe("peerRejected");
  });

  it("does not halt when the two take turns", () => {
    const { a, b } = connectedPair();
    const first = generateMoves(createOpeningPosition())[0];
    if (!first) throw new Error("expected an opening move");

    a.play(first);
    const reply = generateMoves(b.position())[0];
    if (!reply) throw new Error("expected a reply move");
    b.play(reply);

    expect(a.haltReason()).toBeNull();
    expect(b.haltReason()).toBeNull();
    expect(a.position()).toEqual(b.position());
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

/*
 * Task 1.5. The session is where connection status becomes something the interface may see,
 * because `ui/` may not import `protocol/` — so these are about the translation, not about
 * the transport, which has its own tests.
 */
describe("connection state", () => {
  it("reports a first connection and a recovered one differently", () => {
    // The whole reason this is not TransportStatus renamed: `connected` is the same value
    // both times, and "you are both in the same game" is the wrong thing to say the second.
    const stub = stubTransport();
    const session = createSession();
    const seen: string[] = [];

    session.attach(stub.transport);
    session.onConnection((state) => seen.push(state));

    stub.setStatus("connecting", "connected", "reconnecting", "connected");

    expect(seen).toEqual(["connecting", "ready", "interrupted", "resumed"]);
  });

  it("separates a connection that failed after working from one that never formed", () => {
    // Found by live-testing 1.5: closing one tab drove the other to `failed`, which told a
    // player whose network was demonstrably fine to go and try a different one. The transport
    // reports both cases identically; only the session knows there had been a connection.
    const never = stubTransport();
    const lost = stubTransport();
    const seenNever: string[] = [];
    const seenLost: string[] = [];

    const one = createSession();
    one.attach(never.transport);
    one.onConnection((state) => seenNever.push(state));
    never.setStatus("connecting", "failed");

    const two = createSession();
    two.attach(lost.transport);
    two.onConnection((state) => seenLost.push(state));
    lost.setStatus("connecting", "connected", "reconnecting", "failed");

    expect(seenNever).toEqual(["connecting", "unreachable"]);
    expect(seenLost).toEqual(["connecting", "ready", "interrupted", "lost"]);
  });

  it("names a network that never connected at all separately from one that closed", () => {
    // R-9's case. These need different sentences, so they cannot collapse into one state.
    const failed = stubTransport();
    const closed = stubTransport();
    const seenFailed: string[] = [];
    const seenClosed: string[] = [];

    const one = createSession();
    one.attach(failed.transport);
    one.onConnection((state) => seenFailed.push(state));
    failed.setStatus("connecting", "failed");

    const two = createSession();
    two.attach(closed.transport);
    two.onConnection((state) => seenClosed.push(state));
    closed.setStatus("connecting", "connected", "closed");

    expect(seenFailed).toEqual(["connecting", "unreachable"]);
    expect(seenClosed).toEqual(["connecting", "ready", "closed"]);
  });

  it("does not turn a repeated `connected` into a reconnection", () => {
    // Found by code review. The everConnected latch has to be set *after* the duplicate-state
    // guard: setting it inside the switch made the second `connected` compute `resumed`, a
    // state that differs from the first, so the guard waved it through and the player was
    // told the connection had come back when it had never gone away. `WebRtcTransport` does
    // not republish a status, but `protocol/`'s contract does not forbid it and this function
    // is written on the assumption that one might.
    const stub = stubTransport();
    const session = createSession();
    const seen: string[] = [];

    session.attach(stub.transport);
    session.onConnection((state) => seen.push(state));

    stub.setStatus("connected", "connected", "connected");

    expect(seen).toEqual(["ready"]);
  });

  it("does not repeat a state the connection is already in", () => {
    // Announcing "the connection dropped" twice for one drop sounds like two drops.
    const stub = stubTransport();
    const session = createSession();
    const seen: string[] = [];

    session.attach(stub.transport);
    session.onConnection((state) => seen.push(state));

    stub.setStatus("reconnecting", "reconnecting", "reconnecting");

    expect(seen).toEqual(["interrupted"]);
  });

  it("tells a late subscriber the state it missed", () => {
    // The panel builds the transport, so the interface routinely subscribes after the first
    // status has already gone by. Same reason onHalt replays.
    const stub = stubTransport();
    const session = createSession();
    const seen: string[] = [];

    session.attach(stub.transport);
    stub.setStatus("connecting", "connected");
    session.onConnection((state) => seen.push(state));

    expect(seen).toEqual(["ready"]);
  });

  it("goes quiet once the session has halted", () => {
    // The halt is terminal in v1 (R-35). Reporting the weather afterwards, to someone whose
    // game has stopped for a reason they have been given, is noise over the last thing that
    // mattered.
    const stub = stubTransport();
    const session = createSession();
    const seen: string[] = [];

    session.attach(stub.transport);
    session.onConnection((state) => seen.push(state));
    stub.setStatus("connecting", "connected");

    // An inbound error halts this side (task 3.6).
    stub.receive({ type: "error", code: "illegalMove", detail: "no" });
    expect(session.haltReason()).not.toBeNull();

    stub.setStatus("reconnecting", "closed");

    expect(seen).toEqual(["connecting", "ready"]);
  });

  it("stops watching a transport it has detached from", () => {
    const first = stubTransport();
    const session = createSession();
    const seen: string[] = [];

    session.attach(first.transport);
    session.onConnection((state) => seen.push(state));
    session.attach(stubTransport().transport);

    expect(first.watchingStatus).toBe(false);

    first.setStatus("failed");
    expect(seen).toEqual([]);
  });
});
