# Amendment 1, audited against the app that exists

Written by the lane that was building the Statement split and the entry
polish, not the lane building the Solar System. Read it beside
`docs/solar-system-amendment-1.md`.

The amendment exists because the master prompt was written as if the entry
system were new. Some of the amendment has the same blind spot: several of
the things it asks for are already built and have been for months, under
names it does not use. Building them again would produce a second copy of a
number, which is the one thing `CLAUDE.md` forbids outright.

This file says, item by item, what is live, what is a real gap, and what is
blocked on something nobody has. Nothing here overrides the amendment: where
an item is live, the job is to check it against the amendment's rules and fix
the difference, not to start again.

## Already built. Do not rebuild; check and fix the difference

| Amendment | Where it already lives |
|---|---|
| **C. DRAFTT, defined** | `data/bands.json` is exactly the file the amendment specifies: one entry per letter, a `sources` map with `slaf`, `trench`, `moneyguy` and `fiftythirty`, each with `low`, `high`, `note` and `basis` where it differs, and a `default`. `engines/draftt.js` is the engine. The scorecard screen is `rooms/financial-snapshot.html#draftt`, seven rows, share, band, verdict word, link to the owning room. The source picker is buttons, stored under `prefs`. D-173. |
| **A1. Not for me** | Stored distinctly as `household.notApplicable[fieldId]`, never as null and never as none. Written through `Spine.setNotApplicable`, offered by `Ownership.naButton`, read back by `Ownership.describe` as "n/a" with the reason. D-130. |
| **A2. Privacy line and disclaimer** | Every room carries `.disclaimer`; `shared/progress.js` prints the privacy receipt, which counts requests to any other origin this session, on every page. H7, D-212. |
| **A3. The Ledger's progression survives** | All of it: the six doors (`#doors-home`), Express (`#all-at-once`), arrangements (`#arrangements`), the route checklist (`#route`), snapshots and since-last-time (`#since-last-time`), find-a-row, the assumptions drawer, and the three kinds of number (know, lookup with where to find it and "roughly for now", computed with inputs linked) in `data/ledger-rows.json`. |
| **A5. The route checklist** | Live at `rooms/ledger.html#route`, with its rules: nothing locked, any order, a step is done when the person says so, "not for me" moves the bar. |
| **A7. data/settings.json** | This is `data/features.json`: four groups (Accuracy, Household, Horizon, Advanced), the phenomena as switches, defaults-on for the beginner path. |
| **A7. data/rooms.json** | This is `rooms.json` at the root, generated from `shared/registry.js` by `tools/rooms-json.js`, plus the sidebar groups in the registry. |
| **A7. data/arrangements.json** | This is `data/layouts.json`: twenty arrangements, each with a premise, what it reads well and what it costs. |
| **B1. healthScore with sub-scores** | `engines/health.js`, scored by pillar from the ratio rows, every pillar decomposable to the ratios behind it, a pillar with nothing computable absent rather than zero. |
| **B1. fooStep** | `Foo.evaluate(h, tables).placement` is the step the person is standing on; `stoppedAt` and the flags come with it. `slotFirst` is the separate next action. Both already ship. |
| **B8. The therapy line** | `therapyMonthly`, its own row, behind a toggle, subtracted from wants so nothing double counts. |
| **B8. Debt reasons to keep it** | `keepReasons` on every debt, multi-select, with `excludeFromAggressive` as the per-debt toggle the reasons inform and never trigger. D-132. |

## Real gaps, in the order they are worth doing

1. ~~**B2, five ratios.**~~ **Done, D-334**, with two corrections to the
   amendment. `consumerDebtRatio`, `investmentRate` and
   `furthestFromNormal` are built. `basicLiquidity` was already live as
   `liquidityRatio` (liquid assets over the full month), so it was not built
   twice; the amendment says `runwayMonths` uses a bare-bones month, and in
   this app it does not, it uses the full month too. The bare-bones figure
   lives in `shadowRunway` and in `expenses.floor`. `mortgageQualRead`
   belongs inside the housing room's mortgage capacity, not the ratio table,
   and is still to do.
2. **B1, `pointValue` and `lowBalanceDate`.** Both are derived from figures
   already entered and ask nothing new.
3. **A4, three arrangements.** The twenty in `data/layouts.json` do not
   include by band (the Sky), by DAITE door, or by the nine spheres, and the
   amendment names all three as ones to ship.
4. **B3, expense classification.** The three-path tag (personal, linked to an
   income source, reimbursable) is a stored-shape change on the expense line,
   and it is a correctness fix: reimbursable spending inflates the FI number
   today.
5. **B4 to B7**, the dates, the investing numbers, the protection dollars in
   dollars, and the age-keyed contribution limits. Each is cheap once its
   inputs exist; none is blocked.

## Blocked on something nobody has

- **B1, `successRate` and `worstStartYear`.** A historical-sequence backtest
  needs a year-by-year return series, and the repo has none:
  `data/return_bands.json` holds percentiles, not a sequence. Inventing one
  would produce a believable wrong number about survival, which is the worst
  class of error this app can make. It needs a dated, sourced series in
  `data/` first, with the same provenance fields every other table carries.

## One thing to settle before step 3

The amendment says the Sky is one arrangement of the Ledger's rows, and the
Ledger's own rows are `data/ledger-rows.json` (90 rows, each with an owner,
a door, a level and a sphere). The Solar System ships `data/levels.json`
(180 levels). Nobody has yet said how a level maps to a row. Until that is
written down, the two are separate stores of the same facts, which is the
duplicate this app is built to refuse. It is one table, and it belongs
beside the levels in step 2's migration.
