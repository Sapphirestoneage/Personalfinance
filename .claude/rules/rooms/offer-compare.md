---
paths:
  - "rooms/offer-compare.html"
  - "engines/offers.js"
---
# Offer Compare (`offer-compare`)
File: rooms/offer-compare.html · 194 lines
Engines: projection, tier0, offers
Reference data: effective_tax_rates_2026.json, federal_brackets_2026.json, fire_variants.json, return_bands.json, state_brackets_2026.json
Owns: nothing
Reads from other owners: grossAnnualIncome (start), employmentStatus (start), employerMatch (start), healthMonthly (protection)
Latest decisions:
  - D-219 — K2, K5, K8, K9, K10: the One-Pager, the break, the offers, the degree, the car
Full context: node tools/context/pack.js offer-compare
