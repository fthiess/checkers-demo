/**
 * Temporary connection panel (task 1.2).
 *
 * This exists to make the transport's acceptance criterion demonstrable by a person: two
 * tabs establishing a data channel, with status transitions visible as they happen. It
 * exchanges **raw SDP JSON** through two textareas. Task 1.3 replaces all of it with the
 * real signaling interface — compressed, base64url-encoded blocks with copy controls and
 * whitespace-tolerant paste (R-5, R-6) — so nothing here is meant to survive.
 *
 * It sits beside main.ts rather than in ui/ because it talks to net/, which ui/ may not do.
 * main.ts is the de-facto composition root until a real app/ module exists.
 */

import {
  createWebRtcTransport,
  type ProtocolFailure,
  type WebRtcTransport,
} from "./net/webrtc-transport.ts";
import type { InboundMessage } from "./protocol/messages.ts";
import type { TransportStatus } from "./protocol/transport.ts";

interface PanelElements {
  readonly status: HTMLElement;
  readonly outgoing: HTMLTextAreaElement;
  readonly incoming: HTMLTextAreaElement;
  readonly log: HTMLElement;
}

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

  field.append(label, textarea);
  return { field, textarea };
}

export function mountConnectionPanel(root: HTMLElement): void {
  const section = element("section", "panel");
  section.append(element("h2", undefined, "Connection (temporary)"));
  section.append(
    element(
      "p",
      "panel__note",
      "Connecting directly to another browser reveals your network address to whoever is on the other end. A fuller explanation of this arrives with the real connection screen (R-56).",
    ),
  );

  const status = element("p", "panel__status", "Status: idle");
  status.setAttribute("role", "status");
  section.append(status);

  const controls = element("div", "panel__controls");
  section.append(controls);

  const outgoing = labelledTextarea("signal-out", "Block to send", true);
  const incoming = labelledTextarea("signal-in", "Block received", false);
  section.append(outgoing.field, incoming.field);

  section.append(element("h3", undefined, "Received"));
  const log = element("ul", "panel__log");
  section.append(log);

  const elements: PanelElements = {
    status,
    outgoing: outgoing.textarea,
    incoming: incoming.textarea,
    log: log,
  };

  let transport: WebRtcTransport | null = null;
  let sent = 0;

  function note(text: string): void {
    elements.log.append(element("li", undefined, text));
  }

  // Built on first use rather than at page load: constructing the peer connection is what
  // begins contacting the STUN server, and a visitor who never clicks anything should not
  // reach out to a third party at all.
  function ensureTransport(): WebRtcTransport {
    if (transport) return transport;

    const created = createWebRtcTransport();
    created.onStatus((next: TransportStatus) => {
      elements.status.textContent = `Status: ${next}`;
    });
    created.onMessage((message: InboundMessage) => {
      note(`#${message.seq} ${JSON.stringify(message.body)}`);
    });
    created.onProtocolError((failure: ProtocolFailure) => {
      note(`rejected (${failure.code}): ${failure.detail}`);
    });

    transport = created;
    return created;
  }

  function attempt(action: () => Promise<void> | void): void {
    void (async () => {
      try {
        await action();
      } catch (error) {
        note(`failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }

  function readIncoming(): RTCSessionDescriptionInit {
    const text = elements.incoming.value.trim();
    if (!text) throw new Error("paste the other tab's block first");
    return JSON.parse(text) as RTCSessionDescriptionInit;
  }

  function button(text: string, onClick: () => void): HTMLButtonElement {
    const node = element("button", "panel__button", text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  controls.append(
    button("Create offer", () =>
      attempt(async () => {
        elements.outgoing.value = JSON.stringify(await ensureTransport().createOffer());
      }),
    ),
    button("Accept offer", () =>
      attempt(async () => {
        const answer = await ensureTransport().acceptOffer(readIncoming());
        elements.outgoing.value = JSON.stringify(answer);
      }),
    ),
    button("Accept answer", () =>
      attempt(async () => {
        await ensureTransport().acceptAnswer(readIncoming());
      }),
    ),
    button("Send message", () =>
      attempt(() => {
        sent += 1;
        ensureTransport().send({ type: "emote", emote: `hello-${sent}` });
      }),
    ),
    button("Close", () =>
      attempt(() => {
        transport?.close();
      }),
    ),
  );

  root.append(section);
}
