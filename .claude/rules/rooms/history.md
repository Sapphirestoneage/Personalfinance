---
paths:
  - "rooms/history.html"
  - "engines/history.js"
---
# History (`history`)
File: rooms/history.html · 232 lines
Engines: projection, tier0, hourly, foo, cashflow, fire, statement, benchmarks, ratios, events, skills, history
Reference data: confidence_weights.json, expense_categories.json, fire_variants.json, foo_rules.json, ratio_benchmarks.json, ratio_explainers.json, +2 more
Owns: historyCompareTo
Reads from other owners: cashSavings (start), totalDebt (debt-payoff), netWorth (statement)
Latest decisions:
  - D-122 — History: the brief's last step
  - D-101 — The LATER.md rooms: what each owns, before it is built
Full context: node tools/context/pack.js history
