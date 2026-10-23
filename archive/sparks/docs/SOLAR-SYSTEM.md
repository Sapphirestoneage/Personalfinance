# SPARKS / Money Rooms: The Solar System Build (master prompt)

You are working in the Money Rooms repo (GitHub: Personalfinance, deployed on GitHub Pages and Vercel). This document is the complete specification for the app's new entry system, its metrics layer, its strategy layer, and its home map. Read all of it before writing code. It is long on purpose: the data tables in it are meant to be turned into JSON files almost line for line.

## 0.1 What you are building, in one paragraph

A person answers plain questions about six areas of their money: You, Income, Expenses, Assets, Debt & Credit, Taxes. Those six areas are planets. Each has 30 levels in 10 bands, and a band means the same depth of knowing on every planet. As facts arrive, metrics compute on their own: nothing is locked, a metric simply cannot exist until its inputs do. Metrics are the rewards ("metrics unlocked"). Strategy tracks called moons orbit each planet and open when the numbers say they apply to this person. Decisions live in the sun at the center. The home map, the Sky, shows six planets riding ten orbits, moving outward as they level. Things with no numbers (psychology, time, purpose) stay in the existing What Matters group.

## 0.2 Who it is for

Primary user: people in their 20s pursuing early retirement. The benchmark is the most advanced paywalled planning software (Boldin, eMoney, ProjectionLab), and the goal is to beat their onboarding and match their depth, for free. Two test personas must both succeed. Tom, a CPA, will max one planet and ignore the rest, and will check every formula. Alexis avoids money entirely, will close the app at the first red number or wall of fields, and must still leave with an approximate FI date. The owner also uses this tool to onboard and analyze his own coaching clients.

## 0.3 Principles that override everything else

1. Ask basic questions, give advanced results. Ask as little as possible, prefill as much as possible.
2. Never ask for a metric. Ask for plain facts, hand back the insight (section 1.13).
3. No question without a payoff shown right after it.
4. No fact typed twice, anywhere.
5. Nothing is locked. Things are "not computable yet," and the app says exactly what is missing.
6. Zero, none, and unknown are three different stored values (section 1.4, rule 5). No N/A, ever.
7. Never red. No warning icons. No "incomplete." Empty reads "not yet."
8. Every number has a source, an as-of date, and a confidence. Every headline metric shows a give-or-take band.
9. The pitch for deep levels is power and certainty, never time saved.
10. Every session ends with a win: a number revealed, a band tightened, or dollars won.
11. One next thing big, two smaller. Never a to-do list of 180.
12. Anything tied to law or yearly limits comes from a dated, sourced data table. No hard-coded dollar limits. No benchmark figure ships without a citation and a last-checked date.
13. UI copy is plain, warm, and human. Short sentences. No jargon inside a definition. No em dashes in any copy.

## 0.4 How this fits what already exists

- This replaces the Ledger's progression and its 45-cell target visual. The Sky is the Ledger's new home. The Ledger remains the only place facts are entered. Rooms remain views.
- DAITE stays the data spine. The sixth planet, You, holds what was previously scattered personal info and the situation gate.
- The nine Dante spheres stay as a separate ruler for overall sharpness (a badge and the dashboard tiles). Do not map spheres to bands 1:1.
- Existing decisions that still hold: spine v2, shared core plus one HTML file per room, registry-driven map, the situation gate (fields that do not apply are absent, not hidden), global undo and redo, scenario blocks as a separate layer that never dissolves into facts, the single lever library (data/levers.json), frameworks as lenses behind a "more ways to look at this" toggle, framework names as a toggle, the three verbs (Enter, Confirm, Sharpen), the hybrid next-3 card, the one revisit list for rough and unknown numbers, versioned JSON export and import with a pre-import snapshot, household of two handled natively.
- Migrate, do not reset. Any value already in the user's Ledger maps onto its new level id. Write a migration with a snapshot first, and a test corpus of old states.

## 0.5 Files to create

- data/levels.json: 180 levels (Part 1, section 1.7), each with the card fields in section 1.8.
- data/recipes.json: every metric in Part 2 (A4) and every ratio in Part 4 (C3). Formulas are functions in code, keyed by id. Fields: id, label, tier, needs, derived, sharpenedBy, feeds, and for ratios top, bottom, benchmarkKey.
- data/defaults.json: Part 2, A2.
- data/moons.json and data/moves.json: Part 1 section 1.10 and Part 2 A8.
- data/benchmarks.json: bands by source (Part 4 notes, Part 5 D18), each with citation and lastChecked.
- data/glossary.json: Part 5.
- data/tax-tables.json and data/benefit-tables.json: dated, sourced.
- Lints as tests: band alignment, prefill direction, no duplicate facts, every level has a payoff, every nextMove resolves, every moon expression references real ids, no N/A strings, no red in the palette, Sky and list view agree.

## 0.6 Build order (stop and show the owner after each step, one commit per step)

1. Data and lints. All JSON files above, with tests passing. No UI yet.
2. Engine. Value store with the four states (number, none, rough, unknown), recipe evaluator, band and tier calculation with shrinking planets, confidence to give-or-take bands, migration from the current Ledger.
3. Band 1 end to end. The 18 Sketch levels, all Tier 1 metrics, the unlock card, the dashboard strip. Under 2 minutes for a new user. This alone is shippable.
4. The Sky and its list view (Part 3, B1 to B5).
5. Planet view with level cards, bands 2 and 3, Tier 2 and 3 metrics including the derived liquidity reveal.
6. Metrics tab (the shelf) and metric detail.
7. First moons: Main Path, Safety Net, Payoff Plan, Credit Building. Quick wins and the "won so far" total.
8. The sun and the lever flow into scenario blocks.
9. Bands 4 to 6 and their tiers, the reads (confirm cards), remaining moons.
10. Bands 7 to 10, the remaining ratios, Protection and Decumulation gathered views.
11. Glossary everywhere, the Advice Translator tags (for you now, not yet, outgrown), benchmark source picker.
12. Simplify pass: tap counts, copy review, performance, accessibility, reduced motion.

If anything in this document conflicts with itself: Part 2 wins on which tier a metric belongs to, Part 1 wins on level content and rules, Part 3 wins on visuals. If something is ambiguous, ask the owner one short question instead of guessing.

## 0.7 Definition of done

Every quality gate in sections 1.9, 1.12, 1.16, and B12 passes. A synthetic corpus of at least 12 households (including no-debt renter, couple with separate money, variable-income freelancer, student, high earner with equity comp, house-rich low-liquidity saver, and someone who answers "don't know" to everything possible) runs clean: no N/A, no duplicate question, no red, every unlock names its inputs, and Tom and Alexis both finish band 1.

---

# PART 1: PLANETS, BANDS, LEVELS, MOONS, RULES

## 1.1 The model

Six planets, 30 levels each, grouped into 10 bands of 3. A band means the same thing on every planet, so "level 12" is the same depth of knowing whether it is Debt or Taxes. Metrics unlock in 10 tiers, and tier N needs only levels inside bands 1 to N. That alignment is a hard rule with a lint test (section 1.9). Nothing is locked. Metrics are just not computable until their inputs exist. Decisions are not a planet, they are the sun in the middle.

## 1.2 What counts as one level

A level is one sitting with one source. One pay stub. One loan statement. One portal page. One honest guess. If two facts come off the same piece of paper, they are the same level (balance, rate, and minimum per debt is one level, not three). If a fact needs a different document or a different kind of thinking, it is a different level. No level exists just to fill a slot.

## 1.3 The ten bands (same meaning on every planet)

| Band | Levels | Name | What it means | Payoff |
|---|---|---|---|---|
| 1 | 1-3 | Sketch | Rough totals plus the facts that change everything | Reveal |
| 2 | 4-6 | Basics | The handful of things every person should know about this area | Reveal |
| 3 | 7-9 | Breakdown | Itemize it | Reveal |
| 4 | 10-12 | Terms | The attributes of each item: rates, types, tax treatment | Reveal / Certainty |
| 5 | 13-15 | Flow | How it moves: monthly, yearly, and what is about to change | Certainty |
| 6 | 16-18 | Read | App computes, user confirms (the old Round 2) | Certainty |
| 7 | 19-21 | Verify | Replace guesses with documents | Certainty |
| 8 | 22-24 | Protect | What happens when something goes wrong | Power |
| 9 | 25-27 | Optimize | Moves only available once you know the detail | Power |
| 10 | 28-30 | Horizon | The FI phase itself: drawdown, late-life, upkeep | Power |

Rounds from the notebook map on top: Round 0 = band 1. Round 1 = bands 2 to 5. Round 2 = band 6 (and every C level). Round 3 = the sun. Bands 7 to 10 are the long game. Rounds and Dante spheres stay separate rulers, no forced 1:1.

## 1.4 Rules

1. No question without a payoff, shown right after entry with a before/after.
2. Three payoff currencies, declared per level: Reveal (a number you did not have), Certainty (same number, tighter give-or-take band), Power (a move you can now make, adds a lever to the sun). The pitch for high levels is power and certainty, never time saved. Every headline metric shows a give-or-take band driven by input confidence. On first reveal, frame a wide band as "rough sketch, every answer tightens it."
3. Three verbs, tagged per level: E (Enter), C (Confirm: app computed or prefilled, user says yes or fixes), S (Sharpen: replace a rough with a real).
4. Every level accepts "roughly for now" and "don't know." Both count for leveling and both land on the one revisit list.
5. Zero, none, unknown are stored differently. Zero is a number (debt-to-assets = 0%). None removes levels and shrinks the planet (no debt: every debt level drops out and debt-only metrics become earned badges like "Debt free," never N/A). Credit levels on the Debt & Credit planet (6, 20, 21) never drop out, because a debt-free person still has and needs credit. Unknown is the only "not yet," and it is never red.
6. Situation gate: levels that do not apply are absent, the planet's max shrinks, and a band with no applicable levels counts as complete for tier unlocks.
7. No fact typed twice. Cross-planet C levels prefill from their source, and the source must sit in the same or a lower band.
8. Two views of one dataset. Round/band view: a ring fills when all six planets finish a band, and the tier celebrates. Planet view: level any planet as far as you like. Individual metrics still light up the moment their own inputs exist, even if the tier is not complete.
9. The "next 3" card ranks open levels by impact, and never suggests above band 2 on any planet until every planet has finished band 1.

## 1.5 Metric tiers (the Metrics tab)

Sibling of the Dashboard. Shows all ten tiers. Each unlit metric names exactly what it is waiting on with a tap-through. A shopping list, never a wall.

The authoritative list, with formulas and responsible levels, is Part 2 (section A4) below: 141 metrics, plus the 43 new ratios in Part 4, 184 in total, all linted for band alignment. Summary by tier:

- Tier 1, Sketch: Gap (monthly), Savings rate, potential, Savings rate, actual, Leak rate, Savings rate on gross, FI number, Net worth, Debt-to-assets, Percent to FI, FI date, Coast FI target, Percent to Coast FI, On track for your date, Debt payoff time, rough, High-interest debt flag, Debt payment rate, Shelter rate, Implied tax rate, State tax rate, rough, Income swing
- Tier 2, Basics: True monthly spend, Runway months, Emergency fund target, Match capture rate, Match left on the table, Liquidity rate, Bridge years, Must-pay rate, rough, FAT and wants shares, Next slot for your money, first pass, Credit band, Tax-advantaged accounts used, Debt payoff time with extra, Home equity, rough, Household mode
- Tier 3, Breakdown: Needs / wants / investing, DRAFTT scorecard, Net worth statement, Income by source, Taxable income, Projected refund or owed, True savings rate, Weighted debt rate, Interest paid per month, Retirement contribution rate, Recurring bills total, Transportation rate, Promo rate cliff
- Tier 4, Terms: After-tax net worth, Liquidity rate, confirmed, Bridge number, Payoff plan with dates, Marginal bracket, Bare-bones and Lean FI number, Fixed-cost rate, Cash drag, Real hourly wage, first pass, Self-employment tax exposure, Insurance cost rate, Coverage gap, first pass, Housing debt load, Variable-rate share
- Tier 5, Flow: FI date, projected, Sinking fund targets, FI number by phase, first pass, This year's projected tax, Next year's bracket, Lifestyle creep rate, Income growth rate, Plan return assumption, Debt-free date, Suggested scenario blocks, Family money flows
- Tier 6, Read: Income stability score, Emergency fund: target vs. actual, Real hourly wage, Top income levers, Top expense levers, Shelter analysis, Next slot for your money, Allocation read, Payoff method chosen, Invest vs. pay off line, Student loan path, Roth vs. traditional call, Credits you may be missing, HSA read, Triple D bands, Required savings rate, Next milestone
- Tier 7, Verify: Estimate vs. actual, Certainty score, Withholding check, Effective tax rate, actual, Credit utilization, Credit report check, Spending seasonality, Per-tag budgets vs. actuals, Side income, actual net, Holdings look-through, Key dates timeline, Residency check
- Tier 8, Protect: Job-loss runway, Bad-year cost, What a 30% drop does, Concentration flags, Rate-shock payment, Coverage gaps, Estate readiness, Underpayment safe harbor, Joint and co-signer exposure, Resilience score
- Tier 9, Optimize: Fee drag, Tax if sold, Harvesting room, Mortgage and FHA capacity, Refinance savings, Deductible interest, Total compensation, Market pay gap, Bill-shopping savings, Rewards value per year, Worth-it read, Roth basis available, Tax effect of a move, Side income capacity
- Tier 10, Horizon: Real after-tax FI number, Bridge number, final, Drawdown plan, Roth conversion ladder, Subsidy cliff map, Social Security floor, Barista FI number, Debt-free vs. FI date, Interest saved per extra dollar, Leverage policy, Rental analysis, Windfall plan, Plan horizon, FI number by phase, final, Refresh health

## 1.6 The sun (Round 3)

Lights partially after Tier 1, fully after Tier 6. One question: "Are you on route, or what would you rather change?" Then data/levers.json sorted by FI-date impact for this household: cut expenses, raise income, change the date, change the destination. Power levels add levers. Confirmed choices become scenario blocks.

## 1.7 The levels

### YOU
Sketch
1. E. Age.
2. E. Where you live: state and city.
3. E. When you want work to be optional: age, date, or "don't know."

Basics
4. E. Work situation (the situation gate): employed, self-employed, between jobs, student, mixed.
5. E. Household: solo or partnered, money shared or separate, kids now.
6. E. Housing status: rent, own, with family.

Breakdown
7. E. Partner's basics: age, work situation, target date.
8. E. Who depends on you or will: kids planned, supporting family.
9. E. What FI is for, one sentence, plus which flavor appeals (Lean, Coast, Barista, full, Fat).

Terms
10. E. Education: degrees held, in school now, planning school.
11. E. Health coverage source (employer, parent's plan, marketplace, none).
12. E. Career field and stage. Sets income growth default.

Flow
13. E. Big events in the next 5 years: move, marriage, kid, school, home. Suggests scenario blocks.
14. E. Planning to move: where and when. Creates a geo block.
15. E. Family money, both directions: expected inheritance or help, supporting parents.

Read
16. C. Risk comfort. App shows best, likely, worst (Triple D), user picks the band they plan on.
17. C. Target date reality check. App shows the savings rate the date requires, user keeps or moves the date.
18. C. Next milestone. App shows the FI phases ladder with where you stand, user picks the next target.

Verify
19. S. Social Security statement from ssa.gov.
20. S. Benefits enrollment summary: what coverage you actually have.
21. C. Key dates. App lists inflection ages (26 off a parent's plan, 59.5, 65, etc.), user confirms.

Protect
22. E. Insurance held, yes/no each: health, renters or home, auto, disability, life, umbrella.
23. E. If your income stopped: who is affected, who could help.
24. E. Estate basics, yes/no each: beneficiaries named, will, POA, someone knows where things are.

Optimize
25. E. First-time buyer status and homebuying intent. Feeds FHA capacity.
26. E. Time and energy budget: hours a week available for money moves or side income.
27. E. Flexibility: remote work, willingness to relocate, roommate or house hack openness.

Horizon
28. E. Plan end age.
29. E. A week in FI: what you would actually do. Links to Designed Week, feeds spending in FI.
30. C. Annual review: confirm the whole planet, set the refresh date.

### INCOME
Sketch
1. E. Monthly take-home, total.
2. E. Gross annual pay.
3. E. Steady or variable. If variable: low, typical, high month.

Basics
4. E. Employer match: exists, percent, are you getting all of it.
5. E. Pay cadence and paydays.
6. E. Benefits offered, yes/no each: 401k, HSA, ESPP, health, disability.

Breakdown
7. E. Income by source with amounts: job, partner, side work, other.
8. E. Everything that is not the paycheck: bonus, commission, side income (gross, costs).
9. S. One pay stub, every line: pretax 401k, HSA, premiums, taxes withheld.

Terms
10. E. Type per source: W-2, 1099, business, passive.
11. E. Hours worked, commute time, work costs.
12. E. Irregular income detail: timing and how reliable.

Flow
13. E. Expected raise and when.
14. E. Last 3 years of income, rough.
15. E. Known changes: job ending, leave, school, partner's work.

Read
16. C. Stability read. App scores it, user confirms. Sets emergency fund target months.
17. C. Growth areas. App lists the top 3 income levers for this field and stage, user marks the real ones.
18. C. Real hourly wage. App computes, user confirms.

Verify
19. S. Last year's W-2 and 1099 totals.
20. S. Year-to-date from the latest stub vs. your estimate.
21. S. Side income actuals, last 12 months.

Protect
22. E. Job-loss cushion: severance, unemployment estimate.
23. S. Disability coverage through work: percent of pay, how long.
24. C. Concentration: share of income from one employer or client.

Optimize
25. E. Equity comp: RSUs or options, vest dates.
26. S. Match vesting schedule and the dollar value of benefits (HSA seed, ESPP discount, stipends).
27. E. Market rate check: what this role pays elsewhere.

Horizon
28. C. Social Security projection, from You 19.
29. E. Income in FI: part-time, rental, pension, business.
30. C. Earnings path to the FI date. App draws the curve, user confirms.

### EXPENSES
Sketch
1. E. Monthly spending, rough.
2. E. Shelter cost.
3. C. Does that total include debt payments or saving? Pull them out so the gap is clean.

Basics
4. E. FAT split (food, accommodation, transportation) plus one wants bucket.
5. E. Bare-bones month: what you would need if income stopped.
6. E. Big irregular costs, rough annual total: insurance, holidays, travel, tuition, repairs.

Breakdown
7. E. Recurring bills and subscriptions.
8. E. Transportation, full cost: payment, insurance, gas, maintenance.
9. E. Food and wants by bucket: groceries, eating out, fun, shopping, travel, giving.

Terms
10. E. Fixed or flexible flag on each line.
11. E. Insurance premiums by type.
12. E. Who pays what (partnered households only).

Flow
13. E. Irregular costs itemized with their months. Unlocks sinking funds.
14. E. Costs that will end or start, with dates.
15. E. Change vs. a year ago, rough. Unlocks lifestyle creep.

Read
16. C. Needs, wants, investing against DRAFTT bands.
17. C. Shelter analysis: share of take-home, roommate option, house hack option.
18. C. Top 3 expense levers by FI-date impact.

Verify
19. S. Three months of statements vs. your estimate.
20. S. Category detail with per-tag budgets.
21. S. Twelve months of actuals. Unlocks seasonality.

Protect
22. S. Deductibles and out-of-pocket max: what a bad year costs.
23. E. Costs that spike in a shock: COBRA, a move, replacing the car.
24. C. Bare-bones number checked against real fixed bills.

Optimize
25. E. Bills worth shopping: insurance, phone, internet.
26. C. Worth-it read on your top wants.
27. E. Rewards earned on spending you already do.

Horizon
28. C. Spending in FI: what drops, what rises.
29. S. Healthcare cost before 65.
30. C. Personal inflation and FI number by phase.

### ASSETS
Sketch
1. E. Total saved and invested, rough.
2. E. Cash vs. invested.
3. E. How much you add per month, total, anywhere.

Basics
4. C. Emergency fund: which cash counts. App computes months.
5. E. Accounts you have, yes/no with rough balance: 401k, Roth IRA, HSA, brokerage, HYSA.
6. E. Big things you own: home, car, rough value.

Breakdown
7. E. Every account with its balance.
8. E. Contributions per account.
9. E. Everything else: business equity, crypto, I-bonds, collectibles.

Terms
10. C. Tax type per account: pretax, Roth, taxable, HSA.
11. C. Liquidity tier per asset: days, weeks, penalty, locked.
12. S. Rate on each cash account.

Flow
13. E. Allocation per account: stocks, bonds, cash.
14. E. Contribution schedule: percent of pay, auto-increase, max targets.
15. E. Planned big uses of cash, with dates: down payment, car, wedding.

Read
16. C. Next slot for your money.
17. C. Allocation read against age and risk comfort.
18. C. Emergency fund: target vs. actual, and where the target came from.

Verify
19. S. Statement balances replace the roughs.
20. S. Actual holdings: funds and tickers.
21. S. Home and car values checked.

Protect
22. C. Concentration: employer stock or any single position.
23. S. Beneficiaries on every account.
24. C. What a 30% drop does to the plan (sequence risk read).

Optimize
25. S. Expense ratios and fees. Unlocks fee drag.
26. S. Cost basis in taxable accounts. Unlocks tax-if-sold and harvesting.
27. S. Roth contributions vs. growth. Unlocks the ladder.

Horizon
28. E. Real estate detail: value, rent, costs.
29. C. Windfall plan: how a bonus or inheritance gets deployed.
30. C. Drawdown order and withdrawal approach.

### DEBT & CREDIT
Levels marked [credit] stay applicable even when debt is none.

Sketch
1. E. Total debt, or none (debt levels drop out, "Debt free" badge, credit levels remain).
2. E. Total monthly minimums.
3. E. Any of it above about 8% (cards, pay-later, personal loans)? How much.

Basics
4. E. By type with rough balances: card, student, car, mortgage, medical, personal, pay-later.
5. E. Paying extra on anything? How much, on what.
6. E. [credit] Credit score band, and whether you have any credit history at all.

Breakdown
7. S. Each debt, off its statement: balance, rate, minimum.
8. E. Promo or 0% rates and when they end.
9. E. The ones people forget: family loans, co-signed, medical, collections.

Terms
10. S. Fixed or variable, and term remaining, per debt.
11. S. Student loans: federal or private, loan types, servicer.
12. S. Mortgage detail: term, PMI, escrow.

Flow
13. E. Extra payment plan: amount and target.
14. E. New debt expected: car, school, home.
15. E. Student loan repayment plan you are on now.

Read
16. C. Payoff method and date. App shows both methods with dates and interest.
17. C. Invest vs. pay off. App shows the rate where the answer flips for you.
18. C. Student loan path: IDR and PSLF fit.

Verify
19. S. Statement balances and rates replace the roughs.
20. S. [credit] Credit report pull: every account listed, any errors, age of oldest account.
21. S. [credit] Card limits and utilization.

Protect
22. C. Variable-rate exposure: the payment if rates rise.
23. C. If income stops: minimums-only number and hardship options.
24. E. Joint and co-signer exposure.

Optimize
25. C. Refinance or consolidation check.
26. C. Deductible interest. Feeds Taxes.
27. C. Debt-to-income. Unlocks mortgage and FHA capacity.

Horizon
28. C. Debt-free date vs. FI date: what you carry into FI.
29. S. Exact amortization: interest saved per extra dollar.
30. C. Leverage policy: what debt you would take on again, and at what rate.

### TAXES
Sketch
1. C. State, from You 2. Rough effective rate.
2. C. Implied rate from gross vs. take-home.
3. E. Last year: refund or owed, roughly how much.

Basics
4. E. Filing status.
5. C. Tax-advantaged accounts in use, from Assets 5.
6. E. How you file: yourself, software, preparer. Any self-employment income, yes/no.

Breakdown
7. C. Pretax contributions, from Income 9. Unlocks taxable income.
8. C. Withholding per check, from Income 9. Unlocks projected refund or owed.
9. E. City or local tax.

Terms
10. C. Marginal bracket, federal and state.
11. C. Which rules apply to your income types, from Income 10: self-employment tax, QBI.
12. C. Standard vs. itemized.

Flow
13. C. This year's projected tax.
14. E. Quarterly estimates (self-employed only).
15. C. Known changes that move next year's bracket: marriage, move, kid, income jump.

Read
16. C. Roth vs. traditional for this bracket and plan.
17. C. Credits and deductions you may be missing.
18. C. HSA: eligible, and used as an investment account or not.

Verify
19. S. Last year's return: AGI, total tax, a few key lines.
20. S. W-4 vs. projected liability.
21. S. Residency check: multi-state, moved mid-year.

Protect
22. C. Underpayment safe harbor.
23. E. Records: where returns and basis documents live.
24. C. Documentation read for self-employed: mileage, home office, receipts.

Optimize
25. C. Capital gains bracket and 0% room.
26. C. Gain and loss harvesting, from Assets 26.
27. C. Tax effect of a planned move, from You 14.

Horizon
28. C. Subsidy cliffs and income management in early FI.
29. C. Roth conversion ladder plan, from Assets 27.
30. C. Multi-year projection and withdrawal-phase rate. Unlocks the real after-tax FI number.

## 1.8 Level cards and moves

Borrow card anatomy from the FI Skill Tree, never its content. Each level in data/levels.json: planet, level, band, tag, prompt, checkpoint ("you have leveled this when..."), first15 (where to click or look), tier (S/A/B/C for this household), payoff (reveal, certainty, power, plus the metric or lever), connects, minutes, appliesWhen, prefillFrom, nextMove.

data/moves.json holds a separate set of moves ("do something about it"): what, why, first15, checkpoint, rooms, and the moon it belongs to (section 1.10). Roughly 4 to 6 moves per moon. Each level's nextMove is an explicit id lookup and only surfaces when the number says it applies. Examples: Income 4 to "Capture the full match," Debt 7 to "Pick your payoff order," Expenses 13 to "Set up sinking funds," Assets 25 to "Swap the expensive fund," Taxes 8 to "Fix your withholding."

## 1.9 Quality gates

- Band alignment lint: every recipe in tier N references only levels 1 to 3N. Every prefillFrom points to the same or a lower band. Build fails otherwise.
- Band 1 on all six planets takes under 2 minutes and lights every Tier 1 metric.
- No fact is asked twice anywhere in the 180 levels.
- Every level has a payoff. Certainty levels measurably narrow a band in the synthetic household corpus. Power levels add a lever.
- A no-debt, no-kids, W-2 renter reaches 100% without seeing one level that does not apply, and sees zero N/A strings.
- Every nextMove id resolves. No string matches FI Skill Tree text.
- Personas: Tom (maxes Assets only) sees lopsidedness without nagging. Alexis (avoids Debt) never sees red and still gets an approximate FI date.

## 1.10 Moons (strategy tracks)

A moon orbits one planet. It is a track of moves, not a set of facts. It unlocks when the planet's levels say it applies to this household. A moon that does not apply yet is shown dim with one sentence saying why and which level would change that. This is the Advice Translator: what applies to you now, what does not yet, and what you have outgrown. A moon is never hidden and never blocks entry: tapping a dim moon offers to collect the missing levels inline.

Each moon in data/moons.json: id, planet, label, unlockWhen (expression over levels and values), dimMessage, outgrownWhen (optional), intake (3 to 4 questions asked on first entry, same pattern as scenario blocks, stored in the moon's own store and never duplicating a planet level), moves (ids in moves.json), rooms, metrics it adds to the Metrics tab.

Moon states: dim (does not apply yet), open (applies, not started), active (intake done, moves in progress), settled (moves done, in upkeep), outgrown (no longer the best use of your effort, says so kindly).

### You
- Geo-Arbitrage. Unlock: You 14 or You 27 shows openness to moving. Intake: candidate places, remote-work status, what must come with you. Adds: FI date by location.
- Family & Generational. Unlock: You 5 or 8 shows a partner, kids, or dependents, or You 15 shows family money. Intake: kids' ages or timing, college intent, parents' situation. Adds: family cost timeline.
- Health & Longevity. Unlock: always open. Intake: coverage gaps from You 11 and 22, HSA status. Adds: bad-year cost, healthcare bridge.

### Income
- Career. Unlock: Income 1 to 3. Intake: last raise, last negotiation, skills in demand. Adds: lifetime value of a raise.
- Side Hustles. Unlock: Income 1 and You 26 shows hours available. Dim if Expenses 5 is unknown ("know your bare-bones number first"). Intake: skills, hours, startup cash. Adds: hustle income to FI-date.
- Entrepreneurship. Unlock: Income 10 shows business or 1099 income, or the user asks. Dim if emergency fund under 3 months. Intake: business type, revenue, how you pay yourself.

### Expenses
- Deals & Smart Buying. Unlock: Expenses 4. Intake: the next 3 big purchases. Adds: saved-per-year.
- Card Rewards. Unlock: Debt 3 shows no high-interest balance AND Debt 6 band is good or better AND Expenses 4 is in. Dim message when carrying a balance: "Rewards pay about 2%. Your card costs about 24%. Payoff first, this opens the day the balance hits zero." Intake: cards held, annual fees, accounts opened in the last 24 months, travel or cash preference. Adds: rewards value per year. On by default, because quick wins keep people going. The dim rule is the safety, not the switch.

### Assets
- Main Path (order of operations). Unlock: Assets 1 to 3 and Income 4. Always the first moon suggested. Adds: next slot for your money.
- Safety Net. Unlock: Assets 4 and Expenses 5. Intake: where the cash lives, what counts as an emergency. Adds: months of runway, bank-rate gap. Includes the Rule of 5 calculator.
- Portfolio Design. Unlock: Assets 13. Dim before Main Path reaches the investing step. Intake: funds available in the 401k, comfort with simplicity.
- Real Estate. Unlock: You 25 shows intent, or Assets 6 shows a home. Dim if Debt 3 shows high-interest debt. Intake: market, house hack openness, down payment source. Uses Debt 27 for FHA capacity. House hack calculator attaches here.
- Alternatives. Unlock: Assets 9 shows any, or Main Path is settled. Otherwise dim: "Nothing here beats finishing the Main Path."

### Debt & Credit
- Payoff Plan. Unlock: Debt 1 above zero. Becomes fully active at Debt 7. Moves: pick avalanche or snowball, automate the extra payment, handle promo expirations. Outgrown at debt-free (celebrate).
- Credit Building. Unlock: always open, because credit levels never drop out. Intake: any credit history, authorized-user option, upcoming loan or lease. Adds: credit band trajectory. Outgrown when band is excellent and no loan is planned.
- Leverage. Unlock: Debt 17 read is done and no high-interest debt. Dim otherwise. Intake: what the borrowing is for. Risk flag on every move.

### Taxes
- Tax Strategy. Unlock: Taxes 10. Intake: none, reads from the planet. Moves: account choice, credits, HSA, harvesting (after Assets 26), ladder (after Assets 27).

### Cross-planet, not moons
- Insurance & Protection is band 8 on every planet. It gets a Protection view that gathers those levels in one screen. It is a view, not a planet and not a moon.
- Withdrawal & Decumulation is band 10 on every planet, gathered in the Decumulation room.
- Storms & Windfalls is the Protect band plus scenario blocks plus the windfall room.

## 1.11 What Matters (no numbers, no levels)

Psychology, Knowledge, Time, Social, Pre-Retirement Design, The Long Game, and Financial Ops have no numbers that feed the FI date, so they are neither planets nor moons. They live in the existing What Matters group (the Empyrean). They can read planet data (real hourly wage, percent to FI) but never gate or get gated. Financial Ops (money dates, automation, annual review) is the upkeep rhythm: level 30 on each planet points to it.

## 1.12 Added gates for moons

- Every unlockWhen and outgrownWhen expression references only real level ids. Lint fails otherwise.
- No moon intake question duplicates a planet level.
- A household carrying card debt sees Card Rewards dim with the payoff message and cannot start its moves, but can read why.
- A debt-free household still sees Credit Building and credit levels 6, 20, 21.
- The sky view (six planets, their moons, the sun) is legible on a 380px screen: planets always labeled, moons as dots until a planet is tapped.

## 1.13 Ask sideways, answer straight

Never ask for a metric. Ask for plain facts the user already knows, then hand back the insight they did not know to ask for. The user should feel "I only told it which accounts I have, and it told me how long I could last before 59.5."

Liquidity is the model case. There is no liquidity question in bands 1 or 2. Assets 2 (cash vs. invested), Assets 5 (accounts you have, with rough balances), and Assets 6 (home, car) are asked for their own reasons. Account type implies a default tax type and liquidity tier (HYSA: days. Brokerage: days, taxable. Roth IRA: contributions reachable, growth locked. 401k and traditional IRA: locked until 59.5. HSA: medical only. Home equity: locked). From those defaults the app computes and reveals at Tier 2:

- Liquidity rate: assets reachable without penalty divided by total assets
- Bridge years: reachable assets divided by annual spending

Then it comes back with the answer: "82% of your money is locked until 59.5. If you stopped working at 40, what you can reach covers 3 years." Assets 10 and 11 stay where they are in band 4, as C levels that confirm or correct the defaults. That turns the rough band into a sharp one.

Other derived reveals, same pattern, no new questions:
- Leak rate (Tier 1): what the gap says you could save minus what Assets 3 says you do save
- Implied tax rate (Tier 1): gross vs. take-home
- Runway (Tier 2): cash that counts divided by bare-bones month
- Fixed-cost rate (Tier 2): shelter plus minimums plus known bills over take-home
- Match left on the table, in dollars per year (Tier 2)

Lint: every metric in recipes.json declares derived: true or false. A derived metric's inputs must all be levels that exist for another reason (each input level names a different primary payoff).

## 1.14 Metrics unlocked (the dashboard check)

Metrics are the rewards. Same feel as an achievements shelf, but every item is a real number about you.

On unlock: a card slides in with the metric name, your number, one sentence on what it means, the healthy band (with the selectable benchmark source), and what would sharpen it. One card at a time, never a stack. Dismiss or "show me how this was computed."

Each metric has four states: locked (names what it is waiting on), rough (computed from guesses or defaults, shows its give-or-take), sharp (inputs verified), earned (no longer applies because you won, like "Debt free").

Dashboard strip, the check: "Metrics unlocked: 14 of 184. 2 new since last time. 5 still rough." Tapping opens the Metrics tab. The since-last-time line replaces streaks: it rewards coming back monthly, not daily.

Metrics tab layout: grouped by tier, headline rates first. The core rates every user collects:
- Savings rate, leak rate
- Liquidity rate, bridge years
- Shelter rate, fixed-cost rate
- Debt-to-assets, debt-to-income
- Match capture rate
- Runway months
- Percent to FI, percent to Coast FI
- Implied and marginal tax rate
- Fee drag rate
- Needs / wants / investing shares (DRAFTT)

Shareable unlock links show the metric name and state, never the number.

## 1.15 Quick wins

Every session should end with a win, not just a number. Each band on each planet has at least one moon move tagged quickWin: doable in 15 minutes, with a dollar figure attached ("moving your cash to a higher rate: about $310 a year"). After Tier 1 lights up, the next-3 card always includes one quick win alongside the next level to enter. The dashboard keeps a running "won so far" dollar total next to the metrics count. Quick wins never appear for a dim moon.

## 1.16 Added gates

- A brand-new user who completes bands 1 and 2 sees liquidity rate and bridge years without having answered any question containing the words liquid, liquidity, accessible, or penalty.
- Every unlock card shows exactly one metric. No session shows more than three unlock cards in a row without user input between them.
- No metric ever renders N/A. It is locked, rough, sharp, or earned.
- Every band on every planet maps to at least one quickWin move with a dollar estimate formula.

---

# PART 2: THE CONNECTION MAP (every metric and what is responsible for it)

Generated from one data table and linted: no metric uses a level above its own tier's band. Level ids: Y = You, I = Income, E = Expenses, A = Assets, D = Debt & Credit, T = Taxes. Y3 means You level 3. Band = ceil(level / 3).

## A1. How to read this

Each metric row tells you:
- How it is computed: written with level ids, so for any ratio you can see which planet owns the top and which owns the bottom. "A3 / I1" means Assets owns the numerator and Income owns the denominator.
- Responsible levels: every level that must hold a value (a number, a none, or a rough) before this metric can compute. If any is missing, the metric is locked and names the missing ones.
- Derived: yes means the user was never asked for this. It falls out of facts collected for other reasons (the "ask sideways, answer straight" rule).
- Sharpened by: later levels that do not unlock the metric but tighten its give-or-take band or replace a default inside it.
- Feeds: what reads this metric downstream: other metrics, reads, moons, rooms, the sun.

Build data/recipes.json directly from these tables: id, label, tier, formula (as a function, not a string), needs[], derived, sharpenedBy[], feeds[].

## A2. Global assumptions (data/defaults.json)

These sit under every projection. Each has an owner level that replaces the default when it arrives.

| Assumption | Default | Replaced by |
|---|---|---|
| Real return on invested assets | one declared default, real not nominal | A13 allocation blend (expectedReturn), then A20 holdings, shaped by Y16 Triple D pick |
| Withdrawal rate | 4% | Y28 plan horizon and A30 drawdown approach |
| Inflation | declared once, all math in today's dollars | E30 personal inflation |
| Income growth | by Y12 field and stage | I13, I14 |
| Emergency fund months | 3 if I3 steady, 6 if variable | I16 stability read, A18 confirm |
| Liquidity tier and tax type per account | by account type (A5) | A10, A11 |
| Tax rates | bracket tables by Y2 and T4 | T19 actual return |
| Benefit defaults (match formulas, HSA limits, contribution limits) | current-year tables, sourced and dated | annual data refresh |

Every default carries source and as-of date. A metric computed on any default is "rough" by definition.

## A3. The spine: what moves the FI date

Everything in the app ultimately bends one number. The chain, from raw fact to headline:

1. I1 and E1 (cleaned by E3) make the gap.
2. A3 says how much of the gap actually gets saved. The difference is the leak.
3. E1 (then E6, E19, E28) sets the FI number. Spending counts twice: it sets how much you can save and how much you need.
4. A2 (then A7) is the starting pile. A13 sets how fast it grows.
5. Y1 anchors the clock. Y3 is the date you are testing against.
6. Debt enters through D2 (it eats gap), D7 rates (the slot decides debt vs. investing), and D28 (what carries into FI).
7. Taxes enter through I9 and T10 (what saving really costs you now) and T30 (what spending really costs you later).
8. Moons change inputs. They never compute the FI date themselves. A Side Hustles move raises I7. A Payoff Plan move lowers D1. The metric moves because the planet level moved.

That last point is a hard rule: moons and scenario blocks write deltas to planet values or to the block layer. Only recipes compute metrics.

## A4. Forward map: every metric by tier

### Tier 1: Sketch (levels 1 to 3 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| Gap (monthly) (`gap`) | I1 - E1, after E3 strips out debt payments and saving | I1, E1, E3 |  | E6, E19 | savings rates, FI date, payoff time, the sun |
| Savings rate, potential (`savingsRatePotential`) | gap / I1 | I1, E1, E3 |  | E19, I20 | Dashboard headline, DRAFTT |
| Savings rate, actual (`savingsRateActual`) | A3 / I1 | A3, I1 |  | A8, I9 | Dashboard headline, FI date |
| Leak rate (`leakRate`) | (gap - A3) / I1 | I1, E1, E3, A3 | yes | E19, A8 | Expenses 18 levers, quick wins |
| Savings rate on gross (`savingsRateGross`) | A3 / (I2 / 12) | A3, I2 |  | I9, A8 | benchmark lenses (Money Guy uses gross) |
| FI number (`fiNumber`) | (E1 x 12) / withdrawal rate | E1, E3 |  | E6, E19, E28, T30 | percent to FI, FI date, Coast FI |
| Net worth (`netWorth`) | A1 - D1 | A1, D1 |  | A7, D7, A19, D19 | net worth statement, debt-to-assets |
| Debt-to-assets (`debtToAssets`) | D1 / A1 (0% when debt is none) | A1, D1 |  | A7, D7 | Leverage moon, resilience |
| Percent to FI (`pctToFI`) | invested part of A2 / fiNumber | A1, A2, E1, E3 |  | A7, E6 | milestone ladder, Y18 |
| FI date (`fiDate`) | years for invested A2 plus A3 per month to reach fiNumber at default real return, added to Y1 | Y1, A2, A3, E1, E3 |  | A13, I13, A14, E14 | everything. This is the number every lever moves |
| Coast FI target (`coastTarget`) | fiNumber / (1 + real return)^(Y3 - Y1) | Y1, Y3, E1, E3 |  | A13, E28 | percent to Coast, Y18 |
| Percent to Coast FI (`pctToCoast`) | invested part of A2 / coastTarget | Y1, Y3, E1, E3, A2 |  | A7 | milestone ladder |
| On track for your date (`targetDateGap`) | fiDate vs. Y3, in years | Y1, Y3, A2, A3, E1, E3 |  | I13, A14 | Y17 reality check, the sun |
| Debt payoff time, rough (`payoffTimeRough`) | D1 paid down at D2 per month with a default blended rate | D1, D2 |  | D5, D7, D13 | Payoff Plan moon |
| High-interest debt flag (`highInterestFlag`) | D3 > 0 | D3 |  | D7 | gates Card Rewards, Real Estate, Leverage moons. Drives order of operations |
| Debt payment rate (`minimumsRate`) | D2 / I1 | D2, I1 |  | D7 | fixed-cost rate, DTI |
| Shelter rate (`shelterRate`) | E2 / I1 | E2, I1 |  | D12, E19 | E17 shelter analysis, Real Estate moon |
| Implied tax rate (`impliedTaxRate`) | 1 - (I1 x 12 / I2) | I1, I2 | yes | I9, T19 | after-tax versions of every metric |
| State tax rate, rough (`stateRateRough`) | lookup on Y2 | Y2 |  | T9, T10 | T1 confirm |
| Income swing (`incomeVolatility`) | (high - low) / typical from I3 | I3 | yes | I12, I14 | emergency fund target, I16 stability |

### Tier 2: Basics (levels 4 to 6 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| True monthly spend (`trueMonthlySpend`) | E1 + E6 / 12 | E1, E3, E6 |  | E13, E19 | replaces E1 inside fiNumber, fiDate, bridge years |
| Runway months (`runwayMonths`) | cash that counts (A4) / E5 | A4, E5 | yes | A19, E24 | Safety Net moon, job-loss runway |
| Emergency fund target (`efTarget`) | E5 x months, where months defaults from I3 (steady 3, variable 6) | E5, I3 |  | I16, A18 | Safety Net moon, order of operations |
| Match capture rate (`matchCapture`) | percent of available match you get (I4) | I4 |  | I9, I26 | order of operations step 1 |
| Match left on the table (`matchLeft`) | I2 x uncaptured match percent, dollars per year | I4, I2 | yes | I9 | quick win, Main Path moon |
| Liquidity rate (`liquidityRate`) | assets reachable without penalty / total assets, using default tiers by account type | A2, A5, A6 | yes | A10, A11, A27 | bridge years, Mindy's middle-class-trap flag |
| Bridge years (`bridgeYears`) | reachable assets / (trueMonthlySpend x 12) | A2, A5, A6, E1, E6 | yes | A11, E28 | bridge number, drawdown plan |
| Must-pay rate, rough (`mustPayRate`) | (E2 + D2) / I1 | E2, D2, I1 | yes | E7, E10 | fixed-cost rate at Tier 4 |
| FAT and wants shares (`fatShares`) | each E4 bucket / I1 | E4, I1 |  | E9, E19 | DRAFTT scorecard first pass |
| Next slot for your money, first pass (`slotFirst`) | walk the order of operations using D3, I4, A4 vs efTarget, A5, I6, T5 | D3, I4, A4, E5, A5, I6, T5 | yes | A8, A16 | Main Path moon, next-3 card |
| Credit band (`creditBand`) | D6 | D6 |  | D20, D21 | Card Rewards, Credit Building, Real Estate moons, FHA capacity |
| Tax-advantaged accounts used (`accountsUsed`) | accounts held (A5) vs. accounts offered (I6) | A5, I6, T5 | yes | A8 | Tax Strategy moon, slot |
| Debt payoff time with extra (`payoffTimeExtra`) | payoffTimeRough re-run with D5 | D1, D2, D5 |  | D7, D13 | Payoff Plan moon |
| Home equity, rough (`homeEquity`) | A6 home value - mortgage balance in D4 | A6, D4 | yes | A21, D12 | liquidity rate, Real Estate moon |
| Household mode (`householdMode`) | Y5: solo, partnered shared, partnered separate | Y5 |  | Y7, E12 | which levels exist, per-person vs. combined metrics |

### Tier 3: Breakdown (levels 7 to 9 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| Needs / wants / investing (`nwi`) | needs = E2 + needs lines in E7, E8, groceries in E9. Wants = rest of E9. Investing = A3. Each over I1 | E2, E4, E7, E8, E9, A3, I1 |  | E10, E19, E20 | E16 read, DRAFTT scorecard |
| DRAFTT scorecard (`draftt`) | each share of take-home against the selected benchmark band | E2, E4, E7, E8, E9, A3, D2, I1 |  | E19 | Dashboard, E16 |
| Net worth statement (`nwStatement`) | sum of A7 + A9 + A6 minus each debt in D7 and D9 | A6, A7, A9, D7, D9 |  | A19, D19, A21 | replaces A1 and D1 everywhere |
| Income by source (`incomeBySource`) | each I7 and I8 line / total | I7, I8 |  | I19, I21 | concentration, stability, Side Hustles moon |
| Taxable income (`taxableIncome`) | I2 - pretax lines from I9 - standard deduction by T4 | I2, I9, T4 |  | T12, T19 | marginal bracket, Roth vs. traditional |
| Projected refund or owed (`refundOwed`) | annualized withholding (I9) - estimated tax on taxableIncome, incl. T9 | I2, I9, T4, T9, Y2 | yes | T19, T20 | quick win: fix withholding |
| True savings rate (`trueSavingsRate`) | (A8 contributions + pretax saving on I9 + match from I4) / gross | A8, I9, I4, I2 |  | A14 | replaces savingsRateActual |
| Weighted debt rate (`weightedDebtRate`) | sum(balance x rate) / sum(balance) over D7 | D7 |  | D19 | invest-vs-pay-off line |
| Interest paid per month (`interestPerMonth`) | sum(balance x rate / 12) over D7 | D7, D8 | yes | D19 | Payoff Plan moon, quick wins |
| Retirement contribution rate (`retContribRate`) | 401k and similar lines on I9 / gross per check | I9 | yes | A14 | match capture check, slot |
| Recurring bills total (`recurringTotal`) | sum of E7 | E7 |  | E19 | fixed-cost rate, Deals moon |
| Transportation rate (`transportRate`) | E8 / I1 | E8, I1 |  | E19 | E18 levers |
| Promo rate cliff (`promoCliff`) | balance x new rate after each D8 end date | D7, D8 | yes | D19 | Payoff Plan moon alert |

### Tier 4: Terms (levels 10 to 12 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| After-tax net worth (`afterTaxNW`) | each account in A7 haircut by its A10 tax type at T10, minus debts | A7, A10, T10, D7 |  | A19, A26, T30 | real FI progress |
| Liquidity rate, confirmed (`liquiditySharp`) | same formula, with the user's A10 and A11 tags replacing defaults | A7, A10, A11 |  | A27 | bridge number |
| Bridge number (`bridgeNumber`) | trueMonthlySpend x 12 x (59.5 - Y3), compared to reachable assets | Y3, E1, E6, A7, A11 |  | E28, A27, T29 | Mindy flag, drawdown plan |
| Payoff plan with dates (`payoffPlan`) | avalanche and snowball schedules over D7 with D5, honoring D8 and D10 | D7, D8, D10, D5 |  | D13, D19 | D16 read, debt-free date |
| Marginal bracket (`marginalBracket`) | federal and state bracket on taxableIncome | I2, I9, T4, Y2, T9, T12 |  | T19 | Roth vs. traditional, tax-if-sold, harvesting |
| Bare-bones and Lean FI number (`leanFi`) | fixed and essential lines (E10) x 12 / withdrawal rate | E7, E8, E9, E10 |  | E24, E19 | milestone ladder, efTarget check |
| Fixed-cost rate (`fixedCostRate`) | all lines flagged fixed in E10 + D2 / I1 | E10, D2, I1 |  | E19 | resilience, job-loss runway |
| Cash drag (`cashDrag`) | sum over cash accounts of balance x (benchmark rate - A12) | A7, A12 | yes | A19 | quick win: move the cash |
| Real hourly wage, first pass (`hourlyFirst`) | I1 / (hours + commute from I11), net of work costs | I1, I11 | yes | I18 | time toggle (hours costed) across rooms |
| Self-employment tax exposure (`seTaxFlag`) | 1099 or business income in I10 x SE rate | I7, I10 | yes | T14, T19 | Entrepreneurship moon, quarterly estimates |
| Insurance cost rate (`insuranceRate`) | sum of E11 / I1 | E11, I1 |  | E22 | Protection view |
| Coverage gap, first pass (`coverageGapFirst`) | Y11 source vs. Y4 work situation (for example on a parent's plan, age from Y1) | Y1, Y4, Y11 | yes | Y20, Y21, Y22 | Health moon |
| Housing debt load (`mortgageLoad`) | PITI + PMI from D12 / I1 | D12, I1 |  | D19 | shelter analysis, refinance check |
| Variable-rate share (`rateRisk`) | variable balances (D10) / total debt | D7, D10 | yes | D22 | Protect band |

### Tier 5: Flow (levels 13 to 15 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| FI date, projected (`fiDateProjected`) | fiDate re-run with raises (I13), contribution schedule (A14), allocation-based return (A13), costs ending or starting (E14), planned cash uses (A15), new debt (D14) | Y1, A7, A13, A14, A15, I13, E1, E6, E14, D14 |  | E19, A19, Y16 | the sun, scenario blocks |
| Sinking fund targets (`sinkingTargets`) | each E13 item / months until due | E13 |  | E21 | quick win: set up sinking funds |
| FI number by phase, first pass (`fiByPhaseFirst`) | trueMonthlySpend adjusted for each E14 start or end date | E1, E6, E14 |  | E28, E30 | fiDateProjected |
| This year's projected tax (`taxThisYear`) | tax on taxableIncome incl. I8 irregular income and T14 | I2, I8, I9, T4, T12, T14 |  | T19, T20 | withholding check |
| Next year's bracket (`nextYearBracket`) | marginalBracket re-run with Y13, I13, I15 changes | T10, Y13, I13, I15 | yes | T19 | T16 Roth vs. traditional |
| Lifestyle creep rate (`creepRate`) | E15 spending change vs. I14 income change | E15, I14 | yes | E21 | E18 levers, personal inflation |
| Income growth rate (`incomeGrowth`) | trend over I14, blended with Y12 field default | I14, Y12 |  | I19, I20 | fiDateProjected, I30 |
| Plan return assumption (`expectedReturn`) | blend of A13 allocation over default asset-class returns | A13 |  | A17, A20, Y16 | replaces the default return in every projection |
| Debt-free date (`debtFreeDate`) | payoffPlan re-run with D13 | D7, D13, D14 |  | D19, D29 | milestone ladder, D28 |
| Suggested scenario blocks (`eventBlocks`) | one block offered per Y13 event, Y14 move, A15 cash use, D14 new debt | Y13, Y14, A15, D14 | yes |  | Scenario Planner |
| Family money flows (`familyFlows`) | Y15 expected inflows and outflows, dated | Y15 |  | A29 | windfall plan, Family moon |

### Tier 6: Read (levels 16 to 18 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| Income stability score (`stability`) | from I3 swing, I7 source count, I10 types, I12 reliability, I14 history | I3, I7, I10, I12, I14 |  | I19, I21 | final efTarget months, Protect band |
| Emergency fund: target vs. actual (`efFinal`) | E5 x months from stability, vs. A4 | E5, A4, I16, A18 |  | E24, A19 | Safety Net moon settled state |
| Real hourly wage (`hourlyFinal`) | hourlyFirst confirmed at I18 with work costs | I1, I11, I18 |  | I20 | time toggle, Worth It reads |
| Top income levers (`incomeLevers`) | I17: ranked by FI-date change | I17, Y12, I14 |  | I27 | the sun |
| Top expense levers (`expenseLevers`) | E18: largest flexible lines (E10) ranked by FI-date change | E10, E16, E18 |  | E19 | the sun |
| Shelter analysis (`shelterRead`) | shelterRate vs. band, with roommate and house hack deltas | E2, I1, Y6, E17 |  | D12 | Real Estate moon, the sun |
| Next slot for your money (`slotFinal`) | slotFirst re-walked with A8, D7 rates, T10 bracket, confirmed at A16 | D7, I4, A4, A8, T10, A16, E5 |  | A14 | Main Path moon, next-3 card |
| Allocation read (`allocationRead`) | A13 vs. a glide path from Y1 and Y16 | A13, Y1, Y16, A17 |  | A20 | Portfolio Design moon |
| Payoff method chosen (`payoffChosen`) | D16 pick, with interest and months saved vs. the other method | D7, D16 |  | D19 | Payoff Plan moon active |
| Invest vs. pay off line (`flipRate`) | after-tax debt rate vs. expectedReturn adjusted by Y16 risk comfort | D7, A13, Y16, T10, D17 |  | D19 | slot, Leverage moon |
| Student loan path (`loanPath`) | IDR payment and PSLF fit from D11, D15, I2, Y5, Y4 | D11, D15, I2, Y4, Y5, D18 |  |  | Student Loan Decision room |
| Roth vs. traditional call (`rothCall`) | marginalBracket now vs. nextYearBracket and expected FI-phase rate | T10, T15, Y3, T16 |  | T19, T30 | Tax Strategy moon, slot |
| Credits you may be missing (`missedCredits`) | rules over T4, I2, Y5, Y8, Y10, A8, D7 student interest | T4, I2, Y5, Y8, Y10, A8, D7, T17 | yes | T19 | quick wins |
| HSA read (`hsaRead`) | eligibility from Y11 and I6, used-as-investment from A7 | Y11, I6, A7, T18 |  |  | Tax Strategy moon, Health moon |
| Triple D bands (`tripleD`) | best, likely, worst return and income paths, user's pick at Y16 | Y16 |  | A24 | every projection's give-or-take band |
| Required savings rate (`requiredRate`) | savings rate needed to hit Y3, confirmed or date moved at Y17 | Y1, Y3, A7, E1, E6, Y17 |  |  | the sun |
| Next milestone (`milestone`) | position on the ladder: Lean, Coast, Barista, FI, Fat. Pick at Y18 | Y18, A7, E10, Y9 |  |  | Dashboard, shareable milestone links |

### Tier 7: Verify (levels 19 to 21 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| Estimate vs. actual (`estVsActual`) | (E19 actual - E1 estimate) / E1 | E1, E19 | yes | E21 | tightens gap, fiNumber, fiDate bands |
| Certainty score (`certainty`) | share of Tier 1 inputs now verified: A19, D19, I19, I20, E19 | A19, D19, I19, I20, E19 | yes | E21, A20 | give-or-take band on every headline metric |
| Withholding check (`withholdingCheck`) | I20 year-to-date withholding annualized vs. tax from T19 pattern | I20, T19, T20 |  |  | quick win: W-4 |
| Effective tax rate, actual (`effectiveRate`) | total tax / AGI from T19 | T19 |  |  | replaces impliedTaxRate |
| Credit utilization (`utilization`) | sum of balances / sum of limits from D21 | D21 |  |  | Credit Building moon |
| Credit report check (`reportClean`) | accounts on D20 vs. debts in D7 and D9, errors flagged | D7, D9, D20 | yes |  | Credit Building moon |
| Spending seasonality (`seasonality`) | month-by-month shape of E21 | E21 |  |  | sinking funds, Money Calendar |
| Per-tag budgets vs. actuals (`tagBudgets`) | E20 | E20 |  | E21 | Budget room |
| Side income, actual net (`sideNet`) | E and hours from I21 | I21 |  |  | Side Hustles moon, hourly wage by source |
| Holdings look-through (`holdingsView`) | real allocation from A20 tickers | A20 |  | A25 | replaces A13 in expectedReturn |
| Key dates timeline (`keyDates`) | inflection ages from Y1, Y11, Y21 | Y1, Y11, Y21 | yes |  | coverage gap, bridge, Horizon band |
| Residency check (`residency`) | T21 | T21 |  |  | state tax accuracy |

### Tier 8: Protect (levels 22 to 24 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| Job-loss runway (`jobLossRunway`) | (A4 cash + I22 cushion) / (E24 bare-bones + D23 minimums-only) | A4, I22, E24, D23 |  |  | Between Jobs room, resilience |
| Bad-year cost (`badYear`) | E22 out-of-pocket max + E23 shock costs | E22, E23 |  |  | efFinal check, Health moon |
| What a 30% drop does (`sequenceRead`) | fiDateProjected re-run with a drop now and at the FI date (A24) | A7, A13, A24, Y16 |  |  | Triple D, allocation read |
| Concentration flags (`concentration`) | I24 income share from one payer. A22 share in one position | I24, A22 |  | A20 | Protect view |
| Rate-shock payment (`rateShock`) | D22: payment on variable debt at +2 points | D10, D22 |  |  | Payoff Plan moon |
| Coverage gaps (`coverageGaps`) | Y22 held vs. needs implied by Y23 dependents, I23 disability, A7 assets | Y22, Y23, I23, A7 | yes |  | Protection view, quick wins |
| Estate readiness (`estateReady`) | Y24 yes/no list + A23 beneficiaries | Y24, A23 |  |  | Estate Basics room |
| Underpayment safe harbor (`safeHarbor`) | T22 against taxThisYear | T13, T22 |  |  | quarterly estimates |
| Joint and co-signer exposure (`jointExposure`) | D24 balances not in your own total | D24 |  |  | Partner room |
| Resilience score (`resilience`) | composite of jobLossRunway, badYear vs. cash, coverageGaps, concentration, rateShock, fixedCostRate | A4, I22, E24, D23, E22, E23, Y22, I24, A22, D22, E10 | yes |  | Dashboard tile |

### Tier 9: Optimize (levels 25 to 27 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| Fee drag (`feeDrag`) | sum(balance x expense ratio) per year, and FI months lost | A7, A25 |  |  | quick win: swap the fund. Portfolio Design moon |
| Tax if sold (`taxIfSold`) | (value - A26 basis) x T25 gains rate, per holding | A20, A26, T25 |  |  | should-I-sell reads, Real Estate down payment |
| Harvesting room (`harvestRoom`) | 0% gains room from T25 and losses available from A26 | A26, T25, T26 |  |  | Tax Strategy moon |
| Mortgage and FHA capacity (`mortgageCapacity`) | DTI (D27) from D7 minimums and I2, with D6 band, Y25 status, A15 down payment | D7, I2, D6, D27, Y25, A15 |  |  | Real Estate moon, Housing Decision room |
| Refinance savings (`refiSavings`) | D25: payment and interest delta at current market rate for D6 band | D7, D6, D25 |  |  | quick win |
| Deductible interest (`deductInterest`) | D26 student and mortgage interest against T12 | D26, T12 |  |  | missedCredits |
| Total compensation (`totalComp`) | I2 + match + I26 benefit dollars + I25 vesting per year | I2, I4, I25, I26 |  |  | Career moon, Career Move room |
| Market pay gap (`marketGap`) | I27 market rate - I2 | I2, I27 | yes |  | Career moon: lifetime value of a raise |
| Bill-shopping savings (`billSavings`) | E25 candidates x typical savings | E25 | yes |  | Deals moon quick wins |
| Rewards value per year (`rewardsValue`) | E27 plus Card Rewards moon intake | E27 |  |  | Card Rewards moon |
| Worth-it read (`worthIt`) | top wants from E9: cost per use and hours of life (hourlyFinal) | E9, E26, I18 |  |  | Worth It room |
| Roth basis available (`ladderBasis`) | contributions from A27 | A27 |  |  | ladder plan, bridge final |
| Tax effect of a move (`moveTax`) | T27: current vs. destination (Y14) on taxableIncome | Y14, T7, T27 |  |  | Geo-Arbitrage moon |
| Side income capacity (`hustleCapacity`) | Y26 hours x hourlyFinal as a floor | Y26, I18 | yes |  | Side Hustles moon |

### Tier 10: Horizon (levels 28 to 30 and below)

| Metric (id) | How it is computed | Responsible levels | Derived | Sharpened by | Feeds |
|---|---|---|---|---|---|
| Real after-tax FI number (`realFiNumber`) | (E28 FI-phase spending + E29 healthcare) x 12, inflated by E30, grossed up by T30 withdrawal-phase rate, less I29 and I28 income floors | E28, E29, E30, T30, I28, I29 |  |  | replaces fiNumber everywhere |
| Bridge number, final (`bridgeFinal`) | bridgeNumber using E28 spending, A27 basis, T29 ladder, A30 order | Y3, E28, A11, A27, T29, A30 |  |  | Decumulation room |
| Drawdown plan (`drawdownPlan`) | A30 order by year with tax from T30 | A30, T30 |  |  | Decumulation room |
| Roth conversion ladder (`ladderPlan`) | T29: yearly conversion amounts filling low brackets | A10, A27, T29 |  |  | Tax Strategy moon |
| Subsidy cliff map (`subsidyCliff`) | T28: MAGI targets against E29 healthcare cost | E29, T28 |  |  | Health moon, drawdown plan |
| Social Security floor (`ssFloor`) | Y19 record projected with I30 earnings path, confirmed at I28 | Y19, I28, I30 |  |  | realFiNumber |
| Barista FI number (`baristaFi`) | realFiNumber recomputed with I29 part-time income | E28, I29 |  |  | milestone ladder |
| Debt-free vs. FI date (`debtVsFi`) | debtFreeDate vs. fiDateProjected, and what carries into FI (D28) | D28, D13 |  |  | the sun |
| Interest saved per extra dollar (`interestPerDollar`) | exact amortization from D29 | D29 |  |  | Payoff Plan moon |
| Leverage policy (`leveragePolicy`) | D30: the rate and purpose rules you set for future debt | D30, D17 |  |  | Leverage moon, Big Purchase room |
| Rental analysis (`rentalRead`) | A28: cap rate, cash-on-cash, and FI-date effect | A28 |  |  | Real Estate moon |
| Windfall plan (`windfallPlan`) | A29 allocation rules run through the order of operations | A29, Y15 |  |  | Windfall room |
| Plan horizon (`planHorizon`) | Y28 end age - FI age: years the money must last | Y28, Y3 |  |  | drawdown plan, withdrawal rate choice |
| FI number by phase, final (`fiByPhaseFinal`) | E30 | E28, E29, E30 |  |  | realFiNumber |
| Refresh health (`refresh`) | days since each planet's level 30 review, count of rough and stale numbers | Y30 | yes |  | Dashboard nag line, Upkeep |
## A5. Load-bearing levels

The levels that feed the most metrics. These get priority in the next-3 card, the most careful "where to find it" help, and the strongest rough-number nag. If one of these is rough, a lot of the shelf is rough.

- I1: feeds 18 metrics
- E1: feeds 16 metrics
- D7: feeds 15 metrics
- I2: feeds 13 metrics
- A7: feeds 12 metrics
- E3: feeds 10 metrics
- Y1: feeds 9 metrics
- Y3: feeds 8 metrics
- A3: feeds 7 metrics
- A2: feeds 6 metrics
- D2: feeds 6 metrics
- E6: feeds 6 metrics
## A6. Levels that feed something other than a metric

Every level must pay off. These pay off through a confirm, a gate, a room, or a moon instead of a recipe.

| Level | What it does |
|---|---|
| Y27 | Flexibility answers gate the Geo-Arbitrage and Real Estate moons and the roommate and house hack options in E17 |
| Y29 | A week in FI prefills E28 (spending in FI) and links to Designed Week |
| I5 | Paydays drive the Money Calendar and sinking fund timing |
| T1 | Confirms stateRateRough. Turns it from default to confirmed |
| T2 | Confirms impliedTaxRate, with a plain note that pretax deductions make it look higher than it is until I9 |
| T3 | Sanity check against refundOwed at Tier 3. A big gap between the two raises a "look at your W-4" quick win |
| T6 | Gate. Self-employment yes adds T14, T24, the Entrepreneurship moon, and SE rules in T11 |
| T8 | Confirms the withholding lines read from I9 |
| T11 | Confirms seTaxFlag and which rules apply |
| T23, T24 | Records levels. Pay off as Power: they make harvesting, the ladder, and an audit survivable. Feed estateReady's "someone can find things" |

## A7. Cross-planet prefills (no fact typed twice)

The source is always in the same or a lower band than the level it fills.

| Filled level | Source | Note |
|---|---|---|
| T1 | Y2 | state |
| T5 | A5, I6 | accounts held vs. offered |
| T7, T8 | I9 | the pay stub is read once |
| T11 | I10 | income types |
| T15 | Y13, I13, I15 | known changes |
| T27 | Y14 | planned move |
| T26 | A26 | basis |
| T29 | A27 | Roth basis |
| A4 | A2, A5 | which cash exists, user only picks what counts |
| A18 | E5, I16 | target months |
| A10, A11 | defaults from A5 account types | user confirms or corrects |
| E3 | D2, A3 | offers "is this $X of debt payments and $Y of saving inside your total?" |
| E28 | Y29, E10 | which lines drop or rise in FI |
| E24 | E10, E7 | bare-bones rebuilt from flagged lines |
| D4 mortgage, A6 home | each other | one home, two sides |
| D26 | D7, D12 | interest paid |
| I28 | Y19 | SSA record |
| Y17 | fiDate, Y3 | the reality check is computed, user only decides |
| Y21 | Y1, Y11 | inflection ages |

## A8. Moon gates (what each moon reads)

Moons read levels and metrics. They write only to planet values (through a level edit the user confirms) or to the scenario block layer.

| Moon | Planet | Opens when | Dim while | Reads | Writes to |
|---|---|---|---|---|---|
| Main Path | Assets | A1 to A3 and I4 exist | never | slotFirst, slotFinal, matchLeft, highInterestFlag, efTarget | A8, A14 (contribution changes) |
| Safety Net | Assets | A4 and E5 | never | runwayMonths, efTarget, cashDrag | A7 cash lines, A12 |
| Portfolio Design | Assets | A13 | Main Path has not reached the investing step | allocationRead, feeDrag, holdingsView | A13, A20 |
| Real Estate | Assets | Y25 intent or A6 home | highInterestFlag is on | shelterRead, mortgageCapacity, liquiditySharp, rentalRead | scenario block (home), A28 |
| Alternatives | Assets | A9 shows any, or Main Path settled | otherwise | concentration, pctToFI | A9 |
| Payoff Plan | Debt & Credit | D1 above zero (full at D7) | never. Outgrown at debt-free | payoffPlan, interestPerMonth, promoCliff, flipRate | D5, D13 |
| Credit Building | Debt & Credit | always | never. Outgrown at excellent band with no loan planned | creditBand, utilization, reportClean | D6, D21 |
| Leverage | Debt & Credit | D17 read done and no high-interest debt | otherwise | flipRate, debtToAssets, rateShock | scenario blocks, D30 |
| Career | Income | I1 to I3 | never | incomeGrowth, marketGap, totalComp, incomeLevers | I13, scenario block (job change) |
| Side Hustles | Income | I1 and Y26 hours | E5 unknown | hustleCapacity, hourlyFinal, sideNet | I7, I8 |
| Entrepreneurship | Income | I10 shows business or 1099, or user asks | runwayMonths under 3 | seTaxFlag, stability, safeHarbor | I7, T14 |
| Deals & Smart Buying | Expenses | E4 | never | expenseLevers, billSavings, recurringTotal | E7, E25 |
| Card Rewards | Expenses | no high-interest balance, creditBand good or better, E4 in | carrying a balance ("rewards pay about 2%, your card costs about 24%") | rewardsValue, fatShares, utilization | E27 |
| Tax Strategy | Taxes | T10 | never | marginalBracket, rothCall, missedCredits, hsaRead, harvestRoom, ladderPlan | A8 account choice, T16 |
| Geo-Arbitrage | You | Y14 or Y27 shows openness | never | moveTax, shelterRate, fiDateProjected by location | scenario block (geo) |
| Family & Generational | You | Y5, Y8, or Y15 shows family | never | familyFlows, coverageGaps, estateReady | scenario blocks (kid, marriage), Y15 |
| Health & Longevity | You | always | never | coverageGapFirst, badYear, hsaRead, subsidyCliff | Y11, Y22, E29 |

## A9. What the sun reads

The sun (decisions) never takes input of its own. It reads: gap, leakRate, fiDate or fiDateProjected, targetDateGap, requiredRate, incomeLevers, expenseLevers, shelterRead, flipRate, slotFinal, and every lever added by a Power level. It is partially lit at Tier 1 (cut, earn, or move the date, with rough impact), fully lit at Tier 6 (levers ranked by FI-date change with give-or-take bands). Choosing a lever creates a scenario block. It never edits a fact.

## A10. Reverse map: every level and what it touches

Use this to build the "connects" field on each level card and the "this number feeds" line under each field.

### You

| Level | Computes | Sharpens |
|---|---|---|
| Y1 | fiDate, coastTarget, pctToCoast, targetDateGap, coverageGapFirst, fiDateProjected, allocationRead, requiredRate, keyDates |  |
| Y2 | stateRateRough, refundOwed, marginalBracket |  |
| Y3 | coastTarget, pctToCoast, targetDateGap, bridgeNumber, rothCall, requiredRate, bridgeFinal, planHorizon |  |
| Y4 | coverageGapFirst, loanPath |  |
| Y5 | householdMode, loanPath, missedCredits |  |
| Y6 | shelterRead |  |
| Y7 | (prefill, gate, or moon input only) | householdMode |
| Y8 | missedCredits |  |
| Y9 | milestone |  |
| Y10 | missedCredits |  |
| Y11 | coverageGapFirst, hsaRead, keyDates |  |
| Y12 | incomeGrowth, incomeLevers |  |
| Y13 | nextYearBracket, eventBlocks |  |
| Y14 | eventBlocks, moveTax |  |
| Y15 | familyFlows, windfallPlan |  |
| Y16 | allocationRead, flipRate, tripleD, sequenceRead | fiDateProjected, expectedReturn |
| Y17 | requiredRate |  |
| Y18 | milestone |  |
| Y19 | ssFloor |  |
| Y20 | (prefill, gate, or moon input only) | coverageGapFirst |
| Y21 | keyDates | coverageGapFirst |
| Y22 | coverageGaps, resilience | coverageGapFirst |
| Y23 | coverageGaps |  |
| Y24 | estateReady |  |
| Y25 | mortgageCapacity |  |
| Y26 | hustleCapacity |  |
| Y27 | (prefill, gate, or moon input only) |  |
| Y28 | planHorizon |  |
| Y29 | (prefill, gate, or moon input only) |  |
| Y30 | refresh |  |

### Income

| Level | Computes | Sharpens |
|---|---|---|
| I1 | gap, savingsRatePotential, savingsRateActual, leakRate, minimumsRate, shelterRate, impliedTaxRate, mustPayRate, fatShares, nwi, draftt, transportRate, fixedCostRate, hourlyFirst, insuranceRate, mortgageLoad, hourlyFinal, shelterRead |  |
| I2 | savingsRateGross, impliedTaxRate, matchLeft, taxableIncome, refundOwed, trueSavingsRate, marginalBracket, taxThisYear, loanPath, missedCredits, mortgageCapacity, totalComp, marketGap |  |
| I3 | incomeVolatility, efTarget, stability |  |
| I4 | matchCapture, matchLeft, slotFirst, trueSavingsRate, slotFinal, totalComp |  |
| I5 | (prefill, gate, or moon input only) |  |
| I6 | slotFirst, accountsUsed, hsaRead |  |
| I7 | incomeBySource, seTaxFlag, stability |  |
| I8 | incomeBySource, taxThisYear |  |
| I9 | taxableIncome, refundOwed, trueSavingsRate, retContribRate, marginalBracket, taxThisYear | savingsRateActual, savingsRateGross, impliedTaxRate, matchCapture, matchLeft |
| I10 | seTaxFlag, stability |  |
| I11 | hourlyFirst, hourlyFinal |  |
| I12 | stability | incomeVolatility |
| I13 | fiDateProjected, nextYearBracket | fiDate, targetDateGap |
| I14 | creepRate, incomeGrowth, stability, incomeLevers | incomeVolatility |
| I15 | nextYearBracket |  |
| I16 | efFinal | efTarget |
| I17 | incomeLevers |  |
| I18 | hourlyFinal, worthIt, hustleCapacity | hourlyFirst |
| I19 | certainty | incomeBySource, incomeGrowth, stability |
| I20 | certainty, withholdingCheck | savingsRatePotential, incomeGrowth, hourlyFinal |
| I21 | sideNet | incomeBySource, stability |
| I22 | jobLossRunway, resilience |  |
| I23 | coverageGaps |  |
| I24 | concentration, resilience |  |
| I25 | totalComp |  |
| I26 | totalComp | matchCapture |
| I27 | marketGap | incomeLevers |
| I28 | realFiNumber, ssFloor |  |
| I29 | realFiNumber, baristaFi |  |
| I30 | ssFloor |  |

### Expenses

| Level | Computes | Sharpens |
|---|---|---|
| E1 | gap, savingsRatePotential, leakRate, fiNumber, pctToFI, fiDate, coastTarget, pctToCoast, targetDateGap, trueMonthlySpend, bridgeYears, bridgeNumber, fiDateProjected, fiByPhaseFirst, requiredRate, estVsActual |  |
| E2 | shelterRate, mustPayRate, nwi, draftt, shelterRead |  |
| E3 | gap, savingsRatePotential, leakRate, fiNumber, pctToFI, fiDate, coastTarget, pctToCoast, targetDateGap, trueMonthlySpend |  |
| E4 | fatShares, nwi, draftt |  |
| E5 | runwayMonths, efTarget, slotFirst, efFinal, slotFinal |  |
| E6 | trueMonthlySpend, bridgeYears, bridgeNumber, fiDateProjected, fiByPhaseFirst, requiredRate | gap, fiNumber, pctToFI |
| E7 | nwi, draftt, recurringTotal, leanFi | mustPayRate |
| E8 | nwi, draftt, transportRate, leanFi |  |
| E9 | nwi, draftt, leanFi, worthIt | fatShares |
| E10 | leanFi, fixedCostRate, expenseLevers, milestone, resilience | mustPayRate, nwi |
| E11 | insuranceRate |  |
| E12 | (prefill, gate, or moon input only) | householdMode |
| E13 | sinkingTargets | trueMonthlySpend |
| E14 | fiDateProjected, fiByPhaseFirst | fiDate |
| E15 | creepRate |  |
| E16 | expenseLevers |  |
| E17 | shelterRead |  |
| E18 | expenseLevers |  |
| E19 | estVsActual, certainty | gap, savingsRatePotential, leakRate, fiNumber, shelterRate, trueMonthlySpend, fatShares, nwi, draftt, recurringTotal, transportRate, leanFi, fixedCostRate, fiDateProjected, expenseLevers |
| E20 | tagBudgets | nwi |
| E21 | seasonality | sinkingTargets, creepRate, estVsActual, certainty, tagBudgets |
| E22 | badYear, resilience | insuranceRate |
| E23 | badYear, resilience |  |
| E24 | jobLossRunway, resilience | runwayMonths, leanFi, efFinal |
| E25 | billSavings |  |
| E26 | worthIt |  |
| E27 | rewardsValue |  |
| E28 | realFiNumber, bridgeFinal, baristaFi, fiByPhaseFinal | fiNumber, coastTarget, bridgeYears, bridgeNumber, fiByPhaseFirst |
| E29 | realFiNumber, subsidyCliff, fiByPhaseFinal |  |
| E30 | realFiNumber, fiByPhaseFinal | fiByPhaseFirst |

### Assets

| Level | Computes | Sharpens |
|---|---|---|
| A1 | netWorth, debtToAssets, pctToFI |  |
| A2 | pctToFI, fiDate, pctToCoast, targetDateGap, liquidityRate, bridgeYears |  |
| A3 | savingsRateActual, leakRate, savingsRateGross, fiDate, targetDateGap, nwi, draftt |  |
| A4 | runwayMonths, slotFirst, efFinal, slotFinal, jobLossRunway, resilience |  |
| A5 | liquidityRate, bridgeYears, slotFirst, accountsUsed |  |
| A6 | liquidityRate, bridgeYears, homeEquity, nwStatement |  |
| A7 | nwStatement, afterTaxNW, liquiditySharp, bridgeNumber, cashDrag, fiDateProjected, hsaRead, requiredRate, milestone, sequenceRead, coverageGaps, feeDrag | netWorth, debtToAssets, pctToFI, pctToCoast |
| A8 | trueSavingsRate, slotFinal, missedCredits | savingsRateActual, leakRate, savingsRateGross, slotFirst, accountsUsed |
| A9 | nwStatement |  |
| A10 | afterTaxNW, liquiditySharp, ladderPlan | liquidityRate |
| A11 | liquiditySharp, bridgeNumber, bridgeFinal | liquidityRate, bridgeYears |
| A12 | cashDrag |  |
| A13 | fiDateProjected, expectedReturn, allocationRead, flipRate, sequenceRead | fiDate, coastTarget |
| A14 | fiDateProjected | fiDate, targetDateGap, trueSavingsRate, retContribRate, slotFinal |
| A15 | fiDateProjected, eventBlocks, mortgageCapacity |  |
| A16 | slotFinal | slotFirst |
| A17 | allocationRead | expectedReturn |
| A18 | efFinal | efTarget |
| A19 | certainty | netWorth, runwayMonths, nwStatement, afterTaxNW, cashDrag, fiDateProjected, efFinal |
| A20 | holdingsView, taxIfSold | expectedReturn, allocationRead, certainty, concentration |
| A21 | (prefill, gate, or moon input only) | homeEquity, nwStatement |
| A22 | concentration, resilience |  |
| A23 | estateReady |  |
| A24 | sequenceRead | tripleD |
| A25 | feeDrag | holdingsView |
| A26 | taxIfSold, harvestRoom | afterTaxNW |
| A27 | ladderBasis, bridgeFinal, ladderPlan | liquidityRate, liquiditySharp, bridgeNumber |
| A28 | rentalRead |  |
| A29 | windfallPlan | familyFlows |
| A30 | bridgeFinal, drawdownPlan |  |

### Debt & Credit

| Level | Computes | Sharpens |
|---|---|---|
| D1 | netWorth, debtToAssets, payoffTimeRough, payoffTimeExtra |  |
| D2 | payoffTimeRough, minimumsRate, mustPayRate, payoffTimeExtra, draftt, fixedCostRate |  |
| D3 | highInterestFlag, slotFirst |  |
| D4 | homeEquity |  |
| D5 | payoffTimeExtra, payoffPlan | payoffTimeRough |
| D6 | creditBand, mortgageCapacity, refiSavings |  |
| D7 | nwStatement, weightedDebtRate, interestPerMonth, promoCliff, afterTaxNW, payoffPlan, rateRisk, debtFreeDate, slotFinal, payoffChosen, flipRate, missedCredits, reportClean, mortgageCapacity, refiSavings | netWorth, debtToAssets, payoffTimeRough, highInterestFlag, minimumsRate, payoffTimeExtra |
| D8 | interestPerMonth, promoCliff, payoffPlan |  |
| D9 | nwStatement, reportClean |  |
| D10 | payoffPlan, rateRisk, rateShock |  |
| D11 | loanPath |  |
| D12 | mortgageLoad | shelterRate, homeEquity, shelterRead |
| D13 | debtFreeDate, debtVsFi | payoffTimeRough, payoffTimeExtra, payoffPlan |
| D14 | fiDateProjected, debtFreeDate, eventBlocks |  |
| D15 | loanPath |  |
| D16 | payoffChosen |  |
| D17 | flipRate, leveragePolicy |  |
| D18 | loanPath |  |
| D19 | certainty | netWorth, nwStatement, weightedDebtRate, interestPerMonth, promoCliff, payoffPlan, mortgageLoad, debtFreeDate, payoffChosen, flipRate |
| D20 | reportClean | creditBand |
| D21 | utilization | creditBand |
| D22 | rateShock, resilience | rateRisk |
| D23 | jobLossRunway, resilience |  |
| D24 | jointExposure |  |
| D25 | refiSavings |  |
| D26 | deductInterest |  |
| D27 | mortgageCapacity |  |
| D28 | debtVsFi |  |
| D29 | interestPerDollar | debtFreeDate |
| D30 | leveragePolicy |  |

### Taxes

| Level | Computes | Sharpens |
|---|---|---|
| T1 | (prefill, gate, or moon input only) |  |
| T2 | (prefill, gate, or moon input only) |  |
| T3 | (prefill, gate, or moon input only) |  |
| T4 | taxableIncome, refundOwed, marginalBracket, taxThisYear, missedCredits |  |
| T5 | slotFirst, accountsUsed |  |
| T6 | (prefill, gate, or moon input only) |  |
| T7 | moveTax |  |
| T8 | (prefill, gate, or moon input only) |  |
| T9 | refundOwed, marginalBracket | stateRateRough |
| T10 | afterTaxNW, nextYearBracket, slotFinal, flipRate, rothCall | stateRateRough |
| T11 | (prefill, gate, or moon input only) |  |
| T12 | marginalBracket, taxThisYear, deductInterest | taxableIncome |
| T13 | safeHarbor |  |
| T14 | taxThisYear | seTaxFlag |
| T15 | rothCall |  |
| T16 | rothCall |  |
| T17 | missedCredits |  |
| T18 | hsaRead |  |
| T19 | withholdingCheck, effectiveRate | impliedTaxRate, taxableIncome, refundOwed, marginalBracket, seTaxFlag, taxThisYear, nextYearBracket, rothCall, missedCredits |
| T20 | withholdingCheck | refundOwed, taxThisYear |
| T21 | residency |  |
| T22 | safeHarbor |  |
| T23 | (prefill, gate, or moon input only) |  |
| T24 | (prefill, gate, or moon input only) |  |
| T25 | taxIfSold, harvestRoom |  |
| T26 | harvestRoom |  |
| T27 | moveTax |  |
| T28 | subsidyCliff |  |
| T29 | bridgeFinal, ladderPlan | bridgeNumber |
| T30 | realFiNumber, drawdownPlan | fiNumber, afterTaxNW, rothCall |

---

# PART 3: THE SKY (how the app looks and moves)

Reference mood: an engineered solar system diagram. A sun in the corner, clean concentric orbits sweeping across a dark field, small detailed planets riding the rings, a soft green "habitable zone" band. Borrow the composition and calm, not the artwork. Everything is drawn in SVG by the app. No external images.

## B1. The idea in one paragraph

The Sky is the Ledger's home screen and the map of the whole app. Ten orbits are the ten bands. Six planets are the six areas. Each planet rides the orbit of the band it is currently working on, so it starts on the innermost ring and moves outward as it levels. One glance shows both views of progress at once: how far out each planet has traveled (planet view) and which rings every planet has cleared (round view). Lopsidedness is visible without a word of nagging: Assets far out on ring 7 while Expenses sits on ring 1. You only ever see six planets in the Sky. Moons appear when you go into a planet.

## B2. Layout

Phone (primary, 380px wide, portrait):
- The sun sits in the bottom-left corner, about 110px radius, mostly off-screen so only a warm quarter shows.
- Ten orbit arcs sweep from the left edge up and over to the bottom edge, evenly spaced, filling the screen up to a slim header. Quarter-circle composition. This gives ten readable rings on a small screen, which a full circle cannot.
- Each planet has a home angle on the quarter arc so labels never collide: six angles spread evenly between about 12 and 78 degrees. Order from top to bottom: You, Income, Expenses, Assets, Debt & Credit, Taxes. The planet keeps its angle for life and only changes ring. Its path outward is a straight spoke.
- Header: app name left, "Metrics 14 of 184" chip right. Below the header, one line of status text: "Ring 2 of 10 cleared. Expenses is holding up ring 3."
- Bottom nav, four items: Home (the pilot dashboard), Sky, Metrics, Rooms. Global undo and redo live in the header overflow.

Desktop and tablet:
- Full circle, sun in the center, six spokes at 60 degree intervals. A right-hand panel (360px) shows the selected planet's view so the Sky stays visible. Same data, same components.

## B3. Orbits (bands)

- Each orbit is a thin line, 1px, low-contrast against the field. Its band name sits on the arc in small caps at the far end: Sketch, Basics, Breakdown, Terms, Flow, Read, Verify, Protect, Optimize, Horizon.
- Cleared ring (all six planets have finished that band, shrunken planets count): the line turns gold and gains a soft glow. The tier number appears beside the band name with a small check. This is the round-complete moment, celebrated once with a slow pulse traveling around the ring and the unlock cards for that tier.
- The habitable zone: a soft green translucent band lying behind rings 1 to 3, labeled "Already good." It carries the promise that a user who stops at Breakdown has a real, finished-feeling product. Never label anything beyond it as "incomplete."
- Motion: alternate rings drift in opposite directions as a gentle sway, a few degrees over about 40 seconds, so the system feels alive without planets ever leaving the screen or their labels. Honors prefers-reduced-motion by holding still.

## B4. Planets

- Size: all six the same, about 34px on phone. Size never encodes wealth or debt. Nobody's Debt planet looms.
- Identity: each planet has its own hue and surface pattern, plus an always-visible text label and level ("Assets 14"). Never rely on color alone.
- Progress inside the current band: a three-segment ring around the planet. Segments fill as the band's levels complete.
- Certainty shows as atmosphere. A planet whose current values are mostly rough has a hazy, soft-edged look and a dashed segment ring. As numbers are verified the edge turns crisp and the surface gains detail. Sharp planets look sharper. This is the power-and-certainty pitch made visible.
- Trail: on every ring a planet has already cleared, a small lit dot stays on its spoke. The trail matches the pen-and-paper sketch: the same six points repeated on each ring, filled from the inside out.
- Not started: the planet sits on ring 1 as a faint outline with the label "not yet." Never red, never an exclamation mark.
- None: a planet completed by "none" (no debt) shows a small laurel and its earned badge. On Debt & Credit the planet keeps traveling for the credit levels.
- Next-thing marker: the planet holding the #1 item on the next-3 card has a slow breathing halo. Only one planet breathes at a time.
- Tap a planet: the camera pushes in. The other planets and the orbits slide away, the chosen planet grows to the top third of the screen, and its moons swing into view around it. 350ms, ease-out. Back reverses it.

## B5. The sun

- Warm gold, the only warm-bright object in the Sky. Its brightness tracks how lit the decision layer is: a dim ember before Tier 1, a steady glow after Tier 1, full with visible rays after Tier 6. Each Power level that adds a lever adds a ray.
- Tap the sun: the decision screen. One question at the top ("Are you on route, or what would you rather change?"), then lever cards ranked by FI-date change, each with its give-or-take. Choosing one opens "Add this as a block."

## B6. Planet view

Top third: the planet, large, with its moons in orbit around it.
- Moon states read at a glance. Dim: grey, low opacity, a small "not yet" tag. Open: outlined in the planet's hue. Active: filled, with a progress arc. Settled: filled with a thin ring. Outgrown: faded, with a small flag and the word "outgrown."
- Moons are labeled. Tapping a dim moon shows its one-sentence reason and an offer to collect the missing levels inline.

Middle: the band ladder. A vertical track of ten band chips, each holding three level dots. The current level is expanded as a card using the level card anatomy: prompt, the field itself (inline entry), "where to find it" with the first-15-minutes step, minutes, tier badge (S, A, B, C), payoff line ("Reveal: unlocks runway months"), and the three buttons: Enter, "Roughly for now," "Don't know." Levels above the current one can be opened in any order. Nothing is locked.

Bottom: "This planet feeds" chips. The metrics this planet is responsible for, each in its state color, built from the reverse map in A10 (Part 2). Tapping one opens the metric card.

## B7. Moon view

Header with the moon's name, its planet, and its state. First visit runs the 3 to 4 intake questions as a short form. After intake: the moves list. Each move card shows what, why, the first-15-minutes step, a checkpoint, and for quick wins a dollar figure ("about $310 a year"). Completing a move that changes a fact asks the user to confirm the edited planet level, with before and after. The "won so far" total updates.

## B8. Metrics tab (the shelf)

A grid of metric cards, two columns on phone, grouped by tier with the tier's band name as a section header. Core rates pinned at the top.
- Locked: outlined card, metric name, and the missing levels as tappable chips ("needs A5, E5").
- Rough: filled card, number shown with its give-or-take, dashed border, "rough" tag, and what would sharpen it.
- Sharp: solid border, crisp number, small check.
- Earned: gold card with the badge ("Debt free").
Counter at the top: "14 of 184 unlocked. 2 new since last time. 5 still rough." Filter chips: All, New, Rough, Locked, by planet.

Tapping any card opens the metric detail: the number, one sentence of meaning, the healthy band with the benchmark-source picker, "how this was computed" with every input linked to its level, what sharpens it, and what it feeds. Built straight from recipes.json.

## B9. The unlock card

When a metric first computes: a card rises from the bottom over a dimmed Sky. Metric name, the number counting up once, one sentence of meaning, the healthy band, and two buttons: "Nice" and "How was this computed?" One card at a time. After three in a row the rest queue into the "new since last time" strip. Derived metrics get a special line: "You never told us this. It came from what you entered about your accounts."

## B10. Dashboard strip

On Home, under the headline FI date: three compact tiles in a row. "Metrics 14 of 184" with a tiny ring, "2 new," and "Won so far $1,240 a year." Below it the next-3 card: one big #1, two smaller, always including one quick win once Tier 1 is lit.

## B11. Look and feel

- Field: deep navy, very subtle star speckle, no gradients that fight the text. Accent: gold. Planet hues: six distinct, colorblind-safe, mid-saturation. Green only for the habitable zone. Red is not in the palette anywhere.
- Type: one clean sans for UI, tabular figures for every number. Numbers are the heroes: large, high contrast, with the give-or-take set smaller and lighter beside them.
- Light mode: a pale paper field with ink-line orbits, same layout.
- Touch targets 44px minimum. Every Sky element has a text equivalent: a "List view" toggle in the header renders the same state as a plain table (planet, level, band, state, next level), which is also what screen readers get.
- Performance: inline SVG and CSS transforms only. No canvas or 3D library. The Sky must render in under 100ms on a mid-range phone and stay within the one-file-per-room convention.
- Benchmarks for polish: Rocket Money, YNAB, ProjectionLab. The Sky is the thing none of them have. Everything around it should feel as calm and finished as they do.

## B12. Gates for the visual build

- With six planets on six different rings, no two labels overlap at 380px.
- A first-time user sees six "not yet" planets on ring 1, a dim sun, the habitable zone, and one breathing halo. Nothing else asks for attention.
- Clearing band 1 plays exactly one ring celebration, then unlock cards, max three in a row.
- List view and Sky view always agree (same state object, snapshot-tested).
- prefers-reduced-motion removes sway, push-in, and count-up, and nothing becomes unreachable.
- No element in the Sky uses red, a warning icon, or the word "incomplete."

---

# PART 4: THE RATIO REGISTRY (every ratio, and every ratio each level is part of)

Ratios marked NEW are in addition to the metrics in Part 2. Add them to data/recipes.json under the same rules: tier equals the highest band among the inputs, linted.

## C1. Rules for ratios

- A ratio is a metric whose value is one quantity over another. Each side has owner levels. If the bottom is rough, the ratio is rough, no matter how sharp the top is.
- Every ratio card shows: the value, the plain-language reading ("you keep 31 cents of every dollar"), the top and bottom as tappable numbers, the band from the selected benchmark source, and its give-or-take.
- Ratios never show red. Outside a band reads "above the usual range" or "below the usual range," with the lever that moves it.
- A ratio with a zero or missing bottom never renders as N/A or infinity. It is locked (missing), or it is an earned state (for example debt ratios at no debt).
- Where a community benchmark exists it is a lens with a named source, switchable, and cited in data/benchmarks.json.

## C2. The denominators that carry the app

- I1: in 21 ratios (18 as the denominator)
- I2: in 15 ratios (15 as the denominator)
- E1: in 11 ratios (7 as the denominator)
- A1: in 9 ratios (6 as the denominator)
- E3: in 8 ratios (4 as the denominator)
- A2: in 7 ratios (1 as the denominator)
- A6: in 7 ratios (1 as the denominator)
- A7: in 7 ratios (5 as the denominator)
- D1: in 6 ratios (3 as the denominator)
- A3: in 5 ratios (0 as the denominator)
Reading: take-home (I1) sits underneath 18 ratios and gross pay (I2) underneath 15. If either is wrong, every share in the app is wrong. These two get the strongest "where to find it" help, the earliest Verify nudges (I19, I20), and a visible rough label until the pay stub (I9) is read. Spending (E1, cleaned by E3) is next: it is on top of the cost shares and underneath every FI-progress ratio.

## C3. Every ratio

| Ratio (id) | FIRE community name | Top (owner levels) | Bottom (owner levels) | Tier | Bands and lens notes | Lives |
|---|---|---|---|---|---|---|
| Savings rate, actual (`savingsRateActual`) | savings rate (net) | what you add per month (A3) | take-home (I1) | 1 Sketch | MMM table: 10% is about 51 working years, 25% about 32, 50% about 17, 75% about 7. FIRE community watches 20 / 50 / 70 | Dashboard headline, DRAFTT |
| Savings rate, potential (`savingsRatePotential`) | the gap rate | take-home minus clean spending (I1, E1, E3) | take-home (I1) | 1 Sketch | same bands as actual. The distance between the two is the leak | the sun |
| Savings rate on gross (`savingsRateGross`) | Money Guy savings rate | what you add per month (A3) | gross monthly pay (I2) | 1 Sketch | Money Guy lens: 25% of gross. Traditional advice: 15% | benchmark lens toggle |
| Leak rate (`leakRate`) | the missing money | potential saving minus actual saving (I1, E1, E3, A3) | take-home (I1) | 1 Sketch | under 5% is tight. Over 10% means the spending estimate is low or money is drifting | E18 levers, quick wins |
| Spend rate (`spendRate`) NEW | burn rate | clean monthly spending (E1, E3) | take-home (I1) | 1 Sketch | mirror of savings rate. Shown only in the expenses lens | Expenses planet |
| Freedom bought per month (`freedomPerMonth`) NEW | months of freedom per month worked | what you add per month (A3) | monthly spending (E1, E3) | 1 Sketch | at 50% savings rate this is 1.0: every month worked buys a month off | time toggle, share cards |
| Shelter rate (`shelterRate`) | housing ratio | shelter cost (E2) | take-home (I1) | 1 Sketch | common bands: under 25 to 30% of take-home. Money Guy lens: 25% of gross | E17, Real Estate moon |
| Front-end DTI (`frontEndDTI`) NEW | housing ratio (lender) | housing payment (E2) | gross monthly pay (I2) | 1 Sketch | conventional guideline 28%. FHA allows higher. Lender limits live in a dated data table | Housing Decision room |
| Back-end DTI, rough (`backEndDTI`) NEW | debt-to-income | housing payment + debt minimums (E2, D2) | gross monthly pay (I2) | 1 Sketch | conventional guideline 36%, many lenders to 43% and above. Confirmed version is D27 at Tier 9 | mortgage and FHA capacity |
| Debt payment rate (`minimumsRate`) | debt service ratio | total minimums (D2) | take-home (I1) | 1 Sketch | under 10% comfortable, over 20% is a drag on everything | fixed-cost rate |
| Must-pay rate (`mustPayRate`) |  | shelter + minimums (E2, D2) | take-home (I1) | 1 Sketch | first pass of the 50 in 50/30/20 | resilience |
| Income swing (`incomeVolatility`) |  | high month minus low month (I3) | typical month (I3) | 1 Sketch | under 10% steady. Over 30% needs a bigger cushion | efTarget |
| Implied tax rate (`impliedTaxRate`) |  | gross minus annualized take-home (I1, I2) | gross (I2) | 1 Sketch | looks high until the stub is read, because pretax saving hides in it | T2 |
| Refund share (`refundShare`) NEW |  | refund (T3) | rough total tax (I1, I2) | 1 Sketch | over 10% suggests a W-4 fix | T3 sanity check |
| Debt-to-assets (`debtToAssets`) | leverage ratio | total debt (D1) | total assets (A1) | 1 Sketch | 0% when debt is none. Over 50% is fragile outside a mortgage | Leverage moon |
| Net worth to income (`nwToIncome`) NEW | income multiple | net worth (A1, D1) | gross annual pay (I2) | 1 Sketch | age checkpoints (1x by 30, 3x by 40 style) live in the benchmark table. FIRE needs far more, far sooner | milestones |
| Wealth accumulation ratio (`pawRatio`) NEW | PAW / UAW, Millionaire Next Door | net worth (A1, D1) | age x gross income / 10 (Y1, I2) | 1 Sketch | 2.0 or more is a prodigious accumulator. Misfires for people in their 20s, so the app shows the Money Guy wealth-multiplier lens beside it | lens only |
| Invested share of assets (`investedShare`) |  | invested (A2) | total assets (A1) | 1 Sketch | cash does not compound. Over 80% once the emergency fund is full | percent to FI |
| Cash share (`cashShare`) |  | cash (A2) | total assets (A1) | 1 Sketch | target = emergency fund + dated cash uses, no more | cash drag |
| Percent to FI (`pctToFI`) | FI ratio, crossover progress (YMOYL) | invested assets (A2) | FI number (E1, E3) | 1 Sketch | 100% = FI at the chosen withdrawal rate | milestone ladder |
| Percent to Coast FI (`pctToCoast`) |  | invested assets (A2) | Coast FI target (Y1, Y3, E1, E3) | 1 Sketch | 100% = you could stop contributing today | milestone ladder |
| Current withdrawal rate (`currentWR`) NEW | what would I be pulling today | annual spending (E1, E3) | invested assets (A2) | 1 Sketch | FI when this falls to the chosen rate: 4% classic, 3.25 to 3.5% for very long retirements (Big ERN lens) | Dashboard, decumulation |
| Years of expenses saved (`yearsSaved`) NEW | FU money | cash + invested (A1) | annual spending (E1, E3) | 1 Sketch | 1 year is real breathing room. 25 is FI | milestones, shares |
| High-interest share of debt (`highInterestShare`) NEW |  | debt above about 8% (D3) | total debt (D1) | 1 Sketch | any amount gates rewards, real estate, and leverage moons | order of operations |
| Food share (`foodShare`) |  | food bucket (E4) | take-home (I1) | 2 Basics | one of the Big Three. 10 to 15% typical | Deals moon |
| Match capture rate (`matchCapture`) | free money rate | match received (I4) | match available (I4) | 2 Basics | 100% or it is the first move | Main Path step 1 |
| Home share of net worth (`homeShareNW`) NEW | house-rich ratio | home equity (A6, D4) | net worth (A1, D1) | 2 Basics | over 50% is house-rich. A factor in the middle-class trap | Real Estate moon |
| Locked share of net worth (`trapRatio`) NEW | the middle-class trap (BiggerPockets Money) | retirement accounts + home equity (A5, A6, D4) | net worth (A1, D1) | 2 Basics | over 80% with an early target date triggers the bridge conversation | bridge number |
| Loan-to-value (`ltv`) NEW | LTV | mortgage balance (D4) | home value (A6) | 2 Basics | 80% or under drops PMI on conventional loans | refinance check |
| Home price to income (`priceToIncome`) NEW |  | home value (A6) | gross annual pay (I2) | 2 Basics | 2.5x to 4x depending on the source | Housing Decision room |
| Vehicles to income (`carToIncome`) NEW |  | vehicle value (A6) | gross annual pay (I2) | 2 Basics | common FIRE rule of thumb: keep total vehicle value under half of annual income, less is better | Big Purchase room |
| Student debt to income (`studentToIncome`) NEW |  | student loan balance (D4) | gross annual pay (I2) | 2 Basics | rule of thumb: borrow no more than the first-year salary | Student Loan room |
| Runway months (`runwayMonths`) | emergency fund months | cash that counts (A4) | bare-bones month (E5) | 2 Basics | 3 to 6, more for variable income | Safety Net moon |
| Emergency fund coverage (`efCoverage`) NEW |  | cash that counts (A4) | emergency fund target (E5, I3) | 2 Basics | 100% = funded | Main Path step |
| Liquidity rate (`liquidityRate`) | accessible share | assets reachable without penalty (A2, A5, A6) | total assets (A1) | 2 Basics | no universal band. Read against years until 59.5 | bridge |
| Bridge years (`bridgeYears`) |  | reachable assets (A2, A5, A6) | annual spending (E1, E6) | 2 Basics | needs to cover target date to 59.5 | bridge |
| Payoff acceleration (`extraPayRate`) NEW |  | extra paid per month (D5) | total minimums (D2) | 2 Basics | no band. Shows how hard the payoff is being pushed | Payoff Plan moon |
| True savings rate (`trueSavingsRate`) | all-in savings rate | contributions by account + pretax saving on the stub + match (A8, I9, I4) | gross pay (I2) | 3 Breakdown | this is the version to compare against any published benchmark. Settings declare whether match and mortgage principal count | replaces actual once available |
| Giving rate (`givingRate`) NEW | tithing, maaser, generosity rate | giving line (E9) | take-home (I1) | 3 Breakdown | user-set target. No default band | Giving room |
| Needs share (`needsShare`) |  | needs lines (E2, E4, E7, E8, E9) | take-home (I1) | 3 Breakdown | 50/30/20: 50. DRAFTT bands by selected source | E16 |
| Wants share (`wantsShare`) | guilt-free spending (Sethi) | wants lines (E9) | take-home (I1) | 3 Breakdown | 50/30/20: 30. Sethi conscious spending: 20 to 35% | E16 |
| Transportation rate (`transportRate`) |  | full transportation cost (E8) | take-home (I1) | 3 Breakdown | one of the Big Three. 10 to 15% typical | E18 |
| Car payment rate (`carPaymentRate`) NEW | the 8 in 20/3/8 | car payment (E8) | gross monthly pay (I2) | 3 Breakdown | Money Guy 20/3/8 lens: 20% down, 3-year loan, payment under 8% of gross | Big Purchase room |
| Subscriptions and bills share (`recurringShare`) NEW |  | recurring bills (E7) | take-home (I1) | 3 Breakdown | no fixed band. Used for quick wins | Deals moon |
| Retirement contribution rate (`retContribRate`) | deferral rate | 401k and similar on the stub (I9) | gross per check (I9) | 3 Breakdown | traditional advice 15%. FIRE community: to the limit | slot |
| Contribution fill, per account (`contribFill`) NEW | maxed out percent | annual contributions to the account (A8) | annual limit for that account (dated table) | 3 Breakdown | 100% = maxed. Shown for 401k, IRA, HSA | Main Path, Tax Strategy moon |
| Side income share (`sideShare`) NEW |  | side and irregular income (I8) | total income (I7) | 3 Breakdown | no band. Feeds concentration and stability | Side Hustles moon |
| Withholding accuracy (`withholdAccuracy`) NEW |  | annualized withholding (I9) | projected tax (I2, I9, T4) | 3 Breakdown | 95 to 105% is the target. Big refund = interest-free loan | quick win: W-4 |
| Weighted debt rate (`weightedDebtRate`) |  | sum(balance x rate) (D7) | total debt (D7) | 3 Breakdown | compare to the flip rate at D17 | slot |
| Interest-to-income (`interestToIncome`) NEW |  | interest paid per month (D7, D8) | take-home (I1) | 3 Breakdown | every point here is pure loss. Quick-win fuel | Payoff Plan moon |
| Fixed-cost rate (`fixedCostRate`) | needs share | every line flagged fixed + minimums (E10, D2) | take-home (I1) | 4 Terms | 50/30/20 lens: needs at or under 50% | job-loss runway |
| Insurance cost rate (`insuranceRate`) |  | all premiums (E11) | take-home (I1) | 4 Terms | no fixed band. Flag if rising faster than income | Protection view |
| Roth share of contributions (`rothShare`) NEW |  | Roth contributions (A8, A10) | all retirement contributions (A8) | 4 Terms | depends on bracket. Read at T16 | Tax Strategy moon |
| Real-to-nominal wage ratio (`realWageRatio`) NEW | YMOYL real hourly wage | real hourly wage (after commute, costs, extra hours) (I1, I11) | nominal hourly wage (I2, I11) | 4 Terms | YMOYL lens. Most people land at 50 to 75% of nominal | time toggle |
| Bridge coverage (`bridgeCoverage`) NEW |  | reachable assets (A7, A11) | bridge number (Y3, E1, E6) | 4 Terms | 100% = the gap years are funded | Decumulation room |
| Tax bucket mix (`taxBucketMix`) NEW | tax diversification | balance in each of pretax / Roth / taxable / HSA (A7, A10) | total invested (A7) | 4 Terms | no single right mix. Early retirees need enough taxable and Roth basis to bridge | Tax Strategy moon |
| Cash drag rate (`cashDragRate`) |  | benchmark rate minus your rate (A12) | 1 | 4 Terms | any gap over 1 point on real cash is a quick win | Safety Net moon |
| Variable-rate share (`variableShare`) |  | variable balances (D10) | total debt (D7) | 4 Terms | over 25% gets a rate-shock read | Protect band |
| Raise capture rate (`raiseCapture`) NEW | anti-lifestyle-creep rate | 1 minus (spending change / income change) (E15, I14) | 1 | 5 Flow | Money Guy lens and others: save at least half of every raise | E18, Career moon |
| Lifestyle creep rate (`creepRate`) | lifestyle inflation | spending change (E15) | income change (I14) | 5 Flow | under 50% is healthy | E18 |
| Stock share (`stockShare`) NEW | equity allocation | stocks (A13) | total invested (A7) | 5 Flow | age and risk-comfort glide path at A17 | Portfolio Design moon |
| Savings rate vs. required (`requiredVsActual`) NEW | on-track ratio | actual savings rate (A3, I1) | required savings rate for your date (Y1, Y3, A7, E1, E6, Y17) | 6 Read | 100% = on route | the sun |
| Effective tax rate (`effectiveRate`) |  | total tax (T19) | AGI (T19) | 7 Verify | the honest number. Most FIRE-phase plans target under 10% | after-tax metrics |
| Credit utilization (`utilization`) |  | card balances (D21) | card limits (D21) | 7 Verify | under 30% fine, under 10% best for scoring | Credit Building moon |
| Income concentration (`payerConcentration`) |  | largest single payer (I24) | total income (I7) | 8 Protect | over 80% from one payer is normal for W-2, and is the reason for the emergency fund | Protect band |
| Disability replacement rate (`disabilityReplace`) NEW |  | covered monthly benefit (I23) | take-home (I1) | 8 Protect | 60% of pay is the common group-plan level | Protection view |
| Employer stock share (`employerStockShare`) | single-stock concentration | largest single position (A22) | total invested (A7) | 8 Protect | over 10% is a flag | Protect band |
| Job-loss runway (`jobLossRunway`) |  | cash that counts + cushion (A4, I22) | bare-bones + minimums-only (E24, D23) | 8 Protect | months. Compare to typical job-search time for the field | Between Jobs room |
| Bad-year coverage (`badYearCoverage`) NEW |  | cash that counts (A4) | out-of-pocket max + shock costs (E22, E23) | 8 Protect | 100% or more = a bad year does not touch investments | Protection view |
| Market pay gap (`marketGapRate`) NEW |  | market rate minus your pay (I27, I2) | your pay (I2) | 9 Optimize | over 10% is a Career moon move | Career moon |
| 0% gains room used (`gainsRoomUse`) NEW | tax gain harvesting room | realized long-term gains (T26) | room under the 0% threshold (T25) | 9 Optimize | Go Curry Cracker lens. Fill it in low-income years | Tax Strategy moon |
| Weighted expense ratio (`weightedER`) | fee rate | sum(balance x expense ratio) (A7, A25) | total invested (A7) | 9 Optimize | Bogleheads lens: under 0.20%, index funds near 0.05% | fee drag |
| Real FI coverage (`realFiCoverage`) NEW |  | after-tax invested assets (A7, A10, T30) | real after-tax FI number (E28, E29, E30, T30, I28, I29) | 10 Horizon | the final, honest percent to FI | Decumulation room |
| Social Security coverage (`ssCoverage`) NEW | income floor share | projected Social Security (Y19, I28) | FI-phase spending (E28) | 10 Horizon | a floor that lowers the portfolio's job after 62 to 70 | realFiNumber |
| Barista gap (`baristaGap`) NEW |  | FI-phase spending minus part-time income (E28, I29) | FI-phase spending (E28) | 10 Horizon | the share the portfolio still has to cover | Barista FI number |
| Cap rate (`capRate`) NEW |  | net operating income (A28) | property value (A28) | 10 Horizon | market-dependent. Compare to local cap rates, not a fixed band | Real Estate moon |
| Cash-on-cash return (`cashOnCash`) NEW |  | annual pre-tax cash flow (A28) | cash invested (A28) | 10 Horizon | BiggerPockets lens. Compare to the plan return assumption | Real Estate moon |
| Rent-to-price (`rentToPrice`) NEW | the 1% rule | monthly rent (A28) | purchase price (A28) | 10 Horizon | 1% is a screening rule of thumb, rarely met in expensive markets. Screen only, never a verdict | Real Estate moon |
| Debt service coverage (`dscr`) NEW | DSCR | net operating income (A28) | annual debt service (A28, D12) | 10 Horizon | lenders commonly want 1.2 or more | Real Estate moon |
## C4. Reverse index: every level and the ratios it is part of

"On top" means the level feeds the numerator. "Underneath" means it feeds the denominator. Use this for the "this number is part of" line on each level card, and for ranking: a level that sits underneath many ratios matters more than one that sits on top of one. Levels not listed are not part of any ratio (they feed non-ratio metrics, confirms, gates, or moons: see Part 2).

### You

| Level | On top of (numerator) | Underneath (denominator) |
|---|---|---|
| Y1 |  | pawRatio, pctToCoast, requiredVsActual |
| Y3 |  | pctToCoast, bridgeCoverage, requiredVsActual |
| Y17 |  | requiredVsActual |
| Y19 | ssCoverage |  |

### Income

| Level | On top of (numerator) | Underneath (denominator) |
|---|---|---|
| I1 | savingsRatePotential, leakRate, realWageRatio, impliedTaxRate, requiredVsActual | savingsRateActual, savingsRatePotential, leakRate, spendRate, givingRate, shelterRate, minimumsRate, mustPayRate, fixedCostRate, needsShare, wantsShare, foodShare, transportRate, insuranceRate, recurringShare, disabilityReplace, refundShare, interestToIncome |
| I2 | marketGapRate, impliedTaxRate | savingsRateGross, trueSavingsRate, frontEndDTI, backEndDTI, carPaymentRate, realWageRatio, marketGapRate, impliedTaxRate, withholdAccuracy, refundShare, nwToIncome, pawRatio, priceToIncome, carToIncome, studentToIncome |
| I3 | incomeVolatility | incomeVolatility, efCoverage |
| I4 | trueSavingsRate, matchCapture | matchCapture |
| I7 |  | sideShare, payerConcentration |
| I8 | sideShare |  |
| I9 | trueSavingsRate, retContribRate, withholdAccuracy | retContribRate, withholdAccuracy |
| I11 | realWageRatio | realWageRatio |
| I14 | raiseCapture | creepRate |
| I22 | jobLossRunway |  |
| I23 | disabilityReplace |  |
| I24 | payerConcentration |  |
| I27 | marketGapRate |  |
| I28 | ssCoverage | realFiCoverage |
| I29 | baristaGap | realFiCoverage |

### Expenses

| Level | On top of (numerator) | Underneath (denominator) |
|---|---|---|
| E1 | savingsRatePotential, leakRate, spendRate, currentWR | freedomPerMonth, pctToFI, pctToCoast, yearsSaved, bridgeYears, bridgeCoverage, requiredVsActual |
| E2 | shelterRate, frontEndDTI, backEndDTI, mustPayRate, needsShare |  |
| E3 | savingsRatePotential, leakRate, spendRate, currentWR | freedomPerMonth, pctToFI, pctToCoast, yearsSaved |
| E4 | needsShare, foodShare |  |
| E5 |  | runwayMonths, efCoverage |
| E6 |  | bridgeYears, bridgeCoverage, requiredVsActual |
| E7 | needsShare, recurringShare |  |
| E8 | needsShare, transportRate, carPaymentRate |  |
| E9 | givingRate, needsShare, wantsShare |  |
| E10 | fixedCostRate |  |
| E11 | insuranceRate |  |
| E15 | raiseCapture, creepRate |  |
| E22 |  | badYearCoverage |
| E23 |  | badYearCoverage |
| E24 |  | jobLossRunway |
| E28 | baristaGap | realFiCoverage, ssCoverage, baristaGap |
| E29 |  | realFiCoverage |
| E30 |  | realFiCoverage |

### Assets

| Level | On top of (numerator) | Underneath (denominator) |
|---|---|---|
| A1 | nwToIncome, pawRatio, yearsSaved | debtToAssets, investedShare, cashShare, homeShareNW, trapRatio, liquidityRate |
| A2 | investedShare, cashShare, pctToFI, pctToCoast, liquidityRate, bridgeYears | currentWR |
| A3 | savingsRateActual, savingsRateGross, leakRate, freedomPerMonth, requiredVsActual |  |
| A4 | runwayMonths, efCoverage, jobLossRunway, badYearCoverage |  |
| A5 | trapRatio, liquidityRate, bridgeYears |  |
| A6 | homeShareNW, trapRatio, priceToIncome, carToIncome, liquidityRate, bridgeYears | ltv |
| A7 | bridgeCoverage, taxBucketMix, weightedER, realFiCoverage | requiredVsActual, taxBucketMix, stockShare, employerStockShare, weightedER |
| A8 | trueSavingsRate, contribFill, rothShare | rothShare |
| A10 | rothShare, taxBucketMix, realFiCoverage |  |
| A11 | bridgeCoverage |  |
| A12 | cashDragRate |  |
| A13 | stockShare |  |
| A22 | employerStockShare |  |
| A25 | weightedER |  |
| A28 | capRate, cashOnCash, rentToPrice, dscr | capRate, cashOnCash, rentToPrice, dscr |

### Debt & Credit

| Level | On top of (numerator) | Underneath (denominator) |
|---|---|---|
| D1 | debtToAssets, nwToIncome, pawRatio | homeShareNW, trapRatio, highInterestShare |
| D2 | backEndDTI, minimumsRate, mustPayRate, fixedCostRate | extraPayRate |
| D3 | highInterestShare |  |
| D4 | homeShareNW, trapRatio, ltv, studentToIncome |  |
| D5 | extraPayRate |  |
| D7 | weightedDebtRate, interestToIncome | weightedDebtRate, variableShare |
| D8 | interestToIncome |  |
| D10 | variableShare |  |
| D12 |  | dscr |
| D21 | utilization | utilization |
| D23 |  | jobLossRunway |

### Taxes

| Level | On top of (numerator) | Underneath (denominator) |
|---|---|---|
| T3 | refundShare |  |
| T4 |  | withholdAccuracy |
| T19 | effectiveRate | effectiveRate |
| T25 |  | gainsRoomUse |
| T26 | gainsRoomUse |  |
| T30 | realFiCoverage | realFiCoverage |

---

# PART 5: THE FIRE LEXICON

Every concept the FIRE community talks about, labeled and specced. Each entry says what it is, how the app computes or represents it, and where it lives. "Lives" uses these tags: METRIC (a recipe, with id), LEVEL (a planet level), MOON, ROOM, LENS (a re-reading of numbers behind the "more ways to look at this" toggle, never new fields), WHAT MATTERS (no numbers), GLOSSARY (tap-to-define only).

Build rules for this part:
- Every term below goes in data/glossary.json with: term, aliases, plainDefinition (one sentence, no jargon inside it), spec, lives, source lens, and appliesWhen. Tap-to-define works on every screen.
- appliesWhen drives the Advice Translator: each term is tagged "for you now," "not yet," or "outgrown" from the household's levels.
- Anything that depends on law or annual limits (contribution limits, brackets, subsidy rules, penalty exceptions, loan limits) is read from data/tax-tables.json or data/benefit-tables.json with a source and an as-of date. Never hard-code a dollar limit or a threshold in a formula or in copy.
- Rules of thumb are lenses with their source named. The app never states one as fact.
- Framework and brand names on screen are a toggle (already decided). With names off, the plain label shows.

## D1. The core math

- **FI number** (FIRE number, "your number"). The invested amount that supports your spending indefinitely. Spec: annual spending / withdrawal rate. METRIC fiNumber (Tier 1), realFiNumber (Tier 10).
- **The 4% rule** (safe withdrawal rate, SWR, Trinity study, Bengen). Withdraw 4% of the starting portfolio, adjust for inflation, and historically a 30-year retirement survived. Spec: withdrawal rate default 4%, user-editable, with a note that 30 years is the original horizon. LENS on fiNumber. Settings: Horizon group.
- **25x rule** (and 33x, 28x). The 4% rule inverted. Spec: multiplier = 1 / withdrawal rate. 3% = 33x, 3.5% = 28.6x. LENS on fiNumber.
- **The x300 rule** (monthly expense times 300). Every $1 of monthly spending needs $300 invested at 4%. Spec: monthly cost x 12 / withdrawal rate. LENS and toggle mode on every expense line ("this subscription costs $4,500 of FI number").
- **MMM's 10-year rule** (multiply a monthly cost by 173, a weekly cost by 752). What a recurring cost becomes if invested for ten years at 7%. LENS on expense lines, labeled with its source.
- **Savings rate**. Share of income you keep. Spec: three declared versions (actual on take-home, on gross, true all-in). METRIC savingsRateActual, savingsRateGross, trueSavingsRate. See D3 for the debates.
- **The Shockingly Simple Math** (MMM). Years to FI depend almost only on savings rate. Spec: table re-run on the user's own numbers with an assumption-by-assumption waterfall. ROOM Your Shockingly Simple Math (built). Reads savingsRateActual, A2, expectedReturn.
- **Years to FI / FI date**. METRIC fiDate (Tier 1), fiDateProjected (Tier 5). Always shown with its give-or-take.
- **The gap** (ChooseFI: "the gap between what you earn and what you spend"). METRIC gap.
- **Net worth**. Assets minus debts. Spec: declared setting for whether home equity and vehicles count. Two views always available: total and invested-only. METRIC netWorth, nwStatement, afterTaxNW.
- **Invested assets vs. net worth**. Only invested assets fund FI. Home equity does not pay for groceries. Spec: pctToFI uses invested assets only. METRIC pctToFI, investedShare, homeShareNW.
- **Crossover point** (Your Money or Your Life). The month investment income exceeds expenses. Spec: invested x withdrawal rate / 12 vs. monthly spending. Same math as pctToFI = 100%. LENS with the YMOYL wall-chart view (income, expenses, investment income over time) in the History room.
- **Rule of 72**. Years to double = 72 / return. GLOSSARY plus a one-line helper wherever a return is shown.
- **Compound growth / time in the market**. GLOSSARY. Visualized in the Overnight-style "what your money did while you slept" line on Home (optional).
- **Real vs. nominal returns**. All projections in today's dollars, declared once. GLOSSARY plus Settings: Accuracy.
- **Current withdrawal rate**. What you would be pulling if you stopped today. METRIC currentWR. Counts down toward 4% as a second progress bar.
- **Years of expenses saved** (FU money, JL Collins). METRIC yearsSaved. Milestone at 1, 5, 10, 25.
- **Wealth multiplier** (Money Guy). What each dollar invested at your age becomes by 65. Spec: (1 + return)^(65 - Y1), table by age. LENS on every contribution and every expense line.
- **Human capital**. The present value of your future earnings, the biggest asset of someone in their 20s. Spec: I2 projected by incomeGrowth to Y3. LENS on the net worth statement ("not counted, but real"). Career moon.

## D2. FI flavors and milestones

- **Lean FIRE**. FI on a bare-bones budget. Spec: fixed and essential lines x 12 / withdrawal rate. Community thresholds vary (often quoted under about $40k a year). Threshold configurable. METRIC leanFi.
- **Fat FIRE**. FI with a generous budget (often quoted above about $100k a year). Spec: user-set FI-phase spending at E28. LENS on realFiNumber.
- **Chubby FIRE**. Between regular and Fat. GLOSSARY, selectable flavor at Y9.
- **Coast FI** (Coast FIRE). Enough invested that growth alone reaches FI by traditional retirement age. You only need to cover current expenses. METRIC coastTarget, pctToCoast. Major milestone.
- **Barista FI**. Part-time work covers some spending (and often health insurance), portfolio covers the rest. METRIC baristaFi, baristaGap. LEVEL I29.
- **Slow FI** (The Fioneers). Use growing financial strength to improve life along the way rather than sprint. WHAT MATTERS, selectable flavor at Y9. Changes the sun's default lever order (time levers before savings levers).
- **Flamingo FI**. Save half your FI number, then go semi-retired and let it double. Spec: 50% of fiNumber milestone plus a Coast check. LENS on milestones.
- **Semi-retirement, mini-retirements, sabbaticals** (4-Hour Workweek, Jillian Johnsrud). Scenario block type: sabbatical. Shows cost in dollars and FI-date days.
- **Geo-arbitrage / expat FI**. Earn in a strong economy, spend in a cheaper place. MOON Geo-Arbitrage, scenario block type geo, METRIC moveTax.
- **Entrepreneur FI**. FI through business income or sale. MOON Entrepreneurship. Y9 flavor.
- **Milestone ladder**. Net worth zero (breakeven), first $10k, first $100k ("the hardest"), half FI, Coast FI, Lean FI, Flamingo, FI, Fat FI. Plus contribution milestones: match captured, Roth IRA funded, 401k maxed. Spec: Y18 shows position and next rung. METRIC milestone. Shareable links, no balances.
- **Stages of financial freedom** (various authors: dependence, solvency, stability, security, independence, abundance). LENS on the milestone ladder with names as a toggle.
- **Debt free scream**. Earned state on Debt & Credit. Celebration ceremony.
- **FI Day / retirement date**. LEVEL Y3, confirmed at Y17.
- **One More Year syndrome (OMY)**. Reaching the number and not stopping. WHAT MATTERS. Trigger: pctToFI over 100% for 12 months. Links Pre-Retirement Design content.
- **The boring middle**. The long stretch between setup and FI where nothing changes but the balance. WHAT MATTERS plus the monthly "since last time" strip and percent-not-balance framing.
- **Retire to, not from**. WHAT MATTERS. LEVEL Y9 and Y29 feed it.

## D3. Savings rate debates (declare, do not pick silently)

Settings: Accuracy group holds each switch. Every savings rate shown names its definition on tap.
- Gross vs. net denominator. Both computed (savingsRateGross, savingsRateActual).
- Does employer match count? Switch. Default yes in trueSavingsRate, shown separately.
- Does mortgage principal count as saving? Switch. Default no.
- Do taxes count as spending? Default: taxes are excluded from both sides in the net version.
- Does debt payoff beyond minimums count? Default yes, shown as its own slice (D5).
- Is the HSA saving or spending? Follows T18: investment use counts as saving.

## D4. Order-of-operations frameworks (all are LENSES over one slot engine)

The app has one engine (slotFirst, slotFinal) and renders it through the chosen source. Names are a toggle.
- **Financial Order of Operations, FOO** (Money Guy). Nine steps: deductibles covered, employer match, high-interest debt, emergency reserves, Roth IRA and HSA, max retirement, hyper-accumulation, prepay future expenses, low-interest debt. Step thresholds come from the benchmark table.
- **r/personalfinance flowchart / prime directive**. Budget, small emergency fund, match, high-interest debt, full emergency fund, IRA, more retirement, other goals.
- **Baby Steps** (Ramsey). Included because users arrive with it. The Advice Translator marks where it diverges for FIRE (match before debt, investing rate above 15%).
- **ChooseFI pillars / the aggregation of marginal gains**. Many 1% improvements. Rendered as the quick-wins ledger ("won so far").
- **Eli's default**. The app's own order, shown when no lens is picked.
- **Pay yourself first / automation**. Moves in Main Path moon. Financial Ops in WHAT MATTERS.
- **Emergency fund tiers**. Starter, 3 months, 6 months, by stability. Rule of 5 calculator plus DRAFTT and Fat versions ("premeditated resilience"). METRIC efTarget, efCoverage. MOON Safety Net.
- **Sinking funds**. METRIC sinkingTargets. LEVEL E13.

## D5. Accounts and tax moves

All eligibility rules and limits read from dated tables.
- **401(k), 403(b), 457(b), TSP**. LEVEL A5, A7, I9. 457(b) flagged as penalty-free after separation, which matters for the bridge.
- **Employer match and vesting**. METRIC matchCapture, matchLeft. LEVEL I4, I26.
- **Traditional vs. Roth**. METRIC rothCall (T16). Core FIRE insight encoded: high savers often favor traditional now and convert later at low rates. Shown as a read, never a rule.
- **Roth IRA**. Contributions (basis) can come out any time. LEVEL A27 tracks basis. Feeds bridge.
- **Backdoor Roth**. For incomes above the Roth limit. MOON Tax Strategy move. Gate: income above table threshold. Warns on the pro-rata rule if any pretax IRA balance exists in A7 + A10.
- **Pro-rata rule**. GLOSSARY plus the warning above.
- **Mega backdoor Roth**. After-tax 401k contributions converted to Roth. MOON Tax Strategy move. Gate: I6 intake confirms the plan allows it.
- **HSA as a stealth IRA** (Mad Fientist). Triple tax advantage. Pay medical costs out of pocket, invest the HSA, reimburse later. METRIC hsaRead. LEVEL T18. Move: "save your receipts."
- **Solo 401(k), SEP IRA, SIMPLE**. MOON Entrepreneurship and Side Hustles moves. Gate: I10 shows self-employment.
- **529 and 529-to-Roth rollover**. MOON Family & Generational. Kids & Tuition room.
- **ESPP**. Quick win when a discount exists. LEVEL I6, I26. Move: "take the discount, sell on a schedule."
- **RSUs and options**. LEVEL I25. Concentration check at A22. Treated as income when vested.
- **NUA (net unrealized appreciation)**. Advanced, employer stock in a 401k. GLOSSARY, surfaced only when A22 shows employer stock inside a retirement account.
- **Tax-loss harvesting and the wash-sale rule**. METRIC harvestRoom. MOON Tax Strategy.
- **Tax-gain harvesting / the 0% long-term gains bracket** (Go Curry Cracker). METRIC gainsRoomUse. Central to early-retirement tax planning.
- **Asset location**. Which holdings sit in which tax bucket. Read inside allocationRead once A10 and A20 exist.
- **Tax diversification / three buckets**. METRIC taxBucketMix.
- **Tax drag**. Yearly tax cost of a taxable account. LENS on feeDrag.
- **Marginal vs. effective rate**. METRIC marginalBracket, effectiveRate. The difference is explained wherever either appears.
- **Standard deduction as a free conversion space**. Read inside ladderPlan.
- **Donor-advised fund, bunching, QCDs**. Giving room. Gate: T12 itemizing or a windfall year.
- **Saver's credit, student loan interest, education credits, EITC**. METRIC missedCredits.
- **I-bonds, T-bills, CDs, HYSA, money market**. LEVEL A7, A12. METRIC cashDragRate. MOON Safety Net.
- **Bank account bonuses**. MOON Safety Net quick wins (kept separate from card rewards).

## D6. Reaching money early (the bridge)

This is the section most planners skip and the FIRE community talks about constantly.
- **The middle-class trap** (BiggerPockets Money). Wealth locked in retirement accounts and home equity, little reachable. METRIC trapRatio, liquidityRate (derived, Tier 2).
- **Bridge account / bridge number**. Taxable and other reachable money to cover target date to 59.5. METRIC bridgeYears, bridgeNumber, bridgeCoverage, bridgeFinal.
- **Roth conversion ladder**. Convert traditional to Roth each year, wait five years per conversion, withdraw the converted amount penalty-free. METRIC ladderPlan. Spec: needs five years of other funding first, which the bridge math includes.
- **The Roth five-year rules**. Two different clocks (account age, each conversion). GLOSSARY plus explicit handling in ladderPlan.
- **72(t) / SEPP**. Substantially equal periodic payments from an IRA before 59.5 without penalty. Rigid once started. Decumulation room option, flagged advanced.
- **Rule of 55**. Penalty-free 401k access if you leave that employer in or after the year you turn 55. Decumulation room option. Gate: Y3 at 55 or later.
- **Roth contribution withdrawals**. Basis first, always available. LEVEL A27.
- **457(b) access**. See D5.
- **Taxable brokerage first**. Default drawdown order for the bridge, with 0% gains harvesting. METRIC drawdownPlan.
- **Withdrawal order** (taxable, then traditional, then Roth, and the blended alternatives). LEVEL A30, a confirm with the app's computed best order.

## D7. Withdrawal science

- **Sequence of returns risk**. Bad early years hurt far more than bad late years. METRIC sequenceRead (A24). Phenomenon switch already in the foundation.
- **Safe withdrawal rate research** (Big ERN's series). Long retirements of 40 to 60 years point to 3.25 to 3.5%. LENS on withdrawal rate, driven by planHorizon.
- **CAPE-based withdrawal**. Withdrawal rate that moves with market valuation. LENS in Decumulation room, advanced.
- **Guardrails** (Guyton-Klinger). Raise or cut spending when the withdrawal rate drifts past set bounds. Decumulation room strategy option.
- **Variable percentage withdrawal (VPW)** (Bogleheads). Decumulation room strategy option.
- **Bucket strategy**. Cash for near years, bonds for middle, stocks for long. Decumulation room strategy option.
- **Bond tent / rising equity glide path** (Kitces, Pfau). More bonds around the retirement date, then back toward stocks. Read inside allocationRead near Y3.
- **Cash cushion / years of cash**. Part of the bucket option.
- **Flexibility as a safety margin**. Cutting wants in a down year. Spec: uses E10 flexible flags to compute how much spending can drop. Shown beside sequenceRead.
- **Social Security as a floor**. METRIC ssFloor, ssCoverage. Claiming-age comparison in Decumulation room.
- **Pensions and annuities as floors**. LEVEL I29. Same floor logic.
- **RMDs, IRMAA, the widow's penalty, the tax torpedo**. Late-life tax effects. Horizon band, Tax room. GLOSSARY, surfaced when planHorizon passes those ages.
- **Die With Zero** (Perkins). Spend down on purpose. Net worth should peak, not climb forever. Memory dividends, time buckets. WHAT MATTERS rooms (Time Buckets, memory dividends calculator). Advice Translator: "not yet" while highInterestFlag is on.
- **Legacy and giving while living**. Family moon, Giving room, Estate Basics.

## D8. Investing philosophy

- **Index investing / VTSAX and chill / The Simple Path to Wealth** (JL Collins). Default lens for Portfolio Design moon.
- **Bogleheads three-fund portfolio**. Portfolio Design template.
- **Two-fund and one-fund (target date) portfolios**. Templates. Target-date funds flagged for their fee level via weightedER.
- **Expense ratios**. METRIC weightedER, feeDrag.
- **Asset allocation and glide path**. METRIC stockShare, allocationRead.
- **Rebalancing**. Move in Portfolio Design moon, annual, tied to level 30 review.
- **Dollar-cost averaging vs. lump sum**. Windfall room read.
- **Market timing, staying the course, the crash protocol**. WHAT MATTERS (Storms & Windfalls playbook). Triggered in-app by a big drop in A19 updates: shows sequenceRead and the plan, no alarm styling.
- **Dividend investing, factor tilts, small-cap value**. GLOSSARY and an advanced Portfolio Design note. Not a default path.
- **Crypto, gold, collectibles, angel investing**. LEVEL A9. MOON Alternatives, dim until Main Path is settled.
- **Employer stock concentration**. METRIC employerStockShare.
- **Robo-advisors and AUM fees**. Fee drag applies. LEVEL A25 accepts an advisory fee line.

## D9. Healthcare (the biggest early-retirement unknown in the US)

- **ACA marketplace plans and premium subsidies**. Subsidy depends on MAGI. METRIC subsidyCliff. Rules change with legislation, so they live in the dated table.
- **MAGI management**. Choosing which bucket to draw from to land income where you want it. Read inside drawdownPlan.
- **COBRA**. LEVEL E23 shock cost. Between Jobs room.
- **Aging off a parent's plan at 26**. METRIC keyDates, coverageGapFirst. Very relevant to the core audience.
- **HSA-eligible high-deductible plans**. METRIC hsaRead.
- **Health sharing ministries**. GLOSSARY with a plain note that they are not insurance.
- **Barista FI for benefits**. See D2.
- **Medicare at 65, long-term care**. Horizon band. Health moon.
- **Out-of-pocket maximum as the true bad-year number**. METRIC badYear, badYearCoverage. Money Guy FOO step 1.

## D10. Real estate

MOON Real Estate. Rooms: Housing Decision, house hack module.
- **House hacking**. Live in one unit or room, rent the rest. Spec: shelterRead shows the delta. FHA capacity from mortgageCapacity.
- **FHA, conventional, VA, down payment, PMI, LTV**. METRIC ltv, mortgageCapacity, frontEndDTI, backEndDTI. Loan rules in dated table.
- **Rent vs. buy**. Price-to-rent ratio and the 5% rule (Ben Felix: compare rent to about 5% of the home price per year in unrecoverable costs). Housing Decision room, takes market inputs in its own intake.
- **The 1% rule, 2% rule, 50% rule**. Screening rules of thumb. METRIC rentToPrice. LENS only.
- **Cap rate, cash-on-cash, NOI, DSCR**. METRIC capRate, cashOnCash, dscr.
- **BRRRR** (buy, rehab, rent, refinance, repeat). GLOSSARY and a Real Estate moon track.
- **Paying off the mortgage early vs. investing**. METRIC flipRate (D17) plus a Triple D view. One of the great FIRE arguments: shown as a read with both sides.
- **Home equity in the FI number**. Setting. Default excluded, with downsizing as a scenario block.
- **REITs, syndications, short-term rentals**. A9 and Alternatives.
- **Live-in flip, the home sale gain exclusion**. GLOSSARY, Real Estate moon.

## D11. Income and career

- **Income as the bigger lever** (Trench, Hormozi, and most of the community after the frugality era). METRIC incomeLevers, marketGapRate. MOON Career.
- **Negotiation, job hopping, the lifetime value of a raise**. Career moon moves. Spec: raise x wealth multiplier.
- **Side hustles**. MOON Side Hustles. METRIC hustleCapacity, sideNet, hourly wage by source.
- **Entrepreneurship, solopreneur**. MOON Entrepreneurship.
- **Talent stacking / skills**. Skill calculator room. Career moon.
- **Real hourly wage and life energy** (YMOYL). METRIC hourlyFirst, hourlyFinal, realWageRatio. Toggle mode across every room: hours costed, time bought back, FI date pushed.
- **Passive income**. Defined honestly as income that does not require your hours. LEVEL I10 type, I29.
- **Total compensation**. METRIC totalComp.
- **Remote work and location independence**. LEVEL Y27. Geo moon.

## D12. Spending philosophy

- **The Big Three** (housing, transportation, food). FAT in this app. METRIC shelterRate, transportRate, foodShare. E18 always checks these first.
- **Frugality vs. deprivation, value-based spending, conscious spending, money dials** (Sethi). METRIC worthIt. WHAT MATTERS.
- **Latte factor** (Bach) and its critics. LENS: the x300 rule makes small recurring costs visible, the Big Three note keeps them in proportion.
- **Lifestyle creep / lifestyle inflation**. METRIC creepRate, raiseCapture.
- **Hedonic adaptation**. WHAT MATTERS.
- **Minimalism, no-spend challenges, spending fasts**. Deals moon optional moves.
- **Enough** (YMOYL's fulfillment curve). WHAT MATTERS. The Dante "Enough" sphere.
- **Buying used, the car rules** (pay cash, 20/3/8, drive it ten years). METRIC carPaymentRate, carToIncome. Big Purchase room.
- **Tracking spending / budgeting methods** (zero-based, envelope, anti-budget, pay-yourself-first). Budget room offers each as a view of the same E data. Anti-budget is the default: watch the savings rate, not the categories.
- **Cost per use, hours of life per purchase**. METRIC worthIt, time toggle.

## D13. Travel rewards and credit

- **Travel rewards / points and miles / churning**. MOON Card Rewards. Gate: no high-interest balance, good credit, spending known.
- **Sign-up bonuses, minimum spend, annual fee math**. Card Rewards moves. Spec: value = bonus value minus fee, against spending already planned in E.
- **Issuer velocity rules (such as the 5/24 rule)**. Tracked from the moon's intake (accounts opened in 24 months). Rules in a dated table.
- **Manufactured spending**. GLOSSARY only, labeled risky and against most card terms. No moves.
- **Credit score factors** (payment history, utilization, age, mix, inquiries). MOON Credit Building. METRIC creditBand, utilization, reportClean.
- **Authorized user, secured card, credit freeze**. Credit Building moves.

## D14. Debt

- **Avalanche vs. snowball**. METRIC payoffPlan, payoffChosen. Both always shown with dates and interest. The read respects that motivation is real.
- **Good debt vs. bad debt, the flip rate**. METRIC flipRate, highInterestShare.
- **Student loans: IDR plans, PSLF, refinancing**. METRIC loanPath. Student Loan Decision room. Plan rules in a dated table because they change.
- **0% promos, balance transfers**. METRIC promoCliff. Payoff Plan moves.
- **Buy now, pay later**. Counted as debt at D3 and D4.
- **Leverage as a tool**. MOON Leverage. LEVEL D30.
- **Debt-to-income**. METRIC backEndDTI, D27.

## D15. Protection

Protection view gathers band 8 across planets.
- **Term life, and why not whole life**. Need shown only when Y23 shows dependents. GLOSSARY explains the community's view, as a view.
- **Own-occupation disability insurance**. METRIC disabilityReplace. The most under-owned cover for people in their 20s.
- **Umbrella, renters, auto**. LEVEL Y22, E11.
- **Self-insuring as wealth grows**. Advice Translator "outgrown" example: low deductibles, extended warranties.
- **Estate basics: will, beneficiaries, POA, healthcare proxy, "in case of emergency" binder**. METRIC estateReady. LEVEL Y24, A23, T23.
- **Identity protection: credit freeze, password manager**. Financial Ops.

## D16. Family and life

- **Combining finances, money dates, yours-mine-ours**. LEVEL Y5, E12. Partner room. Monthly group money date in the community layer.
- **Cost of kids, childcare, one-income households**. Scenario block kid. Kids & Tuition room.
- **Financial literacy for kids, custodial Roth**. Family moon.
- **Aging parents, the sandwich generation**. LEVEL Y15. METRIC familyFlows.
- **Inheritance, stepped-up basis, inherited IRA rules**. LEVEL Y15, A29. Windfall room. Rules in a dated table.
- **Prenups, marriage tax effects**. Scenario block marriage. T15.

## D17. Psychology and life design (WHAT MATTERS unless noted)

- Money scripts, scarcity vs. abundance, money avoidance and money vigilance. Money Mirror, personality quiz.
- The Advice Translator: what applies now, not yet, outgrown.
- Identity after work, purpose, the "then what?" problem. Pre-Retirement Design.
- Happiness research: spending on time, experiences, and other people. Purpose and happiness calculator.
- Time as the real currency: 168-hour audit, buying back hours. Hours-back calculator. LEVEL Y26.
- Community and accountability: local FI groups, body doubling, the monthly money date.
- Comparison, stealth wealth, telling family about FI. GLOSSARY.
- Burnout as the reason people find FIRE. Slow FI lens. Sabbatical block.
- FI-losophy: math, then mental health, then philosophy. The app's own arc. The Empyrean.

## D18. Voices as selectable benchmark sources

Each DRAFTT band and each rule-of-thumb lens names its source and can be switched. Sources to seed in data/benchmarks.json: Eli's default, The Money Guy Show (FOO, 25% gross, 20/3/8, wealth multiplier), Scott Trench (Set for Life stages, income and housing first), ChooseFI (the gap, marginal gains), Mr. Money Mustache (savings-rate table, the 10-year rule), JL Collins (simple path, FU money), Mad Fientist (tax strategies), Big ERN (withdrawal rates), Go Curry Cracker (0% gains), YMOYL (real hourly wage, crossover), Die With Zero (time buckets), Ramit Sethi (conscious spending), Bogleheads (three-fund, low fees), BiggerPockets (real estate ratios, the middle-class trap), 50/30/20 (Warren), Millionaire Next Door (PAW ratio). Every number attributed to a source carries a citation and a last-checked date, and is verified before shipping. Do not ship a quoted figure that has not been checked against the source.
