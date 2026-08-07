/**
 * PDN notation and export (DESIGN.md §3.4, R-24).
 *
 * The engine renders moves; it does not parse them back. It also has no concept of player
 * identity -- Black/White tag values are supplied by the caller, never looked up here, and
 * default to the role labels themselves rather than any name (D-13, D-19).
 */

import { createOpeningPosition, type SquareIndex } from "./board.ts";
import { applyMove, generateMoves, type Move } from "./moves.ts";

function squareNumber(index: SquareIndex): number {
  return index + 1;
}

function pathsEqual(a: readonly SquareIndex[], b: readonly SquareIndex[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function finalSquareOf(move: Move): SquareIndex {
  return move.path[move.path.length - 1] ?? move.from;
}

// Ambiguity is a property of the position, not the move alone: two distinct capture
// chains from the same origin can share a destination (DESIGN.md §3.4), which only a
// king's four-direction movement makes possible.
export function notateMove(move: Move, legalMoves: readonly Move[]): string {
  const from = squareNumber(move.from);
  const to = squareNumber(finalSquareOf(move));

  if (move.captured.length === 0) {
    return `${from}-${to}`;
  }

  const ambiguous = legalMoves.some(
    (other) =>
      other.captured.length > 0 &&
      other.from === move.from &&
      finalSquareOf(other) === finalSquareOf(move) &&
      !pathsEqual(other.path, move.path),
  );

  if (!ambiguous) {
    return `${from}x${to}`;
  }

  return `${from}x${move.path.map(squareNumber).join("x")}`;
}

export type PdnResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface PdnTags {
  readonly event?: string;
  readonly date?: string;
  readonly black?: string;
  readonly white?: string;
  readonly result: PdnResult;
}

function formatMoveText(moveTexts: readonly string[]): string {
  const pairs: string[] = [];
  for (let i = 0; i < moveTexts.length; i += 2) {
    const number = i / 2 + 1;
    const black = moveTexts[i];
    const white = moveTexts[i + 1];
    pairs.push(white === undefined ? `${number}. ${black}` : `${number}. ${black} ${white}`);
  }
  return pairs.join(" ");
}

export function exportPdn(playedMoves: readonly Move[], tags: PdnTags): string {
  const lines: string[] = [
    `[Event "${tags.event ?? "?"}"]`,
    `[Date "${tags.date ?? "????.??.??"}"]`,
    `[Black "${tags.black ?? "Black"}"]`,
    `[White "${tags.white ?? "White"}"]`,
    `[Result "${tags.result}"]`,
    "",
  ];

  let position = createOpeningPosition();
  const moveTexts: string[] = [];
  for (const move of playedMoves) {
    moveTexts.push(notateMove(move, generateMoves(position)));
    position = applyMove(position, move);
  }

  lines.push(`${formatMoveText(moveTexts)} ${tags.result}`);
  return lines.join("\n");
}
