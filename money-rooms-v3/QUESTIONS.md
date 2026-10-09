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
17. Answered: one Maya Lindqvist, in Jersey City (MR-050).
18. Answered: partners are in (MR-050). Together or just mine is a household switch.
19. The gentle mode is set from the mindset chips (avoids accounts, avoiding)
    and can be switched on the call screen. Should it also soften the
    Session page and the one-pager, or only the call?
20. The discovery form keeps what was typed until Save. There is no button to
    blank it and start a fresh call; today you reload the page. Worth a
    "Start over" button?
21. Answered: every saved target is a to-do for next session (MR-050).
22. Level 10 (savings buckets, curricula, the session 5 curriculum) was never
    built, so the timeline reads the cash balances for both cushions and lets
    a goal link to an Investments account row in place of a bucket. The
    curriculum link is missing. Build Level 10 next, or keep going?
23. Answered: the cushion is three steps (MR-052). Step 1 is one month of
    the FAT floor by default; Assumptions can switch it to a fixed amount
    typed on the Goals screen. Is one month of all spending the right step 2?
24. High-interest debt sits above the full cushion in the default order at
    10% APR and up (the order of operations reading). Is 10% the line?
25. "Rolls over the next month" is a whole month: the timeline cannot say
    "moves up two weeks", only "a month". Fine, or should funding run by
    paycheck?
26. A debt whose minimum does not cover its interest (Extreme) reads "not
    reached at this pace" and stops accruing once it passes three times its
    balance, so the interest column stays sane. Should it instead show the
    growing balance?
27. Surplus, windfall and cushion what-ifs are never saved, even on Confirm
    (Confirm saves the order, mode, split and locks). Should a windfall be
    saveable as a planned event?
28. The lean month reads the FAT floor (lines flagged food, housing and
    getting around). When nothing is flagged it takes those three categories
    whole, marked rough. Should the guess rows count toward it, or only real
    lines?
29. Both floors are met for the demo Maya at creation, so her timeline shows
    the celebration and the Full cushion is her first open cushion goal. For
    a client who has both floors the first session starts at step 3: fine?
30. Sessions 2 to 12 block lists are the builder's proposal (MR-053); the
    session 1 list is yours. Please mark what to cut, move or rename.
31. Urgent sessions take no program number unless you say so; the switch is
    there in the record but not yet on the screen. Should the runner ask?
32. The found-money pick counts a subscription for a year but the fees and
    the Venmo leak only for the window the export covers (one overdraft is not
    a yearly habit until it repeats). Right rule?
33. The CSV is read and then dropped; only what it taught us stays on the
    record. Do you want the transactions kept for session 9 or a re-import?
34. Rocket Money and Empower exports: I wrote the Rocket Money shape from
    memory (Date, Name, Amount, Account Name, Category; spending positive).
    Please check one real export against the mapper before a client uses it.
35. Session 1 captures the baseline for the scorecard when discovery was not
    saved in the app. For a client who started before Level 10, the "first
    call" column is whatever the record held when session 1 started. OK?
36. The lean month reads the FAT floor; the first accounts block names
    buckets from the goal timeline. Should the hysa card also create the
    bucket rows in Investments?
37. Maya lives in Jersey City since the Partners follow-up, but her rows still
    say Temescal Commons, PG&E, BART, Berkeley Bowl, City of Oakland parking
    tickets, California EDD and "Condo in Oakland". Rename them for the demo
    (Journal Square rent, PSE&G, PATH, ShopRite, Jersey City tickets, NJ DOL,
    "Condo in Jersey City")? It touches the fixtures and the workpapers.
38. The projection puts the surplus beyond retirement contributions into cash
    at the cash return; that is why the invested-only crossover sat 24 years
    behind the FI date. Should the projection invest the surplus instead?
    That is a model change and moves every FI date earlier.
39. The sandbox retires the household at the retirement age (55 for Maya) even
    when FI is not reached, so "all together" shows FI at 76: she stops work
    at 55 and the path spends from savings until Social Security and growth
    catch up. Keep that, or let work run on until FI?
40. "Start demo from zero" keeps only the name. Should it carry Maya's four
    household facts (birth date, state, work situation, filing status) so the
    unlock walk begins at the first Income row?
41. Two places can still clip text: the client name in the top bar (one line,
    240px) and native select boxes. Both are rare with real names. Leave them?
42. "The flip" is now labelled "(invested only)". Prefer a client label like
    "When growth beats what you add to investments"?
43. The unemployment table (`data/unemployment-2026.json`) has five states
    checked against 2026 reporting (NJ $905, NY $869, MS $235, CT $721,
    WA $1,152); the other 46 are from the Department of Labor tables as
    remembered and marked verify. Worth a pass against the DOL January 2026
    "Significant Provisions" PDF before a client outside those five states?
44. New cards start at 20% APR and a $5,000 limit, shown rough with a Guess
    chip until a real figure is typed. Should the balance also start at a
    stand-in, or stay empty so the card reads as unknown?
45. Retirement and FI now sits under Household facts on Home. Should the
    goals (Condo, Japan) move into the profile the same way, or stay on the
    Life plan planet and the Goal timeline?
46. Answered 8 Oct: whatever unlocks more. The engine's ranking stands; Income
    is not pinned first.
47. Answered 8 Oct: a mode that unlocks one at a time. The client's Charts tab
    shows only the charts that have their inputs, so each new fact reveals the
    next chart; locked charts stay the coach's to see (MR-069). "Client sees"
    still hides any chart on purpose.
48. The copy lint bans "unlock" as a marketing word; the brief names the
    feature with it (Unlock Map, Next unlock). The files that draw it are now
    exempt; data copy is still checked. Fine, or pick another word?
49. Answered 8 Oct: yes, unless it is positive. Net worth stays off the six
    while it is below zero and takes the FI progress tile once it is positive
    (MR-069); with no debt it also takes the debt-free tile.
50. Answered 8 Oct: the money date is a coach-run fifteen-minute call and the
    maintenance tier after graduation (MR-065). The client never opens it alone.
51. In plain words: when a balance changes between two check-ins, the app
    splits the change into "what you did" and "what the market did". The
    rule: the part you were expected to put in (your monthly contribution
    times the months that passed) counts as yours; anything above or below
    that counts as the market. Savings accounts count entirely as yours.
    Example: Roth IRA at $14,900, you put in $300 a month, a month later it
    reads $14,000: yours +$300, the market -$1,200. Question: should you be
    able to override that on a line, for example mark a bonus deposit as
    yours even though no contribution was promised?
52. A session's "introduces" list is read from firstSession in the registry
    and the chart catalog, not stored in curricula.json. Session 10 introduces
    nothing new (it is the review before the flex session). Fine?
53. The bands name their sources (common guidance, 50/30/20, Scott Trench,
    Mr. Money Mustache, Money Guy, Ramit Sethi, the 30% rule, three to six
    months) and every one is flagged verify. Which rule should be the default
    for each number, and which sources to drop?
54. The worth-it quadrants are fixed at a tenth of spending and scores of 4
    and 8 (`WORTH_IT` in engine/scoremetrics.js). Keep those lines, or make
    them assumptions the coach can move?
55. Satisfaction's bands are "your own scale": 7 to 10 healthy, 5 to 7 ok,
    under 5 worth a look; its ladder is 5, 6, 7, 8, 9. Fine, or should the
    tile show no band at all and only the trend?
56. The money date curriculum totals 16 target minutes (2, 4, 4, 2, 1, 2, 1).
    Trim "what changed" or "refresh" to land on 15 exactly?
57. A money date between sessions (before graduation) is allowed from the
    Money date screen. Keep that, or only after session 12?
58. The brief describes Maya as gross 68,000 with 1,900 biweekly take-home. The
    fixture every test ties out to has her at 3,650 gross biweekly (about 94,900
    a year) plus freelance and tutoring, take-home 2,512 biweekly. I kept the
    fixture and tested the brief's numbers as a second household (lender about
    198,000, comfortable about 161,000). Should Maya's income change to match
    the brief, which would move every other expected value?
59. The calendar's floor is the lean month step when it is funded, but zero
    when the cushion already sits in a savings account (Maya's case), because
    the cushion account is excluded from safe to spend and a floor on checking
    would count it twice. Right call, or always keep a floor on checking?
60. Answered 8 Oct: keep both, and both are no-interest modes in the debt
    calculation (MR-071). The calendar keeps them apart: statement pays the
    statement balance, full pays everything owed on the due date.
61. Cash flow calendar bills the Ledger does not date: accommodation lands on
    the 1st, utilities on the 15th, therapy and insurance on the 1st, and every
    other line is spread evenly across the month until a due day is set in
    Dates and the floor. Fine as the starting guess?
62. The lender answer uses 28% front and 36% back, with a 43% looser toggle.
    FHA allows up to 50% back in practice. Should the toggle go to 50%?
63. The comfortable answer counts 1% of value a year for maintenance. Older
    homes run nearer 2%. Keep 1% as the default, or 1.5%?
64. Rent vs buy at the workbook's own inputs (8% stocks, 3.5% appreciation,
    7% rate) now has renting ahead for all 30 years, where the workbook leaned
    buying because it never grew the renter's upfront investment correctly.
    That is the corrected arithmetic; does the default stock return stay at 7%
    (the library) or should it match the household's after-inflation return?
65. The car's no-car option prices a transit pass, a few rideshares a week,
    eight rental days a year and a car share. For Maya it wins by a wide
    margin. Should the FI effect of each option be shown on the scoreboard?
66. Retirement for two runs in real dollars at the household's after-inflation
    return (5%), where the Personal Finance Club page uses a nominal 7% to 10%.
    The totals look smaller than that page's. Keep real dollars?
67. The 2026 SALT cap in the library is 40,400 (the 2025 law's 40,000 indexed
    1%). Verify before a client reads the house calculator's tax line.
68. Every figure in data/housing-costs.json and data/auto-costs.json was
    written from memory with verify on (county property tax rates, insurance
    averages, closing cost ranges, transfer taxes, PMI, FHA and VA fees, loan
    limits, sales tax and trade-in rules, doc fees, registration, depreciation,
    maintenance by age, transit passes). The report lists them; which do you
    want checked first?
69. Safe to spend counts what is committed strictly before the next paycheck;
    v44 also counted bills due on payday itself. Which reading do you want?
70. v44 modelled student loan forgiveness after N months and income-driven
    payments; the calendar does not. Worth adding, or leave to the Debt room?
71. v44 swept each month's leftover budget per tag into the next goal; the
    calendar's sweep moves what is left above the floor at month end instead.
    Keep the floor version?
72. A goal the plan funds late (Jordan's apartment down payment, due 2031,
    lands 2039) is spent when it lands, so moving its date earlier does not
    move the FI date until the plan can afford it; the row says what it needs
    a month instead. Keep that, or spend every dated goal on its date even
    when the money is not there yet?
73. A down payment leaves cash and comes back as home equity, but the
    projection has no home line yet, so today it counts as spent for good and
    the FI date moves more than it should. Build the home equity line next
    (one of the six FI-date gaps), or leave down payments as spent until then?
74. A bank account's monthly deposit counts as an investing contribution in
    the projection today (it always did, when the deposit sat on an account
    row). Jordan's $400 a month into savings grows at the market rate there.
    Should a bank deposit grow at the cash rate instead, or drop out because
    the surplus already lands in cash?
75. The Jersey City Maya (the demo client) has no FI date yet: her savings
    rate after the first call does not reach the FI number before 95, so
    "Find what moves your FI date most" in the hallway test shows what the
    levers need instead of a ranking. Give demo Maya her session 1 facts
    (balances and a contribution) so the FI tasks work, or test those two
    tasks on Leah?
76. The ledger's row checkboxes now live behind "Select rows" so a table at
    rest is text. Bulk delete takes one more click. Fine?
77. Presenting turns itself on when the call screen is shown in Client view
    and never turns itself off; stopping is a deliberate click. Should closing
    the session also stop presenting?
78. The old Home shelf of ten headline tiles is gone; Session notes shows four
    (savings rate, net worth, FI date, FI progress) and the Scoreboard shows
    the six. Is four the right number there?
79. The discovery script now follows a general sales-discovery shape (situation,
    why now, cost of inaction, desired outcome, fit, next step). The VIS sales
    copy blueprint itself was not reachable from this session (the Drive
    connector would not open). Paste its question list or structure and the
    script can be matched to it line by line.
80. A partner's pay is asked as take-home only (plus hourly or salary and how
    often). Should the partner also get the before-tax question, so the tax
    picture is complete for a couple filing together?
81. The fit answers (cadence, who else weighs in, what would make it worth it)
    sit on the record and the summary only. Should the cadence pick set the
    program's session spacing, and should "who else" become a reminder to
    invite them to session 1?

