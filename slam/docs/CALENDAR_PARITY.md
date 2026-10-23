# Calendar parity matrix (Phase 2, Batch 0)

Every feature in `money-rooms-v3/reference/cashflow-calendar-spec.md` sections 3, 4
and 7, one row each, with where it lives today and which batch of the Phase 2 plan
carries it. Written 2026-10-23 before Batch A; the status column is updated at the
end of each batch, and the totals at the bottom are recounted at FINISH.

Status words: **in SLAM** (the spine pages: `slam/engine`, `slam/ui`), **old Budget
only** (only the Budget app in `slam/src`), **in cashcal.js** (the Money Rooms v3 port
of the v44 engine, `money-rooms-v3/engine/cashcal.js`, vendored into SLAM in Batch A as
`slam/engine/vendor/cashcal.js`), **missing** (nowhere yet), **excluded** (Eli said no).

Deliberately not carried over (section 8 and the Phase 2 brief): the SWAN emergency
formula (the floor is the Rule of 5 stage 1 month less the cushion), BIG5 placeholder
goals, the `slaf.profile/1` bus and `window.SLAF` interop, editable tag colours, the
booking prompt (Phase 3). Section 8 corrections override everything below: housing at
35% of take-home, FOO setup in three questions, no duplicate of Coast FI, milestone
levels or archetypes (links instead).

## Section 3: the engine

| # | Feature (spec item) | Status now | File | Batch |
| --- | --- | --- | --- | --- |
| 1 | One day-by-day run from the anchor out to the horizon (3) | in cashcal.js | `money-rooms-v3/engine/cashcal.js` simulate | A |
| 2 | Day order step 1: scheduled movements (income, expenses, payments, transfers) | in cashcal.js | cashcal.js simulate | A |
| 3 | Step 2: statement close per card on stmtDay | in cashcal.js | cashcal.js simulate | A |
| 4 | Grace period: interest only when the last statement was not paid in full | in cashcal.js | cashcal.js simulate | A |
| 5 | Interest on the average daily balance at the effective APR (3, 7 batch 1) | in cashcal.js | cashcal.js simulate | A |
| 6 | Penalty APR after a missed payment until it expires (3, 7 batch 1) | in cashcal.js | cashcal.js effRate | A |
| 7 | Statement snapshot and cycle reset | in cashcal.js | cashcal.js simulate | A |
| 8 | Step 3: due dates per card on dueDay | in cashcal.js | cashcal.js simulate | A |
| 9 | payInFull pays the whole statement | in cashcal.js | cashcal.js simulate | A |
| 10 | Minimum = max(floor, statement x pct); SLAM keeps its own rule, the larger of $40 or 1% plus a month of interest (S-166) | in SLAM (monthly) / in cashcal.js (daily) | `slam/engine/debt.js` estimateCardMinimum | A |
| 11 | goalNoInterest (the float card) pays at least the cycle's charges plus interest, held flat | in cashcal.js | cashcal.js simulate | A |
| 12 | Missed or unfundable payment: late fee and penalty APR (3, 7 batch 1) | in cashcal.js | cashcal.js simulate | A |
| 13 | Step 4: the extra at the debt on extraDay | in cashcal.js | cashcal.js simulate | A |
| 14 | Step 5: auto-cover from an autoCover account up to the floor | in cashcal.js | cashcal.js take, simulate | A |
| 15 | Step 6: cash-constrained payments (hardStop) recorded as shortfalls (3, 7 batch 1) | in cashcal.js | cashcal.js take | A |
| 16 | Avalanche by effective rate, a 0% promo last until it reverts | in SLAM (monthly order) / in cashcal.js (daily) | `slam/engine/debt.js` order; cashcal.js targetOf | A |
| 17 | Snowball by balance | in SLAM (monthly) / in cashcal.js (daily) | debt.js order; cashcal.js targetOf | A |
| 18 | payLast: student loans and the float card wait | in cashcal.js | cashcal.js targetOf | A |
| 19 | stopAtHi: the extra stops once nothing is above hiRate | in cashcal.js | cashcal.js targetOf | A |
| 20 | rollFreed: a finished plan's installment rolls into the extra | in cashcal.js | cashcal.js simulate | A |
| 21 | Returns: daily cash and debt series | in cashcal.js | cashcal.js run.days | A |
| 22 | Returns: monthly roll-up (net per month) | in cashcal.js | cashcal.js run.monthly | A |
| 23 | Returns: interest per card per month | in cashcal.js | cashcal.js run.interest | A |
| 24 | Returns: per-card clear dates | in cashcal.js | cashcal.js run.cards | A |
| 25 | Returns: dryDate (total cash under the floor) | in cashcal.js | cashcal.js firstDryTotal | A |
| 26 | Returns: cardFreeDate | in SLAM | `slam/engine/cashsim.js` clearDates.cardsFree (Batch A); shown on the Debt tab (Batch C) | A |
| 27 | Returns: hiFreeDate | in SLAM | `slam/engine/cashsim.js` clearDates.hiFree; the Debt tab | A |
| 28 | Returns: freeDate / allFree | in SLAM | `slam/engine/cashsim.js` clearDates.allFree; the Debt tab | A |
| 29 | Returns: raidDate (the first day the cushion is drawn on) | in SLAM | `slam/engine/cashsim.js` raidDate | A |
| 30 | Returns: generated automatic payments | in cashcal.js | cashcal.js run.extraLog, day events | A |
| 31 | Returns: shortfalls | in cashcal.js | cashcal.js run.shortfalls | A |
| 32 | Returns: late fees | in cashcal.js | cashcal.js run.lateFees | A |
| 33 | Returns: forgiven amounts (student loan forgiveness) | in SLAM (the forgiveness date and the balance it would forgive is the balance then; the amount is not a return line yet) | `slam/engine/debtview.js` idr | C |
| 34 | Cleared = the day you stop revolving, not balance zero; works at 0% | in cashcal.js | cashcal.js simulate (cleared) | A |

## Section 4: features (v22)

| # | Feature (spec item) | Status now | File | Batch |
| --- | --- | --- | --- | --- |
| 35 | Weeks view: in, out, ending balance per week (4.1) | in SLAM | `slam/engine/calendar-views.js` weeks; `slam/ui/calendar.js` weeksTab | B |
| 36 | Month grid with running cash and debt per day (4.1) | in SLAM | `slam/ui/calendar.js` grid (checking and debt per day from the month's cash line) | A (cash line), B (grid shows it) |
| 37 | Drag to reschedule (pointer events, works on touch) (4.1) | in SLAM | `slam/ui/calendar.js` dragSetup (pointer events, 14px threshold, touch-action none on the grip) | B |
| 38 | Tap to edit; a drag past 14px moves it; a visible Move button (4.1) | in SLAM | `slam/ui/calendar.js` editor (Move button), dragSetup | B |
| 39 | Chips colour-coded by kind, tag spine, card dot (4.1) | in SLAM | `slam/ui/calendar.js` eventEl (data colour by kind, legend) | B |
| 40 | Pills: sub, plan, repeat, locked, done (4.1) | in SLAM | `slam/engine/calendar-views.js` pillsFor; `slam/ui/calendar.js` pills | B |
| 41 | Drag into Maybe money to unschedule; the maybe tray (4.1) | in SLAM | `slam/engine/edits.js` addMaybe, setMaybeDate, removeMaybe; `slam/ui/calendar.js` trayCard, editor (Back to the tray) | B |
| 42 | Locks (4.1) | in SLAM | `slam/engine/edits.js` lockOccurrence; `slam/ui/calendar.js` editor | B |
| 43 | Search (4.1) | in SLAM | `slam/engine/calendar-views.js` searchEvents; `slam/ui/calendar.js` searchCard | B |
| 44 | Burn tier 1: core burn (food, accommodation, transport) (4.2) | in SLAM (FAT total) | `slam/engine/cashflow.js` expenses.fat | A (tiers), D (shown) |
| 45 | Tier 2: plus everything else that is not debt (4.2) | in SLAM | `slam/engine/cashsim.js` burnTiers (tier 2); `slam/ui/spending.js` tiersCard | A, D |
| 46 | Tier 3: plus every debt at its minimum (4.2) | in SLAM (minimums total) | cashflow.js debtMinimums | A, D |
| 47 | Tier 4: plus the extra at the debt or invested; still unallocated (4.2) | in SLAM | `slam/engine/cashsim.js` burnTiers (tier 4, with what is unallocated); `slam/ui/spending.js` tiersCard | A, D |
| 48 | Card spending counts in its tier; a pay-in-full card's settling payment is skipped (4.2) | in SLAM | `slam/engine/cashsim.js` burnTiers (spending counts by its line; the card's settling payment is not a tier) | D |
| 49 | Where the money goes: donut by tag, expandable to line items (4.3) | in SLAM | `slam/engine/spending.js` donut; `slam/ui/spending.js` donutCard (conic ring, legend, lines) | D |
| 50 | Cut simulator: tap rows to drop them; put what I save toward the debt (4.3) | in SLAM | `slam/engine/spending.js` cutSimulator; `slam/ui/spending.js` donutCard | D |
| 51 | Payoff Gantt on one timeline (4.4) | in SLAM | `slam/engine/debtview.js` gantt; `slam/ui/calendar.js` debtTab | C |
| 52 | Payoff order list: rate, clear date, interest (4.4) | in SLAM | `slam/engine/debtview.js` orderList (dates from the run, months from `debt.js` payoffPlan beyond the window) | C |
| 53 | Interest timeline, stacked monthly bars per card (4.4) | in SLAM | `slam/engine/debtview.js` interestTimeline; `slam/ui/calendar.js` stack | C |
| 54 | Why it is taking so long: paid, charged back on, interest, net paydown (4.4) | in SLAM | `slam/engine/debtview.js` cardTiles (whyStuck from the vendored engine) | C |
| 55 | Target solver "X paid off by Y", says if it breaks cash (4.4) | in SLAM | `slam/engine/debtview.js` solvePayoff (parameterized over the same run; no $600 cap) | C |
| 56 | Separate dates: high-interest free, cards clear, student loans (4.4) | in SLAM | `slam/engine/cashsim.js` clearDates; `slam/engine/debtview.js` clearDates (shown on the Debt tab) | A (dates), C (shown) |
| 57 | Student loans their own category, held back from avalanche (4.5) | in cashcal.js | cashcal.js payLast | A |
| 58 | The float card: goal zero interest, paid last, held flat, "interest-free from" (4.6) | in cashcal.js | cashcal.js goalNoInterest | A (engine), C (shown) |
| 59 | FOO: nine rungs funded by the surplus, completion date per rung (4.7) | in SLAM | `slam/engine/plan.js` fooLadder; `slam/ui/plan.js` ladderCard | F |
| 60 | FOO allocations as dashed ghost chips tagged Plan (4.7) | in SLAM | `slam/engine/plan.js` fooGhosts; `slam/ui/calendar.js` (dashed plan events) | F |
| 61 | Milestones: auto markers ("Amex cleared"), clickable (4.8) | in SLAM | `slam/engine/calendar-views.js` milestones; `slam/ui/calendar.js` msOn | B |
| 62 | Milestone horizontal timeline (4.8) | in SLAM | `slam/ui/calendar.js` milestonesCard | B |
| 63 | Setup wizard, ends listing what is still a guess (4.9) | in SLAM (Pick what you have; Still guessing) | `slam/ui/ledger.js` | done |
| 64 | Weekly check-in: happened / different amount / did not happen (4.9) | in SLAM (the check-in on real balances; happened / did not happen per item is the log) | `slam/engine/edits.js` checkIn, logSpend; `slam/ui/spending.js` checkinCard | D |
| 65 | Check-in: real balances prefilled with the forecast; re-anchor to today (4.9) | in SLAM | `slam/engine/spending.js` checkInForecast; `slam/engine/edits.js` checkIn (re-anchors meta.asOf) | D |
| 66 | Drift recorded: bias vs noise across check-ins (4.9, 7 batch 2) | in SLAM | `slam/engine/spending.js` drift (the vendored engine's reading) | D |
| 67 | Staleness banner after 10 days (4.9) | in SLAM | `slam/engine/spending.js` staleness; `slam/ui/spending.js` staleBanner | D |
| 68 | CSV statement import: matched within 5 days and 2%, recurring for 3+, new; nothing applies until Apply; no duplicates (4.9) | in SLAM | `slam/engine/feed.js` proposeCsv, applyImport (5 days, 2%, recurring for 3+, import keys) | E (the log feeds the spine) |
| 69 | "Still to fill" checklist of every placeholder (4.9) | in SLAM (Still guessing) | `slam/engine/ledger.js` stillGuessing | done |
| 70 | Google Sheets export, nine tab-separated tables (4.10) | in SLAM (CSV of the log and the lines, not nine tab-separated tables; Google Sheets reads CSV) | `slam/engine/plan.js` exportCsv; `slam/ui/plan.js` exportCard | F (CSV export) |
| 71 | Plan files, JSON to and from a coach (4.10) | in SLAM (Save to profile file, Load profile file) | `slam/ui/profile-file.js` | done; F (versioned, snapshot, migration) |
| 72 | Booking call-to-action when cash gets tight (4.10) | excluded (Phase 3) | none | none |
| 73 | slaf.profile/1 shared schema, window.SLAF bus, postMessage, ?embed=1 (4.11) | excluded | none | none |
| 74 | Undo (4.12) | in SLAM (Undo and Redo, 200 steps) | `slam/engine/edits.js` | done; F (undo history view) |
| 75 | Storage fallback with a warning (4.12) | in SLAM ("storage is blocked" lines) | `slam/ui/household.js`, `ui/ledger.js` | done |
| 76 | Build stamp (4.12) | in SLAM | `slam/ui/page.js` BUILD (moved by hand with each batch) | F |
| 77 | Editable tag colours (4.12) | excluded | none | none |
| 78 | Help sheet on the tiers (4.12) | in SLAM | `slam/ui/spending.js` tiersCard (the help sheet) | D |
| 79 | Bottom-sheet modals on mobile with pinned Save (4.12) | in SLAM (the Save row pinned at the bottom on a phone; editors stay inline) | `slam/ui/spine.css` .editor .edit-actions at 639px | F |

## Section 7: added in v23 to v44

| # | Feature (spec item) | Status now | File | Batch |
| --- | --- | --- | --- | --- |
| 80 | Bill autopsy: every recurring item ranked by yearly cost (batch 1) | in SLAM | `slam/engine/spending.js` billAutopsy | D |
| 81 | Annual fee ROI per card (batch 1) | in SLAM | `slam/engine/debtview.js` feeRoi (fields annualFee, annualValue) | C |
| 82 | Utilization guardrail: peak before the report day, warns at 30% (batch 1) | in SLAM | `slam/engine/debtview.js` utilizationAtReport (peak before the report day, personal and overall) | C |
| 83 | Minimum-payment trap readout (batch 1) | in SLAM | `slam/engine/debtview.js` minimumTrap (the minimum-only payoff from `debt.js` payoffPlan) | C |
| 84 | Quarterly tax set-aside: monthly sweep plus the four IRS dates (batch 1) | in SLAM | `slam/engine/tax.js` taxSetAside; `slam/engine/calendar.js` estimatedTax | done |
| 85 | Balance transfer analysis: fee, 0% window, post-window rate (batch 1) | in SLAM | `slam/engine/debtview.js` balanceTransfer (rules BT_FEE_SHARE, BT_PROMO_MONTHS) | C |
| 86 | Saved scenarios with a diff (batch 1) | in SLAM | `slam/ui/plan.js` scenariosCard; `slam/engine/plan.js` diffSpines | F |
| 87 | Goals and sinking funds: monthly set-aside, spend on the date, repeat yearly (batch 2) | in SLAM | `slam/engine/plan.js` goalsView (monthly, spendOn, repeatYearly, sinkingFund) | F |
| 88 | Amortizing loans with a term (batch 2) | in cashcal.js | `money-rooms-v3/engine/loanmath.js` levelPayment | A |
| 89 | Net worth with per-asset growth rates and a ten-year projection (batch 2) | in SLAM | `slam/engine/projection.js`, `networth.js` | done |
| 90 | Undo history, last 25 restore points (batch 2) | in SLAM | `slam/ui/plan.js` historyCard (APP_HISTORY_POINTS restore points) | F |
| 91 | Printable one-pager (batch 2) | in SLAM | `slam/onepager.html`, `slam/ui/onepager.js` | F |
| 92 | Which card should I use: rewards minus interest, interest-free days, utilization warning (batch 3) | in SLAM | `slam/engine/debtview.js` whichCard (rewardsRate or APP_REWARDS_RATE) | C |
| 93 | Float days per card for a purchase today (batch 3) | in SLAM | `slam/engine/debtview.js` whichCard (interestFreeDays) | C |
| 94 | Signup bonus tracking: spend so far, days left, pace, deadline on the calendar (batch 3) | in SLAM | `slam/engine/debtview.js` signupBonus; `slam/engine/calendar.js` bonusBy event; milestones | C |
| 95 | Billing cycle on every card tile (batch 3) | in SLAM | `slam/engine/debtview.js` cardTiles (cycle) | C |
| 96 | Student loan income-driven payment and forgiveness (batch 3) | in SLAM | `slam/engine/debtview.js` idr (rules IDR_*, POVERTY_LINE_*, PSLF_PAYMENTS; missing row when a rule is missing) | C |
| 97 | Price-increase and free-trial detection (batch 3) | in SLAM | `slam/engine/spending.js` priceChanges, freeTrials | D |
| 98 | Merchant name cleanup ("SQ *BLUE BOTTLE 4471" to "Blue Bottle") (batch 3) | in SLAM | `slam/engine/spending.js` cleanMerchant | D |
| 99 | Split transactions (batch 3) | missing (a parking-lot idea) | none | D |
| 100 | Household mode (batch 3) | in SLAM (shared expenses, who pays) | `slam/engine/sharing.js` | done |
| 101 | Outlook: many runs, bad, typical and good cash, interest range, share dry (batch 4) | in SLAM | `slam/engine/plan.js` outlook (the vendored engine's runs) | F |
| 102 | Maybe money with a date and likelihood: ignored, likely only, weighted (batch 4) | in SLAM (likelihood on a stream, expected mode) / in cashcal.js (three ways) | `slam/engine/cashflow.js` streamWeight; cashcal.js threeWays | A |
| 103 | Life event templates (batch 4) | in SLAM | `slam/data/life-events.json`; `slam/engine/plan.js` applyLifeEvent, removeLifeEvent | F |
| 104 | Self test (19 engine assertions) (batch 4) | in cashcal.js (28 tests) | `money-rooms-v3/tests/engine/cashcal.test.js` | A (the ten, below) |
| 105 | Error catcher banner (batch 4) | in SLAM | `slam/ui/page.js` mountPage (error banner) | F |
| 106 | Accessibility: skip link, focus trapping, aria-live headline (batch 4) | in SLAM (skip link, aria-live headline; focus stays on inline editors) | `slam/ui/page.js`; `slam/ui/plan.js` | F |
| 107 | Safe to spend: cash less the emergency fund, less what is committed before the next income, less the reserve; per day (v34) | in SLAM | `slam/engine/spending.js` safeToSpend (from the run's safeToSpend) | A (engine), D (shown) |
| 108 | Five-second spend logger: keypad, tag, paid with, live safe to spend (v34) | in SLAM | `slam/ui/spending.js` loggerCard; `slam/engine/edits.js` logSpend | D |
| 109 | Per-tag budgets: spent, budget, left, pace, vs last month by the same day, running hot (v34) | in SLAM | `slam/engine/spending.js` tagBudgets | D |
| 110 | Month-end sweep with hard reset (v34) | in SLAM | `slam/engine/edits.js` setSweep; `slam/engine/spending.js` sweepReading | D |
| 111 | Can I spend this: hours of life and goal delays (v34) | in SLAM | `slam/engine/spending.js` canISpend | D |
| 112 | Momentum from check-in snapshots (v34) | in SLAM | `slam/engine/spending.js` momentum | D |
| 113 | Savings rate from the real ledger (v34) | in SLAM | `slam/engine/compare.js` estimatedVsActual (savingsRate.real) | E |
| 114 | Income shock simulation (v34) | in SLAM | `slam/engine/plan.js` incomeShock, fixedFloor | F |
| 115 | Sankey money flow (v34) | in SLAM | `slam/engine/flow.js`, `slam/ui/flow-chart.js` | done |
| 116 | FOO setup reduced to three questions (v34, section 8) | in SLAM | `slam/ui/plan.js` ladderCard (deductible, the match on the account, the Rule of 5 target) | F |
| 117 | Engine extracted pure, no DOM (v44) | in SLAM (every engine is pure) | `slam/engine/` | done |
| 118 | Adapter bridge for sibling tools (v44) | in SLAM | `slam/engine/cashsim.js` (the adapter: spine in, the vendored engine's model out, results back as Facts) | A (`slam/engine/cashsim.js`) |
| 119 | Tests: engine assertions, adapter tests, parity comparisons, a real-DOM UI audit (v44) | in SLAM (node tests, a headless browser check) | `slam/test/`, `slam/tools/screens-check.mjs` | A, each batch |
| 120 | Self-test: interest accrues on a carried balance and never on a pay-in-full card | in cashcal.js | cashcal.test.js | A |
| 121 | Self-test: paying more clears sooner and costs less | in cashcal.js | cashcal.test.js | A |
| 122 | Self-test: plans pay exactly their total | in cashcal.js | cashcal.test.js | A |
| 123 | Self-test: loans with a term pay more than principal | in cashcal.js | cashcal.test.js | A |
| 124 | Self-test: cash never breaches the floor when the guard is on | in cashcal.js | cashcal.test.js | A |
| 125 | Self-test: burn tiers reconcile to total spending | in cashcal.js (a weaker form) | cashcal.test.js | A |
| 126 | Self-test: null is never treated as zero | in SLAM (the whole spine) / in cashcal.js | `slam/test/spine-audit.test.js`; cashcal.test.js | A |
| 127 | Self-test: a 0% promo card sorts last in avalanche until it reverts | in SLAM (monthly) / in cashcal.js (daily) | `slam/test/spine-engines.test.js`; cashcal.test.js | A |
| 128 | Self-test: cleared means stopped revolving, including at 0% | in cashcal.js | cashcal.test.js | A |
| 129 | Self-test: weighted maybe money falls between the ignored and likely-only results | in cashcal.js | cashcal.test.js | A |

## Beyond the spec, named in the Phase 2 brief

| # | Feature | Status now | File | Batch |
| --- | --- | --- | --- | --- |
| 130 | One time selector (1, 3, 6, 12 months) shared by the calendar and the budget | in SLAM (the calendar; the budget joins in Batch E) | `slam/ui/window.js` | B, E |
| 131 | Next-14-days agenda | in SLAM | `slam/engine/calendar-views.js` agenda; `slam/ui/calendar.js` agendaTab | B |
| 132 | Year strip with tight months flagged | in SLAM | `slam/engine/calendar-views.js` yearStrip; `slam/ui/calendar.js` yearTab | B |
| 133 | Per-paycheck view with bonus paycheck chips (third biweekly, fifth weekly) | in SLAM | `slam/engine/calendar-views.js` paychecks (bonus, couldDo); `slam/ui/calendar.js` paychecksTab | B |
| 134 | Reimbursed subscriptions | in cashcal.js | cashcal.js (reimb incomes) | A |
| 135 | Per-occurrence overrides and repeats with an end count | in cashcal.js | cashcal.js overrides, occurrences count | A |
| 136 | Paycheck allocator by due date, three-paycheck month planner, 1099 set-aside on each deposit (R006) | in SLAM | `slam/engine/plan.js` allocator | F |
| 137 | Surplus waterfall shared with the Windfall order (E008) | in SLAM | `slam/engine/windfall.js` (monthly mode); `slam/engine/plan.js` surplusWaterfall | F |
| 138 | Solvers: savings rate, expense level, income or return needed (E014) | in SLAM | `slam/engine/plan.js` solvers | F |
| 139 | Real hourly wage, hours toggle, second price tag (E016, R033, L001) | in SLAM | `slam/engine/plan.js` realHourlyWage, hoursOf; `slam/ui/spending.js` hours toggle | F |
| 140 | DRAFTT scorecard with the 35% housing line (L002) | in SLAM | `slam/engine/plan.js` draftt (APP_HOUSING_REF) | F |
| 141 | Fixed floor: total fixed commitments, what if income stopped (L018) | in SLAM | `slam/engine/plan.js` fixedFloor | F |
| 142 | Goals with deadline, priority, linked account, sinking-fund flag, FI date cost (F009) | in SLAM | `slam/engine/plan.js` goalsView; `slam/engine/schema.js` goals | F |
| 143 | Estimated vs actual per line and tag from the Budget log, on the Dashboard (R004) | in SLAM | `slam/engine/compare.js`; `slam/ui/dashboard.js` tile compare; `slam/ui/spending.js` compareCard | E |

## Totals (recounted at FINISH)

| Status | Rows |
| --- | --- |
| in SLAM | 99 (some also in cashcal.js for the daily form) |
| old Budget only | 0 |
| in cashcal.js | 40 |
| missing | 1 |
| excluded | 3 |
| rows in all | 143 |

After Batch F (2026-10-23): in SLAM 99, old Budget only 0, in cashcal.js 40, missing 1, excluded 3. After Batch E (2026-10-23): in SLAM 75, old Budget only 1, in cashcal.js 43, missing 21, excluded 3. After Batch D (2026-10-23): in SLAM 72, old Budget only 4, in cashcal.js 43, missing 21, excluded 3. After Batch C (2026-10-23): in SLAM 56, old Budget only 10, in cashcal.js 46, missing 28, excluded 3. After Batch B: in SLAM 43, old Budget only 10, in cashcal.js 51, missing 36, excluded 3. Before Batch A the count was in SLAM 24, old Budget only 11, in cashcal.js 56, missing 48.

The brief counted 87 features in sections 3, 4 and 7; this list has 129 there because
each return value, each burn tier, each pill set and each self-test assertion is its own
row, plus 14 from the brief's own additions. Rows marked "done" need no batch.
