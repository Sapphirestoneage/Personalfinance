# Money Rooms v3, Coach Edition: final report

Built 2026-10-05 on branch `claude/money-rooms-v3-coach-build-2ftvlz`. GitHub
Pages serves `main` only, so the live link below works once the branch is
merged; until then run it locally (README, "Run the gates").

## 1. Where it runs

- Live after merge: https://sapphirestoneage.github.io/Personalfinance/money-rooms-v3/
- Branch on GitHub: https://github.com/Sapphirestoneage/Personalfinance/tree/claude/money-rooms-v3-coach-build-2ftvlz/money-rooms-v3
- Local: `python3 -m http.server 8000` at the repo root, then
  http://localhost:8000/money-rooms-v3/ and press "Load demo client" for Maya.

## 2. Levels

| Level | Name | State | Rough spots left |
|---|---|---|---|
| 0 | Skeleton | FROZEN | none open |
| 1 | Capture | FROZEN | low-use ledger columns scroll sideways instead of living in a drawer (M14, M22) |
| 2 | Measure + one-pager | FROZEN | Sankey labels can touch on dense households (T14); Measure coach page is long at 390 (T19) |
| 3 | Session engine | FROZEN | leverage by FI-date sensitivity is stubbed, by design |
| 4 | Simulate | FROZEN | a promoted block is not in the Maya shots; no drag-and-drop in the Playwright flow (keyboard arrows are tested) |
| 5 | Learn | FROZEN | readings are titles only; two titles were removed because no lens pointed at them |
| 6 | Depth | FROZEN | no nominal view (MR-024); state tax, ACA and Roth conversions are out of scope |
| 7 | Polish and audit | FROZEN | a live timing of Jordan's entry with Eli at the keyboard is still owed |

BOARD.md carries the commit names. DONE.md is the checklist every level met.

## 3. Spec coverage

SPEC-COVERAGE.md has one row per requirement for Levels 0 to 7 with a plain
status (done, partial, not built by design) and the file or test that proves
it. The rows marked other than "done":

- Real dollars with a nominal toggle: not built by design (MR-024); every
  figure is in today's dollars and the screens say so.
- Leverage by FI-date sensitivity: stubbed (spec says v2).
- State tax, ACA, Roth conversions, couples, cloud sync, CSV import: out of
  scope, listed in the README parking lot.
- Low-use ledger columns in a row drawer (critique M14/M22): not done; the
  first column is sticky and the table scrolls.

## 4. Tests, invariants and workpapers

| Gate | Result |
|---|---|
| `node money-rooms-v3/tests/run.js` | ok: 833 checks (engine tests, contracts, tie-outs for Jordan, Dev and Maya, invariants on 200 random households, lint: banned words, em dashes, token-only colours, no red, two font weights, verify flags) |
| `node money-rooms-v3/tests/ui.js` | ok on the final run of every slice: 7 flows (Level 0 shell, Jordan keyboard-only, one-pager prints to one page for three households, Maya recompute under 100 ms, demo and client view, Jordan mock session, Jordan + kid + Portugal, Dev mock session) and the sweep of 5 households x 13 screens x 2 views x 3 widths for forbidden text, overflow, console errors and accessible names (4,047 checks on the final run) |
| Root `node test/run.js` | one pre-existing, date-based SPARKS failure, not this app's (QUESTIONS.md, question 2) |
| `node tools/context/build.js --check` | current |

Timings: Maya recomputes in about 3 ms after a keystroke; the keyboard-only
Jordan entry is 1,966 keystrokes in 12 seconds of machine time (about 16
minutes at two keystrokes a second; a live timing is still owed).

Workpapers: `tests/households/expected.py` reads each fixture's facts and
writes `<name>-expected.md` (the arithmetic, line by line) and
`<name>-expected.json` (what the engine tests tie out against). It never
imports the engine. Two to read: `tests/households/jordan-expected.md` (12
lenses fire) and `tests/households/dev-expected.md` (self-employed, Solo 401k,
HSA; 7 lenses). Maya has one too (9 lenses).

Invariants (`tests/engine/invariants.test.js`, 200 random households plus the
four fixtures): net worth = assets - debts; Sankey inflows = outflows to the
dollar; DRAFTT shares reconcile; savings rate never above 100%; more saving
never gives a later FI date; the match is never counted in spending; cash
never takes investment returns while all paths are working; no NaN anywhere.

## 5. Design critiques

Every level has `screenshots/level-N/critique.md` (and `critique-round1.md`
where there were two rounds), written by a separate reviewer pass that saw
only the screenshots and the source, scored 1 to 5 on hierarchy, alignment,
typography, density, consistency and would-ship, with a numbered fix for every
score under 4. Each file ends with a builder's note saying which fixes landed
and which were declined, by number.

| Level | Rounds | Fixes named | Applied | Declined or deferred |
|---|---|---|---|---|
| 0 | 3 | F1-F17, G1-G12, H1-H8 | all | none |
| 1 | 2 | L1-L34, M1-M23 | all but two | M14, M22 (row drawer) |
| 2 | 2 | N1-N31, P1-P17 | all | "Prepared by" line on the one-pager |
| 3 | 1 | Q1-Q9 | all (Q6, Q7 landed in Level 7) | none |
| 4 | 1 | R1-R10 | all | promoted block in shots |
| 5 | 1 | S1-S7 | all | none |
| 6 | 1 | T1-T19 | T1-T13, T16-T18 in part | T14 (Sankey labels), T15 (FAT floor name), T19 (Measure regroup) |

The reviewer did not re-score after the final fixes; the last scored rounds
are in the files. Scores under 4 that remain are listed there by fix id.

## 6. Decisions, questions, verify list

- DECISIONS.md: MR-001 to MR-024, each with the decision, why, the alternative
  and a compatibility note where a stored shape changed.
- QUESTIONS.md: five questions for Eli; none blocked the build.
- Written from memory and marked `verify: true` (shown as "Looked up
  (verify)" at 0.7 confidence until confirmed): `data/cards.json` (212 cards, personal, business and store),
  `data/funds.json` (35 funds), `data/tax-2026.json` (brackets, standard
  deduction, FICA), `data/limits-2026.json` (401k, IRA, HSA limits),
  `data/defaults.json` (national averages), `data/scenario-blocks.json`
  (default block costs). Everything else in `data/` is this app's own copy
  and carries `verify: false`.

## 7. Maya, the showcase

Screenshots of every screen for Maya at 1440, 1024 and 390 in both views are
in `screenshots/level-6/` (file names `maya-<screen>-<view>-<width>.jpg`).
The printed one-pager is `screenshots/level-2/maya-onepager.pdf` (one page).
The best three to open first: `maya-home-coach-1440.jpg` (the orbit map),
`maya-measure-coach-1440.jpg` (48 numbers and 9 lenses) and
`maya-onepager-client-1440.jpg`.

## 8. Five minutes with Maya

1. Home. Press "Load demo client". The orbit map shows Maya in the centre
   with her overall confidence, seven planets on the ring with their fill
   and row counts. Press the backtick key: the same map in Client view, plain
   words, no notes. Press it again.
2. Ledger. Open Income. Two rows: a W-2 job and freelance illustration. The
   freelance gross is "~$650", rough, from the client. Type `v700` in that
   cell and press Enter: the state chip turns Verified, the fill moves, and
   Undo in the top bar takes it back.
3. Measure. The Sun facts and 48 numbers with their stage chips. Tap any
   number for its math: formula, inputs with confidence, result, the band and
   where the band comes from. Nine lenses fire for Maya; tick two to share
   with the client. Below, eight charts; put the Sankey and net worth on the
   one-pager.
4. Session. The big question is the fact that moves the most money, with
   "~$X a year at stake". "Ask it" lands in the cell. The table under it is
   everything unsure, ranked, with tabs for their plate, my plate and small
   wins. The follow-up email on the right is grouped by institution with
   where to find each number and carries no balances. Type a note and press
   "Close this session".
5. Simulate. Two blocks already sit on the timeline: a condo in 2035 and a
   four-day week from 2029. The chart shows today's path, each block alone
   and all together; the table says the condo alone costs 5 years, the
   four-day week 2, and together 16. Pick "A child" from "Add a block", move
   it with the arrow keys, then "Promote to the Ledger": one Life plan goal
   appears, and the block is marked "In the Life plan".
6. One-pager. Switch to Client view, then print. One page: key numbers, the
   two picked lenses, what to bring, what changed since the session you just
   closed, the two charts, and the assumptions line.
