# The Binders

A workbook that walks you through twelve business playbooks in four systems,
the way the SPARKS planets walk you through six areas of your money. Its own
app, built beside Money Rooms the way `dnd/` and `coach/` are: nothing in
`rooms/`, `shared/`, `engines/` or `data/` changes for it, and nothing in
SPARKS depends on it.

Open `binders/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/binders/`). "Try with example answers" loads a made-up
money coach; every number in it is invented.

## What it is

The playbook binder that shipped with the $100M Money Models launch holds
twelve playbooks in four systems: **Leads** (Marketing Machine, Hooks, Lead
Nurture), **Sales** (Closing Handbook, Proof Checklist, GOATed Ads),
**Delivery** (Retention, Lifetime Value, Branding) and **Profit** (Price Raise,
Promo Cash, Implementation SOPs). This app is a companion workbook to that
structure, written in its own words from the published $100M books and public
material. No book or playbook text is reproduced here, and the app is not
affiliated with Acquisition.com.

## Levels and planets

Every playbook is a planet. Every planet has six bands, and a band means the
same depth on every planet, exactly as in SPARKS:

| Band | Name | What it asks | Payoff |
|---|---|---|---|
| 1 | Read | The one idea, a rating, what you do now | reveal |
| 2 | Facts | The few numbers the playbook runs on | reveal |
| 3 | Exercises | The pen and paper work | reveal |
| 4 | Build | Assemble the thing, tick the checklist | power |
| 5 | Run | Use it for a stretch, log what happened | certainty |
| 6 | Sharpen | The moves only visible once the numbers are real | power |

72 levels, 203 exercises, 165 checklist items. A level is done when every
exercise holds an answer and every checklist item is ticked. A planet sits on
the orbit of the band it is working on and fills as it is answered. A ring
lights when all twelve planets clear a band. The next three never go above
band 2 anywhere until every planet has finished band 1.

The pictures (36 readings) compute from the facts on every change: the sales
funnel, the ad chain, lifetime gross profit against the cost of a customer,
the thirty-day cash model, the breakeven loss on a price raise, the retention
curve, the weekly scorecard. A reading you have not earned says exactly what
it is waiting on. Some facts are typed once and read by other playbooks
(price, gross margin, cost to acquire, the booking rate): each has one owner
level, and every other playbook shows it read-only with a link.

## What is in here

| Path | What it is |
|---|---|
| `index.html`, `sky.js` | The sky: twelve planets on six orbits, the counts, the next three, the grid, backup |
| `playbook.html`, `book.js` | One playbook: the idea, its pictures, six bands with every exercise and checklist |
| `app.js`, `binders.css` | What the two screens share: loading, the header, the read cards, the look |
| `data/playbooks.json` | Every playbook, level, exercise and checklist (the content; editable without code) |
| `data/example.json` | The made-up money coach behind "Try with example answers" |
| `shared/store.js` | The store: one key, `binders.v1`, never a `slaf.` key |
| `shared/model.js` | Where a person stands in the levels (the Binders' copy of what `shared/solar.js` does) |
| `engines/reads.js` | Every figure and picture spec, pure |
| `shared/charts.js` | Bars, funnels, meters, lines, stacked bars, the four-way grid, small multiples, as SVG with a table twin |
| `tools/vendor.js` | The look carried from SPARKS as byte-identical copies (theme, fonts, icon) |
| `The-Binders.xlsx`, `tools/build_xlsx.py` | The same binder as one Excel workbook (PB-002): a Start sheet, a Dashboard, a Readings sheet of live formulas and charts, one sheet per playbook; rebuilt from `data/` by the script |
| `test/run.js` | The Binders' tests (`node binders/test/run.js`, also in CI) |
| `DECISIONS.md` | This lane's log (`PB-###`) |

## The rules that carry over from SPARKS

No real data: the example is invented and marked so. Empty is not zero: a
blank box is absent from the store, a typed zero is kept. Money in integer
cents, formatted only at display. One owner per shared fact. One formula, one
function: every figure lives in `engines/reads.js`. No em dashes. Containers
of live inputs are built once (`LIVE-FORM: built once`). Colours: the four
system hues were run through the colour-vision validator against the app's
dark surface and pass; status is a word beside a colour, never a colour alone;
every picture has a table twin.

## The spreadsheet

`The-Binders.xlsx` is the whole binder for someone who would rather not open
an app: the same twelve playbooks, bands, exercises and checklists, with the
readings as live formulas and the pictures as charts. Yellow cells with blue
text are the ones to fill; a band reads done when every yellow cell in it
holds an answer and every checklist item is Y; the Dashboard shows all twelve
and lights a ring when every playbook clears a band. Money is typed in whole
dollars and percentages as percentages there. Rebuild it after a content
change with `python3 binders/tools/build_xlsx.py` (needs `openpyxl`), then
recalculate it in LibreOffice or Excel so the cached values are fresh.

## Working on it

- `node binders/test/run.js` before every commit; `node binders/tools/vendor.js --check` is part of it.
- New decisions go in `binders/DECISIONS.md` as the next `PB-###`.
- Content changes go in `data/playbooks.json`; the tests hold every level to a title, a why, exercises, a checklist and a checkpoint.
