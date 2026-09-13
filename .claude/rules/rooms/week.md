---
paths:
  - "rooms/week.html"
  - "engines/week.js"
  - "engines/buckets.js"
---
# The Life (`week`)
File: rooms/week.html · 522 lines
Engines: projection, tier0, hourly, cashflow, week, ratios, buckets
Reference data: bucket_ideas.json, confidence_weights.json, expense_categories.json, ratio_benchmarks.json, ratio_explainers.json, week_blocks.json
Owns: designedHours, bucketsPlanned
Reads from other owners: grossAnnualIncome (start), retireAge (fire), monthlyExpenses (expenses)
Latest decisions:
  - D-239 — The Life: the week, and the decades
Full context: node tools/context/pack.js week
