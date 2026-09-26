# The Leads Ladder

$100M Leads (Alex Hormozi, 2023) turned into a workbook you level through:
the lead magnet is the sun, the core four and the four lead getters are the
eight planets, the five bands (Learn, Sketch, Do, Measure, Scale) are the
rings, and every exercise in the book is a level. Its own app, built the way
`dnd/` and `coach/` are: nothing in `rooms/`, `shared/`, `engines/` or
`data/` changes for it, and nothing in SPARKS depends on it.

Open `leads/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/leads/`). The example numbers are invented.

## What is in here

| Path | What it is |
|---|---|
| `index.html`, `sky.js` | The Sky: Start Here, the strip, the sky (and its list view), the next three, the planet view with its band ladder, the come-back list, the book map, the core four, the words |
| `machine.html`, `machine.js` | The Machine: reach, the rates, what a customer costs and is worth, the two money checks, the levers, referrals against churn, the rule-of-100 log, the goal |
| `data/book.json` | The book as data: bands, planets, Start Here, 67 levels with their exercises and checklists, the glossary. Restated, never quoted |
| `engines/ladder.js` | Where you stand: level states, the situation gate, a planet's band, rings, the next three (pure) |
| `engines/machine.js` | The funnel, costs, value, the three-to-one and thirty-day checks, levers, growth, the log as a series (pure) |
| `shared/store.js` | The store: `leads.state.v1` only |
| `shared/tables.js` | Loads `data/` |
| `common.js`, `leads.css` | The header, the chart frame, the look |
| `shared/charts.js`, `shared/money.js` | Byte-identical copies of Coach Mode's charts and SPARKS' money (`tools/vendor.js`) |
| `test/run.js` | The ladder's tests (`node leads/test/run.js`, also in CI) |
| `DECISIONS.md`, `STATUS.md` | This lane's log (`LD-###`) and where it stands |

## The rules that carry over

No real data in the repository: the example numbers are invented and say
so on every page; a saved copy carries a signature the tests refuse in any
tracked file. Empty is not zero: a blank box is "not yet", a typed zero is an
answer. Money in integer cents, rates as fractions, formatted at display. No
em dashes. One formula, one function: the pictures come from the coach's
chart module, carried as a copy, never rewritten. One owner per number: the
Machine owns the funnel numbers, a Measure level links there instead of
holding a copy.

## Working on it

- `node leads/test/run.js` before every commit; `node leads/tools/vendor.js --check` says when a copy has drifted.
- New decisions go in `leads/DECISIONS.md` as the next `LD-###`, not in the SPARKS log.
- The book is data: a new exercise is a level in `data/book.json`, with a kind the tests know (`text`, `long`, `number`, `choice`, `multi`, a `checklist`, a `confirm`, or `needs` naming Machine inputs).
