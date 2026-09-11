---
paths:
  - "rooms/rerank.html"
---
# The Rerank (`rerank`)
File: rooms/rerank.html · 619 lines
Engines: projection, tier0, cashflow, rerank
Reference data: common_costs.json, expense_categories.json
Owns: rerankCut
Reads from other owners: monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-089 — 3D on the dashboard: every instrument three ways, with nothing changing but the assumptions
  - D-085 — The Rerank: cost order against value order, and the lines where they disagree
Full context: node tools/context/pack.js rerank
