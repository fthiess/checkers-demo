# Requirements — Checkers Demo

**Status:** approved 2026-08-05
**Owner:** Forrest Thiessen (`fthiess`)
**Companion documents:** [DESIGN.md](DESIGN.md) · [DECISIONS.md](DECISIONS.md) · [ROADMAP.md](ROADMAP.md)

---

## 1. Purpose

A two-player game of checkers played over the internet by two humans on two different
computers in two different places. The experience should feel like a well-made toy: a
graphical board, pieces that move with weight and character, and no ceremony between
deciding to play and playing.

The project is also a deliberate exercise in disciplined process — requirements, design,
decision log, and roadmap maintained as first-class artifacts alongside the code.

## 2. Users and context

Two friends or family members who each have a modern desktop browser and some existing
way to send each other a short piece of text — email, SMS, a chat app, a phone call. They
are not technical, they do not have accounts, and they will not read instructions. There
is no third user role in v1; spectators are explicitly deferred (§8).

The application must be usable by people who rely on a keyboard, a screen reader, or a
high-contrast display, and by people with any common form of colour vision deficiency.
Accessibility is a requirement, not a polish item.

## 3. Scope

**In scope for v1.** A complete, playable game of American draughts with the house rule
modifications in §5, played peer-to-peer between two browsers; per-player colour and theme
selection; animated piece movement, capture, and crowning; resignation and draw by
agreement; rematch with a running series score; PDN export of a completed game; a trivial
single-player AI opponent; full keyboard and screen-reader operability.

**Out of scope for v1.** User accounts, matchmaking, lobbies, leaderboards, ratings,
spectators, correspondence (multi-day) play, free-text chat, takebacks, game clocks,
hot-seat play on a single device, mobile-optimised layout, internationalisation, and any
form of server-side infrastructure beyond static file hosting.

## 4. Functional requirements

Requirements are numbered for citation from [DESIGN.md](DESIGN.md) and
[ROADMAP.md](ROADMAP.md).

### 4.1 Distribution and launch

- **R-1** The application ships as a single self-contained HTML file with all script,
  style, and asset content inlined. Opening that file from the local filesystem
  (`file://`) on Windows or macOS launches a fully functional application.
- **R-2** The same build is also published to a static hosting URL. The two distribution
  forms are functionally identical; the hosted form may offer additional convenience in
  the connection flow (R-8).
- **R-3** The application requires no installation, no accounts, and no runtime
  dependency on any service operated by the project. Use of a free public STUN server is
  permitted and is documented as the sole external dependency.

### 4.2 Establishing a game

- **R-4** One player creates a game and the other joins it. The creating player chooses a
  display name and piece colour before the connection is established.
- **R-5** Connection is established by exchanging two blocks of text — an offer produced
  by the creator and an answer produced by the joiner — through any channel the players
  already use. Each block is presented with a one-click copy control and is accepted by
  paste.
- **R-6** Text blocks are as short as the underlying protocol permits and are safe to send
  through channels that may wrap, re-flow, or alter whitespace.
- **R-7** The application states plainly what to do at every step of the exchange, in
  ordinary language, without reference to the underlying technology.
- **R-8** When the application is served over HTTP(S) rather than opened from a file, the
  creator's offer may additionally be carried in a shareable link. The answer is still
  returned by text block.
- **R-9** When a connection cannot be established, the application says so clearly within
  a bounded time and explains that the players' networks are incompatible, rather than
  hanging or failing silently.
- **R-10** Both players' display names and chosen colours are exchanged as part of the
  connection and are shown throughout the game.

### 4.3 Playing

- **R-11** The board is drawn graphically with the standard 8×8 alternating pattern, and
  play occurs on the 32 dark squares.
- **R-12** Each player's own pieces are drawn at the bottom of their own screen; the board
  is mirrored between the two clients.
- **R-13** A player may move a piece by dragging it to its destination, or by clicking the
  piece and then clicking the destination.
- **R-14** When a piece is selected, every legal destination for that piece is visually
  indicated. When a selected move begins a capture chain, the full available chain is
  previewed rather than only the first hop.
- **R-15** Attempting an illegal move produces immediate, non-punitive visual feedback and
  no change of state.
- **R-16** Only the player whose turn it is may move. The other player's board is
  interactive only for inspection.
- **R-17** The current turn, both players' names and colours, and the count of pieces each
  player has captured are visible at all times.
- **R-18** Captured pieces accumulate in a tray beside the board.
- **R-19** Either player may resign at any time on their own behalf, with a confirmation
  step.
- **R-20** Either player may offer a draw; the game ends in a draw only if the other
  player accepts. Draw offers may be declined and may be re-offered.
- **R-21** After 40 consecutive moves by each side without a capture or a promotion, the
  application displays a non-binding suggestion that the position may be drawn. It never
  ends the game on its own.
- **R-22** When a game ends, the result and its reason are stated clearly, and both players
  are offered a rematch.
- **R-23** A rematch swaps which player moves first, preserves both players' names and
  colours, and maintains a running win/loss/draw score across the session.
- **R-24** A completed game may be exported as a PDN file describing the moves played.

### 4.4 Appearance and feedback

- **R-25** Each player independently chooses the colour of their own pieces. The choice is
  remembered between sessions on that device.
- **R-26** The application prevents colour choices that would be indistinguishable — from
  the board, or from the opponent's pieces — by validating contrast at selection time and
  refusing or resolving unusable combinations.
- **R-27** Piece ownership is never conveyed by colour alone. One side's pieces carry a
  persistent non-colour marker so that the sides remain distinguishable in greyscale.
- **R-28** Each player independently chooses a board theme. Theme selection is local to
  that player and is not shared with the opponent.
- **R-29** Piece movement, captures, multi-jump chains, crowning, and game end are
  animated. Animations are informative — they show what happened — rather than decorative
  delays.
- **R-30** All animation respects the operating system's reduced-motion preference; when
  that preference is set, state changes are instantaneous or use non-motion transitions.
- **R-31** Sound effects, if present, are off by default and independently toggleable.
- **R-32** A small fixed set of emotes or reactions may be sent to the opponent. There is
  no free-text chat.

### 4.5 Interruption and recovery

- **R-33** Game state is persisted locally after every move.
- **R-34** If a player reloads or their browser closes, they may resume the game by
  repeating the connection exchange; the two clients reconcile to the longer move history.
- **R-35** If the two clients' histories are found to have genuinely diverged, the
  application halts play and says so rather than continuing from an inconsistent state.
- **R-36** Loss of connection during play is reported to both players promptly and
  distinguishably from an opponent who is simply thinking.

### 4.6 Single-player

- **R-37** A player may start a game against a computer opponent without any connection
  step. The AI in v1 is deliberately minimal: it captures when a capture is available and
  otherwise moves at random.
- **R-38** The single-player mode exercises the same rules engine and the same board
  interface as networked play.

## 5. Rules specification

The game is **American draughts (English draughts)** with three house modifications, all
recorded as [D2](DECISIONS.md).

**Standard, retained.** An 8×8 board with play on the dark squares only, twelve pieces per
side, opening position with each side's pieces on the twelve squares nearest that side.
Men move one square diagonally forward to a vacant square. A man captures by jumping an
adjacent diagonally-forward enemy piece into the vacant square immediately beyond it.
Multiple captures may be chained in a single turn. A man reaching the far rank is crowned
a king, and **crowning immediately ends the turn** even if further jumps would otherwise
be available. Kings move and capture one square diagonally in any of the four directions.
A piece may not be jumped twice within a single chain. Captured pieces are removed
immediately.

**Modified.**

- **R-39** Capture is **not** compulsory. A player with a capture available may make any
  other legal move instead.
- **R-40** When several captures are available, a player is **not** required to choose the
  longest. Any available capture may be played.
- **R-41** A player who begins a capture chain **may stop at any point** in that chain.
  Continuing is offered as the default action in the interface, but is never forced.
- **R-42** There is **no automatic draw rule**. Neither move repetition nor a
  no-progress count ends the game; only mutual agreement does (R-20).

**Termination.**

- **R-43** A player who has no legal move on their turn — whether through having no pieces
  remaining or through being entirely blocked — loses the game.
- **R-44** A game may also end by resignation (R-19) or by agreed draw (R-20).

**Turn order.** Play follows the standard convention in which the side occupying squares
1–12 in PDN numbering moves first. The mapping from that logical side to each player's
chosen display colour is a presentation concern (§4.4) and carries no rules significance.

## 6. Non-functional requirements

### 6.1 Accessibility

- **R-45** The application conforms to WCAG 2.2 Level AA.
- **R-46** Every function is operable by keyboard alone, including piece selection and
  movement, with a visible and unambiguous focus indicator at all times.
- **R-47** The board exposes correct semantics to assistive technology; each playable
  square communicates its position and contents.
- **R-48** Moves, turn changes, connection status changes, and game end are announced to
  screen-reader users through a live region.
- **R-49** All text and meaningful non-text content meets AA contrast in every supplied
  theme, in both light and dark appearance.
- **R-50** Interactive targets are at least 44×44 CSS pixels.

### 6.2 Compatibility and performance

- **R-51** Supported browsers are the current and previous major versions of Chrome, Edge,
  Firefox, and Safari on Windows and macOS.
- **R-52** The application functions identically when loaded from `file://` and from
  `https://`, except for the link-sharing convenience of R-8.
- **R-53** Animations sustain 60 frames per second on ordinary laptop hardware.
- **R-54** The single-file build is small enough to send as an email attachment —
  a working target of under one megabyte.

### 6.3 Privacy and integrity

- **R-55** The application collects no personal data, sets no cookies, and performs no
  analytics or telemetry. Display names and preferences never leave the player's device
  except as part of the direct peer connection.
- **R-56** A direct peer-to-peer connection necessarily discloses each player's network
  address to the other. This is documented for the player in plain language before the
  connection is established.
- **R-57** Each client independently validates every move it receives against its own copy
  of the rules and rejects any move that is not legal.
- **R-58** Because v1 has no referee, it offers no defence against a determined opponent
  running modified software. The trust model is "playing with a friend," and is stated as
  such.

### 6.4 Maintainability

- **R-59** The rules engine is a pure module with no dependencies on rendering, network,
  storage, or timing, and is exercised by unit tests, property-based tests, and a corpus
  of recorded games.
- **R-60** The application communicates with the network only through a transport
  abstraction. Replacing the peer-to-peer transport with a client/server transport must
  not require changes above that boundary. See [DESIGN.md §9](DESIGN.md).
- **R-61** Every merge to the default branch runs the full verification gate
  automatically, and deploys the hosted build when green.

## 7. Acceptance

v1 is complete when two people in two locations can, without assistance and without
reading documentation, open the application, connect, play a complete game of checkers to
a decisive result, and start a rematch — and when that same journey can be completed
entirely by keyboard with a screen reader running.

## 8. Deferred

The following are understood, deliberately excluded from v1, and expected to become
straightforward once the client/server transport described in
[DESIGN.md §9](DESIGN.md) exists.

| Deferred item | Blocked on | Note |
| --- | --- | --- |
| Spectators | Server transport | Requires a third connection; a mesh is disproportionate for a demo. |
| Correspondence play over days | Server transport | Needs durable server-side state. |
| Room codes instead of pasted blocks | Server transport | Removes the connection ritual entirely. |
| Reconnect without re-handshake | Server transport | Server holds the session. |
| Stronger AI (search-based) | Nothing | Small, well-isolated upgrade to the existing move generator. |
| Mobile and touch layout | Nothing | Desktop-first for v1. |
| Anti-cheat | Server transport | Requires an authoritative referee. |
