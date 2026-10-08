# Decisions (Money Rooms v3)

Each entry: date, decision, why, alternative. Newest at the bottom. This is
the lane's own log; the SPARKS log (`../DECISIONS.md`) carries one entry,
D-341, that says this app exists.

## MR-001 2026-10-05 The app lives at `money-rooms-v3/` inside this repository
Decision: build in `money-rooms-v3/` as a separate app, the way `coach/`,
`dnd/` and `marketing/` are, on branch `claude/money-rooms-v3-coach-build-2ftvlz`.
Why: the run was started inside the Personalfinance repository, not an empty
folder, and the repository already has the pattern for a separate app behind
the freeze (D-339, D-340). GitHub Pages serves `main`, so the live link
appears once the branch is merged.
Alternative: a new repository (needs `gh repo create`, and the session's
GitHub access is scoped to this one repository).

## MR-002 2026-10-05 D3, d3-sankey and Inter are vendored, pinned, not loaded from a CDN
Decision: `vendor/d3.v7.9.0.min.js`, `vendor/d3-sankey.v0.12.3.min.js` and
`vendor/fonts/inter-latin-wght-normal.woff2` (OFL) ship in the repo and the
pages load them by relative path.
Why: the build environment cannot reach jsdelivr, cdnjs or unpkg (the proxy
refuses the tunnel), so a CDN tag would fail every console-clean test here;
a vendored copy also works in a client meeting with no Wi-Fi. The repo
already vendors its fonts the same way. Versions are pinned in the file names.
Alternative: pinned CDN script tags with a local fallback (two code paths to
keep clean; rejected).

## MR-003 2026-10-05 One shell page with hash routes
Decision: `index.html` is the only HTML page; screens are hash routes
(`#/home`, `#/ledger/income`, `#/measure`, `#/session`, `#/scenarios`,
`#/learn`, `#/onepager`, `#/assumptions`). The one-pager prints from its route.
Why: one record, one computed result, one Coach/Client toggle shared by every
screen; no duplicated headers; relative paths stay trivially case-safe on Pages.
Alternative: one HTML file per screen (what `coach/` does; more files to keep aligned).

## MR-004 2026-10-05 Facts carry state and source per field, stored on the row
Decision: a row is `{ id, planet, type, nickname, institution, asOf, followUp,
stress, notesPrivate, notesShared, f }` where `f[fieldId] = { v, state, source }`
and the amount is `f.amount` (a number of cents or `{ low, high }`).
Why: the spec wants an answer state and a source on every input and a task per
unsure field; storing them beside the value keeps the journal and the
leverage engine simple.
Alternative: row-level state only (loses the per-field plate).

## MR-005 2026-10-05 Lane logs use the MR- prefix and the root test is touched in one place
Decision: this lane's decisions are `MR-###` here; the SPARKS suite's CSS token
check (`test/run.js`, "No CSS variable is used without being defined") learns
that files under `money-rooms-v3/` may use tokens from `money-rooms-v3/ui/tokens.css`.
Why: the check already special-cases `dnd/`; without it, every stylesheet in
this app would fail the root suite. Nothing else outside this folder changes
except CLAUDE.md, STATUS.md, the CI workflow and `.gitignore`, as D-339 did.
Alternative: one giant stylesheet that declares tokens at its top (hides the system).

## MR-006 2026-10-05 Two derived neutrals join the palette
Decision: `--line #D5DCE8` and `--line-soft #E6EBF3` for 1px borders and row dividers.
Why: the spec palette has no border colour; Sapphire 100 is too light on Paper 2 and Slate too dark for a hairline.
Alternative: borders in Sapphire 100 (invisible on Paper 2).

## MR-007 2026-10-05 One State and one Source column per table row, per-field states behind the cell
Decision: a Ledger table shows the state and source chips of the row's primary field (the headline amount) in their own columns. Every other cell keeps its own state and source, shown in a field bar under the table when the cell is focused and settable by typed prefixes (~ for Rough, ? for Unknown, a range "1500-2000" for Rough, "send" for Will send, "none" for None, "n/a" for Not applicable).
Why: per-field chip columns for ten fields would be thirty columns; the typed prefixes keep one-keystroke entry while a client talks.
Alternative: chips on every cell (unreadable), or row-level state only (loses the per-field plate).

## MR-008 2026-10-05 Filing status is a Sun fact
Decision: `filingStatus` lives on the Sun beside dependents; Taxes reads it. CONTRACTS.md updated.
Why: Income must infer take-home from gross with the one tax function, and Income runs before Taxes; a typed household fact belongs on the Sun.
Alternative: Taxes owns it and Income reads a Taxes slot (needs two compute passes).

## MR-009 2026-10-05 Payroll contributions and the match formula live on Income rows
Decision: 401k-type deferrals (pre-tax and Roth), HSA via payroll and the employer match formula are fields of the Income planet (the W-2 row and the Benefits row). Investments reads `income.pretaxContribMonthly`, `income.rothContribMonthly`, `income.hsaPayrollMonthly`, `income.matchMonthly` and `income.matchFormula`; its account rows carry only non-payroll contributions.
Why: they are paystub facts; the spec's journey test forbids asking for the same fact twice, and one owner per fact forbids a copy on the account row.
Alternative: contributions on the account row (double entry with the paystub).

## MR-010 2026-10-05 Home is an orbit map you step inside, like the owner's reference
Decision: the owner sent three screenshots of a life-map app (a large centre circle, satellites on a ring with spokes, a dashed outer orbit, labels under the circles, counts inside nested circles, a breadcrumb on top, a panel for the selected circle below, tap to step inside). Home follows that structure in the spec's light sapphire palette: the Sun in the centre with the seven planets around it; stepping into a planet shows its moons (row types) with row counts; stepping into a moon opens that Ledger table. The confidence fill is the ring stroke.
Why: the owner asked for it mid-run; it also makes the map the Ledger's navigation instead of a second menu.
Alternative: a static illustration on Home and a separate Ledger menu (two ways to the same table).

## MR-011 2026-10-05 Alt+S and Alt+O from a cell; selects by arrow keys in the keyboard test
Decision: in a Ledger cell, Alt+S jumps to that field's state chip and Alt+O to its source chip (one more key sets it and focus returns to the cell). The keyboard-only test drives selects with Home and arrow keys, not typeahead.
Why: the field bar follows the last focused cell, so Tabbing to it always shows the row's last field; and Chromium's typeahead makes "No" land on "Not entered".
Alternative: per-cell chip columns (thirty columns) or a modal state picker (no modals for data entry).

## MR-012 2026-10-05 A typed plain 0 is None
Decision: typing 0 into a money, percent, hours or count cell stores a real zero with state None (confidence 1.0); an empty cell is Unknown.
Why: "empty is not zero"; a client who says "no bonus" has answered.
Alternative: a separate None keystroke only (slower while a client talks).

## MR-013 2026-10-05 Whole dollars in table cells; cents in drawers and prose
Decision: Ledger cells and metric tiles print whole dollars ($1,847); the formatting rule (cents below $1,000) applies in drawers, lenses and the one-pager's text.
Why: the design critique found one column mixing "$2,150" and "$142.00"; a workpaper column keeps one precision.
Alternative: cents everywhere in tables (noisy at $1,000 and above).

## MR-014 2026-10-05 An empty Debt planet is "needs", not zero
Decision: with no debt rows at all, total debt, debt service and interest publish "needs debt rows, or a rough total of 0 for none"; typing 0 (None) on the Rough total row says "no debts" and completes the moon.
Why: empty is not zero; a surplus that assumes no debt before anyone said so is a confident lie.
Alternative: assume zero (hides the gap).

## MR-015 2026-10-05 Insurance premiums count as spending only when paid from the bank
Decision: a Safety Net premium with cadence "per paycheck" is a payroll deduction already out of take-home and is not added to spending; any other cadence is added to monthly spending (metric 3) and to needs.
Why: health premiums usually come off the paystub (and reduce FICA wages); counting them twice would overstate spending.
Alternative: a separate "paid from" field (one more fact to ask).

## MR-016 2026-10-05 Take-home is inferred when only gross is typed, on that income alone, before state tax
Decision: Income's Enrich station infers a missing take-home with the one tax function (federal brackets, FICA or self-employment tax, payroll deductions), each income row on its own, with no state tax; confidence is capped at 0.6 and the figure prints with a tilde and the note "before state tax".
Why: v1 has no state tax and a secondary income cannot see the primary's bracket; an honest rough figure beats a blank that breaks every downstream metric.
Alternative: wait for a typed take-home (most metrics stay dark until then).

## MR-017 2026-10-05 FI means the portfolio alone covers spending; Social Security is drawn on the chart, not in the test
Decision: the FI date is the first projection year where net worth x withdrawal rate covers annual spending; Social Security (bend-point estimate from current gross, from 67, never zero) reduces withdrawals in the projection but does not bring the FI date forward. Retirement spending uses go-go, slow-go and no-go shares from 75 and 85.
Why: that is how the FIRE sources named in the spec define it, and it keeps one definition across the gauge, the lenses and the one-pager.
Alternative: FI when portfolio plus future Social Security covers spending (earlier dates, harder to explain).

## MR-018 2026-10-05 Payroll contributions and the match formula are read by Investments from Income, and Solo 401k deposits count against the 401k limit
Decision: room under the 401k limit = payroll deferrals (Income) plus deposits typed on 401k-type accounts (Investments); the IRA limit uses deposits on IRA accounts; the HSA limit uses payroll HSA plus HSA deposits.
Why: a self-employed client's Solo 401k deferral lives on the account, not a paystub.
Alternative: payroll only (shows Dev with $24,500 of room he does not have).

## MR-019 2026-10-05 Materiality is the dollars a fact moves a year, borrowed from its row's headline when the fact is not money
Decision: leverage = category x item x (1 - confidence) x materiality, where materiality is 0.1 under $100 a year (Small Wins), 0.5 under $1,000, 1.0 to $10,000 and 1.5 above; a non-money fact (a date, a rate, a choice) borrows its row's headline dollars; Sun facts count as large.
Why: the spec names the formula and the $100 line but not the steps; dollars moved a year is the one scale every planet shares.
Alternative: FI-date sensitivity (stubbed for v2 in the spec).

## MR-020 2026-10-05 Closing a session is the only snapshot
Decision: "Close this session" appends a session line to the journal and a snapshot to `sessions`; "since last time" and the one-pager's changes read from the last snapshot. Nothing snapshots on its own.
Why: one deliberate marker per meeting keeps "since last time" meaningful.
Alternative: a snapshot per day of activity (noisy between meetings).

## MR-021 2026-10-05 A scenario block is a one-off cost in its start year plus a monthly change for its duration
Decision: each block type declares an `oneOff`, a `monthly` and a `duration` formula over its answers and two live figures (take-home and spending a month); income shows as a negative cost. The sandbox folds the adjustments into a copy of the projection inputs and replays baseline, each block alone and all together at the likely return.
Why: one shape covers all nine types and keeps the engine's single projection function.
Alternative: a bespoke model per block (nine engines to keep honest).

## MR-022 2026-10-05 The nominal toggle is stored but the engine stays in real dollars (v1)
Decision: the Assumptions panel stores `basis` and `inflation`; every figure is still computed and shown in today's dollars. The toggle is labelled as such.
Why: the spec's engine defaults are real dollars; inflating the view adds a second number for every figure and the critique rounds were already fighting density. Logged as partial in SPEC-COVERAGE.md.
Alternative: compute both bases now (doubles the projection surface).

## MR-023 2026-10-05 Levels 2 to 6 were built in one working tree and are committed by file ownership
Decision: the six commits "Level 2" to "Level 6" split one working tree by which level owns each file (shared files such as app.css, routes.js and the sweep list go with Level 2). Only the Level 6 commit is guaranteed to pass both gates on its own; the earlier five are checkpoints of the same tree, and BOARD.md marks each FROZEN at the commit that carries its files.
Why: the spec asks for one commit per level; the levels share one shell and were critiqued together, so an untangled history would have meant rebuilding the work in sequence for no gain.
Alternative: one commit for Levels 2 to 6 (loses the per-level record the board asks for).

## MR-024 2026-10-05 Assumptions that nothing reads are gone, and a windfall asks one question
Decision: the Assumptions screen drops basis, inflation, bond return, the two withdrawal-rate range ends and the materiality line (no engine code read them; the materiality line lives in data/weights.json), and shows the go-go, slow-go and no-go shares read-only because the Life plan owns them. The Inheritance block asks only "Amount after tax and fees". Slate darkens from #6B7891 to #5F6C85 so 12px labels meet 4.5:1.
Compatibility: overrides stored under the six removed keys on rec.sun.assumptions are ignored by assumptionsFor() and dropped on the next save; a stored answers.taxShare is ignored by blockCosts(). No other stored shape changes.
Why: a setting that changes nothing teaches the coach the screen cannot be trusted (critique T1, T2, R10). Closes MR-022's "partial": there is no nominal view in v1.
Alternative: wire a nominal mode (doubles every figure on every screen under the freeze).

## MR-025 2026-10-05 Onboarding asks four facts, New York is the default state, a birth year is enough
Decision: Home asks birth date, state, work situation and filing status; name, dependents and the big goal sit behind "More facts"; city is stored but not asked. A new client starts with state New York as an Estimate the coach confirms by changing it. The birth date accepts a year or an age (stored as 1 July of that year, Rough) as well as a full date (Known). "New client" is one button that reveals the name field. Money cadences gain "per week" (x52/12).
Compatibility: no stored shape changes; city stays in sun.f and old records keep it. The Sun fill no longer counts city.
Why: the owner asked for as few questions as possible at the start; a coach can get a year and a state in the first minute.
Alternative: ask all eight facts up front (what Levels 0 to 7 did).

## MR-026 2026-10-05 Starting soon: changes with a start month, shown where they belong, costed by Simulate
Decision: scenario blocks gain an optional startMonth and each block type names the planets it touches; every planet page and row-type page shows a "Starting soon" panel of its blocks with a typed start ("Mar 2027"), what each costs, and a link to Simulate. Four block types were added (Raise, Income ending, New expense, Expense ending). The first and last year of a block are pro-rated by its start month. Spending lines gain preset groups (Food, Housing, Transportation, Everything else) from data/presets.json: names, category, need or want and the FAT flag; every amount is asked.
Compatibility: startMonth is optional and null on old blocks (same behaviour as before); presets add ordinary rows. No stored shape changes otherwise.
Why: the owner wants to see when a change starts and what it does from the room it belongs to, and to add a household's usual lines in one press.
Alternative: a new "Upcoming" screen (adds a surface the freeze does not allow; Simulate already owns the math).

## MR-027 2026-10-05 Rentals are assumed none, weeks of unemployment left are worked out, and the Taxes planet shows its ladder
Decision: a row type can carry assumeNone (today: Income > Rentals); with no rows it counts as answered and shows "None (assumed)", and a row overrides that. The Unemployment row asks the weeks of benefit and the start month; weeks left and the end month are inferred from today's date and never typed. A ninth chart, the tax ladder (gross pay, pre-tax deductions, the standard deduction, each bracket, FICA, what is left), sits on the Taxes planet page and in Measure.
Compatibility: no stored shape changes; weeksLeft keeps its id and now holds the total weeks (old records that typed weeks left are read as the total, which is wrong by the weeks already elapsed; the inferred line shows the arithmetic so a coach can correct it).
Why: the owner asked for fewer questions, computed weeks, and a tax picture that starts from salary.
Alternative: a separate weeksTotal field (one more question).

## MR-028 2026-10-05 A dark theme from the same tokens, and totals that follow every keystroke
Decision: tokens.css remaps every colour role for a dark theme, applied when the system prefers dark unless the top bar switch picks Light or Dark (stored in settings). The top bar and toasts use their own --bar token so they stay navy in both themes. Table totals are recomputed on every change by replacing only the footer, which holds no live inputs (D-034 kept).
Compatibility: settings gain an optional theme key; no record shape changes.
Why: the owner asked for a dark mode; the totals row went stale between row additions because field edits never rebuilt the table.
Alternative: a second stylesheet (two places to keep every colour).

## MR-029 2026-10-05 Fewer facts, and the rest behind Details
Decision: 32 fields nothing in the engine read were removed, and the Tax facts row type with them (the tax ladder replaces it); fields.json now carries 85 fields in 31 row types. Each row type names its tableFields: the table shows the name, the headline figure and at most three essentials, then State, Source and a Details button; every other fact, the institution, the as-of month, the flag, stress and notes live in a drawer opened from that button. Ask it opens the drawer when the fact lives there.
Compatibility: removed fields stay on old rows as ignored keys; a stored taxes/note row is kept in the record but has no screen. tableFields is a data field, not a stored one.
Why: the owner saw too many details and did not want to scroll sideways to reach a fact.
Alternative: hide columns behind a toggle (keeps the width problem and every question).

## MR-030 2026-10-05 The aesthetic audit: quieter chrome, one meaning per colour
Decision: from screenshots/audit-2026-10-05.md: chart series use their own tokens so navy never flips in the dark theme and dark panels sit above the page; rough figures are ink (the tilde and range carry "rough"); Known, Verified and source chips have no border; legends are unbordered; the sidebar shows names only (shortcuts stay in the ? sheet); gold rings are gone; the cell shorthand bar shows only once a cell is picked and its legend lives in the ? sheet; planet pages show the Row types list only where the orbit is compact and Starting soon in the main column; Session's Done is a checkbox; "Promote to the Ledger" reads "Add to Life plan"; one-pager headings read "What is working", "What needs work", "Do more, do less"; Measure tiles share a row height and the chart order pairs short with short.
Compatibility: none; presentation only.
Why: the audit scored the coach tables and Measure at 2 to 3 for boxes inside boxes, repeated figures and colour that meant four things.
Alternative: borderless table inputs (declined: the owner asked for fields that look separate).

## MR-031 2026-10-05 Completeness counts the facts that change a number; a tag is a label to filter by
Decision: a field marked tag (stability, bureau, priority, beneficiary, insurance type, fund name, account link) changes no number: it is left out of every fill and confidence figure, never lands on a plate or in the next question, and shows as a quiet "tag" in Details. The Details link carries an amber count of the empty facts that do change numbers, and those rows are marked in the drawer.
Compatibility: none; tag is a data field.
Why: Side income read 75% because an unfilled hours field and a stability choice dragged it down; the owner asked that only facts that affect other numbers be highlighted.
Alternative: weights per field in the fill (hides the rule instead of stating it).

## MR-032 2026-10-05 Pay frequency is asked only when pay is typed per paycheck
Decision: a field can be tied to a cadence (payFrequency to "paycheck"); it is asked, counted and placed on a plate only while the row's headline figure is typed in that cadence. A side income typed per month never asks how often it is paid. "None" for a row type is one quiet line with Undo, not a row with details.
Compatibility: none; stored values stay and are ignored while the cadence differs.
Why: the cadence pill and the pay frequency field asked the same thing twice.
Alternative: drop pay frequency and keep only the pill (loses the paycheck count that converts a paystub to a month).

## MR-033 2026-10-05 A spending line says how it is paid
Decision: the spending line's "Card used" text became "How it is paid", a choice of bank or checking account, debit card, cash, other, or one of the household's credit cards by name (the options come from the Debt planet's card rows). A second choice, "Paid automatically or by hand", is a tag. The rewards lenses still match the card by its name.
Compatibility: primaryCard keeps its id; a stored card name is still a valid value. lineAutopay is new and optional.
Why: the owner asked for the payment method, including the bank account, and manual versus autopay.
Alternative: a free-text field (cannot be filtered and misspells card names).

## MR-034 2026-10-05 Pick the issuer, then the card
Decision: the Card field on a credit card row is two lists: the issuer, then that issuer's cards from the library; "Other" takes a typed name. Picking a card prefills the issuer, the annual fee and the statement credits as before.
Compatibility: cardName keeps its id and stores "Issuer Name" as before.
Why: one list of 58 cards was too many to scan.
Alternative: type-ahead on one list (works on a desktop, poor on a phone).

## MR-035 2026-10-05 One tracker from the first fact to the last
Decision: a strip at the top of Home and every Ledger page (coach view) shows one bar and one count, "N of M in", over an ordered list: the four household facts, then a row (or a rough total, or none) for every row type the situation asks for, then every row's headline figure, then every other counted fact. The first open step is "Now:" with a Go button that lands in that cell. Tags and cadence-hidden fields never count; a type assumed none counts as answered.
Compatibility: none; computed from the record.
Why: the owner felt they were going in circles and asked to be told what is needed now until everything is filled.
Alternative: per-planet percentages only (say how much, never what).

## MR-036 2026-10-05 A pay change and a new job are two blocks; a month picker; one headline question, the rest behind Details
Decision: "New job or pay change" split into Pay change (share of take-home, years) and New job (new gross salary a year, then months without pay, match change and years behind Details); Raise is gone since Pay change covers it. The new salary is compared with today's gross pay and scaled to take-home at today's ratio; gross pay joins the live figures a block can read. The start is a month picker that stores year and month. On every change card the first question shows and the rest wait behind "Details (n)".
Compatibility: a stored job block keeps its id and payChange; its old gapMonths and matchChange answers are ignored. A stored raise block has no type and is skipped by Simulate.
Why: the owner asked for a date picker that saves a date, a clear line between a new job and a pay change, a salary first and the questions behind a details tab.
Alternative: one block with a mode switch (two meanings in one card).

## MR-037 2026-10-05 Needed, Optional, Tag: three kinds of fact, and only the first is asked
Decision: every field is one of three kinds. Needed facts change a number and are asked, counted in the planet's percentage, placed on plates and listed by the tracker. Optional facts (`optional: true`) sharpen a number when known and never hold anything up: not counted, not on the tracker, on a plate only once they have a value, grouped under "Optional" in the row's Details with the note "sharpens a number when known; never holds anything up". Tags (`tag: true`) are labels to filter by. `docs/MODULE-AUDIT.md` lists every row type's goal and its three groups.
Compatibility: none; stored values are unchanged, only how they are counted.
Why: the owner asked for every module to be audited and made much simpler to fill in, with the relevant fields where expected.
Alternative: lower weights on the optional fields (still asked, still counted, still confusing).

## MR-038 2026-10-05 One calendar for every date; one box selects every row
Decision: every date in the app is the browser's own date input (`ui/datepicker.js`): birth date, As of, start and promo dates, target dates, and the start of a change on Starting soon and Simulate. A month field shows the first of the month and stores YYYY-MM; the value is read back from the record on every render, so what is picked sticks. The birth date keeps an age box beside the calendar for when only the age or the year is known. A word state (not applicable, will send) on a date comes from the state chip or Alt+S. The ledger header carries a checkbox that selects every row on the page, and the Delete button then says "Delete all N rows".
Compatibility: none; dates were already stored as ISO strings.
Why: typed dates were rejected in formats people use, the month input is not a calendar in every browser, and deleting a whole list took one click per row.
Alternative: a hand-built calendar widget (another thing to maintain; the native one is what people already know).

## MR-039 2026-10-05 Two hundred cards, business cards included
Decision: the card library grew from 58 to 212 cards across 42 issuers: personal, business (`business: true`) and store cards, including co-brand airline and hotel cards, credit unions, regional banks and fintech charge cards. The card picker shows an issuer's personal and business cards in two groups. Every entry is written from memory and marked verify; the tie-out workpapers were regenerated because the best library rate per category moved.
Compatibility: none; existing card ids are unchanged.
Why: the owner asked for a far more comprehensive list with business cards.
Alternative: a live feed from issuers (no public source; the library stays a starting point to verify).

## MR-040 2026-10-07 The FI ladder: five rungs, one module, progress counts invested assets, dates follow net worth
Decision: `engine/fiLadder.js` computes Lean, Barista Lean, Barista, FI and Fat FI with Coast as a marker. Percent there uses invested assets by default (`fiProgressBasis`, switchable to net worth). Every rung's date is read from the projection's net worth line, the same line the FI date comes from, so the FI rung lands on the FI date whatever counts as progress today. Lean falls back to food, accommodation and transportation when no line is flagged, marked rough; Fat falls back to spending times the fat multiplier; Barista uses the typed part-time income or the assumption, marked rough. `fiLevels` stays as an alias. Level 8 is not built: `dreamFiAge`, `dreamSpending` and `gutSpending` ship as optional Life plan fields and `fiSpendingBasis` as an Assumptions switch, as stand-ins.
Compatibility: `pctToFi` and `coastPct` change for every record with cash or real estate (they counted net worth); the workpapers were regenerated. The Life planet publishes four new slots.
Why: the brief; and two definitions of "reached" on one ladder would contradict each other.
Alternative: dates on the invested line (the FI rung would then disagree with the FI date by decades for a household whose surplus pools in cash).

## MR-041 2026-10-07 One graph from inputs to the FI date, edges as derivatives
Decision: `data/graph.json` hand-lists which fields and Sun facts feed each planet slot, the slot-to-slot reads, the projection inputs, the negative edges and the roots that do not move the FI date (with the reason). `engine/graph.js` generates the metric edges from `metrics.json` inputs (now naming assumption keys as `asm.<key>`) and gives upstream, downstream, roots of a metric, paths to the FI date and a net sign. An edge sign is the derivative: +1 when the upstream value rising raises the downstream value. The projection node stands for the FI date, so a later date is higher. Each root has one lever family: spend, earn, keep, grow, protect, assume. Labels with no number behind them sit under one sink node so nothing is an orphan.
Compatibility: none.
Why: every "which way" sentence and every path highlight reads the same sign table.
Alternative: good or bad as the sign (confuses a bigger FI number with a worse one).

## MR-042 2026-10-07 Sensitivity by re-running the whole engine; ask priority by answer state
Decision: `engine/sensitivity.js` copies the record, nudges one value and runs `compute` again for every typed money, rate and age root that reaches the FI date, plus all spending lines at once, the return, the withdrawal rate at 3.5%, inflation (as real return minus one point), part-time income at FI and a $1,000 windfall. The FI crossing is read to a tenth of a month by interpolating inside the crossing year. Impact is months per standard shock; ask priority is months across the plausible range by state (`weights.json` uncertainty: verified 2%, known 5%, rough 20% or the typed range, will send 30%, estimated 35%). When a FI date exists the Session card ranks by ask priority and says "about N months of FI date at stake" with a why line; unknowns and non-money facts keep the v1 score below them. The browser runs it in a module Worker, memoised per record version, debounced 250 ms, capped at 40 roots. Two synthetic households tie out to independent Python to the month.
Compatibility: none; nothing is written to the record.
Why: perturbing the projection inputs alone would skip the planets (tax inference, premiums, debt payoff), and the brief asked for `projection.js` to be used.
Alternative: closed-form derivatives (fast, but a second copy of every formula).

## MR-043 2026-10-07 Twenty FI lenses, two alternative paths, a coach flag for a move
Decision: the lens library grows to 39. `compute` runs two cheap alternative projections the lenses read (3.5% instead of 4%, and 80% of spending) and keeps the months in `projection.alt`. Geographic arbitrage fires only when the coach ticks "Considering a move" on the levers screen (stored as `sun.flags.geoArbitrage`). The tie-out compares the Level 1 to 5 lenses to the workpaper as before and states the simple Level 9 ones; the rest have a test that trips each one.
Compatibility: `sun.flags` is new and optional.
Why: the brief; and a "coach-triggered" lens needs one explicit switch.
Alternative: fire geo-arbitrage for everyone (noise for a household that is not moving).

## MR-044 2026-10-07 One drawer for every metric; a headline shelf; the levers screen
Decision: every metric drawer in the app (Measure tiles, the shelf, the levers screen) is `ui/metricdrawer.js`: the math as before, then direction, levers with their family and which way, the inputs that feed it from the graph, and the lens that reads it. The shelf (`ui/shelf.js`) sits on Home and the Session page in coach view and replaces Key numbers on the one-pager with client labels, compact, with the ladder hidden in print so the page stays one page. `#/levers` is the ladder as a staircase, the part-time income inline with its two live lines, the one-sentence top card, the ranked list by family with Impact and Ask priority, a root drawer with the shocks table and every number the root feeds, and a graph view that is hidden under 720 px. The client view keeps the ladder, the sentence and the top three levers in gentle words; benchmarks stay coach-only unless Assumptions says otherwise.
Compatibility: none.
Why: the brief asked for one place, linked everywhere.
Alternative: a separate drawer per screen (three places to keep in step).

## MR-045 2026-10-07 The discovery call: one form, a cost-of-living tier from the city, guesses that are never facts
Decision: `#/discovery` (coach only) is one scrolling table fed by `data/discovery.json`; Save builds a new client through `engine/discovery.js applyDiscovery`. What they said lands with the new source `discovery` ("What you said", confidence cap 0.6, their plate). `engine/parse.js parseSaid` hears numbers the way people say them (cadence words, "ish" and "like" as rough, "my half is", "split three ways"). The city sets the cost-of-living tier through `data/col-tiers.json` (BEA regional price parities: HCOL at or above 110, MCOL 95 to 110, LCOL under 95; 50 metros, every state with a non-metro value, 241 cities to metros, a city-to-state map so Jersey City is New York metro in New Jersey); a tapped tier is the coach's word and stops the auto-update. Every spending area they did not mention gets guess rows from `data/defaults.json`, scaled by the tier's all-items or housing index, by household (unit size: 1 bed alone, 2 bed with one roommate, 3 bed with two or more) and by sharing. A guess row carries `row.guess`, source `estimated` whose label is now "Guess" everywhere, and is never an anchor, never completeness, never variance; it is recomputed as paperwork when the tier or household changes, dropped the moment the area has a real line or a gut anchor, and switched off per client by `fillGapsWithGuesses`. The first draft says "Includes N guesses". Mindset chips for avoiding set the session mode to gentle.
Compatibility: `record.discovery`, `record.household`, `record.colTier`, `record.sessionMode`, `record.callProgress` and `record.targets` are new; schema 3 (MR-046). Spending lines gain optional `shared` and `myShare`. The `estimated` source label changed from "Estimate" to "Guess"; the ui-flows check moved with it.
Why: the brief; and a guess that could be mistaken for a fact would poison the variance and the completeness meter.
Alternative: a wizard of screens (the coach is listening, not clicking through pages).

## MR-046 2026-10-07 Anchors: what they said and what they would want, write-once, with a migration that backfills the gut
Decision: `record.anchors.gut` and `record.anchors.dream` hold one figure per key (`spending:<area>`, `spending:total`, `income:takeHome`, `income:gross`, `debt:total`, `safety:cash`, `life:fiAge`, `housing:alone`). `setAnchor` writes once and refuses a guess; `reanchor` is the only way to change one and journals kind `anchor` with the old figure kept in `anchors.history`. Discovery money values become gut anchors (the client's share for a shared bill). Migration 2 to 3 backfills gut anchors from the earliest non-guess journal line per area, marked `backfilled`, so an older client file shows "what you said" without a call; the one-pager hides a backfilled anchor that equals the lines. The stand-in rule (Spending planet): an area with no lines and a gut anchor publishes the anchor as a rough figure and says so in `standIns`; a guess stands in when there is no anchor. The Level 9 switch `fiSpendingBasis` reads the anchors first (dream total, gut total) and the Life plan stand-in fields after. The housing dream has a "living alone" choice that uses the full bill.
Compatibility: schemaVersion 3; `tests/fixtures/schema-2.json` migrates in store.test.js. The Spending planet publishes `standIns` and `anchorGapByCategory`.
Why: a gut figure that can be edited in place stops being what they said; the comparison needs the first word kept.
Alternative: store the gut as a field state on the line (it belongs to the area, not to any one line).

## MR-047 2026-10-07 Roommates and shared bills: every figure uses the client's share; the worst case says what happens if it all falls on them
Decision: `record.household` holds roommates (nickname, default share) and the lease (mine, both, theirs, none). A spending line marked `shared` publishes its full bill and the client's share (`myShare`, default one over the number of people); the baseline, DRAFTT, FAT floor, fixed and every downstream figure use the share. Safety Net adds `roommateGap` (full minus share, times `roommateMonthsToReplace`, default 2) to the Rule of 5 target and publishes `runway.fullAlone` and `runway.gapMonthly`; the runway tile and Measure show both numbers. The "Roommate moves out" block (`data/scenario-blocks.json`) prices the bridge months and the permanent case, and `roommateOutcome` gives Simulate its own card with the lease note. The Triple D worst case adds the shared gap as extra annual spending while a roommate exists. The `roommate-risk` lens fires when the full shared bills pass a quarter of take-home or the lease is in the client's name alone.
Compatibility: `shared` and `myShare` are optional on spending lines; records without them compute as before. Safety publishes one new slot; `data/graph.json` carries the new edges.
Why: a line that only shows the share hides the number that lands on them when the roommate leaves; a line that only shows the full bill overstates every month until then.
Alternative: a second spending planet for the household (two planets for one bill).

## MR-048 2026-10-07 Every journal line says why: correction, move or paperwork; two meters that move for different reasons
Decision: `setField` tags each line with `why` unless the caller says: a change from rough, unknown, will-send or a guess is a correction (we learned the truth), a change from known or verified is a move (real life changed), anything that does not change the number is paperwork. `engine/progress.js` counts the three since the last closed session, shows the FI date effect of corrections (guesses replaced shown apart), moves and planned moves (the saved targets), and tags each move Forward or Backward. The Session page gets two meters: Picture completeness (the share of dollars in the picture at known or verified; a guess counts as not complete, a stand-in anchor as money in the picture but not known) and Goal progress (invested over the FI number, the monthly gap, the FI date, how many guesses it still includes). Completeness moves with paperwork; goal progress moves with life.
Compatibility: `why` is a new optional key on journal lines; old lines read as paperwork.
Why: a session that only tidied states should not look like progress, and a session that found a true number should.
Alternative: one combined score (it would rise when the coach verified a bank statement, which changes nothing).

## MR-049 2026-10-07 The call path: six stops, one question at a time; variance in the client's words; four target choices
Decision: `#/call` (coach only) runs `data/callpath.json`: Confirm, What you spend, What you'd want, The real numbers, How far off, Your targets. Each stop reads one sentence aloud at a time with "Area 3 of 7"; "I don't know" and "None" are one tap; progress per session lives in `record.callProgress`. Confirm reads back what they said and each guess ("Use mine" swaps the guess for their number, whole bill or their part, and sets the gut anchor). What you'd want hides what they said until the coach ticks "Show what they said"; in gentle mode How far off holds the reveal until a real area exists. `engine/variance.js` gives awareness (said against actual), dream (actual against want) and wish (said against want) gaps per area, groups them (more than you thought, found money, above what you'd want, room to spend more), names the two areas that explain most of the gap, adds the FI effect of each gap and, coach only, a tier comparison; `ui/charts.js markers` draws the three figures on one line per area. Targets offer What you said, What you'd want, Meet in the middle (`callTargetRoomFraction`, default half way toward the nearer of said and want) and Keep it as is; the default rule picks the nearer figure when it saves money and Keep otherwise; saved targets are planned moves and feed the targets email and the one-pager. Internal words never reach the screen: no lap, anchor, variance, stand-in, ask priority, leverage, estimated, RPP or sharer; the client reads "What you said", "What it really is", "What you'd want", "Guess", "Your share", "If it all falls on you".
Compatibility: `record.targets` and `record.callProgress` are new; nothing else changes shape.
Why: the brief; one question at a time is how a call runs, and the words are the client's.
Alternative: one long comparison table (it reads as a judgement, not a conversation).

## MR-050 2026-10-07 Partners: whose money the picture counts; a target is a to-do for next session; one Maya, in the New York area
Decision: `record.household.partner` (nickname) and `household.basis` (together, the default, or mine) join roommates and the lease. Income rows gain an optional `whose` choice (Mine, Partner's). Under together the Income planet adds the partner's rows to the client's and a shared bill counts in full, less any roommates' equal slices; under mine it counts the client's own rows and their typed share. The partner's take-home is published as `partnerTakeHomeMonthly` either way. A partner counted together is one more mouth in every guess area; the bedroom count follows roommates alone. A partner is not a roommate gap: nothing in the Rule of 5 target, runway or the worst case assumes they leave. The discovery form asks "Is there a partner whose money is part of this picture?" and their take-home, and builds a W-2 row marked Partner's; the chip that said couples were out of scope now writes the partner. Confirm reads back who they live with and whose money counts; the household editor switches it. Every saved target writes one to-do on the one-pager list with the client's first name as owner ("Aim for $600 a month on food (now $791)"); Keep it as is takes it off; the Your targets stop lists them as "To do next session". The demo household and the discovery household are the same Maya Lindqvist, born 2000-02-11, in Jersey City, New Jersey (New York metro, HCOL): the demo is her picture after two sessions, the discovery fixture her first call.
Compatibility: `partner` and `basis` are new optional keys on the household (old records read as no partner, together); `whose` is optional on income rows; to-dos gain an optional `target` key. The demo Maya moved from Oakland to Jersey City; the metrics do not read the city, so the workpapers are unchanged except the state. Income publishes one new slot.
Why: the owner asked for partners, a to-do from each target, and one Maya in the New York area.
Alternative: a second client record for the partner (two files for one household, and no way to count together).

## MR-051 2026-10-07 The goal timeline: every goal at once, the starter cushion as a floor, derived goals and stored settings
Decision: `engine/goals.js` derives the goals from the record and the result on every compute and never stores them: a starter cushion (type floor, one month of spending by `starterCushionMonths` or a fixed amount per client, always priority 1), a full cushion (the Rule of 5 target with the roommate gap, minus the starter), one debt goal per debt row with a balance (a card on full autopay is not a goal), one goal per Life plan goal row (dated when it has a target date), the hand-typed extras, and three long-term rungs from the FI ladder (Lean FI, Coast FI, FI) that take no money and show the ladder's projected month. `record.goals` holds only the settings: mode, order, locked amounts, the all-at-once split, extras, the starter setting, links from a goal to an account row, and the finish months saved at the last session close; `setGoals` journals kind `goals`; schema 4. Both cushions read the cash balances: the starter is the first slice of cash, the full cushion the rest (Level 10's buckets were never built). The default order is the order of operations: starter, high-interest debt (10% and up, highest first), full cushion, dated goals by date, amounts, low-interest debt, long-term. Goal money is the surplus metric (take-home minus spending minus minimums); savings transfers sit outside spending, so they are already inside it. `allocate` runs month by month from the current month: debts step through `engine/debtsim.js stepDebt` (interest, then the minimum spending already pays), the floor takes every dollar until the starter is full, locked amounts next (never the floor), then the mode; a finished goal's money flows by the mode's rules the next month and the first goal whose money grows is the rollover mark; a paid-off debt's minimum joins the surplus the month after. A withdrawal shrinks the cushion pot, reopens the starter and marks the refill. A debt whose minimum does not cover its interest stops accruing once it passes three times its balance and reads "not reached". `assess` names the floor as the reason a dated goal slips only when the same run without the floor lands it on time, and gives the earliest month with the floor and that goal alone. The comparison runs all three modes on the same input. What-ifs (surplus, windfall, cushion use) stay in the view; Confirm writes order, mode, split and locks. `engine/ics.js` writes all-day events with plain titles.
Compatibility: schemaVersion 4 adds `record.goals` with defaults (migration 3 to 4; older files read as no settings). The journal gains kind `goals`. `compute` returns `goalPlan`; the sensitivity reruns pass `opts.light` and skip it. The session snapshot stores the finish months in `record.goals.lastFinish` so Since last time can say what moved.
Why: the brief; and goals that are stored would drift from the rows they came from.
Alternative: a stored goal list synced on every change (two copies of every debt and Life plan goal).

## MR-052 2026-10-07 The cushion in three steps on one pot: a lean month, a full month, then the Rule of 5
Decision: the owner re-briefed Level 11 with the cushion as three goals, so the level reopens here. One pot (the cash balances, or a linked account row) fills three steps in order: step 1 Lean month (type floor, fixed first; one month of the FAT floor from the Spending planet, else the food, housing and getting-around categories marked rough, or a fixed amount when `cushionStep1` says fixed and the Goals screen holds the amount), step 2 Full month (type floor, fixed second; one month of all spending times `cushionStep2Months`, default 1; the row shows the amount above the lean month), step 3 Full cushion (type amount, the Rule of 5 target with the roommate gap, at regular priority). Each step's balance is the pot capped at its target; the targets never decrease. Until steps 1 and 2 are full every goal dollar goes to them in order, in every mode; when a step fills part way through a month the rest of that month's money moves on the same month and the timeline marks the jump there, else the month after. Using the cushion shrinks the pot, reopens every step above it (step 1 refills before step 2) and marks the refill. A step the pot already covers when the plan is built is done at once with a celebration shown once (record.goals.celebrated) on the Goals screen, the Session page and the one-pager. A dated goal that slips names the step that took the last floor dollar before its date ("Your full month comes first, so the wedding needs $40 more a month after May") only when the same run without the floors would land it. Client words: Lean month covered, Full month covered, Full cushion; floor and FAT floor never reach the client view. The call path's first-draft card lists which steps are covered (Level 10's First accounts block was never built). The starter cushion of MR-051 and `starterCushionMonths` are gone.
Compatibility: `record.goals` keeps schema 4; `starter` is dropped and `cushion` ({ step1Cents, step2Months }), `celebrated` and `links` arrive with defaults. The finish map stores 'done' for a covered step so Since last time can say "you covered a full month". The assumption `starterCushionMonths` is replaced by `cushionStep1` and `cushionStep2Months`; the workpaper and tests were rewritten.
Why: the owner asked; three small wins beat one big one, and the lean month is reachable soonest.
Alternative: three separate buckets (three balances to keep in step for one savings account).

## MR-053 2026-10-07 The program as data: a discovery call and twelve sessions of blocks that bend
Decision: `data/curricula.json` holds the discovery call and sessions 1 to 12: id, name, goal sentence, markers (behind at minute 35, close at minute 48) and blocks in order, each with a priority (must, should, could, never-cut), minutes (min, target, max), read-aloud questions with what they fill, outputs, a skip rule (no debt, no roommate, no cards) and the session that inherits it when skipped or moved. Every session opens with Check-in and urgent check, Close open loops and Today's plan and ends with Three steps and Close and book, both never cut. `engine/curriculum.js` plans a session for one client (skip rules, blocks moved in from earlier sessions placed before the close), bends it (at the close marker jump to Three steps and move every unstarted block except the standing ones; at the behind marker move the unstarted should blocks when the clock is past the plan; when five minutes ahead and before the behind marker offer one could block picked by her goals and the leverage engine; Go deeper moves the next unstarted should block, never a must), switches to urgent mode (check-in, the urgent thing, three steps, close; everything else to the next session) and builds the three steps (what she already did today shown done, at most three open). `engine/program.js` keeps the state on `record.program` (sessions with status, dates, blocks done, skipped or moved with their minutes; moves; the parking lot; the account checklist; stress scores; CSV mappers; merchant overrides; the baseline) and journals every write as kind `program`. Urgent sessions are stored as u1, u2 and never take a program number unless the coach says so; a block moved to session 11 is listed as absorbed by Flex, so graduation stays at 12. The Level 8 call path stops render inside the Confirm, Gut lap, Dream lap, lock, reveal and targets blocks (`mountStop`). The runner's clock has a rehearsal control (five minutes on) so the bending can be practised and tested. The session 1 block list is the owner's; sessions 2 to 12 below are the builder's proposal for review:

Session 2, Lock the big numbers and finish accounts: Every big number from a document, the dream in her words, and the rest of the accounts open.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Dream lap (must, 6/8/12): a dream figure for every area
  - Paystub (must, 4/6/9): gross, take-home, pre-tax deductions, match, all known
  - Rent and the lease (must, 2/3/4): rent known, share known
  - Every debt (must, 5/7/12, skipped when no debt row with a balance): every debt balance and APR known
  - Account balances (must, 3/5/8): every balance known, 401k balance known
  - The rest of the accounts (must, 8/10/14): 401k portal checked, Roth opened, card decided, credit frozen
  - Guesses gone (should, 2/3/5, moves to session 3): no guess rows left; every area has her number
  - The picture, locked (should, 2/3/4, moves to session 3): the headline numbers at known or verified
  - Export for next time (could, 2/2/3, moves to session 3): how to export the transactions before session 3
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 3, Transactions I: Recurring bills and subscriptions from the real transactions, area by area against her gut.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Bring in the transactions (must, 4/6/10): the export imported and cleaned: card payments and transfers out, refunds netted
  - Recurring bills (must, 6/8/12): recurring lines verified as actuals
  - Subscriptions (must, 5/7/10): every subscription with its cadence and next renewal; cancellations as steps
  - Gut against actual, area by area (must, 6/8/12): estimated against actual ratio per area for the recurring part
  - Where it goes (should, 3/4/6, moves to session 4): top five merchants and their share
  - Prices creeping up (could, 2/3/4, moves to session 4): merchants whose amounts rise
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 4, Transactions II: The irregular and the one-off, the fees, the Venmo netting, the timing, and the full reveal.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Irregular and one-time (must, 5/7/10): irregular lines as actuals with a yearly cadence
  - Fees and buy now pay later (must, 3/4/6): fees on the mistakes line; BNPL flagged as debt
  - Venmo and Zelle (must, 3/4/6, skipped when no roommate in the household): reimbursements netted against shared lines
  - Paycheck against bills (should, 3/4/6, moves to session 5): the cash flow calendar with its low days
  - The full reveal (must, 6/8/12): what you said against what it really is, the blind spot percent, one found-money win as the first step
  - Money stress (must, 1/1/2): the second stress score
  - Patterns (could, 3/4/6, moves to session 5): small and frequent against big and rare; weeknight delivery
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 5, The plan: Targets in her words, automation set, buckets funded, debts in order.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Your targets (must, 8/10/14): a target per area, in her words
  - Automation (must, 5/7/10): transfers set the day after payday
  - Buckets funded (must, 4/5/8): each bucket with its monthly amount from the goal timeline
  - Debt order (must, 4/5/8, skipped when no debt row with a balance): avalanche, snowball or stress order chosen
  - When each goal lands (should, 3/4/6, moves to session 6): the goal timeline, with the next win
  - The leak (could, 2/3/4, moves to session 6): the hidden-leak reading
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 6, Safety and debt: The cushion on its way, sinking funds named, the worst case faced, the payoff dated.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Cushion progress (must, 4/5/8): lean month, full month, full cushion against their targets
  - Sinking funds (must, 4/6/9): sinking funds as buckets
  - Roommate worst case (must, 3/4/6, skipped when no roommate in the household): the if-it-all-falls-on-you card and the lease note
  - Payoff timeline (must, 5/7/10, skipped when no debt row with a balance): the debt-free date, the promo cliffs, interest saved by order
  - Utilization (should, 2/3/5, skipped when no credit card row, moves to session 8): utilization per card and in total; the drag reading
  - Insurance check (could, 3/4/6, moves to session 8): coverage rows typed
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 7, The future: The 401k and Roth decided, the first real FI number, every goal sized and dated.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - 401k decision (must, 5/7/10): the deferral decided; the order of operations as information
  - Roth funding (must, 4/6/9): the Roth funded or dated
  - The FI ladder (must, 5/7/10): the first real FI number and date, the rungs explained
  - Goals sized and dated (must, 5/6/9): every goal with an amount and a month on the timeline
  - Social Security account (could, 2/3/4, moves to session 8): my Social Security account opened
  - Coast check (could, 2/3/4, moves to session 8): the coast reading
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 8, Grow: The income levers, the tax check, the benefits she is not using.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - What moves the date (must, 6/8/12): the top three levers by months of FI date
  - Income levers (must, 5/7/10): one income move chosen with its FI effect
  - Tax check (must, 4/6/9): the implied rate against the brackets, tax room, saved per 1,000 pre-tax
  - Benefits (should, 3/5/7, moves to session 9): benefits turned on; HSA if eligible
  - Your real hourly wage (could, 2/3/4, moves to session 9): the real-hourly-wage reading
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 9, Revisit: Guess again without looking, see how far she has come, and ask for her words.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Blind guess test (must, 8/10/14): a blind guess per area against the actuals; the ratio against session 4
  - Progress against paperwork (must, 4/5/8): corrections, moves and paperwork since session 1; the FI date then and now
  - Goals against her words (must, 4/5/8): each discovery goal: hit, on the way, or changed
  - Money stress (must, 1/1/2): the third stress score
  - Her words and a referral (could, 3/4/6, moves to session 12): a testimonial in her words; one referral asked
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 10, Life simulator: Her big decisions as what-ifs, each alone and together.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Her big decisions (must, 5/6/9): the decisions named as scenario blocks
  - Each alone and together (must, 10/12/18): the paths chart; FI age and net worth at 95 for each
  - Promote one (should, 3/4/6, moves to session 11): one block promoted into the Life plan
  - Goals after the decisions (could, 3/4/6, moves to session 11): the goal timeline with the promoted block
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 11, Flex: Whatever she needs most, and everything the program moved here.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - What moved here (must, 10/15/25): every block the earlier sessions moved to Flex, run in order
  - Her pick (should, 8/10/15): one room, opened
  - How she will keep this up (could, 3/4/6, moves to session 12): the weekly routine drafted
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Session 12, Graduation: Before and after, her routine, what comes next.
  - Check-in and urgent check (must, 2/3/5): the urgent flag, or a clear start
  - Close open loops (must, 1/2/4): homework marked done, parked items picked up
  - Today's plan (must, 1/1/2): the session goal said aloud
  - Before and after (must, 8/10/14): the scorecard, discovery against now, in her words
  - Her routine (must, 5/7/10): the monthly routine written down
  - Money stress (must, 1/1/2): the fourth stress score
  - What comes next (must, 3/4/6): the maintenance offer, as information
  - Her words and a referral (could, 3/4/6): a testimonial with her numbers; one referral asked
  - Three steps (never-cut, 4/5/7): three steps, some already done today
  - Close and book (never-cut, 2/2/3): the next date, the snapshot, the follow-up email
Compatibility: `record.program` is new and optional (older files read as no program); the journal gains kind `program`; `#/call` now runs a session and the Level 8 call path moved to `#/callpath`.
Why: the brief; and the coach never decides what to cut during a call, the rules do, in one line.
Alternative: a fixed script per session (no room for the client who goes deeper or arrives on fire).

## MR-054 2026-10-07 The account checklist: seven items in order over two sessions, triggers for the rest, homework capped at three
Decision: `data/accounts-checklist.json` lists the items in order with their session: the tracking app linked and the high-yield savings with buckets (session 1); the Roth opened, the 401k portal, a card only if it fits, and the credit freeze (session 2, after the debts are locked); optional items by trigger (second checking when timing or structure is a struggle, HSA when the paystub shows one, employee assistance for a company or nonprofit employer, password manager and IRS PIN always offered, unclaimed property when she moved states or named a forgotten account, IRS account for self-employed or side income or a tax issue, my Social Security from session 7). Each item carries status (not started, opened, linked, done, not for me), who (on the call, homework, me), notes and a provider note the coach types per client; copy is plain and names no provider. "We are linking, not looking": the client logs in herself off screen share; in gentle mode nothing linked is reviewed on the call. The card shows the balance transfer wording when a card carries a balance at 10% or more, the rewards wording when nothing is carried, and "does not fit" otherwise; Roth funding and the card show the order of operations as information with "your choice". Linked is the end state for the tracking app. Anything unfinished in session 1 rolls to session 2; homework items go on her plate, at most three a session, the rest wait. The cushion steps from Level 11 appear on the savings card so the buckets are named in her words.
Compatibility: none beyond `record.program.checklist`.
Why: the brief; results in the first session come from accounts that exist, not from a plan.
Alternative: a free text to-do list (nothing would roll, trigger or cap).

## MR-055 2026-10-07 Transactions from a CSV: cleaned, categorized, read, and written back as verified actuals
Decision: `engine/transactions.js` parses a CSV (quotes honoured), guesses the columns (a Rocket Money export is recognised by its headers; a bank export by column names; debit and credit columns as two columns), remembers the mapping per institution on the record, and normalises amounts so spending is positive. Cleaning takes out card payments and transfers between her own accounts (a merchant rule, or the same amount with the opposite sign within three days across accounts), nets refunds against the merchant within thirty days, matches person-to-person money in to a shared line's other share within ten percent and seven days (the coach confirms; a confirmed match comes off that area), flags money in that says reimburse or expense as work money and money out by Venmo or Zelle with no bill behind it. `data/merchant-rules.json` maps merchants to the spending areas; coach overrides are remembered per client. Detection: recurring by interval and steady amount (weekly, every two weeks, monthly, quarterly, annual) with the next date by the calendar; subscriptions with annual against monthly; one-offs; fees to the mistakes line; buy now pay later flagged as debt; price creep (three charges and the last ten percent above the first); same-day duplicates. Patterns: top five merchants and their share, small and frequent against big and rare, weeknight takeout, paydays against bill days. Outputs: monthly actuals per area, the ratio of actual to her gut per area, the blind spot (the share of actual spending her gut did not cover), a correction factor per area, and one found-money win (the largest of a cancellable subscription counted for a year, the fees in the window, the unexplained Venmo in the window). Applying writes one verified line per repeating merchant in an area plus one for the rest, keeps her shared lines, and removes the guesses and her other typed lines in that area as corrections. The CSV itself is never stored; only what it taught us.
Compatibility: `record.program.transactions`, `mappers`, `merchantOverrides` and `blindSpot` are new; spending lines gain verified actuals.
Why: the brief; and no bank connection in this level.
Alternative: a bank connection (out of scope; a CSV every client can produce).

## MR-056 2026-10-07 Outcomes: a stress score four times, a scorecard, the blind guess test, before and after
Decision: the money stress score (1 to 10) is asked on the discovery form and in sessions 4, 9 and 12 as a block, stored with its date. `engine/outcomes.js` reads one result into the scorecard values (stress, blind spot, picture completeness, card balances, months of cash, cushion saved as a share of the full cushion, savings rate, FI date, goals reached of the ones she named); the discovery save or the start of session 1 captures the baseline once; the scorecard compares the baseline with now and says better, not yet or the same per line. Session 9 asks a blind guess per area into `anchors.blind` and compares the ratio with session 4. Graduation shows before and after on the program view (printable) and on the one-pager once session 12 is closed. The testimonial and referral prompt in sessions 9 and 12 reads her own improvements out ("your stress went from 8 to 6"), with a box for her words.
Compatibility: `anchors.blind` is a new anchor set; `record.program.stress`, `baseline`, `blindSpot` and `testimonial` are new.
Why: the brief; a program that cannot show its results is a plan.
Alternative: a satisfaction survey (tells us how she felt about the coach, not about her money).

## MR-057 2026-10-08 Demo-safe fixes: one FI story, an honest sandbox, no cut-off text, local time, the demo as the way in
Decision: every FI date is read from the projection's net worth line. The crossover date and the first $100,000 move from the invested-only series to that line (the crossover is now the FI date to the month), and the FI progress basis default flips to net worth, so % to FI, the ladder percents and Coast FI count the same money the FI date counts; `fiProgressBasis` still switches it. The flip stays invested-only by its nature and is renamed "The flip (invested only)" with a note. Simulate: a block flagged `income` (pay change, new job, side income, income ending) is a change in pay, kept apart from spending in `adjustments` as `pay`: it stops with work and never raises what retirement must cover; `compare` returns `notes`, plain sentences that fire by pattern (a costly block raising net worth at 95 through later FI; together worse than the blocks added up because the overlap draws savings down; FI after the retirement age), and the view prints them. Maya gets two Taxes rows (federal and New Jersey quarterly estimates) and a derived planet with no rows reads "is computed", never "is empty". No text is cut short with an ellipsis anywhere: tiles, DRAFTT and card lists, ladder stairs, lever rows, goal timeline names, history and clients cells wrap and grow; the runner's segment strip shows a number in any segment too narrow for its name and a numbered legend below. Journal timestamps and last-saved dates show in the browser's local time (`dateTimeLocal`, `dateLocal`). The levers page shows a skeleton of its final layout while the sensitivity run finishes, and that run starts in the background the moment a client opens. A first visit leads with one line on Money Rooms and "Load demo client" as the primary button, with "Start demo from zero" (a copy of Maya holding only her name, id `maya-zero`) and "Reset demo" (wipes both demo ids and reloads Maya). Client view hides every "(verify)" tag and the Benchmarks group. On a phone each Measure section folds to its header and its top two items.
Compatibility: `fiProgressBasis` default changes from invested to netWorth (a record that never set it now reads net worth); `adjustments` entries gain `pay`; `compare` gains `notes`; block types gain `income`; no stored shape changes.
Why: the demo brief; four FI numbers telling two stories, a sandbox that charged a pay cut to retirement, and labels ending in dots are what a friend notices first.
Alternative: keep invested-only progress and explain the gap in a note (two stories with a footnote is still two stories).

## MR-058 2026-10-08 Investments name rows by account type; holdings are optional and say what they are
Decision: a row type can name its rows by a field instead of a typed nickname (`nameField` in `data/fields.json`); Investments accounts use the account type select as the first, sticky column, and the nickname moves behind Details. Picking a type fills an empty nickname (or one that was itself a type label) with the type's label, so holdings' account reference and the engine's account map keep a name. Holdings are flagged `optionalType`: the fill tracker never asks for them, and the empty screen explains that a holding is a fund inside an account with its expense ratio, read only by the fee numbers.
Compatibility: none; nicknames stay stored and older rows keep theirs.
Why: the owner's note from the phone: "instead of nickname in investments it should be the type of account", and "what is a holding, can it just be removed".
Alternative: delete the holding type (fee drag to 95, the cheapest-fund lens and the allocation would go with it).
