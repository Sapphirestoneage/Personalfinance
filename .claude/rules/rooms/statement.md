---
paths:
  - "rooms/statement.html"
  - "engines/presets.js"
  - "engines/accounts.js"
  - "engines/gap.js"
  - "engines/statements.js"
---
# The Statement (`statement`)
File: rooms/statement.html · 2582 lines
Engines: projection, tier0, fire, selfemployed, tax, statement, income, ledger, cashflow, quickmath, presets, budget, accounts, hourly, debt, gap, statements, taxroom
Reference data: access_rules.json, car_costs.json, confidence_weights.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, +9 more
Owns: rothContributed, hsaContributed, marginalRate, allocationStocks, allocationBonds, allocationCash, rebalanceBand, otherAssets, confidenceWeightedNetWorth, netWorth, assetValue, assetCharacter, assetTier, assetCostBasis, assetInstitution, assetAccountType
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), employerMatch (start), contributionPercent (start), highestDeductible (start), oopMax (runway), ledgerIncome (income), +9 more
Latest decisions:
  - D-290 — The Statement takes the account you left behind
  - D-278 — The Statement: what you own, where it lands, the documents
  - D-261 — One holding, more than one account
  - D-251 — Where each asset sits: the institution and the account type
  - D-249 — Boxes side by side line up, and the check that says so looks everywhere
Full context: node tools/context/pack.js statement
