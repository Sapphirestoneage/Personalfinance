# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-20

## Where it stands
- **93 → 37 rooms**: the 32 of the merge programme with the Calendar back
  (D-308) plus the five readings of D-313. `docs/room-map.json` is the cut list.
- **The calendar, redrawn (D-318)**: a phone calendar, one grid for both
  readings. **The phone walk, round two (D-317)**: Comfortable or Compact,
  the menu's dots explained, the ask rests or retires, the gap as a chip.
- **The five-input opening (D-312)**: `rooms/ledger.html#round-1` is one
  screen, five inputs, the FI date as a band; 6 to 10 taps (`test/opening.js`).
- **Facts are entered in the Ledger only (D-313)**: every per-account fact is
  a Ledger row with one owner. The Statement is four sections.
- **New rooms**: The Bridge, Which Account, The Mix, The Documents, Left
  Behind (D-316). Worst plausible year is the Cushion's (D-314); pay still to
  come beside net worth (D-315).
- **From main**: a statement in (D-306); the Calendar (D-308); all three
  intakes stay (D-309); plain words (D-310, D-311).
- **The Solar System, step 1 (D-320)**: `docs/SOLAR-SYSTEM.md` is the spec.
  The data layer is in: 180 levels, 184 recipes, 17 moons, 98 moves, defaults,
  benchmarks, the lexicon; `test/solar.js` lints it. No UI yet, by the spec.
- **The audits ported (D-319)**: every room says how old its numbers are; the
  example says so with a clear button; the front page is a lodge part-way.
- **Main is worked on directly by another lane**: merge it before every push.
  The reframe D-228 asks for has NOT shipped. Freeze holds (D-313).

## Next (top item first; one per session)
1. **Solar System step 2: the engine.** The value store (number, none, rough,
   unknown), the recipe evaluator, band and tier with shrinking planets,
   give-or-take bands, the migration from the Ledger. Then band 1 end to end.
2. **OWNER DECISION: inline asks elsewhere** (D-313 vs D-207). **Is the income
   floor means-tested?** (D-228, D-284.)
3. Paystub parser and monthly update: not built. `benefit_cliffs_2026.json` unverified.

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.

## Panel notes
- Galloway: the floor, item 2. Hormozi: the opening is the one screen in front of the library. Donegan: the pay still to come is the figure that matters at 25.
