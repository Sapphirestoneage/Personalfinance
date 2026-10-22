# Questions (Phase 1)

Questions for Eli that came up while building Phase 1. None of them blocked
the build: a reasonable default was used and logged in DECISIONS.md. This
file is public, so it names fields and decisions, never the numbers in the
household file; the numbers are in the session report and in the Ledger.

1. **NY 2026 brackets** (`NY_BRK_S`, `NY_BRK_J`, `NY_BRK_H`, `NY_BRK_MFS` in `data/rules-2026.json`): entered from memory of the FY2026 NY budget (lower five rates cut to 3.9% / 4.4% / 5.15% / 5.4% / 5.9%). Please check against the 2026 IT-201 instructions. Same for the 2026 federal brackets above 24%, head of household brackets, and `LTCG0_MFS`, `LTCG15_MFS`, `LTCG15_H`.
2. **The 2026-only W-2 line**: the profile gives it as `yearly` over a half-year window and calls it the year's total. I read it as the total for that window (cadence `total`), not a yearly salary rate. Is that right? (S-143)
3. **Roth contribution years**: the profile lists five amounts; I assigned them to 2022 through 2026 in order. Confirm the years.
4. **Conversion year**: assumed 2026. If it was earlier, the 2026 tax bill drops by the conversion and its five-year clock starts earlier.
5. **State withholding on unemployment**: federal withholding is 0; the NY withholding is not given. Was NY tax withheld?
6. **Card limits, minimums and due days**: only one card's limit is known. Overall utilization and the exact monthly surplus need the other limits and all the minimums. Until then minimums are estimated (1% of balance plus a month of interest, at least $25) and marked rough.
7. **Rates after the two 0% promos end**: neither card has its regular APR entered, and one does not say whether interest is deferred.
