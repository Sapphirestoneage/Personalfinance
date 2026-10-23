# Glossary

Every finance term, acronym and project word a programmer will meet in SLAM's code, screens, tests
and docs, and in the archive's READMEs, in plain English. Where the project defines a term its own
way, the file is named. Amounts are dollars a month unless a term says otherwise.

## Money and tax

| Term | Meaning |
| --- | --- |
| **Take-home** | What lands in the bank from a paycheck after taxes and deductions. SLAM's base for every percentage of income unless a label says "of gross" (`slam/LESSONS.md` rule 16). Stored per paycheck on an income (`income[].takeHome`). |
| **Gross** | Pay before anything is taken out. Stored per year (`income[].gross`). Used to guess take-home when the client only knows gross, and for the DRAFTT tax share. |
| **Pre-tax deduction** | Money taken from a paycheck before income tax is figured: a 401(k) contribution, health premiums, an HSA. Lowers taxable pay. `income[].deductions[]` with `pretax: true`. |
| **401(k), 403(b), 457** | Employer retirement accounts, usually funded pre-tax from the paycheck. Account type `401k`, tier 3 (retirement rules apply), counts toward FI. |
| **Traditional IRA, Roth IRA** | Personal retirement accounts. Traditional is pre-tax; Roth is funded after tax and comes out tax-free. Tier 3. |
| **HSA** | Health savings account: pre-tax money for medical costs, kept in an account that can grow. Deduction kind `hsa`; account type `hsa`, tier 3. |
| **HYSA** | High-yield savings account: a savings account paying real interest. Account type `hysa`, cash, tier 1 (S-139). |
| **W-2** | An employee's pay, with taxes withheld by the employer. Income type `w2`. |
| **1099** | Self-employed or contractor pay, no taxes withheld; the earner owes self-employment tax. Income type `1099`; `side` is a smaller side income of the same kind. |
| **Self-employment tax** | Social Security and Medicare paid by a self-employed person (both halves). SLAM: a factor times gross, at the two rates, with half of it taken off income before the deduction (`engines/tax.js`). |
| **FICA** | The payroll taxes an employee pays: Social Security (6.2% up to a wage base) and Medicare (1.45%). `src/data/tax-constants.json` `fica`. |
| **Social Security wage base** | The yearly pay above which Social Security tax stops. 2026 figure in `tax-constants.json`, flagged "from memory" (S-008). |
| **Standard deduction** | A fixed amount everyone may subtract from income before tax, by filing status. SLAM uses it once per household, split across the sources that need it (S-013). |
| **Filing status** | Single, married filing jointly, married filing separately, head of household. Picks the brackets and the standard deduction. `household.filingStatus`. |
| **Bracket, marginal rate** | Income tax is charged in slices: each slice of taxable income at its own rate. The marginal rate is the rate on the last dollar. `engines/tax.js bracketSlices`, `marginalRate`. |
| **Withholding** | Tax the employer takes out of each paycheck and sends ahead. The Tax check compares what is withheld with the year's estimate: more withheld means a refund is likely, less means something may be owed (`engines/income.js taxCheck`). |
| **Refund, owed at tax time** | The difference between the year's withholding and the year's tax, settled when the return is filed. |
| **Ten-percent withholding** | The optional flat 10% federal withholding on unemployment benefits. `income[].withholding: 'ten-percent'`. |
| **APR** | Annual percentage rate on a debt. Stored as a percent number (24.99). One month of card interest is balance times APR over 100 over 12 (`engines/debts.js cardInterest`). |
| **Promo APR** | A temporary lower card rate until a date. `debts[].promoApr`, `promoEnds`; the calendar warns when it ends (S-127). |
| **Minimum payment** | The least a lender accepts each month on a debt. `debts[].minimum`; the budget's Debt payments lines are computed from these, never typed. |
| **Avalanche, snowball** | Two orders for paying extra on debts: highest rate first (avalanche) or smallest balance first (snowball). Built in the archived generations; SLAM has no payoff simulation yet (`KNOWN_ISSUES.md`). |
| **BNPL** | Buy now, pay later installment plans (Klarna, Affirm). Debt type `bnpl`; an entry flagged `bnpl`. |
| **Net worth** | Everything owned less everything owed, on a day. `engines/networth.js netWorthAt`. |
| **FI net worth** | Net worth counting only what could fund a life: cash, investments and retirement accounts, not the home or the car or the debt they secure (S-111). |
| **Locked in things you use** | Net worth minus FI net worth: the home, the vehicle, and the debt secured by them. |
| **Paid ahead** | A yearly bill already paid for months to come, booked as an asset that runs down by its monthly share, so net worth does not drop the month the bill is paid (S-119, rule 23). |
| **Contributions** | Money put into savings, investment or retirement accounts. Never typed: computed from transfers in the log and from paycheck deductions linked to an account (S-110). |
| **Emergency fund** | Cash set aside for a lost job or a big surprise, measured in months of spending. A savings line type in SLAM; a metric in the archived generations. |
| **Runway** | How many months cash would last at the current burn. `engines/next-stage.js` for a job change; the archived apps used it widely. |
| **Cushion** | The cash balance the coach never wants the account to fall below. `cashflow.cushion`, coach-only; "safe to spend" is measured against it. |
| **AGI, taxable income** | Adjusted gross income is pay after pre-tax deductions (and half of self-employment tax); taxable income is AGI less the standard deduction. The tax walk shows each step (`engines/income.js taxWalk`). |
| **Additional withholding** | An extra per-paycheck amount a W-2 worker asks the employer to hold back (W-4 step 4c). A prepayment, so the year's estimate does not change (S-101). |
| **Refund likely, owed at tax time** | The Tax check's verdict: more withheld than the year's estimate means a refund is likely; less means setting aside about so much a paycheck covers it. |
| **SDI, PFL, SUI** | Optional paystub lines: state disability insurance, paid family or medical leave, the employee share of state unemployment. `income[].withheld`. |
| **QBI deduction** | The qualified business income deduction on some self-employment income. Not included in SLAM's tax guess (S-013). |
| **FSA** | Flexible spending account: pre-tax money for health costs, mostly use it or lose it each year. The HSA/FSA deduction kind lowers income tax and FICA. |
| **529, cash value life insurance** | A tax-advantaged college savings account; the savings part of a permanent life policy. Both account types, tier 3. |
| **Account kind, tier, counts for FI** | Every account type has a kind (cash; invested, which can rise or fall; valued, a thing you own and use; owed, a card), a liquidity tier (1 cash now, 2 sell within days, 3 retirement rules or a penalty, 4 not liquid) and whether it counts toward FI. `store/schema.js ACCOUNT_TYPE_INFO`. |
| **Cash on hand** | Checking plus savings plus cash, each at its latest month end (S-084). |
| **Credit limit, available, used** | A card's limit, what is left of it, and the share used (S-137). |
| **Statement balance** | What the latest card bill says is due; a card can be paid at its statement balance or at the minimum (`debts[].payWith`). |
| **Equity, never back, depreciation** | For a home or vehicle: what is owned outright; the monthly cost never recovered (interest, tax, insurance, maintenance, depreciation, the return the equity could earn); the value lost each year (a Guess at 15% for a vehicle without values, S-113). |
| **Accrual** | A yearly cost counts as a twelfth every month instead of all in the month it is paid (`engines/normalize.js`). The payment itself appears in the bridge. |
| **Coverage choices** | Health coverage from an employer, a parent, the marketplace (ACA), public coverage (Medicaid, Medicare), school, or none (`coverage.how`). COBRA, keeping a former employer's plan, is only in the parking lot. |
| **Deductible, out-of-pocket max** | What you pay before insurance pays; the most you can pay in a year. Yearly Values in Setup, Health coverage. |

## The budget

| Term | Meaning |
| --- | --- |
| **Estimate** | The client's own number for a line, given before the truth is known. Never overwritten by the app (rule 17). `lines[].estimate`. |
| **Plan** | Next month's intended amount for a line, decided in review; the only place adjustments live (S-076). `plans['YYYY-MM']`. |
| **Actual** | What was really spent in the month. Computed from the log when entries exist (rule 20); typed only to fill a gap. |
| **Gut number** | The client's one-figure guess at total monthly spending, asked first. `doc.gut`. The gut check compares it with the real total. |
| **Rough pass** | The first quick pass over the categories: one number each, no lines. Category-level estimates (S-010). |
| **Single total, "Everything else"** | One number for all spending, stored on a special category; later estimates are carved out of it so the total is never lost (S-005, S-019). |
| **Category, line** | The budget tree: categories (Housing, Food, Transport, ...) each holding lines (Rent, Groceries, ...). Every amount on a line is a Value. |
| **Line type** | A standard kind for a line (rent, groceries, car-payment, therapy, emergency-fund, ...) that decides which calculations it joins (S-068). `store/types.js`. |
| **Fixed, variable** | Whether a line is the same every month (rent) or moves (groceries). `kind`. |
| **Need, want** | The 50/30/20 split: needs are housing, food, transport, insurance and minimum payments; wants are the rest; savings is the third share (S-006, S-048). |
| **Status** | How sure a value is: `known`, `roughly`, `will-email` (the client will send it), `dont-know`, `not-for-me` (does not apply, counts as an answered zero), `guess` (an app-supplied average), `computed`. A blank is `null` (S-002). |
| **Blank, empty is not zero** | A Value with no amount and no status: not asked yet. Never treated as 0 anywhere in the math (`engines/money.js`). |
| **Guess** | A number the app supplied from an average, always labeled with its source (rule 15). |
| **Cadence** | How often an amount comes: per paycheck, week, month, year, or once. Everything is normalized to a month for totals; one-offs stay out (`engines/normalize.js`). |
| **Normalize to monthly** | Turn any cadence into a monthly figure: weekly times 52 over 12, yearly over 12, per paycheck times paychecks a year over 12. |
| **Parts** | Items inside one amount (Uber, bus, subway) whose sum is the amount (S-074). |
| **Linked, reimbursable** | A line paid by an income (a business expense) or paid back by someone else; `path`. Owed back amounts are tracked (`owedBack`). |
| **Split bill** | A bill shared with others: the total, how many people, your share (S-122, S-134). |
| **Surplus** | Income less spending and savings for the month; uses the log's actual income when the month is tracked, else take-home (S-118, S-135). `engines/totals.js budgetTotals`. |
| **Surplus rate, savings rate** | Surplus as a share of income; savings plus pre-tax retirement as a share of take-home plus pre-tax retirement (S-138). |
| **Blind spot** | The share of spending that came in above the estimate, or had no estimate at all (S-015). |
| **Personal correction factor** | The average actual-to-estimate ratio over the months so far; "1.07x off this month" (S-016). |
| **Completion** | How filled in the picture is, weighted by how much each fact matters (S-017). Separate from how the client is doing (rule 14). |
| **Next card** | The three most useful things to do next, biggest first (rule 8, S-018). |
| **Mistake, mistake cost** | A line the client tags as a mistake, and what those add up to a month and a year. Coach-only until shared (S-096). |
| **Joy, stress** | A 1 to 10 rating on a line: how much it is enjoyed; how much it drains (S-082). The joy lens is spending per unit of joy. |
| **50/30/20** | A rule of thumb: half of take-home to needs, 30% to wants, 20% to savings. A descriptive lens in SLAM (`engines/lenses.js`). |
| **FAT** | Food, Accommodation, Transportation: the three boxes whose total is a lean month (SPARKS D-172; `engines/totals.js FAT_CATEGORIES`). |
| **DRAFTT** | Debt, Retirement, Accommodation, Food, Transportation, plus Therapy: a way of reading a budget as shares of take-home plus pre-tax retirement. Descriptive only in SLAM, no grades (S-072). The archived version graded against bands. |
| **DAITE** | Debt, Assets, Income, Taxes, Expenses: the five money families every number belonged to in SPARKS (D-171). Not used in SLAM. |
| **Lens** | A re-reading of the same numbers in another unit or frame (dollars, hours of work, 50/30/20, DRAFTT, the income statement, joy). No new data comes in (`engines/lenses.js`). |
| **Hours of work** | A dollar amount expressed as hours of the client's own take-home pay (`hourlyTakeHome`). |
| **Income statement** | Gross to take-home to spending to what is left, like a company's, for one month. |
| **Basis** | The number a total uses for a category: the actual when one exists, otherwise the estimate, and the screen says which (`engines/totals.js basisFor`). |
| **Break down, Use one number** | Rough can split a category into sub-categories whose lines then carry the estimate; "Use one number instead" brings the client's own number back (S-078). |
| **Quick lines** | One box that adds several sub-categories at once ("claude 216 spotify 21 youtube 27"), `engines/quick-lines.js`. |
| **Small stuff** | Anything under 100 dollars a year is not asked about one by one (S-018). |
| **Keep, cut, change, new** | The decision on each plan line in review: keep it, cut it to zero (the line stays so a comeback shows), change it by typing an amount, or add a new one (`plans[].lines[].decision`). |
| **Not allocated yet, Extra on debt** | Savings lines allocate the surplus to saving, investing or extra on debt; what is left is "not allocated yet" and never counts in the savings rate (S-138). |
| **Proof of cash** | Entered spending (without debt payments) compared with take-home less savings less debt payments; flagged when the gap is above 15% (S-014). |
| **Accuracy, x off** | Actual divided by estimate for a month: "1.07x off this month". |
| **Culprits** | The categories whose actual ran furthest over the estimate, in Insights, Compared. |
| **Blind guess, blind round** | The client estimates again without seeing their earlier numbers, in a revisit session; kept in `blindRounds[]` as their own words. |
| **Housing share, the 35% line** | Housing as a share of take-home against a reference line of 35% (`src/data/benchmarks.json housingBand`). |
| **Cost-of-living tiers** | HCOL, MCOL, LCOL multipliers on the Guess averages, removed from SLAM because they added false precision (S-070). |

## The monthly loop

| Term | Meaning |
| --- | --- |
| **The loop: Plan, Track, Review** | The three steps every month runs in order, and the first three screens (S-106). The README calls it an ice cream sandwich. |
| **Today** | The home screen: the three steps, the first-session checklist, the Next card, the next 30 days of cash, four headline numbers. Numbers, not charts (rule 7). |
| **Insights** | Every chart and lens, read-only, in six tabs: Where it goes, Compared, Over time, Cash, Net worth, You. |
| **Setup** | One-time facts in short sections: basics, health coverage, income and paychecks, bills and due dates, categories and lines, tags, the cushion and coach settings, coach notes, parked Future tools. |
| **Clients** | The client list, demo households, export and import. Opens from the client's name. |
| **Accounts** | Every account on one balance sheet by type, with its latest balance and date; where month-end balances are typed (S-136). |
| **Quick entry** | Logging one spend in a few taps, from Today or Track. |
| **Scheduled item, "It happened"** | A bill or paycheck the calendar expects on a date; confirming it with one tap writes the entry (source `scheduled`). |
| **The log** | One list of every entry for every month: quick entries, confirmed scheduled items, imported bank rows. `doc.transactions`. The log owns the money (rule 20). |
| **Bank CSV import, matching** | Reading a card or checking statement file (Chase, American Express, Capital One, or any date-description-amount file) and matching its rows against what was already logged so nothing counts twice (`engines/tx-import.js`, `engines/log.js matchImport`). |
| **Merchant rules, merchant memory** | Keyword rules that map a bank description to a line, and the coach's own past choices remembered per merchant (`src/data/merchant-rules.json`, `doc.merchantMemory`). |
| **Fill gaps** | The month-end step: lines with no entries and no typed actual are asked for, income first. |
| **Month close, the checklist** | Closing a month: a checklist (balances in, gaps filled, bridge ties), then the month is locked as a snapshot and the next month opens (`store/months.js`, S-089). |
| **Saved review** | What went better and worse than planned, the bridge in one line, mistakes, kept with the closed month (S-091). |
| **Late entry, revised** | An entry for a month that is already closed; it is kept beside the snapshot, never written into it. |
| **The bridge** | Why the budget's surplus and the change in cash differ for a month, step by step; anything unexplained is its own step (S-088, rule 18). The net worth bridge does the same for net worth (S-112). |
| **Ties, materiality** | The bridge "ties" when the unexplained part is under the materiality amount, 25 dollars by default, a coach setting (S-096). |
| **Cash calendar, lowest point** | Day by day for the next 30 days: what is scheduled, what the plan spreads across the month, and the lowest the balance will get (`engines/calendar.js`). |
| **Safe to spend** | What can go out today without any day ahead dropping under the cushion (S-095). |
| **Pay-later flag** | A bill that lands before the paycheck that covers it. |
| **Forecast check** | The end-of-month cash the calendar predicted when the month opened, compared with what really happened (rule 19). |
| **Spread** | The part of the plan not tied to a date, spread evenly over the days left in the month. |
| **Trends, 80/20** | Spending over months, and the few entries or lines that made up 80% of a month's spending (`engines/pareto.js`, `engines/trends.js`). |
| **Eras, dream life, Next stage, Future tools** | Parked tools, off by default: life chapters laid end to end after today; what the client would like to spend; a job change compared with staying (S-105). |
| **Owning vs the alternative** | What a home or vehicle costs to hold each month next to renting, or rideshare, transit and a rental; shown without a verdict (S-113). |
| **Milestone** | A dated event like FI net worth crossing zero, never a grade (S-111). |
| **First session** | The checklist Today shows a new client until the basics, one income, rough estimates, one account and paid-ahead bills are in. |
| **Journeys, taps** | The four coaching journeys `tools/journeys.mjs` walks on a phone and a desktop, counting taps against limits (S-109). |
| **Gallery** | Screenshots of every screen and tab, phone and desktop, light and dark, compared with an approved set (`tools/gallery.mjs`). |
| **Loop strip, the step for now** | Plan, Track, Review at the top of Today with one highlighted: Review from the month's third-to-last day, Plan while there is no plan and nothing logged, otherwise Track (`engines/loop.js`). |
| **Transaction kinds** | spend, fee, refund, reimbursement, card-payment, transfer, income; stored with positive meaning money out. Card payments, transfers and income never count as spending. |
| **Likely duplicate, possible match** | A duplicate is flagged, not removed. A possible match waits for "Same, merge" or "Different"; until then the imported row does not count. |
| **Balance check** | A balance typed on a day inside the month, which resets the calendar's projection to the real number (`cashflow.checks`). |
| **Stale balance** | An investment or a thing you own with no new balance for 35 days; shown as stale rather than counted as current (S-110). |
| **So far, expected by month end** | So far is income logged less spending logged up to today; expected adds the paychecks still to come and takes off the bills and the rest of the plan. |
| **Fixed floor, lifestyle creep, card float** | Trends readings: fixed lines plus debt minimums; the change per month in spending against take-home; what was charged to cards against what was paid to them from cash (`engines/trends.js`). |
| **Subscription, price creep** | The same merchant in two or more months, at most one charge a month, 25 to 35 days apart, amounts within 20%; price creep is that charge going up (`engines/tx-analysis.js`). |
| **The 5-task test** | Hand the Riley demo to a real person and time five tasks, writing down every pause or wrong turn (`slam/README.md`). Not yet run. |

## People, roles and sharing

| Term | Meaning |
| --- | --- |
| **Coach, client** | The money coach who runs the session, and the person whose household it is. Today everyone using the app is the coach (`store/session.js`). |
| **View as client** | A header switch that shows what the client would see: coach-only fields hidden, client wording (S-096). |
| **Coach-only, visibility** | Fields the client never sees (coach notes, plan notes, an unshared mistake tag, the cushion, materiality), decided in one map (`store/visibility.js`). |
| **Record** | Anything a person creates: a line, an income, an entry, a balance. Every record carries an id, timestamps, who made and changed it, and a version (S-096). |
| **Soft delete, tombstone** | A removed record stays in the file marked deleted; engines and screens see only live records. |
| **Version, merge, conflict** | Each edit bumps a record's version. Importing a file for a client already here merges record by record from the last shared version; a record changed on both sides is a conflict the coach picks (`store/merge.js`). |
| **Export envelope** | The downloaded file: `{ format: 'slam-household', exportVersion, exportedAt, household }`. |
| **Snapshot, backup** | A copy of every household taken before any import (the last ten kept, S-004); also the "since last time" figures saved at close. |
| **Migration, schema version** | Bringing a stored or imported household up to the current shape, one step per version (`store/migrate.js`; `SCHEMA_VERSION` 20). |

## Demo households

| Name | What it demonstrates |
| --- | --- |
| **Maya, 26** | A New York renter with a roommate: the rent split and a first budget. |
| **Luis, 33** | Ohio, a W-2 job plus a side hustle: two income types and a typed card interest line. |
| **Tasha, 29** | Texas, gross pay only: the take-home guess from gross. |
| **Sam, 24** | Between jobs with one total: the single total and unemployment benefits. |
| **Jordan, 31** | Two bank CSV files to import: matching and double-count removal. |
| **Riley, 31** | A full year of the monthly loop: plans, a log, closed months, bridges, a car with a loan, a 401(k) and a Roth. His numbers are worked out by hand in `tests/riley.test.js` and pinned on screen by `tools/screens-check.mjs`. |
| **Dana, 34** | Owns a condo: the two net worths, paid ahead, and owning versus renting. |

All seven are made up. They are both the demo data and the test data (S-025).

## FI vocabulary (mostly in the archive)

| Term | Meaning |
| --- | --- |
| **FOO** | Financial Order of Operations: the order to send the next dollar (employer match, high-interest debt, emergency fund, retirement accounts, and so on). The very first page in the repository, July 2026 (`archive/sparks/foo-ladder.js`). |
| **FI, FIRE** | Financial independence; financial independence, retire early. Having enough invested that a safe withdrawal covers spending. |
| **FI number, 4% rule, safe withdrawal rate** | The invested sum from which spending can be drawn each year without running out, usually spending divided by 4%. Built in the archived generations; SLAM shows only FI net worth milestones so far. |
| **Lean FI, Fat FI, Barista FI, Coast FI** | FI on a tight budget; on a generous one; with a part-time job covering some spending; already saved enough that growth alone reaches FI by a target age. The "FI ladder" in Money Rooms v3. |
| **Rule of 5** | A Money Rooms v3 target for the emergency fund: age divided by five, in months of spending. |
| **Triple D** | Drawdown, duration, depth: the shaded band on a long-run projection chart in SPARKS (D-176). |
| **Chubby FI** | Money Rooms v3's step between Lean and Fat: about 25% more than you spend now. |
| **20/3/8 rule** | A car rule of thumb named in the archive: 20% down, a loan of at most three years, car costs under 8% of income. |
| **SWAN, VPW** | SPARKS only: the self-reported sleep-at-night target; variable percentage withdrawal, year by year to the plan age. |

## Project names

| Term | Meaning |
| --- | --- |
| **SLAM** | Stress Less About Money, the current build (`slam/`). |
| **SPARKS, SLAF** | The September 2026 generation of many small rooms sharing one household (`archive/sparks/`). The repository never spells out either acronym. |
| **Rooms** | SPARKS's screens, each answering one question. 93 at the peak, 37 at the end. |
| **Ledger, Spheres, Blocks, Lenses, Levers, Solar System, planets** | SPARKS and Money Rooms v3 vocabulary: every number as a row; nine life areas; a hypothetical laid on the household; re-readings; six levers; the Money Rooms v3 hub of readings grouped into planets. Defined in `archive/sparks/docs/ARCHITECTURE.md` and `archive/money-rooms-v3/README.md`. |
| **Money Rooms v2, v3** | The two generations before SLAM: v2 a separate repository, v3 in `archive/money-rooms-v3/`. |
| **Dungeons & Dividends** | A finance character sheet as a role-playing game, built on SPARKS (`archive/sparks/dnd/`). |
| **Coach Mode, Marketing Scoreboard** | Two more apps built on SPARKS: the first coach console, and a content log with a small CRM. |
| **Lane 2** | SPARKS's second test harness: property tests, a synthetic household corpus, data and glossary checks (`archive/sparks/tests/`). |
| **S-###, D-###, DD-###, CD-###, MD-###** | Decision row numbers: SLAM, SPARKS, Dungeons & Dividends, Coach Mode, Marketing Scoreboard. |
| **Money date, discovery call, Presenting, Scoreboard** | Money Rooms v3 words: a fifteen-minute call; the first call; a mode that locks the app to the client view; a screen of six numbers. |
| **MR-###** | Money Rooms v3's decision rows (`archive/money-rooms-v3/DECISIONS.md`). |
| **Eli** | The owner: a money coach building with Claude Code. Many decision rows record "Eli's answer". |