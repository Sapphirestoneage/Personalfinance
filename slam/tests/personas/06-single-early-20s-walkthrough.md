# Walkthrough, Single, early 20s, negative net worth: Carlos Reyes (persona 06)

Method and shared findings: `UI-NOTES.md`. Hand math: `../golden/households/card-carlos.expected.md`.

## What the pages showed

- Ledger: loaded; still guessing led with the delivery income (rough) and the Visa's house-default minimum and due day.
- Dashboard: loaded (a rough input keeps the crash away). Net worth **-$8,005**. Runway 0.1 months (red). Surplus **-$369** with a $191 tax set-aside on the delivery income. Credit cards $6,150: Visa 96%, store card 90%, personal cards 94.6% (all red), with the credit score note naming the store card as the smallest balance to clear. FI 0% of $666,600. 2026 balance due $1,339 (New York City tax not included). Flags: 4 red (two cards, personal cards, runway), the parent-plan health flag at 26, the tax flag.
- Every number matched the hand math (the golden test has one known failure, Lean FI).

## No field for

- A payday loan's real shape: a fee due in full on a date. Entered as a loan at a 390% APR with the whole balance as the minimum; the schedule then charges a month of interest at that rate before the first payment, which is a fair stand-in but not the thing.
- "Pay this one in full on the 6th or it rolls over" as a flag. The avalanche order lists it first, which is right; nothing says it is a cliff.
- A cash-advance balance inside the Visa at its own rate.

## Forced into the wrong category

- Money owed to Mom is a "family IOU" with a $50 minimum; she would wait, but the app cannot know that and counts it in the runway burn.

## Confusing labels or steps

- The Visa minimum reads "Rough" with a house default of $163.96; a person at 96% utilization usually knows their minimum from the app or the statement, and the Ledger asks for it, which is right.

## Results that look wrong or misleading

- The payoff orders roll freed minimums forward and say debt-free in September 2027; the projection pays minimums only and says the Visa ends in November 2041. Both are shown in different places without saying which question each answers.

## Assumptions that are not true for him

- Hardly any. This is the household the app was built around and it reads him accurately.

## Rating

**Works well.**
