---
paths:
  - "rooms/career-move.html"
  - "engines/careermove.js"
  - "engines/offers.js"
  - "engines/sidehustle.js"
  - "engines/credential.js"
  - "engines/degree.js"
  - "engines/microretirement.js"
---
# Work (`career-move`)
File: rooms/career-move.html · 1999 lines
Engines: projection, tier0, hourly, careermove, offers, selfemployed, sidehustle, credential, degree, countdown, microretirement
Reference data: blocks/sabbatical.json, career_momentum.json, cobra_aca_2024.json, effective_tax_rates_2026.json, federal_brackets_2026.json, fire_variants.json, +6 more
Owns: offerGross, offerHours, offerCommute, offerCosts, offerSignOn
Reads from other owners: filingStatus (start), grossAnnualIncome (start), employmentStatus (start), employerMatch (start), marginalRate (statement), healthMonthly (protection), retireAge (fire), monthlyExpenses (expenses)
Latest decisions:
  - D-237 — Expenses: the month, and what repeats in it
Full context: node tools/context/pack.js career-move
