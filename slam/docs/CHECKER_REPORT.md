# Checker report (2026-10-23)

An independent check of the SLAM Phase 1 engines (branch
`claude/slam-phase-1-foundation`, head `e6b85337`) by a session that changed no
engine or UI code. Everything it added is under `slam/tests/golden/`,
`slam/tests/personas/` and `slam/docs/`. All households and personas are
fictional; no real-data file was created or read. The work is on the branch
`claude/slam-checker-zdig1g` (the session's assigned name for
`claude/slam-checker`); nothing was merged into main and the other two branches
were not touched.

Every number below was worked out by hand from first principles before the
engines ran (`tests/golden/CONVENTIONS.md` says how), then compared. Every
mismatch is a test marked as a known failure (`todo`), so the suite runs it and
stays green: `node --test` in `slam` reports 548 tests, 511 pass, 0 fail, 35
todo.

## 1. What was built

**Seven golden households** (`tests/golden/households/`, each with a
`<id>.expected.md` showing the math and a `<id>.golden.test.js`):

| Household | Who | Covers |
| --- | --- | --- |
| jobless-june | 35, between jobs | NY unemployment with nothing withheld, an ended W-2, a 50% likely new job |
| w2-wes | 38, W-2 | pay every two weeks, a 401(k) with a match, a card paid in full |
| freelance-fay | 40, 1099 | business expenses, quarterly estimates already paid, a solo 401(k) |
| card-carlos | 23 | two cards near their limits, a payday loan, buy now pay later, money owed to family, negative net worth |
| student-sam | 24, student | federal loans in deferment, part-time and summer W-2, help from parents, shared rent |
| carloan-cat | 36, head of household | a car loan whose last payment lands in September 2027, a 529 |
| near-fi-nina | 47 and 45, married | 1.5 million invested against a 1.6 million goal, a small mortgage, gains and dividends |

**Twenty-one personas** (`tests/personas/<id>.md`: who they are, every number
they would enter, what they would want the app to tell them;
`<id>-walkthrough.md`: what happened when they were entered). Eighteen new
household files; three reuse Carlos (persona 6), the demo household Casey
(persona 15) and Wes (persona 17). Three of the most unusual were worked by
hand as well: the sugar baby (1), the polyamorous household (7) and the widow
(11), each with an `expected.md` and a golden test.

**How the personas were entered.** Each household was loaded into the real
Ledger and Dashboard pages in headless Chromium (Playwright, 375 pixels wide)
as "edits saved in this browser", the way the pages read a household, and
what the pages showed was recorded (`tests/personas/walk-ui.mjs`,
`tests/personas/UI-NOTES.md`). The Ledger's own add forms, editors and pick
list were opened to read what each field offers. The typing of each value
was simulated by the file; the walkthroughs say what the Ledger could not
have entered at all (dates, a second person, a gift, a draw from savings).

**Constants audit**: `docs/CONSTANTS_AUDIT.md`.

## 2. Every mismatch (households and personas)

Dollar figures are for October 2026 or tax year 2026. "Engine" is what the
code returns on the household's own assumptions; the Dashboard shows the
"Likely" set by default, which moves the FI figures further.

| # | Household or persona | Number | Expected (by hand) | Engine | Best guess at the cause |
| --- | --- | --- | --- | --- | --- |
| 1 | Fay, Raymond, Devin, Jordan, the Adlers, the Weinbergs, Ruth, Maya, Victor (9 of 28) | The Dashboard | loads | **crashes**: "Cannot read properties of undefined (reading 'split')" | `flags.js` names the first rough or missing tax input (`tax.balanceDue.rough[0]` or `.missing[0]`) when the balance due is rough or missing; a NYC resident, a non-NY state, Social Security income or a missing 2026 tax-year record makes it rough or missing with no such input, and `labelFor(spine, undefined)` throws. Fires whenever every tax input is "known". |
| 2 | June | Years to FI | never (saving is negative) | 52.3 years | The projection grows invested money at 5% while cash runs to -266,000 and counts FI reached in 2079. A cash shortfall should stop the FI clock, or the shortfall should come out of investments. |
| 3 | Wes, the couple, Tess and Omar, the Adlers, Ruth, Raymond, Victor, Kai (8) | Surplus with a card paid in full | Wes 965.93 | 65.93 | The "full statement balance" pay setting makes the whole balance a minimum payment, on top of the spending already on the card (S-189). The same error hits runway (Wes 6.03 months by hand, 4.72), the Rule of 5 target (24,564 vs 31,404), the savings rate (27.9% vs 14.9%) and the money flow. For Victor it turns a 20,000-a-month saver into -21,101. |
| 4 | Wes | Interest on a statement-paid card | 0 | 16.49 in November | `debtSchedule` accrues a month of interest before the balance is paid; a balance paid by the due date is in the grace period. |
| 5 | Wes, Raymond, Victor | Payoff date of a statement-paid card | the next month | Wes August 2027; Raymond March 2032; Victor **never, 2,156,984,649.73 of interest** | `payoffPlan` ignores the pay setting and uses the typed minimum; for Victor the 300 minimum is below the month's interest, so the balance compounds for 600 months. Two bugs: the policy, and no guard for a minimum under the interest. |
| 6 | Sam | Interest on a loan with a 0 payment | not reported (deferred) | 525,784.67, "never pays off" | Same 600-month compounding with nothing paid. A loan with no payment set should say so. |
| 7 | Wes, Maya, Kai | Employer match | counted as saving (Wes 208 a month) | 0 | `matchFormula` is text; no number reaches cash flow, the savings rate or the projection. |
| 8 | Fay, Tess and Omar | Take-home of a 1099 earner | gross less business expenses (Fay 6,600) | gross (7,500) | `businessExpenses` is read only by the tax engine, never by cash flow. |
| 9 | Fay | Solo 401(k) contribution | saving of 1,000 a month | 0 | `employerRetirement` contributions are skipped unless a W-2 stream is active (`w2Active`); a self-employed plan never has one. |
| 10 | Fay, Tess and Omar | AGI, balance due | Fay 56,564.70 / 6,855.85; the couple 101,588.02 / 4,661.08 | 73,604.70 / 10,531.28; 112,148.02 / 6,498.52 | The solo 401(k) and SEP IRA deferrals and the self-employed health insurance deduction are not modeled. The set-aside and surplus follow (Fay set-aside 1,290.18 vs 765.12, surplus 1,502.82 vs 127.88; the couple's surplus -176.27 vs 686.21). |
| 11 | Sam, the Weinbergs, Mila | Help from parents, benefits, an allowance | not income (Sam: a 872.55 refund) | taxed as "other income" (Sam: 46.20 due, a 6.60 set-aside) | There is no gift, family support, benefits or child-support kind; "other" is ordinary income. For Mila the engine's 5,601.40 matches neither the gift reading (a 140.60 refund) nor the compensation reading (9,858.49, with self-employment tax the "other" kind never carries). |
| 12 | Cat (and Marcus, the Adlers, the Weinbergs) | Balance due with children | Cat: a 3,435.02 refund | 1,235.02 | No credits: child tax credit (2,200 a child), dependent care, earned income credit. For the Weinbergs the credits are the biggest number in their year. |
| 13 | Ruth | 2026 tax | refund 2,706.10 | refund 3,582.10 | Social Security benefits are left out of the tax entirely ("not modeled"; 85% of hers is taxable), and NY's 20,000 pension exclusion is not applied. |
| 14 | Ruth, Theo (and Sofia's framing) | FI number | net of guaranteed or kept income (Ruth: past FI; Theo: about 607,000, which he has) | covers all spending (Ruth 1,200,000, 56.5%; Theo 962,500 to 1,100,000, 63 to 72%) | `fi.js` has no term for pension, Social Security or part-time income that continues. |
| 15 | Theo | Surplus, cash | a planned 1,750 draw from the brokerage | surplus -1,838, "Cash runs out December 2028" with 690,000 untouched | No withdrawal kind and no decumulation in the projection: cash goes negative while investments compound. |
| 16 | Raymond, Victor | Monthly FICA | Raymond 1,540.50 | 2,315.50 | `cashflow.js` caps Social Security tax at `SS_WAGE / 12` per stream per month; two W-2 streams (salary and RSUs) each get a cap, and nothing is yearly. The yearly tax engine gets it right. |
| 17 | The Adlers, the Weinbergs | Any tax number | federal at least | "not enough to figure yet" | For a state other than NY `computeTax` returns `total: null`, so the balance due, the flag and the set-aside all vanish with the state part. |
| 18 | Marcus | FI number implied by spending | without the alimony that ends in 2029 | includes it; the FI gap flag goes red | The implied number uses this month's spending with no regard for end dates. |
| 19 | Ana | FI gap flag | none (a Lean goal is below spending on purpose) | red, "the goal is 79% of what spending implies" | The flag assumes every goal must cover all of today's spending. |
| 20 | All 10 hand-checked | Lean FI | every food, housing and transportation cost x 12 / rate (June 681,000) | FAT tagged as needs only (651,000) | S-173 leaves out FAT wants. The owner's definition for this check (and the root app's `fire_variants.json`) counts them all. A definition question, listed first in section 6. |
| 21 | Jordan, the couple, Theo, Kai | Runway | without money set aside for a purpose | includes sinking funds and the down-payment fund as emergency cash | A cash account's `role` is stored and only used to pick a link target. |

Not mismatches, but worth knowing: the payoff orders roll freed minimums and
the whole surplus into the next debt while the projection pays minimums only,
so the same loan shows two payoff dates on the Dashboard with nothing to say
which question each answers; the Dashboard opens on the Likely set (6%), not
the household's own assumptions, so first-load FI figures differ from the
file's; the "Everything else" rough field produces two stage 2 flags for every
household; with no cards, personal utilization reads "missing" rather than
"none".

What matched everywhere it was checked: monthly amounts for every cadence,
pay-date counting for weekly and biweekly streams, withholding, FICA at or
under the wage base, shared bills (even and percent shares), covered bills,
expense and FAT totals, minimum payments (typed and the house default), the
set-aside arithmetic once the balance due is given, the balance sheet, the
Rule of 5 in months and dollars, runway on the app's definition, FI number,
FI percent, coast FI, the federal brackets for single, joint and head of
household, the NY brackets as entered, gains stacked on ordinary income,
self-employment tax, the debt schedule's payoff months (every loan and card in
every household), promo deadlines and the avalanche order.

## 3. Constants audit summary

`docs/CONSTANTS_AUDIT.md` lists all 132 rules in `data/rules-2026.json`, the
other data files, and the numbers written into `src/calc`. The web was not
reachable from the checking environment (DNS failed for irs.gov, ssa.gov and
tax.ny.gov), so every match is against the checker's own knowledge of the 2026
figures and the whole table is flagged unverified by fetch; the links are the
pages to open.

- 101 rules match the 2026 figures as the checker knows them; 1 probably
  differs (the head of household 24% bracket top: 201,750 in the file,
  201,775 expected, about 2 dollars of tax); 4 New York bracket rules cannot
  be verified until the 2026 forms are published; 21 are house assumptions;
  5 are app settings.
- Nothing in `engine/` inlines a tax number. `data/tax-constants.json` (the
  Budget's copy of the federal table) duplicates the registry with the same
  values today and nothing checks they stay equal; `src/calc/tax.js` caps
  self-employment tax differently from `engine/tax.js`.
- Across the repository the same assumption is defined twice with different
  values three times: the 415(c) limit (SLAM 72,000, root `irs_limits_2026.json`
  70,000), the default card minimum (1% plus interest with a 40 floor vs 2%
  with a 25 floor), the likely real return (6% vs 5%); and Lean FI is defined
  two ways (needs only vs every FAT line).

## 4. Persona scorecard

"As shipped" is what the pages do today. "Crash fixed" is the rating if the
Dashboard loaded for everyone (finding 1), with nothing else changed.

| # | Persona | As shipped | Crash fixed | The one thing that decides it |
| --- | --- | --- | --- | --- |
| 1 | Sugar baby | doesn't work | doesn't work | the allowance is taxed as neither a gift nor compensation; nothing varies, nothing is in kind |
| 2 | Sugar daddy | doesn't work | works with workarounds | crash; FICA per stream; the Amex paid in full; no gift tax, NIIT or city tax |
| 3 | Splenda daddy | doesn't work | works well | crash only; the numbers are right and stark |
| 4 | Trans person | doesn't work | works with workarounds | crash; dates only in the file; no medical total; the surgery fund counts as runway |
| 5 | Lesbian couple | works with workarounds | same | a second person only in the file; the IVF fund counts as runway; the Visa double count |
| 6 | Single, early 20s, negative net worth | works well | same | this is the household the app was built for |
| 7 | Polyamorous household | works with workarounds | same | two-thirds shares work as percents; a third adult has no place; Omar's deductions and expenses |
| 8 | Modern Orthodox family | doesn't work | works with workarounds | crash; New Jersey gets no tax number; four children change nothing; tuition and maaser are "everything else" |
| 9 | Yeshivish family | doesn't work | doesn't work | a gift, benefits and a stipend taxed; six children and the credits invisible; no state tax |
| 10 | Divorced | works with workarounds | same | child support taxed; no credits; the FI flag counts alimony that ends |
| 11 | Widow | doesn't work | doesn't work | Social Security untaxed and ignored by the FI number; no filing-status change, RMDs or Medicare |
| 12 | Partially employed | works with workarounds | same | dated and seasonal streams only in the file; no hours times a rate; the 24-month projection is not on any page |
| 13 | Lean FI | works with workarounds | same | her goal is flagged red; the app's Lean number is a different definition |
| 14 | Barista FI | doesn't work | doesn't work | no draw, no decumulation: "cash runs out" with 690,000 invested |
| 15 | Side hustler | works well | same | the demo; only the quarterly amount is missing |
| 16 | Slow FI | doesn't work | works with workarounds | crash; the FI date she typed is ignored; a sabbatical is two streams in the file |
| 17 | Regular FI | works with workarounds | same | the card paid in full and the match |
| 18 | Chubby FI | works with workarounds | same | accumulation is right; health insurance before 65, NIIT and drawdown are out of scope |
| 19 | Fat FI | doesn't work | works with workarounds | crash; the Amex "never pays off" with two billion of interest; FICA per stream; no NIIT or city tax |
| 20 | Coast FI | works well | same | the coast number is right; "reached" is left for her to notice |
| 21 | SPARKS | works with workarounds | same | no way to compare the three moves; the Visa double count; a blank FI number is handled well |

Totals as shipped: 3 work well, 9 work with workarounds, 9 do not work. With
the crash fixed: 4, 13, 4.

## 5. Missing fields and categories, by how many personas needed them

| Needed by | What is missing | Personas (and golden households) |
| --- | --- | --- |
| 9 | A goal's monthly amount, date and progress (every goal but FI is stored and unused) | 1, 3, 4, 5, 7, 8, 9, 12, 21 |
| 9 | Dates in the Ledger: a stream or expense that starts, ends or happens once (the engines handle them; the page cannot set them) | 2, 4, 5, 10, 11, 12, 16, 18, 19 |
| 8 | New York City income tax | 1, 2, 3, 4, 7, 16, 19, 21 |
| 8 | A card paid in full as a payment method, not a debt | 2, 5, 7, 8, 11, 17, 19, 21 |
| 6 | A second (or third) adult in the Ledger: add a person, give them income and accounts, use their age | 5, 7, 8, 9, 11, 18 |
| 5 | A giving category (maaser, charity, gifts) and tuition or education as a category | 2, 8, 9, 13, 19 |
| 5 | Income that is not earned and not taxable: gifts and family support, child support, benefits (SNAP, WIC), a stipend of uncertain status | 1, 9, 10 (and Sam) |
| 5 | The marketplace subsidy and benefit cliffs against a changing income | 1, 9, 12, 13, 18 |
| 4 | A withdrawal, a draw, or any decumulation (and the taxes on it) | 11, 14, 18, 19 |
| 4 | A scenario to compare (a cap, an offer, a move, a worst case) beyond the three assumption sets | 3, 12, 20, 21 |
| 4 | Tax credits for children: child tax credit, dependent care, earned income credit | 8, 9, 10 (and Cat) |
| 4 | Children as dependents that affect anything | 8, 9, 10, 18 |
| 3 | A medical category and total (FSA or HSA sizing; the 7.5% of AGI floor) | 4, 5, 10 |
| 3 | The employer match as a number | 16, 17, 21 |
| 3 | A state other than New York (even federal-only), and a state change | 8, 9, 21 |
| 3 | The net investment income tax | 2, 18, 19 |
| 3 | Self-employed deductions: SEP or solo 401(k) deferrals, health insurance; business expenses in cash flow | 7 (and Fay, Carlos) |
| 2 | Social Security: taxation of benefits, the survivor-to-own switch | 11 (and Theo later) |
| 2 | FI by a date or an age; coast age per goal | 16, 20 |
| 2 | An FI number net of income that continues (pension, Social Security, a job kept on purpose) | 11, 14 |
| 2 | Equity compensation (RSUs, a bonus) as what they are | 2, 19 |
| 2 | Income that varies month to month, or pauses | 1, 12 (and 4, 16) |
| 2 | In-kind support and gift-tax reporting | 1, 2 |
| 1 | A sharing formula (by income, by two of three adults) | 7 |
| 1 | Hours times a rate | 12 |
| 1 | A payday loan as a fee due in full on a date | 6 |
| 1 | A filing status that changes with a date (joint this year, single next) | 11 |
| 1 | A kollel or stipend "situation" | 9 |

## 6. Assumptions baked in, by how many personas they hurt

1. **The portfolio must cover all of today's spending** (11, 13, 14, 20, and every Lean FI reading): pension, Social Security and income kept on purpose are ignored; a Lean goal is flagged red; Lean FI drops FAT wants.
2. **A card balance is debt, even one paid in full every month** (2, 5, 7, 8, 11, 17, 19, 21): the surplus, savings rate, runway, target, interest and payoff date are all wrong by the balance.
3. **A household is one adult (or two who file together), in New York, with one age** (5, 7, 8, 9, 11, 18, 21): no third adult, no second person in the Ledger, no other state, no children that matter.
4. **Everyone is accumulating; the plan ends at FI** (11, 14, 18, 19): no draw, no required distributions, no Medicare, no survivor rules, no conversions.
5. **Money in is earned and taxable** (1, 9, 10, Sam): gifts, benefits, support and stipends are taxed as ordinary income.
6. **This month is every month** (1, 2, 12, 16, Jordan): nothing varies, pauses or is seasonal on the page; the 24-month projection the engine computes is on no screen.
7. **Spending beyond food, housing and transportation is a want** (8, 9, 13, 16): tuition, maaser, therapy and travel are "everything else"; the "need" tag is the only lever and it also drives Lean FI.
8. **Children do not change the tax** (8, 9, 10, Cat).
9. **Tax is federal plus New York State** (8, 9 get nothing; 8 NYC residents get an understated number; 3 get no NIIT).
10. **A debt with a minimum below its interest, or no payment at all, is simply run for 50 years** (Sam, Victor).
11. **Frugality is the goal and the surplus is the score** (16, 21): no spending on purpose, no scenario comparison, no "what does this move do".
12. **Income is under the Social Security wage base and in one stream** (2, 19).

## 7. Questions for Eli

1. **Lean FI.** Your brief for this check says food, accommodation and transportation costs; the engine (S-173) leaves out FAT expenses tagged as wants; the root app's `fire_variants.json` counts every FAT line. Which definition is the app's? Every household differs by this.
2. **Emergency fund months.** The app divides cash by expenses plus minimum payments (S-150, your open question 9). The hand math shows both; which should the tile say?
3. **A card paid in full.** Should its balance ever appear in the surplus, runway or payoff orders? If yes, the expenses charged to it should not also count that month.
4. **"Other income."** Should it be taxed at all? What kinds should exist: gift or family support, child support, benefits, stipend, allowance (with a "this may be self-employment" switch), equity compensation, a draw from savings?
5. **Head of household 24% bracket top.** The file has 201,750; I expect 201,775 (as single, like 2024 and 2025). Please check Rev. Proc. 2025-32 Table 4.
6. **New York 2026 rates.** Entered from memory of the FY2026 budget (3.9, 4.4, 5.15, 5.4, 5.9); I recall the same, and that 2027 cuts another 0.1 point. Still unverified.
7. **The Dashboard's default assumption set.** It opens on Likely (6%) rather than the household's own numbers. Intended? Every first-load FI figure differs from the file's.
8. **Branch name.** The session's assigned branch is `claude/slam-checker-zdig1g`; your message said `claude/slam-checker`. I used the assigned one (the other does not exist on origin). Rename or leave?
9. **Git history.** None was rewritten. The checker branch as created by the session pointed at `main`; I moved it to the foundation head before the first commit (one force push of a branch that held only main's history). Nothing else was force-pushed.
10. **Should the persona households ship?** Eighteen fictional files under `tests/personas/households/` could become demo choices or stay as tests.
11. **The Playwright walker** (`tests/personas/walk-ui.mjs`) is not part of `node --test`; keep it next to `tools/screens-check.mjs`, or move it?
12. **Non-NY states.** Should the tax tile show federal only with a note, rather than nothing?

## 8. The ten fixes I would do first, in order

1. **Stop the Dashboard crash** (`flags.js`: guard `rough[0]` and `missing[0]`; a "not modeled" note should not make a balance due rough with no path). Nine of 28 households cannot see the Dashboard today. One-line fix, biggest effect.
2. **A card paid in full is not a debt payment** (`debt.js` `minimumPayment` with the statement policy, `debtSchedule`, `payoffPlan`): count its charges as the expenses they are, no interest in the grace period, payoff next month. Eight personas.
3. **Show federal tax for any state** and treat NYC and non-NY state as notes with a rough number, not as "missing" (`tax.js` `computeTax` total when state is not NY). Three households get no tax number; eight get an understated one.
4. **Income kinds that are not taxed** (gift or support, child support, benefits) and an allowance kind with a self-employment switch; stop taxing "other" by default. Four households.
5. **Dates in the Ledger**: a start date, an end date and a "when" for once, as rows on income and expense items (the engines already use them). Nine personas.
6. **Self-employment in cash flow and tax**: take business expenses out of the month's money; count solo 401(k) and SEP contributions as saving without a W-2 and deduct them; deduct self-employed health insurance. Fay, Carlos, Tess and Omar.
7. **The FI number nets out income that continues** (pension, Social Security, a part-time job kept on purpose) and a Lean goal is not a red flag; settle the Lean FI definition (question 1).
8. **The projection and payoff plans stop lying at the edges**: a cash shortfall pauses the FI clock or is funded by selling investments; a payment below the interest, or a 0 payment, ends the plan with words instead of 600 months of compounding; years to FI with negative saving says why.
9. **FICA's wage base once a year across streams** in `cashflow.js`, as `tax.js` already does.
10. **The child tax credit** (and the dependent care credit) in `computeTax`, and dependents as something the people list means; then the net investment income tax.

After those: goals with a monthly amount and a date on the Dashboard; a
second person in the Ledger; the employer match as a number; a withdrawal
kind and a first pass at decumulation; a giving and a tuition category; the
24-month projection on a page; the Likely default; the "Everything else"
flags.

## Appendix: evidence

- `docs/checker/dashboard-crash-nyc-resident.jpg`: the Dashboard for persona 2 (Raymond, Manhattan).
- `docs/checker/dashboard-barista-fi.jpg`: the Dashboard for persona 14 (Theo): surplus -1,838, savings rate -111%, 745,000 of net worth.
- `docs/checker/dashboard-lean-fi.jpg`: the Dashboard for persona 13 (Ana): 96% of her goal and a red flag for having it.
- Tests: `tests/golden/*.golden.test.js`, `tests/personas/*.golden.test.js`; run `node --test` from `slam`.
