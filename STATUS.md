# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-19

## Where it stands
- **93 → 36 rooms**: the 32 of the merge programme (D-264..D-302) plus the
  four readings the Statement gave up in D-307, each a room now that reads
  the Ledger and writes nothing. `docs/room-map.json` is the cut list.
- **The five-input opening (D-306)**: `rooms/ledger.html#round-1` is one
  screen, five inputs, the FI date as a band, a coast date, the savings rate
  from take-home, three levers, a next card. Four synthetic households reach
  the answer in 6 to 10 taps and boxes (`test/opening.js`).
- **Facts are entered in the Ledger only (D-307)**: every per-account fact,
  the Roth and HSA contributions and switches, the marginal rate and the
  target mix are Ledger rows with one owner. The Statement is four sections
  and forwards every old anchor from its head; the stubs follow their readings.
- **New rooms**: The Bridge, Which Account (every box a what-if), The Mix,
  The Documents (tier 2), Left Behind (a plan tagged `old_401k` proposes its
  balance, D-310). The worst plausible year is the Cushion's (D-308). The pay
  still to come sits beside net worth, on a switch on by default under 40 (D-309).
- **Main is worked on directly by another lane**: merge it before every push.
  The reframe D-228 asks for has NOT shipped. Freeze: five rooms added, each
  replacing a reading or a card the Statement lost; screens unchanged (D-307).

## Next (top item first; one per session)
1. **OWNER DECISION: inline asks elsewhere.** D-307 applies "facts are entered
   in the Ledger only" to the Statement and the carved rooms; the Cushion,
   Income, Protection and FIRE still ask a row inline (D-207). One door, or two.
2. **OWNER DECISION: which intake survives?** Round 1 is the opening; All at
   once and Start Here remain.
3. **OWNER DECISION: is the income floor means-tested?** (D-228, D-284.)
4. The paystub parser and the monthly update: not built; the hook is on the
   opening. `data/benefit_cliffs_2026.json` is still `unverified`.

## Known open
- Nothing. Every CI step is clean on this tree, browser gates included.

## Panel notes
- Galloway: the floor, item 3. Hormozi: the opening is the one screen in front of the library. Donegan: the pay still to come is the figure that matters at 25.
