# Nina and Lev Petrov (made up): close to FI, married filing jointly

As of 2026-10-22. Married filing jointly; Nina 47 (born 1979-01-25), Lev 45
(born 1981-05-02); Westchester County NY. File: `near-fi-nina.json`.

## Inputs

| Item | Value | Notes |
| --- | --- | --- |
| Nina, salary (W-2) | $9,000 a month | withheld 900 federal, 420 state |
| Lev, salary (W-2) | $4,500 a month | withheld 350 federal, 180 state |
| 401(k) (Nina) | 1,500 a month from pay; 403(b) (Lev) 800 a month from pay | |
| Joint brokerage | 2,000 a month from take-home; cost basis 250,000 | |
| Expenses | property tax 650 (A), home insurance 120 (A), utilities 260 (A), groceries 900 (F), eating out 400 (F, want), car insurance 180 (T), gas 200 (T), phones 120, travel 500 (want), gifts and giving 200 (want), everything else 600 (want, rough) | the mortgage payment is a debt minimum |
| Accounts | joint checking 12,000; high-yield savings 60,000; Nina 401(k) 780,000; Lev 403(b) 310,000; joint brokerage 410,000; house 520,000 (+2% a year); cars 22,000 and 9,000 | |
| Debts | mortgage 95,000 at 2.875%, $1,650 a month, due the 1st | |
| Goal | FI number $1,600,000 (direct) | |
| 2026 tax year | long-term gains 4,000; qualified dividends 6,000 | |

## October 2026 cash flow

- Gross = 9,000 + 4,500 = **$13,500**; withheld = 900 + 420 + 350 + 180 = $1,850
- FICA = (9,000 + 4,500) x 7.65% = **$1,032.75** (both well under the wage base)
- From pay: 1,500 + 800 = $2,300; take-home = 13,500 - 1,850 - 1,032.75 - 2,300 = **$8,317.25**
- Expenses = 650 + 120 + 260 + 900 + 400 + 180 + 200 + 120 + 500 + 200 + 600 = **$4,130**; FAT = 650 + 120 + 260 + 900 + 400 + 180 + 200 = **$2,710**; FAT needs only 2,310
- Minimums = **$1,650**; after-tax saving 2,000; set-aside 0 (refund)
- Surplus = 8,317.25 - 4,130 - 1,650 - 2,000 = **$537.25**
- Savings rate (gross) = (537.25 + 2,300 + 2,000) / 13,500 = **35.8%**; (net) = 2,537.25 / 8,317.25 = 30.5%

## 2026 tax

- Wages 162,000 - 27,600 (401(k) and 403(b)) = $134,400; withheld 15,000 federal, 7,200 state
- Gains and dividends 10,000; gross income 144,400 = AGI; taxable = 144,400 - 32,200 = $112,200
- Ordinary taxable = 102,200: federal = 24,800 x 10% + 76,000 x 12% + 1,400 x 22% = 2,480 + 9,120 + 308 = $11,908
- Gains stacked on top: the 0% band ends at 98,900, below the ordinary income, so all 10,000 is at 15% = $1,500. Federal income tax = **$13,408.00**
- NY (joint): taxable = 144,400 - 16,050 = 128,350; NY = 17,150 x 3.9% + 6,450 x 4.4% + 4,300 x 5.15% + (128,350 - 27,900) x 5.4% = 668.85 + 283.80 + 221.45 + 5,424.30 = **$6,598.40**
- Owed = **$20,006.40**; withheld 22,200; **balance due -$2,193.60**
- Marginal 22% + 5.4% = 27.4%. Additional Medicare: wages 162,000 are under the 250,000 joint threshold.

## Balance sheet, emergency fund

- Cash 72,000; invested = 780,000 + 310,000 + 410,000 = **$1,500,000**; assets = 2,123,000; debts 95,000; net worth = **$2,028,000**
- Nina is 47 (the app uses the first person): Rule of 5 = **9.4 months**; need = 4,130 + 1,650 = 5,780; runway = 72,000 / 5,780 = **12.46 months** (green); target = ceil(9.4 x 5,780) = **$54,332**, already met

## FI

- FI number **$1,600,000** (direct); implied = 4,130 x 12 / 0.04 = $1,239,000 (goal above: green)
- FI percent = 1,500,000 / 1,600,000 = **93.75%**
- Lean FI = 2,710 x 12 / 0.04 = **$813,000** (engine, needs only: 693,000)
- Coast FI = 1,600,000 / 1.05^18 = **$664,833.05**: reached
- Years to FI, closed form, saving (537.25 + 2,300 + 2,000) x 12 = 58,047 a year: n = ln((80,000 + 58,047) / (75,000 + 58,047)) / ln(1.05) = ln(1.03758) / 0.04879 = **0.76 years**; the engine says 0.8

## Debt

- Mortgage 95,000 at 2.875%, $1,650 a month: n = -ln(1 - 0.0023958 x 95,000 / 1,650) / ln(1.0023958) = 62.0, so 63 payments, the last in **January 2032**; interest about $7,347. (The app's payoff orders throw the whole 537.25 surplus at it as well and show August 2030.)

## Differences from the engine

1. Lean FI 693,000 vs 813,000 (definition).
2. Noted: Lev's age never enters anything (the Rule of 5 and coast age use the first person only).
3. Noted: after the mortgage is paid off, spending for FI purposes stays at 4,130 (right, since the payment is a minimum, not an expense), but the house's own property tax and insurance keep running; fine.
