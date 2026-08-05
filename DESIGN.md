# Engineering Design — Checkers Demo

**Status:** approved 2026-08-05
**Companion documents:** [REQUIREMENTS.md](REQUIREMENTS.md) · [DECISIONS.md](DECISIONS.md) · [ROADMAP.md](ROADMAP.md)

Requirement citations of the form **R-n** refer to [REQUIREMENTS.md](REQUIREMENTS.md).
Decision citations of the form **D-n** refer to [DECISIONS.md](DECISIONS.md).

---

## 1. Shape of the system

The application is a static single-page client with no backend. Two instances of it
connect directly to each other over a WebRTC data channel and exchange move intents. Both
instances run identical copies of the rules engine and each validates everything it
receives (R-57).

The whole design is organised around one idea: **the peer-to-peer transport is an
implementation detail behind an interface, and everything above that interface is written
as though a server already existed.** Option A was chosen for speed of demonstration
(D-1); this document treats a later move to a client/server transport as a planned event
rather than a hypothetical, and §9 states exactly what such a move would touch.

```
┌──────────────────────────── browser ────────────────────────────┐
│                                                                 │
│   ui/  ────────────────────────── ai/                           │
│    │  render, input, animation      move chooser                │
│    │                                  │                         │
│    └──────────────┬───────────────────┘                         │
│                   ▼                                             │
│                game/          session state machine             │
│                   │           players, turn, series, result     │
│          ┌────────┴────────┐                                    │
│          ▼                 ▼                                    │
│      engine/            net/                                    │
│      pure rules         Transport ◄── protocol codec            │
│      zero deps              │                                   │
│                             ▼                                   │
│                     WebRtcTransport  ── Signaler (manual)       │
└─────────────────────────────┼───────────────────────────────────┘
                              │  RTCDataChannel
                              ▼
                        the other browser
```

Dependency rule: arrows point downward only. `engine/` imports nothing. `net/` never
imports `ui/`. `ui/` never imports `net/`. Anything that needs to cross does so through
`game/`.

## 2. Modules

| Module | Responsibility | May import |
| --- | --- | --- |
| `engine/` | Board representation, move generation, move application, terminal detection, PDN notation. Pure and deterministic. | nothing |
| `game/` | Session state machine: players, colours, whose turn, result, series score, draw offers, persistence. Owns the engine instance. | `engine/` |
| `net/` | `Transport` and `Signaler` interfaces, message schema and codec, the WebRTC implementation. | `engine/` (for the state hash only) |
| `ai/` | Chooses a move given an engine position. | `engine/` |
| `ui/` | Board rendering, pointer and keyboard input, animation, panels, colour and theme selection. | `game/`, `engine/` (types) |
| `app/` | Composition root. Instantiates everything and wires it together. | all |

`app/` is the only module permitted to know which `Transport` implementation is in use.

## 3. Rules engine

### 3.1 Board representation

Play occurs only on the 32 dark squares, so the board is a 32-element array indexed 0–31,
corresponding to PDN squares 1–32. Each element holds a small integer: empty, or one of
four piece codes (man or king, for each of the two logical sides).

The two logical sides are named **Black** and **White** to match PDN convention: Black
occupies squares 1–12 at the start, White occupies 21–32, and Black moves first. These
names are internal only. Each player's *chosen display colour* (R-25) is a presentation
mapping applied at render time and carries no rules meaning. Keeping these separate is
what allows both players to pick, say, two shades of green without the engine caring.

Geometry is derived rather than stored. For zero-based index `i`:

```
row = floor(i / 4)
col = 2 * (i % 4) + (row % 2 === 0 ? 1 : 0)
```

so squares 1–4 occupy row 0 at columns 1, 3, 5, 7. A test in Phase 2 asserts this mapping
against a published reference board diagram rather than trusting the formula — the
numbering convention is exactly the kind of detail that is easy to get subtly wrong and
expensive to discover late.

A position is `{ squares: Int8Array(32), sideToMove, plyCount }`. Positions are treated as
immutable; applying a move returns a new position.

### 3.2 Move generation

A move is:

```ts
type Move = {
  from: SquareIndex          // origin
  path: SquareIndex[]        // landing squares in order; length 1 for a simple move
  captured: SquareIndex[]    // squares vacated by capture, in order; empty for a simple move
  promotes: boolean          // true if this move crowns the moving piece
}
```

Generation walks each piece of the side to move. Men consider the two forward diagonals;
kings consider all four. For each direction, an adjacent vacant square yields a simple
move; an adjacent enemy piece with a vacant square beyond yields a jump. Jump chains are
explored by recursion, with captured pieces removed from the working position during the
search so that a piece cannot be jumped twice, and with the chain terminated immediately
if the moving piece is crowned (§3.3).

Because capture is not compulsory (R-39, R-40, R-41), **every prefix of every jump chain
is itself a legal move** and appears in the generated list. This is a direct and
deliberate consequence of the house rules: a player may stop mid-chain, so a two-jump
chain contributes both the one-jump move and the two-jump move. The generator is written
to emit prefixes rather than having the interface synthesise them, so that the engine
remains the single authority on legality and the AI and the validator see the same move
set as the UI.

Move lists are ordered deterministically — by origin square, then by direction, then by
chain length — so that a position always produces an identical list. Determinism matters
for the state hash (§4.3), for reproducible tests, and for a reproducible AI given a
seeded random source.

### 3.3 Crowning and termination

A man that lands on the far rank is crowned and its turn ends immediately, even mid-chain.
This is the American rule and it is retained unmodified; it interacts with the "may stop
anywhere" house rule only in that crowning removes the choice.

The side to move loses when its generated move list is empty (R-43) — this covers both
having no pieces and being wholly blocked, with no special case for either. Resignation
and agreed draws (R-19, R-20) are decided in `game/`, not in the engine, because they are
properties of the session rather than of the position.

### 3.4 Notation

The engine renders a move in PDN short form: `11-15` for a simple move, `23x14` for a
capture. Where two distinct capture chains from the same origin share a destination — a
real possibility for kings — the engine emits the explicit full-path form `23x18x9`
instead, which is a recognised PDN extension. Export writes a PDN file containing the
standard tag pairs, the move text, and the result (R-24).

## 4. Network protocol

### 4.1 Transport interface

```ts
interface Transport {
  send(message: OutboundMessage): void
  onMessage(handler: (message: InboundMessage) => void): Unsubscribe
  onStatus(handler: (status: TransportStatus) => void): Unsubscribe
  close(): void
}

type TransportStatus =
  | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed'
```

That is the entire contract. It is intentionally expressible over a data channel, a
WebSocket, or HTTP polling, and nothing in it presumes a peer rather than a server.

### 4.2 Messages

All messages are JSON objects carrying a protocol version and a monotonically increasing
sequence number. Version mismatch is detected at handshake and reported as a plain-language
error rather than being tolerated.

| Message | Payload | Purpose |
| --- | --- | --- |
| `hello` | protocol version, display name, chosen colour, preferred logical side | Identity exchange, colour conflict resolution |
| `move` | `from`, `path`, `captured`, resulting `stateHash` | A played move |
| `resign` | — | Sender resigns |
| `drawOffer` / `drawAccept` / `drawDecline` | — | Draw negotiation |
| `rematch` | proposed first mover | Rematch offer and acceptance |
| `emote` | emote id | Reaction |
| `sync` | full move list, `stateHash` | Reconciliation after reconnection |
| `error` | code, human-readable detail | Protocol or legality failure |

Moves are transmitted as **intents, never as board snapshots**. A receiver applies the
move to its own position through its own engine; if the move is not in the legal move list
for that position, it is rejected and an `error` is returned (R-57). This is the property
that makes a future server referee additive rather than disruptive — the server would run
the same engine module and perform the same check.

### 4.3 State hash and divergence

Every `move` carries the sender's hash of the resulting position: a 32-bit FNV-1a over the
canonical serialisation of the squares array, the side to move, and the ply count,
rendered as hex. The receiver computes the same hash after applying the move and compares.

The hash is a **divergence detector, not a security measure**. It exists so that a bug or a
version skew surfaces immediately and loudly rather than as two players staring at
different boards. On mismatch the session halts and reports the inconsistency (R-35).
Tamper resistance is not achievable without a referee and is not claimed (R-58).

### 4.4 Signaling interface

```ts
interface Signaler {
  createOffer(): Promise<SignalBlob>
  acceptOffer(blob: SignalBlob): Promise<SignalBlob>   // returns the answer
  acceptAnswer(blob: SignalBlob): Promise<void>
}
```

`ManualSignaler` implements this with copy-and-paste; a future `ServerSignaler` would
implement it with a room code. The distinction is contained entirely within `net/` and one
screen of `ui/`.

### 4.5 Connection flow

1. The creator enters a name and colour and clicks Create. The client builds an
   `RTCPeerConnection`, creates the data channel, generates an offer, and waits for ICE
   gathering to complete before serialising — a non-trickle exchange, because a manual
   channel cannot carry incremental candidates.
2. The offer, the creator's name and colour, a session id, and the protocol version are
   packed into one JSON object, compressed, and rendered as a base64url block with a copy
   button and instructions in plain language (R-5, R-7).
3. The joiner pastes the block, enters their own name and colour, and receives an answer
   block by the same process.
4. The creator pastes the answer. The data channel opens and both sides exchange `hello`.
5. If both players chose colours that fail the distinguishability check (R-26), the
   **joiner** yields and is prompted to choose again; the rule is deterministic so both
   clients reach the same conclusion without negotiation.

Blocks are compressed with `CompressionStream('deflate-raw')` where available, falling
back to uncompressed base64url. A raw SDP with gathered candidates runs to a few kilobytes;
compression is expected to bring the block to roughly a thousand characters. The block is
base64url-encoded specifically so that it survives channels that re-flow whitespace or
mangle punctuation (R-6), and the paste handler strips all whitespace before decoding.

ICE uses a free public STUN server (R-3). No TURN relay is configured, so player pairs
behind certain NAT combinations will fail to connect. This is an accepted limitation of
Option A. Gathering is bounded by a timer; when it expires or the channel fails to open,
the interface reports plainly that the two networks cannot reach each other and suggests
trying from a different network (R-9).

When the page is served over HTTP(S), the creator's offer is additionally offered as a
link carrying the block in the URL fragment (R-8). A fragment never leaves the browser, so
this discloses nothing to the host. The answer still returns as a pasted block.

### 4.6 Privacy consequence

WebRTC discloses each peer's network address to the other; this is inherent to a direct
connection and cannot be avoided while Option A stands. The interface states this in one
plain sentence before the connection is created (R-56). The migration in §9 removes the
disclosure as a side effect.

## 5. Session, persistence, and recovery

`game/` owns a state machine over `setup → connecting → playing → gameOver`, with the
move history, both players' identities, the series score, and any outstanding draw or
rematch offer.

After every applied move the session writes the move history, player identities, and
series score to `localStorage` under a key derived from the session id (R-33). Preferences
— display name, colour, theme, sound — are stored separately and persist across games
(R-25).

Recovery after a reload (R-34) re-runs the signaling exchange, then both sides send `sync`
with their full move list. The longer list wins provided the shorter is a prefix of it;
the client that was behind replays the missing moves through its engine. If the two lists
diverge before their common end — meaning the two clients genuinely disagree about what
happened — play halts with an explicit message (R-35). Silently picking a winner would
be worse than stopping.

Connection loss during play is surfaced from `TransportStatus` and rendered
distinguishably from an opponent who is merely thinking (R-36).

## 6. Interface and animation

### 6.1 Rendering

The board is composed of ordinary DOM elements, not a canvas. This is the decision that
makes the accessibility requirements achievable: real elements are focusable, carry ARIA
semantics, and are inspectable by assistive technology, whereas a canvas would require
rebuilding all of that in parallel (D-6).

Sixty-four square elements form the grid; pieces are separately positioned elements whose
location is expressed as a CSS `transform`. Moving a piece therefore animates a transform
rather than a layout property, which keeps animation on the compositor and off the main
thread (R-53).

Board orientation is a render-time transform of square index to screen position (R-12).
The engine and the protocol always speak in canonical PDN numbering; only the view is
mirrored. Getting this boundary right in Phase 3 is what keeps notation, export, and
future replay coherent.

### 6.2 Animation vocabulary

Animations are driven by the Web Animations API, sequenced by the session emitting
described events rather than by the UI inferring changes from state diffs.

A simple move eases the piece along its diagonal. A jump arcs — the piece rises over the
captured square and lands beyond it — while the captured piece shrinks, fades, and travels
to the capture tray, so the tray doubles as a legible material count (R-18). A multi-jump
chain plays as one continuous sequence with a short beat between hops, which is what makes
a long chain readable rather than a blur. Crowning stacks a second disc onto the piece with
a small bounce and a brief highlight sweep. An illegal drop produces a short lateral shake
and no state change (R-15). Game end sweeps the board.

Selecting a piece highlights every legal destination, and where a destination begins a
capture chain the whole chain is drawn as a path (R-14) — the single most useful piece of
feedback in online checkers, and the reason the generator emits chain prefixes as
first-class moves.

Under `prefers-reduced-motion` every one of these degrades to an instant state change with
a brief non-motion emphasis; the reduced-motion path is implemented as a peer of the
animated path and tested, not as an afterthought (R-30).

### 6.3 Input

Pointer input supports both drag-and-drop and click-then-click (R-13), sharing one
selection model so the two never disagree.

Keyboard operation is a first-class path built in Phase 3 rather than retrofitted. The
board is exposed as a grid; arrow keys move focus between playable squares, Enter or Space
selects a piece and then a destination, and Escape cancels a selection. Focus is always
visible (R-46). Each square carries a label describing its number and contents (R-47), and
a polite live region announces every move in words, along with turn changes, connection
status changes, and the game result (R-48).

### 6.4 Colour and theme

Each player picks their own piece colour (R-25) from a curated set of
colour-vision-safe presets, with a free picker available. Selection is validated live:
the chosen colour must reach a contrast ratio of at least 3:1 against both board square
colours and against the opponent's chosen colour, satisfying WCAG 2.2 SC 1.4.11 for
non-text contrast (R-26, R-45, R-49). Failing choices are refused at the point of
selection with an explanation, not silently corrected.

Independently of colour, one logical side's pieces always carry a non-colour marker — a
concentric ring inset — so that ownership survives greyscale and any form of colour vision
deficiency (R-27). The marker is attached to the logical side, so it is stable for both
players even though their boards are mirrored.

Board theme is chosen per player and stored locally; it is never transmitted (R-28). Each
theme supplies a full token set and is validated for AA contrast in both light and dark
appearance.

## 7. AI opponent

The v1 opponent is deliberately trivial (R-37): given a position, it takes a capture if
one is available — preferring the longest chain, which costs nothing since chains are
already generated — and otherwise selects uniformly at random from the legal moves. It
draws from an injected seeded random source so that games are reproducible under test.

The AI consumes exactly the same generated move list as the interface and the validator,
so it can never make a move a human could not. A search-based upgrade is a contained later
change: the position is immutable and cheap to copy, and move generation already exists, so
a depth-limited minimax with a material-and-position evaluation slots in behind the same
interface. It is deferred, with a ticket, rather than built now.

## 8. Build, verification, and delivery

The toolchain is TypeScript with Vite, no UI framework, and Biome for formatting and
linting. Avoiding a framework is a deliberate choice for a project of this size: the board
is one bespoke, animation-heavy component, which is precisely the case where a framework's
rendering model gets in the way rather than helping (D-6).

Two build outputs are produced from one source. The ordinary output is deployed to static
hosting (R-2). The single-file output inlines all script, style, and asset content into one
HTML document that runs from `file://` (R-1), kept under a working budget of one megabyte
(R-54).

Verification runs at three levels. The engine carries unit tests, property-based tests
(invariants such as piece conservation, move reversibility, and the impossibility of
generating a move that leaves the board inconsistent), and a corpus of recorded games
replayed move by move (R-59). The session and protocol layers carry unit tests over
serialisation, divergence detection, and reconciliation. End-to-end tests drive two browser
contexts through a complete game, automating the paste exchange by extracting the block
from one context and entering it in the other — which also serves as a continuous check
that the connection flow actually works.

Every pull request runs type checking, lint, unit tests, build, and end-to-end tests. The
default branch deploys the hosted build on green (R-61).

## 9. Migration path to a client/server transport

This section is the contract that keeps Option A from becoming a dead end. Should the
project move to Option B — a static page plus a serverless function and a small key-value
store — the following is the complete list of what changes.

**Added.** An `HttpPollingTransport` implementing the existing `Transport` interface. A
serverless function exposing create-room, join-room, post-move, and fetch-since endpoints
over a key-value store. A `ServerSignaler` replacing the paste ritual with a room code,
and the one screen of `ui/` that presents it.

**Changed.** `app/`, which selects the transport — a handful of lines. The connection
screen, which loses two textareas and gains a short code field.

**Unchanged.** The entire rules engine. The session state machine. The message schema, the
sequence numbers, and the state hash, all of which were designed for a referee. Every part
of the interface, animation, colour, theme, accessibility, persistence, and AI.

**Enabled by the move.** Server-side move validation, and with it a meaningful anti-cheat
story (R-58). Spectators, as additional read-only subscribers to a room. Correspondence
play, since the room outlives both clients. Reconnection without a re-handshake. Room codes
instead of pasted blocks. And the elimination of peer address disclosure (R-56).

The migration is deliberately *additive*: nothing above the transport boundary is expected
to be rewritten. If a later session finds itself changing `engine/`, `game/`, or `ui/` in
order to add a server, that is a signal that this boundary leaked and should be treated as
a defect in this design rather than as unavoidable work.
