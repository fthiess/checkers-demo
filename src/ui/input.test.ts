import { describe, expect, it } from "vitest";
import {
  BLACK_MAN,
  BOARD_SIZE,
  createOpeningPosition,
  type Position,
  type Side,
  WHITE_MAN,
} from "../engine/board.ts";
import { applyMove, generateMoves } from "../engine/moves.ts";
import {
  attemptMove,
  clearSelection,
  type InputState,
  legalDestinations,
  selectSquare,
} from "./input.ts";

function positionFrom(pieces: Record<number, number>, sideToMove: Side, plyCount = 0): Position {
  const squares = new Int8Array(BOARD_SIZE);
  for (const [index, piece] of Object.entries(pieces)) {
    squares[Number(index)] = piece;
  }
  return { squares, sideToMove, plyCount };
}

describe("selectSquare", () => {
  it("selects an own piece", () => {
    const state: InputState = { position: createOpeningPosition(), selected: null };
    expect(selectSquare(state, 8).selected).toBe(8);
  });

  it("does nothing for an empty or opponent square", () => {
    const state: InputState = { position: createOpeningPosition(), selected: null };
    expect(selectSquare(state, 16)).toEqual(state); // empty
    expect(selectSquare(state, 20)).toEqual(state); // white, but black to move
  });

  it("deselects when the already-selected square is clicked again", () => {
    const state: InputState = { position: createOpeningPosition(), selected: 8 };
    expect(selectSquare(state, 8).selected).toBeNull();
  });
});

describe("attemptMove", () => {
  it("does nothing when nothing is selected", () => {
    const state: InputState = { position: createOpeningPosition(), selected: null };
    expect(attemptMove(state, 12)).toEqual(state);
  });

  it("applies a legal simple move and clears the selection", () => {
    const opening = createOpeningPosition();
    const move = generateMoves(opening)[0];
    if (!move) throw new Error("expected an opening move");
    const destination = move.path[0];
    if (destination === undefined) throw new Error("expected a destination");

    const state: InputState = { position: opening, selected: move.from };
    const next = attemptMove(state, destination);

    expect(next.selected).toBeNull();
    expect(next.position).toEqual(applyMove(opening, move));
  });

  it("leaves the state entirely unchanged for an illegal destination", () => {
    const state: InputState = { position: createOpeningPosition(), selected: 8 };
    expect(attemptMove(state, 0)).toEqual(state);
  });

  it("stops at an intermediate landing square of a multi-hop chain (R-41)", () => {
    const position = positionFrom({ 4: BLACK_MAN, 8: WHITE_MAN, 17: WHITE_MAN }, "black");
    const state: InputState = { position, selected: 4 };

    const next = attemptMove(state, 13);

    expect(next.selected).toBeNull();
    expect(next.position.squares[13]).toBe(BLACK_MAN);
    expect(next.position.squares[8]).toBe(0); // captured
    expect(next.position.squares[17]).toBe(WHITE_MAN); // not captured -- chain stopped early
  });

  it("takes the full chain when the drop lands on its maximal destination", () => {
    const position = positionFrom({ 4: BLACK_MAN, 8: WHITE_MAN, 17: WHITE_MAN }, "black");
    const state: InputState = { position, selected: 4 };

    const next = attemptMove(state, 22);

    expect(next.position.squares[22]).toBe(BLACK_MAN);
    expect(next.position.squares[8]).toBe(0);
    expect(next.position.squares[17]).toBe(0);
  });
});

describe("clearSelection", () => {
  it("clears an existing selection", () => {
    const state: InputState = { position: createOpeningPosition(), selected: 8 };
    expect(clearSelection(state).selected).toBeNull();
  });

  it("is a no-op when nothing is selected", () => {
    const state: InputState = { position: createOpeningPosition(), selected: null };
    expect(clearSelection(state)).toEqual(state);
  });
});

describe("legalDestinations", () => {
  it("is empty when nothing is selected", () => {
    const state: InputState = { position: createOpeningPosition(), selected: null };
    expect(legalDestinations(state)).toEqual([]);
  });

  it("lists a simple-move-only piece's destinations as non-captures", () => {
    const opening = createOpeningPosition();
    const state: InputState = { position: opening, selected: 8 };
    expect(legalDestinations(state)).toEqual([
      { square: 12, capture: false },
      { square: 13, capture: false },
    ]);
  });

  it("previews the full chain: both the one-jump and two-jump destinations appear (R-14)", () => {
    const position = positionFrom({ 4: BLACK_MAN, 8: WHITE_MAN, 17: WHITE_MAN }, "black");
    const state: InputState = { position, selected: 4 };
    expect(legalDestinations(state)).toEqual([
      { square: 13, capture: true },
      { square: 22, capture: true },
    ]);
  });

  it("lists simple and capture destinations together when both are available", () => {
    const position = positionFrom({ 13: BLACK_MAN, 16: WHITE_MAN, 24: WHITE_MAN }, "black");
    const state: InputState = { position, selected: 13 };
    expect(legalDestinations(state)).toEqual([
      { square: 17, capture: false },
      { square: 20, capture: true },
      { square: 29, capture: true },
    ]);
  });
});
