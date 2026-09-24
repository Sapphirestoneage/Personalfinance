---
paths:
  - "rooms/which-account.html"
  - "engines/accounts.js"
---
# Which Account (`which-account`)
File: rooms/which-account.html · 422 lines
Engines: projection, tier0, selfemployed, tax, income, ledger, cashflow, taxroom, accounts, hourly, coast, opening
Reference data: effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, irs_limits_2026.json, levers.json, opening.json, +3 more
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), employmentStatus (start), contributionPercent (start), rothContributed (ledger), hsaContributed (ledger), onHdhp (ledger), hsaFamilyPlan (ledger), +2 more
Latest decisions:
  - D-313 — The Statement is four sections; the facts it asked for are the Ledger's
Full context: node tools/context/pack.js which-account
