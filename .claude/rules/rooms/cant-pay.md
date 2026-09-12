---
paths:
  - "rooms/cant-pay.html"
---
# When It Won’t All Get Paid (`cant-pay`)
File: rooms/cant-pay.html · 531 lines
Engines: projection, tier0, cashflow
Reference data: bill_triage.json, effective_tax_rates_2026.json, expense_categories.json
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), monthlyDebtPayments (debt-payoff), monthlyExpenses (expenses)
Latest decisions:
  - D-148 — When It Won't All Get Paid
Full context: node tools/context/pack.js cant-pay
