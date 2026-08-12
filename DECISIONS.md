# Decision Log — Checkers Demo

**Companion documents:** [REQUIREMENTS.md](REQUIREMENTS.md) · [DESIGN.md](DESIGN.md) · [ROADMAP.md](ROADMAP.md)

## Conventions

This log is **append-only**. A past entry's decision text is never rewritten. A change of
direction is recorded as a *new* entry that names what it changes ("amends D-3",
"supersedes D-7"); the only edit permitted to an existing entry is appending an italic
*Later updated by: …* trailer pointing forward.

Identifiers are `D-n` for design decisions and `N-n` for implementation notes. Every entry
records the reasoning, not just the outcome — the *why* is the part a later session cannot
reconstruct. An attribution marks a genuine fork that was presented with options and decided,
rather than a conclusion that was derived.

Entries are attributed **by role and never by name** — "Session owner's call", meaning whoever
drove the session that recorded it — because this repository is public and contributors have
not consented to being identified in it (D-19). Entries D-1 through D-18 predate that
convention and keep their original attribution, since the log is append-only.

The log has passed twenty entries, so **[DECISIONS-INDEX.md](DECISIONS-INDEX.md) is now the
read-first artifact**: consult it and jump to the few entries that govern your surface, rather
than reading this file whole. Update the index in the same pull request as any append here.

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

*Later updated by: N-2.*

---

## N-2 — Branch protection did not block a merge with no reported status check

**Date:** 2026-08-06

**Note.** On a second collaborator's first session, opening pull request #13 did not
trigger the `Verify` workflow's `pull_request` event, and merging it did not trigger the
`push` event on `main` either — despite every prior PR and push in this repository's
history triggering `Verify` within about 20 seconds. The `verify` check therefore never
reported. Despite D-18's `enforce_admins` configuration, `gh pr merge` completed the merge
anyway with no error, moving `mergeStateStatus` from `BLOCKED` straight to `MERGED`. A full
local run of `npm run verify`, `npm run build`, and `npm run build:single` on the resulting
`main` (commit 6c3cff9) confirmed the merged code was sound, but the protection did not do
the job D-18 records for it.

**Why it is written down.** D-18 names this exact failure mode as the thing to check for:
"if a later session finds merge-on-green behaving as though the gate were advisory, check
the protection first." This entry is that check, and it did not turn up clean. Root cause
is undiagnosed — it requires the repository owner's admin access to Settings → Actions and
Settings → Branches, which a collaborator does not have. [Issue #14][i14] tracks it.

**Consequences.** Until issue #14 is resolved and confirmed, merge-on-green (D-19) should
not be relied upon. Treat every merge as needing the session owner's explicit go-ahead
regardless of change tier.

[i14]: https://github.com/fthiess/checkers-demo/issues/14

*Later updated by: N-3 — this entry's diagnosis was incorrect; see N-3.*

---

## N-3 — N-2 was a false alarm; the check had already passed

**Date:** 2026-08-07

**Note.** N-2 concluded that branch protection let PR #13 merge despite the `verify` check
never having reported. Closer inspection of the run's own timestamps shows this was wrong:
the `pull_request` run for that branch (run 31130882535) completed successfully at
`23:25:00Z`, nearly two minutes before the merge at `23:26:57Z`. The check had reported;
branch protection worked correctly. What actually happened was a several-minute delay
between a run completing and it becoming visible via `gh api .../actions/runs` and the
PR's Checks tab — the session that wrote N-2 diagnosed from that stale listing rather than
the run's actual state, and [issue #14][i14] was filed on the same mistaken premise.

**Why it is written down.** N-2 and issue #14 both asserted a broken gate, in writing, with
specifics. Neither held up. The record should say so as plainly as it asserted the
original claim — a later session skimming the index should not be left trusting a retracted
finding because only the retraction is quiet.

**Consequences.** Merge-on-green (D-19) is not suspended after all; there is no evidence
D-18's protection needs attention. Issue #14 is closed. If a future session sees the same
symptom — a PR shows no checks in the listing API or the Checks tab — check the run's own
`created_at`/`updated_at` timestamps before concluding CI didn't run; the listing surfaces
can lag behind a run's actual completion by a few minutes.

[i14]: https://github.com/fthiess/checkers-demo/issues/14

---

## D-19 — The project is delegated, and decisions are attributed by role

**Date:** 2026-08-05 · **Session owner's call**

**Context.** The project moves from one author to three contributors with Write access. Two
things had to be settled: who satisfies the methodology's approval gates, and how decisions
are attributed in a log that until now said "Forrest's call."

**Decision.** Full delegation. **The session owner — whoever is driving a given session —
approves that session's plan, decides its design forks, and live-tests its outcome.** No
approval routes elsewhere and no gate is satisfied by anyone's absence. `main` requires no
approving review; a green gate plus the Gate 3 review round remains the quality check, so a
contributor may merge their own pull request once it is green (amends nothing in D-18, which
stays exactly as configured).

**Decisions are attributed by role — "Session owner's call" — never by name.**

**Why.** Delegation without decision authority is not delegation; it makes the original author
a bottleneck on every parallel workstream, which is the thing the handoff exists to relieve. A
review requirement was considered and rejected for the same reason: with a small team it would
block more often than it would catch, and the audit loop — reading `git log` on `main` at each
live test — recovers the oversight after the fact at far lower cost.

Role attribution is a direct consequence of D-13. This repository is public, and contributors
have not consented to being identified in it; a first name plus a public repository plus a git
commit email is an identification. The git history already records who did what, for anyone
with a legitimate reason to look, without publishing it in prose.

**Consequences.** Entries D-1 through D-18 keep their original "Forrest's call" attribution —
the log is append-only, and the project owner's name is already public here by D-17. The
convention changes going forward, not retroactively. Contributors set a GitHub `noreply`
address before their first commit so commit metadata does not undo the rule; `CONTRIBUTING.md`
carries that instruction, because it is the one piece of setup that cannot be fixed afterwards.

**The audit loop is now load-bearing.** With three people merging on green, reading `main`'s
log at each live test is the only place a surprising change gets caught. Anything surprising
means the merge criteria tighten.

---

## D-20 — The vendored methodology is the project's own, and no longer tracks its upstream

**Date:** 2026-08-05 · **Session owner's call**

**Context.** `.claude/skills/dev-workflow/` arrived as a snapshot of a personal methodology
written for a single author. It named that author throughout, routed every approval to him,
described a different project's CI and tracker, and instructed sessions to diff the copy
against a clone on his machine and offer to resync.

**Decision.** The vendored copy is adapted for this project and this team, and stops tracking
its upstream. Approvals are role-based, the tracker is GitHub issues, and the CI and merge
facts are this repository's. It is changed here, in a pull request, like any other project
document.

**Why.** A methodology that names one person and routes decisions to him does not merely read
oddly on a contributor's machine — it actively mis-instructs, because their assistant will
read it literally and wait for someone who is not in the session. Keeping the sync
relationship would mean either re-personalising on every pull or maintaining a permanent
diff, and neither is worth it for a document that is now describing a different team's
practice.

**Consequences.** Improvements made here do not automatically reach the upstream, and vice
versa. If a genuinely general improvement is made in this copy, it is worth porting by hand —
but that is a deliberate act, not a background expectation. The freshness check that used to
run at skill invocation is removed; nothing now compares this file to anything.

## D-21 — `protocol/` holds the transport contract that `game/` and `net/` share

**Date:** 2026-08-11 · **Repository owner's call** (recorded on
[issue #6](https://github.com/fthiess/checkers-demo/issues/6))

**Context.** §1's diagram drew an arrow from `game/` to `net/`; §2's table allowed `game/`
only `engine/`. The lint rules followed the table, because the table is the more precise
statement. The disagreement was not academic: the session state machine sends moves through
a `Transport`, and `Transport` was declared in `net/`, so the very first line of task 1.1
would have been a lint error. Issue #6 offered three ways out — let `game/` import types
from `net/`, move the shared types to a module of their own, or have `game/` declare its own
structural port that `net/`'s implementation happens to satisfy.

**Decision.** A new `protocol/` module holds the `Transport` and `Signaler` interfaces, the
message schema, and the protocol version. `game/` and `net/` may both import it. `net/`
keeps the implementations — the codec, the WebRTC transport, the manual signaler. `protocol/`
may import `engine/`'s types and nothing else. `ui/` may not import it: connection status
reaches the interface through `game/`.

**Why.** The issue listed the type-import concession first, and it is the smaller diff, but
it settles the symptom rather than the question. `Transport` is not a `net/` concept that
`game/` happens to need — it is the boundary *between* them, and a boundary owned by one of
the two parties is a boundary that drifts toward that party. Naming it as its own module
makes the contract a thing that can be read, versioned, and reviewed on its own, and makes
"what crosses this line" answerable by listing a directory. The structural-port option
preserves the same property with more ceremony and two definitions to keep in step.

Letting `protocol/` reach `engine/`'s types is deliberate: a `move` message carries square
indices, and one definition of a square shared by the rules and the wire format is worth
more than the purity of a zero-dependency module. `engine/` imports nothing, so the arrows
still point downward.

**Consequences.** §1's diagram and §2's table now say the same thing, and neither draws a
`game/ → net/` arrow. `biome.json` gains a `src/protocol/**` override, and every other
module's list gains `protocol/` on the permitted or forbidden side — checked by hand against
deliberate violations from `protocol/` to `net/`, from `ui/` to `protocol/`, and from
`engine/` to `protocol/`, all three of which the linter refused. The migration contract in §9
is untouched and slightly strengthened: the module a future `HttpPollingTransport` must
satisfy is now a named, self-contained thing rather than a shape embedded in the peer-to-peer
implementation. Issue #6 is closed.

---

## D-22 — The transport speaks SDP; the signaler owns the block encoding

**Date:** 2026-08-11 · **Session owner's call**

**Context.** §4.5 describes what a person actually carries between the two browsers: a
compressed, base64url-encoded block, pasted into a chat window or an email. `protocol/`
declares that shape as `Signaler`, whose three methods take and return a `SignalBlob`
string. Task 1.2 had to build the WebRTC end of the same handshake, and the obvious
shortcut was to have `WebRtcTransport` implement `Signaler` directly — one object, one set
of three methods, no second type to keep in step.

**Decision.** It does not. `WebRtcTransport` extends `Transport` with its own
`createOffer`/`acceptOffer`/`acceptAnswer`, and those three deal in
`RTCSessionDescriptionInit` — raw SDP. The compression, the base64url encoding, and the
`SignalBlob` type stay in `ManualSignaler` (task 1.3), which wraps the transport rather
than being it.

The peer connection itself is created through an injected factory,
`WebRtcTransportOptions.createPeerConnection`, defaulting to `new RTCPeerConnection(...)`.

**Why.** The block format belongs to the channel a human carries it through, not to the
connection. Every property the format has — that it survives an email client re-flowing
whitespace, that it is short enough to paste — is a fact about email and chat windows, and
none of it is a fact about WebRTC. Fusing them would mean a future `ServerSignaler`
(D-1's migration path, §9) either inherits an encoding it has no use for or forces a change
to the transport to shed it, and §9's whole claim is that the transport swap does not reach
into anything else.

The injected factory is a testability decision with only one available answer:
`RTCPeerConnection` does not exist outside a browser, and this project adds no dependency
to simulate one (the standing preference for minimal dependencies, and every dependency on
a public repository being a supply-chain surface). Injection is therefore the only route to
unit tests that exercise the state machine at all.

**Consequences.** There are two layers where a shortcut would have left one, and task 1.3
must keep them in step: `SignalBlob` in and out at the `Signaler` boundary,
`RTCSessionDescriptionInit` in and out at the transport's. In exchange, `net/` can be
unit-tested headlessly with no browser and no `jsdom`, and the uncompressed offer measured
in 1.2 (~1050 characters, against §4.5's ~1000-character estimate for a *compressed* one)
is a problem confined entirely to the signaler.

---

## D-23 — One public STUN server, configurable; still no TURN

**Date:** 2026-08-11 · **Session owner's call**

**Context.** ICE gathering needs at least one STUN server to learn the peer's public
address, and the transport had to name a default. D-1 chose peer-to-peer WebRTC with no
server of the project's own, which rules out running one.

**Decision.** `stun:stun.l.google.com:19302`, exposed as
`WebRtcTransportOptions.iceServers` so any caller can replace it. No TURN relay, unchanged
from D-1 and §4.5.

**Why.** It is the conventional public default, needs no key or account, and nothing is
load-bearing on it: if it is unreachable, gathering yields host candidates only, which is
the same degraded case D-1 already accepted by declining TURN. Making it configurable
costs one option field and means a later decision to point elsewhere is not a code change
in `net/`.

On privacy (R-56): a STUN server learns only that some client is gathering candidates, and
its address. It never sees a move, a board, or a player. That is a strictly smaller
disclosure than the one the design already makes — the two peers exchange their own direct
addresses with each other, by hand, and that exchange is the point of the architecture
rather than an incidental leak.

**Consequences.** Two peers behind symmetric or carrier-grade NAT may fail to connect at
all, with no relay to fall back on. This is the risk D-1 took knowingly and the reason the
phase's live test must use two genuinely separate internet connections rather than two
routers on one; a success across one connection proves paths that do not exist between two
houses. If that test fails, the decision to reconsider is D-1's, not this entry's.

---

## N-4 — `TransportStatus` is not `connectionState` renamed

**Date:** 2026-08-11

**Note.** §4.1's six `TransportStatus` values map one-to-one onto
`RTCPeerConnection.connectionState`'s six — `new`→`idle`, `connecting`→`connecting`,
`connected`→`connected`, `disconnected`→`reconnecting`, `failed`→`failed`,
`closed`→`closed` — and the resemblance is close enough to invite simplifying the mapping
away. There is one deliberate exception. A peer connection reports `connected` while its
data channel is still opening, so the transport publishes `connecting` until
`channel.readyState === "open"`, and only then `connected`.

**Why it is written down.** `send` throws before the channel opens. A status recomputed
from `connectionState` alone therefore produces a window — short, and longer on a slow
network, which is exactly when a user is watching the indicator — in which the interface
says "connected" beside a send path that does not exist. The bug it causes is
intermittent, timing-dependent, and would be blamed on the network rather than on the
mapping.

**Consequences.** `currentStatus()` in `src/net/webrtc-transport.ts` is the single place
this is decided, and it consults both the connection and the channel. Anything that
recomputes status from `connectionState` elsewhere reintroduces the gap. Note also that
`closed` is checked before the switch: an explicit `close()` reports `closed` immediately
rather than waiting for the connection to catch up.

---

## D-24 — The block envelope carries an encoding marker and a session id, and nothing yet about the player

**Date:** 2026-08-12 · **Session owner's call**

**Context.** §4.5 describes the offer block as "the offer, the creator's name and colour, a
session id, and the protocol version … packed into one JSON object, compressed, and rendered
as a base64url block", with a fallback to uncompressed where `CompressionStream` is
unavailable. Task 1.3 had to turn that sentence into a format. Two things it does not settle
came up immediately, and one thing it specifies could not be built.

**Decision.** The envelope is `{ v, kind, session, sdp }`, and:

1. **A single leading character outside the base64url payload states the encoding** — `C`
   for deflate-raw, `U` for uncompressed.
2. **`kind` distinguishes an offer block from an answer block**, and `session` is echoed by
   the joiner and checked by the creator.
3. **The creator's display name and colour are not in it yet.** They join the envelope in
   Phase 4/5, when a player can actually choose them.

**Why.** The marker is forced by the format: deflate-raw carries no header and no checksum
(RFC 1951), which is exactly why it is the shortest option and exactly why a compressed
payload cannot be told from an uncompressed one by inspection. §4.5 specifies the fallback
without specifying how a reader distinguishes the two, and it cannot be inferred, so it has
to be stated. Putting the marker outside the base64url means reading it costs no decoding.

`kind` and `session` exist for the person, not the protocol. The two failure modes of a
two-block ritual are pasting the wrong *kind* of block and pasting a block from a different
conversation, and both otherwise surface as a connection that never opens — the least
diagnosable outcome available. With these two fields each becomes a sentence naming the
mistake (R-7).

Name and colour are omitted because nothing can populate them: `VIEWING_SIDE` is hardcoded,
colour selection is task 4.5, and there is no name input anywhere. Shipping the fields now
would mean encoding a guess about a screen nobody has designed, and the envelope is
versioned precisely so that adding them later is an ordinary change rather than a migration.
This is a deliberate deviation from §4.5's list, recorded rather than silently absorbed.

**Consequences.** The block format is `src/net/signal-block.ts`'s business alone, and the
transport never sees one (D-22). A future `ServerSignaler` inherits none of this. When Phase
4/5 adds name and colour, `PROTOCOL_VERSION` decides whether old blocks are still readable —
today's decoder rejects any `v` it does not recognise, which is the behaviour that makes that
choice available rather than forced.

---

## N-5 — Secure-context APIs are not available to the deliverable R-1 actually describes

**Date:** 2026-08-12

**Note.** Two obvious choices for this task are restricted to secure contexts:
`crypto.randomUUID` for the session id, and `navigator.clipboard.writeText` for the copy
control (R-5). R-1's primary deliverable is a single file opened by double-click from a
desktop, which is a `file://` origin — and whether `file://` counts as a secure context is a
per-browser judgement, not a specification guarantee.

Neither is used as though it will be there:

- The session id is drawn from `crypto.getRandomValues`, which carries no such restriction.
- The copy control tries `navigator.clipboard.writeText` and, on any rejection, selects the
  text and tells the reader to press Ctrl+C or ⌘C. Both paths were exercised — the fallback
  fires whenever the write is refused, including when there is no user activation behind it.

**Why it is written down.** Both would have worked perfectly in every test performed against
the dev server over `http://localhost`, which *is* a secure context, and failed only in the
distribution form the project cares about most. That is the shape of bug that reaches an
acceptance pass intact. Anything else reaching for a browser API in this codebase should
check its secure-context requirement against `file://` before relying on it.

**Consequences.** `dist-single/checkers.html` remains self-contained and within budget (25.6
kB against 1000 kB). The `file://` distribution form has still not been opened by hand this
session — the reasoning above is what makes that safe to defer to the phase live test rather
than a claim that it was checked.

---

## D-25 — The session owns the position, and both players' moves reach it the same way

**Date:** 2026-08-12 · **Session owner's call**

**Context.** Task 1.4 asked for "a static board with one draggable token whose position is
echoed to the other side." It was written before Phase 3 existed. By the time it came up,
3.1–3.5 had already built the full board — drag, click, keyboard, legal-move highlighting,
announcements — against the real engine, so the literal deliverable was *behind* what was
already there and building it would have meant building a throwaway. What was genuinely
missing was the thread the task exists for: nothing sent a move anywhere.

The position also had no owner. `main.ts` held it in an `InputState` alongside the
selection, which is fine for one player and impossible for two.

**Decision.** A new `game/` module holds `createSession`, which owns the position and is the
only thing that moves it. A move made locally is applied and sent; a move arriving from the
opponent is applied and published to subscribers. `main.ts` keeps only the selection and the
focus ring, and reads the position back from the session.

Three consequences settled with it:

1. **Inbound moves are recovered, not reconstructed.** A received payload is matched against
   `generateMoves` for the current position, and the engine's own `Move` is what gets
   applied.
2. **A local move whose `send` throws stays applied locally.** The channel closing between
   picking a piece up and putting it down does not roll the move back.
3. **`attemptMove` is removed from `ui/input.ts`.** `findMove` plus the session covers it.

**Why.** Two clients showing one board need one thing that owns that board, and `game/` is
the module the dependency table already reserved for it — this is what D-21 built `protocol/`
for, so that `game/` could name a `Transport` without importing `net/`. The composition root
now wires the panel to the session in one line, and that line is the whole of what §9's
migration would touch. Leaving the position in `main.ts` would have put transport-aware game
state in the one place DESIGN §9 warns about.

Recovery by matching is not a validation decision — it is how `promotes` comes back at all.
The wire carries `from`, `path`, and `captured` (§4.2) but not `promotes`, because whether a
move crowns is the engine's conclusion rather than the mover's claim. Deriving it out here
would duplicate the crowning rule somewhere it could drift from the engine's copy. That
matching *also* means a move matching nothing is ignored is a side effect, and **ignoring is
not rejecting** — see below.

Keeping a move that failed to send is the lesser of two wrongs. The move was legal and the
player made it; discarding it would rewrite the board under someone who watched their own
piece land, to fix a problem the status line is already reporting (R-9). Letting the
exception escape instead would break the input handler mid-gesture.

`attemptMove` had no caller once the session applied moves, and it re-ran `findMove`
internally while `main.ts` had already called it — a redundancy that predated this change.
Its tests moved to `findMove`, which is where the behaviour they actually pinned down (a drop
resolving to a chain *prefix*, R-41) lives.

**Consequences.** The board is in sync because the session keeps it so, verified across five
alternating moves with both sides' announcements matching. **Task 3.6 is now validation
only** — R-57's rejection of an illegal inbound move with a report to the player, and R-35's
halt on a state-hash divergence. Neither exists yet: an unrecognised move is silently
ignored, and the hash is sent with every move but read by nobody. `game/`'s lint override was
already present from D-21 and was confirmed to reject an import from `net/` before this
module was written, rather than assumed to.

---

## N-6 — `render()` gained a second caller, and it was not written for one

**Date:** 2026-08-12

**Note.** Until task 1.4, `main.ts`'s `render()` only ever ran because of something the local
player had just done. Two things it does were correct on exactly that assumption, and both
became bugs the moment an opponent's move could call it:

1. **It restored focus unconditionally.** Correct when the player had just pressed a key on
   the board; wrong when the trigger came down the wire, where it drags focus out of whatever
   the player was actually using. Observed: focus sitting on the connection panel's Copy
   button jumped to a board square the instant the opponent moved. `render()` now reads
   whether focus was inside the board *before* replacing the subtree, and restores it only
   then.
2. **It rebuilt the board mid-gesture.** Rebuilding detaches the element the pointer is
   captured to, which silently kills a drag in progress — and because `dragOrigin` survived,
   the player's eventual pointerup still committed a move, against a board that had changed
   underneath them. The inbound handler now abandons the gesture first, which makes that
   pointerup a no-op.

**Why it is written down.** This is the fourth time this project has been bitten by
`render()` rebuilding everything — after the drag in 3.2, keyboard focus in 3.4, and the live
region in 3.5 — and the first time the trigger was not a local interaction. That is the part
worth carrying forward: the earlier three were all found by using the interface, and this one
could not be, because it needs a second person moving at the wrong moment. Anything added to
that handler from here should assume it can fire at *any* time, including halfway through
someone's gesture.

**Consequences.** `abandonDrag()` exists for exactly this and is deliberately render-free, so
callers decide when the rebuild happens. The focus restore is now conditional, which does not
weaken R-46: focus was already on the board in every case the guarantee is about, and the
condition only suppresses the case where moving it was never wanted. Verified after the fix:
focus stayed on the Copy button through an opponent's move, an abandoned drag's pointerup
committed nothing, and keyboard navigation and its focus restoration still work across
renders.
