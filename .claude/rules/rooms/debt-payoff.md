---
paths:
  - "rooms/debt-payoff.html"
---
# Debt Payoff (`debt-payoff`)
File: rooms/debt-payoff.html · 1943 lines
Engines: projection, debt
Reference data: debt_rules.json, effective_tax_rates_2026.json, foo_rules.json, onepager_defaults.json, return_bands.json, student_loan_conventions.json
Owns: totalDebt, monthlyDebtPayments, debtBalance, debtRate, debtMinPayment
Reads from other owners: filingStatus (start), grossAnnualIncome (start), marginalRate (accounts)
Latest decisions:
  - D-251 — A number that does not say how old it is, or whose it is, is half a number
  - D-236 — Debt Payoff: where the payment goes, and what each fall frees
  - D-191 — Debt Payoff: a stop line, and the payment says what it is built from
  - D-190 — Debt Payoff: the extra is always a number, estimated then realized
  - D-189 — Debt Payoff: where the interest goes, a month
Full context: node tools/context/pack.js debt-payoff
