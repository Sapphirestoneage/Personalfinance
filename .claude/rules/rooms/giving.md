---
paths:
  - "rooms/giving.html"
  - "engines/giving.js"
---
# Giving (`giving`)
File: rooms/giving.html · 259 lines
Engines: projection, tier0, foo, cashflow, fire, statement, benchmarks, ratios, hourly, giving
Reference data: confidence_weights.json, expense_categories.json, fire_variants.json, foo_rules.json, giving_conventions.json, ratio_benchmarks.json, +1 more
Owns: givingPct, givingTarget
Reads from other owners: grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-213 — The last day worked, and two branches that stop the wrong questions
  - D-107 — Giving: a share of income, in dollars, months of FI and hours
  - D-098 — The first six tranche rooms: what each owns, before it is built
  - D-094 — One pager in, one pager out: the core
Full context: node tools/context/pack.js giving
