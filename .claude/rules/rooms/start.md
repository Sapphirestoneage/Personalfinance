---
paths:
  - "rooms/start.html"
---
# Start Here (`start`)
File: rooms/start.html · 999 lines
Engines: income
Reference data: match_defaults.json, onepager_defaults.json, retirement_milestones.json, states.json, ui_benefits.json
Owns: dob, age, state, zip, filingStatus, grossAnnualIncome, unemployment, lastPay, cashSavings, investments, employmentStatus, employerMatch, capturingFullMatch, hasDebt, contributionPercent, highestDeductible, dependents
Reads from other owners: totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses), debtBalance (debt-payoff), debtRate (debt-payoff), paySurvives (income)
Latest decisions:
  - D-166 — The other five questions, folded
  - D-159 — Two boxes buy a number, and the other seven wait
  - D-146 — The responsive audit, kept
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-095 — The one-pager: one gate, ten cards at most, every box a guess until it is yours
Full context: node tools/context/pack.js start
