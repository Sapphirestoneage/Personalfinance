---
paths:
  - "rooms/cash-flow.html"
  - "engines/calendar.js"
---
# Cash Flow (`cash-flow`)
File: rooms/cash-flow.html · 592 lines
Engines: projection, tier0, cashflow, income, selfemployed, ledger, budget, calendar
Reference data: effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), rentMonthly (expenses), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-260 — A room that throws while rendering says so, instead of blaming data/
  - D-253 — What hits your account, and when: the month as turns, in Cash Flow and the Calendar
  - D-192 — Expenses is what a month costs; Cash Flow is when the money moves
  - D-181 — Section 15: the ten foundation shapes, one commit a shape
  - D-163 — The dead spot is the door
Full context: node tools/context/pack.js cash-flow
