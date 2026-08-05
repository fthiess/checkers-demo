# Project instructions — checkers-demo

Read [ROADMAP.md](ROADMAP.md) first to see what phase the project is in, then
[DECISIONS-INDEX.md](DECISIONS-INDEX.md) to find the decisions that govern the surface you
are about to touch — jump from it into those entries rather than reading
[DECISIONS.md](DECISIONS.md) whole. [REQUIREMENTS.md](REQUIREMENTS.md) and
[DESIGN.md](DESIGN.md) are the specification.

The development methodology is vendored at `.claude/skills/dev-workflow/` — invoke it
before any session that changes code or docs. It is this project's own copy and no longer
tracks any upstream (D-20). New contributors start at [CONTRIBUTING.md](CONTRIBUTING.md).

## This repository is public

No personal information belongs anywhere in it: not in the tree, not in commit messages,
not in pull request or issue titles and bodies, not in test fixtures or recorded games
(D-13). Write "the opponent", "a tester", "a player" instead of a name.

The trap is attribution — a real name arriving quoted from a bug report or a PDN file reads
as a citation rather than as personal information, which is exactly how it slips through.
Redact while writing the artifact, not afterwards: a commit message and a PR body are
published the moment they are pushed, and rewriting that history costs more than it
recovers — and force-push is disabled here, so it usually cannot be undone at all (D-18).

**Decisions are attributed by role, never by name** — "Session owner's call", not a person
(D-19). More than one person works in this repository now, and they have not consented to
being identified in it. The git history already records who did what.

**Commit metadata is a public surface too.** Your configured `user.name` and `user.email`
ship with every push. Set a GitHub `noreply` address before your first commit — see
[CONTRIBUTING.md](CONTRIBUTING.md).

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

One open question, issue #6: the table forbids `game/` from importing `net/`, but the session
state machine needs the `Transport` *type*, which is declared there. Settle it at task 1.1
rather than working around the lint rule.

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

## Coding norms

- Prefer the standard library and minimal dependencies. Every dependency added is a
  changelog someone has to read at upgrade time, and a supply-chain surface on a public
  repository.
- Always run the formatter and linter on anything that is not throwaway: `npm run format`
  applies both. `npm run verify` is what CI runs.
- Unit tests for any non-trivial logic. The rules engine additionally carries property-based
  tests and a replayed corpus of recorded games (R-59).
- TypeScript throughout; no UI framework, which is a deliberate choice for a project whose
  interface is one bespoke animation-heavy component (D-6).
- Accessibility is policy, not polish. It targets current WCAG AA — 2.2 today — from the
  start rather than as a Phase 7 retrofit, which is the single most reliable way to end up
  not having it.

## Environment notes

Contributors work on more than one platform, and the checked-in tooling is platform-neutral.
Two Windows-specific traps have already cost time here:

- **Hidden attributes inside `.git/`.** Files git rewrites — `COMMIT_EDITMSG`, `FETCH_HEAD`,
  `ORIG_HEAD` — can acquire the Windows hidden attribute, after which git fails with
  "Permission denied" on operations that have nothing obviously to do with permissions.
  Clear the attribute and set `git config core.hideDotFiles false`. If git misbehaves oddly
  on Windows, check file attributes before suspecting the repository.
- **Multi-line commit messages in PowerShell.** Write the message to a file and use
  `git commit -F <file>`, or a heredoc under bash. Repeated `-m` flags with backtick
  continuations get mangled by the shell.
