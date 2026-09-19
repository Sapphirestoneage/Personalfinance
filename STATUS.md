# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-19

## Where it stands
- **93 → 30 is the programme** (D-228, D-229, `docs/room-map.json`, checked by
  `test/run.js` every run). Four of six merges done (D-230 to D-233); every
  old URL redirects. Registry: 78 rooms.
- **Fill Mode, this session (D-264, D-265, D-266), the owner's brief.** Every
  Ledger row has one state (known, rough, unknown, na, computed, empty), read
  from the facts it already carried; `shared/fill.js`. The Dashboard opens
  with the Next card: a finish line to a working plan, the one row most worth
  filling, two after it, four buttons (Save, Roughly, Don't know yet, Not for
  me), a ballpark helper, one sentence on what moved. Rough never returns to
  the queue; unknown returns when the plan is complete or after 14 days
  (Settings). Loose Ends (`rooms/loose-ends.html`, under the Ledger, with a
  badge) lists every rough, unknown and stale row with the same editor; view
  rooms open with a reads-from strip linking each field to where it is filled.
- **Found, not fixed (owner's call).** The Ledger's all-at-once view draws
  each debt and account row twice and only the last copy saves (the deep
  link lands on it). `test/settings.js`'s heading check fails on the Backup
  card (D-202), which sits under the four headings.

## Freeze
- ON. Loose Ends was added on the owner's brief, held under the Ledger.

## Next (top item first; one per session)
1. **Turn the Pages switch on.** OWNER, one click: Settings → Pages → Deploy
   from a branch → `main` / root. Also the domain (G1.1), a LICENSE (G3.14).
2. **Which income figure is authoritative?** OWNER DECISION (`PROGRESS.md`).
3. **Who owns Start Here's 17 fields once it retires into the Ledger?**
   OWNER DECISION. Blocks the last room of step 1; tangled with 2.
4. Fix the Ledger's doubled item rows, then step 5: the Decision Room shell.
5. Step 6: the Back Half, once the shell has stopped moving (D-228).

## Panel notes not yet answered
- The doors: five ways in where `index.html:19` says two. Tangled with 3.
- Galloway: model the means-tested floor. Can't Pay (D-240) is the interim.
- Donegan: no room is about building something that pays you.
- Hormozi: thirty is still a library. D-234 and D-235 are the first answer.
