---
paths:
  - "rooms/variable-income.html"
  - "engines/variableincome.js"
---
# Variable Income (`variable-income`)
File: rooms/variable-income.html · 293 lines
Engines: projection, tier0, selfemployed, income, ledger, variableincome
Reference data: effective_tax_rates_2026.json, se_tax_2026.json, variable_income_conventions.json
Owns: incomeLow, incomeHigh, bufferMonths, variableWindow
Reads from other owners: grossAnnualIncome (start), cashSavings (start), ledgerIncome (income), monthlyExpenses (expenses)
Latest decisions:
  - D-128 — The ledger: income entries, the expense log, the reflected budget, the month closed
  - D-113 — Variable Income: the salary to pay yourself
Full context: node tools/context/pack.js variable-income
