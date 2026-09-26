# Parnassah decisions (PN-###)

This lane's own log, so it never contends with SPARKS for a number. SPARKS
records the one fact that the lane exists (D-340). New entry: the next PN
number, at the end, 20 lines at most. Reasoning goes in the commit message.

## PN-001 — Its own app, carrying only the money primitives and the theme

**Why.** The owner wants a planning site for the Modern Orthodox household,
built without the bulk of the rooms and without touching the freeze (D-313).

**Decision.** `parnassah/` holds eight pages, six engines, its own store,
data, tests and log, the way `coach/` (D-339) and `dnd/` do. It carries
byte-identical copies of `shared/money.js`, the theme, the fonts and the
favicon (`tools/vendor.js`); nothing else of SPARKS, and nothing of SPARKS
depends on it. `test/run.js` fails if a require, script, link or font reaches
outside the folder or the network.

**Stored shape.** None in SPARKS.

## PN-002 — One family, one key, and every reference figure in data/

**Decision.** `shared/store.js` keeps one household under
`parnassah.household.v1`; never a `slaf.` or `coach.` key. Every money field
is integer cents or null. Reference figures live in `data/` as year-versioned
files with `asOf`, `confidence`, `source` and `confidenceNote`
(`shared/tables.js`); nothing is inlined in an engine or a page. The plain
words for every box are `data/help.json`, and a test fails if a page names a
box that has none.

**Stored shape.** New key only. An older file gains missing keys on read.

## PN-003 — The Adlers, an invented family; no real data, ever

**Decision.** "Try with example numbers" fills every page from
`Store.demo()`, a fictional family of six in Teaneck. Every figure is invented.
A backup leaves as `parnassah-backup-<date>.json` carrying the signature
`parnassahExport`; the folder's `.gitignore` refuses that name and the test
fails if any tracked file carries the signature.

**Stored shape.** No change.

## PN-004 — Tuition: every child, every school year, one formula

**Decision.** `engines/tuition.js` places each child by year of birth
(kindergarten in the September of the year they turn five), prices the stage
from the family's typed figure or, failing that, the region's typical band
marked `assumed`, applies the committee's reduction and the sibling rule
(oldest first, from the nth child in school), and adds the year in Israel
only when the child's flag is `true`. No region and no typed price is
incomplete, never a guess. A typed zero is a price of zero.

**Stored shape.** `tuition.{assistanceShare, siblingShare, siblingFrom, overrides}`.

## PN-005 — The year: twelve months from Elul, a level set-aside, a cushion

**Decision.** `engines/jewishyear.js` lays every answered line
(`data/jewish_year_2026.json`: dues, holidays, the Shabbat week, camp per
child) on twelve months from the file's `yearStart`, and reports the year so
far, the unanswered lines, the twelfth to set aside, the fund's balance
month by month, and the cushion that keeps it above zero. An unanswered line
is listed, not counted.

**Stored shape.** `year.{events{}, shabbatWeeklyCents, campSleepawayCents, campDayCents}`.

## PN-006 — Tzedakah: the arithmetic under each approach, never the ruling

**Decision.** `engines/tzedakah.js` takes a share (a tenth, a fifth, or the
family's own) of gross income or income after tax, lists what was given by
kind, and paces the remainder over the months to Elul. The page carries the
questions for a rav and the tax notes as data, and decides nothing.

**Stored shape.** `tzedakah.{rateId, customRate, baseId, taxAnnualCents, gifts[]}`.

## PN-007 — Simchas on a line of years, and the year in Israel counted once

**Decision.** `engines/milestones.js` places each child's bar or bat mitzvah,
year in Israel, wedding (at a share set by a named convention) and years of
support, and aliyah for the family, in the year each lands; skips those
already past; and sums a monthly set-aside that meets each one by the middle
of its year, never over fewer months than remain in this one. The year in
Israel shows on the line with `countedIn: 'tuition'` and is never in the
total, so the picture counts it once.

**Stored shape.** `milestones.*`, `plan.simchaMonthlyCents`.

## PN-008 — The home: priced a month, then asked what tuition leaves

**Decision.** `engines/home.js` carries a house (principal and interest,
tax, insurance) from the typed price or the community's typical one, and
gives its share of take-home alone and together with this year's tuition,
against the guide in `data/communities_2026.json`, plus the price that
would fit. The verdict bands live in the data file.

**Stored shape.** `home.*`, `household.community`.

## PN-009 — The picture: take-home in, six lines out, the checklist, the freed tuition

**Decision.** `engines/plan.js` composes the other five: tuition this year,
the year, tzedakah owed, the home as paid now, what goes aside for simchas
now, and retirement; what is left is reported as so far until every line is
known. The checklist (emergency fund, life cover, will, disability,
tzedakah) reads `data/rules_2026.json`. The decade view lays every tuition
year beside the retirement saving and grows the freed tuition to the older
parent's 65th year.

**Stored shape.** `plan.*`, `household.{takeHomeMonthlyCents, retirementMonthlyCents, olderParentBirthYear}`.

## PN-010 — The pictures: four kinds, six validated hues, a table twin

**Decision.** `shared/charts.js` draws columns (stacked), a line, a stack
bar and horizontal bars from an engine's figures and nothing else. Six hues
in a fixed order, validated for colour vision against the app's dark
surface; status colours come from the theme and are never a series colour;
text is never coloured by a series. Every mark carries a tooltip and is
focusable; every chart has a legend for two or more series and a table twin.

**Stored shape.** No change.

## PN-011 — The form is built once; the header says how old the numbers are

**Decision.** `common.js` builds each page's boxes once from one field
builder, binds each to its path, and repaints only the read-outs after a
save (D-034). Lists (children, gifts) are rebuilt only on add or remove. The
header on every page names the family and how old its numbers are (D-319),
and carries the eight pages.

**Stored shape.** No change.

## PN-012 — Eight pages, each saying what it reads, writes and shows

**Decision.** Home (the household and the children, the only page that
writes them), Tuition, The year, Tzedakah, Simchas, The home, The picture,
Guide. Each page's comment says what it reads, writes and shows. Every
page's footer says nothing leaves the device, empty is not zero, and that
this is arithmetic, not halachic, tax or legal advice.

**Stored shape.** No change.
