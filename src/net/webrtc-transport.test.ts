import { describe, expect, it } from "vitest";
import type { TransportStatus } from "../protocol/transport.ts";
import { createCodec } from "./codec.ts";
import { createWebRtcTransport } from "./webrtc-transport.ts";

/*
 * `RTCPeerConnection` does not exist outside a browser, and this project adds no dependency
 * to simulate one, so the transport takes a connection factory and these tests drive a fake
 * through it. The fake is deliberately dumb: it records what it was asked to do and lets a
 * test move it between states by hand, which is what makes the non-trickle wait and the
 * status mapping checkable at all.
 */

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = { type }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeDataChannel extends FakeEventTarget {
  readyState: RTCDataChannelState = "connecting";
  readonly sent: string[] = [];
  closeCalls = 0;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = "closed";
    this.emit("close");
  }

  open(): void {
    this.readyState = "open";
    this.emit("open");
  }

  receive(data: unknown): void {
    this.emit("message", { data });
  }
}

class FakePeerConnection extends FakeEventTarget {
  connectionState: RTCPeerConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  readonly createdChannels: FakeDataChannel[] = [];
  closeCalls = 0;
  // How many channels existed when the offer was generated — the offer's SDP can only
  // describe a data channel that already exists, so the order is load-bearing.
  channelsWhenOfferCreated = -1;

  createDataChannel(_label: string): FakeDataChannel {
    const channel = new FakeDataChannel();
    this.createdChannels.push(channel);
    return channel;
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    this.channelsWhenOfferCreated = this.createdChannels.length;
    return Promise.resolve({ type: "offer", sdp: "offer-sdp" });
  }

  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "answer", sdp: "answer-sdp" });
  }

  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    // A real implementation begins gathering here, and localDescription grows the gathered
    // candidates as it goes; the suffix stands in for them.
    this.localDescription = { type: description.type, sdp: `${description.sdp}+candidates` };
    this.iceGatheringState = "gathering";
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    return Promise.resolve();
  }

  close(): void {
    this.closeCalls += 1;
    this.connectionState = "closed";
  }

  completeGathering(): void {
    this.iceGatheringState = "complete";
    this.emit("icegatheringstatechange");
  }

  moveTo(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.emit("connectionstatechange");
  }
}

function asPeerConnection(fake: FakePeerConnection): RTCPeerConnection {
  return fake as unknown as RTCPeerConnection;
}

// The connection timeout defaults far beyond any test's lifetime, so only the tests that are
// about it (R-9) ever see it fire.
function transportOver(
  fake: FakePeerConnection,
  gatheringTimeoutMs = 5000,
  connectionTimeoutMs = 60_000,
  dropTimeoutMs = 60_000,
) {
  return createWebRtcTransport({
    gatheringTimeoutMs,
    connectionTimeoutMs,
    dropTimeoutMs,
    createPeerConnection: () => asPeerConnection(fake),
  });
}

// Lets pending microtasks and zero-delay timers run, so a promise that should still be
// pending has had every chance to settle before the assertion says it has not.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function onlyChannel(fake: FakePeerConnection): FakeDataChannel {
  const channel = fake.createdChannels[0];
  if (!channel) throw new Error("no data channel was created");
  return channel;
}

async function connectedTransport() {
  const fake = new FakePeerConnection();
  const transport = transportOver(fake, 0);
  await transport.createOffer();
  const channel = onlyChannel(fake);
  channel.open();
  return { fake, transport, channel };
}

describe("the offer side", () => {
  it("creates the data channel before generating the offer", async () => {
    const fake = new FakePeerConnection();
    await transportOver(fake, 0).createOffer();
    expect(fake.channelsWhenOfferCreated).toBe(1);
  });

  it("does not resolve until ICE gathering completes", async () => {
    const fake = new FakePeerConnection();
    let settled = false;
    const pending = transportOver(fake).createOffer();
    void pending.then(() => {
      settled = true;
    });

    await tick();
    expect(settled).toBe(false);
    expect(fake.iceGatheringState).toBe("gathering");

    fake.completeGathering();
    await pending;
    expect(settled).toBe(true);
  });

  it("returns the gathered local description, not the bare offer", async () => {
    const fake = new FakePeerConnection();
    const description = await transportOver(fake, 0).createOffer();
    expect(description.sdp).toBe("offer-sdp+candidates");
  });

  it("gives up waiting when the gathering timer expires, rather than hanging", async () => {
    const fake = new FakePeerConnection();
    // Never completes gathering; only the bounded timer (§4.5, R-9) can resolve this.
    const description = await transportOver(fake, 0).createOffer();
    expect(fake.iceGatheringState).toBe("gathering");
    expect(description.sdp).toBe("offer-sdp+candidates");
  });
});

describe("the answer side", () => {
  it("takes the remote offer, answers it, and waits for gathering", async () => {
    const fake = new FakePeerConnection();
    const offer = { type: "offer" as const, sdp: "their-offer" };
    const answer = await transportOver(fake, 0).acceptOffer(offer);

    expect(fake.remoteDescription).toEqual(offer);
    expect(answer.sdp).toBe("answer-sdp+candidates");
  });

  it("creates no data channel of its own — it receives the caller's", async () => {
    const fake = new FakePeerConnection();
    await transportOver(fake, 0).acceptOffer({ type: "offer", sdp: "their-offer" });
    expect(fake.createdChannels).toHaveLength(0);
  });

  it("accepts the answer by setting it as the remote description", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.createOffer();
    await transport.acceptAnswer({ type: "answer", sdp: "their-answer" });
    expect(fake.remoteDescription).toEqual({ type: "answer", sdp: "their-answer" });
  });
});

describe("status", () => {
  it("gives a new subscriber the current status immediately", () => {
    const seen: TransportStatus[] = [];
    transportOver(new FakePeerConnection()).onStatus((status) => seen.push(status));
    expect(seen).toEqual(["idle"]);
  });

  it.each([
    ["connecting", "connecting"],
    ["connected", "connected"],
    ["disconnected", "reconnecting"],
    ["failed", "failed"],
    ["closed", "closed"],
  ] as const)("maps connection state %s onto transport status %s", async (state, expected) => {
    const { fake, transport } = await connectedTransport();
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo(state);
    expect(seen.at(-1)).toBe(expected);
  });

  it("reports connecting, not connected, while the data channel is still opening", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.createOffer();

    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));
    fake.moveTo("connected");
    expect(seen.at(-1)).toBe("connecting");

    onlyChannel(fake).open();
    expect(seen.at(-1)).toBe("connected");
  });

  it("does not repeat a status that has not changed", async () => {
    const { fake, transport } = await connectedTransport();
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo("connected");
    fake.moveTo("connected");
    expect(seen).toEqual(["idle", "connected"]);
  });

  it("stops delivering after unsubscribe", async () => {
    const { fake, transport } = await connectedTransport();
    const seen: TransportStatus[] = [];
    const unsubscribe = transport.onStatus((status) => seen.push(status));

    unsubscribe();
    fake.moveTo("failed");
    expect(seen).toEqual(["idle"]);
  });
});

describe("sending", () => {
  it("encodes through the codec and writes to the data channel", async () => {
    const { transport, channel } = await connectedTransport();
    transport.send({ type: "resign" });

    expect(channel.sent).toHaveLength(1);
    const [text] = channel.sent;
    expect(JSON.parse(text ?? "{}")).toMatchObject({ seq: 1, body: { type: "resign" } });
  });

  it("refuses to send before the channel is open, rather than dropping the message", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.createOffer();
    expect(() => transport.send({ type: "resign" })).toThrow(/not open/);
  });
});

describe("receiving", () => {
  it("decodes an inbound message and hands it to subscribers", async () => {
    const { transport, channel } = await connectedTransport();
    const received: unknown[] = [];
    transport.onMessage((message) => received.push(message.body));

    channel.receive(createCodec().encode({ type: "drawOffer" }));
    expect(received).toEqual([{ type: "drawOffer" }]);
  });

  it("reports a message that does not decode instead of delivering or dropping it", async () => {
    const { transport, channel } = await connectedTransport();
    const received: unknown[] = [];
    const failures: unknown[] = [];
    transport.onMessage((message) => received.push(message));
    transport.onProtocolError((failure) => failures.push(failure));

    channel.receive("not json at all");

    expect(received).toEqual([]);
    expect(failures).toEqual([{ code: "malformed", detail: "not valid JSON" }]);
  });

  it("reports a non-text frame rather than assuming it is a string", async () => {
    const { transport, channel } = await connectedTransport();
    const failures: unknown[] = [];
    transport.onProtocolError((failure) => failures.push(failure));

    channel.receive(new ArrayBuffer(8));
    expect(failures).toEqual([{ code: "malformed", detail: "expected a text frame" }]);
  });

  it("delivers to a channel that arrived through the datachannel event", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0);
    await transport.acceptOffer({ type: "offer", sdp: "their-offer" });

    const joinersChannel = new FakeDataChannel();
    fake.emit("datachannel", { channel: joinersChannel });
    joinersChannel.open();

    const received: unknown[] = [];
    transport.onMessage((message) => received.push(message.body));
    joinersChannel.receive(createCodec().encode({ type: "resign" }));

    expect(received).toEqual([{ type: "resign" }]);
  });

  it("stops delivering after unsubscribe", async () => {
    const { transport, channel } = await connectedTransport();
    const received: unknown[] = [];
    const unsubscribe = transport.onMessage((message) => received.push(message));

    unsubscribe();
    channel.receive(createCodec().encode({ type: "resign" }));
    expect(received).toEqual([]);
  });
});

describe("closing", () => {
  it("closes both the channel and the peer connection, and reports it", async () => {
    const { fake, transport, channel } = await connectedTransport();
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    transport.close();

    expect(channel.closeCalls).toBe(1);
    expect(fake.closeCalls).toBe(1);
    expect(seen.at(-1)).toBe("closed");
  });

  it("is safe to call twice", async () => {
    const { fake, transport } = await connectedTransport();
    transport.close();
    transport.close();
    expect(fake.closeCalls).toBe(1);
  });
});

/*
 * R-9, and the reason this was reopened: bounding ICE *gathering* was never the same as
 * bounding the connection attempt. The phase live test connected a home network to a phone on
 * mobile data, exchanged both blocks successfully, and then sat in `connecting` indefinitely —
 * `connectionState` never reached `failed`, so nothing ever told the players it was over.
 */
describe("bounding the connection attempt (R-9)", () => {
  it("reports failure itself when the peer connection never gets anywhere", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    await transport.createOffer();
    fake.moveTo("connecting");
    // The creator's clock starts when the answer lands: before that the wait is for a person
    // to send a message, which is not the network's fault and must not be timed.
    await transport.acceptAnswer({ type: "answer", sdp: "answer-sdp" });

    expect(seen).not.toContain("failed");

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(seen).toContain("failed");
    // Reported without the peer connection ever agreeing, which is the whole point: nothing in
    // this test ever moved the fake to `failed`, so the verdict is the transport's own. What
    // did change its state is the transport closing it, which is what makes the verdict true.
    expect(fake.closeCalls).toBe(1);
  });

  it("does not time out a connection that arrives", async () => {
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    await transport.createOffer();
    await transport.acceptAnswer({ type: "answer", sdp: "answer-sdp" });
    fake.moveTo("connected");
    onlyChannel(fake).open();

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(seen).toContain("connected");
    expect(seen).not.toContain("failed");
  });

  it("starts the joiner's clock when it accepts the offer", async () => {
    // The joiner has everything it needs from the other side at that point, so it is the
    // equivalent moment to the creator applying the answer.
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    await transport.acceptOffer({ type: "offer", sdp: "offer-sdp" });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(seen).toContain("failed");
  });

  it("does not run a clock over the wait for a person", async () => {
    // A creator whose invitation is sitting in an unsent email is not a failing connection,
    // and timing that out would fail people for taking a minute to paste something.
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    await transport.createOffer();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(seen).not.toContain("failed");
  });

  it("tears the connection down rather than only relabelling it", async () => {
    // Found by code review. Reporting `failed` while leaving the peer connection running let a
    // connection that completed after the deadline open its channel and carry real moves —
    // `send` gates on the channel, not on the status — so the players would have been told it
    // failed while a live game ran underneath them.
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 20);

    await transport.createOffer();
    const channel = onlyChannel(fake);
    await transport.acceptAnswer({ type: "answer", sdp: "answer-sdp" });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(fake.closeCalls).toBe(1);
    expect(channel.closeCalls).toBe(1);
  });

  it("stays failed once it has given up, whatever the peer connection says later", async () => {
    // The player has already been told the attempt is over and sent off to try another
    // network. A late `connected` underneath them would be worse than the failure.
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    await transport.createOffer();
    await transport.acceptAnswer({ type: "answer", sdp: "answer-sdp" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(seen).toContain("failed");

    fake.moveTo("connected");
    onlyChannel(fake).open();

    expect(seen).not.toContain("connected");
    // And nothing can be sent down it, which is what "failed" has to mean.
    expect(() => transport.send({ type: "error", code: "illegalMove", detail: "x" })).toThrow();
  });
});

/*
 * Issue #42. The bound above stops the moment a connection arrives, so a connection that
 * formed and later dropped had nothing timing it at all — and if the browser never moves from
 * `disconnected` to `failed`, "trying to pick it up again…" stays on screen forever.
 *
 * The issue's own warning shapes these tests as much as the fix does: a timer that gives up on
 * a connection the browser was about to recover would be a regression, not a fix. So the
 * recovery case is tested as carefully as the failure case.
 */
describe("bounding a dropped connection (R-9, #42)", () => {
  async function connectedWith(fake: FakePeerConnection, dropTimeoutMs: number) {
    const transport = transportOver(fake, 0, 60_000, dropTimeoutMs);
    await transport.createOffer();
    await transport.acceptAnswer({ type: "answer", sdp: "answer-sdp" });
    fake.moveTo("connected");
    onlyChannel(fake).open();
    return transport;
  }

  it("reports failure itself when a dropped connection never comes back", async () => {
    const fake = new FakePeerConnection();
    const transport = await connectedWith(fake, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo("disconnected");
    expect(seen).toContain("reconnecting");
    expect(seen).not.toContain("failed");

    await new Promise((resolve) => setTimeout(resolve, 40));

    // Nothing in this test ever moved the fake to `failed`, so the verdict is the transport's
    // own — and the teardown is what makes it true rather than merely a label.
    expect(seen).toContain("failed");
    expect(fake.closeCalls).toBe(1);
  });

  it("does not give up on a connection that comes back", async () => {
    const fake = new FakePeerConnection();
    const transport = await connectedWith(fake, 100);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo("disconnected");
    await new Promise((resolve) => setTimeout(resolve, 20));
    fake.moveTo("connected");

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(seen).toContain("reconnecting");
    expect(seen.at(-1)).toBe("connected");
    expect(seen).not.toContain("failed");
    expect(fake.closeCalls).toBe(0);
  });

  it("does not let a drop replace the initial attempt's shorter clock", async () => {
    // A connection can report `disconnected` before it has ever succeeded. The drop bound is
    // the longer of the two deliberately, so letting it take over here would *extend* the
    // attempt the live test proved needs bounding.
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 20, 5000);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    await transport.createOffer();
    await transport.acceptAnswer({ type: "answer", sdp: "answer-sdp" });
    fake.moveTo("disconnected");

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(seen).toContain("failed");
  });

  it("stops timing a dropped connection once the transport is closed", async () => {
    const fake = new FakePeerConnection();
    const transport = await connectedWith(fake, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo("disconnected");
    transport.close();

    await new Promise((resolve) => setTimeout(resolve, 40));

    // A timer surviving close would tear down a second time and overwrite the status of
    // whatever replaced this transport — the abandoned-transport bug task 1.5's review found.
    expect(seen.at(-1)).toBe("closed");
    expect(fake.closeCalls).toBe(1);
  });
  it("stops timing once the browser reports the failure itself", async () => {
    // The routine path, not an edge case: a browser usually concludes a dropped connection
    // within thirty to forty seconds, well inside the bound. A clock left running would then
    // fire on a connection already given up on, tear it down a second time, and publish over
    // the top of that verdict.
    const fake = new FakePeerConnection();
    const transport = await connectedWith(fake, 40);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    fake.moveTo("disconnected");
    fake.moveTo("failed");
    expect(fake.closeCalls).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(seen.at(-1)).toBe("failed");
    expect(fake.closeCalls).toBe(0);
  });

  it("does not start a drop clock over the wait for a person", async () => {
    // `reconnecting` before anything ever connected is not a drop. Starting a clock here would
    // time the wait for someone to paste a block, which is deliberately untimed.
    const fake = new FakePeerConnection();
    const transport = transportOver(fake, 0, 60_000, 20);
    const seen: TransportStatus[] = [];
    transport.onStatus((status) => seen.push(status));

    await transport.createOffer();
    fake.moveTo("disconnected");

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(seen).not.toContain("failed");
    expect(fake.closeCalls).toBe(0);
  });
});
