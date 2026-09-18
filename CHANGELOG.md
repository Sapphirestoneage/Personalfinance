# CHANGELOG — overnight Phase 1 fixes

Branch: `claude/sparks-phase-1-fixes-otw856` (see REVIEW.md — the brief asked
for `overnight-fixes`; the session was pinned to this branch name instead).
Nothing here is merged. `main` is untouched.

---

## The repo, in plain language

SPARKS (also called SLAF, "Money Rooms") is a **static web app**: plain HTML,
plain JavaScript, no build step, no server, no account. Everything a person
types is kept in their own browser (`localStorage`). You can open any file
directly, or serve the folder with `python3 -m http.server` and it works.

The shape of it:

| Folder / file | What it is |
| --- | --- |
| `index.html` | The front door. Shows either the intake landing (no numbers yet) or the Dashboard (enough numbers to read). |
| `map.html` | "All rooms" — the directory of every room. |
| `rooms/` (94 pages) | One page per "room". A room is one small money question — The Cushion (runway), Expenses, The Ledger, FIRE, and so on. Markup plus an inline script. |
| `engines/` (88 files) | Pure calculation. Each takes the household object and hands back a result. Engines never write anything. |
| `shared/` (50 files) | The plumbing every room borrows: `spine-v2.js` (load/save the household), `schema.js` (the stored shape), `money.js` (integer cents, and the "incomplete" result), `ownership.js` (who owns which number), `registry.js` (the list of rooms), `progress.js` (how far along you are), `theme.css` (the navy/sapphire design system). |
| `data/` (110 JSON files) | Reference tables — tax brackets, IRS limits, cost-of-living, benefit caps. Year-stamped. Never inlined into a calculator. |
| `test/run.js` | The big node-only suite (~31k assertions). No dependencies. |
| `test/forms.js` | A browser walk that proves typing survives on a phone. |
| `tests/` | A second suite: property tests, a synthetic household corpus, data-table checks, accessibility. Has its own `package.json`. |
| `docs/`, `STATUS.md`, `DECISIONS.md`, `SPEC.md` | The written record. `DECISIONS.md` is an append-only log (`D-###`). |
| `dnd/` | A separate little tool (Dungeons & Dividends) that vendors copies of some `shared/` files. Left alone. |

Two rules run through the whole codebase and are worth knowing before reading
any of it:

1. **Empty is not zero.** A number nobody typed is `null`, and anything that
   depends on it returns an *incomplete* result carrying a sentence about what
   is missing — never a silent `0`.
2. **One owner per number.** Each shared figure is editable in exactly one
   room; every other room shows a read-only link back to it.

---

## What changed, per task

*(filled in as each task lands — see the sections below)*
