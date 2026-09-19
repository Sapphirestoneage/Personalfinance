---
paths:
  - "rooms/kids.html"
  - "engines/kids.js"
---
# Kids and Tuition (`kids`)
File: rooms/kids.html · 247 lines
Engines: projection, tier0, income, selfemployed, ledger, kids
Reference data: child_cost.json, childcare_by_state.json, effective_tax_rates_2026.json, se_tax_2026.json
Owns: tuitionTarget, tuitionSaved, tuitionMonthly
Reads from other owners: monthlyExpenses (expenses)
Latest decisions:
  - D-110 — Kids and Tuition: what each child costs at their age
Full context: node tools/context/pack.js kids
