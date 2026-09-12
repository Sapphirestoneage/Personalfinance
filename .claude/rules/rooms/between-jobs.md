---
paths:
  - "rooms/between-jobs.html"
  - "engines/runway.js"
  - "engines/betweenjobs.js"
---
# Between Jobs (`between-jobs`)
File: rooms/between-jobs.html · 297 lines
Engines: projection, tier0, hourly, tax, runway, betweenjobs
Reference data: protection_conventions.json, reentry_gap.json, tax_brackets.json, ui_benefits.json
Owns: lastDayWorked, severanceCents, ptoPayoutCents, expectedSearchMonths, floorMonthly
Reads from other owners: grossAnnualIncome (start), cashSavings (start), employmentStatus (start), healthCover (protection), healthMonthly (protection), monthlyExpenses (expenses)
Latest decisions:
  - D-213 — The last day worked, and two branches that stop the wrong questions
  - D-102 — Between Jobs: the day the cash runs out, against the search
Full context: node tools/context/pack.js between-jobs
