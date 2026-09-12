---
paths:
  - "rooms/debt-payoff.html"
---
# Debt Payoff (`debt-payoff`)
File: rooms/debt-payoff.html · 1778 lines
Engines: projection, debt
Reference data: debt_rules.json, effective_tax_rates_2026.json, foo_rules.json, import_keywords.json, onepager_defaults.json
Owns: totalDebt, monthlyDebtPayments, debtBalance, debtRate, debtMinPayment
Reads from other owners: grossAnnualIncome (start)
Latest decisions:
  - D-191 — Debt Payoff: a stop line, and the payment says what it is built from
  - D-190 — Debt Payoff: the extra is always a number, estimated then realized
  - D-189 — Debt Payoff: where the interest goes, a month
  - D-188 — Debt Payoff: three finish lines, Avalanche ranks by the rate a debt will carry, the extra is worked out
  - D-187 — Debt Payoff, redone as one line per debt, the number first, the rest behind carets
Full context: node tools/context/pack.js debt-payoff
