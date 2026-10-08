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
46. The next-unlock ranking weighs a chart at two, a solid number at one, a
    rough number at 0.6 and a lens at one. On an empty client that puts a
    first account (balance sheet, allocation and bucket charts) ahead of the
    first job or spending line. Keep the engine's answer, or pin Income first?
47. The client sees every chart until the coach unticks "Client sees" on a
    chart. Start with none visible instead, like the lenses?
48. The copy lint bans "unlock" as a marketing word; the brief names the
    feature with it (Unlock Map, Next unlock). The files that draw it are now
    exempt; data copy is still checked. Fine, or pick another word?
49. The headline six are savings rate, FI date, FI progress, runway, debt-free
    date (net worth when there is no debt) and picture completeness. Net worth
    stays off the six for someone starting below zero; Coach can swap any tile
    with "Choose the six". Keep that default, or put net worth back?
50. The money date is one screen both views can run: the client alone, or
    the coach on a short call. After graduation (session 12) the app does not
    push either way. Should the maintenance tier be "run it alone, call if a
    tile slips" or always a 15-minute call?
51. "Did" against "market": a balance move counts as what the client did up
    to the contributions the row promises over the elapsed time (at the
    row's own monthly contribution), and the rest as the market. A hand-saved
    balance with no contribution behind it counts entirely as did. Fair rule,
    or should the coach be able to mark a line as market?
52. A session's "introduces" list is read from firstSession in the registry
    and the chart catalog, not stored in curricula.json. Session 10 introduces
    nothing new (it is the review before the flex session). Fine?
53. The bands name their sources (common guidance, 50/30/20, Scott Trench,
    Mr. Money Mustache, Money Guy, Ramit Sethi, the 30% rule, three to six
    months) and every one is flagged verify. Which rule should be the default
    for each number, and which sources to drop?
