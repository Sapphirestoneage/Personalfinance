# Hand math: Tess Nakamura and Omar Haddad, with Lin Zhao (persona 7)

As of 2026-10-22, October 2026, tax year 2026, Tess and Omar's view (married filing jointly). Conventions: `../golden/CONVENTIONS.md`.
Test: `07-polyamorous-household.golden.test.js`.

## October 2026 cash flow

- Tess: $6,500 W-2; withheld 800 + 330 = $1,130; FICA 6,500 x 7.65% = $497.25; 401(k) $500 from pay
- Omar: $4,200 of contract income less $600 of business expenses = **$3,600** to the household
- Money in = 6,500 + 3,600 = $10,100; take-home = 10,100 - 1,130 - 497.25 - 500 = **$7,972.75** (the engine counts Omar's gross: 8,572.75)
- Shared bills, their two-thirds: (3,900 + 330 + 80 + 1,100) x 2/3 = **$3,606.67** (rent 2,600.00, utilities 220.00, internet 53.33, groceries 733.33)
- Expenses = 3,606.67 + 500 + 264 + 140 + 480 + 150 + 300 + 600 = **$6,040.67**; FAT = 3,606.67 + 500 + 264 = **$4,370.67**
- Minimums: Omar's loan $180. The Visa is paid in full: $0 (the engine: $1,200)
- After-tax saving: SEP IRA $400 (pre-tax in reality, after-tax in the app's family)

## 2026 tax (joint)

- Tess: wages 78,000 - 6,000 (401(k)) = $72,000; withheld 9,600 federal, 3,960 state
- Omar: profit 50,400 - 7,200 = $43,200; self-employment tax 43,200 x 92.35% x 15.3% = **$6,103.97**, half ($3,051.98) deductible; SEP IRA $4,800 deductible; self-employed health insurance 480 x 12 = $5,760 deductible
- AGI = 72,000 + 43,200 - 3,051.98 - 4,800 - 5,760 = **$101,588.02**; taxable = 101,588.02 - 32,200 = $69,388.02
- Federal = 2,480 + (69,388.02 - 24,800) x 12% = **$7,830.56**
- NY (joint): 101,588.02 - 16,050 = 85,538.02: 668.85 + 283.80 + 221.45 + (85,538.02 - 27,900) x 5.4% = **$4,286.55** (New York City tax, about $3,000, is not modeled)
- Owed = 7,830.56 + 6,103.97 + 4,286.55 = **$18,221.08**; withheld 13,560; **balance due $4,661.08**; set-aside 4,661.08 / 7 = **$665.87**
- Engine (no SEP or health deduction): AGI 112,148.02; federal 9,097.76; NY 4,856.79; owed 20,058.52; due 6,498.52; set-aside 928.36
- Omar's quarterly estimate to cover the year: 18,221.08 / 4 = $4,555.27 (next date January 15, 2027)

## Surplus, balance sheet, emergency fund, FI

- Surplus = 7,972.75 - 6,040.67 - 180 - 400 - 665.87 = **$686.21** (engine: -176.28)
- Net worth = 4,200 + 14,000 + 2,600 + 88,000 + 31,000 + 20,000 - 14,000 - 1,200 = **$144,600**; cash $20,800
- Tess is 38: Rule of 5 = 7.6 months; runway = 20,800 / (6,040.67 + 180) = **3.34 months** (engine: 2.80 with the Visa balance in the burn)
- FI from spending = 6,040.67 x 12 / 0.04 = **$1,812,200**; Lean FI (FAT) = 4,370.67 x 12 / 0.04 = $1,311,200 (engine, needs only: $1,161,201)
- Omar's loan at $180: 103 payments, May 2035, about $4,512 of interest (the engine's schedule agrees: May 2035)

## Differences from the engine

1. Business expenses do not come out of the month's money (take-home 8,572.75 vs 7,972.75).
2. The Visa paid in full counts as a 1,200 minimum: surplus -176.28 vs 686.21; runway 2.80 vs 3.34.
3. SEP IRA and self-employed health insurance deductions are not modeled: balance due 6,498.52 vs 4,661.08; set-aside 928.36 vs 665.87.
4. The SEP IRA contribution is treated as after-tax saving (it is pre-tax).
5. Lean FI by definition.
6. Not a mismatch, a gap: Lin's third of the household exists nowhere in the file.
