import { describe, expect, it } from "vitest";
import { BLACK_KING, createOpeningPosition, type Position } from "./board.ts";
import { fnv1a32, stateHash } from "./hash.ts";

const encoder = new TextEncoder();

describe("fnv1a32", () => {
  it("matches the published FNV-1a 32-bit test vectors", () => {
    expect(fnv1a32(encoder.encode(""))).toBe(0x811c9dc5);
    expect(fnv1a32(encoder.encode("a"))).toBe(0xe40c292c);
    expect(fnv1a32(encoder.encode("foobar"))).toBe(0xbf9cf968);
  });
});

describe("stateHash", () => {
  it("hashes identical positions identically", () => {
    expect(stateHash(createOpeningPosition())).toBe(stateHash(createOpeningPosition()));
  });

  it("changes when any single square differs", () => {
    const base = createOpeningPosition();
    const baseHash = stateHash(base);

    for (let i = 0; i < base.squares.length; i++) {
      const squares = Int8Array.from(base.squares);
      squares[i] = squares[i] === 0 ? BLACK_KING : 0;
      const changed: Position = { ...base, squares };
      expect(stateHash(changed)).not.toBe(baseHash);
    }
  });

  it("changes when the side to move differs", () => {
    const base = createOpeningPosition();
    const flipped: Position = { ...base, sideToMove: "white" };
    expect(stateHash(flipped)).not.toBe(stateHash(base));
  });

  it("changes when the ply count differs", () => {
    const base = createOpeningPosition();
    const advanced: Position = { ...base, plyCount: base.plyCount + 1 };
    expect(stateHash(advanced)).not.toBe(stateHash(base));
  });
});
