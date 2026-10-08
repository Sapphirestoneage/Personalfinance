# cashflow-v44: parity audit against engine/cashcal.js (MR-068, 8 Oct 2026)

The owner pasted cashflow-v44.html into the chat. The paste was cut off partway
through the screen code, but the engine (the minified function at the top of
the script, returning planStats, simulate, burnGroups, safeToSpend, monteCarlo,
stuckReason, solvePayoff, payoffRows, debtDrag, flowData, fooLadder and the
rest) was complete. This file is the rule-by-rule comparison. The file itself
is not in the repo; drop it in this folder as cashflow-v44.html to keep the bytes.

| v44 rule | cashcal.js before | Now |
|---|---|---|
| Statement: interest only when the cycle's payments did not cover the last statement; average daily balance; penalty rate for six months after a miss | same | same |
| Minimum = max(floor, pct x statement); floor $35, 2% | floor $25 | $35 (data/calendar.json) |
| A minimum the checking account cannot fund is not paid at all: late fee $40, penalty rate, shortfall | paid what was available, late fee $30 | ported: the full payment, else the minimum, else nothing; $40 |
| Budgeted charges on a card (budgetCharges or budgeted on the line) are paid with the minimum so they never become debt | missing | ported: record.calendar.budgeted per line |
| Extra at the debt on extraDay, aimed by avalanche (effective rate, a 0% promo last) or snowball; payLast (student loans, the float card) wait; stopAtHi; freed plan installments roll in | missing (Level 11 handled debt order outside the calendar) | ported: model.extra from record.calendar.extra, else the goal timeline's first-month debt funding |
| Float card (goalNoInterest) pays at least the cycle's charges and is paid last | same | same |
| Pay-in-full cards pay the statement | same | same |
| Auto-cover from autoCover accounts up to the floor | same, plus cover before a guarded payment | same |
| Cash-constrained payments (hardStop) with a reserve | guard with the floor | same (the floor is the reserve) |
| Dry date on total cash under the floor | first day the checking account dips | both: firstBelowFloor (checking) and firstDryTotal |
| Cleared = the day after the last revolving statement, if before the horizon less two months | the due date that first pays the statement in full | kept; same meaning, read at the due date |
| Safe to spend = non-emergency cash minus committed cash expenses and payments through the next income (inclusive) minus the reserve | strictly before the next income | kept strictly before (the spec's wording); listed as question 69 |
| Monte Carlo: 120 runs, every amount jittered, weighted maybe money | 200 runs, variable and estimated items only, seeded | kept (the brief said 200) |
| stuckReason: rate, spending, starved, float, slow | missing | ported as whyStuck, shown on the Cards tab |
| solvePayoff: binary search on the extra for a card or all by a date, says if it breaks cash | missing | ported as solvePayoff, "Pay it off by a date" on the Cards tab |
| Report day for utilization defaults to the statement day | statement day plus two | statement day |
| Plans with APR amortize to a term | same (payLaterInstallment) | same |
| Reimbursed subscriptions land N days later | same (record.calendar.reimb) | same |
| Student loan forgiveness (forgiveMonths) and IDR payments | missing | not ported; question 70 |
| FOO ladder, goals, assets and net worth, Sankey, momentum, budgets by tag with a month-end sweep of leftovers | not in the calendar | the Level 11 goal timeline, Level 2 net worth, the Measure Sankey, Level 12 momentum and the spend logger's pace cover these; the sweep of budget leftovers is question 71 |
| Setup wizard, CSV import, check-in with drift | the Ledger, the transactions import, the weekly check-in | same jobs, existing screens |
