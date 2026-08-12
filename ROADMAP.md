# Roadmap — Checkers Demo

**Companion documents:** [REQUIREMENTS.md](REQUIREMENTS.md) · [DESIGN.md](DESIGN.md) · [DECISIONS.md](DECISIONS.md)

This is the guide to what comes next and in what order. It is updated at the end of every
session: statuses change, discoveries are folded in, and anything deferred leaves behind a
GitHub issue rather than a note here.

**Status legend:** ☐ not started · ◐ in progress · ☑ complete and live-tested

Each phase is a session or a small number of sessions. Tasks are sized for a single focused
pass — at most about five files, with acceptance criteria that fit in three bullets, each
leaving the repository green. A task title containing "and" is usually two tasks.

The sequence follows a walking-skeleton approach: prove the riskiest end-to-end path first,
then flesh it out. The riskiest path here is **connectivity**, not rules, which is why
Phase 1 connects two browsers before the engine exists.

---

## Phase overview

| Phase | Theme | Status |
| --- | --- | --- |
| 0 | Repository, toolchain, CI, deploy | ☑ |
| 1 | Walking skeleton — two browsers connected | ☐ |
| 2 | Rules engine | ☑ |
| 3 | Board interface and input | ☐ |
| 4 | Animation, colour, and theme | ☐ |
| 5 | Game lifecycle | ☐ |
| 6 | AI opponent | ☐ |
| 7 | Hardening and acceptance | ☐ |

---

## Phase 0 — Repository, toolchain, CI, deploy

Establishes the ground everything else stands on. Nothing here is interesting, and all of
it is expensive to retrofit.

- ☑ **0.1 Repository and design documents.** Initialise the repository, publish the four
  design documents, add a README, `.gitignore`, and licence.
  *Accepts:* repository exists at `fthiess/checkers-demo`; documents render correctly on
  GitHub; no personal information anywhere in the tree or in commit messages (D-13).
  *Done 2026-08-05.* The licence's named copyright holder is deliberate and does not breach
  D-13 — see D-17.
- ☑ **0.2 Toolchain.** TypeScript, Vite, Biome, Vitest, with scripts for typecheck, lint,
  format, test, and build.
  *Accepts:* a placeholder page builds and serves; `npm run verify` runs typecheck, lint,
  and tests and passes.
  *Built 2026-08-05.* TypeScript 7 (D-16), Vite 8, Biome 2.5, Vitest 4. Both acceptance
  criteria checked: the dev server serves the placeholder over HTTP, and `npm run verify`
  passes locally and in CI. Biome additionally enforces the [DESIGN.md §1](DESIGN.md)
  dependency rule as a lint error — checked by hand against deliberate violations at
  several import depths, which leaves no trace in the tree; issue #7 tracks turning that
  into an automated guard once the module directories exist. Issue #6 raises a question the
  rule surfaces: `game/` will need the `Transport` type, which lives in `net/`, and task 1.1
  is where that has to be settled.
- ☑ **0.3 Single-file build.** A second build target inlining all script, style, and assets
  into one HTML document (D-12, R-1).
  *Accepts:* the produced file opens from `file://` on Windows and renders the placeholder;
  file size is reported by the build.
  *Built 2026-08-05* — `dist-single/checkers.html`, 2.9 kB, self-contained, verified rendering
  and executing from `file://`. `npm run build:single` reports size against the R-54 budget
  and fails on any surviving external reference. Live-tested by double-click from Windows
  Explorer, which is the path a person opening an email attachment actually takes.
- ☑ **0.4 Continuous integration.** GitHub Actions running the full gate on every pull
  request; branch protection requiring it.
  *Accepts:* a deliberately failing test blocks a pull request; a passing one does not.
  *Built 2026-08-05.* Both halves proved: a throwaway pull request carrying one deliberate
  false assertion went red and reported `fail`, and #8 merged green through the protection.
  `main` requires the `verify` check as a strict check with `enforce_admins` on, force
  pushes and deletions disabled (D-18). ⚠ That protection lives in repository settings where
  no test in the tree can assert it; if it is ever relaxed, "CI green" stops meaning
  "verified". Not separately proved: that a direct push to `main` is rejected — a `--dry-run`
  push never reaches the server's receive path, and pushing for real to find out would have
  left a junk commit that force-push is now disabled to remove.
- ☑ **0.5 Static deploy.** Publish the hosted build on merge to the default branch (R-2,
  R-61).
  *Accepts:* the placeholder is reachable at a public URL and updates on merge.
  *Built 2026-08-05.* GitHub Pages (D-15) at <https://fthiess.github.io/checkers-demo/>. The
  deploy is a job that `needs` the gate job in the same workflow, so "deploys when green" is
  a real dependency rather than two things that happen to run on the same push, and the
  artifact deployed is the one the gate checked. The URL serves the placeholder and runs its
  script — it reports "Running from the web", which is the hosted branch of the same code
  that reports "Running from a local file" under `file://`, so both distribution forms are
  confirmed working and correctly distinguishable (R-52).

**Live test at end of phase 0 — passed 2026-08-05.** The single-file build was produced with
`npm run build:single` and opened by double-click from Windows Explorer; it renders the
placeholder. The hosted URL was confirmed in the same session, rendering and running its
script. R-1 and R-2 are both demonstrated on real browsers rather than inferred from the
build, which is what the tick above now means.

## Phase 1 — Walking skeleton

One thin end-to-end thread: two browsers, in two places, exchanging a message. No rules, no
animation, no polish. This phase exists to discover the connection problems early, while
there is nothing else in the way.

- ☑ **1.1 Transport and message contracts.** Define `Transport`, `Signaler`, the message
  schema, sequence numbers, and the codec ([DESIGN.md §4](DESIGN.md)).
  *Accepts:* interfaces and schema compile with no implementation; codec round-trips under
  unit test.
  *Built 2026-08-11.* Settled issue #6 first, since it blocked the task's first line: the
  `Transport` type now lives in a new `protocol/` module that both `game/` and `net/` may
  import, rather than in `net/` where `game/` could not reach it (D-21, repository owner's
  call among the three options the issue laid out). `src/protocol/transport.ts` and
  `messages.ts` carry the interfaces, the §4.2 schema as a discriminated union, and the
  protocol version — types and one constant, no behaviour. `src/net/codec.ts` implements
  `encode`/`decode`, and per the session owner's call owns the sequence numbering: a codec
  instance belongs to one connection, stamps outgoing numbers, and refuses an inbound one
  that does not advance. Strictly increasing rather than consecutive, because a gap is
  harmless while a repeat is a replay. `decode` returns a typed failure instead of throwing
  and validates every field of every variant — a peer can send anything, and R-57's posture
  is that inbound is untrusted. It deliberately does *not* check that a square exists or
  that a move is legal: the receiver settles that through its own engine, and board geometry
  in the transport layer is the exact leak §9 warns about. `ui/` may not import `protocol/`;
  connection status will reach the interface through `game/`. DESIGN §1's diagram, §2's
  table, CLAUDE.md, and `biome.json` were brought into agreement, and the new lint rules were
  checked by hand against three deliberate violations, all refused. No transport
  implementation here — that is 1.2.
- ☑ **1.2 WebRTC transport.** Implement `WebRtcTransport` with non-trickle ICE against a
  public STUN server.
  *Accepts:* two browser tabs establish a data channel; status transitions are observable.
  *Built 2026-08-11.* `src/net/webrtc-transport.ts` — `protocol/`'s `Transport` over an
  `RTCDataChannel`, plus the SDP-level `createOffer`/`acceptOffer`/`acceptAnswer` that task
  1.3's `ManualSignaler` will wrap with compression and base64url encoding (session owner's
  call: the transport deals in SDP and never learns how blocks are encoded). Non-trickle —
  both resolve only once ICE gathering completes, detected via `icegatheringstatechange`
  reaching `complete` and bounded by a timer so a hopeless network still returns (§4.5,
  R-9); five seconds is a starting value to be tuned against real connections at the phase
  live test, not a measured one. §4.1's six statuses turned out to map one-to-one onto
  `RTCPeerConnection.connectionState`'s six values, with one deliberate exception: a peer
  connection reporting `connected` while its data channel is still opening is published as
  `connecting`, because calling it connected would promise a send path that does not exist
  yet. The connection factory is injected so the transport is unit-testable against a fake —
  `RTCPeerConnection` does not exist outside a browser and no dependency was added to
  simulate one (session owner's call). Sending before the channel opens throws rather than
  queueing or dropping. `onProtocolError` is an addition beyond §4.1, because a peer can
  send bytes that do not decode and `Transport`'s four methods give nowhere to report it;
  whether that should also draw an `error` reply is issue #30, left for when `game/` exists.
  `src/connection-panel.ts` is a **temporary** raw-SDP panel so the acceptance is
  demonstrable by a person; task 1.3 deletes it. It builds the transport on first click, so
  a visitor who touches nothing never contacts the STUN server. Verified in two tabs:
  `idle → connecting → connected` on both sides, a message each way decoded through the
  codec, and closing one side leaving it `closed` while the other reported `reconnecting`.
  Two findings for later tasks: the uncompressed offer block runs to about 1050 characters
  against §4.5's ~1000-character *compressed* estimate, so 1.3's compression has real work
  to do; and the block plainly contains the machine's public addresses, which is R-56's
  disclosure in the flesh — the panel carries one sentence about it, but the proper notice
  is still task 1.5's. The composition root sitting outside the module system, where no lint
  override reaches it, is issue #31. The three decisions above are recorded as D-22 (SDP at
  the transport, block encoding at the signaler, and the injected factory), D-23 (the STUN
  server), and N-4 (the status mapping's one exception).
- ☑ **1.3 Manual signaling.** Offer and answer blocks, compressed and base64url-encoded,
  with copy controls and whitespace-tolerant paste (R-5, R-6).
  *Accepts:* a block survives a round trip through an email client without corruption;
  block length is recorded.
  *Built 2026-08-12.* `src/net/signal-block.ts` encodes the envelope `{v, kind, session,
  sdp}` as JSON → `deflate-raw` → base64url behind a one-character encoding marker, and
  decodes it back through a typed failure rather than a throw, the way `codec.ts` treats
  anything arriving from a peer. `src/net/manual-signaler.ts` implements `protocol/`'s
  `Signaler` over it, wrapping the transport's SDP-level methods exactly as D-22 planned —
  the transport still never sees a block. `src/connection-panel.ts` is rewritten from task
  1.2's raw-SDP harness into the real screen: "invitation" and "reply" rather than offer and
  answer, no protocol vocabulary anywhere in it (R-7), the R-56 disclosure stated before
  anything connects, and `TransportStatus` mapped to sentences including R-9's "these two
  networks cannot reach each other" (D-24, N-5 record the format and the secure-context
  traps). **Block length: 816 and 817 characters** for an invitation across two runs, 689–695
  for a reply — compressed, against §4.5's estimate of roughly a thousand and task 1.2's
  ~1050 uncompressed. Measured between two tabs on one machine, where ICE gathers far fewer
  candidates than it will across two real networks, so treat it as a floor rather than the
  number; the panel reports the length of every block it produces, so the phase live test
  will yield the honest figure without anyone instrumenting anything. Verified in two tabs by
  carrying both blocks through a simulated email client (hard-wrapped at 72 columns with
  CRLF, plus stray leading and trailing whitespace): both decoded, both sides reached
  `connected`. The four ways to paste the wrong thing — not a block, nothing at all, a reply
  where an invitation belongs, a half-copied block — each produce a plain sentence naming the
  mistake. A code review at high effort found that both step buttons stayed live after their
  step was done: pressing Connect a second time renegotiated a `stable` connection and put
  `Failed to set remote answer sdp` on screen, and pressing Continue a second time silently
  replaced the reply block the joiner may already have sent. Each step's control is now
  removed once its step completes, and a failed start returns to the opening choice with a
  fresh signaler rather than a dead screen. Left out deliberately: R-8's shareable link,
  which is specified but belonged to no task at all (issue #34), and connection-status
  announcements, which are task 1.5's (R-48).
- ☑ **1.4 Skeleton screen.** A static board with one draggable token whose position is
  echoed to the other side. No legality checking.
  *Accepts:* two people in two locations move the token and both see it; connection failure
  is reported plainly within a bounded time (R-9).
  *Built 2026-08-12.* **Scoped against what exists rather than what the task says.** This was
  written before Phase 3, and 3.1–3.5 had already built the full board against the real
  engine — so "a static board with one draggable token" would have been a throwaway *behind*
  the interface already shipped. What was genuinely missing is the thread the task exists
  for: nothing sent a move anywhere. Built as that instead (session owner's call, D-25).
  `src/game/session.ts` owns the position and is the only thing that moves it; a local move
  is applied and sent, an arriving one is applied and published. `main.ts` keeps only the
  selection and the focus ring, and the composition root wires the panel's transport to the
  session in one line — which is the whole of what §9's migration would touch. An inbound
  move is recovered by matching against `generateMoves` rather than reconstructed, because
  `promotes` is the engine's conclusion and never travels on the wire. `attemptMove` left
  `ui/input.ts` with its last caller; its tests moved to `findMove`, which is where the
  behaviour they pinned down (R-41's chain prefixes) actually lives. Verified live across two
  tabs: moves echo **both** directions, the receiving side announces them through the same
  live region a local move uses (R-48), and after five alternating moves the two boards were
  byte-identical, and a keyboard-driven move echoed across just as a pointer one did. The
  `game/` lint guard was proved with a deliberate violating import before the module was
  written, not assumed. A code review at high effort found two defects that only exist once a
  *second person* can trigger a render, neither reachable by using the interface alone (N-6):
  an opponent's move stole keyboard focus from wherever the local player was, and it killed a
  drag in progress while leaving the gesture armed, so the eventual pointerup committed a move
  against a board that had changed underneath them. Both fixed and re-verified, along with a
  third: the session's `attach` documented itself as replacing a previous transport without
  unsubscribing it, which reconnection (task 5.4) would have hit. Left out deliberately: **all** of R-57's inbound
  validation and R-35's divergence halt, which is now the entirety of task 3.6 — an
  unrecognised move is silently ignored today, and the state hash goes out with every move
  but is read by nobody. Side ownership and turn enforcement stay Phase 5's (`VIEWING_SIDE`
  is still hardcoded, so either client can move either colour).
- ☐ **1.5 Connection-failure and privacy copy.** Plain-language guidance at every step
  (R-7), the network-address disclosure notice (R-56), and a clear unreachable-network
  message.
  *Accepts:* the flow is comprehensible to someone who has not read this document.
  Also finishes R-48: task 3.5 built the live region and left connection-status
  announcements out, because no transport existed yet to have states worth announcing.

**Live test at end of phase 1** — the session owner and a second person, on two different
networks, connect and move the token. Two tabs on one machine will not do: the whole risk this
phase exists to surface is what happens between two real networks. This is the phase most
likely to turn up something the design did not anticipate.

## Phase 2 — Rules engine

A pure module with no rendering, network, storage, or timing dependencies (R-59). Built
after the skeleton because it carries almost no unknown risk — only work.

- ☑ **2.1 Board representation and geometry.** The 32-square array, piece encoding, the
  index-to-coordinate mapping, and the opening position ([DESIGN.md §3.1](DESIGN.md)).
  *Accepts:* the numbering is asserted against a published reference diagram, not merely
  against the formula.
  *Built 2026-08-06.* `src/engine/board.ts` — piece codes, the `Position` type, the
  index-to-coordinate formula, and the opening position constant. `board.test.ts` checks
  eight squares' coordinates against the published PDN/checkers numbering diagram
  (independent of the formula under test), plus opening-position placement and shape.
- ☑ **2.2 Simple moves.** Generation and application for men and kings, including crowning
  and turn end (R-43, [DESIGN.md §3.3](DESIGN.md)).
  *Accepts:* opening position yields exactly seven legal moves; crowning ends the turn.
  *Built 2026-08-07.* `src/engine/moves.ts` — `Move` type, `generateMoves` (simple moves
  only; capture generation is 2.3), `applyMove`. `board.ts` gained the coordinate→index
  inverse needed to find diagonal neighbours. Opening position asserted against all seven
  hand-verified destination squares, not just the count; king vs. man direction limits,
  blocked destinations, and crowning-ends-the-turn all covered by `moves.test.ts`.
- ☑ **2.3 Captures and chains.** Jump generation, recursive chaining, no double-jumping a
  piece, chain termination on crowning.
  *Accepts:* known multi-jump positions generate the expected chains.
  *Built 2026-08-07.* `exploreJumps` in `moves.ts` — recursive jump search over a working
  copy of the board, captured pieces removed for the duration of the branch that captures
  them and restored on backtrack. Emits a move at every hop, not just maximal chains (D-3,
  D-8), and stops immediately on a crowning hop (§3.3), verified against three
  hand-constructed positions: a two-hop chain, a chain that crowns mid-sequence with a
  simple move also available, and a king jumping backward. Prefix-emission and
  simple/capture coexistence were built in as part of "recursive chaining" itself, per
  DESIGN.md §3.2 — see the note on task 2.4's scope in that PR.
- ☑ **2.4 House rules.** Chain prefixes emitted as first-class moves (D-3, D-8); no
  compulsion to capture or to take the longest (R-39, R-40, R-41).
  *Accepts:* a position with a two-jump chain generates both the one-jump and two-jump
  moves, plus every non-capturing alternative.
  *Built 2026-08-07.* Test-coverage-only, per the scoping note in task 2.3's PR:
  `generateMoves` already satisfies R-39/R-40/R-41 structurally (it loops over every piece
  unconditionally with no cross-piece suppression logic), confirmed rather than newly
  built. Two tests added: a capture on one piece coexisting with an unrelated piece's
  simple move (R-39), and a shorter capture staying legal alongside a longer one available
  in a different direction (R-40). No production code changed.
- ☑ **2.5 Termination.** Loss on having no legal move, covering both no-pieces and blocked
  (R-43).
  *Accepts:* a constructed blocked position with pieces remaining reports a loss.
  *Built 2026-08-07.* `src/engine/termination.ts` — `isTerminal(position)`, true exactly
  when `generateMoves` returns empty, with no special-casing between the two causes (per
  §3.3). Tested against the opening position (false), a side with zero pieces, and a single
  remaining piece wholly blocked by adjacent enemies with the capture landing squares also
  occupied. Deliberately no `winnerOf`/result-shape helper yet — that belongs to `game/`'s
  session state machine in Phase 5, whose shape isn't decided.
- ☑ **2.6 Property-based tests.** Piece conservation, deterministic move ordering,
  application never producing an inconsistent position.
  *Accepts:* properties hold across generated positions.
  *Built 2026-08-07.* Added `fast-check` as a devDependency (never bundled into either
  build output). `src/engine/properties.test.ts` walks reproducible-but-varied game
  sequences from the opening position — an arbitrary array of small integers selects
  `moves[choice % moves.length]` at each step — and checks all three properties across
  those walks. "Move reversibility" from DESIGN.md §8 is not covered: no undo/reverse-move
  function exists anywhere in the codebase, and ROADMAP's own acceptance list for this task
  doesn't call for one, so building one was treated as out of scope.
- ☑ **2.7 Notation and PDN export.** Short form, explicit full path where ambiguous, file
  export with tag pairs and result (R-24).
  *Accepts:* a corpus of recorded games replays move by move with every move found legal.
  *Built 2026-08-07.* `src/engine/notation.ts` — `notateMove` (short form by default,
  falling back to the explicit full path only when a different legal move from the same
  origin shares the final destination) and `exportPdn` (tag pairs, numbered move text,
  result). No parser was built — DESIGN.md only specifies rendering. The corpus is a real
  published game's move sequence ([source](https://gambiter.com/checkers/Portable_draughts_notation.html),
  20 plies) with player names and commentary deliberately omitted (D-13, D-19); replayed by
  matching origin/destination square numbers against generated legal moves at each ply,
  not by trusting the source's `-`/`x` characters, which weren't reliable through the
  fetch.
- ☑ **2.8 State hash.** Canonical serialisation and FNV-1a hash ([DESIGN.md §4.3](DESIGN.md)).
  *Accepts:* identical positions hash identically; any single-square difference does not.
  *Built 2026-08-07.* `src/engine/hash.ts` — canonical serialisation (32 square bytes, side
  to move, 4-byte big-endian ply count) hashed with a 32-bit FNV-1a. `fnv1a32` checked
  directly against the algorithm's published test vectors (`""`, `"a"`, `"foobar"`), not
  just self-consistency. `stateHash` checked for identical positions hashing identically
  and, looping over all 32 squares individually, that changing any one square changes the
  hash. **Phase 2 is now complete** — all of 2.1 through 2.8 built, CI-verified, and merged.

## Phase 3 — Board interface and input

Accessibility is built here, not retrofitted in Phase 7. Retrofitting it is the single
most reliable way to end up not having it.

- ☑ **3.1 Board rendering.** Sixty-four squares, pieces positioned by transform, per-client
  orientation as a render-time mapping (R-11, R-12, [DESIGN.md §6.1](DESIGN.md)).
  *Accepts:* both clients render the same position with each player's pieces nearest them;
  the engine and protocol remain in canonical numbering.
  *Built 2026-08-07.* `src/ui/board.ts` — `orientSquare` (a white viewer needs no
  transform; a black viewer gets a full 180° rotation) and pure `computeBoardLayout`, kept
  DOM-free so it needs no `jsdom`/`happy-dom` dependency to test. `main.ts` does the actual
  DOM construction and CSS `transform` piece positioning; verified in the dev server in both
  light and dark appearance. Caught and fixed a real bug along the way: piece elements were
  rendering nearly double-size and drifting off the board because percentage `padding` on an
  absolutely-positioned grid child didn't resolve the way `box-sizing: border-box` implied —
  fixed by sizing `.piece` itself with plain percentage width/height and moving the circle
  inset onto `::before`, which sizes cleanly against `.piece`'s own now-correct box.
- ☑ **3.2 Pointer input.** Drag-and-drop and click-then-click sharing one selection model
  (R-13).
  *Accepts:* both input styles produce identical results and cannot disagree.
  *Built 2026-08-11.* `src/ui/input.ts` — `selectSquare`/`attemptMove`, kept pure and
  DOM-free like `board.ts`. Both input styles are wired in `main.ts` to call these same two
  functions, so they cannot disagree by construction: a piece's `pointerdown` selects (and
  tracks a possible drag); an empty square's `click` attempts a move; a release with no
  real movement lands back on the origin, which `attemptMove` naturally no-ops on. Dropping
  on an intermediate landing square of a chain stops there (R-41) for free, since
  destinations are matched against every legal move including prefixes (D-3, D-8). Verified
  directly in the dev server: click-then-click, drag-and-drop, illegal attempts (no state
  change, selection retained), and reselecting a different own piece all behave correctly.
  `board.ts` gained `squareAtOrientedCoordinates`, the reverse of `orientSquare`, needed to
  resolve a screen position back to a canonical square.
- ☑ **3.3 Legal-move indication.** Destination highlighting, and full capture-chain preview
  for chain-initiating moves (R-14).
  *Accepts:* a multi-jump chain is shown in full before the first hop is committed.
  *Built 2026-08-11.* `legalDestinations` in `input.ts` — every legal destination for the
  selected piece, tagged by whether it's a capture. The chain-preview requirement turned
  out to need no special path-tracking: since every prefix of a chain is already its own
  first-class legal move (D-3, D-8), an intermediate hop is already one of these
  destinations in its own right. Interpreted "drawn as a path" as highlighting every
  reachable square rather than a connecting line between them — nothing in the acceptance
  criterion requires the latter, and it reads more like Phase 4 polish. Verified in the dev
  server (single- and double-destination pieces, and that reselecting a different piece
  clears the old highlight); the capture-vs-simple styling itself is simple class-driven
  CSS already covered by the four passing unit tests, with no capture available to
  visually demo from the static opening position.
- ☑ **3.4 Keyboard operation.** Grid semantics, arrow navigation, select and place, cancel,
  visible focus (R-46, R-47).
  *Accepts:* a complete game is playable using only the keyboard.
  *Built 2026-08-11.* Board restructured from a flat CSS Grid to nested Flexbox rows so the
  DOM actually nests `role="grid"` → `role="row"` → `role="gridcell"`, matching what R-47
  semantics expect rather than faking it with `aria-rowindex`/`aria-colindex`. Roving
  tabindex; Left/Right move to the next dark square in the same row (2 columns over, since
  the light square between them isn't a valid stop); Up/Down move diagonally (no dark
  square sits directly above another), preferring the left neighbour and falling back right
  at an edge — a documented, non-obvious choice given the geometry doesn't offer a cleaner
  option. Enter/Space compose `selectSquare`/`attemptMove` the same as the other two input
  styles; Escape uses a new `clearSelection`. Square labels fold in selected/destination/
  capture state (R-47) — screen-reader/keyboard users can't see 3.3's highlight dots, so
  this isn't optional. `render()` rebuilds the whole DOM on every interaction, which would
  otherwise silently drop focus after every move; fixed by explicitly restoring it to the
  matching new element every render. Verified with a full select → arrow-navigate → commit
  move via dispatched keyboard events (the automated browser's OS-level key simulation
  didn't reach the focused element in this environment, confirmed as a tooling quirk, not
  an app bug, before switching verification approach) — origin emptied, destination
  populated, piece count unchanged, exactly as a mouse-driven move would produce.
- ☑ **3.5 Screen-reader announcements.** Square labels and a live region for moves, turn
  changes, connection status, and result (R-48).
  *Accepts:* a move is announced in words that identify the piece, origin, destination, and
  any captures.
  *Built 2026-08-11.* Square labels already landed with 3.4, so this task is the live region:
  `src/ui/announce.ts` — `describeMove`, `describeTurn`, `describeResult`, and the
  `moveAnnouncement` that composes them into one utterance per completed move, kept pure and
  DOM-free like `board.ts` and `input.ts`. Words, not notation: `11x18` is what the PDN
  export needs, not what someone listening needs. The region itself is a `role="status"`
  element declared in `index.html` rather than created in `render()` — `render()` replaces
  the board's whole subtree on every interaction, and a live region replaced between its text
  being set and being read announces nothing at all, which is the same class of trap that
  cost keyboard focus in 3.4. `input.ts` gained `findMove`, the matcher `attemptMove` already
  ran internally, so announcing a move doesn't require a second implementation of "what move
  does this resolve to"; both input styles commit through one `commitMove` in `main.ts` for
  the same reason. Verified in the dev server by playing real moves with the mouse (a simple
  move and a capture) and by keyboard: the region carries the right words, updates only on a
  committed move rather than on selection or navigation, and stays invisible on screen.
  **Connection-status announcements are not built** — `net/` does not exist yet (Phase 1 is
  unstarted), so there are no status transitions to announce and any wording now would be a
  guess at states the transport hasn't defined. The region and the `announce()` entry point
  are in place for tasks 1.2 and 1.5 to call; R-48 is only fully met once they do.
- ☐ **3.6 Move wiring.** Connect the interface to the engine and the transport; both clients
  validate inbound moves and compare state hashes (R-57, R-35).
  *Accepts:* an illegal inbound move is rejected; an injected divergence halts play with a
  clear message.
  *Narrowed by task 1.4 (D-25).* The wiring half is done: `game/session.ts` already carries
  moves both ways and the state hash already travels with each one. What remains is the
  validation half, which is untouched — an unrecognised inbound move is **silently ignored**
  rather than rejected, nothing reports it to the player, and no client compares the hash it
  received against its own. Both acceptance criteria still fail.

**Live test at end of phase 3** — a complete, rules-correct game played between two
locations, unanimated.

## Phase 4 — Animation, colour, and theme

The phase that makes it a toy rather than a demonstration.

- ☐ **4.1 Movement and capture animation.** Eased slides, arced jumps, captured pieces
  travelling to the tray (R-29, R-18).
  *Accepts:* sustained 60fps on ordinary laptop hardware (R-53).
- ☐ **4.2 Chain and crowning animation.** Continuous multi-jump sequencing with a beat
  between hops; the crowning flourish.
  *Accepts:* a four-jump chain is readable as four distinct events.
- ☐ **4.3 Feedback animation.** Illegal-move shake, turn-change emphasis, game-end sweep
  (R-15).
  *Accepts:* an illegal drop changes no state.
- ☐ **4.4 Reduced motion.** A tested peer path for `prefers-reduced-motion`, not a
  disabling switch (R-30).
  *Accepts:* every animated event has a non-motion equivalent that conveys the same
  information.
- ☐ **4.5 Colour selection.** Presets, free picker, live contrast validation, joiner-yields
  conflict resolution (R-25, R-26, D-9).
  *Accepts:* a failing colour is refused at selection with an explanation.
- ☐ **4.6 Non-colour side marker.** A persistent marker on one logical side's pieces (R-27).
  *Accepts:* sides remain distinguishable in a greyscale screenshot.
- ☐ **4.7 Board themes.** A token set per theme, chosen locally, AA-validated in light and
  dark (R-28, R-49).
  *Accepts:* each theme passes contrast checks in both appearances.

## Phase 5 — Game lifecycle

Everything around the game rather than in it.

- ☐ **5.1 Session state machine.** Setup, connecting, playing, game over; players, turn,
  result ([DESIGN.md §5](DESIGN.md)).
  *Accepts:* every terminal reason is representable and rendered.
- ☐ **5.2 Resign and draw.** Resignation with confirmation; draw offer, accept, decline,
  re-offer; the forty-move advisory (R-19, R-20, R-21, D-4).
  *Accepts:* a declined offer may be made again; the advisory never ends a game.
- ☐ **5.3 Rematch and series.** Swap the first mover, preserve identities and colours,
  maintain a session score (R-22, R-23).
  *Accepts:* three consecutive games alternate the first mover and the score is correct.
- ☐ **5.4 Persistence and recovery.** Per-move local persistence; resume by re-handshake;
  `sync` reconciliation to the longer history; halt on genuine divergence (R-33 to R-35).
  *Accepts:* a reload mid-game resumes at the correct position; a fabricated divergence
  halts play.
- ☐ **5.5 Connection status.** Disconnection reported promptly and distinguishably from an
  opponent who is thinking (R-36).
  *Accepts:* pulling the network surfaces a status change within a few seconds.
- ☐ **5.6 PDN export.** Download a completed game (R-24).
  *Accepts:* the exported file is accepted by an independent PDN reader.
- ☐ **5.7 Emotes.** A small fixed reaction set, delivered over the existing protocol (R-32).
  *Accepts:* no free-text path exists.
- ☐ **5.8 Shareable invitation link.** When served over HTTP(S), offer the creator's
  invitation as a link carrying the block in the URL fragment, and read a fragment on load
  so a joiner arriving by link lands on the reply step (R-8, [DESIGN.md §4.5](DESIGN.md),
  issue #34). The reply still returns as a pasted block.
  *Accepts:* the control is absent under `file://`; a link opened in a second browser
  reaches the reply step with nothing pasted by hand.
  *Scheduled here rather than in Phase 1 because R-8 is an additional convenience over a
  connection flow that already works — Phase 1's charter is the risky path with no polish,
  and a second entry path would widen exactly the surface that phase exists to narrow.
  Task 1.3 built the encoding it needs, and measured blocks at 816–817 characters: within
  every browser's URL limit, but past what some chat clients linkify without truncating,
  which fails silently and looks like a corrupt block at the far end.*

## Phase 6 — AI opponent

- ☐ **6.1 Trivial opponent.** Prefer the longest capture, otherwise move at random from a
  seeded source (R-37, D-10).
  *Accepts:* a seeded game is reproducible; the AI never produces a move outside the engine's
  legal list.
- ☐ **6.2 Single-player entry.** Start a game against the computer with no connection step,
  reusing the same board and session machinery (R-38).
  *Accepts:* the board, animation, and accessibility paths behave identically to networked
  play.

## Phase 7 — Hardening and acceptance

- ☐ **7.1 End-to-end tests.** Two browser contexts driven through a complete game with the
  paste exchange automated.
  *Accepts:* the suite runs in CI and fails when the connection flow breaks.
- ☐ **7.2 Accessibility audit.** Automated checks plus a manual keyboard and screen-reader
  pass against R-45 to R-50.
  *Accepts:* no AA violations; the acceptance journey in
  [REQUIREMENTS.md §7](REQUIREMENTS.md) completes by keyboard with a screen reader.
- ☐ **7.3 Cross-browser pass.** Chrome, Edge, Firefox, and Safari on Windows and macOS
  (R-51, R-52).
  *Accepts:* connection, play, and animation verified on each; deviations recorded as issues.
- ☐ **7.4 Single-file verification.** The inlined build opened from `file://` on both
  platforms, within the size budget (R-1, R-54).
  *Accepts:* a complete networked game played entirely from local files on both platforms.
- ☐ **7.5 Acceptance.** The journey in [REQUIREMENTS.md §7](REQUIREMENTS.md), performed by
  two people who have not read this repository.
  *Accepts:* they connect and finish a game without assistance.

---

## Carried forward

Deferred work becomes a GitHub issue in this repository at the moment it is discovered, not
at session close. The table in [REQUIREMENTS.md §8](REQUIREMENTS.md) is the standing list of
things already known to be out of scope; the largest of them is the client/server transport
described in [DESIGN.md §9](DESIGN.md), which unblocks spectators, correspondence play, room
codes, reconnection without re-handshake, and anti-cheat in one move.

## Session log

Updated at the close of each session.

| Date | Session | Outcome |
| --- | --- | --- |
| 2026-08-05 | Design | Requirements, design, decisions, and roadmap written and approved. D-1 through D-14 recorded. |
| 2026-08-05 | Phase 0 | Toolchain, both build outputs, CI gate, branch protection, and the Pages deploy (#4, #8, #9). D-15 through D-18 and N-1 recorded. Issues #6 and #7 opened from the code review. Live-tested and complete. |
| 2026-08-05 | Handoff | Repository prepared for more than one contributor (#11, #12). Delegated approval and role-based attribution (D-19); the vendored methodology adapted and forked from its upstream (D-20). CONTRIBUTING, ONBOARDING, and DECISIONS-INDEX added. |
| 2026-08-06 | Onboarding + Phase 2 | Second contributor onboarded via ONBOARDING.md. Task 2.1 (board representation and geometry, #13) built, tested against a published reference diagram, and merged. Session diagnosed the merge as having bypassed CI (N-2, #14) and paused before task 2.2 pending the repository owner's involvement — see the 2026-08-07 row: this diagnosis was wrong. |
| 2026-08-07 | Correction | The 2026-08-06 CI/branch-protection concern was a false alarm (N-3): the required check had completed successfully nearly two minutes before the merge, and branch protection worked correctly throughout. The apparent gap was GitHub's runs-listing API and Checks tab lagging a few minutes behind the run's actual completion, not a broken gate. Issue #14 closed; merge-on-green (D-19) is not suspended. |
| 2026-08-07 | Phase 2 | Tasks 2.2 through 2.8 built, CI-verified, and merged (#16-#22) — **Phase 2 is complete**. Move generation and application, recursive capture chains with prefix-emission (D-3, D-8), house-rule non-compulsion tests, termination detection, property-based tests (`fast-check` added as a devDependency, explicit merge go-ahead per the dependency rule), PDN notation and export (replay-verified against a real published game, source cited and player names/commentary omitted per D-13/D-19), and the FNV-1a state hash (checked against the algorithm's own published test vectors). 74 tests passing in `src/engine/`. Session paused with neither Phase 1 nor Phase 3 started. |
| 2026-08-11 | Phase 3 | Tasks 3.1 through 3.5 built and merged (#24-#28): board rendering, pointer input, legal-move indication with capture-chain preview, keyboard operation (roving tabindex over `role="grid"`), and screen-reader announcements. Connection-status announcements deliberately deferred to Phase 1, since nothing emitted a `TransportStatus` yet; the `announce()` entry point was left in place for them. Only task 3.6 (move wiring) remains in the phase. |
| 2026-08-11 | Phase 1 | Tasks 1.1 and 1.2 built and merged (#29, #32). 1.1 added the `protocol/` module and the codec, closing issue #6 as D-21 — the repository owner's call, since it changed both the message schema and the module dependency rule. 1.2 implemented `WebRtcTransport` with non-trickle ICE and an injected peer-connection factory, verified live across two browser tabs (full handshake, a message each way, and a close). D-22, D-23, and N-4 were owed by that PR and are recorded in the following docs-only session instead. Issues #30 and #31 opened and left for later. |
| 2026-08-12 | Close-out | Documentation debt from task 1.2 paid: D-22 (transport speaks SDP, signaler owns the block encoding), D-23 (one configurable public STUN server, still no TURN), and N-4 (`TransportStatus` is not `connectionState` renamed) appended to the decision log, the index updated, and this session log brought current after several sessions without a row. No code changed. |
