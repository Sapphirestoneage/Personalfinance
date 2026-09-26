# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-26

## Where it stands
- **93 → 37 rooms**, the Calendar back, the five readings of D-313. The phone walk
  (D-317), a statement in (D-306), five inputs (D-312), no em dash (D-321, D-326),
  numbers say their age (D-319), a link opens to its field (D-323).
- **Facts are entered in the Ledger only (D-313)**, one owner per row. New rooms (D-316):
  The Bridge, Which Account, The Mix, The Documents, Left Behind; worst year is the
  Cushion's (D-314), pay to come (D-315).
- **The Solar System (D-320 to D-330)**: `docs/SOLAR-SYSTEM.md` is the spec; 180 levels,
  184 recipes, 17 moons, 98 moves, read by `shared/solar.js`. Planets (`#planets`) is six
  planets by ten bands, unlocks shows Tier 1 and 2, a level can confirm, a band runs to a
  card.
- **From main**: on the cards (D-337); by place (D-338), Expenses `#merchants` draws where
  all the money went and where the discretionary part went. Coach Mode is its own lane in
  `coach/` (D-339, `coach/STATUS.md`, `CD-###`).
- **Anyone can answer it (D-336, D-340)**: band 1 in plain words, with an add-it-up fold
  and an "I am not sure" that writes no number; the 195 facts no room owned live at
  `levels.<planet>.<key>` through `shared/levelstore.js`.
- **The Planets dashboard (D-341)**: an Overview tab: a ring, four tiles, bars by planet
  and band, readings by tier, each against its normal range.
- **The standard (D-342)**: `docs/DESIGN.md`, 23 rules each with its check. No unrounded
  number reaches a screen, undo docks in the page, one row of tabs, small print folded.
- **Nothing moves under a finger (D-343)**: the toast left the bottom of the screen (it
  covered the walk's Next after every answer), a row holds its height until the tap that
  took its focus has landed, a link that names a field keeps it while the room lands.
- **The measuring stick draws (D-344)**: DRAFTT is seven bullet bars on one axis, the band
  a stripe behind each, the figure and the verdict in words beside it; whose bands is
  asked once. **The Cushion answers before it asks (D-345)**.
- **This lane, earlier**: a card's annual fee (D-331); the radar (D-332); the menu
  everywhere (D-333, D-335); two ratios and the ranking (D-334).
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT
  shipped. Freeze holds (D-313).
## Next (top item first; one per session)
1. **Tier 3 readings and the moons.** Tiers 1 and 2 are worked out (53 of 184).
2. **Room by room against `docs/DESIGN.md`.** Four main screens and the measuring stick
   are done; the Cushion and The Close are next.
3. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); income floor means-tested? (D-228, D-284.)

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.
