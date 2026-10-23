# Cat Morales (made up): head of household, a car loan that pays off in 2027

As of 2026-10-22. Head of household, 36 (born 1990-07-08), one child (Mia, 8),
Onondaga County NY, employer health plan. File: `carloan-cat.json`.

## Inputs

| Item | Value | Notes |
| --- | --- | --- |
| Salary (W-2) | $6,200 a month since 2021-09-01 | withheld 520 federal, 250 state |
| 401(k) | $400 a month from the paycheck | |
| 529 for Mia | $100 a month from take-home | education family: not "invested" for FI |
| Expenses | rent 1,750 (A), utilities 170 (A), groceries 650 (F), eating out 180 (F, want), gas 160 (T), car insurance 140 (T), after-school care 450, phone 70, kid activities 120 (want), streaming 30 (want), everything else 250 (want, rough) | |
| Accounts | checking 3,800; savings 11,000 at 0.5%; 401(k) 72,000; 529 9,000; 2022 RAV4 14,000 (house default: loses 15% a year) | |
| Debts | car loan 4,250 at 5.49%, $425 a month, due the 10th; Visa 650 at 21.49%, limit 7,000, minimum 25, due the 22nd | |
| Goal | FI at $45,000 a year of spending | |

## October 2026 cash flow

- Gross **$6,200**; withheld 770; FICA = 6,200 x 7.65% = **$474.30**; 401(k) 400; take-home = **$4,555.70**
- Expenses = 1750 + 170 + 650 + 180 + 160 + 140 + 450 + 70 + 120 + 30 + 250 = **$3,970**; FAT = 1750 + 170 + 650 + 180 + 160 + 140 = **$3,050**; FAT needs only 2,870
- Minimums = 425 + 25 = **$450**; after-tax saving 100; set-aside 0 (a refund)
- Surplus = 4,555.70 - 3,970 - 450 - 100 = **$35.70**
- Savings rate (gross) = (35.70 + 400 + 100) / 6,200 = **8.6%**; (net) = 135.70 / 4,555.70 = 3.0%

## 2026 tax

- Wages 74,400 - 4,800 (401(k)) = $69,600; withheld 6,240 federal, 3,000 state
- Head of household: standard deduction 24,150; taxable = $45,450
- Federal = 17,700 x 10% + (45,450 - 17,700) x 12% = 1,770 + 3,330 = **$5,100.00**
- NY (head of household): taxable = 69,600 - 11,200 = 58,400; NY = 12,800 x 3.9% + 4,850 x 4.4% + 3,250 x 5.15% + (58,400 - 20,900) x 5.4% = 499.20 + 213.40 + 167.38 + 2,025.00 = **$2,904.98**
- Owed = **$8,004.98**; withheld 9,240; **balance due -$1,235.02**
- The 2026 child tax credit ($2,200 for Mia) is not modeled; with it the refund is $3,435.02. Neither is the child and dependent care credit on the $5,400 of after-school care.

## Balance sheet, emergency fund

- Cash 14,800; invested (401(k) only) **$72,000**; assets 109,800; debts 4,900; net worth = **$104,900**
- Age 36: Rule of 5 = **7.2 months**; need = 3,970 + 450 = 4,420; runway = 14,800 / 4,420 = **3.35 months**; target = ceil(7.2 x 4,420) = **$31,824**

## FI

- FI number = 45,000 / 0.04 = **$1,125,000**; implied = 3,970 x 12 / 0.04 = $1,191,000; goal / implied = 94.5%: yellow (under 100%, over 80%)
- FI percent = 72,000 / 1,125,000 = **6.4%**
- Lean FI = 3,050 x 12 / 0.04 = **$915,000** (engine, needs only: 861,000)
- Coast FI = 1,125,000 / 1.05^29 = **$273,314.61**
- Years to FI: at today's saving ((35.70 + 500) x 12 = 6,428 a year) the closed form gives 37.6 years. Once the car loan is gone (September 2027) saving rises by 425 a month, and the yearly refund adds 1,235: about (460.70 + 500) x 12 + 1,235 = 12,763 a year, closed form **29.5 years**. The engine's projection, which sees the loan end, says 29.3.

## Debt payoff, minimums only

- Car loan 4,250 at 5.49%, $425 a month: November interest 19.44; closed form n = -ln(1 - 0.004575 x 4,250 / 425) / ln(1.004575) = 10.3, so 11 payments, the last (partial) in **September 2027**; interest about $110.42. From October 2027 the minimums are $25.
- Visa 650 at 21.49%, $25 a month: 36 payments, **October 2029**, interest about $232.65. (The app's payoff orders, rolling the freed 425 into it, clear it in October 2027.)

## Differences from the engine

1. The child tax credit (and the dependent care credit) are not modeled: refund 1,235.02 instead of 3,435.02.
2. Lean FI 861,000 vs 915,000 (definition).
