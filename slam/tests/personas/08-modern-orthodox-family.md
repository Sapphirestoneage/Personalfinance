# Persona 8: the Adlers, a Modern Orthodox family in Teaneck (made up)

File: `households/08-modern-orthodox-family.json`. Walkthrough: `08-modern-orthodox-family-walkthrough.md`.

## Who they are

Eitan (42) is an actuary ($210,000); Shira (40) is a speech therapist working
three days a week ($38,400). Four children, 6 to 14, all in Jewish day school.
Full tuition would be $81,000 a year; with the schools' assistance they pay
$42,000. Kosher groceries for six run $1,900 a month. They belong to a shul
($3,600 a year), send the kids to camp ($6,000), and Pesach and the holidays
cost about $4,500 a year between food, travel and clothes. They give maaser,
a tenth of their income, about $1,600 a month, and they would like the app to
treat it as a fixed commitment, not a "want" to be trimmed.

They own their house (refinanced in 2021 at 3.25%), carry a HELOC they drew
on for tuition, and pay their Visa in full. Retirement saving is real but
behind where it would be without tuition. New Jersey tax applies to them,
which the app does not model.

## Every number they would enter

| What | Value | Where it goes |
| --- | --- | --- |
| Eitan's salary | $17,500 a month, $2,800 federal and $950 state withheld | Income, W-2 |
| Shira's salary | $3,200 a month, $260 federal and $110 state withheld | Income, W-2 (hers only in the file) |
| 401(k), 403(b) | $900, $150 a month | Assets |
| Property tax, home insurance, utilities | $1,450, $190, $420 | Expenses, housing |
| Groceries (kosher), eating out (kosher) | $1,900, $350 | Expenses, food |
| Day school tuition, four children, after assistance | $42,000 a year | Expenses, yearly (no education category) |
| Summer camp | $6,000 a year | Expenses, yearly |
| Pesach and the holidays | $4,500 a year | Expenses, yearly |
| Shul membership | $3,600 a year | Expenses, yearly |
| Maaser | $1,600 a month | Expenses (no giving category; it is "everything else" and must be tagged a need by hand) |
| Gas, car insurance (two cars) | $260, $240 | Expenses, transportation |
| Phones, kids' activities, everything else | $180, $250, $700 rough | Expenses |
| Joint checking, savings | $9,000; $24,000 | Assets |
| Eitan 401(k), Shira 403(b) | $310,000; $42,000 | Assets |
| 529 (all four) | $18,000 | Assets, education |
| House, two cars | $780,000 growing 3%; $24,000; $11,000 | Assets |
| Mortgage | $280,000 at 3.25%, $2,100 a month | Debt |
| HELOC (tuition) | $25,000 at 8.5%, $210 a month, limit $100,000 | Debt |
| Visa, paid in full | $3,200, limit $20,000 | Debt |
| Children | four, with birth dates | Household, people (they have no effect on anything computed) |
| Goals | FI at $90,000 a year; a tuition reserve of $40,000 | Goals |

## What they would want the app to tell them

- The real federal and New Jersey tax with four children: the child tax credit alone is $8,800 a year; the app shows no tax number at all for a New Jersey household.
- Tuition as what it is: a fixed, dated cost per child that ends when each child finishes (the youngest in 2038), not a want.
- Whether a 529 can pay day school ($20,000 a year per child from 2026 under federal law; New Jersey's own treatment) and whether that beats the HELOC.
- Maaser as a commitment that scales with income, shown as a tenth, not a typed number that drifts.
- A retirement picture that is honest about the tuition years: what happens to the FI date when the last tuition payment ends.
