/**
 * The transport and signaling contracts (DESIGN.md §4.1, §4.4).
 *
 * Interfaces only, with no implementation anywhere in this module -- `net/` supplies those.
 * Nothing here presumes a peer rather than a server: the contract is expressible over a data
 * channel, a WebSocket, or HTTP polling, which is precisely the property §9's migration
 * depends on (D-1).
 */

import type { InboundMessage, OutboundMessage } from "./messages.ts";

export type Unsubscribe = () => void;

export type TransportStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "failed";

export interface Transport {
  send(message: OutboundMessage): void;
  onMessage(handler: (message: InboundMessage) => void): Unsubscribe;
  onStatus(handler: (status: TransportStatus) => void): Unsubscribe;
  close(): void;
}

// An offer or answer block as it is handed to a person: compressed and base64url-encoded so
// it survives an email client re-flowing whitespace or mangling punctuation (R-6, §4.5).
export type SignalBlob = string;

export interface Signaler {
  createOffer(): Promise<SignalBlob>;
  acceptOffer(blob: SignalBlob): Promise<SignalBlob>;
  acceptAnswer(blob: SignalBlob): Promise<void>;
}
