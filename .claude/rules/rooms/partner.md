---
paths:
  - "rooms/partner.html"
  - "engines/partner.js"
---
# Partner (`partner`)
File: rooms/partner.html · 284 lines
Engines: projection, tier0, foo, cashflow, fire, statement, benchmarks, ratios, partner
Reference data: confidence_weights.json, expense_categories.json, fire_variants.json, foo_rules.json, partner_conventions.json, ratio_benchmarks.json, +2 more
Owns: partnerName, partnerDob, splitMode, sharedMonthly
Reads from other owners: filingStatus (start), grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-181 — Section 15: the ten foundation shapes, one commit a shape
  - D-179 — The master build prompt: the phase order against what already exists, and Phase A's removal list
  - D-109 — Partner: the shared month split three ways
  - D-099 — The second six: Career Move, Partner, Kids and Tuition, Housing Decision, Big Purchase, Variable Income
  - D-094 — One pager in, one pager out: the core
Full context: node tools/context/pack.js partner
