---
paths:
  - "rooms/goals.html"
  - "engines/reversibility.js"
  - "engines/goals.js"
---
# The Decision Room (`goals`)
File: rooms/goals.html · 700 lines
Engines: projection, tier0, cashflow, hourly, events, reversibility, goals
Reference data: expense_categories.json, goal_templates.json, reversibility.json, triple_d.json
Owns: reversibilityDecision
Reads from other owners: grossAnnualIncome (start), cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-253 — The Decision Room: one shell, five outputs on every block
  - D-090 — The Skill Stacker: three at a time, did or didn't, and a ledger of what each day was worth
Full context: node tools/context/pack.js goals
