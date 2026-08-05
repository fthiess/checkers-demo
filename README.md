# Checkers Demo

A two-player game of checkers played over the internet, between two browsers, with no
server in the middle.

One player creates a game and gets a block of text. They send it to their opponent by
whatever means they already use — email, a message, a phone call. The opponent pastes it
in and sends a shorter block back. From that moment the two browsers talk directly to each
other, and the game is played peer-to-peer.

The whole application ships as a single self-contained HTML file. Save it, double-click
it, play. It is also published as a web page; the two are functionally identical.

## Status

**Phase 0 — toolchain and delivery.** The application itself does not exist yet; what builds
today is a placeholder page. See [ROADMAP.md](ROADMAP.md) for what comes next.

## The rules

American draughts on an 8×8 board, with three house modifications: capture is not
compulsory, you need not take the longest capture, and you may stop a capture chain
wherever you like. There are no automatic draws — a game ends by one player being unable
to move, by resignation, or by mutual agreement.

The full specification is in [REQUIREMENTS.md §5](REQUIREMENTS.md).

## Documents

| Document | Contents |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | What is being built, for whom, and what "done" means |
| [DESIGN.md](DESIGN.md) | Architecture, rules engine, network protocol, interface, build |
| [DECISIONS.md](DECISIONS.md) | Every significant decision and the reasoning behind it |
| [ROADMAP.md](ROADMAP.md) | Phased implementation plan, updated as work proceeds |

## Known limitations

Because there is no server, some pairs of players behind particular kinds of home router
will not be able to connect at all; the application says so plainly rather than hanging.
A direct connection also means each player's network address is visible to the other. And
with no referee, the game trusts both participants — it is built for playing with a
friend, not with a stranger.

Each of these disappears if the project later adopts the client/server transport described
in [DESIGN.md §9](DESIGN.md), which the architecture is deliberately arranged to allow.

## Development

Node 22.12 or newer.

```
npm install
npm run dev          # development server
npm run verify       # type checking, lint, unit tests — the gate CI runs
npm run build        # hosted build      -> dist/
npm run build:single # self-contained    -> dist-single/checkers.html
npm run format       # apply formatting and safe lint fixes
```

Both builds come from one source and one Vite config, keyed on `--mode`, so the two
distribution forms cannot drift apart (D-12). `build:single` finishes by checking that the
document reaches for nothing outside itself (R-1) and reporting its size against the
one-megabyte attachment budget (R-54); it fails the build if either does not hold.

[CLAUDE.md](CLAUDE.md) carries the standing rules for anyone — human or model — working in
this repository.

## Accessibility

Full keyboard operation, screen-reader support, WCAG 2.2 AA contrast in every theme, a
non-colour marker distinguishing the two sides, and honoured reduced-motion preferences —
built in from the start rather than added at the end.
