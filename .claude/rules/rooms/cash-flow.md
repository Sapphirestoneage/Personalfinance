---
paths:
  - "rooms/cash-flow.html"
  - "engines/calendar.js"
---
# The Month (`cash-flow`)
File: rooms/cash-flow.html · 971 lines
Engines: projection, tier0, cashflow, income, selfemployed, ledger, budget, subscriptions, merchants, hourly, calendar
Reference data: calendar_conventions.json, effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json
Owns: payCadence, nextPayday, billsMonthly, payLaterDue
Reads from other owners: grossAnnualIncome (start), takeHomeMonthly (ledger), cashSavings (start), rentMonthly (expenses), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses), foodMonthly (expenses), accommodationMonthly (expenses), +2 more
Latest decisions:
  - D-338 — Where the money went, by place: all of it, and the part you chose
  - D-337 — Where an expense went: the card it was on, and the bonus that spending could reach
  - D-318 — The calendar, the way a phone calendar is used
  - D-275 — The Month: what moved, and the dates
  - D-260 — A room that throws while rendering says so, instead of blaming data/
Full context: node tools/context/pack.js cash-flow
