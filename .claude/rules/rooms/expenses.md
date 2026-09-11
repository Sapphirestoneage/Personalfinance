---
paths:
  - "rooms/expenses.html"
---
# Expenses (`expenses`)
File: rooms/expenses.html · 1187 lines
Engines: projection, tier0, cashflow, fire, income, selfemployed
Reference data: budget_templates.json, expense_categories.json, fire_variants.json, tax_brackets.json
Owns: rentMonthly, monthlyExpenses, foodMonthly, accommodationMonthly, transportationMonthly, wantsMonthly, therapyMonthly, annualLine
Reads from other owners: filingStatus (start), grossAnnualIncome (start), capturingFullMatch (start), monthlyDebtPayments (debt-payoff)
Latest decisions:
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-199 — Expenses in three steps and one fold
  - D-196 — Expenses: the picture first, then the four numbers, then the lines you name
  - D-192 — Expenses is what a month costs; Cash Flow is when the money moves
  - D-172 — Expenses are four numbers: FAT, wants, and one optional line
Full context: node tools/context/pack.js expenses
