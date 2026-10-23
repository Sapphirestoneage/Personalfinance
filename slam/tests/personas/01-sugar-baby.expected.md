# Hand math: Mila Soto (persona 1, sugar baby)

As of 2026-10-22, October 2026, tax year 2026. Conventions: `../golden/CONVENTIONS.md`.
Test: `01-sugar-baby.golden.test.js`.

## October 2026 cash flow

- Boutique: $1,100 every two weeks = 1,100 x 26 / 12 = $2,383.33; withheld (60 + 30) x 26 / 12 = $195.00; FICA 2,383.33 x 7.65% = $182.32
- Allowance: $3,000 (rough)
- Gross = **$5,383.33**; take-home = 5,383.33 - 195 - 182.32 = **$5,006.01**
- Expenses = 2100 + 90 + 420 + 350 + 132 + 75 + 280 + 300 + 250 + 200 + 300 = **$4,497**; FAT = 2100 + 90 + 420 + 350 + 132 = **$3,092**
- Visa minimum (house default) = max(40, 1% x 1,800 + 1,800 x 26.99% / 12) = max(40, 18 + 40.49) = **$58.49**; plus buy now pay later $88: minimums **$146.49**
- Roth IRA from take-home: $100

## 2026 tax, three ways

Pay dates in 2026: biweekly from 2025-03-03; 304 days to January 1 leaves 10 days into a cycle, so the first 2026 payday is January 5 and there are 26: wages 1,100 x 26 = $28,600, withheld $1,560 federal and $780 state. The allowance ran February to December: 11 x 3,000 = $33,000.

| | A. The allowance is a gift | B. The allowance is compensation | What the engine does ("other income") |
| --- | --- | --- | --- |
| Self-employment tax | 0 | 33,000 x 92.35% x 15.3% = 4,662.75 | 0 |
| AGI | 28,600 | 28,600 + 33,000 - 2,331.37 = 59,268.62 | 61,600 |
| Taxable (less 16,100) | 12,500 | 43,168.62 | 45,500 |
| Federal income tax | 1,240 + 100 x 12% = 1,252.00 | 1,240 + 30,768.62 x 12% = 4,932.23 | 5,212.00 |
| NY (AGI less 8,000) | 20,600: 585.60 + 6,700 x 5.4% = 947.40 | 51,268.62: 585.60 + 37,368.62 x 5.4% = 2,603.51 | 2,729.40 |
| Owed | 2,199.40 | 12,198.49 | 7,941.40 |
| Withheld | 2,340 | 2,340 | 2,340 |
| Balance due | **-140.60 (a refund)** | **9,858.49** | 5,601.40 |
| Set-aside (7 months) | 0 | 1,408.36 | 800.20 |
| Surplus | 5,006.01 - 4,497 - 146.49 - 100 - 0 = **262.52** | **-1,145.83** | -537.68 |

New York City tax (about 3.8% of taxable income) applies to her in B and in the engine's reading and is not modeled anywhere. Reading A is the one most people in her position take and the one the IRS contests when the money looks like pay; a coach would show both. The engine's reading is neither: it taxes the allowance as ordinary income and skips the self-employment tax.

## Balance sheet, emergency fund, FI

- Net worth = 1,900 + 8,500 + 2,000 - 1,800 - 350 = **$10,250**; cash $10,400
- Age 24: Rule of 5 = 4.8 months; runway = 10,400 / (4,497 + 146.49) = **2.24 months**; target = ceil(4.8 x 4,644) = **$22,292**
- Runway if the allowance stopped today: 10,400 / (4,497 + 146.49 + 100 - 2,006.01 of boutique take-home) = **3.8 months** of the shortfall (the number she asked for; the app has no way to show it)
- FI from spending = 4,497 x 12 / 0.04 = **$1,349,100**; Lean FI (FAT) = 3,092 x 12 / 0.04 = $927,600 (engine, needs only: $822,600)
- Visa at the house default minimum: 89 payments, March 2034, about $2,077 of interest; the app's avalanche with the surplus as extra gives June 2028 only because its surplus is negative and the extra is 0, so the two agree on nothing but the order.

## Differences from the engine

1. The tax on the allowance: 5,601.40 due, matching neither the gift reading (refund 140.60) nor the compensation reading (9,858.49). Cause: "other income" is ordinary income with no self-employment tax, and there is no gift kind.
2. Set-aside and surplus follow the tax: 800.20 and -537.68 instead of 0 and 262.52 (A) or 1,408.36 and -1,145.83 (B).
3. Lean FI 822,600 vs 927,600 (definition).
