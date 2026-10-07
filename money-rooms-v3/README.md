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
| `engine/leverage.js`, `engine/plates.js`, `engine/email.js` | What to ask next, the two plates, the follow-up email |
| `engine/scenarios.js` | Scenario blocks: costs from answers, each alone and together, never writing to the record |
| `engine/compute.js` | Runs the planets and returns one result for the views |
| `ui/app.js` | The shell: routes, view toggle, autosave, undo, shortcuts |
| `ui/tokens.css`, `ui/app.css`, `ui/print.css` | The design system and the one-pager print sheet |
| `ui/views/` | One module per screen (home, ledger, measure, onepager, session, scenarios, learn, assumptions, levers); views never do math |
| `ui/shelf.js`, `ui/metricdrawer.js`, `ui/levers-bridge.js`, `ui/levers-worker.js` | The headline metrics shelf, the one drawer every metric opens (math, inputs, levers, lens), and the memoised sensitivity runner (a module Worker when the browser has one) |
| `ui/charts.js`, `ui/table.js`, `ui/orbit.js` | The D3 charts, the Ledger table, the orbit map |
| `data/` | Libraries, each with asOf, source and a verify flag |
| `tests/` | `run.js`, `ui.js`, engine tests, households and their expected workpapers (`tests/households/expected.py` writes them from the fixtures, never from the engine) |
| `CONTRACTS.md` | What each planet publishes, written before the code |
| `DECISIONS.md`, `QUESTIONS.md`, `PROGRESS.md`, `BOARD.md`, `SPEC-COVERAGE.md`, `DONE.md` | The run's own records |

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

Couples and joint accounts, a multi-client picker beyond load and save, cloud
sync or encryption, Google Sheet CSV import, session templates, a compliance
footer or consent flow, refresh cadence, state tax, ACA, Roth conversions,
72(t), the rule of 55, live card or fund feeds. (FI-date-sensitivity leverage shipped in Level 9.)

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
