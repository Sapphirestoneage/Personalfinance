# SPARKS Tools brief: what the book spec asks for, and what already exists

Written 2026-09-17, before any code. The spec (the FI-losophy companion suite,
17 tools in five phases) says its own repo-layout question "should be made
before Phase A, not during it". This file answers the prior question the
freeze asks of every request: what does it replace.

Nothing has been built. The three decisions in section 4 are the owner's.

## 1. Where the spec and the app disagree

The spec was written as if the repo were empty. It is not, and four of its
foundations already exist under different names.

| The spec asks for | The app already has |
|---|---|
| `sparks:v2` localStorage object, five DAITE families | `slaf.household.v2`, five DAITE families (`shared/daite.js`, D-171) |
| `core/registry.json` with `reads`/`writes` per tool | `shared/registry.js`, 76 rooms, each with `daite: {reads, writes}` |
| `core/viz.js`, 18 hand-rolled SVG charts | `shared/charts.js`, 7 hand-rolled SVG charts |
| `core/tokens.css` plus `ui.css`, dark mode | `shared/theme.css` (1347 lines) plus `shared/fonts.css` |
| one owner per fact, entered once | `shared/ownership.js`, 110 fields, one owner each |
| `liveRange` per tool, greyed out when out of stage | `appliesWhen` per room, plus `needs` |
| thirteen metrics moved by ten levers | `data/levers.json`, moves declared per lever |
| eight purpose categories | `data/spheres.json`, nine spheres with depth (D-184) |

Building `core/` beside `shared/` would give the app a second spine, a second
design system and a second registry. That breaks the rule the spec itself
states ("a fact is entered once") and the rule in CLAUDE.md ("one owner per
shared field"). So `core/` is not a new directory. It is the existing
`shared/`, extended.

The one place the spec is strictly better: its `liveRange` is a two-sided
range (too early AND too late), while `appliesWhen` is one-sided. That is a
real addition worth making.

## 2. The freeze

STATUS.md: the freeze is ON, and the programme is 93 rooms down to 30. Four
of the six merges have shipped, 92 registry rooms are down to 76. Every
session is meant to leave the app with the same or fewer screens.

The spec adds 17 screens. Read literally it reverses the programme. Read
against section 3 below, most of it is not new screens at all: it is fields,
data files and readings inside rooms that already exist, and in three places
it is the merge argument the programme has been looking for.

## 3. The seventeen, against the app

Verdict key: **exists** (the room is already this tool), **extend** (the room
is most of it; the spec adds fields, data or a reading), **new** (nothing in
the app does this).

| Spec tool | Closest existing room(s) | Verdict |
|---|---|---|
| A1 Day Rate | `real-hourly-wage` (Real Hourly Wage), `self-employed` (where the 15.3% lands), `hassle` | **exists**. Spec adds unpaid waiting, required spend, and W-2 against 1099 in one room. Note `real-hourly-wage` is already absorbed into Income (room 5 of the thirty). |
| A2 Advice Translator | `unlearning` ("the advice everyone hears, sorted by whether it still applies to you") | **extend**. The room is the tool. What is missing is the 40-entry data file with two-sided live ranges, and the age-and-base axis chart. |
| A3 The Instrument | `values` (stated beside actual, no score), `week` (Designed Week, 168 hours), `dreamline` (price the dream), `rerank` | **extend**, and it is a merge case: one four-stage flow over four rooms that all read the same answers. |
| A4 Changelog | none | **new**, and it reads no household data at all. A static page about the book, not a room. Lowest conflict in the spec. |
| B1 Expiring Goods Clock | none | **new**. The one tool in the spec with no counterpart. Needs an actuarial table in `data/`. |
| B2 Tradeoff Matrix | `what-if-life` (one event, three ways), `data/levers.json`, `data/lenses.json` (33 lenses) | **extend**. The levers already exist with their moves declared. Constraint mode (pin minimums, grey out violating paths) is genuinely new and is the best idea in the spec. |
| C1 The Chain | `foo-ladder` (What The Next Dollar Does), `skill-tree` (ladder, board, warps) | **exists**. The FOO ladder is the chain. The step six gate (named, funded, started, review date) is a real addition to it. |
| C2 Tiered Floor | `enough`, `expenses`, `protection`, `decumulation` | **extend**. Needs a survival/normal/luxury tier on each expense line. Answers the Galloway note in STATUS ("model the means-tested floor"). |
| C3 Threshold | `fire`, `race` (why the first $100K is the hardest), `decumulation` | **extend**. No Monte Carlo or sequence bootstrap exists yet (`engines/windfall.js` is the only near miss). |
| D1 Crossover Finder | `hassle` (chore rate against your hourly), `skill-tree` | **new** as a reading. Fixed-dollar against percentage is not modelled anywhere. |
| D2 Reroute Pricer | `reversibility` ("Can It Be Undone: what it would cost to undo, and how long") | **exists**. Spec adds the third currency (optionality, scored not calculated) and a map of all open decisions. |
| D3 Deferred Comp | `career-move`, `offer-compare`, `micro-retirement` | **extend**. A small card, not a room: vesting date against intended exit date. |
| D4 Menu Auditor | none for the four questions; no fee-drag calculation anywhere | **new**, mostly copy. Fee drag is a genuine gap. |
| D5 Uncounted Resources | `reachable` (Reachable Money), `roth-aca`, `middle-class-trap`, `protection` | **extend**. The bridge chart is new; unemployment and ACA tables are new `data/` files. |
| D6 Liquidity Ladder | `reachable` is already the ordered rungs with the cost of each dollar out; `statement > ladder` | **exists**. Spec adds print layout, the 2am framing, and a HELOC opened while employed. |
| E1 The Diagnostic | `values`, `fulfillment` (The Joy Curve) | **extend**. The four avoidance questions are new. The no-score, no-diagnosis rule matches how `values` already works. |
| E2 Subtraction Ladder | `dreamline`, `adventure`, `what-if-life` | **extend**. The "if you could not travel, what" tree is new; the leaves it produces are what `dreamline` already prices. |
| E3 Purpose Portfolio | `data/spheres.json` (nine spheres), `fulfillment`, `buckets` | **extend, with a vocabulary collision**. The spec's eight categories and the app's nine spheres are two names for one thing. The freeze forbids a second vocabulary, so one has to win. |
| E4 Day Reconstruction | `week` (the week you would design) | **extend**. Designed against measured is exactly the gap the spec wants, and the log shape matches `ledger.income[]`. |
| E5 Tripwire Board | `debates` (flip points with sources) | **new**, small. Needs a `decisions[]` store, which D2 also needs. |

Counted: 4 exist outright, 10 are extensions of a live room, 3 are genuinely
new (Changelog, Expiring Goods Clock, Menu Auditor) and one of those three
(Changelog) is not a room at all.

## 4. The three decisions this needs

### 4.1 Layout

**Recommended: no `tools/` suite, no `core/`.** The spec becomes work inside
the thirty. Each tool is either a field added to the room that owns the
number, a reading on that room, or a data file in `data/`. The three
genuinely new ones are handled as follows:

- Changelog: a static page beside `index.html` and `map.html`, out of the
  registry, because it reads no household data.
- Expiring Goods Clock: the one new room, argued on the anti-rule in
  `docs/room-map.json` ("a room with a different emotional register does not
  merge, even when the math is identical"). It would make the thirty a
  thirty-one, and that needs saying out loud.
- Menu Auditor: a reading on `statement`, where the portfolios already are.

The alternative (a parallel `tools/` suite with its own spine) is a second
app in one repo, and the app already has one of those in `dnd/`. It works
there because D&D shares no numbers with SPARKS. These tools share all of them.

### 4.2 The vocabulary collisions

Three of them, and the freeze says each needs a winner rather than a
coexistence:

1. eight purpose categories (spec) against nine spheres (D-184).
2. thirteen metrics (spec) against thirty-three lenses (D-175).
3. four levels with close conditions (spec) against the FOO ladder steps and
   the skill tree bands.

### 4.3 Whether the thirty becomes a thirty-one

Only the Expiring Goods Clock asks for this. Everything else fits inside a
room that exists.

## 5. The eight open questions, with a recommended answer for each

Recommendations, not decisions. Each needs a yes or a different number.

1. **Threshold band.** Words only, no decimal. Three states: "a bad decade
   here could end this plan", "this survives a bad decade", "this finishes
   without further saving". Matches how `runway` already speaks.
2. **Convenience Method cutoff.** 5 percentage points of spread. Below that,
   order by friction; at or above it, rate wins and the tool says which rule
   it is using and why.
3. **Coast target inputs.** Real dollars, 5 percent real return, stated on
   screen and changeable. `coast-date` already works in today's dollars, so
   this keeps one convention.
4. **Social Security haircut.** 75 percent of the projected benefit as the
   default, with 0 and 100 available, and the line about zeros in the
   highest-35-years formula shown whenever it is counted.
5. **Actuarial source.** SSA period life table, latest published year,
   shipped as `data/actuarial-<year>.json` with its source and year on the
   page, as every file in `data/` already does.
6. **Advice Translator seed content.** The 40 entries claim-only, no author
   or book named, sourced to a chapter. `unlearning` already holds advice
   this way.
7. **Repo layout.** Section 4.1 above.
8. **Tradeoff Matrix coefficients.** Directional ranking only (strong
   positive through strong negative), no decimals. `data/levers.json` already
   carries `confidence: unverified` on its own figures, which is the pattern.

## 6. What does not bend, whatever is decided

- No real financial data. Demo values only.
- `null` is not `0`. A missing input gives an incomplete state.
- Integer cents internally, formatted only at display.
- One owner per shared field, through `Ownership.write`.
- One formula, one function.
- Reference data in `data/`, versioned by year, never inlined.
- Every session leaves the app with the same or fewer screens, until
  STATUS.md lifts the freeze.

One conflict to note: the spec bans pie charts "ever", and `shared/charts.js`
exports a `donut`. Nothing in the new work will use it; retiring it
everywhere is a separate pass.
