---
paths:
  - "rooms/tax.html"
---
# Tax (`tax`)
File: rooms/tax.html · 259 lines
Engines: projection, tier0, selfemployed, income, ledger, tax, taxroom, hourly
Reference data: effective_tax_rates_2026.json, federal_brackets_2026.json, se_tax_2026.json, state_brackets_2026.json
Owns: otherPreTax, withheld
Reads from other owners: filingStatus (start), grossAnnualIncome (start), employmentStatus (start), contributionPercent (start)
Latest decisions:
  - D-150 — The Account You Left Behind: four futures, one trap, one sum
  - D-142 — A room does not ask a question your situation has no answer to
  - D-129 — The ledger, revised: four ways to be taxed, three things an expense can produce, a budget of cards with presets, N/A and the what-if
  - D-128 — The ledger: income entries, the expense log, the reflected budget, the month closed
  - D-105 — Tax: the effective rate, the bracket, and whether a refund is coming
Full context: node tools/context/pack.js tax
