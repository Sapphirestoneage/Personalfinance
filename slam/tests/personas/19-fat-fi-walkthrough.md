# Walkthrough: Victor Lam, Fat FI

Method and shared findings: `UI-NOTES.md`.

## What the pages showed

- Ledger: loaded, 102 fields; the still-guessing list led with "Everything else" and "Annual bonus: how likely".
- Dashboard: **crashed** (Manhattan: New York City resident).
- Engines directly: take-home $25,511 (FICA overstated by about $827 a month: the Social Security wage base applied to each stream each month); minimums $19,900 (the $5,900 mortgage plus the $14,000 Amex he pays in full); surplus **-$21,101**; savings rate -38%; FI 75% of $8,000,000, "FI in about 4.8 years"; 2026 balance due $31,230 with a $4,462 set-aside (no net investment income tax, no city tax). Payoff orders: "Amex: never pays off, interest **$2,156,984,649.73**"; the mortgage May 2050 with the surplus as extra.

## No field for

- Equity compensation and a bonus as what they are (a second W-2 and a maybe-money "once" stand in and get the tax about right).
- The net investment income tax (about $7,200), New York City tax (about $25,000), the alternative minimum tax check.
- Estate and charitable planning: appreciated shares to charity, a donor-advised fund.
- A withdrawal rate for a 40-year horizon side by side with the 4% default (the Worst set gives 3.5%).

## Results that look wrong or misleading

- A surplus of -$21,101 for a man saving well over $20,000 a month in reality.
- Two billion dollars of interest on a card paid in full every month: the payoff plan uses the $300 minimum against $338 of monthly interest and compounds for 600 months. Two bugs in one line: the pay setting is ignored, and a minimum below the interest is run to the horizon instead of stopping with "the minimum does not cover the interest".
- FICA and take-home wrong by the per-stream, per-month wage base.

## Assumptions that are not true for him

- Income is under the Social Security wage base and in one stream.
- Cards are paid at the minimum.
- Taxes above $250,000 look like taxes below it.

## Rating

**Doesn't work** as shipped. With the crash fixed: works with workarounds, with the Amex and FICA errors to subtract by hand.
