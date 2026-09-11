---
paths:
  - "rooms/what-if-life.html"
  - "engines/ss.js"
---
# What If, Life (`what-if-life`)
File: rooms/what-if-life.html · 551 lines
Engines: projection, tier0, fire, cashflow, statement, rerank, hourly, selfemployed, tax, debt, quickmath, vpw, ss, events
Reference data: car_costs.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, se_tax_2026.json, +1 more
Owns: nothing
Reads from other owners: grossAnnualIncome (start), cashSavings (start), contributionPercent (start), totalDebt (debt-payoff), netWorth (statement), retireAge (fire), monthlyExpenses (expenses)
Latest decisions:
  - D-146 — The responsive audit, kept
  - D-091 — Charts: one module, three shapes, and the Personal Finance Club look
  - D-087 — One life event, three ways: the events engine, the What If room, and the first template
Full context: node tools/context/pack.js what-if-life
