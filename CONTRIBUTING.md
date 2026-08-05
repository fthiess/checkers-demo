# Contributing

Everything you need is in this repository. There is no private wiki, no shared chat history,
and no context living on someone else's machine that you are missing.

**New here, and working with Claude Code?** [ONBOARDING.md](ONBOARDING.md) walks the whole
first session — prerequisites, the repository invitation, Git identity, the clone, and picking
a phase. Open Claude Code and say: *"Let's get started on the next phase of checkers-demo. The
onboarding instructions are at
https://github.com/fthiess/checkers-demo/blob/main/ONBOARDING.md"*. The rest of this file is
the reference version of the same thing.

## Set up

Node 22.12 or newer.

```
git clone https://github.com/fthiess/checkers-demo.git
cd checkers-demo
npm install
npm run verify
```

`npm run verify` runs type checking, lint, and unit tests. If it passes, you have a working
checkout. Then, to see both distribution forms:

```
npm run dev            # development server
npm run build:single   # writes dist-single/checkers.html
```

Open `dist-single/checkers.html` by double-clicking it from your file manager. That single
self-contained file is the deliverable this project exists to produce (R-1); the hosted page
at <https://fthiess.github.io/checkers-demo/> is the same application served over HTTPS.

## Set your git identity first

**Before your first commit.** This repository is public, and `user.name` and `user.email`
travel into public history with every push. Use your GitHub `noreply` address:

```
git config user.email "YOUR_ID+YOUR_USERNAME@users.noreply.github.com"
```

Your exact address is on GitHub under Settings → Emails, where "Keep my email addresses
private" also shows the ID prefix. Set `user.name` to your GitHub handle rather than your
legal name if you would rather it not appear.

This is one instance of a rule that governs the whole project: **no personal information on
any public surface** (D-13). Not in the tree, not in commit messages, not in pull request or
issue titles and bodies, not in test fixtures or recorded games. Write "the opponent", "a
tester", "a player". Decisions in the log are attributed by role — "Session owner's call" —
and never by name (D-19).

## Read these, in this order

1. **[ROADMAP.md](ROADMAP.md)** — what phase the project is in and what comes next. Start here.
2. **[DECISIONS-INDEX.md](DECISIONS-INDEX.md)** — which decisions govern the surface you are
   about to touch. Jump from it into the few entries that matter; do not read
   [DECISIONS.md](DECISIONS.md) end to end.
3. **[CLAUDE.md](CLAUDE.md)** — the standing rules, including the module dependency rule.
4. **[REQUIREMENTS.md](REQUIREMENTS.md)** and **[DESIGN.md](DESIGN.md)** — the specification.
   Requirement citations look like `R-12`, decisions like `D-7`.

## How work happens

The methodology is vendored at `.claude/skills/dev-workflow/` so it travels with the
repository. If you work with Claude Code, invoke the `dev-workflow` skill at the start of any
session that will change code or docs — before proposing a plan or writing anything. If you
work without it, read `SKILL.md` yourself; the gates are the same either way.

The short version:

**Plan before building, and get a real "go."** For anything non-trivial, propose scope and
approach first. You approve your own session's plan and decide its design forks — this
project delegates fully (D-19) — but the pause is not ceremonial, and "measure twice, cut
once" is cheaper than it sounds.

**Branch, then PR.** Never commit to `main`; branch protection will refuse it. A pull request
whose `verify` check is green may be merged by its author without an approving review — the
gate plus the review round is the quality check (D-18, D-19). Deep changes wait for a
deliberate decision, not an automatic merge: new subsystems, the transport, the rules engine,
dependency upgrades, and anything that changes the message schema or the dependency rule.

**Reproduce before you fix.** Write the failing test first and watch it fail. A test written
after the fix tends to prove the fix rather than the bug.

**Documentation is code.** Decision-log entries, `ROADMAP.md` status, and doc updates land in
the same pull request as the change they describe — not the next one.

**File the issue when you find it.** Anything noticed and deliberately not done becomes a
GitHub issue immediately, never a TODO comment. End the PR description with a short
"Didn't touch (intentionally)" list pointing at those issues.

## Who takes what

Phases 1 and 2 are independent by construction and can run in parallel on different machines.
The rules engine imports nothing (R-59, [DESIGN.md §1](DESIGN.md)), so Phase 2 touches no file
Phase 1 needs.

- **Phase 1, the walking skeleton**, is the risky one — WebRTC, manual signaling, and the
  first real connection between two browsers. It wants whoever is most comfortable with
  connectivity work. It is a serial thread: 1.3 depends on 1.2, and 1.4 on both, so it does
  not split across two people.
- **Phase 2, the rules engine**, is pure work with almost no unknown risk, and is unblocked
  by everything — including issue #6, which only affects `game/` and `net/`.

Rebase before pushing. You will not clobber each other's files, but you do land on the same
`main`, and it moves.

## Before you start Phase 1

[Issue #6](https://github.com/fthiess/checkers-demo/issues/6) has to be settled at task 1.1.
`DESIGN.md` §1's diagram and §2's table disagree about whether `game/` may import `net/`, the
lint rules follow the table, and the session state machine needs the `Transport` type that
lives in `net/`. The rule was deliberately left strict so it fails loudly rather than being
quietly relaxed. Settle the design question and update `biome.json`, `CLAUDE.md`'s table, and
`DESIGN.md` together — do not work around the lint.

## The gate

CI runs on every pull request: type checking, lint, unit tests, both builds, and a check that
the single-file output reaches for nothing outside itself and stays under one megabyte
(R-1, R-54). On `main` it additionally deploys the hosted build once green.

`main` requires the `verify` check as a strict check, with admin enforcement on and force
pushes and deletions disabled (D-18). That means a mistake on `main` is corrected by a
revert, not by rewriting history — which is the right trade for a public repository whose
commit SHAs are cited from issues and pull requests.

⚠ Do not rename the `verify` job. Branch protection matches the check by name, so renaming it
silently removes the protection.
