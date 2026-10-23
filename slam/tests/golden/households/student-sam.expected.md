# Sam Lindqvist (made up): a student with federal loans in deferment

As of 2026-10-22. Single, 24 (born 2002-09-30), Tompkins County NY, student,
on a parent's health plan. File: `student-sam.json`.

## Inputs

| Item | Value | Notes |
| --- | --- | --- |
| Campus library job (W-2) | $900 a month since 2025-09-01 | withheld 40 federal, 20 state |
| Summer internship (W-2) | $9,000 in total, 2026-06-01 to 2026-08-15 | withheld 700 federal, 300 state in total |
| Help from parents | $500 a month | a gift, not income; entered as "other" because there is no gift type |
| Expenses | rent 2,400 shared by 3 (his 800, A), utilities 180 shared by 3 (60, A), groceries 320 (F), eating out 150 (F, want), bus pass 45 (T), phone 40 covered by Parents ($0), textbooks and supplies 60, everything else 150 (want, rough) | |
| Accounts | checking 1,100; savings 2,500; Roth IRA 1,800 (basis 1,800; 50 a month) | |
| Debts | federal direct loans 27,000 at 6.53%, in deferment, $0 payment, plan "paused"; student Visa 400 at 24.49%, limit 1,000, no minimum entered | |

## October 2026 cash flow

- Gross = 900 + 500 = **$1,400** (the internship ended in August)
- Withheld 60; FICA on the wages = 900 x 7.65% = 68.85; take-home = **$1,271.15**
- Expenses = 800 + 60 + 320 + 150 + 45 + 0 + 60 + 150 = **$1,585**; FAT = 800 + 60 + 320 + 150 + 45 = **$1,375**; FAT needs only 1,225
- Minimums: loan 0 (deferred) + Visa house default max(40, 4 + 8.16) = 40 = **$40**
- After-tax saving 50
- 2026 tax is a refund, so the set-aside is **$0**
- Surplus = 1,271.15 - 1,585 - 40 - 50 - 0 = **-$403.85**

## 2026 tax (first principles)

- Wages = 900 x 12 + 9,000 = $19,800; withheld 480 + 700 = 1,180 federal, 240 + 300 = 540 state
- The parents' help is a gift: no income tax on it (and under the $19,000 gift exclusion for them)
- Taxable = 19,800 - 16,100 = $3,700; federal = **$370.00**
- NY taxable = 11,800; NY = 8,500 x 3.9% + 3,200 x 4.4% + 100 x 5.15% = 331.50 + 140.80 + 5.15 = **$477.45**
- Owed = **$847.45**; withheld 1,720; **balance due -$872.55 (a refund)**
- If the parents' help were taxed as other income (the engine): taxable 9,700, federal 970, NY 796.20, owed 1,766.20, balance due 46.20, set-aside 6.60, surplus -410.45.
- Not modeled and not counted here: whether his parents claim him as a dependent (it would lower his standard deduction to earned income plus 450), and the American Opportunity credit.

## Balance sheet, emergency fund

- Cash 3,600; invested 1,800; debts 27,400; net worth = **-$22,000**; Roth basis 1,800
- Age 24: Rule of 5 = **4.8 months**; need = 1,585 + 40 = 1,625; runway = 3,600 / 1,625 = **2.22 months**; target = ceil(4.8 x 1,625) = **$7,800**

## FI

- FI number from spending = 1,585 x 12 / 0.04 = **$475,500**; FI percent = 1,800 / 475,500 = 0.38%
- Lean FI = 1,375 x 12 / 0.04 = **$412,500** (engine, needs only: 367,500)
- Coast FI = 475,500 / 1.05^41 = **$64,326.40**
- Years to FI: never at this rate (saving negative)

## Debt

- Federal loans: no payment while deferred; interest accrues at 27,000 x 6.53% = $1,763.10 a year (unsubsidized). Payments would start after graduation, on a plan not yet chosen. A 10-year standard payment on the balance then would be about $305 a month. The app has no "payments start on" date.
- Visa at the house default minimum: 12 payments, paid **October 2027**, interest about $52.

## Differences from the engine

1. Help from parents is taxed as ordinary income: balance due 46.20 instead of a refund of 872.55, a 6.60 set-aside, surplus -410.45 instead of -403.85. There is no gift or family-support income type.
2. The payoff orders report the deferred loan as "never pays off" with **$525,784.67 of interest**: 600 months of compounding at $0 a month. A loan with no payment set should say so, not show half a million dollars of interest.
3. Lean FI 367,500 vs 412,500 (definition).
