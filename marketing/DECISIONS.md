# Marketing Scoreboard decisions (MD-###)

One sequence for `marketing/`, separate from `D-###` (SPARKS), `DD-###`
(Dungeons & Dividends) and `CD-###` (Coach Mode). D-340 in the SPARKS log
is the entry that made this lane. Same template: why, decision, what it
replaces, stored shape, verified.

## MD-001 — A separate app in marketing/, with byte-identical copies of what it borrows

**Why.** The owner wants to measure every post, every contact and every
touch, and share the numbers with marketer friends, without adding a room.

**Decision.** `marketing/` is its own app, like `coach/`: three screens, its
own store (`mkt.` keys), its own tests and log. It carries `shared/csv.js`,
`shared/money.js`, the theme, the fonts and `coach/shared/charts.js` as
byte-identical copies through `marketing/tools/vendor.js`. Reference rows
live in `data/tables.json`; the plain words in `data/help.json`.

**Replaces or removes.** A spreadsheet the owner would otherwise start.

**Stored shape.** New keys, all `mkt.`. No SPARKS or coach key is touched.

**Verified.** `node marketing/test/run.js`.

## MD-002 — The store: posts, people, touches, settings; empty is not zero

**Decision.** `shared/mkt.js`. A count is null (blank), an integer, or refused;
a bad value refuses the whole save and the old values stand. A person's
`cadence` is null (the stage's rhythm), 0 (never) or days. A stage change
appends `{ stage, at }` to `stageHistory`, which is how leads, calls and
clients are counted by period. CSV columns are found by name (`mapContacts`,
`mapPosts`); a LinkedIn or Google export reads as it is. Save is one JSON
file signed `mktExport: 1`; load replaces or merges by id.

**Stored shape.** `mkt.posts.v1`, `mkt.people.v1`, `mkt.touches.v1`,
`mkt.settings.v1`, as documented at the top of the file.

## MD-003 — The readings: one engine, periods, pace, the funnel, when and how

**Decision.** `engines/kpi.js`, pure. Weeks start Monday. Reach-outs are
outgoing touches; conversations are people who replied or wrote first,
counted once. The funnel is seven steps, each a share of the last step that
had a number, and names the worst drop. Pace is target times the share of
the week elapsed. Next touch is the last touch plus the rhythm; a date the
owner set wins; three unanswered reach-outs change the advice.

## MD-004 — The example data is built relative to today, and is the same every time

**Decision.** `shared/demo.js`, a seeded generator. Every name and address
is invented (`@example.com`). Loading it sets `settings.demo`, which the
header shows with one link to clear it.

## MD-005 — The screens share the coach's chart frame and look

**Decision.** `common.js` and `mkt.css`, lifted from `coach/common.js` and
`coach/coach.css` with the coach's prefs swapped for the Scoreboard's. The
eight colour themes were validated for the coach against the same surface.

## MD-006 to MD-008 — The three screens

**Decision.** The Scoreboard (`index.html`), the Content log (`posts.html`),
People (`people.html`). Each is static markup plus one script; forms are
built once (`LIVE-FORM: built once` in each page's head comment). The share
report is plain text and names no contact.

**Verified.** `node marketing/test/run.js`; the three screens opened in
Chromium with the example data, no console errors.

## MD-009 — The second pass: the read, the period before, what works, where the money comes from

**Why.** The owner wants a marketer to look at the Scoreboard and see a tool,
not a sheet: even grids, and the readings a marketer expects.

**Decision.** `engines/kpi.js` gains `compare` (every figure against the
period of the same length before it, with "better" knowing that hours a lead
should fall), `byCta`, `byWeekday`, `heatmap` (posts a day, twelve weeks),
`attribution` (people, leads, clients and revenue by lane and by the post
that brought them), `conversion` (stage-to-stage rates all time, the median
days from lead to client) and `insights` (the sentences: pace, overdue,
streak, reply rate, the best post, the worst people step of the funnel,
the winning format, reach against before, results not typed). The funnel's
worst step is judged among the people steps. The Scoreboard draws all of
it in fixed grids of five, four and two; the targets are edited in one
static row behind a toggle, never repainted; a blank target is the usual
one from `data/tables.json`. A person can be linked to the post that
brought them (People, Edit). `posts.html?show=unchecked` opens the log on
the posts waiting for results.

**Replaces or removes.** The targets typed inside the tiles; the single
lonely chart row.

**Stored shape.** No change. `fromPostId` existed and is now settable.

**Verified.** `node marketing/test/run.js`; the Scoreboard at 1280 and
400 wide in Chromium with the example data and empty, no console errors.

## MD-010 — The Scoreboard as one spreadsheet, for the owner who trusts a cell over an app

**Why.** The owner finds the app confusing and does not trust what they cannot
click on. A spreadsheet shows every formula.

**Decision.** `marketing/tools/sheet.py` writes `marketing/Marketing-Scoreboard.xlsx`:
the same three logs (Posts, People, Touches) and the same readings, every one
a formula over those tabs. Leads, calls and clients are counted from three
dates typed on People (became a lead on, call booked on, became a client on)
rather than a stage history, because a date in a cell is checkable. Blank is
never zero: a sum over a column nobody typed reads blank, and a rate with a
blank in it reads blank. Dropdowns and the weekly targets live on Lists; the
Weekly tab carries the streak and three charts. Example rows say EXAMPLE.
The file opens in Google Sheets (File, Import) or Excel; nothing in it runs.

**Replaces or removes.** Nothing in the app; it is the same tool in a form
the owner will use. If the sheet is what gets used, the app is the thing to
retire.

**Stored shape.** None. The workbook is a template; the owner's copy lives in
their Drive.

**Verified.** Every formula recalculated by LibreOffice with no errors; the
example numbers checked by hand (reach 10,070, engagement 7.3%, two leads
in the period, Ada overdue by three days).
