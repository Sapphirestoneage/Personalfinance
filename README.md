# SPARKS / SLAF

A suite of small, self-contained personal-finance tools — "rooms" — that all
read from and write to one canonical household model.

No build step, no framework requirement, no server. Every room is a static
HTML file that includes a handful of shared JavaScript modules and the shared
stylesheet. Open the Map, pick a room, type your numbers; the numbers follow
you into the next room.

## Live

Published with GitHub Pages from `main`:
**https://sapphirestoneage.github.io/Personalfinance/**

That root URL is the FOO calculator; the room directory is at
`/Personalfinance/map.html`. Pages serves this repo from a subpath, so every
path in the site is relative — never introduce a root-absolute `/shared/...`
or it will break there while still working locally.

`.nojekyll` is present so Pages serves the tree verbatim instead of running
it through Jekyll.

## Run it locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Serving over HTTP matters: rooms `fetch()` their reference tables out of
`data/`, and `file://` blocks that.

## Changing things

Nothing here is compiled, bundled, or generated. Every change below is a
plain text edit to one file, and `node test/run.js` grades it.

| To change… | Edit | Notes |
|---|---|---|
| a number, rate, threshold, limit | `data/*.json` | No code. Change `highInterestDebtRate` from 0.075 to 0.30 and a different out-of-bounds flag fires — the tests catch it the same second |
| what a room says | that room's `.html` | Copy is written inline, next to the thing it describes |
| colours, type, spacing | `shared/theme.css` | Design tokens at the top; every room inherits them |
| room order, titles, the map | `shared/registry.js` | One entry per room — `order` is the path a person walks |
| a calculation | `engines/*.js` | One function per concept. If you find yourself copying one, it wants a parameter instead |
| the questions in the intake | `rooms/start.html` | One array near the bottom drives the whole flow |

**Adding a room** is two files, and you don't have to remember the rules —
add an entry to `shared/registry.js`, run the tests, and they tell you what's
missing, one step at a time:

```
$ node test/run.js
  1. room file missing: rooms/scratch-demo.html
```

Fix that, run again, and it asks for the next thing: a deep-link anchor that
exists, a filter tag, a `registerRoom()` call, the shared stylesheet, and
every module its scripts depend on. Copy the shape of an existing room —
`rooms/sleep-at-night.html` is a good small one to start from.

**The four rules that will bite you** are in `CLAUDE.md`, enforced by tests,
and worth reading before shared code: empty is not zero, no `|| 0` in a
formula, money is integer cents, and never rebuild a form while someone is
typing in it.

## Layout

```
index.html          The front door: the Dashboard once it has what it needs, the intake landing until then (D-058)
foo-ladder.js       The FOO ladder's logic (shell at rooms/foo-ladder.html): build() once, paint() on every change
map.html            Room directory: next-unfinished first, then the groups, tag filter
favicon.svg         Sapphire mark
rooms/              One HTML file per room
vendor/fonts/       Self-hosted typefaces (no CDN, no other vendored code)
shared/             The spine everything depends on
  theme.css           navy-sapphire design tokens (colour + type)
  fonts.css           Fraunces + Space Grotesk
  money.js            integer cents, decimal rates, safe divide, Result type
  schema.js           THE household data model + field dictionary
  spine-v2.js         localStorage persistence, getProfile/updateProfile/…
  registry.js         which rooms exist, their tags and deep-link anchors
  reference.js        loader + pure lookups for data/
  rating.js           THE 1-10 rating control — scale, storage and markup
  liveform.js         never rebuild a form under the user's finger
  progress.js         what each room still needs, and where to go fill it
  demo-persona.js     the one demo household used by every "try an example"
engines/            Shared calculation engines — one function per concept
  tier0.js            the nine Tier 0 outputs
  foo.js              Financial Order of Operations ladder + flags
  cashflow.js         categorised spending, budget templates, divergence
  debt.js             payoff simulation, four orderings, credit-card view
  fire.js             one calculateFIRE(), six variants
  projection.js       compound growth with contributions — the only such loop
  hourly.js           real hourly wage, and prices in hours of life
  quickmath.js        HYSA switch, cost per use, 20/3/8, rule of five, $30k/$90k
  selfemployed.js     SE tax in visible steps, W2 vs 1099, quarterly + safe harbour
  goals.js            the shared Goal Costing Engine — wedding, deposit, trip
  accounts.js         Roth vs Traditional vs taxable, Solo 401k limits
  swan.js             the self-reported sleep-at-night target, beside the maths
  values.js           stated values against a categorised month — no score
  fulfillment.js      spend against a 1-10 joy rating, and the four corners
  hassle.js           what a money-saving chore pays per hour of your life
  sidehustle.js       side income after marginal tax, SE tax, costs and hours
  ratios.js           thirty ratios in one registry, plus the radar projection
  credential.js       one ROI engine for a career move and a single skill
  worth.js            predicted-before against rated-after, and the regret view
  windfall.js         a lump sum all at once or spread — and when spreading wins
  runway.js           how long the money lasts when the income stops
  health.js           the health score: ratios, weighted by age cohort
  income.js           hourly/weekly/monthly pay into a year, and jobs by month
  tax.js              federal ordinary + capital gains, FICA, a state schedule, the ACA cliff
  statement.js        three portfolios, weighted net worth, the ladder, the bridge, the worst year
  benchmarks.js       the wealth multiplier, monthly to $1M, PAW, the five levels, 1% more, human capital
  rerank.js           cost rank against value rank, and the lines where the two orders disagree
  events.js           one life event, month by month, three ways — the templates are data/events/*.json
data/               Versioned reference tables (JSON, never inlined in code)
test/run.js         Re-derives every formula outside the browser
test/alignment.js   Browser layout check — side-by-side cells must line up
test/forms.js       Mobile browser check — typing must survive, keyboard must stay
test/export.js      Export → import round trip, share-link round trip, size ceiling
SPEC.md             The full Tier 0–2 build spec. The authority.
ROADMAP.md          The master idea index, tiers 0–24, + what's actually built
DECISIONS.md        Running log of what was decided and why.
CLAUDE.md           Working agreement for anyone (human or agent) editing this.
```

## No dependencies, and no build step anywhere

Nothing loads from a CDN, and nothing is compiled. Fraunces and Space Grotesk
are self-hosted from `vendor/fonts/`, so every page renders identically
offline and makes no third-party request on a visitor's behalf. Verified: a
browser pass over every page issues zero external requests.

The front page used to be the exception — it was React compiled from a `.jsx`
by babel, which made the first thing anyone sees the one thing they could not
change without installing a toolchain. It is now plain JavaScript in
`foo-ladder.js`, and React is gone from `vendor/`. See `DECISIONS.md` D-038.

That file is worth reading if you want to add a page of your own: it is two
functions, `build()` and `paint()`, and a twelve-line `h()` helper that makes
the building code read almost exactly like the JSX it replaced.

## Verify

```sh
node test/run.js
node test/export.js
```

The second checks that a household leaves and comes back unchanged — as a
downloaded file and as a share link — and that a full household with a
snapshot fits in a URL fragment under 8 KB. See `DECISIONS.md` D-059.

There is also a layout check that needs a real browser, because only a
browser knows how tall a wrapped label is:

```sh
python3 -m http.server 8765 &
node test/alignment.js
```

It asserts that every row of side-by-side controls shares a top and bottom
edge at 320, 360, 390 and 414px. It skips cleanly if Playwright isn't
installed — the site itself has no dependencies and no build step.

And a third that types on a phone, because a desktop click resolves too fast
to find the bugs a real tap does:

```sh
python3 -m http.server 8765 &
node test/forms.js
```

It taps from field to field in every room that takes input, on a mobile
browser with touch, and asserts the control the tap was headed for is still
the same DOM node afterwards. A replaced node means the soft keyboard closed
and will not reopen — see `shared/liveform.js` for why. It skips cleanly
without Playwright too.

This re-derives every Tier 0 formula against the demo persona from
independently written expectations, checks the unit and null-vs-zero rules,
and confirms every deep-link anchor declared in `shared/registry.js` actually
exists in its room. It exits non-zero on failure.

## Rules that are easy to break

- **Empty is not zero.** Inputs ship blank with a format-only placeholder.
  `null` means "not entered"; `0` means the user typed zero.
- **No `|| 0` in a formula.** A missing input yields an incomplete output,
  not a wrong number.
- **Money is integer cents.** Format to dollars at display time only.
- **Reference data lives in `data/`.** Never inline a rate or a limit.

Read `SPEC.md` before adding a room. Read `CLAUDE.md` before changing shared
code.

## Not financial advice

Educational tooling. The tax rates, percentile bands, and contribution limits
in `data/` are approximations carrying explicit precision caveats — check
them against a primary source before relying on any output.
