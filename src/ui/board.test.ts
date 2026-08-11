import { describe, expect, it } from "vitest";
import { BLACK_MAN, createOpeningPosition, WHITE_MAN } from "../engine/board.ts";
import { computeBoardLayout, orientSquare } from "./board.ts";

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
