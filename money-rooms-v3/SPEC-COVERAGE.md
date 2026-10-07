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
| Card library prefill (issuer, annual fee, credits yes/partly/no) | done | ui/table.js libraryPrefill, openCredits; data/cards.json (212 cards incl. business, verify: true) |
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

## Level 2 Measure + one-pager

| Requirement | Status | Evidence |
|---|---|---|
| Contracts publishing to the Sun; planets read only allowed slots | done | engine/planets/*.js, engine/sun.js READS; contracts.test.js |
| Five stations per planet (Capture, Enrich, Analyze, Recommend, Publish) | done (Recommend is the lens layer) | engine/planets/income.js (Enrich infers take-home and match), engine/lenses.js |
| Projection year by year to 95, real dollars, Triple D, SS never zero | done | engine/projection.js; tieout.test.js "FI metrics and projection tie out" (first five years and age 95 match for likely, best and worst) |
| All 48 metrics with units, formulas, inputs, owner, stage, band and source | done | data/metrics.json (48 rows); engine/metrics.js; tieout tests for every metric with a hand value |
| Metric labels only from metrics.json | done | ui/views/measure.js metricLabel(); kpi() |
| Metric confidence dollar-weighted; rough shows "roughly" with a range | done | engine/units.js weightedConfidence; spending range tie-out; lenses "roughly" |
| All 19 lenses with $ figure, math on tap, reading pointer, $100 floor, information not instructions | done | data/lenses.json; engine/lenses.js; tieout "the lenses that fire match the workpaper" (Jordan 12, Dev 7, Maya 9) |
| Coach view shows all firing lenses; Eli picks which go to the client and the one-pager | done | measure.js drawLenses; flow level2-load-demo-and-client-view |
| All 8 charts, one shared module, Coach and Client versions, each can go on the one-pager | done | engine/chartdata.js, ui/charts.js; measure.js drawCharts; onepager.js picked charts |
| Sankey inflows = outflows to the dollar | done | invariants.test.js "Sankey inflows equal outflows" on 200 random households |
| Show-the-math drawer on every displayed number | done | measure.js openMath (formula, inputs with confidence, result, band source) |
| Coach/Client views with glossary (plain labels, picked lenses, their plate only, no private notes) | done | ui/glossary.js, data/glossary.json; flow "client view hides private notes" |
| One-pager with every section, prints to exactly one page | done | ui/views/onepager.js, ui/print.css; flow level2-onepager-prints-to-one-page (Jordan, Dev, Maya each 1 page) |
| Every number links to its math; no balances in a share link | done (no share link exists) | onepager.js kpi() opens the drawer |
| Jordan and Dev tie out against hand workpapers written before the engine | done | tests/households/jordan-expected.md, dev-expected.md (generated by tests/households/expected.py from the fixtures, never from the engine) |
| Maya demo: every state and source, a range, Other rows, two saved scenarios, two sessions in the journal; Load demo client | done | tests/households/specs.mjs maya; maya.json (43 rows, 311 lines, 2 sessions); home.js loadDemo |
| Invariants on all households plus 200 randomised ones | done | tests/engine/invariants.test.js (net worth, Sankey, DRAFTT reconcile, savings rate cap, more saving never later, match never in spending, cash never takes returns, no NaN) |
| Units carried on every number; mismatches throw | done | engine/units.js; every planet uses U.* triples |
| Playwright renders every screen for empty, Jordan, Dev, Maya, extreme; forbidden text and overflow checks | done | tests/ui.js sweep over 5 households, 10 screens, 2 views, 3 widths |
| Designed empty state on every screen | done | measure.js, onepager.js, table.js emptyState |
| Recompute after a keystroke under 100 ms for Maya | done | flow level2-maya-recompute-under-100ms (3.1 ms measured) |
| External data honesty: cards, funds, tax, limits marked verify, shown as Looked up (verify) at 0.7 | done | data/*.json verify flags; table.js libraryPrefill uses lookup-verify |
| Design critique with every screen at 4 or above | see critique | screenshots/level-2/critique.md |

## Level 3 Session engine

| Requirement | Status | Evidence |
|---|---|---|
| Leverage scoring: category x item x (1 - confidence) x materiality, weights in data/weights.json | done | engine/leverage.js; leverage.test.js "leverage = category x item x (1 - confidence) x materiality" |
| Next-question card: one big, two smaller | done | ui/views/session.js nextCard; flow level3-jordan-mock-session "one big question and two smaller ones" |
| Ranked circle-back list | done (merged) | session.js: one ranked table "Everything unsure" with tabs All, Their plate, My plate, Small wins (critique Q5); flow "a ranked list of everything unsure follows" |
| My plate / their plate by source; Small Wins tab under $100 a year | done | engine/plates.js, leverage.js session(); leverage.test.js "under $100 a year is a small win" |
| Unfiled quick notes land on my plate | done | plates.js plateItems; email.test.js "an unfiled quick note is on my plate" |
| Auto-drafted follow-up email: their plate by institution with where to find each number, no balances | done | engine/email.js; email.test.js; flow "the follow-up email groups by institution" |
| Session snapshots and since last time | done | session.js snapshot(); plates.js sinceLastSession; flow "closing takes a session snapshot", "the one-pager shows what changed" |
| Ask it jumps to the Ledger cell | done | app.js focusAfterRender; flow "Ask it lands in the right cell" |
| Scripted mock session for Jordan runs start to finish | done | tests/ui-flows.js level3-jordan-mock-session (12 checks) |
| Stub, not built: leverage by FI-date sensitivity | done in Level 9 | engine/sensitivity.js; leverage.js session() ranks by ask priority when a FI date exists (MR-042) |
| Design critique with every screen at 4 or above | see critique | screenshots/level-3/critique.md |

## Level 4 Simulate

| Requirement | Status | Evidence |
|---|---|---|
| Nine scenario block types with default costs and 3-4 questions each | done | data/scenario-blocks.json: the nine from the spec plus Raise, Income ending, New expense and Expense ending (MR-026); Inheritance asks one question after critique R10 (MR-024) |
| Blocks read reality live and never write to it | done | engine/scenarios.js compare(); scenarios.test.js "reality is never written" |
| Timeline with drag-and-drop (and keyboard arrows) | done | ui/views/scenarios.js; flow level4-jordan-kid-portugal "a block moves along the timeline" |
| Each alone versus together, whole life replayed | done | engine/scenarios.js compare(); flow "the table shows today, each block alone and all together" |
| Promote is the only bridge into the Ledger | done | scenarios.js promote() adds a Life plan goal through app.addRow; flow "Promote adds exactly one Life plan goal" |
| Jordan + kid + Portugal shows each alone and combined | done | scenarios.test.js "Jordan + kid + Portugal"; flow level4-jordan-kid-portugal |

## Level 5 Learn

| Requirement | Status | Evidence |
|---|---|---|
| Every lens maps to a reading pointer (titles only, no quotes) | done | data/lenses.json reading per lens; data/readings.json |
| Every struggling item on the one-pager carries a reading | done | onepager.js strugglingSection (lens-derived items carry theirs; coach-written bullets take the picked lenses' readings in order) |
| Learn panel lists gaps with what to read | done | ui/views/learn.js: readings grouped with the lenses that point at them, plus the numbers still waiting on inputs |

## Level 6 Depth

| Requirement | Status | Evidence |
|---|---|---|
| Full Assumptions panel, per client, stored on the Sun | done | ui/views/assumptions.js (22 settings in three groups, each one read by the engine); engine/compute.js assumptionsFor() |
| Real dollars by default with a nominal toggle | not built (by design, MR-024) | everything is in today's dollars and says so on the Assumptions header, the chart captions and the one-pager; the dead toggle was removed after critique T1 |
| Triple D everywhere a date appears | done | FI date tile shows best and worst ages; projection chart band; scenarios compare at the likely return |
| Go-go / slow-go / no-go spending | done | engine/projection.js; Life plan retirement row; tieout (projection first five years and age 95) |
| Value of one more point | done | engine/compute.js oneMorePoint; metric 46; lens 15 |
| No state tax, ACA, Roth conversions | done (by design) | README parking lot |

## Level 7 Polish and audit

| Requirement | Status | Evidence |
|---|---|---|
| Full design pass across every screen with a separate critique | done | screenshots/level-4, level-5, level-6 critique.md (R1-R10, S1-S7, T1-T19) with builder's notes; Level 3 leftovers Q6, Q7 closed |
| Accessibility basics: labels, focus states, contrast | done | tests/engine/contrast.test.js (every text token pair at 4.5:1 or better, slate darkened, gold and amber never text); tests/ui.js "accessible names" check on every screen (inputs, buttons, chart svgs, one h1) |
| Full regression | done locally | node tests/run.js (833 checks) and node tests/ui.js (every household x screen x view x width, 4,047 checks); the live URL exists only after merge |
| End-to-end mock session for Dev | done | tests/ui-flows.js level7-dev-mock-session (10 checks: Measure, question, ranked table, email, Ask it, answer, note, close, one page, no private notes) |
| Final screenshots of every screen with Maya | done | screenshots/level-6/maya-*.jpg (13 screens x 2 views x 3 widths); screenshots/level-2/maya-onepager.pdf |
| README: run, add a client, update libraries | done | README.md |
| Final report | done | FINAL-REPORT.md |

## Level 8 Discovery, Confirm, and the Call Path (Gut, Dream, Actual)

Built after Level 9. The Level 9 stand-ins (dream FI age, dream and gut spending on the Life plan; the FI spending basis switch) stay; the dream FI age is now written by the call path, and `fiSpendingBasis` reads the anchors first (MR-046).

| Requirement | Status | Evidence |
|---|---|---|
| `#/discovery` route, coach only; Home gets "New discovery call" | done | ui/routes.js; ui/views/discovery.js; ui/views/home.js |
| One scrolling table: Snapshot, Why now, Money, Spending, Goals, Mindset, Their words | done | ui/views/discovery.js (sections from data/discovery.json) |
| Listening chip bar from `data/discovery.json`, each chip writes facts | done | data/discovery.json chips; chipOn/applyChip in discovery.js |
| Source "discovery" (cap 0.6, plate theirs), label "What you said" | done | engine/states.js SOURCES.discovery; states.test.js |
| Discovery money values become gut anchors (client share for shared) | done | engine/discovery.js applyDiscovery; discovery.test.js "a discovery call becomes a record" |
| Derivations: take-home/gross cross-check silent under 10%, state from city, tier from city, share math, Rule of 5 with the roommate gap, runway | done | engine/parse.js crossCheck; engine/col.js; planets/safety.js; discovery.test.js |
| `data/col-tiers.json`: BEA RPP, HCOL at or above 110, MCOL 95 to 110, LCOL under 95, top 50 metros, states, city to metro, non-metro fallback, override stops auto-updates | done | data/col-tiers.json (verify: true); col.js tierFor/colTierOf; discovery.test.js "tier inference", "override" |
| Guesses from `data/defaults.json` scaled by tier, household and sharing, with unit-size rows | done | data/defaults.json housingByUnit; engine/guesses.js buildGuesses; discovery.test.js "guess scaling HCOL > MCOL > LCOL", "household scaling" |
| "Guess" label everywhere; never an anchor, never completeness, never variance; recomputed on tier or household change as paperwork; "Includes N guesses"; per-client switch "Fill gaps with guesses" | done | states.js estimated label Guess; compute.js completenessOf and result.guesses; discovery.js applyGuesses; assumptions fillGapsWithGuesses; tests "guesses are excluded", "the switch" |
| Gentle session mode from mindset; Confirm "Already said" hints | done | record.sessionMode; discovery.js applyDiscovery sets gentle when avoiding; call.js gentle copy; confirmQuestions |
| Discovery summary sheet, print, `engine/discovery.js` | done | discoverySummary, session1Agenda; ui/views/discovery.js mountSummary; print.css |
| Shared costs: `record.household`, fields `shared` and `myShare`, "Roommate moves out" block with lease notes, `roommateGapCents` in the Rule of 5 target, runway two numbers, roommate-risk lens, worst case includes the roommate leaving | done | engine/record.js setHousehold; data/fields.json; data/scenario-blocks.json roommate; planets/safety.js roommateGap and runway.fullAlone; data/lenses.json roommate-risk; projection.js worstExtraAnnualSpend; scenarios.js roommateOutcome |
| Anchors: `record.anchors` gut and dream, write-once, Re-anchor journals kind "anchor", migration 2 to 3 with gut backfill, stand-in rule, dream total, FI spending basis switch, "living alone" housing dream | done | engine/anchors.js; engine/store.js MIGRATIONS 2 to 3; planets/spending.js stand-ins; callpath.js housingChoice; tests "anchors are write-once", "schema 2 migrates" |
| Call path `#/call`: six stops from `data/callpath.json`, one read-aloud question at a time, "Area 3 of 7", I don't know and None in one tap, progress per session | done | ui/views/call.js; engine/callpath.js; record.callProgress; ui-flows level8 |
| Variance engine: awareness, dream and wish gaps, groups, FI effects, coach tier comparison, headline, three-marker chart | done | engine/variance.js; ui/charts.js markers; variance household tied out in tests/households/expected-discovery.py |
| Targets: What you said, What you'd want, Meet in the middle, Keep it as is; default rules; planned moves; `callTargetRoomFraction` 0.5 | done | engine/targets.js; record.targets; assumptions callTargetRoomFraction |
| Journal "why" (correction, move, paperwork by default rule); Session "Progress vs paperwork"; two header meters | done | record.js whyOf; engine/progress.js; ui/views/session.js meterRow and progressPanel |
| One-pager and emails: discovery follow-up at most three items; targets email | done | engine/email.js discoveryEmail, targetsEmail; ui/views/onepager.js saidSection |
| Tests: parsing, cross-check, share math, anchors, tier inference (Jersey City to New York to HCOL), override, guess scaling, household scaling, paperwork recompute, guesses excluded, switch, correction, roommate scenario, gap and runway, lens, gentle mode, Confirm why tags, variance, stand-in, dream basis, targets | done | tests/engine/discovery.test.js (22 tests); workpaper tests/households/expected-discovery.py |
| New Maya discovery household and a variance household with hand-typed expected numbers | done | tests/households/discovery-specs.mjs; build-discovery.mjs writes maya-discovery.json; discovery-expected.json |
| tests/ui.js: #/discovery, the summary, #/call, the roommate scenario in both views at three widths | done | tests/ui-screens.js (three screens, the maya-discovery household); ui-flows.js level8-maya-discovery-to-targets (29 checks) |
| Design rules: no internal words on screen; client words; HCOL/MCOL/LCOL coach, "high cost area" client | done | data/col-tiers.json labels; flow check "the client view never says HCOL, anchor, variance or estimated" |
| Partners (owner follow-up, MR-050): a partner whose money counts together or just mine; the discovery form asks; Confirm reads it back | done | engine/household.js; planets/income.js partnerTakeHomeMonthly; discovery.test.js "a partner counts together" |
| A saved target is a to-do for next session (owner follow-up, MR-050) | done | engine/targets.js setTarget; call.js nextSessionTodos; one-pager to-dos |
| Screenshots and a critique round for the new screens | not done | the sweep ran at three widths in both views; a critique round is owed (PROGRESS.md) |

## Level 9 What Moves the FI Date

| Requirement | Status | Evidence |
|---|---|---|
| FI ladder: Lean, Regular, Fat, Barista Lean, Barista Regular, each with number, percent there, date and required monthly to the dream FI age | done | engine/fiLadder.js; metrics leanFi, baristaLeanFi, baristaRegularFi, regularFi, fatFi; sensitivity.test.js "the ladder, the barista rule and the progress basis"; tieout.test.js ladder rows |
| Lean FI from the FAT floor, categories as a stand-in marked rough | done | fiLadder.js (source fatFloor or categories, rough) |
| Fat FI from dream spending, fallback spending x multiplier marked rough | done | fiLadder.js; tieout fatFi |
| Barista field "Part-time income at FI" on the Life planet, any cadence, default empty | done | data/fields.json baristaIncome; life.js baristaIncomeMonthly; levers.js inline input |
| Barista rule live, never hard-coded ($30,000 at 4%, $34,286 at 3.5%) | done | fiLadder.js baristaRule(wr); metric baristaRule with at35; flow "the barista rule is live and not hard-coded" |
| Reverse Barista: part-time income needed today, Regular and Lean | done | metric baristaIncomeNeededToday (lean in extra); tieout |
| Coast FI routed through the module, percent and date | done | fiLadder.js coast; metric coastFi reads the basis; lens coast-reached |
| fiProgressBasis invested or netWorth, pctToFi follows it | done | assumptions.json; metrics.js pctToFi basis; sensitivity.test.js "net worth basis by assumption" |
| fiLevels replaced by the ladder, id kept as alias | done | metrics.js fiLevels built from the same inputs; chart fiGauge unchanged |
| Headline shelf on Home, Session and the one-pager with inputs, levers, lens per tile; unlocked-metrics pattern | done | ui/shelf.js; ui/metricdrawer.js; flow level9 "the Home shelf", "the metric drawer shows the math, the levers and the lens"; one-pager still prints to one page (flow level2) |
| Dependency graph: nodes, generated edges, hand-listed rest, signs, lever families | done | data/graph.json; engine/graph.js; graph.test.js (no cycles, no orphans, every metric reaches a root, every root reaches fiDate or is marked) |
| Sensitivity: shocks by kind, spending both ways, impact rank by family, ask priority by state ranges | done | engine/sensitivity.js; data/weights.json uncertainty; sensitivity.test.js (two households tie out to the month; a cut beats a raise both ways) |
| Leverage v2 on the Session card with "about N months of FI date at stake" and "why it ranks here" | done | leverage.js session(); session.js; flow level9 "the next question card says about N months" |
| Unknown inputs with a national default use the 50% band | partial | unknowns fall back to the v1 score (QUESTIONS.md Q8) |
| Performance: memoise per record version, debounce, cap, Worker | done | ui/levers-bridge.js (versionKey, 250 ms, 40 roots, module Worker with a sync fallback) |
| Independent expected deltas for starter and mid-career households | done | tests/households/expected-levers.py and levers-expected.json; sensitivity.test.js |
| Metrics: direction, levers and graph links on every metric; the 26 new metrics | done | data/metrics.json (74); metrics.js levelNine(); graph.test.js "every metric reaches at least one root" |
| expectedNetWorth and salaryMultiple coach view only by default, benchmark source selectable | done | metrics coachOnly; measure.js filter; assumptions benchmarkSource and showBenchmarksToClient; data/benchmarks.json verify |
| 20 new lenses with readings | done | data/lenses.json (39); lenses.js levelNineLenses; lenses9.test.js (each fires on a household built to trip it) |
| UI #/levers: staircase, barista inline, ranked list with Impact and Ask toggle, top sentence, root and metric drawers, graph toggle (list at phone width), client view | done | ui/views/levers.js; sweep screen levers at three widths in both views; flow level9 |
| Gates: engine tests, ui sweep, docs | done | node tests/run.js (1,064 checks); node tests/ui.js (flows plus the sweep with the levers screen) |
