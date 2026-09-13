---
paths:
  - "rooms/financial-snapshot.html"
  - "engines/draftt.js"
  - "engines/housing.js"
  - "engines/health.js"
  - "engines/rankguess.js"
---
# The Scorecard (`financial-snapshot`)
File: rooms/financial-snapshot.html · 2589 lines
Engines: projection, tier0, foo, cashflow, benchmarks, swan, draftt, hourly, selfemployed, tax, income, ledger, taxroom, fire, housing, quickmath, statement, ratios, health, rankguess
Reference data: bands.json, car_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +11 more
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), employerMatch (start), capturingFullMatch (start), rentMonthly (expenses), downPct (housing), totalDebt (debt-payoff), +4 more
Latest decisions:
  - D-233 — The Scorecard: six readings, one measuring stick, simplest first
  - D-036 — Confidence as a field, and the Snapshot bug that hid behind a notice
Full context: node tools/context/pack.js financial-snapshot
