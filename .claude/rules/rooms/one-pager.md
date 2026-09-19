---
paths:
  - "rooms/one-pager.html"
  - "engines/sincelast.js"
  - "engines/wrapped.js"
  - "engines/onepager.js"
---
# The Card (`one-pager`)
File: rooms/one-pager.html · 449 lines
Engines: projection, tier0, tax, income, ledger, debt, selfemployed, hourly, sincelast, wrapped, cashflow, ratios, trap, onepager
Reference data: confidence_weights.json, debt_rules.json, early_access_rules_2026.json, effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, +9 more
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), capturingFullMatch (start), totalDebt (debt-payoff), otherAssets (ledger), netWorth (statement), retireAge (fire), +1 more
Latest decisions:
  - D-303 — The screens a person actually meets: what floats, what toggles, what a Save gives you, and an intake that asks one family at a time
  - D-264 — The Card: three things to hand over
  - D-219 — K2, K5, K8, K9, K10: the One-Pager, the break, the offers, the degree, the car
Full context: node tools/context/pack.js one-pager
