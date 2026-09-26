# Money Models

A workbook that walks you through the ideas in Alex Hormozi's *$100M Money
Models*: what a money model is, the four kinds of offer (attraction, upsell,
downsell, continuity), the numbers that say whether it works, and the plays
that build each part. Its own app beside Money Rooms (SPARKS), the way `dnd/`
and `coach/` are: nothing in `rooms/`, `shared/`, `engines/` or `data/` changes
for it, and nothing in SPARKS depends on it.

Open `moneymodels/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/moneymodels/`). "Try with example numbers" loads a
made-up six-week fitness challenge; every figure is invented.

## How it works

The Planets dynamic from the Ledger, carried over whole. Six planets, each
fifteen levels in five bands, and a band means the same depth on every planet:

| Band | Name | What you do |
|---|---|---|
| 1 | Learn | Read the idea, answer one check question |
| 2 | Numbers | Type your figures for that part of the model |
| 3 | Build | The exercises: pick a play, write the offer, tick the design list |
| 4 | Prove | Run it for real and type what happened |
| 5 | Optimize | Stack a second play, sharpen the numbers |

Figures ("recipes") unlock in five tiers as their inputs arrive; tier N needs
only facts from bands 1 to N, and the tests enforce it. Nothing is locked: an
unlit figure names what it is waiting on. The plays are the moons: each opens
when your numbers say it fits. The sun is the 30-day ratio: gross profit
collected from a customer in the first 30 days, against the cost of getting
one. It lights at 1x (break even) and fully at 2x (each customer funds the
next). A planet moves out an orbit for every band it finishes.

## What is in here

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `app.css` | The one page: the Sky, a planet, the figures, the plays, your model |
| `engines/model.js` | Every reading (pure): level states, planets, recipes, plays, next up |
| `shared/store.js` | `moneymodels.v1` in localStorage: facts, quiz answers, ticked boxes; save and load a file |
| `shared/charts.js` | Every picture as SVG: the Sky, the 30-day waterfall, the funnel, payback, growth, retention, the radar, meters |
| `shared/tables.js` | Loads `data/` |
| `shared/theme.css` | A byte copy of SPARKS' theme (`cp shared/theme.css moneymodels/shared/theme.css`) |
| `data/levels.json` | The 90 levels: lessons, questions, fields, checklists, payoffs |
| `data/recipes.json` | The 95 figures: tier, inputs, unit, what each says |
| `data/plays.json` | The 19 plays: what each is, when it opens, five steps |
| `data/demo.json` | The example numbers |
| `Money-Models-Workbook.xlsx`, `tools/workbook.py` | The same workbook as a spreadsheet: one sheet per planet, a Dashboard of live formulas, Plays, Your Model; built from the tables by `python3 moneymodels/tools/workbook.py` |
| `test/run.js` | This app's tests (`node moneymodels/test/run.js`, also in CI) |
| `DECISIONS.md`, `STATUS.md` | This lane's log (`MM-###`) and where it stands |

## The spreadsheet

`Money-Models-Workbook.xlsx` is the whole workbook for someone who would
rather not use the app: the six planet sheets carry every lesson, question,
box and checklist; the Dashboard computes every figure with formulas over
named cells (`price`, `cac`, `gp30`, ...), so it reads "not yet" until the
inputs exist and never shows a fake zero; Plays says which plays are open;
Your Model reads the four offers back. A switch on Start Here runs it on the
example numbers or on yours. It is generated from `data/` by
`tools/workbook.py` (openpyxl), so the app and the sheet cannot drift.

## The rules that carry over from SPARKS

No real financial data, ever: the demo is invented. Empty is not zero: a blank
box is absent from the store, a typed 0 is 0, and no formula turns a missing
value into a number. Money is integer cents. No em dashes. One formula, one
function: every figure is computed in `engines/model.js`, keyed by recipe id.
The open level's boxes are built once and never rebuilt while typing (D-034).

## On the book

Every lesson is a paraphrase in this app's own words, never the book's text;
the play names are plain-word labels for the book's offer types; the
thresholds (pay a customer back in 30 days, twice over to self-fund, lifetime
gross profit at least three times the cost of a customer) are the book's rules
of thumb. Read the book for the reasoning and the stories.

## Working on it

- `node moneymodels/test/run.js` before every commit.
- New decisions go in `moneymodels/DECISIONS.md` as the next `MM-###`.
- A level is one sitting: if a new fact needs a different document or a
  different kind of thinking, it is a new level, and every fact is asked
  exactly once (the tests check).
