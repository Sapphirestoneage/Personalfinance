# Coach Mode

A money coach's console: a roster of clients, a live session down a path of
stops, and a view the client sees. Its own app, built in parallel with Money
Rooms (SPARKS) the way `dnd/` is: nothing in `rooms/`, `shared/`, `engines/`
or `data/` changes for it, and nothing in SPARKS depends on it.

Open `coach/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/coach/`). The demo client carries example numbers only.

## What is in here

| Path | What it is |
|---|---|
| `index.html`, `home.js` | Coach Home: the roster, new client, the sheet import, backups |
| `session.html`, `console.js` | The Session: the path, the stop's entry form, the rail, quick entry, notes, the recap |
| `client.html`, `clientpage.js`, `clientview.js` | Client View: the life map, goals, what changed, homework, the check-in |
| `common.js`, `coach.css` | What the three screens share |
| `shared/coach.js` | The store: roster, clients, sessions, notes, check-ins, files (`coach.` keys only) |
| `shared/fields.js`, `data/fields.json` | Every entry the coach can type, and where it lives in a household |
| `shared/tables.js` | Loads `data/` |
| `engines/session.js` | Every reading the screens show (pure) |
| `engines/quickentry.js`, `data/quick_entry.json` | Shorthand into entries |
| `data/session_paths.json` | The stops and path templates, editable without code |
| `tools/vendor.js` | The SPARKS files carried as byte-identical copies |
| `test/run.js` | The coach's tests (`node coach/test/run.js`, also in CI) |
| `SPEC.md`, `LATER.md` | What it is; the client portal, not built |
| `DECISIONS.md`, `STATUS.md` | This lane's log (`CD-###`) and where it stands |

## The rules that carry over from SPARKS

No real financial data, ever (the tests fail if a tracked file carries a coach
export). Empty is not zero. Money in integer cents. No em dashes. One formula,
one function: a figure SPARKS computes is read from a vendored copy of the
SPARKS engine, never rewritten; `node coach/tools/vendor.js` refreshes the
copies, `--check` says when SPARKS has moved.

## Working on it

- `node coach/test/run.js` before every commit.
- New decisions go in `coach/DECISIONS.md` as the next `CD-###`, not in the
  SPARKS log.
- Add a SPARKS engine to `tools/vendor.js` only if its requires stay inside
  the list (Ratios and Goals reach the SPARKS storage layer, so they are not
  carried; see CD-001).
