---
paths:
  - "rooms/accounts.html"
  - "engines/accounts.js"
---
# Where It Goes & how it’s split (`accounts`)
File: rooms/accounts.html · 580 lines
Engines: selfemployed, accounts, projection, tier0, hourly
Reference data: contribution_limits.json, tax_brackets.json
Owns: rothContributed, hsaContributed, marginalRate, allocationStocks, allocationBonds, allocationCash, rebalanceBand
Reads from other owners: filingStatus (start), grossAnnualIncome (start), contributionPercent (start)
Latest decisions:
  - D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset
  - D-071 — The Coverage Checkup lives in Sleep At Night; the target mix lives in Where It Goes
  - D-062 — Explore rooms open with your numbers proposed, and the federal bracket is one of them
  - D-061 — Eleven cards: the intake asks less, derives one answer, and takes "no debt" as an answer
Full context: node tools/context/pack.js accounts
