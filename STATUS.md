# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-19

## Where it stands
- **The panel round is done.** `PANEL_REVIEW.md` holds three rounds through
  seven lenses; `PROGRESS.md` holds the fixes and what is left. Six of seven
  lenses finished at 8+, Donegan at 7. Nineteen defects fixed (D-234 to
  D-239), four panel claims struck as wrong on checking, four left to the
  owner. `node test/run.js` 31,170 checks; all 95 pages swept at 390px with
  no console error.
- **What mattered most.** The Scorecard dropped three of its nine numbers
  behind a banner blaming `data/`; every per-hour figure rendered `$0.00`;
  the front door and the ladder gave one household two different next steps;
  the home room told a first-time visitor they understand 0% of their life.
- **93 → 30 is still the programme.** Four of six merges done; 92 registry
  rooms → 76. D-228 is the reframe, `docs/room-map.json` the cut list.
  Nothing this session added a room, field, lens or lever.

## Freeze
- ON, and honoured: a percentage, six counters and a thirteen-item list all
  gone from the zero state; the one new flag competes for an existing slot.

## Next (top item first; one per session)
1. **Which income figure is authoritative?** OWNER DECISION NEEDED, and the
   biggest left. Tested: $500/month into `ledger.income[]` moves neither
   gross income nor the FI date — the headline numbers read only
   `people[].incomeSources[]`, and no room writes one. Income growth can be
   modelled, not recorded. Root of ARCHITECTURE problem #1, of the Tax
   room's effective rate (`engines/taxroom.js:140`) and of the Donegan
   score. Details in `PROGRESS.md`.
2. **Who owns Start Here's 17 fields when it retires into the Ledger?**
   OWNER DECISION NEEDED. Blocks the last room of step 1; tangled with 1.
3. Step 5: the Decision Room shell — one shell, five outputs on every block,
   then goals, wedding and big purchase before any deep module.
4. Step 6: the Back Half, once the shell has stopped moving. D-228 is its brief.

## Panel notes not yet answered
- The doors: five ways in where `index.html:19` says two. A product call,
  tangled with 2.
- Galloway: model the means-tested floor. Can't Pay (D-236) is the interim.
- What the FI date compounds and what the withdrawal rate subtracts: both
  say their basis on screen now (D-236, D-239); both are still decisions.
