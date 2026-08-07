import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BLACK_KING,
  BLACK_MAN,
  BOARD_SIZE,
  createOpeningPosition,
  EMPTY,
  type Position,
  WHITE_KING,
  WHITE_MAN,
} from "./board.ts";
import { applyMove, generateMoves, type Move } from "./moves.ts";
import { isTerminal } from "./termination.ts";

const VALID_PIECES = new Set([EMPTY, BLACK_MAN, BLACK_KING, WHITE_MAN, WHITE_KING]);

function countPieces(squares: Int8Array): number {
  let count = 0;
  for (let i = 0; i < squares.length; i++) {
    if ((squares[i] ?? EMPTY) !== EMPTY) count++;
  }
  return count;
}

function isWellFormed(position: Position): boolean {
  if (position.squares.length !== BOARD_SIZE) return false;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!VALID_PIECES.has(position.squares[i] ?? EMPTY)) return false;
  }
  return true;
}

interface Step {
  readonly before: Position;
  readonly move: Move;
  readonly after: Position;
}

// Walks a reproducible-but-varied path through real game positions, starting from the
// opening position, picking `moves[choice % moves.length]` at each step -- so an arbitrary
// array of small integers drives a genuine sequence of legal games rather than isolated
// hand-built positions like tasks 2.1-2.5 used.
function walkGame(choices: readonly number[]): Step[] {
  const steps: Step[] = [];
  let position = createOpeningPosition();

  for (const choice of choices) {
    if (isTerminal(position)) break;
    const moves = generateMoves(position);
    const move = moves[choice % moves.length];
    if (!move) throw new Error("unreachable: index is always within moves.length");

    const after = applyMove(position, move);
    steps.push({ before: position, move, after });
    position = after;
  }

  return steps;
}

const gameChoices = fc.array(fc.nat(63), { minLength: 0, maxLength: 60 });

describe("engine properties over randomly walked games", () => {
  it("conserves pieces: a position loses exactly as many pieces as the move captured", () => {
    fc.assert(
      fc.property(gameChoices, (choices) => {
        for (const { before, move, after } of walkGame(choices)) {
          const lost = countPieces(before.squares) - countPieces(after.squares);
          expect(lost).toBe(move.captured.length);
        }
      }),
    );
  });

  it("generates moves deterministically: the same position always yields the same list", () => {
    fc.assert(
      fc.property(gameChoices, (choices) => {
        for (const { before } of walkGame(choices)) {
          expect(generateMoves(before)).toEqual(generateMoves(before));
        }
      }),
    );
  });

  it("never applies a move into an inconsistent position", () => {
    fc.assert(
      fc.property(gameChoices, (choices) => {
        for (const { before, after } of walkGame(choices)) {
          expect(isWellFormed(after)).toBe(true);
          expect(after.sideToMove).toBe(before.sideToMove === "black" ? "white" : "black");
          expect(after.plyCount).toBe(before.plyCount + 1);
        }
      }),
    );
  });
});
