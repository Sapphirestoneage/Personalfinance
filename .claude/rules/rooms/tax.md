---
paths:
  - "rooms/tax.html"
  - "engines/rothaca.js"
  - "engines/cliff.js"
---
# Tax (`tax`)
File: rooms/tax.html · 463 lines
Engines: projection, tier0, selfemployed, income, ledger, tax, taxroom, hourly, rothaca, cliff
Reference data: aca_2026.json, benefit_cliffs_2026.json, effective_tax_rates_2026.json, federal_brackets_2026.json, return_bands.json, se_tax_2026.json, +2 more
Owns: otherPreTax, withheld
Reads from other owners: filingStatus (start), grossAnnualIncome (start), employmentStatus (start), contributionPercent (start), marginalRate (ledger)
Latest decisions:
  - D-301 — The cliff, as a reading of Tax
  - D-150 — The Account You Left Behind: four futures, one trap, one sum
  - D-142 — A room does not ask a question your situation has no answer to
  - D-129 — The ledger, revised: four ways to be taxed, three things an expense can produce, a budget of cards with presets, N/A and the what-if
  - D-128 — The ledger: income entries, the expense log, the reflected budget, the month closed
Full context: node tools/context/pack.js tax
