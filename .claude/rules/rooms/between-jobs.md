---
paths:
  - "rooms/between-jobs.html"
  - "engines/runway.js"
  - "engines/betweenjobs.js"
---
# Between Jobs (`between-jobs`)
File: rooms/between-jobs.html · 300 lines
Engines: projection, tier0, hourly, tax, runway, betweenjobs
Reference data: effective_tax_rates_2026.json, reentry_gap.json
Owns: expectedSearchMonths, floorMonthly
Reads from other owners: grossAnnualIncome (start), cashSavings (start), employmentStatus (start), healthCover (protection), healthMonthly (protection), monthlyExpenses (expenses)
Latest decisions:
  - D-102 — Between Jobs: the day the cash runs out, against the search
Full context: node tools/context/pack.js between-jobs
