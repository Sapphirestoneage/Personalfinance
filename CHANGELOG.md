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

### Task 1 — Playwright tests for the Phase 1 flow

New: `tests/e2e/phase1.test.js`, with `tests/e2e/harness.js` beside it (a
small static web server and a screenshot recorder, no test framework). Run it
with `npm run e2e` from `tests/`, or `node tests/e2e/phase1.test.js`.

It walks a browser that has never been here before, eleven steps:

1. a fresh visit with nothing saved opens onboarding
2. onboarding offers all three ways in
3. nothing of the dashboard, the map or the rooms menu shows first
4. opening the map with nothing saved sends you back to onboarding
5. path 1 (walk me through it) asks what a month costs
6. path 2 (the whole form) shows only the two Phase 1 rows
7. path 3 (example numbers) fills the household and moves on
8. expenses + cash alone produce a runway
9. the micro-dashboard shows the runway and a next step
10. The Cushion reads a real runway from those two numbers alone
11. the progress bar reports progress from those two numbers

Every step writes a screenshot to `tests/e2e/screenshots/` and a machine
record to `tests/reports/e2e.json`. The run does not stop at the first
failure — the list of what is broken is the point.

**Baseline before any other change: 2 of 11 passed.** Passing were step 2
(all three paths are offered) and step 7 (example numbers load). Failing were
steps 1, 3, 4, 5, 6, 8, 9, 10 and 11 — which is to say the whole of Tasks 2
and 3. Steps 8–11 failed by timing out on an input (`#in-expenses`) that did
not exist yet.
