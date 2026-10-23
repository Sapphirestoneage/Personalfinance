# Walkthrough: the Adlers, Modern Orthodox family

Method and shared findings: `UI-NOTES.md`.

## What the pages showed

- Ledger: loaded, 128 fields; six people under "You and where you file" (four children with birth dates that nothing uses). Tuition reads "$42,000 a year", maaser "$1,600 a month", camp and Pesach as yearly lines.
- Dashboard: **crashed**. New Jersey: the tax engine returns no total at all for a state other than New York, so the balance due is "missing" with no missing input to name, and the flags throw.
- Engines directly: take-home $14,078; expenses $12,215; minimums $5,510 (mortgage, HELOC, and the $3,200 Visa they pay in full); surplus **-$3,647** (-$447 without the Visa double count); no tax number ("State tax for NJ" not modeled, and the federal figure is withheld with it); FI 15.6% of $2,250,000; the projection's first shortfall May 2032.

## No field for

- Children as dependents. Four birth dates are stored; the child tax credit ($8,800), the dependent care credit and head-of-household rules are nowhere.
- New Jersey tax. Not modeled, and the federal number vanishes with it: the tax tile would read "not enough to figure yet" for a household whose tax inputs are complete.
- Tuition as a per-child, dated cost: one yearly line, no end dates per child (the youngest finishes in 2038), no "education" category or total.
- Maaser as a tenth of income: a typed monthly amount that will not move when a salary does; no "giving" category (the pick list has "Charity" as a label only).
- The 529 for K-12 tuition ($20,000 a year per child from 2026) against the HELOC at 8.5%: no comparison.
- A tuition reserve goal with any effect.

## Forced into the wrong category

- Tuition, camp, Pesach, shul and maaser all land in "Everything else" with the phones. The "need" tag is the only way to say tuition is not optional; the Lean FI number then counts none of it, which for this family is the point of their life, not a want.

## Confusing labels or steps

- "Kind of spending: not food, housing or transportation" is the only choice for $66,000 a year of tuition and giving.
- Two cars and a minivan are "Car" items that lose 15% a year by house default; fine, but the Ledger says so in six rough fields.

## Results that look wrong or misleading

- No tax number at all, when the federal part is computable.
- The surplus is negative by the Visa balance.
- "Cash runs out May 2032" with no mention that tuition ends child by child.

## Assumptions that are not true for them

- A household is in New York.
- Spending beyond food, housing and transportation is optional.
- Children do not change the tax.

## Rating

**Doesn't work** as shipped. With the crash fixed and federal tax shown for any state: works with workarounds.
