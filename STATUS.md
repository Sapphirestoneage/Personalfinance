# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-20

## Where it stands
- **93 → 37 rooms**: the 32 of the merge programme with the Calendar back
  (D-308), plus the five readings the Statement gave up in D-313, each a room
  that reads the Ledger and writes nothing. `docs/room-map.json` is the cut list.
- **The five-input opening (D-312)**: `rooms/ledger.html#round-1` is one
  screen, five inputs, the FI date as a band, a coast date, the savings rate
  from take-home, three levers, a next card; four synthetic households reach
  the answer in 6 to 10 taps and boxes (`test/opening.js`).
- **Facts are entered in the Ledger only (D-313)**: every per-account fact,
  the Roth and HSA contributions and switches, the marginal rate and the
  target mix are Ledger rows with one owner. The Statement is four sections
  and forwards every old anchor from its head; the stubs follow their readings.
- **New rooms**: The Bridge, Which Account (every box a what-if), The Mix,
  The Documents (tier 2), Left Behind (a plan tagged `old_401k` proposes its
  balance, D-316). The worst plausible year is the Cushion's (D-314). The pay
  still to come sits beside net worth, on a switch on by default under 40 (D-315).
- **From main**: a bank or card statement in (D-306); the Calendar with your
  own dates (D-308); all three intakes stay (D-309); plain words (D-310, D-311).
- **The stranded audits ported (D-317)**: every room says how old its numbers
  are; the example household says so on every screen, with a clear button; the
  front page part-way through is a lodge. PRs #3, #4, #15 closed as superseded.
- **Main is worked on directly by another lane**: merge it before every push.
  The reframe D-228 asks for has NOT shipped. Freeze holds (D-313).

## Next (top item first; one per session)
1. **OWNER DECISION: inline asks elsewhere.** D-313 applies "facts are entered
   in the Ledger only" to the Statement and the carved rooms; the Cushion,
   Income, Protection and FIRE still ask a row inline (D-207). One door, or two.
2. **OWNER DECISION: is the income floor means-tested?** (D-228, D-284.)
3. Paystub parser and monthly update: not built. `benefit_cliffs_2026.json` unverified.

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.

## Panel notes
- Galloway: the floor, item 2. Hormozi: the opening is the one screen in front of the library. Donegan: the pay still to come is the figure that matters at 25.
