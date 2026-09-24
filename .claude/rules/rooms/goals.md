---
paths:
  - "rooms/goals.html"
  - "engines/reversibility.js"
  - "engines/goals.js"
  - "engines/worth.js"
---
# The Decision Room (`goals`)
File: rooms/goals.html · 1470 lines
Engines: projection, tier0, income, selfemployed, ledger, cashflow, hourly, events, reversibility, goals, worth
Reference data: effective_tax_rates_2026.json, expense_categories.json, goal_templates.json, reversibility.json, se_tax_2026.json, triple_d.json
Owns: reversibilityDecision
Reads from other owners: grossAnnualIncome (start), takeHomeMonthly (ledger), cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-299 — A block that pays
  - D-296 — What If: two scenario rooms are each other, not two block types
  - D-292 — The Decision Room gets a second reading: the ones behind you
  - D-283 — The Decision Room: one shell, five outputs on every block
  - D-090 — The Skill Stacker: three at a time, did or didn't, and a ledger of what each day was worth
Full context: node tools/context/pack.js goals
