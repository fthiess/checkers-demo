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

// A player dropping on an intermediate landing square of a multi-hop chain -- rather than
// its maximal destination -- resolves to that shorter move (R-41), simply because it's
// matched by origin and final destination against every legal move, prefixes included
// (D-3, D-8), not just the longest chain from a given origin.
export function attemptMove(state: InputState, destination: SquareIndex): InputState {
  if (state.selected === null) return state;

  const match = generateMoves(state.position).find(
    (move) => move.from === state.selected && finalSquareOf(move) === destination,
  );

  if (!match) return state;

  return { position: applyMove(state.position, match), selected: null };
}
