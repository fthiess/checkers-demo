/**
 * Board representation and geometry for the 32 playable squares (DESIGN.md §3.1).
 *
 * Squares are addressed by a zero-based index 0-31, corresponding to PDN squares 1-32.
 * Row/column geometry is derived from that index rather than stored, per the design.
 */

export type Side = "black" | "white";

export const EMPTY = 0;
export const BLACK_MAN = 1;
export const BLACK_KING = 2;
export const WHITE_MAN = 3;
export const WHITE_KING = 4;

export type SquareIndex = number;

export const BOARD_SIZE = 32;

export interface Position {
  readonly squares: Int8Array;
  readonly sideToMove: Side;
  readonly plyCount: number;
}

export interface SquareCoordinates {
  readonly row: number;
  readonly col: number;
}

export function squareToCoordinates(index: SquareIndex): SquareCoordinates {
  const row = Math.floor(index / 4);
  const col = 2 * (index % 4) + (row % 2 === 0 ? 1 : 0);
  return { row, col };
}

// Inverse of squareToCoordinates. Returns undefined for off-board coordinates and for the
// light squares, which carry no index because play never occurs on them.
export function coordinatesToSquareIndex(row: number, col: number): SquareIndex | undefined {
  if (row < 0 || row > 7 || col < 0 || col > 7) return undefined;
  if ((row + col) % 2 === 0) return undefined;
  const colOffset = row % 2 === 0 ? 1 : 0;
  const quarter = (col - colOffset) / 2;
  return row * 4 + quarter;
}

export function createOpeningPosition(): Position {
  const squares = new Int8Array(BOARD_SIZE);
  for (let i = 0; i < 12; i++) {
    squares[i] = BLACK_MAN;
  }
  for (let i = 20; i < 32; i++) {
    squares[i] = WHITE_MAN;
  }
  return { squares, sideToMove: "black", plyCount: 0 };
}
