# Board

## Done: Phase 1, foundation and core engines (2026-10-22)

- [x] Rules registry: `data/rules-2026.json` (115 rules), `engine/rules.js` `get(id, year)`, a test that every rule id in code exists
- [x] Account shells and the spine schema: ten families, Account Rules presets, the validator; both fixtures validate
- [x] Engines with unit tests: cashflow, tax (federal, FICA, SE, unemployment, gains stacking, conversions, NY), projection (24 months, then yearly to life expectancy), FI (number, percent, years, Lean, Coast, implied), debt (avalanche, snowball, stress; payoff dates and interest; promo deadlines), emergency (Rule of 5, runway tiers, Roth backstop), flags
- [x] Ledger: DAITE groups, kind chips, edit / confirm / not for me, undo and redo, the still-guessing list
- [x] Dashboard: net worth, runway and backstop, surplus, savings rate, cards and promo deadline, FI, tax balance due, flags; every number links to its Ledger fields
- [x] Golden tests: Eli (local only) and the demo household
- [x] Docs: README section, CONTRACTS.md, DECISIONS.md S-140 to S-155, QUESTIONS.md

## Done since: owner requests and an independent review (2026-10-22)

- [x] Card interest rate row, default APR, default due day, default minimum, business and personal utilization, credit score note
- [x] Flag stages with next goals; the income cliff flag
- [x] Ledger: saving fixed, filters, a tree by kind, institution and account, add and remove, select several, shared and covered expenses
- [x] Debt schedule, tax set-aside, needs and wants, one withdrawal rate, years to FI from the projection
- [x] Show the math, math.html and the self-audit (AUDIT.md)

## Done: catch-up and close-out (2026-10-23)

- [x] Tax set-aside from the balance due; per-field kinds; 1099 business expenses; answers applied
- [x] Triple D assumption sets (Likely by default); FI stage rule tested
- [x] Account links, the card pay setting, the money-flow diagram, subscriptions, Duplicate, Pick what you have, Not now, profile file save and load
- [x] Defaults: 0.01% APY, standard phone plan, cars lose 15% a year
- [x] Affordance rules (CLAUDE.md), DESIGN.md, affordances.html, a phone-width self-check, SIGNOFF.md

## Done: Phase 2, first pass (2026-10-23, branch `claude/slam-phase-2`)

- [x] Income panel: amount, how often, start, end and the day paid on one row; expense start and end dates (S-199)
- [x] Cash flow calendar: `calendar.html`, every dated item on its day, the rest named, month-end cash from the projection (S-200)
- [x] Windfall room: `windfall.html`, a lump sum assigned in the `WINDFALL_ORDER` house order, every step with Show the math (S-201)
- [x] Report: `docs/PHASE2_REPORT.md` (what was built, tests, what to check against real data, questions)

## Done: Phase 2 full version, Batches 0, A, B, C, D, E and F (2026-10-23)

- [x] Batch 0: `docs/CALENDAR_PARITY.md`; answers 21 to 28 as S-202; D-342 and the CLAUDE.md line
- [x] Batch A: `engine/vendor/` (the v44 engine as ported by Money Rooms v3, drift-tested), `engine/cashsim.js` (spine in, model out, results back as Facts with kind), the ten self-test assertions as tests, the calendar's cash line and month-end checking from the simulation with Show the math (S-203)
- [x] Batch B: the calendar views (S-204): the time selector (`ui/window.js`), tabs for the month grid with running cash and debt, weeks, the next 14 days, each paycheck with bonus chips and the gross fold-out, the year strip; drag or Move, skip, re-price, lock; the maybe tray; search; milestones and their timeline; pills; Undo; affordances.html entries
- [x] Batch C: the Debt tab (S-205): clear dates, payoff Gantt, order list, interest stack, why stuck, target solver, minimum-payment trap, utilization at the report day, balance transfer, annual fee, which card with float days, signup bonus with its deadline on the calendar, the billing cycle on every tile, income-driven repayment and forgiveness from the rules registry
- [x] Batch D: the Spending page (S-206): the spend log and the five-second logger, per-tag budgets with pace and running hot, safe to spend, burn tiers, the donut with the cut simulator, the bill autopsy, can I spend this, price increases and free trials, check-ins with drift, momentum and the staleness banner, the month-end sweep; merchant cleanup on the spine
- [x] Batch E: the feed and estimated vs actual (S-207): a statement or the Budget app's log becomes proposals (same, matched, recurring, new, skip), applied once; estimated vs actual per line and tag over the window, income logged against planned, the savings rate from the real ledger; a Dashboard tile
- [x] Batch F: the Plan page (S-208): one waterfall with the match step, SE tax and the Roth cap (answers 23 to 25); the FOO ladder with ghost chips; the paycheck allocator; the solvers; the real hourly wage and the hours toggle; DRAFTT; the fixed floor and the income shock; goals; the outlook; life events; saved scenarios with a diff; the history; export and import; the one-pager; the skip link, error banner, build stamp and pinned Save on every page

## Next: Phase 2 full version, Batches B to G (in order; each tested, committed and pushed)

- Batch G: retire the old Budget calendar, after parity

## Earlier plan (superseded by the batches above)

1. **Windfall**: an `employerMatch` step before `cards` whenever a paycheck has a match (the match must become numbers: the account's `matchFormula` is text today); the `taxOnIt` step adds the self-employment rate for 1099 money; the `roth` step is capped at the year's known earned income and reads rough when that income is rough or missing.
2. **Budget, estimated vs actual, the feed model**: the Budget reads its estimates from the spine's expenses; its transaction log supplies the month's actuals back to the spine as Facts; the Dashboard shows estimate, actual and the gap per line.
3. **Retire the Budget calendar**: the list of what it touches is in `docs/PHASE2_REPORT.md`; the spine calendar takes the log's real pay and bill dates first, then the old one goes.

## Waiting on Eli

Sign-off: `SIGNOFF.md` (your numbers in `SIGNOFF.local.md`, on your machine only).
The open questions are in QUESTIONS.md. The ones that change numbers most now:
confirming the rough W-2 numbers (the tax bill), card minimums (surplus,
runway), and the 1099 contract's amount and likelihood (next year's outlook).

## Future rounds

Backlog only; not built.

- **Excess cash flag**: cash above the Rule-of-5 target that isn't assigned to a goal or sinking fund is flagged. Option "I keep extra on purpose" moves it to a "Peace of mind" category with a SWAN amount; it then appears only as yellow in monthly/annual reviews, showing opportunity cost (cash APY vs likely real return, in dollars per year and FI days). Never red.

## Out of scope until later

Monte Carlo, withdrawal sequencing, Social Security, scenario blocks (the
married scenario), game layers, coach mode, statement import, rooms beyond
the Ledger and Dashboard.
