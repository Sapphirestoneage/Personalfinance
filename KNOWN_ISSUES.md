# Known issues

An honest list, ranked by how much each one matters to someone using or extending SLAM. Written
2026-10-23 during the cleanup pass (see `docs/AUDIT.md`); every item was checked against the code
on that date. Nothing here is hidden behind a nicer word.

## Correctness and data

1. **Tax constants are partly from memory.** `slam/src/data/tax-constants.json` holds 2026 federal
   brackets, the standard deductions and FICA. The decision log (S-008) says the lower brackets and
   standard deductions were checked against published summaries, but the higher brackets, the head of
   household brackets and the Social Security wage base were entered from memory and flagged. State
   tax is not estimated at all; every take-home guess says so on screen.
2. **Spending averages and benchmarks are placeholders.** `spending-averages.json` and
   `benchmarks.json` carry made-up or unverified figures, marked as such in the files and labeled
   "Guess" in the app (S-020). They should not be quoted to a client as fact.
3. **Floating-point money.** Amounts are stored as the dollars a client typed and rounded only for
   display (S-009). Totals built from many fractions are rounded with `r2` or `r2Exact` in
   `slam/src/engines/money.js`; two engines keep their own variants because they differ in how a
   negative zero is treated (`split.js`, `dream-life.js`). This works and the tests compare to the
   cent, but a future engineer may prefer integer cents, which is what the earlier generations used.
4. **Everything lives in one browser.** The household is in `localStorage`; there is no server, no
   sync and no second copy unless the coach exports a file. A cleared browser loses the data. Export
   and import are versioned and an import snapshots first (S-004), but nothing reminds the coach to
   export.
5. **Merge conflicts wait for a human.** Importing a file for a client already present merges record
   by record (`slam/src/store/merge.js`); a record changed on both sides is a conflict the coach has to
   pick. There is no automatic resolution and the conflict screen has had little real use.

## Rough edges in the app

6. **Only four bank CSV layouts are recognized** (Chase card and checking, American Express, Capital
   One) plus any file with date, description and amount columns. OFX and QFX are not read. See
   `slam/PARKING_LOT.md`.
7. **"Per paycheck" expenses follow the first income's pay schedule**, even when a household has
   two incomes on different schedules (`slam/PARKING_LOT.md`).
8. **The tax guess treats each gross-only income separately**, each taxed from the bottom bracket
   (S-013), so two gross-only incomes understate the tax. The W-2 case with typed take-home is
   unaffected.
9. **No accessibility audit has been run on SLAM.** The retired SPARKS generation had an axe-core
   audit (archived under `archive/sparks/tests/`); SLAM has layout and journey checks but no
   screen-reader or contrast pass.
10. **The phone layout is checked against limits, not against people.** `tools/layout-check.mjs`
    fails a screen taller than six phone screens or with an input in the wrong place, and the five-task
    test in `slam/README.md` has not been run with a real person yet (the table is empty).

## Code and tests

11. **Exports that nothing imports.** Five engine exports have no caller anywhere
    (`money.js` `sum`, `chart-data.js` `trendCategories`, `coverage.js` `PARENTS_PLAN_LINE_TYPES`,
    `owning.js` `lockedIn`, `trends.js` `forecastAccuracy`) and about forty more are exported but used
    only inside their own file. They were left in place during the cleanup, which changed no
    behavior; removing or un-exporting them is a small follow-up.
12. **Screens still make small presentation decisions with numbers in them:** a $100 "big bill"
    label, a $1 tolerance on refund wording, a 10% blind-spot warning, hiding outflows under 50 cents
    (`slam/src/ui/charts/cash-charts.js`, `screens/setup-basics.js`, `screens/insights.js`). The
    cleanup moved every computed figure into the engines; these thresholds are wording choices and
    stayed where the wording is. If they start to feel like rules, they belong in an engine constant.
13. **Playwright checks hard-code port 8765.** `tools/screens-check.mjs`, `journeys.mjs` and
    `layout-check.mjs` expect `slam/` served at `http://localhost:8765/` unless `SLAM_URL` is set.
    The archived SPARKS gates hard-code the same port for a different root, so the two cannot run at
    once without the variable.
14. **Two archived SPARKS tests are not portable.** One expects a date twelve weeks out and depends
    on the machine's time zone; the XSS ratchet keys its baseline by forward-slash paths and sees
    every file as new on Windows. Both pass on Linux and in CI. The archived `statement.js` browser
    gate also fails a phone-height check by 23 pixels on the cleanup machine while passing in CI,
    which points at font metrics rather than the app.
15. **The Lane 2 harness rewrites tracked files** (`archive/sparks/tests/reports/*.json`,
    `archive/sparks/docs/lane2-findings.md`) every run. Restore them with git after running it.
16. **The archived SLAM self-audit has one wrong row.** `slam/AUDIT.md` (lesson 3, 2026-10-15) says a
    scan of the UI found only layout math; the 2026-10-23 audit found fourteen finance computations,
    which step 3 of the cleanup moved into the engines. The row is kept as written because the file is
    a dated log; `docs/AUDIT.md` has the correction.

## Repository and process

17. **Two SLAM branches are open and not on `main`.** `claude/slam-phase-1-foundation` and
    `claude/slam-phase-2` add a Ledger and Dashboard beside the Budget inside `slam/` with their own
    `engine/` and `ui/` folders. They touch none of the Budget's source files, so they will merge, but
    the result would be two math libraries inside one app until they are reconciled.
18. **The reference data has no refresh calendar.** Tax constants and averages are versioned by year
    in their files but nothing flags when a new year's figures are due. The retired generation kept a
    calendar (`archive/sparks/docs/data-refresh-calendar.md`); SLAM does not yet.
19. **No license file.** The repository is public and has no `LICENSE`. Until one is added, the
    default is "all rights reserved", which may not be what the owner intends.
20. **Hard-coded live paths remain in the archive.** Seventeen archived files name
    `/Personalfinance/` or the GitHub Pages host (D&D share links, one download button, two test
    strings, several documents). They still work because every old address redirects; they are listed
    in `docs/AUDIT.md`.
