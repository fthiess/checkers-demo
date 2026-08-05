# Onboarding — first session

**This document is written for Claude to run, with a new contributor in the loop.** If you
are a person reading it, you don't have to do any of this by hand — see "How to start" below.

## How to start

Open Claude Code and say:

> Let's get started on the next phase of checkers-demo. The onboarding instructions are at
> https://github.com/fthiess/checkers-demo/blob/main/ONBOARDING.md

That's the whole thing. The URL matters on a first run because until the repository is cloned
there is nothing on the machine that points here.

---

## Instructions for Claude

You are setting up a contributor who is **new to both Git and Claude Code**. Two consequences
shape everything below.

Explain as you go, in plain language, and say what each command does before running it. Not a
tutorial — just enough that nothing is a black box. When something fails, say what failed and
what you're doing about it rather than silently retrying.

And do not assume. Check each prerequisite and report what you actually found. A version that
is merely probably fine is worth thirty seconds to confirm.

Work through these in order.

### 1. Accept the repository invitation

There is a pending invitation for this contributor with **Write** access. Until it is
accepted, cloning works (the repository is public) but **pushing fails** — and the failure
message does not mention the invitation, so it is a genuinely confusing first experience.

```
gh repo set-default fthiess/checkers-demo
gh api user/repository_invitations
```

If an invitation is listed, accept it:

```
gh api -X PATCH user/repository_invitations/INVITATION_ID
```

If the list is empty, check whether they already have access (`gh api repos/fthiess/checkers-demo --jq .permissions`).
If they have neither, stop and tell them to ask the project owner for an invitation — do not
work around it.

### 2. Check the prerequisites

Report the actual version of each. Do not install anything without asking first.

- **Git.** `git --version`.
- **Node.js 22.12 or newer.** `node --version`. Older versions will fail in ways that look
  like project bugs rather than environment problems, so check before cloning, not after.
- **GitHub CLI, authenticated.** `gh auth status`. If not authenticated, walk them through
  `gh auth login` — they choose the options; you explain them.

For anything missing, name the standard installer for their platform and let them run it.
Installers change; check the current instructions rather than reciting a command from memory.

### 3. Set the Git identity — before the first commit

**This is the step that cannot be fixed later.** `user.name` and `user.email` travel into
public history with every push, and force-push is disabled on this repository (D-18), so a
real email address committed once stays committed.

This repository publishes no personal information about the people working in it (D-13,
D-19). So, using their GitHub `noreply` address:

```
git config --global user.email "ID+USERNAME@users.noreply.github.com"
git config --global user.name "USERNAME"
```

Their exact address is at GitHub → Settings → Emails, under "Keep my email addresses private"
— it shows the numeric ID prefix. Fetch it for them if `gh` is authenticated rather than
making them hunt: `gh api user --jq '{id, login}'` gives both parts.

Explain *why*, briefly: this is a public repository, and the project's rule is that nothing
identifying a living person goes into it — not the tree, not commit messages, not pull request
titles. Decisions in the log are attributed by role, never by name. This is the same rule
applied to the one surface people forget.

### 4. Clone and verify

```
git clone https://github.com/fthiess/checkers-demo.git
cd checkers-demo
npm install
npm run verify
```

`npm run verify` runs type checking, lint, and unit tests. It should pass. **If it doesn't,
stop and diagnose** — do not proceed to write code on a checkout that was already broken, and
do not "fix" it by changing a test.

Then show them the thing the project actually exists to produce:

```
npm run build:single
```

Have them double-click `dist-single/checkers.html` from their file manager. It is a
placeholder page today, but that single self-contained file *is* the deliverable (R-1), and
seeing it open from a local file explains the project's central constraint faster than any
paragraph.

### 5. Write their personal CLAUDE.md

Claude Code reads `~/.claude/CLAUDE.md` on every session across all projects. It is personal
and belongs on their machine — **it is not project content and must never be committed here.**

Do not copy anyone else's. Ask them a few questions and write it from their answers:

- How much do they want to be consulted before you edit files? Discuss-first, or act and
  report?
- Prose or bullet points?
- What is their programming background, and which languages are they comfortable in? This is
  what stops you pitching explanations at the wrong level.
- What operating system and shell? Note any platform-specific gotchas you hit during setup.

Keep it short. A page they will actually re-read beats a document they won't. Show it to them
before writing it, and tell them they can edit it any time.

While you are there, note that this project's own instructions live in `CLAUDE.md` at the
repository root and apply automatically when working in this directory.

### 6. Orient them in the project

Read these yourself and give them a two-minute summary of each — do not just hand over a
reading list:

1. **[ROADMAP.md](ROADMAP.md)** — what is done and what is next.
2. **[CONTRIBUTING.md](CONTRIBUTING.md)** — how work happens here.
3. **[DECISIONS-INDEX.md](DECISIONS-INDEX.md)** — which decisions govern which subsystem.
4. **[CLAUDE.md](CLAUDE.md)** — the standing rules, especially the module dependency rule.

Three things a newcomer to Git will otherwise hit as surprises, so say them out loud:

- **`main` is protected.** A direct push to it is rejected. All work happens on a branch and
  lands through a pull request. This is not bureaucracy — it is the only thing standing
  between a public repository and an unreviewable history.
- **A pull request may be merged by its own author once the `verify` check is green.** No
  second approval is needed (D-19). The gate is the reviewer.
- **They approve their own work.** This project delegates fully: whoever runs the session
  approves its plan, decides its design forks, and live-tests the result. There is nobody to
  wait for, which means the plan gate is theirs to take seriously rather than to skip.

### 7. Pick the phase, then start properly

Phases 1 and 2 are independent by construction — the rules engine imports nothing
([DESIGN.md §1](DESIGN.md)) — so they can run in parallel on different machines without
colliding. Check `ROADMAP.md` for current status and ask which is theirs. If it has not been
assigned:

- **Phase 2, the rules engine**, is the better first phase for someone new to this toolchain.
  It is pure functions with fast feedback, heavily specified in `REQUIREMENTS.md` §5, and
  isolated from everything else — so mistakes are cheap and local. It is also unblocked by
  issue #6.
- **Phase 1, the walking skeleton**, carries the project's real risk: WebRTC, manual
  signaling, and the first connection between two browsers on two networks. It wants someone
  comfortable with connectivity work, and its live test needs a second person on a different
  network. It also has to settle
  [issue #6](https://github.com/fthiess/checkers-demo/issues/6) at task 1.1 before `game/` is
  written — a design question that must be decided, not worked around.

Recommend Phase 2 if the choice is genuinely open, and say why rather than just asserting it.

Then **invoke the `dev-workflow` skill** — it is vendored at `.claude/skills/dev-workflow/`
and travels with the repository — and follow it from Gate 1. Propose a plan for the first task
and wait for their go-ahead. Do not start writing code during onboarding; finishing setup and
agreeing a plan is a complete and successful first session.

### What good looks like at the end

The invitation is accepted, prerequisites are confirmed with real version numbers, the Git
identity uses a `noreply` address, `npm run verify` passes, the single-file build has been
opened by double-click, a personal `CLAUDE.md` exists, and there is an agreed plan for the
first task of their phase. Say plainly which of these are done and which are not.
