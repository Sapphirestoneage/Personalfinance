---
paths:
  - "rooms/debt-payoff.html"
  - "engines/studentloans.js"
---
# Debt (`debt-payoff`)
File: rooms/debt-payoff.html · 2644 lines
Engines: projection, debt, tier0, studentloans, hourly, foo, cashflow, fire, statement, benchmarks, ratios
Reference data: confidence_weights.json, credit_factors.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +5 more
Owns: loanPlan, loanExtra, idrShare, forgivenessYears, totalDebt, monthlyDebtPayments, debtBalance, debtRate, debtMinPayment
Reads from other owners: grossAnnualIncome (start), employmentStatus (start), hasDebt (start)
Latest decisions:
  - D-237 — Expenses: the month, and what repeats in it
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-191 — Debt Payoff: a stop line, and the payment says what it is built from
  - D-190 — Debt Payoff: the extra is always a number, estimated then realized
  - D-189 — Debt Payoff: where the interest goes, a month
Full context: node tools/context/pack.js debt-payoff
