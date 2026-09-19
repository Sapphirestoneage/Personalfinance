---
paths:
  - "rooms/estate.html"
  - "engines/estate.js"
---
# Estate Basics (`estate`)
File: rooms/estate.html · 221 lines
Engines: projection, tier0, income, selfemployed, ledger, hourly, estate
Reference data: effective_tax_rates_2026.json, estate_basics.json, se_tax_2026.json
Owns: beneficiariesSet, willExists, poaExists
Reads from other owners: cashSavings (start), otherAssets (statement)
Latest decisions:
  - D-106 — Estate Basics: three facts, and what would pass by the state's rules
  - D-098 — The first six tranche rooms: what each owns, before it is built
  - D-094 — One pager in, one pager out: the core
Full context: node tools/context/pack.js estate
