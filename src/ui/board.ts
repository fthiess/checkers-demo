/**
 * Board layout computation (R-11, R-12, DESIGN.md §6.1).
 *
 * Pure functions only -- no DOM here. The engine and protocol always speak in canonical
 * PDN numbering; orientation is a render-time transform applied on top of it, never a
 * change to the underlying position.
 */

import {
  BLACK_KING,
  BLACK_MAN,
  BOARD_SIZE,
  coordinatesToSquareIndex,
  EMPTY,
  type Position,
  type Side,
  type SquareIndex,
  squareToCoordinates,
  WHITE_KING,
  WHITE_MAN,
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

// The reverse of orientSquare -- both viewing sides' transforms are self-inverse at the
// coordinate level (identity for white; a 180-degree rotation undoes itself for black), so
// applying the same transform again recovers the canonical coordinates before looking up
// the index. Returns undefined for a light (unplayed) square's screen position.
export function squareAtOrientedCoordinates(
  row: number,
  col: number,
  viewingSide: Side,
): SquareIndex | undefined {
  const canonical = viewingSide === "white" ? { row, col } : { row: 7 - row, col: 7 - col };
  return coordinatesToSquareIndex(canonical.row, canonical.col);
}

function pieceDescription(piece: number): string {
  switch (piece) {
    case BLACK_MAN:
      return "black man";
    case BLACK_KING:
      return "black king";
    case WHITE_MAN:
      return "white man";
    case WHITE_KING:
      return "white king";
    default:
      return "empty";
  }
}

export interface SquareLabelOptions {
  readonly selected?: boolean;
  readonly destination?: boolean;
  readonly capture?: boolean;
}

// Screen-reader/keyboard users can't see the 3.3 highlight dots, so a square's own label
// carries that state too (R-47) -- otherwise there would be no way to know which squares
// are legal destinations at all, not just a missing nicety.
export function squareLabel(
  squareNumber: number,
  piece: number,
  options: SquareLabelOptions = {},
): string {
  let label = `Square ${squareNumber}, ${pieceDescription(piece)}`;
  if (options.selected) label += ", selected";
  if (options.destination) label += options.capture ? ", legal capture" : ", legal destination";
  return label;
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
