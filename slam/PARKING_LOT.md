# Parking lot

Ideas that are out of scope for the Budget. Nothing here is in the code.

## Out of scope by design (from the brief)

FIRE calculator, projections, investing, net worth, emergency fund and the Rule of 5,
debt payoff strategies, stress tests, "Can I afford this?", state
tax, couples, cloud sync, client-facing logins, bank sync, the life simulator, the full
What Matters priorities feature, hypothetical mode (beyond the single Next stage plan, S-054), the one-pager, gamification,
theming beyond the tokens.

## Ideas noticed while building

- Yearly subscriptions (need 12 or more months of transactions to spot).
- Split one transaction across two lines (a Target run that is half groceries).
- OFX and QFX bank files, and more CSV layouts (Wells Fargo, Bank of America, Citi, Discover).
- Coach-wide merchant rules shared across all clients, on top of per-client memory.
- Remove a likely duplicate with one click from the findings list.
- Let "per paycheck" expense amounts pick which income's pay schedule they follow (today: the first income).
- Tax guess that stacks several gross-only incomes into one bracket calculation.
- A correction factor per line, not just per category.
- Replace the placeholder BLS averages with verified figures each year.
- Cost-of-living scaling for Guess averages (by state or metro), once the averages themselves are verified. ZIP only if a calculation needs it.
- Client-facing read-only view of the Budget screen (logins are out of scope for now).
- Next stage: compare two or more plans side by side; include taxes for the new job from gross pay.

## Entrepreneur ideas (suggested 2026-10-16, not built)

- Lumpy income: average the last 12 months of variable income and "pay yourself a salary" from it; show the floor (worst 3 months) next to the average.
- Quarterly estimated tax set-aside for 1099 and side income: the % to move each payment, and the four due dates.
- Bare-bones number: needs only (FAT, debt minimums, insurance), used as the disaster lens's spending and as the runway denominator.
- Business vs personal split: mark lines as business (the "linked" path), keep them out of the personal budget, and show the owner draw.
- Health insurance after leaving a W-2 job: COBRA or marketplace premium as a one-click cost change in Next stage.
- Solo 401(k) or SEP-IRA room for self-employed income, feeding the deductions list.
- Revenue ramp: months until the venture covers the bare-bones number, in each lens.
- Kill criteria: a coach-set line ("if cash falls below X or revenue is under Y by month Z, go back to a job") shown on the stay-vs-change chart.
- Odds per lens (e.g. 20% disaster, 60% likely, 20% dream) for a weighted expected value.
- Optional DRAFTT comparison to someone else's proportions (Trench, Money Guy, a peer group), shown as a reference, never a grade.

## Monthly loop ideas (parked 2026-10-17, not built)

- Client-side logging: the client enters their own entries on their phone, synced to the coach's file (needs logins and sync).
- Year in review, Wrapped style: top category, biggest month, most-visited merchant, months under plan, estimate accuracy over the year, your 20%, happiest dollars, mistake total, a shareable card with no balances.
- Next year's spending forecast by category (recent averages plus same month last year for annual costs), in Disaster, Likely, Best case. Spending and surplus only, no investment growth (that belongs to the future projection engine, lesson 3).
- Calendar what-ifs: move a paycheck, add a one-time purchase ("Can I afford this?"), skip a bill.
- Joining the calendar (days) and Eras (months and years) into one timeline, once the projection engine exists.

## Hosted version (parked 2026-10-17, groundwork in S-096)

- Hosted version: sign-in for coach and client, server storage, live sync, client entries from their own phone (see HOSTING.md).

## Future tools (parked 2026-10-18, S-105)

- Future tools (dream life, Eras, Next stage) are parked behind a setting. Open question for later: merge Next stage into Eras as one era with Disaster, Likely, and Best case.

## Owning calculators (parked 2026-10-18, S-113)

- A full rent vs buy calculator.
- A car calculator: buy vs lease vs keep vs go car-free.
- A house hack calculator.

## Net worth follow-ups (parked 2026-10-18, S-115)

- A loan whose payment is a budget line (Riley's Car payment): link the debt to that line, so its
  payment shows on the debt without a second minimum, instead of leaving the minimum blank.
- Card interest that is not in the budget shows up as "not explained yet" in the bridge; a line for it
  (or the APR on the card's balance) could explain it.

## Credit tracker (parked 2026-10-18, S-126)

- A card importer: pick the card by name and its details (APR, annual fee, promo terms, sign-up bonus)
  fill in, each one editable. Needs a reference file in data/, versioned by year.
- Annual fee and sign-up bonus (spend needed, by when, earned or not) on a card's debt.

## Card profiles: benefits and lifestyle hacks (parked 2026-10-19)

- A card is a debt: its balance, APR, and payment live on the debt. Next to it, a card profile holds what
  the card gives you: rewards and multipliers, credits (travel, dining, streaming), perks (lounge access,
  insurance, protections), annual fee, and sign-up bonus progress.
- Later: "what cards and credits do you have, and how can they upgrade your life", e.g. credits going unused,
  which card to use where, whether the annual fee pays for itself. Pairs with the card importer above.
