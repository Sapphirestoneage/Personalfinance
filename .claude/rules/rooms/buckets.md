---
paths:
  - "rooms/buckets.html"
  - "engines/buckets.js"
---
# Time Buckets (`buckets`)
File: rooms/buckets.html · 263 lines
Engines: projection, tier0, cashflow, ratios, hourly, buckets
Reference data: bucket_ideas.json, confidence_weights.json, expense_categories.json, ratio_benchmarks.json, ratio_explainers.json
Owns: bucketsPlanned
Reads from other owners: grossAnnualIncome (start), retireAge (fire), monthlyExpenses (expenses)
Latest decisions:
  - D-116 — Time Buckets: decades, priced
Full context: node tools/context/pack.js buckets
