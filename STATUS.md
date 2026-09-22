# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-22

## Where it stands
- **93 → 37 rooms** with the Calendar back and the five readings of D-313. **D-318**
  the calendar, **D-317** the phone walk, a statement in (D-306), five inputs (D-312).
- **Facts are entered in the Ledger only (D-313)**: one owner per row. **New rooms**
  (D-316): The Bridge, Which Account, The Mix, The Documents, Left Behind; worst year
  is the Cushion's (D-314); pay to come (D-315).
- **The Solar System (D-320 to D-330)**: `docs/SOLAR-SYSTEM.md` is the spec; the data
  layer is in (180 levels, 184 recipes, 17 moons, 98 moves) and `shared/solar.js` reads
  it. Planets (`#planets`) is six planets by ten bands; a level opens to what it needs,
  56 facts are typed there (D-324), band 1's six sit in `household.sketch` (D-325), the
  unlocks tab shows each Tier 1 and 2 figure (D-327, D-329), a level can confirm
  (D-328), a band runs to a card (D-330).
- **D-321, D-326** no em dash; **D-319** rooms say how old their numbers are; **D-323** a link that names a field opens to the field.
- **Band 1 is answerable with no knowledge (D-336)**: `data/sketch_help.json` says
  its eighteen questions in plain words, with what counts, where to look, an
  add-it-up fold, a starting number, and "I am not sure" that writes no number.
- **Every question in the Planets can be answered (D-337)**: the 195 facts no room
  owned live at `levels.<planet>.<key>` through `shared/levelstore.js`, one control
  per kind. "Nowhere to type it yet" is gone.
- **The dashboard (D-338)**: a third tab on `#planets`: a ring and four tiles, bars
  by planet and by band, readings ready by tier, every reading the app can make with
  its figure, each against its normal range, and the radar.
- **This lane**: a card's annual fee (D-331); the radar on the Scorecard (D-332); the
  menu everywhere (D-333) with the Planets at its top (D-335); two ratios and the
  furthest-from-normal ranking (D-334); Amendment 1 audited in `docs/`.
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT shipped. Freeze holds (D-313).

## Next (top item first; one per session)
1. **Tier 3 readings and the moons.** Tiers 1 and 2 are worked out (53 of 184).
   Every fact now has a home (D-337), so this is engines, not storage.
2. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); is the income floor means-tested? (D-228, D-284.)
3. Paystub parser and monthly update: not built. `benefit_cliffs_2026.json` unverified.

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.
