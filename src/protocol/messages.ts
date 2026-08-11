/**
 * The wire message schema (DESIGN.md §4.2).
 *
 * Types and constants only -- no behaviour. This module is the contract `game/` and `net/`
 * share, which is the whole reason it exists as a module of its own rather than living in
 * `net/` where the implementations are (D-21, issue #6).
 *
 * Every message crosses the wire inside an envelope carrying the protocol version and a
 * sequence number. Senders never construct the envelope themselves: they hand a body to the
 * codec, which stamps both.
 */

import type { Side, SquareIndex } from "../engine/board.ts";

// Bumped whenever a change to the shapes below would be misread rather than ignored by an
// older peer. Mismatch is detected at handshake and reported plainly (§4.2) -- never
// tolerated, because a peer that half-understands the protocol is worse than one that
// refuses to play.
export const PROTOCOL_VERSION = 1;

// A move as it travels: an intent, never a board snapshot (§4.2). The receiver applies it
// through its own engine and rejects anything not in its own legal move list (R-57), which
// is what makes a future server referee additive rather than disruptive.
export interface MovePayload {
  readonly from: SquareIndex;
  readonly path: readonly SquareIndex[];
  readonly captured: readonly SquareIndex[];
}

export interface HelloBody {
  readonly type: "hello";
  readonly displayName: string;
  readonly colour: string;
  readonly preferredSide: Side;
}

export interface MoveBody extends MovePayload {
  readonly type: "move";
  // The sender's hash of the position the move produces (§4.3). A divergence detector, not
  // a security measure: it makes a bug or a version skew surface loudly instead of as two
  // players staring at different boards.
  readonly stateHash: string;
}

export interface ResignBody {
  readonly type: "resign";
}

export interface DrawOfferBody {
  readonly type: "drawOffer";
}

export interface DrawAcceptBody {
  readonly type: "drawAccept";
}

export interface DrawDeclineBody {
  readonly type: "drawDecline";
}

export interface RematchBody {
  readonly type: "rematch";
  readonly firstMover: Side;
}

export interface EmoteBody {
  readonly type: "emote";
  readonly emote: string;
}

// Sent by both sides after a reconnection (§5). The longer move list wins provided the
// shorter is a prefix of it; lists that diverge before their common end halt play (R-35).
export interface SyncBody {
  readonly type: "sync";
  readonly moves: readonly MovePayload[];
  readonly stateHash: string;
}

export type ProtocolErrorCode =
  | "versionMismatch"
  | "illegalMove"
  | "stateDivergence"
  | "malformedMessage"
  | "outOfOrder";

export interface ErrorBody {
  readonly type: "error";
  readonly code: ProtocolErrorCode;
  readonly detail: string;
}

export type MessageBody =
  | HelloBody
  | MoveBody
  | ResignBody
  | DrawOfferBody
  | DrawAcceptBody
  | DrawDeclineBody
  | RematchBody
  | EmoteBody
  | SyncBody
  | ErrorBody;

export type MessageType = MessageBody["type"];

// What a sender hands over: the body alone. The version and sequence number are the codec's
// to assign, so no caller can forget them or invent one out of order.
export type OutboundMessage = MessageBody;

// What a receiver is handed: the envelope, already validated, with the sender's own
// numbering intact so the session can reason about ordering if it needs to.
export interface InboundMessage {
  readonly protocolVersion: number;
  readonly seq: number;
  readonly body: MessageBody;
}
