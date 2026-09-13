---
paths:
  - "rooms/statement.html"
  - "engines/presets.js"
  - "engines/accounts.js"
  - "engines/statements.js"
---
# The Statement (`statement`)
File: rooms/statement.html · 1732 lines
Engines: projection, tier0, fire, selfemployed, tax, statement, income, ledger, cashflow, quickmath, presets, budget, accounts, hourly, statements
Reference data: car_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, fire_variants.json, +4 more
Owns: rothContributed, hsaContributed, marginalRate, allocationStocks, allocationBonds, allocationCash, rebalanceBand, otherAssets, confidenceWeightedNetWorth, netWorth, assetValue, assetCharacter, assetTier, assetCostBasis
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), employerMatch (start), contributionPercent (start), highestDeductible (start), oopMax (runway), totalDebt (debt-payoff), +3 more
Latest decisions:
  - D-237 — Expenses: the month, and what repeats in it
  - D-157 — The menu you could read the page through
  - D-152 — What Comes Next: a life as periods, and the months they add up to
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-091 — Charts: one module, three shapes, and the Personal Finance Club look
Full context: node tools/context/pack.js statement
