# Questions (Phase 1)

Questions for Eli that came up while building Phase 1. None of them blocked
the build: a reasonable default was used and logged in DECISIONS.md. This
file is public, so it names fields and decisions, never the numbers in the
household file; the numbers are in the session report and in the Ledger.

1. **NY 2026 brackets** (`NY_BRK_S`, `NY_BRK_J`, `NY_BRK_H`, `NY_BRK_MFS` in `data/rules-2026.json`): entered from memory of the FY2026 NY budget (lower five rates cut to 3.9% / 4.4% / 5.15% / 5.4% / 5.9%). Please check against the 2026 IT-201 instructions. Same for the 2026 federal brackets above 24%, head of household brackets, and `LTCG0_MFS`, `LTCG15_MFS`, `LTCG15_H`.
2. **The 2026-only W-2 line**: the profile gives it as `yearly` over a half-year window and calls it the year's total. I read it as the total for that window (cadence `total`), not a yearly salary rate. Is that right? (S-143) **Answered 2026-10-22:** entered as a rough total for January to June, with rough federal and state withholding; the year's tax is now figured from it (rough).
3. **Roth contribution years**: the profile lists five amounts; I assigned them to 2022 through 2026 in order. Confirm the years. **Answered 2026-10-22:** the years are right.
4. **Conversion year**: assumed 2026. If it was earlier, the 2026 tax bill drops by the conversion and its five-year clock starts earlier. **Answered 2026-10-22:** yes, 2026.
5. **State withholding on unemployment**: federal withholding is 0; the NY withholding is not given. Was NY tax withheld? **Answered 2026-10-22:** no NY tax was withheld (known).
6. **Card minimums and due days**: the limits are in now; the minimums are not, so the exact monthly surplus and runway still use estimates (1% of balance plus a month of interest, at least $25), marked rough.
7. **Rates after the two 0% promos end**: neither card has its regular APR entered, and one does not say whether interest is deferred.
8. **1099 contract expenses**: the tax engine treats 1099 gross as profit. Will the contract have business expenses (mileage, software, a home office)? They would lower SE and income tax. (S-147) **Answered 2026-10-22:** none expected (rough); 1099 profit is gross less business expenses (S-179).
9. **Runway and the Rule of 5 base**: both use expenses plus minimum payments. The brief says "months of expenses"; the months match either way, the dollar target differs. Which do you want? (S-150)
10. **Health plan type after the parent plan ends**: HSA eligibility depends on it. HDHP, bronze, catastrophic or other? **Answered 2026-10-22:** catastrophic (known).
11. **2026 estimated payments**: set to 0 as a rough answer. Have you paid any? **Answered 2026-10-22:** none (known).
12. **Projection default**: income is weighted by likelihood (the 1099 contract at its likelihood). Would you rather see the committed view (only certain income) first? (S-148)
13. **Car value**: no yearly change is entered, so the projection holds it flat. A depreciation rate would go in the car's `appreciationRate`. **Answered 2026-10-22:** about 15% a year; now the house default for every car (S-196).
14. **Lean FI**: counts every FAT-tagged expense, including eating out (tagged food but a want). Should Lean count needs only? (S-150)
15. **Student loan**: the balance is from August and the repayment plan is blank. Is the minimum on a standard or income-driven plan? **Answered 2026-10-22:** federal; the plan is not known, so it reads Not sure (S-181); the balance stays rough.
16. **As-of date after edits**: the engines use the household's as-of date, so this month's numbers stay put while you edit. Should an edit in the Ledger move the as-of date to today instead? (S-153) **Answered 2026-10-22:** an edit moves that field's as-of date to today and makes it known, unless it is saved as a guess (already the case; edits now use the local date).
17. **Business cards and personal credit**: each business card is assumed not to report to personal credit (rough, S-157). Some issuers do report; confirm per card, in the Ledger field "reports to personal credit".
18. **The new cards**: their balances are $0 as a rough answer, and their APRs, minimums and due days are blank. Three of them have no name yet.
19. **Runway goals moved with the $40 minimum**: with the default card minimum at the larger of $40 or 1% plus interest (S-166), this month's minimums rise by $30, so both runway goals in the flag-stage brief rise too (the 1-month goal by $30, the Rule of 5 goal by five times that). Keep $40?
20. **FI goal stage numbers**: by the stated rule (red under 80% of the spending-implied number, green at 100%), the goals and spending levels the engine shows differ from the ones in the flag-stage brief, which fit a slightly lower monthly spending with the 80% applied twice. The session report has both sets. Which do you mean? **Answered 2026-10-22:** stages are goal / implied FI (red under 80%, yellow to 100%, green at 100%). The numbers in the question used your own withdrawal rate; the Dashboard now opens on the Likely set (4%), where the thresholds are higher, and Best shows yours. A test checks the rule at a 5% rate (S-183).
