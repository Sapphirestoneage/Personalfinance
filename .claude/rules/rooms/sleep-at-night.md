---
paths:
  - "rooms/sleep-at-night.html"
---
# Sleep At Night (`sleep-at-night`)
File: rooms/sleep-at-night.html · 615 lines
Engines: projection, tier0, foo, cashflow, swan
Reference data: expense_categories.json, foo_rules.json, liquidity_benchmarks.json
Owns: oopMax, termLife, disabilityMonthly, umbrella, swanTarget
Reads from other owners: cashSavings (start), highestDeductible (start), monthlyExpenses (expenses)
Latest decisions:
  - D-095 — The one-pager: one gate, ten cards at most, every box a guess until it is yours
  - D-071 — The Coverage Checkup lives in Sleep At Night; the target mix lives in Where It Goes
  - D-061 — Eleven cards: the intake asks less, derives one answer, and takes "no debt" as an answer
  - D-028 — The SWAN Number is stored, never derived, and never graded
Full context: node tools/context/pack.js sleep-at-night
