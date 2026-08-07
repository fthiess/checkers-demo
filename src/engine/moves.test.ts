import { describe, expect, it } from "vitest";
import {
  BLACK_KING,
  BLACK_MAN,
  BOARD_SIZE,
  createOpeningPosition,
  EMPTY,
  type Position,
  type Side,
  WHITE_MAN,
} from "./board.ts";
import { applyMove, generateMoves } from "./moves.ts";

function positionFrom(pieces: Record<number, number>, sideToMove: Side, plyCount = 0): Position {
  const squares = new Int8Array(BOARD_SIZE);
  for (const [index, piece] of Object.entries(pieces)) {
    squares[Number(index)] = piece;
  }
  return { squares, sideToMove, plyCount };
}

describe("generateMoves", () => {
  it("finds exactly the seven legal opening moves, hand-verified against the geometry", () => {
    const moves = generateMoves(createOpeningPosition());
    expect(moves).toEqual([
      { from: 8, path: [12], captured: [], promotes: false },
      { from: 8, path: [13], captured: [], promotes: false },
      { from: 9, path: [13], captured: [], promotes: false },
      { from: 9, path: [14], captured: [], promotes: false },
      { from: 10, path: [14], captured: [], promotes: false },
      { from: 10, path: [15], captured: [], promotes: false },
      { from: 11, path: [15], captured: [], promotes: false },
    ]);
  });

  it("moves a king along all four diagonals", () => {
    const position = positionFrom({ 13: BLACK_KING }, "black");
    const moves = generateMoves(position);
    expect(moves.map((m) => m.path[0])).toEqual([8, 9, 16, 17]);
  });

  it("moves a man only along its forward diagonals", () => {
    const position = positionFrom({ 13: WHITE_MAN }, "white");
    const moves = generateMoves(position);
    expect(moves.map((m) => m.path[0])).toEqual([8, 9]);
  });

  it("does not generate a simple move onto an occupied square, but offers a jump if the occupant is capturable", () => {
    const position = positionFrom({ 13: BLACK_MAN, 17: WHITE_MAN }, "black");
    const moves = generateMoves(position);
    expect(moves).toEqual([
      { from: 13, path: [16], captured: [], promotes: false },
      { from: 13, path: [22], captured: [17], promotes: false },
    ]);
  });

  it("only generates moves for the side to move", () => {
    const position = positionFrom({ 13: WHITE_MAN }, "black");
    expect(generateMoves(position)).toEqual([]);
  });

  it("marks a move that reaches the far rank as promoting", () => {
    const position = positionFrom({ 24: BLACK_MAN }, "black");
    const moves = generateMoves(position);
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.promotes)).toBe(true);
  });
});

describe("generateMoves — captures and chains", () => {
  it("emits both the one-jump and two-jump moves for a two-hop chain, not just the maximal one (D-3, D-8)", () => {
    const position = positionFrom({ 4: BLACK_MAN, 8: WHITE_MAN, 17: WHITE_MAN }, "black");
    const moves = generateMoves(position);
    expect(moves).toEqual([
      { from: 4, path: [13], captured: [8], promotes: false },
      { from: 4, path: [13, 22], captured: [8, 17], promotes: false },
    ]);
  });

  it("ends a chain immediately when a hop crowns the piece, even with a simple move also available", () => {
    const position = positionFrom({ 13: BLACK_MAN, 16: WHITE_MAN, 24: WHITE_MAN }, "black");
    const moves = generateMoves(position);
    expect(moves).toEqual([
      { from: 13, path: [17], captured: [], promotes: false },
      { from: 13, path: [20], captured: [16], promotes: false },
      { from: 13, path: [20, 29], captured: [16, 24], promotes: true },
    ]);
  });

  it("lets a king jump backward, unlike a man", () => {
    const position = positionFrom({ 13: BLACK_KING, 8: WHITE_MAN }, "black");
    const moves = generateMoves(position);
    expect(moves).toEqual([
      { from: 13, path: [9], captured: [], promotes: false },
      { from: 13, path: [16], captured: [], promotes: false },
      { from: 13, path: [17], captured: [], promotes: false },
      { from: 13, path: [4], captured: [8], promotes: false },
    ]);
  });
});

describe("applyMove", () => {
  it("moves the piece, clears the origin, and ends the turn", () => {
    const opening = createOpeningPosition();
    const move = generateMoves(opening)[0];
    if (!move) throw new Error("expected at least one opening move");

    const next = applyMove(opening, move);

    expect(next.squares[move.from]).toBe(EMPTY);
    expect(next.squares[move.path[0] ?? -1]).toBe(BLACK_MAN);
    expect(next.sideToMove).toBe("white");
    expect(next.plyCount).toBe(opening.plyCount + 1);
  });

  it("crowns a man that reaches the far rank, ending its turn immediately", () => {
    const position = positionFrom({ 24: BLACK_MAN }, "black");
    const move = generateMoves(position)[0];
    if (!move) throw new Error("expected a promoting move");

    const next = applyMove(position, move);

    expect(next.squares[move.path[0] ?? -1]).toBe(BLACK_KING);
    expect(next.sideToMove).toBe("white");
  });
});
