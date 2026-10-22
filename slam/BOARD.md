# Board

## Done: Phase 1, foundation and core engines (2026-10-22)

- [x] Rules registry: `data/rules-2026.json` (115 rules), `engine/rules.js` `get(id, year)`, a test that every rule id in code exists
- [x] Account shells and the spine schema: ten families, Account Rules presets, the validator; both fixtures validate
- [x] Engines with unit tests: cashflow, tax (federal, FICA, SE, unemployment, gains stacking, conversions, NY), projection (24 months, then yearly to life expectancy), FI (number, percent, years, Lean, Coast, implied), debt (avalanche, snowball, stress; payoff dates and interest; promo deadlines), emergency (Rule of 5, runway tiers, Roth backstop), flags
- [x] Ledger: DAITE groups, kind chips, edit / confirm / not for me, undo and redo, the still-guessing list
- [x] Dashboard: net worth, runway and backstop, surplus, savings rate, cards and promo deadline, FI, tax balance due, flags; every number links to its Ledger fields
- [x] Golden tests: Eli (local only) and the demo household
- [x] Docs: README section, CONTRACTS.md, DECISIONS.md S-140 to S-155, QUESTIONS.md

## Next: Phase 2

1. **Windfall room**: where a lump sum goes (promo balances before their deadline, the cushion, the Roth, the tax bill), read from the spine and the engines.
2. **Budget, estimated vs actual**: connect the Budget's monthly log to the spine's expenses (S-140 left open whether the spine feeds the Budget or replaces its store).
3. **Cash flow calendar**: the projection's months and events (pay dates, due days, promo ends, estimated tax dates) on a calendar.

## Waiting on Eli

The open questions are in QUESTIONS.md. The ones that change numbers most:
the 2026 W-2 wages and withholding (the tax bill), card minimums and limits
(surplus, runway, utilization), and the 1099 contract's amount and likelihood
(next year's outlook).

## Out of scope until later

Monte Carlo, withdrawal sequencing, Social Security, scenario blocks (the
married scenario), game layers, coach mode, statement import, rooms beyond
the Ledger and Dashboard.
