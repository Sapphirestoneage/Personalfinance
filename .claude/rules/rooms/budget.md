---
paths:
  - "rooms/budget.html"
  - "engines/presets.js"
  - "engines/variance.js"
  - "engines/history.js"
---
# The Close (`budget`)
File: rooms/budget.html · 977 lines
Engines: projection, tier0, income, selfemployed, ledger, cashflow, quickmath, presets, budget, variance, hourly, foo, fire, statement, benchmarks, ratios, events, skills, history
Reference data: budget_templates.json, car_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +8 more
Owns: monthsClosed, historyCompareTo
Reads from other owners: cashSavings (start), totalDebt (debt-payoff), netWorth (statement), monthlyExpenses (expenses)
Latest decisions:
  - D-237 — Expenses: the month, and what repeats in it
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-129 — The ledger, revised: four ways to be taxed, three things an expense can produce, a budget of cards with presets, N/A and the what-if
  - D-128 — The ledger: income entries, the expense log, the reflected budget, the month closed
Full context: node tools/context/pack.js budget
