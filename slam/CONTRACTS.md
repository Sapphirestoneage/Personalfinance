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
    expenseDefaults?: { food|accommodation|transportation|other: { shared, sharedWith, yourShare, whoPays } }, payers?: [name],
    cardPayPolicy?: Fact<minimum|statement>,   // how every card is paid unless it says otherwise (S-189)
    situation: [{ id, from: date|null, value: Fact<employed|self_employed|between_jobs|student|retired|mixed> }],
    healthCoverage: [{ id, from, personId?, value: Fact<employer|parent_plan|own_plan|marketplace|medicaid|medicare|none|other>, planType?: Fact<hdhp|bronze|catastrophic|other>, enrolled?: Fact<bool>, setAside?: Fact<money> }]
  },
  income: [{ id, type, label, personId, amount: Fact<money>, cadence, start, end,
             likelihood?: Fact<0..1>, withholding: { federal: Fact<money>, state: Fact<money> },
             businessExpenses?: Fact<money> (1099, S-179), depositTo?: Fact<link> (S-189), payDay?: Fact<int 1..31> (S-199), notes? }],
  expenses: [{ id, label, amount: Fact<money>, cadence, start, end, fixed: bool|null, need: bool|null,
               fat: food|accommodation|transportation|null, need: Fact<bool>, covered?: Fact<bool>, coveredBy?: Fact<text>,
               shared?, sharedWith?, yourShare?, whoPays?: Facts (S-175),
               paidFrom?: Fact<link>, payDay?: Fact<int 1..31> (S-189),
               subscription?: Fact<bool>, renews?: Fact<date>, reviewed?: Fact<date> (S-191), notes? }],
  accounts: [{ id, family, type, ...fields as Facts }],      // fundedFrom?: Fact<link> (an account id or "paycheck")
  debts: [{ id, family: "debt", type, ...fields as Facts }],  // paidFrom?: Fact<link>, payPolicy?: Fact<minimum|statement>
  goals: [{ id, type: fi|savings|payoff|other, label, target?, fiNumber?, annualSpending?: Fact<money>, by?, flavor?, notes? }],
  assumptions: { inflation, realReturn, withdrawalRate: Fact<rate>, lifeExpectancy, coastAge?: Fact<int> },
  taxYears: [{ id: "2026", year: 2026, estimatedPaidFederal?, estimatedPaidState?, capitalGainsLong?, qualifiedDividends?, otherIncome?, setAside?: Fact<money> }],
  debtPlan?: { extra?: Fact<money>, day?: Fact<int>, strategy?: Fact<avalanche|snowball>, stopAtHi?: Fact<bool>, hiRate?: Fact<rate>, rollFreed?: Fact<bool> },   // S-203
  calendar?: { overrides?: { "sourceId|YYYY-MM-DD": { date?, amount?, skip? } }, maybe?: [{ id, label, amount, date, likelihood?, direction? }], guard?: bool, autoCover?: bool, locks?: { "sourceId|YYYY-MM-DD": true } }   // S-203, S-204, plain values: timing decisions, not Facts
  // S-205: on a debt, reportDay, annualFee, annualValue, rewardsRate, bonusSpend, bonusBy, bonusSpent, bonusValue, pslf (Facts, optional); household.householdSize (Fact, optional)
  // S-206: log?: [{ id, date, amount, kind: 'spend'|'refund'|'income', tag?, expenseId?, merchant?, note?, paidWith?, source: 'typed'|'import' }] (plain records of what happened)
  //        checkins?: [{ id, date, balances: { accountId: amount }, forecast: { accountId: amount|null } }] (plain); calendar.sweep?: { on, to, keep }
  //        household.workHoursPerWeek (Fact, optional); on an expense, trialEnds (Fact, optional)
  // S-207: a log entry may carry importKey (text); feed?: { memory: { merchant: expenseId } }
  // S-208: household.deductible, household.commuteHoursPerWeek (Facts); accounts.*.matchRate, matchCap (Facts); expenses.*.workRelated (Fact); goals.*.priority, linkedAccount, sinkingFund, monthly, spendOn, repeatYearly (Facts); income and expense items may carry lifeEvent (text)
}
```

- **Income types**: w2, 1099, unemployment, tips, rental, pension, ss, maybeMoney, other.
- **Cadences**: weekly, biweekly, semimonthly, monthly, quarterly, yearly (a rate);
  `total` (spread evenly from start to end); `once` (paid on start).
  Withholding Facts are in the stream's own cadence.
- **Dated changes** are dates on the items themselves (`start`, `end`, `from`,
  `promoEnds`, `payoffDate`), never special cases in an engine.
- **Links** (`link` type, S-189) hold an account or card id, or `paycheck`; an id that is gone reads as "an account no longer here".
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
| debt | apr, promoApr, promoEnds, deferredInterest, limit, minimum, dueDay, statementCloseDay, secured, payoffDate, federal, plan, stress (1 to 10), reasonsToKeep, business, reportsToPersonalCredit (both required on a credit card), everydayCard, payLast (S-203) | credit_card, student_loan, private_student_loan, mortgage, heloc, auto_loan, personal_loan, bnpl, payday, medical, irs_plan, k401_loan, family_iou |
| otherAssets | appreciationRate, linkedDebt, incomeProduced | home, rental, car, business, pension, cash_value_life, annuity |

`validate(spine) -> { ok, errors: [{ path, message }] }`.
`upgradeSpine(spine)` adds fields a newer version requires to a saved
spine. `loadHousehold(raw)` (`engine/normalize.js`) takes a spine as is, or a
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
| cashflow | `cashflow(spine, rules, ym, { mode: 'committed'\|'expected', schedule, taxCache })` | `{ income: { gross, withheld, fica, takeHome, unwithheld, streams }, saving: { payroll, afterTax }, expenses: { total, fat, need, lean, items }, debtMinimums: { total, items }, taxSetAside: { total, lines, rate }, surplus, savingsRate: { gross, net } }`. A month after the as-of month takes its minimums from the debt schedule; a shared expense counts your share; a covered one counts $0; `need` is missing when nothing is tagged a need |
| | `monthlyAmount(amount, cadence, start, end, ym)`, `paidBetween(amount, cadence, start, end, from, to)` | numbers |
| tax | `taxForYear(spine, rules, year, { asOf, mode })` | `{ owed, withheld, balanceDue, marginal, effective, lines, inputs, missingText, missingPaths, notModeled, notes, partial, nextEstimated }` (`partial` adds the marginal rates on the known income) |
| | `computeTax(inputs, rules, year)` | `{ lines: { grossIncome, fica, seTax, seDeduction, agi, standardDeduction, taxable, ordinaryTax, gainsTax, additionalMedicare, federalIncomeTax, federalTotal, stateTaxable, stateTax, total, withheld, estimatedPaid, balanceDue, marginalFederal, marginalState, marginalSe, marginal, effective } }`, each `{ value, rules }` |
| | `nextEstimatedDate(asOf, rules)` | `{ date, taxYear, quarter, rule }` |
| | `taxSetAside(spine, rules, ym, { mode, streams, cache })`, `yearTax(spine, rules, year, mode, cache)` | `{ total, lines: [{ kind: balance\|income\|conversion, id, label, base, held?, rate, months?, amount, taxYear }], rate }`: the balance due less money set aside, over the months to the return; the marginal method only while the tax cannot be figured (S-180); `yearTax` caches `taxForYear` |
| projection | `project(spine, rules, { asOf, mode: 'expected', endYm, investSurplus, stopAt })` | `{ months: [row x APP_PROJ_MONTHS], years: [row per calendar year], events, firstShortfall, reached, from, rough, missing, rules, kind }`; row: `{ ym, age, gross, takeHome, expenses, debtPaid, interest, taxSetAside, tax, saved, surplus, cash, invested, otherAssets, debt, netWorth }`; monthly rows add `payments: [{ id, date, amount }]`. One debt schedule for the run; each year's set-aside is a reserve settled each April |
| fi | `fiReport(spine, rules, cf, sheet, asOf, { fromProjection })` | `{ fiNumber, goal, goalSource, implied, goalBelowImplied, fiPercent, leanFi, coastFi, coastAge, coastReached, annualSaving, yearsToFi, neverAtThisRate }`; Lean FI and every FI number use the one withdrawal rate; years to FI come from the projection (`yearsToFi.note` says why when missing) |
| | `yearsToTarget(P, C, F, r)` | years or null |
| debt | `utilization(spine)` returns `{ items: [{ id, name, balance, limit, business, reports, util }], personal, overall }` (each total a Result with balance and limit); `creditScoreNote(spine, rules, asOf, util)` returns `{ warn, cards, smallest, personalNow, personalAfter }`; `orderDetail(spine, ids, asOf)`; `rateOn(debt, iso)` (the intro rate through its end date, then the APR; an APR marked not for me is 0); `debtSchedule(spine, rules, asOf, untilYm)` returns `{ months: Map(ym -> { payments, paid, interest, debt, paidOff }), from, rough, missing, rules }`; `estimateCardMinimum(debt, rules, iso, balance)`; `promoDeadlines(spine, asOf)` (items carry `switchDate`, `aprAfter`, `aprAfterKind`); `minimumPayment(debt, rules, iso, balance)`, `order(spine, strategy, asOf, { cardsOnly })`, `payoffPlan(spine, rules, { strategy, extra, asOf, cardsOnly })`, `minimumsTotal(spine, rules, iso)` (items carry `dueDate`), `dueDateIn(debt, ym)`, `debtTotals(spine)` | strategies: avalanche, snowball, stress |
| emergency | `emergency(spine, rules, cf, sheet, asOf)` | `{ age, targetMonths, targetDollars, gap, tiers: { full: { burn, runway }, fatOnly: { burn, runway } }, monthlyNeed, backstop }` (dollar targets use `monthlyNeed`, the month's spending rounded up to a whole dollar) |
| | `rothBackstop(spine, rules, asOf, age)` | `{ contributions, conversions: [{ accountId, year, amount, clockOpens, penaltyFree, penaltyRate }], conversionsTotal, countedAsCash: false }` |
| defaults | `applyDefaults(spine, rules)`, `mainChecking(spine)`, `isPhone(expense)` | a new spine: every credit card with no APR gets `DEFAULT_CARD_APR`, every card with no minimum the house default minimum (recomputed for each balance), every debt with no due day `DEFAULT_DUE_DAY`, cash other than high-yield savings `DEFAULT_APY`, a car `DEFAULT_VEHICLE_DEPRECIATION`, a phone with no amount `DEFAULT_PHONE_PLAN_1`, every unlinked expense, income, debt and contribution the main checking account (pre-tax retirement: the paycheck), and `cardPayPolicy` minimum, all as rough Facts (never a statement close day). Run after loading and after every edit |
| sharing | `shareOf(spine, expense)`, `coverOf(expense)`, `payersOf(spine)`, `yourCost(amount, share)` | `{ shared, share, people, whoPays, from, rough, missing, fromDefault }`: not shared unless the expense or its section default says so |
| scenarios | `withScenario(spine, rules, best\|likely\|worst)`, `scenarioAssumptions(spine, rules, id)`, `SCENARIOS`, `scenarioRule(fact)` | Triple D (S-183): best is the household's own real return and withdrawal rate; likely and worst come from `SCENARIO_*` rules |
| flow | `moneyFlow(spine, rules, cf, { open })` | `{ nodes: [{ id, label, col, kind, path, section, open, amount }], links: [{ from, to, amount, rough }], left, short, sections }` (S-192); left minus short is the month's surplus |
| subscriptions | `subscriptions(spine, rules, cf, asOf)`, `nextCharge(date, cadence, asOf)`, `isSubscription(expense)` | `{ items: [{ id, label, monthly, yearly, renews, daysToCharge, reviewed, soon, due }], monthly, yearly, toLook, reviewDays, soonDays }` (S-191) |
| starter | `STARTER`, `addPicked(spine, [{ key, count }], today)`, `haveCounts(spine)` | Pick what you have (S-193): `{ spine, added: [first paths], count }` |
| calendar | `calendar(spine, rules, { from, months, mode, asOf, maybeMode })`, `payDatesIn(start, cadence, end, ym)`, `weekdayOf(iso)`, `monthCashTerms(sim, ym)`, `rangeCashTerms(sim, from, to)` | `{ asOf, mode, maybeMode, from, months: [{ ym, days: [{ date, day, events, in, out }], undated: [events], events, in, out, net, cash: { value, total, today, kind, note, path, when }, line: [{ date, cash, primary, debt, in, out }], low, monthCash: { start, startDate, end, endDate, groups }, surplus, kind, rough, missing }], sim, from, rough, missing, rules }` (S-200, S-203: the cash line and month-end checking come from `cashsim`). An event: `{ id, date (or null), day, kind, label, amount (positive, or null), direction: in, out or null, counted, rough, note, path, source }`; kinds pay, bill, subscription, debt, saving, setAside, promoEnds, estimatedTax, taxReturn, incomeStarts, incomeEnds, expenseStarts, expenseEnds, coverage, situation |
| cashsim | `cashModel(spine, rules, { asOf, months, days })`, `cashsim(spine, rules, { asOf, months, days, maybeMode })`, `threeWays(spine, rules, opts)`, `burnTiers(spine, rules, cf, { extra })`, `windowDays(asOf, months)`, `debtPlanOf(spine, rules, t, year)` | S-203. `cashModel` returns `{ model (cents, the vendored engine's shape), needs: [{ path, what }], from, rough, missing, rules, cf }`. `cashsim` returns `{ start, days, mode, model, run, needs, cf, daily: [{ date, dom, cash, primary, cardDebt, loanDebt, payLater, debt, in, out, balances, events: [{ kind, label, amount, account, card, statement, due }] }], low, floor: { amount, target, cushionCash, source, guard }, firstBelowFloor, firstBelowZero, dryDate, raidDate, cards, loans, clearDates: { cardsFree, hiFree, loansFree, allFree, hiRate, perCard }, interest, lateFees, shortfalls, extraPaid, extraLog, monthly, safeToSpend, paychecks, totals, everydayPerDay, extra, kind, from, rough, missing, rules }`, all money in dollars. `burnTiers` returns `{ tiers: [{ id, label, amount, cumulative }], takeHome, unallocated, spending, missing, kind }` |
| calendar-views | `weeks(sim)`, `agenda(sim, n)`, `yearStrip(spine, rules, { asOf, maybeMode, sim })`, `paychecks(spine, rules, sim, s)`, `milestones(spine, rules, sim, months)`, `searchEvents(months, q)`, `pillsFor(e, asOf, cal)` | S-204. Readings of one `cashsim` run. `weeks` → `[{ from, to, in, out, start, end, low: { date, amount }, underFloor, hasLow, events }]` (Sunday to Saturday); `agenda` → `[{ date, events, end, isLow, underFloor }]` (everyday spending folded into one line, empty days dropped); `yearStrip` → `{ months: [{ ym, in, out, net, low, interest, tight, underFloor }], floor, tightWeek, tightCount, kind, from, rough, missing, rules }` (twelve months from the as-of date, its own 12-month run unless the sim given covers a year); `paychecks` → the sim's paychecks plus `{ streamId, cadence, ym, n, of, path, bonus, bonusWhy, couldDo: { step, label, amount, why } \| null, coverage, short }` (n counts every pay date in the calendar month; bonus = third biweekly or fifth weekly; couldDo = the first windfall step that takes money); `milestones` → `[{ date, label, kind, path, note }]` sorted and deduped (cleared, paidOff, cardsFree, hiFree, allFree, dry, promoEnds, incomeStarts, incomeEnds, expenseStarts, expenseEnds, coverage, situation, taxReturn); `searchEvents` → the months' events whose label, note or kind contains the words, each with `ym`; `pillsFor` → `['sub'\|'plan'\|'repeat'\|'locked'\|'done'\|'maybe']`. |
| debtview | `debtView(spine, rules, sim, s, { asOf })`, `clearDates(sim)`, `gantt(sim)`, `orderList(spine, rules, sim, asOf)`, `interestTimeline(sim)`, `cardTiles(spine, rules, sim, asOf)`, `minimumTrap(spine, rules, debt, asOf)`, `utilizationAtReport(spine, rules, sim)`, `feeRoi(debt)`, `signupBonus(debt, sim, asOf)`, `idr(spine, rules, debt, s, asOf)`, `solvePayoff(spine, rules, sim, { target, byDate, maxExtra })`, `whichCard(spine, rules, sim, { amount, category })`, `balanceTransfer(spine, rules, { cardId, feeShare, promoMonths, postApr, payment }, asOf)` | S-205. `debtView` → `{ asOf, window, clearDates: { hiRate, rows: [{ id, label, date, beyond, why }] }, gantt: { from, to, days, rows: [{ id, name, kind, path, startBalance, endBalance, clearDate, beyond, endsAt, fraction, interest, apr, promoEnd, revolving }], ticks }, order: { strategy, extra, rows: [{ position, id, name, kind, path, balance, rate, promo, promoEnds, payLast, clearDate, planYm, interestInWindow, planInterest }], debtFreeYm, neverPaysOff, totalInterest, kind }, interest: { months: [{ ym, byDebt, total }], debts, max, total }, cards: [{ id, name, path, balance, startBalance, apr, promoApr, promoEnd, everyday, payLast, revolving, clearDate, interest, cycle: { stmtDay, closeRough, graceDays, dueDay, nextClose, nextDue, nextStatement, autopay, everyday }, util, why: { code, text, minimum, interest, charged, paid } \| null, trap, fee, bonus }], utilization: { warn, items, personal, overall }, loans: [idr], kind, from, rough, missing, rules }`. `minimumTrap` → `{ minimumNow, interestNow, months, years, interest, neverPaysOff, trapped, kind... }`; `feeRoi` → `{ fee, value, net, verdict, kind... }` or null; `signupBonus` → `{ required, spent, left, value, by, daysLeft, perDayNeeded, perDayNow, onPace, done, missed, kind... }` or null; `idr` → `{ federal, agi, agiSource, householdSize, povertyLine, discretionary, payment, standardPayment, lower, forgivenessYears, forgivenessDate, pslf: { payments, date } \| null, missingRules, kind... }` (a missing rule is `rule:<id>` in `missing`); `solvePayoff` → `{ target, name, byDate, extraNow, need, date, breaksCash, shortfalls, low, already?, impossible?, best? }` or null; `whichCard` → `{ amount, rows: [{ id, name, rewards, interest, net, interestFreeDays, utilizationWarn, revolving, rate, path }], best, kind... }`; `balanceTransfer` → `{ cardId, name, balance, apr, feeShare, promoMonths, postApr, fee, interestSkipped, netSaving, worthIt, balanceLeftAfterPromo, payment, kind... }` or null. |
| spending | `cleanMerchant(text)`, `monthLog(spine, ym)`, `tagBudgets(spine, rules, cf, { ym, asOf })`, `safeToSpend(sim)`, `canISpend(spine, rules, sim, { amount, date, paidWith })`, `cutSimulator(spine, rules, s, { dropped, towardDebt, asOf })`, `donut(spine, rules, s)`, `billAutopsy(spine, rules, s, asOf)`, `priceChanges(spine, rules, asOf)`, `freeTrials(spine, rules, asOf)`, `checkInForecast(spine, sim, date)`, `drift(spine)`, `staleness(spine, rules, today)`, `momentum(spine, rules)`, `sweepReading(sim)`, `spendingView(spine, rules, sim, s, { today, ym })` | S-206. `tagBudgets` → `{ ym, dayFrac, day, daysInMonth, rows: [{ tag, label, budget, spent, left, expected, pace, lastMonthSameDay, hot, over, items, kind }], spentTotal, budgetTotal, hotMultiple, entries, kind... }`; `safeToSpend` → `{ today, committed, nextIncome, daysUntil, perDay, cash, floor, excludesCushion, byDay, kind... }`; `canISpend` → `{ amount, date, paidWith, verdict: 'yes'\|'tight'\|'no', lowBefore, lowAfter, safeBefore, safeAfter, interest, interestNote, hours, hourlyWage, delayDays, shortfalls, kind... }`; `cutSimulator` → `{ dropped, saved, surplusBefore, surplusAfter, towardDebt, debt: { extraNow, extraAfter, strategy, debtFreeBefore, debtFreeAfter, neverBefore, neverAfter, interestBefore, interestAfter, interestSaved, monthsSooner } \| null, kind... }`; `donut` → `{ slices: [{ id, label, amount, share, items }], total, spent, left, short, kind... }`; `billAutopsy` → `{ rows: [{ id, label, monthly, yearly, path, subscription, need, reviewed, stale }], yearlyTotal, staleCount, kind... }`; `priceChanges` → `{ rows: [{ id, label, planned, logged, date, change, path, subscription }], drift }`; `freeTrials` → `{ rows: [{ id, label, trialEnds, daysLeft, converted, soon, converts, path }], warnDays }`; `checkInForecast` → `{ date, forecast: { accountId: amount }, accounts: [{ id, name, path, cushion, now }] }`; `drift` → `{ count, mean, sd, kind: 'none'\|'first'\|'bias'\|'noise', words, checkins }`; `staleness` → `{ anchor, days, limit, stale, words }`; `momentum` → `{ points, perMonth, kind: 'none'\|'first'\|'flat'\|'building'\|'slipping', words }`; `sweepReading` → `{ on, to, keep, moves: [{ date, amount, to, toName }], total }`. Edits (engine/edits.js): `logSpend(spine, { amount, date, kind, tag, expenseId, merchant, note, paidWith, source })` → `{ spine, id }`, `removeLog(spine, id)`, `checkIn(spine, { date, balances, forecast })` (writes the balances as known Facts as of that day and sets `meta.asOf`), `setSweep(spine, { on, to, keep })`. |
| feed | `parseCsv(text)`, `detectFormat(headerRow)`, `parseDate(s)`, `parseMoney(s)`, `readCsv(text, { format, flip })`, `classifyKind(row, kindRules, isCard)`, `matchExpense(spine, { merchant, lineId, name, memory, rules })`, `proposeCsv(spine, rules, text, { format, flip, paidWith, merchantRules })`, `proposeBudget(spine, rules, doc, { merchantRules })`, `applyImport(spine, proposals, { picks, learn })`, `budgetDocsFromStorage(getItem, keys)`, `FORMATS`, `MATCH_DAYS`, `MATCH_SHARE`, `RECURRING_COUNT` | S-207. A proposal: `{ key, date, amount, kind: 'spend'\|'refund'\|'income'\|'card-payment'\|'transfer', merchant, description, expenseId, tag, paidWith, status: 'same'\|'matched'\|'recurring'\|'new'\|'skip', why, include, source }`; `proposeCsv` → `{ format, label, skippedRows, proposals, counts, words }`; `proposeBudget` → `{ count, proposals, counts, words }`; `applyImport` → `{ spine, added, skipped }` (entries land with `source: 'import'` and their `importKey`; `spine.feed.memory[merchant] = expenseId`); `budgetDocsFromStorage` → `[{ key, id, name, transactions, doc }]`. |
| compare | `estimatedVsActual(spine, rules, { months, asOf })` | S-207. `{ from, to, months, monthsLogged, monthsSilent, lines: [{ id, label, tag, path, planned, actual, entries, missing, diff, kind }], tags: [{ tag, label, planned, actual, unassigned, missing, diff, kind }], spend: { planned, actual, diff, entries }, income: { planned, actual, entries, diff }, savingsRate: { real, plan, note }, kind, from_, rough, missing, rules }`. |
| plan | `surplusWaterfall(spine, rules, s)`, `fooLadder(spine, rules, s, { asOf })`, `fooGhosts(spine, rules, s, months)`, `allocator(spine, rules, sim, s)`, `solvers(spine, rules, s, { byAge, asOf })`, `realHourlyWage(spine, rules, s, { asOf })`, `hoursOf(amount, wage)`, `draftt(spine, rules, s, { asOf })`, `fixedFloor(spine, rules, s, sim, { months, asOf })`, `incomeShock(spine, rules, sim, { from, months })`, `outlook(spine, rules, sim, { runs, wobble })`, `goalsView(spine, rules, s, { asOf })`, `applyLifeEvent(spine, template, date, { today })`, `removeLifeEvent(spine, templateId)`, `diffSpines(a, b)`, `exportJson(spine, { exportedAt })`, `importJson(text)`, `exportCsv(spine, 'log'\|'lines')`, `RUNG_LABELS`, `EXPORT_FORMAT` | S-208. `fooLadder` → `{ rungs: [{ id, rung, label, need, flow, done, months, completes, why, path, kind... }], current, surplus, setup: { deductible, match, reserveMonths }, allDated, kind... }`; `allocator` → `{ paychecks: [paycheck + { is1099, setAside, setAsideRate, setAsideMissing, envelopes, everyday, committed, free, short }], bonusMonths, kind... }`; `solvers` → `{ targetAge, age, years, fiNumber, invested, realReturn, savingNow, grossNow, spendingNow, yearsNow, rows: [{ id: 'savingsRate'\|'spending'\|'income'\|'return', label, value, unit, now, words }], kind... }` (or `rows: []` with `note`); `realHourlyWage` → `{ wage, naive, takeHome, costMonthly, costs, hoursWeek, commuteWeek, hoursMonthly, kind... }`; `draftt` → `{ rows: [{ key, letter, label, amount, share, shareOfTakeHome, reference?, referenceAmount? }], total, totalShare, everythingElse, leftOver, base, housingReference, kind... }`; `fixedFloor` → `{ floor, items, minimums, cash, runwayMonths, shock, kind... }`; `incomeShock` → `{ from, months, runwayDays, firstBad, low, atRisk, shortfalls }`; `outlook` → `{ runs, wobble, low: { bad, typical, good }, end, interest: { low, typical, high }, shareBelowFloor, floor }`; `goalsView` → `{ rows: [{ id, label, type, path, target, held, toGo, monthly, linkedAccount, sinking, priority, by, spendOn, repeat, months, reached, onTime, neededMonthly, fiCostMonths, kind... }], yearsToFiNow, setAsideTotal }`; `applyLifeEvent` → `{ spine, added, shockMonths }`; `diffSpines` → `[{ path, change: 'added'\|'removed'\|'changed', before, after }]`; `importJson` → `{ spine, exportedAt, migrated }` or throws. `windfall(spine, rules, s, { amount, taxed, source: 'w2'\|'1099'\|'other', monthly })` (S-201, S-208). |
| page (ui) | `mountPage({ app })`, `liveHeadline(text)`, `BUILD` | S-208. The skip link, the error banner, the build stamp; every page calls it once. |
| vendor | `engine/vendor/cashcal.js`, `engine/vendor/loanmath.js`, `engine/vendor/mr3-shims.js` | Byte copies of the Money Rooms v3 files below their import block (S-203); `test/spine-vendor.test.js` fails on drift. SLAM calls `simulate`, `schedule`, `paydays`, `occurrences`, `threeWays` and the feature functions; never `buildModel`, `setCalendar` or `spendPace` (the shims throw) |
| windfall | `windfall(spine, rules, s, { amount, taxed })`, `STEP_LABELS` | `{ amount, taxed, asOf, steps: [{ id, label, need, amount, before, short, why, path, items, kind, from, rough, missing, rules }], assigned, left, order, kind, from, rough, missing, rules }` (S-201); `s` is the summary; the order is the `WINDFALL_ORDER` rule |
| networth | `balanceSheet(spine)` | `{ cash, invested, assets, debts, cards, netWorth, byFamily }` |
| flags | `buildFlags(spine, rules, summary)` | `[{ id, stage: red\|yellow\|green, stageNumber, stageLabel, title, detail, next, green, from, rules }]`, red first, the income cliff at the top; a goal is `{ text, target, gap, by, months, monthly, path }` (FI goals add `goalNeeded`, `spendingNeeded`). Also `goal(asOf, text, opts)` and `stageFor(value, redOver, greenAtOrUnder)` |
| summary | `summarize(spine, rules, { asOf, flags })`, `incomeCliff(spine, rules, asOf)` | `{ asOf, ym, cashflow, sheet, cliff, debt: { utilization, creditScore, promo, avalanche, avalancheCards, avalancheCardsDetail }, emergency, fi, tax, subs, flags }`; `payoffOrders(spine, rules, summary)` |
| labels | `labelFor(spine, path)`, `groupFor(path)`, `GROUPS` | words for a field; its DAITE group |
| ledger | `ledgerRows(spine)`, `stillGuessing(spine, rules)`, `stillGuessingSteps(spine, rules)` (a generator, for slices), `paymentRow(spine, expense)`, `linkOptions(spine, type)`, `linkName(spine, id)`, `typeFor(spine, path)`, `cardRateRow(spine, card)`, `expenseRow(spine, expense)`, `incomeRow(spine, stream)`, `previewCost(amount, cadence, shared, people, share)`, `rowPathFor(spine, path)`, `hasIntro(card)` | rows by group; a card's APR, intro rate and intro end are one `cardRate` row; an expense's amount, how often, sharing and cover are one `expense` row; an income stream's amount, how often, dates and pay day are one `income` row (S-199); `{ swing, items: [{ path, label, kind, group, blocks, score, moves }] }` |
| ledger-tree | `ledgerTree(spine, institutions)`, `institutionOf(item, institutions)` | DAITE group > section > (institution) > item > rows; each node `{ key, label, children or rows, counts, add }`; every field once |
| edits | `parseInput(type, text)`, `inputText(type, value)`, `editFact(spine, path, 'set'\|'confirm'\|'notForMe'\|'clear', { value, kind, today })`, `putFact(spine, path, value, kind, today)`, `parseCardRate(...)`, `editCardRate(spine, cardId, 'set'\|'confirm'\|'notForMe', { value, kind, today })`, `editExpense(spine, id, { amount, cadence, sharing, coveredBy, kind, label, subscription, start, end }, today)`, `editIncome(spine, id, { amount, cadence, start, end, payDay, kind, label }, today)`, `editPayment(spine, id, { from, day, kind }, today)`, `duplicateItem(spine, collection, id, today, name)`, `setSectionSharing(spine, tag, { shared, sharedWith, yourShare, whoPays }, today)`, `addItem(spine, { collection, type, label, cadence, fat }, today)`, `removeItem(spine, collection, id)`, `moveOccurrence(spine, key, date)` (refuses a locked key; the original date clears the move), `skipOccurrence(spine, key, skip)`, `repriceOccurrence(spine, key, amount\|null)`, `lockOccurrence(spine, key, on)`, `addMaybe(spine, { label, amount, likelihood, direction, date })` → `{ spine, id }`, `setMaybeDate(spine, id, date\|null)`, `removeMaybe(spine, id)` (S-204; `key` is `sourceId\|YYYY-MM-DD`), `bulkEdit(spine, rows, 'confirm'\|'rough'\|'notForMe', today)`, `createHistory`, `commit`, `undo`, `redo` | a new spine (`addItem` returns `{ spine, id, firstPath }`); a new history |

## Views

`ui/ledger.js` and `ui/dashboard.js` call `summarize`, `ledgerRows`,
`stillGuessing` and the edit functions; `ui/calendar.js` calls `calendar`
and `ui/windfall.js` calls `windfall`; each only formats what comes back
(`test/spine-ledger.test.js` checks they do no money math). Household
loading: `ui/household.js` (saved edits, then `fixtures/eli.local.json`,
then `fixtures/demo.json`).
