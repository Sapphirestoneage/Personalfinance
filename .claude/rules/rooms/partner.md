---
paths:
  - "rooms/partner.html"
  - "engines/partner.js"
---
# Partner (`partner`)
File: rooms/partner.html · 383 lines
Engines: projection, tier0, income, selfemployed, ledger, foo, cashflow, fire, statement, benchmarks, ratios, partner
Reference data: confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, foo_rules.json, irs_limits_2026.json, +4 more
Owns: partnerName, partnerDob, splitMode, sharedMonthly
Reads from other owners: filingStatus (start), grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-216 — J7, J8: two views of Partner, Roth conversions before 65
  - D-181 — Section 15: the ten foundation shapes, one commit a shape
  - D-179 — The master build prompt: the phase order against what already exists, and Phase A's removal list
  - D-109 — Partner: the shared month split three ways
  - D-099 — The second six: Career Move, Partner, Kids and Tuition, Housing Decision, Big Purchase, Variable Income
Full context: node tools/context/pack.js partner
