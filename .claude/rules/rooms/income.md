---
paths:
  - "rooms/income.html"
  - "engines/variableincome.js"
  - "engines/hassle.js"
  - "engines/timeline.js"
---
# Income (`income`)
File: rooms/income.html · 2275 lines
Engines: income, selfemployed, tax, ledger, projection, tier0, cashflow, budget, variableincome, hourly, hassle, timeline
Reference data: effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, hassle_defaults.json, milestones.json, se_tax_2026.json, +1 more
Owns: incomeLow, incomeHigh, bufferMonths, variableWindow, ledgerIncome, futureIncome, incomeType, paySurvives
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-265 — What Comes Next is income with a start and an end on it
  - D-264 — Income takes Worth the Hassle, and eight readings got their scrolling back
  - D-247 — Income: what lands, what it averages, what it pays
  - D-243 — What Matters, four readings of one expense log
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
Full context: node tools/context/pack.js income
