# STATUS (keep under 40 lines; /wrap rewrites it)

Updated: 2026-09-24

## Where it stands
- **Coach Mode is built (D-338 to D-345)** on branch
  `claude/coach-mode-spec-build-86qskf`, not yet on `main`. Spec:
  `docs/COACH-MODE.md`; the later portal: `docs/COACH-MODE-LATER.md`.
  Off unless Settings' switch (or `?coach=1`) is on; the public site is unchanged.
  - Profiles (D-339): a household per client under `slaf.p.<id>.`; the personal
    household keeps today's keys, untouched. Sealed backups per client or all.
  - `coach/` holds three screens and nothing more: Home (roster, demo client,
    sheet import), Session (path, embedded room, rail, detour, quick entry,
    notes, homework, recap), Client View (life map, goals, what changed,
    homework, check-in). `engines/session.js` and `engines/quickentry.js`.
  - Guards: no coach note reaches Client View or any export; no tracked file
    carries the coach export signature; `.gitignore` refuses coach files.
- **93 → 37 rooms**; the five-input opening (D-312); facts in the Ledger only
  (D-313); the Solar System (D-320 to D-330); band 1 in plain words (D-336);
  an expense's card and the bonus it can reach (D-337).
- **Main is worked on by another lane**: merge before every push. Freeze holds
  for `rooms/` (D-313); `coach/` is the one exception (D-338).

## Next (top item first; one per session)
1. **Owner: try Coach Mode with the demo client**, then merge the branch.
   Open questions for the owner: is "match 4%" in quick entry right as dollar
   for dollar up to 4% of pay? Check-in status windows (in by 35 days, late by
   65) right for a monthly rhythm?
2. **Tier 3 readings and the moons.** Three band-2 facts still have nowhere to
   live: the credit band, the extra put against debt, the household arrangement.
3. **OWNER DECISIONS held**: inline asks elsewhere (D-313 vs D-207); is the
   income floor means-tested? (D-228, D-284.)
4. Paystub parser and monthly update: not built. `benefit_cliffs_2026.json` unverified.

## Known open
- The client portal (logins, a server) is deliberately not built: see
  `docs/COACH-MODE-LATER.md`. `tests/a11y-audit.js` does not list the coach
  screens (it reads `rooms.json`); axe was run on them by hand, clean.
