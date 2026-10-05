# Progress

Updated: 2026-10-05

## Done
- Level 0 Skeleton: units, formatting, states and sources, journal with undo and redo,
  record and store with schemaVersion 2 and two migrations, export/import with a
  pre-import snapshot, Sun hub with contract enforcement, the shell (routes, view
  toggle, autosave, quick notes, shortcuts), Home with household facts.
- Gates: `node tests/run.js` (engine tests + lint) and `node tests/ui.js` (Playwright sweep + Level 0 flow).
- Design critique round 1 found 17 fixes; all applied; round 2 in screenshots/level-0/critique.md.

## Next
- Level 1 Capture: the Ledger (one table per row type from data/fields.json), keyboard
  entry, situation gate, card and fund prefill, defaults as estimates, Jordan entered
  keyboard-only and round-tripped.

## Open issues
- The root SPARKS suite has one date-dependent failure that predates this lane
  ("with its as-of day and source", expects "typed confirmed" for an as-of of 2026-09-02).
  Not this lane's to fix; noted for the owner in QUESTIONS.md.

## Timings
- Keyboard-only Jordan entry: not yet measured (target under 20 minutes).
