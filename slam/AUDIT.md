# Phase 5 self-audit (2026-10-15)

## Tests

- `node --test`: 83 tests, all passing (store, math, chart data, four households, and the Jordan transaction household added in Phase 6).
- `node tools/screens-check.mjs` (needs a local server and Playwright): loads each test
  household in Chromium and compares what the Budget and Analyze screens show against the
  hand-computed expected files. 149 on-screen checks (tiles, table totals, every category's
  estimate and actual, culprits, completion, proof of cash flag, gut check reading, income
  statement net), all matching, no console errors.

## Lessons, one by one

| # | Rule | Result |
| --- | --- | --- |
| 1 | Every number in one place | Pass after fixes. Found and fixed: roommate "your share" duplicated the rent line (removed, S-035); the Rough pass offered a category box when line estimates already existed (now read-only, S-036). Debt minimums are only asked in Debts. |
| 2 | Status always visible | Pass after fix. Every amount input has a status picker; the table now shows estimate, dream, and actual chips (dream was missing); guesses and computed lines are labeled. |
| 3 | Math only in `src/calc/` | Pass after fix. A scan of `src/ui/` for arithmetic found only layout and pixel math, plus one rounding of the correction suggestion, now moved into calc. Chart data comes from `src/calc/chart-data.js`. |
| 4 | First pass asks little; every question has an out | Pass. The Gut pass is one question. Every amount has "Don't know" and "Doesn't apply". Every pass can be skipped. |
| 5 | At most 4 screens | Pass. Clients, Fill in, Budget, Analyze. Transaction review lives inside Fill in. |
| 6 | Respect out of scope | Pass. Ideas went to PARKING_LOT.md. |
| 7 | Key visuals without clicking; every chart one tap away | Pass. Four charts on Budget; Analyze has a jump bar to every group. |
| 8 | Always a Next card | Pass. #1 big with a Go button, #2 and #3 smaller, each opens the exact field. |
| 9 | Versioned export and import, snapshot before import | Pass. Export envelope has `format` and `exportVersion`; every import backs up all clients first; backups can be restored. |
| 10 | One token file | Pass. `app.css` and every chart use only variables from `tokens.css`. The one exception is the tiny favicon in `index.html`, which cannot read CSS variables. |
| 11 | Hand-computed tie-outs | Pass. Four households plus Jordan (transactions) with every expected number worked by hand in comments. |
| 12 | Fields that don't apply are absent | Pass after fix. Roommate, dependent-age, pre-tax, and hours fields appear only when they apply. "Doesn't apply" categories collapse to one line in the passes and are now left out of the table (named once underneath). "No debts" counts as complete. |
| 13 | Any cadence, normalized to monthly | Pass. Paycheck, week, month, year, one-off on every amount; one-offs listed separately. |
| 14 | Completion separate from progress | Pass. The completion meter says it measures the data, not the client. |
| 15 | Averages labeled Guess with source and COL tier | Pass. Guess chip plus a note naming the source, household size, tier, and multiplier. The table is marked placeholder. |
| 16 | Percentages on take-home | Pass. Only DRAFTT Taxes uses gross, and it is labeled "of gross". |

## Nothing asked twice

Checked every input against every other: gut vs estimates (different questions on purpose),
gross vs take-home (gross is optional and only used when take-home is missing or for the
income statement), pre-tax retirement vs the after-tax Retirement line (different money),
debts vs Debt payments (computed, never asked), rent line vs roommate share (fixed),
category estimate vs line estimates (fixed).

## Charts in light and dark at phone width

Every Analyze chart was screenshotted at 390px wide in light and dark mode for all four
households. Fixed: clipped value labels, a clipped month label, colliding scatter labels,
a clipped Sankey label, overlapping "not given" notes, $0 variance rows for categories
that don't apply, and "($0)" tax rows when no gross pay was given. No horizontal page scroll.
