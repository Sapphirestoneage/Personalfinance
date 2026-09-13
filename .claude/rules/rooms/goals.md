---
paths:
  - "rooms/goals.html"
  - "engines/reversibility.js"
  - "engines/goals.js"
  - "engines/worth.js"
---
# The Decision Room (`goals`)
File: rooms/goals.html · 1331 lines
Engines: projection, tier0, cashflow, hourly, events, reversibility, goals, worth
Reference data: expense_categories.json, goal_templates.json, reversibility.json, triple_d.json
Owns: reversibilityDecision
Reads from other owners: grossAnnualIncome (start), cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-262 — The Decision Room gets a second reading: the ones behind you
  - D-253 — The Decision Room: one shell, five outputs on every block
  - D-090 — The Skill Stacker: three at a time, did or didn't, and a ledger of what each day was worth
Full context: node tools/context/pack.js goals
