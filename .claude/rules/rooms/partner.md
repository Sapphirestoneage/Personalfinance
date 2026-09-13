---
paths:
  - "rooms/partner.html"
  - "engines/partner.js"
  - "engines/kids.js"
---
# Family (`partner`)
File: rooms/partner.html · 660 lines
Engines: projection, tier0, foo, cashflow, fire, statement, benchmarks, ratios, partner, kids
Reference data: child_cost.json, childcare_by_state.json, confidence_weights.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +4 more
Owns: partnerName, partnerDob, splitMode, sharedMonthly, tuitionTarget, tuitionSaved, tuitionMonthly
Reads from other owners: filingStatus (start), grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-237 — Expenses: the month, and what repeats in it
  - D-216 — J7, J8: two views of Partner, Roth conversions before 65
  - D-109 — Partner: the shared month split three ways
  - D-099 — The second six: Career Move, Partner, Kids and Tuition, Housing Decision, Big Purchase, Variable Income
  - D-094 — One pager in, one pager out: the core
Full context: node tools/context/pack.js partner
