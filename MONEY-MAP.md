# Money Map & Impact Analysis — Income / Expenses / Budget / Month-End Close

*A discovery pass, not a build pass. Nothing in this document is built, scaffolded
or registered. It maps the ask — an Income section, an Expenses section, a
reflected Budget with a month-end close, and an Estimated-vs-Actual room — onto
the repo as it stands on this branch, names every overlap, and ends with the
decisions that have to be made before a build pass starts.*

*Read against: `SPEC.md` §3 (the data model), §12.3 (estimated vs. tracked,
resolved), §12.5 (manual entry now, import architected in, resolved),
`DECISIONS.md` D-047 (how people are paid), D-052 (facts vs. what-ifs), D-056
(time exists), D-063 (a month proposed), D-067 (the tax engine), D-082 (fixed
lines), D-091 (charts), D-094/D-095 (the one-pager), D-113 (Variable Income),
D-121 (Money Calendar), D-125 (Your Data importer, this branch).*

---

## Two premises in the prompt that the repo does not match

Both are worth saying first, because the map is different if they are believed.

1. **There is no Sankey diagram.** The Cash Flow room draws a donut (spending by
   category) and one stacked bar per bucket (`shared/charts.js`, D-091). Nothing
   in `rooms/`, `engines/`, `shared/` or `dnd/` draws a flow diagram. "Per-tag
   budgets" does not exist either: Cash Flow compares the month against a
   *template* — 50/30/20, 60/20/20, zero-based (`data/budget_templates.json`) —
   per **bucket** (needs / wants / savings), never per tag or per category. So
   the overlap question is not "does this replace the Sankey" but "does the
   Budget section replace the template comparison", and the answer is in Task 5.

2. **Variable Income is built, not approved-but-unbuilt.** `rooms/variable-income
   .html` shipped on the template (D-113): it reads the average month, owns the
   low and high month on the variable-basis income source
   (`incomeSource.variableLowCents / variableHighCents`) and
   `household.variableIncome.bufferMonths`, and answers one question — the salary
   to pay yourself, and the buffer that makes it hold. It does **not** capture
   income types, log income, or feed the tax engine anything the intake did not
   already. The Income section is therefore neither that room nor a superset of
   it; it is the layer *underneath* it. Task 5 says exactly what it feeds.

---

## Task 1 — The Money Map

One dollar, earned to gone. Each stop: what happens, whether it is a
**DECISION** (the person chooses), a **TOOL** (infrastructure the dollar passes
through or is recorded in) or a **SYSTEM** (automatic, no fresh decision), and
where the data comes from. Stops that already exist in the repo are named by
their file; stops that would be new are marked **(new)**.

| # | Stop | What happens, plainly | Category | Where the data comes from |
|---|---|---|---|---|
| 1 | **Income source** | A paycheque lands, a client pays an invoice, a relative hands over a gift, a tenant pays rent, a dividend posts. The dollar exists. | DECISION (which gig, which job, whether to take the money) then TOOL (the employer's payroll, the platform, the bank) | The person. Today: one `incomeSource` per job on the primary adult, written by Start Here (D-047, D-095): `rateCents × frequency` → `grossAnnualIncomeCents`, `type: w2 \| 1099`, `ongoing`, `monthsWorked`, `variableLow/High`. No dated income events exist anywhere. `household.oneOffs[]` holds a single "something coming in / going out" with a month, from the one-pager. |
| 2 | **Capture / entry** | The dollar is written down: what it was, how much, from whom, when, how often. | TOOL — the Income section's form **(new)**; today the one-pager's income card and the Your Data paste (D-125) | User input. Today the intake stores a *rate on a basis*, which is a description of the job, not a record of a payment. The Income section would add dated **income events** (Task 2) alongside the source, so "the paycheque on the 5th" is a record and "the salary" is the description it belongs to. |
| 3 | **Tax engine** | Gross is split into what is taxable and what is not; withholding (W-2), self-employment tax (1099), pre-tax deferrals, the standard deduction, the bracket walk, state tax, and the estimated quarterlies are applied. | SYSTEM | Calculation. `engines/tax.js` `estimate()` (D-067): named steps — ordinary tax on federal brackets after above-the-line and the standard deduction, capital gains, FICA on wages, SE tax on profit (`engines/selfemployed.js`) with its deductible half, state schedule, ACA cliff. `engines/taxroom.js` `splitIncome()` decides wages vs. SE by `employmentStatus` and `incomeSource.type`. `Tier0.estimatedAnnualTaxCents` is the *blunt* effective-rate lookup (`data/effective_tax_rates_2026.json`) every Tier 0 figure and take-home still uses; the bracket walk is the Tax room's. **Not modelled** (the engine says so itself): credits, itemised deductions, state deductions, AMT, NIIT, QBI. Nothing today tells the engine "this income is a gift" or "this expense reduces the 1099 profit" — every source is either wages or SE profit at its full gross. That is the gap Tasks 2 and 3 close. |
| 4 | **Net pool** | What is actually available after tax: take-home a month. | SYSTEM | Calculation. `Tier0.takeHomeMonthlyCents` = gross − blunt tax ÷ 12; `CashFlow.netMonthlyIncomeCents` is the same number by the same call (one formula, D-067's fallback). The Tax room shows the sharper one from the bracket walk beside it. With dated income events (stop 2) the pool becomes a *month's* actual inflow, not a twelfth of a year — which is what a budget's Income bucket needs. |
| 5 | **Budget categorisation** | The pool is sorted into the five buckets — Income, Expenses, Savings, Investments, Debt — and every line under them gets its Estimated figure. | SYSTEM | Rules. Today the sort is three buckets (needs / wants / savings) on the category catalogue (`data/expense_categories.json`, `bucket` per category; `essential` marks what rolls into the tracked figure) and the template targets (`CashFlow.templateTargets`, D-063). The five-bucket sort is a **mapping over the same catalogue** (Task 4): Savings = the `savings` bucket's `emergency_savings` + goal contributions; Investments = `retirement` + `investments` category lines + `retirement.contributionPercent` × wages + Roth/HSA contributed; Debt = `debt_minimums` (derived from `debts[]`) + `extra_debt_payment`; Expenses = everything else that is not savings. Nothing new is invented; the buckets are a second view of one catalogue. |
| 6 | **Allocation** | The person spends, saves, invests, pays down: the actual entries of the month. | DECISION | User input through the Expenses section **(new shape, existing store)** — `household.expenses.entries[]`, one transaction-shaped store since day one (§12.5): `categoryId, amountCents, period 'monthly' \| 'once', date, fixed, source 'manual' \| 'imported' \| 'rerank'`. Contributions are not entries today: the workplace contribution is a *percent* (`retirement.contributionPercent`), Roth/HSA are *year-to-date totals* (`rothContributedCents`, `hsaContributedCents`), a goal's contribution is `goals[].monthlyContributionCents`, and extra debt payment is a *what-if* in Debt Payoff (`extraCents`, page-local). To have an Actual for Savings, Investments and Debt, those need to become dated entries too (Task 4, "Aggregation"). |
| 7 | **Landing accounts** | The dollar rests somewhere: checking, savings, a brokerage, a 401(k), or it reduces a balance. | TOOL | Existing rooms. `assets[]` (cash / investment / retirement / real_estate / vehicle / other, each with `liquid`, `taxCharacter`, and the Statement's liquidity / confidence / cost basis) owned by Start Here (the two lumps) and The Statement (the rest); `debts[]` owned by Debt Payoff. Balances are *stated*, not derived from entries: a $500 transfer to savings logged in the Expenses section does not move `assets[cash]` by −500 and `assets[savings]` by +500. Whether it should is Open Question 8. |
| 8 | **Reconciliation** | Does what was logged match what is real? Three reconciliations already exist and a fourth is the month-end close. | SYSTEM | (a) **Estimated vs. tracked** — `expenses.monthlyEssential.estimatedValueCents` (the one-pager's guess) vs. `trackedValueCents` (Cash Flow's categorised month), both kept forever, divergence computed (§12.3, D-052). (b) **Snapshots** — Freeze today's numbers writes every owned field and every instrument to an append-only store (`slaf.snapshots.v1`, D-056); History reads them back. (c) **Refresh** — the three figures that move re-confirmed with a date stamp (`meta.confirmedAt`, D-057). (d) **Month-end close (new)** — a fourth reconciliation: the month's Estimated and Actual per bucket, frozen side by side and labelled by month (Task 4). It is closest in shape to (b), and Task 4 argues it should reuse that store's discipline rather than invent a fifth. |
| 9 | **Exit** | The dollar leaves for good: a merchant, the IRS, a creditor, a person. | TOOL (the payee) | Nothing in the app sees the payee. The record of it is the entry at stop 6; the tax paid is the engine's estimate at stop 3, and `household.tax.withheldAnnualCents` (Tax room) is the one figure that says what actually went to the IRS. Interest paid to a creditor is the payoff simulation's `totalInterestCents`, a projection, not a ledger. |

**What the map shows about the ask.** The repo already has stops 1, 3, 4, 5, 7 and
three quarters of 8. What it lacks is *time* at stops 2 and 6: income is a rate,
contributions are percents and totals, spending is a monthly figure per category.
A budget with an Actual column and a month that can be closed needs dated events
on both sides. That is the whole design problem, and it is one problem, not four
sections.

---

## Task 2 — Income section spec

### 2.1 What exists

`incomeSource` (per person, `personId` not `ownerIds` — income is individual,
§3): `source` (free text), `grossAnnualIncomeCents` (the canonical annual figure
every room reads), `frequency` (annual / monthly / semimonthly / fortnightly /
weekly / hourly / variable), `rateCents`, `hoursPerWeek`, `monthsWorked`,
`ongoing`, `type` (`w2` | `1099`), `variableLowCents` / `variableHighCents`,
`employerMatch {matchPercent, matchCapPercentOfSalary}`, `hassle`. Owner: Start
Here (the one-pager writes up to four ids: `intake_income`, `intake_own_work`,
`intake_second_job`, `intake_partner_income`); Variable Income owns the low/high.
`engines/income.js` annualises a rate on a basis, and knows the difference
between what was *earned* this year and the *run rate*.

What is missing for the ask: a **kind** finer than w2/1099 (gift, dividend,
rental, benefit, bonus…), a **taxability class** per kind, **dated events**
(this paycheque, this invoice paid), and **the costs of producing it**.

### 2.2 Every income type it must support

`recurring` = arrives on a cadence and has an expected amount; `one-time` = an
event with a date. "Engine needs" is what `Tax.estimate` has to be handed for
that type to be taxed correctly, beyond what it reads today.

| Type | Fields to capture | Taxable? | Recurring? | What the tax engine needs | Cost to produce it |
|---|---|---|---|---|---|
| **W-2 wages / salary** | employer, rate + basis (exists), hours a week if hourly (exists), pay cadence and next payday (exists on `calendar`, owned there — see Q5), pre-tax deferral % (exists, `retirement.contributionPercent`), withheld to date (exists, `tax.withheldAnnualCents`, one total) | Yes — ordinary + FICA (employee half), withholding at source | Recurring | wages (exists), deferral (exists); **new:** per-source withholding so a refund estimate is per job, not one household lump | None (work costs are Real Hourly Wage's `person.work.workCostsMonthlyCents`, a life cost, not deductible) |
| **W-2 bonus / commission / overtime** | amount, date, which job it belongs to, whether withheld at the supplemental rate | Yes — ordinary + FICA; usually withheld at a flat supplemental rate | One-time (bonus) or variable-recurring (commission) | adds to that source's wages for the year; withholding at 22% flat is a *withholding* fact, not a tax-rate fact — the engine only needs the gross | None |
| **1099 contractor / freelance** | client or platform, amount per invoice or an average month (exists as variable basis), date paid, 1099-NEC expected?, quarterlies paid to date | Yes — ordinary + **SE tax** on net profit; no withholding; quarterly estimates | Recurring-variable | `selfEmploymentCents` (exists via `splitIncome`), **net of the costs below** — today it is handed the full gross, which overstates SE tax on anyone with real costs; `quarterlyEstimated` already takes `expectedNetProfitCents` and `taxAlreadyWithheldCents` | **Yes** — see 2.3 |
| **Side income / gig** (Uber, Etsy, tutoring) | same as 1099 plus platform fees withheld before payout | Yes — SE, unless hobby-scale (Open Q3) | Recurring-variable | as 1099; platform fees are a cost to produce | **Yes** |
| **Tips** | amount, cash vs. reported through payroll | Yes — ordinary + FICA; reported tips are wages, cash tips are still taxable | Recurring-variable | adds to wages; the engine cannot tell reported from unreported and should not try | None |
| **Rental income** | property (links to a `real_estate` asset), rent a month, months occupied, security deposit (not income) | Yes — ordinary, **not** SE; Schedule E; expenses and depreciation deducted | Recurring | a third income class the engine does not have: ordinary without FICA/SE. `Tax.estimate` today has `wagesCents` (FICA) and `selfEmploymentCents` (SE); rental needs `otherOrdinaryCents` (neither) | **Yes** — mortgage interest, property tax, insurance, repairs, management fee, depreciation (Open Q4: depreciation is a calculation, not an entry) |
| **Dividends / interest** | account (links to an asset), amount, date, qualified or not | Yes — ordinary (interest, non-qualified) or capital-gains rate (qualified dividends); no FICA | Recurring (quarterly/monthly) | `capitalGainsCents` (exists) for qualified; `otherOrdinaryCents` (new) for the rest | None |
| **Capital gains (a sale)** | asset sold, proceeds, cost basis (exists on assets: `costBasisCents`), date, short or long | Yes — short = ordinary, long = capital-gains rate; NIIT above a threshold (not modelled) | One-time | `capitalGainsCents` (exists); short vs. long is new | None |
| **Pension / annuity** | payer, amount a month, start date, taxable share | Usually yes — ordinary, no FICA; withholding optional | Recurring | `otherOrdinaryCents` (new) | None |
| **Social Security** | amount a month, start age (exists, `decumulation.socialSecurityAt`) | Partly — 0 / 50 / 85 % taxable by provisional income; no FICA | Recurring | the provisional-income test is not modelled; a first pass can treat it as `otherOrdinaryCents × 0.85` and say so | None |
| **Unemployment benefit** | weekly amount and weeks left (exist, `person.unemployment`), withholding elected? | Yes — ordinary federal (state varies); no FICA | Recurring, finite | `otherOrdinaryCents` (new); today Between Jobs reads it for runway and the engine never sees it | None |
| **Severance** | amount, date (exists, `unemployment.severanceCents`) | Yes — wages | One-time | wages | None |
| **Gift / inheritance** | from whom, amount, date | **No** to the recipient (the giver may owe gift tax above the annual exclusion; an inheritance may carry estate tax at the estate, not here) | One-time | *must be excluded* from every taxable total — today there is no way to record money that is not income; a gift typed as "income" is taxed | None |
| **Tax refund** | amount, date | No — it is last year's over-withholding coming back | One-time | excluded; useful as a signal that withholding is too high | None |
| **Reimbursement** (work expenses, insurance claim) | amount, date, what it reimbursed | No | One-time | excluded | None |
| **Child support / alimony received** | amount a month | Child support: no. Alimony: no for post-2018 agreements, yes for older ones | Recurring | excluded, or `otherOrdinaryCents` for a pre-2019 agreement (a per-source flag) | None |
| **Scholarship / stipend / aid** | amount, term, what it may be spent on | Tuition-and-fees portion no; the rest yes | Recurring by term | `otherOrdinaryCents` for the taxable part; a student's "coming in" on the one-pager is this today, untyped | None |
| **Selling things** (a car, furniture) | item, proceeds, what it cost | Rarely — a gain over what it cost is taxable, a loss on personal property is not deductible | One-time | excluded unless the person marks a gain | None |
| **Other** | label, amount, date, "is this taxable?" asked outright | Whatever the person says | Either | the flag | Optional |

The taxability column collapses to **four classes** the engine needs to know
about: `wages` (ordinary + FICA), `selfEmployment` (ordinary + SE, net of
costs), `otherOrdinary` (ordinary, no payroll tax: rental, interest, pension,
benefits, taxable aid) and `capitalGains` (the preferential rate), plus
`notIncome` (gift, refund, reimbursement, support) which the engine must never
see. `Tax.estimate` has two of the four; adding `otherOrdinaryCents` and the
short/long split is the whole engine change. Every income type above maps to one
class by default, and the class is what is stored, so a new type is a data edit.

### 2.3 Cost to produce the income

For 1099, side income and rental. Fields: **mileage** (miles × the IRS rate,
`data/` table, versioned by year), **home office** (square feet or a % of rent
and utilities — the simplified method is $5/sq ft to 300 sq ft, a table),
**equipment** (amount, date; Section 179 expensing vs. depreciation is Open Q4),
**supplies**, **software / subscriptions**, **contractor fees** (paid to others,
1099-NEC issued?), **licensing / professional fees**, **platform fees**
(deducted before payout — often the only cost a gig worker has), **advertising**,
**insurance** (liability, not health), **health insurance premiums** (the SE
health deduction, above the line, not a Schedule C cost), **half of SE tax**
(computed, exists), **retirement contributions from profit** (SEP / Solo 401(k),
Where It Goes already models the limits).

**Where they live — the recommendation, with the alternative stated.**

*Option A — a sub-table on the income source.* `incomeSource.costs[]`. Tidy per
source; invisible to Cash Flow, Values, Fulfillment, The Rerank and every ratio
that reads `expenses.entries`. A gig worker's fuel would be in two places or in
neither.

*Option B — tagged rows in the one expense store.* `expenses.entries[]` gains
`forIncomeId` (the `incomeSource.id` it produces) and `deductible`
(`true | false | null`). A row with `forIncomeId` set is an income-generating
expense; the Income section shows it under its source; the Expenses section
shows it under its own heading; the tax engine reads
`sum(entries where forIncomeId → source.class === 'selfEmployment' and
deductible === true)` per source and hands `selfEmploymentCents` the **net**.

**Recommend B**, because §12.5 locked one transaction-shaped store precisely so
nothing has to be built twice, and because a cost is still money that left the
household: Cash Flow's "what goes out" is wrong without it. The one thing B must
guarantee is in Task 3: a row can only be deductible if it references a source
whose class allows a deduction, so a personal expense cannot reduce taxable
income by accident.

---

## Task 3 — Expenses section spec

### 3.1 What exists

`expenses.entries[]`: `id, categoryId (24 in data/expense_categories.json, in
three buckets, one derived — debt_minimums from debts[]), amountCents, period
'monthly' | 'once', date (ISO, dated entries only), descriptor, source 'manual' |
'imported' | 'rerank', categorizedBy, fixed (D-082)`. Cash Flow owns them (one
box per category = one manual monthly entry, id `cf_<category>`); The Rerank
writes custom lines with `source: 'rerank'`; Your Data (D-125) writes them from a
pasted statement. `engines/cashflow.js` `normaliseToMonthly` already treats a
`once` entry with a date as belonging to its month. `household.oneOffs[]` (the
one-pager's single "something going out") and `calendar.bills[]` / `payLater[]`
(Money Calendar's two bills and one instalment) are **three more places** a
dated outgoing can live. Task 5 says what to do about them.

### 3.2 Fields, per entry

| Field | Exists? | Note |
|---|---|---|
| `categoryId` | yes | the catalogue; a personal category set and (3.4) an income-cost category set |
| `amountCents` | yes | integer cents |
| `period` | yes, `monthly \| once` | **extend** to the same bases as income (`weekly, fortnightly, semimonthly, monthly, quarterly, annual, once`) so "$120 every two weeks" is typed as such and normalised by `engines/income.js`'s `BASES` — one table of periods, not two |
| `date` | yes, dated entries only | for a `once` entry, the day it happened; for a recurring entry, the **next** occurrence (or `dueDay` 1–31 for a monthly one) |
| `dateKind` | **new** | `exact \| estimated \| potential` — the earlier ask ("an option for estimated and potential dates"). Money Calendar draws each differently; the Budget counts `exact` and `estimated` in Estimated, and `potential` only when it becomes real |
| `fixed` | yes | could not be cut next month (D-082) |
| `source` | yes | manual / imported / rerank; **add** `budget` for a line created through the Budget's Add flow (Task 4), so its origin is recorded |
| `forIncomeId` | **new** | the income source this cost produces; null = personal |
| `deductible` | **new** | `true \| false \| null`; may only be `true` when `forIncomeId` points at a source whose tax class is `selfEmployment` or `otherOrdinary`(rental) |
| `receipt` / `descriptor` | yes (`descriptor`) | free text |
| `expected` vs `actual` | **new**, see Task 4 | a recurring entry carries its expected amount (the Estimated); a dated occurrence carries the actual |

### 3.3 Recurring vs. one-time

A **recurring** entry is a *description* (rent, $1,500, monthly, due the 1st,
fixed). An **occurrence** is a *record* (rent, $1,500, paid 2026-09-01). Today
the store has only the description (`period: 'monthly'`) or an undated one-off.
For an Actual column to exist, occurrences have to be stored — either as
separate `once` entries that point at the recurring one (`ofEntryId`), or as a
`log[]` of `{date, amountCents}` on the recurring entry (the shape
`skills[id].log[]` already uses for did/didn't days, D-090). **Recommend the
`log[]` shape**: it keeps one row per bill, the description and its history
together, and nothing that reads entries today has to learn about a second row
type. `normaliseToMonthly` reads the description for Estimated and the month's
log for Actual.

### 3.4 Personal vs. income-generating: keeping them apart

**Data model.** Two invariants, enforced in `Schema.createExpenseEntry` and
checked by `test/run.js`:

1. `deductible === true` ⇒ `forIncomeId` is set **and** that source's tax class
   is one that admits the deduction. Otherwise the constructor stores
   `deductible: false` and flags it, never silently `true`.
2. The tax engine is handed a *net* only for the classes that have one. Wages
   are never reduced by anything in the expense store — a W-2 job has no
   deductible costs here (unreimbursed employee expenses are not deductible
   federally since 2018), so `forIncomeId` on a W-2 source is allowed (the person
   may want to see what the job costs) but `deductible` is forced `false`.

**UI.** Two lists that do not share a heading. The Expenses section has
"A typical month" (personal, the categories, as now) and a second block "Costs
of earning it", one group per income source that has any, each row carrying the
source's name and a "reduces the tax on it" tick that is disabled with a reason
when the source's class does not allow it. Moving a row between the two blocks
is an explicit action ("This is personal after all") that clears `forIncomeId`
and `deductible` together. The Income section shows the same rows under their
source, read-only there with an "edit in Expenses" link — one owner, one place
to type (D-017).

**What talks to the tax engine.** Only rows with `deductible: true`, summed per
source, handed to `Tax.estimate` as the source's cost. Health-insurance premiums
for the self-employed are above the line, not a Schedule C cost; they belong
under the source with a category of their own so the engine can place them
correctly. Personal categories (housing, groceries, all 24) never reach the
engine at all — the only personal facts the engine reads are filing status,
state, dependents and the pre-tax contributions, as today.

---

## Task 4 — Budget section spec

### 4.1 The sheet

Five buckets, each with lines, each line with **Estimated | Actual | Difference**
for the current open month. No box on the sheet takes typing.

| Bucket | Its lines | Estimated comes from | Actual comes from |
|---|---|---|---|
| **Income** | one per income source, plus one-time inflows expected this month | the source's rate on its basis → a month (`engines/income.js`), for the paydays that fall in the month (`engines/calendar.js` already knows which days those are); `potential` one-offs excluded | income events logged this month (Task 2) |
| **Expenses** | one per personal category with a recurring entry or an occurrence this month | each recurring entry's expected amount; a category with no entry shows the template proposal *dashed* (D-063 — proposed, never counted) | the month's log across entries in that category |
| **Savings** | emergency / cash savings, each goal | `goals[].monthlyContributionCents`; the `emergency_savings` recurring entry | logged transfers (a `savings`-bucket occurrence) |
| **Investments** | workplace plan, Roth, HSA, brokerage | `retirement.contributionPercent × wages ÷ 12`; a recurring `retirement` / `investments` entry | logged contributions; the year-to-date totals (`rothContributedCents`, `hsaContributedCents`) *are* the running Actual for the year and should become derived from the log rather than typed (Open Q7) |
| **Debt** | minimums (derived, one line per debt) and extra | `Schema.monthlyDebtPaymentsCents` (derived from `debts[]`, never typed — D-017); Debt Payoff's extra becomes a stored expected extra instead of a page-local what-if (Open Q7) | logged payments; a balance re-confirmed in Refresh is a cross-check, not the Actual |

**Estimated: where it originates, in order of preference.** (1) the recurring
entry's own expected amount, set once when the entry was created through Add
and editable only there; (2) for a category with no recurring entry, last closed
month's Actual for that category, shown as "last month" and *proposed*, not
stored (D-060); (3) with no closed month, the template's proposal (D-063), same
treatment. The person never sets an Estimated on the sheet; they set it on the
entry, and the sheet reflects it. "Recalculate from recurring entries" is
therefore not a mode — it is the only mode.

### 4.2 The Add flow, precisely

The Add button on a bucket or a line **navigates**, it does not open an inline
editor.

1. Tap **Add** on the Expenses bucket (or the "+" on a line). The Budget room
   writes `sessionStorage['slaf.return'] = { room: 'budget', month: '2026-09',
   anchor: 'bucket-expenses', scrollY }` and navigates to
   `rooms/cash-flow.html#spending?for=budget&month=2026-09&category=groceries`
   — the owner room, the section, and the category preselected when the tap
   was on a line. (Income lines route to the Income section; Debt lines to Debt
   Payoff's `#debts`; Savings and Investment lines to the entry form in the
   Expenses section's savings block, or to Goals for a goal.)
2. The owner room reads `for=budget` and shows a **return chip** at the top
   ("Back to the budget for September →") and, when a category was named,
   opens that line for entry. Nothing else about the room changes; it is the
   same form every other path uses (one owner, one form).
3. The person logs the entry there. The write is an ordinary spine write with an
   ordinary undo label.
4. Tapping the chip (or the browser's back) returns to
   `rooms/budget.html#bucket-expenses`. On load the Budget room reads
   `slaf.return`, restores `scrollY`, clears it, and — because it renders from
   the spine on every load — the new Actual is already in the line. The line
   that changed is marked **"just added"** for that visit (a class, cleared on
   the next render), so the person sees what moved. There is no "confirmation
   state" stored anywhere; the spine's command log *is* the confirmation, and
   the undo control on every page (D-094) is the way to take it back.

"Returns to the budget room" technically = a route back (`location.href` to the
budget with the bucket anchor), scroll restored from `sessionStorage`, and a
one-render highlight derived from the command log's last entry. No second copy of
the number exists at any point.

### 4.3 Aggregation

Each bucket's Actual is a **sum over the month's occurrences**, computed on read
by one engine function (`engines/budget.js`, new; it calls `CashFlow.summarise`
for the category roll-up rather than re-implementing it):

- **Income** = Σ income events with `date` in the month whose class ≠
  `notIncome`, shown gross with the tax engine's take-home beside it.
- **Expenses** = Σ occurrences in the month across personal categories
  (`forIncomeId` null) plus, in their own sub-line, income-generating costs.
- **Savings** = Σ occurrences in `emergency_savings` and goal-contribution
  entries.
- **Investments** = Σ occurrences in `retirement`, `investments`, Roth, HSA.
- **Debt** = Σ occurrences against debts (minimum and extra), which are logged
  in Debt Payoff against the debt they paid so the balance projection and the
  budget read one record.

A month is a **calendar month** in the person's local time (the same `startOf`
that `engines/calendar.js` uses). An occurrence with `dateKind: 'estimated'` and
no logged actual counts toward Estimated only; nothing "potential" counts
anywhere until it is made exact.

### 4.4 Month-end close

**States.** A month is `open` (the current one, and any future one being planned)
or `closed`. Only the current month can be closed, and only once.

**The action.** "Close September" → confirm → one record is written:

```
closedMonths[]: {
  id: 'cm_2026_09', month: '2026-09', label: 'September 2026',
  closedAt: ISO,
  buckets: {
    income:      { estimatedCents, actualCents, lines: [{ id, label, estimatedCents, actualCents }] },
    expenses:    { … }, savings: { … }, investments: { … }, debt: { … }
  },
  byCategory: { housing: { estimatedCents, actualCents }, … },
  balances:    { cashCents, investmentsCents, debtCents }   // as stated that day
  referenceVersions, assumptionsUsed,                      // as a snapshot carries
  late: []                                                 // see below
}
```

Estimated and Actual are written **side by side and never merged**; the record
is append-only and read-only, the same discipline as a snapshot (D-056). Closing
also takes an ordinary snapshot so History's line gains a point on the same day
(one action, two records, both labelled).

**Where it lives.** In the household (`household.closedMonths[]`), not in the
snapshot store — because it must travel with the export, be merged by Your
Data's add-a-file (D-125), and be undoable as a command (a snapshot deliberately
is not). Open Question 6 asks whether that is right.

**What locks.** After close: occurrences dated inside a closed month become
read-only in every room (the Expenses section shows them greyed with the month's
label); the recurring entries' *expected amounts* stay editable (they describe
next month); balances stay editable (they are today's facts); the closed record
never changes.

**A late receipt.** A receipt from the 28th that turns up on the 3rd is logged
with its real `date` (in the closed month) and is stored on the closed record's
`late[]` with a `loggedAt`. The locked Actual does **not** move; the Analysis
room shows "Actual $2,140 · +$60 late" and lets the comparison be read either
way. The current open month's Actual does not absorb it either — a late entry
belongs to the month it happened in, which is the bookkeeping answer. (The
alternative — post it to the open month — is Open Q6b.)

**Labelling.** `month: 'YYYY-MM'` is the key; `label` is the display ("September
2026"); the id is derived from the key so a month cannot be closed twice. An
optional free-text `note` ("the month we moved") is the one thing on the record
the person types.

---

## Task 4a — Estimated-vs-Actual Analysis room

**Reads** `closedMonths[]` only — never the live month — plus the category
catalogue for labels. From each record: `month`, `label`, the five buckets'
`estimatedCents / actualCents`, `byCategory`, `late[]`, and `balances` for the
"where did the difference go" line (a month that under-spent should show up in
cash or debt).

**Comparisons.**
1. **One month**: Estimated vs Actual per bucket, then per category, sorted by
   absolute variance; the bar chart is `Charts.bars` with the estimate as the
   zone (the same shape Every Ratio uses for a band).
2. **Trend across closed months**: one line per bucket over time (`Charts.area`),
   Actual solid, Estimated dashed — the picture the History room draws for net
   worth, for the budget.
3. **Per-bucket variance**: the average and the spread of (Actual − Estimated)
   per category across every closed month — which lines are *consistently*
   under-estimated, which merely vary. A category whose estimate is off the
   same way three months running is the room's headline.
4. **Late entries**: shown, and counted or not, by a toggle.

**Writes.** Read-only, with **one** explicit action: "Use the last N months'
average as next month's expected" on a category, which writes through the
recurring entry's owner (the Expenses section's expected amount) as a labelled
batch — "Expected groceries → $487, from three months' actual". It never edits a
closed record and it never edits an Estimated directly on the sheet; it goes the
same road the Add flow goes. Whether even that one write belongs here is Open Q9.

**Not a duplicate.** History (D-122) reads *snapshots*: owned fields and
instruments at moments in time, net worth over time, and the command log.
It knows nothing of months, buckets or estimates. The Analysis room reads
*closed months*. They share the store's discipline and one chart module, not
data. Confirmed additive.

---

## Task 5 — Cross-room impact map

`R` reads, `W` writes, `R/W` both. Fields named as they exist today; **new**
marks a field the build would add. The last column says what changes for that
room if the Income / Expenses / Budget sections land as specified.

| Room | Today | Fields | If this lands |
|---|---|---|---|
| **Start Here** (one-pager) | W | `incomeSource` × up to 4 (rate, basis, hours, type, match), `expenses.monthlyEssential.estimated`, `oneOffs[]`, `meta.hasDebt`, `intake_debt` lump | Stays the front door: its income card *creates* a source of class `wages` or `selfEmployment`; the Income section is where it is refined. `oneOffs[]` is **retired into** dated entries (Q5). |
| **Cash Flow** | R/W | `expenses.entries[]` (manual monthly per category, `fixed`), `monthlyEssential.tracked` (the "track this" button) | **Becomes the Expenses section.** Not replaced, not duplicated: the same store, the same catalogue, the same charts; gains periods, dates, `dateKind`, the log of occurrences, the income-cost block. The template comparison (50/30/20) stays as a *view* on the Budget sheet, per bucket, as now. The donut and the stacked bars stay. |
| **Budget** (new) | R | everything Cash Flow, Income, Goals, Debt Payoff and Start Here write; `closedMonths[]` | Reflection only. Owns nothing but `closedMonths[]` (Q6) and the Close action. |
| **Analysis** (new, 4a) | R (+1 W) | `closedMonths[]`; one write through the Expenses section's expected amount | Additive; see 4a. |
| **Variable Income** (D-113) | R/W | R: gross, spending, cash, quarterly (SelfEmployed); W: `incomeSource.variableLowCents / HighCents`, `variableIncome.bufferMonths` | **A consumer.** With dated income events, "the low month" stops being typed and becomes *observed* — the room proposes the last twelve months' minimum and maximum from the log and still lets the person overrule. Its salary-to-pay-yourself becomes the Income bucket's Estimated for a self-employed household. Unchanged otherwise. |
| **Tax** (D-105) | R/W | R: gross, filing, state, contribution %, situation; W: `tax.otherPreTaxAnnualCents`, `tax.withheldAnnualCents` | R gains the four classes and the deductible costs per source; `withheldAnnualCents` becomes per source (Q2). The room's number does not move; its inputs get honest. |
| **Self-Employed / Side Hustle / Where It Goes** | R | gross, filing; SE tax via `engines/selfemployed.js` | Read *net* profit per source instead of gross; `quarterlyEstimated` already takes net. |
| **Debt Payoff** (D-124 on this branch) | R/W | `debts[]` (balance, rate, min, type, dates, archived, interestFree); `extraCents` page-local | Debt bucket's Actual needs **logged payments against a debt** (`debts[].log[]` or occurrences with `forDebtId`); the extra becomes stored expected extra (Q7). |
| **Student Loan Decision** | R/W | R: `student_loan` debts, gross; W: `studentLoans.*` | Reads the same debts; unchanged. |
| **The Statement / Net Worth / Refresh** | R/W | `assets[]`, balances re-confirmed | Unchanged unless entries move balances (Q8). |
| **Goals** | R/W | `goals[]` (target, saved, monthlyContribution); R: Cash Flow's surplus | Savings bucket lines; `savedCents` could become derived from logged contributions (Q7). |
| **FIRE / Savings Rate / Runway / FOO Ladder / Financial Snapshot / Every Ratio / Health** | R | gross, `monthlyExpensesCents` (tracked wins over estimated), cash, investments, debt totals | Unchanged formulas. They gain a truer month: `trackedValueCents` becomes the *closed months' average* rather than one categorised month (Q10). |
| **Sleep At Night / Protection / Between Jobs** | R | spending, cash, deductible, benefit | Unchanged; the benefit becomes an income event of class `otherOrdinary`. |
| **Values / Fulfillment / The Rerank** | R (Rerank W) | `CashFlow.summarise` categories; Rerank writes `source: 'rerank'` entries and `ratings.rerank` | Unchanged; they read the same roll-up. The Rerank's custom lines are entries already. |
| **Money Calendar** (D-121) | R/W | R: cash, spending, take-home; W: `calendar.cadence, nextPaydayDay, bills[] (two), payLater[]` | **Retire `bills[]` and `payLater[]` into dated recurring entries** (`dueDay`, `dateKind`) and draw the month from the entries plus income events; keep `cadence` / `nextPaydayDay` on the calendar or move them onto the W-2 source (Q5). The month grid the earlier ask wanted is this room's chart over those entries. |
| **History** (D-122) | R/W | snapshots; `history.compareTo` | Unchanged; the Close action appends a snapshot it already reads. |
| **Housing Decision / Career Move / Big Purchase / Kids and Tuition / Partner** | R/W of their own branch | each owns a "what would this cost" branch (`housing.*`, `career.offer.*`, `purchase.*`, `kids.*`, `partner.*`); R: spending, income, cash | They model a **future** change; none writes an entry. When a decision is taken (the house is bought), the person logs the new rent / mortgage as a recurring entry in Expenses — these rooms could offer a "make it real" link into the Add flow, which is scope for later, not a dependency. Housing's `rentMonthlyCents` and Cash Flow's housing line are today two numbers for one rent (Q11). |
| **Decumulation / Giving / Estate / Enough / Designed Week / Time Buckets / Dreamline / Reversibility / Unlearning / Real Hourly Wage / Hassle / Credential / Worth / Windfall / Quick Math / Skill Stacker / What If** | R (own branches W) | spending, income, cash, investments as chips; Stacker reads dining and groceries lines and Rerank's cut | Unchanged. Stacker's "did" log is the shape 3.3 recommends for occurrences. |
| **Your Data** (D-125, this branch) | W | debts, assets, expense entries (monthly), income source | The importer's rows gain `date` and `dateKind` when a pasted line carries one, and land as occurrences; a natural third entry path beside typing and the Add flow. |
| **Get Help** | R | situation | Unchanged; "tax returns and filings" stays out of scope, and the four classes are an *estimate*, not a return. |

**spine v2 itself.** Income sources and expense entries are already core spine
data (`household.people[].incomeSources[]`, `household.expenses.entries[]`) with
owners in `shared/ownership.js`. The build keeps that: the Income and Expenses
sections are the owner rooms of records that already live in the spine, with
richer records. `closedMonths[]` is a new core branch (Q6). The Budget and
Analysis rooms publish nothing; they read. No room holds a private copy of a
number (D-017) — the Estimated column is a *read* of each entry's expected
amount, never a stored second figure.

---

## Task 6 — Open questions for Eli

Decisions needed before a build pass. The first three decide the shape of
everything else.

1. **Cash Flow becomes the Expenses section — agreed?** One store, one catalogue,
   one room, extended with periods, dates, `dateKind`, a log of occurrences and
   the income-cost block. The alternative is a separate Expenses room beside Cash
   Flow, which would be the second copy D-017 exists to prevent. (Task 5)

2. **Tax engine depth.** Today: a bracket walk on federal brackets, the standard
   deduction, FICA, SE tax, state schedules, capital gains, the ACA cliff; *not*
   credits, itemised deductions, AMT, NIIT, QBI. The ask needs at minimum
   (a) the third income class `otherOrdinary`, (b) per-source deductible costs
   netting SE profit, (c) `notIncome` excluded. Beyond that: should withholding
   be per source (so a refund is per job)? Should QBI (the 20% deduction most
   1099 earners get) be added, since it moves a freelancer's answer by a lot?
   Should the effective-rate table (`Tier0`) stay the number the dashboard uses,
   with the bracket walk staying the Tax room's — or does the sharper engine
   become the one take-home figure everywhere (D-067 chose the fallback
   deliberately)?

3. **Hobby vs. business for side income.** A gig that nets $600 a year is taxed
   as SE income; the IRS's hobby rules are a judgement call the app should not
   make. Proposal: every `selfEmployment` source is a business unless the person
   ticks "hobby", and the tick removes the deductions *and* the SE tax with a
   note that says why. Or: never ask, always SE.

4. **Depreciation and Section 179.** Equipment and a rental's building are
   deducted over years, not in the month they were bought. The honest options:
   expense everything in-month and say the return will differ; or a small table
   (`data/depreciation.json`: 5-year for equipment, 27.5-year straight-line for
   residential rental) and a computed annual line. The second is more correct
   and is the first calculation in the app that spreads a *past* purchase into
   future months.

5. **Where dated money lives — three stores or one.** Today a dated outgoing can
   be `oneOffs[]` (the one-pager), `calendar.bills[]` / `payLater[]` (Money
   Calendar) or an `expenses.entries[]` row with a date. Proposal: **one** —
   entries with `dueDay`/`date` and `dateKind` — and retire the other two with a
   migration and a compatibility note. Pay cadence and next payday: keep them on
   `calendar` (a household rhythm) or move them onto the W-2 source (each job has
   its own paydays)? Two jobs make the second right; one job makes the first
   simpler.

6. **The closed-month record.** (a) In the household (`closedMonths[]`: exports
   with it, merges, undoable) or in the snapshot store (append-only, never
   undoable, the same as History)? The document recommends the household, but
   "a closed month can be undone" is a real objection. (b) A late receipt: keep
   it on the closed month's `late[]` with the locked Actual unchanged (the
   bookkeeping answer), or post it to the current open month (the cash answer)?

7. **Percents and totals become logs.** `retirement.contributionPercent` (a
   percent), `rothContributedCents` / `hsaContributedCents` (year-to-date
   totals), `goals[].savedCents` and Debt Payoff's page-local extra all become
   *derived* from logged occurrences under this design. That is a compatibility
   change for Start Here, FIRE, Where It Goes, Goals and the FOO Ladder: keep
   the typed figure as the fallback when no log exists (the D-047 pattern), or
   require the log?

8. **Do entries move balances?** Logging a $500 transfer to savings could move
   `assets[cash]` −500 and `assets[savings]` +500. Today balances are stated and
   re-confirmed (Refresh, D-057), never derived. Deriving them is a much bigger
   claim (every entry would need an account) and makes the Refresh page a
   reconciliation step instead of an entry step. Recommend **no** for this pass,
   with the closed month recording the stated balances so the drift is visible.

9. **The Analysis room's one write.** "Use the last three months' average as next
   month's expected" — allow it (through the Expenses section, as a labelled
   batch), or keep the room strictly read-only and put that action in the
   Expenses section itself?

10. **What "monthly expenses" means once months close.** Every ratio reads
    `Schema.monthlyExpensesCents` (tracked over estimated). With closed months,
    the truest figure is a trailing average. Switch the reader to
    "last three closed months' Actual, else the tracked month, else the
    estimate" and note it under D-052's rule that the estimate is kept forever?

11. **One rent, two fields.** Housing Decision owns `housing.rentMonthlyCents`;
    Cash Flow's housing line is an entry. Money Calendar already reads Housing's
    first and falls back to a 30% guess. Under one-owner (D-017) one of them
    should be the rent. Proposal: the entry is the rent; Housing Decision reads it
    and stops owning a copy.

12. **Income-generating costs: B (tagged rows) as recommended, or A
    (sub-table)?** The document argues B in 2.3; it is the one place the model
    could go either way and be defensible.

13. **Scope of the first build pass.** The map is one problem — time on both
    sides of the ledger. A first pass that ships the Expenses section (periods,
    dates, `dateKind`, the log) and the Budget sheet reading it, with income
    events limited to paydays derived from the source's cadence, would give a
    closable month without touching the tax engine. The tax classes, the income
    events for every type, and the Analysis room would be the second pass. Is
    that split acceptable, or is the tax engine change the point?

---

*End of the map. Nothing above is built; the next step is Eli's answers to
Task 6, then a build brief in the per-room template (`SPEC.md` §11) for the
Expenses section first.*
