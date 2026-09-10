# Lane 2 proposals

Changes lane 2 needs in files it may not touch (`shared/spine-v2.js`, `shared/schema.js`, `engines/`, `rooms/`, `.github/`). Each is the exact change, for the master build to apply or refuse. Nothing here is applied.

## P-1: a CI workflow that runs the corpus test (section 1)

The repo has no `.github/workflows/`. The gate for section 1 says "corpus test runs in CI", so this is the file. It runs the repo's own unit suite too, since that is what a contributor runs first.

File: `.github/workflows/tests.yml`

```yaml
name: tests
on:
  push:
    branches: [main, lane2]
  pull_request:
jobs:
  unit-and-corpus:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node test/run.js
      - run: node tests/corpus.test.js
      - run: node dnd/test/run.js
      - run: node test/export.js
```

Notes: the Playwright gates (`test/render.js`, `test/forms.js`, and the rest) need a browser and a local server and are left out here on purpose; a second job can add them once the master build wants them on every push. `tests/corpus.test.js` has no dependencies. When section 2 lands, add `cd tests && npm ci && node properties/run.js` after the corpus line.

## P-2: register three tables in `shared/reference.js` (section 1, observation)

`test/run.js` loads `data/access_rules.json`, `data/confidence_weights.json` and `data/ui_benefits.json` by hand because `Reference.TABLE_FILES` does not list them, and the corpus test had to do the same. If they are meant to be loaded by rooms through `Reference.load`, the change is three lines in `TABLE_FILES`:

```js
    accessRules: 'access_rules.json',
    confidenceWeights: 'confidence_weights.json',
    uiBenefits: 'ui_benefits.json',
```

If they are loaded another way on purpose, no change; this is only what the sweep tripped on. DECIDE: master build.

## P-3: point the engines at the section 3 tables (section 3, L-3)

Section 3 wrote eight sourced tables. Five of them overlap a table an engine already reads, and `tests/data.test.js` lists every place the two copies disagree. Each row below is one decision; the conservative default taken here was to leave the engine's file untouched and keep both in sync by test.

| New table (lane 2) | Engine copy today | Reader | Disagreement found | Proposed change |
|---|---|---|---|---|
| `data/lane2/tax_brackets.json` | `data/federal_brackets_2026.json`, `data/se_tax_2026.json` | `engines/tax.js` (`tables.federalBrackets`, `tables.seTax`) | None on 2026 brackets or deductions after the head-of-household 32% top was corrected to $256,200 | Register `taxBrackets` in `Reference.TABLE_FILES`; in `engines/tax.js` read `tables.taxBrackets.years[year].brackets[fs].value` and `.standardDeduction[fs].value` with `year` from `opts.taxYear` (default 2026); retire the two old files once test/run.js is moved |
| `data/lane2/contribution_limits.json` | `data/irs_limits_2026.json` | `engines/presets.js`, the FOO room | `annualAdditions`: 72,000 (Notice 2025-67) vs 70,000 (carried from the FOO room) | Register `contributionLimits`; read `years[2026].elective401k.value` and so on; fix `annualAdditions` to 72,000 in the old file meanwhile |
| `data/lane2/aca.json` | `data/aca_2026.json` | `engines/tax.js` (`acaCliff`) | Top applicable percentage: 9.96% (Rev. Proc. 2025-25) vs 8.66% | Register `aca`; read `applicablePercentage[2026].value` (bands with from/to) and `fpl[2025].contiguous` for 2026 coverage; fix the old file's top band to 0.0996 meanwhile |
| `data/states.json` (`uiWeeklyMaxCents`, `uiMaxWeeks`) | `data/ui_benefits.json` | `shared/gate.js`, `engines/statement.js` | 27 states differ (the old file is a 2025 recollection; the new cells carry the July 2025 DOL edition plus the October 2025 MA and NY increases) | Read `states[i].uiWeeklyMaxCents.value` from states.json; retire `ui_benefits.json` (keep its `replacementRate` convention in states.json `columns`) |
| `data/states.json` (`childcareInfantCenterMonthlyCents`) | `data/childcare_by_state.json` | `engines/kids.js` | None (copied); both are the 2023 edition and stale | Refresh both from Child Care Aware "Price of Care 2024" in May; then read from states.json and retire the old file |
| `data/states.json` (`incomeTax`) | `data/state_brackets_2026.json` | `engines/tax.js` (`stateTax`) | Ohio is flat in 2026; the engine table (2025 edition) still has brackets; eight states cut rates on 2026-01-01 (IN, KY, MS, MT, NE, NC, OH, OK) | Update `state_brackets_2026.json` from the Tax Foundation 2026 edition in February; states.json keeps only type and top rate so there is one schedule |
| `data/lane2/milestones.json` | none | none yet | n/a | Section 15.9 (milestones on every timeline) reads it |
| `data/lane2/studentloans.json` | `data/student_loan_conventions.json` | `engines/studentloans.js` | The conventions file is shapes with round numbers by design | Let the engine pick a plan from `plans[]` by loan disbursement date (RAP from 2026-07-01, IBR before) and fall back to the conventions |

DECIDE: master build. None of these is applied from lane 2.

## P-4: the 18-month rule and prior-year rows (section 3, L-3)

The lane asks for current and prior year in `contribution_limits.json` and `tax_brackets.json` and also that no `asOf` be older than 18 months. A prior year's figure is dated when it was published (October or November of the year before), so every 2025 row is 22 months old on 2026-09-10. `tests/data.test.js` exempts cells marked `historical: true` (a closed year is a settled fact, not a stale one) and reports how many it skipped. DECIDE: whether the rule should read that way, or whether prior-year rows should carry the date they were last re-read instead.

## P-5: move the five section 3 tables into `data/` and register them

`test/run.js` requires every `data/*.json` to be registered in `Reference.TABLE_FILES`, and `shared/reference.js` is outside lane 2, so the five new tables are under `data/lane2/` for now. The change, once the master build wants them loadable by a room:

```
git mv data/lane2/aca.json data/aca.json
git mv data/lane2/contribution_limits.json data/contribution_limits.json
git mv data/lane2/milestones.json data/milestones.json
git mv data/lane2/studentloans.json data/studentloans.json
git mv data/lane2/tax_brackets.json data/tax_brackets.json
```

and in `shared/reference.js` `TABLE_FILES`:

```js
    aca: 'aca.json',
    contributionLimits: 'contribution_limits.json',
    milestones: 'milestones.json',
    studentLoans: 'studentloans.json',
    taxBrackets: 'tax_brackets.json',
```

then the same five path edits in `tests/tools/build-data-tables.js` (`IN_ROOT`), `tests/data.test.js` (`FILES`), `docs/data-refresh-calendar.md` and `docs/lane2-log.md`. Until then nothing loads them; `tests/data.test.js` is their only reader. DECIDE: master build, with P-3.
