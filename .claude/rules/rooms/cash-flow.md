---
paths:
  - "rooms/cash-flow.html"
  - "engines/calendar.js"
---
# The Month (`cash-flow`)
File: rooms/cash-flow.html · 896 lines
Engines: projection, tier0, cashflow, income, selfemployed, ledger, budget, hourly, calendar
Reference data: calendar_conventions.json, effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json
Owns: payCadence, nextPayday, billsMonthly, payLaterDue
Reads from other owners: grossAnnualIncome (start), cashSavings (start), rentMonthly (expenses), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-237 — Expenses: the month, and what repeats in it
  - D-192 — Expenses is what a month costs; Cash Flow is when the money moves
  - D-163 — The dead spot is the door
  - D-159 — Two boxes buy a number, and the other seven wait
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
Full context: node tools/context/pack.js cash-flow
