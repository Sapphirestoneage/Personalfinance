---
paths:
  - "rooms/income.html"
---
# Income (`income`)
File: rooms/income.html · 786 lines
Engines: income, selfemployed, tax, ledger, projection, tier0, cashflow, budget
Reference data: effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, se_tax_2026.json
Owns: ledgerIncome, incomeType, paySurvives
Reads from other owners: filingStatus (start)
Latest decisions:
  - D-250 — Deeper questions wait for their level
  - D-246 — Logged pay reaches every reading, and paired boxes start level
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-198 — Income: the year is columns, counts only what landed on a date, and folds
  - D-195 — Income: the year reads as what came in, then what is assumed
Full context: node tools/context/pack.js income
