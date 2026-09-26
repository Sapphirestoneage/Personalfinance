# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-26

## Where it stands
- **93 → 37 rooms**, the Calendar back, the five readings of D-313. The phone walk
  (D-317), a statement in (D-306), five inputs (D-312), no em dash (D-321, D-326).
- **Facts are entered in the Ledger only (D-313)**, one owner per row. New rooms (D-314
  to D-316): The Bridge, Which Account, The Mix, The Documents, Left Behind.
- **The Solar System (D-320 to D-330, D-342)**: `docs/SOLAR-SYSTEM.md` is the spec; 180
  levels, 184 recipes, 17 moons, 98 moves. Planets is six planets by ten bands with an
  Overview. Band 1 in plain words, the 195 ownerless facts at `levels.<planet>.<key>`
  (D-336, D-341). From main: on the cards (D-337), by place (D-338).
- **The standard (D-343)**: `docs/DESIGN.md`, 23 rules each with its check. Nothing moves
  under a finger (D-344): the toast left the bottom, a row holds its height through a tap,
  a field link keeps its field. DRAFTT draws as seven bullet bars (D-345), and the Cushion
  answers before it asks (D-346).
- **The audit (`docs/AUDIT.md`)**: the app walked twice, as a beginner and as a coach;
  every finding says what was done.
- **Plain words on every box (D-347, D-351)**: the five sentences on all 84 typed rows and
  the 51 what-if boxes. Gated at Flesch-Kincaid 6; the set reads at 3.8.
- **Pictures the reader owns (D-348 to D-352)**: `shared/chartbox.js` gives a number set
  the honest shapes for its kind, eight validated colour orders and a table twin. EVERY
  picture in the app goes through it now.
- **Tier 3, the Breakdown (D-353)**: the twenty readings worked out.
- **Both owner questions answered (D-354, D-355)**: a room asks inline only for the one
  fact it is blocked on, in the Ledger's own plain words, and everything else it reads is
  a link; the later floor is flat, with the means-tested taper named as the next reading.
- **This lane, earlier**: a card's annual fee (D-331); the radar (D-332); the menu
  everywhere (D-333, D-335); two ratios and the ranking (D-334).
- **Main is worked on by another lane**: merge before every push. D-228's reframe has NOT
  shipped. Freeze holds (D-313). Coach Mode is its own lane in `coach/` (D-339) and the
  Marketing Scoreboard in `marketing/` (D-340), each with its own log.

## Next (top item first; one per session)
1. **Tier 4 and up, and the moons.** Tiers 1 to 3 are worked out (73 of the 184).
2. **Room by room against `docs/DESIGN.md`.** Four main screens and the measuring stick
   are done; the Cushion and The Close are next.
3. **The means-tested taper** (D-355), behind a switch, once `data/benefit_cliffs_2026.json`
   is verified rather than recalled. `test/run.js` fails the day it is, so it cannot be
   forgotten. Then D-228's reframe: the FI target falls out of the draw.

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.
