# June Okafor (made up): between jobs on unemployment, nothing withheld

As of 2026-10-22. Single, 35 (born 1991-06-15), Monroe County NY, not NYC.
Marketplace bronze plan since September. File: `jobless-june.json`.

## Inputs

| Item | Value | Notes |
| --- | --- | --- |
| Old salary (W-2) | $5,500 a month, 2024-01-01 to 2026-08-31 | withheld $380 federal, $200 state a month |
| NY unemployment | $504 a week, 2026-09-07 to 2027-03-07 | no withholding (federal 0, state 0, both known) |
| Likely new job | $5,800 a month from 2027-02-01, 50% likely | maybe money; withholding $650 / $270 (rough) |
| Expenses | rent 1,400 (A, need), utilities 120 (A, need), groceries 450 (F, need), eating out 100 (F, want), car insurance 110 (T, need), gas 90 (T, need), phone 55 (need), marketplace plan 310 (need, from 2026-09-01), streaming 25 (want), everything else 250 (want, rough) | A/F/T = accommodation, food, transportation |
| Accounts | checking 2,200; high-yield savings 6,800 at 3.8%; old 401(k) 38,000 (no contribution); 2018 Civic 9,000 losing 15% a year | |
| Debts | Visa 2,400 at 23.99%, limit 6,000, minimum $75, due the 18th | |
| Goal | FI at $36,000 a year of spending | |
| Assumptions | real return 5%, withdrawal rate 4%, coast age 65, life expectancy 90 | |
| 2026 tax year | estimated payments 0, set aside 0 (known) | |

## October 2026 cash flow

- Gross = unemployment only (the salary ended in August): 504 x 52 / 12 = **$2,184.00**
- Withheld = 0; FICA = 0 (unemployment is not wages); paycheck contributions = 0
- Take-home = **$2,184.00**
- Expenses = 1400 + 120 + 450 + 100 + 110 + 90 + 55 + 310 + 25 + 250 = **$2,910**
- FAT = 1400 + 120 + 450 + 100 + 110 + 90 = **$2,270**; FAT needs only (engine's lean) = 2,270 - 100 = $2,170
- Minimum payments = **$75** (Visa)
- 2026 balance due (below) = $1,729.83, nothing set aside yet, 7 months to April 2027: set-aside = 1729.83 / 7 = **$247.12**
- Surplus = 2184 - 2910 - 75 - 0 - 247.12 = **-$1,048.12** (before the set-aside: -$801.00)
- Savings rate (gross) = -1048.12 / 2184 = **-48.0%**; (net) the same, take-home equals gross

## 2026 tax

- Wages: 5,500 x 8 months (January to August) = $44,000; withheld 380 x 8 = $3,040 federal, 200 x 8 = $1,600 state
- Unemployment paid in 2026: weekly from 2026-09-07; pay dates Sep 7, 14, 21, 28; Oct 5, 12, 19, 26; Nov 2, 9, 16, 23, 30; Dec 7, 14, 21, 28 = 17 x 504 = $8,568
- Gross income = 44,000 + 8,568 = $52,568 = AGI (no adjustments)
- Taxable = 52,568 - 16,100 = $36,468
- Federal = 12,400 x 10% + (36,468 - 12,400) x 12% = 1,240 + 2,888.16 = **$4,128.16**
- NY taxable = 52,568 - 8,000 = $44,568; NY = 8,500 x 3.9% + 3,200 x 4.4% + 2,200 x 5.15% + (44,568 - 13,900) x 5.4% = 331.50 + 140.80 + 113.30 + 1,656.07 = **$2,241.67**
- Total owed = 4,128.16 + 2,241.67 = **$6,369.83**; withheld 4,640; **balance due $1,729.83**
- Marginal: 12% federal + 5.4% NY = 17.4%. Next estimated payment date: 2027-01-15.
- (FICA on the wages, already withheld by the employer: 44,000 x 7.65% = 3,366.)

## Balance sheet

- Cash = 2,200 + 6,800 = **$9,000**; invested = **$38,000**; assets = 9,000 + 38,000 + 9,000 = $56,000; debts = $2,400
- Net worth = **$53,600**

## Emergency fund

- Age 35, Rule of 5 target = 35 / 5 = **7 months**
- Monthly need = expenses + minimums = 2,910 + 75 = $2,985; runway = 9,000 / 2,985 = **3.02 months** (cash / expenses alone: 3.09)
- FAT only: (2,270 + 75) = 2,345; 9,000 / 2,345 = 3.84 months
- Target in dollars = ceil(7 x 2,985) = **$20,895**; gap = 20,895 - 9,000 = $11,895

## FI

- FI number = 36,000 / 0.04 = **$900,000** (goal spending). Implied by today's spending: 2,910 x 12 / 0.04 = $873,000 (the goal is above it: green)
- FI percent = 38,000 / 900,000 = **4.22%**
- Lean FI (FAT x 12 / 4%) = 2,270 x 12 / 0.04 = **$681,000**. Engine definition (FAT needs only): 2,170 x 12 / 0.04 = $651,000
- Coast FI = 900,000 / 1.05^(65 - 35) = 900,000 / 4.32194 = **$208,239.70**
- Years to FI: saving is negative (-1,048 a month), so at this rate: **never**. (The projection should agree: her cash runs out in 2028 and the new job, at 50%, does not cover costs.)

## Debt payoff

- Visa 2,400 at 23.99%, $75 a month from November 2026: interest 2,400 x 0.2399 / 12 = 47.98 the first month; closed form n = -ln(1 - 0.019992 x 2400 / 75) / ln(1.019992) = 51.6, so 52 payments, the last in **February 2031**; total interest about **$1,468.35** (month-by-month loop).

## Flags expected

- Income cliff (red, first): certain income is $0 from 2027-03-08 (the day after unemployment ends); costs then = 2,910 + 75 + 247.12 = $3,232.12 a month; likely income 50% x 5,800 = $2,900.
- Unemployment has no federal tax withheld (yellow: a balance due, every input known).
- Visa at 40% of its limit (red); personal cards 40% (red). Runway 3.0 months (yellow: under the 7-month target). 2026 tax yellow.

## Differences from the engine (see the test)

1. Lean FI: $651,000 (needs only) vs $681,000 (every FAT expense). Definition.
2. Years to FI: the engine says 52.3 years. Its projection keeps growing the 401(k) at 5% while cash goes to -$266,000, and counts FI reached in 2079. Saving is negative; the honest answer is never (or: not until the new job is confirmed).
