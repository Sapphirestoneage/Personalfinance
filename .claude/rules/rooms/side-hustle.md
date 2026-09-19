---
paths:
  - "rooms/side-hustle.html"
  - "engines/sidehustle.js"
---
# Side Hustle (`side-hustle`)
File: rooms/side-hustle.html · 509 lines
Engines: projection, tier0, income, ledger, selfemployed, hourly, sidehustle
Reference data: effective_tax_rates_2026.json, federal_brackets_2026.json, se_tax_2026.json
Owns: nothing
Reads from other owners: filingStatus (start), grossAnnualIncome (start), marginalRate (accounts)
Latest decisions:
  - D-062 — Explore rooms open with your numbers proposed, and the federal bracket is one of them
  - D-033 — Side Hustle: marginal rate as an input, and SE tax that stacks
Full context: node tools/context/pack.js side-hustle
