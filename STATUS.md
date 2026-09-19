# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-19

## Where it stands
- **93 → 30 is the programme.** The reframe (D-228): you cannot size the
  mountain until you know how you come down it. The room test and the thirty
  are D-229 and `docs/room-map.json`, which `test/run.js` checks every run.
- **Four of six merges done; 92 registry rooms → 76.** D-230 the Ledger,
  D-232 The Cushion, D-231 What The Next Dollar Does, D-233 The Scorecard.
  Every old URL redirects, hash and all.
- **Up next and the map (D-234, D-235).** The front page leads with what is
  open and which FIRE tier the pot has reached; the FIRE room opens with the
  map — ladder, tiers, back half, you are here, four paced routes.
- **The panel round (D-236 to D-241).** Three rounds, seven lenses, in
  `PANEL_REVIEW.md`; fixes and what is left in `PROGRESS.md`. Six of seven
  lenses finished at 8+, Donegan at 7. The Scorecard had been dropping three
  of its nine numbers behind a banner blaming `data/`; every per-hour figure
  rendered `$0.00`; the front door and the ladder gave one household two
  different next steps; the home room told a first-time visitor they
  understand 0% of their life. All fixed. Four claims struck as wrong on
  checking; four items left to the owner.
- Ledger rework brief: built through Phase K; H6, I6, I7, I8 wait.

## Freeze
- ON. The panel round added no room, field, lens or lever, and took a
  percentage, six counters and a thirteen-item list off the zero state.

## Next (top item first; one per session)
1. **Turn the Pages switch on.** OWNER, one click, and nothing anyone has
   built is usable until it happens. Settings → Pages → Deploy from branch
   → `main` / root. Also still on the owner: the domain (G1.1), a LICENSE.
2. **Which income figure is authoritative?** OWNER DECISION. Tested: $500 a
   month into `ledger.income[]` moves neither gross income nor the FI date —
   the headline numbers read only `people[].incomeSources[]` and no room
   writes one. Root of ARCHITECTURE problem #1, of `engines/taxroom.js:140`,
   and of the one lens below 8. Details in `PROGRESS.md`.
3. **Who owns Start Here's 17 fields when it retires into the Ledger?**
   OWNER DECISION. Blocks the last room of step 1; tangled with 2.
4. Step 5: the Decision Room shell, then goals, wedding, big purchase.

## Panel notes not yet answered
- The doors: five ways in where `index.html:19` says two. Tangled with 3.
- Galloway: model the means-tested floor. Can't Pay (D-238) is the interim.
- Donegan: no room is about building something that pays you.
