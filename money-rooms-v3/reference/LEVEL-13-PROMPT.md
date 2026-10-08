Money Rooms v3: Level 13, "Calculators" (cash flow calendar, how much home, house, car)

Repo: sapphirestoneage/Personalfinance, folder money-rooms-v3/. Read README.md, CONTRACTS.md, DECISIONS.md, BOARD.md, ui/tokens.css, ui/app.css, ui/charts.js, engine/charts-all.js, engine/chartdata.js, engine/chartdata-more.js, engine/debtsim.js, engine/projection.js, engine/scenarios.js, engine/goals.js, engine/transactions.js, engine/tax.js, engine/col.js, engine/household.js, engine/sensitivity.js, engine/metrics.js and the Level 8 to 12 work first. Follow the conventions: views never do math, journal append-only, libraries in data/ with asOf/source/verify, every change gets a DECISIONS.md entry, earlier levels stay frozen except where this level needs a hook. Add Level 13 to BOARD.md. Run end to end without stopping; collect questions in QUESTIONS.md and list them at the end. No em dashes anywhere in code, copy, or docs.

GOAL
A Calculators section with four comprehensive tools: the cash flow calendar, How much home can I afford, a full House calculator (cost of owning, loan types, rent vs buy, house hack), and a full Car calculator (buy new, buy used, lease, no car). Each prefills from the client's record, labels guesses, shows its effect on the FI date and the goal timeline, ends with "Add this to my plan", and looks like a polished professional product with every relevant chart.

0. REFERENCE MATERIAL FIRST
- Read money-rooms-v3/reference/README.md, then cashflow-calendar-spec.md and buy-vs-rent-model.md in full.
- Cash flow calendar: if reference/ contains cashflow-v44.html or a cashflow src/ folder (engine.js, adapter.js), port its engine into engine/cashcal.js and its tests. Otherwise build engine/cashcal.js from cashflow-calendar-spec.md: its data model, the in-day order of operations, the grace period rule, "cleared means stopped revolving", null is not zero, cash-constrained payments, average daily balance, late fees and penalty APR, and every self-test assertion in section 7. Section 8 (Eli's corrections) overrides everything else in that file. Log every difference from the spec in DECISIONS.md.
- House: port the Buy vs Rent workbook model (inputs, renter invests the down payment, closing costs and monthly difference, buyer and renter net worth by year) and fix every issue listed in buy-vs-rent-model.md.
- Also read the older SPARKS rooms and engines for logic worth reusing, then build v3-native: rooms/calendar.html, engines/calendar.js, shared/daybyday.js, engines/cashflow.js, rooms/car.html, rooms/first-car.html, rooms/housing.html, rooms/down-payment.html, rooms/property.html, rooms/big-purchase.html. Note in DECISIONS.md what you reused.

1. DESIGN BAR (applies to every screen in this level)
- Use the existing design system (ui/tokens.css, sapphire); no new colors outside tokens. Both themes, phone width (400px) through desktop, no horizontal page scroll, tabular numbers wherever digits line up.
- Every calculator screen follows one layout: one-sentence answer at the top in large type ("Safe to spend today: $412"), a compact input panel (prefilled, each field showing its state: hers, known, rough, or Guess), then charts, then the detail table, then "Add this to my plan".
- Charts: consistent marks, faint grid, labeled endpoints, theme tokens for all text, tooltips on hover and tap, an accessible text summary under each chart, empty states that say what unlocks them.
- Inputs: money fields accept the way people type ("1,650", "1.6k", "350 a month"); sliders paired with exact fields for rate, down payment and years; every default explained in one line ("Average for New Jersey, verify").
- No internal words on screen. Gentle mode: no red, soft wording ("tight day" not "overdraft risk").
- Quality loop: after building, run node tests/ui.js --shots 13, review every screenshot at three widths in both themes, write screenshots/level-13/critique.md (spacing, alignment, hierarchy, chart legibility, copy), fix everything it finds, and re-shoot once.

2. CALCULATORS HUB (route #/calculators, coach and client views; linked from Home, Session and the sidebar)
- Cards: Cash flow calendar, How much home, House, Car, plus every existing calculator-like screen in v3 (debt payoff, Rule of 5 and cushion, real hourly wage, scenario blocks, FI ladder, levers). Each card shows one live number from her record ("Safe to spend today: $412", "Comfortable home price: about $160k").
- Registry in data/calculators.json (id, name, one-line purpose, route, live number metric, firstSession, clientVisible).

3. CASH FLOW CALENDAR (engine/cashcal.js pure; route #/calendar; data/calendar.json for conventions)
Engine, day by day over a chosen window (30, 60, 90 days, 12 months), following the reference spec:
- Income: paydays by cadence (weekly, biweekly, semimonthly, monthly) from the income planet, or exact landings from imported transactions when present (they win).
- Bills: every dated spending line and every recurring item detected by engine/transactions.js on its day; annual items in their month; shared lines at her share with roommate reimbursements landing on expected days (Level 8 household); subscriptions with optional reimbursement N days later.
- Cards: statement date, due date, grace period (interest only when the previous statement was not paid in full), interest on the average daily balance, late fee and penalty APR after a missed or unfundable payment, promo APR with reversion date, minimum as max(floor, percent of statement), pay-in-full cards as charge rails, the everyday float card held flat; card payments from cash on the due date (minimum, statement balance, or a set amount).
- Pay-later plans: each installment on its date until the total is paid, flagged as debt.
- Debts: loan payments on their dates (reuse debtsim.js); avalanche and snowball targeting for any extra.
- Transfers: between her own accounts and into goal buckets on their dates (Level 11 allocation), plus the month-end sweep (what is left at month end goes to the next goal, optional per client).
- Maybe money: dated items with a likelihood; results shown three ways (ignore, likely only at 60 percent and up, weighted).
- Cash floor guard: optional floor (default the lean month step from Level 11 when funded, else 0); planned payments and transfers that would breach it are not made and are listed as shortfalls, with an option to defer automatically.
- Overrides: move, re-price or skip one occurrence of a repeat without changing the rule (also how drag to reschedule persists).
- Outputs: balance per account per day, low point (amount and date) per window and per month, first day below the floor or zero, safe to spend today (cash excluding the cushion bucket, minus everything due before the next income, minus the floor, also shown per day), interest paid, shortfalls, late fees, and a paycheck map (each paycheck and the bills it funds until the next one).
Features:
- Can I spend this: amount, date, paid with (cash or which card); returns yes, tight, or no, the new low point, cost in hours at her real hourly wage, interest it would cost if it lands on a carried card, and the goal it delays and by how many days (Level 11 engine).
- Bill timing fixer: finds due-date moves that raise the lowest point most (card and utility due dates the client can usually change), shows before and after, and the one-line script for the call.
- Outlook: run the window 200 times with amounts varying (default 15 percent, editable) and dates shifting a few days; report best, typical and worst low point, cash at the end, interest, and the share of runs that dip below the floor.
- Income shock: pause income for N months from a date; show runway on the calendar and which bills are at risk first.
- Life events: templates in data/life-events.json (lose my job, new job, moving, buy a car, wedding, new baby, roommate moves out, new pet, medical bill); each drops a starter set of dated items to edit; they never write to the record until confirmed, like scenario blocks.
- Spend logger: five-second entry (amount, what, tag, paid with), split one purchase across tags; entries feed actuals, per-tag pace ("$X left, $Y a day to stay inside", vs last month by the same day) and the variance view.
- Card helpers from the reference spec, shown inside the calendar's card drawer: utilization before the report day with a 30 percent warning, which card to use for a purchase (rewards minus interest, interest-free days), annual fee vs value used, balance transfer check (fee vs interest skipped).
- Weekly check-in: what was due since the last check-in (happened, different amount, didn't happen), real balances prefilled with the forecast, drift recorded and read as bias or noise ("you land about $X below forecast almost every time").
- Self tests: port or write at least 25 engine assertions, including every one listed in the reference spec section 7, plus: transfers net to zero across accounts, the floor is never breached with the guard on, paycheck map totals equal bills in each period.
Views and charts:
- Month grid: days shaded by end-of-day balance relative to the floor, icons for paydays, bills, card dues, pay-later, maybe money; tap a day for its entries and balance.
- Weeks view (in, out, ending balance per week), the default at phone width.
- Balance line: total cash over the window, floor line, low point marked and labeled, outlook band behind it when on.
- Paycheck map: one stacked bar per paycheck split into the bills it covers, with what is left.
- Year strip: twelve months, low point per month, tight months highlighted.
- Interest timeline per card and the per-card "why it's taking so long" panel (paid, charged back on, interest, net paydown).
- Agenda list: upcoming 14 days, grouped by day.
- Top of screen: "Safe to spend today" (largest), then the low point sentence ("Your tightest day is the 28th, $140").

4. HOW MUCH HOME (engine/home.js pure; route #/calc/home-afford)
- Inputs (prefilled): gross and take-home, debts and minimums, cash and the down payment goal bucket, state and county or city (property tax and insurance defaults), credit score range (lookup for rate adjustment, editable), rate (editable, labeled "check today's rate"), loan type, HOA, roommate or rental income option.
- Three answers, side by side, each a max price and a monthly cost:
  - What a lender might approve: front-end housing ratio (default 28 percent of gross) and back-end total debt ratio (default 36 percent, with a looser 43 to 50 percent toggle by loan type), whichever binds.
  - What's comfortable: the total monthly cost of owning (principal, interest, property tax, insurance, mortgage insurance, HOA, maintenance) at or under 35 percent of take-home. Store as data/assumptions.json housingShareOfTakeHome: 0.35, editable per client, labeled as my default. Use the same setting for renting checks and the existing shelter-heavy lens so one number rules housing everywhere.
  - What keeps your FI date: highest price whose full monthly cost and upfront cash move the FI date by no more than N months (default 6, editable), via engine/sensitivity.js and projection.js.
- Down payment ladder: max price at 3, 3.5, 5, 10, 20 percent down, cash to close at each, and the month each is saved per the Level 11 goal timeline.
- Cash to close: down payment, closing costs, prepaids, escrow cushion, moving, and a first-year repairs reserve.
- House hack and roommate: price range if a roommate or rented unit covers part of the payment (lenders may count part of rental income; label it "check with a lender").
- Buy now or wait: the three answers and cash to close one and two years out at her savings pace.
- Charts: three-answer bars (lender vs comfortable vs FI-safe price), down payment ladder (price by down payment percent with the month each is reachable), monthly cost stack at the comfortable price, cash to close waterfall.
- Headline sentence: "A lender might approve about $X. Comfortable is about $Y."

5. HOUSE CALCULATOR (engine/house.js pure; route #/calc/house)
- Inputs: price, down payment, loan type (conventional, FHA, VA, 15 or 30 year, ARM optional with rate path), rate, points, credit range, state and county, HOA, insurance, flood zone, years she expects to stay, appreciation (likely with a range), rent today, rent growth and renters insurance for the comparison, security deposit months, extra principal payments, investment return and capital gains rate for the renter path.
- Upfront: down payment, lender fees, points, title, appraisal, inspection, attorney where customary, recording, state and local transfer taxes including buyer-side taxes where they exist, prepaid taxes and insurance, escrow cushion, moving, initial repairs and furnishing.
- Monthly: principal and interest, property tax, homeowners insurance (grows with inflation), PMI for conventional tied to loan-to-value each month and ending at 20 percent equity, FHA upfront and annual mortgage insurance, VA funding fee, HOA (grows with inflation), maintenance (1 to 2 percent of value a year, editable), utilities difference vs renting, flood insurance where relevant. Show the total against the 35 percent of take-home line.
- Over time: amortization (interest from the amortization only), equity (principal plus appreciation), PMI end date, tax effect (itemized vs standard deduction using tax.js; most clients will not itemize, say so plainly), selling costs at exit, net proceeds.
- Rent vs buy (port of the Buy vs Rent workbook with its listed fixes): year by year for 1 to 30 years, buyer net worth (sale proceeds after selling costs minus loan balance) vs renter net worth (portfolio after capital gains tax, starting with the down payment and closing costs invested, adding the monthly difference whichever side is cheaper); break-even year marked; range under low and high appreciation; FI date both ways through the projection engine (no flat multipliers).
- House hack: units or rooms rented, rent per unit, vacancy, extra costs; net housing cost and the FI date effect.
- Charts: payment breakdown stack, amortization (principal vs interest by year), equity vs loan balance, rent vs buy lines with break-even marker and range band, upfront cash waterfall, FI date with and without the house.

6. CAR CALCULATOR (engine/car.js pure; route #/calc/car)
- Options compared side by side, any two to four: buy new, buy used (age and mileage), lease, no car (transit pass, rideshare per month, occasional rental, car share).
- Upfront: price, sales tax by state (and trade-in credit where the state allows it), doc fee, title, registration, dealer add-ons (flagged as optional), down payment, trade-in value and payoff.
- Loan: rate, term, payment, total interest. Lease: money factor shown as an interest rate (x 2400), residual, capitalized cost, acquisition and disposition fees, mileage limit and overage cost, payment.
- Running costs: insurance (state default, editable), gas (miles a year, mpg, price) or charging (kWh, price, home vs public), maintenance and repairs by age, tires, registration renewal, inspection, parking (defaults by cost-of-living tier, editable), tolls.
- Depreciation: value by year from data curves by age; loan balance vs value shows when she would be underwater.
- Outputs per option: true cost per month, cost per mile, total over the years she keeps it, value at the end, FI date effect, and the rules as lenses: Money Guy 20/3/8 (20 percent down, loan no longer than 3 years, total car costs under 8 percent of gross) and the common 20/4/10, each shown as pass or not with the numbers.
- Charts: total cost of ownership stacked by category per option, cumulative cost lines per option, value vs loan balance over time, cost per mile bars, FI date per option.

7. DATA LIBRARIES (asOf, source, verify: true on every value until I check it)
- data/housing-costs.json: effective property tax rate by state (county overrides where available for the top 50 metros), average homeowners insurance by state, closing cost ranges by state, transfer and buyer-side taxes by state and notable cities, PMI rate table by down payment and credit range, FHA upfront and annual mortgage insurance, VA funding fee table, conforming and FHA loan limits for the top 50 metros, maintenance defaults, rate adjustment by credit range.
- data/auto-costs.json: sales tax by state and trade-in credit rules, typical doc fee caps by state, registration and title estimates by state, insurance averages by state, depreciation curves by age (new and used), maintenance and repair by age, tire cost, EV and gas defaults, parking by cost-of-living tier, transit pass costs for the top 50 metros.
- data/calendar.json and data/life-events.json as above; data/assumptions.json gains housingShareOfTakeHome: 0.35.
- List every value and its source in the final report so I can verify.

8. INTEGRATION
- Every calculator ends with "Add this to my plan": creates a scenario block (existing engine/scenarios.js) and, where relevant, a goal on the Level 11 timeline (down payment fund, car fund, moving fund), with the goal amount from the calculator.
- Results appear in the Level 12 scoreboard drawers where relevant (housing share against 35 percent, car cost share, safe to spend, low point) and in the chart catalog with their questions.
- Curricula (Level 10): the cash flow calendar is introduced in session 4 (paycheck vs bill timing) and used on every money date; How much home and House in session 10 (life simulator); Car in session 10 or whenever a car decision comes up; each linked from the matching block.
- One-pager: safe to spend and the next tight day when the calendar has data; any added home or car block with its monthly cost and FI date effect.

9. TESTS AND GATES
- Engine tests for cashcal (at least 25 assertions as listed), home (each of the three answers, the binding ratio, the 35 percent comfortable line, the ladder, cash to close, FI-safe price), house (amortization totals, interest from amortization only, PMI ending at 20 percent equity, FHA mortgage insurance, rent vs buy break-even, renter investing the difference both ways, tax effect with the standard deduction), car (loan and lease math including money factor, tax with and without trade-in credit, depreciation and underwater months, 20/3/8 and 20/4/10 checks, no-car option).
- Fixtures, expected values written in tests/households/expected.py from the fixtures, never from the engine:
  - Maya: Jersey City NJ, gross 68,000, take-home 1,900 biweekly, rent share and bills from Level 10 fixtures, card with a statement balance, one pay-later plan. Calendar: low point, safe to spend, paycheck map, a bill timing fix that raises the low point. Home: at 10 percent down, a 6.5 percent rate and NJ defaults, the lender answer is roughly 190,000 and the comfortable answer (35 percent of take-home, about 1,440 a month including 1 percent maintenance) roughly 160,000. Car: no car vs a used car in an HCOL area (no car should win on cost per month and FI date).
  - Starter and mid-career households from Level 12 for the house rent vs buy and the car options.
  - A rent vs buy fixture reproducing the Buy vs Rent workbook's default inputs, with expected values from the corrected model.
- Extend tests/ui.js: #/calculators, #/calendar (grid, weeks, line, paycheck map, year strip, can I spend this, outlook), #/calc/home-afford, #/calc/house, #/calc/car, each in both views at three widths and both themes, plus the screenshot critique loop in section 1.
- Run node tests/run.js and node tests/ui.js until green. Update README map, CONTRACTS.md, SPEC-COVERAGE.md, PROGRESS.md, DONE.md. One commit for Level 13.

At the end, give me: what you built, whether the cashflow engine was ported from a file or rebuilt from the spec (and every difference from the spec), Maya's calendar (safe to spend, low point, the bill timing fix), her three home answers and down payment ladder, her car comparison, what changed from the Buy vs Rent workbook and why, the full list of data values with sources to verify, the design critique and what you fixed, anything you decided that I should confirm, and the QUESTIONS.md list.
