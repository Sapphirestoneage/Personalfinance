---
paths:
  - "rooms/kids.html"
  - "engines/kids.js"
---
# Kids and Tuition (`kids`)
File: rooms/kids.html · 245 lines
Engines: projection, tier0, kids
Reference data: child_cost.json, childcare_by_state.json
Owns: tuitionTarget, tuitionSaved, tuitionMonthly
Reads from other owners: monthlyExpenses (expenses)
Latest decisions:
  - D-110 — Kids and Tuition: what each child costs at their age
Full context: node tools/context/pack.js kids
