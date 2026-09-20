---
paths:
  - "rooms/left-behind.html"
---
# Left Behind (`left-behind`)
File: rooms/left-behind.html · 756 lines
Engines: projection, tier0, fire, selfemployed, tax, income, ledger, cashflow, taxroom, hourly
Reference data: access_rules.json, effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, fire_variants.json, rollover_options.json, +3 more
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), marginalRate (ledger), retireAge (fire)
Latest decisions:
  - D-316 — A plan at a former employer is an account type, and Left Behind reads it
  - D-313 — The Statement is four sections; the facts it asked for are the Ledger's
  - D-150 — The Account You Left Behind: four futures, one trap, one sum
Full context: node tools/context/pack.js left-behind
