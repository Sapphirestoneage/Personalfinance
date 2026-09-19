---
paths:
  - "rooms/student-loans.html"
  - "engines/studentloans.js"
---
# Student Loan Decision (`student-loans`)
File: rooms/student-loans.html · 330 lines
Engines: projection, tier0, income, selfemployed, ledger, debt, studentloans, hourly
Reference data: debt_rules.json, effective_tax_rates_2026.json, se_tax_2026.json, student_loan_conventions.json
Owns: loanPlan, loanExtra, idrShare, forgivenessYears
Reads from other owners: filingStatus (start), grossAnnualIncome (start), employmentStatus (start), hasDebt (start), marginalRate (accounts), totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff)
Latest decisions:
  - D-120 — Student Loan Decision: three shapes of repayment
Full context: node tools/context/pack.js student-loans
