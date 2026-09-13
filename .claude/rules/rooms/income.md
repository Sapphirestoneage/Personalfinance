---
paths:
  - "rooms/income.html"
  - "engines/variableincome.js"
---
# Income (`income`)
File: rooms/income.html · 1345 lines
Engines: income, selfemployed, tax, ledger, projection, tier0, cashflow, budget, variableincome, hourly
Reference data: effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, se_tax_2026.json, variable_income_conventions.json
Owns: incomeLow, incomeHigh, bufferMonths, variableWindow, ledgerIncome, incomeType, paySurvives
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), monthlyExpenses (expenses)
Latest decisions:
  - D-247 — Income: what lands, what it averages, what it pays
  - D-243 — What Matters, four readings of one expense log
  - D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line
  - D-198 — Income: the year is columns, counts only what landed on a date, and folds
  - D-195 — Income: the year reads as what came in, then what is assumed
Full context: node tools/context/pack.js income
