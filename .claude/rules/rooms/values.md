---
paths:
  - "rooms/values.html"
  - "engines/values.js"
  - "engines/fulfillment.js"
  - "engines/giving.js"
---
# What Matters (`values`)
File: rooms/values.html · 1679 lines
Engines: projection, tier0, income, selfemployed, ledger, cashflow, values, fulfillment, rerank, foo, fire, statement, benchmarks, ratios, hourly, giving
Reference data: common_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, foo_rules.json, +5 more
Owns: givingPct, givingTarget, rerankCut
Reads from other owners: grossAnnualIncome (start), takeHomeMonthly (ledger), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-273 — What Matters, four readings of one expense log
Full context: node tools/context/pack.js values
