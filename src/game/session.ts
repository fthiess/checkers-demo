/**
 * The shared game session (tasks 1.4 and 3.6 — DESIGN.md §4.2, §4.3, §5, R-35, R-57).
 *
 * Owns the position both players are looking at, and is the only thing that moves it. A move
 * made here is applied and sent; a move arriving from the opponent is validated, applied and
 * announced. That is the whole of the walking skeleton's thread, and it is what makes two
 * browsers show the same board.
 *
 * It names a `Transport` without importing `net/` — the reason `protocol/` exists at all
 * (D-21). Which transport is in use stays `app/`'s business, so this module works exactly the
 * same against the peer-to-peer one and against §9's future client/server replacement.
 *
 * **Nothing inbound is trusted.** A move is a claim, checked against this client's own engine
 * before it moves anything (R-57), and the sender's hash of the resulting position is checked
 * against this client's own (§4.3). Either check failing means the two boards already
 * disagree, and the session **halts** rather than carrying on from a position it knows is
 * wrong (R-35). Halting is deliberately unrecoverable here: `sync` reconciliation after a
 * reconnection is task 5.4's, and it is the only thing entitled to restart a halted session.
 */

import { createOpeningPosition, type Position } from "../engine/board.ts";
import { stateHash } from "../engine/hash.ts";
import { applyMove, generateMoves, type Move } from "../engine/moves.ts";
import type { InboundMessage, MovePayload, OutboundMessage } from "../protocol/messages.ts";
import type { Transport, Unsubscribe } from "../protocol/transport.ts";

export interface OpponentMove {
  readonly move: Move;
  readonly before: Position;
  readonly after: Position;
}

/**
 * Why play stopped. `detail` is written for the player rather than for a log, because it is
 * what the interface shows — there is no recovering from here in v1, so a message nobody can
 * make sense of is the last thing they get.
 */
export interface Halt {
  readonly reason: "illegalMove" | "divergence" | "peerRejected";
  readonly detail: string;
}

export interface Session {
  position(): Position;
  /**
   * Why play stopped, or null while the game is live. A query, not a command — named for
   * what it returns so that no call site can read as an instruction to stop the game.
   */
  haltReason(): Halt | null;
  /** Applies a move made on this client, then sends it to the opponent. Ignored once halted. */
  play(move: Move): void;
  /** Connects the session to a transport once one exists. Replaces any previous one. */
  attach(transport: Transport): Unsubscribe;
  onOpponentMove(handler: (event: OpponentMove) => void): Unsubscribe;
  onHalt(handler: (halt: Halt) => void): Unsubscribe;
}

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((square, index) => square === b[index]);
}

/**
 * Finds the engine's own `Move` for a received payload.
 *
 * The wire carries `from`, `path` and `captured` (§4.2) but not `promotes`, which is the
 * engine's conclusion rather than the mover's claim — so the move has to be recovered rather
 * than reconstructed. Matching against generated moves is also the only way to get a crowning
 * right without duplicating the crowning rule out here, where it would be free to drift.
 */
function recover(position: Position, payload: MovePayload): Move | undefined {
  return generateMoves(position).find(
    (move) =>
      move.from === payload.from &&
      samePath(move.path, payload.path) &&
      samePath(move.captured, payload.captured),
  );
}

export function createSession(initial: Position = createOpeningPosition()): Session {
  let position = initial;
  let transport: Transport | null = null;
  let detach: (() => void) | null = null;
  let halted: Halt | null = null;
  const handlers = new Set<(event: OpponentMove) => void>();
  const haltHandlers = new Set<(halt: Halt) => void>();

  // Sending is best-effort throughout: the channel may already be gone, and a halt has to
  // reach the local player whether or not the peer can still be told about it.
  function trySend(body: OutboundMessage): void {
    try {
      transport?.send(body);
    } catch {
      // See `play` — a closed channel is the transport's news to break, not ours.
    }
  }

  function stop(reason: Halt["reason"], detail: string): void {
    if (halted) return;
    halted = { reason, detail };
    for (const handler of haltHandlers) handler(halted);
  }

  function receive(message: InboundMessage): void {
    // A halted session is done. Continuing to apply moves after announcing that the boards
    // disagree would be the exact behaviour R-35 exists to forbid.
    if (halted) return;

    // The peer telling us it rejected something of ours. Never answered — that is the loop
    // guard, and it is why this arm comes first.
    if (message.body.type === "error") {
      stop(
        "peerRejected",
        `The other player's game could not accept a move from this one (${message.body.code}). The two boards no longer agree, so play has stopped.`,
      );
      return;
    }

    if (message.body.type !== "move") return;

    const before = position;
    const move = recover(before, message.body);
    if (!move) {
      // R-57: a move is a claim, and this client's own engine is what settles it. §4.2 says
      // an unrecognised move is rejected and an `error` returned.
      trySend({
        type: "error",
        code: "illegalMove",
        detail: "that move is not legal in the position this client is holding",
      });
      stop(
        "illegalMove",
        "The other player sent a move this game cannot make from the current position. The two boards no longer agree, so play has stopped.",
      );
      return;
    }

    // §4.3: computed before anything is committed. Moving to a position already known to
    // disagree, and only then reporting it, would leave the board showing the wrong thing
    // underneath the message saying so.
    const after = applyMove(before, move);
    const ours = stateHash(after);
    if (ours !== message.body.stateHash) {
      trySend({
        type: "error",
        code: "stateDivergence",
        detail: `state hash ${message.body.stateHash} does not match ${ours}`,
      });
      stop(
        "divergence",
        "The two games have ended up with different boards, so play has stopped. This is a bug rather than anything either player did.",
      );
      return;
    }

    position = after;
    for (const handler of handlers) handler({ move, before, after });
  }

  return {
    position(): Position {
      return position;
    },

    haltReason(): Halt | null {
      return halted;
    },

    play(move: Move): void {
      if (halted) return;

      position = applyMove(position, move);
      if (!transport) return;

      try {
        // The hash is of the position *after* the move, which is the one the two clients need
        // to agree on. The receiver recomputes it and compares (§4.3).
        transport.send({
          type: "move",
          from: move.from,
          path: [...move.path],
          captured: [...move.captured],
          stateHash: stateHash(position),
        });
      } catch {
        // `send` throws when the channel is not open — a connection that dropped between the
        // player picking a piece up and putting it down. The move stays applied locally,
        // because it was legal and they made it, and the transport's own status is already
        // saying the connection is gone (R-9). Letting this escape would instead break the
        // input handler mid-gesture, which tells the player nothing and loses the board.
        //
        // Re-sending what was missed is recovery's job, and recovery is task 5.4.
      }
    },

    attach(next: Transport): Unsubscribe {
      // Detaching the previous one first is the whole of "replaces": without it a second
      // attach leaves the old transport still delivering moves into this position, and
      // reconnection (task 5.4) is precisely the feature that will attach twice.
      detach?.();

      transport = next;
      const unsubscribe = next.onMessage(receive);
      detach = () => {
        unsubscribe();
        detach = null;
        if (transport === next) transport = null;
      };
      return () => detach?.();
    },

    onOpponentMove(handler: (event: OpponentMove) => void): Unsubscribe {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    // Handlers subscribing after the halt are told immediately, so a late subscriber cannot
    // end up rendering a live-looking board for a game that has already stopped.
    onHalt(handler: (halt: Halt) => void): Unsubscribe {
      haltHandlers.add(handler);
      if (halted) handler(halted);
      return () => {
        haltHandlers.delete(handler);
      };
    },
  };
}
