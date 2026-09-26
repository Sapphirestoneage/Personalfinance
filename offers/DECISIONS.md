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
