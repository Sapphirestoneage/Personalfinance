---
paths:
  - "rooms/protection.html"
  - "engines/protection.js"
  - "engines/estate.js"
---
# Protection (`protection`)
File: rooms/protection.html · 471 lines
Engines: projection, tier0, income, selfemployed, ledger, protection, hourly, estate
Reference data: effective_tax_rates_2026.json, estate_basics.json, protection_conventions.json, se_tax_2026.json
Owns: healthCover, healthMonthly, beneficiariesSet, willExists, poaExists
Reads from other owners: grossAnnualIncome (start), cashSavings (start), highestDeductible (start), oopMax (runway), termLife (runway), disabilityMonthly (runway), otherAssets (ledger), monthlyExpenses (expenses)
Latest decisions:
  - D-266 — Protection: cover, and where it goes
  - D-103 — Protection: each need against what is held
  - D-098 — The first six tranche rooms: what each owns, before it is built
  - D-094 — One pager in, one pager out: the core
  - D-054 — A back and a next in every room, at the top
Full context: node tools/context/pack.js protection
