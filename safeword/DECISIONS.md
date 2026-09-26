# Safeword decisions (SF-###)

This lane's own log, so it never contends with SPARKS for a number. SPARKS
records the one fact that the lane exists (D-340). New entry: the next SF
number, at the end, 20 lines at most. Reasoning goes in the commit message.

## SF-001 — Its own app, carrying only the engines it reads

**Why.** The owner wants a money planner for the kink, sex work and domme
community, built without the bulk of the rooms and without touching them.

**Decision.** `safeword/` holds eleven screens and its own store, tests and
log, the way `coach/` does (D-339). Figures SPARKS computes come from
byte-identical copies (`tools/vendor.js`: money, schema, reference; the
self-employment, tax and projection engines; the SE, federal, state, IRS
limit and effective-rate tables; the theme and fonts). Nothing that reaches
the spine, ownership or the registry is carried.

**Stored shape.** None in SPARKS.

## SF-002 — One household under `safeword.household.v1`; the example is Vesper

**Decision.** `shared/model.js` is every stored shape (streams, costs, rails,
people, play, and the you/personal/fund/taxes/longgame/house/papers blocks);
`shared/store.js` reads and writes one key, never `slaf.` or `coach.`. Empty
is null; money is integer cents; a rate is a fraction. `shared/demo.js` is
Vesper, invented for scale, loaded behind "Try with example numbers" and
marked `meta.demo`; the first typed change drops the mark. Backups are one
plain JSON file carrying `safewordExport`; `.gitignore` refuses them.

**Stored shape.** New key only.

## SF-003 — One formula for what lands; the house is a list of costs

**Decision.** `engines/streams.js`: kept = gross × (cash + (1 − cash) × (1 −
platform − processor)); a blank rate makes the stream incomplete. The floor
is every low month at once. A stream marked `w2` is wages. One stream at
half of what lands, on a platform that can close, is flagged and sized as a
two-month buffer. `engines/house.js`: fixed against variable, and each cost's
"usually / sometimes / ask" word for the return. Fees are never a cost row.

## SF-004 — The tax jar feeds SPARKS' engines; it never re-derives a tax

**Decision.** `engines/taxplan.js`: profit is the self-employed part of a year
less the "usually" costs (the "sometimes" ones too when the box is ticked);
wages stack under it. SE tax is `engines/selfemployed.js`, the brackets
`engines/tax.js`, the quarterly figure `quarterlyEstimated` with its safe
harbour. The jar is the tax on the work over what the work brings, per $100.
A missing state gives a federal-only reading that says so.

## SF-005 — The safeword fund is sized for this life; the rails say how it fails

**Decision.** `engines/fund.js`: target = months × (lean month + fixed house
costs) + the platform buffer + one lean month when nothing held is beyond a
freeze. The balance is the sum of rails marked as the fund. `engines/rails.js`:
five checks (two banks, two ways to take a card, a lean month beyond a freeze,
the practice apart, little left on a platform), the flow by rail from where
each stream lands, and the single rail that most of a month runs through.

## SF-006 — The long game: the room, the path, the number, the exit

**Decision.** `engines/longgame.js`: SEP room is 20% of profit after the
deductible half (`irsLimits.soloEmployerShareSoleProprietor`), Solo 401(k)
adds the deferral, IRAs take the limit with the over-50 catch-up. The path
is `engines/projection.js` `pathCents` to the stop age; 4% of it a month;
the number is 25 lean years; the exit is a cushion of lean months by a year,
and what to set aside a month for it.

## SF-007 — House rules: the split, and five guardrails on money in the dynamic

**Decision.** `engines/dynamic.js`: the person marked "me" carries no number
of their own (income from Streams, lean month from the Safeword page). The
split is equal, in proportion to income, or agreed shares that must add to
100%. The protocol (from, to, a month, a cap, a review date, a safeword) is
checked against `data/protocol_rules.json`: the giver stays above their floor,
there is a cap, a review within a year, a safeword, and the giver's fund
set-aside comes first. A failed check reads as a conversation, not a verdict.

## SF-008 — Chosen family is eight weighted papers; the life is a year of it

**Decision.** `engines/family.js`: `data/papers.json` weighs eight papers to
100; done counts in full, started half; next is the heaviest not done. When
the house holds people and the filing status is not married, the page says
they are not legal next of kin. `engines/play.js`: what the scene costs to
live, by the year, a twelfth a month, each kind against a usual range.

## SF-009 — The plan is the split of every dollar that lands

**Decision.** `engines/plan.js` runs every engine and reads the split: the
tax jar (a share of the self-employed part only), the fund set-aside, the
house, the long game, the life, and what is left against the lean month.
Under the lean month, the month does not close. It also says which pages
have their numbers. The page owns nothing and prints as one sheet.

## SF-010 — Eleven screens, the look, the words, the pictures, the walk

**Decision.** `common.js` draws the header, the strip, the example banner,
the "?" and the money and rate boxes (typed in dollars and percent, stored as
cents and fractions). Every form is built once (D-034); a change saves and
repaints read-outs only. `data/help.json` has words for every "?"; the tests
fail on a missing or an unused one. `shared/charts.js` draws five validated
hues on the warm dark surface, every picture with a table twin. `safeword.css`
overrides the SPARKS tokens: near-black, oxblood, a serif for headings.
`test/browser.js` walks every page at phone width in CI.
