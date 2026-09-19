---
paths:
  - "rooms/fire.html"
  - "engines/journey.js"
  - "engines/fulfillment.js"
  - "engines/enough.js"
  - "engines/coast.js"
  - "engines/race.js"
---
# The Number (`fire`)
File: rooms/fire.html · 1465 lines
Engines: projection, tier0, income, ledger, fire, foo, journey, selfemployed, tax, hourly, cashflow, fulfillment, enough, coast, countdown, race
Reference data: effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, fire_variants.json, foo_rules.json, irs_limits_2026.json, +3 more
Owns: enoughMonthly, retireAge, coastAge
Reads from other owners: filingStatus (start), grossAnnualIncome (start), netWorth (statement), monthlyExpenses (expenses)
Latest decisions:
  - D-285 — The Number, five readings of one multiplication
  - D-240 — The FI date carries its range and says what it assumes
  - D-235 — The map: one road, you are here, and the routes from here
  - D-228 — You cannot size the mountain until you know how you come down it
  - D-161 — The way back
Full context: node tools/context/pack.js fire
