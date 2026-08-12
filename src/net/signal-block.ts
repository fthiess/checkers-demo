/**
 * Signal block encoding (DESIGN.md §4.5, R-5, R-6).
 *
 * A block is the thing a person carries from one browser to the other by hand — pasted into
 * a chat window, an email, a text message. Everything here is a consequence of that channel
 * rather than of WebRTC: the block is compressed because a raw SDP with gathered candidates
 * runs to a few kilobytes, base64url-encoded because the channel may mangle punctuation, and
 * decoded only after every whitespace character is stripped because the channel may re-flow
 * it. The transport knows none of this, and must not (D-22).
 *
 * A pasted block is untrusted input in the same sense a wire message is, so `decodeBlock`
 * returns a typed failure rather than throwing, exactly as `codec.ts` does.
 */

import { PROTOCOL_VERSION } from "../protocol/messages.ts";
import type { SignalBlob } from "../protocol/transport.ts";

/**
 * The first character of a block says how the rest of it is encoded, and sits outside the
 * base64url payload so that reading it needs no decoding at all.
 *
 * §4.5 specifies the fallback to uncompressed but not how a reader tells the two apart, and
 * it cannot be inferred: deflate-raw carries no header or checksum (RFC 1951), which is the
 * whole reason it is the shortest option, so a compressed payload is not distinguishable
 * from an uncompressed one by inspection. Hence a marker.
 */
const COMPRESSED_MARKER = "C";
const UNCOMPRESSED_MARKER = "U";

const COMPRESSION_FORMAT = "deflate-raw";

export interface SignalBlock {
  readonly protocolVersion: number;
  readonly kind: "offer" | "answer";
  readonly sessionId: string;
  readonly sdp: string;
}

export type BlockFailureCode =
  | "empty"
  | "unknownEncoding"
  | "malformed"
  | "versionMismatch"
  | "invalidBlock";

export type BlockResult =
  | { readonly ok: true; readonly block: SignalBlock }
  | { readonly ok: false; readonly code: BlockFailureCode; readonly detail: string };

function failure(code: BlockFailureCode, detail: string): BlockResult {
  return { ok: false, code, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A session identifier drawn from `crypto.getRandomValues` rather than `crypto.randomUUID`.
 *
 * `randomUUID` is restricted to secure contexts, and R-1's deliverable is a file opened by
 * double-click from a desktop — whether a `file://` origin counts as secure varies by
 * browser and is not a question this project should be betting its connection flow on.
 * `getRandomValues` carries no such restriction.
 */
function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Built one character at a time rather than with a spread into String.fromCharCode: a block
// is a few kilobytes before compression, and spreading an array that size into a call's
// arguments is how that throws a stack overflow on some engines at some sizes.
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  const standard = text.replaceAll("-", "+").replaceAll("_", "/");
  // Padding is stripped on the way out because it is redundant and `=` is one more character
  // a channel can decide to escape; `atob` still wants it back.
  const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), "=");

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Feature detection by construction rather than by `typeof`, because the two are not the
 * same question. `deflate-raw` arrived later than the `CompressionStream` constructor itself
 * (Chrome 103 against Chrome 80; Firefox 113 and Safari 16.4 shipped both together), so a
 * browser can have the constructor and reject this format — which it does by throwing.
 *
 * Verified against MDN's browser-compat-data for `api.CompressionStream.CompressionStream`,
 * `deflate-raw_format`.
 */
function compressionAvailable(): boolean {
  if (typeof CompressionStream !== "function") return false;
  try {
    new CompressionStream(COMPRESSION_FORMAT);
    return true;
  } catch {
    return false;
  }
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const compressed = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream(COMPRESSION_FORMAT));
  return collect(compressed);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const decompressed = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream(COMPRESSION_FORMAT));
    return await collect(decompressed);
  } catch {
    // A truncated or corrupted payload fails here rather than at the JSON parse, and it is
    // the same class of problem to the person holding a half-copied block.
    return null;
  }
}

export function createSessionId(): string {
  return newSessionId();
}

/**
 * Packs a description into a block. The envelope carries the protocol version and a session
 * id alongside the SDP; the creator's display name and colour, which §4.5 also lists, join
 * it once they exist as something a player can choose (Phase 4/5). The envelope is versioned
 * precisely so that adding them later is an ordinary change.
 */
export async function encodeBlock(block: SignalBlock): Promise<SignalBlob> {
  const json = JSON.stringify({
    v: block.protocolVersion,
    kind: block.kind,
    session: block.sessionId,
    sdp: block.sdp,
  });
  const bytes = new TextEncoder().encode(json);

  if (!compressionAvailable()) {
    return UNCOMPRESSED_MARKER + toBase64Url(bytes);
  }
  return COMPRESSED_MARKER + toBase64Url(await deflateRaw(bytes));
}

/**
 * Unpacks a pasted block. Every whitespace character goes first, which is what makes a block
 * survive an email client that wrapped it across six lines (R-6); base64url has no
 * significant whitespace, so removing all of it cannot damage a well-formed block.
 */
export async function decodeBlock(blob: string): Promise<BlockResult> {
  const stripped = blob.replace(/\s+/g, "");
  if (stripped.length === 0) return failure("empty", "there is nothing pasted here");

  const marker = stripped[0];
  const payload = stripped.slice(1);
  if (marker !== COMPRESSED_MARKER && marker !== UNCOMPRESSED_MARKER) {
    return failure("unknownEncoding", "this does not look like a connection block");
  }
  if (payload.length === 0) return failure("malformed", "the block is empty after its marker");

  const decoded = fromBase64Url(payload);
  if (!decoded) return failure("malformed", "the block is not valid base64url");

  let bytes: Uint8Array | null = decoded;
  if (marker === COMPRESSED_MARKER) {
    if (!compressionAvailable()) {
      return failure(
        "unknownEncoding",
        "this block is compressed and this browser cannot decompress it",
      );
    }
    bytes = await inflateRaw(decoded);
    if (!bytes) return failure("malformed", "the block is incomplete or damaged");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return failure("malformed", "the block does not contain valid data");
  }

  if (!isRecord(parsed)) return failure("malformed", "the block is not an object");
  if (typeof parsed.v !== "number") return failure("malformed", "the block has no version");
  if (parsed.v !== PROTOCOL_VERSION) {
    return failure(
      "versionMismatch",
      `this block was made by version ${parsed.v} and this client speaks ${PROTOCOL_VERSION}`,
    );
  }
  if (parsed.kind !== "offer" && parsed.kind !== "answer") {
    return failure("invalidBlock", "the block does not say whether it is an offer or an answer");
  }
  if (typeof parsed.session !== "string" || parsed.session.length === 0) {
    return failure("invalidBlock", "the block has no session id");
  }
  if (typeof parsed.sdp !== "string" || parsed.sdp.length === 0) {
    return failure("invalidBlock", "the block carries no connection details");
  }

  return {
    ok: true,
    block: {
      protocolVersion: parsed.v,
      kind: parsed.kind,
      sessionId: parsed.session,
      sdp: parsed.sdp,
    },
  };
}
