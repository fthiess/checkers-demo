import { describe, expect, it } from "vitest";
import {
  BLACK_MAN,
  BOARD_SIZE,
  coordinatesToSquareIndex,
  createOpeningPosition,
  EMPTY,
  squareToCoordinates,
  WHITE_MAN,
} from "./board.ts";

// Reference coordinates below are read off the standard PDN/checkers numbering diagram
// (the same numbering used by usacheckers.com and Wikipedia's "Portable Draughts
// Notation" article), not derived from squareToCoordinates itself — the point of
// ROADMAP.md task 2.1 is to catch the formula disagreeing with the published convention.
describe("squareToCoordinates", () => {
  it.each([
    [0, { row: 0, col: 1 }], // square 1, top-left dark square
    [3, { row: 0, col: 7 }], // square 4, end of the first row
    [4, { row: 1, col: 0 }], // square 5, start of the second row
    [11, { row: 2, col: 7 }], // square 12
    [16, { row: 4, col: 1 }], // square 17, board midline
    [20, { row: 5, col: 0 }], // square 21
    [27, { row: 6, col: 7 }], // square 28
    [31, { row: 7, col: 6 }], // square 32, bottom-right dark square
  ])("maps index %i to %o against the reference diagram", (index, expected) => {
    expect(squareToCoordinates(index)).toEqual(expected);
  });
});

describe("coordinatesToSquareIndex", () => {
  it("is the inverse of squareToCoordinates for every playable square", () => {
    for (let index = 0; index < BOARD_SIZE; index++) {
      const { row, col } = squareToCoordinates(index);
      expect(coordinatesToSquareIndex(row, col)).toBe(index);
    }
  });

  it("returns undefined off the board", () => {
    expect(coordinatesToSquareIndex(-1, 1)).toBeUndefined();
    expect(coordinatesToSquareIndex(8, 1)).toBeUndefined();
    expect(coordinatesToSquareIndex(0, -1)).toBeUndefined();
    expect(coordinatesToSquareIndex(0, 8)).toBeUndefined();
  });

  it("returns undefined for light (unplayed) squares", () => {
    expect(coordinatesToSquareIndex(0, 0)).toBeUndefined();
    expect(coordinatesToSquareIndex(0, 2)).toBeUndefined();
  });
});

describe("createOpeningPosition", () => {
  const position = createOpeningPosition();

  it("places twelve black men on squares 1-12", () => {
    for (let i = 0; i < 12; i++) {
      expect(position.squares[i]).toBe(BLACK_MAN);
    }
  });

  it("leaves squares 13-20 empty", () => {
    for (let i = 12; i < 20; i++) {
      expect(position.squares[i]).toBe(EMPTY);
    }
  });

  it("places twelve white men on squares 21-32", () => {
    for (let i = 20; i < 32; i++) {
      expect(position.squares[i]).toBe(WHITE_MAN);
    }
  });

  it("has black to move at ply 0", () => {
    expect(position.sideToMove).toBe("black");
    expect(position.plyCount).toBe(0);
  });

  it("has exactly 32 squares", () => {
    expect(position.squares.length).toBe(BOARD_SIZE);
  });

  it("returns a fresh squares array on every call", () => {
    const other = createOpeningPosition();
    expect(other.squares).not.toBe(position.squares);
  });
});
