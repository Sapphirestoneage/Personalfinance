# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-20

## Where it stands
- **93 → 37 rooms**: the 32 of the merge programme with the Calendar back plus
  the five readings of D-313. `docs/room-map.json` is the cut list. **D-318**
  the calendar redrawn; **D-317** the phone walk.
- **The five-input opening (D-312)**: `#round-1` is one screen, five inputs,
  the FI date as a band; 6 to 10 taps (`test/opening.js`).
- **Facts are entered in the Ledger only (D-313)**: one owner per row. **New
  rooms** (D-316): The Bridge, Which Account, The Mix, The Documents, Left
  Behind. Worst year is the Cushion's (D-314); pay to come (D-315).
- **From main**: a statement in (D-306); all three intakes stay (D-309).
- **The Solar System (D-320 to D-324)**: `docs/SOLAR-SYSTEM.md` is the spec; the
  data layer is in (180 levels, 184 recipes, 17 moons, 98 moves, defaults,
  benchmarks) and `shared/solar.js` reads it. The Ledger's seventh hat, Planets
  (`#planets`), shows six planets by ten bands; every level opens to what it
  needs, 56 facts are typed there through their owner (D-324), band 1's six
  homeless facts live in `household.sketch` (D-325), the unlocks tab shows each
  Tier 1 and Tier 2 reading's figure from `engines/recipes.js` (D-327, D-329),
  and a level can confirm rather than collect (D-328). Band 1: 20 of 24 in
  place. The FI date reads both ways, the plan's and what you actually save.
- **D-321, D-326** no em dash in any spelling; **D-319** rooms say how old their numbers are.
- **A link opens to the field (D-323)**: an `#anchor` lands the question at the top, cursor in it.
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT shipped. Freeze holds (D-313).

## Next (top item first; one per session)
1. **Tier 3 readings and the moons.** Tiers 1 and 2 are worked out (53 of the
   184). Three band-2 facts still have nowhere to live: the credit band, the
   extra put against debt, and how the household is arranged.
2. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); is the
   income floor means-tested? (D-228, D-284.)
3. Paystub parser and monthly update: not built. `benefit_cliffs_2026.json` unverified.

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.

## Panel notes
- Galloway: the floor, item 2. Hormozi: the opening is one screen in front of the library. Donegan: the pay still to come matters at 25.