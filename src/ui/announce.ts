/**
 * Screen-reader announcements (R-48, DESIGN.md §6.3).
 *
 * Pure functions only -- no DOM here, matching board.ts and input.ts; main.ts owns the live
 * region element itself. These describe a move in words rather than in notation: "11x18" is
 * what the PDN export needs, not what someone listening to the game needs.
 */

import { EMPTY, type Position, type Side, type SquareIndex } from "../engine/board.ts";
import type { Move } from "../engine/moves.ts";
import { isTerminal } from "../engine/termination.ts";
import type { ConnectionState } from "../game/session.ts";
import { pieceDescription } from "./board.ts";

function squareNumber(index: SquareIndex): number {
  return index + 1;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sideName(side: Side): string {
  return side === "black" ? "Black" : "White";
}

// A bare comma-separated list runs together when spoken, and the last item is the one most
// likely to be lost -- so a multi-capture chain gets a real conjunction before its final
// capture rather than one more comma.
function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// The position passed in is the one *before* the move: it is the only one that still holds
// both the moving piece at its origin and the pieces about to be captured.
export function describeMove(positionBefore: Position, move: Move): string {
  const mover = capitalise(pieceDescription(positionBefore.squares[move.from] ?? EMPTY));
  const from = squareNumber(move.from);
  const to = squareNumber(move.path[move.path.length - 1] ?? move.from);

  let sentence = `${mover} moves from square ${from} to square ${to}`;

  if (move.captured.length > 0) {
    const captures = move.captured.map(
      (square) =>
        `${pieceDescription(positionBefore.squares[square] ?? EMPTY)} on square ${squareNumber(square)}`,
    );
    sentence += `, capturing ${joinWithAnd(captures)}`;
  }

  if (move.promotes) {
    sentence += ", and is crowned king";
  }

  return `${sentence}.`;
}

export function describeTurn(side: Side): string {
  return `${sideName(side)} to move.`;
}

// The side to move loses when it has no legal move at all (R-43) -- which is why this asks
// isTerminal rather than counting pieces: being wholly blocked is a loss too.
export function describeResult(position: Position): string | null {
  if (!isTerminal(position)) return null;
  const loser = position.sideToMove;
  const winner: Side = loser === "black" ? "white" : "black";
  return `${sideName(loser)} has no legal moves. ${sideName(winner)} wins.`;
}

/**
 * Connection changes worth saying out loud (R-48).
 *
 * `null` means say nothing, and two states earn it. `absent` is the state the application
 * starts in, and announcing "not connected" to someone who has just opened the page reports
 * an event that has not happened. `connecting` is reached the moment an invitation starts
 * being prepared — long before there is anyone to connect *to* — so announcing it would tell
 * the player something is under way when what is actually needed is for them to send the
 * invitation the screen is showing them.
 *
 * The rest are the states a player has to act on, and they say the same thing the connection
 * screen says, including the part about what to do next. A spoken sentence that stops before
 * the remedy the sighted player can read is a smaller version of not announcing it at all.
 */
export function describeConnection(state: ConnectionState): string | null {
  switch (state) {
    case "absent":
    case "connecting":
      return null;
    case "ready":
      return "Connected. You are both in the same game.";
    case "resumed":
      return "Connected again. Play can carry on.";
    case "interrupted":
      return "The connection dropped. Trying to pick it up again.";
    case "unreachable":
      return "These two networks cannot reach each other directly. This happens on some home and office networks, and often on mobile data. Trying again from a different network is the usual fix.";
    // Deliberately not the sentence above. This connection worked a moment ago, so the
    // networks are not the thing to go and change (R-9).
    case "lost":
      return "The connection to the other player has gone. They may have closed the game, or their network may have dropped. Starting a new game is the way back.";
    case "closed":
      return "The connection is closed.";
  }
}

// One announcement per completed move, so a polite live region delivers the move and what
// follows from it together rather than as two utterances that can be interrupted apart.
export function moveAnnouncement(
  positionBefore: Position,
  move: Move,
  positionAfter: Position,
): string {
  const outcome = describeResult(positionAfter) ?? describeTurn(positionAfter.sideToMove);
  return `${describeMove(positionBefore, move)} ${outcome}`;
}
