# Carlos Reyes (made up): 23, cards, a payday loan, negative net worth

As of 2026-10-22. Single, 23 (born 2003-04-12), the Bronx (NYC resident), on a
parent's health plan until 26. File: `card-carlos.json`.

## Inputs

| Item | Value | Notes |
| --- | --- | --- |
| Retail job (W-2) | $1,480 every two weeks since 2025-06-16 | withheld 95 federal, 45 state a paycheck |
| Delivery app (1099) | about $350 a month since 2026-03-01 (rough) | no withholding |
| Expenses | rent 1,900 shared by 2 (his 950, A), utilities 160 shared by 2 (80, A), groceries 380 (F), eating out and delivery 260 (F, want), subway 132 (T), phone 85, streaming and games 35 (want), everything else 300 (want, rough) | |
| Accounts | checking 340; savings 25 | nothing invested |
| Debts | Visa 4,800 at 28.99%, limit 5,000, no minimum entered, no due day; store card 1,350 at 31.99%, limit 1,500, minimum 45, due the 15th; payday loan 600 at 390% APR, 675 due on the 6th; buy now pay later 420 at 0%, 105 a month, due the 20th; owed to Mom 1,200, no interest, 50 a month | |
| Goal | none | |

## October 2026 cash flow

- Pay dates in 2026: biweekly from 2025-06-16; 199 days to January 1 leaves 3 days into a cycle, so the first 2026 payday is January 12 and there are 26
- W-2 gross a month = 1,480 x 26 / 12 = 3,206.67; plus 350 delivery = **$3,556.67**
- Withheld = 140 x 26 / 12 = **$303.33**; FICA = 3,206.67 x 7.65% = **$245.31**; take-home = **$3,008.03**
- Expenses (his share) = 950 + 80 + 380 + 260 + 132 + 85 + 35 + 300 = **$2,222**; FAT = 950 + 80 + 380 + 260 + 132 = **$1,802**; FAT needs only 1,542
- Visa minimum, house default = max(40, 1% x 4,800 + 4,800 x 28.99% / 12) = max(40, 48 + 115.96) = **$163.96**
- Minimums = 163.96 + 45 + 600 (the payday loan: 675 capped at the balance) + 105 + 50 = **$963.96**
- Set-aside: balance due 1,339.03 / 7 = **$191.29**
- Surplus = 3,008.03 - 2,222 - 963.96 - 191.29 = **-$369.22**
- Savings rate = -369.22 / 3,556.67 = **-10.4%**

## 2026 tax

- Wages 1,480 x 26 = $38,480; withheld 2,470 federal, 1,170 state; delivery 350 x 10 months (March to December) = $3,500 of 1099 profit
- SE tax = 3,500 x 92.35% x 15.3% = **$494.53**; half 247.27
- AGI = 38,480 + 3,500 - 247.27 = $41,732.73; taxable = 25,632.73; federal = 1,240 + 13,232.73 x 12% = **$2,827.93**
- NY taxable = 33,732.73; NY = 585.60 + 19,832.73 x 5.4% = **$1,656.57** (NYC tax not modeled, would add about $1,000)
- Owed = 2,827.93 + 494.53 + 1,656.57 = **$4,979.03**; withheld 3,640; **balance due $1,339.03**

## Balance sheet, emergency fund

- Cash 365; debts 4,800 + 1,350 + 600 + 420 + 1,200 = 8,370; net worth = **-$8,005**
- Age 23: Rule of 5 = **4.6 months**; need = 2,222 + 963.96 = 3,185.96; runway = 365 / 3,185.96 = **0.11 months** (red); target = ceil(4.6 x 3,186) = **$14,656**

## FI

- No goal: FI number from spending = 2,222 x 12 / 0.04 = **$666,600**; FI percent 0%
- Lean FI = 1,802 x 12 / 0.04 = **$540,600** (engine, needs only: 462,600)
- Coast FI = 666,600 / 1.05^42 = **$85,884.49**
- Years to FI at today's rate: saving is negative, **never**. The engine's projection says 35.8 years because once the payday loan and the buy-now-pay-later are gone the surplus turns positive (about $460 a month from late 2027). That is a different, defensible reading; it is noted, not counted as a mismatch.

## Debt payoff, minimums only (the projection's dates)

Month by month from November 2026, interest at APR / 12, then the minimum:

- Payday loan: November interest 600 x 3.9 / 12 = 195, balance 795, pay 675, left 120; December interest 39, pay 159: paid **December 2026**, interest 234
- Buy now pay later: 4 x 105: **February 2027**
- Owed to Mom: 24 x 50: **October 2028**
- Store card at 45: 62 payments, **December 2031**, interest about 1,401
- Visa at the house default minimum (falls with the balance, never under 40): 181 payments, **November 2041**, interest about 8,982

The avalanche order by rate: payday (390%), store (31.99%), Visa (28.99%), then the 0% ones. The app's payoff orders roll each freed minimum into the next debt and reach debt-free in September 2027; that is the rolled method, a different question.

## Utilization

Visa 4,800 / 5,000 = **96%**; store 1,350 / 1,500 = **90%**; personal 6,150 / 6,500 = **94.6%**. All red.

## Projection

November 2026: minimums from the schedule = Visa (after interest) 167.92 + 45 + 675 + 105 + 50 = 1,042.92; cash = 365 + 3,008.03 - 2,222 - 1,042.92 - 191.29 = **-$83.18**: the first shortfall is November 2026.

## Differences from the engine

1. Lean FI 462,600 vs 540,600 (definition).
2. Noted, not a mismatch: years to FI 35.8 (projection) vs never (today's rate).
3. A 390% APR on a two-week payday loan is a rough fit; the app has no fee-based loan, and the minimum has no "due in full on a date".
