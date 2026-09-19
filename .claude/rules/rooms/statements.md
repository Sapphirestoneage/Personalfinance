---
paths:
  - "rooms/statements.html"
  - "engines/gap.js"
  - "engines/statements.js"
---
# Your Statements (`statements`)
File: rooms/statements.html · 467 lines
Engines: projection, tier0, income, selfemployed, ledger, cashflow, fire, debt, gap, statements
Reference data: debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, se_tax_2026.json, student_loan_conventions.json
Owns: nothing
Reads from other owners: grossAnnualIncome (start), cashSavings (start), employerMatch (start), contributionPercent (start), marginalRate (accounts), ledgerIncome (income), totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff), +7 more
Latest decisions:
  - D-254 — Statements that open, and the FIRE statement
  - D-156 — Your Statements: the three documents, and the basis printed on them
Full context: node tools/context/pack.js statements
