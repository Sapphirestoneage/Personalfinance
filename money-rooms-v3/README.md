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
| `engine/compute.js` | Runs the planets and returns one result for the views |
| `ui/app.js` | The shell: routes, view toggle, autosave, undo, shortcuts |
| `ui/tokens.css`, `ui/app.css`, `ui/print.css` | The design system and the one-pager print sheet |
| `ui/views/` | One module per screen; views never do math |
| `data/` | Libraries, each with asOf, source and a verify flag |
| `tests/` | `run.js`, `ui.js`, engine tests, households and their expected workpapers |
| `CONTRACTS.md` | What each planet publishes, written before the code |
| `DECISIONS.md`, `QUESTIONS.md`, `PROGRESS.md`, `BOARD.md`, `SPEC-COVERAGE.md`, `DONE.md` | The run's own records |

## Adding a client

Home, type a name, press Enter. Facts go in through the Ledger only. Export
from the Clients table; import with the Import button. Importing over an
existing client keeps a snapshot you can restore from the toast.

## Parking lot (out of scope, not built)

Couples and joint accounts, a multi-client picker beyond load and save, cloud
sync or encryption, Google Sheet CSV import, session templates, a compliance
footer or consent flow, refresh cadence, state tax, ACA, Roth conversions,
72(t), the rule of 55, FI-date-sensitivity leverage, live card or fund feeds.
