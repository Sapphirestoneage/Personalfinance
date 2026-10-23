# Fay Nakamura (made up): a 1099 freelancer paying quarterly estimates

As of 2026-10-22. Single, 40 (born 1985-11-03), Kings County, lives in New York
City. Self-employed; marketplace health plan. File: `freelance-fay.json`.

## Inputs

| Item | Value | Notes |
| --- | --- | --- |
| Freelance design (1099) | $7,500 a month gross since 2022-03-01; business expenses $900 a month | no withholding |
| Solo 401(k) | $1,000 a month employee deferral | pre-tax |
| Roth IRA | $625 a month; basis 30,000 | |
| Brokerage | $200 a month | |
| Expenses | rent 1,900 (A), utilities 130 (A), groceries 520 (F), eating out 300 (F, want), subway 132 (T), phone 70, marketplace plan 420, gym 60 (want), everything else 350 (want, rough) | |
| Accounts | checking 6,000; high-yield savings 22,000 at 4.1%; solo 401(k) 85,000; Roth IRA 40,000; brokerage 28,000 | |
| Debts | none | |
| Goal | FI at $48,000 a year of spending | |
| 2026 tax year | estimated payments made: 9,000 federal, 2,400 state; set aside 1,500 | |

## 2026 tax (first principles)

- Gross receipts 7,500 x 12 = $90,000; business expenses 900 x 12 = $10,800; net profit = **$79,200**
- Self-employment tax = 79,200 x 92.35% x 15.3% = 73,141.20 x 15.3% = **$11,190.60**; half of it, 5,595.30, is deductible
- Solo 401(k) employee deferral: 1,000 x 12 = $12,000, deductible
- Self-employed health insurance: 420 x 12 = $5,040, deductible
- AGI = 79,200 - 5,595.30 - 12,000 - 5,040 = **$56,564.70**
- Taxable = 56,564.70 - 16,100 = $40,464.70; federal = 1,240 + (40,464.70 - 12,400) x 12% = 1,240 + 3,367.76 = **$4,607.76**
- NY taxable = 56,564.70 - 8,000 = 48,564.70; NY = 585.60 + (48,564.70 - 13,900) x 5.4% = 585.60 + 1,871.89 = **$2,457.49** (New York City tax, about 3.8%, is not modeled by the engine and is left out here too; it would add roughly $1,700)
- Total owed = 4,607.76 + 11,190.60 + 2,457.49 = **$18,255.85**; estimated payments 11,400; **balance due $6,855.85**
- What the engine models (no solo 401(k) or health deduction): AGI 73,604.70; taxable 57,504.70; federal 7,363.03; NY 3,377.65; owed 21,931.28; due 10,531.28
- Each quarter's estimate to cover the year: 18,255.85 / 4 = $4,563.97. Next due date 2027-01-15.

## October 2026 cash flow

- Money in = 7,500 gross; business expenses 900 come out first: **$6,600** to live on (the engine shows 7,500: business expenses only reach the tax engine)
- Withheld 0, FICA 0 (self-employment tax is settled with the estimates)
- Solo 401(k) 1,000 (saving); after-tax saving 625 + 200 = 825 (the engine skips the solo 401(k) because no W-2 paycheck is running)
- Expenses = 1900 + 130 + 520 + 300 + 132 + 70 + 420 + 60 + 350 = **$3,882**; FAT = 1900 + 130 + 520 + 300 + 132 = **$2,982**; FAT needs only 2,682
- Minimums 0
- Set-aside = (6,855.85 - 1,500) / 7 = **$765.12** (engine: (10,531.28 - 1,500) / 7 = 1,290.18)
- Surplus = 6,600 - 3,882 - 0 - 1,000 - 825 - 765.12 = **$127.88** (engine: 7,500 - 3,882 - 825 - 1,290.18 = 1,502.82)
- Savings rate (gross) = (127.88 + 1,000 + 825) / 7,500 = **26.0%**

## Balance sheet, emergency fund

- Cash 28,000; invested 85,000 + 40,000 + 28,000 = **$153,000**; net worth **$181,000**; Roth basis 30,000
- Age 40: Rule of 5 = **8 months**; runway = 28,000 / 3,882 = **7.21 months**; target = ceil(8 x 3,882) = **$31,056**; gap 3,056

## FI

- FI number = 48,000 / 0.04 = **$1,200,000**; implied = 3,882 x 12 / 0.04 = $1,164,600; FI percent = 153,000 / 1,200,000 = **12.75%**
- Lean FI = 2,982 x 12 / 0.04 = **$894,600** (engine, needs only: 804,600)
- Coast FI = 1,200,000 / 1.05^25 = **$354,363.33**
- Years to FI, closed form, saving (127.88 + 1,000 + 825) x 12 = $23,434.56 a year: n = ln((60,000 + 23,434.56) / (7,650 + 23,434.56)) / ln(1.05) = **20.2 years**. The engine (with its larger surplus and no solo 401(k)) says 20.9.

## Differences from the engine

1. **The Dashboard crashes for this household.** `buildFlags` reads `tax.balanceDue.rough[0]` when the balance due is "rough" because New York City tax is not modeled, but the rough list is empty, so `labelFor` gets `undefined` and throws. Any household with a positive balance due, every tax input known, and either `nycResident` true or no 2026 tax-year record hits this.
2. Business expenses are not taken out of the month's money: surplus 1,502.82 vs 127.88.
3. The solo 401(k) contribution is ignored while no W-2 paycheck runs (it is in a "payroll" family), so saving is 825 a month, not 1,825, and the 12,000 deferral is not deducted from taxable income.
4. The self-employed health insurance deduction is not modeled. Together with 3, the balance due is 10,531.28 vs 6,855.85 and the set-aside 1,290.18 vs 765.12.
5. No quarterly estimate amount: the app gives the next date, not what to pay.
6. Lean FI 804,600 vs 894,600 (definition).
