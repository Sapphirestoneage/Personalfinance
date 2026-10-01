# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-10-01

## Where it stands
- **93 → 37 rooms**: the merge programme with the Calendar back plus the five readings of
  D-313. `docs/room-map.json` is the cut list. D-318 the calendar; D-317 the phone walk.
- **The five-input opening (D-312)**; **facts are entered in the Ledger only (D-313)**, one
  owner per row; new rooms of D-316 (Bridge, Which Account, The Mix, Documents, Left Behind).
- **The Solar System (D-320 to D-330)**: `docs/SOLAR-SYSTEM.md` is the spec; 180 levels, 184
  recipes, 17 moons, 98 moves; Planets is six planets by ten bands; band 1 answerable with no
  knowledge (D-336, `data/sketch_help.json`).
- **This lane before the engine**: a card's annual fee (D-331), the radar (D-332), the menu on
  every page (D-333, D-335), two ratios (D-334), expenses on cards and by place (D-337, D-338).
- **The projection engine (D-341)**: `engine/` is one pure year-by-year run,
  `project(household, assumptions, blocks)` to rows, milestones (FI, Coast FI, the bridge gap,
  RMDs, the ACA cliff years) and warnings; `compare()` the deltas and the one headline
  sentence; `data/tax/` the verified 2026 tables, a source URL per value. Steps 1 to 5 of the
  owner's prompt are in; no room reads it yet. Tests: `node tests/engine/run.js`.
- **D-321, D-326** no em dash; **D-319** rooms say how old their numbers are.
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT
  shipped. Freeze holds (D-313). Coach Mode is its own lane in `coach/` (D-339); the
  Marketing Scoreboard in `marketing/` (D-340).

## Next (top item first; one per session)
1. **The engine, Steps 6 and 7 (D-341)**: the owner reviews the Step 5 results and supplies
   the golden household (`tests/engine/golden/`); then the Projection room (a freeze exception
   the owner must grant) and the rewiring of FIRE Lab, Decumulation, The Long Way Round, the
   levers and the dashboard, one room per commit, listing every number that disappears.
2. **Tier 3 readings and the moons.** Tiers 1 and 2 are worked out (53 of the 184). Three
   band-2 facts still have nowhere to live: the credit band, the extra put against debt, and
   how the household is arranged.
3. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); is the income floor
   means-tested? (D-228, D-284.)
4. Paystub parser and monthly update: not built. `benefit_cliffs_2026.json` unverified.

## Known open
- `test/run.js` has one date-dependent calendar check ("a day already gone") that fails on
  some days of the month on a clean tree; it predates the engine.
