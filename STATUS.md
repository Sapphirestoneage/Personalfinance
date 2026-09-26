# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-24

## Where it stands
- **93 → 37 rooms**: the 32 of the merge programme with the Calendar back plus
  the five readings of D-313. `docs/room-map.json` is the cut list. **D-318**
  the calendar redrawn; **D-317** the phone walk; a statement in (D-306).
- **The five-input opening (D-312)**: `#round-1`, five inputs, the FI date as a band.
- **Facts are entered in the Ledger only (D-313)**: one owner per row. **New rooms**
  (D-316): Bridge, Which Account, The Mix, Documents, Left Behind. D-314, D-315.
- **The Solar System (D-320 to D-324)**: `docs/SOLAR-SYSTEM.md` is the spec, the
  data layer is in (180 levels, 184 recipes, 17 moons, 98 moves), `shared/solar.js`
  reads it. Planets (`#planets`) is six planets by ten bands; a level opens to
  what it needs, 56 facts are typed there (D-324), band 1's six homeless facts
  live in `household.sketch` (D-325), the unlocks tab shows each Tier 1 and 2
  figure (D-327, D-329), a level can confirm (D-328), a band runs to a card (D-330).
- **D-321, D-326** no em dash; **D-319** rooms say how old their numbers are; **D-323** a link that names a field opens to the field.
- **Band 1 is answerable with no knowledge (D-336)**: `data/sketch_help.json` says
  its eighteen questions in plain words, with what counts, where to look, a
  starting number where one can be defended, and "I am not sure" writes none.
- **This lane**: a card's annual fee (D-331); the radar on the Scorecard (D-332);
  the menu on every page (D-333) with the Planets at its top (D-335); two ratios
  and the furthest-from-normal ranking (D-334), Amendment 1 audited in `docs/`.
- **On the cards (D-337)**: an expense says which card it went on; a card carries
  a bonus target (Debt); The Close's `#on-cards` says the rate, reach and pace.
  **By place (D-338)**: the log's note is the place; Expenses `#merchants` draws
  where all the money went and where the discretionary part went.
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT shipped. Freeze holds (D-313).
  Coach Mode is its own lane in `coach/` (D-339, `coach/STATUS.md`).
  The Marketing Scoreboard is its own lane in `marketing/` (D-340, `marketing/STATUS.md`).

## Next (top item first; one per session)
1. **Tier 3 readings and the moons.** Tiers 1 and 2 are worked out (53 of the
   184). Three band-2 facts still have nowhere to live: the credit band, the
   extra put against debt, and how the household is arranged.
2. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); is the
   income floor means-tested? (D-228, D-284.)
3. Paystub parser and monthly update: not built. `benefit_cliffs_2026.json` unverified.

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.
