---
paths:
  - "rooms/statement.html"
  - "engines/presets.js"
---
# The Statement (`statement`)
File: rooms/statement.html · 777 lines
Engines: projection, tier0, fire, selfemployed, tax, statement, income, ledger, cashflow, quickmath, presets, budget
Reference data: access_rules.json, car_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, +4 more
Owns: otherAssets, confidenceWeightedNetWorth, netWorth, assetValue, assetCharacter, assetTier, assetCostBasis, assetInstitution, assetAccountType
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), marginalRate (accounts), highestDeductible (start), oopMax (runway), totalDebt (debt-payoff), futureIncome (timeline), +1 more
Latest decisions:
  - D-261 — One holding, more than one account
  - D-251 — Where each asset sits: the institution and the account type
  - D-249 — Boxes side by side line up, and the check that says so looks everywhere
  - D-157 — The menu you could read the page through
  - D-152 — What Comes Next: a life as periods, and the months they add up to
Full context: node tools/context/pack.js statement
