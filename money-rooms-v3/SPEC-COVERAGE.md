# Spec coverage

One row per requirement per level. Status is done, partial or not done, said
plainly. Evidence is a file, a test name or a screenshot path.

## Level 0 Skeleton

| Requirement | Status | Evidence |
|---|---|---|
| Setup: folder, vendored D3 7.9.0, d3-sankey 0.12.3, Inter; no build step | done | vendor/, index.html, MR-002 |
| Repo files: README, CONTRACTS, DONE, BOARD, DECISIONS, QUESTIONS, PROGRESS, SPEC-COVERAGE, data, engine, ui, tests, tests/households, screenshots | done | this folder |
| CONTRACTS.md written before code; code checked against it | done | CONTRACTS.md; tests/engine/contracts.test.js "every planet publishes exactly the keys CONTRACTS.md lists" |
| Sun hub with planet slots; planets read only allowed slots | done | engine/sun.js; contracts.test.js "planets never read each other directly" |
| Journal: append-only lines {ts, field, owner, old, new, source, state} | done | engine/journal.js; journal.test.js "every change is one append-only line" |
| Answer states (8) and sources (6), one keystroke each, confidence table | done | engine/states.js; states.test.js; ui/chips.js; flow "one key sets Rough" |
| Ranges: Rough, midpoint used, range kept | done | states.test.js "a range is rough, uses the midpoint"; units.test.js "ranges add and subtract conservatively" |
| localStorage record mr3:client:<id> with the spec's keys | done | engine/store.js, engine/record.js; store.test.js; flow "record carries schemaVersion" |
| Autosave on every change with a visible Saved indicator | done | ui/app.js autosave; flow "saved indicator shows Saved" |
| Export/import JSON including journal; pre-import snapshot; undo import | done | store.test.js "importing over an existing client snapshots it first"; flow "import offers undo" |
| schemaVersion + migration harness with a test and fixtures | done | store.js MIGRATIONS; tests/fixtures/schema-0.json, schema-1.json; store.test.js "every schema version has a migration" |
| Undo/redo from the journal, deletes undoable | done | record.js undo/redo; journal.test.js "row deletes are undoable"; flow "Ctrl+Z undoes too" |
| Formatting module (one place for every number) | done | engine/format.js; format.test.js |
| Units system: period, basis, tax; mismatch throws | done | engine/units.js; units.test.js "adding monthly to annual throws" |
| Quick note from any screen (Ctrl+.) landing in the record | done | app.js quickNoteBar; flow "quick note lands in the record" |
| Coach/Client one-key toggle (backtick) | done | app.js; flow "backtick toggles back to coach" |
| Lint: no TODO, FIXME, placeholder, lorem, coming soon, not implemented, console.log; no em dash; token colours only; no red; two font weights | done | tests/run.js sections 2 to 5 |
| Browser gate: console clean, no NaN/undefined/null/Infinity/[object Object]/$-0, no overflow, at 1440/1024/390 in both views | done | tests/ui.js sweep; screenshots/level-0/ |
| Design critique with every screen at 4 or above | see critique | screenshots/level-0/critique.md (round 2), critique-round1.md |
| A household loads, saves, exports, re-imports, undo/redo works, all tested | done | flow level0-load-save-export-import-undo |

## Level 1 Capture

| Requirement | Status | Evidence |
|---|---|---|
| Ledger with field tables for all seven planets, every row type from data/fields.json | done | ui/table.js, ui/views/ledger.js; sweep screens income-w2, spending-lines, debt-cards, invest-accounts, life-goals |
| Other row type on every planet | done | fields.test.js "every planet has an Other row type" |
| Universal columns: id, nickname, institution, amount, cadence, asOf, state, source, confidence, followUp, stress (debts and accounts), notesPrivate, notesShared | done | ui/table.js columns(); engine/record.js createRow |
| Sortable by any column; filters by state, source, institution | done | ui/table.js rows()/filterSelect; header aria-sort |
| Keyboard entry: Enter down a column, Tab across, Alt+N new row, Alt+Delete remove (undoable), Alt+S / Alt+O state and source | done | ui/table.js keyFlow; flow level1-jordan-keyboard-only (1,966 keystrokes, no mouse) |
| One keystroke per answer state and source; typed prefixes (~ ? v send none n/a x, ranges) | done | ui/typed.js; ui/chips.js; flow "one key sets Rough" |
| Quick notes from any screen landing on my plate | done (capture) | ui/app.js quickNoteBar; my plate screen itself is Level 3 |
| Summary-or-detail inputs: rough total, detail overrides, gap shown | done | engine/compute.js summaries; ui/views/ledger.js note(); spending, debt and investments "Rough total" row types |
| Situation gate: income row types by work situation; absent not hidden | done | engine/fields.js typesFor; fields.test.js "the situation gate removes income types" |
| Card library prefill (issuer, annual fee, credits yes/partly/no) | done | ui/table.js libraryPrefill, openCredits; data/cards.json (58 cards, verify: true) |
| Fund library prefill (ticker fills name, expense ratio, asset class) | done | ui/table.js libraryPrefill; data/funds.json (35 funds, verify: true) |
| Defaults as estimates (national averages by household size, 0.5, shown with ~) | done | ui/views/ledger.js useDefaults; data/defaults.json |
| Every field declares its default source | done | data/fields.json defaultSource; fields.test.js |
| Lint: every field id has exactly one owner | done | fields.test.js "every field id has exactly one owner" |
| Journey: entering Jordan never asks for the same fact twice | done | fields.test.js "journey: no fact is asked twice"; MR-009 (payroll contributions live once, on Income) |
| Jordan fully entered keyboard-only; round-trips through export and import | done | tests/ui-keyboard.js; flow level1-jordan-keyboard-only compares 247 facts twice |
| Home as an orbit map you step inside (owner's reference, MR-010) | done | ui/orbit.js; screenshots/level-1/jordan-home-*.jpg |
| Jordan fixture built through the real record API with a journal | done | tests/households/build.mjs, specs.mjs, jordan.json (33 rows, 248 journal lines) |
| Browser gate on empty and Jordan, every screen, both views, three widths | done | tests/ui.js: 862 checks |
| Design critique with every screen at 4 or above | see critique | screenshots/level-1/critique.md |
