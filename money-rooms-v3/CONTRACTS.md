# Contracts

Money Rooms v3 is a hub and spoke. The Sun holds the household's facts that
belong to no planet, plus one slot per planet for that planet's published
outputs. Planets read the Sun and publish to the Sun. A planet never reads
another planet. This file is the law for what each planet publishes; code
that publishes a key not listed here fails `tests/engine/contracts.test.js`.

Every published figure is a Quantity: `{ cents, period, basis, tax, confidence,
range }` (see `engine/units.js`). Period is monthly, annual or oneoff. Basis
is real or nominal. Tax is pretax, aftertax or na. A figure whose inputs are
missing is published as `{ status: "needs", needs: ["field id", ...] }`, never
as zero and never as N/A. "None" (a real zero, confidence 1.0) publishes a
zero.

## Sun (owner of the household facts)

Facts: `name`, `birthDate`, `state`, `city`, `workSituation`
(employed, self-employed, between-jobs, student, retired, mixed),
`dependents`, `filingStatus` (single, mfj, hoh; MR-008), `bigGoal`.
Sessions: `sessions[]` (snapshots). Slots: `outputs.<planet>`.

## 1. Income

Reads from the Sun: `workSituation`, `birthDate`.
Publishes:

| key | units | meaning |
|---|---|---|
| `grossMonthly` | monthly, pretax | sum of every income row's gross, monthly |
| `takeHomeMonthly` | monthly, aftertax | sum of take-home, monthly |
| `pretaxContribMonthly` | monthly, pretax | 401k-type pre-tax deferrals from pay (MR-009) |
| `rothContribMonthly` | monthly, aftertax | Roth 401k-type deferrals from pay |
| `hsaPayrollMonthly` | monthly, pretax | HSA contributions from pay |
| `pretaxOtherMonthly` | monthly, pretax | health premiums, FSA and other pre-tax lines |
| `matchMonthly` | monthly, pretax | employer match in dollars at the current deferral |
| `matchFormula` | ratios | `{ rate, upTo }` cents matched per dollar and the pay share matched |
| `byType` | monthly, pretax | `{ w2, c1099, side, unemployment, rental, benefits, other }` gross by moon |
| `stability` | flag | steady, variable, at-risk, needs |
| `workHoursMonthly` | hours | paid + commute + prep hours, monthly (for real hourly wage) |
| `workCostsMonthly` | monthly, aftertax | costs of working as stated on income rows |

## 2. Spending

Reads: `takeHomeMonthly`, `grossMonthly` (Sun slots), `dependents`.
Publishes:

| key | units | meaning |
|---|---|---|
| `baselineMonthly` | monthly, aftertax | monthly spending (detail overrides total) |
| `summaryTotalMonthly` | monthly, aftertax | the rough total if one was typed, else null |
| `detailGapMonthly` | monthly, aftertax | detail minus total when both exist |
| `byCategory` | monthly, aftertax | `{ accommodation, food, transportation, therapy, wants, irregular, mistakes, other, utilities }` |
| `drafttShares` | ratio | each DRAFTT line / take-home |
| `fatFloorMonthly` | monthly, aftertax | food + accommodation + transportation needs, plus rows flagged in FAT floor |
| `fixedMonthly` | monthly, aftertax | rows marked need and not variable |
| `mistakesAnnual` | annual, aftertax | rows marked mistake |
| `savingsLandingMonthly` | monthly, aftertax | savings actually landing in accounts, typed as a Spending row of type `savings-transfer` |
| `cardSpendByCategory` | monthly, aftertax | per card id: spend by earn category (for Debt's wallet math) |
| `sharedFullMonthly` | monthly, aftertax | the full bills of lines shared with a roommate (Level 8, MR-047) |
| `sharedShareMonthly` | monthly, aftertax | the client's share of those bills; every other figure uses the share |
| `standIns` | map | per area, "anchor" when the gut anchor stands in for missing lines, "guess" when a guess does (MR-046) |
| `anchorGapByCategory` | monthly, aftertax | per area with lines and a gut anchor: lines minus the anchor |

## 3. Debt and Credit

Reads: `takeHomeMonthly`, `grossMonthly`, `cardSpendByCategory`.
Publishes:

| key | units | meaning |
|---|---|---|
| `totalDebt` | oneoff | sum of balances |
| `debtServiceMonthly` | monthly, aftertax | sum of minimum payments |
| `weightedApr` | ratio | balance-weighted APR (promo rate until promo end) |
| `annualInterest` | annual | interest cost over the next 12 months |
| `utilization` | ratio | `{ total, perCard: { rowId: ratio } }` |
| `promoCliffs` | list | `{ rowId, promoEnd, balance, standardApr, monthsLeft, costAfter }` |
| `payoffOrders` | list | `{ avalanche: [rowId], snowball: [rowId], stress: [rowId] }` |
| `debtFreeDate` | date | at current minimums plus freed cash rolled forward |
| `freedCashByMonth` | monthly | `[ { month, cents } ]` |
| `wallet` | list | per card: earn rates, fee, credits used value, net value, rewards left |
| `creditScore` | int | latest score with asOf |
| `byType` | oneoff | balances by moon |

## 4. Safety Net

Reads: `baselineMonthly`, `fatFloorMonthly`, `fixedMonthly`, `byCategory`, `sharedFullMonthly`, `sharedShareMonthly` (Spending slot),
`cashBalances` (Investments slot), `birthDate`, `takeHomeMonthly`, `workSituation`.
Publishes:

| key | units | meaning |
|---|---|---|
| `ruleOf5Months` | months | age / 5 |
| `ruleOf5Target` | oneoff | months x baseline monthly |
| `runway` | months | `{ full, draftt, fat }` cash / spending at each level |
| `gap` | oneoff | target minus cash, floored at zero |
| `monthlyToClose` | monthly | gap / 12 |
| `insurance` | list | typed coverage rows |
| `premiumsMonthly` | monthly, aftertax | premiums paid from the bank (paycheck premiums are already out of take-home) |
| `unemploymentMonthly` | monthly | state estimate if typed |
| `cutAbilityMonthly` | monthly | what the client says they could cut |
| `spendingWithPremiums` | monthly, aftertax | baseline spending plus bank-paid premiums: the month the metrics use |
| `roommateGap` | oneoff | (full shared bills minus the client's share) x months until a roommate is replaced; a line of the Rule of 5 target (MR-047) |

## 5. Investments and Accounts

Reads: `grossMonthly`, `matchMonthly`, `matchFormula`, `pretaxContribMonthly`, `rothContribMonthly`, `hsaPayrollMonthly` (Income slot), `birthDate` (for limits by age).
Publishes:

| key | units | meaning |
|---|---|---|
| `balancesByBucket` | oneoff | `{ pretax, roth, taxable, hsa, cash, other }` |
| `balancesByLiquidity` | oneoff | `{ liquid, semi, locked }` |
| `cashBalances` | oneoff | sum of checking, HYSA, CD, I bonds, cash |
| `totalAssets` | oneoff | every account balance plus real estate equity |
| `investedAssets` | oneoff | balances that take market returns |
| `annualContributions` | annual | `{ employee, employer, total }` |
| `roomLeft` | annual | per limit: `{ limitId, limit, used, left }` |
| `allocation` | ratio | `{ stocks, bonds, cash, other, usShare }` dollar-weighted |
| `weightedExpenseRatio` | ratio | dollar-weighted ER across holdings |
| `feeDragAnnual` | annual | ER x invested |
| `matchCapture` | ratio | match captured / match available, plus `dollarsLeft` |
| `beneficiariesMissing` | list | account ids with no beneficiary |

## 6. Taxes (v1: federal brackets and FICA only)

Reads: `grossMonthly`, `pretaxContribMonthly`, `hsaPayrollMonthly`, `pretaxOtherMonthly`, `byType`, `takeHomeMonthly` (Income slot), `filingStatus` (Sun).
Publishes:

| key | units | meaning |
|---|---|---|
| `federalAnnual` | annual | estimated federal income tax |
| `ficaAnnual` | annual | SS + Medicare (both halves for 1099) |
| `effectiveRate` | ratio | federal / gross |
| `marginalRate` | ratio | bracket of the last dollar |
| `savedPer1000Pretax` | oneoff | marginal rate x 1,000 (plus FICA where it applies) |
| `impliedRate` | ratio | (gross - take-home - payroll deductions) / gross, from Income |
| `taxable` | annual, pretax | taxable income after pre-tax deductions and the standard deduction |
| `standardDeduction` | oneoff | the standard deduction used |
| `ficaParts` | parts | Social Security and Medicare split |
| `selfEmployment` | parts | self-employment tax and its deductible half |

## 7. Life Plan

Reads: `birthDate`, `baselineMonthly`.
Publishes:

| key | units | meaning |
|---|---|---|
| `goals` | list | `{ id, name, cents, targetDate, priority }` ordered by date |
| `events` | list | scenario blocks promoted into facts |
| `retirementMultipliers` | ratio | `{ gogo, slowgo, nogo }` applied by age band |
| `retirementAge` | int | target age if typed |
| `baristaIncomeMonthly` | monthly, aftertax | part-time income once the main job stops, if typed (Level 9, MR-040) |
| `dreamFiAge` | int | the age the household would love to be FI, if typed (Level 8 stand-in) |
| `dreamSpendingMonthly` | monthly, aftertax | spending in the life the household wants, if typed (Level 8 stand-in) |
| `gutSpendingMonthly` | monthly, aftertax | the household's gut guess of monthly spending, if typed (Level 8 stand-in) |

## The engine (reads every slot, writes none)

`engine/compute.js` runs Capture -> Enrich -> Analyze -> Recommend -> Publish
for each planet in order (Income, Spending, Debt, Investments, Safety Net,
Taxes, Life Plan), then the projection, the 74 metrics, the 39 lenses and the
leverage ranking. Level 9 adds three pure modules that read the result and
write nothing: `engine/fiLadder.js` (the rungs, from the slots and the
projection path), `engine/graph.js` (built from `data/graph.json`, the
contracts and the metric inputs) and `engine/sensitivity.js` (which copies the
record, nudges one value and runs `compute` again). Level 8 adds the same
kind of pure modules: `engine/col.js` (the cost-of-living tier from the city),
`engine/guesses.js` (guess rows, flagged `row.guess`, never counted toward
completeness or variance), `engine/anchors.js` (what they said and what they
would want, write-once, under `record.anchors`), `engine/variance.js`,
`engine/targets.js` and `engine/progress.js`. `compute` also returns
`colTier`, `household`, `guesses`, `completeness`, `sessionMode` and
`firstDraft`. It returns one frozen result object; views read from it and
never do math.
