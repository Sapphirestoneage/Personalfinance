---
paths:
  - "rooms/ledger.html"
  - "engines/variance.js"
---
# The Ledger (`ledger`)
File: rooms/ledger.html · 316 lines · utility room
Engines: projection, tier0, swan, variance, rerank, tax
Reference data: effective_tax_rates_2026.json, ledger-rows.json, liquidity_benchmarks.json, spheres.json, staleness.json
Owns: nothing
Reads from other owners: netWorth (statement)
Latest decisions:
  - D-186 — The simplification pass, first cut: fewer doors, one next, quieter rooms
  - D-185 — The Ledger room, 18.4 and 18.5: the target, and one line per row
  - D-183 — The Ledger, 18.2: every number the app can hold is one row, of one of three kinds
Full context: node tools/context/pack.js ledger
