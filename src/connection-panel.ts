/**
 * The connection screen (tasks 1.3 and 1.5 — DESIGN.md §4.5, R-5, R-6, R-7, R-9, R-56, R-58).
 *
 * Replaces task 1.2's raw-SDP test harness. Everything a player sees here is ordinary
 * language: there is no mention of SDP, ICE, offers, answers, or peers, because R-7 asks for
 * instructions someone can follow without knowing any of that. The words "invitation" and
 * "reply" carry the whole model.
 *
 * It sits beside main.ts rather than in ui/ because it talks to net/, which ui/ may not do.
 * main.ts is the de-facto composition root until a real app/ module exists (issue #31).
 *
 * Connection-status *announcements* are not made here. Task 1.5 routes them through the
 * session into the game's own live region, so that one region speaks for the whole
 * application (R-48, D-27); the status line below is what the same news looks like.
 */

import { createManualSignaler, type ManualSignaler, SignalError } from "./net/manual-signaler.ts";
import { createWebRtcTransport, type WebRtcTransport } from "./net/webrtc-transport.ts";
import type { TransportStatus } from "./protocol/transport.ts";

type Mode = "choosing" | "starting" | "joining";

// R-9 wants a connection failure reported plainly and in bounded time. The transport already
// bounds gathering; this maps what it reports onto something a person can act on, with no
// status name leaking through.
const STATUS_TEXT: Record<TransportStatus, string> = {
  idle: "Not connected yet.",
  connecting: "Connecting…",
  connected: "Connected. You are both in the same game.",
  reconnecting: "The connection dropped. Trying to pick it up again…",
  closed: "The connection is closed.",
  failed:
    "These two networks cannot reach each other directly. This happens on some home and office networks, and often on mobile data. Trying again from a different network is the usual fix.",
};

// `failed` after a connection that worked is a different event from `failed` before one ever
// did, and the transport reports both the same way — so the panel latches the difference for
// itself rather than reading the session, which it does not know about. The session draws the
// same distinction for the announcement (see `ConnectionState`); these two have to agree,
// because they are the same news read and heard.
const LOST_AFTER_CONNECTING =
  "The connection to the other player has gone. They may have closed the game, or their network may have dropped. Starting a new game is the way back.";

/**
 * The banner's short label — the one thing on the page that answers "are we connected?".
 *
 * The phase live test found both players believing they were connected when they were not,
 * because the *step* messages congratulated them for finishing their half of the ritual and
 * nothing on screen contradicted it. Signaling completing is not a connection: it means two
 * blocks were exchanged, and whether a connection follows is the network's business. So this
 * reads from the transport and nothing else, and no other text in this panel is allowed to
 * claim a connection.
 *
 * `waiting` is not a transport status. It is the honest name for the gap the ritual leaves —
 * you have done everything you can and the other person has not finished yet — which the
 * interface previously had no words for at all.
 */
type Banner = "waiting" | TransportStatus;

const BANNER_LABEL: Record<Banner, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  waiting: "Waiting for the other player",
  connected: "Connected",
  reconnecting: "Connection dropped",
  closed: "Disconnected",
  failed: "Could not connect",
};

// The sentence under the label. Only the two states the transport has no opinion about need
// their own wording; everything else reuses STATUS_TEXT, so there is exactly one copy of each
// sentence and no way for a verdict and its explanation to drift apart.
const BANNER_DETAIL: Record<"idle" | "waiting" | "connected", string> = {
  idle: "Start a game or join one below.",
  waiting: "Nothing more to do here until they finish their side.",
  // Not STATUS_TEXT's sentence, which opens with the word the label has just said. This is the
  // one state the whole banner exists to make readable at a glance, and it should not stutter.
  connected: "You are both in the same game. Play away.",
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const node = element("button", "panel__button", text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function labelledTextarea(
  id: string,
  labelText: string,
  readOnly: boolean,
): { field: HTMLDivElement; textarea: HTMLTextAreaElement } {
  const field = element("div", "panel__field");
  const label = element("label", undefined, labelText);
  label.htmlFor = id;

  const textarea = element("textarea");
  textarea.id = id;
  textarea.rows = 4;
  textarea.readOnly = readOnly;
  textarea.spellcheck = false;
  // A block is one unbroken token, so without this the browser will not wrap it at all.
  textarea.style.overflowWrap = "anywhere";

  field.append(label, textarea);
  return { field, textarea };
}

/**
 * `navigator.clipboard` needs a secure context, and R-1's deliverable is a file opened by
 * double-click from a desktop. Rather than bet on whether `file://` qualifies in a given
 * browser, try the write and fall back to selecting the text, which puts the copy one
 * keystroke away instead of behind an error.
 */
async function copyToClipboard(textarea: HTMLTextAreaElement, feedback: HTMLElement) {
  try {
    await navigator.clipboard.writeText(textarea.value);
    feedback.textContent = "Copied.";
  } catch {
    textarea.focus();
    textarea.select();
    feedback.textContent = "Selected — press Ctrl+C (⌘C on a Mac) to copy.";
  }
}

export interface ConnectionPanelOptions {
  /**
   * Called once, with the transport, as soon as one is built — which is on the player's first
   * click, not at page load. The panel owns the connection ritual and nothing else; what the
   * connection is *for* belongs to whoever mounts it (§9, issue #31).
   *
   * Typed as the concrete `WebRtcTransport` rather than `protocol/`'s `Transport` because
   * `onProtocolError` is not one of §4.1's four methods, and the composition root needs it to
   * answer a peer whose messages will not decode (D-26). `game/` cannot: it may not see
   * `net/` at all, which is the module rule working as intended rather than getting in the
   * way — see D-26 for why that is a signpost rather than a problem.
   */
  readonly onTransport?: (transport: WebRtcTransport) => void;
}

export function mountConnectionPanel(
  root: HTMLElement,
  options: ConnectionPanelOptions = {},
): void {
  let mode: Mode = "choosing";
  let invitation: string | null = null;
  let reply: string | null = null;
  let pasted = "";
  // The handshake happens once. Every control that drives it has to disappear the moment its
  // step is done, because a second press does not repeat the step — it renegotiates a live
  // connection, which either throws in the browser's own vocabulary or quietly replaces a
  // block the other person may already be holding.
  let exchanged = false;
  let busy = false;
  let signaler: ManualSignaler | null = null;
  // The transport whose news the status line is currently showing. A failed start abandons one
  // and builds another, and the abandoned one stays alive long enough to have opinions.
  let live: WebRtcTransport | null = null;

  let transportStatus: TransportStatus = "idle";
  let everConnected = false;

  const section = element("section", "panel");
  section.append(element("h2", undefined, "Play with a friend"));

  // The banner. Deliberately the first thing in the panel and identical on both devices,
  // because "am I connected?" is the question the ritual leaves people holding and the live
  // test found both of them guessing at it.
  //
  // No `role="status"`: the session announces connection changes into the game's one live
  // region (D-27), and a second announcing element here would say everything twice.
  const banner = element("div", "banner");
  const bannerLabel = element("strong", "banner__label");
  const bannerDetail = element("span", "banner__detail");
  banner.append(bannerLabel, bannerDetail);
  section.append(banner);

  // R-56 and R-58, stated before anything connects rather than after — which is the whole
  // point of both, since neither is something a player can act on once the connection exists.
  //
  // Written as three short paragraphs rather than one dense one: this is the only part of the
  // application a player is asked to read *before* deciding to do something, so it has to
  // survive being skimmed. The comparison to a video call is doing the real work — "your
  // network address" means little on its own, and most people have already accepted exactly
  // this trade for exactly this reason.
  const privacy = element("div", "panel__privacy");
  privacy.append(
    element(
      "p",
      "panel__note",
      "This connects your browser straight to your friend's, with nothing in between. There is no server of ours in the middle, because there isn't one at all — nothing you do here is sent to us, stored by us, or seen by us.",
    ),
    element(
      "p",
      "panel__note",
      "The trade for that is that a direct connection needs each of you to know where the other is on the internet. So the invitation and reply you exchange contain your network addresses, and each of you can see the other's — roughly what a video call between you would reveal. Send them to someone you would be happy to make a video call to, and treat them as you would a phone number.",
    ),
    element(
      "p",
      "panel__note",
      "This game also trusts whoever you connect to. Each side checks that every move it receives is a legal one, but nothing stops someone running a modified copy of the game from finding some other way to cheat. It is built for playing with a friend, and that is the only thing it is safe to assume.",
    ),
  );
  section.append(privacy);

  const error = element("p", "panel__error");
  error.setAttribute("role", "alert");

  const steps = element("div");
  section.append(error, steps);

  function showError(message: string): void {
    error.textContent = message;
  }

  // `failed` after a connection that worked means something different from `failed` before one
  // ever did, and the transport reports both the same way.
  function statusSentence(next: TransportStatus): string {
    return next === "failed" && everConnected ? LOST_AFTER_CONNECTING : STATUS_TEXT[next];
  }

  /**
   * What the banner should say, which is not always what the transport is doing.
   *
   * The transport only knows about the network. It has no idea that the ritual has a gap in
   * the middle where the player has finished their half and is waiting on a human — and that
   * gap, reported as a bare "Connecting…", is what the live test found people reading as
   * success. Anything the transport has an opinion about wins; `waiting` fills the silence.
   */
  function currentBanner(): Banner {
    if (transportStatus !== "idle" && transportStatus !== "connecting") return transportStatus;

    // The creator has an invitation out and no reply back yet; the joiner has a reply ready
    // that the creator has not pasted. Both mean: your part is done, theirs is not.
    const waitingOnThem =
      (mode === "starting" && invitation !== null && !exchanged) ||
      (mode === "joining" && reply !== null);

    if (waitingOnThem) return "waiting";
    return transportStatus;
  }

  function renderBanner(): void {
    const state = currentBanner();
    bannerLabel.textContent = BANNER_LABEL[state];
    bannerDetail.textContent =
      state === "waiting" || state === "idle" || state === "connected"
        ? BANNER_DETAIL[state]
        : statusSentence(transportStatus);
    banner.dataset.state = state;
  }

  // A SignalError already carries a sentence written for the person reading it. Anything else
  // is a browser or network fault for which we have no better words than its own.
  function report(caught: unknown): void {
    if (caught instanceof SignalError) {
      showError(caught.message);
    } else if (caught instanceof Error) {
      showError(`Something went wrong: ${caught.message}`);
    } else {
      showError("Something went wrong.");
    }
  }

  // Built on first use rather than at page load: constructing the peer connection is what
  // begins contacting the STUN server, and a visitor who never clicks anything should not
  // reach out to a third party at all.
  function ensureSignaler(): ManualSignaler {
    if (signaler) return signaler;

    const transport = createWebRtcTransport();
    live = transport;
    everConnected = false;
    transport.onStatus((next: TransportStatus) => {
      // A transport that has been abandoned keeps its subscription and its peer connection,
      // and will still report its own eventual timeout. Letting that reach the banner would
      // overwrite the attempt the player is actually watching, with news about one they have
      // already left behind.
      if (transport !== live) return;
      const arrived = next === "connected" && transportStatus !== "connected";
      if (next === "connected") everConnected = true;
      transportStatus = next;

      // A full re-render only when the connection actually arrives, because that is the one
      // status change that alters the step text as well as the banner. Rebuilding `steps` on
      // every status change would be a needless second caller on the render path — the family
      // of bug N-6 records — and a pasted-but-unsubmitted block survives it only because
      // `pasted` is held outside the DOM.
      if (arrived) {
        render();
      } else {
        renderBanner();
      }
    });
    // Game messages are not this panel's business — the session subscribes to the same
    // transport and moves the board (task 1.4). The panel reports the *connection*, and
    // overwriting the status on every arriving move would only fight with it.
    transport.onProtocolError((failure) => {
      showError(`Something arrived that this game could not read (${failure.code}).`);
    });

    options.onTransport?.(transport);
    signaler = createManualSignaler(transport);
    return signaler;
  }

  function blockField(id: string, labelText: string, value: string): HTMLDivElement {
    const { field, textarea } = labelledTextarea(id, labelText, true);
    textarea.value = value;

    const feedback = element("span", "panel__feedback");
    feedback.setAttribute("role", "status");

    const copy = button("Copy", () => {
      void copyToClipboard(textarea, feedback);
    });
    // Marks where focus belongs after a block appears: a rebuild drops focus entirely, and
    // the next thing to do is always to copy the block that just arrived.
    copy.dataset.focus = "block";

    const controls = element("div", "panel__controls");
    controls.append(copy, feedback);

    // The measurement task 1.3's acceptance asks for, taken every time anyone connects rather
    // than once into a session log: §4.5 predicted roughly a thousand characters, and this is
    // the thing that says whether that held.
    field.append(controls, element("p", "panel__note", `${value.length} characters long.`));
    return field;
  }

  // `render` rebuilds everything under `steps`, which would otherwise throw away whatever the
  // player had pasted the moment anything else changed. The text lives out here instead and
  // the field is restored from it — the same discipline the board needed for focus.
  function pasteField(
    id: string,
    labelText: string,
    actionText: string,
    onSubmit: (blob: string) => void,
  ): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const { field, textarea } = labelledTextarea(id, labelText, false);
    textarea.value = pasted;
    textarea.addEventListener("input", () => {
      pasted = textarea.value;
    });

    const controls = element("div", "panel__controls");
    controls.append(
      button(actionText, () => {
        onSubmit(textarea.value);
      }),
    );
    fragment.append(field, controls);
    return fragment;
  }

  function renderChoosing(): void {
    const controls = element("div", "panel__controls");
    controls.append(
      button("Start a game", () => {
        void start();
      }),
      button("Join a game", () => {
        mode = "joining";
        showError("");
        render();
      }),
    );
    steps.append(
      element(
        "p",
        undefined,
        "One of you starts the game and sends an invitation; the other joins with it. It does not matter which of you does which.",
      ),
      controls,
    );
  }

  function renderStarting(): void {
    steps.append(
      element("h3", undefined, "Step 1 — send this invitation"),
      element(
        "p",
        undefined,
        "Copy the text below and send it to your friend however you normally talk — a message, an email, anything. It does not matter if it gets wrapped or broken across lines on the way.",
      ),
    );

    if (invitation === null) {
      steps.append(element("p", undefined, "Preparing your invitation…"));
      return;
    }

    steps.append(
      blockField("signal-out", "Your invitation", invitation),
      element("h3", undefined, "Step 2 — paste their reply"),
    );

    // Says what happened, not what it means. Whether a connection followed is the banner's to
    // report, and this claiming it was how the live test's players came away certain they were
    // connected when nothing had connected at all.
    if (exchanged) {
      steps.append(element("p", undefined, "Their reply has been accepted."));
      return;
    }

    steps.append(
      element(
        "p",
        undefined,
        "When a reply comes back, paste it into the box below and press Connect.",
      ),
      pasteField("signal-in", "Their reply", "Connect", (blob) => {
        void connect(blob);
      }),
    );
  }

  function renderJoining(): void {
    steps.append(element("h3", undefined, "Step 1 — paste the invitation"));

    if (reply === null) {
      steps.append(
        element("p", undefined, "Paste the invitation your friend sent you into the box below."),
        pasteField("signal-in", "Their invitation", "Continue", (blob) => {
          void join(blob);
        }),
      );
      return;
    }

    // Their part of step 1 is over. The box and its button go, rather than staying live to be
    // pressed again against a connection that has already been negotiated.
    //
    // "The invitation was accepted" used to sit here on its own and read, to the person holding
    // the phone in the live test, as "connected" — which is why step 2 is now stated as the
    // thing still outstanding rather than as a footnote to a completed step.
    // Once the connection exists, the instruction that got you here has to stop insisting you
    // are not connected yet — the banner would be contradicted by the paragraph beneath it.
    const connected = transportStatus === "connected";

    steps.append(
      element(
        "p",
        undefined,
        connected ? "The invitation was accepted." : "The invitation was accepted. One step left.",
      ),
      element("h3", undefined, "Step 2 — send this reply back"),
      element(
        "p",
        undefined,
        connected
          ? "Your reply got through, which is how you are connected. Nothing else to do."
          : "Copy this and send it back to whoever invited you. You are not connected until they paste it in and press Connect — the banner above will say so when it happens.",
      ),
      blockField("signal-out", "Your reply", reply),
    );
  }

  function render(): void {
    steps.replaceChildren();
    if (mode === "choosing") {
      renderChoosing();
    } else if (mode === "starting") {
      renderStarting();
    } else {
      renderJoining();
    }
    // The banner reads from the same progress these branches do, so it is refreshed with them
    // rather than only when the transport speaks — `waiting` is a fact about the ritual, and
    // the transport has nothing to say at the moment it becomes true.
    renderBanner();
  }

  // Rebuilding destroys whatever had focus, so it has to be put back deliberately. Called
  // only when a block has just appeared, since that is the one moment focus should move on
  // its own rather than staying where the player left it.
  function renderAndFocusBlock(): void {
    render();
    steps.querySelector<HTMLButtonElement>('[data-focus="block"]')?.focus();
  }

  // A signaling step takes a network round trip, during which its button is still on screen
  // and still pressable. Without this, a second press runs the step concurrently against the
  // same connection rather than being ignored.
  async function step(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    showError("");
    try {
      await action();
    } catch (caught) {
      report(caught);
    } finally {
      busy = false;
    }
  }

  function start(): Promise<void> {
    return step(async () => {
      mode = "starting";
      invitation = null;
      pasted = "";
      render();
      try {
        invitation = await ensureSignaler().createOffer();
      } catch (caught) {
        // Back to the choice, so there is something to press. The peer connection is left in
        // whatever state it failed in, so the signaler goes with it and a retry builds a
        // fresh one rather than asking the broken one again — and the abandoned one is closed
        // rather than left holding a peer connection and a STUN conversation nobody is
        // listening to any more.
        live?.close();
        live = null;
        // The banner describes the attempt in front of the player, and there is no longer one.
        // Without this reset it keeps reporting the abandoned transport's last state — reading
        // "Disconnected" above two buttons offering to start a game.
        transportStatus = "idle";
        everConnected = false;
        signaler = null;
        mode = "choosing";
        render();
        throw caught;
      }
      renderAndFocusBlock();
    });
  }

  function join(blob: string): Promise<void> {
    return step(async () => {
      reply = await ensureSignaler().acceptOffer(blob);
      renderAndFocusBlock();
    });
  }

  function connect(blob: string): Promise<void> {
    return step(async () => {
      await ensureSignaler().acceptAnswer(blob);
      exchanged = true;
      render();
    });
  }

  render();
  root.append(section);
}
