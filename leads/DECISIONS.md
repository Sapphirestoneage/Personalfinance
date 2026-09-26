# Leads Ladder decisions (LD-###)

This lane's own log, so it never contends with SPARKS for a number. SPARKS
records the one fact that the lane exists (D-340). New entry: the next LD
number, at the end, 20 lines at most. Reasoning goes in the commit message.

## LD-001 — Its own app, carrying only the chart and money modules

**Why.** The owner asked for a tool that walks through $100M Leads with the
planets-and-levels mechanic. The freeze allows a separate app (D-339's
pattern), not a room.

**Decision.** `leads/` holds two screens, its own store, tests and log.
Pictures and money formatting come from byte-identical copies of
`coach/shared/charts.js` and `shared/money.js` (`tools/vendor.js`), with the
theme and fonts. No SPARKS engine, schema, spine or ownership is carried:
the ladder reads no household.

**Stored shape.** None in SPARKS.

## LD-002 — The book is data: nine bodies, five bands, 67 levels

**Decision.** `data/book.json` restates the book's frameworks in the app's
own words and never quotes it. The lead magnet is the sun; warm outreach,
free content, cold outreach and paid ads are the core four planets;
referrals, employees, agencies and affiliates are the lead getters. Every
planet has the same five bands (Learn, Sketch, Do, Measure, Scale), so a
band means the same thing everywhere, as in `docs/SOLAR-SYSTEM.md` 1.3.
`engines/ladder.js` says where a person stands, the way `shared/solar.js`
does: a level is done when everything it collects is held; "later" never
counts. Ads, referrals, employees, agencies and affiliates are gated on
Start Here (budget, customers, a team); a dim planet is never hidden and says
what would light it (rule 6). The next three follow the book's order and
never pass Sketch until the magnet and the first planet are drafted (rule 9).

**Stored shape.** `leads.state.v1` `{ start, levels, kpis, log, prefs }`.

## LD-003 — The Machine: one funnel, the book's two checks, levers by the point

**Decision.** `engines/machine.js` is pure and returns SPARKS-style Results.
Reach times the four rates is customers a month; spend over customers is the
cost of one; price plus monthly pay times months kept, times margin, is
lifetime gross profit. The two rules carried as numbers are the book's:
lifetime gross profit at least 3 times the cost of a customer, and the
first thirty days' gross profit at least 2 times it. Levers are shown as
one more point on each rate (a tenth more on any rate is the same tenth,
so points are what tell the rates apart) plus ten more actions a day.
Growth keeps `1 - churn + referral` of the count each month and adds the
funnel. Zero spend is "free", never a division; a blank is incomplete.

**Stored shape.** The kpis in `leads.state.v1`; the Machine page owns them.

## LD-004 — The store: leads. keys only

**Decision.** `shared/store.js` reads and writes `leads.state.v1` and
nothing else. A saved copy carries `leadsLadderExport`; the tests refuse it
in any tracked file. The example numbers set `demo: true`, shown on every
page until the person starts over.

## LD-005 — The Sky: a full circle, drawn by the app

**Decision.** `index.html` draws the sky as inline SVG: the sun in the
middle, lit as far as the magnet is built; five rings, gold when every
planet that applies has cleared the band; eight planets on eight spokes,
each riding the ring of the band it is working on, with a progress arc for
the band, trail dots on cleared rings, and one breathing halo on the planet
holding the first of the next three. A green field behind rings 1 to 3 says
a draft already gets you leads. A list view renders the same state as a
table. Below 520px the sky redraws in a compact geometry. No red anywhere.

## LD-006 — The planet view is the exercise book; forms are built once

**Decision.** Opening a planet builds its five bands once, every level a
card with what the book says, the exercise's boxes, its checklist, its
"got it", its Machine links, its own reading (a share, a sum, the offer
sentence read back, a small funnel, a cost per), the checkpoint, and
"Later". A keystroke saves and repaints the marks, the band counts and the
side chart, never the form (D-034). A level that measures the funnel does
not hold a copy of the numbers: it lists the Machine inputs it needs, each
linking to the box on the Machine page (D-323's idea).

## LD-007 — The Machine page owns the numbers and draws every reading

**Decision.** `machine.html` holds the fifteen inputs, built once, and
draws: the funnel (bars), the two checks (a dial and two columns, with the
verdict in words), the levers (bars), a year of customers with and without
referrals (lines), the rule-of-100 log (thirty days of columns, streak and
count), and the goal from Start Here (a bar). Every picture has a table
twin and a sentence of meaning; every incomplete reading names what is
missing on the left.
