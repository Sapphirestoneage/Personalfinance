---
paths:
  - "rooms/ledger.html"
  - "engines/variance.js"
  - "engines/reachable.js"
  - "engines/notknowing.js"
---
# The Ledger (`ledger`)
File: rooms/ledger.html · 495 lines · utility room
Engines: projection, tier0, swan, variance, rerank, tax, statement, debt, hourly, sincelast, selfemployed, reachable, notknowing
Reference data: access_rules.json, confidence_weights.json, debt_rules.json, effective_tax_rates_2026.json, ledger-rows.json, liquidity_benchmarks.json, +4 more
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), marginalRate (accounts), netWorth (statement), foodMonthly (expenses), accommodationMonthly (expenses), transportationMonthly (expenses), +4 more
Latest decisions:
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-186 — The simplification pass, first cut: fewer doors, one next, quieter rooms
  - D-185 — The Ledger room, 18.4 and 18.5: the target, and one line per row
  - D-183 — The Ledger, 18.2: every number the app can hold is one row, of one of three kinds
Full context: node tools/context/pack.js ledger
