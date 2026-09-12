---
paths:
  - "rooms/student-loans.html"
  - "engines/studentloans.js"
---
# Student Loan Decision (`student-loans`)
File: rooms/student-loans.html · 267 lines
Engines: projection, tier0, debt, studentloans, hourly
Reference data: debt_rules.json, student_loan_conventions.json
Owns: loanPlan, loanExtra, idrShare, forgivenessYears
Reads from other owners: grossAnnualIncome (start), employmentStatus (start), hasDebt (start), totalDebt (debt-payoff), monthlyDebtPayments (debt-payoff)
Latest decisions:
  - D-120 — Student Loan Decision: three shapes of repayment
Full context: node tools/context/pack.js student-loans
