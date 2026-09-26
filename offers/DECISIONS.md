# Offer Builder decisions

The log for `offers/`, numbered `OD-###`. The SPARKS log records the lane
itself as D-340. Entries follow `docs/context/DECISION-TEMPLATE.md`.

## OD-001 — The Offer Builder: six planets, four bands, fifty levels, one offer

**Why.** The owner wanted a tool that runs a person through *$100M Offers*
with every exercise, checklists for the steps the book suggests, and
pictures, on the levels and planets dynamic of the Solar System.

**Decision.** Three screens: the Sky (`index.html`), a planet (`planet.html`),
the offer sheet (`offer.html`). The planets are the book's parts: Crowd,
Price, Value, Offer, Enhancers, Name. The bands are the same on every planet:
Sketch, Build, Sharpen, Prove. A level is one exercise or one checklist
(`data/levels.json`, 50 of them); it pays with a reading from
`engines/offer.js`, drawn by `shared/charts.js`. Nothing is locked; a reading
without its inputs says what it is waiting on. Nothing above band 1 is
suggested until every planet has cleared band 1. One offer per browser in
`offers.offer.v1`; the example offer loads on a button and is marked as such.

**Replaces or removes.** Nothing; the app is new and touches no SPARKS file.

**Stored shape.** `offers.offer.v1`: `{ version: 1, answers: { key: value },
confirmed: { levelId: iso }, meta: { createdAt, updatedAt, demo } }`. Money
in integer cents, a percent as a rate, a checklist as `{ itemId: true }`, a
list as an array of row objects. A blank answer is absent, never `0` or `''`.

**Verified.** `node offers/test/run.js`; `node test/run.js`; the three pages
served with `python3 -m http.server`, the example loaded, every planet and
the sheet opened, the console clean.

## OD-002 — The same walk as a workbook, for the owner who found the app too much

**Why.** The owner asked for the Offer Builder as a spreadsheet: the app was
more than they wanted to take on right now.

**Decision.** `offers/tools/workbook.py` builds `Offer Builder.xlsx` (blank)
and `Offer Builder (example).xlsx` (the example offer) from the same
exercises as `data/levels.json`: one tab per planet, a numbered section per
level, yellow cells to fill in, grey cells that work themselves out, Yes or
Not yet checklists, a Dashboard with the readings and four charts, and the
Offer Sheet. Every reading is one formula in one cell with a defined name,
read by the Dashboard and the sheet. Empty is not zero: a reading with a
missing input shows nothing, never 0.

**Replaces or removes.** Nothing; the app stays. The workbook is the simpler
front door and carries no code.

**Stored shape.** None; the workbook is the store.

**Verified.** LibreOffice recalculation of both files, zero errors in 235
formulas; the example's figures match the app's readings (34 clients, a
stack of $732, value score 0.57 to 7.11).
