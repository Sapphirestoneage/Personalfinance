---
paths:
  - "rooms/cash-flow.html"
---
# Cash Flow (`cash-flow`)
File: rooms/cash-flow.html · 565 lines
Engines: projection, tier0, cashflow, income, selfemployed, ledger, budget
Reference data: effective_tax_rates_2026.json, expense_categories.json, se_tax_2026.json
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), monthlyDebtPayments (debt-payoff)
Latest decisions:
  - D-192 — Expenses is what a month costs; Cash Flow is when the money moves
  - D-181 — Section 15: the ten foundation shapes, one commit a shape
  - D-163 — The dead spot is the door
  - D-159 — Two boxes buy a number, and the other seven wait
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
Full context: node tools/context/pack.js cash-flow
