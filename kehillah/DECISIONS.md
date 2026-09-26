# Kehillah decisions (KD-###)

This lane's own log, so it never contends with SPARKS for a number. SPARKS
records the one fact that the lane exists (D-340). New entry: the next KD
number, at the end, 20 lines at most. Reasoning goes in the commit message.

## KD-001 — Its own app, carrying only the theme and the money module

**Why.** The owner wants a complete money-planning site for the queer Jewish
community. The freeze (D-313) allows no new room; D-339 set the pattern of a
separate app in its own folder.

**Decision.** `kehillah/` holds nine pages, its own store, tables, engines,
tests and log. It carries byte-identical copies of `shared/money.js`,
`shared/theme.css`, `shared/fonts.css` and the fonts (`tools/vendor.js`),
and nothing else of SPARKS: no spine, no ownership, no engine. Nothing
outside `kehillah/` changes for it beyond the CI step and the one-line
mentions in `STATUS.md`, `CLAUDE.md` and `docs/ARCHITECTURE.md`.

**Stored shape.** None in SPARKS.

## KD-002 — One plan under `kehillah.plan.v1`, every money field null until typed

**Decision.** `shared/store.js` keeps one object: `year`, `tzedakah`,
`protections`, `cushion`, `family`, `care`, `gemach`, `elul`. A money field
is integer cents or `null`; a cleared box writes `null`, a typed 0 writes 0.
Older shapes open with missing branches filled (`withDefaults`). The demo
(`shared/demo.js`, Noa and Sam, invented) is loaded only from the header
strip and marked `demo: true` while it is in. No `slaf.` key is ever read
or written.

**Stored shape.** New key `kehillah.plan.v1`. The SPARKS device backup
neither carries nor removes it.

## KD-003 — One reading a page, and one timeline for every date

**Decision.** `engines/timeline.js` is the only function that turns a
target, what is saved and a monthly amount into months and a date; family,
care and the cushion all read it. `year.js` sums entered lines (weekly times
52, monthly times 12) and places dated lines in their holiday's month.
`tzedakah.js` is income times rate, a tally of gifts, and the ladder.
`protections.js` counts papers by status and prices what is left.
`care.js` caps covered lines at the plan's out-of-pocket maximum and adds
uncovered lines in full; a line without a covered/not answer makes the
reading incomplete. `loan.js` is the ordinary amortized payment; at 0% the
total is the principal. Every engine returns `incomplete` with a reason when
an input is blank, and never a 0 in its place.

**Stored shape.** No change.

## KD-004 — Nine pages, one header, boxes built once, guide figures never used as numbers

**Decision.** Every page wears the same header (wordmark, nav, the demo
strip), a `k-stats` row of figure tiles, a words fold and a foot that names
the table's source and confidence. Typed boxes are built at boot and never
rebuilt (D-034); a change repaints read-outs only. Beside a box the table's
typical range is text; a "use $x" button is the only way a guide figure
becomes the person's number. Every string that reaches `innerHTML` goes
through `esc()`. Pages run no inline script (`script-src 'self'`).

**Replaces or removes.** Nothing in SPARKS; this is a lane beside it.

**Stored shape.** No change.
