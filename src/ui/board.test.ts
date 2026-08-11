import { describe, expect, it } from "vitest";
import {
  BLACK_KING,
  BLACK_MAN,
  BOARD_SIZE,
  createOpeningPosition,
  EMPTY,
  WHITE_MAN,
} from "../engine/board.ts";
import {
  computeBoardLayout,
  orientSquare,
  squareAtOrientedCoordinates,
  squareLabel,
} from "./board.ts";

describe("orientSquare", () => {
  it("is the identity for a white viewer", () => {
    expect(orientSquare(0, "white")).toEqual({ row: 0, col: 1 });
  });

  it("rotates 180 degrees for a black viewer -- Black's own home square lands where White's home square sits under White's own identity view", () => {
    // Square 1 (index 0) is Black's home corner; square 32 (index 31) is White's, and
    // orientSquare(31, "white") is the identity, i.e. squareToCoordinates(31) itself.
    expect(orientSquare(0, "black")).toEqual({ row: 7, col: 6 });
  });
});

describe("squareAtOrientedCoordinates", () => {
  it("is the inverse of orientSquare for every square, in both viewing sides", () => {
    for (const viewingSide of ["black", "white"] as const) {
      for (let index = 0; index < BOARD_SIZE; index++) {
        const { row, col } = orientSquare(index, viewingSide);
        expect(squareAtOrientedCoordinates(row, col, viewingSide)).toBe(index);
      }
    }
  });

  it("returns undefined for a light square's screen position", () => {
    expect(squareAtOrientedCoordinates(0, 0, "black")).toBeUndefined();
  });
});

describe("squareLabel", () => {
  it("describes an empty square", () => {
    expect(squareLabel(9, EMPTY)).toBe("Square 9, empty");
  });

  it("describes each piece kind", () => {
    expect(squareLabel(9, BLACK_MAN)).toBe("Square 9, black man");
    expect(squareLabel(9, BLACK_KING)).toBe("Square 9, black king");
    expect(squareLabel(30, WHITE_MAN)).toBe("Square 30, white man");
  });

  it("appends selected and destination state", () => {
    expect(squareLabel(9, BLACK_MAN, { selected: true })).toBe("Square 9, black man, selected");
    expect(squareLabel(14, EMPTY, { destination: true })).toBe(
      "Square 14, empty, legal destination",
    );
    expect(squareLabel(14, EMPTY, { destination: true, capture: true })).toBe(
      "Square 14, empty, legal capture",
    );
  });
});

describe("computeBoardLayout", () => {
  it("lays out all 64 squares with 32 dark", () => {
    const layout = computeBoardLayout(createOpeningPosition(), "black");
    expect(layout.squares).toHaveLength(64);
    expect(layout.squares.filter((s) => s.dark)).toHaveLength(32);
  });

  it("draws a black viewer's own pieces nearest the bottom of their screen (R-12)", () => {
    const layout = computeBoardLayout(createOpeningPosition(), "black");
    expect(layout.pieces).toHaveLength(24);
    for (const piece of layout.pieces) {
      if (piece.piece === BLACK_MAN) expect(piece.row).toBeGreaterThanOrEqual(5);
      if (piece.piece === WHITE_MAN) expect(piece.row).toBeLessThanOrEqual(2);
    }
  });

  it("draws a white viewer's own pieces nearest the bottom of their screen (R-12)", () => {
    const layout = computeBoardLayout(createOpeningPosition(), "white");
    expect(layout.pieces).toHaveLength(24);
    for (const piece of layout.pieces) {
      if (piece.piece === WHITE_MAN) expect(piece.row).toBeGreaterThanOrEqual(5);
      if (piece.piece === BLACK_MAN) expect(piece.row).toBeLessThanOrEqual(2);
    }
  });
});
