---
paths:
  - "rooms/start.html"
---
# Start Here (`start`)
File: rooms/start.html · 1091 lines
Engines: income
Reference data: match_defaults.json, onepager_defaults.json, retirement_milestones.json, states.json, ui_benefits.json
Owns: dob, age, state, zip, filingStatus, grossAnnualIncome, unemployment, lastPay, cashSavings, investments, employmentStatus, employerMatch, capturingFullMatch, hasDebt, contributionPercent, highestDeductible, dependents
Reads from other owners: totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses), debtBalance (debt-payoff), debtRate (debt-payoff), paySurvives (income)
Latest decisions:
  - D-259 — How many weeks the state gives, and the date they run out
  - D-249 — Boxes side by side line up, and the check that says so looks everywhere
  - D-166 — The other five questions, folded
  - D-159 — Two boxes buy a number, and the other seven wait
  - D-146 — The responsive audit, kept
Full context: node tools/context/pack.js start
