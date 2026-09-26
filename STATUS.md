# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-26

## Where it stands
- **93 → 37 rooms**, the Calendar back, the five readings of D-313. The phone walk
  (D-317), a statement in (D-306), five inputs (D-312), no em dash (D-321, D-326).
- **Facts are entered in the Ledger only (D-313)**, one owner per row. New rooms (D-316):
  The Bridge, Which Account, The Mix, The Documents, Left Behind (D-314, D-315).
- **The Solar System (D-320 to D-330)**: `docs/SOLAR-SYSTEM.md` is the spec; 180 levels,
  184 recipes, 17 moons, 98 moves, read by `shared/solar.js`. Planets is six planets by
  ten bands, unlocks shows Tier 1 and 2, a level can confirm.
- **From main**: on the cards (D-337); by place (D-338), Expenses `#merchants` draws where
  all the money went and where the discretionary part went.
- **Anyone can answer it (D-336, D-341)**: band 1 in plain words, with an add-it-up fold
  and an "I am not sure" that writes no number; the 195 facts no room owned live at
  `levels.<planet>.<key>` through `shared/levelstore.js`.
- **The Planets dashboard (D-342)**: an Overview tab: a ring, four tiles, bars by planet
  and band, readings by tier, each against its normal range.
- **The standard (D-343)**: `docs/DESIGN.md`, 23 rules each with its check. No unrounded
  number reaches a screen, undo docks in the page, one row of tabs, small print folded.
- **Nothing moves under a finger (D-344)**: the toast left the bottom (it covered the
  walk's Next), a row holds its height through a tap, a field link keeps its field.
- **The measuring stick draws (D-345)**: DRAFTT is seven bullet bars on one axis, whose
  bands asked once. **The Cushion answers before it asks (D-346)**.
- **The audit (`docs/AUDIT.md`)**: the app walked twice, as a beginner and as a coach
  showing a client; every finding says what was done.
- **Plain words on every box (D-347)**: the five sentences (plain, means, where, close
  enough, if you are not sure) on all 84 typed rows, a "What is this?" fold in the Ledger.
  Gated at Flesch-Kincaid 6; the set reads at 3.8.
- **Pictures the reader owns (D-348, D-349, D-350)**: `shared/chartbox.js` gives a number
  set the honest shapes for its kind, eight validated colour orders and a table twin.
  Twenty-three rooms draw through it, every shell room among them.
- **This lane, earlier**: a card's annual fee (D-331); the radar (D-332); the menu
  everywhere (D-333, D-335); two ratios and the ranking (D-334).
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT
  shipped. Freeze holds (D-313). Coach Mode is its own lane in `coach/` (D-339) and the
  Marketing Scoreboard in `marketing/` (D-340), each with its own log.## Next (top item first; one per session)
1. **Finish the chart layer**: the rooms that still draw inline (about half the call
   sites) and the boxes outside the Ledger that want the five sentences (`docs/AUDIT.md`,
   "Still open").
2. **Room by room against `docs/DESIGN.md`.** Four main screens and the measuring stick
   are done; the Cushion and The Close are next.
3. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); income floor means-tested? (D-228, D-284.)

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.
