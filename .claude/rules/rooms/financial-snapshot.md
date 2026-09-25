---
paths:
  - "rooms/financial-snapshot.html"
  - "engines/draftt.js"
  - "engines/housing.js"
  - "engines/health.js"
  - "engines/rankguess.js"
---
# The Scorecard (`financial-snapshot`)
File: rooms/financial-snapshot.html · 2684 lines
Engines: projection, tier0, foo, cashflow, benchmarks, swan, draftt, hourly, selfemployed, tax, income, ledger, taxroom, fire, housing, quickmath, statement, ratios, health, rankguess
Reference data: bands.json, car_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +12 more
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), takeHomeMonthly (ledger), cashSavings (start), employerMatch (start), capturingFullMatch (start), rentMonthly (expenses), downPct (housing), +5 more
Latest decisions:
  - D-332 — The radar is on the Scorecard too, drawn by one function
  - D-245 — Fewer words on the page, and every score says what is good, why, and what to do
  - D-241 — Nothing counts a person's failures before they have typed anything
  - D-238 — A page may not write to an id it does not carry
  - D-233 — The Scorecard: six readings, one measuring stick, simplest first
Full context: node tools/context/pack.js financial-snapshot
