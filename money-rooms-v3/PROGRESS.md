# Progress

Updated: 2026-10-05

## Done
- Level 3 Session: leverage engine, next-question card, circle-back, my and their plates with
  Small wins, follow-up email, session snapshots, since last time; the Jordan mock session runs
  start to finish in Playwright (12 checks).
- Level 2 Measure: seven planets publish to the Sun; projection to 95 with Triple D; 48 metrics
  with show-the-math; 19 lenses; 8 D3 charts; Coach/Client glossary; one-pager that prints to one
  page; Jordan, Dev and Maya tie out to independent workpapers; invariants on 200 random households;
  Maya demo with two sessions and scenarios; Load demo client.
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
- Levels 4 to 6 are built (Simulate, Learn, Depth) and their first design critique rounds are
  running; fixes land, screens are re-shot, then each level gets its commit.
- Level 7: full design pass, accessibility basics, end-to-end mock session for Dev, final Maya
  screenshots, README, final report.

## Open issues
- The root SPARKS suite has one date-dependent failure that predates this lane
  ("with its as-of day and source", expects "typed confirmed" for an as-of of 2026-09-02).
  Not this lane's to fix; noted for the owner in QUESTIONS.md.

## Timings
- Maya recompute after a keystroke: 3.1 ms (flow level2-maya-recompute-under-100ms).
- Keyboard-only Jordan entry (flow level1-jordan-keyboard-only): 33 rows and 8 household
  facts in 1,966 keystrokes, 12 seconds of machine time. At a brisk human pace of two
  keystrokes a second that is about 16 minutes, under the 20-minute target; a live timing
  with Eli at the keyboard is still owed (unverified).
