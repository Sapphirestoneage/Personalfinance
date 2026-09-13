---
paths:
  - "rooms/stacker.html"
  - "engines/ss.js"
---
# The Skill Stacker (`stacker`)
File: rooms/stacker.html · 604 lines
Engines: projection, tier0, foo, cashflow, statement, swan, benchmarks, rerank, hourly, selfemployed, tax, debt, quickmath, vpw, ss, events, skills
Reference data: car_costs.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, foo_rules.json, liquidity_benchmarks.json, +3 more
Owns: practiceLedger
Reads from other owners: grossAnnualIncome (start), capturingFullMatch (start), rerankCut (values), retireAge (fire), monthlyExpenses (expenses)
Latest decisions:
  - D-141 — The card says what the curriculum says
  - D-139 — The Skill Tree gets its real curriculum: 625 skills, 25 trees, 312 lanes
  - D-131 — The Skill Tree and the Exercise Library, as rooms: two ladders, one game
  - D-091 — Charts: one module, three shapes, and the Personal Finance Club look
  - D-090 — The Skill Stacker: three at a time, did or didn't, and a ledger of what each day was worth
Full context: node tools/context/pack.js stacker
