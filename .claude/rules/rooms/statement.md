---
paths:
  - "rooms/statement.html"
  - "engines/presets.js"
---
# The Statement (`statement`)
File: rooms/statement.html · 750 lines
Engines: projection, tier0, fire, selfemployed, tax, statement, income, ledger, cashflow, quickmath, presets, budget
Reference data: access_rules.json, car_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, +4 more
Owns: otherAssets, confidenceWeightedNetWorth, netWorth, assetValue, assetCharacter, assetTier, assetCostBasis, assetInstitution, assetAccountType
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), marginalRate (accounts), highestDeductible (start), oopMax (runway), totalDebt (debt-payoff), futureIncome (timeline), +1 more
Latest decisions:
  - D-251 — Where each asset sits: the institution and the account type
  - D-249 — Boxes side by side line up, and the check that says so looks everywhere
  - D-157 — The menu you could read the page through
  - D-152 — What Comes Next: a life as periods, and the months they add up to
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
Full context: node tools/context/pack.js statement
