---
paths:
  - "rooms/debt-payoff.html"
  - "engines/studentloans.js"
---
# Debt (`debt-payoff`)
File: rooms/debt-payoff.html · 2907 lines
Engines: projection, debt, tier0, income, selfemployed, ledger, studentloans, hourly, foo, cashflow, fire, statement, benchmarks, ratios
Reference data: confidence_weights.json, credit_factors.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +8 more
Owns: loanPlan, loanExtra, idrShare, forgivenessYears, totalDebt, monthlyDebtPayments, debtBalance, debtRate, debtMinPayment
Reads from other owners: filingStatus (start), grossAnnualIncome (start), employmentStatus (start), hasDebt (start), marginalRate (ledger)
Latest decisions:
  - D-320 — A card's annual fee and the day it posts; a dealt walk step folds to a line
  - D-279 — Debt: the order, the loans, the file
  - D-252 — Debt Payoff: the order is a preference, and the plan says when it is in effect
  - D-236 — Debt Payoff: where the payment goes, and what each fall frees
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
Full context: node tools/context/pack.js debt-payoff
