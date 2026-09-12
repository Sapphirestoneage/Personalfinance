---
paths:
  - "rooms/expenses.html"
---
# Expenses (`expenses`)
File: rooms/expenses.html · 1189 lines
Engines: projection, tier0, cashflow, fire, income, selfemployed
Reference data: budget_templates.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, se_tax_2026.json
Owns: rentMonthly, monthlyExpenses, foodMonthly, accommodationMonthly, transportationMonthly, wantsMonthly, therapyMonthly, annualLine
Reads from other owners: filingStatus (start), grossAnnualIncome (start), capturingFullMatch (start), monthlyDebtPayments (debt-payoff)
Latest decisions:
  - D-221 — The dead controls and the links to nowhere
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-199 — Expenses in three steps and one fold
  - D-196 — Expenses: the picture first, then the four numbers, then the lines you name
  - D-192 — Expenses is what a month costs; Cash Flow is when the money moves
Full context: node tools/context/pack.js expenses
