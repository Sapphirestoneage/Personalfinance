# Coach Mode decisions (CD-###)

This lane's own log, so it never contends with SPARKS for a number. SPARKS
records the one fact that the lane exists (D-338). New entry: the next CD
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
