---
paths:
  - "rooms/fire.html"
  - "engines/journey.js"
---
# FIRE Number (`fire`)
File: rooms/fire.html · 565 lines
Engines: projection, tier0, income, ledger, fire, foo, journey, selfemployed, tax, hourly
Reference data: effective_tax_rates_2026.json, fire_variants.json, foo_rules.json, irs_limits_2026.json, journey_routes.json, se_tax_2026.json
Owns: retireAge, coastAge
Reads from other owners: filingStatus (start), grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-240 — The FI date carries its range and says what it assumes
  - D-235 — The map: one road, you are here, and the routes from here
  - D-228 — You cannot size the mountain until you know how you come down it
  - D-162 — The ledger, everywhere, without building a second one
  - D-161 — The way back
Full context: node tools/context/pack.js fire
