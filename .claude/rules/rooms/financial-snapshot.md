---
paths:
  - "rooms/financial-snapshot.html"
  - "engines/draftt.js"
  - "engines/housing.js"
---
# Financial Snapshot (`financial-snapshot`)
File: rooms/financial-snapshot.html · 864 lines
Engines: projection, tier0, foo, cashflow, benchmarks, swan, draftt, hourly, selfemployed, tax, income, ledger, taxroom, fire, housing, quickmath
Reference data: aca.json, bands.json, car_costs.json, expense_categories.json, fire_variants.json, foo_rules.json, +6 more
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), employerMatch (start), capturingFullMatch (start), rentMonthly (expenses), downPct (housing), totalDebt (debt-payoff), +4 more
Latest decisions:
  - D-227 — The last three red suites, and two of them were the tests
  - D-212 — The gate is load-bearing, and gate.js stays on every page
  - D-056 — Time exists: every owned field knows when it was last confirmed, and snapshots are read back
  - D-036 — Confidence as a field, and the Snapshot bug that hid behind a notice
  - D-008 — `capturingFullMatch`: an input Tier 0 needs but does not list
Full context: node tools/context/pack.js financial-snapshot
