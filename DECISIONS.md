# Decision Log — Checkers Demo

**Companion documents:** [REQUIREMENTS.md](REQUIREMENTS.md) · [DESIGN.md](DESIGN.md) · [ROADMAP.md](ROADMAP.md)

## Conventions

This log is **append-only**. A past entry's decision text is never rewritten. A change of
direction is recorded as a *new* entry that names what it changes ("amends D-3",
"supersedes D-7"); the only edit permitted to an existing entry is appending an italic
*Later updated by: …* trailer pointing forward.

Identifiers are `D-n` for design decisions and `N-n` for implementation notes. Every entry
records the reasoning, not just the outcome — the *why* is the part a later session cannot
reconstruct. Entries marked **Forrest's call** are genuine forks that were presented with
options and decided by the project owner.

A topic index (`DECISIONS-INDEX.md`) will be added once the log grows past roughly twenty
entries; below that size the log is faster to read whole.

---

## D-1 — Peer-to-peer connectivity via WebRTC with manual signaling

**Date:** 2026-08-05 · **Forrest's call**

**Context.** The stated ideal was a file you click that connects to another player with no
server at all. WebRTC can deliver a genuine direct connection from a `file://` page, but it
cannot *discover* the other peer without a signaling channel. Three options were put
forward: (A) zero server, with the players exchanging connection blocks by hand; (B) a
static page plus a serverless function and a key-value store, polled; (C) a static page
plus a WebSocket server holding authoritative game state.

**Decision.** Option A, with the explicit constraint that the design must make a later move
to Option B straightforward rather than a rewrite.

**Why.** The priority is a working demonstration quickly, and Option A is the only option
that requires no hosting account, no deployment step, and no vendor decision before the
first game can be played. The cost — a clumsy setup ritual, no reconnection without
re-handshake, and a minority of network pairs that will not connect — is acceptable for a
demonstration between two known people, and is bounded by the migration path.

**Consequences.** A free public STUN server becomes the project's sole external dependency,
so "zero server" is true of the project's own infrastructure but not literally true
(R-3). No TURN relay means some connections will fail outright and must fail *loudly*
(R-9). Peer network addresses are disclosed to each other (R-56). There is no referee,
so there is no anti-cheat story (R-58). Spectators and correspondence play are deferred.
The migration contract is written out in [DESIGN.md §9](DESIGN.md).

---

## D-2 — American draughts with three house modifications

**Date:** 2026-08-05 · **Forrest's call**

**Context.** Checkers is a family of games. American/English draughts and International
draughts differ in board size, king movement, and capture obligations sufficiently to
change the engine.

**Decision.** American/English draughts — 8×8, twelve pieces a side, men moving forward
only, non-flying kings, crowning ends the turn — modified so that capture is not
compulsory (R-39), the longest capture is not required (R-40), and there is no automatic
draw rule (R-42).

**Why.** The standard variant is the one both players already know. The modifications
remove the three rules that most often surprise casual players, at the cost of some
strategic depth that is not the point of this project.

---

## D-3 — A capture chain may be abandoned at any point

**Date:** 2026-08-05 · **Forrest's call**

**Context.** Standard rules compel completion of a jump chain once begun. With capture
itself made optional by D-2, it was unclear whether the obligation to *finish* a chain
survived.

**Decision.** A player may stop a capture chain after any hop. The interface offers
continuation as the obvious default — the next hop is highlighted, and ending the turn
requires a deliberate action — but never forces it.

**Why.** Internal consistency with D-2: compelling completion of an optional capture is
incoherent. It is also less code than the alternative.

**Consequences.** Larger than it appears. Every prefix of every jump chain becomes a
legal move in its own right, which the move generator must emit directly (see D-8) so that
the engine remains the single authority on legality.

---

## D-4 — Draws by agreement only, with a non-binding advisory

**Date:** 2026-08-05 · **Forrest's call**

**Context.** D-2 removed automatic draw detection, which leaves a game theoretically
endless.

**Decision.** A draw occurs only when one player offers and the other accepts (R-20).
After forty moves by each side with no capture and no promotion, the interface displays a
suggestion that the position may be drawn (R-21). The suggestion never ends the game.

**Why.** It respects the decision to remove forced draws while giving players an obvious
exit from a dead position. Advisory rather than binding keeps the rule out of the engine,
where it would otherwise be the only rule that depends on history rather than position.

---

## D-5 — Transport abstraction, move intents, and client-side validation

**Date:** 2026-08-05

**Context.** D-1 accepted a transport that is expected to be replaced. Without deliberate
structure, peer-to-peer assumptions leak throughout an application and make the
replacement a rewrite.

**Decision.** Four commitments. The application talks to the network only through a
`Transport` interface, with signaling behind a separate `Signaler` interface. Messages
carry move *intents* — origin, path, captures — never board snapshots. Every message
carries a monotonic sequence number and the sender's hash of the resulting position. Each
client validates every inbound move against its own engine and rejects anything illegal.

**Why.** Each of these is independently useful now and is exactly what a server would need
later. Client-side validation is the load-bearing one: because both peers already act as
referees, adding a real referee is additive rather than disruptive — the server runs the
same engine module unchanged.

**Consequences.** [DESIGN.md §9](DESIGN.md) states the complete migration surface. If a
future session finds itself modifying `engine/`, `game/`, or `ui/` in order to introduce a
server, that is a defect in this design rather than unavoidable work.

---

## D-6 — DOM rendering, TypeScript, Vite, and no UI framework

**Date:** 2026-08-05

**Context.** The board could be drawn on a canvas or from DOM elements, and the
application could be built with or without a UI framework.

**Decision.** DOM elements positioned by CSS transform and animated with the Web
Animations API; TypeScript compiled by Vite; Biome for formatting and linting; no UI
framework.

**Why.** Accessibility decides the first question. WCAG 2.2 AA with full keyboard operation
and screen-reader support (R-45 to R-50) comes largely for free with real DOM elements and
would have to be rebuilt from nothing over a canvas. Animating transforms keeps the work on
the compositor, so DOM costs nothing in smoothness at this scale. On the second question,
the application is essentially one bespoke animation-heavy component, which is the case
where a framework's rendering model interferes rather than helps — and it keeps the
dependency count near zero, which the single-file build budget (R-54) also rewards.

---

## D-7 — Logical sides are separate from display colours

**Date:** 2026-08-05

**Decision.** The engine and protocol know only two logical sides, named Black and White
after PDN convention, with Black on squares 1–12 and moving first. Each player's chosen
piece colour is a presentation mapping applied at render time.

**Why.** Both players choose their own colours independently (R-25), so colour cannot
identify a side. Keeping the logical identity fixed means notation, export, the state hash,
and any future replay all remain coherent regardless of what the players picked — including
the case where both pick nearly the same colour and one is asked to change.

---

## D-8 — The move generator emits capture-chain prefixes as first-class moves

**Date:** 2026-08-05

**Decision.** Following D-3, the generator emits every prefix of every jump chain as a
distinct legal move, rather than emitting maximal chains and letting the interface
synthesise the stopping points.

**Why.** The engine must be the single authority on legality (R-59). If the interface
synthesised partial chains, then the interface, the inbound-move validator, and the AI
would each need their own copy of that logic, and they would eventually disagree. Emitting
prefixes costs a few lines in one place and guarantees all three see an identical move set.

---

## D-9 — Contrast validation at selection, plus a non-colour side marker

**Date:** 2026-08-05

**Context.** Independent colour choice by both players creates three failure modes: two
similar choices, a choice that disappears against the board, and reliance on colour alone
to convey ownership.

**Decision.** Colour selection offers colour-vision-safe presets plus a free picker,
validated live against a 3:1 minimum contrast ratio with both board square colours and with
the opponent's colour; failing choices are refused at the point of selection. Independently,
one logical side's pieces always carry a non-colour marker. When both players' choices
clash, the **joiner** yields.

**Why.** Refusing at selection is honest, whereas silently adjusting a chosen colour is
confusing. The marker satisfies the requirement that meaning never rest on colour alone
(R-27) and is attached to the logical side (D-7) so it stays stable across the two mirrored
boards. Making the joiner yield is an arbitrary but *deterministic* tie-break, so both
clients reach the same conclusion with no negotiation round.

---

## D-10 — A trivial AI in v1

**Date:** 2026-08-05 · **Forrest's call**

**Decision.** The v1 computer opponent takes a capture when one is available, preferring
the longest chain, and otherwise moves at random from a seeded source. A search-based
opponent is deferred to a ticket.

**Why.** Its purpose in v1 is to exercise the rules engine and to make solo demonstration
possible, not to provide a challenge. It is roughly thirty lines. Because move generation
already exists and positions are immutable, upgrading to a depth-limited search later is
contained behind the same interface.

---

## D-11 — Spectators deferred to the server transport

**Date:** 2026-08-05 · **Forrest's call**

**Decision.** Read-only spectators are removed from v1 and revisited if and when the
transport described in [DESIGN.md §9](DESIGN.md) is adopted.

**Why.** Spectators were proposed while a server was under consideration, where they are
nearly free. Under D-1 each spectator needs an additional peer connection and its own
signaling exchange, which is disproportionate for a demonstration.

---

## D-12 — Two build outputs from one source

**Date:** 2026-08-05

**Decision.** The build produces both an ordinary static output for hosting and a
single-file output with all script, style, and assets inlined into one HTML document that
runs from `file://`.

**Why.** R-1 and R-2 both stand: the file is the deliverable the project was asked for, and
the hosted URL is what makes live testing and the R-8 link convenience possible. Producing
both from one source keeps them from diverging. Inlining is a build concern only and
touches no application code.

---

## D-13 — Repository `fthiess/checkers-demo`, public

**Date:** 2026-08-05 · **Forrest's call**

**Decision.** The repository is named `checkers-demo` to match the working directory.

**Consequences.** The repository is publicly viewable, so no personal information belongs
in the tree, in commit messages, or in pull request titles and bodies — including in test
fixtures and recorded games, where a real name arriving as attribution is the usual leak
path.

---

## D-14 — A compressed design stage

**Date:** 2026-08-05 · **Forrest's call**

**Context.** The methodology's default is a multi-session design stage followed by an
adversarial review pass conducted by fresh sessions with no prior context.

**Decision.** The design stage is compressed into a single session producing all four
documents, and the formal adversarial review is skipped for now.

**Why.** The project is small and the goal is a quick demonstration; spreading the design
across sessions would cost more than it returns. The decision is revisited if the project
outgrows the demonstration — in particular, adopting the server transport of
[DESIGN.md §9](DESIGN.md) would reintroduce a security and data-integrity surface that
warrants the review pass.

---

## D-15 — GitHub Pages is the hosting target

**Date:** 2026-08-05 · **Forrest's call**

**Context.** R-2 requires the hosted build, and D-1 was chosen partly because it needed *no
vendor decision before the first game could be played*. Phase 0.5 is where that deferral
comes due. The options were GitHub Pages, Netlify, and Cloudflare Pages.

**Decision.** GitHub Pages, deployed by the same GitHub Actions workflow that runs the gate.

**Why.** No new account, no API credentials in repository secrets, and exactly one CI system
to keep in sync. The repository is already on GitHub and already public (D-13), so Pages adds
no new exposure and no new operational surface.

**Consequences.** There are no per-PR deploy previews, which Netlify and Cloudflare would
have given. For two people live-testing a demonstration this is a small loss: the branch is
testable locally and `main` is testable at the public URL. The hosted build sits at a project
subpath (`/checkers-demo/`), so all asset URLs are relative — which the single-file build
needs anyway to work from `file://` (R-52).

---

## D-16 — TypeScript 7, the native compiler

**Date:** 2026-08-05 · **Forrest's call**

**Context.** At the time the toolchain was chosen, npm's `latest` for TypeScript was 7.0.2 —
the native Go port, released 2026-07-08, reporting eight- to twelvefold faster builds and
still invoked as `tsc`. The last JavaScript-based release was 6.0.3 from April 2026.

**Decision.** TypeScript 7.

**Why.** Every breaking change from 6 is something a greenfield ES2022 browser project would
never use: `target: es5`, AMD/UMD/SystemJS modules, `baseUrl`, `moduleResolution: classic`,
and the deprecated downlevel-iteration flags. Nothing else in the stack type-checks — Vite
and Vitest strip types rather than checking them, and Biome does not type-check at all — so
the blast radius is `tsc --noEmit` and the editor, which is about as contained as a compiler
choice gets.

**Consequences.** If the native compiler turns out to have a rough edge this project trips
over, `@typescript/typescript6` installs the old compiler side by side as `tsc6` without
disturbing anything else. The risk is bounded and the escape hatch is one line of
`package.json`.

---

## D-17 — The licence keeps its named copyright holder

**Date:** 2026-08-05 · **Forrest's call**

**Context.** D-13 makes this a public repository with no personal information anywhere in
it. `LICENSE` names a copyright holder, which is a real name in a public tree — an apparent
contradiction that was left open at the end of the design session.

**Decision.** The name stays.

**Why.** A copyright holder is an assertion of authorship, not a disclosure: it is the one
place in an open-source repository where a real name is doing necessary work, and it is
already public on the account that owns the repository. D-13's rule is aimed at names that
arrive incidentally — quoted from a bug report, embedded in a test fixture, carried in a
commit message — and it stands unchanged everywhere else in the tree.

---

## N-1 — Rolldown ignores mutation of the output bundle

**Date:** 2026-08-05

**Note.** Vite 8 bundles with Rolldown rather than Rollup, and `build.rollupOptions` is now
an alias for `build.rolldownOptions`. A Rollup-idiomatic plugin that re-keys the bundle map
inside `generateBundle` — `delete bundle[old]` followed by `bundle[new] = asset` — does not
work: Rolldown warns that assignment to the bundle variable is unsupported and *ignores the
assignment while honouring the delete*, so the file silently disappears from the output. The
single-file build produced an empty `dist-single/` for exactly this reason before the plugin
was rewritten to rename on disk in `writeBundle`.

**Why it is written down.** The failure is silent and the warning scrolls past in a
successful-looking build. `vite-plugin-singlefile` itself works correctly under Rolldown;
the landmine is in bundle-mutating plugins written from Rollup habits.

---

## D-18 — `main` is protected, admins included

**Date:** 2026-08-05 · **Forrest's call**

**Decision.** `main` requires the `verify` status check as a *strict* check — the branch must
be up to date before merging — with `enforce_admins` enabled, and force pushes and branch
deletion disabled.

**Why.** The methodology allows merging on green without a human pause for ordinary changes,
but only in repositories where continuous integration enforces the *full* verification gate
and branch protection requires it. Without that, "CI green" and "verified" are different
claims and the relaxation has no foundation. `enforce_admins` is the load-bearing part: with
admin bypass open, the protection is a suggestion, and the person most likely to bypass it is
the one person who can.

**Consequences.** Nothing reaches `main` except through a pull request whose gate passed,
including changes made by the repository owner. Because force pushes are disabled, a mistake
that lands on `main` is corrected by a revert rather than by rewriting history — which is the
right trade for a public repository whose commit SHAs are cited from issues and pull requests.

⚠ This configuration lives in repository settings, outside the tree, where no test can assert
it. It is recorded here because that is the only place it can be. If a later session finds
merge-on-green behaving as though the gate were advisory, check the protection first.
