# Walkthrough, Divorced: Marcus Bell (persona 10)

Method and shared findings: `UI-NOTES.md`.

## What the pages showed

- Ledger: loaded; Marcus and both children under "You and where you file"; "Alimony to ex-spouse (ends June 2029)" shows as a $1,200 a month expense with the end date only in its name; "Child support received" under "Other income".
- Dashboard: loaded (Albany, everything known, a tax-year record). Net worth $171,100. Runway 1.6 months (yellow). Surplus **-$756**. Savings rate -4.2%. FI 11.6% of $1,375,000; the FI gap flag is **red**: "today's spending implies $1,792,500 (the goal is 77% of it)". 2026 refund $487 (child support taxed as income; no child tax credit).
- The projection lists "Alimony ... ends" in June 2029 and "Divorce lawyer, payment plan paid off" in October 2027.

## No field for

- Child support received: taxed as other income ($10,800 a year); by law it is not income.
- Alimony paid under a post-2018 decree: an expense, correctly not deducted; but no field says which rules apply, and a pre-2019 decree (deductible) would be entered the same way.
- Dependents and who claims them: two children, no credit, no alternating-year toggle; the head-of-household status is a choice with no check.
- The dependent care credit on $6,000 of after-school care.
- A payment plan with no interest and a fixed end: entered as a personal loan with interest "not for me", which the Ledger shows as "Interest rate: does not apply"; it works.

## Forced into the wrong category

- Child support as "Other income".
- Kids' costs, after-school care and copays in "Everything else" (the pick list offers "Childcare" as a label only).

## Results that look wrong or misleading

- The FI gap flag is red because the implied FI number counts the alimony ($14,400 a year) that ends in 2029. A cost with an end date should not set a lifetime number.
- The refund is understated by $4,400 (the child tax credit) and overstated by the tax on child support; the two roughly cancel this year by accident.

## Assumptions that are not true for him

- All money in is taxable. All spending lasts forever for FI purposes.

## Rating

**Works with workarounds** (the end date in the file, the tax read with a grain of salt, the FI flag ignored).
