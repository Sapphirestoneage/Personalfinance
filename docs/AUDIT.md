# Audit of the Personalfinance repository

Written 2026-10-23, on branch `cleanup-for-review`, before anything was moved. The tag
`pre-cleanup` marks `main` at 0f390a6, the tree this audit describes. Every number below was
measured on that tree with `git ls-files`, `wc`, `grep` and the test suites; nothing is estimated.

The repository holds six generations of one idea (a personal-finance tool built by a money coach,
without a framework or a build step) side by side in one tree. The current one is SLAM, in
`slam/`. Everything else is an earlier attempt, a side app built on an earlier attempt, or the
tooling that went with one.

## 1. What is in the repository

2,162 tracked files, about 110 MB without `.git`, 849 commits (5 in July 2026, 640 in September,
204 in October). Pages publishes `main` from the repository root.

| Path | What it is | Generation | First and last commit (commits) |
| --- | --- | --- | --- |
| `index.html`, `foo-ladder.js` | The root page. `index.html` is the SPARKS Dashboard room (1,879 lines, title "SPARKS, Money rooms"), which also carries the FOO (Financial Order of Operations) ladder from the very first commits. The file `Inheritance FOO` (no extension) is the July 6 original. | Oldest; now part of SPARKS | 2026-07-06 to 09-22 (105) |
| `map.html`, `rooms/` | SPARKS (also called SLAF): small finance "rooms" that share one household model in `localStorage`. 99 pages in `rooms/` (42,527 lines), of which 38 are live rooms listed in `rooms.json` and 61 are redirect stubs left where merged rooms used to be. | Second generation | 2026-09-03 to 09-24 (349) |
| `engines/`, `shared/`, `data/` | SPARKS calculation modules (93 files, 24,259 lines), shared runtime (62 files, 28,897 lines: the household store, schema, ownership map, registry, money helpers, stylesheet) and reference tables (119 files, 62,838 lines of JSON, versioned by year). | SPARKS | 2026-09-03 to 09-24 (202, 324) |
| `test/`, `tests/`, `fixtures/` | Two test trees. `test/` (70 files, 28,096 lines) is the SPARKS suite: `test/run.js` alone makes 35,885 checks, plus 12 Playwright scripts. `tests/` (118 files) is "Lane 2", a separate npm harness with property tests, a synthetic household corpus and an accessibility audit. `fixtures/` (107 files) feeds both. | SPARKS | 2026-09-10 to 09-26 |
| `tools/`, `scripts/`, `vendor/`, `docs/`, `.claude/` | SPARKS tooling: `tools/context/` builds the indexes under `docs/context/` that Claude sessions read; `scripts/` holds two one-off data extraction scripts; `vendor/fonts/` two font files; `docs/` 19 files (architecture page, audits, the generated indexes); `.claude/` six slash commands and 38 room cards. | SPARKS | 2026-09-05 to 10-23 |
| Root `*.md` (11 files) | SPARKS writing: `README.md`, `CLAUDE.md`, `SPEC.md`, `ROADMAP.md`, `DECISIONS.md` (1.09 MB, entries D-001 onward), `STATUS.md`, `PROGRESS.md`, `PANEL_REVIEW.md`, `MONEY-MAP.md`, `DESIGN-AUDIT.md`, `RELEASE.md`, `LATER.md`. Plus seven `.png` screenshots, `rooms.json`, `sync.json`, `version.json`, `favicon.svg`. | SPARKS | |
| `dnd/` | Dungeons & Dividends: a finance "character sheet" as an RPG. 11 pages, 59 files, 22,177 lines, its own tests. `dnd/shared/` and three of `dnd/engines/` are byte-identical copies of SPARKS files, kept in step by `test/run.js`. | Side app on SPARKS | 2026-09-04 to 09-24 (234) |
| `coach/` | Coach Mode: a coach's console, live session and client view. 3 pages, 58 files, 14,361 lines. Vendors SPARKS files byte for byte through `coach/tools/vendor.js`. | First coach-operated attempt, on SPARKS | 2026-09-24 to 09-26 (8) |
| `marketing/` | Marketing Scoreboard: a content log, a small CRM and weekly targets. 3 pages, 30 files, 5,223 lines, plus `Marketing-Scoreboard.xlsx`. Not a finance tool. | Side app on SPARKS | 2026-09-26 (4) |
| `money-rooms-v3/` | Money Rooms v3 (Coach Edition): one page, an engine of 67 modules plus 8 "planets", 38 UI modules, D3 vendored, its own unit suite and an hour-long Playwright sweep. 945 files, 27,780 lines of code, and 74 MB of committed screenshots. | Third generation, right before SLAM | 2026-10-05 to 10-17 (105) |
| `slam/` | SLAM (Stress Less About Money) Budget: the current build. `src/calc/` 43 pure-math files (5,517 lines), `src/store/` 21 (2,800), `src/ui/` 53 (6,726), `data/` 6 reference tables, `test/` 41 test files plus 7 demo households with hand-computed expected answers (6,693 lines, 336 tests), `tools/` Playwright checks, journey tap counts, a screenshot gallery with 96 approved shots. Six Markdown files of its own. | Current | 2026-10-15 to 10-20 (78) |
| `.github/workflows/` | `test.yml` runs every suite above in three parallel jobs (about two hours of CI); `pages.yml` is a dormant Actions deploy, off until a repository variable is set. | Infrastructure | |

Money Rooms v2 is not in this repository. It is `Sapphirestoneage/money-rooms`, a Vite and
TypeScript build last pushed 2026-10-05.

## 2. Which version is current

SLAM in `slam/` is the current build. The evidence: it has the newest commits on `main`
(2026-10-15 to 10-20, pull requests 51 to 78), its README describes the tool the owner uses with
clients today, its `LESSONS.md` lists 23 rules learned from the earlier generations, and its
decisions log (`slam/DECISIONS.md`, S-001 to S-139) explains why it was started as a separate
folder rather than another round of SPARKS.

Two open branches continue SLAM and are not on `main`: `claude/slam-phase-1-foundation` (33
commits, closed out on 2026-10-23 with a `SIGNOFF.md`) and `claude/slam-phase-2` (one commit on
top of it, 2026-10-23 05:14). They add a second app beside the Budget inside `slam/`: a Ledger and
Dashboard with their own `slam/engine/` (24 files) and `slam/ui/` (10 files), four more HTML pages,
and nine more test files. They change none of the 117 files under `slam/src/`. Outside `slam/` they
add a few lines to `.gitignore`, `CLAUDE.md` and `test/run.js`. Whether that work lands before or
after this cleanup is the first question for the owner; see the final report.

There are 37 `claude/*` branches on the remote in all, plus `lane2`, `reference/calculators`
and `cleanup-for-review`.

## 3. The generations, oldest to newest

1. **FOO ladder (July 2026).** One HTML file, then a dashboard page. Float dollars, hard-coded
   thresholds (high interest above 6%, a 3-month emergency fund).
2. **SPARKS, also SLAF (September 2026).** One household object, 93 rooms at its peak, cut to
   37 by a merge programme. Integer cents, one owner per field, a formula in exactly one engine
   function. Grew its own vocabulary (DAITE, FAT, DRAFTT, the Ledger, Spheres, Blocks, Lenses,
   Levers) and a 1 MB decisions log. Three side apps were built on it: D&D, Coach Mode, Marketing.
3. **Money Rooms v2 (separate repository, to 2026-10-05).** Vite and TypeScript.
4. **Money Rooms v3, Coach Edition (October 5 to 17).** A single page driven by a coach,
   with an engine in cents and "planets" of readings.
5. **SLAM (October 15 onward).** Started fresh from the 23 lessons. Dollars as typed, rounding
   only at display. Pure math in `src/calc/`, a number store in `src/store/`, screens in `src/ui/`.

`archive/README.md`, written in step 2, tells this story properly.

## 4. Duplicated logic across versions

The same finance rules are implemented several times, and they do not agree. The table names
the files; the disagreements that matter come after it.

| Rule | SPARKS | D&D and Coach | Money Rooms v3 | SLAM |
| --- | --- | --- | --- | --- |
| Federal tax and take-home from gross | Three models: a flat effective-rate lookup in `shared/schema.js` (`takeHomeAnnualCents`, feeds the root page, Tier 0 and the side apps); a bracket walk with FICA and Additional Medicare in `engines/tax.js`; a third netting rule in `engines/ledger.js`. `engines/cashflow.js` repeats the first one. | Copies of the flat model | `engine/tax.js`: bracket walk in cents, employee FICA, no Additional Medicare | `src/calc/tax.js`: bracket walk in dollars, no Additional Medicare |
| Tax constants | `data/federal_brackets_2026.json`, dollars, key `married_joint` | | `data/tax-2026.json`, cents, key `mfj` | `data/tax-constants.json`, dollars, key `married-joint` |
| Amount to monthly | Three cadence tables (`shared/schema.js` twice, `engines/income.js`) plus one inline in `rooms/expenses.html:699` | | `engine/units.js` and a second copy in `engine/parse.js` that treats unknown cadences differently | `src/calc/normalize.js` |
| Savings rate | `engines/tier0.js` divides by gross; `engines/opening.js` by take-home; `shared/lenses.js` uses raw spending; `engines/cashflow.js` counts contributions | Copies | `engine/metrics.js`: one by take-home, one by gross plus match | `src/calc/totals.js`: (savings plus pre-tax retirement) over (take-home plus pre-tax retirement) |
| Surplus or gap | `shared/schema.js` `monthlyGapCents` subtracts debt minimums; `foo-ladder.js` does not | | `engine/metrics.js` subtracts minimums; `engine/compute.js:139` repeats it inline | `budgetTotals` also subtracts savings lines; `surplusAllocation` is take-home minus spending |
| Debt payoff | `engines/debt.js` full simulation in cents; `foo-ladder.js` its own avalanche in float dollars; `rooms/debt-payoff.html:1909` re-derives monthly interest | Copy of `debt.js` in coach | `engine/debtsim.js`, `engine/planets/debt.js`, `engine/loanmath.js` | One month of card interest only (`src/calc/debts.js`) |
| Net worth | `engines/tier0.js`, plus an after-tax variant in `engines/tax.js` | Copies | `engine/metrics.js` | `src/calc/networth.js` adds paid-ahead assets and a second "FI net worth" |
| FI number and ladder | `engines/tier0.js` on cleaned spending; `engines/fire.js` on raw spending (they can differ); `engines/coast.js` | Reads Tier 0 | `engine/metrics.js`, `engine/fiLadder.js`, `engine/retire.js` build the ladder a second time | None by design (milestones only) |
| Emergency fund and runway | `engines/tier0.js`, `shared/schema.js` `runwayMonths`, `engines/runway.js`, `engines/foo.js` (1, 3, 6 months from data; `foo-ladder.js` hard-codes 3) | `dnd/engines/character.js` in weeks | `engine/planets/safety.js`: three runways and a Rule of 5 target | `src/calc/next-stage.js` runway; the calendar uses a cushion |
| DRAFTT and 50/30/20 | `engines/draftt.js`: seven rows, shares of take-home except retirement and taxes of gross, graded bands | | `engine/metrics.js`: same bases, no Taxes row, no bands | `src/calc/lenses.js`: base is take-home plus pre-tax retirement, descriptive only; a 50/30/20 lens |
| Money representation | Integer cents (`shared/money.js`, line 6) | Same file, copied | Integer cents, non-integers throw (`engine/units.js`) | Dollars as typed, rounded at display (S-009); 16 calc files each define a local `r2` rounding helper, two of them differently |

Disagreements a reader will trip on first:

1. Savings rate has at least six definitions across the tree, with different numerators and
   denominators. The root page, D&D and Coach divide by gross; SLAM divides by take-home plus
   pre-tax retirement.
2. Surplus is defined four ways. Only some subtract debt minimums; SLAM also subtracts savings.
3. The FOO thresholds disagree with their own data file: `foo-ladder.js` hard-codes 6% and 3
   months, `engines/foo.js` reads 7.5% and 1, 3 and 6 months from `data/foo_rules.json`.
4. SPARKS has two FIRE numbers (`engines/fire.js` and `engines/tier0.js`) that differ once
   spending has been "cleaned".
5. Vendored copies: `dnd/shared/`, `coach/shared/` and `marketing/shared/` carry byte-identical
   copies of SPARKS `shared/money.js` and `shared/schema.js` (3,597 lines), and eight of
   `coach/engines/` and three of `dnd/engines/` are identical to SPARKS engines. A test fails if
   they drift, so the duplication is deliberate, but a reader meets the same 4,000 lines four times.

None of this needs fixing inside the archived generations. It matters because a reader who
opens `engines/` and `slam/src/calc/` side by side will reasonably ask which one is right.

## 5. Dead and orphaned files

Checked by searching every text file for every tracked file's name, then reading the hits that
load files dynamically (the SPARKS reference loader, the fixtures, the test runners).

- **Never referenced anywhere:** the seven root screenshots `d3.png`, `d3b.png`, `keep-row.png`,
  `keep-timeline.png`, `rr-gap.png`, `rr-rate.png`, `wil-job.png`; `Inheritance FOO` (the July 6
  original, a historical artifact); `scripts/extract-v63.mjs` and `scripts/seed-exercises.mjs`
  (one-off data extraction scripts whose input file is not in the repository).
- **Test output committed as source:** `money-rooms-v3/screenshots/` (74 MB, two thirds of the
  repository) and `slam/tools/gallery-approved/` (5.9 MB). The SLAM set is a deliberate visual
  baseline; the Money Rooms set is a leftover of the sweep.
- **Mentioned only in prose:** `sync.json` (a Google Drive sync configuration; the code that read
  it is gone), `STATUS.md`, `PROGRESS.md`, `PANEL_REVIEW.md` and the other root logs are read by
  nothing but each other.
- **In SLAM:** five `src/calc/` exports that nothing imports (`money.js` `sum`, `chart-data.js`
  `trendCategories`, `coverage.js` `PARENTS_PLAN_LINE_TYPES`, `owning.js` `lockedIn`,
  `trends.js` `forecastAccuracy`) and 43 more that are exported but used only inside their own
  file. One, `bridge.js` `TIES_WITHIN`, is ignored by the UI, which hard-codes 25 instead.
- **61 redirect stubs in `rooms/`** for rooms merged away in September. They work, and they are
  the pattern this cleanup reuses for the archive.

## 6. Inconsistent naming

- `test/` and `tests/` sit side by side at the root and mean different things (the SPARKS suite
  and the Lane 2 harness). `slam/test/` and `money-rooms-v3/tests/` continue the split.
- Tooling scripts are `.mjs` (16 files) while the apps and tests are `.js`; the SLAM tools fall
  back to a global Playwright at runtime because the root `.gitignore` hides every `package.json`.
- Data files are snake_case in SPARKS (`aca_2026.json`, `benefit_cliffs_2026.json`) and
  kebab-case in SLAM (`tax-constants.json`). Tax tables use three key schemes for the same thing
  (`married_joint`, `mfj`, `married-joint`).
- Decision numbering: D-### (SPARKS, 860 references), DD-### (D&D), CD-### (Coach), MD-###
  (Marketing), S-### (SLAM), L-# (Lane 2). Five files named `DECISIONS.md`, two `AUDIT.md`,
  eight `README.md`, three `STATUS.md`, two `PROGRESS.md`.
- SPARKS calls its math `engines/`, SLAM calls it `src/calc/`, Money Rooms v3 `engine/` with
  `planets/`; the open SLAM branches add a second `slam/engine/`.
- SLAM's own `AUDIT.md` is a self-audit log by date; this file is an audit of the repository.
  They would collide on name if moved together, so the SLAM one stays in `slam/`.

## 7. Where calculation code is mixed into UI code

**SLAM.** Rule 3 (`slam/LESSONS.md`) says screens never calculate, and `slam/AUDIT.md` reports a
scan that found only layout math. A fresh scan of all 6,256 lines of `slam/src/ui/` finds 14
finance computations on 13 lines in 7 files. Most are small sums or differences of numbers the
calc layer already produced (income actual minus plan in `components/income-month.js`, range
totals and an average ticket in `charts/trend-charts.js`, a running cash balance in
`charts/cash-charts.js`, total card interest in `charts/interest-chart.js`). Two restate finance
rules that also live in `src/calc/income.js` and can drift: `screens/setup-basics.js:168`
converts an annual tax figure to per paycheck with a fallback of 12 that exists nowhere else, and
`screens/setup-basics.js:232` applies the 10% unemployment withholding again. One recomputes a
number calc already returns (`screens/future-eras.js:76`; `calc/eras.js` `total`). Outside the UI
but against the same rule, `src/store/value.js` `sumParts` converts cadences in the store.
Several thresholds live in UI files rather than calc (a 25 materiality default, a 10% blind-spot
warning, a $100 "big bill" label, $1 tolerances). Step 3 moves the 14 into calc.

**SPARKS.** All 99 room pages carry an inline script. 33 of them contain money arithmetic
(`Math.round(` 239 times across 32 files; `/ 12` and `* 12` 35 times). Most is display and
date math, but four are duplicated finance rules: cadence to monthly in `rooms/expenses.html:699`,
monthly interest in `rooms/debt-payoff.html:1909`, annual savings over twelve in
`rooms/fire.html:791`, spending times twelve to pick a bracket in `rooms/which-account.html:270`.
The root page (`index.html`, `foo-ladder.js`) does its own simulation in float dollars.

**Money Rooms v3** keeps math in `engine/`; the one duplication found is `engine/parse.js`
repeating `engine/units.js`. Not audited line by line.

## 8. Problems ranked by how confusing they are to a newcomer

1. **Nothing says which of six apps is current.** The root `README.md` describes SPARKS and never
   mentions SLAM. The live root URL opens a SPARKS room. A reader has to infer the current build
   from commit dates.
2. **Six vocabularies and six decision logs.** DAITE, FAT, DRAFTT, Spheres, Lenses, Levers,
   Triple D, planets, eras, the loop; D-, DD-, CD-, MD-, S- and L- numbers; a 1 MB decisions file
   at the root that belongs to a retired generation.
3. **The same finance rule, several answers** (section 4). The reader cannot tell which savings
   rate or which tax model is the one the owner stands behind.
4. **`CLAUDE.md` and `.claude/` steer every AI session toward SPARKS** (the freeze, the rooms, the
   context packer), while the current work is SLAM. The room cards load when SPARKS files are
   opened; nothing equivalent exists for SLAM.
5. **`test/` next to `tests/`, and no single test command.** The commands live only in CI YAML
   and five READMEs. The root `.gitignore` hides every `package.json`, so `npm test` cannot exist
   without changing it. Playwright scripts hard-code port 8765 in 21 files, and three suites
   must each be served from a different root.
6. **29 loose files at the root**, including seven unreferenced screenshots, a file with no
   extension and 11 Markdown documents of which four are status logs.
7. **Vendored copies everywhere** (section 4, item 5): the same `schema.js` four times.
8. **74 MB of screenshots** in `money-rooms-v3/screenshots/`, two thirds of the clone.
9. **Money is stored three ways** across generations: integer cents (SPARKS, Money Rooms v3),
   dollars as typed (SLAM), float dollars (the root page).
10. **SLAM breaks its own rule 3 in 14 places** and its self-audit says it does not (section 7).
11. **CI runs two hours of suites for retired generations on every push**, and the Lane 2
    harness rewrites tracked files (`tests/reports/*.json`, `docs/lane2-findings.md`) each run.
12. **Hard-coded live paths.** `/Personalfinance/` or `sapphirestoneage.github.io` appear in 17
    files (six D&D pages, `rooms/data.html`, `test/run.js`, `tests/qr.test.js`, `sync.json`, seven
    Markdown files). Every move has to be checked against that list.
13. **Portability of two SPARKS tests** (not bugs in the app): one depends on the machine's time
    zone, and the XSS ratchet keys its baseline by forward-slash paths, so every file looks new
    on Windows. Both pass on Linux and in CI.

## 9. What this audit did not check

- Money Rooms v3 and D&D engines line by line (only their cross-generation duplicates).
- The 37 `claude/*` branches, beyond the two open SLAM branches.
- Accessibility and performance (Lane 2 has an axe-core audit of SPARKS; SLAM has none).
- Whether the 2026 tax constants are right. SLAM's S-008 says the higher brackets were entered
  from memory and flagged.
