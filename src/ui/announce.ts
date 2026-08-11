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
