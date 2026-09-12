---
paths:
  - "rooms/budget.html"
  - "engines/presets.js"
---
# Budget (`budget`)
File: rooms/budget.html · 485 lines
Engines: projection, tier0, income, selfemployed, ledger, cashflow, quickmath, presets, budget
Reference data: budget_templates.json, car_costs.json, effective_tax_rates_2026.json, expense_categories.json, irs_limits_2026.json, savings_presets.json, +1 more
Owns: monthsClosed
Reads from other owners: cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-129 — The ledger, revised: four ways to be taxed, three things an expense can produce, a budget of cards with presets, N/A and the what-if
  - D-128 — The ledger: income entries, the expense log, the reflected budget, the month closed
Full context: node tools/context/pack.js budget
