# Progress

Updated: 2026-10-08

## Done
- Level 12 amended (MR-065): satisfaction on the client's six (asked at every close and money date),
  worth-it per area with value-per-dollar flags steering the targets, the worth-it lens and chart, the
  satisfaction trend with the stress checkpoints, and the money date as a coach-run fifteen-minute
  curriculum through the session runner with a prep card and the maintenance tier after session 12.
- Level 12 The Scoreboard (MR-063): data/metrics.json as the one registry (group, direction, bands with
  sources, ladders, lens, chart, what opens it, visibility, gentle copy, first session, headline), eight
  new metrics (engine/scoremetrics.js), the chart catalog (data/charts.json) with seven new charts,
  graph explain, engine/momentum.js (snapshots, trends, why it moved as learned, did, market, time,
  milestones celebrated once, personal bests, next action, the headline six), #/scoreboard, #/map,
  #/money-date, the metric drawer's new section, prep, one-pager, email and Home tie-ins, five engine
  test files with a workpaper for the did and market split and Maya through session 4, a browser flow
  with both themes, 14 new screens in the sweep. Phone feedback (MR-062): the row drawer as a form,
  visible empty numbers, the tracker says what a fact opens, an orbit caption.
- Level 10 The Program: curricula as data (discovery and twelve sessions of blocks with priorities and
  time ranges), engine/curriculum.js (plan, bend at 35 and 48, offer one more when ahead, go deeper,
  urgent mode, three steps), engine/program.js (state, moves, parking lot, checklist with triggers and
  the session split, stress, readiness against data/knowledge-targets.json, the program rows),
  engine/transactions.js (CSV, mapper, clean, categorize, detect, patterns, actuals, blind spot,
  found money, apply), engine/outcomes.js (scorecard, blind guess test, before and after, testimonial),
  the session runner at #/call, #/prep, #/program, #/transactions, the stress question on the discovery
  form, Session N of 12 on Home, 25 engine tests with a hand-written 60-day CSV, a browser flow.
- Level 11 Goal Timeline: engine/goals.js (goals derived from the record and the result, the cushion in
  three steps on one pot with the first two as floors in every mode, a celebration for a step already covered, three modes, rollover, debt goals through debtsim, shortfalls with
  the floor named, earliest dates, the comparison), engine/ics.js, the #/goals screen with the timeline,
  the allocation table, the mode switch, live what-ifs and Confirm, Home, Session and one-pager tie-ins,
  the follow-up email's next win, 18 engine tests tied to tests/households/expected-goals.py and a
  browser flow. Level 10 was never built; the cushion goals read cash and goals can link to accounts.
- Level 8 Discovery, Confirm, and the Call Path: the discovery form and chip bar (#/discovery), the
  cost-of-living tier from the city (data/col-tiers.json, BEA RPP, marked verify), guesses that fill
  empty spending areas and never count as facts, the summary sheet and its email, roommates and shared
  bills (every figure uses the client's share; runway, the cushion target, the roommate block and the
  worst case say what happens if it all falls on them), gut and dream anchors with a schema 2 to 3
  migration, the six-stop call path (#/call), variance with FI effects and the three-marker chart,
  the four target choices, the journal "why", two header meters and Progress vs paperwork on the
  Session page, the one-pager sections, 22 engine tests with a hand-typed workpaper
  (tests/households/expected-discovery.py) and a browser flow. Owner follow-ups (MR-050): partners
  (together or just mine), a to-do for next session from every target, one Maya in Jersey City.
- Level 9 What Moves the FI Date: the FI ladder (engine/fiLadder.js, five rungs plus Coast, percent
  there, date reached, required monthly to the dream FI age, the barista rule and the reverse), 26 new
  metrics with direction and levers on all 74, the dependency graph (data/graph.json, engine/graph.js,
  integrity tests), sensitivity (engine/sensitivity.js: impact and ask priority, two synthetic households
  tied out to the month in tests/households/expected-levers.py), leverage v2 on the Session card, 20 new
  lenses and 13 readings, the headline shelf on Home, Session and the one-pager, the #/levers screen with
  the graph view, and Level 8 stand-ins (dream FI age, dream and gut spending, the FI spending basis).
- Level 7 Polish: critique rounds for Simulate, Learn and Depth applied (26 fixes plus the Level 3
  leftovers), contrast test and accessible-names sweep check, Dev end-to-end mock session,
  README library section, FINAL-REPORT.md.
- Level 6 Depth: Assumptions per client (22 settings in three groups, each read by the engine),
  Triple D on every date, go-go / slow-go / no-go, value of one more point, captions that state the
  return, band and withdrawal rate.
- Level 5 Learn: one readings table ranked by the money behind each title; gaps table.
- Level 4 Simulate: nine block types, timeline with keyboard and drag, each alone and together
  with one shared paths chart, Promote as the only bridge; Jordan + kid + Portugal flow.
- Level 3 Session: leverage engine, next-question card, circle-back, my and their plates with
  Small wins, follow-up email, session snapshots, since last time; the Jordan mock session runs
  start to finish in Playwright (12 checks).
- Level 2 Measure: seven planets publish to the Sun; projection to 95 with Triple D; 48 metrics
  with show-the-math; 19 lenses; 8 D3 charts; Coach/Client glossary; one-pager that prints to one
  page; Jordan, Dev and Maya tie out to independent workpapers; invariants on 200 random households;
  Maya demo with two sessions and scenarios; Load demo client.
- Level 1 Capture: data/fields.json (85 fields after MR-029, 31 row types, one owner each), the Ledger
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
- A design critique round for #/scoreboard, #/map and #/money-date (screenshots/level-12).
- Decide the default rule behind each band (QUESTIONS 53) and whether net worth joins the six (49).
- Savings bucket rows in Investments from the first accounts block (QUESTIONS 36).
- A design critique round for #/goals.
- A design critique round for #/levers and the shelf (every other screen before Level 8 has one).
- A design critique round for #/discovery, the summary and #/call.
- The RPP figures in data/col-tiers.json are from memory (verify: true); check them against BEA's
  latest release and the unit-size rent averages against HUD fair market rents before a client sees them.
- Unknown inputs with a national default should get the 50% band in ask priority; today they fall back
  to the v1 leverage score (MR-042).
- Merge the branch so GitHub Pages serves the app, then a live timing of Jordan's keyboard entry
  with Eli.
- Open critique items: Sankey label spacing (T14), Measure regrouping at 390 (T19), a row drawer
  for low-use ledger columns (M14, M22).

## Open issues
- The root SPARKS suite has one date-dependent failure that predates this lane
  ("with its as-of day and source", expects "typed confirmed" for an as-of of 2026-09-02).
  Not this lane's to fix; noted for the owner in QUESTIONS.md.

## Timings
- Sensitivity run (Maya, 288 re-runs of the whole engine, 40 roots): about 800 ms in Node; it runs in
  a module Worker in the browser, memoised per record version, debounced 250 ms.
- Maya recompute after a keystroke: 3.1 ms (flow level2-maya-recompute-under-100ms).
- Keyboard-only Jordan entry (flow level1-jordan-keyboard-only): 33 rows and 8 household
  facts in 1,966 keystrokes, 12 seconds of machine time. At a brisk human pace of two
  keystrokes a second that is about 16 minutes, under the 20-minute target; a live timing
  with Eli at the keyboard is still owed (unverified).
