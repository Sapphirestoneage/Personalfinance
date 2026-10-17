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
| 15 | Averages labeled Guess with their source | Pass. Guess chip plus a note naming the national average, household size, and source. The table is marked placeholder. |
| 16 | Percentages on take-home | Pass. DRAFTT uses take-home plus pre-tax retirement as its base (so its parts add to 100%), and says so on screen; with no pre-tax retirement the base is take-home. DRAFTT taxes are shown on their own, labeled "of gross". The Budget table's % of income and the review view's % of income are of take-home. |
| 17 | Estimates never overwritten | Pass. No action writes over an estimate: last month's actual and the personal correction go into next month's plan; Break down keeps the client's number and lets the lines carry it; guesses only ever fill blank estimates and are labeled Guess. Tested: no review action changes any estimate. |

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

# Monthly loop audit (2026-10-17)

## Tests

- `node --test`: 229 tests, all passing. New: accounts and balances, the log and matching, the
  cash flow calendar, actuals from the log (with the migration checked on every test household),
  the budget-to-cash bridge, the loop strip, checklist, and saved review, estimate history, 80/20,
  trends, and Riley's year (`test/riley.test.js`: March start to finish, two more bridges, the 80/20
  at three levels, February to March, and October's calendar, every number worked out by hand).
- `node tools/screens-check.mjs`: 264 on-screen checks, all matching, no console errors. New blocks
  at phone width: accounts and cash on hand, quick entry and an import that merges, the cash strip and
  calendar, actuals from the log, the bridge, the loop strip, checklist, review card, Months, Trends,
  and Riley with the clock set to October 17, 2026.

## Lessons 18 to 20

| # | Rule | Result |
| --- | --- | --- |
| 18 | Every closed month has a bridge; nothing unexplained is hidden | Pass. Analyze, Cash flow and Months show the bridge for any month with balances; "Not explained yet" is its own step, drawn as an outline. The checklist says "ties" or "off by $X" and the saved review keeps it. Tested: explained + not explained = the change in cash, every Riley month. |
| 19 | The lowest point shows before it happens; the forecast is checked | Pass. The Budget strip shows the lowest point and safe to spend until payday; Analyze shows the full calendar and pay-later flags. A forecast is saved for each new month at close and compared with the real end balance. |
| 20 | The log owns the money; month-end only fills gaps | Pass. Actuals come from the log; a line with entries cannot be typed over (the store refuses it). The Actual pass lists only the gaps first. Riley's March: 97% of spending came from the log. |

## Still four screens

Clients, Fill in, Budget, Analyze. Quick entry and the month-end checklist are a sheet and a card,
not screens. Cash flow is Fill in pass 6 (it replaced Transactions); Cash flow, Months, and Trends are
sections of Analyze.

## Nothing asked twice

Cash on hand was asked in Next stage and in Eras; both now read the account balances, and the old
answers moved into a "Cash on hand" account. A card's balance lives on its account, not its debt.
Due days for debts were already asked; the calendar reuses them. A line with log entries is never typed.

## Charts at phone width, light and dark

The Budget strip and loop strip, the calendar, the bridge waterfall, the review card, the 80/20 chart,
estimate history, and every Trends card were screenshotted at 390px in light and dark. Fixed: clipped
waterfall amounts, crowded month labels on line charts and the heatmap, a sparkline layout that wrapped,
the year-long calendar squeezed into a phone (it now starts at this month, with "Back to" for the rest),
and a by-date table too wide for a phone (now a list).
