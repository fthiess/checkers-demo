# Decision Index — Checkers Demo

**Companion documents:** [DECISIONS.md](DECISIONS.md) · [REQUIREMENTS.md](REQUIREMENTS.md) · [DESIGN.md](DESIGN.md) · [ROADMAP.md](ROADMAP.md)

Read this first, then jump to the few entries that govern the surface you are about to touch.
Do not read the full log into context — that is the whole point of this file.

`D-n` are design decisions; `N-n` are implementation notes. Where a subsystem has a chain, the
last entry is the currently-authoritative one. N-2 was retracted by N-3 as a false alarm —
see the merge policy row below.

Update this index in the same pull request as any append to the log.

## By subsystem

| Subsystem | Governing decisions |
| --- | --- |
| **Connectivity and transport** | [D-1](DECISIONS.md#d-1--peer-to-peer-connectivity-via-webrtc-with-manual-signaling) → [D-5](DECISIONS.md#d-5--transport-abstraction-move-intents-and-client-side-validation) → [D-11](DECISIONS.md#d-11--spectators-deferred-to-the-server-transport) → [D-21](DECISIONS.md#d-21--protocol-holds-the-transport-contract-that-game-and-net-share) → [D-22](DECISIONS.md#d-22--the-transport-speaks-sdp-the-signaler-owns-the-block-encoding) → [D-23](DECISIONS.md#d-23--one-public-stun-server-configurable-still-no-turn) → [D-24](DECISIONS.md#d-24--the-block-envelope-carries-an-encoding-marker-and-a-session-id-and-nothing-yet-about-the-player) *(current)*, with [N-4](DECISIONS.md#n-4--transportstatus-is-not-connectionstate-renamed) and [N-5](DECISIONS.md#n-5--secure-context-apis-are-not-available-to-the-deliverable-r-1-actually-describes) *(landmines)* |
| **Module boundaries** | [D-21](DECISIONS.md#d-21--protocol-holds-the-transport-contract-that-game-and-net-share) |
| **Rules of play** | [D-2](DECISIONS.md#d-2--american-draughts-with-three-house-modifications) → [D-3](DECISIONS.md#d-3--a-capture-chain-may-be-abandoned-at-any-point) → [D-4](DECISIONS.md#d-4--draws-by-agreement-only-with-a-non-binding-advisory) *(current)* |
| **Rules engine internals** | [D-8](DECISIONS.md#d-8--the-move-generator-emits-capture-chain-prefixes-as-first-class-moves) |
| **Sides, colour, and theme** | [D-7](DECISIONS.md#d-7--logical-sides-are-separate-from-display-colours) → [D-9](DECISIONS.md#d-9--contrast-validation-at-selection-plus-a-non-colour-side-marker) *(current)* |
| **Rendering and framework choice** | [D-6](DECISIONS.md#d-6--dom-rendering-typescript-vite-and-no-ui-framework) → [D-16](DECISIONS.md#d-16--typescript-7-the-native-compiler) *(current)* |
| **AI opponent** | [D-10](DECISIONS.md#d-10--a-trivial-ai-in-v1) |
| **Build and distribution** | [D-12](DECISIONS.md#d-12--two-build-outputs-from-one-source) → [N-1](DECISIONS.md#n-1--rolldown-ignores-mutation-of-the-output-bundle) *(landmine)* |
| **Hosting and deploy** | [D-15](DECISIONS.md#d-15--github-pages-is-the-hosting-target) |
| **Repository, privacy, and licence** | [D-13](DECISIONS.md#d-13--repository-fthiesscheckers-demo-public) → [D-17](DECISIONS.md#d-17--the-licence-keeps-its-named-copyright-holder) → [D-19](DECISIONS.md#d-19--the-project-is-delegated-and-decisions-are-attributed-by-role) *(current)* |
| **Merge policy and protection** | [D-18](DECISIONS.md#d-18--main-is-protected-admins-included) → ~~[N-2](DECISIONS.md#n-2--branch-protection-did-not-block-a-merge-with-no-reported-status-check)~~ → [N-3](DECISIONS.md#n-3--n-2-was-a-false-alarm-the-check-had-already-passed) → [D-19](DECISIONS.md#d-19--the-project-is-delegated-and-decisions-are-attributed-by-role) *(current)* |
| **Process and methodology** | [D-14](DECISIONS.md#d-14--a-compressed-design-stage) → [D-20](DECISIONS.md#d-20--the-vendored-methodology-is-the-projects-own-and-no-longer-tracks-its-upstream) *(current)* |

## Landmines

Decisions whose consequences bite silently, worth knowing before you touch the relevant area:

- **[N-1](DECISIONS.md#n-1--rolldown-ignores-mutation-of-the-output-bundle)** — Vite 8 bundles
  with Rolldown, which ignores assignment to the output bundle map while still honouring
  deletion. A Rollup-idiomatic plugin that re-keys the bundle makes the file vanish without
  failing the build.
- **[D-18](DECISIONS.md#d-18--main-is-protected-admins-included)** — branch protection lives in
  repository settings where no test can assert it, and the required check is matched by the
  `verify` job's *name*. Renaming that job silently removes the protection.
- **[D-1](DECISIONS.md#d-1--peer-to-peer-connectivity-via-webrtc-with-manual-signaling)** — the
  peer-to-peer transport was chosen on the explicit condition that moving to a client/server
  transport stays additive. Editing `engine/`, `game/`, or `ui/` to add a server is a design
  defect, not unavoidable work; [DESIGN.md §9](DESIGN.md) is the written contract.
- **[N-4](DECISIONS.md#n-4--transportstatus-is-not-connectionstate-renamed)** — `TransportStatus`
  looks like `RTCPeerConnection.connectionState` renamed, and is not. A peer connection reports
  `connected` before its data channel opens; recomputing status from `connectionState` alone
  gives you an interface saying "connected" beside a `send` that throws.
- **[N-5](DECISIONS.md#n-5--secure-context-apis-are-not-available-to-the-deliverable-r-1-actually-describes)** —
  `crypto.randomUUID` and `navigator.clipboard` are secure-context APIs, and R-1's deliverable
  is a `file://` document. Both work against `http://localhost` and may not work in the form
  the project cares about most, so check the requirement before reaching for a browser API.

## Open questions

- **[Issue #7](https://github.com/fthiess/checkers-demo/issues/7)** — the dependency rule has
  no automated guard until the module directories exist. `engine/`, `ui/`, `protocol/`, and
  `net/` now exist, so the rule is at least lint-checkable across four of the six; the guard
  that asserts it stays enforced is still owed.
