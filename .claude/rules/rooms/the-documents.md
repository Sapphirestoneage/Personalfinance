---
paths:
  - "rooms/the-documents.html"
  - "engines/gap.js"
  - "engines/statements.js"
---
# The Documents (`the-documents`)
File: rooms/the-documents.html · 499 lines
Engines: projection, tier0, fire, selfemployed, tax, income, ledger, cashflow, quickmath, presets, budget, debt, gap, statements
Reference data: car_costs.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, savings_presets.json, +3 more
Owns: nothing
Reads from other owners: grossAnnualIncome (start), cashSavings (start), employerMatch (start), contributionPercent (start), marginalRate (ledger), ledgerIncome (income), totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff), +7 more
Latest decisions:
  - D-313 — The Statement is four sections; the facts it asked for are the Ledger's
Full context: node tools/context/pack.js the-documents
