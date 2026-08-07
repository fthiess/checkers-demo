import { describe, expect, it } from "vitest";
import { createOpeningPosition } from "./board.ts";
import { applyMove, generateMoves } from "./moves.ts";
import { exportPdn, notateMove } from "./notation.ts";

describe("notateMove", () => {
  it("renders a simple move as origin-destination", () => {
    const move = { from: 0, path: [4], captured: [], promotes: false };
    expect(notateMove(move, [move])).toBe("1-5");
  });

  it("renders a single capture in short form", () => {
    const move = { from: 4, path: [13], captured: [8], promotes: false };
    expect(notateMove(move, [move])).toBe("5x14");
  });

  it("renders an unambiguous multi-hop chain in short form, not the full path", () => {
    const prefix = { from: 4, path: [13], captured: [8], promotes: false };
    const chain = { from: 4, path: [13, 22], captured: [8, 17], promotes: false };
    expect(notateMove(chain, [prefix, chain])).toBe("5x23");
  });

  it("falls back to the explicit full-path form when two chains from the same origin share a destination", () => {
    const viaA = { from: 12, path: [5, 0], captured: [8, 4], promotes: false };
    const viaB = { from: 12, path: [9, 0], captured: [10, 4], promotes: false };
    expect(notateMove(viaA, [viaA, viaB])).toBe("13x6x1");
    expect(notateMove(viaB, [viaA, viaB])).toBe("13x10x1");
  });
});

describe("exportPdn", () => {
  it("writes tag pairs, defaults, and numbered move text ending in the result", () => {
    const opening = createOpeningPosition();
    const blackMove = generateMoves(opening)[0];
    if (!blackMove) throw new Error("expected an opening move");
    const afterBlack = applyMove(opening, blackMove);
    const whiteMove = generateMoves(afterBlack)[0];
    if (!whiteMove) throw new Error("expected a reply");

    const pdn = exportPdn([blackMove, whiteMove], {
      event: "Test",
      date: "2026.08.07",
      result: "*",
    });

    expect(pdn).toContain('[Event "Test"]');
    expect(pdn).toContain('[Date "2026.08.07"]');
    expect(pdn).toContain('[Black "Black"]');
    expect(pdn).toContain('[White "White"]');
    expect(pdn).toContain('[Result "*"]');
    expect(pdn.trim().endsWith("1. 9-13 21-17 *")).toBe(true);
  });
});

// Move list from a real published American-draughts game (standard 32-square numbering),
// commentary and player names deliberately omitted (D-13, D-19) -- source:
// https://gambiter.com/checkers/Portable_draughts_notation.html ("itsyourturn.com USA vs.
// World 8/04", 2004.08.23). The source's '-'/'x' separators aren't trusted here (one move
// is geometrically a capture despite using '-'), so this replay matches recorded moves by
// origin/destination square numbers only, not by the source's notation characters.
const recordedGame: ReadonlyArray<readonly [number, number]> = [
  [11, 15],
  [23, 18],
  [8, 11],
  [26, 23],
  [10, 14],
  [30, 26],
  [6, 10],
  [24, 19],
  [15, 24],
  [27, 20],
  [4, 8],
  [32, 27],
  [12, 16],
  [27, 24],
  [8, 12],
  [22, 17],
  [10, 15],
  [17, 10],
  [7, 14],
  [26, 22],
];

describe("recorded game replay", () => {
  it("finds every move of a real recorded game legal, move by move", () => {
    let position = createOpeningPosition();

    for (const [fromSquare, toSquare] of recordedGame) {
      const legalMoves = generateMoves(position);
      const match = legalMoves.find((m) => {
        const finalSquare = (m.path[m.path.length - 1] ?? m.from) + 1;
        return m.from + 1 === fromSquare && finalSquare === toSquare;
      });
      if (!match) {
        throw new Error(
          `no legal move found for ${fromSquare}-${toSquare} at ply ${position.plyCount}`,
        );
      }
      position = applyMove(position, match);
    }

    expect(position.plyCount).toBe(recordedGame.length);
  });
});
