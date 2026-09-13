---
paths:
  - "rooms/values.html"
  - "engines/values.js"
  - "engines/fulfillment.js"
  - "engines/giving.js"
---
# What Matters (`values`)
File: rooms/values.html · 1675 lines
Engines: projection, tier0, cashflow, values, fulfillment, rerank, foo, fire, statement, benchmarks, ratios, hourly, giving
Reference data: common_costs.json, confidence_weights.json, expense_categories.json, fire_variants.json, foo_rules.json, giving_conventions.json, +2 more
Owns: givingPct, givingTarget, rerankCut
Reads from other owners: grossAnnualIncome (start), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-243 — What Matters, four readings of one expense log
Full context: node tools/context/pack.js values
