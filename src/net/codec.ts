/**
 * Wire codec (DESIGN.md §4.2).
 *
 * Everything arriving from a peer is untrusted input: `decode` therefore returns a typed
 * failure rather than throwing, and never asserts its way to a `MessageBody`. Structure is
 * all it checks. Whether a move is *legal* is not a question this module is entitled to
 * answer -- the receiver applies it through its own engine and rejects it there (R-57), and
 * putting board geometry in the transport layer would be exactly the leak §9 warns about.
 *
 * A codec instance belongs to one connection. It stamps outgoing sequence numbers and
 * remembers the last it accepted, so duplicated or reordered messages are caught here
 * instead of at every call site that reads one.
 */

import type {
  InboundMessage,
  MessageBody,
  MovePayload,
  OutboundMessage,
  ProtocolErrorCode,
} from "../protocol/messages.ts";
import { PROTOCOL_VERSION } from "../protocol/messages.ts";

export type DecodeFailureCode =
  | "malformed"
  | "versionMismatch"
  | "unknownType"
  | "invalidBody"
  | "outOfOrder";

export type DecodeResult =
  | { readonly ok: true; readonly message: InboundMessage }
  | { readonly ok: false; readonly code: DecodeFailureCode; readonly detail: string };

export interface Codec {
  encode(message: OutboundMessage): string;
  decode(text: string): DecodeResult;
}

function failure(code: DecodeFailureCode, detail: string): DecodeResult {
  return { ok: false, code, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

// Structural only: a square index is a non-negative integer on the wire. Whether it names a
// square that exists, or one a piece may legally reach, is the engine's business.
function isSquareIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSquareIndexArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isSquareIndex);
}

function isSide(value: unknown): value is "black" | "white" {
  return value === "black" || value === "white";
}

const PROTOCOL_ERROR_CODES: readonly ProtocolErrorCode[] = [
  "versionMismatch",
  "illegalMove",
  "stateDivergence",
  "malformedMessage",
  "outOfOrder",
];

function isProtocolErrorCode(value: unknown): value is ProtocolErrorCode {
  return PROTOCOL_ERROR_CODES.includes(value as ProtocolErrorCode);
}

function isMovePayload(value: unknown): value is MovePayload {
  return (
    isRecord(value) &&
    isSquareIndex(value.from) &&
    isSquareIndexArray(value.path) &&
    value.path.length > 0 &&
    isSquareIndexArray(value.captured)
  );
}

// Returns the body when it is well formed, or a reason it is not. Each arm checks every
// field the corresponding interface declares, so a peer cannot get a partially populated
// body past this point and have it surface as undefined somewhere far away.
function validateBody(body: Record<string, unknown>): MessageBody | string {
  switch (body.type) {
    case "hello":
      if (!isString(body.displayName)) return "hello.displayName must be a string";
      if (!isString(body.colour)) return "hello.colour must be a string";
      if (!isSide(body.preferredSide)) return "hello.preferredSide must be black or white";
      return {
        type: "hello",
        displayName: body.displayName,
        colour: body.colour,
        preferredSide: body.preferredSide,
      };

    case "move":
      if (!isMovePayload(body)) return "move must carry from, a non-empty path, and captured";
      if (!isString(body.stateHash)) return "move.stateHash must be a string";
      return {
        type: "move",
        from: body.from,
        path: body.path,
        captured: body.captured,
        stateHash: body.stateHash,
      };

    case "resign":
      return { type: "resign" };

    case "drawOffer":
      return { type: "drawOffer" };

    case "drawAccept":
      return { type: "drawAccept" };

    case "drawDecline":
      return { type: "drawDecline" };

    case "rematch":
      if (!isSide(body.firstMover)) return "rematch.firstMover must be black or white";
      return { type: "rematch", firstMover: body.firstMover };

    case "emote":
      if (!isString(body.emote)) return "emote.emote must be a string";
      return { type: "emote", emote: body.emote };

    case "sync":
      if (!Array.isArray(body.moves) || !body.moves.every(isMovePayload)) {
        return "sync.moves must be an array of move payloads";
      }
      if (!isString(body.stateHash)) return "sync.stateHash must be a string";
      return {
        type: "sync",
        moves: body.moves.map((move) => ({
          from: move.from,
          path: move.path,
          captured: move.captured,
        })),
        stateHash: body.stateHash,
      };

    case "error":
      if (!isProtocolErrorCode(body.code)) return "error.code is not a known protocol error";
      if (!isString(body.detail)) return "error.detail must be a string";
      return { type: "error", code: body.code, detail: body.detail };

    default:
      return "unknown type";
  }
}

export function createCodec(): Codec {
  let nextSeq = 1;
  let lastAccepted: number | null = null;

  return {
    encode(message: OutboundMessage): string {
      const envelope: InboundMessage = {
        protocolVersion: PROTOCOL_VERSION,
        seq: nextSeq,
        body: message,
      };
      nextSeq += 1;
      return JSON.stringify(envelope);
    },

    decode(text: string): DecodeResult {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return failure("malformed", "not valid JSON");
      }

      if (!isRecord(parsed)) return failure("malformed", "message is not an object");
      if (typeof parsed.protocolVersion !== "number") {
        return failure("malformed", "missing protocolVersion");
      }
      if (parsed.protocolVersion !== PROTOCOL_VERSION) {
        return failure(
          "versionMismatch",
          `peer speaks protocol ${parsed.protocolVersion}, this client speaks ${PROTOCOL_VERSION}`,
        );
      }
      if (!Number.isInteger(parsed.seq)) return failure("malformed", "missing or non-integer seq");

      const seq = parsed.seq as number;
      // Strictly increasing rather than exactly one greater: a gap means the peer skipped a
      // number, which is harmless, while a repeat or a step backwards means a duplicate or a
      // replay, which is not. The first message accepted sets the baseline, because the two
      // sides number independently and a reconnection starts a fresh codec on both.
      if (lastAccepted !== null && seq <= lastAccepted) {
        return failure("outOfOrder", `seq ${seq} does not follow ${lastAccepted}`);
      }

      if (!isRecord(parsed.body)) return failure("malformed", "missing body");

      const validated = validateBody(parsed.body);
      if (typeof validated === "string") {
        return validated === "unknown type"
          ? failure("unknownType", `unknown message type ${JSON.stringify(parsed.body.type)}`)
          : failure("invalidBody", validated);
      }

      // Only a message that survived every check advances the counter: a rejected one was
      // never delivered, so it must not silently lock out the number it claimed.
      lastAccepted = seq;
      return { ok: true, message: { protocolVersion: PROTOCOL_VERSION, seq, body: validated } };
    },
  };
}
