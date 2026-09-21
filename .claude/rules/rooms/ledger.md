---
paths:
  - "rooms/ledger.html"
  - "engines/variance.js"
  - "engines/recipes.js"
  - "engines/sincelast.js"
  - "engines/notknowing.js"
  - "engines/layouts.js"
---
# The Ledger (`ledger`)
File: rooms/ledger.html · 3964 lines · utility room
Engines: projection, tier0, income, ledger, swan, variance, rerank, tax, statement, debt, hourly, subscriptions, recipes, sincelast, selfemployed, reachable, notknowing, layouts, foo, cashflow, fire, coast, opening, benchmarks, ratios, skills
Reference data: access_rules.json, confidence_weights.json, debt_rules.json, effective_tax_rates_2026.json, expense_categories.json, federal_brackets_2026.json, +23 more
Owns: takeHomeMonthly, rothContributed, hsaContributed, onHdhp, hsaFamilyPlan, marginalRate, totalSaved, payVaries, spendingIncludesDebt, spendingIncludesSaving, savedMonthly, highInterestBalance, refundLastYear, allocationStocks, allocationBonds, allocationCash, rebalanceBand, otherAssets, assetValue, assetCharacter, assetTier, assetCostBasis, assetInstitution, assetAccountType, assetConfidence, assetCashFlow, assetHassle, assetAccessAge
Reads from other owners: filingStatus (start), grossAnnualIncome (start), cashSavings (start), employmentStatus (start), employerMatch (start), hasDebt (start), contributionPercent (start), partnerDob (partner), +21 more
Latest decisions:
  - D-324 — A level is answered where it is asked
  - D-321 — No em dash anywhere the app can show one, and the planets get a screen
  - D-313 — The Statement is four sections; the facts it asked for are the Ledger's
  - D-303 — The screens a person actually meets: what floats, what toggles, what a Save gives you, and an intake that asks one family at a time
  - D-241 — Nothing counts a person's failures before they have typed anything
Full context: node tools/context/pack.js ledger
