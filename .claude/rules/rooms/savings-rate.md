---
paths:
  - "rooms/savings-rate.html"
---
# Savings Rate (`savings-rate`)
File: rooms/savings-rate.html · 489 lines
Engines: projection, tier0, foo, hourly
Reference data: effective_tax_rates_2026.json, foo_rules.json
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), employerMatch (start), monthlyExpenses (expenses)
Latest decisions:
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-091 — Charts: one module, three shapes, and the Personal Finance Club look
  - D-054 — A back and a next in every room, at the top
  - D-030 — Savings Rate gets its own room, and a what-if that reuses the engines
Full context: node tools/context/pack.js savings-rate
