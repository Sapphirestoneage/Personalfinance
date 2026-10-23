# Walkthrough, Slow FIRE: Maya Lindgren (persona 16)

Method and shared findings: `UI-NOTES.md`.

## What the pages showed

- Ledger: loaded, 78 fields; two salary items under Paychecks ("until the sabbatical" and "after the sabbatical", the second rough), with no date shown for either; the goal "FI by 55, not sooner" under Goals with its yearly spending and no sign of its date.
- Dashboard: **crashed** (Brooklyn: New York City resident).
- Engines directly: take-home $6,036; expenses $4,682; surplus $429; savings rate 21.2% of gross; FI 12.5% of $1,500,000; "FI in about 21.3 years" (2047, at her own 5%); the projection lists the salary ending February 2028 and the next starting September 2028 with no cash shortfall (the sabbatical fund covers it); 2026 refund $3,397.

## No field for

- "FI by 55": the goal's `by` date is stored and no engine reads it. The one question she has, "am I on track for 2048", is not answered; she gets a year (2047) and has to compare.
- A pause: the sabbatical is two streams with a gap, in the file only. On the page the first salary looks permanent and the second looks like a duplicate.
- A savings rate target (20%) with the rest marked as hers to spend. The app's surplus is "what is left"; it has no concept of spending on purpose.
- Coast FI at 55: the coast age is a single assumption (65 by default, editable in the Ledger), so this one works by editing it.

## Forced into the wrong category

- Travel, climbing and therapy are "Everything else", wants; for Slow FI they are the plan, and the "need" tag is the only way to say so, which then puts them into Lean FI.

## Confusing labels or steps

- "Same work after the sabbatical (rough)" reads as a second job; the Ledger has no words for "the same stream, later".

## Results that look wrong or misleading

- Nothing wrong in the engine numbers for her; the answer is simply not framed as a date against hers.

## Assumptions that are not true for her

- Sooner is better; the surplus is to be maximized; a gap in income is a shortfall, not a plan.

## Rating

**Doesn't work** as shipped (no Dashboard). With the crash fixed: works with workarounds.
