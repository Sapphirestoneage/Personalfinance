# The community front's log (`SD-###`)

The site's own sequence, like `coach/DECISIONS.md` (`CD-###`) and the D&D
entries (`DD-###`). The SPARKS log carries one entry for the site's existence
(D-340); everything else about it lives here. Twenty lines an entry.

## SD-001 A public front for the FIRE community, as its own app in site/

**Why.** The app's root URL is the dashboard: a screen that reads a
household. Someone arriving from the community with nothing typed yet met a
panel of "not yet" and no page that said what this is, what FIRE is, or why
the rooms are shaped the way they are.

**Decision.** `site/` is a separate app in the D-339 pattern: six pages
(Home, Your number, Learn, The rooms, Glossary, About), its own stylesheet on
the shared theme tokens, its own chrome (`site.js`), tests (`site/test/run.js`
in node, `site/test/browser.js` in Chromium, both in CI) and this log. It
loads `../shared`, `../engines` and `../data` directly rather than vendoring:
a formula changed in SPARKS changes here the same second, and there is no
copy to drift. Nothing in `rooms/`, `shared/`, `engines/` or `data/` changes.

**Replaces or removes.** Nothing in SPARKS. It is the page that was missing
in front of the app, not a room.

**Stored shape.** No change. The site writes no key.

**Verified.** `node site/test/run.js`; `node site/test/browser.js` at 390 and
1100 wide; `node test/run.js`.

## SD-002 The calculator runs the room's formula on a household built in memory

**Why.** A front page for FIRE without a number is a brochure. A number that
is a second implementation of the formula is the thing the rules forbid.

**Decision.** `number.html` builds a household with `Schema.createHousehold`
from five boxes (spending, invested, saved a month, age, part-time pay) and
hands it to `Fire.tiers` and `Projection.yearsToTargetCents`. Assumptions come
from `Schema.resolveAssumptions` (5% real, 4% withdrawal) and two selects
pass local overrides, the way the room's sliders do. The example numbers are
`DemoPersona.VALUES`. The test asserts the example gives the room's number.

**Replaces or removes.** Nothing. The Number room stays the full reading.

**Stored shape.** No change. The page keeps nothing; "carry it into the
rooms" is a link to the first round, where the person types.

**Verified.** As SD-001.

## SD-003 Learn draws its tables from the data files and the engines

**Why.** The savings-rate table is the most quoted table in the community and
the most often retyped with someone else's assumptions.

**Decision.** `learn.html` builds one household a row and runs the one
formula and the one years loop, at the app's defaults. The ladder is
`data/foo_rules.json`, the six sizes `data/fire_variants.json`, both fetched
through `Reference.load`. The vocabulary section is prose: DAITE, FAT,
DRAFTT, the Ledger, Triple D, each in one paragraph, no new word coined.

**Replaces or removes.** Nothing.

**Stored shape.** No change.

**Verified.** As SD-001.

## SD-004 The rooms page reads the registry, and adds only questions

**Why.** A directory kept by hand goes stale the first time a room is merged.

**Decision.** `tools.html` draws every room from `shared/registry.js`, grouped
by the registry's groups. The one thing it adds is a list of sixteen
questions, each an id the test checks against the registry. Titles and
blurbs are the registry's.

**Replaces or removes.** Nothing; `map.html` stays the app's own map.

**Stored shape.** No change.

**Verified.** As SD-001.

## SD-005 The glossary is the app's dictionary, unchanged

**Why.** `shared/glossary.json` has nearly four hundred one-sentence terms
that only opened one at a time, from inside a room.

**Decision.** `glossary.html` fetches the file, groups by its `domain`, and
filters as you type. The search box sits outside the repainted list (D-034).

**Replaces or removes.** Nothing.

**Stored shape.** No change.

**Verified.** As SD-001.

## SD-006 About says the rules, the limits and the family

**Why.** The rules the app holds itself to were in `CLAUDE.md` and the design
audit, which a visitor never sees.

**Decision.** `about.html` lists the eight rules in plain words, four honest
limits (not advice, US 2026 tables, one browser, today's dollars), the three
apps, and where to report a wrong number. No claims about the author beyond
what D-339 records: a money coach.

**Replaces or removes.** Nothing.

**Stored shape.** No change.

**Verified.** As SD-001.

## SD-007 The site sells coaching; the tools are the free half of the offer

**Why.** The owner: the site is for selling coaching and services, landing
pages that send people to book a call, with the free tools and resources
beside them and information about him for the community.

**Decision.** The brand is Stress Less About Money (the owner's HubSpot
portal); the coach is Eli Saperstein (the same account). Eight pages: Home
is the landing (who it is for, what a session is, the offers, Eli, the free
tools, the questions); Coaching is the services page; Book is the one page
every "Book a free call" button lands on; About Eli; Free tools gathers the
calculator, Learn, the glossary and the rooms; Your number, Learn and the
glossary stay as free tools, each ending in the call to action. The
coach's details live in `data/coach.json`: name, brand, the booking link,
the offers, the questions. A page reads it; nothing about Eli is typed in
a page. The offers carry no price until the owner sets one ("Price on the
call"). The nine stops on Home and Coaching are read from
`coach/data/session_paths.json`, the path the console walks, so the site
describes the real session. Booking is a link to the owner's meetings page
in a new tab (the policy forbids embeds and posts); empty, the Book page
says so.

**Replaces or removes.** The rooms page (folded into Free tools) and the
first About (rewritten around Eli).

**Stored shape.** No change. The site still writes no key. No email
address anywhere on the site; the test checks.

**Verified.** As SD-001, with eight pages.
