---
paths:
  - "rooms/cash-flow.html"
  - "engines/calendar.js"
---
# The Month (`cash-flow`)
File: rooms/cash-flow.html · 844 lines
Engines: projection, tier0, cashflow, income, selfemployed, ledger, budget, hourly, calendar
Reference data: calendar_conventions.json, effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json
Owns: payCadence, nextPayday, billsMonthly, payLaterDue
Reads from other owners: grossAnnualIncome (start), takeHomeMonthly (ledger), cashSavings (start), rentMonthly (expenses), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-275 — The Month: what moved, and the dates
  - D-260 — A room that throws while rendering says so, instead of blaming data/
  - D-253 — What hits your account, and when: the month as turns, in Cash Flow and the Calendar
  - D-192 — Expenses is what a month costs; Cash Flow is when the money moves
  - D-163 — The dead spot is the door
Full context: node tools/context/pack.js cash-flow
