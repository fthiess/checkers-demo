# Project instructions — checkers-demo

Read [ROADMAP.md](ROADMAP.md) first to see what phase the project is in, then
[DECISIONS.md](DECISIONS.md) for the decisions that govern the surface you are about to
touch. [REQUIREMENTS.md](REQUIREMENTS.md) and [DESIGN.md](DESIGN.md) are the specification.

The development methodology is vendored at `.claude/skills/dev-workflow/` — invoke it
before any session that changes code or docs.

## This repository is public

No personal information belongs anywhere in it: not in the tree, not in commit messages,
not in pull request or issue titles and bodies, not in test fixtures or recorded games
(D-13). Write "the opponent", "a tester", "a player" instead of a name.

The trap is attribution — a real name arriving quoted from a bug report or a PDN file reads
as a citation rather than as personal information, which is exactly how it slips through.
Redact while writing the artifact, not afterwards: a commit message and a PR body are
published the moment they are pushed, and rewriting that history costs more than it
recovers.

The one exception is the copyright holder named in `LICENSE`, which is authorship rather
than disclosure (D-17).

## The dependency rule

Arrows point downward only ([DESIGN.md §1](DESIGN.md)). Violating this is how the project
loses the migration path to a client/server transport that D-1 was chosen on the strength
of.

| Module | May import |
| --- | --- |
| `engine/` | nothing |
| `game/` | `engine/` |
| `net/` | `engine/` (the state hash only) |
| `ai/` | `engine/` |
| `ui/` | `game/`, `engine/` (types) |
| `app/` | all — and it is the only module that knows which `Transport` is in use |

Anything that needs to cross does so through `game/`. Biome enforces this as a lint error;
if you find yourself editing `engine/`, `game/`, or `ui/` in order to change transports,
that is a design defect rather than unavoidable work — see [DESIGN.md §9](DESIGN.md).

## Verification

```
npm run verify
```

Runs type checking, lint, and unit tests. `npm run build` produces the hosted output in
`dist/`; `npm run build:single` produces the self-contained `dist-single/checkers.html` and
checks it for surviving external references and against the one-megabyte budget (R-1,
R-54). Both builds and the check run in CI on every pull request.

## Conventions

- The rules engine is pure — no rendering, network, storage, or timing (R-59).
- Logical sides (Black and White, PDN numbering) are distinct from each player's chosen
  display colour (D-7). Never conflate them.
- Accessibility is built in as each surface is written, not retrofitted: semantic HTML, full
  keyboard operation, visible focus, WCAG 2.2 AA contrast in light and dark, no meaning
  carried by colour alone, and honoured `prefers-reduced-motion`.
- Documentation is code. Decision-log entries, ROADMAP status, and doc updates land in the
  same pull request as the change they describe.
- Deferred work becomes a GitHub issue when it is discovered, never a TODO comment.
