---
paths:
  - "rooms/decumulation.html"
  - "engines/decumulation.js"
---
# Drawing It Down (`decumulation`)
File: rooms/decumulation.html · 273 lines
Engines: projection, tier0, foo, cashflow, fire, statement, benchmarks, ratios, hourly, vpw, decumulation
Reference data: confidence_weights.json, expense_categories.json, fire_variants.json, foo_rules.json, ratio_benchmarks.json, ratio_explainers.json, +1 more
Owns: stockShare, plannedAnnualDraw, socialSecurityAt
Reads from other owners: grossAnnualIncome (start), retireAge (fire), monthlyExpenses (expenses)
Latest decisions:
  - D-228 — You cannot size the mountain until you know how you come down it
  - D-104 — Decumulation: the age the money lasts to
  - D-098 — The first six tranche rooms: what each owns, before it is built
  - D-094 — One pager in, one pager out: the core
Full context: node tools/context/pack.js decumulation
