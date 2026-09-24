---
paths:
  - "rooms/statement.html"
---
# The Statement (`statement`)
File: rooms/statement.html · 485 lines
Engines: projection, tier0, fire, selfemployed, tax, statement, income, ledger, cashflow, quickmath, presets, budget, hourly, foo, coast, opening, benchmarks
Reference data: access_rules.json, car_costs.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +6 more
Owns: confidenceWeightedNetWorth, netWorth
Reads from other owners: takeHomeMonthly (ledger), cashSavings (start), totalDebt (debt-payoff), otherAssets (ledger), monthlyExpenses (expenses)
Latest decisions:
  - D-313 — The Statement is four sections; the facts it asked for are the Ledger's
  - D-290 — The Statement takes the account you left behind
  - D-278 — The Statement: what you own, where it lands, the documents
  - D-261 — One holding, more than one account
  - D-251 — Where each asset sits: the institution and the account type
Full context: node tools/context/pack.js statement
