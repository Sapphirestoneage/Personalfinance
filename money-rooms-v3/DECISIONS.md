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
