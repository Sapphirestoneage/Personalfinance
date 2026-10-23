# Yeshivish family: the Weinbergs (persona 09, made up)

File: `households/09-yeshivish-family.json`. Walkthrough: `09-yeshivish-family-walkthrough.md`.

## Who they are

Chaim (33) learns full time in kollel and receives a $1,200 monthly stipend;
no W-2 or 1099 comes with it, and nobody has ever told them clearly whether it
is taxable. Rivky (31) teaches at a girls' school ($40,800, W-2). Both sets of
parents help, $1,500 a month between them. Chaim tutors for cash on the side,
about $400 a month. They have six children, the youngest a year old, and are
on NJ FamilyCare; they get SNAP and WIC. Four children are in school at a
scholarship rate ($15,000 a year for all four). They give maaser ($500), pay
for shul ($1,200 a year) and set money aside for yom tov and simchas
($3,000 a year). They rent, drive a 2014 minivan, owe $2,900 on a Visa and
$5,000 to a gemach (an interest-free community loan) at $100 a month.

In real life their year balances because of the earned income credit and the
child tax credit (together well over $10,000 at their income and family size),
the benefits, and the scholarship rate. The app sees none of those.

## Every number they would enter

| What | Value | Where it goes |
| --- | --- | --- |
| Kollel stipend | $1,200 a month, no withholding | Income, "other income" (taxed as ordinary income by the app; taxability is the open question) |
| Rivky's salary | $3,400 a month, $150 federal and $60 state withheld | Income, W-2 |
| Help from parents | $1,500 a month | Income, "other income" (a gift; the app taxes it) |
| Tutoring (cash) | about $400 a month | Income, 1099, rough |
| SNAP and WIC | about $600 a month of benefits | Income, "other income" (not money, not taxable; there is nowhere else) |
| Rent, utilities | $1,900, $280 | Expenses, housing |
| Groceries (kosher, eight people) | $1,400 | Expenses, food |
| Tuition, four children, scholarship rate | $15,000 a year | Expenses, yearly |
| Maaser, shul, yom tov and simchas | $500 a month; $1,200 a year; $3,000 a year | Expenses |
| Phones, gas, car insurance | $90, $150, $160 | Expenses |
| Baby and kids | $300 | Expenses |
| Takeout, everything else | $80, $400 rough | Expenses |
| Checking, savings | $1,400; $3,200 | Assets |
| Rivky's Roth IRA | $4,000, basis $4,000 | Assets |
| Minivan | $8,000 | Assets, car |
| Visa | $2,900 at 24.99%, limit $5,000, $85 minimum | Debt |
| Gemach loan | $5,000, no interest, $100 a month | Debt, family IOU (the closest kind) |
| Children | six, with birth dates | Household, people |
| Health coverage | medicaid (NJ FamilyCare) | Household |
| Goal | a simcha fund of $10,000 | Goals |

## What they would want the app to tell them

- Their refund. With six children and $85,000 of income their earned income credit and child tax credit are the biggest single number in their year; the app cannot show a tax figure at all for New Jersey, and would tax the gift, the benefits and the stipend if it could.
- Whether the kollel stipend is taxable and what to set aside if it is.
- A cash calendar around tuition, yom tov and the simcha fund, with the gemach as what it is: a loan with a schedule and no interest.
- What changes when a child starts school, and when Chaim takes a job (the "situation" field has no word for kollel; "mixed" is the nearest).
- Benefits cliffs: what a raise for Rivky does to FamilyCare and SNAP.
