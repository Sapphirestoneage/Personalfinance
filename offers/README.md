# Offer Builder

A walk through the exercises of Alex Hormozi's *$100M Offers*, laid out the
way SPARKS lays out a household: six planets, each with four bands, a level
per exercise, a ring lit when every planet has finished a band. Its own app,
built beside Money Rooms the way `dnd/` and `coach/` are (D-340): nothing in
`rooms/`, `shared/`, `engines/` or `data/` changes for it, and nothing in
SPARKS depends on it.

Open `offers/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/offers/`). The example offer is made up: a strength
program for new fathers, with invented numbers. Prefer a spreadsheet? Open
`Offer Builder.xlsx` (blank) or `Offer Builder (example).xlsx` instead; the
same exercises, the same readings, no code.

## The shape

| Planet | The book | Levels |
|---|---|---|
| Crowd | Section II, chapters 3 and 4: the commodity problem, the starving crowd, the niche ladder | 8 |
| Price | Section II, chapter 5: the two cycles, worth against price, charge so much it hurts | 8 |
| Value | Section III, chapter 6: the value equation, rated before and after | 8 |
| Offer | Section III, chapters 8 to 10: the brick, problems, solutions, delivery vehicles, trim and stack | 9 |
| Enhancers | Section IV, chapters 11 to 14: scarcity, urgency, bonuses, guarantees | 9 |
| Name | Section IV, chapter 15 and Section V: MAGIC, the wrapper, the launch | 8 |

Four bands, the same meaning on every planet: **Sketch** (where you stand),
**Build** (the book's exercise, done properly), **Sharpen** (score it and
check it against the book's own lists), **Prove** (take it in front of real
people). A level is tagged E (enter), C (confirm a figure the app worked
out) or S (sharpen a rating). Every level pays with a reading: a number, a
sentence, and usually a picture, each with a table twin.

## What is in here

| Path | What it is |
|---|---|
| `index.html` | The Sky: the orbit picture, the grid, the next level, the four rings, the readings shelf, the six planets, the words, backups |
| `planet.html?p=<planet>#<level>` | One planet: its bands and levels, the open level's boxes, the facts it reads from other planets, its payoff |
| `offer.html` | The offer sheet: everything on one page in the order a prospect hears it; prints |
| `app.js`, `offers.css` | What the three screens share: the header, the grid, the form builder, the payoff card, the chart frame |
| `data/levels.json` | The planets, bands, rings, terms and all 50 levels with their fields, checklists and payoffs |
| `data/demo.json` | The example offer |
| `engines/offer.js` | Progress (states, planets, rings, next) and every reading (pure) |
| `shared/charts.js` | Every picture, as SVG from an engine's figures |
| `shared/store.js` | The store: `offers.offer.v1` and `offers.prefs.v1`, never a `slaf.` key |
| `shared/money.js`, `shared/theme.css`, `favicon.svg` | Byte-identical copies of the SPARKS files (`tools/vendor.js`) |
| `Offer Builder.xlsx`, `Offer Builder (example).xlsx` | The same walk as a workbook: one tab per planet, fill-in cells, checklists, a dashboard with charts, the offer sheet (OD-002) |
| `tools/workbook.py` | Builds the two workbooks from the example and the same exercises |
| `test/run.js` | The tests (`node offers/test/run.js`, also in CI) |
| `DECISIONS.md`, `STATUS.md` | This lane's log (`OD-###`) and where it stands |

## The rules that carry over from SPARKS

No real financial data, ever: the example is invented. Empty is not zero: a
blank box stores nothing, and a reading that lacks an input says what it is
waiting on instead of showing a number. Money is integer cents inside and
dollars only in the box. No em dash in any copy. One formula, one function:
the value equation, the margin, clients needed and the trim rule each live
once in `engines/offer.js`. A container of typed boxes is built once per
opened level and never rebuilt while it is in use (D-034).

## Working on it

- `node offers/test/run.js` before every commit.
- New decisions go in `offers/DECISIONS.md` as the next `OD-###`.
- A new exercise is a new level in `data/levels.json` plus a reading in
  `engines/offer.js`; the tests check that every payoff names a reading that
  exists and that every reading behaves on an empty offer.
