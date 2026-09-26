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
