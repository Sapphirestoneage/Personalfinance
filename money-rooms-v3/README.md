# Money Rooms v3 (Coach Edition)

Financial planning software a coach drives live in client sessions. Plain
HTML, CSS and ES modules; no build step. D3 is vendored. Everything a client
types stays in that browser's localStorage under `mr3:` keys; JSON export and
import move a client between machines.

Open `money-rooms-v3/index.html` through any static server:

```
python3 -m http.server 8000
# then http://localhost:8000/money-rooms-v3/
```

## Run the gates

```
node money-rooms-v3/tests/run.js      # engine tests (node --test) and the lint sweep
node money-rooms-v3/tests/ui.js       # Playwright: every screen, both views, three widths
node money-rooms-v3/tests/ui.js --shots 3   # same, and write screenshots/level-3/
```

The browser gate needs Playwright (`npm install --no-save playwright` at the
repository root, `npx playwright install chromium`).

## Map

| Path | What it is |
|---|---|
| `engine/units.js` | Quantities with period, basis and tax; mismatches throw |
| `engine/format.js` | The one formatting module |
| `engine/states.js` | Answer states, sources, confidence |
| `engine/record.js`, `engine/journal.js`, `engine/store.js` | The client record, its append-only journal, storage and migrations |
| `engine/sun.js` | The hub: Sun facts, planet slots, the contract |
| `engine/planets/*.js` | The seven planets, five stations each; `common.js` turns facts into Quantities |
| `engine/tax.js` | The one tax function: federal brackets, FICA, self-employment |
| `engine/debtsim.js`, `engine/projection.js` | Payoff simulation; the year-by-year projection to 95 (Triple D) |
| `engine/metrics.js`, `engine/lenses.js`, `engine/chartdata.js` | The 74 metrics with their math, direction and levers; the 39 lenses; data for the 8 charts |
| `engine/fiLadder.js`, `engine/graph.js`, `engine/sensitivity.js` | Level 9: the FI ladder (Lean, Barista, FI, Fat, Coast), the dependency graph from inputs to the FI date, and what moves the FI date (impact and ask priority) |
| `engine/parse.js`, `engine/col.js`, `engine/guesses.js`, `engine/discovery.js` | Level 8: numbers the way people say them ("1900 every two weeks", "my half is 1,650"), the cost-of-living tier from the city (`data/col-tiers.json`), the guesses that fill empty areas, and the discovery call applied to a record |
| `engine/anchors.js`, `engine/callpath.js`, `engine/variance.js`, `engine/targets.js`, `engine/progress.js` | Level 8: what they said and what they would want (write-once anchors), the six stops of the call, what you said against what it really is, the four target choices, and progress versus paperwork |
| `engine/curriculum.js`, `engine/program.js`, `engine/transactions.js`, `engine/outcomes.js` | Level 10: the program (curricula as data, bending rules, urgent mode, the parking lot, the account checklist, readiness), transactions from a CSV, and the outcomes (stress, scorecard, blind guess test) |
| `engine/goals.js`, `engine/ics.js` | Level 11: the goal timeline (every goal funded at once from the surplus, the cushion in three steps with the first two before anything else, three ways to split, rollover, shortfalls with the step named) and the calendar export |
| `engine/leverage.js`, `engine/plates.js`, `engine/email.js` | What to ask next, the two plates, the follow-up, discovery and targets emails |
| `engine/scenarios.js` | Scenario blocks: costs from answers, each alone and together, never writing to the record |
| `engine/compute.js` | Runs the planets and returns one result for the views |
| `ui/app.js` | The shell: routes, view toggle, autosave, undo, shortcuts |
| `ui/tokens.css`, `ui/app.css`, `ui/print.css` | The design system and the one-pager print sheet |
| `ui/views/` | One module per screen (home, ledger, measure, onepager, session, scenarios, learn, assumptions, levers, discovery, call, callpath, run, prep, program, transactions, goals); views never do math |
| `ui/shelf.js`, `ui/metricdrawer.js`, `ui/levers-bridge.js`, `ui/levers-worker.js` | The headline metrics shelf, the one drawer every metric opens (math, inputs, levers, lens), and the memoised sensitivity runner (a module Worker when the browser has one) |
| `ui/charts.js`, `ui/table.js`, `ui/orbit.js` | The D3 charts, the Ledger table, the orbit map |
| `data/` | Libraries, each with asOf, source and a verify flag |
| `tests/` | `run.js`, `ui.js`, engine tests, households and their expected workpapers (`tests/households/expected.py` writes them from the fixtures, never from the engine) |
| `CONTRACTS.md` | What each planet publishes, written before the code |
| `DECISIONS.md`, `QUESTIONS.md`, `PROGRESS.md`, `BOARD.md`, `SPEC-COVERAGE.md`, `DONE.md` | The run's own records |

## Charts first (MR-061)

Measure opens on the Overview: up to eight hero charts with their takeaway
as the title. The Charts tab holds all 31 (ten from Level 2 and Level 8 in
`engine/chartdata.js`, twenty-two in `engine/chartdata-more.js`), filtered by
planet; a locked chart says what it needs and offers the input. Numbers keeps
the tile wall with sparklines on time tiles; a metric's drawer shows its chart
small. `engine/charts-all.js` is the one list of charts.

## The unlock loop (MR-059)

Every save is compared before and after. What moved from locked to rough or
solid shows in a panel (a sheet on a phone) grouped Charts, Numbers, Lenses,
each with its value and one plain takeaway; small unlocks fold to a toast.
Measure is tabs with stable links: `#/measure/numbers/<metric>`,
`#/measure/lenses/<lens>`, `#/measure/charts/<chart>` (the focused view) and
`#/measure/unlocks` (the map: every metric, lens and chart by stage, locked
tiles naming their input, rings for completion and a separate ring for FI
progress). The Next unlock card names the one input that opens the most and
puts the cursor in it. Engine: `engine/unlocks.js`, data: `data/unlocks.json`.

## The demo (MR-057)

A first visit shows one line on Money Rooms and three ways in: **Load demo
client** (Maya, example numbers only), **Start demo from zero** (a copy of
Maya holding only her name, for entering her numbers one at a time) and,
once a demo client exists, **Reset demo** (wipes both and loads Maya fresh).
Every FI date reads from the projection's net worth line; the one metric that
counts invested assets only says so in its name.

## Adding a client

Home, type a name, press Enter. Facts go in through the Ledger only. Export
from the Clients table; import with the Import button. Importing over an
existing client keeps a snapshot you can restore from the toast.

## Updating the libraries

Everything the app looks up lives in `data/` and carries `asOf`, `source` and a
`verify` flag. Nothing is inlined in code.

- `cards.json` and `funds.json`: add or edit an entry, bump `asOf`. Values
  stay `verify: true` until Eli checks them against the issuer or fund page;
  the Ledger shows prefilled numbers as "Looked up (verify)" at 0.7 confidence
  until a statement confirms them.
- `tax-2026.json` and `limits-2026.json`: copy to a new year's file, update the
  brackets, standard deduction, FICA parts and contribution limits, then point
  `ui/data-loader.js` at the new file name. Keep the old year for old records.
- `defaults.json`: national averages used by "Use national averages"; each row
  shows as Estimated at 0.5 confidence.
- `assumptions.json`: the engine defaults the Assumptions screen edits per
  client. Every key here is read by the engine (MR-024).
- `scenario-blocks.json`, `lenses.json`, `metrics.json`, `readings.json`,
  `glossary.json`: copy and formulas; `node tests/run.js` checks the shapes.
- `graph.json`: the hand-listed edges from fields into planet slots, the
  projection inputs, edge signs and the roots that do not move the FI date;
  `tests/engine/graph.test.js` fails on a cycle, an orphan or an unmarked root.
- `benchmarks.json`: salary multiples by age and the expected net worth
  formula, every figure marked verify; shown in the coach view only unless the
  Assumptions screen turns them on for a client.

After any change: `node tests/run.js`, then `node tests/ui.js`.

## Parking lot (out of scope, not built)

Joint accounts, a multi-client picker beyond load and save, cloud
sync or encryption, Google Sheet CSV import, session templates, a compliance
footer or consent flow, refresh cadence, state tax, ACA, Roth conversions,
72(t), the rule of 55, live card or fund feeds. (FI-date-sensitivity leverage shipped in Level 9.)

## Level 8: Discovery, Confirm and the call path

Home, "New discovery call" (coach only). One scrolling table for the first
call: snapshot, why now, money, spending, goals, mindset, their words, with
a chip bar for the things people say ("I have a roommate", "Phone on a family
plan"). Type what they say the way they say it; the hint under each box shows
what was heard. The city sets the cost-of-living tier (HCOL, MCOL, LCOL from
BEA regional price parities; the client reads "high cost area"); tap a tier
chip to overrule it. Save builds a new client with everything they said as
"What you said", a guess (an average for the tier, scaled for roommates and
the unit size) in every spending area they did not mention, and a first draft
with "Includes N guesses". The summary sheet prints, and its email asks for
at most three things.

`#/call` runs session 1 one question at a time: Confirm (what they said, my
guesses, "Use mine" to swap a guess for their number), What you spend (their
gut, "Area 3 of 7", "I don't know" in one tap), What you'd want (the dream,
with what they said hidden until the coach reveals it), The real numbers,
How far off (what you said against what it really is, in groups, with the
FI effect of each gap), and Your targets (What you said, What you'd want,
Meet in the middle, Keep it as is). A partner's pay joins the picture (counted together, or just the client's,
from the household editor). A roommate marks lines as shared; every
figure uses the client's share, and runway, the cushion target, Simulate
("Roommate moves out") and the worst case say what happens if it all falls
on them. The Session page carries two meters (Picture completeness, Goal
progress) and Progress vs paperwork.

## Level 10: The program

Program in the side nav shows one row per session, discovery first, with
status, date, targets met, accounts opened, homework done and the stress
score where it was asked; urgent sessions sit between the numbered ones.
Prepare the next session shows her words, parked items, open loops, the
account steps, what the session should leave known and the plan. Run session
runs it one part at a time with the clock on top: the app moves parts to next
time when the call runs long, protects the last ten minutes, offers one more
when there is room, and switches to urgent mode from the first chip. Park it
holds a thought for next time; Pause holds the clock. Transactions takes a
CSV export, cleans it, reads it and writes the real numbers into the Ledger
for the session 4 reveal.

## Level 11: Goal timeline

`#/goals` (Goals in the side nav; "Your goals" in the client view, and a line
under the Home shelf). The top of the screen is one sentence: "Your next win
is the wedding, in September 2027." Below it, months run across the top and
every goal has a row: the cushion's three steps first (a lean month and a
full month, both before anything else, then the full cushion at its place in
the order), then each debt, each Life plan goal and each hand-typed goal, with the long-term rungs (Lean FI,
Coast FI, FI) at the right edge with their projected dates. Filled months are
funded; the flag is the date she wants it by; the arrow is money arriving from
a finished goal; a dashed month is the cushion refilling after she used it.
Under the timeline: where the money goes each month, and the three ways to
split it (dates first, one at a time, all at once) compared on goals on time
and interest paid. What-ifs (100 more or less a month, a windfall, using the
cushion, a new order, a locked amount) update the timeline live and say what
moved; Confirm saves the order, mode, split or lock; surplus, windfall and
cushion what-ifs never reach the record. Add to calendar downloads an .ics
with each finish month and each closed session. A step the savings already
cover is celebrated once ("You already have a lean month covered"). Level 10 (savings buckets,
curricula) was not built before this level: cushion goals read the cash
balances and a goal can link to an account row instead of a bucket.

## Level 9: What moves the FI date

Open `#/levers` (Levers in the side nav; "What matters most" in the client
view). The ladder runs Lean, Barista Lean, Barista, FI and Fat with Coast as a
line under it; each rung shows its number, how far along the household is,
the month the projection reaches it and the monthly investing that reaches it
by the dream FI age. Type the part-time income at FI inline and watch the
Barista rungs move by the rule ($100 a month lowers the target by 12 over the
withdrawal rate). Below, every input that reaches the FI date is ranked by
how far it moves the date: Impact (per standard shock) or Ask priority (across
the figure's plausible range). Tap a row for every number it feeds; tap any
headline tile for its inputs, levers and the lens that reads it. The Graph
button draws the whole dependency graph left to right.
