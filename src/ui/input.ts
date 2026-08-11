/**
 * Pointer input's shared selection model (R-13, DESIGN.md §6.3).
 *
 * Both drag-and-drop and click-then-click resolve through these two functions --
 * selectSquare for the "pick a piece" gesture, attemptMove for the "commit to a
 * destination" gesture -- so the two input styles cannot disagree: there is only one
 * implementation of "what move does this resolve to," not two that happen to agree.
 */

import {
  BLACK_KING,
  BLACK_MAN,
  EMPTY,
  type Position,
  type Side,
  type SquareIndex,
  WHITE_KING,
  WHITE_MAN,
} from "../engine/board.ts";
import { applyMove, generateMoves, type Move } from "../engine/moves.ts";

export interface InputState {
  readonly position: Position;
  readonly selected: SquareIndex | null;
}

function sideOfPiece(piece: number): Side | null {
  if (piece === BLACK_MAN || piece === BLACK_KING) return "black";
  if (piece === WHITE_MAN || piece === WHITE_KING) return "white";
  return null;
}

function isOwnPiece(position: Position, square: SquareIndex): boolean {
  const piece = position.squares[square] ?? EMPTY;
  return sideOfPiece(piece) === position.sideToMove;
}

function finalSquareOf(move: Move): SquareIndex {
  return move.path[move.path.length - 1] ?? move.from;
}

export function selectSquare(state: InputState, square: SquareIndex): InputState {
  if (state.selected === square) {
    return { ...state, selected: null };
  }
  if (isOwnPiece(state.position, square)) {
    return { ...state, selected: square };
  }
  return state;
}

// The keyboard's Escape ("cancel") needs to clear a selection unconditionally, unlike
// selectSquare, which only deselects when the same square is activated again.
export function clearSelection(state: InputState): InputState {
  return state.selected === null ? state : { ...state, selected: null };
}

export interface DestinationHighlight {
  readonly square: SquareIndex;
  readonly capture: boolean;
}

// Every prefix of a chain is already a separate legal move (D-3, D-8), so an intermediate
// hop is already one of these destinations in its own right -- highlighting "every legal
// destination for the selected piece" previews the full chain for free, with no separate
// path-tracking needed (R-14).
export function legalDestinations(state: InputState): readonly DestinationHighlight[] {
  if (state.selected === null) return [];
  return generateMoves(state.position)
    .filter((move) => move.from === state.selected)
    .map((move) => ({ square: finalSquareOf(move), capture: move.captured.length > 0 }));
}

// A player dropping on an intermediate landing square of a multi-hop chain -- rather than
// its maximal destination -- resolves to that shorter move (R-41), simply because it's
// matched by origin and final destination against every legal move, prefixes included
// (D-3, D-8), not just the longest chain from a given origin.
//
// Exposed separately from attemptMove because announcing a move (R-48) needs the move
// itself, not just the position it produces. Re-deriving it in the caller would be a second
// implementation of "what move does this resolve to", which is exactly what this module
// exists to prevent.
export function findMove(state: InputState, destination: SquareIndex): Move | undefined {
  if (state.selected === null) return undefined;

  return generateMoves(state.position).find(
    (move) => move.from === state.selected && finalSquareOf(move) === destination,
  );
}

export function attemptMove(state: InputState, destination: SquareIndex): InputState {
  const match = findMove(state, destination);

  if (!match) return state;

  return { position: applyMove(state.position, match), selected: null };
}
