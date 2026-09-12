---
paths:
  - "rooms/reversibility.html"
  - "engines/reversibility.js"
---
# Can It Be Undone (`reversibility`)
File: rooms/reversibility.html · 328 lines
Engines: projection, tier0, cashflow, hourly, events, reversibility
Reference data: expense_categories.json, housing_conventions.json, moving_cost.json, reentry_gap.json, reversibility.json, triple_d.json
Owns: reversibilityDecision
Reads from other owners: grossAnnualIncome (start), cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-101 — The LATER.md rooms: what each owns, before it is built
Full context: node tools/context/pack.js reversibility
