---
paths:
  - "rooms/week.html"
  - "engines/week.js"
---
# Designed Week (`week`)
File: rooms/week.html · 278 lines
Engines: projection, tier0, hourly, cashflow, week
Reference data: expense_categories.json, week_blocks.json
Owns: designedHours
Reads from other owners: grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-115 — Designed Week: 168 hours, priced
Full context: node tools/context/pack.js week
