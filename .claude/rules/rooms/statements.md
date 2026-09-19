---
paths:
  - "rooms/statements.html"
  - "engines/statements.js"
---
# Your Statements (`statements`)
File: rooms/statements.html · 388 lines
Engines: projection, tier0, income, selfemployed, ledger, cashflow, statements
Reference data: effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json
Owns: nothing
Reads from other owners: grossAnnualIncome (start), cashSavings (start), employerMatch (start), contributionPercent (start), totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff), otherAssets (statement), netWorth (statement), +1 more
Latest decisions:
  - D-156 — Your Statements: the three documents, and the basis printed on them
Full context: node tools/context/pack.js statements
