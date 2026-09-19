---
paths:
  - "rooms/calendar.html"
  - "engines/calendar.js"
---
# The Calendar (`calendar`)
File: rooms/calendar.html · 169 lines
Engines: projection, tier0, income, selfemployed, ledger, cashflow, calendar
Reference data: effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json
Owns: nothing
Reads from other owners: grossAnnualIncome (start), cashSavings (start), rentMonthly (expenses), monthlyExpenses (expenses)
Latest decisions:
  - D-308 — The Calendar comes back, with your own dates on it
  - D-275 — The Month: what moved, and the dates
  - D-253 — What hits your account, and when: the month as turns, in Cash Flow and the Calendar
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
Full context: node tools/context/pack.js calendar
