# Money Models decisions (MM-###)

This lane's own log, so it never contends with SPARKS for a number. SPARKS
records the one fact that the lane exists (D-340). New entry: the next MM
number, at the end, 20 lines at most. Reasoning goes in the commit message.

## MM-001 — Its own app, carrying only the theme

**Why.** The owner wants a tool that runs them through *$100M Money Models*,
with the Ledger's planets and levels dynamic, while the SPARKS freeze holds.

**Decision.** `moneymodels/` is a separate app: one page, its own store, tests
and log. It carries one SPARKS file, `shared/theme.css`, as a byte copy, and
nothing else; no SPARKS engine applies to a business's offers.

**Replaces or removes.** Nothing in SPARKS; it is a new lane, like `coach/`.

**Stored shape.** None in SPARKS.

## MM-002 — The store: one key, and empty is not zero

**Decision.** `shared/store.js` keeps `moneymodels.v1` only:
`{ facts, quizzes, checks }`. A blank box is absent, a typed 0 is stored as 0,
clearing removes the key. A file saved from the page carries
`moneymodelsExport: 1` and is the only thing the page will load back.

**Stored shape.** New key only.

## MM-003 — Six planets, five bands, tiers aligned to bands

**Decision.** `data/levels.json`: Foundations, Attraction, Upsell, Downsell,
Continuity, KPIs and Scale; fifteen levels each in Learn, Numbers, Build,
Prove, Optimize. Every fact is asked once. `data/recipes.json`: a figure of
tier N needs only facts from bands 1 to N (linted). Formulas live in
`engines/model.js`, one function per recipe id; a division with nothing
underneath hands back a note, never NaN. `data/plays.json`: the plays open on
plain rules over recipes and facts. Next up never suggests above band 2
until every planet has finished band 1.

**Stored shape.** No change.

## MM-004 — Pictures as SVG from readings, six validated hues

**Decision.** `shared/charts.js` draws only; every number comes from the
engine. Six hues in a fixed order, validated for colour vision against the
dark surface; status colours are the theme's and never a series colour; text
wears text tokens. Every picture has a title and a table twin.

**Stored shape.** No change.

## MM-005 — One page, five views, the open level built once

**Decision.** `index.html` holds the Sky, a planet, the figures, the plays and
your model, switched by hash. The open level's boxes are built when the level
opens and never rebuilt by a store change; typing repaints the bands list and
the payoff strip only (D-034).

**Stored shape.** No change.

## MM-006 — The same workbook as a spreadsheet, generated from the tables

**Why.** The owner finds the app too much for now and asked for a
professional spreadsheet.

**Decision.** `tools/workbook.py` builds `Money-Models-Workbook.xlsx` from
`data/levels.json`, `recipes.json`, `plays.json` and `demo.json`: one sheet
per planet (every level's lesson, question, boxes and checklist, with an
Example column and an In use column), a Dashboard where every figure is a
formula over named cells and reads "not yet" until its inputs exist, Plays
with Open or Waiting per play, Your Model, and Start Here with the legend,
the planets-by-bands grid and the example switch (`useExample`). Money in
dollars, percents as fractions; the formulas are the engine's, one per
recipe. Rebuild after any change to the tables; the checked-in file is the
deliverable.

**Stored shape.** None; the spreadsheet is a file, not a store.
