---
paths:
  - "rooms/housing.html"
---
# Housing Decision (`housing`)
File: rooms/housing.html · 332 lines
Engines: projection, tier0, income, selfemployed, ledger, foo, cashflow, fire, statement, benchmarks, ratios, housing
Reference data: confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, foo_rules.json, housing_conventions.json, +8 more
Owns: rentAlternative, homePrice, downPct, mortgageRate
Reads from other owners: grossAnnualIncome (start), cashSavings (start), rentMonthly (expenses), monthlyExpenses (expenses)
Latest decisions:
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-111 — Housing Decision: own against rent, this place, this rate
Full context: node tools/context/pack.js housing
