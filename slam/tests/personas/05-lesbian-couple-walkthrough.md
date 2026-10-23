# Walkthrough, Lesbian couple: Priya Raman and Naomi Katz (persona 05)

Method and shared findings: `UI-NOTES.md`.

## What the pages showed

- Ledger: loaded, 111 fields. Both salaries appear under "Paychecks (W-2)"; Naomi's is hers only because the file says so (the Ledger's add form would have attached it to Priya). Both people appear under "You and where you file" with their birth dates.
- Dashboard: loaded (Westchester, outside the city; every tax input known and a 2026 tax-year record present). Net worth $231,100. Runway 5.1 months (the IVF fund counts as cash). Surplus **$1,707** (after a $1,400 "minimum payment" on the Visa they pay in full; the first-principles surplus is $3,107). Savings rate 20.9%. FI 13.7% of $1,500,000; "FI goal is below what today's spending implies" (yellow: $1,701,000). 2026 refund $6,502.
- The projection's events list the donor vials in January 2027, the IVF cycle and medications in February, the parentage order in September, and no cash shortfall.

## No field for

- A second adult in the Ledger. The file carries Naomi; the page cannot add her, cannot give her an income, and uses Priya's age alone for the Rule of 5 and coast age.
- Medical expenses as a category with a yearly total against the 7.5% of AGI floor ($11,430 at their income).
- Dependent care FSA, adoption credit, or a parentage order as anything but an expense.
- The IVF fund as money set aside for a dated purpose: it counts as emergency cash and raises the runway to 5.1 months; without it the runway is 0.9 months, which is the number they should see.

## Forced into the wrong category

- Four one-time costs sit under "Everything else" with the dog and the phones.
- The 403(b) contribution is Naomi's but the Ledger shows "Paid in from: taken from the paycheck" with no idea whose paycheck.

## Confusing labels or steps

- "I share it with others: roommates, a partner" is the only sharing language; for a married couple with joint accounts, every bill is simply theirs, and the pay-from link defaults to one checking account.

## Results that look wrong or misleading

- The surplus and runway are off by the Visa double count (UI-NOTES.md item 2).
- The FI gap flag compares the $60,000 goal against spending that includes $5,670 a month of ordinary costs but not the one-time costs; fine, but after a baby the goal is wrong in the other direction and nothing prompts that.

## Assumptions that are not true for them

- One earner, one person, one age.
- Family-building costs are not part of a plan.

## Rating

**Works with workarounds** (the file for the second person and the dates; mental arithmetic for the surplus and runway).
