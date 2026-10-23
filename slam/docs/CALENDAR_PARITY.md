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
| 26 | Returns: cardFreeDate | missing (cashcal.js has per-card dates only) | none | A |
| 27 | Returns: hiFreeDate | missing | none | A |
| 28 | Returns: freeDate / allFree | missing | none | A |
| 29 | Returns: raidDate (the first day the cushion is drawn on) | missing | none | A |
| 30 | Returns: generated automatic payments | in cashcal.js | cashcal.js run.extraLog, day events | A |
| 31 | Returns: shortfalls | in cashcal.js | cashcal.js run.shortfalls | A |
| 32 | Returns: late fees | in cashcal.js | cashcal.js run.lateFees | A |
| 33 | Returns: forgiven amounts (student loan forgiveness) | missing | none | C |
| 34 | Cleared = the day you stop revolving, not balance zero; works at 0% | in cashcal.js | cashcal.js simulate (cleared) | A |

## Section 4: features (v22)

| # | Feature (spec item) | Status now | File | Batch |
| --- | --- | --- | --- | --- |
| 35 | Weeks view: in, out, ending balance per week (4.1) | old Budget only (a cash strip and calendar) / in cashcal.js view | `slam/src/ui/components/cashflow.js`; `money-rooms-v3/ui/views/calendar.js` drawWeeks | B |
| 36 | Month grid with running cash and debt per day (4.1) | in SLAM (grid, no running cash yet) | `slam/ui/calendar.js` grid | A (cash line), B (grid shows it) |
| 37 | Drag to reschedule (pointer events, works on touch) (4.1) | missing | none | B |
| 38 | Tap to edit; a drag past 14px moves it; a visible Move button (4.1) | missing | none | B |
| 39 | Chips colour-coded by kind, tag spine, card dot (4.1) | in SLAM (colour by kind) | `slam/ui/calendar.js` eventEl | B |
| 40 | Pills: sub, plan, repeat, locked, done (4.1) | missing (a rough tag only) | `slam/ui/calendar.js` | B |
| 41 | Drag into Maybe money to unschedule; the maybe tray (4.1) | missing | none | B |
| 42 | Locks (4.1) | missing | none | B |
| 43 | Search (4.1) | in SLAM (the Ledger's field search, not the calendar's) | `slam/ui/ledger.js` | B |
| 44 | Burn tier 1: core burn (food, accommodation, transport) (4.2) | in SLAM (FAT total) | `slam/engine/cashflow.js` expenses.fat | A (tiers), D (shown) |
| 45 | Tier 2: plus everything else that is not debt (4.2) | missing | none | A, D |
| 46 | Tier 3: plus every debt at its minimum (4.2) | in SLAM (minimums total) | cashflow.js debtMinimums | A, D |
| 47 | Tier 4: plus the extra at the debt or invested; still unallocated (4.2) | missing | none | A, D |
| 48 | Card spending counts in its tier; a pay-in-full card's settling payment is skipped (4.2) | missing | none | D |
| 49 | Where the money goes: donut by tag, expandable to line items (4.3) | in SLAM (the money-flow diagram, by section) / old Budget only (the donut) | `slam/ui/flow-chart.js`; `slam/src/ui/charts` | D |
| 50 | Cut simulator: tap rows to drop them; put what I save toward the debt (4.3) | missing | none | D |
| 51 | Payoff Gantt on one timeline (4.4) | missing | none | C |
| 52 | Payoff order list: rate, clear date, interest (4.4) | in SLAM (order and monthly plan, no daily dates) | `slam/engine/debt.js` payoffPlan | C |
| 53 | Interest timeline, stacked monthly bars per card (4.4) | missing | none | C |
| 54 | Why it is taking so long: paid, charged back on, interest, net paydown (4.4) | in cashcal.js | cashcal.js whyStuck | C |
| 55 | Target solver "X paid off by Y", says if it breaks cash (4.4) | in cashcal.js | cashcal.js solvePayoff | C |
| 56 | Separate dates: high-interest free, cards clear, student loans (4.4) | missing | none | A (dates), C (shown) |
| 57 | Student loans their own category, held back from avalanche (4.5) | in cashcal.js | cashcal.js payLast | A |
| 58 | The float card: goal zero interest, paid last, held flat, "interest-free from" (4.6) | in cashcal.js | cashcal.js goalNoInterest | A (engine), C (shown) |
| 59 | FOO: nine rungs funded by the surplus, completion date per rung (4.7) | missing | none | F |
| 60 | FOO allocations as dashed ghost chips tagged Plan (4.7) | missing | none | F |
| 61 | Milestones: auto markers ("Amex cleared"), clickable (4.8) | missing | none | B |
| 62 | Milestone horizontal timeline (4.8) | missing | none | B |
| 63 | Setup wizard, ends listing what is still a guess (4.9) | in SLAM (Pick what you have; Still guessing) | `slam/ui/ledger.js` | done |
| 64 | Weekly check-in: happened / different amount / did not happen (4.9) | old Budget only (It happened, on Track) | `slam/src/ui/screens/track.js` | D |
| 65 | Check-in: real balances prefilled with the forecast; re-anchor to today (4.9) | old Budget only (balance checks) | `slam/src/ui/screens/track.js` | D |
| 66 | Drift recorded: bias vs noise across check-ins (4.9, 7 batch 2) | in cashcal.js | cashcal.js drift | D |
| 67 | Staleness banner after 10 days (4.9) | missing | none | D |
| 68 | CSV statement import: matched within 5 days and 2%, recurring for 3+, new; nothing applies until Apply; no duplicates (4.9) | old Budget only | `slam/src/calc/tx-import.js`, `src/ui/screens/track.js` | E (the log feeds the spine) |
| 69 | "Still to fill" checklist of every placeholder (4.9) | in SLAM (Still guessing) | `slam/engine/ledger.js` stillGuessing | done |
| 70 | Google Sheets export, nine tab-separated tables (4.10) | missing | none | F (CSV export) |
| 71 | Plan files, JSON to and from a coach (4.10) | in SLAM (Save to profile file, Load profile file) | `slam/ui/profile-file.js` | done; F (versioned, snapshot, migration) |
| 72 | Booking call-to-action when cash gets tight (4.10) | excluded (Phase 3) | none | none |
| 73 | slaf.profile/1 shared schema, window.SLAF bus, postMessage, ?embed=1 (4.11) | excluded | none | none |
| 74 | Undo (4.12) | in SLAM (Undo and Redo, 200 steps) | `slam/engine/edits.js` | done; F (undo history view) |
| 75 | Storage fallback with a warning (4.12) | in SLAM ("storage is blocked" lines) | `slam/ui/household.js`, `ui/ledger.js` | done |
| 76 | Build stamp (4.12) | missing | none | F |
| 77 | Editable tag colours (4.12) | excluded | none | none |
| 78 | Help sheet on the tiers (4.12) | missing | none | D |
| 79 | Bottom-sheet modals on mobile with pinned Save (4.12) | missing (editors open inline) | none | F |

## Section 7: added in v23 to v44

| # | Feature (spec item) | Status now | File | Batch |
| --- | --- | --- | --- | --- |
| 80 | Bill autopsy: every recurring item ranked by yearly cost (batch 1) | missing | none | D |
| 81 | Annual fee ROI per card (batch 1) | missing | none | C |
| 82 | Utilization guardrail: peak before the report day, warns at 30% (batch 1) | in SLAM (today's utilization, personal and overall) / in cashcal.js (peak before report day) | `slam/engine/debt.js` utilization; cashcal.js utilizationCheck | C |
| 83 | Minimum-payment trap readout (batch 1) | missing | none | C |
| 84 | Quarterly tax set-aside: monthly sweep plus the four IRS dates (batch 1) | in SLAM | `slam/engine/tax.js` taxSetAside; `slam/engine/calendar.js` estimatedTax | done |
| 85 | Balance transfer analysis: fee, 0% window, post-window rate (batch 1) | in cashcal.js | cashcal.js balanceTransfer | C |
| 86 | Saved scenarios with a diff (batch 1) | missing | none | F |
| 87 | Goals and sinking funds: monthly set-aside, spend on the date, repeat yearly (batch 2) | in SLAM (goals with a target) / missing (sinking funds) | `slam/engine/schema.js` goals | F |
| 88 | Amortizing loans with a term (batch 2) | in cashcal.js | `money-rooms-v3/engine/loanmath.js` levelPayment | A |
| 89 | Net worth with per-asset growth rates and a ten-year projection (batch 2) | in SLAM | `slam/engine/projection.js`, `networth.js` | done |
| 90 | Undo history, last 25 restore points (batch 2) | in SLAM (200 steps, no history view) | `slam/engine/edits.js` | F |
| 91 | Printable one-pager (batch 2) | missing | none | F |
| 92 | Which card should I use: rewards minus interest, interest-free days, utilization warning (batch 3) | in cashcal.js | cashcal.js whichCard | C |
| 93 | Float days per card for a purchase today (batch 3) | in cashcal.js | cashcal.js whichCard (interestFreeDays) | C |
| 94 | Signup bonus tracking: spend so far, days left, pace, deadline on the calendar (batch 3) | missing | none | C |
| 95 | Billing cycle on every card tile (batch 3) | missing | none | C |
| 96 | Student loan income-driven payment and forgiveness (batch 3) | missing | none | C |
| 97 | Price-increase and free-trial detection (batch 3) | missing | none | D |
| 98 | Merchant name cleanup ("SQ *BLUE BOTTLE 4471" to "Blue Bottle") (batch 3) | old Budget only | `slam/src/calc/tx-import.js`, `slam/data/merchant-rules.json` | D |
| 99 | Split transactions (batch 3) | missing (a parking-lot idea) | none | D |
| 100 | Household mode (batch 3) | in SLAM (shared expenses, who pays) | `slam/engine/sharing.js` | done |
| 101 | Outlook: many runs, bad, typical and good cash, interest range, share dry (batch 4) | in cashcal.js | cashcal.js outlook | F |
| 102 | Maybe money with a date and likelihood: ignored, likely only, weighted (batch 4) | in SLAM (likelihood on a stream, expected mode) / in cashcal.js (three ways) | `slam/engine/cashflow.js` streamWeight; cashcal.js threeWays | A |
| 103 | Life event templates (batch 4) | in cashcal.js | cashcal.js lifeEventItems; `money-rooms-v3/data/life-events.json` | F |
| 104 | Self test (19 engine assertions) (batch 4) | in cashcal.js (28 tests) | `money-rooms-v3/tests/engine/cashcal.test.js` | A (the ten, below) |
| 105 | Error catcher banner (batch 4) | missing ("could not load" lines only) | `slam/ui/*.js` | F |
| 106 | Accessibility: skip link, focus trapping, aria-live headline (batch 4) | in SLAM (aria-live on saved lines) / missing (skip link) | `slam/ui/ledger.js` | F |
| 107 | Safe to spend: cash less the emergency fund, less what is committed before the next income, less the reserve; per day (v34) | old Budget only (Today's strip) / in cashcal.js | `slam/src/calc/calendar.js` safeReading; cashcal.js safeToSpend | A (engine), D (shown) |
| 108 | Five-second spend logger: keypad, tag, paid with, live safe to spend (v34) | old Budget only (Quick entry) | `slam/src/ui/components/quick-entry.js` | D |
| 109 | Per-tag budgets: spent, budget, left, pace, vs last month by the same day, running hot (v34) | old Budget only (plan vs actual by line) | `slam/src/calc/plan.js` | D |
| 110 | Month-end sweep with hard reset (v34) | in cashcal.js (sweep) | cashcal.js simulate | D |
| 111 | Can I spend this: hours of life and goal delays (v34) | in cashcal.js | cashcal.js canISpend | D |
| 112 | Momentum from check-in snapshots (v34) | missing | none | D |
| 113 | Savings rate from the real ledger (v34) | old Budget only (income statement) | `slam/src/calc/summary.js` | E |
| 114 | Income shock simulation (v34) | in cashcal.js | cashcal.js incomeShock | F |
| 115 | Sankey money flow (v34) | in SLAM | `slam/engine/flow.js`, `slam/ui/flow-chart.js` | done |
| 116 | FOO setup reduced to three questions (v34, section 8) | missing | none | F |
| 117 | Engine extracted pure, no DOM (v44) | in SLAM (every engine is pure) | `slam/engine/` | done |
| 118 | Adapter bridge for sibling tools (v44) | missing (SLAM has no bridge to the v44 engine yet) | none | A (`slam/engine/cashsim.js`) |
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
| 130 | One time selector (1, 3, 6, 12 months) shared by the calendar and the budget | missing | none | B, E |
| 131 | Next-14-days agenda | in cashcal.js | cashcal.js agenda | B |
| 132 | Year strip with tight months flagged | in cashcal.js | cashcal.js yearStrip | B |
| 133 | Per-paycheck view with bonus paycheck chips (third biweekly, fifth weekly) | in cashcal.js (the paycheck map, no bonus chip) | cashcal.js paycheckMap | B |
| 134 | Reimbursed subscriptions | in cashcal.js | cashcal.js (reimb incomes) | A |
| 135 | Per-occurrence overrides and repeats with an end count | in cashcal.js | cashcal.js overrides, occurrences count | A |
| 136 | Paycheck allocator by due date, three-paycheck month planner, 1099 set-aside on each deposit (R006) | missing | none | F |
| 137 | Surplus waterfall shared with the Windfall order (E008) | in SLAM (the Windfall order) | `slam/engine/windfall.js` | F |
| 138 | Solvers: savings rate, expense level, income or return needed (E014) | missing | none | F |
| 139 | Real hourly wage, hours toggle, second price tag (E016, R033, L001) | missing | none | F |
| 140 | DRAFTT scorecard with the 35% housing line (L002) | old Budget only (DRAFTT on Insights) | `slam/src/calc/lenses.js` | F |
| 141 | Fixed floor: total fixed commitments, what if income stopped (L018) | in SLAM (the income cliff flag, costs then) | `slam/engine/summary.js` incomeCliff | F |
| 142 | Goals with deadline, priority, linked account, sinking-fund flag, FI date cost (F009) | in SLAM (target, by) / missing (the rest) | `slam/engine/schema.js` goals | F |
| 143 | Estimated vs actual per line and tag from the Budget log, on the Dashboard (R004) | old Budget only (Insights, Compared) | `slam/src/calc/compare.js` | E |

## Totals (recounted at FINISH)

| Status | Rows |
| --- | --- |
| in SLAM | 24 (some also in cashcal.js for the daily form) |
| old Budget only | 11 |
| in cashcal.js | 56 |
| missing | 48 |
| excluded | 3 |
| rows in all | 143 |

The brief counted 87 features in sections 3, 4 and 7; this list has 129 there because
each return value, each burn tier, each pill set and each self-test assertion is its own
row, plus 14 from the brief's own additions. Rows marked "done" need no batch.
