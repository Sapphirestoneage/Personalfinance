# Wes Delgado (made up): a W-2 earner with a 401(k) match

As of 2026-10-22. Single, 38 (born 1988-02-20), Erie County NY. File: `w2-wes.json`.

## Inputs

| Item | Value | Notes |
| --- | --- | --- |
| Salary (W-2) | $3,200 every two weeks since 2020-05-01 | withheld $410 federal, $160 state a paycheck |
| 401(k) | $520 a month from the paycheck; employer match 50% of the first 6% | the match is text only in the app (`matchFormula`) |
| Roth IRA | $300 a month from take-home; basis $24,000 | |
| Brokerage | $150 a month from take-home | |
| Expenses | rent 1,650 (A), utilities 140 (A), internet 60 (A), renters insurance 15 (A), groceries 480 (F), eating out 220 (F, want), metro pass 127 (T), gym 45 (want), phone 65, streaming 30 (want), everything else 400 (want, rough) | |
| Accounts | checking 4,500; high-yield savings 15,000 at 4%; 401(k) 96,000; Roth IRA 31,000; brokerage 12,000 | |
| Card | Rewards Visa, balance 900 at 21.99%, limit 8,000, minimum 35, due the 25th, paid in full every month (pay setting: statement) | |
| Goal | FI number $1,100,000 (direct) | |

## October 2026 cash flow

- Pay dates in 2026: biweekly from 2020-05-01; 2,071 days to 2026-01-01 leaves 13 days into a 14-day cycle, so the first 2026 payday is January 2 and there are 26 in the year
- Gross a month = 3,200 x 26 / 12 = **$6,933.33**; withheld = (410 + 160) x 26 / 12 = **$1,235.00**
- FICA = 6,933.33 x 7.65% = **$530.40**; 401(k) from pay = $520
- Take-home = 6,933.33 - 1,235.00 - 530.40 - 520 = **$4,647.93**
- Employer match (not in the app): 50% x 6% x 83,200 / 12 = $208.00 a month
- Expenses = 1650 + 140 + 60 + 15 + 480 + 220 + 127 + 45 + 65 + 30 + 400 = **$3,232**
- FAT = 1650 + 140 + 60 + 15 + 480 + 220 + 127 = **$2,692**; FAT needs only = 2,472
- After-tax saving = 300 + 150 = $450
- Debt payments: the card is paid in full each month, so the $900 on it is last month's spending already counted in the expense lines above. First principles: **$0** of debt payment. The engine's pay-in-full setting makes the minimum the whole balance: $900.
- 2026 tax is a refund (below), so the set-aside is $0
- Surplus = 4,647.93 - 3,232 - 0 - 450 - 0 = **$965.93** (the engine, subtracting the 900 card balance as well: $65.93)
- Savings rate (gross) = (965.93 + 520 + 450) / 6,933.33 = **27.9%** (with the match counted on both sides: 30.0%); (net) = (965.93 + 450) / 4,647.93 = 30.5%

## 2026 tax

- Wages = 3,200 x 26 = $83,200; W-2 box 1 after the 401(k) = 83,200 - 520 x 12 = $76,960; withheld 410 x 26 = $10,660 federal, 160 x 26 = $4,160 state
- Taxable = 76,960 - 16,100 = $60,860
- Federal = 1,240 + (50,400 - 12,400) x 12% + (60,860 - 50,400) x 22% = 1,240 + 4,560 + 2,301.20 = **$8,101.20**
- NY taxable = 76,960 - 8,000 = $68,960; NY = 331.50 + 140.80 + 113.30 + (68,960 - 13,900) x 5.4% = 585.60 + 2,973.24 = **$3,558.84**
- Total owed = **$11,660.04**; withheld 14,820; **balance due -$3,159.96 (a refund)**
- Marginal 22% + 5.4% = 27.4%. (FICA: 83,200 x 7.65% = 6,364.80.)

## Balance sheet

- Cash = 19,500; invested = 96,000 + 31,000 + 12,000 = **$139,000**; assets = 158,500; debts = 900; net worth = **$157,600**
- Roth backstop (basis) = $24,000

## Emergency fund

- Age 38: Rule of 5 = **7.6 months**
- Monthly need, first principles = 3,232 (the card balance is not an extra cost); runway = 19,500 / 3,232 = **6.03 months**; target = ceil(7.6 x 3,232) = **$24,564**
- The engine adds the $900 card payment: need 4,132; runway 4.72; target 31,404

## FI

- FI number = **$1,100,000** (direct). Implied = 3,232 x 12 / 0.04 = $969,600 (goal above it: green)
- FI percent = 139,000 / 1,100,000 = **12.64%**
- Lean FI = 2,692 x 12 / 0.04 = **$807,600** (engine, needs only: 741,600)
- Coast FI = 1,100,000 / 1.05^27 = **$294,633.15**
- Years to FI, closed form: saving a year = (965.93 + 520 + 450) x 12 = $23,231; n = ln((1,100,000 x 0.05 + 23,231) / (139,000 x 0.05 + 23,231)) / ln(1.05) = ln(78,231 / 30,181) / 0.04879 = **19.5 years**. Counting the $3,160 yearly refund as saving (the engine does): 18.3 years. With the $2,496 a year match as well: about 17.5 years.

## Debt

- The card is cleared on its statement, so the first-principles payoff is **November 2026** with **no interest** (a balance paid by the due date is in the grace period).
- Utilization 900 / 8,000 = 11.25% (yellow: over 10%, under 30%).

## Differences from the engine

1. Surplus 65.93 vs 965.93, runway 4.72 vs 6.03, Rule of 5 target 31,404 vs 24,564: a card paid in full each month is counted as both this month's spending and a $900 debt payment.
2. The projection charges the statement-paid card a month of interest ($16.49) in November.
3. The payoff orders ignore the pay-in-full setting: they pay $35 plus the surplus and reach zero in August 2027, while the projection clears it in November 2026.
4. The employer match ($208 a month) has no numeric field; it is left out of saving, the savings rate and the years to FI.
5. Lean FI 741,600 vs 807,600 (definition).
