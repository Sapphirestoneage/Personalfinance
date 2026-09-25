---
paths:
  - "rooms/start.html"
---
# Start Here (`start`)
File: rooms/start.html · 1189 lines
Engines: income
Reference data: match_defaults.json, onepager_defaults.json, retirement_milestones.json, states.json, ui_benefits.json
Owns: dob, age, state, zip, filingStatus, grossAnnualIncome, unemployment, lastPay, cashSavings, investments, employmentStatus, employerMatch, capturingFullMatch, hasDebt, contributionPercent, highestDeductible, dependents
Reads from other owners: totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses), debtBalance (debt-payoff), paySurvives (income)
Latest decisions:
  - D-323 — A link that names a field opens to the field, not to the room
  - D-262 — What you owe, by kind, and no rate asked on the way in
  - D-259 — How many weeks the state gives, and the date they run out
  - D-249 — Boxes side by side line up, and the check that says so looks everywhere
  - D-166 — The other five questions, folded
Full context: node tools/context/pack.js start
