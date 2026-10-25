# Calendar parity matrix (Phase 2, Batch 0)

**The retirement is now applied (2026-10-25, answer 39, S-226); the rows still Budget only below are known differences, settled in `docs/PHASE2_REPORT.md`.** **Batch G (S-209, 2026-10-23): the retirement was held.** The matrix below was built from the spec and shows nothing "old Budget only". Before deleting, a second audit read the Budget calendar's own code and found more than the spec named. Most of it is now in SLAM; what is not is listed in "The gap audit" at the end, with the question for Eli each one waits on. The retirement itself is ready as `docs/phase2/batch-g-retire.patch`. Rows that read "in cashcal.js" are in SLAM through the vendored v44 engine (`slam/engine/vendor/cashcal.js`, Batch A).

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

## The gap audit (Batch G, S-209, 2026-10-23)

The matrix above came from the spec. Before deleting the Budget calendar, a workflow read its own code (`slam/src/calc/calendar.js`, its views and the screens that showed them) and listed every capability; a first reader checked each against SLAM and a skeptic re-read each against the code as it stood, trying to refute the first reading. "Now" is where each one stands after Batch G and its two rounds of fixes. "Skeptic" is the skeptic's own reading, at a strict bar: any difference at all reads partial. "Still Budget only" means some part is not in SLAM yet; the note names the part and the question it waits on.

| Now | Capabilities |
| --- | --- |
| in SLAM before Batch G | 29 |
| ported in Batch G | 45 |
| ported, with a difference | 24 |
| same outcome, SLAM design | 18 |
| in the retirement patch | 2 |
| not a capability | 1 |
| still Budget only | 28 |
| Total | 147 |

The skeptic's own reading: in SLAM 33, partial 110, missing 4.

Still Budget only or ported with a difference, by question: question 29 (5), question 30 (13), question 31 (2), question 32 (5), question 33 (2), question 34 (1), question 35 (1), question 37 (1), question 38 (1).

| # | What the Budget calendar did | Now | Skeptic | Note |
| --- | --- | --- | --- | --- |
| 1 | Cash by day: one line of checking cash for every day, past and future | ported, with a difference | partial | the recorded past is on the chart, not yet in the grid cells or months before the as-of date |
| 2 | Horizon choice: 30, 60 or 90 days ahead | in SLAM before Batch G | partial |  |
| 3 | Calendar cash counts checking accounts only | ported, with a difference | partial | every checking account is one line; bills from a second account: question 29 |
| 4 | Savings total per day, shown on its own line and never added to cash | ported, with a difference | partial | savings is drawn ahead, not for past days |
| 5 | Card balances owed per day | same outcome, SLAM design | partial | debt per day is one figure on the grid; each card is on the Debt tab |
| 6 | Balance per account per day | same outcome, SLAM design | partial | checking and savings per day in the list; each card on the Debt tab |
| 7 | Card sign flip: money on a credit card moves what is owed the other way | in SLAM before Batch G | in SLAM |  |
| 8 | Default account for anything with no account | ported, with a difference | partial | a paycheck paid into an account with no balance lands in checking |
| 9 | Each scheduled item lands in its own chosen account | still Budget only | partial | paychecks land in their own account now; bills and card or loan payments from a second account: question 29 |
| 10 | Starting balance per account for the first month | same outcome, SLAM design | partial | one as-of balance per account, re-anchored at a check-in: question 33 |
| 11 | Accounts with no starting balance are named, counted from $0 | ported, with a difference | partial | named on the calendar and Spending; flows meant for that account land in checking |
| 12 | A typed month start balance resets the account on the day it was read | same outcome, SLAM design | partial | question 33 |
| 13 | A typed month end balance resets the account on its day | same outcome, SLAM design | partial | question 33 |
| 14 | Balance checks reset an account to a real number on a day | same outcome, SLAM design | partial | question 33 |
| 15 | Past days and today show the real log entries | ported, with a difference | partial | the past line moves with the log; past grid days list the plan with happened or not-marked pills, not each entry |
| 16 | Which log entries count on the calendar | ported in Batch G | partial | a happened entry replaces its occurrence |
| 17 | Money in and money out per day, checking only | ported in Batch G | partial | a bill on a card is not checking money out on its day |
| 18 | Past, today and future flags per day | ported in Batch G | partial | happened and waiting |
| 19 | Paychecks scheduled from each income | ported, with a difference | partial | paid into its own account; a stream's first and last month count the monthly share |
| 20 | Pay date rules per pay frequency | still Budget only | partial | two named semimonthly days: question 34 |
| 21 | Unemployment benefits stop when the weeks left run out | in SLAM before Batch G | partial |  |
| 22 | Due days past a month's end land on its last day | in SLAM before Batch G | partial |  |
| 23 | Monthly bills scheduled on their due day | in SLAM before Batch G | partial |  |
| 24 | Yearly bills: due once a year in their due month | ported, with a difference | partial | once a year, on the start date's day |
| 25 | Scheduled items with an unknown amount are listed but never move cash | ported, with a difference | partial | named with no amount; a weekly or biweekly paycheck with no amount has no day |
| 26 | Debt payments scheduled on the debt's due day | still Budget only | partial | question 29 |
| 27 | Pay the statement balance option for cards | in SLAM before Batch G | partial |  |
| 28 | A debt paid by a budget line is scheduled as that line, not twice | still Budget only | partial | question 35 |
| 29 | Future scheduled items hit their account on their day | still Budget only | partial | paychecks ported; bills from a second account: question 29 |
| 30 | List of scheduled items with their states | still Budget only | partial | card and loan payments as items: question 30 |
| 31 | Spread across the month: unscheduled spending lines spread evenly over the days left | same outcome, SLAM design | partial | question 36 |
| 32 | Spread for a category planned as one number | still Budget only | missing | question 37 |
| 33 | Logged entries shrink the spread | same outcome, SLAM design | partial | question 36 |
| 34 | Spread timing across months | same outcome, SLAM design | partial | question 36 |
| 35 | What is never spread | ported, with a difference | partial | zero, negative and does-not-apply lines are not spread; a line that starts or ends inside the window is still spread across it (a known limit of the run) |
| 36 | A card payment from checking also lowers what the card owes | ported in Batch G | partial | a carried statement is owed until checking pays it |
| 37 | A stable key for each scheduled item | still Budget only | partial | semimonthly keys now match; card and loan payments: question 30 |
| 38 | Move a scheduled item to another day | still Budget only | partial | paychecks and bills ported (a move from before the as-of date reaches the run); card and loan payments: question 30 |
| 39 | Skip a scheduled item this month | still Budget only | partial | ported for paychecks and bills; card and loan payments: question 30 |
| 40 | Confirm a scheduled item by an explicit link ('It happened') | still Budget only | partial | ported for paychecks and bills; card and loan payments: question 30 |
| 41 | Auto-confirm a scheduled item from a matching log entry | still Budget only | partial | ported for paychecks and bills; card and loan payments: question 30 |
| 42 | Waiting: due items not yet confirmed count against today | ported in Batch G | partial | the waiting card |
| 43 | Safe to spend | ported in Batch G | in SLAM | capped at the lowest point ahead |
| 44 | Shortfall: how far under the cushion, and on which day | ported in Batch G | in SLAM | the shortfall and its day |
| 45 | Pay-later flag: a bill that is really paid by the next paycheck | in SLAM before Batch G | in SLAM |  |
| 46 | Safe-to-spend sentence | ported in Batch G | in SLAM | the sentence |
| 47 | Calendar reading sentences | ported in Batch G | in SLAM | the month in words |
| 48 | Month-end cash forecast made on the 1st | still Budget only | partial | question 32 |
| 49 | Forecast check: predicted against actual month end | still Budget only | partial | question 32 |
| 50 | Card interest charged to the card on its due day | ported, with a difference | partial | interest on its statement day; a card paid in full: question 38 |
| 51 | Today's cash | ported, with a difference | partial | checking as checked in on the as-of date; after it, the run |
| 52 | The lowest point ahead | in SLAM before Batch G | partial |  |
| 53 | Number of days below zero ahead | ported, with a difference | partial | counts days below zero and days topped up from the cushion |
| 54 | Number of days below the cushion ahead | ported, with a difference | partial | counts days under the floor and days topped up from the cushion |
| 55 | Next payday and the list of paydays ahead | in SLAM before Batch G | partial |  |
| 56 | Cushion: the amount to keep in checking | still Budget only | partial | question 31 |
| 57 | This month so far, by category: plan against logged, and what is left | in SLAM before Batch G | partial |  |
| 58 | Month outlook: net so far | in SLAM before Batch G | in SLAM |  |
| 59 | Month outlook: expected by month end | ported in Batch G | partial | card-paid bills count; a passed month says check in |
| 60 | Month outlook itemized lists | ported, with a difference | partial | what is still to come, listed; the rest of the plan is per tag |
| 61 | Month outlook only for the open month | ported in Batch G | partial | says check in once the month has moved on |
| 62 | Month outlook names incomes with no pay date instead of guessing | ported in Batch G | in SLAM | no pay date and guessed pay days named |
| 63 | Empty state when there is no account: one card saying 'Add a checking account and its balance to see cash by day.' with an 'Add an account' button that jumps to Balances | ported in Batch G | partial | one card with a button |
| 64 | 'Cash by day' line chart: checking cash day by day, past and future on one line, with a 'Today' line | ported in Batch G | in SLAM | Cash by day |
| 65 | Savings drawn as its own second line on the cash chart, never added into cash | ported, with a difference | partial | savings apart, ahead only |
| 66 | Cushion line on the chart, and days under the cushion shaded | ported in Batch G | in SLAM | floor and days under it |
| 67 | Payday and big-bill markers on the cash line | ported, with a difference | partial | dots with a legend and hover words; no labels written on the chart |
| 68 | Hover any day on the cash line to see that day's balance | ported in Batch G | in SLAM | every day has a hover and a list row |
| 69 | Horizon control: 30 / 60 / 90 days ahead | in SLAM before Batch G | in SLAM |  |
| 70 | 'Back to YYYY-MM' checkbox to show the whole history on the chart | ported in Batch G | in SLAM | Back to the first check-in |
| 71 | Items on a credit card show 'on the card' instead of moving cash, including computed card interest | ported in Batch G | in SLAM | on the card |
| 72 | 'Spread across the month' row: the rest of the plan per day | same outcome, SLAM design | partial | question 36 |
| 73 | Month grid: '<Month>, day by day' calendar of money in and out | in SLAM before Batch G | partial |  |
| 74 | 'This month so far' bars: plan versus logged per category, with left/over | in SLAM before Batch G | in SLAM |  |
| 75 | What-if: move a bill's due day and preview the cash line | same outcome, SLAM design | partial | bill timing tries every day and keeps the best |
| 76 | 'Save the new due day' button from the what-if | ported in Batch G | in SLAM | Save the new due day |
| 77 | Forecast check: each month's predicted end cash against the real end balance | still Budget only | partial | question 32 |
| 78 | '+ Quick entry' button on the cash chart card | ported, with a difference | partial | Log a spend and Check in open the Spending page |
| 79 | Lowest-point reading under the cash chart | ported in Batch G | partial | waits for a balance |
| 80 | Safe-to-spend reading (or the shortfall and its day) | in SLAM before Batch G | in SLAM |  |
| 81 | Missing starting balance named, not guessed | ported in Batch G | in SLAM | named, with the field that fills it |
| 82 | Pay-later flags card: 'Bills that land before the paycheck that covers them' | ported in Batch G | partial | always says, and counts past four |
| 83 | 'By date' list: every money movement by day with the cash left after it | ported, with a difference | partial | by date from the as-of date with checking after each movement; days before it are on the chart |
| 84 | Source tag on each list row: Logged / Bank / Scheduled / Waiting | ported, with a difference | partial | scheduled, happened, logged and not marked yet; typed and imported are both logged |
| 85 | 'So far' number for the open month | in SLAM before Batch G | in SLAM |  |
| 86 | 'Expected by month end' number for the open month | in SLAM before Batch G | partial |  |
| 87 | Outlook line placements: full line under the budget table, short line on Review | ported in Batch G | in SLAM | Spending and the Dashboard |
| 88 | 'No pay date yet for <income>' note on the outlook line | ported, with a difference | partial | named on the Spending card; the Dashboard line says missing |
| 89 | Today screen "Cash, next 30 days" strip card (numbers only, with a + Quick entry button in its header) | ported in Batch G | partial | a Dashboard tile |
| 90 | Today tile: cash in checking today, which links to the balance check | ported in Batch G | partial | with a check-in link |
| 91 | Today tile: lowest point in the next 30 days, with its date, linked to the calendar | ported in Batch G | partial | on the tile and the chart |
| 92 | Today tile: Safe to spend, through a stated date | ported in Batch G | partial | through its date |
| 93 | "How this was worked out" panel for Safe to spend, each input linked to where it is entered | ported in Batch G | partial | inputs link to their fields and rule |
| 94 | Shortfall warning when nothing is safe to spend | in SLAM before Batch G | in SLAM |  |
| 95 | Plain-language cash reading under the tiles: the lowest point, and whether it falls the day before payday | ported in Batch G | partial | on the tile and the chart |
| 96 | Pay-later flags: a bill that lands before the paycheck that really covers it | in SLAM before Batch G | partial |  |
| 97 | Links from Today into the full cash calendar | ported in Batch G | in SLAM | to the month of the low |
| 98 | Strip empty state: prompt to add a checking balance when no account has a known balance | ported in Batch G | in SLAM | one card with a button |
| 99 | Track "Scheduled, on or before today (N)" waiting card listing paychecks, bills and debt payments not yet confirmed | ported in Batch G | partial | the waiting card |
| 100 | Editable, prefilled amount on each waiting item | still Budget only | partial | ported (Open it, then Log this amount); card and loan payments: question 30 |
| 101 | "It happened": confirm a scheduled item into the log | still Budget only | partial | ported; card and loan payments: question 30 |
| 102 | "Didn't happen / moved": move one occurrence to a new date | still Budget only | partial | ported; card and loan payments: question 30 |
| 103 | "Skip this month": drop one scheduled occurrence | still Budget only | partial | ported; card and loan payments: question 30 |
| 104 | "Undo move": put a moved item back on its planned date | ported in Batch G | in SLAM | Back to its day |
| 105 | Waiting items clear themselves when a matching log entry already exists | still Budget only | partial | ported with an amount check; card and loan payments: question 30 |
| 106 | Unconfirmed waiting items count as if they happened today in today's cash and the projection | same outcome, SLAM design | partial | after the as-of date the run has them on their days; before it the balance holds them |
| 107 | Waiting-card edits survive re-renders, and every action is undoable | ported, with a difference | partial | Undo and Redo, by button and keyboard; a half-typed amount is not kept across a redraw |
| 108 | Track "Check balances" card: type a real bank balance for any account or account-less debt on any day | still Budget only | partial | every cash account ported; debts on their own dates: question 33 |
| 109 | A balance check resets the cash projection from that day | same outcome, SLAM design | partial | question 33 |
| 110 | A balance check becomes part of the account's or debt's dated balance history | same outcome, SLAM design | partial | question 33 |
| 111 | One cached cash calendar per document version, horizon and day | not a capability | partial | a speed cache, not something a person sees |
| 112 | Calendar horizon: a fixed 30 days on Today and the waiting card, and 30/60/90 days chosen on Track and shared with Setup's bill what-if | same outcome, SLAM design | partial | the window selector; the Dashboard runs a month and a paycheck |
| 113 | Today: "Cash, next 30 days" card showing today's checking balance (Today tile) | ported in Batch G | partial | Dashboard tile |
| 114 | Today: Lowest point tile (lowest projected checking balance in the next 30 days, with its date) | ported in Batch G | partial | tile and chart |
| 115 | Today: Safe to spend tile ("through <date>") | ported in Batch G | partial | null with no balance |
| 116 | Safe to spend "how it was worked out" panel | ported in Batch G | partial | inputs linked |
| 117 | Today: shortfall warning when nothing is safe to spend | in SLAM before Batch G | in SLAM |  |
| 118 | Today: plain-language cash reading plus links to the calendar | ported in Batch G | partial | tile and chart |
| 119 | Today: empty-state prompt to add a checking balance | ported in Batch G | partial | stops at the prompt |
| 120 | Today: "So far this month" headline tile (replaced Surplus while the month is open) | ported in Batch G | partial | on the Dashboard tile |
| 121 | Today: "Expected by month end" number under the So far tile | ported in Batch G | partial | expected waits on a missing pay date, named |
| 122 | "So far this month" explain panel | in SLAM before Batch G | in SLAM |  |
| 123 | "Expected by month end" explain panel | ported in Batch G | partial | one term per item |
| 124 | Review: short So far / Expected line under the month-end bar | same outcome, SLAM design | partial | Spending and the Dashboard are its homes |
| 125 | Budget table: long So far / Expected outlook line (Insights, Compared) | in SLAM before Batch G | partial |  |
| 126 | Loop strip, Track step: "scheduled X of Y confirmed" count | ported in Batch G | partial | happened count |
| 127 | Month-end checklist item: scheduled items still waiting | ported in Batch G | partial | the waiting card |
| 128 | Predicted end cash saved for the new month at month close (feeds the review's Forecast check line) | still Budget only | missing | question 32 |
| 129 | Insights, Cash tab: Forecast check card | still Budget only | partial | question 32 |
| 130 | Setup, Bills and due dates: "What if a bill moved?" simulator, with Save the new due day | same outcome, SLAM design | partial | bill timing |
| 131 | Track: "Scheduled, on or before today (N)" list of overdue scheduled items | ported in Batch G | partial | the waiting card |
| 132 | "Didn't happen / moved": move a scheduled item to a new date | still Budget only | partial | question 30 |
| 133 | Track: Check balances (type a real bank balance for any account on any day) | still Budget only | partial | question 33 |
| 134 | Track: "Cash by day" calendar chart | in SLAM before Batch G | in SLAM |  |
| 135 | Calendar horizon toggle: 30 / 60 / 90 days ahead | in SLAM before Batch G | in SLAM |  |
| 136 | Calendar "Back to <first month>" whole-history toggle | in SLAM before Batch G | in SLAM |  |
| 137 | Track: "Bills that land before the paycheck that covers them" (pay-later flags) | ported, with a difference | partial | shown for the months on screen; days the run reaches past the last month are not flagged |
| 138 | Track: "By date" list of every cash movement with running balance | ported, with a difference | partial | by date from the as-of date with checking after each movement and its source |
| 139 | Track: month grid ("<Month>, day by day") | in SLAM before Batch G | in SLAM |  |
| 140 | Track: "This month so far" plan vs logged per category | in SLAM before Batch G | in SLAM |  |
| 141 | Rest of the plan spread across the remaining days, shrinking as entries are logged | same outcome, SLAM design | partial | question 36 |
| 142 | Automatic tick-off of scheduled items by matching log or bank entries | still Budget only | partial | ported for paychecks and bills; card and loan payments: question 30 |
| 143 | Projected schedule of paychecks, bills and debt payments | in SLAM before Batch G | in SLAM |  |
| 144 | Computed credit-card interest shown on the card's due day | in SLAM before Batch G | in SLAM |  |
| 145 | Setup cash-flow inputs had a visible effect (due days, paid-from accounts, card pays minimum/statement, cushion) | still Budget only | partial | due days now in the SLAM Ledger (patch); paid-from: question 29; cushion: question 31 |
| 146 | Find-by-name search results for the cash calendar cards | in the retirement patch | missing | the find-by-name entries point at the cards that open SLAM |
| 147 | Riley example household ("Riley, 31, a year of the monthly loop") carries saved monthly forecasts | in the retirement patch | missing | Riley keeps its saved forecasts while the Budget calendar stays |
