# engine/ (the projection engine, D-341)

One year-by-year projection every room reads. Plain JavaScript modules, no
DOM, no storage: a room passes the household, its assumption overrides and
the blocks in, and reads rows out. Node and browser (UMD, `SLAF.Engine.*`).

```
var run = Engine.project(household, assumptions, blocks, { now: date });
run.years[i]          one YearRow per year, today through the horizon age
run.milestones        fi, fiAge, coastFI, bridgeGapYears, bridgeGapCents,
                      bridgeAvailableCents, accessYear (59.5), rmdStart,
                      socialSecurityStart, medicareStart, acaCliffYears,
                      firstConversionYear, ranOutYear, horizonYear
run.warnings          plain sentences, one per thing to know
run.assumptionsUsed   every assumption, with a note each (assumptionsUsed.notes)
run.summary           lifetimeTaxCents (and in today's dollars), endNetWorthCents
Engine.compare(runA, runB)   the deltas and the headline sentence
Engine.Project.today(cents, row)   a row's figure in today's dollars
```

Each YearRow: `year`, `ages` (two adults natively), `activeBlocks`, `income` by
type, `spending` (FAT, wants, healthcare, debt payments), `contributions` by
account, `withdrawals` by account, `conversions` (the dated layers),
`taxes` (federal ordinary, federal capital gains, NIIT, FICA, SE tax, state,
ACA credit, penalties), `magiCents`, `balances` by account type with basis
and the Roth conversion ladder, `netWorthCents`, `fiRatio`, `flags`,
`deflator`, and `explain` (the show-your-work sentences per tax).

Dollars are **nominal** inside the rows; `deflator` turns a row into today's
dollars. Rooms display today's dollars by default and offer nominal as a
toggle. Declared once, in `engine/assumptions.js`.

Files: `project.js` (the loop, milestones), `compare.js`, `assumptions.js`,
`facts.js` (household and blocks per year), `accounts.js` (balances, growth),
`contributions.js` (order of operations), `withdrawals.js` (withdrawal order,
penalties, RMDs), `conversions.js` (Roth strategies), `tables.js` (reads
`data/tax/`, indexes later years), `tax/federal.js`, `tax/fica.js`,
`tax/state.js`, `tax/aca.js`, `tax/socialSecurityTax.js`.

Tests: `node tests/engine/run.js`.
