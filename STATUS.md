# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-19

## Where it stands
- **93 → 30 is the programme.** The reframe (D-228): you cannot size the
  mountain until you know how you come down it, so the Back Half defines the
  target and The Number becomes a read-out of it. The room test and the
  thirty are D-229 and `docs/room-map.json`, which `test/run.js` checks
  against the registry every run. That map is the cut list: `absorbs` minus
  `done` is what is left, `held` says what is not moving yet, and why.
- **Four of the six merges are done; 92 registry rooms → 76.** D-230, the
  Ledger swallowed navigation. D-232, The Cushion is four readings of one
  number, seven field owners moved with their boxes. D-231, What The Next
  Dollar Does is one question at three amounts, the FOO step above all
  three. D-233, The Scorecard is six readings of the same entered numbers
  and opens on the plainest. Every old URL redirects, hash and all.
  `.slaf-hats` is the one reading strip; `part: true` in `shared/room.js`
  lets a template room become a reading.
- Ledger rework brief: built through Phase K; H6, I6, I7, I8 wait.
- **The panel round (D-238 to D-243).** Three rounds, seven lenses, in
  `PANEL_REVIEW.md`; fixes and what is left in `PROGRESS.md`. Six of seven
  lenses finished at 8+, Donegan at 7. The Scorecard had been dropping three
  of its nine numbers behind a banner blaming `data/`; every per-hour figure
  rendered `$0.00`; the front door and the ladder gave one household two
  different next steps; the home room told a first-time visitor they
  understand 0% of their life. All fixed, and `test/run.js` now fails if a
  page writes to an id its own markup does not carry. Four panel claims
  struck as wrong on checking; four items left to the owner.
- **Up next and the map (D-234, D-235).** The front page leads with what is
  open, which reading is the fewest answers away and the fields that open it
  (`shared/upnext.js`), and which FIRE tier the pot has reached. The FIRE
  room opens with the map (`engines/journey.js`): ladder, tiers, back half,
  you are here, and four paced routes from here; the flight plan draws it too.
- **Debt Payoff (D-236)** draws where the payment goes and what each fall
  frees: the freed minimum rolls onto the next debt, then it is all yours.
- **Plain words (D-237).** Every room title now carries a generated line:
  Shows: … Needs: …. The owner finds the house voice hard to read; new copy
  names the thing, the number and the unit. A room-by-room lede pass is
  open and the order is the owner's.
- **The path (D-244)** is the numbers, then the dashboard, then the readings;
  a decision room has no prev/next of its own. The owner's brief, 2026-09-19:
  treat it as financial planning software, readable by a third grader and a
  FIRE person alike; fewer words on the page, the rest behind an ⓘ; every
  score says what is good, why, and what to do; deeper questions behind an
  advanced level; a typed take-home pay; the car's used/new and running
  costs; a running-balance chart on the month. Queued in that order.

## Freeze
- ON, and the merge is how it is honoured: every session leaves fewer screens.

## Next (top item first; one per session)
1. **Turn the Pages switch on.** OWNER, one click, and nothing anyone has
   built is usable until it happens: Settings → Pages → Deploy from a branch
   → `main` / root. Also on the owner: the domain (G1.1), a LICENSE (G3.14).
2. **Which income figure is authoritative?** OWNER DECISION. Tested: $500 a
   month into `ledger.income[]` moves neither gross income nor the FI date —
   the headline numbers read only `people[].incomeSources[]` and no room
   writes one, so income growth can be modelled and not recorded. Root of
   ARCHITECTURE problem #1, of `engines/taxroom.js:140`, and of the one lens
   below 8. Details in `PROGRESS.md`.
3. **Who owns Start Here's 17 fields once it retires into the Ledger?**
   OWNER DECISION. Blocks the last room of step 1; tangled with 2.
4. Step 5: the Decision Room shell — one shell, five outputs on every block,
   then goals, wedding and big purchase before any deep module.
5. Step 6: the Back Half, once the shell has stopped moving. D-228 is its brief.
6. The room-by-room lede pass (D-237); the first journey end to end; a
   monthly close that prompts a backup.

## Panel notes not yet answered
- The doors: five ways in where `index.html:19` says two. Tangled with 3.
- Galloway: model the means-tested floor. Can't Pay (D-240) is the interim.
- Donegan: no room is about building something that pays you.
- Hormozi: thirty is still a library. D-234 and D-235 are the first answer.
