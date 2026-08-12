/**
 * The shared game session (task 1.4 — DESIGN.md §5, R-11).
 *
 * Owns the position both players are looking at, and is the only thing that moves it. A move
 * made here is applied and sent; a move arriving from the opponent is applied and announced.
 * That is the whole of the walking skeleton's thread, and it is what makes two browsers show
 * the same board.
 *
 * It names a `Transport` without importing `net/` — the reason `protocol/` exists at all
 * (D-21). Which transport is in use stays `app/`'s business, so this module works exactly the
 * same against the peer-to-peer one and against §9's future client/server replacement.
 *
 * **Inbound moves are not validated here.** A received move is matched against the moves the
 * engine says are available, which means one that matches nothing is ignored — but ignoring
 * is not rejecting: there is no report to the player and no state-hash comparison. R-57's
 * validation and R-35's divergence halt are task 3.6's, and this module is where they go.
 */

import { createOpeningPosition, type Position } from "../engine/board.ts";
import { stateHash } from "../engine/hash.ts";
import { applyMove, generateMoves, type Move } from "../engine/moves.ts";
import type { InboundMessage, MovePayload } from "../protocol/messages.ts";
import type { Transport, Unsubscribe } from "../protocol/transport.ts";

export interface OpponentMove {
  readonly move: Move;
  readonly before: Position;
  readonly after: Position;
}

export interface Session {
  position(): Position;
  /** Applies a move made on this client, then sends it to the opponent. */
  play(move: Move): void;
  /** Connects the session to a transport once one exists. Replaces any previous one. */
  attach(transport: Transport): Unsubscribe;
  onOpponentMove(handler: (event: OpponentMove) => void): Unsubscribe;
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
  const handlers = new Set<(event: OpponentMove) => void>();

  function receive(message: InboundMessage): void {
    if (message.body.type !== "move") return;

    const before = position;
    const move = recover(before, message.body);
    if (!move) return;

    position = applyMove(before, move);
    for (const handler of handlers) handler({ move, before, after: position });
  }

  return {
    position(): Position {
      return position;
    },

    play(move: Move): void {
      position = applyMove(position, move);
      if (!transport) return;

      try {
        // The hash goes out with every move so that 3.6 can compare it without a protocol
        // change; nothing reads it yet. It is of the position *after* the move, which is the
        // one the two clients need to agree on.
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
  };
}
