# Walkthrough, Regular FIRE: Wes Delgado (persona 17)

Method and shared findings: `UI-NOTES.md`. Hand math: `../golden/households/w2-wes.expected.md`.

## What the pages showed

- Ledger: loaded, 88 fields; the 401(k) shows "Employer match: 50% of the first 6%" as a text field.
- Dashboard: loaded. Net worth $157,600. Runway **4.7 months** (6.0 by hand). Surplus **$66** ($966 by hand: the $900 "minimum payment" is the card he pays in full). Savings rate **14.9%** of gross (27.9% by hand; 30.0% with the match). FI 12.6% of $1,100,000; "FI in about 16.7 years" (the Likely set; 18.2 at his own 5%). 2026 refund $3,160. Flags: Visa at 11% (yellow), personal cards 11.3% (yellow), runway yellow.

## No field for

- The employer match as a number. It is text; $2,496 a year of saving is missing from the savings rate, the projection and the years to FI.
- A card paid in full as what it is. The pay setting exists ("The full statement balance") and the engines turn it into a debt payment of the whole balance.

## Confusing labels or steps

- "Visa is at 11% of its limit: pay it down to $800 (10%)" for a card cleared on the due date every month. The utilization flag has no idea the balance is this month's groceries.

## Results that look wrong or misleading

- Surplus, savings rate, runway and the Rule of 5 target are all wrong by the card balance.
- The projection charges that card $16.49 of interest in November.
- The payoff orders say August 2027 for a card the projection clears in November 2026.

## Assumptions that are not true for him

- A card balance is debt. For him it is a payment method.

## Rating

**Works with workarounds** (read the surplus plus the card balance; add the match in your head).
