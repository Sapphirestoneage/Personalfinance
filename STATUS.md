# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-23

## Where it stands
- **93 → 37 rooms** with the Calendar back and the five readings of D-313. **D-318** the
  calendar, **D-317** the phone walk, a statement in (D-306), five inputs (D-312). No em
  dash (D-321, D-326); numbers say their age (D-319); a link opens to its field (D-323).
- **Facts are entered in the Ledger only (D-313)**: one owner per row. **New rooms** (D-316):
  The Bridge, Which Account, The Mix, The Documents, Left Behind; worst year is the
  Cushion's (D-314), pay to come (D-315).
- **The Solar System (D-320 to D-330)**: `docs/SOLAR-SYSTEM.md` is the spec; the data layer
  is in (180 levels, 184 recipes, 17 moons, 98 moves) and `shared/solar.js` reads it.
  Planets (`#planets`) is six planets by ten bands; a level opens to what it needs, 56
  facts are typed there (D-324), band 1's six sit in `household.sketch` (D-325), the
  unlocks tab shows Tier 1 and 2 figures (D-327, D-329), a level can confirm (D-328).
- **Band 1 is answerable with no knowledge (D-336)**: `data/sketch_help.json` says its
  eighteen questions in plain words, with what counts, where to look, an add-it-up fold,
  a starting number, and "I am not sure" that writes no number.
- **On the cards (D-337, from main)**: an expense says which card it went on; a card carries
  a bonus target (Debt); The Close's `#on-cards` says the rate, reach and pace.
- **Every question in the Planets can be answered (D-338)**: the 195 facts no room owned
  live at `levels.<planet>.<key>` through `shared/levelstore.js`, one control per kind.
- **The Planets dashboard (D-339)**: an Overview tab: a ring and four tiles, bars by planet
  and band, readings by tier, every reading with its figure, each against its normal range.
- **The standard (D-340)**: `docs/DESIGN.md`, 22 rules each with the check that holds it.
  No unrounded number reaches a screen (gated over every room), undo docks in the page,
  one row of tabs, small print folded, chips not link soup.
- **This lane**: a card's annual fee (D-331); the radar on the Scorecard (D-332); the menu
  everywhere (D-333) with the Planets at its top (D-335); two ratios and the
  furthest-from-normal ranking (D-334).
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT shipped. Freeze holds (D-313).

## Next (top item first; one per session)
1. **Tier 3 readings and the moons.** Tiers 1 and 2 are worked out (53 of 184).
2. **Room by room against `docs/DESIGN.md`.** The four main screens are done; the
   Scorecard and the Cushion carry the most numbers and are next.
3. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); income floor means-tested? (D-228, D-284.)

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.
