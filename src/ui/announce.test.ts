import { describe, expect, it } from "vitest";
import {
  BLACK_KING,
  BLACK_MAN,
  BOARD_SIZE,
  createOpeningPosition,
  type Position,
  type Side,
  WHITE_KING,
  WHITE_MAN,
} from "../engine/board.ts";
import { applyMove, generateMoves, type Move } from "../engine/moves.ts";
import type { ConnectionState } from "../game/session.ts";
import {
  describeConnection,
  describeMove,
  describeResult,
  describeTurn,
  moveAnnouncement,
} from "./announce.ts";

function positionFrom(pieces: Record<number, number>, sideToMove: Side, plyCount = 0): Position {
  const squares = new Int8Array(BOARD_SIZE);
  for (const [index, piece] of Object.entries(pieces)) {
    squares[Number(index)] = piece;
  }
  return { squares, sideToMove, plyCount };
}

function moveTo(position: Position, from: number, to: number): Move {
  const move = generateMoves(position).find(
    (candidate) => candidate.from === from && candidate.path[candidate.path.length - 1] === to,
  );
  if (!move) throw new Error(`no legal move from ${from} to ${to}`);
  return move;
}

describe("describeMove", () => {
  it("names the piece, its origin, and its destination", () => {
    const position = createOpeningPosition();
    expect(describeMove(position, moveTo(position, 8, 12))).toBe(
      "Black man moves from square 9 to square 13.",
    );
  });

  it("names the captured piece and the square it stood on", () => {
    const position = positionFrom({ 13: BLACK_MAN, 17: WHITE_MAN }, "black");
    expect(describeMove(position, moveTo(position, 13, 22))).toBe(
      "Black man moves from square 14 to square 23, capturing white man on square 18.",
    );
  });

  it("lists every capture of a chain, with a conjunction before the last", () => {
    const position = positionFrom({ 5: BLACK_MAN, 9: WHITE_MAN, 18: WHITE_KING }, "black");
    expect(describeMove(position, moveTo(position, 5, 23))).toBe(
      "Black man moves from square 6 to square 24, capturing white man on square 10 and white king on square 19.",
    );
  });

  it("reports crowning", () => {
    const position = positionFrom({ 25: BLACK_MAN }, "black");
    expect(describeMove(position, moveTo(position, 25, 29))).toBe(
      "Black man moves from square 26 to square 30, and is crowned king.",
    );
  });

  it("distinguishes a king from a man", () => {
    const position = positionFrom({ 13: WHITE_KING }, "white");
    expect(describeMove(position, moveTo(position, 13, 17))).toBe(
      "White king moves from square 14 to square 18.",
    );
  });
});

describe("describeTurn", () => {
  it("names the side to move", () => {
    expect(describeTurn("white")).toBe("White to move.");
    expect(describeTurn("black")).toBe("Black to move.");
  });
});

describe("describeResult", () => {
  it("is null while the game is still playable", () => {
    expect(describeResult(createOpeningPosition())).toBeNull();
  });

  it("reports a loss for a side with no pieces left", () => {
    expect(describeResult(positionFrom({ 13: BLACK_MAN }, "white"))).toBe(
      "White has no legal moves. Black wins.",
    );
  });

  it("reports a loss for a side that still has a piece but cannot move it", () => {
    // 28 is boxed in by 24 and 25, whose landing squares 19 and 21 are occupied too.
    const position = positionFrom(
      { 28: WHITE_MAN, 24: BLACK_MAN, 25: BLACK_MAN, 19: BLACK_MAN, 21: BLACK_MAN },
      "white",
    );
    expect(describeResult(position)).toBe("White has no legal moves. Black wins.");
  });
});

describe("moveAnnouncement", () => {
  it("follows the move with whose turn it now is", () => {
    const before = createOpeningPosition();
    const move = moveTo(before, 8, 12);
    expect(moveAnnouncement(before, move, applyMove(before, move))).toBe(
      "Black man moves from square 9 to square 13. White to move.",
    );
  });

  it("follows a game-ending move with the result instead of a turn", () => {
    // Capturing White's last piece leaves it with no move at all, so the announcement has
    // to end the game rather than hand the turn over to a side that cannot take it.
    const before = positionFrom({ 13: BLACK_MAN, 17: WHITE_MAN }, "black");
    const move = moveTo(before, 13, 22);
    expect(moveAnnouncement(before, move, applyMove(before, move))).toBe(
      "Black man moves from square 14 to square 23, capturing white man on square 18. White has no legal moves. Black wins.",
    );
  });

  it("says nothing about a promotion that did not happen", () => {
    const before = positionFrom({ 13: BLACK_KING, 8: WHITE_MAN }, "black");
    const move = moveTo(before, 13, 16);
    expect(moveAnnouncement(before, move, applyMove(before, move))).toBe(
      "Black king moves from square 14 to square 17. White to move.",
    );
  });
});

describe("connection announcements", () => {
  it("says nothing for the states that are not news", () => {
    // `absent` is where the page starts, and announcing it reports an event that has not
    // happened. `connecting` is reached while an invitation is still being prepared, so it
    // would claim something is under way before there is anyone at the other end.
    expect(describeConnection("absent")).toBeNull();
    expect(describeConnection("connecting")).toBeNull();
  });

  it("distinguishes a first connection from a recovered one", () => {
    expect(describeConnection("ready")).toBe("Connected. You are both in the same game.");
    expect(describeConnection("resumed")).toBe("Connected again. Play can carry on.");
  });

  it("explains an unreachable network rather than naming a state (R-9)", () => {
    const sentence = describeConnection("unreachable");
    expect(sentence).toContain("cannot reach each other");
    expect(sentence).toContain("different network");
  });

  it("does not blame the network for a connection that had been working", () => {
    // The live-test finding: a connection that worked and then failed is almost always the
    // other player leaving, and sending someone off to change networks over that is advice
    // to fix something that is not broken.
    const sentence = describeConnection("lost");
    expect(sentence).not.toContain("different network");
    expect(sentence).not.toContain("cannot reach each other");
    expect(sentence).toContain("other player");
  });

  it("keeps every sentence free of protocol vocabulary (R-7)", () => {
    // The words a player must never meet. This is the test that fails if someone later
    // writes the state name into the sentence, which is the easy way to write these.
    const jargon = /\b(ICE|SDP|peer|offer|answer|WebRTC|STUN|socket|datachannel)\b/i;
    // Written as a Record rather than a list so the type checker, not a reader, is what
    // notices a new ConnectionState: adding one to the union fails to compile here until it
    // is added below, which keeps this test exhaustive without anyone remembering to make it so.
    const every: Record<ConnectionState, null> = {
      absent: null,
      connecting: null,
      ready: null,
      resumed: null,
      interrupted: null,
      unreachable: null,
      lost: null,
      closed: null,
    };

    for (const state of Object.keys(every) as ConnectionState[]) {
      const sentence = describeConnection(state);
      if (sentence === null) continue;
      expect(sentence, state).not.toMatch(jargon);
      // Ends as a sentence, since a live region reads them one after another.
      expect(sentence, state).toMatch(/\.$/);
    }
  });
});
