# Coach Mode decisions (CD-###)

This lane's own log, so it never contends with SPARKS for a number. SPARKS
records the one fact that the lane exists (D-339). New entry: the next CD
number, at the end, 20 lines at most. Reasoning goes in the commit message.

## CD-001 — Its own app, carrying only the engines it reads

**Why.** The owner wants the coach tool built in parallel, without the bulk of
the rooms.

**Decision.** `coach/` holds three screens and its own store, tests and log.
Figures come from byte-identical copies of SPARKS files (`tools/vendor.js`:
money, schema, reference, csv, vault, demo persona; Tier0, Foo, Projection,
CashFlow, Coast, Debt, Opening, Countdown; their tables; the theme and fonts).
Ratios and Goals are not carried: they reach the SPARKS spine and ownership.
The rail's liquidity and housing ratios are two Schema readers over one
another, held equal to SPARKS' Ratios by `test/run.js`; goals use Countdown.

**Stored shape.** None in SPARKS.

## CD-002 — The store: `coach.` keys, and every call names its client

**Decision.** `shared/coach.js`: `coach.roster.v1` (no money, ever),
`coach.client.<id>.v1` `{ household, coach }`, `coach.client.<id>.snaps.v1`.
There is no "current client": every read and write names one, so a page can
never draw one client with another's numbers. Files leave only sealed
(`shared/vault.js`), carrying `slafCoachExport`; `.gitignore` refuses them.

**Stored shape.** New keys only; SPARKS keys are never read or written.

## CD-003 — The work area is the coach's own entry form

**Why.** Embedding the SPARKS rooms tied the coach to the whole app.

**Decision.** Each stop lists its fields (`data/fields.json`, ids are SPARKS
Ledger row ids) as plain boxes, and its lists (debts, accounts, goals) one line
each. `shared/fields.js` writes each to the path SPARKS writes it, through the
Schema constructors, and stamps `meta.fields` (rough or sure). The form is
built once per stop; a save repaints the path, read-outs and rail only.

## CD-004 — The path as data, done-when evaluated, the rail against the start

**Decision.** `data/session_paths.json`: nine stops, two templates; each stop
names fields, read-outs, questions and doneWhen tests `engines/session.js`
evaluates from the household. The rail (five ratios and net worth, then the FI
band) shows now against the session's start snapshot.

## CD-005 — Quick entry: shorthand into entries, never a guessed number

**Decision.** `engines/quickentry.js` with `data/quick_entry.json`: one word
names the entry, amounts need no symbol, a rate needs its %. A line it cannot
read, or that says two of one thing, is a private note. Words left over are
kept as a note; a balance is never worked back from payments left.

## CD-006 — Home, Session, detour, notes, the recap

**Decision.** Home: one row a client, the demo client, the sheet import
(columns map once to fields or quick-entry words; unmapped become private
notes), sealed backups. Session: path, entry form, rail, detour two deep,
notes (private and shared), homework, comments, decisions. Start and End
snapshot the household; the recap is their diff in words, never a coach note.

## CD-007 — Client View: phone first, and one door into the record

**Decision.** `clientview.js` renders the life map (drawn at its real width),
goals, what changed, homework. `ClientView.visible` is its only door into the
coach record: shared notes, homework, check-in dates, decisions marked "show
client". `?snap=` shows any snapshot read-only; presenter mode links nowhere.

## CD-008 — Check-ins and comments, coach-entered for now

**Decision.** A check-in writes each reported balance to its field and keeps
the report; a blank box is not reported. Comments attach to a field, goal or
recap. Status: in (35 days), late (65), missing. Shapes in `LATER.md`.

## CD-009 — Plain words on every box, read-out and stop

**Why.** The owner's bar: a third grader, or someone overwhelmed by money, can
fill it in. Bare labels ("Pay before tax, a year") could not be answered by
someone who has never read a payslip. `coach/AUDIT.md` lists what was found.

**Decision.** `data/help.json` holds, for every field, the question in plain
words, what it means, where to find it, an example and the way out when unsure;
for every read-out a plain label, what it means and what good looks like; for
every stop how to run it and when it is done; and a Words panel. A "?" beside
each box opens it. Labels in `fields.json` and `session_paths.json` are plain;
a read-out's words live in help.json only. Client-facing copy never says "FI":
it is the work-optional date. Wording for pay, home, debt and savings follows
SPARKS' owner-approved `data/sketch_help.json`. `test/run.js` fails if a field,
read-out or stop lacks help, or a help sentence runs past 26 words.

## CD-010 — Pictures for every number set, drawn only as validated colours

**Why.** The only picture was the life map. The owner wants a chart for every
number set, with the type and colours changeable, and colour meaning nothing
on its own.

**Decision.** `shared/charts.js` draws breakdowns (donut, pie, columns, bars,
one bar), comparisons, series (line, area, columns, stacked, sparkline),
meters (bar, dial), progress (bars, rings) and ranges (band, bars) from specs
`engines/session.js` builds only from engine figures: the month, the year, own
and owe, accounts, debts, the payoff, what an extra payment does, five meters,
goals, the band, the path, net worth and mood over time. Every chart has
Customise (the types that fit, eight themes, a swatch a series), Show as a
table, and a tip on hover or focus; choices live in `coach.prefs.v1`.

**Colours.** Eight hues and eight theme orders, each run through the dataviz
validator against this app's dark surface (#12151B) on 26 Sept 2026: all
40,320 orders were tried, 1,684 pass, and the theme for each lead hue is the
passing order with the widest colour-vision separation. Status (good, watch,
needs care) uses the app's tokens with a word beside it, never a series hue.

**Stored shape.** `coach.prefs.v1` (display only, no money). No household change.

## CD-011 — The look: one header, a welcome, cards, a step bar, tabs, print

**Decision.** One header on every screen. Coach Home opens on three steps until
the first real client exists, then one card a client with the progress picture
and one primary action; import and backup are folded behind plain headings. The
Session has a step bar, the stop's questions as a script, read-outs as tiles,
the pictures, then the form; quick entry sits at the top of the work card (the
sticky bar drew over the notes); one note box with a private/shared switch.
Client View leads with the work-optional age, then the map and the pictures;
presenter mode hides the coach's controls; it prints as a clean report. The
demo client carries three example sessions and check-ins so nothing is empty.
