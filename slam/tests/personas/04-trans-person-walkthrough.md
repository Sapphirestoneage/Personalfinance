# Walkthrough: Jordan Avery, trans

Method and shared findings: `UI-NOTES.md`.

## What the pages showed

- Ledger: loaded, 98 fields. The surgery ($7,500 once, March 2027) and the name change ($450 once, December 2026) show as expenses with "once" in their line; their dates are not visible or editable anywhere on the page.
- Dashboard: **crashed** (Brooklyn: New York City resident).
- Engines directly: take-home $3,853; expenses $3,497 (the one-time costs are not in October); minimums $255; surplus **-$99**; 2026 refund $1,898; runway 2.6 months; the projection lists "Name change ... starts" in December 2026 and "Surgery ... starts" in March 2027 as events, and cash dips but does not run out.

## No field for

- An income that pauses: three unpaid weeks after surgery. A stream can only end or start, so the only way is to end the salary on April 1, 2027 and start a second one on April 22, in the file.
- A medical total. Therapy, HRT, electrolysis and the surgery are four lines in "Everything else" with no subtotal, which is the number an FSA or HSA election is sized to.
- Insurance facts: what the plan covers, the out-of-pocket maximum, whether electrolysis is excluded. The health coverage item holds a kind and a plan type only.
- A goal's progress: the surgery fund is a savings goal with a date, but the Dashboard shows no goal tile, no "on track for March", no monthly amount to reach it. Goals other than FI are stored and not used by any engine.

## Forced into the wrong category

- The surgery fund is a high-yield savings account with role "sinking fund"; the role is stored and nothing reads it, so the fund counts as emergency cash and inflates the runway.
- Electrolysis "not covered" is a plain expense; the Ledger's "Someone else covers it" means paid by another person, not insurance.

## Confusing labels or steps

- "Once" expenses: the add form offers "once" as how often, then the item's amount row shows "$7,500 once" with no date, and no way to set one.

## Results that look wrong or misleading

- The surgery fund counts toward runway (2.6 months) though it is spoken for.

## Assumptions that are not true for them

- Health costs are a premium and a plan type. Care that insurance excludes, and the administrative costs of changing a legal name, have no shape here beyond a labeled line.

## Rating

**Doesn't work** as shipped (no Dashboard). With the crash fixed: **works with workarounds** (dates in the file, no goal tracking).
