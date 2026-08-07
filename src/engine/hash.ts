/**
 * State hash: a divergence detector, not a security measure (DESIGN.md §4.3, R-35, R-58).
 * A 32-bit FNV-1a hash over the canonical serialisation of the squares array, the side to
 * move, and the ply count.
 */

import { BOARD_SIZE, type Position } from "./board.ts";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a32(bytes: Uint8Array): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function serializePosition(position: Position): Uint8Array {
  const bytes = new Uint8Array(BOARD_SIZE + 1 + 4);
  bytes.set(position.squares, 0);
  bytes[BOARD_SIZE] = position.sideToMove === "black" ? 0 : 1;

  const ply = position.plyCount >>> 0;
  bytes[BOARD_SIZE + 1] = (ply >>> 24) & 0xff;
  bytes[BOARD_SIZE + 2] = (ply >>> 16) & 0xff;
  bytes[BOARD_SIZE + 3] = (ply >>> 8) & 0xff;
  bytes[BOARD_SIZE + 4] = ply & 0xff;

  return bytes;
}

export function stateHash(position: Position): string {
  return fnv1a32(serializePosition(position)).toString(16).padStart(8, "0");
}
