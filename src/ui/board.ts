/**
 * Board layout computation (R-11, R-12, DESIGN.md §6.1).
 *
 * Pure functions only -- no DOM here. The engine and protocol always speak in canonical
 * PDN numbering; orientation is a render-time transform applied on top of it, never a
 * change to the underlying position.
 */

import {
  BOARD_SIZE,
  EMPTY,
  type Position,
  type Side,
  type SquareIndex,
  squareToCoordinates,
} from "../engine/board.ts";

export interface ScreenCoordinates {
  readonly row: number;
  readonly col: number;
}

// White's own pieces already sit at the high canonical rows, so a white-viewer needs no
// transform. A black-viewer needs a full 180-degree rotation (row and column both
// reversed) -- reversing only the row would mirror the board left-right relative to what
// actually walking around a real table to the other side would show.
export function orientSquare(index: SquareIndex, viewingSide: Side): ScreenCoordinates {
  const { row, col } = squareToCoordinates(index);
  return viewingSide === "white" ? { row, col } : { row: 7 - row, col: 7 - col };
}

export interface SquareLayout {
  readonly row: number;
  readonly col: number;
  readonly dark: boolean;
}

export interface PieceLayout {
  readonly row: number;
  readonly col: number;
  readonly piece: number;
}

export interface BoardLayout {
  readonly squares: readonly SquareLayout[];
  readonly pieces: readonly PieceLayout[];
}

export function computeBoardLayout(position: Position, viewingSide: Side): BoardLayout {
  const squares: SquareLayout[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      squares.push({ row, col, dark: (row + col) % 2 === 1 });
    }
  }

  const pieces: PieceLayout[] = [];
  for (let index = 0; index < BOARD_SIZE; index++) {
    const piece = position.squares[index] ?? EMPTY;
    if (piece === EMPTY) continue;
    const { row, col } = orientSquare(index, viewingSide);
    pieces.push({ row, col, piece });
  }

  return { squares, pieces };
}
