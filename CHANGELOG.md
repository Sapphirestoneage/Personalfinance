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

### Tasks 2 and 3 — the first screen, and the two numbers

These are one change and landed in one commit. Task 2 asks where a first-time
visitor is sent; Task 3 asks what they are asked for when they get there.
Doing one without the other leaves the app stuck — routing someone into an
onboarding that still asks for age, ZIP, situation and pay is not the fix.

**What a new visitor sees now.**

1. **Onboarding.** Nothing saved means the two questions and nothing else. No
   dashboard, no map link, no ☰ rooms menu, no ninety-four-room progress bar.
   Opening `map.html` directly sends you back to the front door.
2. **The two questions.** "What does a typical month cost?" and "How much cash
   do you have?" That is the whole of Phase 1. The walk used to be five
   questions — age, ZIP, situation, pay, cash — and none of them produced a
   number you could look at. The other four are not deleted: they sit behind
   the gate and come back in the same walk the moment it opens.
3. **The micro-dashboard.** One reading: how long the money lasts. Under it, a
   progress bar that counts to two (not to a hundred and ten), and one next
   step. At the bottom, one button: "Open the rest of the app".

**The gate.** Finishing the two questions does **not** open the app. The first
version of this did, and it was wrong — the reward for finishing onboarding
would have been the ninety-four rooms onboarding exists to keep out of the
way. The gate opens when the person presses the button, or on its own for
anyone whose saved numbers go beyond Phase 1 (a returning visitor, an
imported file, a share link, the example household). Nobody is ever pushed
back to the first question.

**Where the numbers go.** No new stored field. The month is written to
"everything else, a month", which is where `shared/schema.js` already puts a
month nobody has split up — its own migration says so. Split the month in
Expenses later and the split takes over. The unlock is a preference, not a
fact about the household: the saved data is byte-identical either side of it.

**Files.** New `shared/phase1.js` (the gate: 2 numbers, 3 screens, 1 unlock).
`index.html` (three screens named by `data-slaf-screen` on `<body>`, and the
new `#micro` card). `map.html` (the redirect). `rooms/ledger.html` (the
`#q-expenses` question, the walk stepping along an order instead of each
screen naming its own successor, and the all-at-once form cut to two rows).
`test/run.js` (the "dashboard is four blocks" guard now knows there are three
screens). Decision entry **D-234**.

**Tests: 12 of 12 e2e steps pass** (up from 2 of 11 — one step was added, for
the menu staying shut until unlocked). `node test/run.js`: 31,025 checks pass.
