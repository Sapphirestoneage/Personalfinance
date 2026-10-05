# Progress

Updated: 2026-10-05

## Done
- Level 1 Capture: data/fields.json (117 fields, 32 row types, one owner each), the Ledger
  table (inline editing, typed prefixes, sort, filters, keyboard flow, field bar, card and
  fund prefill, credits drawer), summary-or-detail, situation gate, national-average defaults,
  the orbit map on Home and per planet (MR-010), Jordan built through the record API and
  entered keyboard-only by a Playwright flow that compares 247 facts and round-trips the export.
- Level 0 Skeleton: units, formatting, states and sources, journal with undo and redo,
  record and store with schemaVersion 2 and two migrations, export/import with a
  pre-import snapshot, Sun hub with contract enforcement, the shell (routes, view
  toggle, autosave, quick notes, shortcuts), Home with household facts.
- Gates: `node tests/run.js` (engine tests + lint) and `node tests/ui.js` (Playwright sweep + Level 0 flow).
- Design critique round 1 found 17 fixes; all applied; round 2 in screenshots/level-0/critique.md.

## Next
- Level 2 Measure: contracts publishing to the Sun, projection to 95, 48 metrics, 19 lenses,
  8 charts, show-the-math drawers, Client view glossary, one-pager, Maya and Dev.

## Open issues
- The root SPARKS suite has one date-dependent failure that predates this lane
  ("with its as-of day and source", expects "typed confirmed" for an as-of of 2026-09-02).
  Not this lane's to fix; noted for the owner in QUESTIONS.md.

## Timings
- Keyboard-only Jordan entry (flow level1-jordan-keyboard-only): 33 rows and 8 household
  facts in 1,966 keystrokes, 12 seconds of machine time. At a brisk human pace of two
  keystrokes a second that is about 16 minutes, under the 20-minute target; a live timing
  with Eli at the keyboard is still owed (unverified).
