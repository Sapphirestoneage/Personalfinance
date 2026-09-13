---
paths:
  - "rooms/big-purchase.html"
  - "engines/purchase.js"
  - "engines/dreamline.js"
---
# Big Purchase (`big-purchase`)
File: rooms/big-purchase.html · 494 lines
Engines: projection, tier0, hourly, quickmath, purchase, dreamline
Reference data: car_costs.json, dreamline.json, effective_tax_rates_2026.json, liquidity_benchmarks.json
Owns: purchasePrice, purchaseMonths, purchaseRate, dreamsMonthly
Reads from other owners: grossAnnualIncome (start), cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-237 — Expenses: the month, and what repeats in it
  - D-129 — The ledger, revised: four ways to be taxed, three things an expense can produce, a budget of cards with presets, N/A and the what-if
  - D-112 — Big Purchase: one thing, priced in hours, months of FI and cash
Full context: node tools/context/pack.js big-purchase
