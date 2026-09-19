---
paths:
  - "rooms/week.html"
  - "engines/week.js"
---
# Designed Week (`week`)
File: rooms/week.html · 280 lines
Engines: projection, tier0, income, selfemployed, ledger, hourly, cashflow, week
Reference data: effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json, week_blocks.json
Owns: designedHours
Reads from other owners: grossAnnualIncome (start), monthlyExpenses (expenses)
Latest decisions:
  - D-115 — Designed Week: 168 hours, priced
Full context: node tools/context/pack.js week
