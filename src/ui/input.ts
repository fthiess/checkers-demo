/**
 * Pointer input's shared selection model (R-13, DESIGN.md §6.3).
 *
 * Every input style resolves through these functions -- selectSquare for the "pick a piece"
 * gesture, findMove for the "commit to a destination" gesture -- so drag-and-drop, clicking,
 * and the keyboard cannot disagree: there is only one implementation of "what move does this
 * resolve to," not three that happen to agree.
 *
 * Applying the move it finds is deliberately not here. The position belongs to `game/`'s
 * session, which is what lets a move made on the other side of the connection land on this
 * board by the same route a local one does (task 1.4).
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
import { generateMoves, type Move } from "../engine/moves.ts";

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
// Returns the move rather than the position it would produce, because announcing a move
// (R-48) needs the move itself, and because the session is what applies it.
export function findMove(state: InputState, destination: SquareIndex): Move | undefined {
  if (state.selected === null) return undefined;

  return generateMoves(state.position).find(
    (move) => move.from === state.selected && finalSquareOf(move) === destination,
  );
}
