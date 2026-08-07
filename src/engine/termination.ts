/**
 * Termination detection (R-43, DESIGN.md §3.3).
 *
 * The side to move loses when it has no legal move -- covering both having no pieces and
 * being wholly blocked, with no special case for either.
 */

import type { Position } from "./board.ts";
import { generateMoves } from "./moves.ts";

export function isTerminal(position: Position): boolean {
  return generateMoves(position).length === 0;
}
