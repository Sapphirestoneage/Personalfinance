---
paths:
  - "rooms/housing.html"
  - "engines/housing.js"
  - "engines/downpayment.js"
  - "engines/ownership.js"
---
# Housing (`housing`)
File: rooms/housing.html · 903 lines
Engines: projection, tier0, income, selfemployed, ledger, foo, cashflow, fire, statement, benchmarks, ratios, housing, debt, countdown, downpayment, ownership
Reference data: blocks/home.json, confidence_weights.json, debt_rules.json, down_payment.json, effective_tax_rates_2026.json, expense_categories.json, +12 more
Owns: rentAlternative, homePrice, downPct, mortgageRate
Reads from other owners: grossAnnualIncome (start), cashSavings (start), marginalRate (ledger), rentMonthly (expenses), monthlyExpenses (expenses)
Latest decisions:
  - D-280 — Housing: rent or buy, the deposit, the deal
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-111 — Housing Decision: own against rent, this place, this rate
Full context: node tools/context/pack.js housing
