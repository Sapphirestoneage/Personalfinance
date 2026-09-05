# SPARKS / SLAF — Design audit brief

*A self-contained write-up of everything the app is and does, written so it can be
pasted whole into a chat with an AI or handed to a reviewer who has never seen the
repo. Facts below were read off the code and the decision log on 2026-09-05
(DECISIONS.md D-001 … D-130). Live site: https://sapphirestoneage.github.io/Personalfinance/*

---

## 0. How to use this document

If you are the auditor, the ask is:

> Audit the design of this personal-finance app. Judge (1) the information
> architecture — is 55 rooms navigable, do the groupings and the guided path make
> sense; (2) the onboarding — does the one-page intake with pre-filled guesses build
> trust or false confidence; (3) the numbers — are the 45 ratios, the score, the
> ladder and the FI date presented in a way a non-expert can act on, or is it
> overload; (4) the ledger loop — income entries → expense log → reflected budget →
> month close → variance — is it a habit someone would keep; (5) the rules the app
> holds itself to (below) — are they the right rules, and where do they cost the
> user; (6) what is missing for a real household; (7) rank the recommendations in
> §12 and add your own. Be specific: name the room, the number, and what you would
> change.

Everything you need is here: the rules, the architecture, every room and what it
shows, every number a person can read, every value that is pre-filled and from
where, every user-facing mechanic, the data behind it, the known gaps, and the
builder's own recommendations.

---

## 1. What it is, in a paragraph

SPARKS / SLAF is a suite of 55 small, self-contained personal-finance tools
("rooms") that all read from and write to **one household model** kept in the
browser. Static HTML + vanilla JavaScript, no build step, no server, no account, no
analytics, no network call after the page loads; the data lives in `localStorage`
and leaves only as a file or a share link the person makes. You answer one page
(Start Here), and every other room opens already filled in. The Dashboard is home:
it says where you are, the next thing money should do, the next thing to learn,
and the date it all points to. A companion, **Dungeons & Dividends**, turns the same
numbers into an RPG character sheet.

---

## 2. The rules it holds itself to (design constraints, from CLAUDE.md / SPEC.md)

These shape every screen and are worth auditing as choices:

1. **Public repo, no real financial data ever.** Demo numbers only, behind an
   explicit "Try with example numbers".
2. **Empty ≠ zero.** A blank box means "not entered"; `0` means the person typed
   zero. They never collapse. Every input starts empty with a format-only
   placeholder.
3. **No silent `|| 0` in formulas.** A missing required input produces an
   *incomplete* state with a reason ("Add your income in Start Here to see this"),
   never a number.
4. **Money is integer cents internally**, dollars only at display time.
5. **One owner per shared number.** Each field is editable in exactly one room;
   everywhere else it renders as a read-only "owned chip" that links to its owner.
   The map is `shared/ownership.js` (91 fields).
6. **One formula, one function.** Variants are parameters, never copies.
7. **Never rebuild a container of live inputs while someone is typing** (a
   phone-keyboard rule): rooms either guard the form or build controls once; a
   phone-browser test taps through every form.
8. **Reference data lives in `data/*.json`**, versioned by year, each table stamped
   with `version`, `asOf`, `source`, `confidence` (verified / sourced / convention /
   unverified). The confidence is shown to the user where it matters.
9. **Facts get answered once; what-ifs get thrown away** (D-052). A hypothesis is
   never written to the household.
10. **A suggested value is shown, never stored** (D-060). A pre-filled guess is
    rendered muted with a dashed underline and a "use this" chip naming its source;
    no engine ever reads a suggestion; progress counts it unanswered.
11. **Not applicable is not missing** (D-055, D-129, D-130). A field a situation
    rules out, or one the person marks N/A, is never counted as an outstanding task.
12. **Educational tool, not advice.** Every page ends with that line; a "Get Help"
    room says what the app deliberately does not do and what kind of person to ask.

---

## 3. Architecture in one screen

- **The spine** (`shared/spine-v2.js`): load/save of the household, a command log
  that gives undo/redo on every page (across tabs), `confirmedAt` stamps per field
  (the "clock"), snapshots ("Freeze today's numbers"), a share code, import/export.
- **The schema** (`shared/schema.js`): constructors for every stored shape (people,
  income sources, income entries, expense entries, assets, debts, goals, the
  ledger's closed months, the budget's estimates and presets, the calendar, the
  what-if branches per room), plus derived reads (gross income, monthly expenses,
  cash, investments, age, rent, one-off, …).
- **Ownership** (`shared/ownership.js`): the field → owner room → anchor map, with
  `applies()` gates, guess/entered/room provenance, staleness age, and the chip
  renderers.
- **Registry** (`shared/registry.js`): 55 rooms with kind (core 6 · about-you 32 ·
  read 9 · explore 8), order (the walk), deep-link anchors, requirements (the gate
  that hides a room until its situation exists), and the "lead number" per
  situation.
- **Engines** (`engines/*.js`, ~50 files): pure functions returning a Result
  `{status: ok|incomplete, value, reason, missing, …}`. Notables: tier0 (the core
  ratios), ratios (45 ratios with bands), tax (federal brackets, FICA, SE tax, state,
  ACA cliff), ledger (dated income netted four ways), cashflow (the log), budget
  (reflected budget + close + variance inputs), presets, calendar, statement,
  benchmarks, fire, debt, events (life-event simulator), skills, health (the score).
- **Data** (`data/*.json`, 64 tables): tax brackets and rates, IRS limits, SE tax,
  state brackets, ACA, SCF net-worth percentiles, retirement milestones, wealth
  multiplier, five levels of wealth, ratio benchmarks and explainers, expense
  categories, budget templates, debt rules, FIRE variants, FOO rules, health score,
  ten life-event templates, housing/price-to-rent/mortgage/moving/childcare tables,
  conventions for every what-if room, the one-pager's default guesses.
- **Tests**: 17,240 unit checks (hand-derived math, page shape, ownership,
  registry, data headers, freshness of `rooms.json`), 2,173 for the D&D side, an
  export/import round-trip, a layout-alignment sweep, and a Playwright run that taps
  through every form on a Pixel-7-sized browser.

---

## 4. The front door: Start Here (the one-pager)

**One gate, then at most ten cards.** The gate asks your situation, six options,
each with a one-line blurb and a *lead number* the dashboard will foreground:

| Situation | Lead number on the dashboard |
|---|---|
| Employed — a W-2 job | Savings rate |
| Self-employed or 1099 | Owner's pay, a month |
| Between jobs | Runway, in days |
| Student | Loans clear in (year) |
| Retired | Withdrawal rate |
| Mixed — a job and my own work | Savings rate |

**The cards** (shown only when the situation needs them): Your situation · About
you (born, state, filing) · What you earn (up to two people, rate + basis + hours)
· Your own work · Between jobs (benefit, weeks, last pay) · The other person · What
goes out (a month of spending, "no rent" answer) · Cash and the deductible ·
Investments (three boxes) · Your 401(k) (match %, of the first %, you put in %,
"there's no match") · What you owe (a lump, refined in Debt Payoff) · Fine-tune
drawer (a one-off in or out, dependents, …) · Paste numbers in (a statement or
list, sorted into debts / accounts / expenses / income).

**Every box is a guess until it is yours.** Each guess is muted with a dashed
underline and a "use this" chip naming its source; leaving it untouched flags the
field as `guessed` and every room shows it as "a guess — fix it in Start Here".
Six situations walk in under a minute in the phone test.

---

## 5. The Dashboard (home)

**First screen, four blocks:**

1. **Where you are** — a 3×2 instrument grid: Net worth (Altitude), Savings rate
   (Climb), Runway in months (Fuel), Debt-to-income (Drag), FI year (Distance),
   FOO step (Rung). The situation's lead number replaces one tile (Owner's pay for
   the self-employed, Runway days between jobs, Withdrawal rate retired, Loans
   clear in for students). Every tile opens the room it came from.
2. **The next thing money should do** — the Financial Order of Operations step you
   are on, or the first out-of-bounds flag, with the one action and a link.
3. **The next thing to learn / unlearn** — from the Unlearning room: which piece of
   common advice applies to you next, and which you have let go of.
4. **The date it points to** — the FI date, with the display-unit lens (read the
   amounts that move it in dollars, hours of your life, or months of FI), and the
   staleness of the three figures that move.

**The full panel (folded):** the radar ("Am I in the green everywhere?" — every
banded ratio at once); Altitude (what net worth is made of, and the climb ahead:
wealth multiplier, monthly to $1M/$2M, the five levels of wealth); Weather (risk
exposure: income concentration, worst-year coverage, liquidity, with a note on the
two risks it deliberately leaves blank — sequence of returns and longevity);
Flight plan (the nine FOO steps with the sapphire lit as each lands, beside the
five levels); Reading from elsewhere (every owned chip); default display unit;
your data (export, share link, freeze).

A **3D toggle** re-renders the instruments as a plate (a visual option only).

---

## 6. Every room, what it shows

Grouped by registry kind. "You see" lists the numbers and outputs a person gets once
their household is filled in.

### Core (the six that hold the facts)

- **Start Here** — the one-pager above.
- **Cash Flow** — At a glance (four tiles: in, out, left, a month of spending);
  A typical month (categorised lines with a per-line frequency aid, fixed-vs-cuttable,
  "track this" to make it the tracked figure); **The expense log** (dated
  occurrences: amount, date, *how sure the date is*, category, note, *what it
  produced*: personal / a cost of earning an income entry (deductible only then) / a
  repayment someone owes back, "Paid back" on the line); Where it flows (a Sankey
  from live entries: income entries → take-home pool → buckets → groups, a repayment
  as an inflow); Monthly spending; What's left; Against a template (50/30/20 etc.);
  Guess vs reality (tracked − estimated). Owns the rent line.
- **Debt Payoff** — every debt (kind incl. family loan with no interest, N/A,
  archive, dates); beyond the minimums; debt-free in; which order (avalanche,
  snowball, worst-first, convenience) and what each costs; rewards; the timeline
  with a per-debt line and dates; owed-by-kind bars.
- **The Statement** — three portfolios (liquid, retirement, property); rate what you
  own (liquidity and confidence scales per asset, access age); the liquidity ladder;
  the bridge to 59½; your brackets; the worst plausible year; money that is coming;
  confidence-weighted net worth; net worth. *Since D-130:* beside the cash figure,
  what the ledger and the log say has moved since you confirmed it — shown, never
  applied.
- **Financial Snapshot** — the payoff page, nine numbers: net worth, savings rate,
  emergency-fund months, debt-to-income, FIRE number, FIRE progress, net-worth
  percentile (SCF), retirement benchmark (multiple of salary at your age),
  "three benchmarks and they disagree — here's why" (SCF percentile · retirement
  multiple · prodigious-accumulator PAW/AAW side by side), your FOO rung, and every
  out-of-bounds flag.
- **The Dashboard** — §5.

### About you (32; the rooms that write a fact or a plan of yours)

- **Income** — every dated income entry: nine kinds (W-2, 1099, bonus, gift, side,
  dividends, rental, unemployment, other), amount, frequency (once / weekly / every
  two weeks / monthly / annual), first received on, *how sure the date is*, and
  **Taxed how — exactly four**: W-2 withheld before it arrives · 1099 owed later
  with self-employment tax · Unemployment taxable, nothing withheld, no SE tax ·
  Not taxable. The costs of earning it (mileage, home office, equipment, contractor
  fees, licensing, platform fees) per entry, deductible or not. You see per entry:
  gross, net, tax, withheld vs owed at tax time; this month's gross / net / tax /
  costs; the archive prompt when a one-time entry's month closes; hide / set aside
  / restore.
- **Budget** — five bucket cards (Income, Expenses, Savings, Investments, Debt), one
  Estimated-vs-Actual bar each (green within, red over, amber for income short);
  zero input fields — nothing is typed here. Estimated comes from a hand-set figure,
  else the presets stacked into it, else the last closed month's actual, else the
  onboarding figures; Actual comes from Income (netted) and the log (by bucket). A
  card opens to its lines and its Add button (routes to Income or the log and comes
  back). **Presets** in Savings and Investments: Rule of Five (from Big Purchase's
  price), Emergency fund (to three months over a year), Max the IRA, Max the 401(k)
  (absent until you say you have one; asked once). **N/A** on the structural ones.
  **What-if** (Hypothetical) view: dashed amber, N/A options back, nothing saved.
  **Close the month**: freezes both columns as a record; a late entry shows as
  "revised", the record never moves.
- **Estimated vs Actual** — one closed month (bucket by bucket, over/under, %);
  month over month (trend); bucket by bucket (the pattern: which guesses are
  getting better, and a proposed estimate for next month — its one write).
- **Sleep At Night** — your number (the cash that stops the 3am arithmetic) beside
  the maths' number; your highest deductible; coverage checkup (out-of-pocket max,
  term life, disability, umbrella against what is held); the gap; milestones.
- **Real Hourly Wage** — the job's real rate once every hour and cost is counted;
  where the week goes; the hours it takes; amounts priced in life.
- **Worth the Hassle** — what a money-saving chore pays an hour against your real
  rate, with how much you hate it.
- **Where It Goes & how it's split** — retirement setup (workplace %, Roth so far,
  HSA so far, HDHP, family plan; *N/A for "no plan" and "no HSA"*); Roth vs
  Traditional vs taxable; Solo 401(k) room; target allocation and rebalance band.
- **What Matters** — the five things you say matter most, next to where the money
  went; the two lists; what serves nothing you named.
- **The Rerank** — costs in order of size, then in order of value; cut / keep / ok;
  the annual flagged amount and its FI impact (×25).
- **The Skill Stacker** — three money skills at a time; did it or didn't; what today
  was worth; what the ledger becomes by 65.
- **Enough** (fulfillment) — what each thing costs a month against what it is worth
  to you, and the four places that lands.
- **Enough** (enough) — the monthly figure you would live on by choice, typed or
  proposed from the joy curve, and the second FI number it makes. *(Two rooms carry
  the title "Enough"; see §12.)*
- **Goals** — a wedding, a deposit, a trip, a sabbatical, a car, custom: cost, a
  month, and whether it fits beside everything else (one goal-costing engine, six
  templates).
- **Worth It** — what you thought a purchase would be worth before, against after;
  what the gap says about your guesses (retro + prospective, regret as a filter).
- **The Score** — one number for the whole picture, weighted for your decade
  (Cushion, Debt load, Saving, Retirement, Housing, How it's held; bands Strong /
  Solid / Mixed / Strained), and every part of how it was arrived at.
- **FOO Ladder** — the nine steps walked month by month (cover basics → starter
  fund → capture the match → high-interest debt → full fund → HSA → Roth →
  remaining tax-advantaged → hyper-accumulation → prepay low-interest / goals),
  with the two classic out-of-bounds flags.
- **Refresh** — the three figures that move (cash, investments, owed) re-checked in
  under a minute ("still true?"), then freeze a snapshot.
- **Between Jobs** — the runway against the search: the day the cash runs out with
  the benefit and severance counted, and the floor you could drop to.
- **Protection** — health, disability, life, the cushion: each need against what is
  held; what a bad year would cost.
- **Decumulation** — withdrawal rate against the convention, what the
  variable-percentage table allows at your age, the age the money lasts to.
- **Tax** — federal, state and payroll: effective rate, marginal bracket and the room
  left in it, refund or bill coming; reads the ledger's year by method when entries
  recur (unemployment as ordinary income with no payroll tax).
- **Estate Basics** — beneficiaries named, a will, a power of attorney; what would
  pass without them.
- **Giving** — a share of income, in dollars and months of FI, against conventions.
- **Career Move** — an offer against the job: real hourly wage of each, take-home
  difference, how far the FI date moves.
- **Partner** — two incomes, one household: how the shared month is split (equal,
  proportional, pooled), what each keeps, how much rides on one paycheque.
- **Kids and Tuition** — what each child costs a year at their age, childcare while
  small, what tuition needs a month.
- **Housing Decision** — rent against buying, this place, this rate: monthly cost of
  each, price-to-rent, years to a down payment, cash after and the floor. *The rent
  you pay is Cash Flow's housing line; the field here is "a place you would rent
  instead".*
- **Big Purchase** — one thing you are eyeing: hours of your life, months of FI, cash
  after, what financing costs. (Its price feeds the Rule of Five preset.)
- **Variable Income** — a filtered view of income entries with a 3/6/12-month rolling
  average: a low month, a high month, the salary to pay yourself, the buffer.
- **Designed Week** — 168 hours in blocks, what each costs and buys, the month it
  adds up to.
- **Time Buckets** — what you plan to do in each decade, priced, against the money
  there will be.
- **Dreamline** — dreams priced a month plus cost of living, padded: the target
  monthly income and the hours a week at your real rate.
- **Reversibility** — what a decision costs to undo, and how long: a door or a
  one-way street.
- **Unlearning** — the advice everyone hears, sorted by whether it still applies to
  you; the rules you have let go of.
- **Student Loan Decision** — standard, income-driven, aggressive: what each pays a
  month, when each clears, what each costs.
- **Money Calendar & Pay-Later** — 31 days from today drawn from the ledger's
  landings (each for the cash it brings net of withholding) and the expense log's
  dated entries (recurring on their day), the rest of spending spread daily, the low
  point and the day it lands, the tight stretch, below-zero days; estimated dates
  dashed, potential dates faded and never counted. Two inputs (cadence, next payday)
  used only when Income has nothing landing.
- **History** — every snapshot you froze, net worth over time, what moved between
  them, compare-to, the change log.

### Read (9; the rooms that only read)

Financial Snapshot · Estimated vs Actual · Savings Rate (both ways of counting it
— residual and contributed — and what one more point is worth) · FIRE Number (lean,
standard, chubby, fat, coast, barista from one formula; your targets: stop working
at, coast: arrive by; try different assumptions) · Every Ratio (45 ratios, each with
a ⓘ: what it is, why it matters, what moves it, links to every input's owner room)
· Dashboard · Worth Learning (a credential: cost incl. time, the raise after tax,
payback) · Get Help.

### Explore (8; what-ifs that keep nothing)

Quick Math (HYSA switch, cost per use, the 20/3/8 car rule, the rule of five, the
$30k/$90k habit rule) · Going Self-Employed (salary vs contract, where the 15.3%
lands, quarterly estimates) · Side Hustle (what it pays after tax, costs and hours;
the week with it in) · The Windfall (all at once or spread, and the condition under
which spreading wins) · The Runway (the income stops: months, and what buys more;
"at the floor" variant) · What If, Life (ten templates: sabbatical, kids, job
change, house/house-hack, freelance, move, debt sprint, big purchase, retire or
coast, partner merge — each run three ways: dream / default / disaster, month by
month) · Your Data · Get Help.

---

## 7. Every number a person can read

**The core (tier 0):** net worth, savings rate (residual and contributed), take-home
a month, emergency-fund months, debt-to-income, FIRE number and progress, FI year,
runway.

**The 45 ratios in Every Ratio** (banded where a convention exists, with the
band's source named): debt-to-income · housing ratio (front-end) · back-end ratio ·
savings rate · emergency fund coverage · credit utilisation · net worth to income ·
liquidity ratio · solvency ratio · current ratio · retirement savings multiple ·
life-insurance needs multiple · car payment to income · invested share of what you
own · FI ratio · debt to asset · personal cash-flow ratio · rule of 72 · safe
withdrawal rate · loan to value · home equity ratio · debt payoff velocity · burn
rate · runway · liquid to illiquid · cash drag · revolving to instalment · needs to
wants · discretionary income ratio · real-estate concentration · income
concentration · confidence-weighted net worth · reachable within a year (the
liquidity ladder) · shadow runway (home equity haircut) · worst-year coverage ·
automation ratio · giving rate · net worth in years · human to financial capital ·
room in your bracket · bridge to 59½ · lifestyle inflation · net worth growth ·
withdrawal rate · FI date. Two ratios the app refuses to guess at are named as such.

**Benchmarks:** SCF net-worth percentile (2022), retirement multiple by age, wealth
multiplier at age, PAW / AAW, the five levels of wealth, monthly to $1M / $2M, what
1% more is worth, human capital.

**The Score:** one number, six components weighted by decade, four bands.

**The ladder:** FOO step 1–9, and the two out-of-bounds flags.

**Tax:** effective rate, marginal bracket, room in bracket, federal / state /
FICA / SE tax, refund or bill; per income entry: tax, withheld, owed, cash received.

**The ledger:** this month's gross / net / tax / costs; per bucket Estimated,
Actual, difference, revised; the closed-month record; variance and trend;
pending reimbursements; potential amounts drawn but not counted.

**The calendar:** the low point and its day, first day below zero, slack or
shortfall, the tight stretch, each day's balance.

**Everywhere:** every amount can be read through the lens as dollars, hours of
your life (at your real hourly wage), or months of FI.

---

## 8. What is pre-populated, and from where

### 8.1 Start Here guesses (shown muted, "use this" to accept; never stored until accepted)

| Box | Guess | Source |
|---|---|---|
| Pay (employed / mixed) | $62,000 a year | US median full-time pay (BLS 2025, rounded) |
| Pay (self-employed) | $55,000 a year | a typical self-employed profit |
| Pay (retired) | $3,500 a month | a typical retired household's income |
| Pay (student) | $600 a month | a part-time job's worth |
| Own work (mixed) | $12,000 a year | a typical side income |
| A month of spending | 55% of gross (35% with "no rent"), floor $2,200; student $1,400 | spending share conventions |
| Cash & savings | one month of that spending | one-pager default |
| Highest deductible | $1,500 | a common health-plan deductible |
| Investments | the retirement milestone for your age × income, else $5,000; student $0 | data/retirement_milestones.json |
| Match | 50% of the first 6% | data/match_defaults.json |
| You put in | 6% | enough to take the whole match |
| Filing status | single, or joint with a partner | from "two of us" |
| Any debt | no; yes for students | convention |
| Between jobs: weekly benefit, weeks | the state's cap and duration | data/ui_benefits.json, by state |
| Between jobs: last pay | $62,000 | US median |
| State | suggested from the browser locale where possible, shown never stored | D-060 |

Every table above carries `confidence: unverified` and says so in the chip.

### 8.2 Values proposed inside rooms (the "propose" pattern: a chip, accepted or not)

- Housing Decision: the rent you pay (Cash Flow's housing line), else 30% of gross;
  the price (price-to-rent × a year of rent); 20% down; the 30-year average rate.
- Career Move: hours, commute and costs from the current job's Real Hourly Wage
  inputs.
- Decumulation: stock share, planned draw (4% convention), Social Security age.
- Variable Income: low / high month from the ledger's rolling window; buffer months.
- Between Jobs: expected search months and the floor (a month of fixed lines).
- Student Loans: the plan and the extra from conventions.
- Giving: share of income from conventions.
- Enough, Designed Week, Time Buckets, Reversibility, Partner: one proposal each
  from their convention table or the joy curve.

### 8.3 Derived automatically (no proposal, just read)

- Everything an owned chip shows in another room (91 fields): a room never asks
  for a number the household already holds.
- A month of spending: the **closed months' average** once months close, else the
  tracked figure, else the estimate.
- The rent a month: Cash Flow's housing line (typical-month line, or a recurring
  logged rent).
- Budget Estimated: hand-set → presets → last closed month's actual → onboarding
  figures (take-home from Start Here, typical-month lines by bucket, workplace
  contribution %, debt minimums).
- Budget Actual: income entries netted by their tax method × landings this month;
  the log by bucket; reimbursements credited in the month received.
- The Tax room's year: from the ledger by method when entries recur, else from
  Start Here's sources.
- Age from date of birth (one function); the catch-up at exactly 50 in the IRA /
  401(k) presets.
- The calendar's paydays from income entries; its bills from the log; the one-off
  from Start Here as a dated entry.
- The dashboard's lead tile from the situation; the FOO step from everything.
- Staleness: how old each figure is, from its `confirmedAt` stamp, judged against
  data/staleness.json.

### 8.4 Import

Your Data → "Paste numbers in": each line is sorted by keyword into a debt, an
account, an expense line or an income source (data/import_keywords.json), with a
date and how sure it is when the line carries one, and landed as one batch you can
undo.

---

## 9. User-facing mechanics (things a person can do)

- **Undo / redo on every page**, across tabs, with worded labels ("Changed a goal",
  "Paid back: subscriptions").
- **Owned chips**: every read-only number links to the room that owns it; the chip
  shows whether the value was entered, a guess, or written by another room, and how
  old it is (stale is amber).
- **Deep links**: every section of every room has an anchor; the map lists them.
- **The lens**: read any amount as $, hours of your life, or months of FI; a default
  per household.
- **Freeze today's numbers** (a snapshot) → History (net worth over time, what
  moved, compare-to) → Refresh (the three that move, re-confirmed in a minute).
- **Hide / set aside / restore** for income entries and log lines (Manage panel);
  the archive prompt when a one-off's month closes.
- **Close the month**; late entries show as revised; append-only records.
- **N/A** for structural options (no 401(k), no HSA, no plan); the option drops
  from every live figure, the row never nags, and it is lifted with one tap.
- **Hypothetical / What-if view** in Budget: try N/A'd options and presets with
  nothing saved; the live budget is byte-identical before, during and after.
- **Reimbursements**: "Paid back" on a log line; the credit lands in the month it
  came, never retroactively.
- **How sure the date is**: exact / estimated / potential on every dated entry.
- **Export a file, copy a share link (the whole household in the URL), load a file
  replacing or adding, clear the browser.**
- **Try with example numbers** on every room (a demo persona), never silently.
- **Phone-first forms** tested by touch; the soft keyboard never gets closed by a
  re-render.
- **ⓘ explainers** on every ratio with each term linked to its inputs' owner room.

---

## 10. The data behind it (64 tables, each stamped)

Tax: federal brackets 2026, effective tax rates 2026, SE tax 2026, state brackets
2026, ACA 2026, IRS limits 2026 (**unverified against the IRS notice**), UI benefits
by state. Benchmarks: SCF net-worth percentiles 2022, retirement milestones,
wealth multiplier, levels of wealth, ratio benchmarks, ratio explainers, health
score. Spending: expense categories (nine groups + savings / investments / costs of
earning), budget templates, common costs, values. Debt: debt rules, student-loan
conventions. FIRE: fire variants, VPW table, SS bend points 2026, return bands,
Triple D. Life events: ten templates + COBRA/ACA, travel bands, re-entry gap, child
cost, childcare by state, housing conventions, price-to-rent, mortgage rates, COL
index, moving cost. Rooms' conventions: protection, estate, giving, variable
income, partner, unlearning, week blocks, bucket ideas, dreamline, reversibility,
calendar, access rules, confidence weights, staleness, hassle defaults, goal
templates, match defaults, one-pager defaults, savings presets, advice translator,
import keywords, states. The skill catalogue is shared with the D&D side.

---

## 11. The companion: Dungeons & Dividends (`dnd/`)

The same household read as an RPG character sheet: eighteen questions give a
class; five numbers give Level, Hit Points and Armour Class; STR = earning power
and so on. Pages: the sheet, your card, the bestiary (what comes at you), the
encounter engine (CR → DC ladder, three blocker states, a natural-predator radar),
the weakness map, the type chart (six attack types derived from the bestiary and
which land on you), DM mode. It vendors byte-identical copies of the schema, money
and theme files, so the two never drift.

---

## 12. Builder's own audit: strengths, gaps, recommendations

### What is strong
- **One number, one owner** is real, enforced by tests, and it is why 55 rooms do not
  contradict each other.
- **Empty ≠ zero and no silent zeros** mean the app never shows a confident wrong
  number; every dash has a reason and a link.
- **Guesses that are visibly guesses** make the intake fast without lying.
- **The reflected budget** (nothing typed; Actual comes from what you logged) is a
  genuinely different budgeting model and the phone tests show it holds up.
- **Explainers with linked terms**, confidence stamps on tables, and "what this room
  deliberately does not do" are honest in a way most finance apps are not.

### Gaps and recommendations (ranked by my judgment)

1. **Too many rooms at the front door.** Fifty-five is a library, not a path. The
   registry has an order and the gate hides irrelevant rooms, but the map still
   reads as a wall. Recommend three named paths on the map ("Get the picture",
   "Run the month", "Decide something") of six to eight rooms each, and demote the
   rest to "everything else". Consider merging or folding: the two rooms titled
   **Enough** (ids `fulfillment` and `enough`) must be renamed or merged; Worth the
   Hassle + Side Hustle + Real Hourly Wage are one "hours of your life" family;
   Goals + Big Purchase + Dreamline overlap.
2. **Two ways to say income.** Start Here holds annual income *sources*; the Income
   room holds dated *entries*. The Tax room switches to the ledger when entries
   recur; the dashboard's take-home still reads the sources. A household that keeps
   the ledger should see one funnel: recommend the Income room become the owner of
   income once any entry recurs, with Start Here's card reading it back (and
   saying so), or an explicit "the ledger now drives" banner on both.
3. **The ledger loop needs a nudge system it cannot have.** A static site cannot
   remind you to log or close the month. Recommend a visible "days since you last
   logged / closed" on the dashboard's Where-you-are tile row, and a one-tap "close
   last month" when the 1st passes.
4. **Numbers density.** 45 ratios + score + ladder + five levels + PAW + percentile
   is a lot of verdicts. The Snapshot's "three benchmarks disagree — here's why" is
   the right instinct; extend it: on the ratios page group by "the six that matter
   at your step" first, the rest folded.
5. **Verify the 2026 tables before public promotion.** IRS limits and several
   conventions are stamped `unverified` and shown as such, but a person maxing an
   IRA from a preset will trust the number. Recommend a verification pass and a
   visible "table verified on <date>" line on the presets.
6. **Data durability.** Everything lives in one browser's localStorage. Export and
   the share link exist, but a cleared browser loses the household. Recommend a
   first-run and monthly nudge to save a file or copy the link, and a "last saved"
   line in Your Data.
7. **Accessibility and theme.** The palette is a single dark navy theme; no light
   mode; contrast on faint text and the amber "guess" state should be checked
   against WCAG AA; screen-reader labels exist on inputs but the bar charts and the
   Sankey need text equivalents.
8. **US-only.** Tax, benefits and benchmarks are US tables. The rules make a second
   country a data job, but nothing says so on the door. Recommend a one-line notice.
9. **Guess trust.** A guessed page produces a dashboard that looks real. The
   dashed-amber chips help, but the dashboard should carry one honest line: "N of
   your numbers are still guesses" with a link.
10. **Rerank, Values, Worth It, Skill Stacker, Designed Week, Time Buckets,
    Dreamline, Reversibility, Unlearning** are reflective rather than numeric; they
    are good, but they sit in the same list as tax. Recommend a visible "Reflect"
    grouping so expectations match.
11. **Housing's alternative rent** and **Big Purchase's price feeding Rule of Five**
    are correct by the rules but obscure; each needs its one-line explanation on the
    page (they have hints; test with a user).
12. **Long pages on a phone.** Rooms are single columns with several cards; a sticky
    section nav or "jump to" on the longest (Cash Flow, Statement, Start Here)
    would help.

### Questions I would put to an outside auditor
- Would a normal person close a month? What would make them?
- Is "nothing typed on the budget" a feature they feel, or a wall?
- Do the four Taxed-how options read correctly to someone with a gig and a benefit
  cheque in the same month?
- Which of the 45 ratios would you cut, and which of the six instruments would you
  swap?
- Does the lens (hours of your life / months of FI) change a decision, or is it a
  gimmick?
- Is the D&D companion a door in or a distraction?

---

## 13. Numbers about the build (for scale)

| | |
|---|---|
| Rooms | 55 (+7 D&D pages) |
| Engines | ~50 pure-function modules |
| Owned fields | 91 |
| Reference tables | 64 |
| Ratios | 45 |
| Life-event templates | 10 |
| Decision-log entries | D-001 … D-130 (+ DD-series) |
| Unit checks | 17,240 (+2,173 D&D) |
| Phone-form checks | 347 |
| Dependencies / build step | none |
