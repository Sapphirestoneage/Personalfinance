---
paths:
  - "rooms/career-move.html"
  - "engines/careermove.js"
---
# Career Move (`career-move`)
File: rooms/career-move.html · 292 lines
Engines: projection, tier0, hourly, careermove
Reference data: effective_tax_rates_2026.json, levers.json
Owns: offerGross, offerHours, offerCommute, offerCosts, offerSignOn
Reads from other owners: filingStatus (start), grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-108 — Career Move: an offer against the job you have, an hour at a time
Full context: node tools/context/pack.js career-move
