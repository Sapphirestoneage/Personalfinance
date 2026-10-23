# HANDOFF: the cleanup-for-review pass

> Kept as the record of how the cleanup pass started. Everything it planned has been done or decided; what happened, and the open questions, are in [CLEANUP-REPORT.md](CLEANUP-REPORT.md).

Written 2026-10-23 by the Claude Code session that started this work on Eli's laptop.
The laptop was overheating, so the task moves to a cloud session. This file is
everything that session needs to continue without asking Eli anything.

Branch: `cleanup-for-review` (based on `main` at 0f390a6, 2026-10-20). Tag `pre-cleanup`
marks that same commit so the original layout is always recoverable. Nothing in the
repo has been reorganized yet. This file is the only change on the branch so far.

---

## 1. The task, in full

### Goal (Eli's words, lightly condensed)

Prepare the Personalfinance repo to show to a professional programmer. Someone who has
never seen it should understand what it is, how it is built, and why, within 10 minutes,
and come away impressed by how clean and deliberate it is. Do every step end to end
without stopping to ask questions. Save every question and judgment call for one
numbered list at the very end.

Eli wants three things from showing it: honest technical feedback, a possible hire or
partnership, and proof that Eli can build.

### Ground rules

- Work only on the branch `cleanup-for-review`. Never touch `main`. Do not merge.
- Do NOT change app behavior. This is a reorganization and documentation pass. A real bug
  goes in `KNOWN_ISSUES.md` instead of being fixed, unless the fix is tiny and obviously safe.
- Run the existing Playwright tests before starting and record the results. Re-run after
  every step. If something that passed before now fails, undo that step's changes and note it.
- One git commit per step, with a clear message, so each change can be reviewed or
  reverted on its own.
- Never delete anything outright. Old material gets moved, not removed.
- Never use em-dashes in any file. Use hyphens, commas, or parentheses.
- Plain, human language in all docs. No marketing fluff, no AI-sounding filler.

### Step 1: Audit (write it, change nothing yet)

Create `docs/AUDIT.md` listing: every top-level folder and what it is; which version is
current (Eli believes `slam/` is the current build); which folders are older generations
(older rooms, money-rooms-v2, money-rooms-v3, anything else); duplicated logic across
versions; dead files; inconsistent naming; and where calculation code is tangled up with
UI code. Rank the problems by how confusing they would be to a newcomer.

### Step 2: Archive old generations

Move every non-current version into `archive/` with a short `archive/README.md`. Create a
git tag on `main` called `pre-cleanup` (done). Fix any links or paths the move breaks,
including GitHub Pages paths, so the live site still works.

Eli's mid-task update changed the live-URL rule: keep old versions in this repo inside
`archive/`. Do NOT leave old versions in place to protect live URLs. Instead, for every
moved version that had a live GitHub Pages URL (for example
sapphirestoneage.github.io/Personalfinance/money-rooms-v3/), leave a small redirect page at
the old path pointing to its new `archive/` location. Commit the redirects as their own step.

`archive/README.md` is a short evolution story. For each version: roughly when, what it
tried, and what it taught Eli that shaped the current build. It doubles as proof of
iteration, so it has to read well. Link to it from the main `README.md`.

### Step 3: Clean structure for the current build

Organize the current build into a clear, conventional layout, for example `src/engines/`
(pure calculation code: budget, cash flow, net worth, taxes, with no DOM or UI),
`src/ui/` (screens and components), `src/data/` (schemas, defaults, sample households),
`tests/`, `docs/`. Adapt to what exists; do not force a structure that does not fit. Pull
any calculation logic that lives inside UI code out into engines. Remove duplicated logic
so each calculation exists in exactly one place. Consistent file and function naming.

### Step 4: Comments that explain why

A short header comment on every file: what it is responsible for and what it depends on.
Inside the code, comment the finance rules, formulas, assumptions, and anything
non-obvious (why a number is take-home rather than gross, how estimate vs actual is
compared). Do NOT comment obvious lines; over-commenting looks auto-generated. JSDoc on
the public functions of each engine (inputs, outputs, units, monthly vs annual).

### Step 5: Tests

Unit tests for the engine math with hand-checkable examples (small round numbers someone
can verify in their head). All tests run with one command (for example `npm test`), and
that command is documented.

### Step 6: Documentation set

- `README.md`: what SLAM is in two sentences, who it is for, a screenshot or GIF if one
  can be generated with Playwright, how to run it locally, how to run tests, folder map,
  current status (done / in progress / planned). Link to `archive/README.md`.
- `docs/ARCHITECTURE.md`: a Mermaid diagram of how data flows (user input, storage,
  engines, screens), the data model and schema with each field's meaning and units, and
  how the pieces talk to each other.
- `docs/DECISIONS.md`: a decisions log in the format "Decision / Why / What we rejected",
  pulled from the code, commit history, and existing notes. Include the core concepts:
  DAITE, DRAFTT, estimate vs actual, the monthly plan-log-close loop, why Excel-first is
  used to validate the math. Mark anything inferred rather than documented as
  "(inferred, needs confirmation)".
- `docs/GLOSSARY.md`: every domain term and acronym in plain English (a programmer will
  not know finance jargon or Eli's framework names).
- `KNOWN_ISSUES.md`: honest, ranked list of bugs, rough edges, and tech debt.
- `docs/TOUR.md`: a 10-minute guided tour for a programmer, with exactly these sections:
  1. About this project: who Eli is (financial coach, ex-Deloitte audit, CPA-eligible,
     100+ clients), the problem SLAM solves, and why Eli built it. Leave clearly marked
     placeholders for personal details rather than inventing them.
  2. The tour: which files to open first and in what order, and what each one shows.
  3. What Eli is proudest of: the strongest parts of the build and design decisions, with links.
  4. Where Eli wants feedback: specific, concrete technical questions (architecture, data
     model, testing, what you would change first), pulled from `KNOWN_ISSUES.md` and the audit.
  5. Where a collaborator would make the biggest difference: the parts of the roadmap that
     need real engineering skill (hosting, coach and client accounts, syncing, scaling the
     engines), framed as an open invitation, not a job posting.
  6. How Eli works: builds with Claude Code, one branch and small commits per change,
     tests before and after. Matter-of-fact.

### Step 7: Polish

Add a formatter and linter config (Prettier, ESLint, or whatever fits) and run it across
the current build only, not `archive/`. Add a `.gitignore` if missing. Make sure the live
site still loads and all tests pass. Also verify that every old link redirects correctly.

### Step 8: Final report

Re-run all tests and give Eli:
1. Before vs after: folder tree before, folder tree after, test results before and after.
2. What was moved, merged, or extracted, one line each.
3. Anything left alone because it was unclear.
4. A numbered list of questions, including every "(inferred, needs confirmation)" item
   from `docs/DECISIONS.md`.
5. Every redirect created (old URL to new URL).
6. Every placeholder in `docs/TOUR.md` that Eli needs to fill in.

Do not merge into `main`. Eli reviews the branch first.

---

## 2. Where things stand

| Step | Status | Notes |
| --- | --- | --- |
| 0. Branch, tag, baseline tests | Partly done | Branch and tag exist locally and are pushed with this commit. Unit baselines recorded (below). Browser baselines are NOT validly recorded yet (see section 3). |
| 1. Audit | Started, nothing saved | An 11-reader parallel audit was running when the laptop had to stop. It had written no notes yet. Everything learned so far is in sections 3 to 5 of this file. `docs/AUDIT.md` does not exist yet. |
| 2 to 8 | Not started | Nothing moved, nothing written. The proposed plan is in section 5. |

### Baseline test results (unit suites, run on 2026-10-23 on Windows, Node 24.14)

These are the commands CI runs (`.github/workflows/test.yml`), each run from the repo root
unless noted. CI on `main` at 0f390a6 is green (both the `test` and `pages` workflows).

| Command | Result on the laptop | Note |
| --- | --- | --- |
| `node test/run.js` (root SPARKS suite) | 2 failed, 35883 passed | Both failures are environment-specific, see section 3. Before the line-ending fix it was 17 failed. Expect 0 failures on Linux. |
| `node test/solar.js` | pass | |
| `node dnd/test/run.js` | pass | |
| `node coach/test/run.js` | pass | |
| `node money-rooms-v3/tests/run.js` | pass | |
| `node marketing/test/run.js` | pass | |
| `node test/export.js` | pass | |
| `node test/xlsx.js` | pass | |
| `cd slam && node --test` | pass, 0 failures, about 3 seconds | SLAM's unit suite. |
| `cd tests && npm ci && npm test` (Lane 2) | pass: 4457 + 905 + 207 checks | It rewrites tracked files every run: `tests/reports/*.json` and `docs/lane2-findings.md`. Restore them after running (`git checkout -- tests/reports docs/lane2-findings.md`). |

### Browser (Playwright) baselines: not yet valid

The first attempt ran against the wrong tree (section 3, stale servers). What was observed
is not a baseline. The cloud session must run these fresh, before any change:

1. Root SPARKS gates (12 scripts; CI "browser" job). Serve the repo root on 8765
   (`python3 -m http.server 8765 &`), then with `NODE_PATH=$PWD/node_modules`:
   `node test/render.js`, `features.js`, `sidebar.js`, `forms.js`, `anchors.js`, `flow.js`,
   `opening.js`, `statement.js`, `onefact.js`, `xss.js`, `comeback.js`, `alignment.js`.
   Fifteen test files honor `SLAF_BASE`; `test/anchors.js` and `test/flow.js` hardcode
   port 8765. CI gives this job 40 minutes; render took about 3 minutes and features
   about 6 minutes locally.
2. SLAM screen checks: `slam/tools/screens-check.mjs`, `journeys.mjs`, `layout-check.mjs`
   (and `gallery.mjs`, which writes screenshots and is a visual diff, not pass/fail).
   They expect `http://localhost:8765/` to be the `slam/` folder itself
   (`cd slam && python3 -m http.server 8765 &`), or set `SLAM_URL`. They must not be
   run against the repo root on 8765.
3. Money Rooms v3 sweep: `node money-rooms-v3/tests/ui.js`. It spawns its own
   `python3 -m http.server` on a free port. About an hour in CI (90 minute limit).
   Locally it ran 707 seconds then died with
   `page.waitForTimeout: Target page, context or browser has been closed` at
   `money-rooms-v3/tests/ui.js:105`. Not diagnosed; may be a Windows or resource problem.
   Run it once on Linux to know.

Install: `npm install --no-save playwright@1.49.0 && npx playwright install --with-deps chromium`
at the repo root. The root `.gitignore` ignores `package.json`, `package-lock.json`, and
`node_modules/`, so the install leaves no tracked change.

---

## 3. Problems and quirks found so far

1. **Windows line endings broke the root suite.** Eli's global git config has
   `core.autocrlf=true`, so the clone checked out with CRLF. `node test/run.js` then
   reported 17 failures: eleven "mounts the template" checks, "the committed rooms.json is
   what the tool writes now", "writes only person.unemployment", and a date test. Fix on
   the laptop: `git config core.autocrlf false` in the repo and a script that rewrote the
   1404 `i/lf w/crlf` files to LF. The suite then shows 2 failures. A Linux cloud session
   will not hit this. For Step 7, add a `.gitattributes` with `* text=auto eol=lf` so
   Windows contributors get LF too.
2. **Two remaining root-suite failures are environment-specific, not bugs in the app.**
   (a) "and ends 12 weeks from now" expected 2026-11-28, got 2026-11-27: the test depends
   on the machine's timezone. (b) The XSS ratchet ("no file gained an innerHTML that
   concatenates a variable without esc()", `test/xss-baseline.json`) keys its baseline by
   `rooms/budget.html` but builds `rooms\budget.html` on Windows, so every file looks new.
   Both belong in `KNOWN_ISSUES.md` as test portability items. Expect both to pass on Linux.
3. **`node --import` needs a `file://` URL on Windows.** A preload shim written to replace
   `python3 -m http.server` (this laptop has no Python) failed with
   `ERR_UNSUPPORTED_ESM_URL_SCHEME` when given `C:/...`; `node --import file:///C:/...`
   works. The shim swapped the spawn of `python3` in `money-rooms-v3/tests/ui.js` for a
   small Node static server, by patching `child_process.spawn` and calling
   `module.syncBuiltinESMExports()`. None of this is needed on Linux.
4. **Stale servers from a previous Claude session confounded the first browser run.**
   Yesterday's session (2026-10-22) left two Node static servers listening on 127.0.0.1:8765
   and :8766, serving a different checkout (branch `claude/slam-phase-1-foundation`). The
   new servers failed with EADDRINUSE and the tests silently ran against the old tree. The
   stale processes were stopped. Lesson for the cloud session: `curl -I` the port before
   trusting any browser result, and prefer a fresh port.
5. **Lane 2 (`tests/`) rewrites tracked files on every run** (`tests/reports/*.json`,
   `docs/lane2-findings.md`). Rough edge for `KNOWN_ISSUES.md`.
6. **Unmerged SLAM work exists off `main`.** `origin/claude/slam-phase-1-foundation` is
   20 commits ahead of `main` (2026-10-22 and 10-23: SLAM Ledger, Dashboard money-flow
   diagram, profile save and load, "design rules, a redrawn money flow, affordance fixes,
   vehicle depreciation"). That branch's `slam/` has a different layout (`slam/engine/`,
   `slam/ui/`) from `main`'s (`slam/src/calc/`, `slam/src/store/`, `slam/src/ui/`).
   Yesterday's laptop checkout of that branch also had uncommitted edits to
   `slam/engine/flags.js`, `slam/ui/dashboard.js`, `slam/ui/scenario.js`, `slam/ui/view.js`.
   The cleanup branch is based on `main` as instructed. This is question 1 for Eli: is
   `main`'s `slam/` the build to clean up, or should that branch land first?
7. **Money Rooms v2 is not in this repo.** It is the separate repo
   `Sapphirestoneage/money-rooms` ("Money Rooms v2: free, comprehensive financial planning
   software from Stress Less About Money", Vite + TypeScript, last pushed 2026-10-05).
   The archive story should mention it and link to it; nothing to move.

---

## 4. Facts a fresh session needs

### What is in the repo (main at 0f390a6, about 110 MB without .git, 2162 files)

| Path | What it is | Generation | Dates (first, last commit, count) |
| --- | --- | --- | --- |
| `index.html`, `foo-ladder.js` | The root page: the FOO (Financial Order of Operations) ladder calculator. The very first thing in the repo (2026-07-06, with the no-extension file `Inheritance FOO`). | oldest | 2026-07-06 to 2026-09-22 |
| `map.html`, `rooms/` (99 html), `shared/`, `engines/`, `data/`, `test/`, `fixtures/`, `scripts/`, `tools/`, `vendor/`, `rooms.json`, `sync.json`, `version.json`, `favicon.svg` | SPARKS / SLAF: about 70 to 93 small finance "rooms" sharing one household model in localStorage. Static HTML and vanilla JS, no build step. The root `README.md`, `CLAUDE.md`, `SPEC.md`, `ROADMAP.md`, `DECISIONS.md` (1.1 MB, D-### entries), `STATUS.md`, `PROGRESS.md`, `PANEL_REVIEW.md`, `MONEY-MAP.md`, `DESIGN-AUDIT.md`, `RELEASE.md`, `LATER.md`, the seven root `.png` files, `.claude/` (slash commands and room cards), `docs/` (18 files incl. `docs/ARCHITECTURE.md` and `docs/context/`), and `tests/` (the "Lane 2" npm harness: corpus, property, data, glossary, migration, QR tests) all belong to it. | older generation | 2026-09-03 to 2026-09-24 (rooms 349 commits, shared 324, engines 202, test 419) |
| `dnd/` | Dungeons & Dividends: a personal-finance RPG character sheet, 11 pages, its own tests, vendored copies of SPARKS `shared/` files. Six html files hardcode `https://sapphirestoneage.github.io/Personalfinance/dnd/...` URLs (og tags and share links). | side app | 2026-09-04 to 2026-09-24, 234 commits |
| `coach/` | Coach Mode (D-339): a coach's console, live session, client view. Vendors SPARKS files byte for byte via `coach/tools/vendor.js` (its `--check` reads SPARKS paths). | older generation (first coach-operated attempt) | 2026-09-24 to 09-26, 8 commits |
| `marketing/` | Marketing Scoreboard (D-340): content log, small CRM, KPIs, plus `Marketing-Scoreboard.xlsx`. Vendors SPARKS and coach files. Not a finance tool version. | side app | 2026-09-26, 4 commits |
| `money-rooms-v3/` | Money Rooms v3 (Coach Edition, D-341): engine (units, tax, debtsim, projection, 74 metrics, 40 lenses, FI ladder), ui, D3 vendored, its own Playwright sweep. 80 MB, almost all `screenshots/`. | older generation (immediately before SLAM) | 2026-10-05 to 10-17, 105 commits |
| `slam/` | SLAM (Stress Less About Money) Budget: the CURRENT build. `src/calc/` 43 pure-math files (about 5500 lines), `src/store/` 21 files (about 2800 lines), `src/ui/` (13 screens, 21 components, 12 chart files, about 1050 lines in the top level), `data/` 6 reference JSON files, `test/` 42 `*.test.js` files plus `test/households/` (demo households with hand-computed `*.expected.js`), `tools/` (Playwright checks, screenshot gallery with 96 approved shots, Riley and Dana generators). Docs: `README.md`, `AUDIT.md` (self-audits by date), `LESSONS.md` (23 rules from past versions), `HOSTING.md`, `PARKING_LOT.md`, `DECISIONS.md` (S-### table, 113 KB). | current | 2026-10-15 to 10-20, 78 commits, PRs #51 to #78 from branch `claude/slam-budget-build-m26h38` |
| `.github/workflows/test.yml`, `pages.yml` | CI: three parallel jobs (unit suites incl. `cd slam && node --test` and `cd tests && npm ci && npm test`; the 12 browser gates; the Money Rooms v3 sweep). Pages publishes from branch `main`, root, legacy build; `pages.yml`'s Actions deploy is dormant until the `PAGES_VIA_ACTIONS` variable is set. | infrastructure | |
| `.gitignore` | Ignores `node_modules/`, `package.json`, `package-lock.json` at any depth (the "no dependencies" stance of SPARKS), coach and client export patterns, `/clients`, `money-rooms-v3/screenshots/.tmp-*` and `level-stage/`. A root `package.json` for `npm test` will need an un-ignore. | infrastructure | |
| `.nojekyll` | Must stay at the root so Pages serves the tree verbatim. | infrastructure | |

Commits: 848 total (5 in July 2026, 640 in September, 203 in October). About 30
`claude/*` remote branches exist; group them by generation when telling the story.

### Live URLs (Pages serves `main` from the root)

Base: `https://sapphirestoneage.github.io/Personalfinance/`. Anything below may have been
shared and needs a redirect stub if it moves: `index.html` (the FOO calculator), `map.html`,
`rooms/<id>.html` (99), `dnd/*.html` (11), `coach/*.html` (3), `marketing/*.html` (3),
`money-rooms-v3/index.html`, `slam/index.html` (SLAM uses hash routes: `#today`, `#plan`,
`#track`, `#review`, `#insights`, `#setup`, `#clients`; old `#budget`, `#fill`, `#analyze`
still open Today, Plan, Insights). A redirect stub should preserve `location.hash`.

Hardcoded `/Personalfinance/` paths exist in: `.claude/commands/wrap.md`, `CLAUDE.md`,
`DESIGN-AUDIT.md`, `README.md`, `ROADMAP.md`, `rooms/data.html`, `test/run.js`,
`tests/qr.test.js`, `money-rooms-v3/FINAL-REPORT.md`, `money-rooms-v3/QUESTIONS.md`, and
six `dnd/*.html` files (`campaign`, `card`, `descent`, `index`, `menagerie`, `profile`).
`sync.json` also carries the github.io URL. Grep `/Personalfinance/` and
`sapphirestoneage.github.io` before and after every move.

### Things that read other folders by path (will break on a move)

- `coach/tools/vendor.js` and `marketing/tools/vendor.js` copy SPARKS (and coach) files
  by relative path; `--check` compares them.
- `tools/context/build.js` and `pack.js`, `tools/rooms-json.js`, `test/run.js` (it checks
  `rooms.json`, `CLAUDE.md`, `shared/registry.js`) all assume the SPARKS layout at the root.
- `.github/workflows/test.yml` names every suite path and `working-directory: slam`.
- SLAM fetches its demo households at runtime from `test/households/` relative to
  `slam/index.html` (`slam/src/ui/refs.js` lines 36 and 42). Move the households and the
  fetch path together; S-025 says demos and tests must share one copy.
- `node --test` with no arguments walks every `**/test/**/*.js` under the cwd. Once
  `archive/` exists at the root, `npm test` must point at the SLAM tests folder explicitly
  (for example `node --test tests/`), or it will pick up the archived suites.
- No reference from `slam/` to anything outside `slam/` was found (no `../` imports); the
  audit was about to confirm this with a full grep. Confirm before promoting.

### Concepts and where they are defined (for GLOSSARY and DECISIONS)

- `docs/ARCHITECTURE.md` (SPARKS, one page) defines DAITE (debt, assets, income, taxes,
  expenses; D-171), FAT (food, accommodation, transportation; D-172, D-197), DRAFTT (seven
  shares, D-173; in SLAM: Debt, Retirement, Accommodation, Food, Transportation, plus
  Therapy, descriptive not graded, S-072), the Ledger, Spheres, Blocks, Lenses, Levers,
  Triple D (drawdown, duration, depth).
- `slam/LESSONS.md`: the 23 rules every SLAM change is checked against (one place per
  number; status on every value; math only in `src/calc/`; take-home not gross, lesson 16;
  estimates never overwritten, lesson 17; the bridge from budget surplus to cash, lesson 18;
  the log owns the money, lesson 20; two net worths, lesson 22; paid ahead, lesson 23).
- `slam/README.md`: the monthly loop (Plan, Track, Review), the seven screens, net worth
  (total vs FI), finding things, future tools parked, the 5-task test.
- `slam/DECISIONS.md`: S-001 (2026-10-15) onward, one row per decision with its why.
  Grep `DRAFTT`, `take-home`, `estimate`, `Excel`, `spreadsheet` for the core concepts.
  "Excel-first to validate the math" was not yet located in the docs; `test/xlsx.js` and
  `marketing/Marketing-Scoreboard.xlsx` (MD-010, "every number a formula you can click")
  are the leads. If it cannot be found, mark it "(inferred, needs confirmation)".
- Root `CLAUDE.md` says the owner is not a coder, lists the non-negotiables (no real
  financial data, empty is not zero, integer cents, one owner per field, one formula one
  function, never rebuild a live form), and describes a feature freeze from D-313.

---

## 5. Proposed plan for Steps 2 to 7 (not executed; a judgment call to confirm)

Target layout, chosen so the repo root IS the current app:

```
README.md  KNOWN_ISSUES.md  CLAUDE.md (rewritten for SLAM; old one archived)
.gitignore (package.json un-ignored)  .gitattributes (eol=lf)  .nojekyll  package.json
.github/workflows/  (paths updated; archive suites kept running but in their own job)
index.html                 SLAM's entry (from slam/index.html)
src/engines/               from slam/src/calc   (rename calc to engines; update imports)
src/store/                 from slam/src/store
src/ui/                    from slam/src/ui
src/data/                  from slam/data, plus households/ (from slam/test/households; refs.js fetch path updated)
tests/                     from slam/test (npm test = node --test tests/)
tools/                     from slam/tools
docs/                      AUDIT, ARCHITECTURE, DECISIONS, GLOSSARY, TOUR, HANDOFF, plus SLAM's
                           LESSONS.md, HOSTING.md, PARKING_LOT.md, decisions-log.md (the S-### table),
                           self-audits.md (old slam/AUDIT.md, renamed to avoid clashing with the new AUDIT.md)
archive/
  README.md                the evolution story: FOO calculator (Jul 2026) -> SPARKS rooms (Sep) -> D&D
                           (Sep) -> Coach Mode (late Sep) -> Money Rooms v2 (separate repo) ->
                           Money Rooms v3 (Oct 5-17) -> SLAM (Oct 15 on), what each taught (slam/LESSONS.md)
  sparks/                  everything SPARKS listed above, including its docs, .claude/, tests/ (Lane 2), pngs, Inheritance FOO
  dnd/  coach/  marketing/  money-rooms-v3/
slam/index.html            redirect stub to ../ (keeps the /slam/ URL alive)
map.html, rooms/*.html, dnd/*.html, coach/*.html, marketing/*.html, money-rooms-v3/index.html
                           redirect stubs (meta refresh + canonical + JS that carries the hash)
```

Open point: the root URL used to show the FOO calculator and would now show SLAM. A
redirect cannot cover that. Options: accept it (SLAM is the current build), or add a small
"looking for the old FOO calculator? it moved to archive/sparks/" line. Ask Eli.

Alternative if promoting SLAM feels too risky: keep `slam/` as is, archive everything else,
make the root `index.html` a one-screen landing page linking to `slam/` and `archive/`.
Cleaner history, less conventional layout.

Step 3 extraction candidates were not yet audited. Start by grepping `slam/src/ui` for
`/ 12`, `* 12`, `/ 100`, `reduce(`, `toFixed`, `Math.round`, `surplus`, `safe`, `rate`,
`pct`, and compare against lesson 3 (screens never calculate). SLAM's own audit
(`slam/AUDIT.md`, lesson 3 row) claims a prior scan found only layout math plus one
rounding that was moved into calc; verify rather than trust.

Step 5: tests already exist with hand-computed households. Add a small
`tests/engines-roundnumbers.test.js` style file with $1,000-scale examples per engine
(normalize to monthly, percent of take-home, surplus, savings rate, bridge, simple tax).

Step 7: ESLint (flat config, `eslint:recommended`, browser + node globals, ESM) and
Prettier, run on `src/`, `tests/`, `tools/` only, never `archive/`. Verify redirects by
starting a static server at the root and requesting every old path, following redirects,
and asserting 200 at the archive target.

---

## 6. How to run things

```
# unit (from the repo root)
node test/run.js && node test/solar.js && node dnd/test/run.js && node coach/test/run.js \
  && node money-rooms-v3/tests/run.js && node marketing/test/run.js && node test/export.js && node test/xlsx.js
(cd slam && node --test)
(cd tests && npm ci && npm test && git checkout -- reports ../docs/lane2-findings.md)

# browser
npm install --no-save playwright@1.49.0 && npx playwright install --with-deps chromium
export NODE_PATH="$PWD/node_modules"
python3 -m http.server 8765 >/dev/null 2>&1 &      # repo root, for test/*.js
for t in render features sidebar forms anchors flow opening statement onefact xss comeback alignment; do node test/$t.js; done
(cd slam && python3 -m http.server 8777 >/dev/null 2>&1 &)   # slam as its own root
SLAM_URL=http://127.0.0.1:8777/ node slam/tools/screens-check.mjs
SLAM_URL=http://127.0.0.1:8777/ node slam/tools/journeys.mjs
SLAM_URL=http://127.0.0.1:8777/ node slam/tools/layout-check.mjs
node money-rooms-v3/tests/ui.js                      # spawns its own python3 server, about an hour
```

Serving over HTTP matters; `file://` blocks the `fetch()` of `data/` and the households.

---

## 7. Questions accumulated for Eli so far

1. Is `main`'s `slam/` the build to clean up, or should `claude/slam-phase-1-foundation`
   (20 unmerged commits, different `slam/engine/` and `slam/ui/` layout, plus four
   uncommitted files on the laptop) land first? The cleanup is based on `main`.
2. Promote SLAM to the repo root (so `/Personalfinance/` shows SLAM and `/slam/` redirects),
   or keep `slam/` and make the root a landing page?
3. The root URL used to be the FOO calculator. Is a one-line pointer to its archive home
   wanted on the SLAM page, or is a silent change fine?
4. Should the archived suites (SPARKS, D&D, coach, marketing, Money Rooms v3, about two
   hours of CI) keep running in CI, or run only on demand once archived?
5. Should `money-rooms-v3/screenshots/` (most of 80 MB) and `slam/tools/gallery-approved/`
   stay in git?
6. Where is "Excel-first to validate the math" written down? If nowhere, it will be
   marked "(inferred, needs confirmation)" in `docs/DECISIONS.md`.
7. Un-ignoring `package.json` at the root reverses the SPARKS "no dependencies" stance.
   OK for SLAM?

---

## 8. Laptop-side state (for Eli, not for the cloud session)

- The clone used for this work is `C:\Users\eli\code\Personalfinance` (made 2026-10-23;
  no earlier clone existed outside temporary session folders). It has
  `core.autocrlf=false` set locally and its working tree normalized to LF.
- Test logs from the baseline runs are under `C:\Users\eli\AppData\Local\Temp\claude\baseline\`.
- All servers and browsers started by this session were stopped. Yesterday's two stale
  servers (ports 8765 and 8766) were stopped too.
- No memory of this session exists in the repo beyond this file and the `pre-cleanup` tag.
