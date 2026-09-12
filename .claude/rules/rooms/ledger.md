---
paths:
  - "rooms/ledger.html"
  - "engines/variance.js"
  - "engines/subscriptions.js"
  - "engines/notknowing.js"
---
# The Ledger (`ledger`)
File: rooms/ledger.html · 514 lines · utility room
Engines: projection, tier0, swan, variance, rerank, tax, statement, debt, hourly, subscriptions, sincelast, selfemployed, reachable, notknowing
Reference data: access_rules.json, confidence_weights.json, debt_rules.json, effective_tax_rates_2026.json, ledger-rows.json, liquidity_benchmarks.json, +4 more
Owns: nothing
Reads from other owners: grossAnnualIncome (start), cashSavings (start), netWorth (statement), foodMonthly (expenses), accommodationMonthly (expenses), transportationMonthly (expenses), wantsMonthly (expenses), therapyMonthly (expenses), +2 more
Latest decisions:
  - D-222 — The screens a person actually meets: what floats, what toggles, what a Save gives you, and an intake that asks one family at a time
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-186 — The simplification pass, first cut: fewer doors, one next, quieter rooms
  - D-185 — The Ledger room, 18.4 and 18.5: the target, and one line per row
  - D-183 — The Ledger, 18.2: every number the app can hold is one row, of one of three kinds
Full context: node tools/context/pack.js ledger
