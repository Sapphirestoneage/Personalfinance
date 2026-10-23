# Phase 1 spine self-audit (2026-10-22)

Close-out run, 2026-10-23: 472 SLAM tests pass, including the recompute audit (now with the subscriptions metric and the tax set-aside from the balance due). The repository suite has the same 17 failures as `main` on this Windows machine, none in SLAM. A privacy scan of every tracked SLAM file against the local profile found no real values (two coincidences: a NY bracket boundary and the demo rent).

Run with every test pass (`test/spine-audit.test.js`), on the demo household, the
demo with shared housing, a covered bill and a blank amount, and the local profile
when it is on the machine. Personal numbers are not written here; this file is public.

## Results

| Check | Result |
| --- | --- |
| a. Every displayed number has provenance | Pass. All 7 Dashboard tiles map to metrics in `engine/math.js` (32 metrics, plus one per card and one per expense), each with a formula in words, a unit, how its inputs combine, the screens that show it, its inputs and its rules. Every flag maps to at least one metric. One formula was not written as "X = ..." and was fixed. |
| b. Recompute to the cent | Pass after a fix. Totals used to add unrounded parts while panels show rounded ones, so a recompute could be a cent off; spending, gross income and the promo monthly amount now add their displayed parts. A sum with no known input now reads missing instead of $0. |
| c. Units | Pass. Every metric and input declares a unit; sums add one unit only; ratios pair units on purpose (dollars over dollars a month is months; a monthly amount over a rate is annualized with x 12, declared); the gross savings rate divides by gross and the net one by take-home. |
| d. Missing never shows as $0 | Pass. A missing input reads "missing" in every panel; a number built over one is incomplete, never complete; a number that cannot be figured reads missing. |
| e. The monthly spending figure | Fixed. The Dashboard showed a higher figure than the owner's Ledger edits should give. Cause: the edits were not stored. Enter did nothing in an editor and tapping away discarded typing (S-164), and checks run in the owner's browser pane cleared saved edits twice. The owner's figures are now in the local profile, a covered bill counts $0 (S-171, S-176), and the spending panel lists every line with a link to its field. The exact earlier state could not be recovered, because it was cleared. |

## Fixes made in this pass

- One debt schedule for cash flow and the projection: loans stop when paid; promos move to their rate after (S-170).
- A tax set-aside line for income nobody withholds tax from, and for Roth conversions (S-172).
- Need or want, and covered by, are fields; needs are missing until tagged (S-171).
- Lean FI on the same withdrawal rate; years to FI from the projection (S-173).
- The income cliff flag (S-174); shared expenses and a clearer expense panel (S-175, S-176).
- Show the math on every Dashboard number, every flag and every computed Ledger value; `math.html` built from the engines (S-177).

## Still uncertain

- New York 2026 brackets and a few federal brackets are from memory (rules marked verify).
- While an input is missing, the tax set-aside uses the marginal rate on the income known so far, which is a floor.
- W-2 under-withholding is not detected; only income with no federal withholding gets a set-aside.
- The projection works in today's dollars while debts keep their stated rates.
- Phase 1 has no charts, so the chart part of "show the math" has nothing to attach to yet.


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
| 2 | Status always visible | Pass after fix. Every amount input has a status picker; the table shows estimate and actual chips (S-097 moved the dream to Eras; it was the missing chip here); guesses and computed lines are labeled. |
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

# The loop menu audit (2026-10-18)

The menu follows the monthly loop (S-105 to S-109): Today, Plan, Track, Review, Insights, Setup, with
Clients from the client name and the future tools parked. The earlier "four screens" sections above
describe the app before this.

## Tests

- `node --test`: every unit test passes, including the new ones for the loop step, the first-session
  checklist, the Review summary rows, the "roughly" default, and how a number was worked out.
- `node tools/screens-check.mjs`: every on-screen number matches the hand-computed files, and the
  layout check (`tools/layout-check.mjs`) runs with it.
- `node tools/journeys.mjs`: three journeys on a phone and a desktop, taps counted, numbers checked
  by hand at the end.

## Journeys (taps)

What counts as a tap: a click or touch on the screen; a dropdown is 2 (open, pick); typing and the
keyboard's own keys are not taps. Riley is on October 17, 2026 for the five questions.

| Journey | Step | Phone taps | Desktop taps | Limit |
| --- | --- | --- | --- | --- |
| a. First session | New client | 1 | 1 |  |
|  | Gut number | 2 | 2 |  |
|  | Basics | 8 | 8 |  |
|  | One income (take-home a paycheck) | 4 | 4 |  |
|  | Rent (the Housing estimate) | 3 | 3 |  |
|  | Rough estimates, the other 9 categories | 9 | 9 |  |
|  | One account (checking and its balance) | 4 | 4 |  |
|  | See Today | 1 | 1 |  |
| a. First session | **Total** | **32** | **32** | under 60 |
| b. A month | Make the plan (November, from the estimates) | 3 | 3 |  |
|  | 20 quick entries (most taps for one: 4) | 62 | 62 |  |
|  | Confirm 3 scheduled items | 3 | 3 |  |
|  | Import a CSV that matches 5 entries | 3 | 3 |  |
|  | Enter balances (checking at month end) | 4 | 3 |  |
|  | Fill 2 gaps (none this month) | 3 | 3 |  |
|  | Open the checklist | 1 | 1 |  |
|  | Close the month | 2 | 2 |  |
|  | Read the review | 0 | 0 |  |
| b. A month | **Total** | **81** | **80** | under 120 |
| c. Five questions | Log a $12 lunch | 3 | 3 | 6 |
|  | Safe to spend | 0 | 0 | 0 |
|  | Why cash dropped last month (the bridge) | 3 | 2 | 3 |
|  | What went over plan last month | 1 | 1 | 3 |
|  | Close the month (open the checklist) | 2 | 2 | 3 |
| c. Five questions | **Total** | **9** | **8** |  |

Each quick entry in journey b took 3 taps (4 the first time a line is not in the recent chips: one more
to search). Question 2 (safe to spend) is on Today with no tap. Question 3 is 3 taps on a phone because
Insights sits under More.

## Inventory, Riley at phone width (390 x 844)

| Before (screen) | Height (screens) | Sections | Charts | Inputs | After (screen) | Height | Sections | Charts | Inputs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Budget | 7.2 | 15 | 5 | 3 | Today | 2.2 | 4 | 1 | 0 |
| Fill in, 1 Gut | 1.0 | 1 | 0 | 3 | Plan, next month | 3.0 | 5 | 0 | 4 |
| Fill in, 3 Rough | 8.7 | 3 | 0 | 120 | Plan, your estimates | 5.1 | 3 | 0 | 25 |
| Fill in, 5 Cash flow | 7.4 | 5 | 0 | 71 | Track | 5.4 | 10 | 2 | 9 |
| Fill in, 4 Actual | 18.5 | 16 | 0 | 174 | Review (fill gaps 1.6) | 5.4 | 7 | 0 | 11 |
| Analyze | 40.9 | 64 | 34 | 128 | Insights, five tabs | 3.3 to 5.9 each | 6 to 11 | 3 to 8 | 0 or 1 picker |
| Fill in, 2 Profile | 4.6 | 6 | 0 | 39 | Setup, ten sections | 1.0 to 3.2 each | 1 to 3 | 0 or 1 | 0 to 35 |
| Fill in, 6 Next stage and 7 Eras | 1.0 and 3.8 | 1 and 5 | 0 | 0 and 40 | Future (parked, off) | | | | |

`tools/layout-check.mjs` prints the full list for Riley and Maya, before and after, on every run.

## Lessons

| # | Rule | Result |
| --- | --- | --- |
| 5 | The menu follows the loop; each section in one place; Insights read-only; setup apart from weekly use | Pass. The layout check fails on a heading or chart title seen twice, a data input in Insights, or a setup input on Track; none found on any of the six households. |
| 7 | Key visuals without clicking; every chart one tap away | Changed by request: Today shows the cash strip and four numbers only. Charts are in Insights, one tap on a desktop (two on a phone, under More), each tab one more. See the questions in the final message. |
| 8 | Always a Next card | Pass. On Today, with the first-session checklist above it until done. |
| 14 | Completion separate from progress | Pass. One completion card, in Insights, Compared. |
| 18 | Every closed month has a bridge | Pass. Insights, Cash shows the bridge for any month (the month picker); Review shows it in one line with a link. |

# Net worth audit (2026-10-18)

The balance sheet joins the income statement and the cash bridge (S-110 to S-115): every account on
one balance sheet, two net worths, a net worth bridge that ties, and what owning a home or vehicle
really costs next to its alternative.

## Tests

- `node --test`: every unit test passes. New: `test/all-accounts.test.js`, `test/networth.test.js`,
  `test/networth-bridge.test.js`, `test/owning.test.js`, and `test/networth-households.test.js` (Riley
  and Dana by hand: both net worths and the locked-in part for two month ends each, the full bridge for
  two months each (Riley's June and Dana's February each with an amount not explained), Dana's month
  FI net worth crosses $0 (March 2026), and owning vs the alternative for Riley's car and Dana's condo).
- Properties: the bridge ties for every month of every household file; FI net worth never includes an
  asset that does not count or the debt it secures; contributions are never typed (they come from the
  log and the paycheck, and typing a balance does not change them); migrating Riley's file from before
  net worth (`test/fixtures/riley-schema9.json`) changes no number in it.
- `node tools/screens-check.mjs`: Riley's and Dana's net worth tiles, bridge readings, owning cards,
  milestones, and Dana's March review card (FI net worth crossed $0) match the hand numbers; search
  finds FI net worth and opens how it was worked out. The layout check runs with it.
- `node tools/journeys.mjs`: four journeys, below.

## Journeys (taps)

| Journey | Step | Phone taps | Desktop taps | Limit |
| --- | --- | --- | --- | --- |
| a. First session | **Total** | **32** | **32** | under 60 |
| b. A month | **Total** | **81** | **80** | under 120 |
| c. Six questions | Log a $12 lunch | 3 | 3 | 6 |
|  | Safe to spend | 0 | 0 | 0 |
|  | Why cash dropped last month (the bridge) | 3 | 2 | 3 |
|  | What went over plan last month | 1 | 1 | 3 |
|  | Close the month (open the checklist) | 2 | 2 | 3 |
|  | What's my FI net worth | 2 | 2 | 2 |
| c. Six questions | **Total** | **11** | **10** |  |
| d. Month-end balances | Month-end balances for 5 accounts (Setup, Accounts) | 8 | 7 |  |
| d. Month-end balances | **Total** | **8** | **7** | under 20 |

Journeys a and b are step by step in the loop menu audit above; their numbers did not change.

## The Net worth tab at phone width

Riley 5.2 phone screens, Dana 5.3, Maya 2.5 (limit 6): three tiles, both net worths over time, what you
have and owe by month, what it is made of, the bridge, one card per home or vehicle, and milestones.
Only pickers (the month, and which net worth). Today has no new tile; its Next card points to stale
balances in the review week.

## Lessons

| # | Rule | Result |
| --- | --- | --- |
| 11 | Hand-computed test households | Pass. Dana is new; Riley gained a 401(k), a Roth IRA, a car, and its loan; every expected number is worked out in the test comments. |
| 13 | Every amount normalized to a month | Pass. A paycheck deduction into a 401(k) counts at its monthly amount (150 x 26 / 12 = 325 for Riley). |
| 15 | Averages labeled "Guess" with a source | Pass. Home maintenance (1% of the value a year) and vehicle depreciation without values (15% a year) are labeled Guess with their source; the 5% return on equity is labeled an assumption the coach can change. |
| 18 | Every month has a bridge, nothing hidden | Pass, extended. The net worth bridge ties by construction; what is not explained is drawn apart and named (an investment not updated this month is named). |
| 22 | Two net worths, and each locked-in asset's cost next to its alternative, no verdicts | Pass. Both net worths everywhere they appear; the owning cards say what it costs and what the alternative would cost, and stop there. |
