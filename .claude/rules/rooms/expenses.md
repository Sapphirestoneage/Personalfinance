---
paths:
  - "rooms/expenses.html"
  - "engines/bankcsv.js"
---
# Expenses (`expenses`)
File: rooms/expenses.html · 1733 lines
Engines: projection, tier0, ledger, cashflow, fire, income, selfemployed, tax, hourly, subscriptions, merchants, bankcsv
Reference data: effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, fire_variants.json, import_keywords.json, se_tax_2026.json
Owns: rentMonthly, monthlyExpenses, foodMonthly, accommodationMonthly, transportationMonthly, wantsMonthly, therapyMonthly, annualLine
Reads from other owners: filingStatus (start), grossAnnualIncome (start), capturingFullMatch (start), monthlyDebtPayments (debt-payoff)
Latest decisions:
  - D-338 — Where the money went, by place: all of it, and the part you chose
  - D-337 — Where an expense went: the card it was on, and the bonus that spending could reach
  - D-319 — Every screen says how old its numbers are; the example says so; the front page knows you
  - D-306 — A statement in, every place money went, and the slope of a month
  - D-267 — Expenses: the month, and what repeats in it
Full context: node tools/context/pack.js expenses
