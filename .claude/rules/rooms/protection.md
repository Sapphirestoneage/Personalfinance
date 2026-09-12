---
paths:
  - "rooms/protection.html"
  - "engines/protection.js"
---
# Protection (`protection`)
File: rooms/protection.html · 267 lines
Engines: projection, tier0, protection
Reference data: protection_conventions.json
Owns: healthCover, healthMonthly
Reads from other owners: grossAnnualIncome (start), cashSavings (start), highestDeductible (start), oopMax (sleep-at-night), termLife (sleep-at-night), disabilityMonthly (sleep-at-night), monthlyExpenses (expenses)
Latest decisions:
  - D-103 — Protection: each need against what is held
  - D-098 — The first six tranche rooms: what each owns, before it is built
  - D-094 — One pager in, one pager out: the core
  - D-054 — A back and a next in every room, at the top
Full context: node tools/context/pack.js protection
