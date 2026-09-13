---
paths:
  - "rooms/runway.html"
  - "engines/runway.js"
  - "engines/betweenjobs.js"
  - "engines/quitfund.js"
---
# The Cushion (`runway`)
File: rooms/runway.html · 1722 lines
Engines: projection, tier0, cashflow, tax, runway, swan, hourly, betweenjobs, selfemployed, debt, reachable, countdown, quitfund, foo
Reference data: aca_2026.json, access_rules.json, cobra_aca_2024.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, +7 more
Owns: oopMax, termLife, disabilityMonthly, umbrella, expectedSearchMonths, floorMonthly, swanTarget
Reads from other owners: grossAnnualIncome (start), cashSavings (start), employmentStatus (start), highestDeductible (start), healthCover (protection), healthMonthly (protection), monthlyExpenses (expenses)
Latest decisions:
  - D-232 — The Cushion: four readings of one number
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-082 — Which lines could not be cut: the floor, and how much of a month is cuttable
  - D-062 — Explore rooms open with your numbers proposed, and the federal bracket is one of them
Full context: node tools/context/pack.js runway
