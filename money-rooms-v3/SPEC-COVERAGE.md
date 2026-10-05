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
