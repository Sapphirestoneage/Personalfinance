---
paths:
  - "rooms/start.html"
---
# Start Here (`start`)
File: rooms/start.html · 1000 lines
Engines: income
Reference data: match_defaults.json, onepager_defaults.json, retirement_milestones.json, states.json, ui_benefits.json
Owns: cashSavings, investments, employerMatch, capturingFullMatch, contributionPercent
Reads from other owners: filingStatus (tax), grossAnnualIncome (income), lastPay (runway), employmentStatus (settings), hasDebt (debt-payoff), highestDeductible (runway), totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff), +4 more
Latest decisions:
  - D-166 — The other five questions, folded
  - D-159 — Two boxes buy a number, and the other seven wait
  - D-146 — The responsive audit, kept
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-095 — The one-pager: one gate, ten cards at most, every box a guess until it is yours
Full context: node tools/context/pack.js start
