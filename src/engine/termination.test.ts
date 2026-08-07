import { describe, expect, it } from "vitest";
import {
  BLACK_MAN,
  BOARD_SIZE,
  createOpeningPosition,
  type Position,
  type Side,
  WHITE_MAN,
} from "./board.ts";
import { isTerminal } from "./termination.ts";

function positionFrom(pieces: Record<number, number>, sideToMove: Side, plyCount = 0): Position {
  const squares = new Int8Array(BOARD_SIZE);
  for (const [index, piece] of Object.entries(pieces)) {
    squares[Number(index)] = piece;
  }
  return { squares, sideToMove, plyCount };
}

describe("isTerminal", () => {
  it("is not terminal at the opening position", () => {
    expect(isTerminal(createOpeningPosition())).toBe(false);
  });

  it("is terminal when the side to move has no pieces", () => {
    const position = positionFrom({ 4: WHITE_MAN }, "black");
    expect(isTerminal(position)).toBe(true);
  });

  it("is terminal when the side to move's only piece is wholly blocked", () => {
    const position = positionFrom(
      { 13: BLACK_MAN, 16: WHITE_MAN, 17: WHITE_MAN, 20: WHITE_MAN, 22: WHITE_MAN },
      "black",
    );
    expect(isTerminal(position)).toBe(true);
  });
});
