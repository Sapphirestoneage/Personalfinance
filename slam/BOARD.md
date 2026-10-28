# Board

## Done: Phase 1, foundation and core engines (2026-10-22)

- [x] Rules registry: `data/rules-2026.json` (115 rules), `engine/rules.js` `get(id, year)`, a test that every rule id in code exists
- [x] Account shells and the spine schema: ten families, Account Rules presets, the validator; both fixtures validate
- [x] Engines with unit tests: cashflow, tax (federal, FICA, SE, unemployment, gains stacking, conversions, NY), projection (24 months, then yearly to life expectancy), FI (number, percent, years, Lean, Coast, implied), debt (avalanche, snowball, stress; payoff dates and interest; promo deadlines), emergency (Rule of 5, runway tiers, Roth backstop), flags
- [x] Ledger (now My numbers): groups (now the six DATING sections), kind chips, edit / confirm / not for me, undo and redo, the still-guessing list
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

## Done: Phase 2 full version, Batches 0 to F, and G's ports (2026-10-23)

- [x] Batch 0: `docs/CALENDAR_PARITY.md`; answers 21 to 28 as S-202; D-342 and the CLAUDE.md line
- [x] Batch A: `engine/vendor/` (the v44 engine as ported by Money Rooms v3, drift-tested), `engine/cashsim.js` (spine in, model out, results back as Facts with kind), the ten self-test assertions as tests, the calendar's cash line and month-end checking from the simulation with Show the math (S-203)
- [x] Batch B: the calendar views (S-204): the time selector (`ui/window.js`), tabs for the month grid with running cash and debt, weeks, the next 14 days, each paycheck with bonus chips and the gross fold-out, the year strip; drag or Move, skip, re-price, lock; the maybe tray; search; milestones and their timeline; pills; Undo; affordances.html entries
- [x] Batch C: the Debt tab (S-205): clear dates, payoff Gantt, order list, interest stack, why stuck, target solver, minimum-payment trap, utilization at the report day, balance transfer, annual fee, which card with float days, signup bonus with its deadline on the calendar, the billing cycle on every tile, income-driven repayment and forgiveness from the rules registry
- [x] Batch D: the Spending page (S-206): the spend log and the five-second logger, per-tag budgets with pace and running hot, safe to spend, burn tiers, the donut with the cut simulator, the bill autopsy, can I spend this, price increases and free trials, check-ins with drift, momentum and the staleness banner, the month-end sweep; merchant cleanup on the spine
- [x] Batch E: the feed and estimated vs actual (S-207): a statement or the Budget app's log becomes proposals (same, matched, recurring, new, skip), applied once; estimated vs actual per line and tag over the window, income logged against planned, the savings rate from the real ledger; a Dashboard tile
- [x] Batch F: the Plan page (S-208): one waterfall with the match step, SE tax and the Roth cap (answers 23 to 25); the FOO ladder with ghost chips; the paycheck allocator; the solvers; the real hourly wage and the hours toggle; DRAFTT; the fixed floor and the income shock; goals; the outlook; life events; saved scenarios with a diff; the history; export and import; the one-pager; the skip link, error banner, build stamp and pinned Save on every page
- [x] Batch G, the ports (S-209): a gap audit of the Budget calendar's own code; what it did brought to SLAM (the log reaches the run once, safe to spend capped at the lowest point ahead, Cash by day, the month in words, waiting, by date, so far and expected, empty states)
- [x] Bug: a bare `income` path crashed the self-audit with a local profile; earned income for a year is one function, `labelFor` never throws, a fourth audited household reproduces it (S-210)
- [x] How much to max it? (S-211): a panel on every tax-advantaged account in the Ledger, one Plan card, deadline chips on the calendar, the FOO rungs and the Windfall Roth step on the same rows, the cash check on the day-by-day run
- [x] Batch G, the retirement: the patch is now applied (answer 39, S-226); what is left is listed as known differences in `docs/PHASE2_REPORT.md`

## Next: Eli's answers to questions 29 on, then the retirement patch

## Earlier plan (superseded by the batches above)

1. **Windfall**: an `employerMatch` step before `cards` whenever a paycheck has a match (the match must become numbers: the account's `matchFormula` is text today); the `taxOnIt` step adds the self-employment rate for 1099 money; the `roth` step is capped at the year's known earned income and reads rough when that income is rough or missing.
2. **Budget, estimated vs actual, the feed model**: the Budget reads its estimates from the spine's expenses; its transaction log supplies the month's actuals back to the spine as Facts; the Dashboard shows estimate, actual and the gap per line.
3. **Retire the Budget calendar**: the list of what it touches is in `docs/PHASE2_REPORT.md`; the spine calendar takes the log's real pay and bill dates first, then the old one goes.

## Waiting on Eli

Sign-off: `SIGNOFF.md` (your numbers in `SIGNOFF.local.md`, on your machine only).
The open questions are in QUESTIONS.md. The ones that change numbers most now:
confirming the rough W-2 numbers (the tax bill), card minimums (surplus,
runway), and the 1099 contract's amount and likelihood (next year's outlook).

## Phase 3: run the program (in client-stage order)

Not started. Phase 3 starts only when the Phase 2.5 gate passes. Where the gate stands (2026-10-28):

- [x] Gate: a first session takes under an hour: about 32 minutes for one person (Maya), 41 for a homeowner with side work (Dre), about 35 for a couple (Jordan and Sam), timed by `tools/friction-audit.mjs` (`docs/FRICTION_AFTER.md`, `docs/CLIENT_TEST.md`)
- [x] Gate: the one-pager prints with the client's name (both names for a couple), the tax buckets bar and the protection line
- [x] Gate (built, needs your eye): nothing on a client screen needs explaining: every question fits its answers (S-276), the step bar names its steps, fields never collide (`tools/collide-check.mjs`: 0 problems), the copy test passes
- [ ] Waiting on you: no crashes on your real profile (on your machine; the profile never enters git)
- [ ] Waiting on you: five headline numbers checked by hand against your own math, to the cent
- [ ] Waiting on you: your answers in `docs/MY_METHOD_REVIEW.md` (the defaults that move a headline number most)
- [ ] Waiting on you: one live dry run on a call, start to the one-pager
- [ ] Waiting on you, part of the dry run: the squint test (`docs/squint-test.html`): a friend circles the site ID, page name, sections, local options, you are here and search on six blurred screens in two minutes
- [x] Gate (built): the trunk test passes on every page, every second-level tab and a level-3 and level-4 screen in each section, at phone and computer width (`docs/TRUNK_TEST.md`, `tools/trunk-check.mjs`)

### This run (Phase 2.5, practical): done

- [x] Friction audit before and after (`docs/FRICTION_BEFORE.md`, `docs/FRICTION_AFTER.md`)
- [x] Practical: four tabs and More, the client switcher, pick up where you left off, End call, autosave (S-269)
- [x] Type depth: 67 types, each with its own questions; details asked outright, yes / no questions ticked (S-266, S-267, S-276)
- [x] Ticks and speed: the headline strip, the Next card, keys, the More drawer (S-270)
- [x] Wiring and New York City and Yonkers tax (S-272)
- [x] Planner views: tax buckets, allocation, fees in dollars, bracket room, where each number came from (S-274)
- [x] Insurance and protection (S-275)
- [x] Couples on screen (S-277)
- [x] The step map and planning dates (S-278)
- [x] Housing line: 30% with a car, 35% without (S-276)

### Pulled forward from Phase 3

- [x] **3b In the call**: client list and switching (S-269)
- [x] **3b In the call**: next-question card with materiality (the Next card, S-270)
- [x] **3c After the call**: end-of-session one-pager (End call, S-269)

Then, one line per item, in the order a client meets them:

- [ ] **3a Before the call**: pre-call homework checklist (last 2 statements as CSV, one paystub, loan logins, account list); uploads land as guesses
- [ ] **3a Before the call**: discovery call intake (gut number, preset); saves straight into the client's file
- [ ] **3a Before the call**: onboarding openings
- [x] **3b In the call**: client list and switching (pulled forward, S-269)
- [ ] **3b In the call**: coach mode
- [ ] **3b In the call**: statement and CSV import with categorization and recurring detection (import before the call is the main path)
- [x] **3b In the call**: coach quick-entry shorthand (done S-285: the header search box; "amex gold 2000 24%", "vtsax 18k roth", "rent 2400") ("amex 2000 25% due 1" makes the row; house defaults fill the rest as rough)
- [x] **3b In the call**: next-question card with materiality (pulled forward, S-270)
- [ ] **3b In the call**: session timer by DATING step
- [ ] **3c After the call**: end-of-session one-pager (pulled forward, S-269) plus auto recap
- [ ] **3c After the call**: "will email" items become client to-dos; "look up" items become coach to-dos
- [ ] **3c After the call**: report output (plan PDF)
- [ ] **3d Between sessions and the money date**: pre-session prep sheet (what changed, what's stale, biggest variance, next step)
- [ ] **3d Between sessions and the money date**: month-end close loop, pre-filled from imports and the cash log
- [ ] **3d Between sessions and the money date**: budget-to-cash bridge
- [ ] **3d Between sessions and the money date**: money date and monthly check-in
- [ ] **3d Between sessions and the money date**: refresh and upkeep
- [ ] **3e Questions clients ask live**: Can I?
- [ ] **3e Questions clients ask live**: debt order and true cost of debt
- [ ] **3e Questions clients ask live**: emergency fund and runway
- [ ] **3e Questions clients ask live**: when it won't all get paid
- [ ] **3e Questions clients ask live**: variable income smoothing
- [ ] **3e Questions clients ask live**: advice line and out-of-scope handoff
- [ ] **3e Questions clients ask live**: get help
- [ ] **3e Questions clients ask live**: the Life Pyramid lens, on the Plan tab beside DRAFTT; adds no questions (spec: `docs/specs/life-pyramid.md`)

## Phase 4: rooms, added when a client needs one

Not started. Each room waits until a client's situation calls for it.

- [ ] Scenario blocks and compare
- [ ] Lever ranking
- [ ] Advice Translator and disregard cards
- [ ] Every ratio
- [ ] Lifestyle creep
- [ ] Annual money calendar
- [ ] Between Jobs
- [ ] Earn More
- [ ] Variable Income room
- [ ] Tax room
- [ ] Retirement accounts and Roth choices
- [ ] FIRE Lab
- [ ] Shockingly Simple Math
- [ ] What It Takes
- [ ] Scenario Planner and Long Way Round

## Future rounds

Backlog only; not built.

- **Excess cash flag**: cash above the Rule-of-5 target that isn't assigned to a goal or sinking fund is flagged. Option "I keep extra on purpose" moves it to a "Peace of mind" category with a SWAN amount; it then appears only as yellow in monthly/annual reviews, showing opportunity cost (cash APY vs likely real return, in dollars per year and FI days). Never red.

## Out of scope until later

Monte Carlo, withdrawal sequencing, Social Security, game layers. (Coach mode
moved to Phase 3b; statement import, built in Batch E, grows in Phase 3b;
scenario blocks, including the married scenario, and the rooms listed under
Phase 4 moved there.)
