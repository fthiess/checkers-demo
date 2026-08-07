/**
 * Simple (non-capture) move generation and application (DESIGN.md §3.2-3.3, R-43).
 *
 * Capture and chain generation is task 2.3 and deliberately not implemented here; this
 * module only walks the "adjacent vacant square" half of the per-direction check the
 * design describes.
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
} from "./board.ts";

export interface Move {
  readonly from: SquareIndex;
  readonly path: readonly SquareIndex[];
  readonly captured: readonly SquareIndex[];
  readonly promotes: boolean;
}

interface Direction {
  readonly dr: number;
  readonly dc: number;
}

// Fixed iteration order (up-left, up-right, down-left, down-right) so that "by direction"
// ordering (DESIGN.md §3.2) is reproducible. The choice of order itself carries no meaning.
const UP_LEFT: Direction = { dr: -1, dc: -1 };
const UP_RIGHT: Direction = { dr: -1, dc: 1 };
const DOWN_LEFT: Direction = { dr: 1, dc: -1 };
const DOWN_RIGHT: Direction = { dr: 1, dc: 1 };
const ALL_DIRECTIONS: readonly Direction[] = [UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT];
const BLACK_MAN_DIRECTIONS: readonly Direction[] = [DOWN_LEFT, DOWN_RIGHT];
const WHITE_MAN_DIRECTIONS: readonly Direction[] = [UP_LEFT, UP_RIGHT];

function isMan(piece: number): boolean {
  return piece === BLACK_MAN || piece === WHITE_MAN;
}

function isKing(piece: number): boolean {
  return piece === BLACK_KING || piece === WHITE_KING;
}

function sideOf(piece: number): Side {
  return piece === BLACK_MAN || piece === BLACK_KING ? "black" : "white";
}

function farRankRowFor(side: Side): number {
  return side === "black" ? 7 : 0;
}

function crown(piece: number): number {
  if (piece === BLACK_MAN) return BLACK_KING;
  if (piece === WHITE_MAN) return WHITE_KING;
  return piece;
}

function directionsFor(piece: number): readonly Direction[] {
  if (isKing(piece)) return ALL_DIRECTIONS;
  return sideOf(piece) === "black" ? BLACK_MAN_DIRECTIONS : WHITE_MAN_DIRECTIONS;
}

export function generateMoves(position: Position): Move[] {
  const moves: Move[] = [];

  for (let from = 0; from < BOARD_SIZE; from++) {
    const piece = position.squares[from] ?? EMPTY;
    if (piece === EMPTY || sideOf(piece) !== position.sideToMove) continue;

    const { row, col } = squareToCoordinates(from);
    for (const { dr, dc } of directionsFor(piece)) {
      const destRow = row + dr;
      const to = coordinatesToSquareIndex(destRow, col + dc);
      if (to === undefined || position.squares[to] !== EMPTY) continue;

      const promotes = isMan(piece) && destRow === farRankRowFor(sideOf(piece));
      moves.push({ from, path: [to], captured: [], promotes });
    }
  }

  return moves;
}

export function applyMove(position: Position, move: Move): Position {
  const squares = Int8Array.from(position.squares);
  const piece = squares[move.from] ?? EMPTY;
  squares[move.from] = EMPTY;

  for (const captured of move.captured) {
    squares[captured] = EMPTY;
  }

  const destination = move.path[move.path.length - 1] ?? move.from;
  squares[destination] = move.promotes ? crown(piece) : piece;

  return {
    squares,
    sideToMove: position.sideToMove === "black" ? "white" : "black",
    plyCount: position.plyCount + 1,
  };
}
