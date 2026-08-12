import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "../protocol/messages.ts";
import { createSessionId, decodeBlock, encodeBlock, type SignalBlock } from "./signal-block.ts";

/*
 * A block's whole job is to survive being carried by a person through a channel nobody
 * controls, so most of what is worth testing here is damage: whitespace injected by an email
 * client, a half-selected copy, a block from the wrong conversation. The happy path is one
 * test; the rest is the channel misbehaving.
 */

// A stand-in for a gathered SDP. Length and repetition matter more than realism: the block
// is compressed, and SDP is repetitive text, which is why compression pays at all.
const SAMPLE_SDP = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=candidate:1 1 udp 2113937151 192.168.1.20 54321 typ host generation 0",
  "a=candidate:2 1 udp 1677729535 203.0.113.7 54321 typ srflx raddr 192.168.1.20 rport 54321",
  "a=ice-ufrag:aB3x",
  "a=ice-pwd:0123456789abcdef0123456789",
  "a=fingerprint:sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B",
  "a=setup:actpass",
  "a=sctp-port:5000",
].join("\r\n");

function sampleBlock(overrides: Partial<SignalBlock> = {}): SignalBlock {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: "offer",
    sessionId: "0123456789abcdef",
    sdp: SAMPLE_SDP,
    ...overrides,
  };
}

async function decoded(blob: string) {
  const result = await decodeBlock(blob);
  if (!result.ok)
    throw new Error(`expected a decodable block, got ${result.code}: ${result.detail}`);
  return result.block;
}

async function failureOf(blob: string) {
  const result = await decodeBlock(blob);
  if (result.ok) throw new Error("expected the block to be rejected");
  return result;
}

describe("a well-formed block", () => {
  it("round trips every field", async () => {
    const block = sampleBlock();
    expect(await decoded(await encodeBlock(block))).toEqual(block);
  });

  it("round trips an answer as readily as an offer", async () => {
    const block = sampleBlock({ kind: "answer" });
    expect(await decoded(await encodeBlock(block))).toEqual(block);
  });

  it("carries no characters outside the base64url alphabet", async () => {
    // The point of base64url over base64: no `+`, `/`, or `=` for a channel to escape, wrap
    // on, or treat as the end of a link.
    expect(await encodeBlock(sampleBlock())).toMatch(/^[CU][A-Za-z0-9_-]+$/);
  });

  it("compresses, where the environment allows it", async () => {
    const blob = await encodeBlock(sampleBlock());
    expect(blob[0]).toBe("C");
    // Measured against the same envelope encoded without compression, which is the only
    // comparison that isolates what compression did. Comparing against the raw SDP would
    // not: base64 costs a third on top of whatever it encodes, so on a short sample that
    // overhead can exceed deflate's saving even though deflate worked perfectly well.
    expect(blob.length).toBeLessThan(uncompressed(envelopeJson(sampleBlock())).length);
  });

  it("saves more on a realistic gathered sdp than on a short one", async () => {
    // The blocks people actually paste are a few kilobytes of highly repetitive candidate
    // lines, which is the case compression is chosen for (§4.5). The ratio should improve
    // with size; if it ever stops doing so, the encoding is not doing its job.
    const long = sampleBlock({ sdp: Array.from({ length: 12 }, () => SAMPLE_SDP).join("\r\n") });
    const shortRatio =
      (await encodeBlock(sampleBlock())).length / uncompressed(envelopeJson(sampleBlock())).length;
    const longRatio = (await encodeBlock(long)).length / uncompressed(envelopeJson(long)).length;
    expect(longRatio).toBeLessThan(shortRatio);
  });
});

describe("a block carried through a channel that alters it", () => {
  it("survives being wrapped across lines", async () => {
    const blob = await encodeBlock(sampleBlock());
    const wrapped = (blob.match(/.{1,40}/g) ?? []).join("\r\n");
    expect(await decoded(wrapped)).toEqual(sampleBlock());
  });

  it("survives leading and trailing whitespace from a sloppy selection", async () => {
    const blob = await encodeBlock(sampleBlock());
    expect(await decoded(`\n\n   ${blob}  \t\n`)).toEqual(sampleBlock());
  });

  it("survives spaces injected mid-block", async () => {
    const blob = await encodeBlock(sampleBlock());
    const spaced = blob.split("").join(" ");
    expect(await decoded(spaced)).toEqual(sampleBlock());
  });
});

describe("a block that cannot be trusted", () => {
  it("reports an empty paste as empty rather than malformed", async () => {
    expect((await failureOf("   \n  ")).code).toBe("empty");
  });

  it("rejects text that is not a block at all", async () => {
    expect((await failureOf("hello, want to play checkers?")).code).toBe("unknownEncoding");
  });

  it("rejects a marker with nothing after it", async () => {
    expect((await failureOf("C")).code).toBe("malformed");
  });

  it("rejects a half-copied block", async () => {
    const blob = await encodeBlock(sampleBlock());
    const truncated = blob.slice(0, Math.floor(blob.length / 2));
    expect((await failureOf(truncated)).code).toBe("malformed");
  });

  it("rejects a block whose payload is not base64url", async () => {
    expect((await failureOf("C!!!!not base64!!!!")).code).toBe("malformed");
  });

  it("rejects a block from a future protocol version", async () => {
    const json = JSON.stringify({
      v: PROTOCOL_VERSION + 1,
      kind: "offer",
      session: "abc",
      sdp: SAMPLE_SDP,
    });
    expect((await failureOf(uncompressed(json))).code).toBe("versionMismatch");
  });

  it("rejects a block that does not say what it is", async () => {
    const json = JSON.stringify({ v: PROTOCOL_VERSION, session: "abc", sdp: SAMPLE_SDP });
    expect((await failureOf(uncompressed(json))).code).toBe("invalidBlock");
  });

  it("rejects a block with no session id", async () => {
    const json = JSON.stringify({ v: PROTOCOL_VERSION, kind: "offer", sdp: SAMPLE_SDP });
    expect((await failureOf(uncompressed(json))).code).toBe("invalidBlock");
  });

  it("rejects a block with an empty sdp", async () => {
    const json = JSON.stringify({ v: PROTOCOL_VERSION, kind: "offer", session: "abc", sdp: "" });
    expect((await failureOf(uncompressed(json))).code).toBe("invalidBlock");
  });

  it("rejects valid base64url that is not JSON", async () => {
    expect((await failureOf(uncompressed("not json at all"))).code).toBe("malformed");
  });
});

describe("the uncompressed fallback", () => {
  it("decodes a block marked uncompressed", async () => {
    expect(await decoded(uncompressed(envelopeJson(sampleBlock())))).toEqual(sampleBlock());
  });
});

describe("session ids", () => {
  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 200 }, () => createSessionId()));
    expect(ids.size).toBe(200);
  });

  it("is safe to put in a JSON envelope", () => {
    expect(createSessionId()).toMatch(/^[0-9a-f]{16}$/);
  });
});

function envelopeJson(block: SignalBlock): string {
  return JSON.stringify({
    v: block.protocolVersion,
    kind: block.kind,
    session: block.sessionId,
    sdp: block.sdp,
  });
}

// Builds the uncompressed form by hand, which is how these tests reach the fallback path and
// the malformed-envelope cases without a compressor in the way.
function uncompressed(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `U${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}
