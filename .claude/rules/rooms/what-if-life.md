---
paths:
  - "rooms/what-if-life.html"
  - "engines/ss.js"
  - "engines/adventure.js"
---
# What If (`what-if-life`)
File: rooms/what-if-life.html · 1253 lines
Engines: projection, tier0, fire, cashflow, statement, rerank, hourly, selfemployed, tax, debt, quickmath, vpw, ss, events, foo, adventure
Reference data: adventure_paths.json, car_costs.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +9 more
Owns: nothing
Reads from other owners: grossAnnualIncome (start), cashSavings (start), contributionPercent (start), totalDebt (debt-payoff), netWorth (statement), retireAge (fire), monthlyExpenses (expenses)
Latest decisions:
  - D-266 — What If: two scenario rooms are each other, not two block types
  - D-146 — The responsive audit, kept
  - D-087 — One life event, three ways: the events engine, the What If room, and the first template
Full context: node tools/context/pack.js what-if-life
