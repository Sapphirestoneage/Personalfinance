# The cleanup pass: final report

Branch `claude/peaceful-franklin-xlfo1t`, based on `cleanup-for-review` (which holds only the
handoff), which is based on `main` at 0f390a6 (tag `pre-cleanup`). Nothing was merged into
`main`. One commit per step, so each can be read or reverted on its own:

| Commit | Step |
| --- | --- |
| `c5059b09` | The handoff from the laptop session (on `cleanup-for-review`) |
| `2d62f8a9` | 1. `docs/AUDIT.md`, nothing else changed |
| `75be2b06` | 2. Every earlier generation moved into `archive/`, with the evolution story |
| `2a2d6241` | 2b. 119 redirect stubs at the old addresses |
| `7390e8cc` | 3. Conventional layout inside `slam/`; the 14 screen computations moved into the engines; one rounding helper |
| `96f985b6` | 5. Hand-checkable engine tests; `npm test` |
| `55d3ca5a`, `34853e63` | 6. README, TOUR, ARCHITECTURE, DECISIONS, GLOSSARY, KNOWN_ISSUES, CLAUDE.md, row S-140 |
| `9fc5f563` | 4. Header comments, finance-rule comments, engine JSDoc (comments only) |
| `5e425592` | 7a. ESLint, Prettier config, `.gitattributes`, lint fixes, CI lint job |
| `9f23aebc` | 7b. Prettier over the current build (formatting only, proven) |
| `711b8dfa`, this commit | 8. Doc corrections, `.git-blame-ignore-revs`, this report |

Step 4 sits after 5 and 6 in the history because the comment pass ran for hours in the background
(across two usage limits and a worker restart) while the smaller steps were committed around it.

## 1. Before and after

### Folder tree before (main at 0f390a6, 2,162 tracked files)

```
.  (2162 tracked files)
├── .claude/  (44 files)
│   ├── commands/  (6 files)
│   └── rules/  (38 files)
├── .github/  (2 files)
│   └── workflows/  (2 files)
├── coach/  (58 files)
│   ├── data/  (15 files)
│   ├── engines/  (10 files)
│   ├── shared/  (12 files)
│   ├── test/  (1 files)
│   ├── tools/  (1 files)
│   └── vendor/  (3 files)
├── data/  (119 files)
│   ├── blocks/  (9 files)
│   ├── events/  (11 files)
│   └── lane2/  (6 files)
├── dnd/  (59 files)
│   ├── data/  (19 files)
│   ├── engines/  (8 files)
│   ├── shared/  (11 files)
│   ├── test/  (3 files)
│   └── vendor/  (3 files)
├── docs/  (18 files)
│   └── context/  (5 files)
├── engines/  (93 files)
├── fixtures/  (107 files)
│   ├── exports/  (72 files)
│   ├── households/  (34 files)
│   └── snapshots/  (1 files)
├── marketing/  (30 files)
│   ├── data/  (2 files)
│   ├── engines/  (1 files)
│   ├── shared/  (8 files)
│   ├── test/  (1 files)
│   ├── tools/  (2 files)
│   └── vendor/  (3 files)
├── money-rooms-v3/  (945 files)
│   ├── audit/  (3 files)
│   ├── data/  (36 files)
│   ├── docs/  (1 files)
│   ├── engine/  (74 files)
│   ├── reference/  (6 files)
│   ├── screenshots/  (654 files)
│   ├── tests/  (85 files)
│   ├── ui/  (70 files)
│   └── vendor/  (6 files)
├── rooms/  (99 files)
├── scripts/  (3 files)
├── shared/  (62 files)
├── slam/  (297 files)
│   ├── data/  (6 files)
│   ├── src/  (117 files)
│   ├── test/  (63 files)
│   └── tools/  (104 files)
├── test/  (70 files)
│   ├── fixtures/  (5 files)
│   └── rooms/  (41 files)
├── tests/  (118 files)
│   ├── properties/  (98 files)
│   ├── reports/  (6 files)
│   └── tools/  (5 files)
├── tools/  (6 files)
│   └── context/  (4 files)
├── vendor/  (3 files)
│   └── fonts/  (3 files)
└── 29 files at this level
```

### Folder tree after

```
.                          README, KNOWN_ISSUES, CLAUDE.md, package.json, lint and format configs
├── .github/workflows/     test.yml (SLAM: lint, unit, browser), archive.yml (archived suites), pages.yml
├── slam/                  THE APP: index.html and its own README, LESSONS, DECISIONS, HOSTING, AUDIT
│   ├── src/
│   │   ├── engines/       43 pure-math modules (was src/calc/)
│   │   ├── store/         21 modules: the household document, edits, history, storage, merge
│   │   ├── ui/            screens/ (13), components/ (21), charts/ (12), app.js, nav.js, format.js
│   │   └── data/          6 reference tables (was data/) and households/ (was test/households/)
│   ├── tests/             42 test files, node --test (was test/)
│   └── tools/             Playwright checks, journeys, gallery, the two demo generators
├── docs/                  TOUR, ARCHITECTURE, DECISIONS, GLOSSARY, AUDIT, HANDOFF, images/
├── archive/
│   ├── README.md          the evolution story
│   ├── sparks/            the September tree whole: rooms, engines, shared, data, both test trees,
│   │                      dnd/, coach/, marketing/, its docs, CLAUDE.md, .claude/, old CI and .gitignore
│   └── money-rooms-v3/    whole, screenshots included
└── index.html, map.html, rooms/ (99), dnd/ (11), coach/ (3), marketing/ (3), money-rooms-v3/ (1)
                           redirect stubs only, so every address shared before the move still lands
```

2,304 tracked files (2,162 before, plus 119 redirect stubs, the documentation set, two screenshots,
the tooling configs and a lock file).

### Tests before (the untouched tree, on Linux, 2026-10-23)

| Suite | Result |
| --- | --- |
| SPARKS unit (`test/run.js`) | 35,885 checks pass |
| Solar System data (`test/solar.js`) | 5,191 pass |
| D&D (`dnd/test/run.js`) | 5,661 pass |
| Coach Mode (`coach/test/run.js`) | 157 pass |
| Marketing (`marketing/test/run.js`) | 171 pass |
| Export, spreadsheet (`test/export.js`, `test/xlsx.js`) | 33 and 33 pass |
| Money Rooms v3 unit (`money-rooms-v3/tests/run.js`) | 2,377 pass |
| Lane 2 (`cd tests && npm test`) | 9,583 + 3,957 + 4,457 + 905 + 207 pass |
| SLAM unit (`cd slam && node --test`) | 343 pass (336 real tests plus 7 files with no test in them) |
| SLAM Playwright: screens, journeys, layout | all pass (95s, 30s, 33s) |
| SPARKS browser gates (12) | 11 pass; `statement.js` fails one phone-height check by 23 px (1583 of 1560) on this machine while CI on `main` is green: an environment difference, recorded in KNOWN_ISSUES |
| Money Rooms v3 browser sweep | 93,720 checks pass in 19 minutes (the Windows crash the handoff reported does not happen on Linux) |

The two failures the handoff saw on Windows (a time-zone date and the XSS ratchet's path keys) do
not occur on Linux.

### Tests after

Re-run on the final tree, on the same Linux machine, each archived suite from its new home:

| Suite | Before | After |
| --- | --- | --- |
| SLAM unit (`npm test`) | 336 tests pass (343 counting empty files) | **350 pass** (the 14 new round-number tests included) |
| SLAM Playwright: screens, journeys, layout | pass | **pass** (every on-screen number matches the hand-computed files) |
| ESLint, Prettier | did not exist | **clean** |
| Redirects (119 old addresses, in Chromium, with query and hash) | did not exist | **119 of 119 land** |
| SPARKS unit | 35,885 pass | 35,885 pass |
| Solar System, D&D, Coach, Marketing | 5,191, 5,661, 157, 171 pass | same |
| Export, spreadsheet | 33, 33 pass | same |
| SPARKS context check, both vendor checks | pass | pass |
| Money Rooms v3 unit | 2,377 pass | 2,377 pass |
| Lane 2 | 9,583 + 3,957 + 4,457 + 905 + 207 pass | same |
| Money Rooms v3 browser sweep | 93,720 pass (19 min) | 93,720 pass (16 min) |
| SPARKS browser gates (12) | 11 pass; `statement.js` fails 1 of 86 (1583 of 1560 px) | the same 11 pass; the same check fails by the same 23 px |

Nothing that passed before fails now. The one failure is identical before and after and comes from
this machine (font metrics), not the change: CI on `main` passes it. `anchors.js` failed once mid-pass
while four agents were loading the machine, and passed when run alone and in this final run.

## 2. What was moved, merged, or extracted

Moved (git mv, content unchanged unless noted):

- `index.html`, `foo-ladder.js`, `map.html`, `Inheritance FOO` -> `archive/sparks/`
- `rooms/`, `engines/`, `shared/`, `data/`, `test/`, `tests/`, `fixtures/`, `tools/`, `scripts/`, `vendor/`, `.claude/` -> `archive/sparks/<same>/`
- The twelve root Markdown files, `rooms.json`, `sync.json`, `version.json`, `favicon.svg`, seven `.png` files -> `archive/sparks/`
- `docs/` (everything except `AUDIT.md` and `HANDOFF.md`) -> `archive/sparks/docs/`
- `dnd/`, `coach/`, `marketing/` -> `archive/sparks/<same>/` (inside sparks because their tests and vendoring tools reach SPARKS by relative path)
- `.github/workflows/test.yml`, `pages.yml` (the September CI) -> `archive/sparks/.github/workflows/`; new `test.yml`, `archive.yml`, `pages.yml` at the root
- `.gitignore` -> `archive/sparks/.gitignore` (the coach and marketing suites read it); a new root `.gitignore`
- `money-rooms-v3/` -> `archive/money-rooms-v3/`
- `slam/src/calc/` -> `slam/src/engines/`; `slam/test/` -> `slam/tests/`; `slam/data/` -> `slam/src/data/`; `slam/test/households/` -> `slam/src/data/households/`

Edited in the archive (the only content edits there): six D&D pages' `og:url` and `og:image` tags
now point at the archive address; each archived README opens with a one-line "Archived" note; the
SPARKS context index (`archive/sparks/docs/context/DOC-MAP.md`) was regenerated for that note's two lines.

Merged (one place for one formula):

- 13 identical local rounding helpers -> `r2`, `r2OrNull`, `r2Exact` in `slam/src/engines/money.js` (`split.js` and `dream-life.js` keep theirs; they differ in -0 handling and say so)
- The bridge chart's bare `25` -> the engine's `TIES_WITHIN`
- `sumParts` and `PART_CADENCES` (cadence math) -> `engines/normalize.js`, re-exported from `store/value.js`

Extracted from screens into engines (each as an additive field or a small pure function):

- `cardInterestTotal(rows)` (debts.js) from the interest chart
- `gapFromEstimate`, `gapFromPlan` on income sources and totals (income-month.js) from two income tables
- `cashChange` on an era (eras.js) from the Eras screen
- `merchantRange(visits)`, row `total` and grid `top` in `categoryGrid`, `waterfallSteps(mom, 8)` (trends.js) from the trend charts
- `cashAfter` per calendar item and `spreadTotal` per day (calendar.js) from the By date list
- `estTotalPerPaycheck`, `gapPerPaycheck` on the tax check, `takeHomeWeekly` on unemployment, `fromPaycheckByLineType` on the income summary (income.js) from the Setup and Plan screens

Added: `slam/tests/engines-roundnumbers.test.js` (14 tests), root `package.json` (`npm test`,
`test:browser`, `serve`, `lint`, `format`), `eslint.config.js`, `.prettierrc`, `.prettierignore`,
`.gitattributes`, the documentation set, 119 redirect stubs, `docs/images/` (two screenshots).

## 3. Left alone because it was unclear

- Everything under `archive/`: the duplicated finance rules across generations (`docs/AUDIT.md` section 4), the 74 MB of Money Rooms screenshots, the hard-coded live paths in archived prose, the two Windows-only test quirks. Archived code is history; the audit lists them.
- The five never-imported engine exports and the forty exported-but-local ones (`KNOWN_ISSUES.md` 11): removing code was outside "no behavior change".
- The two rounding variants that differ from `money.js` (`split.js`, `dream-life.js`): unifying them changes how a negative zero prints.
- Thresholds that live in screens as wording choices ($100 "big bill", $1 tolerances, a 10% blind-spot warning): left where the wording is, listed in KNOWN_ISSUES 12.
- `slam/AUDIT.md` (the dated self-audits) and `slam/DECISIONS.md` rows that name old paths: left as written, with a note at the top saying what the folders are called now.
- `slam/` stayed the app folder rather than being promoted to the repository root (question 2).
- The statement gate's 23-pixel failure and the anchors gate's one failure under load: both environment, neither changed.
- `docs/HANDOFF.md`: kept as the record of how this pass started.

## 4. Questions and judgment calls

Decisions I made that you may want to reverse are marked with the step they live in.

1. **Which SLAM is the current build?** This pass cleaned `main`'s `slam/` as instructed. Two branches continue SLAM and are not on `main`: `claude/slam-phase-1-foundation` (closed out 2026-10-23 04:46 with `SIGNOFF.md`) and `claude/slam-phase-2` (34 commits ahead of `main`, last commit 05:14 the same morning). They add a Ledger and a Dashboard beside the Budget inside `slam/` with their own `slam/engine/` (24 files) and `slam/ui/` (10 files) and change none of the Budget's 117 source files; outside `slam/` they add lines to `.gitignore`, `CLAUDE.md` and `test/run.js`. Merge order if they land: merge this branch first, then rebase or merge the phase branch onto it; the three outside-`slam/` edits may conflict and need a hand check (`.gitignore` and `CLAUDE.md` were rewritten at the root; `test/run.js` moved to `archive/sparks/`, where git may carry the edit over by itself); the new `slam/engine/` and `slam/ui/` folders will land untouched and the result will have two math libraries inside one app until they are reconciled. If the phase branch should land first instead, steps 1, 2, 2b and 6 of this pass still apply as they are; steps 3, 4, 5 and 7 would need to be re-run over the merged `slam/`.
2. **Promote SLAM to the repository root, or keep `slam/`?** Kept `slam/` (step 2 and 3). Reasons: the two open branches build inside `slam/`, the live `/slam/` address stays as it is, and the root still opens SLAM through the redirect. The handoff's alternative (SLAM's files at the root) is a bigger move with more to break and can still be done later.
3. **The root address.** `https://sapphirestoneage.github.io/Personalfinance/` now redirects to `slam/`. The stub page carries one line pointing at the archived Dashboard, visible only if the redirect does not fire. Nothing was added to SLAM's own screens. Want a landing page instead, or a line inside SLAM?
4. **Archived test suites in CI.** They run from `.github/workflows/archive.yml` when something under `archive/` changes, or on demand; `test.yml` runs SLAM only. The old behavior was two hours of CI on every push.
5. **The screenshots.** `archive/money-rooms-v3/screenshots/` (74 MB) and `slam/tools/gallery-approved/` (5.9 MB) stayed in git. Keep them, move them to Git LFS, or drop the Money Rooms set from history (which rewrites history)?
6. **"Excel-first to validate the math."** Not written down anywhere in the repository. The nearest records are the hand-computed households, your Buy vs Rent workbook that Money Rooms v3 ported, and the Marketing Scoreboard's spreadsheet twin. `docs/DECISIONS.md` item 12 marks it inferred. Where does it come from, or should it be dropped?
7. **A root `package.json`.** Added for `npm test` and the lint and format tools (dev dependencies only; the app still has none). It reverses the SPARKS stance of ignoring every `package.json`.
8. **The branch name.** This session was bound to `claude/peaceful-franklin-xlfo1t`, so the work is there, based on `cleanup-for-review`. To put it on the branch you named: `git push origin claude/peaceful-franklin-xlfo1t:cleanup-for-review` (a fast-forward).
9. **No `LICENSE` file.** The repository is public. Which license, if any?
10. **DAITE is not used in SLAM** (`docs/DECISIONS.md` item 9, inferred). Was that a decision?
11. **No build step and no dependencies as a deliberate choice** (item 15, inferred). Is the reason I gave yours?
12. **Dollars as typed rather than integer cents** (item 2): the "what we rejected" side is inferred from SPARKS. Did you weigh cents and reject them, or did the brief simply say `amount: number`?
13. **Dead exports** (KNOWN_ISSUES 11): remove them in a follow-up?
14. **The two rounding variants** (KNOWN_ISSUES 3): unify them, accepting that a rounded negative zero would print as $0 instead of -$0?
15. **TOUR.md section 1** needs your paragraph about yourself and why you built it; section 3 ("what Eli is proudest of") is my reading of the code and needs your confirmation or reordering.
16. **`slam/AUDIT.md` lesson 3 row** says the UI had only layout math; the audit found fourteen computations. I left the row as a dated record and put the correction in `docs/AUDIT.md`. Amend the row instead?
17. **Row S-140 in `slam/DECISIONS.md`** was written by this pass (the stored-shape compatibility note for the income gap fields). It is your log; edit or reword as you like.
18. **The new root `CLAUDE.md`** replaces the SPARKS one (now `archive/sparks/CLAUDE.md`). It carries forward the non-negotiables and adds the archive rule and the two open branches. Review the rules.
19. **Style choices in step 7**: Prettier at 120 columns, single quotes, no trailing commas (matching the code's habits); ESLint recommended with underscore-prefixed unused names allowed and empty catch blocks allowed. Change any of it and re-run `npm run format`.
20. **Two archived browser gates are sensitive to the machine**: `statement.js` fails a phone-height limit by 23 px on this Linux box (fonts), `anchors.js` failed once under load and passed alone. Worth loosening the limits or pinning a font in the archive, or leave as is?
21. **D&D share tags** now point at the archive address, so new shares preview correctly; old shares' image previews will 404 (images get no stubs). Fine?
22. **The "Archived" line** at the top of each archived README: keep, or leave the archive byte-for-byte?
23. **KNOWN_ISSUES.md ranking**: twenty items ordered by my judgment of what matters to a user or an engineer. Reorder as you see it.
24. **The comment pass needed two catch-up rounds.** My first batch lists named two household files that do not exist and missed seven small components, two tests and a fixture; both were caught by a check for untouched files and covered. No action needed; noted so the history makes sense.

## 5. Every redirect created

Each stub forwards with the query string and hash intact and was verified by serving the root and
requesting all 119: every stub answers 200 with a refresh whose target also answers 200.

| Old address | Now |
| --- | --- |
| https://sapphirestoneage.github.io/Personalfinance/rooms/*.html (99 pages: accounts, adventure, between-jobs, big-purchase, bridge, buckets, ...) | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/rooms/<same name>.html |
| https://sapphirestoneage.github.io/Personalfinance/dnd/*.html (11 pages: bestiary, campaign, card, descent, dm, encounter, ...) | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/dnd/<same name>.html |
| https://sapphirestoneage.github.io/Personalfinance/coach/client.html | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/coach/client.html |
| https://sapphirestoneage.github.io/Personalfinance/coach/index.html | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/coach/index.html |
| https://sapphirestoneage.github.io/Personalfinance/coach/session.html | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/coach/session.html |
| https://sapphirestoneage.github.io/Personalfinance/marketing/index.html | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/marketing/index.html |
| https://sapphirestoneage.github.io/Personalfinance/marketing/people.html | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/marketing/people.html |
| https://sapphirestoneage.github.io/Personalfinance/marketing/posts.html | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/marketing/posts.html |
| https://sapphirestoneage.github.io/Personalfinance/money-rooms-v3/index.html | https://sapphirestoneage.github.io/Personalfinance/archive/money-rooms-v3/index.html |
| https://sapphirestoneage.github.io/Personalfinance/map.html | https://sapphirestoneage.github.io/Personalfinance/archive/sparks/map.html |
| https://sapphirestoneage.github.io/Personalfinance/index.html | https://sapphirestoneage.github.io/Personalfinance/slam/ |

## 6. Placeholders in docs/TOUR.md

| Line | What is needed |
| --- | --- |
| 9 | Section 1: one paragraph about you in your own words (financial coach, audit background at Deloitte, CPA-eligible, 100+ clients, how long and what kind of clients). |
| 20 | Section 1: why you built it rather than buying it, one or two sentences. |
| 59 | Section 3: confirm or reorder "what Eli is proudest of"; the seven items are my reading of the code. |

## 7. Step 4: the comment pass

Every file of the current build (169 files under `slam/src`, `slam/tests` and `slam/tools`) has a
header saying what it is responsible for and what it depends on; every exported engine function has
JSDoc with units (dollars a month or a year, ratios, percent numbers, date and month strings) and
says monthly or annual where it matters; finance rules and non-obvious choices are explained where
they are made. 3,586 lines of comments added, 731 replaced.

How it was done and checked: each batch of files had a writer and a separate reviewer told to flag
restated code, filler, wrong claims, missing units and stale paths; their notes were applied (the
last three batches' notes by hand, after a usage limit stopped the fix agents). Then, over all 169
files: an acorn tokenizer comparison shows every file's code is token-identical to the commit before
(only comments changed), `node --check` passes, no em dashes, no stale folder names. `npm test` and
all three Playwright checks pass on the commented tree. One file each was read in full by me to
judge tone; the comments are plain and specific, but they are the work of many readers and some
files are now comment-heavy. If any feel like too much, deleting a comment is always safe.

## 8. Step 7: lint, format, and the live site

- **Linter:** ESLint 9, recommended rules, browser globals for the app and Node globals for tests
  and tools; `npm run lint`. It found 19 problems, all fixed in 7a without changing behavior (unused
  imports and locals, two unused parameters, a sparse-array default, a raw byte-order mark in a
  regex). One automatic fix was wrong (it dropped a test's `addAccount` call along with its unused
  name) and was caught on review and restored.
- **Formatter:** Prettier at 120 columns, single quotes in JavaScript, double quotes in CSS, no
  trailing commas, key quotes kept; `npm run format`. Applied in its own commit (7b) and proven to
  be formatting only: every JavaScript file parses to the same syntax tree, and both stylesheets are
  identical once whitespace, comments and leading zeros are normalized. `.git-blame-ignore-revs`
  lets blame skip that commit.
- **Repository hygiene:** `.gitattributes` forces LF, which prevents the Windows CRLF failures the
  handoff describes. The root `.gitignore` ignores `node_modules/` and carries forward every rule
  that keeps client data out of the public repository.
- **CI:** `test.yml` now has a lint job (`npm ci`, lint, format check), the unit job (`npm test`) and
  the browser job (the three SLAM checks). The archived suites moved to `archive.yml`.
- **The live site:** served from the repository root exactly as Pages serves `main`: `/` and
  `/slam/` answer, the app loads its scripts, reference tables and demo households, and all 119 old
  addresses, loaded in Chromium with a query string and a hash, land on their new address with both
  kept.

## 9. Independent verification of step 3

Step 3 claimed to change no behavior. Beyond the project's own gates (350 unit tests and the three
Playwright checks, which compare every on-screen number with the hand-computed files), 24
independent reviewers were asked to refute that claim: three per extraction group (numeric, render
and stored-data lenses), each comparing the two commits around the change and most of them running
a differential harness over the seven demo households and fuzzed inputs. 23 verdicts came back
(one was lost to an API limit); none refuted the claim. What they raised, and what was done:

- **A stored shape gained two fields.** `closeMonthSnapshot` saves the month's income totals whole,
  so months closed from now on carry `gapFromEstimate` and `gapFromPlan`. Additive; nothing reads
  them from a stored month; older months load unchanged. Logged as row S-140 in `slam/DECISIONS.md`.
- **A lookup by category type** (`fromPaycheckByLineType[r.type]`) is a plain-object lookup where
  the old code tested `health` and `transport` by name. Category types come from a fixed list, so no
  real type collides with an object property name, but the old form was immune and the new one is
  not. Step 7 restores the explicit gating.
- **Two fallbacks moved verbatim** from a chart into `engines/trends.js`: a heat-grid total and the
  waterfall's start treat a month with no actuals as 0 (`|| 0`). The numbers are identical to
  before; the reviewers' point is that an engine now holds a "fact folded to zero", against the
  house rule. Listed in `KNOWN_ISSUES.md`.
- **Edge cases that cannot occur today**: `minus()` treats an absent key as missing where the old
  inline check tested only `null` (saved review rows always carry both keys); `cashChange` is null
  when an era's net is null where the old expression would have produced a number (the screen never
  reaches that line without a net). Noted, no change.
- The rounding consolidation was checked bit for bit over a million inputs (null, undefined, -0,
  NaN, Infinity included): identical.
