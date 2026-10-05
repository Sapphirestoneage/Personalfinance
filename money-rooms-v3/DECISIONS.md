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
