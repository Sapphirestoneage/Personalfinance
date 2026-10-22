# Contracts (Phase 1: the household spine)

What is stored, and what each engine takes and returns. The code is the
final word; this page says it in one place. Decisions behind each piece are
S-140 to S-155 in DECISIONS.md.

## The Fact

Every stored answer is a Fact:

```
{ value, asOf, source, kind }
```

| kind | meaning | value |
| --- | --- | --- |
| `known` | they told us | the value |
| `rough` | a guess to confirm | the value |
| `computed` | derived and stored on purpose | the value |
| `missing` | not given yet | `null` (never 0) |
| `notForMe` | does not apply | `null` |

`asOf` is a date (YYYY-MM-DD) or null; `source` says where it came from
(`profile v3 (...)`, `ledger`, `demo (made up)`). A Fact may carry a `note`.

## The spine (`slam-spine/1`, `engine/schema.js`)

```
{
  schema: "slam-spine/1",
  meta: { name, asOf, demo, from },
  household: {
    people: [{ id, name, birthDate: Fact<date> }],
    filingStatus: Fact<single|mfj|mfs|hoh>,
    state: Fact<text>, county: Fact<text>, nycResident: Fact<bool>,
    situation: [{ id, from: date|null, value: Fact<employed|self_employed|between_jobs|student|retired|mixed> }],
    healthCoverage: [{ id, from, personId?, value: Fact<employer|parent_plan|own_plan|marketplace|medicaid|medicare|none|other>, planType?: Fact<hdhp|bronze|catastrophic|other> }]
  },
  income: [{ id, type, label, personId, amount: Fact<money>, cadence, start, end,
             likelihood?: Fact<0..1>, withholding: { federal: Fact<money>, state: Fact<money> }, notes? }],
  expenses: [{ id, label, amount: Fact<money>, cadence, start, end, fixed: bool|null, need: bool|null,
               fat: food|accommodation|transportation|null, notes? }],
  accounts: [{ id, family, type, ...fields as Facts }],
  debts: [{ id, family: "debt", type, ...fields as Facts }],
  goals: [{ id, type: fi|savings|payoff|other, label, target?, fiNumber?, annualSpending?: Fact<money>, by?, flavor?, notes? }],
  assumptions: { inflation, realReturn, withdrawalRate: Fact<rate>, lifeExpectancy, coastAge?: Fact<int> },
  taxYears: [{ id: "2026", year: 2026, estimatedPaidFederal?, estimatedPaidState?, capitalGainsLong?, qualifiedDividends?, otherIncome?: Fact<money> }]
}
```

- **Income types**: w2, 1099, unemployment, tips, rental, pension, ss, maybeMoney, other.
- **Cadences**: weekly, biweekly, semimonthly, monthly, quarterly, yearly (a rate);
  `total` (spread evenly from start to end); `once` (paid on start).
  Withholding Facts are in the stream's own cadence.
- **Dated changes** are dates on the items themselves (`start`, `end`, `from`,
  `promoEnds`, `payoffDate`), never special cases in an engine.
- **Paths** name one field: `debts.visa.apr`, `income.salary.withholding.state`,
  `household.people.casey.birthDate`. An array segment is the item's id.

### Account shells (Shells, Variables and Account Rules tabs)

Ten families. Every shell has the base fields; each family adds its own.
`PRESETS` in `engine/schema.js` maps every account type to its family and
the rules that limit it.

| Family | Fields (besides base) | Types (presets) |
| --- | --- | --- |
| base | name, institution, owner, balance, taxTreatment, liquidity, monthlyContribution, linkedGoal | every shell |
| cash | apy, minBalance, monthlyFee, role | checking, savings, hysa, money_market |
| fixedTerm | rate, maturityDate, earlyWithdrawalPenalty | cd, treasury, i_bond |
| employerRetirement | rothShare, matchFormula, vesting, annualLimit, catchUpEligible, loanBalance, priorYearFicaWages, allowsAfterTax, allowsLoans, employerType | k401, roth_k401, k403b, k457b, tsp, solo_k401, after_tax_k401 |
| ira | annualLimit, incomeLimitApplies, basis, contributions [{year, amount}], firstRothYear, conversions [{year, amount, taxable}], proRataExposure, nondeductibleBasis, coveredByWorkplacePlan, rmdApplies | traditional_ira, roth_ira, rollover_ira, inherited_ira, spousal_ira, sep_ira, simple_ira |
| hsaFsa | coverageLevel, annualLimit, investedPortion, unreimbursedReceipts, rolloverRule, planEligible, monthsEligible, employerSeed | hsa, health_fsa, lp_fsa, dc_fsa |
| education | beneficiary, stateTaxDeduction, annualLimit, ageOfControl, stateDeduction, openDate, childBirthYear | k529, coverdell, utma, custodial_roth, able, trump |
| taxable | costBasis, unrealizedGain, expectedReturn, employerStockShare | brokerage, joint_brokerage, crypto, espp, rsu |
| debt | apr, promoApr, promoEnds, deferredInterest, limit, minimum, dueDay, statementCloseDay, secured, payoffDate, federal, plan, stress (1 to 10), reasonsToKeep, business, reportsToPersonalCredit (both required on a credit card) | credit_card, student_loan, private_student_loan, mortgage, heloc, auto_loan, personal_loan, bnpl, payday, medical, irs_plan, k401_loan, family_iou |
| otherAssets | appreciationRate, linkedDebt, incomeProduced | home, rental, car, business, pension, cash_value_life, annuity |

`validate(spine) -> { ok, errors: [{ path, message }] }`.
`loadHousehold(raw)` (`engine/normalize.js`) takes a spine as is, or a
profile file (`_meta.version` 3) and turns it into a spine.

## The Result

Every engine number is a Result:

```
{ value, kind: computed|rough|incomplete|missing, from: [path], rough: [path], missing: [path], rules: [ruleId] }
```

`incomplete` means built from the inputs that exist, with the missing ones
named. `missing` means no number (value null).

## Rules (`engine/rules.js`, `data/rules-2026.json`)

```
makeRules(...registries) -> { get(id, year), meta(id, year), has(id, year), ids(year), years(), cite(id, year) }
statusRuleId(prefix, filingStatus) -> 'STD_S' | 'STD_J' | 'STD_MFS' | 'STD_H' ...
fetchRules(baseUrl, years) -> Promise<Rules>     (browser)
```

Each rule: `{ id, rule, value, unit, appliesTo, notes, source, verified }`,
verified one of yes, law, verify, app. `get` throws on an unknown id; a later
year falls back to the latest registry and `meta().fallback` says so.

## Engines

All pure: spine and rules in, plain objects out. `asOf` defaults to `spine.meta.asOf`.

| Module | Signature | Returns |
| --- | --- | --- |
| cashflow | `cashflow(spine, rules, ym, { mode: 'committed'\|'expected' })` | `{ income: { gross, withheld, fica, takeHome, unwithheld, streams }, saving: { payroll, afterTax }, expenses: { total, fat, need, items }, debtMinimums: { total, items }, surplus, savingsRate: { gross, net } }` |
| | `monthlyAmount(amount, cadence, start, end, ym)`, `paidBetween(amount, cadence, start, end, from, to)` | numbers |
| tax | `taxForYear(spine, rules, year, { asOf, mode })` | `{ owed, withheld, balanceDue, marginal, effective, lines, inputs, missingText, missingPaths, notModeled, notes, partial, nextEstimated }` |
| | `computeTax(inputs, rules, year)` | `{ lines: { grossIncome, fica, seTax, seDeduction, agi, standardDeduction, taxable, ordinaryTax, gainsTax, additionalMedicare, federalIncomeTax, federalTotal, stateTaxable, stateTax, total, withheld, estimatedPaid, balanceDue, marginalFederal, marginalState, marginalSe, marginal, effective } }`, each `{ value, rules }` |
| | `nextEstimatedDate(asOf, rules)` | `{ date, taxYear, quarter, rule }` |
| projection | `project(spine, rules, { asOf, mode: 'expected', endYm })` | `{ months: [row x APP_PROJ_MONTHS], years: [row per calendar year], events, firstShortfall, from, rough, missing, rules, kind }`; row: `{ ym, age, gross, takeHome, expenses, debtPaid, interest, tax, saved, surplus, cash, invested, otherAssets, debt, netWorth }`; monthly rows add `payments: [{ id, date, amount }]`, each minimum on its due day |
| fi | `fiReport(spine, rules, cf, sheet, asOf)` | `{ fiNumber, goal, goalSource, implied, goalBelowImplied, fiPercent, leanFi, coastFi, coastAge, coastReached, annualSaving, yearsToFi, neverAtThisRate }` |
| | `yearsToTarget(P, C, F, r)` | years or null |
| debt | `utilization(spine)` returns `{ items: [{ id, name, balance, limit, business, reports, util }], personal, overall }` (each total a Result with balance and limit); `creditScoreNote(spine, rules, asOf, util)` returns `{ warn, cards, smallest, personalNow, personalAfter }`; `orderDetail(spine, ids, asOf)`; `rateOn(debt, iso)` (the intro rate through its end date, then the APR; an APR marked not for me is 0); `promoDeadlines` items carry `switchDate`, `aprAfter`, `aprAfterKind`; `minimumPayment(debt, rules, iso, balance)`, `promoDeadlines(spine, asOf)`, `order(spine, strategy, asOf, { cardsOnly })`, `payoffPlan(spine, rules, { strategy, extra, asOf, cardsOnly })`, `minimumsTotal(spine, rules, iso)` (items carry `dueDate`), `dueDateIn(debt, ym)`, `debtTotals(spine)` | strategies: avalanche, snowball, stress |
| emergency | `emergency(spine, rules, cf, sheet, asOf)` | `{ age, targetMonths, targetDollars, gap, tiers: { full: { burn, runway }, fatOnly: { burn, runway } }, runwayWarnMonths, backstop }` |
| | `rothBackstop(spine, rules, asOf, age)` | `{ contributions, conversions: [{ accountId, year, amount, clockOpens, penaltyFree, penaltyRate }], conversionsTotal, countedAsCash: false }` |
| defaults | `applyDefaults(spine, rules)` | a new spine: every credit card with no APR gets `DEFAULT_CARD_APR`, and every debt with no due day gets `DEFAULT_DUE_DAY`, as rough Facts (never a statement close day). Run after loading and after every edit |
| networth | `balanceSheet(spine)` | `{ cash, invested, assets, debts, cards, netWorth, byFamily }` |
| flags | `buildFlags(spine, rules, summary)` | `[{ id, level: act\|watch\|info, title, detail, from, rules }]` |
| summary | `summarize(spine, rules, { asOf, flags })` | `{ asOf, ym, cashflow, sheet, debt: { utilization, creditScore, promo, avalanche, avalancheCards, avalancheCardsDetail }, emergency, fi, tax, flags }`; `payoffOrders(spine, rules, summary)` |
| labels | `labelFor(spine, path)`, `groupFor(path)`, `GROUPS` | words for a field; its DAITE group |
| ledger | `ledgerRows(spine)`, `stillGuessing(spine, rules)`, `typeFor(spine, path)`, `cardRateRow(spine, card)`, `rowPathFor(spine, path)`, `hasIntro(card)` | rows by group (a card's APR, intro rate and intro end are one row of type `cardRate`, value `{ apr, intro: { rate, ends } | null }`); `{ swing, items: [{ path, label, kind, group, blocks, score, moves }] }` |
| edits | `parseInput(type, text)`, `inputText(type, value)`, `editFact(spine, path, 'set'\|'confirm'\|'notForMe'\|'clear', { value, kind, today })`, `parseCardRate({ apr, hasIntro, introRate, introEnds })`, `editCardRate(spine, cardId, 'set'|'confirm'|'notForMe', { value, kind, today })`, `createHistory`, `commit`, `undo`, `redo` | a new spine; a new history |

## Views

`ui/ledger.js` and `ui/dashboard.js` call `summarize`, `ledgerRows`,
`stillGuessing` and the edit functions, and only format what comes back
(`test/spine-ledger.test.js` checks they do no money math). Household
loading: `ui/household.js` (saved edits, then `fixtures/eli.local.json`,
then `fixtures/demo.json`).
