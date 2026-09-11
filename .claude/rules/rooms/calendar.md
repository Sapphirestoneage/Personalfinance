---
paths:
  - "rooms/calendar.html"
  - "engines/calendar.js"
---
# Money Calendar & Pay-Later (`calendar`)
File: rooms/calendar.html · 267 lines
Engines: projection, tier0, hourly, income, selfemployed, ledger, cashflow, calendar
Reference data: calendar_conventions.json, expense_categories.json, tax_brackets.json
Owns: payCadence, nextPayday, billsMonthly, payLaterDue
Reads from other owners: grossAnnualIncome (start), cashSavings (start), rentMonthly (expenses), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-121 — Money Calendar & Pay-Later: the low point
Full context: node tools/context/pack.js calendar
