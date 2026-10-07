# Questions for Eli

Collected during the run; none blocked the build. Answer whenever.

1. The app is on branch `claude/money-rooms-v3-coach-build-2ftvlz` of the
   Personalfinance repo. Merge it to `main` (or say so) and GitHub Pages will
   serve it at `https://sapphirestoneage.github.io/Personalfinance/money-rooms-v3/`.
   Do you want it in its own repository instead?

2. The SPARKS root suite (`node test/run.js`) fails one check on any day after
   early October 2026: "with its as-of day and source" expects an as-of date of
   2026-09-02 to still read "typed confirmed". It is time-based and not part of
   this app. Do you want it fixed in the SPARKS lane?

3. Every card, fund, tax bracket, FICA figure and contribution limit in data/ was
   written from memory and is marked verify: true (shown as "Looked up (verify)"
   at 0.7 confidence). The final report lists them. Do you want to confirm them
   against the 2026 IRS tables and the issuers' pages, or should I leave the
   verify flags on until you do?
4. Metric 3 counts an insurance premium as spending only when it is not paid
   through payroll (MR-015). Is that the convention you want?
5. The FI date ignores Social Security (MR-017); the chart draws it from 67.
   Do you want a second "with Social Security" date on the one-pager?

## Level 9 (2026-10-07)

6. Level 8 (gut and dream anchors, variance, targets) was not on the board
   when Level 9 started. I shipped stand-ins: Dream FI age, Dream spending
   and Gut spending as optional fields on the Life plan's Retirement and FI
   row, and an Assumptions switch for the FI spending basis (actual, gut,
   dream). Do you want Level 8 built properly, with anchors per category and
   variance, before more is layered on these?
7. Every rung's date now follows the projection's net worth line, the same
   as the FI date (MR-040), while percent there counts invested assets by
   default. For a household whose surplus pools in cash, the two tell
   different stories (Maya: 4% of the FI number invested, FI in 2049). Is
   that the reading you want, or should progress count net worth by default?
8. Ask priority: an unknown input with a national default should range 50%
   around that default. Today unknowns keep the v1 leverage score and sit
   below every measured fact. Worth building, or is the v1 order fine for
   unknowns?
9. The true FI number taxes withdrawals from the pre-tax share as ordinary
   income with the standard deduction and no FICA (FICA does not apply to
   withdrawals). Capital gains on the taxable share are ignored. Fine for v1?
10. "Inflation plus one point" is modelled as the real return minus one point,
    since everything is in today's dollars. Do you want a nominal view first?
11. Social Security in the FI number with a floor: the bridge years are funded
    from the portfolio at face value (benefit x years), and the benefit is the
    bend-point estimate scaled by the Assumptions share. Should it discount?
12. Benchmarks (Fidelity and T. Rowe Price salary multiples, Millionaire Next
    Door) are from memory and marked verify; coach view only by default.
    Should the client ever see them?
13. The sensitivity run re-runs the whole engine 70 to 300 times (60 to 800
    ms). It runs in a Worker and is cached per record version. If a client
    file is much bigger than Maya's, the cap of 40 roots will drop the small
    ones. Is 40 the right cap?
14. The regional price parities in data/col-tiers.json are from memory
    (BEA 2023 release, marked verify): New York metro 113 all items, 150
    housing; San Francisco 117 and 185; the cut points HCOL at or above 110,
    MCOL 95 to 110, LCOL under 95. Please check them against BEA's latest
    table before a client sees a tier.
15. The unit-size rent averages (studio $1,250, one bed $1,450, two bed
    $1,750, three bed $2,150 a month at the national level, utilities $150
    to $300) are national round figures scaled by the housing index. HUD
    fair market rents per metro would be sharper. Worth adding as a library?
16. Guesses scale by tier and household, not by income. A $68k household and
    a $168k household in the same city get the same guess for food. Do you
    want an income band in defaults.json?
17. The existing demo household is also called Maya (Maya Lindqvist, Oakland).
    The discovery household is a different Maya (Jersey City, one roommate)
    and lives in tests/households/maya-discovery.json. Should one of them be
    renamed?
18. A partner who shares income and bills is out of scope; a roommate shares
    bills only. Couples stay in the parking lot?
19. The gentle mode is set from the mindset chips (avoids accounts, avoiding)
    and can be switched on the call screen. Should it also soften the
    Session page and the one-pager, or only the call?
20. Confirm swaps a guess for their number through "Use mine"; the discovery
    form itself has no undo past the browser's. Is the form's own Clear button
    worth having?
21. A target saved in Your targets is a planned move, not a fact; nothing in
    the Ledger changes. Should a target also set the line's state to "will
    change" so the next session asks about it?
