---
paths:
  - "rooms/ledger.html"
  - "engines/variance.js"
  - "engines/subscriptions.js"
  - "engines/sincelast.js"
  - "engines/notknowing.js"
  - "engines/layouts.js"
---
# The Ledger (`ledger`)
File: rooms/ledger.html · 2248 lines · utility room
Engines: projection, tier0, swan, variance, rerank, tax, statement, debt, hourly, subscriptions, sincelast, selfemployed, reachable, notknowing, layouts, foo, cashflow, fire, benchmarks, ratios, skills
Reference data: access_rules.json, confidence_weights.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, fire_variants.json, +12 more
Owns: nothing
Reads from other owners: grossAnnualIncome (start), lastPay (start), cashSavings (start), employmentStatus (start), contributionPercent (start), partnerDob (partner), totalDebt (debt-payoff), otherAssets (statement), +16 more
Latest decisions:
  - D-230 — The Ledger swallows navigation: six pages become six hats
  - D-226 — The Ledger's doors, and the gutter three rooms never had
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-186 — The simplification pass, first cut: fewer doors, one next, quieter rooms
  - D-185 — The Ledger room, 18.4 and 18.5: the target, and one line per row
Full context: node tools/context/pack.js ledger
