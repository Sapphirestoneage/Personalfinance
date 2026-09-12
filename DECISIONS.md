# DECISIONS

Running log. Newest first within each section. Every entry gets an id, a
date, the decision, and the reasoning — enough that a later session does not
have to reverse-engineer it from a finished file.

`SPEC.md` is the authority on the build spec. This file records what was
decided while implementing it, and every place implementation had to depart
from the spec or fill a gap the spec left open.

---

## D-001 — Repo state did not match the brief's Section 0 premise
**2026-09-03 · blocking finding, recorded before any code**

`SPEC.md` §0 says `index.html`, `shared/spine-v2.js`, `shared/registry.js`
and three rooms (`real-hourly-wage`, `money-calendar`,
`student-loan-decision`) already exist, and §0.5 / §5.1 describe having read
those files. None of that is true of this repository.

At the start of this session `Sapphirestoneage/Personalfinance` contained
exactly two files on `main`, five commits deep, last pushed 2026-07-06:

- `index.html` — a self-contained React (UMD + Babel-standalone + Tailwind
  CDN) single-page FOO ladder calculator.
- `Inheritance FOO` — the same app's JSX source, unbundled.

There was no `CLAUDE.md`, no `README.md`, no `DECISIONS.md`, no `shared/`
directory, and no room files. No other branch existed. The organisation's
only other repository (`Sapphirestoneage/bpmdewk`, private) is unrelated.

Two specific claims in the brief are therefore false **for this repo** and
were not acted on as written:

1. §0.5 states all four existing files use a system font stack and a
   slate/amber/teal palette (`#0f1720`, `#f2b45a`, `#4fd1a5`, `#e0715a`)
   "with no sapphire tone anywhere". The one existing file is already navy
   and sapphire — `#081833`, `#0B2249`, `#0F2650`, `#16305E`, `#2E6FE8`,
   `#7FB0FF`, `#0A1E44`. There was no slate/amber/teal palette to convert.
   The design tokens in D-002 are derived FROM that file rather than
   replacing it, so the shipped look is preserved and centralised.
2. §5.1 states every input in "all three shipped rooms" carries a pre-filled
   `value` attribute. Those rooms do not exist. The existing FOO app does
   pre-fill React state defaults (`useState(85000)` for income and similar),
   which is the same violation in a different shape, and is fixed when that
   app is brought onto the shared system.

Consequences for §1 and §9: there is no flat `spine-v2` to migrate and no
call sites to update, so the "two-part migration" collapses into building
the spine correctly to the household schema the first time. See D-003.

**Not done, and why:** the three Tranche 1 rooms were not recreated. The
brief describes them as finished work to verify, not to build, and never
specifies their inputs, copy, or layout in enough detail to rebuild without
inventing them. `student-loan-decision` does not appear anywhere in the §13
tool specification at all. Rebuilding them is a scoping decision for Eli.

---

## D-002 — navy-sapphire design system, centralised as CSS custom properties
**2026-09-03 · SPEC.md §0.5**

All colour and type values live in `shared/theme.css` as custom properties on
`:root`. Rooms reference the properties; no room hardcodes a hex value. Type
loads via `shared/fonts.css` so a room includes one line, not two.

**Type.** `--font-display: 'Fraunces', 'Iowan Old Style', Georgia, serif` for
headlines and figures; `--font-body: 'Space Grotesk', 'Inter', system-ui,
sans-serif` for body and UI. Both carry real fallbacks so a blocked font
request degrades rather than breaks.

**Palette**, derived from the existing FOO app so the shipped look is kept:

| Token | Value | Role |
|---|---|---|
| `--navy-950` | `#050F22` | deepest ground, shadows |
| `--navy-900` | `#081833` | page background |
| `--navy-850` | `#0A1E44` | strokes |
| `--navy-800` | `#0B2249` | gradient midpoint |
| `--navy-750` | `#0F2650` | raised surface |
| `--navy-700` | `#16305E` | muted surface |
| `--navy-600` | `#1E3A8A` | strong border |
| `--sapphire-600` | `#1D4ED8` | pressed accent |
| `--sapphire-500` | `#2E6FE8` | primary brand accent |
| `--sapphire-400` | `#3B82F6` | interactive |
| `--sapphire-300` | `#60A5FA` | accent text, affixes |
| `--sapphire-200` | `#7FB0FF` | highlight, focus ring |
| `--sapphire-100` | `#93C5FD` | muted text |
| `--sapphire-050` | `#EFF6FF` | foreground text |

**Status hues** sit deliberately outside the brand scale, because they have
to read as signal rather than decoration: `--color-positive #4CC38A`,
`--color-caution #E8B84B`, `--color-critical #E5484D`.

Type scale `--text-xs` 11px → `--text-2xl` 36px; spacing `--space-1` 4px →
`--space-7` 48px; radii 8/12/16/pill; canonical room column `--measure`
480px.

---

## D-003 — spine-v2 stores a household; compatibility note
**2026-09-03 · SPEC.md §1, §3 · required by CLAUDE.md's compatibility-note guardrail**

**What changed.** `getProfile()` returns a household object, not a flat
profile. There are no flat keys anywhere in the stored shape.

- Income lives at
  `household.people[i].incomeSources[j].grossAnnualIncomeCents`.
  `annualSalary` does not exist.
- Debts live in `household.debts[]` as itemised records
  `{id, label, balanceCents, rate, minPaymentCents, type, emotionalTag, ownerIds}`.
  `studentLoanBalance` / `studentLoanRate` do not exist.
- Assets live in `household.assets[]` as
  `{id, label, category, valueCents, liquid, ownerIds}`.
- Storage key is `slaf.household.v2`; snapshots are separate, at
  `slaf.snapshots.v1`, append-only.

**Which rooms were updated to match.** None — none existed (D-001). Both
rooms shipped in this session were written against the household model from
the start.

**What a future room must know before its first `getProfile()` /
`updateProfile()` call.** Read `SPEC.md` §3 and `shared/schema.js`. Do not
pass flat keys to `updateProfile()`. It merges a *partial household*: scalars
overwrite, `expenses` / `assumptions` / `assumptionOverrides` / `meta` merge
one level deep, and arrays replace wholesale. To touch a record inside an
array, use the shaped helpers — `ensurePrimaryPerson`, `upsertPerson`,
`upsertIncomeSource`, `upsertAsset`, `upsertDebt`, `removeById`,
`setMonthlyExpenses`, `setAssumptionOverride` — which write to the one
canonical location for each field. `updateProfile()` warns and drops any
Computed-class key handed to it.

**Legacy data.** `migrateLegacy()` upgrades any pre-v2 flat blob found in a
visitor's `localStorage` (`slaf.profile`, `slaf.profile.v1`,
`sparks.profile`) on first read: `annualSalary` becomes an income source on a
new primary adult, `studentLoanBalance` / `studentLoanRate` become a
`student_loan` debt owned by them, dollars are converted to cents, and a rate
entered as `5.5` is read as 5.5%, not 550%. `hoursPerWeek` is dropped — it
was a room-local input with no home in the household schema, and the room
re-asks. The legacy key is left in place rather than deleted so a bad
migration is recoverable.

---

## D-004 — units, locked
**2026-09-03 · SPEC.md §4, §6**

- Money is **integer cents** everywhere in storage and in every formula.
  Field names carrying money end in `…Cents`. Dollars exist only in
  formatting and in `shared/demo-persona.js`'s plain-dollar `VALUES`.
- Rates and percentages are **decimal fractions**: `0.07` is 7%.
  `parseRatePercent('7')` returns `0.07`; `formatRate(0.07)` returns `"7%"`.
  This includes `savingsRate` — stored `0.285`, displayed `28.5%`.
- Expenses are **monthly**; income is **annual**. Conversion happens at the
  edges, never mid-formula.
- `null` / `undefined` means "not entered". `0` means the user typed zero.
  `Money.isEntered()` is the only test for this, and no formula uses `|| 0`.
- Every computed output is a Result — `{status, value, reason, missing}` —
  never a bare number, so an incomplete state cannot be mistaken for zero.
  `shared/reference.js` adds two statuses only a bounded lookup table can
  produce: `below_chart` and `above_chart`.

---

## D-005 — demo persona: Robin Sparks
**2026-09-03 · SPEC.md §5.1**

Defined once in `shared/demo-persona.js`. Every room's "Try with example
numbers" fills from this and nothing else. Public repo — entirely fictional.

| Field | Value |
|---|---|
| Name | Robin Sparks |
| Date of birth | 1994-04-12 (age 32 as of 2026-09-03) |
| State | NC |
| Filing status | single |
| Gross annual income | $72,000, W2 |
| Employer match | 50% of the first 6% of salary |
| Currently capturing full match | **no** |
| Cash / savings | $9,500 |
| Investments + retirement | $48,000 |
| Student loan | $18,400 @ 5.5%, $210/mo minimum |
| Credit card | $3,200 @ 22.9%, $95/mo minimum |
| Monthly essential expenses | $3,150 (estimated) |

"Not capturing the full match" and a 22.9% card held alongside $9,500 of cash
are deliberate: they make the demo surface two real out-of-bounds flags
instead of a clean sheet that demonstrates nothing.

Inputs are **empty by default** in every room. The persona is only ever
loaded behind an explicit action, and that action asks first if the visitor
already has their own numbers entered.

---

## D-006 — age is derived client-side
**2026-09-03 · departure from SPEC.md §13**

§13 says "derive age server-side, never trust client-calculated age". This
build has no server — it is static files with `localStorage`. Age is derived
in `Schema.ageFromDob()`, which is the single call site in the whole app, so
this is one function to swap when a server exists. `primaryAge()` is the only
thing that calls it. Nothing else may compute an age inline.

---

## D-007 — the FOO calculator stays at the site root; the Map is a subpage
**2026-09-03 · SPEC.md §12.6, §12.7 · superseded once, see the amendment below**

§12.6 and §12.7 describe `index.html` as the Map shell carrying the tag
filter and the visited-rooms progress bar. The `index.html` on `main` was
instead the FOO ladder calculator.

Resolution: the calculator moves to `rooms/foo-ladder.html` and is listed in
the registry; `index.html` becomes the Map shell the spec describes. Nothing
is deleted. `Inheritance FOO` — the unbundled JSX source of the same app —
is left untouched at the repo root.

**Amended the same day, at Eli's direction.** The swap was made and then
reversed: moving the Map to the site root would have changed what an existing
visitor lands on, and that was not worth the spec's tidiness.

Final layout:

- `index.html` — the FOO calculator, at the root, where it has always been.
  Its precompiled script and JSX sit beside it as `foo-ladder.js` /
  `foo-ladder.jsx`.
- `map.html` — the Map shell, a subpage, carrying the tag filter and the
  visited-rooms progress bar §12.6/§12.7 describe.
- `rooms/` — every other room.

Registry `href` values are relative to `map.html`, which lives at the root, so
`index.html` and `rooms/financial-snapshot.html` both resolve correctly from
it. `Inheritance FOO` — the app's original unbundled JSX — is left untouched
at the repo root.

One thing this move surfaced: rooms were passing a hand-written `'../data/'`
to `Reference.load()`, which breaks the moment a room changes depth.
`shared/reference.js` now resolves `data/` against its own script URL, so no
room knows or cares how deep it sits. Same principle that lets one
`shared/fonts.css` serve every page.

`foo-ladder` declares no `subsections` in the registry. It is a single-view
React app with no stable section anchors, and inventing ids for it would mean
restructuring a working app for no present benefit. Declaring none is
deliberate; `test/run.js` verifies only what is declared.

---

## D-008 — `capturingFullMatch`: an input Tier 0 needs but does not list
**2026-09-03 · gap in SPEC.md §13**

FOO step 2 ("capture the full employer 401(k) match") and the
`match_left_on_table` out-of-bounds flag both require knowing whether the
user is *contributing enough to receive* the match. Tier 0's ten inputs
capture the match's shape (percent and cap) but never whether it is being
captured. The step cannot be evaluated from the ten inputs alone.

Rather than guess, `household.capturingFullMatch` is a nullable raw boolean
with three meaningful states, mirroring the empty-is-not-zero rule:

- `null` — not answered. FOO reports step 2 as **unknown** and stops there
  with a reason, rather than silently passing or failing it. The
  `match_left_on_table` flag does not fire.
- `false` — not capturing it. Step 2 is the placement; the flag fires.
- `true` — capturing it. Evaluation continues to step 3.

It is surfaced as an eleventh input in the Financial Snapshot room, shown
only once an employer match has actually been entered.

---

## D-009 — reference tables carry explicit precision caveats
**2026-09-03 · SPEC.md §6, §7**

Every file in `data/` carries `version`, `asOf`, `source`, and where
relevant `precision`. Lookups return the version they used alongside the
value, and snapshots store those versions, so a table refresh cannot silently
reshape a saved result.

Honest state of each table as shipped:

- `effective_tax_rates_2026.json` — **approximate**. A blended estimate of
  federal income tax plus the employee half of FICA, banded by gross income.
  No deductions, credits, state income tax, or marginal brackets. It is the
  MVP placeholder §10 asks for, structured so a real engine replaces the file
  rather than any calculator code.
- `net_worth_percentiles_scf_2022.json` — the **medians are as published**
  by the 2022 Survey of Consumer Finances. The p10/p25/p75/p90 breakpoints
  are approximations added so the bands can interpolate, and should be
  refreshed against the published distribution before any output is presented
  as authoritative.
- `irs_limits_2026.json` — carried over from the existing FOO app and marked
  `unverified-against-primary-source`. Re-check against the IRS notice for
  the plan year.
- `retirement_milestones.json`, `foo_rules.json` — the guideline multiples
  and thresholds named in `SPEC.md` §13, moved out of code so tuning them is
  a data edit.

---

## D-010 — the FOO app's input layer rewritten; why two FOO implementations exist
**2026-09-03 · SPEC.md §5.1, §8**

The relocated app (D-007) shipped with roughly twenty-five pre-filled state
defaults — `useState(85000)` for income, `useState(4200)` for expenses, two
example debts, and so on — and a `Field` component whose `onChange` turned an
empty box into `0`. Same violation as a pre-filled `value=` attribute, in a
different shape, plus the exact `|| 0` pattern §5 rule 3 names.

§5.1 calls converting this "a small, isolated change". It is not: the app is a
month-by-month waterfall simulation whose ~100-line loop and nine step cards
all read those values directly. Rather than half-convert it, the input layer
was rewritten:

- Every **raw** input starts `null` and renders an empty box with a
  format-only placeholder. `Field` is a text input, not a number spinner, so
  an empty string stays empty and a stray scroll cannot change a balance.
- **Assumption-class** values keep defaults, which is correct per §3 — an
  emergency-fund target of 3 months, 7% growth on prepaid savings, and the
  IRS limits, which now load from `data/irs_limits_2026.json` rather than
  being hardcoded. All are visible and editable in one panel.
- Gating is per-field rather than all-or-nothing. The gap engine needs income
  and expenses before it shows a figure. The month-by-month timeline needs its
  full input set and names precisely which are missing. Each of the nine step
  cards declares what it needs and says "add X to see this" instead of
  deriving a number from nothing. Because the simulation only runs once every
  value it reads is present, nothing inside the loop had to change — the
  proven maths is untouched.
- The room seeds itself from the household on load, so a visitor who filled
  in the Financial Snapshot first opens this room with **their** numbers, not
  a stranger's. Verified: income, expenses, age, cash, match cap and both
  itemised debts carry across, with the gap computing correctly from them.

**Why `engines/foo.js` and this room both exist**, given §8's one-formula rule.
They answer different questions. `engines/foo.js` is a sequential boolean
gate: *which step are you standing on right now*, from the ten Tier 0 inputs.
This room simulates *when each step lands*, month by month, given a monthly
surplus — including a windfall poured through the ladder in strict order at
month zero. Neither can be expressed as a parameterisation of the other, and
they share their thresholds through `data/foo_rules.json` rather than
duplicating them. If a third caller ever needs the projection, the simulation
comes out of this room into `engines/` first.

**What this room does not do yet.** It calls `registerRoom()` and reads the
household, but writes nothing back. Its step-by-step inputs — highest
deductible, Roth/HSA contributed so far, prepaid goal and balance — have no
home in the schema until the Cash Flow and Goal Costing engines land. They are
deliberately not bolted onto the household in an ad hoc shape; that is exactly
the retrofit §3 warns against.

---

## D-011 — no CDN dependencies; React and the type are self-hosted
**2026-09-03**

The rooms pulled React, ReactDOM and Babel-standalone from cdnjs, and both
typefaces from Google Fonts. Four third-party requests to read your own
numbers, a page that renders unstyled or blank on a flaky network, and — in a
sandboxed browser — type that could not be verified at all.

`vendor/` now carries the React 18.2.0 UMD builds and the latin
variable-weight cuts of Fraunces (37KB) and Space Grotesk (22KB), both SIL
OFL with licences included. `shared/fonts.css` declares the faces locally;
because CSS `url()` resolves against the stylesheet rather than the document,
one file serves both the root Map and the `rooms/` pages.

Babel-standalone is gone: `rooms/foo-ladder.jsx` is precompiled to a committed
`rooms/foo-ladder.js`, with the JSX kept beside it so the generated file is
never the only copy. Regenerate with

```sh
npx @babel/cli --presets @babel/preset-react rooms/foo-ladder.jsx -o rooms/foo-ladder.js
```

That is an authoring step, not a build the site depends on. The committed
`.js` is what runs, and the repo stays a no-build static site.

---

## D-012 — what the verification pass actually caught
**2026-09-03 · SPEC.md §14**

Recorded because "it served with a 200 and didn't crash" would have missed
all three. `node test/run.js` runs 145 checks; a Chromium pass at 390px drives
all three pages.

1. **An unknown FOO step was reported as a placement.** On an empty form the
   ladder read "Step 0", telling a visitor who had entered nothing that they
   were stuck on the first rung. Only an `unmet` step is a placement now; an
   unjudgeable one says what it needs. Caught by reading the empty state in a
   browser, not by any unit check.
2. **`capturingFullMatch` was lost on every page reload.** `createHousehold`
   did not carry the field, so it was dropped when the stored blob was
   rehydrated — silently resetting the ladder from "Step 2" to "unknown" and
   losing the employer-match flag. Caught by comparing a screenshot against
   what the same page had shown a moment earlier. It is now a declared raw
   field, and a test round-trips the entire demo household through the spine.
3. **A missing favicon** was 404ing on every page load.

Still not covered by any automated check, and worth a human eye: how the
rooms read on a real phone rather than an emulated viewport, and whether the
copy lands.

---

## D-013 — Cash Flow: one transaction-shaped store, not two code paths
**2026-09-03 · SPEC.md §9 item 4, §12.5, §12.3, §13**

§12.5 is resolved as "manual entry now, architect for bank-linked import".
The cheap reading of that is a manual store plus a hook for a future
importer; that ends in two aggregation paths and a rewrite. Instead there is
**one** store, `household.expenses.entries[]`, and every record in it is
transaction-shaped:

```
{ id, categoryId, amountCents, period: 'monthly'|'once',
  date, descriptor, source: 'manual'|'imported', categorizedBy }
```

A hand-typed monthly total is a record with `period: 'monthly'`. An imported
transaction is a record with `period: 'once'` and a date. `normaliseToMonthly()`
reduces both to a monthly figure, so the roll-up, the bucketing and the
template comparison keep working unchanged the day an importer starts writing
records. `categorise()` already operates on a transaction's descriptor rather
than a typed total, and is written but unused by manual entry — it exists now
so the import path plugs into a categoriser that was never retrofitted.

Three judgement calls inside it:

- **Dated records are divided by the number of DISTINCT months they span**,
  not by a fixed 30 days and not by the record count. Three months of imported
  transactions produce a monthly average, not a quarterly total. An undated
  one-off counts as a single month rather than being silently annualised.
- **`categorise()` returns null rather than falling back to "other"** on an
  unrecognised descriptor. An uncategorised transaction is a real state worth
  surfacing; burying it in a catch-all is how a budget quietly stops matching
  reality.
- **Savings is not an expense.** `spendMonthlyCents` counts needs and wants;
  the savings bucket is reported separately. Money moved to savings has not
  left. This matters because it is the difference between a net-cash-flow
  figure that means something and one that punishes you for saving.

**Buckets and templates are config**, in `data/expense_categories.json` and
`data/budget_templates.json`. The engine knows how to compare against a split;
it does not know what any split is, so DRAFTT or any other framework is a data
edit. The percentage templates use `basis: "net"` — the classic 50/30/20 is
defined against take-home pay — and the engine derives net from gross through
the same effective-tax lookup Tier 0 uses rather than asking for a second
income figure or writing a second tax calculation.

**Feeding §12.3.** `trackedEssentialCents()` returns what the tracked figure
should be, restricted to the *essential* categories so it is comparable with
what the estimate was actually asked for. Writing it stays the room's job,
through `Spine.setMonthlyExpenses(cents, 'tracked')`, which preserves the
estimate permanently. The demo persona's spending is deliberately set so the
essential categories total $2,805 against a $3,150 estimate — a real −$345
divergence, so the feature demonstrates itself rather than showing a clean
zero.

---

## D-014 — what the Cash Flow room's browser pass caught
**2026-09-03 · SPEC.md §14**

Three defects, none of which `node test/run.js` could have found, because all
three lived in the wiring between correct pieces.

1. **Two reference tables were added to `data/` but never registered in
   `shared/reference.js`'s `TABLE_FILES`.** The unit tests `require()` the
   JSON directly, so they passed; the browser loads through the loader, so
   `TABLES.expenseCategories` came back `undefined` and took the room's whole
   input panel down. `test/run.js` now checks both directions — every JSON in
   `data/` is registered, every registered entry exists on disk — and that
   each carries the `version` / `asOf` / `source` stamp §6 requires.

2. **The room looked entries up by an id it had minted itself** (`cf_housing`),
   so the example household's entries — written with their own ids — were
   invisible in the inputs and could not be cleared. Lookup is now keyed on
   the category, which is the real natural key for "the manual monthly total
   for this category"; the minted id is only used when creating a record that
   does not exist yet. This is the general hazard of a room assuming it is the
   only writer of a shared array, and it will recur with a future importer.

3. **A favourable divergence was rendered in red.** `setCard()` colours any
   negative figure as a loss, which is right for net worth and wrong here:
   spending *less* than you estimated is good news. The divergence card now
   colours by direction rather than by sign.

Also changed on the same pass: category inputs had `placeholder="—"`, which
is not a format hint. §5 rule 1 asks a placeholder to show format. The dollar
affix already carries the unit, so what was actually ambiguous was the period
— the placeholder is now `/mo`.

---

## D-015 — Debt Calculator: one engine, four orderings, no second builds
**2026-09-03 · SPEC.md §9 item 5, §10, §13**

`engines/debt.js` is the engine §9 item 5 asks for, and it is deliberately
the *only* payoff simulation in the codebase. §13 asks whether the Credit
Card calc is a specialised view or a filtered display of the general
calculator: it is a filtered display. `creditCardsOnly()` returns a household
containing just the revolving debts and hands it to the same `simulate()`.
Verified — the filtered run gives the identical answer to running that card
alone. The Convenience Method is likewise one of the four orderings, not a
separate tool, and a single-loan payoff question is a one-debt run through
the same loop.

**Month-by-month, not closed form**, per §10 — and not by preference. Every
strategy keeps the household's monthly outlay constant: all the minimums plus
the extra. When a debt clears, its minimum rolls onto the next target the
following month. No closed-form formula expresses that, which is exactly why
the spec insists on a simulation.

**Verifying a loop against itself proves nothing**, so the test checks the
single-debt case against the analytic solution
`n = −ln(1 − rB/P) / ln(1+r)` — a different method, not a second copy. Robin's
$3,200 card at 22.9% paying the $95 minimum: the closed form says 55 months
and the simulation says 55. The multi-debt cases are then checked against
invariants rather than fitted numbers — avalanche must never cost more
interest than any other ordering, snowball must clear its first account no
later than avalanche.

**Ordering is recomputed every month**, because the hybrid strategy's "small
enough to finish quickly" test depends on the balance as it stands now, not
as it stood at the start.

**Minimum payments** are derived only where they honestly can be (§13: issuer
formulas vary, don't hardcode one). A minimum the user read off a statement
always wins. Otherwise a revolving balance derives 2% or a $25 floor,
whichever is greater, capped at the balance itself — a common convention,
marked as derived, and stated as such in `data/debt_rules.json`. An instalment
loan's payment depends on its original term, which this build does not ask
for, so it is **requested rather than invented**.

**A payment that cannot outrun the interest is reported, not looped.** The
simulation detects a balance that grows faster than it shrinks and returns an
incomplete result saying so, and the 600-month ceiling returns "still not
clear at this payment" rather than silently truncating and reporting a wrong
month count.

Strategies, the emotional-priority ranking used by the Convenience Method,
the quick-win threshold and the month ceiling are all in
`data/debt_rules.json`, so adding a strategy is a data edit.

---

## D-016 — the Debt Payoff room shows what a choice costs
**2026-09-03 · SPEC.md §13**

The room is the first place the itemised debt array §3 insists on is actually
*entered* — the Financial Snapshot stores one lump-sum debt record, and this
is where that becomes real per-debt lines with their own rate, minimum, type
and emotional tag.

Two presentation decisions worth recording, because both came out of looking
at the rendered page rather than the numbers:

- **A non-cheapest ordering states its price.** Selecting Convenience on the
  example household costs $1,321 more in interest than Avalanche, and the
  plan says so — followed by the honest caveat that a plan you stick to beats
  a cheaper one you abandon. Presenting the Convenience Method without its
  cost would be dishonest; presenting the cost without that caveat would
  quietly argue against a method the spec deliberately includes.
- **When every ordering ties, the room says so.** With the example
  household's two debts, the highest-rate debt is also the smallest, so all
  four strategies produce an identical result. Four identical figures read as
  a broken comparison; a line saying the order does not matter here reads as
  an answer.

A debt still missing a rate or a minimum names what it needs on its own row
rather than being silently dropped from the plan or counted as zero. A debt
with no balance entered yet is simply not part of the plan — that is a
half-filled row, not an error.

---

## D-017 — one owner per shared number; everywhere else it's a link
**2026-09-03 · Eli's design direction · supersedes part of D-003**

Eli spotted this from the outside: *"I want there to be almost a priority and
a non-editable, because it is on another screen — so the number should be a
link to the other page."* The example given was debt minimums, and it was
exactly right.

**What was wrong.** The same figure was editable in three places. Monthly
debt payments could be typed as a lump sum in the Financial Snapshot,
itemised per-debt in Debt Payoff, and typed a third time as a "Debt minimums"
spending category in Cash Flow. Income was editable in the Snapshot and again
in the FOO Ladder. Cash was editable in the Snapshot and seeded into two
separate FOO fields. `CLAUDE.md` forbids a room holding "its own private copy
of a number that already exists in the household model" — these were not
private copies of a household number, they were *rival* copies, and the only
reason they had not visibly diverged is that nobody had edited one yet.

**The rule now.**

> A shared field is EDITABLE in exactly one room — its owner. Everywhere else
> it renders read-only, showing the current value and linking to the room
> that owns it.

`shared/ownership.js` is the single place the map lives. Each field declares
its owner and the anchor to land on, so a link always arrives at the specific
question rather than the top of some page.

| Field | Owner |
|---|---|
| dob, age, state, filingStatus, grossAnnualIncome, cashSavings, investments, employerMatch, capturingFullMatch | **Start Here** |
| totalDebt, monthlyDebtPayments (and every per-debt figure) | **Debt Payoff** |
| monthlyExpenses, every spending category | **Cash Flow** |

**Consequences, all of them deliberate:**

- **The Financial Snapshot takes no input at all** — it has zero `<input>` and
  zero `<select>` elements, enforced by a test. It is the dashboard: eleven
  borrowed figures at the top, each a link to its source, then the nine
  outputs. Its "try the example" button is gone, because loading example data
  would have meant writing fields it does not own.
- **Debt minimums in Cash Flow is a *derived* category.** It carries
  `derivedFrom: "monthlyDebtPayments"` in `data/expense_categories.json`, so
  the engine computes it from the itemised debts and *ignores* any typed
  entry for it rather than adding one — otherwise the figure would be counted
  twice. It renders as a link to Debt Payoff.
- **The FOO Ladder no longer holds seeded copies.** Income, expenses, cash,
  age and the match cap were `useState` values seeded once from the household
  — which is the same drift problem in slow motion, since nothing refreshed
  them. They are now derived on every render from a live household that
  subscribes to `Spine.onChange`. Its debts are read-only summaries linking
  to Debt Payoff. Its own genuinely-local inputs (highest deductible, Roth
  contributed so far, prepaid goal) stay editable, because nothing else in
  the app holds them.

Verified live: changing one debt's minimum to $400 in Debt Payoff immediately
moves Cash Flow's derived category to $495 and the Snapshot's chip to $495/mo,
with no reload. And an audit of every input on every page shows each shared
number is typeable in exactly one room.

---

## D-018 — a guided intake, and the rooms as an ordered path
**2026-09-03 · Eli's design direction**

*"Ask me the questions and have that be the default, so I don't have to edit
them constantly."*

**`rooms/start.html`** asks nine questions one at a time, in plain English,
and writes each answer straight into the household. It is the owner of every
field it asks about, so those answers are the single source everywhere else.

Ordered by what each answer unlocks rather than by what is convenient to
ask: income first (it feeds savings rate, DTI, the retirement benchmark and
take-home pay), then filing status, then expenses, cash, investments, and
only then the demographic questions. The employer-match follow-up
("are you actually capturing it?") appears only once a real match has been
entered — D-008's three-state answer, asked conversationally.

Behaviour worth recording:

- **Skip leaves a field unset, never zero.** The empty-is-not-zero rule holds
  through the wizard: skipping the cash question stores no cash record at all.
- **It resumes.** A returning visitor with everything answered lands on the
  review screen, not back at question one; a half-finished one resumes at the
  first unanswered question.
- **Every question is deep-linkable**, which is what makes the ownership
  chips work. A `hashchange` listener re-routes for same-page navigation —
  without it, a chip followed while already on Start Here would silently do
  nothing, because a hash-only change is a same-document navigation that
  never re-runs boot.
- **It hands off** to whichever room is genuinely next on the path, rather
  than to a hardcoded one.

**The path.** Every room now declares an `order`: Start Here → Debt Payoff →
Cash Flow → Financial Snapshot → FOO Ladder. The Snapshot sits after the
rooms that feed it, which is now enforced by a test. The Map renders that as
a numbered sequence with a "next" flag on the first unvisited room, so there
is always an obvious next move. §12.6's tag filter is untouched and sits on
top of the ordering.

---

## D-019 — side-by-side controls line up, at every width
**2026-09-03 · Eli, from a phone screenshot**

*"I also see the cells are not always even."* Correct, and the screenshot made
the cause obvious: "MONTHLY DEBT PAYMENTS" wrapped to two lines while
"MONTHLY EXPENSES" beside it stayed on one, so the two input boxes started at
different heights. Same for "CASH & SAVINGS" against "INVESTMENTS +
RETIREMENT", and "EMPLOYER MATCH" against "…UP TO THIS MUCH OF PAY".

**Cause.** In a two-column grid the row is as tall as its tallest cell, and
content flows from the top of each cell. A label that wraps therefore pushes
its own input down while its neighbour's stays put. It only shows up at
widths where one label wraps and the other doesn't, which is why no earlier
pass caught it — the 390px checks happened to land on widths where the labels
didn't wrap.

**Fix, at the source rather than per room.** `.slaf-field` is now a flex
column with `justify-content: flex-end`, so its contents sit at the BOTTOM of
whatever cell height the row imposes. Inputs therefore always align; only the
labels sit at different heights, which is the right reading order anyway.
Outside a grid the container is content-height, so nothing else changes.

**And a shared height token.** A borrowed-value chip standing in a row of
inputs has to match an input's metrics exactly or the row breaks again.
Rather than hand-tuning pixels, `--control-height` is now the single value
both `.slaf-input-shell` and `.slaf-owned--field` are built from. The chip's
"from Start Here →" also gets `white-space: nowrap`, because it wrapping was
what made the chip taller than the input beside it.

**`test/alignment.js`** now measures this in a real browser at 320, 360, 390
and 414px: it groups each grid's cells into visual rows and asserts every
control in a row shares a top and bottom edge. Before the fix it reported
spreads of 17–51px; now every row is 0. It skips cleanly when Playwright
isn't installed, because the repo has no build step and no `package.json` and
that is staying true.

---

## D-020 — FIRE variants: one formula, and one projection loop
**2026-09-03 · SPEC.md §8, §13**

§8 names this one explicitly: "`calculateFIRE()` parameterized by variant
instead of five copies". `engines/fire.js` holds exactly one formula —
annual expenses × factor ÷ withdrawal rate — and the six flavours differ only
in what they feed it:

- **lean / standard / chubby / fat** change `expenseFactor` (0.7 / 1.0 / 1.25
  / 1.5, all in `data/fire_variants.json`, so a new flavour is a data edit).
- **coast** discounts the standard target back to today, answering "what would
  I need now to stop contributing and still arrive by my target age?"
- **barista** subtracts part-time income from the expenses the pot must cover.

Two things worth recording:

**A shared projection.** Tier 0 had a compounding loop inline for
time-to-FIRE, and every variant needed the same thing. Rather than grow a
second copy, it is extracted to `engines/projection.js` and Tier 0 now
delegates to it — verified by the 19-years-to-FI assertion still passing
unchanged after the refactor. It stays a year-by-year loop rather than a
closed form because it has to remain correct at a zero or negative
contribution.

**Coast is verified by round trip, not by repeating the formula.** Asserting
`945,000 / 1.07^33` against an engine that computes `945,000 / 1.07^33`
proves nothing. The test instead grows the coast number forward 33 years at
7% with no contributions and checks it lands on the full number — a different
operation, and the one that actually defines what Coast means.

The room owns no field. Its withdrawal rate, expected return, coast age and
part-time income are **local previews**, per §12.2: verified that a 3% SWR
preview shows $1,260,000, leaves the stored 4% untouched, and is gone after a
reload.

---

## D-021 — Real Hourly Wage, and where a work profile lives
**2026-09-03 · SPEC.md §9 item 7, §13**

Built before Prospective Worth and Side Hustle because §9 says to: both
consume it, and building them first would mean deriving a rate twice.

**Where the inputs live.** Contracted hours, unpaid overtime, commute, prep,
decompression, weeks worked and work-related costs are now
`person.work` in the schema, not room-local state. They are facts about a
person, and three tools will read them. Putting them on the person also means
this room owns them under D-017's rule, so nothing else can edit them.
`Schema.workProfile()` fills the block in for anyone stored before it existed,
so no migration is needed.

**Two rates, one formula.** The nominal rate counts only paid hours and only
gross pay. The real rate counts every hour the job takes and only the money
that survives tax and the costs of working. Tax comes from the same
effective-rate lookup Tier 0 uses — there is still exactly one tax
calculation in this app.

**Blank means none, not unanswered, for the unpaid hours only.** Working from
home genuinely means no commute, so an empty commute field contributes zero
rather than blocking the calculation. Contracted hours are the exception: they
are the denominator of the nominal rate, so missing or zero is incomplete
rather than divided by. This is a deliberate, local departure from the
blanket empty-is-not-zero reading, and it is confined to the four optional
unpaid-hour fields.

Verified against the example: $37.50/h on paper, $21.04/h actually — 56% of
the headline rate retained, $16.46 of every hour lost to tax, work costs and
unpaid time. A $1,200 purchase costs 57 hours of life against the 32 hours
the payslip implies. Deleting the commute moves the rate to $23.23/h.

`hoursToAfford()` is the life-energy half, and is the function Side Hustle
and Prospective Worth should call rather than re-deriving a rate.

---

## D-022 — the one-line calculators share a room, and one is not built
**2026-09-03 · SPEC.md §13**

§13 asks, of the Rule of Five / $30k–$90k / 20-3-8 group, whether they should
be "standalone mini-calculators vs. inline annotations". Answer: neither
extreme. A page holding a single division is not a tool, and burying these
inline hides them. They share `rooms/quick-math.html` — four small answers,
each independently complete or incomplete.

**Built:** HYSA Switch, cost-per-use (§13's Girl Math / Lifetime Value),
the 20/3/8 car rule, and the Rule of Five.

**~~Not built: the "$30k–$90k Rule".~~ RESOLVED — see D-026.** I had guessed
it was a car-buying threshold, which is why I could not make it work. It is
not: it is a rule about recurring spending, and Eli defined it. Now built.

Three things worth recording about the implementations:

- **The HYSA answer nets the friction, not just the spread.** The spread
  alone is one multiplication and slightly dishonest: money in transit earns
  the old rate's worth of nothing, and a transfer fee is real. The room shows
  the year-one figure after both, the break-even in days, and the ongoing
  annual gain separately, because those are three different questions.
- **20/3/8 reports each leg separately**, because failing one is a very
  different situation from failing all three, and each failure states its own
  remedy in the units you would act in — "$3,000 more would do it",
  "60 months is 24 too many", "$535/mo is $55 over the cap".
- **Both heuristics print their own rule** next to the answer. They are rules
  of thumb, not laws, and a reader deserves to see the standard they are
  being measured against so they can disagree with it deliberately.

**A rounding bug this batch surfaced.** `levelPaymentCents` computed the
total interest from the *unrounded* payment while displaying the rounded one,
so a loan's payment and its total did not reconcile — off by 5 cents on a
$20,000 car loan, and more on a mortgage. Totals now derive from the payment
you actually make. Caught by a test asserting `payment × months − principal`,
which is the arithmetic a reader would do themselves.

---

## D-023 — self-employment tax, computed in visible steps
**2026-09-03 · SPEC.md §13**

§13 flags this area twice and both warnings shaped the code.

**"A common source of off-by-a-factor errors."** So the tax is computed in
named steps rather than one multiplication, and every step is reported back
and shown in the room:

1. net earnings = net profit × 92.35%
2. Social Security = those earnings up to the wage base × 12.4%
3. Medicare = all of them × 2.9%, no cap
4. additional Medicare above a filing-status threshold, at 0.9%
5. half of (2 + 3) — **not** of (2 + 3 + 4) — is deductible

Checked against the textbook $100,000 example: $92,350 of net earnings,
$11,451.40 Social Security, $2,678.15 Medicare, $14,129.55 total, $7,064.78
deductible. A test also asserts the answer is **not** 15.3% of profit
($15,300), which is the specific error the spec is warning about, and that
the effective rate on profit is exactly 15.3% × 0.9235 = 14.13%.

**"Most DIY calculators skip the safe harbor."** The required annual payment
is the *lesser* of 90% of this year's liability and 100% of last year's —
110% when last year's AGI was above the threshold. That is the whole value of
the rule: last year's bill is a number you already know, so a good year does
not have to mean guessing. The room says which of the two is binding and why.

**One honest gap.** `socialSecurityWageBase` in
`data/se_tax_2026.json` is **unverified for 2026**. The rates and the 92.35%
adjustment are long-standing statute; the wage base is indexed annually. It
is flagged in the file, in the room's footer, and here. Everything below the
base is unaffected.

**The output that actually matters** is the equivalent contract rate: what
you would have to bill to be no worse off than a salary. On the example, a
$72,000 salary with $8,000 of benefits needs about $93,551 of contract income
— $8,551 more than the headline, which is the employer's half of FICA, the
benefits, and the tax you now remit yourself.

---

## D-024 — the Credit Card calc is a view, and Net Worth gets the rest of the assets
**2026-09-03 · SPEC.md §13, §9 item 5**

**Credit Card calc.** §13 asks whether it is "a specialized view or filtered
display of the general Debt Calculator". Filtered display, and now reachable:
a scope switch in the Debt Payoff room hands `Debt.creditCardsOnly(h)` to the
same `simulate()`. On the example household, planning all debts gives 7 years
9 months and cards only gives 4 years 7 months, from one engine.

The optional extra §13 mentions — rewards against the cost of carrying a
balance — is the most useful thing that view can say, because people believe
otherwise. $1,200/mo of spend at 2% earns $288 a year; a $3,200 balance at
22.9% compounding monthly costs $815. **Down $527 a year**, and the room names
the balance above which the rewards stop covering the interest ($1,131). The
rate is weighted by balance across cards, because carrying $3,000 at 22.9%
and $200 at 15% is not an average of 19%.

**Net Worth.** Until now there was nowhere to enter a house or a car — assets
were only the cash and investment figures Start Here asks for. The Net Worth
room owns the remaining categories (`real_estate`, `vehicle`, `other`) as
itemised records, and shows cash, investments and total debt as borrowed
chips linking to their owners. That keeps D-017's one-owner rule intact while
splitting assets by who asks for them: `Schema.INTAKE_ASSET_CATEGORIES` vs
`ITEMISED_ASSET_CATEGORIES` makes the split explicit rather than implied.

A negative net worth is shown plainly and in the critical colour, with the
line "that is a stage, not a verdict" and a ledger that reconciles item by
item — §6 requires it never be hidden, and hiding it would also be the wrong
thing to do to someone.

---

## D-025 — the Goal Costing Engine, and one bug it exposed
**2026-09-03 · SPEC.md §9 item 6, §13**

§9 item 6 puts this engine before Wedding, Dream or any other goal
calculator, and §13 explains why: the Wedding calc is "structurally identical
to Dream Calculator — one Goal Costing Engine both call into", and the Travel
calc is "the entry-level tier of the full Vacation/Travel Calculator engine,
not a separate codebase". So Wedding, Home deposit, A big trip, Sabbatical
and A car are **templates in one room**, not five rooms.

A goal is a dated target made of line items, funded monthly. Everything
follows: total, remaining, required monthly, and the arrival date at the
contribution you are actually making.

Three decisions worth recording:

- **Templates carry line-item labels and no amounts.** Costs are wildly
  regional and putting an invented "typical wedding venue: $8,000" in front
  of someone planning a real wedding is worse than useless. The value of a
  template is the reminder that the marriage licence, the survey fee and the
  travel insurance exist at all. A test asserts every template's items are
  bare strings.
- **The required figure is checked against Cash Flow's actual surplus**,
  rather than asking for a spare-money figure a second time. On the example
  household a wedding needs $881/mo, which is 53% of the $1,660 spare.
- **Goals are planned together as well as separately**, because two goals
  that each fit the surplus can easily fail to fit it together — and that is
  precisely what a per-goal view hides. Adding a $15,000 car to the wedding
  takes the requirement to $2,131/mo, which is $471 more than exists. A test
  pins that both fit alone.

**A real bug this surfaced.** Re-rendering a container's `innerHTML` from
inside a `blur`/`focusout` handler destroys the node the browser is still
transitioning away from, and throws `NotFoundError`. It hit whenever you
tabbed from one goal line item straight into the next. Three rooms shared the
pattern — Goals, Net Worth and Debt Payoff all replace a container holding the
focused input — and all three now coalesce renders onto the next task instead.
That also collapses a double render each of them was doing, since a write
triggered both an explicit `render()` and the spine's `onChange`.

---

## D-026 — the $30k–$90k rule, defined and built
**2026-09-03 · SPEC.md §13 · closes the open question in D-022**

Eli's definition, which is not what the name suggests:

> $100 a month is $1,200 a year of **spending**. Under the 4% rule your
> retirement pot has to be $1,200 / 0.04 = **$30,000** bigger to fund that
> forever — Eli's `100 × 12 × 25`. Invest the same $100 a month instead and
> it compounds to roughly **$90,000**.

The same hundred dollars counted from both ends: what the habit adds to the
mountain you have to climb, and what it would have become had it gone the
other way. That is a far better idea than the car-buying threshold I had
assumed it was, which is exactly why guessing would have produced something
useless.

**One half is exact, the other is not, and the room says so.** The $30,000
falls straight out of the withdrawal rate and is completely independent of
any return assumption. The $90,000 is horizon-dependent: it is about **26.3
years at 7%**, or 30 years at 5.5%. Asserting the round pair for everyone
would be wrong for almost everyone, so `recurringHabit()` computes both from
the household's own SWR, expected return and horizon — defaulting the horizon
to the years between the person's actual age and 65, and naming which basis
it used.

Verified: at 26.3 years the engine reproduces the canonical pairing exactly —
$30,000 and $90,580. For the example household (Robin, 32, so 33 years to 65)
the same $100/mo is $30,000 against **$154,406**, of which $114,806 is growth
rather than contributions. A $15/mo subscription is $4,500 and $13,587.

Tests pin the parts that must not move: the pot half is unchanged when the
return assumption changes, the invested half is not; a 3% withdrawal rate
raises the pot half and leaves the other alone; and both halves scale
linearly with the amount.

---

## D-027 — Roth vs Traditional on equal pre-tax cost, and the Solo 401k 20%
**2026-09-03 · SPEC.md §13 Tier 2**

**The comparison is done on equal PRE-TAX cost**, which is the only honest
way. Putting $7,000 into a Roth and $7,000 into a Traditional is not the same
decision — the Roth one costs more take-home. Given the same pre-tax dollars,
the whole question collapses to one line:

> Traditional beats Roth exactly when your rate in retirement is lower than
> your rate today. When the rates match they are mathematically identical.

The room says that out loud rather than burying it, because §13 asks for the
tax-rate assumption to be surfaced prominently and it is genuinely the entire
answer. A test pins the identity at equal rates, and pins that a zero
capital-gains rate makes the taxable account exactly equal to the Roth —
which proves the only difference being modelled is that tax.

**The Solo 401k employer share is 20%, not 25%.** The 25% figure applies to a
corporation contributing on W2 wages. A sole proprietor's base is net
earnings *after* the employer contribution itself, and 25/(1+0.25) resolves
to 20%. Getting this wrong overstates the contribution by a quarter, so the
rate lives in `data/irs_limits_2026.json` where it is stated rather than
buried, the room prints the correction next to the answer, and a test asserts
the result is specifically *not* 25% of profit.

On $100,000 of profit: SE tax $14,129.55, half of it deducted, employer base
$92,935.22, employer contribution $18,587.04, plus the $24,500 elective
deferral — $43,087 in total, or 43.1% of profit. Above roughly $250,000 the
annual-additions cap binds and the room says so.

**Capital gains is an input with a 15% default, not a bracket table.** The
0/15/20 thresholds are indexed annually and inventing 2026 ones would be
worse than asking.

---

## D-028 — The SWAN Number is stored, never derived, and never graded

**SPEC.md §13 Tier 1.5 asks for a "feeling-based liquid-savings benchmark…
stored as a standalone user-set target, separate from computed Emergency Fund
Coverage — display both side by side."** The whole value of the tool is in the
word *separate*, so the separation is enforced in three places rather than
just described:

- `household.swan` is its own block, written only through
  `Spine.setSwanTarget()`. No calculation writes it.
- `engines/swan.js` reads Emergency Fund Coverage from `engines/tier0.js`
  and passes the Result through untouched. It does not recompute it, and a
  test asserts the two are the same object's value and that they differ for
  the demo persona — a room that quietly made them agree would have lost the
  point.
- `shared/ownership.js` gives the field one owner, `sleep-at-night`. The
  Financial Snapshot shows it beside Emergency Fund Coverage as a read-only
  link, so there is no second place to type it.

**Two ways to name it, and switching does not convert.** A person can say "I
need $15,000" or "I need six months". Only the one they said is stored;
`basis` records which, and the other stays null. The mirror figure is derived
on read, so a months-based target moves when spending moves instead of going
stale, and an amount-based one is never silently re-expressed. Switching the
toggle deliberately clears the old figure: $15,000 and "6 months" are two
different sentences, and converting one into the other puts words in
someone's mouth.

**A months-based target with no expenses entered has no dollar value.** It
reports incomplete and says which input it wants — it does not fall back to
$0. Conversely a target of *zero* is an affirmative answer: `isSet` is true,
the comparison reports "already there", and only the coverage *ratio* refuses,
because dividing by a zero target is the one thing that genuinely cannot be
answered.

**Bands are context, not a verdict.** `data/liquidity_benchmarks.json` holds
the conventional 1/3/6/12-month milestones and the five bands around them.
The room prints which band a number falls in and what that band usually
means, and nothing anywhere tells a person their own number is wrong. The
"Zombie Apocalypse Theory of Savings" copy (§13 Tier 2, explicitly content
rather than code) is attached to the Emergency Fund Coverage output in the
Snapshot, where it belongs, pointing at this room.

**"What's left over each month" became one function.** The gap-closing
estimate needed a monthly surplus, and there were two candidates already in
the codebase: `CashFlow.netCashFlow()` (take-home minus every category
entered) and Tier 0's own `annualSavingsCents` (take-home minus the monthly
expenses figure). Rather than pick one and hardcode it, they are now behind
`CashFlow.monthlySurplusCents()`, which prefers the categorised basis, falls
back to Tier 0's, and always reports which it used — `basis: 'categorised'`
or `'monthlyTotal'`. The room prints the caveat when it is on the fallback,
because measuring against essential expenses only runs optimistic. Adding a
third caller does not mean a third definition.

**Room order.** Inserted at 6, after Net Worth and before FIRE: it needs cash
and expenses, both of which are answered by then, and it reads better as the
question you ask before the one about never working again. Everything from
FIRE down shifted by one.

**Compatibility note.** `household.swan` is new in schema version 2 and is
back-filled by `createSwanTarget()` for any household stored before this
existed, so a saved blob from an earlier session loads with
`{basis: null, targetCents: null, targetMonths: null, note: null, setAt: null}`
and every SWAN output reads "not named yet". Nothing else in the stored shape
changed, no existing room reads or writes differently, and a future room
wanting this number must call `Swan.targetCents()` rather than reaching for
`household.swan.targetCents` directly — the latter is null half the time by
design.

---

## D-029 — The Values audit has no score, and the mapping is the user's

**SPEC.md §13 Tier 2: "stated top-5 values vs. actual last-month spending.
The 'gap' output is inherently qualitative/visual — design as a comparison
view, not a scalar."** Taken literally. `engines/values.js` produces no
alignment percentage, no rank correlation, no grade, and a test asserts that
the result object carries no `score`, `alignment`, `grade`, `correlation` or
`rating` key. A single number here would be false precision stacked on a
self-report, and it would invite optimising the number rather than the life.
What comes back is two ordered lists — what you said, and what the money
said — plus the dollars behind each.

**One value per spending category, and the default mapping is a starting
point rather than a claim.** `data/values.json` maps each expense category
to at most one value, which is what makes the shares add up; a category
under two values would double-count the money. But whether groceries serve
Health or Home is a question about someone's life, not a fact, so the room
seeds every category from the default and stores whatever the person changes
it to. `assignmentFor()` reports which authority it used — `stated`,
`default`, `none` or `unmapped` — and the room prints that next to each row,
so a guess is never mistaken for an answer. A test asserts the default map
is disjoint and that every category in `expense_categories.json` is either
mapped or on the file's explicit `unmappedCategoryIds` list.

**"Unclaimed" means "serves nothing on YOUR list", not "unmapped".** The
first version counted only categories with no value at all, which made
Robin's audit report that every dollar was claimed while 72% of the month was
going to values she had not named. Money serving a real value that did not
make the top five is exactly what the tool exists to surface, so it counts as
unclaimed — and each row still says which value it serves, because the number
and the reason have to arrive together. Housing lands here for almost
everyone, and rarely because it does not matter; the room says so rather than
letting the reader supply their own accusation.

**A named value with nothing behind it still gets a row, at zero.** That is
the other half of the finding, and dropping it would have made the comparison
one-sided.

**Rank is position, not a stored number.** `valuesProfile.stated` is an
ordered array; the rank is the index. There is no way for a stored rank and
a stored order to disagree, and taking a value back closes the gap rather
than leaving a hole where number three was.

**Five is the cap, and the vocabulary is closed for now.** `statedValues()`
de-duplicates, drops unknown ids and stops at five, so a corrupted or
hand-edited blob cannot produce a six-item top five. Custom user-written
values are not supported yet: they would need their own category mapping to
mean anything here, and a text field with no mapping would produce a value
that always reads zero. Left out deliberately rather than half-built.

**Not in `shared/ownership.js`.** That map is for figures used by more than
one room. Nothing outside What Matters reads or writes `valuesProfile` yet,
so an entry would be premature — but it is written only through
`Spine.setStatedValues()` and `Spine.assignCategoryToValue()`, and the first
room that wants to read it should go through `engines/values.js` rather than
the stored shape.

**Room order.** Inserted at 12, after Where It Goes and before Goals: it
needs a categorised month from Cash Flow, and it reads well immediately
before the room about what you are saving for. Goals and the FOO Ladder
shifted by one.

**Compatibility note.** `household.valuesProfile` is new and is back-filled
by `createValuesProfile()` to `{stated: [], assignments: {}}` for any
household stored before it existed, so an older saved blob loads with the
room in its empty state and nothing else in the stored shape changed. No
existing room reads or writes differently. A future room wanting these
values must call `Values.statedValues()` and `Values.audit()` rather than
reading `household.valuesProfile.assignments` directly — the map is sparse
by design, and an absent key means "not looked at", which is not the same as
the stored `null` that means "serves nothing I named".

---

## D-030 — Savings Rate gets its own room, and a what-if that reuses the engines

**SPEC.md §12.1 is RESOLVED as "build both", and adds that every surface
must be explicit about which variant it shows.** The Snapshot already showed
both, but as two of nine cards. This room shows them at the same size, side
by side, each labelled in plain words — "your money only" and "including the
match" — and states in its own source comment that it leads with the
excluding-match figure because that is the conservative read and the one
`engines/foo.js` already uses for the benchmark flag. Nothing new is
computed: both variants come from the same `Tier0.savingsRate()` the
Snapshot calls.

**The what-if creates a household, not a formula.** "What is one more point
worth" needs a savings rate, a FIRE target and a projection at a *hypothetical*
spending level. Rather than write parameterised copies of three calculations,
`Schema.withMonthlyExpensesDeltaCents()` returns a deep copy of the household
with spending moved, and the existing `savingsRate()`, `fireNumber()` and
`yearsToFire()` run against it unchanged. A hypothetical is a different
input, not a different formula — SPEC.md §8 — and it is never written back,
per §12.2.

The delta lands on whichever figure `monthlyExpensesCents()` would actually
read: the tracked month if one has been categorised, the estimate otherwise.
Adjusting the wrong one would answer a different question from the one the
page is showing. Spending floors at zero, and a household with no expenses
entered does not acquire one from a delta.

**The double effect is the point of the section.** A point of savings rate
raises what goes in *and* lowers the target, because the FIRE number is built
from a year of spending. For Robin, ten points is $600 a month: the target
falls $180,000 and work-optional arrives five years sooner, both from the
same cut. That coupling is why a point of savings rate moves the date so
much further than a point of assumed return, and the room says so.

**Overspending is a result, not an error.** A negative savings rate renders
as a negative rate with the shortfall stated in dollars, the stacked bar
shows the spend without inventing a saved segment, and the projection reads
"never reaches the target" rather than a number. The what-if table still
renders — that is exactly the case where seeing what a cut does is worth
something.

**Room order.** Inserted at 6, after Net Worth: what you have, then how fast
it grows, then how much cash lets you sleep, then when you can stop.
Everything from Sleep At Night down shifted by one.

**Two things in §13's Savings Rate entry are deliberately NOT built.** Both
fail CLAUDE.md's five-question test, so they are questions rather than
guesses — see "Still open".

---

## D-031 — One rating control, and a Fulfillment Curve that splits on the median

**SPEC.md §13 Tier 1.5 names the shared piece before the tool that uses it:**
"the 1-10 rating mechanism is shared infrastructure with Category Tracker
Engine, Dating Cost Calculator, and Retroactive Worth calc — build one
reusable rating component, not four." `shared/rating.js` was built first, so
there is nothing to retrofit when the other three arrive. It owns the scale,
the storage shape (`household.ratings[scope][itemId]`), the end anchors per
scope, the control markup and the dot readout. A room that wants a rating
calls it; a room cannot quietly grow its own.

**No zero on the scale.** A 0-10 scale collapses "not rated" into "rated it
nothing", and those are different facts. Ratings are integers 1-10, an absent
key means not rated, and a rating of 1 survives every round trip as a 1. Where
ratings are averaged, unrated items are SKIPPED and the skip count comes back
with the answer — a test asserts that counting them as zero would give a
materially different number, so the skip cannot pass by coincidence.

**The Fulfillment Curve splits on the MEDIAN, not the mean.** The quadrants
need a "high spend" line. Robin's eight rated categories average $361.88 a
month but their median is $200, because one $1,500 housing line drags the
mean. On a mean split only two of eight categories could ever be high-spend
and two corners would sit empty; on the median split, half fall either side
by construction. The joy line is 5.5 — a property of the 1-10 scale, not a
judgement. Both thresholds come back with the result and the room prints
them, because a reading built on a hidden cut-off is not a reading.

**Savings and extra debt payments are excluded.** This tool asks what a
purchase gives you, and money you keep is not a purchase — rating your own
retirement contribution for joy is a category error, and including it would
drag the spend median right for nothing. Note that the Values audit
deliberately does the opposite and counts savings: "what does this serve" is
a different question from "what does this buy you", and saving serves
Security and Freedom for real. The two rooms disagreeing here is intentional,
and each says why.

**Four ratings before there is a picture.** Below that the median moves every
time one is added, so the room says how many are still needed rather than
drawing quadrants out of noise.

**Joy per $100, not per dollar, and no ratio for a free category.** Per
dollar the numbers are unreadable; per $100 a month they are comparable. A
category costing zero gets `null` rather than infinity, and drops out of the
ranking instead of topping it forever.

**No score.** Same reason as D-029: a single figure would be false precision
on top of a self-report, and a test asserts the result carries no
score-shaped key.

**Room order.** Inserted at 13, beside What Matters — the two rooms ask the
same question from different directions, one about stated values and one
about felt return. Goals and the FOO Ladder shifted by one.

**Compatibility note.** `household.ratings` is new, back-filled by
`Schema.createRatings()` to `{}` for any household stored before it existed,
and it discards anything that is not a finite number on the way in. Nothing
else in the stored shape changed and no existing room reads or writes
differently. A future room adding a rating picks a new scope name and calls
`Spine.setRating()`; it must not add a second store, and it must read through
`Rating.get()` — reaching into `household.ratings` directly would skip the
validation that keeps a 0 or an out-of-range value from ever being treated
as a rating.

---

## D-032 — Return on Hassle: the weighting is a convention, and it says so

**SPEC.md §13 Tier 1 asks for "dollars saved vs. time/effort" with a
"defaultable hassle-score-by-activity-type" table.** The table is
`data/hassle_defaults.json`: ten common money-saving chores with a typical
hour count and a starting 1-10 hassle score. Those numbers are plausible
starting points, not measurements, and the file says so in its own `source`
field rather than implying a study nobody ran.

**The hassle weight is invented, so it is stated rather than buried.** To let
a 1-10 feeling enter the arithmetic at all, something has to turn it into a
number of hours. The convention is linear: weight = 1 + (score − 1) / 9, so a
10-out-of-10 hour counts as two hours and a 1-out-of-10 hour counts as one.
There is no research behind that slope. It lives in the data file with a note
saying exactly that, the room prints the convention wherever it uses it, and
the **plain unweighted rate is always shown beside the adjusted one** so
nobody has to take the convention on trust. An unrated chore gets a weight of
1 — unrated means no adjustment, never an assumed penalty. A score outside
1-10 is treated as unrated rather than clamped.

**Both rate cards read on the same basis.** The first version showed the
per-occurrence rate beside the annualised adjusted rate, so a $30-a-month
saving off one afternoon's work read "$15/hr plain, $125/hr adjusted" — which
made the hassle adjustment look like it had *raised* the rate. Both cards now
use the annual basis whenever the saving repeats, and the per-occurrence
figure moved into the detail where it belongs.

**Whether the HOURS repeat is asked, not assumed.** Cancelling a subscription
is one hour against twelve months of saving; doing your own taxes is the
hours every single year. Those are wildly different propositions with
identical headline savings, and the answer changes the rate by a factor of
twelve. It is a question in the room and a flag on the engine.

**The real hourly wage is read, never recomputed.** `versusWage()` calls
`engines/hourly.js` — SPEC.md §8, and there is one real-hourly-wage
calculation in this codebase. The break-even figure is checked by feeding it
back in: at the break-even saving, the adjusted rate equals the wage.

**"Beats your wage" is not "do it".** An hour of a chore is not an hour you
could have sold, and most people cannot take on another paid hour at will.
The room says that where the verdict appears, because the arithmetic is
otherwise very easy to over-read.

**The chore on screen is not household data.** You are weighing a decision,
not recording a fact, so the saving, hours and repeat setting are local to
the page. The one thing that persists is the hassle SCORE of a named
activity, because how much you hate re-shopping insurance is a fact about
you — it is stored in the shared ratings store under the `hassle` scope. A
custom chore has no id to hang a score on, so its rating stays local, which
is the honest consequence rather than a bug.

**Room order.** Inserted at 10, straight after Real Hourly Wage, whose
output it consumes. Everything below shifted by one.

---

## D-033 — Side Hustle: marginal rate as an input, and SE tax that stacks

**SPEC.md §13 Tier 2 spells out the two things this tool gets wrong
everywhere else**, and both are handled explicitly rather than assumed.

**"Use marginal (not effective) tax rate, since side income stacks on primary
income."** The first dollar of side income is taxed at the rate on the *last*
dollar of salary. The app already knows an effective rate, and using it here
would understate the tax — so the effective rate is shown in the room as a
floor, labelled as the wrong number for this, and the marginal rate is asked
for. It is an **input, not a bracket lookup**: the same call as capital gains
in D-027, because inventing 2026 brackets would be worse than asking. A rate
outside 0-100% is refused rather than clamped.

**Self-employment tax now stacks, and that meant parameterising the existing
function rather than writing a second one.** `SelfEmployed.selfEmploymentTax()`
gained an optional `opts.priorWagesCents`: wages already earned elsewhere eat
into the Social Security wage base, and the additional Medicare threshold is
measured on combined earnings. Treating a side hustle as if it were someone's
only income overstates the tax for a high earner — on $200,000 of salary the
wage base is gone, so $10,000 of side profit owes no Social Security at all
and the SE tax falls from $1,413 to $351. Left out, the parameter is zero and
every existing caller behaves exactly as before, which a test asserts: the
W2-vs-1099 comparison weighs *alternatives*, not a stack, so zero is right
there.

**"Shares the Real Hourly Wage engine."** `versusJob()` calls
`engines/hourly.js`. There is one real-hourly-wage calculation in this
codebase and this is not a second one. It also reads the salary off the
household itself, so a caller cannot forget to stack it.

**A loss is a loss.** Revenue under costs reports a negative profit, no tax,
and a negative hourly rate — never floored at zero. What a business loss does
to the rest of a tax return is genuinely beyond what this repo can model, and
the room says so instead of guessing.

**Expenses left blank are not zero.** "It costs me nothing to run" is a claim,
and you make it by typing 0. Blank is incomplete, per the empty-≠-zero rule.

**The hours are additional, and the room shows the week.** The real hourly
wage already counts commute, prep and decompression, so the hustle's hours go
on top of a figure that is already bigger than the contract. For Robin, 16
hours a month on top of a 53-hour week makes it 57. That bar is the honest
part of the tool — the money question is easy to answer and easy to
over-read, and "it pays better than your job" is not the same as "do it".

**Room order.** Inserted at 13, after Going Self-Employed whose SE tax engine
it shares. Everything below shifted by one.

---

## D-034 — Never rebuild a form under the user's finger

**Reported from a phone: "when I type things don't enter or a keypad doesn't
pop up."** Not reproducible on a desktop browser, and the code looked
careful — every list even restored focus after re-rendering. Here is what was
actually happening, in order:

1. You tap the next field. The browser blurs the one you were in.
2. The blur handler writes the value, which notifies the spine.
3. The room re-renders, and the list is rebuilt with `innerHTML` — which
   destroys and recreates **every node in it**, including the node your tap
   was still resolving onto.
4. The room notices focus was lost and calls `.focus()` on the fresh
   replacement.

Step 4 is where it breaks. **A programmatic `.focus()` does not raise the
soft keyboard on Android or iOS** — only a real user gesture does. So the
keyboard closes, the caret is somewhere invisible, and the next thing typed
goes nowhere. On a desktop, step 4 works perfectly and the whole thing is
invisible, which is why it survived every check up to now.

**The fix is a rule, not a patch.** `shared/liveform.js` holds it:

> A container of live inputs is never re-rendered while the user is working
> inside it. Renders requested during that time are held and run once, after
> focus has genuinely left and no tap is in flight.

"Working inside it" is deliberately wider than "has focus". A tap on a phone
spans three events — `pointerdown` on the new control, `focusout` on the old
one, then the click that finally moves focus — and a rebuild anywhere in that
window eats the tap. So the form also stays busy while a pointer is held,
during IME composition, and for a 350ms settle after any sign of life in it.
That last one matters for `<select>`: a change can arrive with focus already
gone while the finger is still on the widget, which is a real failure the
first version of this guard missed and the browser test caught.

**Two safe patterns, and a room must visibly use one.** Either guard the
container and call `request()`, or build the controls once and only ever
write their `.value` — the pattern Cash Flow already used, which is why that
room never broke. A room taking the second route says so with the marker
`LIVE-FORM: built once`, so it is a decision rather than an accident.
`test/run.js` fails any room that builds form controls from markup and
declares neither, which is what stops this returning in a room nobody has
written yet.

**Rooms changed:** Debt Payoff, Net Worth, Goals, What Matters, Enough and
Worth the Hassle now guard their lists. Cash Flow declares the built-once
pattern. Start Here was already safe — its questions are static markup.

**A rebuild the user asked for is still immediate.** Adding a row, removing
one, loading the example: there the rebuild *is* the response to the
gesture, and the focus that follows is part of the same gesture, so the
keyboard opens properly. Those call `force()`.

**Values are now tidied in place on blur.** Formatting `3200` into `$3,200`
used to be a side effect of the rebuild. With the rebuild deferred, each
room formats the single node the user just left, which replaces nothing.

**`test/forms.js` is the regression test**, and it was checked against the
bug rather than assumed to work: with the guard neutered it fails on twelve
assertions and Playwright reports "element was detached from the DOM,
retrying" sixty-one times, which is the bug in the words of the driver. It
runs on a Pixel-shaped browser with touch, taps from field to field in every
room that takes input, and asserts the control the tap reached is still the
same DOM node. It skips cleanly without Playwright, like the alignment pass.

**What this cost:** roughly nothing. A list now redraws a beat after you stop
touching it rather than on every keystroke-blur — which also collapses what
used to be one full rebuild per edit into one per interaction.

---

## D-035 — Two codebases, one spec: what actually diverges

A parallel Vue 3 / TypeScript build of SPARKS is under way, and its artefacts
keep arriving here: `persistence/userDataStore.ts`, a scaffolding folder
(anonymous user id, validation, error boundary, SQLite schema, rate limiter,
logger, disclaimers), and a Master Variable Registry for Tiers 0-4.

None of it can land in this repo as code. This one is static HTML and vanilla
JS with no build step and zero dependencies — a `CLAUDE.md` non-negotiable —
and `shared/spine-v2.js` already owns persistence, so a second store for the
same numbers is what the ownership guardrail exists to prevent. `INTEROP.md`
holds the full reconciliation; the parts that changed code here are below.

**Money is where the two builds genuinely disagree.** `SPEC.md` §6 locks
integer cents. The TS build uses floating-point dollars and so does its
target schema (`gross_annual_income REAL`). Ten ten-cent deposits come to
`0.9999999999999999` in floats; a year of `balance × 1.0229 − 95` lands on
`2903.892578189377` instead of `$2,903.89`. That is a defect in either
framework, and `REAL` is the wrong column type for money in any database.
Rates already agree — both sides store decimal fractions — so this is the
only unit that needs settling.

**Their validation caught a real gap on this side.** It bounds a date of
birth: not in the future, not implying an age over 120. This repo had neither,
and the second was the dangerous one. `ageFromDob('1875-01-01')` returned
**151**, and the percentile table and the retirement milestone table both
accepted it and answered confidently. A mistyped year produced a wrong answer
rather than no answer.

Fixed, and the fix is shaped by this repo's own contract rather than copied:

- `Schema.ageFromDob()` now returns null above `MAX_PLAUSIBLE_AGE` (120), so
  no lookup table can ever be handed an impossible age. Above that, a date is
  far likelier to be a mistyped year than a supercentenarian, and every
  age-keyed table stops long before there anyway.
- `Schema.checkDob()` returns a Result, not a boolean, because "not answered"
  and "answered with something impossible" are different states. A future
  date used to come back as null from `ageFromDob()` and every age-based
  output went blank with no reason — indistinguishable from an unanswered
  question. Now it says which.
- Start Here shows the reason under the date field, on the field's own change
  rather than on navigation, because the point is to catch it before it is
  committed. Text only; it rebuilds no control, per D-034.

**Their migration module has the bug its own header warns against.**
`migrateIfNeeded()` says "never silently read old-shaped data as if it matches
the new interface", then `break`s on a missing migration and returns
`payload as T` — old shape, cast to the new interface, with a `console.warn`
nobody will see. This repo had the same class of bug and worse (D-034's
sibling, fixed in `a9062af`: it destroyed data outright). The pattern that
fixes it is in `shared/spine-v2.js`.

**Three things in their registry are better than what is here**, and only one
was worth acting on now. `fulfillment_rating` is specified "per expense
category, timestamped"; `ratings.joy[categoryId]` stores the number without a
timestamp, which is enough for the Fulfillment Curve but not for the Category
Tracker's trend charts. Deliberately not changed: bumping the schema version
to support an unbuilt feature is churn. When the Tracker is built the shape
becomes `{value, at}` and `MIGRATIONS[3]` back-fills `at: null` — "rated, but
we do not know when", which is honest rather than a fabricated date.

**Two questions for the owner**, recorded rather than guessed:
"derive `age` server-side, never client-side" (there is no server here — is
that a real requirement or inherited from the Vue build's backend?), and
whether `financial_confidence_score` and the Tier 4 Satisfaction calc are one
tool, as the registry itself suggests.

---

## D-036 — Confidence as a field, and the Snapshot bug that hid behind a notice

The parallel build's `external-data/index.ts` returns a plausible number from
every placeholder — percentile 50 for everyone, one tax rate for every
income, a fabricated safety score, `priorWages * 0.02` for an unemployment
benefit (about $1,200 a week on a $60,000 salary, roughly double the highest
state cap). See `INTEROP.md` §9. A believable wrong answer is worse than a
missing one, and it is exactly what the Result contract exists to stop.

Checking that criticism against this repo found the honest version of the
same weakness. Our tables *are* candid about what their numbers are worth —
but only in prose, in a `source` or `note` field, and the rooms surfaced it
unevenly: Where It Goes said the annual-additions figure was unverified, most
rooms said nothing at all, and nothing enforced any of it.

**So provenance is a field now.** Every table in `data/` carries
`confidence` — `sourced`, `convention` or `unverified` — plus a
`confidenceNote` saying why. `test/run.js` fails a table without one. An
untagged table reads as `unverified` rather than trustworthy by default.
`Reference.provenance()` sorts weakest-first so a room leads with the figure
a reader should trust least, and Where It Goes and the Financial Snapshot
generate their provenance line from the tables instead of a hand-written
sentence that goes stale the moment a table is refreshed.

Two of fourteen tables are `unverified`: the effective-tax bands and the 2026
IRS limits. Both were already flagged in `DECISIONS.md` as needing a
primary-source pass; now the app says so on the page.

**And wiring that in surfaced a live bug that had been shipping.** The
Financial Snapshot never loaded `engines/projection.js`, which
`engines/tier0.js` needs for FIRE progress. `computeAll()` threw on every
render, the room's own `.catch()` turned it into "couldn't load the reference
tables — serve this over HTTP", and the page showed em dashes for all nine
outputs. Ten rooms had the same missing script tag; nine worked by luck
because they never call the function that needs it.

I had walked past it. The page sweep reported `financial-snapshot` clean with
`emdashes=15`, and I read that as copy and moved on — a swallowed error is
not a console error, and the em-dash count was the tell. After the fix the
same page reports 6.

Two guards, because the fix alone would not stop the next one:

- `test/run.js` now walks the dependency graph the modules already declare —
  each names its browser globals as `root.SLAF && root.SLAF.X` — and fails
  any room that loads a module without loading what that module needs. It
  caught all ten rooms immediately.
- `test/forms.js` and the page sweep now fail a page whose `#load-notice` is
  visible, so a room that catches its own boot error and renders a friendly
  message can no longer pass as clean.

---

## D-037 — This repo is the build. The Vue/TS effort stops.

Two codebases were being built against one spec: this one (static HTML,
vanilla JS, no build step) and a Vue 3 / TypeScript project that had grown a
persistence module, a scaffolding folder, a variable registry and a data
layer. The owner settled it with a criterion rather than a preference:
**whatever is simplest for someone they show the code to, so that person can
make adjustments** — and don't duplicate effort.

On that criterion this repo wins outright, and not narrowly. There is nothing
to install, nothing to compile, nothing generated. Someone handed this repo
opens a file and edits it, and `node test/run.js` tells them whether they
broke anything. The Vue build needs Node, a package manager, a lockfile, a
bundler and a framework understood before the first edit — and every one of
those is a thing that can rot between being shown the code and opening it.

So `INTEROP.md` is retired and folded in here. A standing "these two must
stay in sync" document describes a situation that is ending, and keeping it
would be the duplicated effort the decision exists to stop. It is in the git
history if the detail is ever wanted. What mattered from it:

**Already acted on, before the decision.** The float-vs-cents divergence is
moot now (this repo was always integer cents). The date-of-birth bounds their
validation suggested are built and tested (D-035). The provenance criticism
their placeholder data layer prompted is built as a `confidence` field on
every table (D-036), and chasing it found the Financial Snapshot shipping
broken.

**Worth salvaging before that repo is archived** — all framework-independent
content, none of it code:

- `SECURITY.md`'s pre-production checklist
- `content/disclaimers.ts` — with its own honest note that the wording has
  not been through legal review
- the *rules* in `tier0Validation.ts`, not the implementation
- the Master Variable Registry, as the counterpart to `shared/schema.js`'s
  field dictionary — the `Cents` suffix and the transaction-shaped expense
  entry are the two places to reconcile it, per `ROADMAP.md`

**Two of its design instincts are better than the average of that file** and
are worth carrying into anything built here. `getJobLossRiskMultiplier` was
deliberately a pass-through, with a comment arguing *against* an automated
"risk by state or identity" dataset and taking the number from the person
instead — that generalises: where data is contested, sensitive or cannot be
maintained honestly, ask rather than fabricate. And its migration module's
header rule — never silently read old-shaped data as if it matches the new
interface — was right, even though the function under it did exactly that.
Checking that rule against this repo is what found the silent data wipe.

**What changes here as a result:** the README leads with how to change
things, not with an architecture tour, and the root now carries five
documents rather than six. Nothing about the code changed — it already met
the criterion. That is the point.

---

## D-038 — The front page is plain JavaScript now

The FOO ladder was the site's front page and the only React in the repo: 629
lines of JSX compiled by babel into 1,142 lines of `foo-ladder.js`, plus 224K
of vendored React. Under D-037's criterion — whatever is simplest for someone
shown this code to change — it was the single worst thing in the repo. Every
other page is edit-and-refresh. The first thing anyone sees was the one thing
that needed Node, npm and a toolchain before a single word could be changed.

It is now hand-written vanilla JavaScript, and React is gone from `vendor/`.

**The architecture is two functions, and the split between them is the whole
design.** `build()` runs once and creates every node. `paint()` runs on every
change and only ever writes text, values, classes and hidden flags onto nodes
`build()` already made. `paint()` never creates or destroys an input — which
is not a style preference but D-034's rule: replacing an input's DOM node
mid-tap closes the soft keyboard on a phone and it does not come back. React's
reconciliation was quietly protecting the old version from that; a naive port
using `innerHTML` would have reintroduced it. The file carries the
`LIVE-FORM: built once` marker and the front page is now covered by
`test/forms.js`, which taps through it on a mobile browser.

**`h()` is twelve lines and does the work JSX was doing.** It takes a tag, a
props object and children, so `build()` reads almost exactly like the JSX it
replaced — same shape, same nesting — with no compile step. That was the point
of the port: not to avoid React, but to avoid the toolchain between a person
and the file.

**Verified by comparison, not by assertion.** The React page was captured
first — full-page screenshots and visible text at three states (demo loaded,
example numbers, a step opened). The port produces **byte-identical visible
text** in all three, and the screenshots match. The simulation, the
allocation waterfall and all nine step definitions were carried over line for
line; the only behavioural difference is one bug fixed on the way.

**That bug: `hidden` did not hide.** A bare `[hidden]` is `display: none` in
the user-agent sheet, which loses to any class that sets `display` — and
`.slaf-field` is flex, `.slaf-btn` is flex. The HSA field and the family-plan
toggle stayed on screen with the plan switched off. Every one of the
seventeen rooms had independently worked around this with its own copy of
`[hidden] { display: none !important; }` in its `<style>` block; the front
page never had one, so the bug was invisible until something at the root
needed to hide a field. The rule now lives in `shared/theme.css` once, the
seventeen copies are gone, and a test fails any page that redeclares it.

**Two test rules were only scanning `rooms/`.** The front page lives at the
root and loads its scripts without a `../` prefix, so it escaped both the
script-tag dependency check and the live-form declaration check — the two
guards added in D-036 and D-034. Both now cover it.

**What went away:** `foo-ladder.jsx`, `vendor/react.production.min.js`,
`vendor/react-dom.production.min.js`, `vendor/react.LICENSE`, the babel
regeneration step in the README, and the asterisk on "no build step".
`vendor/` is now fonts and nothing else, 224K lighter.

---

## D-039 — One credential-ROI engine, one room, two presets

**SPEC.md §13 Tier 2 names Career ROI and the Skills Calculator as sharing
one engine** — "could share one 'credential ROI' engine with different preset
data per pathway" — and separately marks the Skills calc as "shares ROI math
with Career ROI calc, narrower scope". `engines/credential.js` is that engine.
A four-year degree and a weekend course are the same arithmetic at different
magnitudes: a cost, some time you are not earning, a raise afterwards, and a
number of years it pays over.

**Two presets, one room, not two rooms.** The presets differ in wording and
in the default horizon — twenty-five years for a career move, five for a
skill — and in nothing else. The arithmetic never branches on which is
selected. Two rooms would have been the same page twice with different
labels, which is the duplication §8 exists to stop.

**Three things this gets right that a back-of-envelope version misses:**

- **The time is the bigger half, usually.** Six months out at $5,000 a month
  is $30,000 on top of a $40,000 fee. Months out with no stated cost of time
  is *refused*, not read as free — you say it costs nothing by typing 0, per
  the empty-≠-zero rule.
- **The raise is taxed.** An $18,000 raise at a 22% marginal rate is $14,040.
  The rate is an input rather than a bracket lookup, the same call as D-027.
- **Money later is worth less.** The spec says to discount the future income
  delta to present value, so it is discounted — year by year in a loop rather
  than by the annuity formula, so a zero discount rate needs no special case
  and the working is inspectable. A test re-derives the present value with an
  independent loop.

**When the answer is "no", it says what would change it.** The useful output
for a bad move is not "not worth it" but the raise at which it *would* break
even — the number to test against the market before deciding. A test feeds
that figure back in and asserts the present value lands on the price.

**What it deliberately does not model,** stated on the page rather than
buried: a raise you would have got anyway, a qualification that opens a door
money cannot price, and the chance the raise simply does not arrive. Those
are real and this is arithmetic.

---

## D-040 — Before and after are one record, not two

SPEC.md §13 lists **Prospective Worth** and **Retroactive Worth** as separate
Tier 1 tools, with the note that they are "designed as a before/after pair"
and that "Prospective's prediction should be storable and later compared
against Retroactive's actual outcome if wired together with a shared ID".

**Decision: one room, one engine, and one stored record with two ratings on
it** — `household.worthChecks[]`, each carrying `predictedRating` and
`actualRating`. Not two records joined by a shared id.

A shared id you have to maintain is a shared id that drifts. Two records
means two rooms, two lists to keep in step, and a join that silently fails
the first time somebody renames a thing in one place and not the other — and
a failed join here does not error, it just quietly stops finding the
prediction, which is the entire point of the pair. One record cannot come
apart. `costPerPoint(check, which)` is the same function pointed at either
rating, which is §8's one-formula-one-function applied to the tense.

**Either rating may be absent, and both absences are real states.** A thing
predicted and not yet lived is `stage: 'awaiting'`; a thing rated in
hindsight that nobody predicted is `stage: 'rated'` with no prediction. The
reading falls back from actual to predicted and says which basis it used, so
a room never has to guess what number it is showing.

**The spine owns the two timestamps.** `predictedAt` and `ratedAt` are
stamped by `Spine.upsertWorthCheck()`, once, when the rating first appears,
and anything a caller sends for those fields is discarded. A room that could
write `predictedAt` could claim it predicted something last year, which is
exactly the claim the pair exists to substantiate. Revising a rating is a
change of mind, not a new prediction, so the date does not move. A test in
`test/run.js` tries to back-date one and asserts it cannot.

**The Regret calculator (Tier 4) is not a separate tool.** It is these
records filtered to `actualRating <= 3` — `Worth.regrets()`. Deliberately 3
and not 5: the Tier 4 idea is things you wish you had not bought, not things
that were only fine. A regret with no price recorded still counts as a
regret but does not join the total, and the result carries `complete: false`
so the room can say the figure is a floor rather than printing a total that
quietly leaves things out.

**Calibration is the output the pair produces that no single purchase can.**
The mean signed gap across every before-and-after, with a ±1 band around
"about right" because one point on a ten-point self-report is inside the
noise of the instrument. Under three pairs it refuses and says how many more
are needed — the direction of your error across two purchases is one bad
week, not a habit. There is still no score: `SPEC.md` §12.4's Financial
Health Score weighting stays `[PENDING]` and nothing here averages ratings
into a purchase-quality index.

**Nothing here is a lookup, and there is no `data/` table for it.** Every
number on the page is either yours or arithmetic on yours. What a thing
"should" be worth is not reference data and inventing a benchmark for it
would be exactly the fabrication D-036 exists to prevent.

### Compatibility note

`household.worthChecks` is **new**, added at the current schema version.
`Schema.createHousehold()` fills it from `f.worthChecks || []`, so a stored
household written before this change loads with an empty list and needs no
migration — the field is additive and nothing reads it but the Worth It
room and `engines/worth.js`.

A future room calling `getProfile()` should know:

- Each entry is `{ id, label, costCents, hoursSpent, predictedRating,
  predictedAt, actualRating, ratedAt }`. Money is integer cents;
  `hoursSpent` is a plain number of hours; both ratings are integers 1–10 or
  `null`, never 0 (see `shared/rating.js`).
- Write through `Spine.upsertWorthCheck()` / `Spine.removeWorthCheck()`,
  never by assigning to the array. The upsert merges a partial patch by
  `id`, so a room can write one field without reading the rest.
- `predictedAt` / `ratedAt` are read-only from a room's point of view.
  Sending them is not an error; they are simply dropped.

### One more thing the shared rating control learned

`Rating.controlHtml()` gained an optional `slot`, emitted as
`data-rating-slot` and returned by `readTarget()`. It exists for the one
case in the app where a single item carries two ratings. Without it the pair
would have had to fake two item ids and split them apart again with string
surgery, which is how the "one rating component, not four" rule (§13, Tier
1.5) gets quietly broken. Controls that do not pass a `slot` emit no
attribute and read back `null`, so nothing else changed.

---

## D-041 — The Windfall answers a different question than it was asked

`SPEC.md` §13 lists **Lump Sum vs. DCA** in Tier 1 and, unusually, tells you
why it is hard: "showing the 'usually loses but reduces regret risk' nuance
properly needs a Monte Carlo simulation, not a single deterministic
projection."

That is right, and it rules out the obvious build. A single projection at a
7% expected return has exactly one answer — invest it all now — and it has
to, because money in the market for longer at a positive assumed rate ends
up ahead. The "comparison" would be a restatement of the assumption with a
verdict stapled to it, and the verdict would be about the one thing the
person is not asking: the average case. What they want to know is what
happens if they are unlucky, and a point estimate cannot say.

A Monte Carlo could. A Monte Carlo needs a mean, a volatility, and a
defensible source for both. This repo does not have them, and D-036 is the
rule about not inventing that kind of number.

**Decision: invert the question.** Instead of asserting an outcome, solve
for the threshold — *how far would the market have to fall, over the months
you spread it in, for spreading to have been the better call?* Deterministic,
needs no distribution, and strictly more informative than a point estimate:
it names the exact scenario in which the cautious choice wins and leaves the
odds of that scenario to the person, who is allowed to have a view.

### The identity that fell out of it

The break-even return **is the cash rate**, exactly.

Money waiting to be invested is not idle; it is earning whatever the account
it is waiting in pays. So spreading a lump sum is a blend of the market and
a savings account, and a blend beats the pure thing exactly when the thing
it is blended with does better. Not usually, not on average — exactly. Over
six months at 4% cash, "the market does worse than 2.0% in total" is the
whole condition.

Most calculators of this kind miss it because they model the un-invested
money as earning nothing, which quietly rigs every row in favour of the lump
sum. This one asks for the cash rate on the page, and says why it matters
more than it looks.

**The engine solves for the threshold by bisection rather than returning the
cash rate.** The identity holds for *this* timing convention — buy at the
start of each month, everything else in cash. Change the convention and it
may not. A solver keeps telling the truth; an asserted identity would
quietly stop. `test/run.js` checks that the solver and the identity agree
across five window/rate combinations, and that is what makes the sentence
safe to print in the room.

### What the room shows instead of a verdict

- **The threshold**, as the headline.
- **The price of the caution** at the assumed return — the gap in dollars,
  as a share of the money, and per month of the window — framed as the cost
  of insurance, not as a reason.
- **Five "suppose it did this" rows**, labelled on the page as carrying no
  odds. They exist for the shape: spreading loses a little in every good
  year and saves a lot in the bad ones.
- **Average exposure**, `(N+1)/2N`, which is the entire mechanism. Over six
  months, 42% of the money is out of the market on average. That is why the
  lines separate, and it is one line of arithmetic rather than a mystery.

### Two modelling choices worth knowing

**The slice is a fixed share of the original.** You transfer $X a month, not
"a sixth of whatever the account holds now" — so the interest the waiting
cash earns stays put and goes in with the final purchase, which sweeps the
account. That is what a standing order actually does. A test re-derives the
whole path in closed form against it.

**Nothing here is written to the household.** A windfall you are thinking
about is not a fact about your finances, and storing it would make every
other room believe you have the money. Every input on the page is local, the
same preview pattern the FIRE room uses (`SPEC.md` §12.2). The page says so
in its own disclaimer.

---

## D-042 — One runway, three exits, and the two numbers it will not invent

`SPEC.md` §13 Tier 2 lists three tools that are the same arithmetic:

- **Leave-Job calc** — "runway/risk of quitting: severance, COBRA,
  unemployment eligibility, emergency fund drawdown timeline. **Shares math
  with Unemployment calc and Emergency Fund Coverage.**"
- **Unemployment calc** — "benefit amount/duration by state; runway until
  benefits deplete."
- **Start-Business calc** — "runway/breakeven for launching a business.
  Needs a revenue-ramp curve (linear vs. hockey-stick) as a togglable
  model."

One pile of money, an outflow every month, some inflow for a while, and the
month it reaches zero. The spec says they share math; §8 forbids writing it
three times. So: `engines/runway.js`, three presets, one room — the same
shape as the credential engine (D-039).

### The two numbers it refuses to make up

**The unemployment benefit.** Set per state, by formula, from your own
earnings history, with a weekly cap. §10 already flags a 50-state table as a
maintenance dependency, and D-036 is the rule about not inventing that class
of number. So the benefit is a plain input and the room says, in the field's
own hint, that your state sets it and you should look yours up.

**What health cover costs once the employer stops paying.** Employer- and
plan-specific. Same treatment.

Refusing those is not a hole in the tool. A runway built on a benefit figure
the app guessed at is *worse* than one where you had to go and find the real
number, because you would trust it.

### The modelling choices, stated rather than buried

- **Whole months.** A runway of "3.4 months" is not a thing you can spend, so
  the answer is the number of months you finish above zero. A small cut can
  therefore be real without buying a month — a test asserts exactly that,
  and asserts the balance at the same point is higher, so the granularity is
  documented rather than looking like a bug.
- **No interest on the cushion.** Over the months a runway covers it is
  small, and leaving it out errs short. For a safety calculation that is the
  right direction to be wrong in. Said on the page, not just here.
- **The ramp is a shape you pick, not a forecast.** Linear is `m / months`;
  "slow then steep" is that fraction cubed — a third of the way through the
  ramp you are at 4% of target, not 33%. The cube is chosen because it is
  the plainest curve that is flat early and steep late, and the room says it
  is a choice. Nothing here knows what anyone's revenue will do.
- **Severance is not gated by preset.** Money you start with is money you
  start with, whether it is a redundancy payment or savings you set aside to
  launch something. The benefit and the ramp *are* gated, and a figure typed
  into the wrong scenario is ignored rather than silently applied — there
  are tests for both directions.
- **The lasting gap** is the outflow once every temporary inflow has ended.
  It is the number the room tells you to attack, because the total cushion
  is a consequence of it. A benefit that runs out must not flatter it.

### What would buy you more months

Two levers — a bigger cushion, or a deeper monthly cut — each solved by
searching rather than by formula, because the month-by-month path has a
benefit cliff and a ramp in it and no closed form survives either. Both
searches are monotone, so a bisection over cents is exact and cheap. The
tests verify the answers by *reaching* for them: adding exactly that much
must get there, and one cent less must not.

Cutting has a ceiling, and the ceiling is not always the budget: an
uncuttable cost — health cover you now pay for yourself — is a floor under
the burn that no amount of trimming gets below. When cutting cannot reach
the target, the room says so instead of printing a cut nobody could live on.
That is why the two levers are reported separately rather than as one
verdict.

### Nothing is written to the household

A job you might leave is not a fact about your finances. Cash and monthly
expenses arrive prefilled from the household and can be typed over here as a
preview only — the same pattern as the FIRE room's assumption preview
(`SPEC.md` §12.2) — and the ownership chips at the bottom still point at
Start Here and Cash Flow as the places those numbers actually live.

### Test-suite note

The `[hidden]` redeclaration check (D-036) was matching any occurrence of
the string, including a room *comment* explaining that it toggles the
attribute. It now scans only the page's own `<style>` blocks, for a
`[hidden] … {` rule. Documentation is not a second declaration.

---

## D-043 — The Financial Health Score, and why the weighting is on the page

`SPEC.md` §12.4 was the last `[PENDING]` decision in the spec: *Financial
Health Score weighting — tunable by age cohort, or one fixed formula for
v1?* §9 puts the score last because it aggregates everything, and CLAUDE.md
says to stop and ask rather than guess when a §12 decision is still pending
and you have reached the tool that needs it. Asked, and answered:

**Decision: tunable by age cohort.** §12.4 is now marked RESOLVED in the
spec.

### The shape

Six pillars — cushion, debt load, saving, retirement, housing, how it's held
— each a small group of ratios that `engines/ratios.js` already computes.
Five cohorts, by decade, each with its own weights over those six pillars.
All of it — pillars, cohorts, weights, score bands, the cap, the coverage
floor — lives in `data/health_score.json`. Retuning a decade or adding a
cohort is an edit to that file and **no code change**, which is the same
configuration-data pattern `SPEC.md` prescribes for budget templates and
FIRE variants, and the thing that makes this adjustable by whoever is shown
the code.

Nothing is re-derived. `engines/ratios.js` already owns the one mapping from
"a ratio and its benchmark band" to a 0-1 position — 1.0 at the good
threshold, 0.5 at the warn threshold. The score is a weighted mean of those.
No second scale, no second set of thresholds, no ratio computed twice (§8).

### Three rules that keep a composite honest

**A pillar with nothing computable is ABSENT, not zero.** Someone who has
not entered a mortgage does not have a failing housing score; they have no
housing score. Its weight is redistributed across the pillars that do have
data. Scoring silence as failure is the composite version of the `|| 0` this
repo forbids everywhere else, and it is the single most common way a health
score lies. There is a constructed test: two identical households, one with
no housing at all, and the absent pillar must not drag the score down.

**Over-performance is capped at 1.0.** `Ratios.position()` runs to 1.25 so
that The Dashboard's radar can show being well clear of a threshold — that
is worth *seeing*. It is not worth extra credit: letting a twenty-month
emergency fund score 1.25 would let a cushion buy off a debt problem, and a
score you can game by over-doing one easy thing is not measuring health. A
test asserts the radar rewards it and the score clamps it.

**Below half the total weight, the score is refused.** A number built from a
third of the picture reads exactly like a number built from all of it. That
is the entire danger of scores, and a floor is cheaper than a caveat nobody
reads.

And a fourth, which follows from the decision itself: **no date of birth, no
score.** The resolved answer was to weight *by age*; without an age there is
no weighting to apply, so the room refuses and links to Start Here rather
than quietly falling back to some middle cohort.

### The weights are the most invented numbers in this repository

They are a considered opinion about emphasis by decade — debt and the saving
habit carry the under-30s because that is what compounds; retirement is
barely weighted before 30 because the retirement-multiple benchmarks start
around 1× salary *at* 30 and scoring a 24-year-old against them would mark
them down for being 24; retirement dominates the 50s because there is less
time left to fix it than anything else here. Two sensible people would write
them differently. `data/health_score.json` carries `confidence: "convention"`
and a `confidenceNote` saying exactly that, per D-036.

So the room does something a score page usually will not: **it shows the
same household scored under every cohort.** For the demo persona the
identical finances score 85 under the under-30 weights and 60 under the 60+
weights — a 25-point spread that is entirely the weighting and not the
person. Printing that gap is the price of asking anyone to take the number
seriously. The page also lists every ratio behind every pillar with its own
0-100, names which pillars had nothing to measure, and shows the "points
still on the table" per pillar (weight × distance from benchmark), which is
the only genuinely actionable thing a composite produces.

A test asserts the cohorts actually disagree. If the weighting ever stops
changing the answer, the whole age-cohort decision has become decorative and
that should fail loudly.

### Table invariants, enforced

`test/run.js` checks that every cohort's weights sum to 1, that they name
exactly the pillars that exist and nothing else, that every ratio a pillar
names is a real ratio in the registry, that every age from 0 to
`MAX_PLAUSIBLE_AGE` falls in exactly one cohort (no gap, no overlap), and
that each cohort explains itself. Those are the failure modes of a
config-driven score, and none of them would show up as a crash.

---

## D-044 — Finishing the Tier 20 panel, including the parts that stay blank

`ROADMAP.md` Tier 20 lays out a seven-panel "pilot's dashboard": Altitude,
Fuel, Engine Load, Thrust, Navigation, Weather and Flight Plan. Five were
built with The Dashboard (D-038's sibling commit); two were not.

**Flight Plan** is now complete. It had the FOO ladder half — where you are
on the nine steps — but not the goals half that Tier 20 asks for: "goal
funding ratio, time-to-goal … progress bars per goal". Those are now bars
under the ladder, one per goal, showing what is saved against what it costs
and what `engines/goals.js` already works out about the date. A goal that
arrives after the date you set turns its bar red, because a goal quietly
slipping is precisely the failure this panel exists to catch. No new
arithmetic: every figure comes from `Goals.plan()` and `Goals.goalTotalCents()`.

**Weather** is built for the one risk of the four that this app can actually
see, and says so about the other three.

Tier 20 asks Weather for sequence-of-returns risk, longevity risk, the
underinsurance gap and concentration risk. Concentration is computable from
ratios already in the registry — real-estate concentration, liquid to
illiquid, investment to net worth, cash drag — so that is what the panel
shows. The other three are not:

- **Sequence-of-returns risk** needs a return distribution to simulate
  against. Same wall as the Monte Carlo in D-041.
- **Longevity risk** needs mortality tables.
- **The underinsurance gap** needs your actual life cover, which nothing in
  this app asks for. `engines/ratios.js` has said so since it was written:
  `lifeInsuranceMultiple` is one of only two ratios returned by
  `unavailable()`, with that exact reason attached.

Each would be "a made-up number wearing a gauge", and the panel says that
sentence on the page. Drawing four gauges where three are invented is worse
than drawing one, because the frame lends the invented ones the same
authority as the real one. Naming the gap is the feature.

**And a stale claim removed.** The Dashboard's radar carried a note saying
the Financial Health Score's weighting "is still an open question in the
spec". It was true when it was written and stopped being true with D-043.
It now explains why the radar deliberately does not add its spokes together
and links to The Score, which does — and which shows its weighting. A
comment that describes the repo's own state is a comment that can rot; this
one did, within a few commits.

---

## D-045 — Credit utilisation, and the trap it usually falls into

`engines/ratios.js` shipped with exactly two ratios returned by
`unavailable()` — a status that means "this app deliberately cannot compute
this, and here is what it would need". Credit utilisation was one:

> This needs your total credit limit, which nothing here asks for yet.

That was the right call at the time and the wrong permanent state: the limit
is one number a person knows, it unlocks a ratio that appears on the radar,
in the Engine Load panel and in the debt pillar of The Score, and the
alternative — guessing a limit — would produce a number people act on.

**Decision: ask for it, on the debt that has one.** `debt.creditLimitCents`,
owned by the Debt Payoff room, shown only on `type: 'credit_card'` rows.
A mortgage has no limit for its balance to be a share of, so the field does
not appear there at all.

### The trap, and how this avoids it

The obvious implementation sums every card balance and divides by every
known limit. It is wrong, and it is wrong in the direction that alarms
people: a card whose balance you entered but whose limit you did not adds to
the numerator while contributing nothing to the denominator, and the ratio
comes out too high.

So **only cards with a known limit count, on both sides of the division**,
and the result carries `cardsCounted` and `cardsWithoutLimit` so a room can
say what was left out. A test constructs exactly that case — a $2,000
balance on a card with a $10,000 limit beside an $8,000 balance on a card
with no limit — and asserts the answer is 20%, not 100%.

Two smaller rules fall out of the same reasoning. A limit of **zero** is not
a limit; it is treated as absent rather than as a division by zero. And a
`creditLimitCents` typed onto a non-revolving debt never enters the sum,
because the field is only meaningful on revolving debt.

### The band

`data/ratio_benchmarks.json` gains `creditUtilization` at `good: 0.10`,
`warn: 0.30`, direction lower — the 30% ceiling and the 10% "excellent"
figure the credit bureaus repeat. The file already cited both in its own
`source` note before the ratio could compute; the band's own note says
plainly that these are conventions about how scoring models are *believed*
to behave, not published thresholds. Table version bumped to 1.1.
`data/health_score.json` is at 1.1 too, with credit utilisation added to the
debt pillar.

### Compatibility note

**What changed in the stored shape.** `Schema.createDebt()` now returns a
`creditLimitCents` key. It defaults to `null` and `null` means *not
entered* — never "no limit" and never "a limit of zero".

**No migration, and none is needed.** A household stored before this change
has debts without the key; `createDebt()` fills it with `null` on read,
which is the same state as a card whose limit you have not typed. The ratio
stays `unavailable()` exactly as it did before, with the same reason. The
schema version is unchanged, so nothing is quarantined and nothing is
rewritten. A test loads a debt built without the field, round-trips it
through JSON, and asserts the ratio is still unavailable rather than reading
as zero.

**Rooms updated to match.** Debt Payoff (`rooms/debt-payoff.html`) renders
and writes the field — through the existing `writeField()` path, which
already sends any unknown `*Cents` key through `Money.parseMoney`, so no new
write path was introduced. Every other room reads the ratio through
`engines/ratios.js` and needed no change: Every Ratio, The Dashboard and The
Score all picked it up on the next render.

**What a future room needs to know before calling `getProfile()`.**
`debt.creditLimitCents` is `raw` class, integer cents, and meaningful only
when `debt.type === 'credit_card'`. Do not sum it across all debts. Do not
read `null` as unlimited. If you need utilisation, call the ratio rather
than dividing yourself — `Ratios.byId('creditUtilization')` already handles
the mixed-limits case above, and a second implementation would get it wrong
the way the first draft of this one nearly did.

---

## D-046 — A saved answer is not a blank box with something in it

A person reported that Start Here "resets everything I enter". It did not —
nothing was ever lost from storage. What happened was worse in a way,
because it was invisible: landing on a question that already had an answer
ran `first.focus(); first.select()`, so the saved figure was **selected**,
and the next keystroke replaced all of it.

On a desktop, select-on-focus is a helpful convention: you can see the blue
highlight and retype over it deliberately. On a phone the keyboard opens
over the field, the highlight is behind it, and the first digit you press
silently eats `$70,000`. The screenshot that came with the report showed
exactly that — the value highlighted, one tap from gone.

**Three changes, and the third is the one that matters.**

1. **Never `select()` a saved answer.** The caret goes where the browser
   puts it, which is where the finger landed. Typing now appends or inserts,
   the way every other text field on the device behaves.
2. **Do not focus an answered question at all.** An empty question still
   takes focus, because there the keyboard appearing is the helpful thing.
   An answered one does not — arriving at a question you have already done
   should not open a keyboard over it.
3. **Stop swapping the value between a display string and an edit string.**
   The box keeps `$72,000` the whole time; `Money.parseMoney()` already
   strips the `$` and the commas on the way back out. Every other room in
   this repo swaps formatted-to-raw on focus and back on blur, and every one
   of those swaps is a moment where the caret has to be repositioned by
   hand. Removing the swap removes the entire class of bug rather than
   fixing one instance of it.

A saved answer now also *looks* saved — muted, with a line reading "Saved.
Tap the box to change it — typing won't wipe it." — which is what the person
asked for when they said it should be greyed out with a little warning.

### The fix's own bug, caught before it shipped

The first version toggled that hint with `[hidden]`. Showing it on blur made
the card 24px taller, which moved the **Next** button down — at the exact
moment a blur fires, which is the moment a tap on Next begins. Touch-start
hit the button, touch-end landed 24px above it, and the tap did nothing.

That is D-034's rule again in a new costume: *nothing under the user's
finger may move.* The hint now reserves its space permanently and toggles
`visibility`, so the layout is identical whether it shows or not. A measured
assertion in the repro caught it — the button's `y` before and after a blur
must be the same number.

### All of them on one page, once they are all answered

The review step used to be a read-only echo of the answers with an "edit"
button that threw you back into the one-at-a-time flow. It now shows **every
question card at once, as the real controls**.

The important part is what it does *not* do: it does not build a second set
of inputs. The question cards already exist in the DOM and are hidden with
`display: none`; showing them all is a class toggle. So there is exactly one
input per field on the page, `paint()` and `commit()` are the same functions
the one-at-a-time flow uses, and there is no second write path to drift.
Editing saves on blur, because there is no Next button to commit against.

The per-field "Saved" hint is suppressed in that view — nine copies of one
sentence is noise, and the page says it once at the bottom instead.

### Test-suite notes

`test/forms.js` gained the case that reproduces the report: land on an
answered question, type one digit, and assert the saved figure is still in
the box. Reverting the fix makes it fail, which is the only evidence that a
regression test is worth having.

The `[hidden]` redeclaration check (D-036, narrowed in D-042) was matching
the word inside a CSS *comment* explaining this very bug. It now strips
`/* … */` before scanning. Twice now that check has flagged prose; both
times the prose was correct and the check was too broad.

---

## D-047 — Ask how people are actually paid, and let a year have two jobs in it

Start Here's first question asked for gross income "per year". Almost nobody
knows that figure to the dollar. They know *"$26 an hour"*, or *"about two
grand a fortnight"* — and the arithmetic between the two is exactly the work
this app exists to do. Worse, it is the arithmetic people get wrong.

`shared/schema.js` has carried `incomeSource.frequency` since the model was
written, commented *"stored annual; converted at the edge"*. Nothing ever
did the converting. `engines/income.js` is that edge.

### Six ways to be paid, and one of them is a trap

`annual`, `monthly`, `semimonthly`, `fortnightly`, `weekly`, `hourly`.

**Twice a month and every two weeks are separate rows on purpose.** Twice a
month is 24 payslips; every two weeks is 26. The same figure on the payslip
is 8% apart over a year, and conflating them is the single most common error
in this conversion. A test asserts the two differ and that the gap is
exactly two payslips.

**Hourly is the only basis that cannot be exact**, because it needs hours a
week and weeks a year. It refuses without hours rather than assuming 40, and
the weeks figure comes from the *same* work profile `engines/hourly.js`
reads — two rooms disagreeing about how many weeks a person is paid for
would be worse than either being wrong. The result carries
`assumesWeeks: true` and the room prints the assumption rather than hiding
it.

### A year can have two jobs in it, and then there are two right answers

Five months at $60,000 and seven at $80,000 is **$71,667 earned** — and also
**$80,000 a year on your current job**. Both are true, and they are for
different questions:

- **Earned** is right for savings rate and debt-to-income. It is the money
  that actually passed through your hands.
- **The run rate** is right for projecting forward.

A calculator that quietly picks one is answering a question it was not
asked. The engine computes both, the room shows both **only when they
differ**, and `household.incomeBasis` records the choice. Earned is the
default, because the Tier 0 outputs are about what happened.

**Months are never corrected in either direction.** Two jobs at once total
more than twelve months — a real life, and clamping it would delete income
the person had. A gap totals fewer — also real. Both are detected and
reported (`overlapping`, `hasGap`, `gapMonths`); neither is fixed.

### Why no other room changed

`grossAnnualIncomeCents` remains THE annual figure, on every source. With
several jobs, each source stores **its own contribution** under the chosen
basis, and `Schema.grossAnnualIncomeCents()` sums across sources exactly as
it always has. Verified end to end: two jobs, and the schema's total comes
back 7,166,667 with nothing else touched.

### Compatibility note

**What changed in the stored shape.** `Schema.createIncomeSource()` now
returns four more keys: `rateCents`, `hoursPerWeek`, `monthsWorked`,
`ongoing`. `Schema.createHousehold()` returns `incomeBasis`.

**No migration, and none is needed.** A source stored before this has no
`rateCents`; `annualise()` falls back to the `grossAnnualIncomeCents`
already there and returns `fromStoredAnnual: true`, so an old household
reports precisely the figure it always did. `monthsWorked: null` reads as
the whole year. `ongoing` defaults to true. `incomeBasis` defaults to
`'earned'`. The schema version is unchanged; nothing is quarantined or
rewritten. Tests load a legacy source and assert all of that.

**Rooms updated.** Only Start Here, which owns the field. Every other room
reads `grossAnnualIncomeCents` and needed no change.

**What a future room needs to know before calling `getProfile()`.**

- `grossAnnualIncomeCents` is still the number to read. Do not read
  `rateCents` and re-derive a year — call `Income.annualise()` or
  `Income.summarise()`, which handle the 24-vs-26 trap and the hourly
  assumption.
- With several sources, each holds a *contribution*, not a salary. Summing
  them is correct; reading one and calling it "their income" is not.
- `monthsWorked` may make the sources total more or fewer than twelve
  months. Do not assume twelve.
- `incomeBasis` says which question the stored annual figures answer. If you
  are projecting forward and it says `'earned'`, the run rate from
  `Income.summarise()` is the figure you actually want.

### Room note

Start Here is now a **guarded** room, not a built-once one. The nine fixed
questions never change shape, but the job list is variable-length and
genuinely has to be rebuilt, so it goes through `SLAF.LiveForm.guard()`.
`test/run.js` refuses to let a room claim both patterns, which caught the
stale declaration immediately.

---

## D-048 — Not earning is an answer

The income question had two states: a number, or silence. Real life has a
third, and it is common — *nothing is coming in right now*. Typing `0` got
close but was easy to mistake for a skip, and skipping was met with "add
your income" forever after.

**Decision: "not earning right now" is a pay basis**, alongside hourly,
weekly and the rest (`frequency: 'none'`). That falls out of D-047's model
rather than bolting a flag onto it: it annualises to a deliberate zero, the
amount box disappears because there is no figure to state, and everything
downstream reads a real `0` instead of a `null`.

### The distinction has to survive all the way to the copy

`null` and `0` are already kept apart in the model — that is the oldest rule
in this repo. The failure mode is subtler: both end up as an em dash on
screen, and the *reason* beside the dash is where the distinction leaks.
Telling someone who answered "nothing" to "add your income" is the
empty-vs-zero rule breaking at the last inch.

So a zero income now says so, in every ratio that divides by it:

- savings rate, debt-to-income, retirement multiple — already had a
  zero-specific reason
- **net-worth-to-income did not**, and said "add the missing inputs" to
  someone who had supplied them. Fixed.

A test asserts, for each of those four, that the zero reason mentions zero,
that the missing reason asks for the input, and **that the two are not the
same string**. That last assertion is the one that catches this class of bug
coming back.

### Run rate: zero is not "unknown"

D-047 reported the run rate as `null` when no job was ongoing. That is wrong
in a way that matters: someone whose last job ended in August is not a
household whose current income *cannot be determined* — it is zero, and that
is the single most important fact about their year. `runRateCents` is now
`0` in that case, with `earningNothingNow` to say it out loud, and the room
offers The Runway, which is the tool that actually answers their question.

### Real Hourly Wage does not apply, and says so

With no earnings there is no rate to divide. Worse, work costs divided by
hours would produce a *negative* "real hourly wage" that reads like a
finding when it is really an absence. The engine now refuses on a zero
income with a reason that does not ask for income already given, and the
room links to The Runway instead.

Two more results there are arithmetically right and easy to misread, so both
are flagged rather than left for the reader to notice:

- **`costsMoreThanItPays`** — once tax and the costs of working come out, a
  job can leave you worse off per hour. A bare minus sign looks like a bug;
  it is a finding.
- **`implausibleHours`** — one paid hour a week makes any salary look like a
  fortune per hour. The arithmetic is correct and the number is useless, so
  the room says which.

### The sweep that should have existed from the start

A household with nothing in it, or zeroes everywhere, or debts larger than
everything owned, is run through every engine and the whole result tree is
walked for `NaN` and `Infinity`. Five such households, six engines each.

They all passed on the first run — `Money.safeDivide` has been doing its job
since Tier 0 — but "it passes" and "it is checked" are different states, and
only one of them survives the next change.

---

## D-049 — One pot of money, two thresholds — not two inputs

Reported from the live site: *"this is messing with the FOO. I put this
because it's how much cash I have on hand and then it's showing this."*
$2,000 was typed into Start Here's cash question, and the FOO ladder showed
**Cash on hand: empty** beside **Emergency fund: $2,000**.

Both labels described the same real money. The ladder had:

- a page-local **"Cash on hand"** input, feeding step 1 (cover your
  deductible), and
- a borrowed **"Emergency fund"** row reading `cashSavings` from Start Here,
  feeding step 4 (three to six months of expenses).

So one balance appeared twice under two names, one of which had to be typed
again, and the two could disagree — $500 "cash on hand" beside a $2,000
"emergency fund" is incoherent, because the emergency fund *is* cash.

**Decision: there is one balance, and it is tested against two targets.**
Step 1 and step 4 both read `cashSavings` from Start Here. The duplicate
input is gone.

That is also what the Financial Order of Operations actually says. Step 1 is
not a separate pile of money — it is the first, much lower bar the same
savings have to clear before the 3–6 month bar comes into view. The copy now
says so on both cards rather than leaving the reader to work out why their
savings are being measured twice.

### Why this was safe to collapse

The simulation keeps `cash` and `ef` as separate accumulators, so the
obvious worry is double-counting the same $2,000. It does not happen:
`allocate()` tops each up toward *its own* target independently and never
sums the two. Starting both from the same real balance is therefore two
threshold tests on one pot — which is the truth — and no money is invented.

Verified end to end on a $2,000 household: step 1 reads "$1,000 short of
your highest deductible, out of $2,000 in cash & savings", step 4 reads
"0.6 of 3 months", and the panel shows a single "Cash & savings · $2,000 ·
Start Here →" row.

### The general lesson, which is worth more than the fix

Two controls for one quantity is not a labelling problem that better wording
solves. It is a model problem: whichever one the user edits, the other is
now wrong, and no copy can rescue that. D-017's one-owner rule already says
a field is editable in exactly one room — this was the same rule broken
*within* a room, between a borrowed value and a local one.

`test/forms.js` now asserts the front page has exactly **one** field whose
label mentions cash, so a second one cannot quietly reappear.

---

## D-050 — What is finished, and where to go and finish it

Every room was already honest about a missing input: an em dash and a reason
beside it. What none of them could do was answer the question a person
actually has — *what do I still have to fill in, and where is it?*

That question was answerable all along, because two things already existed
and had never been put together:

- `shared/ownership.js` knows, for every shared number, which room **owns**
  it, which **section** to land on, and how to read it. That is a deep link
  to an exact question.
- `shared/registry.js` knows every room and the order to walk them.

**Decision: each room declares what it needs, and everything else is
derived.** `needs: ['grossAnnualIncome', 'monthlyExpenses', …]` in the
registry entry; `shared/progress.js` turns that into completeness, a missing
list, and navigation. `test/run.js` checks every id is a real ownership
field, that none is listed twice, and that every room declares the array at
all — so a new room cannot quietly opt out.

### Three decisions inside it that are easy to get wrong

**Count distinct fields, not room-by-room mentions.** Fourteen rooms need
your monthly expenses. That is *one* thing to do. A bar counting it fourteen
times would lurch for reasons unrelated to any effort you made. The overall
figure is over distinct fields; a test asserts the two numbers differ and
that the smaller one is used.

**A room that reads nothing shared is not "incomplete".** Quick Math and The
Windfall work entirely from what you type into them. They are `standalone`,
not behind, and the strip says "this room stands on its own" rather than
implying a chore.

**Name what one answer unlocks.** The map does not say "9 things left"; it
says *"the one that opens the most is Monthly expenses, in Cash Flow — 14
rooms are waiting on it."* Nine outstanding items is a chore. One answer
that opens fourteen rooms is a reason.

### The strip, and why it is one component

Every room and the FOO ladder render the same footer: what is still needed
(each item a link straight to the question that sets it), then **← previous
room** and **next unfinished →**. It is one function in
`shared/progress.js`, not twenty-five copies, so the wording, the ordering
and the link-building cannot drift.

It repaints on every household change and holds no inputs of its own, so it
sits outside the live-form rule (D-034) entirely — there is nothing under a
finger to destroy.

Two shapes had to be handled rather than assumed. Rooms live in `rooms/` and
their links climb out with `../`; the FOO ladder is at the root and must
not. Rooms use `<main>`; the FOO ladder builds into `#root > .wrap`. Both
are covered, and a test asserts a link from the front page carries no `../`.

### The bug this feature had, caught by the page sweep

The first version reached for the UMD wrapper's `root` from inside the
factory, which does not close over it — every room threw *"root is not
defined"* on load. The sweep caught it immediately because a page error is
exactly what it looks for. The mount now resolves the global the way the
wrapper itself does.

### What this deliberately is not

No score, no percentage-complete badge on a room card, no streak. The pills
say "has everything it needs", "3 to fill in", or "works on its own" —
states, not grades. Skipping remains free everywhere, and a blank stays a
blank: nothing here nags, and nothing counts an unanswered question as a
failure. That is the same position `SPEC.md` takes on the Financial Health
Score and the Fulfillment Curve.

---

## D-051 — Four rooms matter. The other twenty-one were pretending to.

A UX audit, prompted by "it feels a tad overwhelming and some of it feels
like it is extra compared to the main point of getting all the info down".
The complaint was right, and the evidence was worse than the feeling.

### What the audit measured

**127 local inputs across the app. Eleven stored fields.** Roughly nine out
of ten things a person types are read once, used for one figure on one
screen, and thrown away — they never join the household, never prefill
anything, never come back.

Some of that is deliberate and correct: a what-if is not a fact, which is
why The Windfall and The Runway keep nothing (D-041, D-042). But much of it
is not a scenario at all. **Facts about you are asked repeatedly and
discarded**: your 401(k) contribution percentage and your Roth and HSA
balances are asked by both Where It Goes and the FOO ladder; your marginal
rate by both Worth Learning and Side Hustle; your insurance deductible by
the FOO ladder alone. Four separate places ask you for something they could
have remembered.

**And all twenty-five rooms were presented as one numbered path.** Gathering,
reading and speculating were interleaved by accident of build order: Debt
Payoff at 2, the Snapshot that pays it off at 4, Goals at 20, The Score at
25. Nothing on the map distinguished "you must answer this" from "this
reads itself" from "this is a toy". A person cannot tell what is required
from what is optional, and the safe assumption — that all of it is required
— is exactly the overwhelm reported.

### The fix, and the mistake inside the first attempt

Each room now declares a `kind`, and the map groups by it:

- **core** (4) — Start Here, Cash Flow, Debt Payoff, Net Worth. Everything
  else is built from these.
- **read** (7) — no input at all; they fill themselves in as the four get
  answered.
- **about-you** (7) — optional self-reports: a target, a rating, a goal.
  What you *want*, not what you have.
- **explore** (7) — what-ifs. Never required, and nothing typed is kept.

The first pass put eleven rooms in one bucket labelled *"these are the ones
that matter"* — including four rating exercises. That is the same failure in
new clothes: **if everything matters, nothing does.** The split into `core`
and `about-you` is the actual fix, and `test/run.js` now fails if the core
grows past four rooms, so the on-ramp cannot quietly become a wall again.

Two more structural rules are enforced rather than trusted: a **read** room
must need at least one field (a reading that reads nothing is showing you
nothing), and an **explore** room must own no field anybody waits on
(optional by definition cannot also be a gate).

### The copy had to be corrected twice, which is the useful part

The reading group's pill first said *"7 still to fill in"* — directly under a
blurb saying *"nothing to fill in"*. Counting a reading room's unmet needs
against the reader asks them for something that is not theirs to give; the
answer lives in a gathering room. It now says "0 of 7 ready".

And the What-if blurb first promised *"each one opens with your real numbers
already in it"*. That is the right design and it is **not built yet**, so
shipping the sentence would have been a lie on the front page. It now
describes what is true today. The prepopulation it described is the next
piece of work, not a claim.

### What this deliberately did not do

No room was deleted, hidden behind a gate, or locked. Everything is still
one tap from the map. The change is entirely one of *stated intent* — the
suite is the same size, it just stops implying that all of it is homework.

---

## D-052 — Facts get answered once. What-ifs get thrown away.

The audit behind D-051 found the app asks for **127 things and keeps 11**.
Some of that discarding is correct — a what-if is not a fact, which is why
The Windfall and The Runway keep nothing (D-041, D-042). The rest was just
forgetting, and in four cases it was forgetting the *same* answer twice.

**Decision: a value is either a fact about you or a hypothesis, and the two
get opposite treatment.** Facts are stored once, owned by one room, and read
everywhere. Hypotheses stay local and are never written.

### The five that moved

| Fact | Was asked in | Now owned by |
|---|---|---|
| Workplace contribution % | FOO ladder **and** Where It Goes | Where It Goes |
| Roth contributed so far | FOO ladder **and** Where It Goes | Where It Goes |
| HSA so far, HDHP, family cover | FOO ladder | Where It Goes |
| Marginal tax rate | Worth Learning **and** Side Hustle | Where It Goes |
| Highest deductible | FOO ladder | Sleep At Night |

The deductible goes to **Sleep At Night** rather than to the ladder that
uses it, because that room's whole subject is what a cushion has to cover,
and an insurance excess is the first thing it covers. The FOO ladder's step
1 now reads it, the way it already read cash, age and the employer match.

The FOO ladder lost four local inputs and two toggles. It had been asking
for all of them and forgetting every one on reload.

### The marginal rate has no default, deliberately

It would be easy to derive one from `data/effective_tax_rates_2026.json`.
It would also be wrong: an effective rate and a marginal rate are different
quantities, and the gap between them is exactly what the rooms using it are
trying to reason about. So `ASSUMPTION_DEFAULTS.marginalRate` is `null` —
asked once, never invented (D-036). Both rooms that need it prefill from the
stored answer, write back when you change it, and say where it came from.

### The bug in the first version of that prefill

Setting `node.value` was not enough. Both rooms repaint their inputs from a
local `v` state on every render, so the prefill was erased milliseconds
later. The fix seeds the room's **state**, not the DOM — which is the same
lesson as D-046 from the other direction: in a room that repaints from
state, the state is the only thing that is real.

### Compatibility note

**What changed in the stored shape.** `household.retirement`
(`contributionPercent`, `rothContributedCents`, `hsaContributedCents`,
`onHdhp`, `hsaFamilyPlan`) and `household.insurance`
(`highestDeductibleCents`) are new branches. `assumptions.marginalRate` is a
new Assumption-class field defaulting to `null`.

**No migration.** `createHousehold()` fills both branches from
`f.retirement || {}` and `f.insurance || {}`, so a household stored before
this loads with every field `null` — which is "not answered", exactly what
it was. Nothing is quarantined, the schema version is unchanged, and a test
round-trips a legacy blob to prove it.

**Every field is null-when-unanswered, never zero.** Contributing 0% and not
having said are different, and a test asserts a stored `0` survives as `0`.

**Rooms updated.** Where It Goes gained the setup card and became
`kind: 'about-you'` — it holds facts other rooms wait on, and D-051's rule
is that an `explore` room owns nothing. Sleep At Night gained the
deductible. The FOO ladder, Worth Learning and Side Hustle now read instead
of asking.

**What a future room needs to know.** Read these through
`Ownership.describe()` like any other shared number — that gives you the
value, whether it is set, and a link to the question. Do not read
`retirement.contributionPercent` and treat `null` as zero.

---

## D-053 — A 0% card is a card with a deadline

Reported from the live site with a screenshot: a card at **0%** with $910 on
it and a $40 minimum. The payoff plan treated that 0% as permanent, which
made it the cheapest-looking debt on the page and therefore the last one the
avalanche would ever touch.

It is the opposite. A promotional rate that expires while a balance survives
it is the most expensive thing on the page, and the app was silently
recommending you ignore it.

**Decision: a debt carries `promoEndsOn` and `postPromoRate`,** and `rate`
means *the rate you are paying today*. The simulation asks each debt what it
charges **in that month** rather than assuming today's rate forever.

### What the room now says

For that exact card, at $40 a month:

> 5 months left. At $40/mo you will still owe **$710** when the rate jumps to
> **24.99%** — clearing it in time takes **$182/mo**.

That last figure is the only number that matters about a 0% card and no
payoff table shows it. At 0% it is exact — balance over months left. Above
0% it is the level payment, from `engines/projection.js`, because a promo is
not always zero.

### Three states, none of them guessed

- **No end date** — no promo. Today's rate is the rate, as before.
- **An end date but no go-to rate** — the promo is real but unmodellable
  past its end. The engine keeps using the stated rate and the room says
  plainly that it is planning as though 0% lasts forever until you supply
  the rate it reverts to. Inventing a go-to rate would invent the number
  that decides the answer (D-036).
- **Already expired** — the go-to rate applies from month one, and the room
  says so rather than showing a stale 0%.

### The bug that made the first version useless

`prepare()` normalises each debt into a fresh object for the simulation, and
it dropped the two new fields. Everything looked right — `promoStatus` and
`clearBeforePromoEnds` both worked, the room displayed correctly — while the
actual payoff plan still charged 0% for sixty months.

The test that caught it is the one worth keeping: simulate the same card
**with** and **without** a promo, and assert the promo version accrues real
interest while a genuinely permanent 0% accrues none. Testing the display
would have passed.

### One date formula, not two

`monthsUntil` existed in `engines/goals.js` for a goal's target date. A
promo end date needs precisely the same sum, so it moved to
`shared/schema.js` and Goals now delegates to it, keeping its own wording
for the missing-date case. Two copies of calendar arithmetic is exactly how
two rooms come to disagree about what month it is (§8).

### Compatibility note

**What changed.** `Schema.createDebt()` returns two more keys,
`promoEndsOn` (ISO date or null) and `postPromoRate` (decimal or null).

**No migration.** Both default to `null`, and `null` `promoEndsOn` means "not
promotional", which is what every stored debt already was. `promoStatus()`
returns `null` for such a debt and the simulation behaves exactly as before
— a test asserts a debt with no promo charges its stated rate in every
month.

**What a future room needs to know.** Do not read `debt.rate` and call it
the cost of that debt. It is the rate *today*. Use `Debt.rateInMonth(debt,
month)` inside any simulation, and `Debt.promoStatus(debt)` to decide
whether there is a deadline worth showing.

---

## D-054 — A back and a next in every room, at the top

D-050 gave every room a footer strip with "← previous" and "next unfinished
→". It was the right content in the wrong place: at the foot of a page you
have to scroll past a radar chart and four cards to reach. Moving on cost a
scroll, so in practice you went back to the map every time — which is not a
path, it is a hub with spokes.

**Decision: the lone "← All rooms" link at the top of every room becomes a
three-way nav** — previous room, the map, next room. Every room already had
that one link in the same shape, so this needed no per-room markup: the
mount finds `.room-back` (or the ladder's `.back`) and replaces it.

### Two navs, on purpose, doing different jobs

The top nav is **plain path order**. The bottom strip keeps the smart
**"next unfinished"**. That looks like duplication and is not: a control
that sits in the same place but leads somewhere different every time you
glance at it is not something you can navigate by. Predictable movement
belongs at the top, where it is always in reach; guidance belongs at the
bottom, next to the reasons for it.

### Neither end is a dead end

The first room has no previous and the last has no next, so both resolve to
the map rather than wrapping to the far end of the path — wrapping would
send someone from The Score to Start Here with an arrow implying they are
adjacent. At those ends the middle link is dropped, since it would offer the
same destination twice.

`test/run.js` walks every room in the registry and asserts each one has both
a prev and a next href, that the map appears exactly once, and that room
links climb out with `../` while the front page's do not.

### Also noted

**Dungeons & Dividends is a separate project** sharing this repository, being
built in parallel. Its PR merged into `main` mid-session. Merging it rather
than force-pushing over it was correct and is now written down, so a future
session does not "clean up" work it did not recognise.

---

## Still open

- **The last `unavailable()` ratio: life insurance needs multiple.** Credit
  utilisation was closed by D-045 the obvious way — ask for the one number
  and count carefully. Life cover looks like the same job and is not, for
  two reasons worth writing down before someone "fixes" it:

  1. **There is no room that owns it.** Cover is not an asset, not a debt,
    not a cash cushion and not a goal. Bolting `person.lifeCoverCents` onto
    Sleep At Night or Net Worth would put an editable field in a room whose
    own spec (§11) does not cover it, which is how the one-owner rule
    (D-017) starts to rot. It wants a Protection room, and `SPEC.md` §13
    puts the only protection tool it names — Whole Life Insurance — in
    Tier 2 blocked on policy illustration data.
  2. **The convention is conditional in a way the band system is not.**
    "Ten times income" assumes somebody depends on that income. For a
    single person with no dependents the right cover is often zero, and a
    ratio that marked them underinsured would be a confident wrong verdict
    — the exact failure this repo spends most of its effort avoiding.
    Bands in `data/ratio_benchmarks.json` are static per ratio; expressing
    "only if someone depends on you" needs something the band shape does
    not have.

  So it stays `unavailable()` with its reason, The Dashboard's Weather panel
  names it as one of three blanks (D-044), and this is the note saying that
  is a decision rather than an oversight.

- **A seventh pillar for The Score.** If life cover ever does get an owner,
  protection would deserve a pillar — and adding one means re-deciding all
  five cohorts' weights, since each set sums to 1. That is a question for
  whoever owns the spec, not a change to make quietly while adding a field.


- ~~**Two-Income Household Toggle** and **Soft Saving Balance
  Calculator**~~ — both raised as open questions with D-030 (who owns a
  second earner's income; which three buckets). **Dropped at the owner's
  direction: not relevant.** Neither is built and neither is a blocker.
  The Savings Rate room stands as it is. If either comes back, the
  questions above are still the ones to answer first.
- ~~**SPEC.md §12.4 — Financial Health Score weighting**~~ — **RESOLVED:
  tunable by age cohort.** Built, and the weights live in
  `data/health_score.json` so a decade can be retuned without touching code.
  See D-043. This was the last `[PENDING]` decision in the spec; §12 now has
  none.
- **Two of the three Tranche 1 rooms** (`money-calendar`,
  `student-loan-decision`) do not exist in this repo. `real-hourly-wage` was
  built and is live; this entry said otherwise until the §13 sweep caught
  it. Whether to build the other two, and to what spec, is open. See D-001.
- **`student-loan-decision`** appears in §0, §1 and §5.1 as shipped, but in
  no part of the §13 tool specification. If it is to be rebuilt it needs a
  spec.
- **Reference-table refresh** — see D-009 for what each table's numbers are
  actually worth today. The effective-tax-rate bands and the SCF percentile
  breakpoints are the two that most need a primary-source pass before any
  output is shown to a real user.
- **`foo-ladder` writes nothing back to the household** — see D-010. It needs
  the Cash Flow and Goal Costing engines before its step inputs have a home
  in the schema.
- ~~Whether `index.html` should be the Map or the FOO calculator~~ —
  resolved: the calculator keeps the root, the Map is `map.html`. See D-007.

---

## D-055 — "Are you working?" is asked first, and it removes questions

Start Here asked everybody the same nine questions, and two of them were
*"does your employer match retirement contributions?"* and *"are you
contributing enough to get all of it?"*.

If you are self-employed, retired, or between jobs, neither question has a
true answer. Leaving them blank was the only honest thing to do, and blank
was punished: `shared/progress.js` counts a room's `needs` and reports what
is unfilled, so the room said **"1 thing left"** forever, the map's
completion pill never turned green, and the FOO ladder's step 2 sat at
*"add your income, contribution % and match cap %"* for someone with no
employer to ask.

That is the app telling a person they are incomplete for a fact about their
life.

**Decision: ask about the working situation first, and let the answer take
questions off the list.**

### The field

`person.employmentStatus` — one of five ids, or `null`:

| id | label | earning | hasEmployer |
|---|---|---|---|
| `employed` | Working for an employer | yes | yes |
| `selfEmployed` | Self-employed or freelance | yes | **no** |
| `both` | Both — a job and my own work | yes | yes |
| `notWorking` | Not working right now | no | no |
| `retired` | Retired | no | no |

The table lives in `shared/schema.js` as `EMPLOYMENT_STATUSES`, and it is
the only place these labels exist — `shared/ownership.js` and
`rooms/start.html` both read it rather than restating it.

`hasEmployer: false` means exactly one thing: **the employer-match pair is
not applicable.** It does not mean "no retirement plan" — a self-employed
person has a solo 401(k) with no match, and a retiree may be drawing from
one. `engines/accounts.js` is untouched by this.

### Why this is not derivable from the income sources

It looks like it should be. It is not:

- **No rate entered** means the income question was skipped.
- **`frequency: 'none'`** (D-048) means "I am not earning" — a deliberate
  zero, and a fact about *pay*, not about whether there is an employer.
- Neither says whether a **company exists that could match you**, which is
  the only thing the two match questions depend on.

A freelancer earning $80k and an employee earning $80k are indistinguishable
in the income sources and want different questions. So this is stored, not
inferred.

### Not applicable is not missing

`Ownership.describe()` gained two fields:

    applies              — false when the field has stopped being a question
    notApplicableBecause — the sentence to show instead

A field with no `applies()` always applies, so nothing else in the map
changed. `Progress.forRoom()` drops a non-applying field from **both** sides
of the fraction — it leaves the denominator, not just the numerator, which
is the whole point: a retiree can now reach 100% on Start Here. The dropped
fields come back as `row.notApplicable`, and the footer strip says them out
loud ("Not asked: Employer match. You said there is no employer."), because
a room claiming it "has everything it needs" while two visible boxes sit
empty would read as a bug.

The FOO ladder does the same thing one level down: a step can now declare
`na`, and step 2 reads *"No employer to match you — this step is already
behind you"* rather than asking forever.

### Two deliberate refusals to guess

- **Unanswered counts as "could have a match."** Every household saved
  before this field existed has `employmentStatus: null`, and quietly
  deciding they have no employer would hide a question they may already have
  answered. `null` is not an answer, and this is the one place that matters.
- **A match already entered keeps its question**, whatever the status now
  says. Answering "not working" must never hide a figure someone typed.
  `Schema.couldHaveEmployerMatch()` checks the stored match before it
  returns false.

And a third, in the income question: saying "not working" **writes nothing**.
It changes the help text under the box — *"Benefits, severance or anything
still landing goes here; if nothing is, pick 'not earning right now' rather
than typing 0"* — and leaves the field alone. `null` and `0` stay distinct
(CLAUDE.md, `SPEC.md` §4–5); the pay basis `none` is still the only way to
say zero, and it stays the person's own tap.

### Compatibility note

**Stored shape:** `person.employmentStatus` is **added**, defaulting to
`null`. Nothing is renamed, moved or removed. `Schema.createPerson()` sets
it; `Spine.upsertPerson({ id, employmentStatus })` writes it; existing blobs
read back with `null` and behave exactly as before, because `null` means
"still ask about the match".

**Rooms updated:** `rooms/start.html` (new first question `#q-employment`,
`applies` gates on `#q-match` and `#q-capturing`, the income help note),
`foo-ladder.js` (step 2's `na`, the borrowed-chip "n/a", and a match cap of
`0` rather than `null` for a no-employer household so steps 6 and 7 are not
blocked on a number that is never coming). `shared/demo-persona.js` sets
`employed`, so the example household is unchanged in every other respect.

**Before calling `getProfile()`:** if you are about to ask about anything
that presumes an employer, call `Schema.couldHaveEmployerMatch(household)`
first, and if you are adding a shared field that can stop being a question,
give it an `applies(household)` in `shared/ownership.js` rather than
special-casing it in your room — that is the one place `Progress` reads.

---

## D-056 — Time exists: every owned field knows when it was last confirmed, and snapshots are read back

*(BRIEF.md §0.3 D-D.)* Nothing in the household said **when** a number was
true. A cash balance typed in March rendered in September exactly as it did
the day it was entered, and a runway computed from it looked just as
confident. The snapshots the Financial Snapshot room could save were
write-only: nothing ever read one back, so there was no "since last time".

**Decision: two additions to the stored shape, both read by the UI.**

### `meta.confirmedAt` — the clock

`household.meta.confirmedAt` is `{ [fieldId]: ISO }`, keyed by the ids in
`shared/ownership.js`. It is stamped **by the spine, not by rooms**: on every
`save()`, the spine reads every owned field before and after the write and
stamps the ones whose value changed. A room writes exactly as it always did.
`Spine.confirm(fieldId)` re-stamps without changing the value — the "yes,
still $9,500" tap.

The spine cannot know what the owned fields are (the map loads after it), so
`shared/ownership.js` hands it a reader — `Spine.registerFieldReaders(fn)` —
at load. `Ownership.readings(h)` is that reader and is public, so a snapshot
can freeze the same set.

Stamping is by **value**, not by write: re-saving the same figure does not
move the clock, and typing a different figure into the same box does.
Diffing on `JSON.stringify` of the read value is deliberate — it is the
cheapest thing that is also correct for cents, rates, dates and booleans.

### Snapshots are read

`Spine.appendSnapshot()` now also freezes `fields` — every owned field's
value by id — beside the `rawInputs` and `computedOutputs` a caller passes.
Two new reads:

- `Spine.latestSnapshot()` — the most recent record or `null`.
- `Spine.snapshotDelta(id, current)` — `{ since, before, after, delta,
  changed }` for a computed-output id **or** a field id. A stored output may
  be a bare number or a `{ status, value }` Result; both read. `delta` is
  numeric only when both sides are numbers; otherwise `null` with `changed`
  still honest.

Every output the dashboard shows is what a snapshot should carry, so that a
delta never has to recompute an old input against a newer reference table.
The dashboard's own snapshot call (T1.4) passes its instrument values as
`computedOutputs` for exactly this reason.

### Compatibility note

**Stored shape:** `meta.confirmedAt` is **added**, defaulting to `{}`. Every
household saved before this has no stamps at all; `Spine.confirmedAt(id)`
returns `null` for them, and the display rule is "last updated N days ago,
unknown per field" from `meta.updatedAt` until the field is next written.
Snapshot records gain `fields`; older records lack it, and `snapshotDelta()`
falls back to `computedOutputs` and then returns `null` rather than
guessing. No schema-version bump: nothing is renamed, moved or removed, and
a v2 blob without these keys is a valid v2 blob.

**Rooms updated:** none had to change to get stamps — that is the point. The
Financial Snapshot room's existing snapshot button now freezes `fields` for
free. `shared/ownership.js` gained a dependency on `shared/spine-v2.js`
(the spine never depends back on it).

**Before calling `getProfile()` / `updateProfile()`:** a room that wants to
show age reads `Spine.confirmedAt(fieldId)` (or `shared/staleness.js` once
it lands, D-057) and never writes `meta.confirmedAt` itself; a room that
wants a delta calls `Spine.snapshotDelta(id, currentResult)` and shows
nothing when it returns `null`.

---

## D-057 — Age is shown, and the three figures that move get a page of their own

*(BRIEF.md §1.4.)* D-056 put a clock on every owned field. This is what the
clock is for.

### The review intervals are data

`data/staleness.json` carries `staleAfterDays` per ownership field id (cash,
investments and debts at 30; spending at 90; income at 180; a date of birth
`null`, because it never goes stale) and the short `volatile` list. They are
review intervals, `confidence: convention` — past the interval a figure turns
amber and is offered for a re-confirm; it is **never** discounted, zeroed or
hidden for being old. Stale is a prompt to look, not a verdict.

`shared/staleness.js` reads the stamps back: `describe(h, fieldId)` gives
`{ days, perField, stale, label }`. Three states, never collapsed: a stamped
field has a real age; an unstamped one (every household saved before D-056)
falls back to the household's last save with `perField: false` and the label
says so ("last saved 12 days ago (this figure not dated)"); a field with no
value has nothing to date. `stale` is `null` unless both an age and an
interval exist, so nothing ever colours on a guess.

Every `Ownership.chip()` now ends with "updated N days ago", amber past the
interval. `Ownership.describe()` carries the same under `age`.

### The Refresh page, and why it is not a second editor

`rooms/refresh.html` walks the volatile list: cash, investments, each debt
balance. Every box opens **holding the current figure in entered style** —
not settled-grey, because the whole point is to look at it. Enter on an
unchanged figure calls `Spine.confirm()` (the clock moves, the value does
not); a different figure writes; an empty box writes nothing. Then one
snapshot, then home.

This looked like a violation of D-017 — cash and investments are owned by
Start Here, debts by Debt Payoff, and here is a third page with boxes for
them. The rule's purpose is that there is never a second **copy** to drift.
So the resolution is structural, not an exemption:

- `Ownership.FIELDS.cashSavings.write()` / `.investments.write()` are the
  one function that writes those records. `rooms/start.html` was changed to
  call `Ownership.write()` too; its own `writeAsset` is gone. The Refresh
  page and Start Here are two places to press the same button.
- Debt balances go through `Spine.upsertDebt({ id, balanceCents })`, the
  same call Debt Payoff makes on the same record.

The registry marks the page `utility: true`. It never appears in the map's
groups (a chore should not look like a room); it is reached from the
dashboard's staleness line and from the room-to-room nav. It sits last on
the path so it never interrupts a first walk.

### One list of instruments

`shared/instruments.js` is the list of the six dashboard figures — net
worth, savings rate, runway, debt-to-income, FI year, FOO step — each a call
into the engine that owns it. A snapshot freezes exactly that list
(`Instruments.snapshot()`), and the dashboard reads deltas against it
(`Instruments.deltas()`), so the two can never disagree about what "since
last time" covers. The FI year is `Tier0.yearsToFire` projected onto a
calendar; the coast age lands with T3.6.

### Compatibility note

**Stored shape:** nothing new. Snapshot `computedOutputs` now carry the
instrument ids above (older records carry Tier0's `computeAll` keys, and
`snapshotDelta` returns `null` for an id a record lacks).

**Rooms updated:** `rooms/start.html` (writes cash and investments through
`Ownership.write`), `rooms/refresh.html` (new), `map.html` (skips utility
rooms). `shared/registry.js` gained the `utility` flag.

**Before writing a volatile field from anywhere new:** call
`Ownership.write(fieldId, value)` if the field declares a write path; if it
does not, the room that owns it is the only place it may be written.

---

## D-058 — The Dashboard is the front door; the FOO ladder is a room

*(BRIEF.md §1.2. Supersedes D-007's amendment.)* D-007 kept the FOO
calculator at the site root because moving it would change what an existing
visitor landed on. That was the right call for a calculator with no memory.
The suite now has one — a household, a clock (D-056), snapshots that read
back — and what a returning visitor should land on is **their panel**, not
a calculator that re-derives one step of it.

**Decision: `index.html` is a router.** When `Progress.forRoom('dashboard')`
is complete it renders the Dashboard (the same page that was
`rooms/dashboard.html`; that file is now a redirect so old links hold).
Until then it renders the intake landing: one sentence, **Start Here →**,
and **See it with example numbers** above the fold. The example button is
still an explicit action behind a confirm; demo data never loads by itself.
A visitor part-way through sees how many answers are in and a link to the
next unanswered question rather than the landing copy again.

A household with no debts is not blocked. "No debts entered" is still
incomplete, not zero (empty ≠ zero), so the router treats `totalDebt` as the
one need that does not gate the panel: with the other four figures in, the
dashboard renders and the Load instrument says what it is waiting for. T2's
`meta.hasDebt` ("any debt? yes/no") is what makes that answer explicit; until
it lands the router is deliberately lenient on that one field only.

The FOO ladder moves to `rooms/foo-ladder.html`. Its script stays at the
repo root as `foo-ladder.js` (the test suite reads it there); only the shell
moved. `Progress` no longer special-cases `'foo-ladder'` as the root page:
a room is at the root when its registry `href` is not under `rooms/`, which
is now exactly the dashboard.

`map.html` becomes the "All rooms" drawer: the next-unfinished room as one
card first, then the four groups. The "rooms visited N of 25" bar is gone —
visiting is not progress, answering is — and the "answers given" bar stays.

### Compatibility note

Stored shape: nothing. `rooms/dashboard.html` links redirect, hash included.
Registry `href` for `dashboard` is `index.html` and for `foo-ladder` is
`rooms/foo-ladder.html`; anything that hard-coded either path should read
`Ownership.linkTo()` instead. Rooms updated: `map.html`, `index.html`,
`rooms/dashboard.html`, `rooms/foo-ladder.html`; `test/forms.js` and
`test/alignment.js` retargeted.

---

## D-059 — The household can leave the browser, by hand only

*(BRIEF.md §1.6.)* Everything lives in one browser's `localStorage`. That is
the privacy story and it is also a trap: a new phone, a cleared cache or a
partner's laptop and the household is gone or duplicated. There was no way
to carry it.

**Decision: three hand-carried paths, no server.**

- **A file.** `Spine.exportJSON()` writes `{ format: 'slaf-export',
  exportVersion, schemaVersion, exportedAt, household, snapshots }` and
  `Spine.exportFilename()` names it `slaf-household-YYYY-MM-DD.json`.
  `Spine.inspectImport(text)` checks a payload without touching storage;
  `Spine.importJSON(text)` replaces the household **and** the snapshots. A
  bare household (the stored shape itself) is accepted too. A file from a
  **newer** schema is refused with the two version numbers — migrations
  only run forward, and guessing at a shape this build has never seen is
  how a blob gets quarantined. Older ones migrate on the reload that
  follows, through the same path a stored blob takes.
- **A share link.** `Spine.toShareCode()` is the export, deflated with
  `CompressionStream('deflate-raw')` and base64url'd, prefixed `z`; where
  the platform lacks the stream it is plain JSON prefixed `j`, and either
  kind reads on either platform. It travels in the URL **fragment**
  (`#h=…`), which a browser never sends to a server. The demo household
  with a snapshot is about 2.8 KB of fragment; the ceiling the brief set
  is 8 KB and `test/export.js` holds it there.
- **Arrival.** `index.html` reads `#h=` on load and **offers** — "this link
  carries Robin Sparks, saved Sep 4; loading it replaces yours" — behind a
  confirm. It never loads on its own, and dismissing strips the fragment.

The Dashboard's "Your data" card carries all three, and the landing links
to it. Export always includes the snapshots so that "since last time"
survives a move.

### Compatibility note

Stored shape: nothing. The export envelope is versioned separately
(`exportVersion: 1`) so it can grow without a schema bump. `test/export.js`
is a new suite: export → import deep-equal, share-code round trip, size.

---

## D-060 — A suggested value is shown, never stored

*(BRIEF.md §0.3 D-A and §2.1. Partially supersedes SPEC.md §5 "inputs ship
empty" — an input may ship showing a proposal.)*

The brief asked for a third input state between empty and entered:
`suggested`, sourced from a reference table or a derived figure, rendered
distinctly, counted as unanswered until confirmed. It proposed storing it as
`{ value, state: 'suggested' | 'entered', source }` on every scalar owned
field, with a migration wrapping existing bare values.

**Decision: the state exists; the stored shape does not change.** A
suggestion lives only in a DOM node's display. `shared/suggest.js` paints it
(muted, dashed underline, a "Use this" chip naming the source) and reports
it; the room that owns the field does the write when the person taps the
chip or types. The household never holds a suggested value at all.

Why not the stored shape the brief described:

- Every reader in the app — `Schema.cashCents()`, every engine, every
  ownership `read` — takes bare numbers. Wrapping them means every one of
  those unwraps and checks `state`, and the one that forgets feeds a guess
  into a formula. The brief's own test ("no room writes a suggested value
  into a formula without confirmation") is a test that the discipline held.
  Not storing the value makes the discipline unnecessary: an engine cannot
  read what is not there.
- The only thing storing buys is remembering that a suggestion was shown.
  Every suggestion here is deterministic — a table row or a derivation from
  fields the household already holds — so it costs nothing to show it again.
- Empty ≠ zero (CLAUDE.md, SPEC.md §4–5) stays exactly as strict, with no new
  third value in storage to reason about. `Progress` needs no change: a
  suggested field reads as `null`, which is unanswered.

### The mechanics that make "never in a formula" true by construction

`Suggest.show(node, { value, display, source, onUse })` writes the display
into the box and marks it `data-suggested`. **Focusing the box clears it**,
so a blur handler that reads `node.value` gets `''` — precisely what an
empty box gives — and leaving it blank re-shows the proposal rather than an
empty field. `Suggest.entered(node)` is the read a room should use where it
reads a box outside a blur. "Use this" calls the room's `onUse(value)`,
which writes through the room's ordinary path, then the state is entered
like any other. `show()` refuses to paint over a box that already holds an
entered value: a suggestion never overwrites an answer.

Nothing is rebuilt: `show()` writes `.value` and classes on a node in the
page and adds one chip beside it, once. D-034 holds.

### Compatibility note

Stored shape: **nothing changes.** No migration. Rooms opt in one box at a
time by calling `Suggest.show()`; a room that never does is unaffected.
`test/run.js` asserts `shared/suggest.js` never references the spine.

---

## D-061 — Eleven cards: the intake asks less, derives one answer, and takes "no debt" as an answer

*(BRIEF.md §2.2; carries the brief's D-E "two people are first-class" as far
as the intake goes.)* Start Here asked the same person about their date of
birth in one card and their state in another, about the employer match in
one card and whether they captured it in another, and never asked whether
there was a second person or any debt at all — so a debt-free household was
"incomplete" in every room that reads debt, forever.

**Decision: eleven cards for one W-2 person with no debt, in three groups
with a time on each.** *About you* (~1 min): just you or two; working; the
other of you (only when two); born + state. *Money in and out* (~1 min):
pay; filing; spending. *What you hold and owe* (~2 min): cash; investments;
the 401(k) card; deductible; any debt. The rail says which group you are in.

### What changed in the questions

- **Just you, or two of you?** Two adds one card — a name, whether they are
  working, born month/year — and a second pay row on the income card, with
  the same basis list and the same annualising, written to their own income
  source on their own person record. Household income is the sum, as
  `Schema.grossAnnualIncomeCents` already did. "Just me" again removes the
  second person (behind a confirm). No `partner` flag: `people[1]` is the
  fact.
- **Born month + year, and state, on one card.** The day was never used;
  `dob` is stored as `YYYY-MM-01`. The state is picked from
  `data/states.json`, not typed. A half-chosen date is never wiped between
  the two picks.
- **Investments in three boxes** — pre-tax, Roth, taxable — each an asset
  record with a `taxCharacter`, or one total marked `'unknown'` behind an
  "I only know the total" link. Switching to a total collapses the split;
  typing a split removes a total, so nothing double-counts.
- **The 401(k) card**: match % · of the first % · you put in %. The match
  boxes open **suggesting** 50% of the first 6% from
  `data/match_defaults.json` (Vanguard, How America Saves; a mode, not a
  mean) and the contribution box suggests the cap once the cap is known —
  shown, never stored, D-060. "There's no match" writes 0 and 0 explicitly;
  nobody types zeros. **Whether you capture the full match is derived**
  (`Schema.capturingFullMatchDerived`: contribution ≥ cap) and no longer
  asked; the old stored yes/no is the fallback for households that answered
  it before the contribution existed. The sentence under the boxes updates
  as you type, not on blur.
- **Highest deductible** and **what you contribute** move to Start Here.
  Sleep At Night and Where It Goes render them as chips that link back.
- **Any debt?** `meta.hasDebt`. "No" is an answer: `Registry.nextAfter()`
  drops Debt Payoff from the path, and `totalDebt` /
  `monthlyDebtPayments` stop applying (the D-055 mechanism), so every room
  that reads debt reads complete instead of waiting.

### Two things found on the way

The strip at the foot of every room repainted synchronously on every write.
When an item dropped off its list the document got shorter; with the page
scrolled near the bottom the browser clamped the scroll and the Next button
moved 40px between touch-end and click. The tap was lost. `Progress.mount`
now repaints 400ms after a change, coalesced, and holds the strip's height
across the repaint. A "Use this" chip that vanished on blur did the same in
miniature; it keeps its space now (`visibility`, not `[hidden]`).

### Compatibility note

**Stored shape:** `meta.hasDebt` (null / true / false) and
`asset.taxCharacter` (null, or one of the enum in `Schema.FIELDS`) are
**added**; both default to null. `dob` may now be `YYYY-MM-01`. A second
adult is `people[1]` with `role: 'adult'` — nothing new in the person
record beyond D-055's `employmentStatus`. `household.capturingFullMatch`
stays for compatibility and is read only when the derivation cannot run.

**Rooms updated:** `rooms/start.html` (rebuilt), `rooms/sleep-at-night.html`
and `rooms/accounts.html` (chips), `shared/registry.js` (`nextAfter` takes
the household; Start Here's `needs` and anchors), `shared/ownership.js`
(owners and anchors moved; `hasDebt`; `applies` on the debt figures and on
`contributionPercent`), `shared/progress.js` (deferred strip), `foo-ladder.js`
(no employer → contribution 0 like the cap). The demo persona answers
`hasDebt: true`.

**Before writing any of these from a new room:** the deductible, the
contribution and `hasDebt` are Start Here's. Read them through
`Ownership.describe()`; do not add a box.

---

## D-062 — Explore rooms open with your numbers proposed, and the federal bracket is one of them

*(BRIEF.md §0.3 D-B and §2.3–2.4. Supersedes the "never derive a marginal
rate" line of D-036/D-052 for the FEDERAL bracket only.)*

### The what-if rooms propose, never take

Runway, Quick Math and W2 vs 1099 already knew the numbers they asked for —
cash, spending, pay — and asked anyway, or (W2 vs 1099) wrote the salary
straight into the box so it read as an answer the person had given.
`shared/seed.js` mounts one toggle at the top of each — **Open with: my
numbers · a blank page** — and in "my numbers" every box it can fill shows
the household figure as a suggestion (D-060) naming its source. "Use this"
calls the room's `apply()`, which writes the room's LOCAL state and nothing
else. Hypotheticals still never reach the household (D-052). The choice is
remembered for the session, not stored.

Seeds: Runway — cash → cushion, monthly spending → spending. Quick Math —
cash → the balance you might move. W2 vs 1099 — gross → the salary side.
Not seeded, deliberately: Quick Math's "rate now" (the brief's table says
the highest-rate debt; a savings rate is not a debt rate, so that would be
a wrong number in a real-looking box); Windfall (nothing in the household
is a windfall); the Credential's cost and raise (yours to invent).

### The federal bracket is derived — as a suggestion

`data/federal_brackets_2026.json` carries the ordinary-income brackets and
standard deductions for tax year 2026, `confidence: unverified` until they
are checked line by line against the IRS revenue procedure. Every place it
is shown says "federal only, an estimate (unverified)".
`Reference.marginalBracket(table, grossDollars, filingStatus)` walks gross
minus the standard deduction up the ladder and returns the rate with the
taxable income used, the room before the next bracket and the next rate —
the numbers the Statement's bracket ladder (T3) will show.

D-036 refused to derive a marginal rate from the *effective-rate* table,
and still does: that table is a blend that says nothing about the next
dollar. This is a different derivation from a different table, and it is
**a proposal, not a value**: Side Hustle, the Credential and Where It Goes
show it in the marginal-rate box only while no rate is stored, and "Use
this" writes `assumptionOverrides.marginalRate` exactly as typing would.
State tax is out of scope and the source line says so.

Where It Goes had two boxes for one fact — "your marginal tax rate" in the
setup and "your tax rate now" in the Roth-vs-Traditional comparison. The
second is gone; the comparison reads the shared rate and shows it as a
chip. "Rate in retirement" stays a local input: nobody knows it.

### Compatibility note

Stored shape: nothing. Rooms updated: `rooms/runway.html`,
`rooms/quick-math.html`, `rooms/self-employed.html` (toggle + seeds),
`rooms/side-hustle.html`, `rooms/credential.html`, `rooms/accounts.html`
(bracket proposal; the duplicate box removed). New: `shared/seed.js`,
`data/federal_brackets_2026.json`, `Reference.marginalBracket()`.

---

## D-063 — Cash Flow opens with a whole month proposed

*(BRIEF.md §2.5.)* A first visit to Cash Flow was nineteen empty boxes. The
household already knew take-home and the person had already picked a split
(50/30/20 by default), which together say what a month in that shape
looks like — so the boxes now open **holding that month as proposals**.

Each empty line shows the chosen template's bucket target spread across the
bucket's categories by `typicalShareOfBucket`, a new field on every
non-derived category in `data/expense_categories.json`. The shares are rough
proportions in the shape of the BLS Consumer Expenditure Survey (2023),
rounded and transcribed from memory, summing to one within each bucket;
the file carries `typicalShareConfidence: unverified` and the source line
under the boxes says "BLS CES 2023, unverified" every time. They are a
starting shape, not a finding, and they are never shown as one.

Every line is a suggestion (D-060): dashed, "Use", named source. Tapping a
line writes that one entry through the room's ordinary path; typing over
it does the same; **"Use every proposed line"** accepts them all at once.
The tracked monthly figure (`monthlyEssential.trackedValueCents`) is still
computed from entries and only entries — `engines/cashflow.js` does not
know suggestions exist — so `Progress` keeps reporting the intake estimate
until real lines are in, exactly as the brief's acceptance criterion asks.
Changing the split re-proposes the empty lines; a line already entered is
never touched. Debt minimums stay derived and are never proposed.

### Compatibility note

Stored shape: nothing. `data/expense_categories.json` gains
`typicalShareOfBucket` per category (version 1.1); a category without one
is simply not proposed. Rooms updated: `rooms/cash-flow.html`.

---

## D-066 — The 10x Statement's shape: what an asset is, how sure you are, when you can reach it

*(BRIEF.md §3.1–3.2, §3.4–3.6. Carries the brief's D-E further: every list
already has `ownerIds`, and `people[1]` is a first-class adult since D-061.)*

A balance sheet that says only "what" is a list of numbers. The Statement
(T3) asks three more things of every asset — how sure are you it is worth
that, how fast could you reach it, and at what age — and files each one
under one of three portfolios. This entry is the stored shape; the room and
its engine follow.

### The asset record grows, and every new field starts null

`liquidity` (1 today · 2 within 30 days · 3 within 12 months · 4 can't or
won't sell) and `confidence` (1 guaranteed · 2 85%+ · 3 real but don't count
on it · 4 probably zero) are **rated, never guessed**: `null` means not
rated, and the default from `data/access_rules.json` is proposed in the box
(D-060), never written. `costBasisCents`, `hassle` (1–3, for anything that
earns), `cashFlowMonthlyCents` and `accessAgeOverride` likewise start null.

`liquid` stays. Every ratio that reads it keeps reading it; the Statement
writes it from `liquidity` when that is rated (`liquid === liquidity <= 2`),
so the two cannot disagree once a rating exists.

`data/access_rules.json` is keyed by `taxCharacter` with a fallback by
`category`: the portfolio bucket (liquid financial / illiquid financial /
non-financial), the default liquidity, and the access age — 59½ for pre-tax
and Roth earnings, 65 for a non-medical HSA, none for taxable, and Roth
contributions reachable any time (`basisAccessAge: null`), which is what the
bridge to 59½ counts. `Schema.assetRule`, `assetAccessAge` and
`assetLiquidity` are the three readers; the override wins, then the rating,
then the rule, and each says which it used.

### New records

- `futureIncome[]` — a pension, Social Security, an annuity, an inheritance
  you would rather not count: `monthlyCents`, a start (`startsOn` or
  `startsAtAge`), an end, a `confidence` 1–4, `inflationAdjusted`. Not net
  worth and not income yet; its own list.
- `property[]` — what a rental **does**, linked by `assetId` to the
  `real_estate` asset that says what it **is**. The value is never stored
  twice (D-017). Rent, PITI, operating costs, a vacancy rate (proposed at
  8%, a landlord convention), hassle and prospects. Cap rate, cash-on-cash
  and DSCR are derived, never stored.
- `insurance` gains the Coverage Checkup: `oopMaxCents`, `termLifeCents`,
  `disabilityMonthlyCents`, `umbrella`. Sleep At Night owns all of it.
- `allocation` — `stocks`, `bonds`, `cash` as fractions and a
  `rebalanceBand`. Where It Goes owns it.
- `targets` — `retireAge` and `coastAge`, owned by FIRE. The coast age was
  a preview knob that forgot itself on reload; it is a fact about you.
- `scenarios[]` — named, dated diffs for the life-events engine (T6).
  Nothing reads them yet.
- `incomeSource.hassle` — Return on Hassle applied to the job.

The spine merges the small fact objects (`targets`, `allocation`,
`insurance`, `retirement`) on write, so a room setting one field cannot wipe
another room's; the lists get `upsertFutureIncome`, `upsertProperty`,
`upsertScenario` in the same shape as the others.

### Four tables, three of them unverified

`confidence_weights.json` (1.0 / 0.85 / 0.5 / 0 — a convention, after the
BiggerPockets PFS) is the only one this entry would defend. `ui_benefits.json`
(state maximum weekly benefit and duration), `aca_2026.json` (the poverty
level, the applicable-percentage table, the 400% cliff) and
`state_brackets_2026.json` (none / flat / graduated, single filer, 51
jurisdictions) are all transcribed from memory and marked `unverified`;
every figure that reaches a screen from them says so. The state schedule is
applied to *federal* taxable income as a stand-in for state taxable income,
a stated simplification.

### Compatibility note

**Stored shape:** additions only. Six new nullable asset fields; one on the
income source; four on `insurance`; the `futureIncome`, `property`,
`scenarios` lists; the `allocation` and `targets` objects. Everything
defaults to null or `[]` and a v2 blob without them is a valid v2 blob. No
schema-version bump. `liquid` is unchanged in meaning.

**Rooms updated in this entry:** none — this is the shape. The rooms that
own the new fields land in the commits that follow (the Statement, FIRE's
targets, Sleep At Night's checkup, Where It Goes' allocation), each adding
its ownership rows and anchors.

---

## D-067 — A tax engine in named steps; the effective-rate table stays as the fallback

*(BRIEF.md §3.7.)* The app had one tax number: the effective-rate lookup in
`data/effective_tax_rates_2026.json`, a blend of income tax and FICA by
gross band. It was honest about being a blend (D-009, D-036). It could not
say what the next dollar costs, what a deferral saves, or what a gain pays.

**Decision: `engines/tax.js` computes federal tax in named steps, each its
own function with its own Result**, so a room can show the working and a
test can pin every line:

- `ordinaryTax` — gross, less above-the-line deferrals, less the larger of
  the standard and an itemised deduction, walked up the bracket ladder.
- `capitalGainsTax` — long-term gains **stacked on top** of ordinary taxable
  income and taxed at 0 / 15 / 20 by where the stack lands. Ten thousand of
  gains on forty thousand of ordinary income pays $82.50; the same gains on
  forty-five thousand pays $832.50. Stacking is the whole point.
- `fica` — the employee's 6.2% to the wage base, 1.45% uncapped, and the
  additional 0.9% over the threshold, from `se_tax_2026.json`.
- self-employment tax — `engines/selfemployed.js`, reused; the deductible
  half comes off ordinary income. Nothing is re-derived.
- `stateTax` — none / flat / graduated from `state_brackets_2026.json`,
  applied to **federal** taxable income as a stated stand-in.
- `acaCliff` — where MAGI sits against 400% of the poverty level, with the
  room before the cliff. Flags and distance only; it never prices a plan.
- `estimate` — all of it, plus `notModelled`: credits, AMT, NIIT, QBI, state
  deductions and local taxes. The number is an estimate and says so.

On the demo persona ($72,000, single, NC): ordinary $7,010, FICA $5,508,
state $2,375.75, total $14,893.75, an effective 20.7% against the lookup
table's 19%. Every one of those was derived by hand in `test/run.js` before
the engine produced it.

**What stays.** Tier0's take-home and savings rate keep reading the
effective-rate table. It is the fallback here when the lines a real
computation needs are missing, and swapping every reader onto the new
engine is a change with its own blast radius (every savings rate in the app
moves ~2 points) that belongs to T4, deliberately.

The brief's acceptance criterion — within $200 of the BiggerPockets PFS v9
demo household — could not be run: that spreadsheet is not in this repo.
The hand derivations above are the check that stands in its place.

### Compatibility note

Stored shape: nothing. `data/federal_brackets_2026.json` gains a
`capitalGains` ladder (version 2026.1), same unverified status as the rest
of the file. No room reads the engine yet; the Statement's bracket ladder
is first.

---

## D-068 — Seven questions a balance sheet should answer, in one engine

*(BRIEF.md §3.3, §3.5 — the numbers; the room is D-069.)* Net worth is one
number. `engines/statement.js` answers the questions the number hides, each
as its own Result, each re-derived by hand on the demo in `test/run.js`:

- **Three portfolios**, not one list: liquid financial · illiquid financial ·
  non-financial, filed by `access_rules.json`. The demo's uncharacterised
  investment lump files as taxable — and says so — until the intake's three
  boxes split it.
- **Confidence-weighted net worth**: Σ value × weight for every *rated*
  asset, less debts, beside the plain figure. An unrated asset is
  **excluded** from the weighted total and counted, never assumed
  guaranteed. Nothing rated, nothing weighted.
- **The liquidity ladder**: today · this month · this year · never, by the
  rated liquidity or the rule's default, with money behind an access age
  you have not reached moved to "never" — except a Roth's contributions,
  reachable at the Roth's own liquidity. No date of birth means the gate
  cannot be applied and the Result says so rather than pretending.
- **The bridge to 59½**: the FI date at the current pace (the standard
  variant, `engines/fire.js`) against 59½, times annual spend, against what
  is reachable before then — taxable, cash, Roth basis, HSA. The demo:
  FI at 51, an 8.5-year gap, $321,300 needed, $57,500 reachable, $263,800
  short. FI after 59½ needs no bridge.
- **The worst plausible year**: highest deductible + out-of-pocket maximum
  + six months of essentials − the state unemployment benefit (the cap or
  half the weekly wage, whichever is lower, for the state's weeks up to 26),
  against cash. The demo: $21,400 cost, $4,200 of NC benefit, $7,700 short
  after cash. The benefit carries `ui_benefits.json`'s unverified status.
- **Income concentration**: the largest source over the household total.
- **A rental in ratios**: NOI from rent net of vacancy and operating costs,
  cap rate on the linked asset's value, DSCR against PITI, cash-on-cash on
  equity. Vacancy is proposed at 8% and the Result says when it assumed it.

Nothing here re-implements a formula that exists: FI years come from
`engines/fire.js` and `engines/projection.js`, totals from `Schema`.

---

## D-069 — Net Worth becomes The Statement, and every asset gets rated where it is listed

*(BRIEF.md §3.2, §3.4, §3.6 — the room.)* `rooms/net-worth.html` was a list
of what you own and one number. `rooms/statement.html` replaces it, keeps
its place on the path (core, order 5) and its tags, and takes over what it
owned: the itemised assets (`otherAssets`) and net worth itself. Cash and
investments stay Start Here's; the Statement renders them as field-sized
chips that link back, and lets you rate them without owning them.

**What the room does, top to bottom.** Three portfolios with the plain net
worth beside the confidence-weighted one · every aggregatable asset, one
card each, with liquidity and confidence selects (blank = "Not rated", the
rule's default named in the blank option, proposed never stored per D-060)
and a `<details>` for cost basis, monthly cash flow, hassle and an access-age
override · the liquidity ladder · the bridge to 59½ · your bracket, a table
built from `federal_brackets_2026.json` with the estimate from
`engines/tax.js` under it · the worst plausible year · money that is coming
(`household.futureIncome`, one card each) · reading from elsewhere, and a
print button with a print stylesheet.

**Decisions made here:**

- **`liquid` follows the rating.** Setting liquidity writes
  `liquid = liquidity <= 2` in the same patch, so `engines/ratios.js` and
  every other reader of `asset.liquid` agree with the ladder. Rating your
  savings account "within 12 months" takes it out of the liquidity ratio,
  which is what the rating means.
- **Kind is by category unless you say otherwise.** An investment entered
  as one line shows "By category (Taxable)" as its blank option, and the
  portfolio label says "(taxable, by category)" until a character is
  chosen. A cash account has no Kind select — it is cash. An intake total
  marked `unknown` keeps that mark when the blank option is re-selected, so
  Start Here's one-total mode still recognises it.
- **No debt input.** Debts belong to Debt Payoff (D-017); the statement
  reads `totalDebt` and links to it. `test/run.js` checks the room has no
  balance field.
- **Two new derived ownership rows**, both owned here and read-only
  everywhere: `confidenceWeightedNetWorth` (anchor `portfolios`; `Ownership`
  reaches the engine and the weights table via `require` in node and via
  `Reference.cached('confidenceWeights')` in a browser — a table the room
  loads at boot) and `futureIncome` (the sum of the entered monthly
  amounts, anchor `future`).
- **The old file is a redirect.** `rooms/net-worth.html` stays so every old
  link keeps working: `#out-net-worth` and `#ledger` land on `#portfolios`,
  `#from-elsewhere` on `#reading`, anything else is passed through. It is
  not in the registry and has no inputs.

**Compatibility note.** No stored shape changed in this entry (the fields
were added in D-066). What changed is who writes: itemised assets and the
ratings on any asset are written by `statement`, through
`Spine.upsertAsset`, and `futureIncome` rows through
`Spine.upsertFutureIncome`. A future room that wants to show an asset's
liquidity, confidence, cost basis or access age reads it and links to
`statement#assets`; it does not own a copy.

**Verified.** `node test/run.js` (the room section: registry, redirect map,
ownership rows, anchors, weighted figure = half the demo's rated cash less
all its debt), a phone-browser walk against the demo (rate, add a property,
add a pension; portfolios $35,900 → $355,900 with the condo; weighted
−$16,850 with one asset at "don't count on it"; ladder $48,000 this month +
$9,500 this year; bridge 8.5 yrs / $263,800 short; bracket 22% with $49,800
of room; worst year $7,700 short; both old-hash redirects), `test/forms.js`
on `#asset-list`, `test/alignment.js` on `.asset-grid` and `.pair`.

---

## D-070 — The ages you plan around are stored, and FIRE Number owns them

*(BRIEF.md §3.6.)* `household.targets` (`retireAge`, `coastAge`, shape from
D-066) was written by nobody. FIRE Number now has a "Your targets" card
(anchor `targets`) with two boxes, stored on blur through
`Spine.updateProfile({ targets })`, and two ownership rows, `retireAge`
and `coastAge`, owned by `fire` and read-only everywhere else.

**What changed in the room.**

- **The coast age is no longer a preview knob.** SPEC §12.2 keeps the
  withdrawal rate and expected return as local, unstored overrides — a
  what-if. The age you coast to is not a what-if; it is a decision, and it
  was being lost on every reload. The coast variant now reads
  `targets.coastAge`, and the table's 65 only until an age is set, which
  the card says.
- **The stop age is compared to your pace.** With a stop age, a date of
  birth and a finished progress Result, the number card adds a row: "You
  want to stop at 55 — at this pace you get there at 51, 4 years early."
  Not under coast, where "years away" means years to the coast number, not
  to stopping.
- **The variant buttons are built once and patched in place.** They were
  rebuilt with `innerHTML` on every render, and a blur on a target box
  renders — so a tap on "Coast" that also blurred a box landed on a button
  that had just been replaced, and did nothing. Found by tapping through
  on a phone-shaped browser; the same class of bug as D-034, on buttons
  instead of inputs.

**Not done here, deliberately.** The Statement's bridge still runs from the
FI date at the current pace, not from the stop age; reading the stop age
there is a T4 question (the bridge from a *chosen* date is a different
number and wants its own row). The Refresh page keeps to the three that
move; a target is not something that goes stale.

**Compatibility note.** No stored shape changed. `targets.retireAge` and
`targets.coastAge` are now written, by `fire` only, as plain years
(`null` = undecided). `Spine.updateProfile` merges `targets` field-wise
like `meta`, so a room that writes one leaves the other alone. A future
room that plans around a date reads `Ownership.field('retireAge')` and
links to `fire#targets`; it does not ask again.

**Verified.** `node test/run.js` (owners, anchors, the knob gone, coast to
60 needs more than coast to 65), a phone-browser walk (type 55 and 60,
the row reads "at this pace you get there at 51, 4 years early", coast
reads "Over 28 years, to age 60", both survive a reload), `test/forms.js`
on `#targets`, `test/alignment.js` on `.params`.

---

## D-071 — The Coverage Checkup lives in Sleep At Night; the target mix lives in Where It Goes

*(BRIEF.md §3.2.)* Two small fact cards, each in the room whose question
it answers, each writing fields that D-066 added and nobody wrote.

**Coverage checkup** (`rooms/sleep-at-night.html`, anchor `coverage`).
Four facts about your cover: the health out-of-pocket maximum, term life
in force, the long-term disability benefit a month, and whether an
umbrella policy exists (Not sure / Yes / No — `null` / `true` / `false`;
"no" is an answer). Under them a read-out in four sentences — a bad
health year against your cash, term life as years of the household's
spending, disability as a share of what you spend, the umbrella as it is
— and a link to the Statement's worst plausible year, which reads the
out-of-pocket maximum from this card and prices the year that much
higher. Blank means not entered: the read-out says "not priced" rather
than assuming zero. The deductible stays asked in Start Here (D-061);
this card does not ask it again. Ownership rows `oopMax`, `termLife`,
`disabilityMonthly`, `umbrella`, owned by `sleep-at-night`.

**How it's split** (`rooms/accounts.html`, anchor `allocation`). The room
is retitled "Where It Goes & how it's split". Stocks, bonds and cash as
percentages, stored as shares of one, plus a rebalance band. It is a
stated *target*, not a reading of the accounts — the assets do not carry
an asset class, so nothing here claims to know your actual mix.
`Schema.allocationStatus(h)` is the one function that says what the
slices add to, which are missing, and whether they are balanced; the
read-out uses it ("Adds to 105%, not 100% — 5% too much." · "70% stocks ·
20% bonds · 10% cash. With a ±5% band, stocks are rebalanced outside
65%–75%."). A share outside 0–100 is not stored. Ownership rows
`allocationStocks`, `allocationBonds`, `allocationCash`, `rebalanceBand`,
owned by `accounts`.

**Both cards are static markup, `.value` only** (LIVE-FORM: built once),
written on blur through `Spine.updateProfile`, whose field-wise merge of
`insurance` and `allocation` (D-066) means a card writing one field
leaves every other — the deductible included — alone. `test/forms.js`
checks exactly that on a phone.

**Compatibility note.** No stored shape changed. What changed is who
writes: `insurance.oopMaxCents / termLifeCents / disabilityMonthlyCents /
umbrella` by `sleep-at-night`, `allocation.*` by `accounts`. A room that
wants any of them reads the ownership row and links to the card. The
worst plausible year already read `oopMaxCents`; it now has somewhere
the number can come from.

**Verified.** `node test/run.js` (owners, anchors, the deductible left
with Start Here, umbrella "no" as an answer, the mix at 70 / 70+20+15 /
70+20+10 with a band, the worst year exactly $8,000 dearer with the
maximum entered), a phone-browser walk (type all four, read "13.2 years
of your household's spending" and "95% of what you spend", reload, the
Statement's worst year at $29,400; enter 70/20/15 and read "5% too much",
correct to 10 and read the band), `test/forms.js` on both cards,
`test/alignment.js` on `.cover-grid` and `.grid-2`.

---

## D-079 — Benchmarks: where a household stands against a convention, and which conventions

*(BRIEF.md §4.1. Opens T4.)* `engines/benchmarks.js` is seven numbers that
compare the household to something outside it, and every one names the
convention it leans on:

- **The wealth multiplier** — what a dollar at your age becomes by 65 on
  `wealth_multiplier.json`'s falling return path. **Monthly to $1M / $2M**
  is the level contribution that lands on the target with what is already
  invested growing alongside: (target − existing × M) ÷ Σ of the suffix
  products of the monthly factors. This is a second growth model beside
  `engines/projection.js`, on purpose: the projection loop is *the* loop
  for one rate with contributions and this file calls it for the FI date
  and the at-65 balance; the multiplier is a rate that changes with age,
  parameterised in data, and its curve is computed here and nowhere else.
- **PAW / AAW / UAW** — net worth over age × income ÷ 10, from *The
  Millionaire Next Door*; ≥ 2 prodigious, ≤ 0.5 under. Divisor and
  cut-offs in `data/levels_of_wealth.json`.
- **The five levels** — each a Result: 1 no high-interest debt (by the FOO
  rule) and a starter fund in cash; 2 a savings rate ≥ 20%; 3 expected
  growth on investments ≥ a year of take-home; 4 net worth ≥ 2× the PAW
  expectation *and* an FI ratio ≥ 1; 5 self-declared and **never assigned
  by the engine**. The level is the run of met checks from the bottom; an
  unknown check (a debt with no rate) stops the count and is reported,
  never counted as passed or failed. The demo, carrying a high-interest
  card, is at level 0; with every rate under the threshold it is at 2.
- **What 1% more** — Δ years to FI and Δ balance at 65 for one more point
  of savings rate. Uses the projection loop twice; nothing new.
- **Human capital** — present value of gross pay from now to the stop age
  (`targets.retireAge`, D-070) at a real discount.
  `assumptions.humanCapitalDiscountRate` is a new assumption, default 2%,
  overridable like the others; without a stop age the Result asks for one.
- **Net worth in years** — net worth over a year of spending.

**Not decided here.** Where these are *shown* is D-083 (Snapshot and
dashboard). Level 5 has no field yet; a declaration belongs with T8's
Enough room, and until then the level caps at 4.

**Compatibility note.** `assumptions.humanCapitalDiscountRate` joins
`ASSUMPTION_DEFAULTS`; a stored household without it resolves to the
default through `Schema.resolveAssumptions` as every assumption does.
`data/levels_of_wealth.json` is registered as `levelsOfWealth`.

**Verified.** `node test/run.js`: the return path at four ages, a year
from 64 by a longhand product, monthly-to-$1M simulated forward to within
$10 of the target, PAW for the demo (35,900 ÷ 230,400, under), the levels
at 0 and at 2, one point of savings rate as $720 moving FI a year closer
and compounding past 33 × $720 by 65, human capital by the annuity
formula, net worth in years.

---

## D-080 — Two savings rates: what is left, and what actually went somewhere

*(BRIEF.md §4.2.)* `Tier0.savingsRate` is the **residual**: gross less a
year of spending less estimated tax, over gross. It says how much *could*
have been saved. `CashFlow.savingsRateContributed` is the **contributed**
rate: the 401(k) percentage of gross, Roth and HSA so far this year, and
the tracked lines in the savings bucket, over gross. It says how much
*was*. Both are shown on the Snapshot; the dashboard's Thrust instrument
is the contributed rate when the percentage is known and the residual
until then, and the Result says which (`variant`).

**The gap is a finding, not a number.** Residual minus contributed is
money leaving the paycheque that nobody has named — the demo's $1,345 a
month. The Snapshot says so in a sentence under the card, with the
accounted-for parts listed, rather than adding an "unallocated" figure
to the instrument grid: it is a prompt to go and track a month, and it
belongs beside the rate it questions.

**Three rules the formula needed:**

- **Not entered is not zero.** A blank Roth or HSA is listed in
  `notEntered` and left out; the sentence says so. With no contribution
  percentage at all the Result is incomplete and asks for it — this is
  the one input the rate cannot do without.
- **The retirement line and the percentage are the same dollars.** A
  tracked `retirement` line in Cash Flow is almost always the 401(k) the
  percentage describes, so the larger of the two counts, once, and the
  Result reports which was used (`retirementOverlap`). Every other
  savings category adds.
- **It lives in `engines/cashflow.js`**, not `tier0.js`, because tracked
  entries are Cash Flow's, and cashflow already depends on tier0 — the
  other direction would be a cycle.

**Compatibility note.** No stored shape changed. The Snapshot loads
`engines/cashflow.js`; `shared/instruments.js` gains a CashFlow
dependency, which `index.html` and `rooms/refresh.html` already load.
A snapshot taken before this entry stored the residual under
`savingsRate`; a delta against it after a percentage is entered compares
a residual to a contributed figure, and the instrument's `variant` is
there to say so.

**Found in passing.** `engines/foo.js` still read the raw
`household.capturingFullMatch` for its match step, so a household that
had answered the 401(k) card (percentage and cap, D-061) but never the
old yes/no was "not enough entered to place you on the ladder" on the
dashboard while the same numbers placed it at step 2 in node. Both sites
now read `Schema.capturingFullMatchDerived`. The page sweep used in
verification now also fails on a visible load notice, which is how this
one had hidden.

**Verified.** `node test/run.js`: the demo's 4% of $72,000 plus $1,500
Roth as 6.1% against a 28.5% residual, $16,140 a year unallocated; with
the tracked month the $400 retirement line counts once instead of the
percentage, plus $3,600 emergency savings; the headline instrument's
variant with and without a percentage. A phone-browser read of the
Snapshot card and the dashboard's Thrust cell.

---

## D-081 — Fourteen more ratios, in the one registry, most of them without a band

*(BRIEF.md §4.3.)* `engines/ratios.js` gains fourteen rows, each calling
the engine that already owns the number — `engines/statement.js` for
income concentration, the weighted net worth, the ladder, the worst year
and the bridge; `engines/benchmarks.js` for net worth in years and human
capital; `Reference.marginalBracket` for bracket room; `Tier0.yearsToFire`
for the FI date. Nothing is re-derived. Three are new arithmetic:

- **Shadow runway** — cash + a Roth's contributions + home equity at a
  haircut, over monthly expenses: the runway if you were willing to raid
  the Roth and sell the house. The haircut is a new assumption,
  `assumptions.homeEquityHaircut`, default 0.8, overridable like the
  others; the Result reports the pool and the haircut it used.
- **Lifestyle inflation** and **net worth growth** read snapshots back
  (D-056). "A year ago" is the most recent snapshot at least eleven
  months before now — a snapshot taken "about a year later" rarely lands
  on the day. With none, the Result says to save one and come back; with
  one too recent, it says that. A snapshot's `fields` may hold a bare
  number or a `{status, value}` Result; both are read. Growth from a net
  worth of exactly zero is undefined and says so; a raise of zero leaves
  nothing to measure inflation against.
- **Giving rate** — the `gifts` category over take-home. A tracked month
  with no gifts line is 0%; no tracked month is incomplete.

**Bands.** `ratio_benchmarks.json` moves to 1.2. Only three of the
fourteen get a verdict: shadow runway borrows the 3–6 month emergency
fund convention on its wider pool; worst-year coverage calls 1× covered
by definition and half-covered the watch line (a convention chosen here,
and the note says so); lifestyle inflation uses "keep at least half of
every raise". The other eleven carry `null` bands with a note saying
why — one paycheque reading 100% concentration is a fact about the
household, not a fault, and the tithe is not a financial convention.
**Automation ratio is registered as unavailable** with what it would
need (which contributions are automated — the Skill Stacker's question,
T7), so nothing pretends to know it.

**Two new units.** `dollars` (a figure, not a monthly flow — the weighted
net worth and bracket room) and `date` (a decimal year, shown as
"Sep 2045"). `cents` keeps its "/mo" meaning.

**Snapshots reach the engine as an option**, not through the household:
`Ratios.all(h, tables, { snapshots, now })`, passed by the rooms and by
`shared/instruments.js` from `Spine.listSnapshots()`. The engine stays
pure; `now` is injectable so the tests pin a date.

**Compatibility note.** No stored shape changed. `engines/ratios.js` now
depends on `statement.js`, `benchmarks.js` and `shared/reference.js`;
every page that loads it (`index.html`, `rooms/ratios.html`,
`rooms/health.html`, `rooms/refresh.html`) loads those and `fire.js`,
which the registry test enforces. The `assumptions.homeEquityHaircut`
default resolves for any stored household.

**Verified.** `node test/run.js`: every new row on the demo — 100%
concentration, the weighted figure at half of rated cash less debt, the
ladder at 100% reachable, shadow runway 9,500 ÷ 3,150 and then a
$300,000 home with $200,000 owed adding $80,000, worst-year coverage
9,500 ÷ 17,200 in the watch zone, $171 of gifts over take-home, $49,800
of bracket room before 24%, the 8.5-year bridge, human capital at about
23× financial capital, the FI date to the day from a pinned now,
lifestyle inflation 4,200 ÷ 12,000 from a year-old snapshot storing a
Result and a bare number, growth annualised over the real gap, and the
three "cannot say" cases. The radar now plots sixteen banded ratios for
the demo. A phone-browser read of the Every Ratio room and the Health
room.

---

## D-082 — Which lines could not be cut: the floor, and how much of a month is cuttable

*(BRIEF.md §4.4.)* Every spending line in Cash Flow gets a third cell: a
"fixed" tick — could this not be cut next month? Stored as
`expenseEntry.fixed`: `null` not asked, `true` fixed, `false` cuttable.
A tick needs a line to sit on; on an empty line it un-ticks itself. A
savings line is not asked (a floor is spending), and the derived debt
minimums are fixed by nature and say so.

**Two numbers from it**, both in `engines/cashflow.js`:

- **The minimum viable month** — the fixed lines plus debt minimums:
  what next month costs if everything cuttable is cut. It appears in the
  Monthly Spending card once at least one line has been answered by hand;
  until then the card says what to tick. Lines nobody has answered are
  counted and reported as unasked, never assumed fixed or cuttable — the
  demo with three lines ticked reads "5 lines not yet marked either way".
- **Cuttability** — 1 − floor ÷ spending. The demo: 1 − 2,135 ÷ 3,200,
  33%.

**Runway runs at the floor.** The Runway room gains a "Spend at" choice:
what you spend now, or the floor. The option is disabled with a hint
until Cash Flow has a floor; chosen, it passes the floor as the
expense figure and `expenseBasis: 'floor'`, which the engine echoes and
the room words ("going out at $2,135 a month at the floor"). A typed
spending figure still wins, and the hint says so. The demo's runway
moves from 3 months to 4. Nothing about the floor is stored in Runway;
it is read from Cash Flow each time, which keeps one owner.

**Compatibility note.** `expenseEntry.fixed` is a new nullable field on
every entry; entries written before this read as `null` (not asked),
and `Schema.createExpenseEntry` sets it. `CashFlow.summarise` rows carry
`fixedMonthlyCents`, `fixedAsked` and `fixed`. The Runway room now loads
`engines/projection.js`, `tier0.js` and `cashflow.js`. Rooms updated:
`rooms/cash-flow.html`, `rooms/runway.html`.

**Verified.** `node test/run.js`: a fresh entry not asked; nothing marked
asks rather than assumes; minimums fixed by nature at $305; the floor at
1,500 + 180 + 150 + 305 with four lines unasked; cuttability 1 − 2,135 ÷
3,200; the engine echoing the basis and the money lasting longer at the
floor. A phone-browser walk: tick three lines, read the floor and 33%,
reload and find them ticked, a tick on an empty line refused, Runway's
hint and the switch from 3 months to 4 "at the floor".
`test/alignment.js` on the widened `.cat-row`.

---

## D-083 — Where the new numbers show: the Weather, the Flight plan, and three benchmarks that disagree

*(BRIEF.md §4.5. Closes T4.)* Three places, no new figures — everything
here reads an engine that already exists.

- **The Weather panel** on the dashboard gains two rows from the ratio
  registry: income concentration and worst-year coverage. Its "left blank
  on purpose" note changes from three risks to two: sequence-of-returns
  and longevity still have no honest gauge, but under-insurance is now
  priced piece by piece in the Coverage Checkup (D-071), and the note
  says so and points there.
- **The Flight plan** gains a second strip under the FOO ladder: L1–L5,
  the level as the run of met checks from the bottom
  (`Benchmarks.levelsOfWealth`, D-079), and a sentence naming the check
  that stopped it — "Not yet at level 1. Next: level 1, no high-interest
  debt, and a starter emergency fund in cash" for the demo. A check that
  cannot be judged is said to be unjudgeable, not failed.
- **The Snapshot** gains a "Three benchmarks, and they disagree — here's
  why" card: the SCF percentile, the retirement multiple and PAW side by
  side, then one sentence. `Benchmarks.threeBenchmarks` gives each a
  one-word verdict (ahead / about average / behind; off the chart
  either way counts as a verdict) and writes the sentence: when they
  agree, "rare, and worth believing"; when they do not, what each one
  measures — the percentile ranks against every household your age
  whatever they earn, the multiple scales a milestone to your income,
  PAW expects age × income ÷ 10 and is unforgiving early. Under it, the
  rest of D-079: a dollar at your age by 65, monthly to $1M and $2M, and
  what one more point of savings rate does.

**Why a sentence and not a fourth number.** Averaging three benchmarks
that disagree would be a score, and SPEC §12.7 says no score. The
disagreement is the finding.

**Compatibility note.** No stored shape changed. The Snapshot loads
`engines/benchmarks.js`; the registry gains the `out-benchmarks` anchor.
The dashboard formats the `dollars` and `date` units (D-081) in its
Weather rows.

**Verified.** `node test/run.js`: all three verdicts for the demo (48th
about average, 0.7× against a 1.4× milestone behind, PAW 0.2× behind);
$600,000 invested makes all three say ahead and agree; a blank household
says fewer than two can be worked out. A phone-browser read of the
Weather rows, the levels strip and the benchmarks card; the page sweep;
`test/alignment.js` on the three cells.

---

## D-085 — The Rerank: cost order against value order, and the lines where they disagree

*(BRIEF.md §5. T5, one room.)* `rooms/rerank.html` asks four things in
four stages and shows one picture. The standalone prototype the brief
names was not in this repository, so the room was built from the brief's
spec; nothing was copied, and no localStorage key exists but the spine's.

**Stage 1, what it costs.** With a tracked month, the lines are Cash
Flow's categories (read-only chips linking there) plus any finer line
typed here. Without one, twenty everyday lines from
`data/common_costs.json` are **proposed** (D-060) — scaled to the
household's monthly essentials by the ratio of those to the table's own
essential lines, unverified and said so — and never stored until typed.
A typed proposal becomes an expense entry with `source: 'rerank'`, the
line's label as `descriptor`, and the stable id `rr_<line>` so it replaces
its proposal instead of sitting beside it; "Add a cost of your own" makes
the same kind of entry under a fresh id. The debt minimums ride along as
a derived line from Debt Payoff. Savings lines are not costs and are
left out.

**Stage 2, what it gives you.** Three questions a line: 1–10 through the
shared rating control in its own scope `rerank` (anchors "would not miss
it" / "could not do without"), would-you-miss-it, who-is-it-for. The
rating lives in `ratings.rerank` like every other rating; the other two
answers and the hand order live in `household.rerank.rows`, keyed by the
line id. **Enough's joy ratings are not reused**: Enough rates
categories, the Rerank rates every line including custom ones and the
minimums, on different anchors, and one field cannot have two owners.

**Stage 3, your order.** The rated lines, by rating (miss breaking ties,
then cheaper first) until the person moves one — arrows or pointer drag,
both — after which every rated line gets a `valueRank` and the order is
theirs. A partial hand order (a line rated after the reorder) falls
back to the ratings and says so; "Back to the rated order" clears it.

**Stage 4, the gap.** `engines/rerank.js` ranks by cost and by value and
flags with threshold k = max(3, round(n × 0.25)): **cut** when a line is
in the top k by cost and its value rank trails its cost rank by more
than k; **keep** when it is in the top k by value and its cost rank
trails its value rank by more than k; **ok** otherwise. A need can be
flagged cut and the copy softens — "not going anywhere, but a reason to
shop it, renegotiate it, or shrink it". An unrated line has no rank and
no flag; it is never scored zero. The cut lines add up a year, and at
25× — the 4% rule inverted, named as a convention. The plot is cost rank
across against value rank up, the diagonal being agreement.

**The demo** (Robin's month plus `rerankJoy` in `shared/demo-persona.js`)
flags housing and the debt minimums cut — both needs, so both soften —
and subscriptions and going out keep: $1,805 a month, $21,660 a year,
$541,500 at 25×.

**Compatibility note.** New stored shapes: `household.rerank = { rows:
[{ id, miss, who, valueRank }] }` (`Schema.createRerank`), the rating
scope `ratings.rerank`, and `expenses.entries[].source` gains the value
`'rerank'`. Every other reader of entries already treats a source it does
not know as a line; Cash Flow's summary folds `rr_` lines into their
category like any other. The room order shifted by one for every room
after Enough so the Rerank sits beside it. A new ownership row,
`rerankCut`, reads the flagged year and links to `rerank#gap`. Registered
table: `commonCosts`.

**Verified.** `node test/run.js`: the threshold at five sizes, proposals
scaled by 3,150 over the table's essentials, a typed proposal replacing
itself, every rank and flag on the demo by hand, the sums, a hand order
overruling the ratings and a partial one not, miss breaking a tie, an
unrated line out of the ranking, the schema and registry shapes. A
phone-browser walk through all four stages: use-this on a proposal, the
demo button, an arrow, a drag, the reset, a re-rating changing the gap,
who-is-it-for stored; `test/forms.js` taps through the three input
stages; `test/alignment.js` on the rate rows and the figure pair.


---

## D-086 — Two decision sequences, so they can stop colliding

The D&D entries were written while that tool was going to be its own repository
(DD-004, DD-005), so they restarted their numbering at D-046 — head-on into the
SPARKS entries D-046 through D-052, which already existed. Seven numbers meant
two different decisions each, and which one a reference meant depended on which
file was doing the referencing. `shared/suggest.js` saying "D-046" meant the
scroll-and-tap bug; `dnd/engines/character.js` saying "D-046" meant HP being
measured in weeks.

That was survivable. What was not was the knock-on: parallel sessions kept
reaching for the same next free number, and one side had to renumber on merge
**four times in two days** — SPARKS T3 moved past the D&D T9 entries, then the
D&D T9 entries moved past those, then SPARKS T4, then the D&D type chart. A fifth
and a sixth happened while this very entry was being written; see below. Each
was cheap.
Together they were a standing tax on every merge, and every one of them rewrote
numbers that other commit messages already referenced.

### What changed

The D&D log now has its own sequence. Seventeen entries renumbered in place, in
the order they were written:

    D-046 … D-052   →  DD-001 … DD-007
    D-064, D-065    →  DD-008, DD-009
    D-072 … D-078   →  DD-010 … DD-016
    D-084           →  DD-017

**The SPARKS side is byte-identical to what it was.** That was the constraint
worth holding: seventy-four entries, referenced from dozens of files, none of
them touched. Verified by diffing the two halves of the file before and after
rather than by reading it.

Going forward: a SPARKS entry takes the next `D-` and goes immediately above the
divider; a D&D entry takes the next `DD-` and goes at the end of the file. Two
sessions can now write at once without either having to know what the other is
doing.

### What did not change, deliberately

`dnd/shared/*.js` are byte-identical vendored copies of the SPARKS files, so the
`D-0xx` references inside them are SPARKS numbers and stay exactly as they are.
Renumbering them would have broken the vendored-copy guard — which is precisely
what that guard is for, but a test now says so out loud before anyone tries.

### The guard

`test/run.js` gained a section that enforces the split four ways: every heading
above the divider uses `D-` and every one below uses `DD-`; no number repeats
within a sequence; every `DD-` reference anywhere in the repo resolves to a real
entry; and no vendored copy carries a `DD-` reference. Each was verified by
breaking it on purpose — a `D-` heading below the divider, a duplicated number, a
reference pointing at an entry number that does not exist, and a `DD-` snuck into
`dnd/shared/schema.js` — and watching the right check fail each time.

(The dangling-reference test is why this paragraph describes that case rather
than naming an example number: writing one here would make this entry itself a
dangling reference, and the guard catches that too.)

### Two more collisions, during the pass that was fixing collisions

While this was being written, another session pushed the T5 Rerank entry and took
**D-084** — the number the D&D type chart was using. `main` briefly carried two
entries called D-084, and the merge commit that was supposed to have renumbered
one of them said it had and had not.

Nothing needed doing about it, which is the point: the type chart had already
become DD-017 in this pass, so their D-084 is unique the moment the two branches
meet. That is the whole argument for the split, demonstrated by the problem
occurring one last time and then failing to matter.

It then happened a sixth time, on the very next push: that session renumbered
its Rerank entry to D-085 on the assumption that D-084 was still taken by the
type chart — which by then it was not. So this entry is **D-086**, the next free
number after theirs, and **D-084 is now a permanent gap** in the SPARKS
sequence. A gap costs nothing. A reused number costs a reader pointing at the
wrong decision, which is what all of this is for.

### Compatibility note

**Stored shape:** nothing. This is documentation.

**Rooms updated:** `DECISIONS.md` (17 headings and their cross-references, plus
the divider text, which now describes a scheme rather than apologising for a
collision), `ROADMAP.md` (five D&D-facing lines), `CLAUDE.md` (the convention,
so the next session reads it before writing an entry), `test/run.js` (the guard
and one D&D reference), and the `dnd/` files that cite D&D decisions:
`bestiary.html`, `engines/character.js`, `test/run.js`, `test/parity.js` and
three data-file notes.

**Before writing any of these from a new room:** check which side of the divider
you are on before picking a number, and never renumber a `D-` reference inside
`dnd/shared/*.js`.

---

## D-087 — One life event, three ways: the events engine, the What If room, and the first template

*(BRIEF.md §6.1, §6.2, §6.3 item 1. Opens T6.)* A life event is DATA — a
template in `data/events/` with its questions and a dated diff — and one
engine runs any of them month by month, three ways.

**The engine** (`engines/events.js`). A template's diff is written in a
small expression language over the answers (`"@months"`), the household
(`"$cashCents"`) and the reference tables (`{"table": "travelBands",
"path": [...]}`), with arithmetic, `if`, and table lookups; a missing
operand makes the result `null`, and an item that prices to `null` is
left out and flagged, never taken as zero. The month loop is the
calendar: take-home in, the 401(k) contribution and the *captured* match
out to investments while employed, spending out, one-time costs and
asset moves on their month; investments grow through
`Projection.futureValueMonthlyCents` one month at a time, so compounding
is not re-implemented. Then the Triple D bundle from `data/triple_d.json`:
dream (75th-percentile real returns, income 10% higher after, no gap),
default (median, your income, the template's gap), disaster (25th
percentile, income 15% lower, the gap three times over, and the worst
plausible year from D-068 landing the month the event starts). The
return percentiles are a planning convention in `data/return_bands.json`,
bracketing the household's own 7% nominal. Every column is measured
against the same engine on an empty event. Outputs: the monthly rows,
net worth at the horizon, the shift in the FI date (from the end state
on the dashboard's own terms: what is invested plus the cash beyond the
cushion, growing at the household's assumption with the end state's
residual savings continuing — so the baseline's FI date is the
dashboard's), the thinnest month or the month the cash runs out, the
match lost, and flags.

**The room** (`rooms/what-if-life.html`, explore). Pick an event, answer
its questions — defaults proposed (D-060), a table's opinion where it
has one — read the three columns and the cash line, write the disaster
line in your own words, and optionally save. **Nothing is stored but a
saved scenario**: `scenarios[]` gets the event id, the answers and the
disaster line, dated; every other answer is a what-if. The question
form is guarded and rebuilt only when the event changes.

**Templates are graded by a schema.** `test/events.schema.json` says
what every template must carry (questions with units or choices, the
four diff lists, protect, cut, outputs, a horizon, sources), and
`test/run.js` validates every file in `data/events/` against it with a
small validator of its own. Templates load on demand through
`Reference.loadEvents()`, not with every page.

**The sabbatical.** Months off, where, leave-or-quit, starting when. No
paycheque for the duration; living away on top of home costs from
`data/travel_bands.json`; COBRA for a single person from
`data/cobra_aca_2024.json`; the lines The Rerank flagged, cut for the
duration. Quitting adds a re-entry gap from `data/reentry_gap.json` (the
BLS median spell, 2.3 months; the disaster column triples it); unpaid
leave has none. All three tables are marked unverified or convention
and say so. The demo cannot afford six months off: cash runs out in
month 7 in every column, $960 of match is lost, and the default column
ends $46,143 behind doing nothing at ten years — which is the point of
showing it.

**Compatibility note.** No stored shape changed; `scenarios[].diff` is
used for the first time, as `{ templateId, answers, disasterLine,
savedOn }`. New tables: `tripleD`, `returnBands`, `events` (the index),
`cobraAca`, `travelBands`, `reentryGap`.

**Verified.** `node test/run.js`: the schema on every template, the
expression language on nine cases, the demo's default sabbatical
re-derived month by month for months 1 and 12 by a longhand loop (cash
$10,970 then −$14,386; investments from (48,000 + 240 + 120) grown a
month at 5%), eight months of match lost, the cash-out month, the three
columns ordered, the gap at 0 / 2 / 7, the $17,200 shock, a blank
household naming its four missing inputs. A phone-browser walk: the
proposed defaults, typing 3 months, switching to unpaid leave, saving
with a disaster line, reopening after a reload. `test/forms.js` on the
question form; `test/alignment.js` on the question grid and the columns.

---

## D-088 — The life-event templates, one by one

*(BRIEF.md §6.3, items 2–10. A running entry: each template is its own
commit and adds its block here. The engine and the first template are
D-087.)* Two things every template shares, decided with the second one:

- **A template may call an engine by name.** `{"fn": "takeHomeMonthly",
  "args": {...}}`, `realHourly`, `levelPayment`, `seTax`: the engine
  builds a household with the stated figures swapped in and hands it to
  the real function, so a template never re-derives a tax, a wage or a
  payment. `coalesce` picks the first non-null of a list — a state's
  figure, else the national one — and a `source: 'none'` asset move is a
  loss with no cash on the other side. Income items may scale the plan
  contribution and the match separately from the paycheque.
- **Lines.** A template may name figures to show beside the columns
  (`lines: [{ id, label, unit, value }]`), evaluated from the default
  run; they are how a template says something with no verdict attached.

**2 · A child, or another.** Count, first birth in N years, childcare or
a parent at home (and whose income stops), public or private school,
saving for college or not, the state for childcare prices. Costs come
from `data/child_cost.json` — six three-year bands rising with age, in
the region of the USDA's $310,000 to seventeen, private school at about
$12,000 a year, a birth at the out-of-pocket maximum when the Coverage
Checkup has one and about $3,000 otherwise, and college saving as a
convention (half or a full in-state degree) — and
`data/childcare_by_state.json`, centre-based infant care for 51 states
recalled from Child Care Aware 2023 with a national fallback. All
unverified and marked so. A parent at home takes that person's share of
income out for five years; with one income entered, "my partner's"
stops nothing and the copy says so. The lines: term life at 11× income
beside what is in force (unknown, not zero, until Sleep At Night has
it), your age at the birth and when the child turns 18 — Die With Zero's
time buckets stated as facts, with no verdict — and the cost to
seventeen. The demo's cash runs out in month 37 with one child in NC
childcare, which is the finding. Children born in one batch rather than
staggered: an approximation, named here.

**3 · A job offer.** The offer card: base, bonus, their match as a share
of salary, honest hours, commute, remote days, start, unvested match
forfeited, months before their match begins (90 days proposed). Income
scales by the ratio of take-homes through the one tax lookup; the plan
contribution follows the new base; the match follows theirs and is zero
through the wait; the forfeited match comes off investments the month
you leave. Lines: an hour of your life on each side through
`engines/hourly.js` (the demo's $90,000 at sixty hours is worth *less* an
hour than its $72,000 at forty), take-home on each side, and one more
point of the new salary. No new tables.

**4 · Buying a place, or a house hack.** Rent now (the tracked housing
line, else 30% of gross), a price proposed at 18× a year of it
(`data/price_to_rent.json`), the down payment share, the rate from the
dated `data/mortgage_rates.json`, units in the building with you in one,
rent per other unit, the hassle of being a landlord, closing when. The
rent stops; the level payment (through `engines/projection.js`), tax,
insurance and upkeep at the rules of thumb in
`data/housing_conventions.json` start; closing costs leave in cash; the
down payment becomes equity, the rest of the building an asset against
a loan that amortises month by month — the engine now carries loans a
template takes on. Rent from the other units arrives less 8% vacancy.
Lines with **guardrails**: PITI over 25% of gross reads amber, a DSCR
under 1.2 reads amber, cash after closing under the cushion floor (the
sleep-at-night number, else three months of spending) reads red; plus
NOI, cash-on-cash, and what selling in year two would cost at 11% of
the price with no price change. A line may now reference an earlier
line (`"^piti"`) and carry `warn` / `bad` expressions. The demo's
$324,000 at 20% down is red on cash and amber on the ratio, and the
cash runs out in the closing month, which is the honest answer.

**5 · Going freelance.** A revenue target (your gross, proposed), months
to get there, honest hours, startup costs, quit or keep the job
part-time at half pay. What the target leaves a month is a `derived`
figure the template names once — the take-home of the revenue as if
salary, less half the self-employment tax a month (the half an employer
would have paid), both through the engines that exist — and the ramp is
three steps of a sixth, a half and five sixths. Quitting adds COBRA.
Lines: the SE tax at the target, the real hourly wage now, the rate an
hour must bill to match it with the SE tax on top (÷ 0.86, a stated
approximation), the billable hours a week that implies (amber when it
exceeds the hours you said — the demo's $72,000 needs 57 billable hours
at the rate that matches a 40-hour job), and the ramp length. Templates
may now carry `derived` figures.

**6 · Moving somewhere else.** Forty cities in `data/col_index.json`, a
hand-curated cost-of-living index recalled from the composite
publishers and marked unverified, with the state each city is in; the
move itself from `data/moving_cost.json` in three bands. The month is
scaled by the index ratio; the state income tax on each side comes from
`engines/tax.js` through a new `stateTaxAnnual` engine call with the
state swapped, and the difference lands on the month. Lines: the ratio,
the same month there, the state tax here and there, the move. Raleigh to
Austin on the demo: a month a fifteenth dearer, $2,375.75 of NC tax
gone.

**7 · A debt sprint.** Months of sprint, the amount freed each month
(proposed from up to four of The Rerank's cut lines that are not needs,
dearest first; $200 stands in when nothing qualifies), starting when.
The cut lines go to zero for the sprint and every freed dollar is paid
onto the debt — a new `debtPayments` diff list: cash out, debt down,
never past zero. Lines from Debt Payoff's own engine through two new
calls, `debtFreeMonths` and `debtInterest`: months to debt-free at the
minimums and with the amount kept up for the full course, and the
interest saved between them. The sprint itself stops when you said;
the full-course figure is labelled as such.

**8 · A big purchase.** Cost, uses a year, years it lasts, the joy you
predict, and buying in a month — the thirty-day wait built into the
default. One-time cash out; otherwise the template changes nothing and
writes nothing. Lines: the real hourly wage, hours of your life the
price costs, cost per use through Quick Math's engine (`costPerUse`),
joy per $1,000 on your own rating with no verdict attached, cash after
against the cushion floor (red under it), and when the thirty days end.
Five-year horizon.

**9 · Stopping, or coasting.** Stop at the age you chose (FIRE Number's
target when set), claim Social Security at 67, plan to 95, the stock
share of the portfolio then (Where It Goes's target when set), spending a
year in today's dollars. Two engines arrive with it. `engines/vpw.js` is
the Bogleheads variable percentage withdrawal: the share of the
portfolio to take each year rises with age from `data/vpw_table.json`
(recalled, unverified), interpolated by age, the nearer of two stock
columns; the plan runs a year at a time to the plan age, withdrawing
the share, growing the rest at the column's real return, and calling a
year covered when the withdrawal plus other income meets the spend —
which falls 1.5% a year past 70, a stated convention. `engines/ss.js`
estimates Social Security from the income entered: the current income
every year from 22 to the stop age, capped at the wage base, averaged
over 35, through the bend-point formula and the early or delayed claim
factor, from `data/ss_bend_points_2026.json` (recalled, unverified).
Health cover to 65 is the marketplace's applicable share of that
spending, capped at 1.5× the benchmark silver. The template's lines are
**per column**: the portfolio at the stop age (the ten-year run's end,
then the projection loop at the column's return), the first year's
withdrawal, holds-to-95, the first short age, the peak age, and what is
left — so the three D's each answer. The demo cannot stop at 55 on any
column, short from the first year, which is the honest answer; nothing
here decides whether to coast, it shows what stopping would need.

**10 · Two households, one.** Their gross, their month, their cash,
investments and debt, the lines you would stop paying twice (your
housing line proposed: one home, not two), merging when. The room shows
a paste box for a partner's exported household on this template only:
the file is **inspected, never imported** (`Spine.inspectImport`), its
five figures become answers on the page, and nothing is stored — the
note says so. Income becomes one take-home for two, filing jointly,
through the one tax lookup with the filing status swapped, scaled as a
ratio so your plan and match continue; their month joins less the
duplicates; their cash, investments and debt join in the first month
(a `cash` target with no source is money arriving). Lines: the two
take-homes apart against the one together and the filing change
between them (a penalty reads negative), the duplicates, the month
together, the FI number for two at 4% and the FI ratio for two beside
yours alone. Without a partner's figures the event prices nothing and
says so.

**Verified.** `node test/run.js`: for each, month 1 and month 12 of the
default run on the demo by longhand — the child's first year at $3,150 +
$1,200 + $1,000 + $250 a month with the $3,000 birth in month 1; a parent
at home stopping the one income; the national fallback for an unknown
state; the offer's take-home from the tax table, no match for three
months then 4% of $90,000, the $2,000 off investments, three months of
the old match lost, and the same job offered again changing nothing.

---

## D-089 — 3D on the dashboard: every instrument three ways, with nothing changing but the assumptions

*(BRIEF.md §6.4. Closes T6.)* A "3D" toggle on the panel. On, each
instrument fans into three small values under its figure — dream,
default, disaster — from `Instruments.threeD`, which runs the events
engine (D-087) on the **empty** template: the Triple D bundles on the
baseline, no event. Altitude is net worth ten years out; Thrust is the
first month's savings rate with income at the bundle's multiplier; Fuel
is cash at the horizon in months of the spending then; Distance is the
FI year from the run's end state. Load and Heading do not move with
returns or income-after — debt-to-income is a ratio of today's figures
and the FOO step is a placement, not a projection — so they stay as
they are and the column says why. Off, the panel is exactly as before.

**Why the empty template and not a fourth instrument.** The point of
Triple D is the spread, not a number; the dashboard already has the six
numbers, and the toggle shows how wide "about" is for each without
adding a seventh. The setting is remembered for the session only
(`sessionStorage`), never stored with the household.

**Compatibility note.** No stored shape changed. `shared/instruments.js`
gains an optional Events dependency; `index.html` loads the events
engine and everything it can call (`rating`, `rerank`, `hourly`,
`selfemployed`, `tax`, `debt`, `quickmath`, `vpw`, `ss`). Pages that
load instruments without the events engine (Refresh) simply cannot fan
out, and nothing on them asks to.

**Verified.** `node test/run.js`: three columns in the table's order,
net worth dream > default > disaster with the default equal to the
baseline run, the default savings rate as (4,860 − 3,150 + 120) × 12 ÷
72,000, load and heading declining to move, the FI year a year and the
dream's no later, a blank household naming what it needs. A
phone-browser tap of the toggle on the demo, the setting surviving a
reload, and the whole-site sweep — which also caught the dashboard
missing the rating module the Rerank engine needs, fixed here.

---

## D-090 — The Skill Stacker: three at a time, did or didn't, and a ledger of what each day was worth

*(BRIEF.md §7. T7.)* A room, `rooms/stacker.html` (about-you, order
20; The Rerank stays at 19 and everything from What Matters on moves
one down), an engine, `engines/skills.js`, and a catalogue authored in
`dnd/data/` beside the D&D sheet it draws its levers and sub-stats
from: `skills.json` (twenty-six skills), `hundred_ways.json` (thirty
everyday savings, read as trialable skills), `stacks.json` (five stacks
with a cap each) and `curves.json` (the three curves' parameters). The
SPARKS loader registers them as `skills`, `stacks`, `hundredWays`,
`curves` at `../dnd/data/…`; the D&D loader registers the same four by
bare name.

**What a skill is.** `kind` once / habit / periodic; `effect` either
`risk` (worth $0 a year, on purpose — the Anchor stack is worth nothing
in a normal year and everything in a bad one, and a number on sleep
would be a lie), a fixed `cents` a year, or a `formula` in the
life-events expression language (D-087) over `Events.context`, so
"a third of the dining-out line" is the same figure whichever room
asks. The context gains `diningMonthlyCents`, `groceriesMonthlyCents`,
`foodMonthlyCents`, `matchLeftMonthlyCents` (the cap's match less what
the current contribution captures) and `rerankCutOneMonthlyCents` (the
dearest non-need line The Rerank flagged). A once-skill may carry
`verify` — an ownership row and a test (`present`, `equals`,
`gteField`, `source`) — and is **marked done from the household's own
facts on load, never asked**; if the fact stops holding it is un-marked,
unless the person marked it done themselves.

**States and the three-slot rule.** once: locked → available → trial →
done. habit: locked → available → trial → practicing (seven of the last
thirty days) → habit (twenty-one) — and back: fourteen unlogged days
(the skill's own `decayDays`, thirty for cut-one-line) to practicing,
forty-five to available with a lapse counted and the log kept.
periodic: locked → available → practicing → done, due again after
`everyDays`. At most **three** may sit in trial or practicing; a fourth
is refused with the reason and the three in the way. A habit that has
become a habit frees its slot. A prerequisite is met by done or habit.
The thresholds live in `skills.json` `rules`, not in code.

**The ledger.** A did-tap writes one row `{on, skill, cents}` at the
skill's annual value ÷ 365 (cook dinner on the demo: 93,600 ÷ 365 =
256 cents); a didn't-tap removes that day's row and counts a second
miss when yesterday was a miss too. The only totals are sums of rows:
today's, the ledger's, and the ledger × the wealth multiplier at your
age (D-079) for "at 65". **Feedback, not gamification** (BRIEF §7 D-C):
no streaks, no points, no badges; the days-of-thirty count is the
state's own arithmetic.

**Stacks.** A waterfall: each skill's stand-alone value while active,
times its declared synergy multiplier when the partner is active too,
summed, then capped at the stack's `capCents` or twelve months of its
`capField` line when that is known and smaller — so The Kitchen can
never claim more than the food actually bought. **Next skill**:
available, prerequisites met, at the FOO step or at none in particular,
best return on effort (value ÷ (learnHours + practiceMinutes × 365 ÷
60)), nudged ×1.5 toward the lowest D&D sub-stat when a caller says
which; the hundred ways are never the suggestion.

**Automation ratio** (§4.3, listed unavailable since D-081): the annual
value of active skills marked "runs by itself" over every active
skill's, nothing to say until an active skill is worth dollars.

**Compatibility note.** The household gains `skills` — a map by
catalogue id of `{state, kind, startedOn, log[], misses[], last30,
secondMisses, lapses, valuePerDayCents, valueSource, automated, dueOn,
lastDone, verifiedOn, verifiedBy}` — and `practiceLedger[]` of
`{on, skill, cents}`. Both are owned by the Stacker
(`shared/ownership.js` `practiceLedger`). `Spine.updateProfile` merges
`skills` field-wise like the other small fact objects, so a room
writing one skill cannot wipe another; the ledger is replaced whole
like `goals`. `Instruments.outputs` (and so every snapshot from the
dashboard and Refresh, which now load the engine) carries
`practiceLedgerCents`, which is what the Annual Review will read. No
existing field changed shape; a household saved before this loads with
an empty map and an empty ledger.

**Verified.** `node test/run.js`: the catalogue graded (unique ids,
levers and sub-stats on the sheet, prerequisites and synergies real,
habits decay and periodics recur, effects well-formed, verify clauses
against ownership rows); on the demo the facts prove enter-the-facts,
name-your-debt and starter-fund ($9,500 cash ≥ $2,500 deductible) and
not capture-the-match; the match left = 72,000 × (6% − 4%) × 50% = $720
a year; cook dinner 12 × 30% × $260; a locked, a done and a fourth
equip refused with reasons; eight days → practicing at 256 a day and a
2,048-cent ledger; two didn'ts → one second miss; twenty-one → habit and
the slot freed; decay at 13, 14 and 45 days; a periodic due in thirty;
The Kitchen's waterfall by hand (54,000 + 93,600 × 1.25 = 171,000) and
its cap at twelve months of a lean food line; the ledger at 65 =
2,048 × the multiplier from 32; the automation ratio 0 then 1, read by
Every Ratio; the ledger in the instruments. A phone-browser tap
through take-on, did, and the refusal on the demo; the alignment pass
on the figures and the three curves; the whole-site sweep.

---

## D-091 — Charts: one module, three shapes, and the Personal Finance Club look

*(A systemic pass, asked for by name: "way more pie charts, donut
charts, bar charts and graphs", in the style of Personal Finance Club's
calculators.)* `shared/charts.js` is the one way a number becomes a
picture: `area` for anything over time, `donut` for anything that is a
share of a whole, `bars` and `stacked` for anything compared. Each takes
figures an engine already produced and returns markup; nothing is
computed there beyond scales and ticks, and a missing Result draws
nothing rather than a stand-in — a chart's empty state is a sentence.

**The look.** A dark panel with a hairline border, faint gridlines,
short dollar ticks ($48K, $1.2M), a filled area under the line the
chart is about, thinner lines for what it is measured against, a
dashed horizontal line for the number to cross, and a legend under the
plot. The palette is named for what a series usually is — `growth` (the
red PFC draws the compounding line in), `contributed`, `target`,
`spend`, `debt`, `cash` — plus eight steps for donuts, all chosen to
stay apart on the navy. Styles are in `theme.css` under "Charts"; no
room redeclares them.

**The growth line.** `Projection.pathCents` is the loop every growth
chart draws — a balance year by year, contributions in until a stop
year, spending out after — so FIRE's line to retirement and past it,
and the dashboard's "climb ahead", are the same arithmetic with
different knobs. It sits in `engines/projection.js` with the other
compound loop rather than once per room, and is mirrored to `dnd/`.
The "what you put in" line is drawn net of withdrawals and floored at
zero: once the pot is paying you back it has nothing more to say.

**Where the pictures went.** The dashboard: a ring of what net worth is
made of (debt as its own slice, so the ring is the whole balance sheet)
and the climb ahead against the FIRE number. FIRE: the path to and past
your stop age against your number, crossing marked. The Skill Stacker:
the ledger by skill, the five stacks as bars against their caps, and
the three curves through the same module (the poster's claim drawn
dashed past its clip). Cash Flow: a ring of the month by category and a
stacked bar per bucket, in place of the old split bar. Savings Rate: a
year's gross as tax, spending and saved; the what-ifs as bars. The
Snapshot: assets by category, and your net worth as a bar among the
SCF breakpoints for your age band. The Statement: the three portfolios
as a ring, owned against owed as bars running both ways from one zero,
the liquidity ladder as one stacked row. Debt Payoff: what is still
owed month by month with the other orderings dashed behind it and each
payoff marked, interest and months per strategy as bars, each debt's
balance. Goals: each goal's progress toward its own target, and a
month's requirements stacked. Runway and The Windfall: their hand-drawn
plots redrawn through the module (the cushion floor and "runs out"
marked; all at once against spread out). Every Ratio: each banded ratio
as a bar in its verdict's colour with the comfortable range shaded
behind it, incomplete ones saying what they need. What If, Life: net
worth and cash for dream, default and disaster over the horizon, doing
nothing dashed, the FI number and the cushion floor as the lines to
watch.

**Not done, on purpose.** No chart is interactive: a static SVG is
readable on a phone, prints, and cannot get out of step with the
figures beside it. No chart is drawn from a stand-in number. The radar
stays as it is; it is not a share, a comparison or a series.

**Verified.** `node test/run.js`: short-money labels, nice steps and
ticks by hand, an area chart's fill, line, target line and legend, a
donut's arcs as shares of 2π·42 and a zero slice listed but not drawn,
bars sharing a zero when one is negative, a stacked row's parts, the
path on the PFC calculator's own example ($1,000 + $4,000 a month at 7%
for 40 years lands near $10.5M; a pot drawn too hard names the year it
empties). Every page screenshotted on a phone-shaped browser with the
demo, the whole-site sweep, the forms walk and the alignment pass.

---

## D-092 — Unemployed is an answer with a sequence of its own

*(From the phone: "it's not taking into account the unemployment";
"put in Unemployed and create a sequence for that".)* The working
situation had "not working right now" and then went on asking what you
earn, so a household between jobs never reached the dashboard: income
stayed on the list of things Start Here still needed, and the map said
so. Being out of work is not a shade of not working; it has its own
facts and its own number.

**A sixth working situation.** `unemployed` — "Unemployed — looking for
work": not earning, no employer, `seeking: true`. "Not working" is
relabelled "not working, and not looking right now" (caregiving,
studying, a break) and keeps its meaning.

**Its card.** `#q-unemployed` in Start Here, asked only when the status
says so: the month the job ended; whether unemployment is coming —
getting it, applied and waiting, haven't applied, not eligible — and,
for the first two, what it pays a week and how many weeks are left,
with the state's cap and weeks **proposed** from `data/ui_benefits.json`
(never stored until tapped; the benefit is set by the state from your
own wages, so the cap is the most it could be, not what it is; at half
of the last pay when that is known); severance or final pay still in
hand; what the last job paid a year. Stored on the person as
`unemployment { since, benefitStatus, benefitWeeklyCents,
benefitWeeksLeft, severanceCents, lastGrossAnnualCents }`, owned by
Start Here.

**Income stops being the gate.** The `grossAnnualIncome` ownership row
does not apply while between jobs with nothing entered — "the runway is
the number that matters now" — so the dashboard's needs are met, the map
stops chasing it, and the income card is only shown when there is a
partner whose pay belongs on it. Anything entered (a partner's pay, a
benefit typed as income) counts as before, and then the row applies
again. `Schema.benefitMonthlyCents` is weekly × 52 ÷ 12 while receiving
or applied, $0 for not applied or not eligible, and nothing until
answered; the engines that need a gross income (savings rate, DTI, the
FI year) say so rather than pretending.

**The dashboard opens on the runway.** The next action for a household
between jobs is `Runway.project` on the laid-off preset fed these facts:
"the money lasts N months at $X a month (M on cash alone); a search
typically runs 2.3 months, 4.8 on average" — the re-entry gap table,
labelled unverified — critical when the runway is shorter than the
median. Runway itself opens on "laid off" with severance, the benefit a
month and its months already in the boxes, page-local as before.

**Also from the phone, same pass.** "I'm under 26 and don't have a
deductible": one tap writes a typed zero for the highest deductible, an
answer step 1 reads as nothing to cover. The debt timeline: one coloured
line per debt with a dot where it falls, calendar months on the axis, and
the list naming the month, the time and the interest from the balance it
started at (the labels had piled onto one spot). The Statement's owed
bars consolidate by kind — every credit card in one bar, a colour each.

**Dependents, and disability.** "Does anyone depend on your income?"
is a card of its own (`household.dependents`: null, true, or a
deliberate false). "No" takes term life off the Coverage Checkup and off
every list of needs — life cover replaces an income someone else lives
on, and nobody living on it makes it a choice, not a gap. "On
disability" is a seventh working situation: not working, no employer,
and the benefit is income, entered on the income card the way a pension
is.

**And "no debt" finally reads as zero.** `Schema.totalDebtCents` and
`monthlyDebtPaymentsCents` returned incomplete for an empty list even
when `meta.hasDebt` was a deliberate false (D-061), so a debt-free
household's Altitude and debt-to-income never resolved. With "no debt"
answered and nothing listed they are $0; unanswered, an empty list is
still incomplete — empty is not zero.

**Compatibility note.** `person.unemployment` and `household.dependents`
are new; a household saved
without it loads with every field null. `employmentStatus` gains the
values `unemployed` and `disabled`; `Schema.EMPLOYMENT_STATUSES` has
seven rows and every consumer builds from it. `Debt.simulate` schedule rows gain `balances`
(per-debt), and the result `startingBalances` and `debtLabels`. No
existing field changed shape.

**Verified.** `node test/run.js`: the sixth status, the benefit at
$350 × 52 ÷ 12 = $1,516.67 a month for 2.8 months, income not applying
and applying again with a partner's pay, the dashboard with nothing left
to ask, Start Here listing the card, the runway by hand ($6,000 and
$3,000 a month with $1,000 of benefit for three months: three months,
out in the fourth; two on cash alone). `test/forms.js`: the card's taps
and typing on a phone. Screenshots of the card, the dashboard's
between-jobs action and Runway prefilled.

---

## D-094 — One pager in, one pager out: the core

*(The brief, "SLAF Money Rooms": "One pager in, one pager out. A person
fills in one short page, everything else prepopulated, and gets a
dashboard back. The dashboard is home. Every number on it opens the room
it came from." Build order: core, then the input page, the dashboard,
the room template on Real Hourly Wage, then rooms in tranches, and
History last; stop for review after each. This entry is the core, the
first of those; the rest are logged as they land.)* Nothing here is a
room. It is the four things every room and page will lean on, written
once so they cannot drift: a command log on the spine, the gate, the
lens, and which rooms exist for whom. T8 (D-093, the FI-losophy rooms)
is set aside for this pass — see `LATER.md`.

**Where the brief's schema went.** The brief writes the household as dot
paths under `slaf:spine:v2` with `spine.set(path, value, label)`. The
household already has a shape (D-047 onward) that thirty rooms read, so
the shape stays and `set(path)` is layered on it: `Spine.set('meta.noRent',
true, 'No rent')` writes the dot path, `Spine.get(path)` reads it, and the
existing helpers (`upsertAsset`, `setMonthlyExpenses`, …) keep working —
every one of them goes through the same `save()`, which is where the log
lives. The storage key stays `slaf.household.v2`; the brief's key would
have meant a migration for nothing. Likewise the registry: the brief's
`rooms.json` fields — `id, title, file, reads, writes, requires,
dashboardNumber, order` — are already the registry rows' fields (`needs`
for reads, the ownership rows for writes, `order` from the path), with
`requires` new, and it stays a JS module rather than a JSON file that
needs an async load before the map can draw.

**The command log.** Every `save()` diffs the household against the last
one saved — leaf by leaf, plain objects recursed, arrays compared whole
— and records what moved as one entry `{ label, ts, changes: [{ path,
before, after }] }`. `Spine.undo()` applies the befores and moves the
entry to the redo stack; `redo()` the afters; a fresh write clears redo.
`Spine.batch(label, fn)` records everything inside `fn` as one entry —
the one-pager's "See my dashboard", an import, a situation change. The
label is the caller's or, failing that, the first owned field that
moved, formatted from the ownership row: "Cash & savings $9,500 →
$12,000" — the hover text on the button. The stacks live in
`meta.undoStack` / `meta.redoStack`, so they survive a reload and go
with `reset()`; the cap is 100 entries, oldest off. What is never in the
diff: `meta.updatedAt`, `meta.confirmedAt`, `meta.visitedRooms`,
`meta.createdAt` and the stacks themselves — undoing a number does not
un-confirm it, and the clock is not history. An export leaves the stacks
behind: the log is this browser's, not the household's, and a share
code should not carry a hundred edits. `shared/undo.js` draws the two
buttons top right on every page (thirty pages carry it), each saying
what it will do or why it cannot ("Nothing to undo"), with Cmd/Ctrl-Z
and Cmd/Ctrl-Shift-Z doing the same except inside a box being typed in,
where the browser's own undo keeps its meaning. Every page already
re-renders on the spine's change notification, so undo redraws without
a load.

**Undoing a gate change restores every field the gate removed.** The
brief asks for this to be tested explicitly, and it is: employed with a
50%-of-6% match and a 6% contribution, then one batch "Now retired" that
sets the status and removes the match and the contribution (the retirement
branch no longer exists, so its facts go — absent, not hidden); one undo
brings back the status, both match numbers and the contribution; redo
takes them away again; and after a reload the undo still works.

**The gate.** `shared/gate.js` is the whole of "what's your situation?":
six situations — employed, self-employed, between jobs, student, retired,
mixed — each mapped to one working status (`employed`, `selfEmployed`,
`unemployed`, `student`, `retired`, `both`) and naming the dashboard's
lead number (savings rate and the FI date; owner's pay and the
quarterly; the runway in days; the loan trajectory; the withdrawal
rate). `student` is a new eighth working status: earning, no employer.
`Gate.exists(household, key)` is the single check every room and every
computation calls — never `if (value === 0)`. The branches: `income`,
`retirement` (with `employerMatch` and `payroll` following it), `ownWork`
(with `variableIncome` and `quarterlyTax`), `unemployment`, `pension`,
`stipend`, `partner`, `hours` and `realHourlyWage`, `career`,
`savingsRate`, `decumulation`, `protection`, `dependents`, `childcare`,
`daySchool`, `debt`, `studentLoans`. Unanswered situation: everything
that needs no fact exists, so the map before the intake shows every
room. Between jobs: `income` exists only once something is coming in
(severance typed, a partner's pay). A student has no `protection` branch
and does have `studentLoans`; a retiree has `pension` and `decumulation`
and no `hours`, `savingsRate` or `career`. `fieldsFor(situation, h)`
lists the one-pager's cards in order — never more than ten, the partner
card only for two adults, the 401(k) card only where a match could exist
— and `guesses(situation, h, tables)` proposes a default for every
guessable control with where it came from, from
`data/onepager_defaults.json` (US median pay, spending as a share of
gross, a month of cash, the common deductible — all `unverified`) plus
the milestone multiple for investments, the most common match, and the
state's benefit cap for someone between jobs. Nothing in `guesses` is
stored: the page proposes, "See my dashboard" commits what was left
untouched and flags it in `meta.guessed[fieldId]`; the spine clears the
flag the moment a real reading replaces it. The ownership chip has a
third state for it (`slaf-owned--guess`, "a guess — fix it in …").

**Which rooms exist.** `Registry.REQUIRES` names the branch a room needs:
Accounts needs `retirement`; Real Hourly Wage and Worth the Hassle need
`hours`; Savings Rate and FIRE need `savingsRate`; Self-Employed needs
`ownWork`; Credential and Side Hustle need `career`. `forHousehold(h)`
is the map for this person, `byTag(tag, h)` filters the drawer the same
way, and `map.html` passes the household. A retiree's map loses eight
rooms; someone between jobs loses the wage and the savings rate and
keeps the runway; the demo (employed) loses only the own-work room.

**The lens.** `shared/lens.js` is the one toggle every room will carry:
`$`, `hours`, `bought`, `pushed`. Hours is dollars over the real hourly
wage — the same `Hourly.realHourlyWage` the room shows — and is absent,
not disabled, when the household has no `realHourlyWage` branch
(retired, between jobs). Bought and pushed are how many months FI moves
if the amount were saved instead, or spent: years-to-target from the
projection engine with the household's real return, the FI number and
this year's savings — the three the dashboard's Distance uses — run
twice, from today's investments and from investments ± the amount. The
projection's `yearsToTargetCents` answered in whole years, so $10,000
read as "FI unmoved" whenever it did not cross a year boundary; it gains
`fractional: true`, interpolating inside the crossing year (start 0, no
return, $400 a year to $1,000: 2.5 years, 3 whole). On the demo $10,000
saved is FI five months sooner, spent five months later; $1,000 is
"< 1 mo". The mode is per session (`sessionStorage`), never a household
fact, and falls back to dollars.

**The schema, for what the tranches will need.** `household.dependents`
is now a list `[{ age }]` — a bare `true` from D-092 loads as one person
of unknown age, `false` as an empty list, unanswered stays null — so the
childcare and day-school branches can read ages. The Sleep At Night
row owns it (it was Start Here's for one release). `insurance.health`
gains `{ type: employer | marketplace | cobra | medicaid | parent | none,
monthlyCents }`; `household.estate` `{ beneficiariesSet, willExists,
poaExists }`; `household.giving` `{ pctOfIncome, annualTargetCents }`;
`household.oneOffs[]` `{ id, label, cents, direction: in | out, on }`
(an unknown direction reads as out — money leaving is the safe reading);
`community.daySchool`; an income source's `variableLowCents` /
`variableHighCents` with "a month on average — it varies" as a pay
basis; `assumptions.returnReal` 0.05 and `inflation` 0.03;
`meta.guessed`, `meta.noRent`, and the two stacks. Everything starts
null or empty; nothing existing changed shape except `dependents`.
`Money.formatAsTime(cents, wageCents)` is the hours formatter (minutes
under an hour, tenths under a hundred).

**Not in this repo, for the record.** The brief says to read "Student
Loan Decision" and "Money Calendar & Pay-Later" before writing anything.
Neither is a room here — both are ideas in `SPEC.md` / `ROADMAP.md` —
so the rooms read were Real Hourly Wage, the map shell, Start Here, the
dashboard, Runway and Debt Payoff.

**Compatibility note.** `household.dependents` changed shape: boolean →
array of `{ age }` (true → `[{ age: null }]`, false → `[]`, null → null)
via `Schema.createDependents`, applied on every `createHousehold`. Rooms
updated to match: Sleep At Night, Start Here, the ownership rows
(`dependents`, `termLife`). A future room reads it as a list and never
compares it to `true`. New fields (`insurance.health`, `estate`,
`giving`, `oneOffs`, `community.daySchool`, `variableLowCents` /
`variableHighCents`, `meta.guessed`, `meta.noRent`, `meta.undoStack` /
`redoStack`) load null / empty from any older save. `Schema.EMPLOYMENT_STATUSES`
has eight rows (`student` added). `Spine.save` now records history:
a room that writes many fields in one gesture should wrap them in
`Spine.batch(label, fn)` or the undo button will step through them one
at a time. `Projection.yearsToTargetCents` returns whole years unless
`fractional: true`; no caller changed.

**Verified.** `node test/run.js` (11,619): set / undo / redo / batch /
the 100 cap / labels from the ownership rows / the log after a reload /
reset clearing it / exports without it; the gate-change batch above;
`exists` for every branch in every situation as a truth table; the lead
per situation; the cards under ten with the partner and 401(k) cards
conditional; the guesses from the tables; `forHousehold` per situation;
the lens by hand against the closed form n = ln((T + C/r)/(P + C/r)) /
ln(1 + r) within a tenth of a year, hours = cents ÷ wage, the
fractional projection; every new schema branch and the `dependents`
migration. `node dnd/test/run.js`, `node test/export.js` (the round
trip minus the log), `node test/forms.js` on a phone-shaped browser, and
the sweep of every page for console errors. "One pager in, one pager
out" is not yet true: this is the core under it; the input page is next.

---

## D-095 — The one-pager: one gate, ten cards at most, every box a guess until it is yours

*(The brief's step 2, the input page. And the direction that followed:
"do not stop until you finish all items including the later section" —
so from here the steps run without a review stop, and `LATER.md` is a
build list, not a parking lot.)* `rooms/start.html` is rewritten as one
page. The gate is the only question that is always asked; the cards
that follow are the ones `Gate.fieldsFor` lists for that answer, in that
order, and nothing else is on the page. A retiree's page has no 401(k)
card; it is not hidden, it is not in the document. Every box opens
already holding a guess from `Gate.guesses` (D-094), shown dashed with
where it came from, and "See my dashboard" commits whatever was not
typed over as a guess, flagged in `meta.guessed`, in one undo entry.

**Built once, moved never.** All twelve cards any situation could show
are built from `Gate.allCards()` on load and only ever have their
`.value` set (`LIVE-FORM: built once`, D-034). The set on the page is
reconciled only when the situation or a choice changes it — a gate tap,
"two of us", "yes" to debt — never on a keystroke, so a box being typed
in is never detached under the finger. Cards that stop applying are
removed from the container and kept in memory; they come back with their
controls intact when they apply again.

**The gate change is one batch.** Tapping a situation writes the status
and removes what no longer exists — the match and the contribution when
there is no employer, the own-work source when there is no own work,
the benefit facts when no longer between jobs, the pay source when
between jobs — inside `Spine.batch('Situation: …')`. One undo brings
back the status and every field that went with it; the walk-through
confirms the 401(k) card returns with its 50%-of-6% and the 4%
contribution.

**The badge.** Every box carries a confidence badge: *guessed* (in
`meta.guessed`), *you entered* (written in this room), or *from The
Statement* — whichever room last changed it. For that the spine now
stamps `meta.source[fieldId] = roomId` whenever a field's reading
changes, using the room the page registered with `Spine.registerRoom`;
`Ownership.describe` exposes it as `confidence` and `sourceId`, judged
against the field's owner. A save from before this entry has no stamp
and reads as entered. The stamp is not history: undo does not touch it.

**Fine-tune, collapsed.** Below the cards, a drawer for what is real for
some and noise for most: who depends on your income (a count, then their
ages — `household.dependents` as a list, which the childcare and
day-school branches read), a second job or other pay (its own income
source, `intake_second_job`), and something big and one-off coming
(`household.oneOffs[0]`). Who depends on you is therefore owned by the
one-pager again, anchored at `q-fine-tune`; Sleep At Night reads it.
It is not on Start Here's needs list — optional means not chased.

**Paste numbers in.** A textarea takes lines like "salary 62,000",
"checking $4,120", "401k 31k", or a two-column CSV; `Gate.parseImport`
(pure, tested) turns each line that names a thing this page asks and
carries an amount into a row — pay, spending, cash, investments, debt,
deductible, severance, the weekly benefit — skipping a CSV header, a
second line for the same thing, and anything it cannot place, which it
lists rather than guesses. The page writes the rows as one batch,
"Imported N numbers", so one undo takes the whole import back. A
screenshot goes through the browser's `TextDetector` where it exists
(Chrome on Android); elsewhere the button says to paste the text
instead. No network, no upload.

**Edge cases, each an answer.** Zero income: the pay basis "not earning
right now" disables the box and writes a deliberate zero. Variable
income: "a month on average — it varies" as a basis. No rent: a choice
on the spending card that lowers the guess. No debt: the default,
unless a student, where "most students carry a loan" pencils "yes".
Two jobs: the second in the drawer; a job and own work: the mixed
situation's own-work card. A partner's income: "two of us" adds the
partner card and nothing else. A one-time windfall or expense: the
drawer's one-off, with a direction and a month.

**Speed.** Gate to dashboard on a phone-shaped browser: under three
seconds for every one of the six situations (the walk taps the
situation and "See my dashboard"), against the brief's sixty. Every
situation lands on a dashboard with no console errors and no field,
number or room that does not apply: a retiree's map has eight fewer
rooms, someone between jobs sees the runway lead.

**Compatibility note.** `meta.source` is new (`{ fieldId: roomId }`,
empty on older saves). `dependents` is owned by `start` again (anchor
`q-fine-tune`), not `sleep-at-night`; the Start Here needs list no
longer includes it. The registry's Start Here subsections are the new
card ids: `q-employment`, `q-about`, `q-income`, `q-own-work`,
`q-unemployed`, `q-partner`, `q-expenses`, `q-cash`, `q-investments`,
`q-plan`, `q-debt`, `q-fine-tune`, `q-import` — `q-household`,
`q-filing`, `q-dependents` and `review` are gone, and `filingStatus`
anchors at `q-about`. The one-pager writes income sources with fixed
ids (`intake_income`, `intake_own_work`, `intake_second_job`,
`intake_partner_income`) and the lump debt as `intake_debt`; a
household from before keeps its own ids and the page reads the first
non-own-work source as the pay source. A future room reading
`meta.guessed` should expect the fine-tune fields never to be flagged:
nothing there is guessed.

**Verified.** `node test/run.js` (11,830): the parser line by line, the
badge's three states and the stamp surviving undo, the drawer's
ownership, ten cards at most for every situation with a partner, and
the page's own contract (one batch for the gate, for the commit, for
the import; removal not hiding; the badge on every box). `test/forms.js`
on a phone: typing into a saved answer, hourly pay with hours, the
401(k) card over its suggestions, the between-jobs boxes, the drawer's
ages and second job, and a paste imported as one entry. The
six-situation walk above, and by hand: the demo's badges all "you
entered", cash changed in The Statement reading "from The Statement" on
return, the gate change undone, "two of us" adding the eighth card, the
deep link into the drawer opening it, "not earning" as a zero and "it
varies" as a year. "One pager in" is now true; "one pager out" is the
dashboard, next.

---

## D-096 — The dashboard is home: four blocks, and every number opens its room

*(The brief's step 3: "one screen, four blocks: where you are; the next
thing money should do (money order of operations); the next thing to
learn/unlearn (Advice Translator); the date it points to with lens
toggle; undo/redo top right; nothing else; reflects the gate.")*
`index.html` is rebuilt to that shape. Everything it used to show is
still there, folded under "The full panel" (the radar, the ring and the
climb, the weather, the flight plan, the goals, what it reads, the
snapshot line) and "Your data" (download, share, load, reset); nothing
on the screen but the four.

**Where you are.** The instruments that exist for this household, the
situation's own number first and largest. `shared/instruments.js` rows
gain `requires` (a gate branch) and `lead` (the `Gate.lead` id they
answer to); `compute()` marks each row `exists` and `isLead` and returns
`shown` — the existing ones, lead first. Four leads join the six: the
owner's pay a month for own work (take-home from `Tier0`, so the tax
set-aside is already out), the runway in days for someone between jobs
(`Runway.project` on the laid-off preset, benefit and severance counted;
it stands in for cash-months, which asks the same question with less),
the year the loans clear for a student with loans (`Debt.simulate` at
the minimums), and the withdrawal rate for a retiree. A snapshot still
freezes all ten, so "since last time" holds whichever are on screen.
Every cell is a link to the room that owns the number.

**The withdrawal rate** is a ratio in `engines/ratios.js`: (spending × 12
− income) ÷ investments, banded 4% / 5% in `data/ratio_benchmarks.json`
(version 1.3, the convention marked as one). Income covering spending is
a zero with `covered: true`, not a blank. It exists only where the
decumulation branch does — a retiree, or an unanswered household — so it
is not a spoke on an employed person's radar.

**The next thing money should do.** The money order of operations as
before (the top FOO flag with its dollars, else the step you are on);
between jobs, the runway against how long a search takes (D-092); and
now, retired, the draw against the convention: inside 4%, between 4 and
5, or above 5 with the three ways to close it. It links to the
Decumulation room once that exists and to FIRE until then.

**The next thing to learn, or unlearn.** `engines/advice.js` and
`data/advice_translator.json` (fourteen items, `convention`). Each item
is a piece of advice people hear — the 4% rule, "never touch your
emergency fund", "always take the match", "pay yourself first", "save
10%", "cut the coffee", "rent is throwing money away", "cash is safe" —
marked *learn* or *unlearn*, with predicates the engine evaluates
against the household (between jobs, match left on the table, savings
rate below or above the floor, high-interest debt, a thin or a fat
cushion, hours known, retired and drawing or covered, a student with
loans, self-employed with income) and a body whose tokens are filled
from the engines that own the numbers: "For you that is $2,160 a year
you are not collecting." `pick()` returns the first that applies by
priority; `list()` every one, for a room that wants the whole
translation. A retiree is never told to save 10%: the savings-rate
predicates require the branch. An unlearned headline is struck through.

**The date it points to.** Per situation: the FI date (employed,
self-employed, mixed, a student); the day the cash runs out (between
jobs, from the runway in days); the age the money lasts to (retired,
from `Projection.yearsUntilEmptyCents` — investments drawn by the
uncovered spending at the real return, the one drawdown loop the
Decumulation room will share; "outlasts you" when growth beats the
draw). Under it, the amounts that move the date — a month of spending,
a year of saving, the one-off — read through the lens: dollars, hours,
FI bought, FI pushed. The toggle re-renders in place.

**Reflects the gate, no page load.** Every situation lands on its own
dashboard: no debt-to-income without debt, no savings rate or FI year
for a retiree or between jobs, the lead first. A change in any room —
or an undo — redraws the page through the spine's change notification;
the walk changes spending on the dashboard itself and watches the FI
date move from 2045 to 2053 and back on undo, with the pushed-lens line
moving with it.

**Compatibility note.** `Instruments.INSTRUMENTS` has ten rows (`ownersPay`,
`runwayDays`, `loanTrajectory`, `withdrawalRate` added), each with
`requires`, `lead` and, for `runwayDays`, `replaces`; `compute()` returns
`shown`, `lead` and marks rows `exists`/`isLead`. Snapshots taken before
this carry six outputs; deltas for the new four read as "no snapshot"
until the next freeze. `engines/ratios.js` has a `withdrawalRate` row and
the benchmarks table a band for it; `Projection.yearsUntilEmptyCents` is
new; `data/advice_translator.json` is registered as `adviceTranslator`.
The dashboard's registry subsections are now `where`, `next`, `learn`,
`date`, `full-panel` and the folded panels; `panel` is gone.

**Verified.** `node test/run.js` (12,020): the withdrawal rate by hand
($3,100 × 12 − $24,000 over $420,000 = 3.14%, good; covered is zero;
absent for the employed); years-until-empty by hand ($100 drawing $30 at
0%: 3⅓ years; the retiree above never at 5% real, 31.8 years at 0%);
the leads per situation and what stands in for what; the translator's
pick for the demo, between jobs, retired drawing and covered,
self-employed, a student with loans, and no unfilled token in any item
for nine households; the page's shape. The phone walk of all six
situations plus the demo, the hours and pushed lenses, the change and
the undo. `node dnd/test/run.js`, `test/export.js`, `test/forms.js`,
`test/alignment.js`, and the console sweep of every page. "One pager
out" is now true: the dashboard is one screen and every number on it
opens the room it came from.

---

## D-097 — One shape for every room, proven on Real Hourly Wage and frozen

*(The brief's step 4: "Room template (number, one chart animated, lens
toggle, 2–5 inputs written to spine, assumptions drawer with sources,
'Why this matters at your stage', out-of-scope line → Get Help;
shareable deep links; render standalone with defaults) proven on Real
Hourly Wage then frozen.")* `shared/room.js` is that shape. A room's
page holds the skeleton — the ids `number`, `chart`, `inputs`,
`amounts`, `assumptions`, `reading` as deep links, and the hosts
`room-number`, `room-chart`, `room-inputs`, `room-lens`,
`room-amounts`, `room-assumptions`, `room-why`, `room-scope`,
`reading-list`, `room-standalone` — and calls `Room.mount(spec)` with:
`number(h, T)` for the headline (value, label, sub, zone); `chart(h, T)`
returning one `Charts.*` call; `inputs` (two to five; the module throws
on fewer or more) and `more` (folded) each with a `read(h)` and a
`write(raw)`; `amounts(h, T)` for the rows the lens reads; `assumptions(h,
T)` for the drawer, each with a source; `why(h, T, situation)`; and
`scope`, one line, to which the template appends the Get Help link.
The template builds the inputs once, paints values never under focus,
proposes a room's own guesses through Suggest where the spec gives a
`propose`, names every write as one undo entry ("Paid hours a week →
40"), re-draws the chart only when its HTML changes (typing in a box
never re-animates it), wires the lens, the hash (a deep link into a
folded drawer opens it), the progress strip and the reference tables.

**Standalone with defaults.** A room opened by deep link with an empty
spine renders anyway: `Gate.fillGuesses(h, T)` returns a copy of the
household with the intake's guesses standing in for whatever the room's
registry `needs` are missing — a person, employed, at the median pay;
spending at 55% of gross; a month of cash; the milestone's investments;
the common deductible; single; no debt — and lists what it filled in
`meta.standalone`. The room renders from the copy, the spine is not
written, and a banner says "shown with guesses for …" with the link to
Start Here. A retiree with income keeps it; between jobs no pay is
invented. The demo needs nothing filled.

**Animated.** One CSS rule in `shared/theme.css`: bars grow from the
left, areas and rings rise in, on the `is-animated` class the template
adds when the chart changes; `prefers-reduced-motion` turns it off.

**Real Hourly Wage on the template.** The number is the real rate an
hour, with the headline rate, the share kept, and the year's kept
dollars over the year's hours under it — and the two easy-to-misread
results (a job that costs more than it pays, a handful of paid hours)
said in the sub-line. The chart is one stacked pair: the week as paid
and unpaid hours, and the year of pay as kept, tax and the costs of
working, on the same hours scale. Five inputs — paid hours, unpaid
overtime, commuting, the monthly costs of working, weeks a year — and
two folded, getting ready and decompressing; all write `person.work`
as before. The amounts under the lens: a month of spending, the year's
tax, the year's costs of working, and a $1,200 thing. The assumptions
drawer names the tax table, its version and confidence, the 48-week
default, the Your-Money-or-Your-Life convention that unpaid hours count,
and the real return the lens uses. "Why this matters" is written for
each situation the room exists for. The old sections (`out-rate`,
`out-hours`, `out-price`) are gone; Worth the Hassle, Retroactive Worth
and the translator now link to `number` and `amounts`.

**Get Help.** `rooms/get-help.html`, where every scope line points:
what the rooms do not do (returns, picks, quotes, legal documents, debt
in crisis, bank links) and what kind of person does — a fee-only
fiduciary planner, an enrolled agent or CPA, a non-profit credit
counsellor, an estate lawyer, the state's unemployment office — with a
line per situation. Kinds of help, never a name or a link; registered as
an optional room owning nothing, before Refresh on the path (Refresh
moves to order 30 to stay last).

**Frozen.** From here every room built for the brief — the tranches, and
the ones in `LATER.md` — uses `Room.mount` unchanged. A room that needs
something the template does not have adds it to the template, in one
place, with a decision entry; it does not grow a shape of its own.

**Compatibility note.** `Registry` gains `get-help` (order 29) and
Refresh is order 30. Real Hourly Wage's subsections are the template's
six ids; `out-rate`, `out-hours`, `out-price` no longer exist. The
registry test accepts `Room.mount(` in place of a literal
`registerRoom(` call. `Gate.fillGuesses` is new and pure. `person.work`
is unchanged.

**Verified.** `node test/run.js`: `fillGuesses` by hand (the median pay,
55% spending, a month of cash, the list of what was filled, the source
untouched, a retiree's income kept, no pay between jobs); the shape's
ids on the page, five inputs and two folded, the old anchors gone and
nobody linking to them; Get Help's kind, order and the absence of any
firm or link. `test/forms.js`: typing paid hours and monthly costs on
a phone lands in `person.work` with a labelled undo entry. By hand on a
phone: the room empty (guesses banner, number after typing 40 paid
hours: $26.16/h on $62,000 at 19% tax), on the demo ($21.04/h, you keep
56%), the hours lens (a $1,200 thing is 57 hours), a cost typed and the
number moving, the drawer opening from a deep link, Get Help's stage
line. No console errors.

---

## D-098 — The first six tranche rooms: what each owns, before it is built

*(The brief's step 5, tranches A and B: Between Jobs, Protection;
Decumulation, Tax, Estate Basics, Giving. Each room is its own entry
from D-101; this one is the ground under them.)* Twelve rooms are
built in parallel on the frozen template (D-097), so the parts they
share — the schema, the ownership map, the registry, the reference
table names — are written first, in one place, by one hand, and each
room then only writes its own files: `rooms/<id>.html`,
`engines/<id>.js`, its table in `data/`, and `test/rooms/<id>.js`.

**The schema.** `person.unemployment` gains `expectedSearchMonths` and
`floorMonthlyCents` (Between Jobs). `household.decumulation` is new —
`{ stockShare, plannedAnnualDrawCents, socialSecurityAt }`. `household.tax`
is new — `{ otherPreTaxAnnualCents, withheldAnnualCents }`.
`insurance.health`, `estate` and `giving` already existed (D-094).

**The ownership map.** One row per fact, each owned by its room at the
template's `inputs` anchor: `expectedSearchMonths`, `floorMonthly`
(between-jobs; apply only when between jobs); `healthCover`,
`healthMonthly` (protection); `stockShare`, `plannedAnnualDraw`,
`socialSecurityAt` (decumulation); `otherPreTax`, `withheld` (tax);
`beneficiariesSet`, `willExists`, `poaExists` (estate); `givingPct`,
`givingTarget` (giving). Sleep At Night keeps the four coverage facts;
Protection reads them as chips.

**The registry.** Six rows, kind `about-you` (each owns facts), the
template's six subsection ids, tier 2, orders 31–36, and `REQUIRES`:
Between Jobs needs the `unemployment` branch, Protection `protection`,
Decumulation `decumulation`, Tax `income`; Estate Basics and Giving are
for everyone. Three reference tables are registered ahead of the rooms
that fill them — `protectionConventions`, `estateBasics`,
`givingConventions` — as placeholders with the header fields, because
`Reference.load()` with no names loads every table on many pages.

**The tests.** `test/rooms/<id>.js` files, one a room, run by a loader
in `test/run.js` with the suite's helpers and every table; a room built
in parallel never edits the suite itself. Refresh moves to order 99 so
it stays last on the path whatever is added.

**Compatibility note.** New branches load null or empty from any older
save. `Registry.forHousehold` now removes Between Jobs for anyone not
between jobs and Decumulation for anyone not retired, so the map's
count moves with the situation; the tests name the rooms that go
rather than counting.

---

## D-099 — The second six: Career Move, Partner, Kids and Tuition, Housing Decision, Big Purchase, Variable Income

*(Tranches C and D of the brief's step 5, scaffolded the same way as
D-098; the rooms themselves are D-107 onward.)* The schema gains a small
branch each: `household.career.offer` `{ grossAnnualCents, hoursPerWeek,
commuteHoursPerWeek, workCostsMonthlyCents, signOnCents }`;
`household.partner` `{ splitMode: equal | proportional | pooled,
sharedMonthlyCents }`; `household.kids` `{ tuitionTargetCents,
tuitionSavedCents, tuitionMonthlyCents }`; `household.housing`
`{ rentMonthlyCents, priceCents, downPct, rate }`; `household.purchase`
`{ priceCents, monthsAway, financeRate, label }`;
`household.variableIncome` `{ bufferMonths }`, with the low and high
month living on the income source (`variableLowCents`,
`variableHighCents`, D-094) and `Ownership.variableSource(h)` naming
which source that is — the first with a variable basis or own-work
type, else the primary person's first.

Ownership rows, each at `inputs`: `offerGross`, `offerHours`,
`offerCommute`, `offerCosts`, `offerSignOn`; `splitMode` (applies only
with two adults), `sharedMonthly`; `tuitionTarget`, `tuitionSaved`,
`tuitionMonthly`; `rentMonthly`, `homePrice`, `downPct`, `mortgageRate`;
`purchasePrice`, `purchaseMonths`, `purchaseRate`; `incomeLow`,
`incomeHigh`, `bufferMonths`. Registry rows at orders 37–42, all
`about-you` (Big Purchase too: it owns the purchase), with `REQUIRES`:
Career Move `career`, Partner `partner`, Kids `dependents`, Variable
Income `variableIncome`; Housing and Big Purchase for everyone. Two
placeholder tables: `partnerConventions`, `variableIncomeConventions`.
Kids and Housing reuse `childCost`, `childcareByState`,
`housingConventions`, `priceToRent`, `mortgageRates` from T6.

---

## D-100 — LATER.md, built: one log across tabs, worded labels, the default lens, rooms.json

*(The direction after step 1: finish everything, the LATER section
included. The rooms on that list are their own entries; these are the
four that are not rooms.)*

**One log across tabs.** The spine's `storage` listener used to drop
the cache when another tab wrote; the command log diffs against the
last thing this tab saved, so the next write here would have recorded
the other tab's changes as its own. It now reloads — cache, last-saved,
last-readings — so both tabs read one household and one stack, and an
undo in either takes back the latest write, whichever tab made it.

**Labels for list edits.** A write that moves no owned field (a goal
added, a rating, a flag) was labelled with its first dot path, "goals.0
and 3 more". `describeChanges` now names the part of the household in
words — "Changed a goal", "Changed a debt (3 fields)", "4 changes across
a person, an asset" — from a small dictionary of the household's parts.

**The lens on a phone.** Under 420px the four buttons tighten (11px, 8px
padding) so the toggle and the undo pair share a row without wrapping.

**The default lens as a household setting.** `meta.displayUnit` — `$`,
`hours`, `bought` or `pushed`, null by default — is what `Lens.mode()`
falls back to when the session has not chosen; a page's own toggle wins
for that session. `Lens.setDefault(unit)` writes it through the spine as
one labelled entry ("Read money as hours") and clears the session's
choice so the default shows at once. The dashboard's data drawer holds
the control. This is the small version of T8's display unit: one stored
preference, every page reading it through the lens it already has.

**rooms.json.** `tools/rooms-json.js` writes the registry as JSON in the
brief's shape — `id, title, file, reads (needs), writes (the ownership
map), requires (the gate branches), dashboardNumber (the instrument the
room opens from), order` — and the suite checks the committed
`rooms.json` is exactly what the tool writes, so it cannot drift. The
registry stays a JS module (D-094); the JSON is for anything outside the
browser.

**Verified.** `node test/run.js`: the worded labels, the default lens
stored, read, undone and cleared, the storage listener's reload, the
phone rule, rooms.json's shape and freshness. Run `node tools/rooms-json.js`
after any registry or ownership change; the suite says so when it is
stale.

---

## D-101 — The LATER.md rooms: what each owns, before it is built

*(The third scaffolding entry, after D-098 and D-099; the rooms are
D-114 onward.)* The parked T8 shapes (the D-093 draft, never landed)
come into the schema as they were, with three more for the loan
decision, the calendar and History: `household.enough` `{ monthlyCents,
source }`; `household.designedWeek.blocks[]` `{ id, label, hours,
categoryId, costCents }`; `household.timeBuckets[]` `{ decade,
experiences[] { id, label, costCents, year } }`; `household.dreams[]`
`{ id, label, monthlyCents }`; `household.reversibility` `{ decisionId,
given }`; `household.unlearning` `{ dropped[] }`; `household.studentLoans`
`{ plan: standard | income_driven | aggressive, extraMonthlyCents,
idrShare, forgivenessYears }`; `household.calendar` `{ cadence: weekly |
fortnightly | semimonthly | monthly, nextPaydayDay, bills[] { id, label,
cents, day }, payLater[] { id, label, cents, dueDay, instalmentsLeft } }`;
`household.history` `{ compareTo }`. Ownership rows at `inputs`:
`enoughMonthly`, `designedHours`, `bucketsPlanned`, `dreamsMonthly`,
`reversibilityDecision`, `unlearningDropped`, `loanPlan`, `loanExtra`,
`idrShare`, `forgivenessYears`, `payCadence`, `nextPayday`,
`billsMonthly`, `payLaterDue`, `historyCompareTo` — each reading
incomplete when unset, never a zero. Registry rows at orders 43–51,
History last among the rooms (kind `read`), with `REQUIRES`: Dreamline
`hours`, Student Loan Decision `debt`. The five T8 tables land in
`data/` as the draft wrote them (`unlearning`, `weekBlocks`,
`bucketIdeas`, `dreamline`, `reversibility`, all `convention`), with two
placeholders, `studentLoanConventions` and `calendarConventions`. The
template gains `guessAs`: a room that exists for one situation names the
situation to guess on an empty spine, and `Gate.fillGuesses(h, T,
situation)` honours it when none is chosen.

---

## D-102 — Between Jobs: the day the cash runs out, against the search

Appears for the `unemployment` branch. Reads the between-jobs facts
from Start Here, spending, cash, dependents, and health cover from
Protection. Owns `expectedSearchMonths` (proposed from the re-entry
gap's median) and `floorMonthlyCents` (proposed at 70% of spending, a
convention). Computes through `Runway.project` on the laid-off preset,
run twice — at today's spending and at the floor — with the benefit as
weekly × 52 ÷ 12, severance, and a partner's pay after tax
(`BetweenJobs.otherIncome`, which the dashboard's runway lead now reads
too, so the two agree): the days the money lasts, the date it runs
out, the months to spare or short against the expected search, the
benefit's end. One area chart of cash month by month with the floor as
a second line and the search marked. The lens reads a month of
spending, the floor, the severance, the benefit a month. Edge cases:
no benefit, no severance, a partner's pay making it sustainable
("Covered"), a search longer than the runway (critical wording), the
floor equal to spending. Hand-derived: $6,000 cash, $3,000 a month,
$1,516.67 of benefit for three months and $4,000 of severance lasts
four months, 122 days; six at a $2,100 floor.

---

## D-103 — Protection: each need against what is held

Appears for the `protection` branch (everyone but a student). Reads
spending, cash, income, the deductible and who depends on you from
Start Here, and Sleep At Night's four coverage facts as chips. Owns
`insurance.health.type` and `monthlyCents`. `Protection.checkup`: a bad
health year (the out-of-pocket maximum, else the deductible, against
cash); if you could not work (60% of income a month against the
disability benefit); if you died (ten times income against term life,
only when someone depends on you); the cushion (three and six months
against cash) — need, held, gap, with a side not entered left null and
named, never guessed. The number is the biggest gap, ranked with
monthly gaps annualised; zone good with none, watch with one, out with
two or more. One bar chart of held over need, capped at 1.25 with the
need marked. Conventions in `data/protection_conventions.json`.
Hand-derived: $60,000 gross, $3,000 spending, $6,000 cash, $1,500
deductible, a four-year-old, $100,000 of term life, $2,000 a month of
disability → gaps −$4,500, $1,000 a month, $500,000, $3,000.

---

## D-104 — Decumulation: the age the money lasts to

Appears for the `decumulation` branch. Reads investments, spending,
income, age and the real return. Owns `decumulation.stockShare`
(clamped to 0–1), `plannedAnnualDrawCents` (when typed it replaces the
computed draw), `socialSecurityAt`. The draw is the `withdrawalRate`
ratio's (D-096) or the planned one; the rate against the 4% / 5% band;
what the variable-percentage table allows at this age and stock share
(`Vpw.percentageAt`); years until empty through
`Projection.yearsUntilEmptyCents`, so the room's age equals the
dashboard's. One area chart of the balance year by year with the VPW
path beside it and a dot where it empties. Social Security is a timing
note and a line on the chart, never an estimated amount: `ss.js` needs
an earnings history a retiree's income is not. Uses `guessAs: 'retired'`.
Hand-derived: $420,000 drawing $13,200 is 3.14%, good; never empties at
5% real, 31.8 years at 0%; VPW at 68 and 60% stocks, 5.86%, allows
$24,612.

---

## D-105 — Tax: the effective rate, the bracket, and whether a refund is coming

Appears for the `income` branch. Reads income, filing status, state,
the workplace contribution (a whole percent, as stored) and the
working situation; owns `tax.otherPreTaxAnnualCents` and
`withheldAnnualCents`. `TaxRoom.picture` feeds `Tax.estimate` — the
bracket walk that already exists, with FICA on wages and
self-employment tax on profit — and reuses `Reference.marginalBracket`
for the bracket and the room left in it. Self-employed, all gross is
profit; mixed, the 1099 source is. Refund-or-owe is withheld less
federal income tax, self-employment tax and state tax, said as
"(federal only)" without a state. One stacked row of where a dollar of
pay goes. The drawer shows the blunter effective-rate estimate the rest
of the app uses beside this one. Hand-derived: single, NC, $62,000 at
6% → federal $4,813.60, NC $1,792.65, FICA $4,743, 12% bracket with
$8,220 of room. Below the standard deduction, federal is $0 and the rate
is FICA alone.

---

## D-106 — Estate Basics: three facts, and what would pass by the state's rules

For everyone; owns `estate.beneficiariesSet`, `willExists`,
`poaExists`, each yes, not yet, or not answered. `Estate.review` sums
the assets by how each category passes — cash and retirement by
beneficiary or payable-on-death, investments, property, vehicles and
the rest by will, and without a will by the state — from
`data/estate_basics.json` (a general US pattern, not legal advice), and
names the dollars that would pass by the state's rules rather than
your choice. A donut by route; a guardian line when someone depends on
you and there is no will. It never shows guesses: there is no sensible
guess for any of the three. Hand-derived on the demo: nothing answered,
$57,500 at risk; a will, $9,500; all three, $0.

---

## D-107 — Giving: a share of income, in dollars, months of FI and hours

For everyone; owns `giving.pctOfIncome` and `annualTargetCents`, the
target winning when typed. `Giving.plan`: the year and month given, the
four shares people talk about — one, two, five and ten per cent, the
tithe named as a religious convention — for this income from
`data/giving_conventions.json`, the FI cost through `Lens.apply(...,
'pushed')` and the hours a year through the hours lens, and what was
actually given last month through the giving-rate ratio when Cash Flow
has a categorised month. Four bars plus your own share. Hand-derived:
$62,000 at 2% is $1,240 a year, $103.33 a month; 10% is $6,200.

---

## D-108 — Career Move: an offer against the job you have, an hour at a time

Appears for the `career` branch. Reads income, filing status, the
current job's hours and costs from Real Hourly Wage, spending and
investments. Owns `career.offer` — the year, hours a week, commute,
costs of working, sign-on. `CareerMove.compare` runs both jobs through
the one `Hourly.realHourlyWage`: the offer is a copy of the household
paying the offer with its own work overrides (blank carries the current
job's, a typed zero stays zero); take-home through `Tier0`; the FI move
through the projection's fractional years the way the lens does, the
sign-on landing in investments after tax, the employer match left out
of both sides so they share a basis. Four bars: each job's real and
headline rate. Hand-derived on the demo against $80,000 at 40 hours, no
commute, $100 a month of costs: $21.04 to $26.91 an hour, $8,480 more
kept, FI 30 months sooner.

---

## D-109 — Partner: the shared month split three ways

Appears for the `partner` branch (two adults). Reads both adults'
income and the household month; owns `partner.splitMode` (equal,
proportional, pooled) and `sharedMonthlyCents`. `Partner.split`: each
adult's take-home through `Tier0` on a copy holding only that adult (an
approximation, said in the drawer), each share of the shared month by
the chosen mode with exact-sum rounding, what each keeps, the share of
household income that is one paycheque through the concentration
ratio, and a watch when a share exceeds half of that person's
take-home. One stacked row per adult. Conventions in
`data/partner_conventions.json`. Hand-derived: $72,000 and $48,000 with
$3,000 shared: $1,800 / $1,200 in proportion, $1,500 each, 0.6
concentration.

---

## D-110 — Kids and Tuition: what each child costs at their age

Appears for the `dependents` branch. Reads the ages from Start Here,
the state, spending and the day-school answer; owns
`kids.tuitionTargetCents` (per child), `tuitionSavedCents`,
`tuitionMonthlyCents`. `Kids.plan`: the monthly cost from the USDA-based
bands for each age, childcare from the state table under five, day
school for 5–17 when the community answer says so, years to eighteen,
and the level monthly payment that lands the target by then at the
real return through `Projection.levelPaymentCents`, the saved pot going
to the first bill first. A bar per child and one for tuition with what
is going in marked. A child with no age is costed as an infant and says
so; one past eighteen is due now. Hand-derived: ages four and nine in NC
cost $3,800 a month, $45,600 a year; $50,000 each with $5,000 saved needs
$309.94 and $206.10 a month.

---

## D-111 — Housing Decision: own against rent, this place, this rate

For everyone. Reads spending, income, cash, the state and the no-rent
answer; owns `housing.rentMonthlyCents`, `priceCents`, `downPct`,
`rate`. `Housing.compare`: the level payment through the one
amortisation in the repo, tax, insurance and upkeep from
`data/housing_conventions.json`, the unrecoverable part named, rent
against it, the price-to-rent ratio against bands added to
`data/price_to_rent.json` (buying favoured below 15, renting above 20),
the housing share of gross against the 28% convention, the down payment
and closing costs against cash with the years to the down payment at
today's savings. Two stacked rows. Proposals: rent at 30% of gross, 20%
down, the rate table's current rate; a price is never invented, so an
empty spine shows proposals to tap rather than a computed number.
Hand-derived: $300,000 at 20% down and 6.5% over 30 years is $1,516.96,
own $2,166.96, +$266.96 over $1,900 of rent, price-to-rent 13.2.

---

## D-112 — Big Purchase: one thing, priced in hours, months of FI and cash

For everyone. Reads cash, spending, income and the real hourly wage
where it exists; owns `purchase.priceCents`, `monthsAway`,
`financeRate`, `label` (a kind). `Purchase.weigh` frames four readings
that already exist: hours through the lens, FI pushed through the
lens, cash after against the three- and six-month cushions, financing
through `Projection.levelPaymentCents` over 36 months (60 for a car,
with Quick Math's 20/3/8 rule carried through). Blank months is "no date
yet", priced as today; zero is now. Four bars. Hand-derived on the
demo: $1,200 is 57 hours; cash after $8,300 is under the $9,450 floor,
out now, watch at six months and $191.67 a month; 9% over 36 months is
$38.16 a month and $173.76 of interest.

---

## D-113 — Variable Income: the salary to pay yourself

Appears for the `variableIncome` branch. Reads the average
(a variable-basis source's own monthly figure first, else gross ÷ 12),
spending, cash, and the quarterly through `SelfEmployed.quarterlyEstimated`
with the source's annual figure read as profit; owns the low and high
month on the source (`Ownership.variableSource`) and
`variableIncome.bufferMonths`. `VariableIncome.plan`: the pay-yourself
salary at the low month (spending when the low month is below it), the
buffer as the low-to-average gap times the months, the emergency
cushion that comes first, how many low months in a row the cash covers,
and the tax off the top a month. Five bars with the spending line to
clear. Uses `guessAs: 'selfEmployed'`. Conventions in
`data/variable_income_conventions.json`. Hand-derived: $60,000 → $5,000
average; low $3,500, high $6,500, $3,000 spending, $9,000 cash, three
months → buffer $4,500, the cushion first, every low month covered; low
$2,500 → $500 short, 18 low months covered.

---

## D-114 — Enough: the number you would live on by choice

For everyone. Owns `enough.monthlyCents` and `source` (`curve` or
`entered`). `Enough.current`: typed, else the joy curve's knee from
the Fulfillment room — spending less the lines in the two low-joy
quadrants of a categorised month — else 85% of spending as a stated
convention. `Enough.fiTwo`: the FI number on spending and the FI number
on enough through the one `Tier0.fireNumber`, the years to each at
today's savings through the projection's fractional years the way the
lens does, and the gap in dollars and years. One area chart of
investments over time with both numbers as lines and a dot where each
is crossed; the path compounds monthly, so it crosses a touch before
the yearly closed form and the test checks the first yearly row past
the number rather than a literal. Hand-derived on the demo: $3,150 and
$2,600 at 4% are $945,000 and $780,000, a gap of $165,000.

---

## D-115 — Designed Week: 168 hours, priced

For everyone. Owns `designedWeek.blocks` — the table's blocks, the
first five as the inputs and the rest folded, each a number of hours a
week, a block's cost proposed from the tracked month's matching line or
the table's default. `Week`: hours placed against 168 (over 168 is
flagged, never clamped), the designed month as Σ block cost × 52 ÷ 12,
the FI number that month implies, the gap by category against the month
you have, and the hours the week costs of itself at the real hourly
wage. One stacked row of the 168 hours with the unplaced remainder.
Hand-derived: 56 + 40 + 20 + 10 + 8 hours with $80 and $60 a week on
two of them: 134 placed, 34 unplaced, $606.67 a month.

---

## D-116 — Time Buckets: decades, priced

For everyone. Owns `timeBuckets` — one money box a decade from the
current one to the seventies (from 30 when age is unknown, said so),
typing a total that replaces a decade's 'Planned' line or tops up an
itemised list; the ideas table proposes a decade's typical figure.
`Buckets.plan`: each decade's price and years away, the running total,
and — from ONE `Projection.pathCents` run at today's savings (Tier 0's
figure) and the real return, to the plan age — the money there will be
at each decade's start and the first decade the plan outruns it; the
plan as a share of the FI number. One bar a decade with the projected
money marked. Hand-derived: age 32, $12,000 in the thirties and $30,000
in the forties; $48,000 invested and $20,520 a year at 5% for eight
years is $272,885 by forty, so the plan is fine; $312,000 planned is
strained from the forties; a stop age of 36 gives four years of saving
then growth alone.

---

## D-117 — Dreamline: the target monthly income

Appears for the `hours` branch. Owns `dreams` — five slots, each
priced a month and given a kind (travel, a sabbatical, a course, a
place, a gift, other). `Dreamline`: dreams a month, the target monthly
income as (spending + dreams) × 1.3 (Ferriss's pad, a convention),
the gap against take-home, and the hours a week at the real hourly
wage for the target and for each dream, at 52 ÷ 12 weeks a month. One
stacked row of the target month: spending, each dream, the pad.
Hand-derived: $3,150 and $800 + $600 → $5,915; at $21.04 an hour,
64.9 hours a week.

---

## D-118 — Reversibility: a door, or a one-way street

For everyone. Owns `reversibility.decisionId` and `given`. The
decisions, their questions and their undo formulas live in
`data/reversibility.json` and are evaluated through the life-events
engine's expression evaluator — never a second copy of the arithmetic.
The template builds inputs once, so the questions sit on generic boxes
fixed in kind — two money, one choice — and the room paints each box's
label and options from the chosen decision, disabling a box the
decision has no question for; a question's default is a proposal.
The verdict against a month of spending: under a month and under a
month to undo is a door; over six months of spending or over a year to
undo is a one-way street; between is a heavy door; a decision the
table marks irreversible, or leaves unpriced, is a one-way street
whatever it costs. Three bars: the undo cost, a month, the cash.
Hand-derived: a $300,000 house at 8% selling costs plus a $2,000 local
move is $26,000 and four months — a one-way street at $3,150 a month.

---

## D-119 — Unlearning: the ladder, and what you let go of

For everyone. Owns `unlearning.dropped`. Every rule in
`data/unlearning.json` judged by the FOO step and the banded ratios
(the draft's `classify`): applies, stop believing, not yet, unknown.
The number is the rules that no longer apply and are not yet let go
of; the inputs are a rule picked (page-local, it chooses what the
choice acts on) and "let go" or "still holding it". A rule let go of
while it still applies is flagged as early. Four bars by status. The
dashboard's learn/unlearn block (D-096) is this ladder's top line and
the drawer says so. On the demo, step 2: three rules to drop, six not
yet.

---

## D-120 — Student Loan Decision: three shapes of repayment

Appears for the `debt` branch; uses `guessAs: 'student'`. Owns
`studentLoans.plan`, `extraMonthlyCents`, `idrShare`,
`forgivenessYears`. The loans typed as student loans — or a student's
lump debt from the one-pager, said so — run through `Debt.simulate` on
a copy holding only them for the standard plan (the listed minimum, or
the level payment over the ten-year term through
`Projection.levelPaymentCents`) and the aggressive plan (standard plus
the extra); the income-driven plan is the one loop the debt engine does
not have: a flat share of discretionary income above 150% of a $15,000
poverty line, month by month with interest accruing, negative
amortisation named, the remainder forgiven at the horizon, income held
flat. The number is the cheapest plan that clears them; three bars of
total paid. Conventions in `data/student_loan_conventions.json`, the
shapes of US federal plans, not any year's rules. Hand-derived: $20,000
at 5% is $212.13 a month for ten years, about $25,456; at $40,000 the
income-driven payment is $145.83 against $83.33 of first-month
interest; $60,000 at 7% on $25,000 pays $20.83 against $350 and is
forgiven larger than it started.

---

## D-121 — Money Calendar & Pay-Later: the low point

For everyone. Owns `calendar.cadence`, `nextPaydayDay`, two bills on a
date (rent, with its month from Housing Decision or the 30% guess, and
the biggest other bill) and one pay-later instalment, folded.
`Calendar.month`: 31 days from today; take-home a month through Tier 0
shared across the cadence's paydays (52 ÷ 12, 26 ÷ 12, 2 or 1; the
semimonthly partner fifteen days off inside 1–30; a day past the
month's end is its last day); each bill drawn the first time its day
comes round; the rest of spending spread over the month's days; the
lowest balance and its day, below zero named, a tight stretch under a
week of spending. One area chart of cash day by day, zero and a week of
spending as lines, the paydays dotted. Conventions in
`data/calendar_conventions.json`. Hand-derived from the 1st: $500 of
cash, $900 of rent on the 1st, $1,800 of spending, paid twice a month
on the 5th and 20th: −$430 on day one, −$520 by the 4th, a payday on
the 5th.

---

## D-122 — History: the brief's last step

For everyone, a reading. Owns `history.compareTo`. `History.review`
reads every snapshot (the instruments' outputs and every owned field at
that moment, frozen through `Instruments.snapshot`) against the
household as it is now, recomputed, never a stored figure: net worth
since the chosen snapshot or the first, with cash, investments and debt
then and now, every instrument then and now, the command log's last ten
entries, and the chart's points. The compare-to select is painted from
the snapshot list only when it changes and never under focus; "Freeze
now" appends a snapshot through the instruments engine and, being
outside the household, is not an undo entry — it can be ignored, not
undone. A deleted compare-to falls back to the first and says so; one
snapshot gives a change but no zone. The tests pass the snapshot list
explicitly, since the shared store carries snapshots from earlier
sections.

**And the whole.** With this entry the brief is built end to end: the
core (D-094), the one-pager (D-095), the dashboard (D-096), the
template (D-097), twenty-one rooms on it (D-102 to D-122), and every
line of `LATER.md` (D-100, D-114 to D-121). "One pager in, one pager
out" is true: one page in, a dashboard back, every number on it opening
the room it came from, every room the same shape.

---

## D-123 — Freeze says what it did, and every ratio explains itself

Two things the phone showed. **Freeze today's numbers** saved a snapshot
and changed nothing on the screen, so it read as broken: the dashboard's
age line now says how many snapshots there are and when the last was
taken, turns green with "just now" after the tap, and links to History.
And a ratio was a name and a coloured figure with nothing behind it:
every ratio row — the dashboard's radar legend and weather list, and
Every Ratio — now carries a ⓘ that opens what it is, why it matters, what
moves it, the formula, the band in words, and a chip for each field it
looks at that links to the room owning that number (`shared/explain.js`
over `data/ratio_explainers.json`; `Ratios.all` attaches the entry to
each row as `explain`). The name on the dashboard links to the row in
Every Ratio. A ratio without an explainer fails the suite.

**Invested share.** "Investment to net worth" read 195% for a household
with $70,000 invested and $41,110 of debt — arithmetic nobody can act on.
It is now `investedShare`, investments over total assets, which cannot
pass 100% and means what its label says. `data/ratio_benchmarks.json`
1.4 and `data/health_score.json` follow the rename.

### Compatibility note

Stored shape: nothing. A snapshot's `computedOutputs` holds ratios by id
only through the instruments, none of which is this one, so no stored
delta breaks. Rooms updated: `index.html`, `rooms/ratios.html`.

---

## D-124 — A debt from family, no interest, set aside, and two dates

A car bought with money from a parent had no way in: it needed "an
interest rate and a minimum payment", and a rate typed as 0 on a card
opened the promo fields. Four changes to the debt record, all in
`Schema.createDebt`:

- `type` admits **`family`** — borrowed from family or a friend. Choosing
  it with nothing said about the rate ticks no-interest and stores a 0.
- **`interestFree`** — true means no interest, ever; the rate is stored
  as 0 alongside so a reader that only knows `rate` agrees
  (`Debt.effectiveRate`). Unticking a 0 that only came from the tick
  puts the rate back to "not entered", so the row asks again.
- **`archived`** — set aside: paid off, or on hold. Kept for the record
  in a drawer, restorable, read by nothing that adds up or plans
  (`Schema.aggregatableDebts` excludes it; `Schema.archivedDebts` lists
  it).
- **`borrowedOn`** and **`dueOn`** on every debt. On a family loan with no
  monthly amount, the minimum is the balance over the months until
  `dueOn` — a new rule, `balance_over_months_to_due`, in
  `data/debt_rules.json` 1.1; a typed amount still wins.

The row's warning and its type-dependent blocks (the card's limit and
promo fields, the family hint) are painted live on every write without
rebuilding the row (`paintLive`), because the deferred rebuild
(`shared/liveform.js`) left a stale "needs an interest rate" under a car
loan for as long as a finger stayed in the form — which on a phone is
the whole time.

### Compatibility note

Stored shape: `debt` gains `interestFree` (null), `archived` (false),
`borrowedOn` (null), `dueOn` (null); `debt.type` gains `family`. A debt
saved before this reads with the defaults through `createDebt` on load;
nothing migrates. Rooms updated: `rooms/debt-payoff.html`. A future room
reading `household.debts` should filter `archived !== true` — or read
`Schema.aggregatableDebts`, which does — and treat `interestFree === true`
as a 0 rate.

---

## D-125 — Your Data: a file added or replacing, and a pasted statement sorted

Export lived in a folded drawer on the dashboard, a loaded file could
only replace everything, and the one-pager's paste answered its own ten
questions and nothing else. `rooms/data.html` is every way numbers get in
or out, in one place:

- **A file, added.** `Spine.mergeImport` brings in what a file has that
  this browser lacks — records by id, people and their income sources,
  expense entries, blank scalars, snapshots — and changes nothing already
  entered; one command-log entry, one undo. Replace is still
  `Spine.importJSON` (D-059), and the person is told which is which
  before either happens. The merge is `Importer.merge`, pure, so the
  suite can check it record by record.
- **A pasted statement, sorted.** `Importer.classify` places each line
  with an amount, by a word in `data/import_keywords.json`, as a debt of
  a type, an asset of a category, a monthly expense in a category
  (through the catalogue's own keywords too), or pay on a basis; a line
  no word matches is shown as skipped, never guessed. Every placement is
  shown with a kind and a detail select before "Add" writes the lot in
  one batch through the same spine helpers the owner rooms use
  (`Importer.plan` → `Importer.apply`). A monthly expense line for a
  category that already has one replaces it rather than doubling; a
  single income source is updated, not duplicated; a family loan comes in
  interest-free.

Your Data owns no field. Like Refresh (D-057) and the one-pager's paste
(D-095) it is a write path into records other rooms own, and each record
lands where its owner will show it. It is a utility, off the path.

### Compatibility note

Stored shape: nothing new. Rooms updated: `index.html` (the data drawer
links here). `data/import_keywords.json` is config: a word that places a
line is a data edit.

---

## D-126 — Cash Flow: the month at a glance, the common lines open, a per aid

The page opened on nineteen boxes. It now opens on three tiles — comes
in (take-home, Tier 0's one tax lookup), goes out (the lines, savings
excluded because that money has not left), left — each saying what it
needs when it cannot show a figure, with the floor (D-082) beneath. The
lines most months have are open; the rest fold under "N more lines" per
bucket, and a folded line that holds a value opens itself, so nothing
typed is ever hidden. Beside each amount a **per** select — a month, a
week, every two weeks, a year — turns what was typed into the month that
is stored, through the same `BASES` `engines/income.js` annualises pay
with, and a hint under the line says what was kept. The select applies to
the number just typed and returns to "a month".

**The stored shape is deliberately unchanged.** The earlier ask — a date
on every expenditure and incoming amount, estimated and potential dates,
an incoming-money list — is the Income and Expenses data model that
`MONEY-MAP.md` exists to settle first (its Task 3 and open questions 1, 5
and 13). Building it here would have designed it twice.

### Compatibility note

Stored shape: nothing. Rooms updated: `rooms/cash-flow.html`; the
registry row gains the `glance` subsection.

---

## D-127 — Money Calendar: the month as a calendar

Under the balance line, the same 31 days as a grid — rows of seven from
Sunday, the first row padded so a day sits under its weekday, a cell a
day with the payday and each bill or pay-later instalment on the day it
lands, the cash at the end of the day, the low point outlined, days under
zero and the tight stretch shaded (`Calendar.weeks`, drawn from the one
month the engine already runs). Nothing new is stored; when the Money
Map's dated entries land (D-126, `MONEY-MAP.md` Q5), this grid is where
they show.

---

## D-128 — The ledger: income entries, the expense log, the reflected budget, the month closed

*(The build spec for Income / Expenses / Budget / Estimated-vs-Actual, built
directly against; `MONEY-MAP.md` was the discovery pass before it.)* Nine
build items, one commit each.

**Two records, not one.** An income **entry** is a dated event — this
paycheque, this invoice paid, this gift — in `household.ledger.income[]`:
kind (w2, se, bonus, gift, side, dividend, rental, other), amount,
frequency (once, weekly, fortnightly, monthly, annual), received-on,
taxable and the tax method (w2 withholding, se on the net of costs, none),
and for se / side / rental the costs of producing it on the entry itself
(mileage, home office, equipment, contractor fees, licensing, platform
fees). An income **source** stays what it was: Start Here's annualised
description of a job, the figure every ratio reads. The two coexist on
purpose — retrofitting every reader onto dated events would have been the
rewrite SPEC.md §3 warns against — and the Tax room reads the ledger's
year by method when entries recur, its sources otherwise
(`engines/taxroom.js splitIncome`).

**One tax engine for entries.** `engines/ledger.js netOf`: a gift nets
nothing; W-2 pay is withheld at the year's blended effective rate (Tier
0's lookup, read at the household's annual gross); 1099, side and rental
income pay self-employment tax on the profit net of costs through
`engines/selfemployed.js` — W-2 wages counted against the wage base — plus
income tax at the rate less the FICA share, the arithmetic
`quarterlyEstimated` already does. The same $2,000 nets three different
ways and the suite checks each by hand. Rental is netted as
self-employment because the spec asked; the room says a return treats it
differently. `occurrences` lands a recurring entry from the month it was
first received, never before; `month` nets every active landing.

**The expense log lives in Cash Flow.** One store, one owner (D-017): a
logged occurrence is an `expenses.entries[]` row with `source: 'log'`, a
date, a category in one of nine groups (`group` on every category in
`data/expense_categories.json` 1.2, plus savings, investments and
income_costs), optionally the income entry it produced
(`linkedIncomeId`) and a deduction. **The hard rule is in the
constructor**: `deductible` is stored true only when `linkedIncomeId` is
set, and every spine write goes back through the constructor, so a
personal expense can never reduce taxable income whatever a form sends.
The typical-month lines and every ratio ignore the log; the budget reads
it as actuals (`CashFlow.logInMonth`).

**The budget is a reflection.** `engines/budget.js`: Estimated per bucket
is a hand-set figure for the month, else the last closed month's actual,
else what Start Here and Cash Flow already hold (take-home; the lines by
group; the workplace contribution; the debt minimums) — the one-pager is
the onboarding. Actual is the ledger's income netted of tax and the log by
bucket; the cost of earning an income entry sits under income and in
neither bucket. `rooms/budget.html` has no input, select or textarea; Add
carries the month and a way back (`?for=budget&month=…`) to Income or the
log with the bucket's category picked, and the return lands on the row
that changed, lit once. **Close** freezes both columns into a
`MonthRecord` in `household.ledger.months[]` (`Spine.closeMonth`, refused
a second time, append-only, sorted); an entry logged into a closed month
afterwards moves only `actualRevised` (`Budget.syncRevised`), never the
record. The record lives in the household, not the snapshot store, so it
exports, merges and undoes with everything else.

**Estimated vs Actual** (`rooms/variance.html`, `engines/variance.js`)
reads records only: one month with the miss that hurts marked, the trend
across closed months, per bucket the average miss and whether it is off
the same way every month. Its one write is a button — the last three
months' average as the next open month's estimate through
`Spine.setBudgetEstimate` — and nothing moves until it is tapped.

**Hide and set aside** (`shared/manage.js`): hidden is cosmetic and still
counts; set aside (`active: false`) stops counting from now on and leaves
closed months as they were. After a one-time entry's month closes, a
dismissible prompt asks whether it was a one-off (`ledger.dismissed`
remembers a no). **Where it flows**: `Charts.sankey`, drawn in Cash Flow
from the live entries on every render, never a saved dataset. **Variable
Income** reads the ledger's 1099, side and bonus entries as a filtered
view with a rolling three-, six- or twelve-month average
(`variableIncome.windowMonths`); when they exist the observed low, high
and average stand in for the typed ones; it adds no income.

**Rooms and the path.** Income (`income`), Budget (`budget`) and
Estimated vs Actual (`variance`) are registered after Cash Flow as
about-you / read rooms so the four-room core (D-051) stays four.
`monthsClosed` is not applicable until a month exists, so no path waits
on it.

**The end-to-end check the spec set** — a W-2 paycheque and a 1099 gig
with $200 of mileage in one month; the budget's income actual as the
combined net-of-tax figure; a personal expense and one linked to the gig
with only the linked one moving the tax base; the month closed once,
locked, and read in Estimated vs Actual; the gig set aside with next
month no longer expecting it and the closed month keeping it in full —
runs through the pages on a phone browser and passes with no console
error.

### Compatibility note

Stored shape: `household.ledger` (`income[]`, `months[]`, `dismissed[]`)
and `household.budget.estimated` are new branches, empty by default;
`expenses.entries[]` rows gain `linkedIncomeId` (null), `deductible`
(false), `hidden` (false), `active` (true), and `source` admits `'log'`;
`household.variableIncome` gains `windowMonths` (null). A household saved
before this reads through the constructors with the defaults; nothing
migrates. Rooms updated: `rooms/cash-flow.html` (the log, the flow,
Manage), `rooms/variable-income.html`, `rooms/tax.html` (loads the
ledger). New: `rooms/income.html`, `rooms/budget.html`,
`rooms/variance.html`. A future room reading `expenses.entries` must skip
`source === 'log'` unless it wants occurrences, and skip
`active === false` always — or call `CashFlow.summarise` /
`CashFlow.logInMonth`, which do.

## D-129 — The ledger, revised: four ways to be taxed, three things an expense can produce, a budget of cards with presets, N/A and the what-if

*(The revised build spec for Income / Expenses / Budget / Estimated-vs-
Actual: eleven build items, one commit each, built directly against it
on top of D-128. Items 8–11 — the analysis room, hide and set aside, the
Sankey, Variable Income — were already what the revision asked for and
were re-verified rather than rebuilt.)*

**Nine kinds of income, and exactly four ways to be taxed.** Income
entries gain `unemployment`, and `taxMethod` is now exactly `w2`
(withheld before it arrives), `se` (owed later, with self-employment
tax), `unemployment` (taxable as income, nothing withheld, no
self-employment tax) and `none`. `engines/ledger.js netOf` nets the same
$2,000 four genuinely different ways and every result now says what was
withheld, what is still owed and what cash actually landed
(`withheldCents`, `owedCents`, `cashReceivedCents`), so a benefit cheque
never reads as fully spendable. The year by method keeps unemployment
out of wages (`annualByMethod.unemploymentCents`); `Tax.estimate` takes
it as `otherOrdinaryCents` — ordinary income with no payroll tax on it —
and the Tax room passes the ledger's figure through. Calls made:
`taxMethod: 'none'` with no `taxable` given reads as not taxable, so a
form that only asks Taxed How stays consistent; a gift still forces
`none`.

**Three things an expense can produce, decided in the constructor.**
`expenses.entries[].produced` is `personal`, `linked` or `reimbursable`,
exclusive. Personal can never be deductible. Linked (`linkedIncomeId`)
is the only path that can. Reimbursable records who owes it back
(`reimbursableFrom`), what is expected (`expectedAmountCents`, default
the amount), `reimbursementStatus` pending → received, and when it did
(`dateReceived`, `receivedAmountCents`); it is never deductible, it
carries no link, and it **counts in full in Actual while pending**. When
it is paid back — `Spine.markReimbursed`, the "Paid back" action on the
log line — `CashFlow.logInMonth` lands a credit row in the month of
`dateReceived`, against the bucket the expense sat in, **never back in
the month of the expense**, so a closed month never moves and the
Estimated-vs-Actual record stays honest. The Sankey draws a repayment as
an inflow to the pool, not a negative outgoing. A spine patch that adds a
link or a payer switches the path rather than being pinned by the stored
one.

**The budget is five cards with one bar each.** The grid sheet became
five bucket cards. Each carries a horizontal Estimated-vs-Actual
comparison bar in the Every Ratio room's bar language (`.slaf-bars`):
the estimate as a faint zone with a marker at its edge, the actual as the
fill — green within, red over, amber for income that came in short. A
card opens to its lines and its Add button lives inside; the Add still
routes to Income or the expense log with the way back (D-128). Still
zero input fields on the page; the Estimated, Actual, Close and
late-entry rules did not change.

**Presets, read through the function that owns each.**
`engines/presets.js`: **Rule of Five** calls `QuickMath.ruleOfFive` on
the Big Purchase room's price and spreads the shortfall to five of it
over the months until the purchase (a year when no date is set, and it
says so); it is not a second formula. **Max the IRA** and **Max the
401(k)** read `data/irs_limits_2026.json`, a twelfth a month, with the
catch-up from exactly 50 by the spine's date of birth (no date of birth:
the base limit, and a nudge to add one). Max 401(k) is **absent, not
disabled**, until an employer 401(k) is indicated — `retirement.has401k`,
asked once in the Investments card with two buttons, and not asked of
the self-employed. Presets stack into the bucket's Estimated
(`household.budget.presets[month][bucket]`): on top of a hand-set figure,
or **in place of** the last-closed / onboarding fallback — those already
hold what was put in, and stacking a limit on top would count it twice.
A preset that can no longer be read (the 401(k) answered no) drops out of
the live figure; the stored list is left alone so it comes back when it
can.

**Not applicable is the household's word, and a what-if is not a
write.** A structural preset gains an N/A button:
`household.notApplicable[key] = true` drops it from every live figure,
and `shared/ownership.js` reads the same map, so a field marked there is
**not applicable, never an outstanding task** (D-055's distinction), and
the row says it was you who said so (`userNotApplicable`). "Applies
after all" lifts the mark. The Budget room's **Hypothetical** view is
visually its own thing — dashed amber edge, amber banner, Add and Close
gone — and holds its what-ifs (presets stacked, the 401(k) answer, the
N/A marks lifted) in the page's memory only. It calls nothing on the
spine; the browser check confirms localStorage is byte-identical before,
during and after. Switching it off drops the overlay and the real budget
is exactly as it was: D-052's rule, what-ifs get thrown away, kept.

**The seven-step check the revised spec set** — a W-2 paycheque, a 1099
gig with $200 of mileage and an unemployment benefit in one month treated
three ways; Income Actual as a card with a bar, the combined net figure;
a personal, a linked and a reimbursable expense with only the linked one
moving the tax base; Rule of Five and Max 401(k) stacking, and the 401(k)
disappearing without employer access; N/A dropping it from live and
Hypothetical bringing it back without a write; the month closed once and
read in Estimated vs Actual; the gig set aside with next month no longer
expecting it and the closed month keeping it — runs through the pages on
a phone browser and passes with no console error.

### Compatibility note

Stored shape: `ledger.income[].kind` admits `'unemployment'` and
`taxMethod` admits `'unemployment'` (the constructor maps the kind to
the method); `expenses.entries[]` rows gain `produced` (`'personal'`
unless a link or a payer says otherwise), `reimbursableFrom` (null),
`expectedAmountCents` (null), `reimbursementStatus` (null),
`dateReceived` (null), `receivedAmountCents` (null); `retirement` gains
`has401k` (null = not asked); `household.budget` gains `presets` ({});
`household` gains `notApplicable` ({}). A household saved before this
reads through the constructors with the defaults; nothing migrates, and
an older row with a `linkedIncomeId` reads as `produced: 'linked'`.
Rooms updated: `rooms/income.html`, `rooms/cash-flow.html`,
`rooms/budget.html`, `engines/taxroom.js` (reads the unemployment
figure). A future room reading `expenses.entries` must treat a
`reimbursable` row as personal spending until `reimbursementStatus` is
`'received'`, and then credit `receivedAmountCents` (else
`expectedAmountCents`, else the amount) in the month of `dateReceived` —
or call `CashFlow.logInMonth`, which does. A future room offering a
structural option should check `household.notApplicable[key]` first, or
read the field through `Ownership.describe`, which does.

## D-130 — What was pushed off, built: dates that are only estimated or potential, the calendar from the ledger, one month of spending, one rent, what the log moved, N/A in its owner room, an emergency-fund preset

*(The open items LATER.md carried after D-128 and D-129 — the Money
Map's Q5, Q8, Q10 and Q11, `dateKind`, and the three "still open after
D-129" lines — each built and verified, one commit each.)*

**How sure a date is.** Income entries and log entries carry
`dateKind`: `exact` (it landed, or it is due), `estimated` (about then)
or `potential` (may not happen at all); unknown reads as exact, the way
every older row was meant. Every landing carries its kind. **Actual
counts exact and estimated; a potential one is never counted** — the
ledger's month and the log's month list it apart (`potentialRows`,
`potentialCents`) so a calendar can draw it and the budget never does.
Both forms ask "The date is" beside the date; the log lists a potential
row greyed with "maybe" and an estimated one with "about".

**The calendar is drawn from the ledger and the log (Q5).** When
Income has entries landing in the window, *they* are the paydays, each
on its day for the cash it brings net of what was withheld
(`cashReceivedCents`), and the cadence is not needed; with no ledger the
cadence and next-payday day still draw the month as before. Every dated
entry in the expense log is drawn on its day as a bill, a recurring one
each month, and what the log lists in the month comes off the spread;
an estimated date is drawn and counted, a potential one drawn and never
counted, a reimbursement comes back in on the day it came. The room's
own bill and pay-later inputs are gone — bills are logged in Cash Flow,
which is their one owner — and the bills and instalments saved on the
calendar before this are still drawn, so no household loses a day it
had. **Start Here's one-off is a dated entry now**: coming in, an income
entry (`oneoff_in`, kind other, source onepager); going out, a log entry
(`oneoff_out`, category other); the 1st of its month, date estimated.
`Schema.oneOffEntry` reads it back for the one-pager and the dashboard,
and still reads the legacy `oneOffs[0]` for a household saved before.

**A month of spending is the closed months' average (Q10).**
`Schema.monthlyExpensesCents` prefers the average of the last three
closed months' expenses actual (source `closed`, naming the months) to
the tracked figure and the estimate; a closed month with nothing logged
does not count. Every room that reads "a month of spending" — Runway,
Savings Rate, FIRE, the ratios, the calendar, the presets — gains the
truer figure with no change of its own, and Runway and Savings Rate say
where it came from. Three months is the trailing window because one
closed month is a sample and twelve is a year of drift; it is a
constant in the schema, `CLOSED_AVERAGE_MONTHS`, not a table entry, as
it is arithmetic rather than reference data.

**One rent (Q11).** `Schema.rentMonthlyCents` reads Cash Flow's housing
line — the typical-month line, or failing that a recurring rent logged
on its day — as what you pay; the Housing Decision room's own field is
only *a place you would rent instead*, used when typed (the room's
what-if) or when there is no line. `Housing.compare` and
`Calendar.rentCents` both go through it and say which they used. In the
ownership map `rentMonthly` is Cash Flow's; `rentAlternative` is
Housing's — two fields because they are two numbers, the fact and the
hypothesis, which is D-052's line.

**What the log moved since cash was confirmed (Q8).**
`Budget.cashMovedSince` adds up income actually received and takes off
every logged outgoing from the day the cash figure was confirmed
(`meta.confirmedAt.cashSavings`), potential dates never counted. The
Statement sets it beside the cash balance as a hint and **applies
nothing**: entries inform the balance, they never move it, so the
person's confirmation stays the one fact and the Statement never
disagrees with the bank statement it was typed from. The alternative —
letting entries move balances — would make every logged coffee a write
to an asset another room owns, and D-017's one-owner rule was the
reason to stop.

**Not applicable, in the owner room too.** `Ownership.naButton` renders
the N/A toggle for a structural option; Where It Goes sets one beside
the workplace-contribution chip ("No plan") and under the HSA toggles,
through `Spine.setNotApplicable`. `Ownership.chip` shows a field marked
N/A as "n/a — you marked this not applicable" everywhere instead of
asking for it. The remaining situation gates (between jobs, a partner,
dependents, debt) are answered by facts Start Here already asks, so they
need no toggle.

**An emergency-fund preset for Savings.** `engines/presets.js` gains
`emergencyFund`: the gap between cash and N months of spending, spread
over a horizon, both from `data/savings_presets.json` (three months
over twelve, a stated convention). It stacks with Rule of Five. **The
Rule of Five keeps reading Big Purchase's price** rather than taking one
of its own: a price box on the budget page would be its first input
field, and zero inputs there (D-129) is the rule that wins.

### Compatibility note

Stored shape: `ledger.income[]` and `expenses.entries[]` rows gain
`dateKind` (`'exact'`); `household.calendar.bills[]` and `payLater[]`
are no longer written by any room but are still read and drawn;
`household.oneOffs[]` is no longer written by any room and is read only
when neither `oneoff_in` nor `oneoff_out` exists; `retirement`,
`budget`, `notApplicable` are as D-129 left them. A household saved
before this reads through the constructors with the defaults; nothing
migrates. Rooms updated: `rooms/income.html`, `rooms/cash-flow.html`
(the date kind), `rooms/calendar.html` (drawn from the ledger and the
log, two inputs), `rooms/start.html` and `index.html` (the one-off as an
entry), `rooms/housing.html` (the alternative rent), `rooms/statement.html`
(the cash-moved hint, loads the ledger and budget engines),
`rooms/accounts.html` (N/A), `rooms/runway.html` and
`rooms/savings-rate.html` (the source words). A future room reading
occurrences must skip `potential` ones from any total (`Ledger.month`
and `CashFlow.logInMonth` already do); one reading "the rent" must call
`Schema.rentMonthlyCents`, never `housing.rentMonthlyCents` alone; one
reading "a month of spending" gets the closed average for free through
`Schema.monthlyExpensesCents` and should say so when it names its
source (`.source === 'closed'`, `.months`).

## D-131 — The Skill Tree and the Exercise Library, as rooms: two ladders, one game

*(The Skill Tree spec: Civ VI's two trees that cross unlock, the FOO
ladder as the technology tree and the skill tree as the civics tree;
four states plus fog; boosts that open and never award; warps that
reveal and never award; the exercise library in five kinds; versioning
house wide. Built in the spec's order, one commit a step.)*

**The file gap, and what was built against it.** The spec brings in
FI-Skill-Tree-v6.3 (625 skills, ~280 links, 125 micro actions), and
says its step 1 has to be written against the file's real internals.
The file is not in this repo, on this machine, or reachable from this
session. So `scripts/extract-v63.mjs` is written to the SHAPE it must
emit — three stamped tables — and exits with that shape and a plain
message until the file is dropped at the root (or `$SKILL_TREE_V63`);
its extraction body is a stub that throws once the file is found, to
be written against what is really there. Everything downstream is built
against the shape and runs today on a **seed**: `scripts/seed-skill-tree.mjs`
turns the Stacker's 26 catalogue skills (D-090) plus the skills the spec
names for its cross links, warps and fog into `data/skill_tree.json`
(five bands, six trees, 40 skills, five warps) and `data/skill_links.json`
(28 cross links, the ladder both ways); `scripts/seed-exercises.mjs`
writes `data/exercises.json` (the twelve runs, the thirteen canon
exercises, one micro per seed skill; quests and dares wait for the v6.3
content). Both are deterministic. When the file arrives, step 1 is
"write the mapping, regenerate, verify the counts", and nothing else
moves.

**Two ladders, cross unlocked.** `engines/skilltree.js` is a pure
function: household and tables in, every skill's state and reason out,
the standard Result. A skill can carry `gate.foo` (it opens at that
ladder step; the reason says "Opens at FOO step 8. You are on step 2."
or "You are not placed on the ladder yet", linking the ladder) and the
links table carries `fooRequires[step]` (skills a step needs; the tree
reports `ladderNeeds` and the fortress line prints them under the
rung). Both directions are in the seed: reading the plan's summary is
needed by step 3; tax loss harvesting opens at step 8.

**Four states, a fifth for the board, and not-yours.** `done` is the
only state ever stored (`household.skillTree.state[id] = { state,
on, by: proof | self }`); `open`, `locked`, `bypassed` and `fogged` are
derived on every call, so the tree can never disagree with the facts.
**Locked always says why**, in one of three shapes — a skill prerequisite
("Locked. Needs: Enter the facts."), a ladder gate, a household threshold
("Locked. Needs one closed month in the ledger. You have 0.") — each
with a link to the thing that unlocks it, and the tests hold that no
locked skill is unreachable. A skill whose `appliesWhen` fails the
situation is **not yours**: absent, never counted (D-055's line). Fog:
the band you are in renders in full, the next half lit (names, no
chips), the rest silhouettes with a count; the engine blanks a fogged
skill's name so no room can print it. A band that comes into view is
announced once.

**Boosts open, never award.** Something the household did in the app —
a month closed, thirty dated expenses, a debt paid off, a snapshot
frozen, an exercise completed, a fact the ownership map already holds —
moves a locked skill to open, with provenance `boost` and a partly
filled bar. Done still needs the skill's own proof: the card's "I can
do this: mark it done", or a fact that proves it (below). The app never
awards mastery for using the app.

**Warps reveal, never award.** A warp's proof is a held balance (eight
months of spending in cash), a count (twelve closed months), a fact
answered (a will and named beneficiaries, a house owned outright) —
never a box saying "I know this". An active warp puts its branch in
`bypassed`: counts as satisfied for what it gated, drawn dashed with
"skipped", reopenable forever, and a stored done still wins over it.

**The Stacker reads the tree.** Done moved out of the Skill Stacker's
own storage (D-090): `Skills.state` reads `skillTree.state` first,
`markDone` and `verifyOnce` write the tree (by `self` and by `proof`),
and the Stacker record keeps only its practice states and provenance
(`verifiedBy`, `dueOn`). A household saved before this still reads its
Stacker done through the tree engine. Dashboard block 3 sets the next
open skill beside "the next thing to learn / unlearn", read from the
same engine; nothing is stored there.

**The exercise library.** `engines/exercises.js` and `rooms/exercises.html`:
one shape, five kinds. A `run` is computed through the engine that owns
the calculation (fire, statement, decumulation, cashflow, projection)
and stays locked, naming the field and the room to add it in, until it
can — no silent zero. A `canon` exercise credits its work and author and
is described in this app's words; `origin` is attribution, never a
quotation. Completing any exercise boosts its skill; a run keeps its
result to compare later (`household.exercises`).

**Versioning, house wide.** `version.json` at the root, `major.minor`
only: the major is the shape, the minor a pass. Money Rooms is **2.0,
"The Ledger era"** — spine v2, registry-driven, now 57 rooms.
`Schema.APP_VERSION` carries the same string (a test holds the two
together), every export and share code is stamped `appVersion`, and the
progress strip prints "Money Rooms v2.0" in every room's footer. The
D&D side is vendored, so it follows.

**Calls made.** The two rooms are `about-you` (each owns a field), not
`explore`, because the house rule is that an explore room owns nothing.
The extractor's target files are `data/skill_tree.json` (not the spec's
`data/skills.json`, which is the Stacker's catalogue, vendored under
`dnd/data/`), `data/skill_links.json`, `data/exercises.json`. The tree
engine is `engines/skilltree.js`, beside the Stacker's `engines/skills.js`,
rather than replacing it: the Stacker's practice engine stays, reading
the tree. The board keeps the spec's grammar and geometry (148 × 56
nodes, 212 pitch, 76 row, orthogonal wires with 8px turns, a 3px boost
bar, an 80px fog wash) in the house tokens, since a room may not carry
its own hex values.

### Compatibility note

Stored shape: `household.skillTree` ({ state: {} }) and
`household.exercises` ({ done: {}, results: {} }) are new branches,
empty by default; the Stacker's `skills[id].state` no longer takes the
value `done` for a once-skill (its `verifiedOn` / `verifiedBy` stay).
A household saved before this reads through the constructors; a Stacker
`done` it holds is read as done by the tree engine, so nothing is lost
and nothing migrates. Exports gain `appVersion`. Rooms updated:
`rooms/stacker.html` (writes the tree on verification), `index.html`
(block 3 reads the tree), `shared/progress.js` (the footer). New:
`rooms/skill-tree.html`, `rooms/exercises.html`. A future room that
wants to say a skill is done calls `Spine.setSkillDone`; one that wants
a skill's state calls `SkillTree.stateOf` and never reads
`household.skills[id].state` for done.

## D-132 — Debt Payoff: reasons to keep it, and a hold-back the household flips itself

**Decision.** A debt row now answers two questions, not one. `emotionalTag`
("Feels like") stays exactly as it was; beside it sits `keepReasons`, a
multi-select of the rational reasons a debt is worth keeping: low interest
rate, tax-favourable interest, backed by an appreciating asset, building
credit on purpose, employer-subsidised or promotional rate. The default is
None, which is an empty list, and nothing is ever pre-selected. Separately,
`excludeFromAggressive` is a per-debt checkbox — "Exclude from aggressive
payoff suggestions" — that the household ticks itself.

**The reasons never move the money.** A tag is a note about why a balance is
being carried; it changes no rate, no minimum, no order and no total. Only
the checkbox changes the plan, and only because someone ticked it. The room
says so in the row, in those words, so nobody has to infer it: *"Reasons on
their own change nothing about the payoff order."* The unit suite proves it
by running the same household twice, tagged and untagged, and comparing the
whole plan object byte for byte.

**What the checkbox does.** `Debt.orderDebts` runs the chosen strategy over
every debt as before, then moves the held ones to the tail, keeping their
relative order. A held debt still receives its minimum every month — it is
being paid, just never targeted by the extra — so the plan still finishes.
This is a stable partition after the sort rather than a term inside it, so
every strategy behaves the same way and no strategy's own logic had to learn
about the flag. The room then prints what the decision costs: it re-runs the
plan with nothing held, and shows the interest difference. That re-run is a
what-if and is never written (D-052).

**The suggestion, at entry time only.** When a debt has no reasons yet,
`Debt.suggestedKeepReasons(debt, rules)` reads that debt's own Type and Rate
and offers the ones that fit, rendered muted and dashed with a "Keep these"
chip and a dismiss, under the line *"nothing is saved until you say so"*
(D-060). It never runs in the background, never classifies a debt that
already carries reasons, and stores nothing until the household confirms. A
dismissal lives for the visit and is not stored either: a dismissed
suggestion is not an answer.

Two guards inside the suggestion are worth naming. A 0% card that reverts to
24.99% is offered "employer-subsidised or promotional rate" and *not* "low
interest rate" — a promo rate is a deadline, not a cheap loan (D-053) — while
a promo that stays cheap after it ends is offered both. And an expired promo
is not a reason to keep anything, so it is judged on its real rate alone.

**The chips are painted, never rebuilt.** They sit inside `debt-list`,
which is guarded (D-034), so a tap must not rebuild the row it landed in.
The first build relied on `render()` to redraw the chips and it did not: the
guard correctly refused, so after "Keep these" the reasons were stored but
the chips still read as suggestions and "None" still read as the answer,
which is the worst possible outcome for a control whose entire job is to say
what is stored. `paintKeep(d)` now runs inside `paintLive()` and writes the
pressed state, the suggested class, the label, the suggestion line's
visibility and the hint text onto the nodes already on the page. The
suggestion line is therefore always rendered and hidden when empty, rather
than conditionally built.

**Where the tags show.** Inline, in the payoff prioritisation view itself,
never on a separate screen: each row of the plan chart and each entry in the
timeline carries its reasons as small chips, and a held debt is labelled
"held back on purpose" in the same line. The prioritisation is where someone
is deciding, so that is where the reasons have to be.

**The convention, not a threshold.** `data/debt_rules.json` gains a
`keepReasons` block holding the five tags, their labels and hints, and their
`suggestWhen` conditions. `lowRateCeiling` is 0.06 and is used *only* to
decide whether to offer the low-rate tag. No calculation reads it: the
avalanche still sorts on the real rate, to the cent. It is written down in
the table with that note attached so a later reader does not mistake it for
a maths constant.

`keepReasons` and `excludeFromAggressive` get no `shared/ownership.js` rows,
for the same reason `emotionalTag` has none: the ownership map holds the
household's shared figures, and these are per-row attributes of a debt that
only Debt Payoff ever reads or writes.

### Compatibility note

Stored shape: `Schema.createDebt` gains two fields on every debt —
`keepReasons` (an array of ids from `Schema.KEEP_REASONS`, empty by default)
and `excludeFromAggressive` (a boolean, `false` by default). Both are
cleaned by the constructor: an unknown id is dropped, a repeat is kept once,
and anything that is not an array reads as None, so a hand-edited or
imported file cannot put a debt into a state the engine has not seen. A
household saved before this entry reads through the constructor and comes
back with `keepReasons: []` and `excludeFromAggressive: false`, which is
exactly the old behaviour: nothing is held back, the plan is unchanged, and
no migration runs. `Spine.upsertDebt` accepts both. `FIELDS` gains
`debt.keepReasons[]` and `debt.excludeFromAggressive`. Rooms updated:
`rooms/debt-payoff.html` only. A future room that renders a debt should read
its reasons through `Debt.keepReasonLabels(debt, rules)` rather than mapping
the ids itself, must not treat a tag as a reason to reorder anything, and
must not write `keepReasons` from a rule of its own — the only writer is the
household, through this room.

## D-133 — Debt Payoff: how interest works, asked once

**The confusion.** A debt row asked about interest in four controls, in
three places. A `Rate` box at the top; a `No interest charged` tick
immediately under it; and then, a screen further down inside the
cards-only block, a separate `0% / promo ends` date beside `Then the rate
becomes`. Three of those four say something about 0%, and two of them mean
opposite things: interest-free is forever, a promo is a deadline (D-053).
Someone with a balance-transfer card met the tick first, ticked it, and the
plan then treated the card as free for life — the exact error D-053 exists
to prevent, reachable in one tap because the honest answer was hidden a
screen below.

**The room now asks once.** A `How interest works` block per debt with
three answers — *A rate that stays*, *0% or a promo rate*, *No interest,
ever* — and only the fields that answer owns: a rate; a rate with an end
date and a go-to rate; or nothing at all. Under them, one line saying what
the plan will actually do: "Planned at 5.50% for the whole payoff",
"Planned at 0.00% until June 2027, then 24.99%", "Nothing is added to this
balance." A promo missing its end date or its go-to rate says so in that
same line, in the words that name the consequence: *the plan treats today's
rate as permanent*.

The promo fields are no longer cards-only. `Debt.promoStatus` never cared
about type, and a 0% dealer loan or a 0% hospital plan is a real thing;
hiding the fields behind `type === 'credit_card'` was a bug that made those
debts unrepresentable. The credit limit stays cards-only, because a
mortgage has no limit for a balance to be a share of (D-045).

**The mode is derived, never stored.** `interestFree` means never,
a stored `promoEndsOn` means promo, anything else means stays. So there is
no new field, nothing migrates, and a household imported from anywhere
lands in the right mode on its own.

That derivation deadlocks in one place, and the fix is worth writing down:
promo mode is entered *because* a date is stored, but the date box only
shows in promo mode, so a card with no date could never get one. The tap
itself is therefore remembered for the visit and never stored — the same
treatment a dismissed suggestion gets (D-132). A debt left in promo with
nothing filled in is still, to every engine, a plain fixed-rate debt, which
is what the sentence under the fields says.

Switching modes rewrites only the fields that mode owns, so a stale promo
date can never sit behind a debt the household has said is fixed-rate and
re-enter the plan through `promoStatus`. Leaving *no interest, ever* puts
the rate back to unanswered when the 0 only ever came from that answer —
the rule the old tick already had — so the row asks again rather than
planning a real debt at 0%.

**Every field built once, shown by mode.** Two inputs for one field would
give `paintInterest()` and the change handler two nodes to disagree about.
The fields are built once and hidden by mode, so switching mode paints and
never rebuilds the row under a finger (D-034).

### The figures

Every number in the plan card now sits on one fixed column with what it
means beside it, rather than a two-column list of bare figures: *Interest
you'll pay · $2,888 · The cost of borrowing, on top of what you actually
owe.* The four orderings read as a table — name, interest, time to clear on
fixed rails, with the column captions said once above the list instead of
repeated under every row.

**A tie badges nothing.** When every ordering produces the same total, the
room used to badge one of them "cheapest" while showing four identical
figures, which reads as a bug rather than as a tie. The tie is now worked
out before the rows are drawn: no badge, and the two comparison bar charts
stand down as well, because four bars of identical length drawn twice is
the tie note drawn badly. The note above them already says it in words.

### Compatibility note

Stored shape: unchanged. No field is added, removed, or renamed, and no
migration runs. `interestFree`, `rate`, `promoEndsOn` and `postPromoRate`
are written exactly as before and mean exactly what they meant; only the
controls that write them moved. A household saved before this entry opens
in the mode its stored values imply. `data/debt_rules.json` is untouched.
Rooms updated: `rooms/debt-payoff.html` only. A future room that wants to
say how a debt charges interest should derive it the same way rather than
adding a mode field — `interestFree` first, then `promoEndsOn`, then a
plain rate — and must keep treating a promo with no end date as a
fixed-rate debt, never as free money.

## D-134 — Debt Payoff: one debt, one screen

A single debt row filled a whole phone screen. Name, balance, minimum,
type, the interest block, the feeling, five reason chips with a suggestion
line and a hold-back tick, two dates, a credit limit and its three-line
hint — all of it open, all of it at once. A household with three debts
could not be read at all: the payoff plan, the thing the room exists for,
was several screens below the fold.

**Four facts stay up.** A debt can be planned once the room knows what it
is called, what is owed, what the minimum is, what type it is, and how
interest works. That is the row now. Everything else is set once when the
debt is entered and then almost never touched, so it folds behind a caret:

- **Why you're keeping it** — the feeling (D-124) and the reasons to keep
  it (D-132). Both are about attitude to the debt and neither changes the
  arithmetic, so they belong together and they belong closed.
- **Dates & limit** — borrowed on, due back by, the credit limit and its
  hint (D-045, D-124).

**A closed drawer says what is inside it.** Each summary is live: "3
reasons · one I'd rather not think about · held back", or "due April 2029 ·
limit $15,000", or plainly "nothing set". Folding something away must never
make it invisible, only quiet, and a summary that goes stale would be worse
than no summary at all — so it is repainted on every write like every other
read-only line in the guarded list (D-034).

**Open or closed survives a rebuild.** `<details>` is native, so the caret
costs no JavaScript and works without it. But the list does get rebuilt,
and without carrying the state across, a drawer would snap shut mid-edit —
on a phone, with a finger inside it. The open set is therefore kept for the
visit in `openDrawers`, keyed by debt and drawer, and never stored on the
household: it is how you are looking at the room, not a fact about your
money. The `toggle` event does not bubble, so the listener captures.

**The room is wider than the shared measure.** `--measure` is 480px and
that is right for a room you read. This one is an editor: a debt is a row
of facts, and at 480px those facts stack into a column a screen tall. The
override is local to this room — 720px past 760px wide, 980px past 1040px —
so every reading room keeps the canonical column. Below 560px the three
facts drop to two columns rather than squeezing money values into thirds.

Folding is presentation only. Every field inside a drawer is the same input
writing the same key it wrote before, and the alignment check follows the
`.debt-meta` row into the drawer rather than being dropped.

### Compatibility note

Stored shape: unchanged. No field is added, removed, renamed or written
differently; this entry moves controls and adds no household state. Which
drawers are open is per-visit UI state in a module variable, never written
to the household and never exported. Rooms updated:
`rooms/debt-payoff.html` only; `test/alignment.js` now checks
`.fold-body .debt-meta` where that row now lives. A future room that folds
part of a guarded live-input list should copy the two rules that make this
safe: keep the open set outside the household, and repaint the summary on
every write so a closed drawer cannot go stale.

## D-135 — The menu: upkeep and every room, one pull from anywhere

**Why.** The header strip walks the path one room at a time and offers the
map. That answers "what is next" and is useless for "take me to the thing I
need now". Your Data sits at order 98, so reaching an export meant opening
the map and scrolling past fifty-seven rooms — which is exactly what
happened when the household needed moving from a phone to a desktop.
Upkeep is not a destination on a journey. It is a drawer you pull open from
wherever you are.

**What.** A menu button beside the hop strip on every page, opening a panel
that lists *Your data & upkeep* first — Your Data, Refresh, History, Start
Here, Get Help, then the map — and after that every room grouped by kind.
The room you are in is marked. It closes on the ✕, the backdrop, or Escape;
focus moves into it on open and back to the button on close.

Mounted from `mountHeader`, which already replaces the one `.room-back`
link every page carries, so all fifty-eight pages get it with no per-room
markup. The panel is appended to `<body>`, which keeps it out of every
room's live-input container (D-034) and stops any card from clipping it.
The upkeep list is registry ids, not paths, so a room that is renamed or
moved is followed and one that does not exist is skipped rather than
becoming a dead link.

**Two modes, one drawer.** Below 1080px it is a drawer you pull open over
the page. At 1080px and above there is room for it to simply stay, so it
pins open as a sidebar: no button, no backdrop, nothing to dismiss, and the
page sits beside it. Opening is a no-op while pinned, so nothing can leave
it half-closed. The switch is `matchMedia` in JavaScript rather than a
media query, because `[hidden]` is `display:none !important` in the theme
and a media query fighting that with more `!important` is worse than one
listener.

**Two things the first build got wrong**, both worth recording because they
are easy to repeat. The panel used `--color-surface-raised`, which is
`rgba(15, 38, 80, 0.55)` — the surface tokens are translucent by design, so
the drawer showed the page through itself and was unreadable. It is now a
solid `--navy-850`. And the whole app is written to `--measure: 480px`,
which is right for a room you read and leaves a ribbon in a field of navy
on a desktop; the measure now grows to 620px past 1080px and 680px past
1400px. A room that sets its own wider measure, as Debt Payoff does
(D-134), keeps it.

### Compatibility note

Stored shape: unchanged. Nothing here reads or writes the household; the
menu is chrome. Whether it is open is not stored — below the pin width it
always opens closed, and at or above it is always open, so there is no
state to carry and nothing to migrate. Rooms updated: none individually.
`shared/progress.js` gains `mountMenu`, `menuHtml` and `UPKEEP`, and
`mountHeader` now calls `mountMenu`, so any page already calling
`mountHeader` gets the menu with no change. `shared/theme.css` gains the
menu styles and the wider desktop measure, and `dnd/shared/theme.css` is
re-copied to stay byte-identical. A future room needs to do nothing to
appear in the menu beyond being in the registry; to sit in the upkeep group
instead of its kind group, add its id to `Progress.UPKEEP`.

## D-136 — Phone and desktop, measured rather than eyeballed

Every room was loaded at 412px and at 1440px and checked for four things:
does the page scroll sideways, is anything wider than the screen, how many
controls are under 32px tall, and how much of a monitor the content
actually uses. The fixes below are what that found. Each one is a shared
class or a bare element, so none of it is a fifty-seven room edit.

**The sideways scroll.** `rooms/ratios.html` scrolled 69px horizontally on
a phone. A bar row's third cell is a figure, so `.slaf-bars .val` is
`white-space: nowrap` — correct for `$2,888`. But a row with no figure
carries a *reason* in that cell instead ("needs monthly debt payments,
gross annual income"), and nowrap made a sentence one very long line that
pushed the page open. A reason now wraps and reads left; a figure still
never wraps.

**Touch targets, only where there is a finger.** The suggestion chip was
19px tall, a tick 16px, a summary 25px, the exercise chips 23px with
eighty-eight of them on one screen, and the ⓘ 20px on a page whose own lede
says to tap it — forty-five times. All of these are now at least 32px under
`@media (pointer: coarse)`, so a mouse keeps the compact controls they were
designed as.

Two things are worth writing down. Rooms style their ticks as `.flag input`,
which ties on specificity with a bare `input[type="checkbox"]` and wins on
source order, so the shared rule names `label input[type="checkbox"]` to sit
above every room following that pattern. And the ⓘ was first given an
invisible `::after` hit area, the usual trick for keeping a small circle
small; a tap five pixels above it still missed, so that was abandoned for
growing the button itself to 30px on a coarse pointer. The trick was not
verified to work here and is not in the code.

**Inline links in prose are deliberately left small.** Sixty-two of the
remaining under-32px elements in the Exercises room are links inside
sentences. Padding those to a thumb's height would tear the paragraphs
apart, and they are never the primary control on a page.

**Desktop.** The measure steps 480 → 620 at 1080px → 680 at 1400px → 720 at
1600px, and stops there. Past roughly seventy-five characters a line gets
harder to read, not easier, so the answer to a big monitor is not an
ever-wider paragraph — which is why the average screen width used stays
near half and that is the right answer for a column of prose. Where the
content is not prose the space is taken: `map.html` lists fifty-seven
equivalent, independent cards, and those flow two-up past 1080px instead of
running down one long column.

What this pass did **not** do is give each room a desktop layout of its
own. Most rooms are a vertical stack of cards whose order carries meaning —
the figure, then the chart, then the inputs — and flowing those into columns
blind would break the reading order that makes them legible. That is a
per-room job and is recorded in `LATER.md` rather than guessed at here.

### Compatibility note

Stored shape: unchanged. Nothing in this entry reads or writes the
household; it is all presentation. Rooms updated: `map.html` (a two-column
grid past 1080px) and `rooms/exercises.html` (its chips grow on a coarse
pointer); everything else is `shared/theme.css`, with
`dnd/shared/theme.css` re-copied to stay byte-identical. A future room
inherits all of it by using the shared classes: `.slaf-bars` rows,
`.slaf-info`, `.slaf-use-this`, and ticks inside a `<label>`. A room that
invents its own small control should add it to the coarse-pointer block
rather than sizing it for a mouse and leaving a phone to cope.

## D-137 — The interaction layer: nothing snaps, every word fits

The app was described as feeling amateurish. Rather than argue about taste,
every room was measured. Two numbers came back and both were damning:

- **4,558 of 4,844 links and buttons had no transition at all** — 94%.
  Every hover, press and open snapped instantly.
- **Eight rooms were clipping text**, all of them the hop links, showing
  "Where It Goes & how it's" and stopping mid-word.

Nothing was broken. That is the point: a control that changes state
instantly reads as a picture of a control rather than one you are touching,
and a name cut off mid-word reads as a bug even when the layout is doing
exactly what it was told.

**One easing, two durations, for the whole app.** `--ease` settles rather
than bounces — quick out, soft landing — with `--dur-fast` for colour and
`--dur` for shadow. Applied to links, buttons, summaries, inputs, cards,
chips, the menu and the ⓘ. Never `transition: all`: that animates layout
too, so any reflow makes the page lurch, which is worse than no motion at
all. The layer names the six properties it changes.

A press moves 1px — enough to read as a button going down, small enough
never to shift what is around it. A card that is a link lifts on hover; a
card that is not does not pretend to. Disabled controls get no hover, no
press and a not-allowed cursor, so the app never invites a tap it will
refuse.

The `prefers-reduced-motion` block already cut every duration to 0.01ms, so
this entire layer costs a person who asked for stillness exactly nothing.
That was checked, not assumed.

**Every word in the box.** `.slaf-hop` was `white-space: nowrap` with an
ellipsis. A room name is the entire content of that link, so truncating it
removes the only thing it says. It now wraps to two lines and clamps beyond
that. Clipped rooms went from eight to zero.

**Contrast.** Every text node in every room was then measured against WCAG
AA. 57 failed, and 33 of those were a single bug: the theme never gave a
bare `<a>` a colour, so any link a component did not style itself fell back
to the browser default `#0000EE` — pure blue on navy, 1.88:1, invisible.
"Load it below", "Your Data →" and "The Score" were all unreadable on the
front page. One default rule fixes all 33 and stops it recurring.

The primary button was next: a dark label on `--color-accent` measured
4.04:1. Lightening the fill to `--sapphire-300` rather than touching the
label takes it to 7.6:1 and makes the primary action read as primary.
`--color-accent` itself is untouched, because it is a border and chip
colour in a hundred places where it carries no text.

One mistake there is worth recording. The first attempt added
`.slaf-btn { color: var(--color-text); }` at the end of this file. That
ties on specificity with `.slaf-btn--primary` and wins on source order, so
it silently repainted the primary label near-white on the new light blue
and took it to 2.34:1 — worse than before. A variant's colour is set where
the variant is defined, never in a later blanket rule.

After: 0 of 5,123 interactive elements without a transition, 0 rooms
clipping text, and contrast failures down from 57 to 10. The remaining ten
are room-local `<button>` elements at ~4.1:1 that do not use the shared
class; they are listed here rather than quietly claimed as fixed.

### Compatibility note

Stored shape: unchanged. Nothing here reads or writes the household. Rooms
updated: none individually — all of it is `shared/theme.css`, with
`dnd/shared/theme.css` re-copied to stay byte-identical, so all 59 pages
inherit it. A future room gets the motion by using the shared element and
class names; one that invents a control should add it to the transition
list rather than shipping something that snaps while everything around it
moves. Do not add `transition: all` anywhere — `test/rooms/motion.js`
fails the build if it appears outside a comment.

## D-138 — The FIRE Lab: every calculation on one screen, drawn

The FIRE maths was all there and almost none of it was visible. Twelve runs
sat in `engines/exercises.js` behind an exercise list, each computing
through an engine that already owned its formula, and each returning a
figure and a sentence. A sentence is not what a sensitivity grid or a
milestone ladder wants to be.

`rooms/fire-lab.html` draws them. Seven panels, all reading the same
household, all recomputing together:

- **The number and the ring.** The FIRE number beside a donut of how much of
  it is already invested, with the gap and the time to close it on a rail
  underneath, each figure carrying what it means (the pattern from D-133).
- **The withdrawal rate.** One range control. Move it and every panel on the
  page moves with it.
- **The six flavours**, as bars: FIRE, Lean, Chubby, Fat, Coast and Barista,
  each with how far away it is. One that cannot be computed says which
  figure it wants rather than being dropped or drawn as zero.
- **Where the number comes from**, as a donut of a year's spending by kind.
- **Milestones** at 25 / 50 / 75 / 100%, as bars of years, with the ones
  already reached marked rather than shown as a gap.
- **The path**: portfolio compounding year by year against the flat line of
  the number, stopping a few years after the crossing rather than running a
  flat forty.
- **The sensitivity grid**: four withdrawal rates by five lifestyle levels,
  with the square you are actually standing on lit.

**It owns no formula and writes nothing.** Every figure comes from
`Fire.calculateFIRE`, `Fire.progressToward`, `Fire.allVariants`,
`Tier0.savingsRate` and `Projection`. The withdrawal-rate control is a
local override for the view (SPEC.md §12.2) and is gone on reload — the
stored assumption is never touched, which the browser walk confirms by
reading it back after moving the slider.

**A donut of one slice is not a chart.** When Cash Flow has a categorised
month the spending donut draws it; when it does not, the room says what a
year of spending is and links to where to categorise it, rather than
drawing a circle that is 100% "spending" and tells you nothing. Both
branches are exercised — four real slices with categories, the sentence
without.

Two bugs found by running it rather than reading it. `Charts.area` takes
`[x, y]` pairs; feeding it `{x, y}` objects produced `NaN` in every path
attribute and ten SVG errors on the console, with the chart silently blank
apart from its legend. And the spending summary hangs off
`TABLES.expenseCategories`, not `spendingCategories` — the wrong key made
`summarise` return null and a `&&` chain then called `.filter` on it. Both
are the kind of thing a unit test on a static file cannot see.

### Compatibility note

Stored shape: unchanged. The room reads `expenses.monthlyEssential`,
`investments`, `dob`, income and filing status, and writes nothing at all —
it owns no field in `shared/ownership.js` and calls no `Spine` mutator.
Rooms updated: none; `rooms/fire.html` keeps its job of choosing and storing
a variant target, and the Lab is the read-only view over the same engines.
New: `rooms/fire-lab.html`, a registry row at order 8.5 between FIRE Number
and Real Hourly Wage, `test/rooms/fire-lab.js`, and a regenerated
`rooms.json`. A future panel added here must keep the two rules that make
the room safe: read through the engine that owns the formula, and treat any
parameter someone can move as a local override rather than a write.

---

## D-139 — The Skill Tree gets its real curriculum: 625 skills, 25 trees, 312 lanes

D-131 shipped the Skill Tree room against a seed of twenty-six skills and
said so plainly: the real catalogue lived in a file called
`FI-Skill-Tree-v6.3.x` that nobody in the session had, and
`scripts/extract-v63.mjs` was a stub that documented the target shape and
exited rather than inventing a curriculum. The file arrived. This entry is
the unblock.

**What the source is.** One HTML page whose `<script>` declares three plain
data literals: `DATA` — 25 trees of 25 skills, each row
`[name, what, does, fits, check, tier]`; `BANDS` — the five bands the page's
own legend names FOUNDATION through ENDGAME; and `LINKS` — 312 cross-tree
shortcut lanes as `[fromTree, fromLevel, toTree, toLevel]`, all
zero-indexed.

**How it is read.** Not by running it — the page wants a canvas and a DOM.
The extractor finds each declaration and balances brackets from there, with
a string-aware scan so a brace inside a sentence cannot fool it. The one
thing that caught me out: the source declares `const DATA=[...],LINKS=[...]`
as a single continuation, so anchoring on the `const` keyword found `DATA`
and never found `LINKS`. Anchoring on a token boundary finds both.

**What the mapping asserts, and on what evidence.** Levels 1–25 land on the
five bands five at a time, because that is what the source's own band legend
describes. Within a tree, each level takes the one before it as its
prerequisite, because the source is written as a ladder and says so in its
own copy ("Builds on L1", "After L3"). A lane means finishing one skill
opens a skill in another tree without walking that tree's ladder up to it —
which is the whole point of a lane, and why both ends are resolved to ids in
the extractor so nothing downstream has to know about index pairs.

**The app's own forty skills are not thrown away.** Entering your facts,
closing a month, freezing a snapshot — a general FI curriculum has no reason
to contain those, and the exercises, the FOO cross-links and the Skill
Stacker all point at them by id. They are preserved in
`scripts/skill_tree_app.json` and merged in. They live beside the extractor
rather than in `data/` because `data/` is for tables a room loads at
runtime and no room loads this one: it is an input to the build, not an
output of it, which is also why re-running the extractor can never destroy
them. `test/run.js` was right to reject it from `Reference.TABLE_FILES`;
the fix was to move the file, not to widen the guard.

The result: **31 trees, 665 skills, 312 lanes** — the 25 curriculum trees
plus the app's six (keeper, anchor, compounder, earner, ledger, planning).

**The source page itself is not in the repo.** The extracted data is. Keep a
copy of the v6.3.1 file if you want to re-run
`node scripts/extract-v63.mjs <path>`; the committed JSON is the artefact
the app reads.

### `unlocks` is the chip row, not the edge list

The first pass wrote the next rung of each tree into every skill's
`unlocks`, on the reasoning that a node with nothing in `unlocks` draws a
dead end. That was wrong, and the room showed it: `unlocks` is what the
engine's `chips()` turns into the little links on a card, and it understands
exactly two kinds of entry — `{room}` and `{number}`. A `{skill}` fell
through to the number branch and produced a chip labelled `undefined`
pointing at `ratios.html#r-undefined`, on all 625 curriculum cards. It
looked like a link. It was not one.

Order is already said twice, in the right places: **up a tree by `prereqs`**,
**across trees by the lanes** in `data/skill_links.json`. It does not need a
third home. So the curriculum's `unlocks` are empty and its cards show no
chip row, which is the truth — the v6.3.1 source carries no room or number
mapping, and inventing one would be fiction. The forty app skills keep
theirs, because theirs are real.

Two things hardened off the back of it:

- `chips()` now **drops an entry it cannot address** instead of drawing it.
  A chip that cannot be clicked should not exist.
- The test that let this through said "every skill that is not a capstone
  says what it opens" — which the bad data satisfied. It is replaced by
  checks that can only pass on true data: levels run 1..n with no gap; every
  rung of a curriculum tree stands on the one below it; every lane joins two
  skills that exist, in two different trees; and **no `unlocks` entry is a
  bare skill id**.

### A curriculum tree is a ladder; this app's own trees are not

Scoping that ladder check turned up the distinction. The v6.3.1 trees are
25 rungs each, in order. This app's six — keeper, anchor, compounder,
earner, ledger, planning — were authored as a graph: "close a month" does
not stand on "enter the facts" in a straight line. Requiring a chain there
would have meant inventing edges. So each tree now carries **`source`**,
`'v6.3.1'` or `'app'`, the ladder check applies only to the first, and both
are still checked against the whole catalogue for prerequisites that
resolve. The app's skills also predate the `level` field and are numbered
within their own tree by the extractor, so every node on the board knows
which rung it is.

### Words in their boxes

At twenty-six skills the board had room. At 665 it does not: the cards are a
fixed size on an absolute grid, so a name longer than its box does not push
the layout — it silently spills or clips, and no unit test on a static file
can see it. Measured and fixed:

- The card is **184 × 72** (was 148 × 56), the name clamps to **three lines**
  at 12px, and it wraps inside a word when a word is longer than the line.
  Three lines at that width holds the longest name in the catalogue (49
  characters) with room to spare, and the p95 name (30 characters) sits on
  two.
- The state badge — the lock, the done date, the "skipped" tag — moved from
  the **top** right to the **bottom** right. At the top it sat on the name's
  first line. The bottom right was empty, because the unlock chips are
  bottom left.
- The name's own area is padded clear of the chip row, so a three-line name
  and four chips cannot collide.

`test/alignment.js` now measures this in a real browser, at desktop width
because the board is hidden below 700px in favour of the phone serpentine:
no name clipped by the clamp, no text box drawn outside its card, no name
overlapping the chips or the badge. It measures the nodes the board actually
drew, and then puts **every** name in `data/skill_tree.json` through a real
node box — otherwise the longest names, which live in the endgame bands,
would go unmeasured until someone reached them.

**`scripts/seed-skill-tree.mjs` is deleted.** Its own header said it would
be "replaced wholesale by `scripts/extract-v63.mjs` once the file is in the
repo", and leaving it there would have been a loaded gun: running it now
overwrites `data/skill_tree.json` with forty skills and throws the
curriculum away. Its output is preserved as `scripts/skill_tree_app.json`,
which is now hand-edited source rather than a generated file. Git has the
generator if anyone ever wants to see how the seed was made.

### What "quests and dares" turned out to be

LATER.md had them arriving with the file. They do not, and reading the
source says why: a 90-day quest there is a **skill you pick** — the page
stores `{ti, lv, t}`, an index into the same `DATA` plus a timestamp — and
"dare" appears only inside skill prose. There is no catalogue to parse. It
is a feature to build over the catalogue we now have, and LATER.md has been
re-scoped to say so rather than to keep waiting for a file that would never
contain it.

### Compatibility note

Stored shape: **unchanged**. Nothing about `household.skillTree` moved —
`state`, `provenance`, `bypassed` and the exercise records all read and
write exactly as D-131 left them. What changed is the reference data those
ids point into.

- `data/skill_tree.json` and `data/skill_links.json` go to **version
  3.0.0**. Every id the app already stored still resolves: the forty app
  skills kept their ids byte for byte, which is the reason
  `scripts/skill_tree_app.json` exists as a preserved seed rather than
  being regenerated.
- **Trees gain `source`** (`'v6.3.1'` or `'app'`) and every skill carries
  `level`. Both are additive; nothing reads a field that went away.
- The 625 new ids are namespaced `<tree>-<slug-of-name>`, with a numeric
  suffix on a collision. A stored id that is not in the catalogue is already
  handled: the room reports it as "not yours" rather than failing, which is
  what the "664 skills are yours, 1 is not" line on the board is showing.
- Rooms updated: none needed changing. `rooms/skill-tree.html`,
  `rooms/exercises.html`, `rooms/stacker.html` and dashboard block 3 all
  read through `engines/skilltree.js`, which was written against the schema
  and not against the seed's size.
- Before adding to the catalogue: add curriculum skills by re-running the
  extractor against a newer source, and app skills by editing
  `scripts/skill_tree_app.json` — never by hand-editing `data/skill_tree.json`,
  which is generated and will be overwritten. If you add a name longer than
  49 characters, widen `COL_W` and the clamp together and re-run
  `test/alignment.js`, which measures exactly that.

---

## D-140 — The board, redrawn as a tech tree

D-139 landed 665 skills on a board built for 26 of them, and the shape gave
out. The old board made each of the five **bands** a column and stacked
every skill in that band down it. At 26 skills that is a diagram. At 665 it
is five columns and 133 rows — **1,200 × 13,184 pixels**, a mile of scrolling
with no line to follow, in which nothing shows you that a skill has a before
and an after.

**Rows are trees now, and columns are rungs.** One row per tree, one column
per level, the five bands as column groups labelled across the top. A row
reads left to right the way a tech tree does: rung 1, then rung 2, arrow by
arrow, all the way to the capstone. **6,000 × 2,838 pixels**, and every one
of the 31 trees is a line you can follow.

- **The tree names sit in a rail that does not scroll.** The board is
  6,000px wide and no screen is; a name that scrolls away leaves 31
  anonymous rows. The rail is a fixed column beside the scroller, with the
  rung count under each name and the row you have selected marked.
- **The 312 shortcut lanes are drawn**, faint and dashed, under the rungs —
  they are what makes this a tree rather than 25 separate ladders. Pick a
  node and the lanes touching it light up, so one tap shows what a skill
  reaches across the board. A lane running backwards is drawn as a curve
  rather than an elbow, because an elbow that goes right and then left reads
  as a mistake.
- **The room takes the whole window**, and the sections that are prose keep
  the shared measure and line up on its left. Same move as D-134 in Debt
  Payoff and for the same reason: this room is a board, not something you
  read. Everywhere else the measure is untouched.

### The column rule, and what it costs

**Column = rung − 1, for every tree.** Five columns to a band, which is the
curriculum's own rhythm, so a curriculum node always lands under its own
band header.

This app's own six trees were not written to that rhythm — "close a month"
is a Foundation skill at rung 3, "plan the handover" an Endgame skill at
rung 3 — so on those six rows the band header above is the curriculum's
ruler and not a claim about them. That is the cost, and it is small and
contained: each card states its own band, and a node's **state**, not its
x, is what decides whether it is fogged. The alternative was to widen a band
so the widest tree fit — one tree has eight Foundation skills — which put
three empty columns through all thirty-one rows. Three columns of nothing
across the whole board is worse than a header that is exact for 25 rows out
of 31.

### Two things fixed on the way

- **Tree order.** The app's six trees carried `order` 1–6, the same numbers
  as the first six curriculum trees. Sorting rows by `order` interleaved
  them, so the board opened on "Keeping it" and "The anchor" rather than
  Main Path. The extractor now renumbers them 26–31, continuing the
  curriculum rather than colliding with it.
- **The rung a skill sits on comes from the catalogue, not the engine.**
  `engines/skilltree.js` says what state a skill is in; where it is drawn is
  a property of `data/skill_tree.json`. The room reads `level` straight from
  the table, and the engine's contract is unchanged.

### Compatibility note

Stored shape: **unchanged**, and no engine signature moved. This is a
rendering change inside `rooms/skill-tree.html`: `renderBoard` and the
board's markup and CSS. `renderSerp` — the phone's serpentine, which is what
runs below 700px — is untouched, and the phone still opens on a single tree.

`data/skill_tree.json` changes in one way a future reader should know
about: **`trees[].order` for this app's own six trees is now 26–31 rather
than 1–6.** Anything that sorts trees by `order` gets the curriculum first
and this app's own last, which is the intent. Nothing reads `order` as an
identity — the id is the identity — so no stored value is affected.

Before changing the board again: the rail's width and the node's width are
the same 148/184px pair the layout is built on, and `test/alignment.js`
measures both the drawn nodes and every name in the catalogue against a real
node box. Run it.

---

## D-141 — The card says what the curriculum says

The v6.3.1 source writes four things about every one of its 625 skills:
**what it is**, **what it does for you**, **where it fits**, and the
**check** that levels it. `data/skill_tree.json` has carried all four since
D-139. The room was showing one — "Done when" — and dropping the other
three on the floor between the table and the card.

So the card now reads:

> **Capture the full 401(k) match** · Tier S
> **What it is:** Contribute to the match threshold
> **What it does for you:** Guaranteed 50–100% instant return
> **Where it fits:** Before all other investing; feeds L6 waterfall
> **Done when:** Match verified on an actual paystub

Three rules hold it honest:

- **A line that is not there is not printed.** This app's own forty skills
  were written with a proof and no prose; their cards show what they have
  and say nothing where they have nothing, rather than printing an empty
  label.
- **The fog covers all four**, the same way it covers the name and the
  proof. A skill you cannot see yet tells you nothing about itself.
- **The tier says what it is on the badge.** S / A / B / C is the
  curriculum author's ranking of leverage — which is exactly why
  `data/skill_tree.json` is stamped `confidence: convention` — and the badge
  carries that sentence rather than leaving a letter to be guessed at.

**Two names fixed while I was in there.** The line under a skill's name read
`· main-path · foundation` — a raw id, a raw band key, and a separator
hanging off an empty slot because the curriculum does not say how long its
skills take. It now reads
`⭐ MAIN PATH: Accounts & Investing · Foundation`: the tree's own label, the
band's own label, and a part that is missing simply left out rather than
printed as a gap with punctuation around it.

### Compatibility note

Stored shape: **unchanged**; nothing new is written and no field moved.

`engines/skilltree.js` **adds four fields to each row it returns** —
`what`, `does`, `fits`, `tier` — beside the `proof` it already returned, and
nulls them in the fog like the rest. Purely additive: `evaluate()` keeps its
signature and every existing key. Rooms updated: `rooms/skill-tree.html`
only. `rooms/stacker.html`, `rooms/exercises.html` and dashboard block 3
read the same rows and are unaffected by four keys they do not ask for.

A future room that wants to show a skill should read these from the engine's
row rather than reaching into `TABLES.skillTree` itself — the fog rule lives
in the engine, and a room that reads the table directly walks straight
through it.

---

## D-142 — A room does not ask a question your situation has no answer to

Someone between jobs opened Real Hourly Wage and was asked for their paid
hours a week, their unpaid overtime, their commute, and their costs of
working. The chart above it read "A year of pay per $46,935" over a bar one
hour long. Thirteen other rooms did the same thing: a contract rate, a
401(k), a side hustle, a partner's income, a child's tuition — asked of
someone with no job, no partner and no children.

**None of this was an undecided question.** `Gate.exists` has known which
rooms belong to which situation since D-094, and `Registry.applies` has read
it the whole time. But only the map and the menu ever asked. A room reached
by a link, a bookmark, the header hops or the menu drew its whole body
regardless — and the menu lists every room, so the app was handing out the
door it had decided to close.

Measured before and after, in a browser, across all six situations and every
room: **342 room-situation pairs**. Before: 14 wrong for someone between
jobs, 14 for a retiree, 8 for a student, 6 for someone employed. After: 0.

### One place, because every room already goes through it

`Progress.mountHeader(roomId)` is the one function every room reaches — 22
through `Room.mount`, the rest by calling it directly. The check goes there,
so no room carries markup or logic of its own for this, and a room built
tomorrow gets it by existing.

**The room is folded, not blanked.** The notice says which situation you
said you were in, gives the reason in one plain sentence, offers the next
rooms that *do* apply, and ends with **Show it anyway**, which opens
everything. Nothing is taken away — the app declines to ask, and says so.

**"Show it anyway" is not stored.** It lasts the visit. A view is not a fact
about the household (D-052), and a household that looked once at Kids and
Tuition has not thereby acquired children.

### The gate had to learn to say why

`exists` returned a boolean, which is enough to hide something and not
enough to explain it — and a room that folds itself with no reason given is
worse than one asking the wrong question. So `shared/gate.js` gains **`WHY`**,
one plain sentence per branch, and **`why(household, keys)`**, which returns
the first reason that applies or `null`. They live next to `BRANCHES` on
purpose: a branch added without a sentence is a room that hides in silence,
and `test/rooms/situation.js` fails the build for it.

The sentences describe **the room**, never the reader. "This one prices the
hours a job takes. There is no job to price yet" is true whether you are
retired, a student or between jobs; the situation is named once, by the
notice, from `Gate.situationOf`. A test enforces this too — a sentence
saying "you are…" would be wrong somewhere.

### The gate was loaded in 26 rooms out of 57

The first fix worked in seven rooms and did nothing in the other seven, and
the reason was not logic: **31 rooms load `shared/progress.js` and never
loaded `shared/gate.js`**, so `SLAF.Gate` was undefined and the check
returned "no opinion". The gate is part of the shared baseline now and is
loaded wherever progress is.

### The fold has to follow the household, not the page load

The phone-tap suite caught the version of this I shipped first. It navigates
to Between Jobs, *then* sets the household's status to unemployed, and taps.
The fold had been painted once at mount, so the room stayed folded against a
household it now applied to, and the inputs were never reachable — the test
timed out.

The test was right and the implementation was wrong, in a way that matters
outside the test: a household whose situation arrives after the page does —
a share link, a late table load, another tab — kept a fold that no longer
applied, and anyone changing their situation had to reload to see a room
open. `mountSituation` now re-checks on every `Spine.onChange`, folding and
unfolding both ways, and re-writes the reason when the situation changes
under it. Verified in a browser: folded while employed, open the moment the
status changes with no reload, folded again on changing back.

**"Show it anyway" survives all of it.** Once you have opened a room, no
later change to the household folds it under you again for that visit.

### Two things this turned up that I did not change

- **Between Jobs, Partner and Kids are absent before you say anything.**
  `test/run.js` asserts this deliberately — they need a *fact* (a status, a
  second adult, a named dependent), not a situation. I "fixed" it, two
  existing checks failed, and they were right; reverted.
- **`tax` and `fire` are off between jobs**, because `income` and
  `savingsRate` are. Defensible — there is no income to tax and no rate to
  take a share of — but someone between jobs still has questions about the
  tax on unemployment pay, and still has a FIRE number. Worth revisiting on
  its own, not silently inside a rendering change.

### Compatibility note

Stored shape: **unchanged**. Nothing is written, nothing is read that was
not read before, and no owned field moved. "Show it anyway" is a variable in
one page's memory and never reaches the spine.

- `shared/gate.js` gains `WHY` and `why()`. Additive; `exists`, `branches`,
  `situationOf` and every other export keep their signature and behaviour.
- `shared/progress.js` gains `mountSituation()` and `situationNoticeHtml()`,
  and `mountHeader()` now calls the first. A room that does not want this
  cannot opt out and should not want to — but note that the check is a
  no-op when the situation is unanswered, so the intake is unaffected.
- **31 rooms gained one script tag** (`shared/gate.js`, immediately before
  `shared/progress.js`). A new room must load it too; the suite checks that
  every room loading progress also loads the gate.
- A future room that should switch off for some situations adds its branch
  to `REQUIRES` in `shared/registry.js` and needs no code of its own. If it
  adds a *new* branch to `BRANCHES`, it must add the sentence to `WHY` in
  the same commit or the build fails.

---

## D-143 — The panel audit: the crash, and the things it said that were not true

Four reviewers audited the dashboard's full panel — one on plain language,
one on information architecture, one on partial data and correctness, one on
layout and accessibility, each measuring in a real browser rather than
reading. This entry is the correctness half of what came back.

### Typing zero for a month of spending took the whole dashboard down

The worst of it. A person types `0` in monthly spending — an affirmative
answer, and the exact case the first non-negotiable in `CLAUDE.md` exists to
protect — and **every panel on the dashboard rendered empty** under a red
banner reading *"Couldn't load the reference tables in data/"*. The tables
had loaded perfectly. At the bottom of the same blank page the progress
strip said "This room has everything it needs."

Four failures in a line, each fixed where it belongs:

1. **`engines/fire.js`** — `progressToward` has an early return for a FIRE
   target of zero (spend nothing, need nothing) that omitted `yearsAway`.
   Every caller reads it. It now carries `Money.ok(0)`, which is also true:
   if the target is zero you are already there.
2. **`engines/statement.js`** — `bridgeGap` did `if (!Money.isOk(years))
   return years;`, handing on an `undefined` as though it were a Result. A
   relay now says so in its own words instead of passing the problem along.
3. **`engines/ratios.js`** — `all()` read `result.unavailable` on whatever
   each compute returned and threw on the one that was not a Result, losing
   the twenty-one that were fine. A row that breaks its contract is now one
   unavailable row, named, and the page keeps its head.
4. **`index.html`** — the `.catch` reported *every* failure as a data-file
   problem, including exceptions thrown while rendering with the data
   loaded. It now distinguishes the two and, for a render error, says the
   household's numbers are stored separately and are safe.

### Things the panel said that were not true

- **"Every banded ratio sits at or inside the comfortable edge."** Three
  errors in nine words. *Inside* is the **below-range** side — the hint two
  inches above it says so, and the hint was right. It counted only the red
  rows, so seven amber ones were reported as fine. And "every banded ratio"
  claimed all 22 bands when only the ones that could be computed are drawn.
  It now names the reds, counts the ambers, and says how many more have a
  band but are still waiting on something you have not entered.
- **The green tint was painted on the bad region.** `.ring-good` filled the
  inner disc — the below-range side — pale green, under a heading reading
  "Am I in the green everywhere?". A shape sitting deep in the bad zone
  looked like a pass. The fill is gone; the dashed ring is the line and the
  dots say which side they are on.
- **A goal you had never funded read `$0 of $30,000 · 0%`**, identical to
  one you had told it was zero — `Money.isEntered(x) ? x : 0`, the one
  `? : 0` in the panel and a straight breach of Empty ≠ zero. It now says
  "add what you have put aside →" and links to Goals.
- **"Every goal with a date and a contribution arrives on time"** was said
  over a set of goals with nothing going into any of them, because the
  counter counted every goal whose plan computed. Funded goals are counted
  separately and the sentence now matches.
- **The goal bar floored at 1%**, drawing a sliver of progress where there
  was none, while the percentage capped at 100 and the two figures beside it
  did not — so "$2,500 of $1,000 · 100%" was possible. The bar and the
  numbers now agree, and an overshoot is marked rather than hidden.
- **"ⓘ Three risks left blank on purpose"** opened a panel beginning "Two
  risks this panel deliberately leaves blank". One tap, and the count
  changed.
- **The only link to The Score was a 404.** `href="health.html"` from the
  repo root; the room is at `rooms/health.html`. It was the panel's one
  pointer to the room that answers the question the radar's own heading asks.

### The panel had never once asked the gate

D-142 fixed this for rooms. The panel had the same disease and worse
symptoms: a **retired** household was shown their **FI ratio in red**, their
savings rate beside it, and an accumulation ladder — the numbers that have
stopped meaning anything for them. `Gate.exists` appears exactly once in
`index.html`, and that once is above the fold.

`engines/ratios.js` now tags eleven ratios with the gate branch they belong
to, **as data**: the engine names a branch and never imports
`shared/gate.js`, so it stays pure. `radar()` takes an `opts.applies(branch)`
predicate; the dashboard hands it the gate. A retiree loses savings rate, FI
ratio and personal cash flow, and gains withdrawal rate.

`radar()` also returns **`bandedTotal`**, **`notYours`** and **`notYet`**,
because the caption could not be honest about a denominator the engine never
told it.

### Compatibility note

Stored shape: **unchanged**. Nothing is written and no owned field moved.

- `engines/ratios.js`: each row gains **`gate`** (a branch name or `null`),
  and `radar()`'s result gains **`bandedTotal`**, **`notYours`**, `notYet`.
  `radar()` accepts a new `opts.applies` predicate; **omitting it keeps the
  old behaviour**, so `rooms/ratios.html` and every other caller is
  unaffected until it chooses to pass one.
- `engines/fire.js`: `progressToward`'s zero-target branch now includes
  `yearsAway`. Purely additive — a key that used to be missing is present.
- `engines/statement.js`: `bridgeGap` returns a Result on every path. It
  always claimed to; now it does.
- A future ratio that only applies in some situations sets `gate` on its own
  row and needs no code elsewhere. A future caller of `radar()` that wants
  the filtering passes `applies`; one that does not, does not.

The remaining findings — the language, the running order, and the measured
contrast and tap-target failures — are D-144 and D-145.

---

## D-144 — The panel audit: contrast, tap targets and the missing triangle

The measured half of the four-way audit (D-143 was the correctness half).
Every number here was taken in a browser at 320 / 390 / 768 / 1080 / 1440,
not eyeballed.

**Fifteen AA contrast failures inside the panel, and ten of them were one
token.** `--color-text-faint` was `rgba(96,165,250,0.50)`, which composites
to **2.63:1** on `.slaf-owned`, **2.66:1** on a card and **2.70:1** on the
drawer. It paints the radar's spoke numbers, the legend indices, both ⓘ
buttons, the donut percentages, the step chips, the drawer's own subtitle and
the "Last confirmed" line. D-137 fixed bare links and the primary button and
left this alone. `0.75` still misses; **`0.80`** clears 4.5:1 on all three
grounds (4.61 / 4.74 / 4.90).

The rest, each with its measurement:

- **`--color-critical` as text: 4.31:1.** `#E5484D` at 13px on a card — and
  it is used for the one figure that is out of range, which is the number the
  section exists to surface. A new **`--color-critical-text: #FF6369`**
  (5.82:1) carries the text; the border and arc uses keep the original,
  because they carry no text.
- **The reached step chips: 4.11:1.** `--color-accent-contrast` on
  `--color-accent`. This is byte-for-byte the bug D-137 fixed on
  `.slaf-btn--primary` by lightening the fill, and the chips were not in that
  pass. `--sapphire-300` takes it to 7.46:1.
- **The radar's own rings and spokes: 1.26:1.** They are the chart's frame —
  without them the polygon has nothing to be read against — so 1.4.11's 3:1
  applies. `--color-border-active` measures 3.4:1.

**On a phone the drawer had no disclosure triangle at all.** D-136 set
`summary { display: flex }` to give it a 32px height, and `flex` overrides
the UA's `list-item`, which is the only display Chromium paints a `::marker`
on. Measured: text indent 16.9px with a fine pointer, **0px** with a coarse
one. So on touch, "The full panel" — the door to five of the page's seven
sections — was a heading with nothing saying it opened. It takes its height
from padding now and keeps `list-item`.

**Three sets of controls under the 32px floor**, all defined inside
`index.html` and therefore invisible to D-136's shared-CSS pass: the two ⓘ
toggles at **16.5px**, `#btn-freeze` at **22.5px** with its sibling link at
**14px**, and the twenty ratio-name links at **18px**. The ⓘ toggles are the
only way to reach "why this is not a score" and the three blank risks;
freezing is what makes every delta on the first screen exist.

**The undo/redo pair sat on top of the value column.** It is fixed to the
bottom right at ≤640px, and every figure in the panel scrolls past that
corner — measured at 320px it covered the FI-ratio value completely. The left
gutter of every row here is a label, so it moves left.

**The page told the browser it was light.** No `color-scheme` anywhere, so
the scrollbar, the details marker, text selection and the file input were all
drawn from the light UA palette on a navy page. The app is dark by
construction — checked across all nine combinations of `prefers-color-scheme`
and `data-theme`, the body is the same colour in every one — so
`:root { color-scheme: dark }` is simply the truth.

**And a library bug that fires in every room.** `shared/charts.js` drew the
x-axis label at the same x as the last tick and 3 units below it, so "80" and
"age" overlapped by 4.2px at 320 and 10.7px at 1440. The label gets its own
band when there is one.

Measured after: **0 contrast failures inside the panel**, down from 15. The
controls still under 32px are the ⓘ circles at the 30px D-136 chose for them
deliberately.

### Compatibility note

Stored shape: **unchanged**. This is presentation only.

- `shared/theme.css` gains `color-scheme: dark` and
  **`--color-critical-text`**, and changes `--color-text-faint` from 0.50 to
  0.80 alpha. That token is used in 40-odd places across the app, so **every
  room gets lighter faint text**, which is the point — the failures were not
  confined to the panel. `summary` keeps `display: list-item`; a room that
  was relying on `display: flex` there would need to say so, and none does.
- `dnd/shared/theme.css` is the byte-identical vendored copy and was
  refreshed in the same commit, as the guard requires.
- `shared/charts.js`: `PB` is now 36 rather than 26 **when `x.label` is
  passed**, so a chart with an axis label is 10px shorter in its plot area
  and one without is unchanged. Every room drawing an area or bar chart with
  a label gets the extra room automatically.
- A future variant colour that carries text should follow
  `--color-critical-text`: set the text token separately rather than reusing
  the fill, which is the rule D-137 arrived at and this extends.

---

## D-145 — The language pass: names a stranger already knows

The last of the four-way audit. Nothing here is a calculation; all of it is
what the app *says*, and every item was a thing a first-time reader would
stop on.

**A tile was coloured by a number it did not show.** The savings-rate
instrument displays the *contributed* rate — what actually went somewhere —
and took its verdict wholesale from the *residual* rate's row, a different
figure that only exists in the panel. So the headline number for an employed
household could read 13.8% and be green because 28.5% cleared the floor.
Each instrument is now judged against its band using **the figure on
screen**.

**The cockpit metaphor was six-sevenths of every caption.** `THRUST ·
SAVINGS RATE`, `ALTITUDE · NET WORTH`, `LOAD · DEBT-TO-INCOME` — and at
390px, with `white-space: nowrap` and an ellipsis, four of the six truncated
mid-word. "Savings rate" is the phrase someone searches for; "Thrust" is
not. The caption is the name now, wrapping rather than clipping, the
metaphor lives on the tile's `title`, and the cockpit idea gets said **once**
in the section's own line instead of prefixed to all six.

**Three acronyms were never spelled out anywhere a reader could reach.**
`FI year` → **Financial independence year**. `FOO step` → **Step on the
money ladder**. The chart's target line read `FIRE $945K` → **Enough to live
on: $945K**. Each also gained a plain sub-line saying what it means.

**The ring's percentages were shares of a number shown nowhere.** The slices
read 12% / 61% / 27% of $79,100 — assets plus debt — while the middle said
$35,900 and the caption said $57,500. Three totals in one 300px block, and
anyone who checked the arithmetic concluded the app was broken. The caption
names the denominator and says what to do with the red slice: *"The ring
splits $79,100 — everything you own ($57,500) plus everything you owe
($21,600). Take the red slice away from the rest and you get the $35,900 in
the middle."*

**Four rows read "3 months" under four different names.** Emergency fund
coverage, liquidity ratio, runway and shadow runway are largely the same
arithmetic under the name people usually ask for. That is defensible and it
looked like padding, so the radar's hint now says it out loud.

### Compatibility note

Stored shape: **unchanged**. Nothing written, no owned field moved.

- `shared/instruments.js`: each row's **`verdict` is now computed from its
  own result** rather than copied from `bandRow.verdict`. A caller reading
  `row.verdict` gets the same shape and a more accurate answer; `bandRow` is
  still there for anything that wants the other row. Rows also gain
  **`blurb`**, a plain sentence, which is additive.
- Four `INSTRUMENTS` **labels changed text**. Nothing keys off a label — the
  `id` is the identity — so this is display only.
- `index.html`: `.inst .cap` no longer clips. A future instrument with a long
  name wraps instead of truncating; there is no length limit to respect.
- A future instrument should carry its own `sub:` line. The rule this
  arrived at: **a tile says the name, the number, and what the number means
  — never a metaphor in place of the name.**

---

## D-146 — The responsive audit, kept

D-136 fixed the sideways scroll, the small tap targets and the wasted
monitor by writing an audit script, running it, and throwing it away. It has
been rebuilt by hand every time the question came up since — which means the
answer kept being re-derived instead of kept. LATER.md said so. It is
`test/responsive.js` now: every room at 320 / 390 / 768 / 1080 / 1440,
checking the page for sideways scroll, controls against the 32px floor, text
clipped by its own box, and the share of the window actually used.

**It found things on its first run, and one of them was serious.**

`rooms/start.html` — the intake page, the first thing anyone opens —
**scrolled 142px sideways at 390px**. No element's right edge was past the
viewport, which is why it had survived this long: the cause was
`grid-template-columns: 1fr 1fr`, where a track's implicit minimum is its
content, so a cell holding a `select` with long option text refused to
shrink and pushed the whole grid past its card. `minmax(0, 1fr)` fixes it.
`rooms/what-if-life.html` had the same shape, and the confidence badge in
Start Here was `white-space: nowrap` beside a label that already filled its
column — 49px of overflow at 320px from a badge four characters long.

**44 controls under the 32px floor, across 18 rooms** — segmented filters at
17px, a remove button at 20px, preset rows at 17px, an `<a class="pill">`
at 20px. Fixed at the floor rather than one room at a time.

### The suite caught me breaking something, on the next run

The first attempt at the tap-target floor was
`button, .pill { display: inline-flex; align-items: center; }`. A flex item
will not shrink below its content, so a button in a 152px grid track grew to
178px and pushed What If, Life **26px sideways at 320px** — a room that had
been clean an hour earlier. Reverted to `min-height` alone, which is all the
floor ever needed. This is the argument for keeping the script: it is the
only reason that regression lived for one run instead of a month.

### Two of the failures were the suite being wrong

Worth recording, because a suite that cries wolf gets ignored:

- **The ⓘ at 30px.** D-136 grew it from 20 and stopped at 30 deliberately —
  it appears 45 times on the ratios page and a 44px circle there is a wall
  of buttons. Exempted by name.
- **Checkboxes at 20px.** Also deliberate: the theme gives the *label*
  around them 32px, and the label is what a finger hits. The suite measures
  the label where one exists and only complains about a checkbox genuinely
  on its own.

### The count, honestly

**47 → 2 → 0**, over 300 room-widths.

I wrote "47 → 0" in this entry and in its commit message while the run that
had just finished said **2**: the skill-tree `Do it →` link, which I fixed
immediately after and before checking, and a **4px** sideways scroll in the
FIRE Lab at 1080px, which I had not looked at at all. `.slaf-legend .pct`
carried `min-width: 3em` in a flex row whose left column already filled the
space — small, and the page still moved. The column keeps its alignment and
gives up the floor.

The number is 0 now, verified on a full re-run. It is written this way
because a decision record that rounds its own result in its favour is worth
less than no record, and because the next person to read this should know
that the last 4px took a second pass.

### Compatibility note

Stored shape: **unchanged**; this is layout and tooling only.

- `shared/theme.css` gains one rule — `button, select, .pill, [role="button"]
  { min-height: 32px }` inside the existing `@media (pointer: coarse)` block,
  with `.slaf-info` opting back out. Every room gets it; no room needs to ask.
  `dnd/shared/theme.css` refreshed to stay byte-identical.
- Two rooms changed `1fr` to `minmax(0, 1fr)`. **A new room using a `1fr`
  grid should do the same** — it is the difference between a grid that fits
  a phone and one that does not, and it is invisible until measured.
- `test/responsive.js` skips cleanly when Playwright is absent, like
  `test/alignment.js` and `test/forms.js`. It takes `SLAF_ONLY=room-id` to
  check one room, which is what a room build should run before reporting.
- The 32px floor lives in one constant, `TAP_FLOOR`. If it ever rises to 44,
  it rises there and the suite says which rooms owe work.

---

## D-147 — Your Credit File: the room that refuses to show a score

The most-asked consumer money question had no room. `creditUtilization`
existed as a ratio and nothing said what a score is, what moves it, how long
a late payment lingers, or what to do about an error. For most people it
gates the rent, the car and the mortgage rate.

**The rule that defines the room: there is no score on the page, and there
cannot be.** A score is computed by a bureau from a file this app has never
seen. Any page offering one from what you typed into it would be making it
up. This is the same refusal as the radar's "this is a view, not a score"
(D-143) and the weather panel's three deliberately blank risks — and it is
said in the first paragraph rather than in a footnote.

What it does instead:

- **The five factors and their published weights**, drawn as bars. Blue for
  a factor your own figures say something about; grey for one only the
  report knows. Three of the five are grey and the room says so.
- **The two it can see** — utilisation and credit mix — read through
  `engines/ratios.js`, with the household's real figure and its band.
- **The fastest lever, first.** Utilisation is 30% of the score, re-reports
  every month, and carries no memory: last month's figure is not held
  against this month's. That combination is what makes it the thing to move,
  and the room leads with the one action that moves it — pay before the
  *statement* date, not the due date.
- **How long things stay**, from the reporting periods in the law.
- **What you are entitled to, free** — and the addresses are **named, not
  linked**. The room sends you nowhere and is paid by nobody; you type the
  address in and check it against the one written down. That is the
  precedent Get Help set and it matters more here, where the surrounding
  industry is full of paid "repair" that sells you what the law gives you.

**Empty is not zero, and it is load-bearing here.** With no card limit
entered the room says *"This needs the credit limit on at least one card.
Add it in Debt Payoff — guessing a limit would produce a number people act
on"*, and then, separately: *"Blank is not zero. Nothing here says you are
using none of your limit."*

Four judgement calls made while building it, so a later room does not have
to re-make them:

- **The three grey factors get a sentence each, not a gap.** Why this app
  cannot see them is page copy in `rooms/credit.html`, not a field in
  `data/credit_factors.json`: the table says *whether* a factor is visible
  (`youCanSee`), and the room says what would be needed to see it. Three
  silent gaps read as a bug; three named absences read as honesty.
- **The credit-mix figure is a proxy and says so.** Utilisation is the same
  measurement the models make. `revolvingShare` is not — the models look at
  whether you hold both kinds of credit at all, and this is how much of what
  you owe sits on cards. The row says *"It is the shape of the factor, not
  the factor"* rather than quietly passing one off as the other.
- **Only money actually owed goes through the lens.** The card balance and
  the total owed are amounts; a credit *limit* is neither owed nor held, and
  reading it as "four months of FI" would be nonsense. The limit stays a
  plain dollar figure in the line under the percentage.
- **It reads `totalDebt` and never guesses.** The registry row declares
  `needs: ['totalDebt']` — a reading has to read something, and the itemised
  debts are where a card's balance and its limit live. The room passes
  `standalone: false` to `Room.mount`, so unlike every other room it does
  **not** fill an empty spine with the intake's estimates: a guessed credit
  utilisation is precisely the invented number this room exists not to print.

### Compatibility note

Stored shape: **unchanged**. The room writes nothing, owns no field in
`shared/ownership.js`, and never calls `Spine.updateProfile` — verified in a
browser by diffing the whole profile before and after a visit that opened
the drawer and cycled every lens. The only key that moved was
`meta.visitedRooms`, which `Spine.registerRoom()` records for every room in
the suite; no household figure changed.

New: `data/credit_factors.json` (registered as `TABLES.creditFactors`),
`rooms/credit.html`, a registry row at order 26.4, kind `read`.

---

## D-148 — When It Won't All Get Paid

Between Jobs assumed job loss specifically. Nothing covered the far more
common moment: the month is short, and not everything can be paid. No
triage — which bill to protect, what is negotiable, what has a grace period,
what damages a credit file and what quietly does not. LATER.md called it the
highest-stress money moment there is, and the app was silent on it.

**The ordering rule, said once at the top:** the list is not in order of
size. It is in order of what a missed bill takes away and whether you can get
it back. *A smaller bill you can never undo comes before a bigger one you
can.* Losing the roof, the heat, or the car you get to work in costs far
more than a late fee and a mark on a file, however much larger the fee feels
today.

Twelve bills across three tiers in `data/bill_triage.json`, each with what it
costs you, who to call, and the free help that exists. Then the calls worth
making — led by the one that matters most, **call before you miss it, not
after**, because almost every hardship programme is easier to get while the
account is current.

**Three things it refuses to do.**

- **It will not guess at the shortfall.** With nothing entered it says *"Not
  known yet, and not guessed"*, names the three missing figures with a link
  to the room that owns each, and then: *"Everything below works without
  them. The order to pay in, the calls and the free help are the point of
  this page; the number is not."* A made-up shortfall on this page would be
  cruel, not merely wrong.
- **It never tells anyone to borrow.** A card at 29% is cheaper than a
  payday loan at 400%, and missing a card payment is cheaper than both.
- **It does not pretend to be advice.** Consequences vary by state and by
  contract, and the room says so where a reader will see it rather than in
  small print. Where the data says to call, calling *is* the advice — it
  does not know their terms.

### Why it is not a core room

I made it `kind: 'core'` and `test/run.js` refused: D-051 caps the core at
four. The suite was right. A crisis room is not a step on the main path —
it is a door you need to be able to find, which is a different problem.
Both new rooms went in at 26.4 and 26.6, **after** the numbered path rather
than into it, so the walk a household with no debt takes is unchanged. The
check that caught it now says why.

### Two smaller decisions inside it

**The gap is not a new formula.** `CashFlow.monthlySurplusCents()` is already
the one place this app asks what is actually free each month, and a shortfall
is that number with the sign turned round; money-in is
`CashFlow.netMonthlyIncomeCents()` from the same engine. Nothing here defines
"left over" a second time (SPEC.md §8). What the room adds is saying *which
basis* the engine used, because the two are not interchangeable: with a month
tracked it is every category entered, debt minimums pulled in from Debt Payoff
as a derived line rather than a second copy; without one it is the
monthly-essentials estimate, which leaves discretionary spending out and
therefore **understates** the gap. That is the safe direction to be wrong in on
this page, and the drawer says so rather than letting a reader assume the
figure is complete.

**Phone numbers dial. Web addresses stay text.** `hud.gov/findacounselor`,
`211`, `nfcc.org`, `studentaid.gov`, `healthcare.gov`. Every one of them wants
to be tappable, and until now none of them was, because **this app contained
no external link at all** — across every room and the index, zero. The builder
declined to break that on its own and was right to. The line drawn instead
splits the two cases, because they are not the same kind of thing:

- **`tel:` links, yes.** `211` is now `<a href="tel:211">` in all three places
  the table says it (`dialable()` in the room, applied after escaping — digits
  survive escaping unchanged). A `tel:` URL sends no referrer, loads no page
  and makes no request: **nothing leaves this browser**, which is the promise
  the whole suite is built on. What it does do is hand the number straight to
  the dialler on the device someone is holding, at the moment they have the
  least patience for copying nine characters by hand. The friction removed is
  real and the privacy cost is zero, so this is not a trade.
- **`http(s)` links, still no.** Those would be the first genuine outbound
  link in the suite — a request to someone else's server, carrying a referrer
  that says which room of a personal-finance app the person was reading when
  they left. That is a decision about the whole app, and one for the repo
  owner rather than for a room. They stay plain, selectable, copyable text,
  and `.helpline` keeps body colour rather than accent colour for exactly
  that reason: a string painted like a link that does nothing under a finger
  is worse than one that never claimed to be one.

The `.dial` rule carries `min-height: 32px; line-height: 32px` so the D-136
tap floor holds; `SLAF_ONLY=cant-pay node test/responsive.js` passes at all
five widths. **Still open:** the web-address half. If outbound links are ever
allowed, this room gets them first and the answer covers every room after it.

### Compatibility note

Stored shape: **unchanged**. Writes nothing, owns nothing, no inputs at all —
`LIVE-FORM: built once` with nothing to build. The one trace it leaves is the
visit `Spine.registerRoom()` records, which every room does.

New: `data/bill_triage.json` (registered as `TABLES.billTriage`),
`rooms/cant-pay.html`, a registry row at order 26.6, kind `explore`.
`data/debt_rules.json` also gains **`kindNotes`** — how medical, family and
federal student debt behave unlike the rest — which is data only until a room
reads it.

---

## D-149 — The Walk-Through: fifty-nine rooms, and a route with an end

The ask was "complete sets of approval and things from start to finish… incredibly
simple and intuitive to use." The obstacle was arithmetic. This app has **fifty-nine
rooms**. That is a library. A library is the one thing a person opening this for the
first time cannot use, because a library has no order and no end, and the honest
answer to "have I done this?" in a library is always no.

So the walk is a **short route with a finish line**, and everything in it exists to
protect one of those two words.

### Short: how the list got to eighteen

Filtering by situation is not enough on its own. Run the gate over the whole registry
and an employed person still has **33 rooms** that ask them for something. Nobody
finishes 33 rooms.

`data/walk_stages.json` picks instead. A room is on the walk only if it **asks for a
fact the rest of the app needs**, or **holds a decision worth making once**. Everything
else stays in the suite, reachable from the map, and is simply not homework. Then the
gate filters what is left, which is why the same five sets come out different lengths:

| Situation | The five sets | Total |
|---|---|---|
| Employed | 5 + 3 + 4 + 3 + 3 | **18** |
| Self-employed | 7 + 3 + 3 + 3 + 3 | **19** |
| Between jobs | 6 + 3 + 1 + 3 + 2 | **15** |
| Student | 5 + 2 + 3 + 3 + 3 | **16** |
| Retired | 5 + 3 + 2 + 3 + 3 | **16** |
| Mixed | 7 + 3 + 4 + 3 + 3 | **20** |

Between-jobs gets a set of **one** under "Where the money goes", and that is the right
answer rather than a bug to pad out: someone with no income has less to route, and a
set inflated to look substantial would be a lie about their situation. A set with
*nothing* in it is dropped from the page entirely — an empty set with a tick beside it
reads as an achievement and it is not one.

`test/run.js` now holds every situation between **10 and 25 steps**. If a future room
pushes one over 25 the walk has stopped being a walk, and that should fail loudly
rather than quietly getting longer.

### Finished: the thing this refuses to infer

**A step is done because the person said so.** Not because the room has a number in
every box. Those are two different facts, and the app already answers the first one —
`shared/progress.js` has counted filled fields since D-050.

The test that pins this down: run the **demo persona**, which has a figure in nearly
every box in the app, and **zero steps are done**. A room can be full of figures you
do not trust yet, and a room can be finished the moment you have decided it changes
nothing. Only the person knows which.

So the state lives in `meta.walk` and nowhere else, written only by
`Spine.markWalkStep` / `startWalk` / `resetWalk`, and **no engine may read it** —
there is a test for that too. A mark is a statement about the person, never about
whether a number is usable.

**"Not for me" is a real answer.** It counts as dealt with, it moves the bar, and it
is not held against you anywhere. A checklist that will not let you say "this one is
not mine" is a checklist nobody finishes. The engine keeps `complete` (nothing open)
and `allSkipped` separate so the page can stop short of congratulating someone for
waving a whole set away.

### Not a gate, and the guard that keeps it that way

Nothing is locked behind the walk. Every room is open from the map at any time, in any
order, walk or no walk. Two tests hold that: nothing in the registry reads `meta.walk`,
and no engine mentions it. This is a suggested route with a checklist on it, and the
checklist belongs to the person, not to the software.

It is also **invisible until asked for**. `Guide.hasStarted()` is false for a household
that never began, and the strip mounts on nothing at all in that state. Someone who
never wanted a guided path never sees a trace of one.

### Where it lives

- **`shared/guide.js`** — pure. No storage, no DOM, no dates. `stages` · `steps` ·
  `progress` · `nextStep` · `stepOf` · `isFinished` · `hasStarted`.
- **`rooms/walk.html`** — the hub. Five sets, each step's state, one button to the
  first thing still open. `utility: true` at order 97, like Refresh and Your Data, so
  it stays off the numbered path and out of D-051's four-room core cap.
- **The strip**, mounted from `Progress.mountHeader` — the one place every room
  reaches (22 through `Room.mount`, the rest directly), which is the same lever the
  situation sweep used in D-142. It shows where you are, the two answers a step can
  have, and the next one.
- **The dashboard** gets one line, and it is a **strip, not a fifth card**. `test/run.js`
  asserts the dashboard is exactly four blocks (D-096) and refused the section I first
  wrote. The guard was right: "one screen, four blocks" stops being true the first time
  something slips in beside them. This is navigation rather than a reading, so it takes
  the same slim shape it has inside every room and stays out of the count.

### Two bugs this shape had, both worth recording

**`stepOf` looked a step up in the wrong array.** It called `stages()` and `steps()`
separately, which builds the step objects twice, so finding a step by identity inside
the other array found nothing and every step reported a null set. Fixed by deriving
the flat list from the one `stages()` call. There is a test that would catch it again.

**`Object.assign` put the raw stored shape straight into the household.** `createWalk`
was in the defaults object, which is the *first* argument — so `f.meta.walk` won the
spread and landed unnormalised, exactly the route by which a shape from an old export
gets in. It now runs in a third argument, after the spread. Every other `meta` key is a
scalar and never had this problem, which is why it had not bitten before.

### Compatibility note

**Stored shape: `meta.walk` is new.**

```
meta.walk = {
  startedAt:  ISO string | null,
  finishedAt: ISO string | null,
  done:       { roomId: ISO },
  skipped:    { roomId: ISO }
}
```

`Schema.createWalk()` normalises it and is the single definition of the shape. A room
can be in **at most one** of the two maps — marking done clears any skip and the other
way round — enforced in the schema (for anything arriving from storage or an import)
*and* in `Spine.markWalkStep` (for anything this session does), deliberately in both
places. If a shape ever claims both, **done wins**: it is the stronger statement, and
the one you had to reach the room to make.

**What a future room needs to know before calling `getProfile()`:** `meta.walk` is
always present and always normalised, so it is safe to read without a guard. **Do not
read it to decide anything about a number.** It records what a person has dealt with,
not what the data contains — treating a done mark as "this figure is trustworthy" is
exactly the inference this whole entry exists to prevent. Nothing else changed:
`getProfile()` / `updateProfile()` are untouched, every existing field reads the same,
and an export written before today loads with an empty walk and no marks.

New files: `shared/guide.js`, `rooms/walk.html`, `data/walk_stages.json` (registered as
`TABLES.walkStages`). `dnd/shared/schema.js` re-copied byte-identical.

---

## D-150 — The Account You Left Behind: four futures, one trap, one sum

A workplace retirement plan does not follow you out of the building, and the
app had nothing to say about it. **Where It Goes** covers Roth versus
Traditional — which wrapper new money goes into — and that is a different
question from what to do with a wrapper you already have at an employer you
have already left. Coverage gap, wave two, alongside What A Car Costs.

`rooms/rollover.html`, on the frozen template (D-097), registry `rollover`,
order 26.8, kind `explore`.

### It does not pick a winner, and that is the room

`data/rollover_options.json` says it in its own `confidenceNote`: the rules
are real and federal; **which one is best for you is not a rule at all.** It
turns on the old plan's fees, its fund menu, your state's creditor law, and
whether you use a backdoor Roth — four things this app cannot see. So the
room lists the four options in the data's order (by how often each is right,
not how often it is taken, which is why cashing out is last), gives each its
`good` and `bad` lists, and stops.

**Two trade-offs are lifted out of the bullets and given their own blocks**,
because they decide the whole question for the people they touch and would
be read straight past in a list:

- **The age-55 rule.** Leave a job in or after the calendar year you turn 55
  and you can draw from *that plan* without the 10% penalty — years before
  59½. Roll it to an IRA and the door shuts.
- **The pro-rata rule.** A pre-tax balance in an IRA makes every backdoor
  Roth conversion a blend of taxed and untaxed money. Rolling into the *new
  employer's* plan keeps it clean. Irrelevant to anyone who has never done
  one, and the block says so rather than alarming everybody.

The wording of those two is page copy in `rooms/rollover.html`; the substance
is the table's. Same split as D-147's three grey credit factors.

### The trap gets the words, not a summary

Asking for a cheque instead of a transfer means the plan **must** withhold
20%, and you then have 60 days to deposit the **full original amount,
including the fifth they kept**. The fix is not a concept, it is a sentence
to say out loud, so the page prints it as the largest line in its own
bordered block: **"Ask for a direct, trustee-to-trustee rollover, in those
words."** Split out of the table's `instead` at its first full stop, so the
phrase is the big line and the reassurance is the small one under it.

### The one place it computes, and whose formula it is

Cashing out is the only part that is arithmetic, and **none of the formulas
are written here**:

- **Income tax — `engines/tax.js`.** `Tax.estimate` is run **twice**: the
  year as it stands, and the same year with the withdrawal stacked on top
  through `otherOrdinaryCents` (D-129's door — ordinary income with no
  payroll tax on it, which is exactly what a plan distribution is). The
  difference is the tax on the withdrawal. That is what "at your marginal
  rate" means once the withdrawal is allowed to climb a bracket, which one
  multiplication would quietly miss. The baseline goes through
  `TaxRoom.splitIncome` so wages and self-employed profit are divided
  exactly as the Tax room divides them — same input, same engine, same
  answer.
- **Compounding — `engines/projection.js`.** `futureValueCents` at
  `assumptions.returnReal` (D-094), a **real** return, so "what it would
  have been" is in today's money and comparable to the dollars beside it.
  To `targets.retireAge` when one is set, otherwise to the 65 in
  `data/fire_variants.json` — labelled as the stand-in it is, with a link to
  FIRE Number.
- **The 10% penalty and the 20% withholding** are not formulas, they are
  rates, and they now live in `data/rollover_options.json` under `rates`
  rather than inline in the page (SPEC.md §7). **59½ is deliberately not
  among them**: it is already `data/access_rules.json`
  `byTaxCharacter.pretax.accessAge`, which the Statement's buckets and
  Decumulation read, and a second copy is how two numbers drift apart.

**The 20% withheld is shown on its own line as a cash-flow fact, not as a
cost.** It is a payment on account: it comes off the bill, and the row says
what the cheque would actually be and what April would then settle. That gap
— plan around the cheque, be surprised by the rest — is the whole reason the
line exists.

### The penalty question has three certain answers and one honest "it depends"

This is where the room's second input earns its place:

| Where you are | Answer |
|---|---|
| Past 59½ | No penalty, whatever happened at the old job |
| Under 55 today | Penalty applies — you *cannot* have left in or after the year you turned 55 if you have not turned 55 |
| 55 to 59½, box answered | The answer decides it |
| 55 to 59½, box blank | **Unknown.** Not assumed either way |

So the box — *the age you turned in the year you left that job* — is asked of
everyone but only changes anything in the one band where it is the deciding
fact, and the room says which band that is. Under 55 the question is
logically closed, which is why the common case needs no second answer.

### Nothing is written, and nothing is guessed

**`Spine.set` and `Spine.updateProfile` appear nowhere in the file.** A
balance in an old plan is a hypothesis about an account this app has never
seen; D-052 says a hypothesis is thrown away. Both boxes live in one closure
and are gone on reload, and **the page says so in its first card** rather
than only in a comment — the same placement as D-147's "there is no score
here". `test/forms.js` asserts it from the other side: after typing $40,000
the household blob does not contain `4000000` and the undo stack names
neither box.

**`standalone: false`.** With no income entered the room refuses rather than
filling in the intake's guess: an invented income is an invented bracket is a
believable wrong cost of cashing out, and this is a number someone might act
on that afternoon. It names the missing figure and links to its owner. Blank
is not zero anywhere — an unanswered income box would put the whole
withdrawal in the bottom bracket, and the guard says exactly that.

The state is the one place a zero is *added*, and it is flagged rather than
hidden: with no state schedule applied, the total is labelled federal and
penalty only and the row reads **"not counted"**, never "$0".

### Verified against

Demo persona — 32, single, North Carolina, $72,000 — cashing out $40,000:
$8,800 federal (taxable goes 55,900 → 95,900, all inside the 22% bracket),
$1,700 North Carolina (flat 4.25%), $4,000 penalty; **$14,500, 36.3% of it**,
keeping $25,500. Withheld $8,000, so a $32,000 cheque and $6,500 still owed
in April. Left alone: $200,128 at 65, 33 years at 5% real. Re-derived by hand
and outside the browser, and pinned in `test/forms.js`.

### Compatibility note

Stored shape: **unchanged**. The room owns no field in `shared/ownership.js`,
writes nothing, and never calls `Spine.updateProfile` — a future room calling
`getProfile()` / `updateProfile()` needs to know nothing new about it. The
only trace it leaves is the visit `Spine.registerRoom()` records, as every
room does.

`data/rollover_options.json` gains a `rates` block
(`earlyWithdrawalPenalty`, `mandatoryWithholding`, `indirectRolloverDays`,
`ruleOfFiftyFiveAge`). Additive: nothing read the file before this room.

New: `rooms/rollover.html` and one case in `test/forms.js`.

`LIVE-FORM: built once` — both controls are built from the spec by
`shared/room.js` on load and only ever have `.value` set. Everything else the
page fills itself is text and holds nothing focusable, so redrawing it cannot
interrupt a tap.

---

## D-151 — What A Car Costs: the payment is the least informative number

A car is shopped for on the monthly payment, and the monthly payment is the
one number in the deal that can be made to say anything. Stretch the term and
it falls; nothing else about the car changes. `rooms/car.html` exists to put
the four things it hides in front of it, in the order they cost money.

**What it loses.** The depreciation curve from `data/car_costs.json`, drawn
with `Charts.area`. Year one is 20% of the price, which makes buying at one
year old the single biggest lever on the page — bigger than the rate, bigger
than haggling, bigger than the term. With a price typed in the curve is in
dollars and a second dashed line shows the mirror of it, what you have lost;
with no price it is in share of the price, because the shape is true whatever
you pay and the dollars are not.

**What it costs to run.** The AAA shares as a donut. Fuel is 24% of it — the
cost everybody shops on, and under a quarter of the total. Insurance is the
biggest slice at 25% and is decided by the driver, not the car. Shares only,
never dollars: nothing on the page knows anyone's mileage or premium, so a
dollar total would be invented.

**Whether the loan fits.** The 20/3/8 test, computed by
`QuickMath.carRule2038` against the household's real gross income — the same
call Quick Math and Big Purchase already make, so the rule is calculated in
one place. On the demo persona's $72,000 the cap is $480 a month and the
rule's ceiling is about $19,723 of car; a $30,000 car with 20% down over
three years at 6% passes two legs of three and misses the payment cap by
$250 a month.

**Lease, new, or a year old.** Three cards, each with what it suits and what
it costs, straight from the table. **No winner is declared.** The data says
used "suits almost everyone on the arithmetic" and that is as far as this
room goes.

### The two curves, and the function that crosses them

`carCosts.underwater` explains the concrete harm of a long term in words. A
room that only quoted those words would be leaving the actual answer on the
table, because both curves already exist here: the loan balance from the
amortisation in `engines/projection.js`, and the value from the depreciation
table. **`QuickMath.carUnderwater(opts, curve)`** walks the loan month by
month and reports where they cross — how long you would owe more than the car
is worth, when it clears, and the worst gap. Hand-checked: a $30,000 car with
nothing down over seven years at 6% is underwater for 39 months, clears in
month 40, and peaks at $2,444 more owed than the car is worth in month 12.
The same car with 20% down over three years is never underwater at all, which
is the whole argument for both.

It lives in `engines/quickmath.js` rather than on the page because that file
already owns the car rules, and the curve is **passed in** rather than copied
into it — reference data stays in `data/` (SPEC.md §7).
`QuickMath.retainedShareAt(curve, years)` is exported alongside it: straight
line between the years the table lists, flat past the last, so a room asking
what a car is worth in month 29 gets one answer.

### The assumption that now has a name

`carRule2038` was checking the rule at 6% whenever nobody gave a rate, with
the literal `0.06` written twice inside it and stated nowhere. It is now
`CAR_RULE.assumedRate`, used by both call sites and by `carUnderwater`, and
the room prints it wherever it is in play. Same for a blank deposit: the
engine reads it as nothing down — it always did — and the room now says so
beside every figure that reading affects. Neither is a silent `|| 0`; both
are a stated reading of a blank box.

### Where the room refuses

**Nothing is written.** The price, the deposit, the rate and the term are
page state and die with the tab. A car someone is considering is a what-if,
not a fact about them (D-052), and the room says so on the page rather than
only in a comment.

**Nothing is guessed** (`standalone: false`). With no income the 20/3/8 test
does not run: it names the figure it needs and links to Start Here, because
an invented income quietly turns a fail into a pass. **No term is assumed**
either, even though the engine would default to 36 months — the term is
precisely the leg of the test a monthly payment hides, and assuming one here
would hide it a second time. With no price the page still draws the curve,
the shares and the rule; it just refuses to put a dollar sign on anyone's
car.

### Compatibility note

Stored shape: **unchanged**. The room owns no field in `shared/ownership.js`,
writes nothing, and never calls `Spine.updateProfile` — a future room calling
`getProfile()` / `updateProfile()` needs to know nothing new. The only trace
it leaves is the visit `Spine.registerRoom()` records, as every room does.

`engines/quickmath.js` gains two exports (`retainedShareAt`,
`carUnderwater`) and one key on the existing `CAR_RULE` object
(`assumedRate: 0.06`). Both are additive: every existing caller of
`carRule2038` and of `CAR_RULE` behaves exactly as before, and the two 6%
literals it replaces were already that value.

New: `rooms/car.html`, `data/car_costs.json` (registered as
`TABLES.carCosts`), a registry row at order 26.2, kind `explore`, and two
cases in `test/forms.js` — one that types into three boxes and asserts the
undo stack is still empty afterwards, one that picks the term.

`LIVE-FORM: built once` — the four controls are built from the spec by
`shared/room.js` on load and only ever have `.value` set. The panels the page
fills itself hold no focusable control and are written only when their markup
actually changes, so typing in one box never re-animates a chart in another.

## D-152 — What Comes Next: a life as periods, and the months they add up to

"Make it also that you can add jobs in the future for periods of time —
ultimately I want to be able to plan an entire life and stack it all and
calculate income as things get closer."

Every other room in this app answers a question about **now**. Even the ones
that look ahead — the FI date, the runway, the projection — take today's
figures and extrapolate one number forward. None of them can hold the shape a
real working life actually has: a contract that runs six months, a job that
starts before the contract ends, a benefit that begins on a birthday
thirty-five years out, and the four months at the front where nothing is
coming in at all.

### The data was already there. The room was not.

`futureIncome[]` has carried `startsOn`, `startsAtAge`, `endsOn`,
`monthlyCents` and `confidence` since the Statement was built (D-064). What it
never had was anywhere that treated a row as a **period** rather than a line
item — the Statement listed them, summed the monthly figures, and drew nothing.
So the work was two-thirds a room and one-third two new fields:

- **`kind`** — `job` / `benefit` / `other`, defaulting to `other` so every row
  written before today keeps exactly the meaning it had. A kind was never
  asked for, so none is asserted retroactively. It changes nothing
  arithmetically; it only lets the bars be coloured and grouped.
- **`endsAtAge`** — the mirror of `startsAtAge`. "Until I turn 70" was
  expressible as a start and not as an end, which is a strange asymmetry once
  you notice it.

### `engines/timeline.js`, and the one rule it exists to keep

A month is an integer: `year * 12 + month`. Every comparison in the grid loop
is then an integer comparison, and no `Date` is constructed inside it —
dates appear only at the two edges, parsing in and labelling out. That is
what makes a 60-year grid cheap enough to rebuild on every keystroke.

The rule the file exists to keep is the app's oldest one, and this room is
where it is easiest to break:

- **A period you have not priced is not a period worth zero.** It contributes
  nothing to any month, and it is listed by name under "waiting on something"
  with the reason in words.
- **A period with no start date is not a period starting today.** Same
  treatment. Both of those are one line of code away from silently inventing a
  future, which is exactly what SPEC.md §5 is about.
- **A month with no live period IS $0** — and that zero is the entire point of
  the room. It means nothing you have listed pays you then. It is a *computed*
  zero, not the `|| 0` the rules forbid: the missing inputs never reach the
  loop, because `placeable` filtered them out first and named them.

**No end is a real answer.** A job with no end date runs to the edge of the
chart and the row says "onward" rather than drawing a cliff at an edge the
person never chose.

**A date beats an age.** When a row carries both `startsOn` and `startsAtAge`,
the date wins. An explicit date is the stronger statement, and silently
preferring the age would move a period the person had pinned.

Gaps and overlaps come back as **runs, not counts**: "four months from
September 2026" is a fact you can act on, and "12 months of gap somewhere in
the next thirty years" is not.

### The hand-derived case, checked both ways

Born March 1994. A contract January–June 2027 at $5,000. A staff job from
April 2027 at $7,000, open-ended. A pension from age 67.

| Month | Expected | Why |
|---|---|---|
| Sep 2026 | **$0** | Nothing has started. The gap is four months long. |
| Jan 2027 | **$5,000** | The contract alone. |
| Apr 2027 | **$12,000** | Both run. This is the room's whole reason to exist. |
| Jul 2027 | **$7,000** | The contract has ended. |
| Feb 2061 | **$7,000** | Still just the job. |
| Mar 2061 | **$9,500** | 1994-03 + 804 months. The pension starts the month they turn 67. |

Each of those is a test, and each was worked out on paper before the engine
was run — which is the only way a month grid gets caught being one month out.

### Compatibility note — an ownership MOVE

**`futureIncome` moved from `statement` to `timeline`.** This is a change to
who may write a shared field, so it needs saying precisely:

- **Stored shape:** unchanged except for two new keys on each row, `kind`
  (defaults to `'other'`) and `endsAtAge` (defaults to `null`). Both are
  additive. An export written before today loads and behaves identically, and
  `Schema.createFutureIncome` normalises an unknown `kind` back to `'other'`
  rather than keeping it.
- **Rooms updated to match:** `rooms/statement.html` lost its editor
  entirely — no `data-future` inputs, no `upsertFutureIncome`, no LiveForm
  guard on that container, since it now holds no inputs at all. It still
  **shows** the list read-only and links to What Comes Next, because the
  periods are part of the Statement's picture even though they are not its
  to change. Its roll-up counts only the rows with an amount and says how many
  it left out, rather than treating a blank as zero.
- **What a future room needs to know before calling `getProfile()`:** read
  `futureIncome` freely; **write it only from the Timeline**. `Ownership.field('futureIncome').owner`
  is the authority and it now returns `'timeline'`. Two editors for one field
  is precisely what D-017 exists to prevent.

### One test got better because of this

`test/run.js` checked that each of the Statement's four fields linked to an
anchor that exists — by looking for the anchor **in `statement.html`**. That
was the same thing as the right check only for as long as all four lived in
one room. It now resolves each field's owner through the registry and reads
that room's file, which is what the check meant all along and which will hold
for any field that moves later.

New files: `engines/timeline.js`, `rooms/timeline.html` (order 28.5, kind
`about-you`, `needs: ['dob']` — only to turn "from age 67" into a month).
`dnd/shared/schema.js` re-copied byte-identical.

---

## D-153 — Front Doors: twenty arrangements, one engine, no room lost

Twenty ways of organising the same sixty-five rooms were drawn as a comparison
set before any was built. Then: "build each and every one of them."

### What "each and every one" means, and what it deliberately does not

It does **not** mean twenty HTML files. Twenty near-identical pages differing
only in their shelf labels would be the exact thing `SPEC.md` §8 forbids — one
formula copied nineteen times with small edits — and the first room added
afterwards would need editing in twenty places, which is to say it would be
edited in about four.

So the arrangements are **data**, and one room renders any of them:

- **`data/layouts.json`** — twenty layouts, each a list of bays and the rooms
  in them, with its premise and its stated cost.
- **`engines/layouts.js`** — pure. Resolves a layout for a household.
- **`rooms/doors.html`** — one page, five render modes, a picker.

Every layout is genuinely live: you choose one, it persists, the whole set of
rooms rearranges, and you can switch back. That is each of them built.

### A layout is a view. It may never become a fact.

Which shelf a room sits on is an editorial opinion held in a data file on one
day by one author. What a room **needs**, who it **applies to**, and what
anything is **worth** live in the registry, the gate and the engines — and none
of them may read the layouts table. Three tests hold that line: no other engine
mentions layouts, `shared/registry.js` does not read `meta.frontDoor`, and
neither does `shared/ownership.js`. **Changing your front door must never
change a number.**

A layout also never filters. Rooms are dropped only by `Registry.applies` —
the same gate the map, the walk and the situation sweep all use (D-142) — which
is why a bay is nine rooms for one person and four for another. And a bay the
gate emptied is **dropped, not drawn empty**: an empty shelf with a heading
says "nothing here for you", when the truth is that none of it was ever yours.

### The bug this design has, and the two things that catch it

On the first browser run, all twenty arrangements reported a missing room. The
counter was right and the data was wrong: **`doors` itself was missing from all
twenty**, because it did not exist when the drawing set was drawn. That is the
permanent hazard of this shape — *a room added to the registry is on no shelf
in any layout, and silently unreachable in every one of them*.

Two things now catch it, and both were needed:

1. **A test.** Every layout, for every one of the six situations, must reach
   every room that applies to that person. It fails loudly with the room named.
2. **A safety net in the engine.** Anything unplaced is appended to a bay
   called *"Not shelved in this arrangement"*, which says plainly that the
   layout was written before the room existed. Coverage **still** counts it as
   missing, so the net stops a room being lost without letting the data quietly
   stay wrong.

The net alone would have hidden the problem. The test alone would have blocked
the commit but left a released version reachable-by-luck. Both.

### The five modes

Sixteen layouts are a flat set of bays. Four are not, and flattening them would
have thrown away the whole point of the sheet:

- **`hub`** — each bay has a landmark room, badged as one.
- **`tree`** — group names carry `Parent › Child`; the page shows three
  choices, then three, then rooms. Four taps to anything.
- **`flow`** — bays are numbered turns; one question on screen at a time.
- **`search`** — a box and surfaces rather than shelves. `overlay: true` marks
  a group that deliberately repeats rooms listed elsewhere, so a "right for you
  now" shortcut does not register as double-filing.

**The search box is the only text input in the room, and it is written into the
markup rather than generated.** Typing rewrites only the results — which hold
no inputs — so focus and the soft keyboard survive every keystroke (D-034).
Verified on a phone-shaped browser with touch: after typing, `document.activeElement`
is still the box and the text is intact.

### Compatibility note

**Stored shape: `meta.frontDoor` is new.** A layout id string from
`data/layouts.json`, or `null` for the order the app ships. Additive; an export
written before today loads with `null` and behaves exactly as before.

**What a future room needs to know before calling `getProfile()`:** read it
freely to render navigation; **never read it to decide anything else**. It
records a preference about shelving, not a fact about the household. Treating a
front-door choice as information about a person is precisely the inference this
entry exists to prevent.

`data/layouts.json` is registered as `TABLES.layouts`, marked `confidence:
"unverified"` on purpose — seventeen of the twenty groupings are opinions. The
three that are not say so in `source`: `path` is the registry's own order,
`situation` is what the gate already computes, and `depends` is the dependency
graph read out of `needs` plus `shared/ownership.js`.

New files: `data/layouts.json`, `engines/layouts.js`, `rooms/doors.html`
(utility, order 96, off the numbered path and out of D-051's core cap).
`dnd/shared/schema.js` re-copied byte-identical.

---

## D-154 — It looked like a toy, and here is exactly why

"I don't love the visuals — it feels almost babyish compared to what real
financial apps look like."

Fair, and diagnosable rather than vague. Six specific things were doing it:

1. **A decorative serif was carrying every figure.** `--font-display` was
   Fraunces, so `6.1%`, `$35,900`, `3 months` and `Step 2` were all set in a
   soft, wobbly display face. This was the single biggest offender: no amount
   of layout survives numbers that look like a storybook.
2. **The body face was Space Grotesk** — quirky and geometric, which reads
   friendly rather than serious.
3. **Four saturated hues in one six-tile grid.** The instrument figures were
   coloured by band, so red, amber, green and blue appeared side by side.
   That is a game board.
4. **Everything was blue.** `--color-text` was `--sapphire-050`, the ground
   was `#081833`, the borders were blue — every surface added hue.
5. **8 / 12 / 16px radii,** so every element read as a lozenge.
6. **No tabular figures,** so no column of money ever lined up.

### What replaced them

**One typeface, the platform's own.** No display serif at all. Hierarchy now
comes from weight and tracking, which is what serious financial products do —
and it costs nothing to load. `--font-mono` joins for ledgers.

**Tabular figures on `body.slaf`.** Money in a column that does not line up is
the clearest possible tell that a page was not built for numbers.

**A neutral graphite ground** with tints that are grey rather than blue, so a
card nested in a card does not accumulate hue. Every text colour was measured
against all three grounds it can sit on; the weakest is `--color-text-faint`
at **5.25:1**, so the D-144 AA commitment survives the change with margin.

**Small radii** — 4 / 6 / 10 — and `--shadow-card: none`.

**The band moved off the figure and onto the tile.** A 3px rule down the left
edge says exactly what a coloured number said, without spending the loudest
element on the page on it, and it leaves all six figures the same colour so
they can actually be compared.

### Two things this broke, and both were caught

**I introduced a contrast failure.** Setting `--color-accent-contrast` to
white while the primary button still filled with `--sapphire-300` gave white
on light blue: **2.60:1**. The fix went the other way from D-137 — a deep
`--sapphire-600` fill with a white label, **6.70:1** at rest and **4.88:1** on
hover. D-137 solved the same problem by lightening the fill and keeping a dark
label; that was right then and it is what made the primary action a bright
pill, which is most of why the app read as a toy.

**A test failed for the wrong reason, and it was the test.**
`test/rooms/motion.js` asserted the *mechanism* — that the fill was
`--sapphire-300` — so it failed even though contrast had gone **up**. It now
parses whatever the rule actually sets, resolves the tokens and computes the
ratio, which is what it always meant. Verified it can still fail: putting the
old pairing back reports `#FFFFFF on #6AA0FF`.

**D&D keeps its own voice.** `dnd/shared/theme.css` must stay byte-identical,
so the override lives in the eleven `dnd/*.html` pages, which restore Fraunces
and Space Grotesk for themselves. A game wants a display serif. A balance
sheet does not.

Verified: **335 room-widths** clean after the change — nothing scrolls
sideways, no tap target under 32px, no clipped text.

---

## D-155 — Every room, on its own, as a file

Your Data exports the whole household. That is right for a backup and wrong
for everything else: nobody wants to send an accountant their entire life to
ask about one figure. So `shared/roomexport.js` gives every room CSV, JSON and
Print — mounted from `Progress.mount`, the same single lever the walk strip
and the situation notice use, so no room can be forgotten and none needed
editing.

**What an export may contain:** only what the room already shows. An export is
not a back door to figures a room does not display.

**Empty is not zero, in the file too — and this is where it matters most.** A
CSV is the easiest place in the world for a blank to become a `0` and then get
averaged. Every unentered figure exports as an **empty cell** with a `status`
of `not entered`, the header says so in plain words, and a test asserts no
bare `0` is ever written for a missing figure. The four states a spreadsheet
cell cannot express on its own — entered, guessed, not entered, not
applicable — get their own column.

One bug worth recording: the machine-readable amount lives on
`describe().result.value`, not on a `raw` key. Reading the key that was never
there left the entire cents column silently blank — the exact failure mode the
module exists to prevent, in the module itself.

`@media print` is part of this: on paper the navigation, undo pair and export
buttons are hidden, drawers are forced open, and the page goes to ink on white.

---

## D-156 — Your Statements: the three documents, and the basis printed on them

An income statement, a cash flow statement and a balance sheet, plus the same
period written out in sentences. `engines/statements.js` **arranges** — it
does not calculate anything twice. Income comes from Income, spending from
Cash Flow, assets and debts from The Statement and Debt Payoff, contributions
from the same line Savings Rate uses.

### The basis is part of the answer, printed at the top

- **`recorded`** — built from months actually closed in Budget. A record.
- **`standing`** — annualised from the figures you keep current. An
  **estimate of a typical year, not a record of one**, and the page says so in
  the same size as the heading, not in a footnote. A company would not file it.

### Two bugs found by reading my own output

**Contributions were 100× too large.** `contributionPercent` is stored as a
percent (4 means 4%). Writing `gross × percent` instead of
`gross × percent / 100` put the demo persona at **$432,000** of contributions
on a $72,000 salary. `engines/cashflow.js:416` is the one place that
conversion belongs and the fix matches it exactly. 4% of $72,000 = **$2,880**.

**The balance sheet refused when nothing else was owned.** Summing three asset
lines myself meant an unentered "everything else owned" made the whole assets
side incomplete and net worth refuse — while the dashboard, reading
`Schema.totalAssetsCents`, showed $35,900 quite happily. "Nothing else owned"
is a real answer, not a missing one. The total now comes from that same
function and the itemised lines are a breakdown of it. Net worth is
**$35,900**, and a test pins it to `totalAssets − totalDebt` so the two can
never drift.

### What the layout is doing

Negatives in parentheses, figures right-aligned and tabular, a rule under each
subtotal and a double rule under the grand total — accounting conventions,
used because they are genuinely the clearest way to show this, not as costume.
A missing figure prints an em dash and **takes its total with it**: the
subtotal says which line it is waiting on rather than summing around a blank.
A balance sheet that treats an unentered debt as zero does not understate a
number, it states the wrong thing.

### Compatibility note

**Stored shape: unchanged.** `rooms/statements.html` writes nothing at all —
no input on the page. `meta.frontDoor` and `meta.walk` are untouched. The room
is `kind: 'read'` at order 4.5 and owns no field, so `shared/ownership.js` is
unchanged too. A future room may read `engines/statements.js` freely; it must
not treat a `standing` basis as a record of a period.

New files: `engines/statements.js`, `rooms/statements.html`,
`shared/roomexport.js`. `data/layouts.json` → v1.0.2, placing the new room in
all twenty arrangements — the D-153 test caught it missing from every one of
them the moment the registry row landed, which is exactly what it is for.

## D-157 — The menu you could read the page through

The repo owner opened the menu on a phone and sent a photograph of it: the
drawer's twenty-odd room names sitting directly on top of the dashboard's
headline, both legible, neither readable. It looked like a compositing bug. It
was a deleted variable.

`.slaf-menu` had said `background: var(--navy-850)` since the drawer was built,
with a comment above it explaining that a translucent surface token would let
the page show through. D-154 replaced the navy scale with the ink scale and did
not replace that reference. **An undefined custom property resolves to nothing** —
not to a fallback, not to an error, not to a warning in the console. The
declaration became `background:` with no value, the drawer inherited
`transparent`, and every automated check in this repo passed.

That last part is the actual finding. It is valid CSS. It throws nothing. It
renders. `test/run.js`, `test/forms.js` and `test/responsive.js` all went green
across the change, and the only instrument that caught it was a person looking
at a screen.

### What was actually broken

Fourteen `var(--navy-*)` references survived D-154:

| File | References | What it broke |
|---|---|---|
| `shared/theme.css` | 5 | the menu drawer; `<select>` popup options; chart panel, dot and Sankey node strokes |
| `foo-ladder.js` | 6 | unlit gem facets, the gem core, the toggle's off track |
| `rooms/statement.html` | 1 | the "never" bar in the tax ladder |
| `index.html` | 1 | the radar dot outline |

Only the drawer was catastrophic; the others were strokes and fills that fell
back to nothing and merely looked wrong. All fourteen now point at ink-scale
tokens.

### `--color-panel`, and the distinction it exists to make

The surface tokens are deliberately translucent — `--color-surface` is
`rgba(124, 140, 166, 0.06)` so a card picks up the page beneath it and the
whole screen reads as one material. That is right for a surface **on** the
page and wrong for a surface **over** it. There was no token for the second
case, which is why the drawer had a hardcoded navy and a comment apologising
for it.

    --color-panel: #12151B;   /* opaque */

Anything that floats over content — the menu drawer, a native select's popup,
a chart panel — takes `--color-panel`. Anything that sits in the flow takes a
surface token. A new overlay that reaches for `--color-surface` is a bug, and
the comment in `shared/theme.css` says so at the definition.

### Two more things the fix turned up

`--text-3xl` was **used and never defined**. The Timeline and the Walk-Through
each lead with a single large figure, and both were rendering it at the
browser's default 16px — I wrote the rooms and never noticed, because I checked
them in a window where 16px did not look obviously wrong beside the copy. It is
now `2.5rem`, matching the `--text-2xl: 2rem` step.

And `test/rooms/menu.js` had asserted `background: var(--navy-850)` — the token
*name*, not the property. It kept passing while the drawer was correct, then
failed for the wrong reason once the token vanished, telling me a string had
changed rather than that the menu was see-through. This is the second time in
two sessions a test named a mechanism instead of a property (the first was the
primary button's contrast, D-154). Both are rewritten to assert the thing that
matters.

### The check that would have caught it

`test/run.js` gains **"No CSS variable is used without being defined"**: it
walks every `.css`, `.html` and `.js` file in the repo, collects every
`--token:` definition from `shared/theme.css` plus whatever the file declares
itself, and fails on any `var(--x)` that resolves to nothing.

Two things are explicitly *not* orphans, because a check that cries wolf gets
switched off:

- `var(--leading-snug, 1.35)` — a fallback **is** a definition at the use site.
- a token named inside a comment — that is prose, not CSS. Block and line
  comments are stripped before matching.

It found `--text-3xl` on its first run. Re-adding `--navy-850` to `index.html`
makes it fail with `index.html uses --navy-850`, so it bites.

Alongside it, a second check resolves `.slaf-menu`'s background *through*
whatever token it names and asserts the resolved value is opaque — so the
drawer stays solid no matter which token a future change points it at. Setting
`--color-panel` to `rgba(18, 21, 27, 0.5)` fails it with the resolved value
printed.

### Verified

Chromium at 412×915 with touch, drawer opened by tap on `index.html` and
`rooms/statement.html`: computed background `rgb(18, 21, 27)`, opacity `1`, no
console errors, and the screenshot shows the dashboard fully hidden. The D&D
rooms do not render a `.slaf-menu` at all — only the vendored stylesheet
carries the rule — so there was nothing to fix on that side beyond keeping the
copy byte-identical.

No stored shape changed. `getProfile()` / `updateProfile()` are untouched.

## D-158 — An empty debt list is not "no debt"

Found while screenshotting the FOO ladder to check the D-157 token fix had
not broken the gem. Steps 3 and 9 were showing a **full blue progress bar**
directly above the words *"No debts entered."*

Both steps were declared `needs: [true]` — always scoreable, no inputs
required — and scored:

    pct: high.length === 0 ? 100 : 0

With nobody's debts entered, `high.length` is `0`, so the step read as
complete. The room's own copy contradicted the bar it was drawing: the
sentence knew the difference between "no debts entered" and "no high-interest
debt. Clear.", and the bar did not.

This is the **Empty ≠ zero** non-negotiable, broken in the most expensive
place it could be — the room whose entire job is telling someone what to do
next. A person who has not yet reached Debt Payoff was being told two of the
nine steps were already behind them.

### The rule was already written down

`shared/schema.js` has had it right the whole time:

    /* "No debt" (meta.hasDebt === false, D-061) is an answer: with nothing
       listed it reads as zero owed and zero a month, not as a blank. Left
       unanswered, an empty list is still incomplete — empty is not zero. */
    function saidNoDebt(household) { ... }

`totalDebtCents()` consults it and returns `incomplete` when unanswered. The
ladder simply never asked. `saidNoDebt` was a private function inside the
module, which is presumably why: it was not reachable. It is now exported,
which is the whole change to the schema — no stored shape moved, nothing
reads or writes differently, so no compatibility note is owed.

### What the three states do now

| State | Step 3 / 9 |
|---|---|
| nothing entered | not scoreable — no bar, *"Add your debts, or say "no debt" in Start Here, to see this."* |
| `meta.hasDebt === false` | scoreable, 100% — *"No debt. Clear."* |
| debts entered | scored as before, from the rows |

Verified in Chromium at 412×915: with an empty profile both bars are hidden
and the fill width is unset; after setting `meta.hasDebt = false` both render
at `100%`.

The gem is unaffected — it only scores once the whole projection is ready, and
it was already showing `—` in this state.

### The test

`test/run.js` gains **"An empty debt list is not 'no debt'"**, which checks
`Schema.saidNoDebt` across all three answers, re-asserts that
`totalDebtCents()` still distinguishes them, and then guards the ladder itself
by the *property* rather than the expression: neither debt step may be
declared `needs: [true]`, and each must reference `d.saidNoDebt`. Reverting
either step to `needs: [true]` fails it four times.

This is the third instrument this session written to assert a property rather
than a mechanism (after the button's contrast and the drawer's opacity), and
the reason is the same each time: a test that names the current implementation
passes right up until the moment it should have spoken.

### Worth checking elsewhere

The pattern to look for is a count of rows standing in for an answer —
`x.length === 0` treated as "none" rather than "not yet told". The ladder was
the only place a sweep found it, but a new room that scores a list should ask
whether the empty case is a zero or a blank, and say which.

## D-159 — Two boxes buy a number, and the other seven wait

Start Here opened with nine controls and gave nothing back until every one of
them was answered. The repo owner's read was that this overwhelms a beginner,
and the count bears it out: eight `<input>` and one `<select>` before the page
says anything at all.

The fix is ordering, not new content. `spending` and `cash` now come first in
every one of the six situation orders in `shared/gate.js`, and the page shows
the runway the moment both are in.

### Why those two and no others

They are the only pair on the page that buys a figure back on its own. Cash
over monthly spending is your runway; nothing else here computes without
reaching for a table, a filing status or a second question. Every other card
on this page exists to **seed the rooms further on** — it feeds and gives
nothing back where it stands. So the two that pay immediately go first, and the
seven that pay later wait their turn.

Someone who fills two boxes and leaves still leaves with the one number that
says whether they are all right. That is the whole point.

### Ownership did not move, and could not

The obvious build was a new front-door room. It was wrong: the front door has
to write `monthlyExpenses` and `cashSavings`, and those have different owners —
`cash-flow` and `start` respectively (`shared/ownership.js`). A new room
writing both would break D-017 head-on.

Start Here already writes exactly these two and has all along:

    /* rooms/start.html */
    spending: function (v) { ... Spine.setMonthlyExpenses(c, 'estimated'); },
    cash:     function (v) { ... Ownership.write('cashSavings', c); },

and `shared/gate.js` fills the same estimate in a batch. The split is that
Start Here owns the **estimate** and Cash Flow owns the **tracked detail** —
`expenses.monthlyEssential` holds `estimatedValueCents` and `trackedValueCents`
side by side for precisely this reason. So the room that should ask first was
already the room allowed to. Nothing in `shared/ownership.js` changed, no
stored shape moved, and no compatibility note is owed.

### The readout, and what it refuses to do

`#runway` sits above the cards so it is on screen while the first two boxes are
being filled. It is not built from `Gate.CARDS` and holds no input, so it is
outside the LIVE-FORM contract (D-034) — only its text is ever written, never
its structure. `test/forms.js` still passes on all 448 checks.

It computes from `Schema.cashCents` and `Schema.monthlyExpensesCents` and shows
nothing unless **both** are `ok` and spending is above zero. A blank is not a
zero, and a zero month would divide by nothing; either one absent means no
number rather than a wrong one. Five bands of copy, each stating the fact and
what it means, none of them congratulating anyone.

### What this does not do

It does not collapse the remaining seven cards behind a reveal. That was the
other half of the idea and it is the riskier half — hiding a container of live
inputs wants its own pass and its own proof against `test/forms.js`. The
reorder plus the instant number is the part that carries the value, so it ships
alone.

Verified in Chromium at 412x915 with touch: card order is
`spending → cash → about → pay → investments → plan → debt`, the panel is
hidden on load, and $8,000 against $3,000 a month reads 2.7 months with the
right band. 21,394 + 5,614 + 25 + 448 + 340 checks pass.

## D-160 — The ledger: five states, and how many rooms are waiting

Start Here said `2 of 8 answered`. True, and not much use: it does not say which
two, why the other six matter, or that three of the questions on the page do not
apply to you at all. The repo owner asked for categories — what is filled, what
is not, what does not need filling, what was computed — plus "a relevancy kinda
thing".

A sticky rail beside the cards now groups every field the page could ask into
five states, and orders the unanswered ones by how much they unblock.

### The app already knew all five

Nothing new was measured. `Ownership.describe()` has returned all of it for a
long time:

| Group | Test |
|---|---|
| Still to answer | `applies && !isSet` |
| Filled with a guess | `isSet && guessed` |
| You answered | `isSet`, source is this room or the owner |
| Came from another room | `isSet && confidence === 'room'`, named |
| Does not apply to you | `!applies`, with `notApplicableBecause` verbatim |

The last one is the one no other finance app shows. D-055 established that a
field which cannot apply is *not* an outstanding task — "Between jobs · You are
working." is an answer, and the rail says so rather than leaving a permanent
gap in a progress count.

### Relevance is the only new idea

The rail counts, for each field, how many of the sixty-six rooms name it in
their registry `needs`, and sorts the unanswered by that count:

    Gross annual income        27 rooms waiting
    Investments + retirement   15 rooms waiting
    Total debt                 10 rooms waiting
    Filing status               7 rooms waiting
    ...
    Monthly debt payments       1 room waiting

That turns a list into a priority order, and it is measured from the registry
rather than asserted by me. The number that unblocks twenty-seven rooms is a
different proposition from the one that unblocks one, and until now the page
presented them as equals.

### One bug this shipped with, briefly

`confidenceOf()` returns `'room'` whenever the writer is not the field's owner.
Start Here writes the *estimate* of `monthlyExpenses`, which Cash Flow owns
(D-159) — so a figure typed on this very page was filed under "Came from
another room". Corrected: only a source that is some *other* room counts as
carried. Source ids are rendered through `Registry.byId().title`, so a row says
"from Cash Flow", never "from cash-flow".

### Layout, and what it does not disturb

Wide screens get a 300px sticky rail beside the cards; narrow ones stack it
under them. The menu pins open as a sidebar past 1080px (D-135) and puts
`padding-left: 272px` on the body, so the grid sits inside that — checked, not
assumed: `test/responsive.js` passes 340 room-widths with no sideways scroll.

The rail holds no input of its own, so it is outside the LIVE-FORM contract
(D-034); only its markup is rewritten, never a control being typed in. A row
scrolls to its card and deliberately does **not** focus the input — a
programmatic focus opens no keyboard on a phone and would steal the caret from
whatever the person was already in the middle of typing.

21,464 + 5,614 + 25 + 448 + 340 checks pass. No stored shape changed and
`shared/ownership.js` is untouched, so no compatibility note is owed.

## D-161 — The way back

One owner per number (D-017) is the best idea in this app and it has an unpaid
debt: it sends people away constantly. A room says "add your debts in Debt
Payoff", you go, and then you are stranded in a sixty-six room app trying to
remember what you were doing. `returnTo`, `?from=`, anything of the sort —
none of it existed anywhere in the repo.

The D-160 ledger sharpened this into a real problem rather than a theoretical
one, because it puts a dozen links on the page whose whole job is to fire you
off somewhere else.

### One choke point, so it is not sixty-six changes

Every cross-room link in the app comes out of `Ownership.linkTo()`, and
`describe()` already knew which room was asking — it takes `currentRoomId` so
it can tell "yours" from "borrowed". So the caller was already in scope and
simply was not being used:

    href: linkTo(f.owner, f.anchor, currentRoomId)

`linkTo` appends `?from=<roomId>` when there is a caller, it is not the target,
and the registry recognises it. The far side is `shared/progress.js`, whose
`mountHeader()` is the one mount point every room reaches (D-142, D-149,
D-155), so the pill costs one change rather than sixty-six.

The query string goes **before** the anchor. The other order puts it inside the
fragment, where `location.search` never sees it.

### Why the URL and not history.back()

They are different promises. Back retraces your last step, whatever it was.
This returns to the room whose number you left to go and fill in, however many
taps ago that was and whatever you did in between. A person who goes Cash Flow
→ two other rooms → back wants Cash Flow, not the room before this one.

It also survives a reload, and it makes a link shareable: paste someone the URL
and they get the same trip.

### Refusing to trust the string

`?from=` is user-editable text in a URL bar. It is resolved through
`Registry.byId()` and rendered only if that returns a real room; an unknown id,
a malformed escape, or the room's own id all produce nothing at all rather than
a link to nowhere. `decodeURIComponent` is wrapped, because a lone `%` throws.

### Three tests were asserting the mechanism again

`/fire\.html#targets$/` and two others broke — not because linking home
stopped working, but because they pinned the exact character sequence of a URL
and a query string now sits in it. Rewritten to `(\?[^#]*)?` so they assert the
property: it points at the owner's page and anchor. That is the fourth time
this session a test named the implementation instead of the behaviour, and the
fourth time it failed for the wrong reason.

### Verified

Chromium at 412x915 with touch: `?from=fire` renders "↩ Back to FIRE Number" at
32px and lands on `fire.html` when tapped; `?from=not-a-room` and a bare URL
both render nothing. 21,545 + 5,614 + 25 + 448 + 340 checks pass. No stored
shape changed.

## D-162 — The ledger, everywhere, without building a second one

The plan was "put the D-160 ledger on every room". Reading the code first
saved most of the work: `shared/progress.js` has rendered a room-scoped version
in every footer since D-142 — the missing fields with links, "this room has
everything it needs", "this room stands on its own", and the D-055 not-asked
note with its reason. Four of the five states were already there and shipped.

So rather than bolt a second ledger beside the first, the existing one gained
the two things it lacked.

### A guess is filled but not answered

`forRoom()` sorted every field into set or missing. A number the one-pager
guessed for you counted as set — so a room could read "has everything it
needs" while resting entirely on figures nobody confirmed. `entry.guessed`
now carries `describe().guessed` through, and the strip says:

> **2 of these are still a guess** — Monthly expenses, Date of birth. Good
> enough to compute with, worth fixing when you know.

Which is the honest position. The room genuinely can compute; the numbers are
genuinely not yours yet. Both facts, neither hidden.

### Relevance, counted rather than asserted

Each missing field now carries how many of the rooms name it in their own
registry `needs`, and the missing list is sorted by it. On FIRE Number:

    Monthly expenses          33 rooms want this
    Investments + retirement  15 rooms want this
    Date of birth              6 rooms want this

Derived from `Registry.all()` at first use and memoised, so it cannot drift
from what the rooms actually ask for — a test re-counts it by hand and compares.
Shown only above one, because "1 room wants this" is noise on the room you are
standing in.

### The footer links got the round trip for free

`forRoom()` already called `Ownership.describe(fieldId, household, roomId)`,
passing the asking room. D-161 made `describe()` thread that into the href, so
every "N things left" link in all sixty-six rooms now carries `?from=` and
offers a way back, with no change here at all. That is the payoff of a single
choke point.

### Verified

21,617 + 5,614 + 25 + 448 + 340 checks pass. No stored shape changed; the only
new field on the `forRoom()` row is derived at read time.

## D-163 — The dead spot is the door

Thirty-four places in the app print a sentence like "Add your debts to see
this" in exactly the spot a number should be. The sentence names what is
missing; `shared/ownership.js` knows which room owns it; and the two facts had
never been introduced. The links existed only in the footer, a screen away from
the thing the person was actually looking at.

Now the words are followed by the way there:

> Add your monthly expenses to see this.
> **Monthly expenses is in Cash Flow →**

and the link carries `?from=` (D-161), so the far side offers "↩ Back to FIRE
Number" and the trip is a round one.

### Built at the DOM, and why that is the right place here

The first attempt put it in `shared/room.js` beside the headline number. It was
nearly dead code, and the reason is worth recording: **the room template paints
from a guess-filled household**, so a template room is almost never blocked by
another room's field — it computes from the guess and shows a number. The real
dead spots live in the twenty-one rooms that render their own `.slaf-reason`.

Twenty-one rooms is too many to edit by hand, and they repaint on every change,
so a one-shot pass at mount would be wiped the first time anything moved. So
`Progress.mountDoors()` observes the document and appends a door to any
`.slaf-reason` that has no link of its own. It is:

- **idempotent** — each door is stamped `data-door` and the pass skips a reason
  that already has one, so repaints cannot multiply them (checked: five forced
  repaints, still one door);
- **additive** — it only ever `insertAdjacentHTML('afterend')`, never rewrites
  a room's own words, and never touches a control, so it stays clear of the
  LIVE-FORM contract (D-034);
- **deferential** — a reason the room already made into a link is left alone.

The room.js version is kept. It is correct where it fires, and it puts the door
inside the number block rather than after it, which reads better there.

### Which field it names

The one the most rooms are waiting on (D-162's count), taken from
`Spine.getProfile()` rather than the room's guess-filled copy. A guess makes a
room *able to compute*, which is not the same as the number being *known*, and
the door is about the second. Only the first outstanding field is offered — a
stack of links at the point of failure is a menu, not a next step.

### Verified

Chromium at 412x915 with touch, on a blank profile: FIRE Number and The Runway
each show one door to Cash Flow, The Statement and Worth It two each to Start
Here; following the FIRE door lands on
`cash-flow.html?from=fire#spending` and the header offers "↩ Back to FIRE
Number". 21,677 + 5,614 + 25 + 448 + 340 checks pass.

## D-164 — Two rooms called Enough

`fulfillment` (order 18) and `enough` (order 43) both carried the title
"Enough". In the menu, on the map, in the Walk-Through and in all twenty Front
Doors arrangements, picking one was a coin toss — and they are not near
neighbours in subject:

- **order 43** is the real Enough: *"the monthly figure you would live on by
  choice, and the second FI number it makes"*. It keeps the name.
- **order 18** is *"what each thing costs a month, against what it is actually
  worth to you"* — the cost-against-worth curve.

The new name is not invented. The Enough room's own copy already refers to this
one's output as **the joy curve** ("typed, or proposed from the joy curve"), so
the app had a name for it and simply was not using it on the door. `fulfillment`
is now **The Joy Curve**, in the registry, the `<title>` and the `<h1>`.

The room id is untouched, so every deep link, layout entry, walk step and
`rooms.json` row still resolves — a title is a label, and renaming one must not
break a link. `test/run.js` now passes with no duplicate titles anywhere in the
registry.

21,734 + 5,614 + 25 + 448 + 340 checks pass.

## D-165 — Saying that it saved

Nothing in this app has ever confirmed anything. A search for `aria-live`
across `shared/` returned zero. You typed a number, tapped away, and the only
signal it had stuck was a 33px button in the corner changing opacity.

On a phone that button is worse than subtle. `theme.css` hides its label under
640px, so it is a bare `↶`, and the thing that makes undo safe — its genuinely
good label, *"Undo: Rent or mortgage, a month — → $2,750/mo"* — lives in a
`title` attribute, which a touch device never shows. The person least able to
find out what undo would do was the one holding the phone.

### One widget, both problems

A toast at the point of action answers "did that save?" and "how do I take it
back?" together, and it is the same sentence for both:

> Rent or mortgage, a month — → $2,750/mo   **[Undo]**

It reuses `Spine.peekUndo().label` rather than inventing a message, so the
toast and the corner button can never disagree about what happened. The corner
pills stay: they are still the way to undo something from two rooms ago, and
they carry Cmd/Ctrl-Z.

It lives in `shared/undo.js`, which is already loaded by all sixty-five real
rooms — so this is one file, not sixty-five.

### Telling a save from an undo

`Spine.historySize()` gives the depth of both stacks. Grown means something
happened; shrunk means it was taken back and the toast says "Undone"; anything
else — a load, a room repainting, a lens toggle — moves neither and says
nothing. The very first paint is skipped, because arriving on a page with
history is not news.

### The first live region in the app

`role="status"` with `aria-live="polite"`. Polite rather than assertive: a
saved number is worth hearing at the next pause, not worth interrupting
someone mid-sentence for.

### What it must not do

Sit over the thing being typed next. It dismisses itself after seven seconds —
long enough to read and reach for Undo, short enough to be gone before the next
field matters — and it can be dismissed by hand. Both its buttons clear the
32px floor (D-136), and it is painted on `--color-panel`, the opaque token,
because it floats over content (D-157).

The risk this carried was a fixed element intercepting taps in the rooms below
it; `test/forms.js` taps through every form in every room on a phone-shaped
browser and passes all 448 checks unchanged.

### Verified

Chromium at 412x915 with touch: hidden at rest; after typing a rent it reads
"Rent or mortgage, a month — → $2,750/mo" with a 32px Undo,
`role="status"`, `aria-live="polite"`; tapping Undo restores the field and the
toast then says "Undone". 21,771 + 5,614 + 25 + 448 + 340 checks pass.

## D-166 — The other five questions, folded

D-159 put spending and cash first and deferred the other half: hiding the
remaining cards until asked for. Deferred because hiding a container of live
inputs is exactly what D-034 exists to warn about. It is done now, and the way
it is done is the point.

### Folded by rule, not by moving anything

    #cards.is-folded > *:nth-child(n+3) { display: none; }

No node is detached, reparented or rebuilt. `placeCards()` still owns every
child of `#cards` exactly as before, so the LIVE-FORM contract is untouched —
and a hidden card cannot take focus, so nothing can steal the caret either.
A wrapper element around "the rest" would have broken `placeCards()`, which
reconciles `#cards.children` by index.

### Folded for a stranger, open for someone coming back

The decision is made once per load, from whether anything past the first two
cards has a real answer — a **guess does not count**, or the one-pager's own
prepopulation would hold the page open for everyone and the fold would never
happen. Someone returning to numbers they gave last week sees them all;
hiding a person's own answers to look tidy is a worse sin than a long page.

Once per load, not per paint: re-deciding on every repaint would slam the page
shut the moment the second box was filled.

### The bug this nearly shipped with

`test/forms.js` failed on a `<select>` it could no longer reach, and chasing
that surfaced something worse than a test problem. The doors added in D-163 and
the ledger's own rows point at anchors like `#q-cash` — and **half this room's
cards are now folded on arrival**, so a link from another room would have
landed on nothing at all. I built the trap in D-163 and the fold sprang it.

A hash that names a card in this room now opens the page, checked both at paint
and on `hashchange` — the second because a hash can change with no repaint at
all: a deep link followed from another room, or the browser's own back and
forward buttons. The first fix only covered paint and the test still failed,
which is how I found the second half.

`test/forms.js` also gained `revealFolded()`, which opens the page before
tapping, since a person would: otherwise the suite tests a page no user ever
sees and five real controls go unchecked.

### Verified

Chromium at 412x915 with touch. Fresh: 2 cards, offering "The other 5 questions
— they feed the rooms after this one". Typing into both leaves it at 2, so the
fold does not move under the finger. Revealing shows all 7 and the button goes.
Returning with an answer past the first two: unfolded, all 7. Arriving at
`start.html?from=fire#q-cash`: the card is visible and the header still offers
"↩ Back to FIRE Number".

21,832 + 5,614 + 25 + 448 + 340 checks pass.

## D-167 — The Long Way Round, and what the spec asked for instead

A specification arrived for an "FI Choose Your Own Adventure": set a baseline,
pick one of four strategies, walk five years, then test contingencies. It
specified React, Recharts, Tailwind and a `/src` tree.

This repo has no `src/`, no `package.json` and no build step, and "static HTML
+ vanilla JS, no build step" is a non-negotiable in `CLAUDE.md`. The spec also
describes itself as integrating with SPARKS — keeping the radar, the rooms and
localStorage — so the stack was the part to drop, not the idea. Built as a
room.

### It writes nothing, and that is what makes it free

`kind: 'explore'`, and there is no field here for another room to fight over.
A strategy you are *considering* is not a fact about your household, so the
D-017 ownership question never arises: the room reads what you earn, spend and
hold from the rooms that own them, and every one of those three is shown with a
link back to its owner rather than a box to retype it in.

That is also why it needed no schema change and owes no compatibility note.

### The paths are stated, not asserted

`data/adventure_paths.json` carries `confidence: 'unverified'` and says why:

> No study says a house hack cuts housing by 40% for you; it says it can, and
> the room lets you change the figure rather than pretending the default is a
> finding.

Every path prints its assumption beside the number it moves — "$500 a month net
of its own costs", "housing falls by 40%, and housing is taken as 30% of what
you spend". The return is 5% real, taken from the median band already in
`data/return_bands.json` so this room and the rest of the app agree rather than
each carrying a private figure.

### The house hack moves the finish line, not just the pace

The interesting mechanic, and the one a naive build gets wrong: cutting spending
lowers **the target as well as the saving**. On the demo household the target
falls from $945,000 to $831,600 while the pot rises — so the path wins twice,
and the test re-derives that number by hand rather than trusting the engine.

### The most useful thing it says

Running the four contingencies against the same walk:

| Shock | Cost |
|---|---|
| Markets fall 30% | 1 year |
| Six months without work | 1 year |
| Lifestyle creeps up 4% a year | **4 years** |
| A 15% raise, saved | 2 years earlier |

A creeping lifestyle costs four times what a market crash does. That is not a
claim I brought to the room; it is what the arithmetic says, and it is the sort
of thing this app exists to show.

### Refusals kept

`yearsFrom()` returns **null** — never `Infinity`, never a cheerful large
number — when nothing is being saved and the target never arrives. A baseline
missing any of income, spending or a portfolio returns incomplete naming the
absent fields, because a five-year projection built on an assumed nought is a
lie told confidently.

### What the registry taught me, twice

The row went into the `ROOMS` array literal when it belonged in a `ROOMS.push()`
further down; orders must ascend in registration order, and mine sat at 43.5
among rooms of order 18. Then `FILTER_TAGS` is exactly `income · cashflow ·
debt`, so `['fire', 'scenarios']` was not a tag set at all. Both were caught by
tests, not by me. The D-153 layout guard then refused the room until it appeared
in all twenty Front Doors arrangements — the third time that check has earned
its keep.

### Verified

Chromium at 412x915 with touch: an empty profile is refused with a named
reason; the demo household reads $72,000 / $37,800 / $57,500; four paths offer;
five years walk; four rows compare; and the lifestyle shock reports "puts the
finish line back 3 years". 21,945 + 5,614 + 25 + 448 + 345 checks pass.

## D-168 — A room that renders nothing, quietly

The repo owner opened The Long Way Round the moment it shipped and got a
heading, a sentence, two buttons and nothing else. No menu. No paths. The
carat opened onto an empty drawer. "It won't let me click next", because there
was nothing to pick.

Reproduced by serving the strategy table as a 404:

    page errors : Could not load adventure_paths.json (404)
    header      : not mounted
    paths       : 0
    told to you : NOTHING

Three faults, and the third is the one that matters.

### 1. No `.catch()`

    Reference.load([...]).then(function (tables) { ... });

One missing file rejected the promise, everything after it never ran, and the
rejection went nowhere. On GitHub Pages the window between a push and the file
being served is real, and that is exactly when it was opened.

### 2. The header went up last

`Progress.mount()` was the final line of the `.then()`, so a throw anywhere
before it left a page with **no menu and no way out** — worse than an empty
room, because you cannot leave it. It now mounts *first*, before anything that
can fail.

### 3. It said nothing

The unforgivable one. A page that renders its furniture, none of its content,
and no explanation is the worst thing this app can do — it reads as "your
numbers are wrong" when the fault is entirely mine. There is now a plain
message that says so, and the buttons disable rather than lying about being
usable.

Also fixed: `.room-head` had no padding, because sixty-four rooms define that
rule themselves and this one forgot — hence the flush-left heading in the
screenshot.

### The guard: test/render.js

The owner asked for something that stops this recurring, and they were right
to. **My console-error sweep passed on this room.** No errors were logged
locally, because locally the file loads. "No console errors" is not "the page
works", and I had been treating them as the same thing.

So the new suite asserts what a person actually checks:

1. **The header mounted.** `Progress.mount()` is the last thing every room's
   init does, which makes a missing menu the canary for init having thrown
   halfway. This is the check that catches the whole class.
2. **Nothing threw.**
3. **The room said more than twenty-five words** — it is not a heading over
   blank space.

Every room, twice: once on an empty profile and once on the demo household,
because "works once you have data" is not the same as "works".

Proved by mutation. With the original code and the table missing:

    ✗ adventure (empty) throws nothing — 404 <adventure_paths.json>
    ✗ adventure (empty) mounts its header — no menu or hop strip
                                            init probably threw before Progress.mount()

With the fix and the same missing file, only the honest 404 remains: the header
mounts and the message appears.

The guard also caught its own blind spot on its first run — the browser's
`/favicon.ico` probe is reported with the URL in `location()`, not in the
message text, so a text filter for "favicon" never matched and every room
failed. Fixed before the suite was trusted.

### And the numbering

Separately reported: the first card on Start Here said **"2 of 7"**. It was
counting the situation question as card one while never numbering it, so every
card read one higher than its position and the page looked like it had lost a
question. Cards now count themselves 1..N of N.

22,029 + 402 + 5,614 + 25 + 448 + 345 checks pass.

---

## D-169 — The audit after the feedback: what was measured, what moved

The owner's standing brief, gathered from a week of feedback: efficient,
simple, enjoyable, effortless, professional. Before touching anything, the
whole app was measured against the specific complaints that had already come
in — dead buttons, dead ends, prose in the way, a page that looked broken,
titles nobody would type. What follows is what the numbers said and what
changed because of them.

### Measured

- **Room furniture copied 240 times.** `.room-head` was defined in 65 room
  files, `.room-lede` in 64, `.room-back` in 64, `.notice` in 48 — the same
  four rules, byte for byte, in every room. The Long Way Round shipped without
  them (D-168) and its heading sat flush against the edge. That is the cost of
  copying: the sixty-fifth room forgets.
- **Words before the first thing you can do:** 91 on average across the
  rooms; 39 of 68 rooms open with a paragraph of forty words or more. Worst
  among the rooms that take typed input: the Statement at 227, The Joy Curve
  at 220, FIRE at 151, Cash Flow at 138.
- **The front door carried "← Every Ratio | Worth Learning →".** Two
  arbitrary neighbours of a page that is not on the walking path, dressed as
  instructions.
- **Three titles that are jargon:** Decumulation, Dreamline, Reversibility.
  Nobody arriving from the menu knows what the first means, the second is a
  book's coinage, the third is a property, not a question.
- **Checked and clean:** 0 fields with two writers (`shared/ownership.js`
  holds), 179 inputs across 62 menu rooms, every menu room reachable from
  the map and the walk.

### Moved

1. **The four rules live once**, in `shared/theme.css` (`.room-head`,
   `.room-lede`, `.room-back`, `.notice`), and the 240 copies are gone from
   the rooms. Five rooms keep a genuinely different variant (a wider head, a
   coloured notice) and those stay local, because they are not copies. The
   vendored `dnd/shared/theme.css` moved with it, byte-identical.
2. **The dashboard shows no previous/next.** `Progress.headerNavHtml`
   returns nothing for `dashboard`; the menu and Walk Me Through are the ways
   in from the front door. `test/run.js`'s "never a dead end" block exempts
   the dashboard on the condition that `index.html` links to `walk.html` —
   so the exemption holds only while a real way on exists.
3. **Three renames**, registry and page together: Decumulation → **Drawing
   It Down**, Dreamline → **Price the Dream**, Reversibility → **Can It Be
   Undone**. Ids, files, engines and stored keys are untouched; the dashboard's
   "Open Decumulation →" and one source note in Rollover follow the new
   names. `rooms.json` regenerated.
4. **Prose folded, not deleted.** Cash Flow's how-to-fill-this-in paragraph
   is a closed `<details>` with a one-line summary; The Joy Curve's hint is
   one sentence. The words are still there for whoever wants them, and the
   first input is on screen without scrolling.

### Not moved, on purpose

The 62-room menu is the biggest single source of "where do I even start", and
shortening it is a design decision about what the app *is*, not a cleanup.
Deferred, and flagged. The Statement and FIRE still open long; both are
rooms where the paragraph does real work and a fold would hide the terms the
inputs use, so they wait for a per-room pass rather than a blanket cut.

### Guards

- `test/run.js` fails if a room redefines one of the four shared rules
  verbatim (the orphan-CSS check from D-157 already caught undefined tokens;
  this is its mirror — a token defined twice).
- `test/render.js` (D-168) ran on every room after the strip: header
  mounted, nothing thrown, real content, empty and demo profiles.

---

## D-170 — Section 0: the eight promises, verified, and what was half-built

The brief for this pass opens with a list of things earlier sessions had
specified and asks that each be confirmed end to end, by a visible selector,
on every room, before anything new is built. Here is what the audit found and
what it took to make every line true.

### What was already true

- **The situation gate** (`shared/gate.js`, D-142): a card that does not
  apply is absent from Start Here's DOM, not hidden, and a room that is not
  for the situation folds itself behind a notice that says why.
- **Undo and redo** (`shared/undo.js`, D-165): the pair and the toast are on
  all 68 pages.
- **The save toast with undo**: the same file.
- **The field-status ledger** with relevancy: Start Here's rail (D-166).
- **Three toggle modes, folds, deep links and Triple D** — true on the 26
  rooms built on the template (D-097) and on Start Here and the dashboard.
  **Not true on the 40 older rooms.** FIRE, Savings Rate, The Windfall, Quick
  Math, the Snapshot, Where It Goes, Fire Lab and The Long Way Round each
  projected a number forward at one rate with no lens toggle and no band;
  51 rooms had no progressive fold; no room but Start Here wrote its place
  back to the address bar.

### What was built, once, for every room

All of it hangs off `Progress.mountHeader`, the one mount point every room
reaches — the same lever as the walk strip, the situation notice and the
export (D-142, D-149, D-155) — so no room can be forgotten and none had to be
edited for it.

1. **Header first.** `shared/progress.js` mounts the header at
   `DOMContentLoaded`, before any table has loaded and before a room's own
   init can throw; the room's later call is a no-op. A page that dies halfway
   still has its menu and a way out (the D-168 failure, closed at the root).
2. **The tail fold.** A room is its first four sections; the rest fold
   behind one button that names what it holds ("Show the rest · Strategies
   · Rewards · Timeline"). Folding is a class on `<main>` and a class on each
   folded section — nothing detached, no input rebuilt, so D-034 holds — and
   the fold opens itself when the hash points inside it, at load and on
   every `hashchange`, so no deep link lands on a hidden target. 51 rooms
   fold; 14 are short enough not to; Start Here and the dashboard fold on
   their own terms and say so with `data-fold="own"`. A section not
   displayed at mount (a wizard's later stage, a hidden branch) is not part
   of the room yet and is left alone.
3. **The URL follows you.** As a section reaches the top of the screen its
   id becomes the hash, written with `replaceState` — nothing added to
   history, nothing re-scrolled. Copy the address at any moment and it lands
   here. Armed on the first scroll so a `?from=` return link is never
   clobbered at load.
4. **Triple D everywhere a return appears.** New `shared/bands.js`:
   `Bands.lineHtml(tables, fn, fmt)` runs any projection three ways at the
   low, likely and high *real* return from `data/return_bands.json` (2% ·
   5% · 8%, the 25th/50th/75th percentile of ten-year outcomes) and renders
   one line — "Years away, three ways: 14 yrs if returns run low (2%) · 9
   yrs likely (5%) · 7 yrs if they run high (8%)". The likely figure is the
   headline everywhere else on the page; the other two say how wide "about"
   is. Added to FIRE (years away per variant), Fire Lab, Savings Rate (the
   date), The Windfall (what waiting costs), Quick Math (the habit invested
   instead), the Snapshot (FI progress), Where It Goes (the winner after
   tax) and The Long Way Round (the leader's pot; its engine takes a
   `returnRate` option). What If, Life already ran dream/default/disaster
   from the same table and is marked `data-bands`.
5. **The three toggle modes** on those same rooms: `Lens.mountStrip(host,
   amounts, tables)` mounts the existing $/hours/bought/pushed toggle with
   the room's two or three key amounts under the headline. Same
   `shared/lens.js`, same session-scoped mode, no new logic.

### The gate: test/features.js

Every room, on a phone-sized touch browser, against the demo household:
header at `DOMContentLoaded`; nothing thrown; undo, redo and the toast
present; a long room folds and one tap opens it; projection rooms carry the
toggle and exactly three band figures; the last subsection is a visible
deep-link target; scrolling to the bottom writes a section id to the hash;
Start Here carries the ledger; and the gate itself — the 401(k) card exists
for the employed demo and is absent from the DOM once the person is retired.
A one-off calculator (Where It Goes, The Windfall) is given a figure first,
because it projects nothing until it has one.

### Also audited on the way: every button

A script tapped every visible button in every room once (928 taps) and
flagged 33 that changed nothing on screen. All 33 are explained, none is a
dead button: CSV/JSON/Print start a download the DOM cannot see; the lens
toggle on a room with no amounts to re-read swaps two `aria-pressed` states;
"Use" writes a suggestion into an input's value; and an "Undo" of another
room's change undoes it in the household, not on that page. The two real
dead buttons of the week (D-168) are what render.js now guards.

### Not changed

The 26 template rooms already had every one of the eight; they are
untouched except for the shared fold and URL sync they inherit.

Gate: 584 checks across 67 rooms. Unit 22,288 · dnd 5,614 · export 25 ·
render 402 · forms 448 · responsive 345.

---

## D-171 — DAITE is the spine: five families, one vocabulary, storage unmoved

### The ask, and what "restructure" was taken to mean

Section 1 of the brief: the household root has exactly five families —
debt, assets, income, taxes, expenses — every room declares what it reads
and writes as those letters plus a child path, ownership derives from the
declaration, take-home is computed in one place, and the dashboard opens on
five tiles.

The stored household (D-017, `shared/schema.js`) has fifty-odd subtrees and
sixty-seven rooms read it through the Schema accessors. Rewriting the
storage shape to five keys would break every room and every saved file for
a change no one can see. So DAITE is landed as **the one vocabulary and the
one view**, and storage stays where it is:

- `shared/daite.js` — `FAMILIES` (D A I T E), `PATHS` (every ownership
  field → its declared path), `familyOf`, `isMoney`, and `view(h, tables)`,
  which reads the household as the five families, Results throughout, so a
  blank stays incomplete and never becomes a zero.
- Every registry entry now carries `daite: { reads: [...], writes: [...] }`
  — `reads` derived from its `needs`, `writes` from the ownership map plus
  the few things a room writes that the map does not name (a plan, a
  preference, the import). 67 rooms, all declared.
- `Ownership.ownerOf(fieldId)` returns the map's owner **and** whether the
  registry agrees; `Ownership.write` refuses when they disagree. The test
  holds all 93 fields to it.
- The brief's phrase "any room needing a number outside this tree is a
  design error" is enforced by the test that every declared path is under
  one of the five families **or one of four named context families**, below.

Compatibility: **nothing changed in the stored shape.** `getProfile()` and
`updateProfile()` are what they were; no room was migrated; no saved file
needs re-reading. A future room reads DAITE through `Daite.view` or the
Schema accessors, both of which read the same bytes.

### The ambiguous mappings, and how each was resolved

The brief itself puts `prefs` and `scenarios` outside DAITE. Following that
precedent, four context families are declared beside the five, each for
things that are not money numbers:

| Family | Holds | Examples |
|---|---|---|
| `you` | who the household is | date of birth, situation, dependents, insurance cover, estate facts |
| `plans` | a decision being weighed or a target aimed at | an offer's gross, a home price, tuition target, retire age, dreams, the Rerank cuts |
| `prefs` | how to show things, per user | the History comparison, the front door |
| `progress` | what has been learned or walked | skills, exercises, the practice ledger, the walk |

Calls that could have gone either way, and where they went:

- **Insurance premiums** (`healthMonthly`) are an outflow → `expenses.insurance`; the **cover itself** (deductible, out-of-pocket max, term life, disability, umbrella) is a fact about protection, not a flow → `you.cover`.
- **Variable income** bounds and buffer → `income.variable`: they describe the income, not a plan.
- **Student-loan plan choices** (plan, extra, IDR share, forgiveness years) → `debt.items[].plan`: attributes of a debt.
- **Tuition saved** is a 529 balance → `assets.invested`; the target and monthly are a plan → `plans.kids`.
- **Giving** is an outflow → `expenses.giving`.
- **Allocation and rebalance band, the retiree's stock share** → `assets.allocation`.
- **Contribution percent, Roth and HSA contributed** → `assets.contributions.*`, the path the brief's own lens example uses; the employer match is a property of the income source → `income.sources[].employerMatch`.
- **"No debt"** (D-158) → `debt.none`: an answer about debt, kept beside the items.
- **Pay cadence and next payday** → `income.cadence`; the calendar's bills and pay-later → `expenses.log`.

### Take-home in one place

`Schema.estimatedAnnualTaxCents(h, tables)` and `Schema.takeHomeAnnualCents`
/ `takeHomeMonthlyCents` now live in `shared/schema.js`; `Tier0` keeps the
same names and delegates. The savings rate is **take-home minus spending**
over gross — the same number as before (gross − spending − tax), stated the
right way round. The Long Way Round's baseline was the real bug: it took
gross as income and saved gross minus spending, so every path was
overstated by the tax. It now takes take-home and says so on screen ("You
take home $58,320 a year, after $13,680 of tax"). The demo's savings rate is
unchanged at 28.5%; the demo's five-year pots move down, correctly.

### The gates

- `test/run.js` "DAITE is the spine": every entry declares; every path is
  under a family; every need is a declared read; every owner is a declared
  writer, and a planted disagreement is refused; take-home equals gross
  less the estimated tax and is incomplete without the table; the view
  reads the five families off the demo and reads incomplete off an empty
  household; and the **grep gate** — no file under `engines/`, `shared/`,
  `rooms/` or `index.html` subtracts spending from gross income (`gross… −
  …expenses|spend`, and `saved = …grossAnnual… −`). Two prose hits were
  reworded to say take-home, which is what they meant.

### The dashboard

"Where you are" opens on five tiles — D · A · I · T · E — one number each
(what you owe, what you own, take-home a year, the effective rate, a
month's spending), one status word (entered · a guess · missing · none) and
a link to the room that owns it. The six cockpit instruments and the 3D
toggle moved into the full panel unchanged. Still four blocks (D-096).

Unit 23,083 · dnd 5,611 · export 25 · render 402 · forms 448 · responsive 345
· features (dashboard) 6.

---

## D-172 — Expenses are four numbers: FAT, wants, and one optional line

### The shape

```
expenses
  needs
    food            { monthlyCents }
    accommodation   { monthlyCents }   rent, or mortgage + tax + insurance, one number
    transportation  { monthlyCents }
  wants
    totalCents                         everything else, one number
    therapy         null | { monthlyCents }   only while the toggle is on
  entries[]                            the dated log, and the optional split by category
```

Cash Flow's entry is now **four boxes** — Food · Rent or mortgage · Getting
around · Everything else — and one plainly labelled toggle, "Track mental
health spending separately". On, therapy is a fifth line and "everything
else" is glossed *not counting therapy*; off, the line is `null` and does not
exist in the shape at all. `Schema.fat(h)` reads the five as Results; the
month (`Schema.monthlyExpensesCents`) is the closed months' actual when there
is one (D-130) and otherwise **the sum of what is entered**, because
"everything else" is by definition whatever has not been split out — a blank
bucket sits inside it. The total is incomplete only when nothing at all is
typed; a blank bucket is incomplete on its own (DRAFTT's row says "not filled
in") without blanking the month.

**Debt minimums are not expenses.** They live under debt (D-017) and DRAFTT's
D share reads them there. Cash Flow's "goes out" tile shows the four numbers
*plus* the minimums, labelled as such, because they do leave the account.

### What happened to the old pair, and to the category lines

`expenses.monthlyEssential { estimatedValueCents, trackedValueCents }` is
**no longer read by anything.** Migration runs in `createExpenses` on every
load: a saved household with blank buckets takes its month from its category
lines when it has any (food = groceries + eating out, rent = housing, getting
around = transportation, everything else = the other spending lines; savings,
debt minimums and income costs are not spending), else from the tracked
figure, else the estimate. The pair is kept on the record for round-trip only.
A typed bucket is never overwritten by migration.

The category lines survive as **the split** — folded under "Split it further
(optional)", still feeding the chart, the fixed-line floor (D-082), the Rerank
and the budget templates. The rule between the two: **the typed numbers are
the month; only when none is typed do the lines stand in, bucket by bucket**
(source `lines`), and never a mix — a typed "everything else" is the whole of
what is not split out, so adding line-derived needs to it would count twice.
Lines never write the buckets on their own. Cash Flow's "The lines vs the four
numbers" card shows the gap and its one button, "Use the lines as my month",
is the single deliberate write from lines to buckets (`Spine.setFatFromLines`).

`Schema.rentMonthlyCents` is the accommodation bucket — typed, or from the
split's housing line, or a recurring rent logged on its day (D-130), else
Housing Decision's *place you would rent instead*.

### Compatibility note

Stored shape changed: `expenses` gains `needs` and `wants`; `monthlyEssential`
is legacy and unread. Rooms updated: Cash Flow (owner: writes the five via
`Spine.setFat` / `setTherapyTracked`), Start Here (its one "what goes out"
box is the month: `Spine.setMonthlyExpenses(cents)` puts the remainder after
any typed needs into everything else), the gate's guess (lands in everything
else), the importer (merges the buckets; a legacy pair in a file migrates on
read), Enough and Designed Week (`Schema.withMonthlySpend` for their shadow
month), The Long Way Round (below). Every other reader already went through
`Schema.monthlyExpensesCents` and did not change. A future room reads
`Schema.fat(h)` for the buckets and `Schema.monthlyExpensesCents` for the
month; it never touches `monthlyEssential`.

### Housing share of spending

`housingShareOfSpending` is gone from `data/adventure_paths.json` and from
`engines/adventure.js`. The house hack now cuts the **real accommodation
line**, twelve months of it. Only when that line is blank does it fall back
to `accommodationShareFallback` (0.30, stated in the table with its note) —
and then the run carries `housingBasis: 'assumed'` and the sentence
"assumed 30% of spending because accommodation is not filled in", printed
beside the path's assumption. The Money Calendar's and Housing Decision's
30%-of-gross rent proposals now say "assumed 30% of gross because
accommodation is not filled in" wherever they are used.

### The demo

Robin's month is the four numbers explicitly — $710 · $1,500 · $220 · $720 —
summing to the same $3,150 as before, so nothing downstream moved. The
category lines ($2,895 of spending) are deliberately a split Robin did not
finish, and the card shows the −$255 gap.

### Gates

`test/run.js` "Expenses are four numbers": every category in the catalogue
maps to a bucket and the map names nothing the catalogue lacks; the shape;
empty is not zero; therapy on/off; one number lands the remainder in
everything else; migration from the pair and from lines; a typed bucket is
never overwritten; rent reads the bucket; and the reader gate — Cash Flow,
FIRE, The Long Way Round, Savings Rate, Real Hourly Wage, the tier-0 and
cash-flow engines, the gate, the importer, Enough, Designed Week and the
dashboard contain no `monthlyEssential`; no `housingShareOfSpending`
survives in `data/` or `engines/`. `test/forms.js` taps the four boxes on a
phone and reads them back; a blank stays null.

Unit 23,411 · dnd 5,614 · export 25 · render 402 · forms 460 · responsive
345 · features 584.

---

## D-173 — DRAFTT: seven shares against seven bands, and whose band it is

### What it is

The measuring stick. Each letter is a share of take-home pay against a
healthy band, one verdict word a row, the owner room a tap away, no chart:

| Letter | Share | Of | From |
|---|---|---|---|
| D | debt payments — non-mortgage minimums | take-home | `debt.items` (D-017) |
| R | retirement saving — contributions | **gross** | the contributed savings rate (D-073) |
| A | rent or mortgage | take-home | `expenses.needs.accommodation` (D-172) |
| F | food | take-home | `expenses.needs.food` |
| T | getting around | take-home | `expenses.needs.transportation` |
| T | taxes — the effective rate | **gross** | `Schema.estimatedAnnualTaxCents` (D-171) |
| (T) | therapy | take-home | only while the toggle is on |

`engines/draftt.js` computes it; `data/bands.json` holds the bands. It
lives on the Financial Snapshot as its first section (`#draftt`) — the
"one pager out" — rather than a new room (section 7: no new rooms). The
Part 2 sidebar's "DRAFTT" entry will point there.

### The bands, and whose they are

`data/bands.json` carries four sources per letter — `slaf`, `trench`,
`moneyguy`, `fiftythirty` — each with `low`, `high`, an optional
`basis: "gross"`, and a `note` that says where the number comes from. The
`slaf` figures are **Eli's own defaults, stated opinions, to be overwritten
in that file**, and every entry says so. The other three are readings of a
published rule of thumb; where a source states no figure for a letter (Set
for Life has no food line; nobody states a tax share), the entry shows
Eli's default and its note says exactly that. Nothing here claims a study.

Basis is take-home unless the source says gross. The engine converts on
the fly — a band stated on gross, read on the take-home row, is widened by
gross ÷ take-home; a take-home band on a gross row is narrowed by the same
— so a row always compares like with like, and the screen prints "(25% of
gross, converted)" beside any band it moved. Retirement and taxes are
measured on gross, as the brief says; their own bands are stated on gross
and need no conversion.

### The pick is a preference, not a fact

Whose band each row reads is chosen with buttons (no typing) and stored per
user under **`prefs`**, a new store outside DAITE and outside the household
(`shared/prefs.js`, key `slaf.prefs.v1`, memory fallback): it is not
exported, does not travel in a share link, and the test holds the household
export free of it. Section 5's `showFrameworkNames` and Part 2's sidebar
state will use the same store.

### Found on the way

The Snapshot's `Reference.load().then(render).catch(notice)` turns any
error thrown while rendering into "Couldn't load the reference tables" —
which is how a missing `esc()` helper in the new section showed up as a
data problem. render.js cannot see that (nothing threw at the page level);
the features gate did, because the three-way line it looks for was never
painted. Fixed; the pattern is noted for section 6's rebuild.

### Gates

`test/run.js` "DRAFTT": the table has seven letters, four sources each, a
default of `slaf` everywhere and a note on every source; a household with
known numbers produces the expected share for every row (D excludes the
mortgage; R and taxes are of gross; therapy appears only while tracked);
**switching source changes only the band, never the share**, for all four
sources on all seven rows; the gross↔take-home conversion is exactly the
ratio; verdicts at and beyond the edges; a blank household has no share
anywhere and every row names what it wants; "no debt" is a zero, not a
blank; prefs store and fall back and never reach the export; the Snapshot
opens on the scorecard, draws no chart in it, and picks by button.

Unit 23,616 · dnd 5,614 · export 25 · render 402 · responsive 345 ·
features (Snapshot) 11; the Snapshot driven on a phone — six rows on the
demo, a pick changes the band alone and survives a reload.

---

## D-174 — The lever library: six levers in one file, three verbs, and an hourly figure

### What it is

Every "what if I did X" in the app now comes from one table,
`data/levers.json`, read through one small library, `shared/levers.js`.
A lever is one line: what it moves, by how much, the hours it costs, whether
it keeps paying through a job loss, one flexibility word, and when it
applies. There are six, exactly as the brief lists them, and no more:

| id | moves | hours a week | survives a job loss | applies when |
|---|---|---|---|---|
| hustle | +$500 a month, net | 15 | yes | always |
| househack | accommodation line −40% | 5 | yes | a property, or a priced home |
| relocate | every needs line −25% | 0 | yes | remote work is a stored fact |
| careermove | gross +20% | 0 | no | not retired |
| steady | gross +3% a year, all of it kept | 0 | no | always |
| drift | gross +3% a year, none of it kept | 0 | no | always |

The library offers three verbs and one figure. `get(id)` returns the line.
`applies(id, household)` reads the `appliesWhen` phrase against the house:
a few fixed phrases read by hand, never evaluated as code. `apply(id,
household, { scale })` returns a NEW household with the moves written onto
DAITE paths (an extra-income lever arrives as its own income source tagged
`lever` and `netOfTax`; a gross lever scales every source; a needs lever
scales the FAT line) and never mutates the one it was given; `scale` halves
a lever for a "half of each" combination. `impliedHourlyCents(id,
household)` is the monthly gain divided by hours a week × 4.33, so a room
offering a lever can say what an hour of it is worth for this household.
No categories, no weights, no plugin system.

### What moved out of the rooms

`data/adventure_paths.json` carried its own copies of the figures — a 2%
raise here, a 3% there, $500 a month, a 40% housing cut — as
`annualRaiseReal`, `annualExtraIncomeCents`, `housingCutShare` and
`raiseKeptShare` on each path, plus a hand-written assumption sentence. All
of that is deleted. A path is now a composition, `levers: [{ id, scale }]`:
Steady pulls `steady`; Side Hustle pulls `hustle` and `steady`; House Hack
pulls `househack` and `steady`; Both, Smaller pulls half a `hustle`, half a
`househack` and `steady`. `engines/adventure.js` composes the raise, the
ramp, the extra income and the housing cut from the levers and WRITES each
path's assumption sentence from their figures (`Adventure.describe`), so the
card on screen and the number it moves cannot disagree. The assumptions
drawer lists every lever the four ways pull with its figure, its hours, and
what that makes an hour worth for you.

Housing Decision reads the house-hack lever into its assumptions drawer:
the share, what it is worth on your rent line, and the hourly figure — or
"not weighed yet" for someone with no property and no price typed. Career
Move proposes the offer from the job-change lever (20% more than you earn
now) as a suggestion beside the empty field, tap "Use" or type your own,
and says so in its drawer. Neither room gained a field.

### What changed on screen, deliberately

The Side Hustle and Both, Smaller paths used to assume a 2% and a 2.5% raise
beside the hustle, a figure with no home anywhere else in the app. They now
carry the steady lever's 3%, the same raise Steady itself assumes, so the
four ways differ only by the lever they add. The demo's five-year pots move
a little because of it; every other figure in the room is unchanged, and
the house hack still reads the real accommodation line (D-172) with the 30%
fallback only when that line is blank. `raiseKeptShare` now does something:
Drift's spending rises by the raise it does not keep. No adventure path
pulls Drift yet.

### What the relocate lever waits for

`income.remoteOk` is a phrase the library reads against `meta.remoteOk`,
and no room writes that field, so the move lever applies to nobody today.
That is the rule at work — a lever waits for a fact rather than adding a
question — and the brief forbids a new typed field without a decision here.
This entry records the wait, not a field. When a room has a real reason to
know, the answer will be one toggle owned by that room.

### Gates

`test/run.js` "The lever library" checks the six levers and their figures,
`applies` against a working, a retired, a property-owning, a home-pricing
and a remote household, `apply` for immutability, the tagged income source,
the scaled gross, the cut lines and blank-stays-blank, the hourly figure
by hand ($500 ÷ (15 × 4.33) ≈ $7.70; $600 ÷ (5 × 4.33) ≈ $27.71), and a
grep gate: no `annualRaiseReal`, `annualExtraIncomeCents` or
`housingCutShare` anywhere in `data/adventure_paths.json` or `engines/`,
no lever figure in the adventure engine's code, and the three rooms read
the library rather than a number. The adventure section re-derives every
path from the levers by hand — the half-hustle in year one, the full one
from year two, the half house hack off the real rent line — and checks
that a path pulling a lever the library lacks is incomplete, naming it,
never a zero. Unit 23801 · dnd 5614 · export 25 · render, features and
forms on the three rooms touched.

### Compatibility

The stored household shape is unchanged. `apply` may add an income source
with `lever` and `netOfTax` on it and a `meta.leversApplied` list, on the
COPY it returns; nothing writes such a copy back to the store in this
section. `data/adventure_paths.json` is v1.2: a room reading `paths[].
assumption` or the four figure keys must call `Adventure.describe(path,
tables)` and `Adventure.compose(path, tables)` instead, and must load
`levers` alongside `adventurePaths`. `levers` is registered in
`Reference.TABLE_FILES`.

---

## D-175 — Lenses: thirty-three ways to read the same numbers, one card a domain until asked

### What it is

A lens is a rule that re-reads DAITE numbers and returns a verdict. It
never adds a field. `data/lenses.json` holds thirty-three of them across
seven domains — budgeting, debt, investments, transportation,
accommodation, income, taxes — each one line: the rule in plain words, what
it reads, its band, three verdict sentences (under · in · over, or one
sentence for a lens that states a number), who it is for, who it is not
for, and its source. The for / not-for pair is mandatory; `test/run.js`
refuses a lens without it. Each domain names a default: FAT and wants,
avalanche, FOO position, total cost of ownership, 25% of gross, take-home,
effective-vs-marginal.

`shared/lenses.js` (SLAF.Lenses — plural, because SLAF.Lens is the four-way
$ / hours / bought / pushed toggle of D-094 and the brief's `Lens.render`
would have overwritten it) has one small measure per lens id, each a few
lines that call the engine that already computes the figure: Tier0 for the
savings rate and FIRE progress, CashFlow for the contributed rate, Hourly
for the real hourly wage, Fire for coast, Foo for the ladder, TaxRoom for
the effective and marginal rates and the bracket headroom, Housing for the
rent-vs-buy arithmetic, QuickMath for 20/3/8, Draftt for the D and A
letters, Levers for the house hack. One formula, one function: no lens
recomputes anything a room already shows. `measure(id, household, tables)`
returns a Result with the tokens its sentences need; `verdictFor` picks the
sentence by band; `render(id, household, tables)` is the card; `renderAll`
and `mount` are the section. Rooms never write lens logic.

The cards live on the Financial Snapshot, a new `#lenses` section straight
after DRAFTT: seven cards by default, one a domain. "More ways to look at
this" opens the other twenty-six and is off by default, stored under
`lenses.more` in prefs, so the page cannot get busier unless the person
asks. "Show framework names" is the `showFrameworkNames` preference the
brief asks for: on, the header reads "Money Guy 25%" with its source; off,
it reads the plain phrase ("Save a quarter of what you earn"). With no
explicit preference the beginner door hides the names and every other door
shows them; nothing today writes a `door` preference, so the names show
until the onboarding split does.

### What was ambiguous, and how it was resolved

- **Where the cards live.** The brief names no room. They sit in one place,
  the Snapshot, beside DRAFTT, rather than one domain per owner room: one
  section to gate, one toggle, and the whole set readable in a minute.
- **Lenses that name a figure nobody has entered.** Three-fund, glide path,
  asset location, car-as-share-of-net-worth, rent-vs-buy and the 5-year
  rule read fields that exist (allocation, tax character, a vehicle, a
  price) but that the demo has not filled; each says so and names the room,
  never a zero. The 5-year rule has no "years you expect to stay" field and
  gets none: it prices the round trip — closing costs in, selling costs out,
  from `housing_conventions.json` — on the price being weighed, and leaves
  the "will you move" judgment to the reader.
- **Return on Hassle without a chore picked.** It states the bar: the real
  hourly wage, and what an hour a week must save to clear it.
- **Money Guy rate-by-age** thresholds by decade sit on the lens itself
  (`thresholdsByDecade`), reference data in `data/`, not in code.
- **Shockingly Simple Math** starts from zero on purpose and says so; the
  FIRE room counts what is held. The arithmetic is the closed form
  `ln(1 + 25(1−s)·r/s) / ln(1+r)`, re-derived by hand in the tests (28.5%
  at 5% real → 29 years; 50% → 17).
- **Asset location's band** turns on the marginal rate: at 22% and above
  the band is the pre-tax half, below it the Roth half. A reading of the
  convention, stated on the card.

### Gates

`test/run.js` "Lenses": the table whole (33 ids, 7 domains, defaults the
brief names, for / not-for on every one, three sentences when banded and
one when not), every lens a Result on the demo with a filled sentence and
a card, six hand re-derivations, the band picker, blank-household-reads-
nothing, seven cards with More ways off and thirty-three on, the names
preference. `test/lenses.js` (Playwright, phone-shaped): the Snapshot with
the demo shows seven cards, one a domain and each its default; the toggle
shows all thirty-three with for / not-for on screen and no unfilled token;
off again leaves seven, and the preference survives a reload; the names
toggle swaps a header; no console errors. Unit 23962 · lenses gate 109 ·
render and features on the Snapshot.

### Compatibility

The household shape is unchanged; a lens writes nothing. Two preferences
join `slaf.prefs.v1`: `lenses.more` (boolean, default off) and
`showFrameworkNames` (boolean; unset means "by door"). `lenses` is
registered in `Reference.TABLE_FILES`; the Snapshot loads every table and
now also `engines/tax.js`, `income.js`, `ledger.js`, `taxroom.js`,
`fire.js`, `housing.js`, `quickmath.js`, `shared/levers.js` and
`shared/lenses.js`. A future room wanting a lens calls
`SLAF.Lenses.render(id, household, tables)` after `Reference.load` and
`SLAF.Lenses.use(tables.lenses)`, and adds nothing of its own.

---

## D-176 — The Long Way Round v2: every way on a card, one chart, a link that keeps

### What it is

`rooms/adventure.html` rebuilt on the spine, the levers and the bands.
Two screens instead of five. Screen one: three baseline numbers, "You'd
need $X to stop working: 25 years of what you spend" in plain text, and one
card a way — Drift first, the baseline, every other card already showing
the pot after five years, the years to FI after that, the hours a week it
costs, what an hour of the extra earns, one flexibility tag, and its delta
against Drift ("3 years sooner, +$84,000"). No winner is marked; the sort
is a toggle (FI date · hours · dollars), FI date by default. Screen two,
after a tap: one chart with every way on one axis, the chosen way bold, the
target as a rule, the Triple D band shaded behind the chosen way, shock
markers on the years they hit; headwind and tailwind toggles under it,
each rewriting the delta sentence at the top ("Markets fall 30% plus six
months without work puts the finish line back 2 years. Without them, 12
years sooner than Drift, and +$68,959 after five years."); the savings
rate on that way with a link to Shockingly Simple Math on the Snapshot;
steppers for the lever figures ($500 ± $100, 40% ± 10%, hours ± 5),
buttons only; the year-by-year walk folded below, each row carrying the
event that hit it and the runway. No text input anywhere in the room.

### The engine (engines/adventure.js)

- Saving is take-home minus spending, never gross (D-171).
- The baseline splits `cashCents` and `investedCents`; an unknown balance is
  null, never zero. A crash hits the invested pot only. A job loss draws
  the monthly gap from cash first and reports `runwayMonths`; when the cash
  runs out the row says `borrowingFromMonth` N and the invested pot is
  never drawn below zero; the working half of the year repays what was
  borrowed first. On the demo: cash covers three of the six months, then
  borrowing from month four.
- A lever with `survivesJobLoss: true` keeps paying through the loss: the
  hustle narrows the monthly gap from $3,150 to $2,650.
- `raiseKeptShare` is applied: Drift's spending rises by the raise it does
  not keep, and the target rises with it.
- The accommodation cut reads the real line (D-172), the 30% fallback only
  when it is blank, said beside the number.
- Returns run three ways from `data/return_bands.json` through
  `Bands.threeWays` (`Adventure.threeWays`); the likely line is the
  headline, the band is drawn behind it.
- Paths are `drift` (baseline), `steady`, `hustle`, `househack`, `combo`
  (half of each, composed from the two levers, not a separate entry), and
  `relocate` and `careermove` offered only when their lever's `appliesWhen`
  passes (`onlyIf` in `data/adventure_paths.json` v1.3). On the demo,
  Change Jobs applies (employed) and Move Somewhere Cheaper does not (no
  remote-work fact), so the demo shows six cards.
- Shocks carry `kind`: crash, job loss and lifestyle creep are headwinds,
  the real raise a tailwind. Same mechanics, separate lists.
- The applies-to-you gate: `Adventure.gate` reads the FOO placement through
  `engines/foo.js`; at or below the high-interest-debt step it says so in
  one sentence and routes side income to that debt in the model
  (`debtPaidCents` on the row; the pot gets what is left). The demo sits
  at step 2 with a $3,200 card, so the first two years' hustle income clears
  it before joining the pot.
- Steppers pass `overrides` (`hustleMonthlyCents`, `housingShare`,
  `hustleHoursPerWeek`) through `compose`; the table is never touched, and
  the assumption sentence is written from the figures in play.
- `Adventure.cards` is screen one in one call: every way, its figures, its
  delta against Drift, sorted. `impliedHourlyCents` comes from
  `Levers.hourlyFor`, now the ONE hourly formula (`impliedHourlyCents`
  calls it), so a card and a lever card cannot disagree.

### State and sharing

The whole screen is the URL: `?path=househack&shocks=crash,jobloss&returns=low&hustle=600&housing=30&hours=20&sort=hours`
(`hours` and `sort` join the brief's five so a link reproduces the sort
and the hours stepper too). `history.replaceState` on every change;
loading the link reproduces the screen. "Copy link to this scenario" copies
it. "Pin this way" saves the label and the query to `shared/scenarios.js`
under its own key `slaf.scenarios.v1` — a DAITE context (`scenarios`),
never a household fact, never exported, never in a share link. Capped at
ten: the oldest drops with a toast and Undo (`restore`), which puts it back
and drops the newest instead. The room writes nothing to the household;
`test/run.js` greps it for a write and for a text input and finds neither.

### What was ambiguous, and how it was resolved

- **"Five cards."** The brief's gate says five; with Change Jobs applying
  to anyone working, the demo shows six. The gate asserts at least five,
  Drift first, a delta on every other. Fewer cards would mean hiding a way
  the rule offers.
- **Rows for years with "no event and no change".** A 3% raise changes
  every year, so every year gets a row; the rule is applied literally
  (event, or income or spending moved) rather than inventing a threshold.
- **Where new saving goes.** Positive saving joins the invested pot; cash
  stays where it is as the cushion; borrowing is repaid from saving before
  anything is invested. Stated in the drawer.
- **The chart.** `Charts.area` gained `opts.bands` (a shaded low–high
  range drawn behind the lines) rather than a second chart library.
- **Screen one's three-way line and lens strip** show the leading card's
  pot three ways, so the room keeps the D-170 promises on both screens.

### Gates

`test/run.js` adventure section: the split baseline, Drift first and the
gated ways, the cards' figures and sort, Drift's spent raise, headwinds and
tailwinds, the FOO gate and the routed debt ($3,000 then $200), the crash
on invested only, the job-loss runway (3 months, borrowing from month 4,
$9,450 borrowed and repaid), the surviving hustle, three ways, the
steppers, the pot identity on every row; plus the scenarios store (cap,
drop, undo, remove). `test/adventure.js` (Playwright, phone-shaped): the
brief's script — cards with deltas, tap House Hack, toggle crash and job
loss, delta sentence and URL change, a stepper rewrites both, reload
reproduces the screen, pin lands in the store with the household's facts
untouched. Unit 24127 · adventure gate 36 · features and render on the
room · dnd 5614 · export 25.

### Compatibility

The household shape is unchanged. `data/adventure_paths.json` is v1.3:
paths gained `drift` (`baseline: true`), `relocate` and `careermove`
(`onlyIf`); contingencies gained `kind`. `Adventure.paths(tables,
household)` filters by the household when given one; `compare` and
`cards` do. `run` rows carry `investedCents`, `cashCents`,
`borrowedCents`, `borrowedInYearCents`, `debtPaidCents`, `events`,
`runwayMonths`, `borrowingFromMonth`; `portfolioCents` is invested plus
cash less borrowed. The registry's adventure subsections are now
`s-stand`, `s-ways`, `s-way`. A new localStorage key, `slaf.scenarios.v1`.

---

## D-177 — The sidebar, grouped by purpose: seven groups, one component, absent not greyed

### What it is

The menu no longer groups rooms by kind (core / read / about-you /
explore). `kind` stays a registry property for ownership rules; it is no
longer a heading. Every room now carries `group`, `subgroup`, `aliases` and
(where it matters) `appliesWhen` in `shared/registry.js`, and one shared
sidebar in `shared/progress.js` renders them on every page:

- **Home** — The Dashboard, Start Here (the Scenario Planner joins in
  D-179 when it exists).
- **Your Numbers** — the DAITE owners: Debt (Debt Payoff, Student Loan
  Decision, When It Won't All Get Paid, Your Credit File), Assets (The
  Statement, Where It Goes, The Account You Left Behind), Income (Income,
  Variable Income, Real Hourly Wage), Taxes (Tax), Expenses (Budget, Cash
  Flow, Estimated vs Actual, Money Calendar).
- **Scorecard** — read-only: Financial Snapshot, DRAFTT (a link into the
  Snapshot's section), Savings Rate, Every Ratio, The Score, FOO Ladder,
  FIRE Number, FIRE Lab, Your Statements.
- **Decisions** — Work, Home & things, Family, Money moves, Years out.
- **What Matters**, **Level Up**, **Upkeep** (Your Data, Refresh, History,
  Every room on one page, Get Help — and, kept apart, Front Doors and The
  Walk-Through).

Subgroup names are labels, never links. Groups are `<details>` that
collapse; only the current room's group is open on load, and what a person
opens or closes is remembered under `sidebar.open` in prefs. A search box at
the top filters by title and by alias (`Registry.matches`); typing hides the
links that do not match and then the groups with nothing left, and opens the
groups that match without saving that as a preference. A Recent strip under
Home lists the last three rooms visited (`recent` in prefs, written on
every mount). A status dot on each Your Numbers room that owns a field
reads filled · partly · empty from the ledger (`Ownership.ownedBy` against
`Ownership.readings`); read-only rooms, calculators and an owner room with
nothing to own carry none. A room whose `appliesWhen` fails for the
household's situation is absent from the sidebar, not greyed: retired, the
whole Work subgroup goes (Career Move, Between Jobs, and the other three
work decisions with them, so the subgroup itself disappears as the gate
asks); student, Drawing It Down goes. The nav body is rebuilt when the
household changes; the search box, a live input, is built once (D-034).

`prefs.js` now loads before `progress.js` on every page, since the sidebar
remembers things.

### What was ambiguous, and how it was resolved

- **"No Work subgroup" for the retired.** The brief names only Career
  Move and Between Jobs, then asserts the whole subgroup is gone. Going
  Self-Employed, Side Hustle and Worth Learning are work decisions too and
  got the same `situation != retired`.
- **Substring search.** "car" also finds Money Calendar and Kids and
  Tuition (childcare). That is what a substring search does and it is
  honest; the gate checks presence and the hiding of Level Up, not an exact
  list.
- **A Your Numbers room that owns nothing** (When It Won't All Get Paid,
  Your Credit File, The Account You Left Behind, Real Hourly Wage,
  Estimated vs Actual) shows no dot: there is nothing for the ledger to
  read.
- **Cash Flow reads "partly" on the demo** because the optional therapy
  line is untracked; a dot never lies about a blank.

### Candidate logged, not acted on

Start Here, Front Doors and The Walk-Through are three ways in. The brief
asks that they not be merged in this section; they sit in Home (Start
Here) and Upkeep (the other two) for now. Candidate: one front door that
offers the three arrangements as tabs, with the Walk's progress and the
Doors' shelves as views of the same registry. Not this pass.

### Gates

`test/run.js` "The sidebar": the seven groups, every room in exactly one,
the subgroup orders, Scorecard writes nothing, aliases on every room,
`matches`, the situation gate (retired · student · unanswered), the
rendered sidebar (seven groups, every room, labels not links, DRAFTT after
the Snapshot, the search box, one open group, no room hand-writes its nav,
prefs on every page), the dot states on the demo. `test/sidebar.js`
(Playwright, phone-shaped): walks every room and asserts it appears in
exactly one group (or is absent for the employed demo when its appliesWhen
says so); search "car" shows What A Car Costs and hides Level Up; a closed
group is remembered and the current room's group opens; Recent shows the
room just left; a retired household has no Work subgroup, a student no
Drawing It Down. Unit · sidebar gate 90 · features, render and forms on
every room.

### Compatibility

The household shape is unchanged. Prefs gains `sidebar.open` (object of
group id → boolean) and `recent` (room ids, newest first). Registry rooms
gain `group`, `subgroup`, `aliases`, `appliesWhen`; `Registry.groups /
groupById / inGroup(groupId, situationId) / appliesToSituation / matches`
are new. `Progress.menuHtml` keeps its name and now returns the grouped
sidebar; `Progress.UPKEEP` remains for the map. `rooms.json` is unchanged
(the generator does not emit groups).

---

## D-178 — The block model: a hypothetical laid on the household, never in it

### What it is

A block is a life decision as the money lines it adds — a home, a car, a
kid, a job change, a sabbatical, a move, a side hustle, an inheritance, a
marriage — layered on the real household and never dissolved into it.
Blocks live in the scenarios store (`shared/scenarios.js`, key
`slaf.scenarios.v1`, the sibling of the household that D-176's pinned ways
already use), under `blocks[]`:

    id · type · label ("<Type> n" by default, so two unlabelled cars read
    Car 1, Car 2) · status (considering | planned | happened) · active ·
    dates[] { start: "2028-04", end: null | "2033-04" } · replaces (null or
    a block id) · answers (four at most) · lines[] { path, delta, kind
    (oneoff | monthly | annual), source (national | state | user),
    confidence, note, estimate, extra } · note

Rules, enforced in code: a line's `path` must resolve under debt / assets
/ income / taxes / expenses, or `addBlock` and `updateBlock` throw — a
line on `you.dob` never reaches the store. A line's first figure is kept
as `estimate` forever once a person overwrites `delta`. Blocks stack
additively; the only interaction is `replaces`: a 2030 car replacing the
2027 car ends the old block's windows on the new block's first start
(`Blocks.windowsAt` says what cut it). A block with several dates is
several windows. Delete returns the block and `restoreBlock` puts it back;
`duplicateBlock(id, { replacing })` copies it with the next label number,
blank dates and `replaces` set when asked.

`Spine.householdAt(date, { blocks })` is the only way a block reaches a
room: a copy of the household with every active block whose window covers
the date laid on — monthly and annual lines while a window is open, one-offs
once a window has started. `getProfile()` is untouched; nothing here
writes.

### How a line lands (`shared/blocks.js`)

- `expenses.needs.<line>` adds to that FAT bucket (a blank bucket takes the
  delta as its whole); `expenses.needs.*` is a share on every needs line;
  `expenses.wants` adds to wants; `expenses.applied` (property tax,
  insurance, upkeep, childcare, a small child, health cover) is a list the
  household carries only on the copy, which `Schema.fat` now lists apart as
  `applied` and counts in the month.
- `income.grossAnnualCents` moves the primary person's largest source;
  `income.netMonthlyCents` arrives as its own source tagged `netOfTax`, the
  way a lever's side income does (D-174).
- `debt.items` adds a debt with the `extra` rate, term and minimum;
  `assets.cashCents` moves the first cash asset (and may go below zero,
  which the planner will say rather than hide); `assets.invested`,
  `assets.property`, `assets.vehicles` add an asset; `taxes.state` sets
  the state. A family path this file cannot lay on is recorded under
  `meta.unappliedBlockLines`, never dropped in silence.

### The expansion tables (`data/blocks/<type>.json`)

One table a type: the questions (four at most, kinds money · month · state
· yesno · choice · number · months, never free text) and the lines, each
with a `note` naming where its default comes from and, where it matters, a
per-state override (`stateSource`) that marks the line `state` when it
resolves and `national` when it falls back. The line arithmetic is written
in the shared expression language: `shared/expr.js`, the evaluator pulled
out of `engines/events.js` (which now delegates to it and keeps no copy),
with `and` / `or` added.

| type | questions | lines |
|---|---|---|
| home | price · down · when · state | down and closing costs off cash; the mortgage as a debt at the 30-year rate with its level payment; the place as property; rent stops; the payment; property tax by state (Tax Foundation effective rates, a new table inside home.json); insurance; upkeep |
| car | price · new/used · loan/cash · when | cash or a fifth down; the loan over five years at a stated 7%; the vehicle; the payment; running costs at 10% (new) / 12% (used) of price a year |
| kid | when · childcare · state | the birth out of pocket; the 0-to-2 band a month; childcare by state (childcare_by_state.json) when wanted |
| jobchange | new gross · remote · when | the difference from your gross; remote, half the getting-around line |
| sabbatical | months · when · income during | dated for its months; pay stops; income during; COBRA single a month |
| geo | state · remote · when | the state changes; every needs line scales by a state cost-of-living index (a reading of MERIC, inside geo.json, confidence unverified); a regional move off cash |
| hustle | net · hours · when | one net line |
| inheritance | amount · when · into | arrives invested, pre-tax or taxable |
| marriage | partner gross · partner debt · when · combining | combining: income joins, debt arrives at 7% with a 2% minimum; not combining: no lines, and the block says so |

### What was ambiguous, and how it was resolved

- **"Store: `scenarios` in spine v2, a sibling of the household."** D-176
  already made that sibling for pinned ways; blocks join it rather than
  opening a second store. The old in-household `scenarios[]` (D-086 events)
  is untouched and unrelated.
- **Where a generic monthly cost lands.** FAT has three needs lines and a
  wants line; childcare and property tax are neither. `expenses.applied` is
  a list on the copy, not a fifth stored bucket — the stored household shape
  does not change.
- **State figures with no table.** Property tax by state and cost of living
  by state had no reference data; both are now inside their block table,
  rounded readings with the source named and confidence stated. A county or
  a city can sit far from its state; a real quote beats either.
- **Cash below zero.** A down payment the demo cannot afford leaves cash at
  −$82,500 on the copy. That is the honest answer and the planner's job to
  say (section 11); rounding it to zero would hide the whole point.

### Gates

`test/run.js` "Blocks": the shared evaluator (events delegates, no copy);
nine tables, four questions at most, DAITE-only paths, a note on every
line, registered as reference tables, no expansion logic in a room; each
table on a known answer set re-derived by hand (the mortgage minimum
through `Projection.levelPaymentCents`, Illinois property tax, the national
fallback, the cash car, childcare on and off, the sabbatical window, the
Texas-over-North-Carolina share); the store (Car 1 / Car 2, rejection at
write, the estimate kept, duplicate and replaces, delete and restore);
`householdAt` with two overlapping cars adding both, `replaces` stopping
the old car at the new start, a switched-off block doing nothing, the home
block's rent-off-payment-on and its applied lines counted in the month, a
dated sabbatical window, a move changing the state; and that the household
is never written. Unit · dnd (vendored schema re-copied).

### Compatibility

The stored household shape is unchanged; `expenses.applied` and
`meta.blocksApplied` / `meta.blocksAt` / `meta.unappliedBlockLines` exist
only on the copy `householdAt` returns. `Schema.fat` gains `applied`
(null unless the copy carries lines) and counts it in `totalCents`. The
scenarios store gains `blocks[]` beside `items[]`. `Reference.TABLE_FILES`
gains `blockHome … blockMarriage`. A room wanting blocks applied calls
`Spine.householdAt(date)` instead of `getProfile()`, after loading
`shared/expr.js`, `shared/scenarios.js` and `shared/blocks.js`; rooms under
Your Numbers never do (section 11).

---

## D-179 — The master build prompt: the phase order against what already exists, and Phase A's removal list

### What arrived

Eli's master prompt ("SPARKS Money Rooms: the master build prompt") landed
while section 10 was at its gate. It is one plan in six phases and says the
phase table wins where it disagrees with section order: A (0, 14, 1 with
15, 2, 3) · B (18, 19, 20, 9) · C (4, 5, 6) · D (10, 11, 12) · E (16.1 to
16.12) · F (21). Its rule for a contradiction with the code's reality is
to follow the intent, log the mapping, and keep going. This entry is that
mapping.

### What is already built, against the phase table

| section | state | entry |
|---|---|---|
| 0, 1, 2, 3 | done | D-170 to D-173 |
| 4, 5, 6 (Phase C) | done | D-174 to D-176 |
| 9 (in Phase B) | done | D-177 |
| 10 (in Phase D) | done | D-178 |
| 14, 15 (Phase A) | not started | this entry, then D-180 on |
| 18, 19, 20 (Phase B) | not started | |
| 11, 12 (Phase D) | not started | |
| 16.x (Phase E), 21 (Phase F) | not started | |

Sections 14 and 15 amend section 1 and were meant to land before section
2; sections 2 and 3 are already in. The intent holds: 15's shapes will be
applied to the DAITE families as they now stand (FAT, DRAFTT, the block
store) rather than re-doing 2 and 3. Phase order from here: **14, 15**
(finish A), then **18, 19, 20** (B), then **11, 12** (D), then E one
feature a session, then F. Sections 9 and 10 stay as landed; the Ledger
(18.7) will later remove Start Here, Front Doors and The Walk-Through from
the sidebar, which 9 deliberately left in and logged.

The pinned-ways store of D-176 and the block store of D-178 are the
`scenarios` sibling the prompt names; they are not redone.

### Phase A's removal and replacement list (grep, before code)

Written before touching code, as the method asks:

- **`shared/schema.js` ASSUMPTION_DEFAULTS** carries `returnReal 0.05`,
  `inflation 0.03`, `expectedReturnRate 0.07`. 15.2: inflation and real
  wage growth become declared assumptions editable in Settings only; the
  return bands come from `data/return_bands.json` and no engine keeps its
  own rate. `expectedReturnRate` (nominal 7%) is the one to retire; every
  reader moves to the real band.
- **`shared/staleness.js`** reads `meta.confirmedAt[fieldId]`, the spine's
  own stamps (D-056). 15.1: every leaf carries `asOf`; staleness reads it
  and the stamps go.
- **`asset.taxCharacter`** (pretax · roth · taxable · hsa · 529 · daf …)
  is 15.3's `orientation` under another name: kept as the stored key,
  aliased in `Schema.get`, logged as the mapping rather than renamed across
  fifty files.
- **`asset.liquidity` 1 to 4 and `data/access_rules.json`** are 15.8's
  tier by another scale: `tier: cash | taxable | retirement | property |
  other` is derived from category and tax character, and the Statement's
  ladder becomes a view of it.
- **`household.partner`** (D-099: splitMode, sharedMonthlyCents) is a data
  island; 15.7 makes `people[1]` the partner and the Partner room its
  editor. Migration maps the island onto the second person.
- **`retirement_milestones.json`** holds savings multiples by age, not the
  inflection dates; 15.9's `data/lane2/milestones.json` is new and distinct.
- **`data/states.json`** holds code and name only; 15.6 adds tax type,
  property tax, childcare, auto insurance and cost of living per state —
  the two tables D-178 put inside `blocks/home.json` and `blocks/geo.json`
  move there and the block tables point at them.
- **Income sources** carry `type` loosely (`other` for a lever's side
  income); 15.4 fixes the set to `w2 | 1099 | passive | benefit | pension |
  socialSecurity` with per-source take-home and `survivesJobLoss`.
- **Expense entries** carry `frequency`; 15.5's `cadence: monthly | annual
  | oneoff` is the same fact under the prompt's name, with `monthDue` and
  `date` added.
- **181 `<input>`/`<select>` elements across 50 rooms write to the spine.**
  That is section 18's removal list, not Phase A's; counted here so the
  Phase F delta has its start.

### The walkthrough counts, before Phase A (the Phase A baseline)

Played from a blank browser on the tree as of D-178. Alexis: 9 taps to
the dashboard by way of Start Here's "Try with example numbers", 14 with
her own four numbers; she stopped once, at the filing-status question
("what is head of household?"). Tom: 2 wrong numbers — The Statement's
net worth counts a pre-tax dollar as a whole dollar, and FIRE Lab's
nominal 7% sits beside the real 5% band with no label saying which is
which. Riley: 6 screens to a shareable scenario (Start Here → dashboard →
The Long Way Round → a card → shocks → copy link). These three counts are
the numbers Phase F is measured against.

---

## D-180 — Feature switches: rendering and engines, never stored facts

### What it is

`data/features.json` holds every switch the master prompt names — the
four from section 15 (`afterTaxNetWorth`, `showNominal`, `annualLines`,
`showMilestones`) and the twelve phenomena of section 16 — each with its
default, its scope (`user` or `situation`), its Settings group (Accuracy ·
Household · Horizon · Advanced), its label, its gloss and the section it
comes from. `shared/features.js` is the one way anything checks a switch:
`Features.on(id, household)` reads the person's pref for a user-scope
switch (else the default) and reads the household for a situation-scope
one; `Features.set` writes prefs only; `Features.applyPath('beginner' |
'fi')` sets the onboarding split's starting set (beginner: only the
default-on set; FI: Accuracy and Horizon all on) and remembers the door
for the lenses (D-175); `Features.rooms(id)` lists the rooms whose
registry entry names the switch under `features`. No room or engine reads
the file directly; a grep test says so.

The schema always carries a shape; the switch decides whether a room
renders it, asks for it, or an engine applies it. Nothing here writes a
stored fact: flipping every user switch on and then off leaves the
household byte-identical, in the unit suite and in the browser.

**Settings** (`rooms/settings.html`, Upkeep, before Refresh so Refresh
stays last on the path) is one screen: the two starting sets as buttons,
then one row a switch under its group — label, gloss, on/off as a
`role="switch"` button, "the default" or "yours", and "Shows up in" with
the rooms as links. A situation-scope switch shows its state read-only
with what sets it ("income type includes equity", "a federal student loan
exists", "an inheritance block exists"). Buttons only, no text input.

Every room's registry entry that will render a switch lists it under
`features` (twenty-five rooms, sixteen switches, every switch in at least
one room); the sidebar, the Front Doors arrangements (all twenty) and
`rooms.json` carry the new room.

### What was ambiguous, and how it was resolved

- **Situation switches and the `default` field.** A situation switch has
  no meaningful default; the field is kept as `off` so the table has one
  shape, and `on()` never reads it for that scope.
- **The situation predicates** are fixed phrases read by hand (the
  levers' and the sidebar's idiom), never evaluated. The equity and
  inheritance ones read shapes that section 16 will add (`type: 'equity'`
  on a source; an inheritance block) and are already true when those
  exist; the student-loan one reads today's `type: 'student_loan'` and
  16.8's `kind: studentFederal` alike.
- **Which rooms list which switch** was drawn from each phenomenon's
  "shows in" line. `planner` and the tree map are not rooms yet; they will
  add themselves in sections 11 and 19.

### Gates

`test/run.js` "Feature switches": sixteen switches with every field, the
four groups, no em-dash in a gloss, every switch in at least one room and
every room's list real, the table registered, no direct read of the file;
`on()` on defaults, prefs, unknown ids and situation reads (an equity
source, the demo's student loan); the on-then-off loop leaving the
household hash unchanged; both starting sets; the Settings room registered
under Upkeep writing only prefs, buttons only, through the library.
`test/settings.js` (Playwright, phone-shaped): every switch a row with
label, gloss, control and rooms; situation rows read-only; flip all on and
all off with the household byte-identical and the prefs holding the
picks; Beginner and FI set their sets; Settings in the sidebar; no console
errors. Unit 24787 · settings gate 15 · sidebar 91 · render and features on the room · dnd · export.

### Compatibility

The household shape is unchanged. Prefs gains `features.<id>` (boolean,
absent means the default). `features` is registered in
`Reference.TABLE_FILES`; the Settings room loads it. Registry rooms gain
`features: [...]`. A future room or engine checks a switch with
`SLAF.Features.on(id, household)` after loading `shared/features.js`
(which wants `prefs.js` and `registry.js` first; `scenarios.js` when the
inheritance predicate matters).

---

## D-181 — Section 15: the ten foundation shapes, one commit a shape

### The reading of "every leaf is an object"

15.1 says every leaf value in DAITE is `{ value, asOf, source, confidence }`,
never a bare number. D-171 kept storage unmoved so sixty engines and
sixty-nine rooms keep reading `asset.valueCents` as a cent figure; turning
each leaf into an object would touch every one of them for no gain in
truth. The intent is that every number carries three facts and one pair of
accessors reads them. So: the leaf stays a bare cent figure, and the three
facts live beside it in `meta.fields[fieldId] = { asOf, source, confidence,
room }`, keyed by the ownership field id whose DAITE path the leaf answers
to (`shared/daite.js` PATHS). `Schema.get(household, pathOrId)` returns the
value; `Schema.meta(household, pathOrId)` returns the facts. Ownership
registers the field map into the schema (`Schema.useFieldMap`), the same
late binding the spine's clock uses (D-056). Logged here as the mapping the
prompt allows when the code's reality disagrees with its letter.

### 15.1 and 15.10 (this commit)

- **Vocabulary.** `Schema.SOURCES`: typed, pasted, imported, screenshot,
  migrated, block-default, quote. `Schema.CONFIDENCES`: sure, roughly,
  unsure, unknown. Rounding by confidence: to the cent when sure, the
  hundred when roughly or unsure, the thousand when unknown.
- **The spine writes the facts.** `save()` already diffed every owned
  field to stamp `meta.confirmedAt` (D-056) and the writing room (D-095);
  it now also writes `meta.fields[id]`. An untagged write is typed, sure,
  as of now. `Spine.tagWrite({ source, confidence, asOf })` marks the NEXT
  save (a paste, an import, a statement date); the tag is spent by one
  save. `Spine.confirm(id)` is the Ledger's Confirm: as of now, sure,
  source kept. `Spine.setFieldMeta(id, patch)` changes the facts without
  the number ("roughly, for now"). A removed value loses its facts.
- **Migration.** On load, once ownership has registered the readers, every
  entered field with no facts gets them: a field the spine stamped since
  D-056 was typed by the person, so typed and sure (roughly when it was a
  one-pager guess, D-094) as of that stamp; a bare value from before that
  is migrated, unknown, as of the migration. `meta.fieldsMigratedAt` says
  when. A file import stamps imported, roughly, as of the file's own date
  for anything the file carried no facts about.
- **Staleness reads asOf** (`shared/staleness.js`): the fact on the number
  first, the D-056 stamp as the same fact for older saves, then the last
  save. `describe()` now also returns `asOf`, `source` and `confidence`.
- **History** already reads the change log (`engines/history.js readLog`
  over `meta.undoStack`, D-094); nothing new is stored. The facts are
  skipped by the undo log like the other stamps.
- **The field-status ledger** (`Ownership.describe`) carries `meta`,
  `level` and a `glyph` (● sure · ◐ roughly · ◔ unsure · ◌ unknown); the
  chip marks any figure that is not sure with the word.
- **Precision follows confidence.** `Schema.precisionOf(h, ids)` gives the
  coarsest confidence across a screen's inputs and the rounding unit;
  `Money.setDisplayRounding(unit)` makes every `formatCents` on the screen
  round to it (`{ exact: true }` opts a figure out). The room template
  (`shared/room.js`) runs it on every paint over the room's registry
  `needs` and its `reads`, and prints one line above the number naming the
  rough inputs, each a link to its row. Rooms off the template keep the
  cent until the Ledger (18) gives them the same line.
- **Refresh** lists rough, unsure, unknown and stale figures first, each
  with its confidence word, age, a Confirm button and its owner room; the
  `where` sentence arrives with 18.2.

### What changed in stored shape (compatibility note)

`meta.fields` (map) and `meta.fieldsMigratedAt` (ISO) are new on
`household.meta`; both are filled by the spine, never by a room. Nothing
else moved. A room that writes through the spine gets the facts for free;
a room that wants to say how a number arrived calls `Spine.tagWrite`
before the write. `Schema.meta(h, id).confidence` is `unknown` for
anything nobody has ever stamped.

Gate for this commit: unit 24926 (a new section of 60 checks: the
accessors, tagged writes, confirm, setFieldMeta, precision and rounding,
staleness, the chip, the migration through import); render on refresh,
real-hourly-wage and the dashboard; dnd 5614; export 25.

### 15.2 Assumptions declared once; every engine real (this commit)

- **The three live in `household.assumptions` and nowhere else.**
  `inflation` (3%), `realWageGrowth` (1% over inflation, new) and
  `returnBands` (the file name `return_bands.json`, new) sit in
  `Schema.ASSUMPTION_DEFAULTS` beside `returnReal`. Settings is the only
  room that writes the two rates, with `−` / `+` buttons in half-point
  steps (no typing; `test/run.js` greps every other room for a write and
  fails on one). The real return is read-only there: it is the median band
  from the table, shown with the low and high and the table's as-of.
- **`expectedReturnRate` is now the real return.** The nominal 7% is retired
  to a constant, `LEGACY_NOMINAL_RETURN`, that is never stored. Every
  engine that reads `assumptions.expectedReturnRate` (tier0, fire, quickmath,
  projection callers) now runs at 5% real without a line of engine code
  changing, which is the point: one number, declared once. A stored 7% from
  before this commit is read as "the default", not as a chosen override
  (`normaliseAssumptions`); a stored 6% or 4% is kept as chosen.
  `resolveAssumptions(h, local, tables)` takes the loaded tables so the
  median band drives the rate when the table says something other than
  the file's 5%.
- **Every projected figure is today's money, said once per screen.**
  `shared/horizon.js` paints one line at the top of a projection room
  (adventure, fire, fire-lab, what-if-life, decumulation) that says every
  figure below is real, names the wage-growth assumption, and carries the
  one toggle. The feature switch `showNominal` (Settings, Horizon group,
  off) turns the line into "future dollars at 3% inflation" and converts
  at DISPLAY time only: `Horizon.display(h, cents, years)` multiplies by
  `(1 + inflation) ^ years` on the way to the screen. No engine output
  changes, nothing is stored, the lens amounts and undo log see real
  figures. Room-template rooms opt in with `horizon: true` on the spec.
- **`Features.ready()`.** A room that only asks `Features.on()` never
  handed the switch table over, so every switch read as its default in
  every room but Settings. `ready()` loads `data/features.json` through
  Reference once; Horizon calls it on mount and repaints.
- **Re-derived on the demo at 5% real:** 22 years to FI (was 19 at 7%
  nominal), FI at 54, the bridge to 59½ is 5.5 years needing $207,900,
  rule of 72 gives 14.4 years, and the $100-a-month habit reaches $90,000
  in 31.3 years. The tests that pinned the 7% figures now pin these,
  each re-derived outside the engines. On the phone walk, FIRE's $945,000
  shows as $1,810,718 in future dollars (945,000 × 1.03²²) and the Long
  Way Round's five-year pot $184,147 as $213,477 (× 1.03⁵).
- **Not a stored-shape change.** `assumptions.realWageGrowth` and
  `assumptions.returnBands` are new keys with defaults; a household
  without them reads the default. A stored `expectedReturnRate` of 0.07
  is rewritten to 0.05 on load, which every room already reads through
  `createHousehold`. Nothing else moved.

Gate for this commit: unit 25110 (a new section of 50 checks: defaults,
legacy normalisation, overrides, the table, Horizon on/off/factor/display,
every projection room carries the line and converts, Settings steps with
buttons, prefs before features in every room); dnd 5614; export 25; render
on the five projection rooms and Settings; Playwright features, settings
and adventure gates; a phone-shaped tap walk through the toggle on FIRE,
Decumulation and the Long Way Round and the steppers in Settings.

### 15.3 Pre-tax and after-tax assets (this commit)

- **Orientation is read, not stored.** The Statement already asks how an
  account is taxed (`asset.taxCharacter`, D-061: pretax, roth, taxable,
  hsa, 529, daf, and `unknown` for a lump typed as one total). The
  prompt's `orientation: pretax | roth | taxable | hsa` is that answer
  under another name, so `Schema.orientationOf(asset)` derives it: a 529
  reads as roth (tax-free out), a donor-advised fund, cash, property and a
  business have no orientation and are worth what they are listed at.
  Where nobody said, the category answers and the result is flagged
  `assumed`: a retirement account is pre-tax, an investment is taxable, an
  uncharacterised lump is taxable (the convention the bridge already used,
  D-064). A second stored field would let the two disagree; the mapping
  rationale at the top of this entry applies.
- **`Schema.afterTaxValue(holding, household, rates)`** is the one formula:
  pretax × (1 − withdrawal rate); roth and hsa × 1; taxable less the gains
  rate on the unrealized gain, where the gain needs `costBasisCents` (the
  Statement's existing box) and 60% of the value stands in when there is
  none, flagged `basis`. A loss owes nothing. No rate for a pre-tax holding
  is an incomplete result naming `withdrawalRate`, never a number.
- **The rate is the bracket at projected FI spending, not today's.**
  `Tax.withdrawalRates(household, tables)`: a year of spending (15.2:
  today's money, so today's brackets) less the standard deduction, walked
  through the federal ladder; the gains rate is the one at the first
  dollar of gains stacked on that. Filing status missing is assumed single
  and said so. `Tax.afterTaxNetWorth` and `Tax.afterTaxInvestmentsCents`
  sum the holdings and carry `listedNetWorthCents`, `deferredTaxCents`,
  the per-asset rows and the assumptions.
- **One view module, four screens.** `shared/aftertax.js` holds the
  switch (`afterTaxNetWorth`, Accuracy, default on), the two-position
  control ("After deferred tax" / "As listed", a preference, default after
  tax when the switch is on, always listed when it is off) and the one
  line: "$X of this is the tax bill you'll pay later, at 12% on pre-tax
  withdrawals at your spending." followed by what was assumed, in words.
  The Statement, the front door's altitude tile, the FIRE Number and the
  Financial Snapshot mount it; the snapshot a person freezes still holds
  the listed figure, so "since last time" compares like with like.
- **FI progress on the after-tax basis.** `Fire.progressToward` takes
  `investmentsCents` and `investmentsBasis` as options and reports the
  basis; only the FIRE room reads the switch and passes the after-tax
  investments in. The line under the bar says which it counted and both
  figures.
- **Re-derived on the demo.** Spending 3,150 a month is 37,800 a year;
  less the 16,100 standard deduction is 21,700 taxable, the 12% bracket;
  gains stacked there are at 0%. The demo's one investment line is
  uncharacterised, so it reads as taxable with an assumed basis, nothing is
  deferred and both figures are 35,900 with the assumptions named. Marked
  pre-tax, 48,000 × 12% = 5,760 is owed later: net worth 30,140 after tax
  beside 35,900 listed, and FI progress counts 42,240 of investments.
- **Not a stored-shape change.** Nothing new is written to the household:
  orientation is derived, the position is a preference, the switch a
  preference. `Schema.FIELDS['asset.taxCharacter']` says so.

Gate for this commit: unit 25236 (a new section of 63 checks: orientation,
the value after tax by hand, the rate at FI spending against today's, the
demo listed and pre-tax, FI progress on both bases, the view and the
switch, every screen mounts the control, no room stores an orientation);
dnd 5614; export 25; render on statement, dashboard, fire and
financial-snapshot; `test/aftertax.js`, a phone-shaped gate that marks the
demo's investment pre-tax and taps through the control on all four screens
and switches the feature off.

### 15.4 Income by type (this commit)

- **Seven types on the source that already exists.** `income.sources[]`
  in the prompt is the DAITE view of `people[].incomeSources` (D-171), so
  the type lives there: `incomeSource.type` grows from two values to
  `w2 | 1099 | passive | benefit | pension | socialSecurity`, plus
  `equity` (RSUs, stock pay), which the situation switch `equityComp`
  already read (D-180) and which is taxed as wages and stops with the
  job. A value from before reads as it was; anything unknown is a job.
- **What survives a job loss is derived, and the person can say
  otherwise.** `Schema.survivesJobLoss(source)`: a W-2 job and equity pay
  stop; contract work, rent and dividends, a benefit, a pension and Social
  Security keep paying. `incomeSource.survivesJobLoss` is null until the
  person taps the other answer in Start Here (tapping the derived answer
  again clears the override, so the stored field stays "said", never
  "restated"). `Schema.survivingGrossAnnualIncomeCents(h)` is ok(0) when
  everything stops and incomplete only when no income is known.
- **Every job-loss shock zeroes only what does not survive.** The Long
  Way Round's baseline carries `survivingAnnualIncomeCents` (the
  surviving share of take-home) and the job-loss year keeps it; Between
  Jobs keeps your own surviving sources as "other income" beside a
  partner's pay; Runway defaults its other-income box to the same figure
  as a month of take-home. `data/levers.json` already said which levers
  survive (D-174); the sources now say it too.
- **Take-home per source: `Tax.takeHomeBySource(household, tables)`.** A
  W-2 job pays FICA and ordinary tax; contract work pays self-employment
  tax with half deducted; passive income is ordinary unless
  `passiveTreatment: qualified`, which stacks as gains; a benefit and a
  pension are ordinary with no payroll tax; Social Security is taken as
  85% taxable (the most it can be) and said so. The ordinary tax is
  computed once on the pool and shared out in proportion, so the rows sum
  to the whole. The Income room shows the table read-only ("Your pay,
  source by source"); the household take-home that every savings figure
  starts from (`Schema.takeHomeAnnualCents`, the effective-rate lookup,
  D-171) is unchanged this commit: switching it to the per-source sum
  moves every savings-rate figure and is a change to make on its own, with
  its own re-derivation, not inside this one.
- **Real Hourly Wage, source by source.** `Hourly.realHourlyWage` returns
  `perSource[]` once a person has two or more sources: each one's headline
  and after-tax rate from its own `hoursPerWeek` (the main job borrows the
  work profile's paid hours; a source with no hours has no rate, and says
  so). The room paints one line under the number.
- **Re-derived on the demo plus rent and a side contract.** Pool 72,000 +
  12,000 + (6,000 less half the SE tax of 847.77) = 89,576.11; less the
  standard deduction 73,476 taxable; 10,876.74 of ordinary tax shared by
  what each put in; FICA 5,508 on the wages; SE tax 847.77 on the
  contract. Rent and the contract are 18,000 of 90,000, a fifth, and that
  fifth of take-home is what the Long Way Round keeps in the job-loss
  year.
- **A bare legacy value now migrates as roughly, not unknown (supersedes
  the 15.1 wording above).** The phone forms gate seeds a household the
  way a pre-15.1 save looks (raw JSON, no stamps) and every Room-template
  figure came back rounded to the thousand: a $14,500 cash-out cost read
  as $15,000, a $1,200 giving target as $1,000. Somebody typed those
  numbers once, so `migrateFieldMeta` stamps them `migrated` / `roughly`
  (rounded to the hundred) and the Refresh room still lists them to
  confirm; `unknown` is kept for a number nobody typed. One line in
  `shared/spine-v2.js`; the 15.1 tests already read migrated fields as
  roughly through the import path.
- **What the person typed is shown as typed.** The same gate found the
  Real Hourly Wage undo entry reading "Costs of working, a month → $700"
  for a typed $650: the room's confidence rounding (15.10) had reached the
  undo label, the input boxes and the owned-value chips. Those three are
  records of what was entered, never derived figures, so the room
  template's input display and undo label and the ownership chip's money
  format now pass `exact: true`. The headline, the chart and the lens
  amounts keep rounding to the least confident input, as 15.10 says.
- **Compatibility note.** Two new keys on an income source,
  `survivesJobLoss` (null) and `passiveTreatment` (null), both with
  defaults; `type` accepts five more values. A household saved before this
  commit reads exactly as it did. Start Here writes the type and the
  override through `Spine.upsertIncomeSource`; no other room writes them.

Gate for this commit: unit 25370 (a new section of 58 checks: the types,
what survives, take-home per source by hand, Social Security and
qualified income, Between Jobs and the Long Way Round in the job-loss
year, a wage per source, the rooms); dnd 5614; export 25; render on start,
income, real-hourly-wage, runway, between-jobs and adventure; the phone
forms gate; a phone-shaped tap walk through the chips in Start Here and the
tables in the Income and Real Hourly Wage rooms.

### 15.5 Recurring, annual and one-off lines (this commit)

- **Cadence is read, not stored.** Every line already says what it is: a
  bucket is a month, a logged entry has a `period` (monthly or once), a
  ledger income entry a `frequency`. `Schema.cadenceOf(record)` reads
  `monthly | annual | oneoff` off that; the one line that carries the
  word itself is the new yearly line. A second stored field on every
  entry would be a copy that can drift (the mapping rationale above).
- **`expenses.annual[]`: the named yearly costs.** `{ id, label,
  bucket, amountCents (a year), monthDue (1 to 12, or null = spread
  only), cadence: 'annual' }`, owned by Cash Flow, written through
  `Spine.upsertAnnualLine` / `removeAnnualLine`. Kept apart from the log
  (`entries`) so nothing counts twice, and apart from the four typed
  numbers so those stay four numbers.
- **A twelfth joins its bucket everywhere.** `Schema.fat` adds each
  line's twelfth to the bucket it sits in and says which part is yearly
  (`annualMonthlyCents`); a bucket with only a yearly line is that
  twelfth, source `annual`. `monthlyExpensesCents`, the budget, the FIRE
  number, the runway and every lens read the month through `fat`, so all
  of them carry it without a line of their own changing.
- **Everywhere but the Money Calendar.** `Cal.month` draws each line on
  the 1st of its month, for the whole year of it, marked estimated (the
  day within the month is not known), and takes the twelfth back out of
  the month's spread, so the calendar shows the lump and not the lump
  plus its twelfth. A line with no month is spread only.
- **The switch `annualLines` (Accuracy, default on)** folds the lines
  away: off, `Schema.annualMonthlyCents(h).on` is false and nothing
  counts them. A room that never loaded the switch table reads the
  default (on); Cash Flow loads it through `Features.ready()`.
- **The fold in Cash Flow: "Also once a year".** Under the four numbers,
  a list of the lines (name, bucket, month, a year and a twelfth) with
  Remove, and one form built once: what it is, a year of it, four bucket
  chips, the month it is paid, Add. A yearly cost needs a name, so the
  name is typed; everything else is a tap.
- **The sinking fund is a lens, not a field.** `sinkingfund` in the
  budgeting domain: the yearly lines over twelve, "Set aside $150 a
  month so nothing surprises you: 2 yearly costs, $1,800 a year." No band:
  it states, it does not judge. Thirty-four lenses now.
- **Re-derived on the demo.** Car insurance 1,200 a year in March, gifts
  600 in December: getting around 220 + 100 = 320, everything else 720 +
  50 = 770, the month 3,150 + 150 = 3,300; a February window finds the
  insurance on 1 March for 1,200 and spreads 3,300 − 150 less the listed
  bills; a May window finds nothing; the lens says $150 a month.
- **Compatibility note.** `expenses.annual` is a new list, empty by
  default; a household saved before this commit reads as it did. Cash
  Flow is the only writer.

Gate for this commit: unit 25464 (a new section of 43 checks: cadence on
every kind of line, the constructor, the buckets with and without a typed
month, the switch off, the calendar in a month with and without a line,
the lens, the rooms); dnd 5614; export 25; render on cash-flow, calendar
and budget; the phone forms gate for Cash Flow with a new case that types
a yearly cost into the fold and taps its bucket and month.

### 15.6 State (this commit)

- **One state table, sourced a column at a time.** `data/states.json` is
  lane 2's section-3 table (L-3), adopted whole: fifty states, DC and one
  `OTHER` row for outside the US; the five columns the prompt names
  (income tax type and top rate, effective property tax rate, median
  infant childcare a month, full-coverage auto insurance a year, the MERIC
  cost-of-living index) plus the UI weekly cap and weeks and the ACA
  benchmark premium, each column with its source URL and as-of, each cell
  `{ value, asOf, source, confidence, verify?, stale? }`. Most cells are
  recalled from the named source and say `verify: true`; the file as a
  whole is `unverified` and `docs/data-refresh-calendar.md` (lane 2) says
  which month to check each column and against what. The childcare column
  agrees cell for cell with `data/childcare_by_state.json`, which now
  keeps only the national figure to fall back on.
- **One reader.** `Schema.stateCell(tables, code, column)` returns the
  cell with the row's name, or null for no state, no table, or `OTHER`;
  `Schema.statesByCode(tables)` is the code-keyed view of plain values the
  block expansions look up. Tax already keyed the brackets file on the
  state; Housing Decision now takes the state's property tax rate over the
  national convention and says whose figure it is; Kids and Tuition prices
  childcare from the table first; What A Car Costs lists the state's
  insurance average in its assumptions, with "your own quote beats it".
- **The blocks keep no copy.** `data/blocks/geo.json` carried its own
  cost-of-living map and `data/blocks/home.json` its own property-tax map,
  both recalled, and they disagreed with the sourced table in most cells
  (Illinois 2.08% against 1.95%). Both now look up `statesByCode`, which
  `shared/blocks.js` derives from the loaded state table; the maps are
  gone. The home block's Illinois test moves to 1.95%.
- **ZIP is optional, in Fine-tune.** `household.zip`, five digits or null,
  asked under Fine-tune in Start Here as "ZIP, if you like", owned by Start
  Here (`taxes.zip` in the DAITE view). Nothing reads it yet: it is kept
  for a finer-than-state table, and the note beside the box says so. The
  state itself was already question three's neighbour, beside the birth
  date in the first card.
- **Compatibility note.** `household.zip` is a new nullable key; a
  household without it reads as before. `data/states.json` changes shape
  (rows gain sourced cells; `code` and `name` stay), and the one place
  that read it, Start Here's select, reads only those two.

Gate for this commit: unit 25510 (a new section of 37 checks: the table's
shape and sourcing, stateCell and the view, housing in a state and with
none, childcare from the table, the two blocks, the ZIP, the rooms);
dnd 5611 to 5614 (its count moves by three between runs with nothing changed,
every check passing; not this commit's to chase); export 25;
render on start, housing, kids and car; the phone
forms gate for Start Here; a tap walk that types a ZIP into Fine-tune.

### 15.7 A household of two, natively (this commit)

- **`people[]` already was the household.** One or two adults, each with
  their own income sources, work profile and unemployment record; assets
  and debts carry `ownerIds`; the Partner room already read
  `Schema.adults(h)[1]` and the tax engine the household filing status. So
  15.7 is mostly names for what exists, and one move.
- **`name` is `label`, `birthYear` is read off `dob`.** `createPerson`
  accepts `name` and stores `label`; `Schema.birthYearOf(person)` reads
  the year off the date Start Here asks (month and year), and a person
  given only a year is dated 1 July of it, the expected midpoint. A second
  stored year beside the date would drift (the mapping rationale above).
- **Filing words.** `single | mfj | mfs | hoh` are accepted on the way in
  and stored as `single | married_joint | married_separate |
  head_of_household`, the values every bracket table keys on
  (`Schema.FILING_ALIASES`). The tax engine reads the stored value.
- **`owner: personId | joint`** is accepted on assets and debts and read
  back by `Schema.ownerOf`: one id is that person's, none or two is joint.
  `ownerIds` stays the store.
- **The Partner room edits `people[1]`.** Two new inputs on the person
  record, never in a room of their own: "What to call them" (the room
  template gains a `text` kind, since a name is words) and "The year they
  were born" (kept to the day when a date already exists). Ownership rows
  `partnerName` and `partnerDob` (owner Partner, `you.partner` in the
  DAITE view) apply only when two adults exist. Start Here's partner card
  loses its name box and points at Partner; it keeps their pay and working
  situation, which it owns. The old `partner.splitMode` /
  `sharedMonthlyCents` plan stays where it was: it is a plan for the
  shared month, not a person.
- **Labelled when two, unlabelled when one.** `Schema.householdOfTwo(h)`
  and `Schema.personTag(h, person)`: the name beside a per-person figure
  once there are two adults, nothing with one. The Income room's
  source-by-source table tags each row; the Partner engine already
  labelled its two columns; Real Hourly Wage is per person by design. A
  single-person household never sees a second person mentioned until Start
  Here's "Two of us" or the Partner room adds one; the marriage block
  stays a set of DAITE lines (D-178) and adds no person.
- **Compatibility note.** No stored key changes. `filingStatus` accepts
  four more spellings; `createPerson` accepts `name` and `birthYear`;
  `createAsset` / `createDebt` accept `owner`. The Start Here writer
  `partnerLabel` is gone; Partner writes the label instead.

Gate for this commit: unit 25662 (a new section of 39 checks: the views,
the aliases through the tax engine, the owner, one adult against two, the
Partner room's inputs and writes, Start Here's hand-off, the template's
text kind); dnd 5611 to 5614; export 25; render on partner, start and
income; the phone forms gate for Start Here and Partner; a tap walk that
adds the second of you in Start Here, names them in Partner, and sees the
name beside their pay in the Income room.

### 15.8 Liquidity tiers, and one runway function (this commit)

- **Five piles, read off what is already asked.** `cash | taxable |
  retirement | property | other`. `Schema.tierOf(asset)` reads the pile
  from the tax character the Statement asks for (pre-tax, Roth, HSA and a
  lump entered as one total are retirement; a 529 and a donor fund are
  other, since they are not yours to spend; a business is other), else
  from the category (investment is taxable, real estate is property, a
  vehicle is other), and an uncharacterised other thing the owner flagged
  liquid draws with the taxable pile. A stored `asset.tier` is the
  override, written only by the Statement's pile select; null means
  derived. The justification for the one new field: a runway has to know
  which pile a thing is in, and the tax character alone cannot say that a
  brokerage account is earmarked, or that a plot of land will be sold.
- **One draw, one function.** `Schema.runwayMonths(household, drawOrder,
  opts)` draws the piles in order (default cash, taxable, retirement,
  never property or other), each step net of what leaves on the way out:
  taxable pays the gains rate on the unrealized gain (cost basis, or 60% of
  the value standing in and flagged, as 15.3); retirement pays the
  withdrawal rate and, below the access age, the statute penalty (10%
  pre-tax and on Roth earnings, 20% HSA); a Roth's basis comes out free
  and past the gate a Roth owes nothing. The rates are the marginal
  bracket at projected FI spending (`Tax.withdrawalRates`, 15.3), passed
  by the room; with none, the draw is before tax and `taxApplied` says so.
  No date of birth means the gate is assumed shut and `assumed` carries
  `age`. `Schema.tierDraws` is the same walk without the spending, for a
  caller that wants cents, not months.
- **Every runway reads it.** `Runway.project` carries `meta.tiers` at the
  scenario's outflow and the room prints one line behind the cushion,
  each step with its tax and penalty in words ("15 months more from
  taxable investments ($48,000, no tax on the gain at your rate)").
  Between Jobs hands the rates through and prints the same line after the
  benefit. The Long Way Round's job loss now goes cash, then the taxable
  pile (sold, grossed up for the gains tax when rates are passed; the
  split between taxable and retirement is today's and held for the run,
  and with nothing invested today the run's own saving is taxable money),
  then borrowing; retirement money is never sold in the five years, and
  the year row says what was sold and whether before or net of tax. The
  Dungeons & Dividends HP reads `runwayMonths` with the order cash,
  taxable: the money you can reach without a penalty, before tax, said on
  the card (DD-029 below).
- **The Statement's ladder is a view of the piles.** Cash today, taxable
  within a month, retirement within a year once its access age is
  reached (a Roth's basis at any age), property and other never. The
  liquidity rating no longer drives it: `asset.liquidity` stays in the
  stored shape for compatibility and nothing writes it any more; the
  select on each asset became the pile, and the `liquid` flag follows the
  pile so every older reader of the flag agrees. The result keeps its
  bands and cumulative shape (Every Ratio reads them unchanged) and gains
  `byTier` and `overriddenCount` in place of `unratedCount`.
- **Compatibility note.** `createAsset` gains `tier` (null = derived);
  every asset stored before this commit reads as derived. The Statement no
  longer writes `asset.liquidity`; the value stays where it is and
  `Schema.assetLiquidity` still reads it for any room that asks. The D&D
  store now writes the investments lump with `taxCharacter: 'unknown'`
  (one total, not split), and the four pregens carry the same, so the
  lump sits in the retirement pile as it does in SPARKS. `Runway.project`
  and `BetweenJobs.plan` accept `rates`; `Adventure.run` accepts `rates`
  and reports `taxableTaxApplied`; the year rows gain `investmentMonths`
  and `investmentsSoldCents`.

Gate for this commit: unit 25842 (a new section of 77 checks: the pile
per kind, the draw at each step re-derived by hand on the rich fixture at
32 and at 60, the one function's steps and its readers; the ladder and
job-loss tests re-derived for the tier draw); dnd 5611 to 5614; export
25; render on statement, runway, between-jobs and adventure; the phone
forms gate for the Statement (the pile select stores the override and
moves the flag); the adventure gate; a phone walk that reads the line
behind the cushion in Runway, the same line in Between Jobs as someone
between jobs, the ladder's four rungs and the pile selects on the
Statement, with no console errors.

### 15.9 Age and the inflection dates (this commit)

- **One table, ten rows, every row sourced.** `data/milestones.json`
  (lane 2's table, L-3, now read): 50 (catch-up), 55 (the rule of 55; the
  HSA catch-up), 59 and a half (the penalty ends), 60 to 63 (the higher
  catch-up), 62 (Social Security, early), 65 (Medicare), the full
  retirement age and the RMD age (both by birth year, transcribed from
  the SSA table and SECURE 2.0), 70 (delayed credits stop). Each row
  carries the rule in words, its statute or agency page, a citation, an
  as-of and `sourced`. Nothing in code knows an age by heart: the
  59-and-a-half the runway function uses for the penalty gate is the
  access_rules table's, and the milestones are this one's.
- **`Schema.milestones(person, table)`** dates the list for one person:
  the age (59.5 for 59 and 6 months), the date from their date of birth,
  the years from now, the rule and source. The two birth-year rows
  resolve from `Schema.birthYearOf`; with no birth year the
  1960-and-later row stands in and the row says `assumed`. `birthYear`
  is already asked by Start Here (15.7), so nothing new is asked.
- **Every timeline draws them.** `Schema.milestoneMarks(household,
  table, { axis, from, to })` turns the list into chart marks on an age,
  years-from-now or months-from-now axis, clipped to the chart's range,
  two rules at one age sharing one mark; `Charts.area` draws a mark
  flagged `faint` as a dotted line behind the event marks, its short
  label at the foot and the rule as the hover title. The Long Way Round
  (five years), Drawing It Down (to the plan age), the FIRE chart (by
  age) and What Comes Next (thirty years of months) all concatenate the
  marks into their existing `vLines`; the planner strip and the tree map
  the brief also names do not exist yet (sections 11 and 12, Phase D) and
  will read the same function when they do. Behind the `showMilestones`
  switch (Horizon group, default on, declared in 15.2's table); off, the
  function returns nothing and the rooms draw as before.
- **Drawing It Down's phases are the milestones.** `Decumulation.plan`
  gains `meta.phases`: from now to the first milestone inside the
  horizon, then one phase per milestone crossed, each with its ages and
  years. Nothing arithmetical changes at a boundary here (the draw is
  the draw); the phases name where the rules change, and the room says
  so in one sentence limited to the ages that matter to a draw ("the
  penalty ends at 59 and a half (year 3.5), Social Security can start at
  62 (year 6), Medicare at 65 (year 9)…"), not the catch-ups.
- **Compatibility note.** No stored key changes. `Reference.TABLE_FILES`
  gains `milestones`; What Comes Next now loads `shared/features.js` and
  the milestones table after its first paint and repaints once. The
  Long Way Round's chart marks and Drawing It Down's chart marks are
  additive; `Decumulation.plan` gains `phases` (empty with no table).

Gate for this commit: unit 25950 (a new section of 48 checks: the table,
the list for someone born 1990, 1957, 1955 and 1950 against the SSA and
SECURE 2.0 tables, no date of birth, the marks per axis and their
clipping, merging and switch, the faint mark in the chart, the phases
on a retiree at 56, and the four rooms' wiring); dnd 5614; export 25;
render on adventure, decumulation, fire and timeline; the adventure gate;
a phone walk at 32 and at 56 that reads the marks on all four charts
(the FIRE chart's nine, the Long Way Round's two inside five years, the
thirty-year timeline's five, Drawing It Down's seven with its phase
sentence) and sees them vanish with the switch off, with no console
errors but the favicon the site has never had.

### The section 15 gate, and PHASE_A_DONE

The ten shapes are in: 15.1 and 15.10 (as-of, source and confidence on
every owned number), 15.2 (assumptions declared once, real by default),
15.3 (orientation and the value after deferred tax), 15.4 (income by
type), 15.5 (cadence, the yearly lines), 15.6 (one state table), 15.7 (a
household of two), 15.8 (five piles, one runway), 15.9 (the ages where a
rule changes). The gate the brief asks for, all three parts:

- **Schema tests for each shape**: one named unit section per shape, and
  the gate section checks they are there by name.
- **Migration to the cent**: the pre-spine flat profile (lane 2's
  corpus fixture, `annualSalary` 62,000 and a 22,000 loan at 5.3) comes
  through `Spine._migrateLegacy` and the dashboard reads 6,200,000 and
  2,200,000 cents; and a household saved before Phase A (no assumptions,
  no field meta, no zip, no annual lines, no income types, no piles)
  read through `Schema.createHousehold` renders every dashboard number
  (gross, take-home, spending, debt, assets, investments, cash, net
  worth, savings rate, the FI number, the runway) to the cent the same as
  the household built today, with the new shapes at their empty meaning.
- **Playwright**: `test/aftertax.js` taps the two-position control on The
  Statement and reads net worth change from 30,140 to 35,900 and back;
  `test/adventure.js` sets a 56-year-old and reads the two milestone marks
  inside five years on The Long Way Round, each with its rule on hover.

Section 14 (the removal list) was worked through under D-179 and D-180
before these; nothing on it is left. Unit 26016, dnd 5614, export 25, the
two Playwright gates above, all green at this commit.

PHASE_A_DONE

The next commits rebase and merge `lane2` (the corpus, the property
tests, the sourced tables already consumed by 15.6 and 15.9, the gloss
dictionary, the migration corpus and the accessibility report), then
Phase B: sections 18, 19 and 20.
## L-1 - Lane 2, section 1: the synthetic household corpus

### What it is

The second lane (branch `lane2`) runs beside the master build and touches
only `tests/`, `data/`, `docs/`, `fixtures/` and the glossary. Its entries
are the L-series so they never collide with the D-series; `test/run.js`
checks only `D-`/`DD-` headings, so an `L-` heading above the divider is
not a malformed entry. This is the first.

`fixtures/households/` holds 24 archetype households and, under `edge/`,
six edge cases, every one in the current spine v2 shape because every one
is generated through `Schema.createHousehold` by
`tests/tools/build-households.js`. Nothing in a fixture is typed by hand
except the spec it came from, and the spec is in that file with the
figures in dollars. Each fixture's `meta` carries `name`, `story`, a
guessed `sphere`, and `known`: gross, the effective band read by eye from
`data/effective_tax_rates_2026.json`, estimated tax, take-home a year and
a month, monthly spending, the savings rate excluding match, the FI target
at 4%, runway in months (cash over spending, both fractional and whole),
net worth, and `working`, the arithmetic written out line by line so a
reviewer can check it with a pencil.

`tests/corpus.test.js` loads every fixture, checks the schema version and
the meta, then sweeps every exported engine function whose first
parameter is `household` (226 functions across 62 engines, 6780 calls),
supplying tables by parameter name and recording a throw as a failure
only when every argument was real. It walks every result for NaN and
Infinity, asserts no negative tax, spending, asset total, debt total,
emergency-fund months, DTI, FI number, years to FI or runway, and
compares the ten known values within 1% (or the same incompleteness).
Disagreements go to `docs/lane2-findings.md`, which the test regenerates
on every run; a fixture is never edited to match an engine.

### Why

The engines had unit tests written by the same hands that wrote the
formulas, against one demo persona. A corpus of thirty households with
independently computed expectations is the cheapest way to find a formula
that agrees with itself and not with arithmetic, and the sweep finds the
crash a room would only hit on a household nobody had tried.

### What it found

Nothing, on the first run: every known value agrees with the engine and
no household-first function throws, returns NaN, or returns a forbidden
negative. The one throw on the way was the harness passing debt rules to
`statement.portfolios`, which takes access rules. Twelve functions need a
skill, a goal, an offer or a block and are listed in the findings file
for section 2 to feed. Three tables `test/run.js` loads by hand are not in
`Reference.TABLE_FILES`; that is P-2 in `docs/lane2-proposals.md`.

### Decisions taken conservatively (DECIDE: for Eli)

- Known-value disagreements write to the findings file and do not fail
  the run unless `CORPUS_STRICT=1`: the other lane should not go red on a
  list it has not read. Throws, NaN and negatives always fail.
- The `sphere` on each fixture is a guess against section 19 of the
  master prompt; spheres.json does not exist yet.
- The repo has no CI, so "runs in CI" is a workflow proposal (P-1), not a
  workflow.
- `tests/package.json` is un-ignored by `tests/.gitignore` because the
  root `.gitignore` hides every package.json; fast-check is for section
  2 and `node tests/corpus.test.js` needs nothing installed.

### Compatibility

No stored shape changed. The fixtures are read by tests only; no room
loads them. A future section that changes the shape (the master build's
section 15) regenerates the corpus with `node tests/tools/build-households.js`
after updating the builder, and the migration corpus (section 5) keeps a
copy of today's shape.

---

## L-2 - Lane 2, section 2: property tests on every engine

### What it is

`tests/properties/<engine>.test.js`, one per file under `engines/` (64),
plus `levers.test.js` and `blocks.test.js` for the two shared modules the
invariants name, on fast-check 4 (`tests/package.json`; `npm ci` in
`tests/`). `_harness.js` builds random valid households through
`Schema.createHousehold` from a compact spec in dollars, so a shrunk
counterexample is a spec a person can read; `run.js` runs every file with
seed 20260910 and 100 cases per property, writes
`tests/reports/properties.json`, and `tests/tools/findings.js` renders
`docs/lane2-findings.md` from that report and the corpus report together.
The whole suite runs in about fifteen seconds.

Every engine is held to four generic properties: no throw and no NaN or
Infinity on any valid household; the same output for the same input
twice; the household passed in byte-identical afterwards; and no field
ending in `Cents` carrying a fraction. Twenty-two files add the
invariants the lane prompt lists: savings never above take-home and
take-home never above gross (tier0); FI target rising with spending and
the FI date never earlier when spending rises or income falls (tier0,
fire); runway blind to property and vehicles, falling with cash, whole
months within the horizon (runway); confidence-weighted net worth never
above plain, and portfolios adding up to every valued asset (statement);
future value and years-to-target monotone, a level payment repaying its
principal (projection, housing); avalanche never dearer than snowball and
extra never slower (debt); tax monotone and bounded (tax, selfemployed);
a headwind never ending with a bigger pot net of borrowing (adventure);
lump beating spread when the market rate is at least the cash rate
(windfall); PIA and claiming factors monotone (ss); VPW percentages in
(0, 1] and rising with age (vpw); a lever leaving its input untouched and
scale 0 changing nothing (levers); two additive blocks equal to the sum
of each alone and no blocks changing nothing (blocks).

### What it found

Six failing properties, each with its shrunk spec in the findings file:

- `Tier0.debtToIncome` reports `monthlyGrossIncomeCents` as gross / 12
  unrounded; `ratios.all` carries the same figure. `skills.available`
  reports `returnOnEffortCents` with a fraction.
- `Projection.levelPaymentCents` rounds the payment to the cent, so on a
  tiny principal (100 cents over 41 months at 0%) the total paid falls
  short and `totalInterestCents` goes negative.
- `Blocks.applyAll` on a household with no income source creates the
  source it needs with a random `Schema.newId`, so two applications differ
  in an id; every number matches.
- The Long Way Round's job-loss shock on a household already in deficit
  borrows less in the shock year than the shortfall, so the headwind ends
  with more net than no headwind. Small figures in the shrunk case, wrong
  sign.

None is fixed here: the engines are the master build's files.

### What could not be held yet

After-tax value of a holding and rounding by confidence wait for section
15's shapes; sequence of returns waits for an engine that takes a return
path (every one today takes a constant rate). Each is a note in the
findings file and in the engine's property file, so the property is
written the day the shape lands. `ratios.context()` reads `Date.now()`
when `opts.now` is absent; the suite passes a fixed clock and says so.

### Decisions taken conservatively (DECIDE: for Eli)

- A failing property writes to the findings file and does not fail the
  run unless `CORPUS_STRICT=1`, the same choice as L-1. A missing property
  file, or a run over two minutes, always fails.
- The seed is fixed so the report is reproducible and diffable; `FC_SEED`
  and `FC_RUNS` override it for a wider search.

### Compatibility

Nothing stored changed. `tests/reports/*.json` are committed as the
record the findings file is rendered from.

---

## L-3 - Lane 2, section 3: sourced data tables

### What it is

Eight reference tables under `data/`, each cell an object
`{ value, asOf, source, confidence }` where `source` is a URL and
`confidence` is `sourced` (read from a search result quoting the primary
source), `recalled` (from memory of the named edition, rounded, with
`verify: true`) or `convention`. Each file carries a top-level `refresh`
note; `docs/data-refresh-calendar.md` is the same information as one
calendar. The five new files live under `data/lane2/` for now: test/run.js
requires every `data/*.json` to be registered in `Reference.TABLE_FILES`,
which is outside this lane, so P-5 asks the master build to move and
register them (`states.json`, `return_bands.json` and `bands.json` are
already registered and stay in `data/`). `tests/tools/build-data-tables.js` generates the six new or
extended files from compact hand-kept tables and annotates the two
existing ones, so a refresh is one edit in that script and one run.

- `states.json`: the fifty states, DC and `OTHER` (the shape Start Here
  renders) with seven columns per state: income tax type and top rate
  (the schedule stays in `state_brackets_2026.json`, one copy), effective
  property tax rate, infant centre care a month, full-coverage auto
  insurance a year, cost of living index, UI weekly maximum and maximum
  weeks, ACA benchmark silver premium for a 40-year-old.
- `milestones.json`: 50 catch-up, 55 HSA catch-up and rule of 55, 60 to
  63 higher catch-up, 59 and a half, 62, 65 Medicare, full retirement age
  by birth year, 70, RMD age by birth year, each with rule text and
  citation.
- `aca.json`: 2025 and 2026 poverty guidelines (contiguous, Alaska,
  Hawaii), the 2025 enhanced and 2026 current-law applicable percentage
  tables, and the change date (the enhancement expired 2025-12-31).
- `studentloans.json`: standard, tiered standard, IBR (2009 and 2014),
  PAYE, ICR, SAVE and RAP with share, poverty multiplier, forgiveness
  horizon, PSLF eligibility, status as of the 2026-07-01 transition, and
  the tax treatment of forgiveness (IRC 108(f)(5) sunset).
- `contribution_limits.json`: 401(k), catch-ups (50+, 60 to 63), 415(c),
  SIMPLE, IRA, Roth and deduction phase-outs, HSA, gift exclusion and the
  529 five-year election, 2026 and 2025.
- `tax_brackets.json`: brackets, standard deductions, capital gains
  thresholds, NIIT, FICA and SE rates and wage bases, 2026 and 2025.
- `return_bands.json`: the series and window named (Global Investment
  Returns Yearbook; Shiller ten-year windows), values unchanged, a
  DECIDE: on whether to move the median.
- `bands.json`: chapter-level citations for Set for Life, the Money Guy
  rules and All Your Worth, and `slafProposed` (the trench figures)
  beside the live `slaf` values.

`tests/data.test.js` (3957 checks): every cell has a URL and a date; no
cell older than 18 months unless `historical` (a closed prior year) or
`stale` with a DECIDE:; every state and every column filled; brackets
monotonic, state schedules monotonic, capital gains ordered; FPL rising
with size and year; and agreement with the copies the engines read
today, reported as notes.

### What it found

The test caught one error in the new table itself (head-of-household
32% top, $256,200, corrected) and four places the engines' copies are
behind: the 415(c) limit ($70,000 carried from the FOO room, $72,000 for
2026), the 2026 top ACA percentage (8.66% vs 9.96% under Rev. Proc.
2025-25), Ohio's flat tax (the engine schedule is the 2025 edition), and
27 UI maxima. Each is a row in `docs/lane2-proposals.md` P-3.

### The honest limit

This session could search the web but could not open a page (the egress
proxy blocks every fetch), so most cells, and nearly every state cell,
are `recalled` and marked `verify: true`. The sourced cells are the ones
a search result quoted directly. The first pass through the refresh
calendar should be a full one.

### Decisions taken conservatively (DECIDE: for Eli)

- `bands.json` `slaf` values are unchanged; the trench copy the lane asked
  for sits in `slafProposed` because `test/run.js` pins the slaf
  retirement row (15% of gross, not converted).
- Prior-year rows are exempt from the 18-month rule as `historical`; the
  childcare column (2023 edition) is marked `stale` rather than dated
  falsely (P-4).
- No engine was pointed at a new table; the old copies stay and the test
  keeps them honest (P-3).

### Compatibility

`states.json` keeps `states[].code` and `states[].name` exactly as Start
Here reads them and `OTHER` last; the new per-state fields are objects a
select ignores. `return_bands.json` and `bands.json` gained keys only.
Nothing an engine reads changed value.

---

## L-4 - Lane 2, section 4: the gloss dictionary and the lookup sentences

### What it is

`shared/glossary.json`: 258 terms the rooms and engines put on screen,
each with `term`, `also` (other spellings and the long form), `domain`
and `plain`, one sentence a reader with no finance background can
follow. The list came from grepping `rooms/*.html` and `engines/*.js`
for acronyms and capitalised phrases, plus the words a coaching client
has to ask about. `shared/glossary.js` (`SLAF.Glossary`) is the one way
anything reads it: `get(term)` matches the term or any alias without
regard to case; `find(text)` lists the terms a piece of text uses;
`terms()`; `load(basePath)` fetches the JSON in a browser; and
`mark(root, opts)` wraps the first occurrence of each term inside a root
element in `<abbr class="slaf-gloss" title="…" tabindex="0">`, skipping
links, inputs, buttons, code and anything marked `data-no-gloss`, so a
hover (a long press on a phone) shows the sentence. Nothing loads it: P-6
in `docs/lane2-proposals.md` gives the script tag, the `room.js` call
and the two lines of CSS.

`data/lane2/ledger-rows.where.json`: 41 lookup-kind rows in the section
18.2 shape (`path`, `letter`, `label`, `kind`) with a `where` sentence
(the document or screen and the line), an `ifMissing` (what to do when
it is not there) and a `roughly` (what to type for now), written to be
followed on a phone. `data/lane2/lenses.copy.json`: for all 33 lenses,
`forWhom` and `notForWhom` with no hedging word (four of the master
build's sentences rewritten, the rest copied) and a structured source
(kind, title, author, url, where).

`tests/glossary.test.js` (3061 checks): at least 150 entries; no
definition contains its own term or an alias as a whole word; one
sentence, under 40 words, no em dash; the file's Flesch-Kincaid grade at
or under 8 (7.2 measured); every term and alias resolves through `get`;
`find` sees terms and not substrings; `mark` wraps once per term and
leaves links alone, on a small DOM stand-in; every lookup row the lane
lists has a `where`; every lens has both sentences, no hedge word, a
sourced URL.

### Decisions taken conservatively (DECIDE: for Eli)

- The glossary is not wired into any room; P-6 is the exact change.
- `data/lenses.json` is untouched; the dehedged sentences live in the
  copy file and P-7 offers two ways to reconcile them.
- Three aliases collide across entries (cliff, FAT, percentile); `get`
  returns the first and the test reports it rather than failing, since
  each is right in its own context.
- The two data files sit under `data/lane2/` for the registration
  reason in L-3 (P-5).

### Compatibility

Two new files under `shared/` that nothing loads yet; `shared/glossary.js`
requires nothing and writes nothing. No stored shape changed.

---

## L-5 - Lane 2, section 5: the migration corpus

### What it is

`fixtures/exports/`: one set of files per export format the app has
produced, rebuilt from git by `tests/tools/build-exports.js`. The script
lists every commit that touched `shared/spine-v2.js`, `shared/schema.js`
or `shared/money.js` (64), checks each one's `shared/` and `data/` out
with `git archive`, and in a child process builds seven of the section 1
households through THAT version's `Schema.createHousehold` (the builder
from L-1 takes a schema module), writes them into that version's spine
with `updateProfile`, and exports with that version's `Spine.exportJSON`
or, before 2026-09-04 when the export did not exist, the stored
household blob. A format is kept when the household's shape (its sorted
key paths, ids and dates ignored) differs from the last one kept: 40
formats, 70 files, named `<date>-<hash>-<household>.json`, each carrying
a `lane2` note with the commit, the route (`exportJSON` or
`storedBlob`) and the hand-computed `known` values. Formats that removed
or renamed a path, changed the route, or sit at either end of the
history keep all seven households; a format that only added paths keeps
one sample. `README.md` and `index.json` there list every format and
the paths that appeared or vanished between one and the next. The
pre-spine flat profile (`annualSalary`, `studentLoanBalance`,
`studentLoanRate`, no `schemaVersion`) is written by hand, since it never
had an export.

`tests/migration.test.js` (905 checks): every file imports through
today's `Spine.importJSON` without a throw, comes back at the current
schema version with a snapshot list, and re-derives gross, tax,
take-home, monthly spending, savings rate, FI target, runway and net
worth within 1% of the household's `known`; the flat profile goes
through `Spine._migrateLegacy` and is checked for its salary, balance
and rate.

### What it found

Every one of the 39 spine-era formats imports and agrees, including the
pre-FAT months (a single estimated figure) that D-172's shim folds into
"everything else", and the categorised-lines format of 6776b58. The one
finding: the flat profile is refused by the import path ("no household
in it") because only the localStorage load migrates it; P-8 is the
four-line change.

### Decisions taken conservatively (DECIDE: for Eli)

- One sample household for addition-only formats keeps the corpus under
  a megabyte; every household for the formats that removed a path.
- The schema version has been 2 since the foundation commit, so "the v1
  spine" is the flat profile and every intermediate is a v2 shape; the
  corpus is keyed by commit, not by version number.
- Value disagreements are findings, not failures, unless
  `CORPUS_STRICT=1` (as in L-1).

### Compatibility

Nothing stored changed. `tests/tools/build-households.js` now exports
its specs and takes a schema module; `node tests/tools/build-households.js`
still writes the same thirty fixtures. `tests/.cache/` is git-ignored.

---

## L-6 - Lane 2, section 6: the accessibility audit, report only

### What it is

`tests/a11y-audit.js`: Playwright on a 412 by 915 phone viewport, the
`dink-highearn` household from L-1 in localStorage, every room in
`rooms.json`. For each room it injects axe-core 4 and runs the WCAG 2.0
and 2.1 A and AA rules plus best practices; reads the structure (lang,
one main, one h1, heading skips, a zoomable viewport, labels on inputs,
names on buttons and links, alt on images, positive tabindex); and does
a keyboard pass: Tab up to 45 times, waiting out the theme's 150ms
transitions, recording each stop, whether it shows a focus ring (an
outline or shadow on the element, or a change of border, outline,
shadow or background on the element or its shell against the unfocused
look recorded first), whether the menu and the first input are
reachable, whether Escape closes the open menu, and whether focus ever
stops moving. `docs/a11y-audit.md` is the report: a summary, the rules
failed with a one-line fix each, the structure and keyboard tables, and
a section per room. `tests/reports/a11y.json` holds the raw results.
Nothing under `rooms/` or `shared/` was changed.

### What it found

68 rooms audited. 53 have no axe violation; 12 have a serious one; 8
distinct rules failed. Eleven of the twelve serious rooms fail
`color-contrast` on the same kind of element: muted small text (the
`small` under a situation or event button, an empty row's label, a
locked skill, a dial-211 link) at 2.6 to 4.0 against the 4.5 required;
the fix is one token in `shared/theme.css`. Three rooms skip a heading
level; the dashboard nests an interactive element inside the Your Data
drawer's summary; one room each has a malformed definition list, an
aria attribute the role does not allow, an empty table header, and
content outside any landmark with no main. Keyboard: no trap, the menu
reachable in every room, Escape closing it in every room, and every
tab stop showing a ring in 66 of 68 rooms (Return on Hassle's rating
selects and one input on Refresh do not).

### Decisions taken conservatively (DECIDE: for Eli)

- Report only, as the lane says; the one-line fixes are in the report
  and the contrast token is the change that clears most of it.
- One household and one viewport; a desktop pass and the other
  archetypes are a second run of the same script (`SLAF_SEED`).

### Compatibility

Nothing changed. `axe-core` joins fast-check under `tests/`.

## D-182 — Lane 2 merged after Phase A: what came in, what was already consumed, what stays a proposal

**Decision.** With `PHASE_A_DONE` written (D-181), `lane2` is merged into
the master build as one merge commit, as D-179 ordered. Lane 2's six
sections (L-1 to L-6, their entries now sit above this one) came in whole:
the thirty-household corpus and its sweep, the property files for every
engine, the sourced tables under `data/lane2/`, the gloss dictionary and
lookup sentences, the migration corpus of seventy exports, and the
accessibility report. `DECISIONS.md` was the one conflict (both sides
appended above the divider) and is resolved by keeping both, D-181 first.

**Already consumed by Phase A, reconciled here.**

- `data/states.json` was lane 2's table since 15.6; the merge changed
  nothing in it.
- `data/milestones.json` is lane 2's table since 15.9; the copy under
  `data/lane2/` is removed, and `tests/data.test.js` and the two docs that
  named it point at the registered file (the first line of P-5, done).
- P-2 (register three tables) was already true on master; nothing to do.
- Lane 2's lens copy gains `sinkingfund`, the lens 15.5 added, so its
  glossary suite holds again.

**Lane 2's own suites, run on the merged tree (this commit):** data 3957,
glossary 3069, migration 905 (its one finding is the pre-spine flat
profile the import path refuses by design, P-8), corpus 7259 with no
disagreement between the engines and the hand arithmetic, properties 282
with the same six findings lane 2 logged (fractional cents in three
engines' meta, a level payment on a tiny principal, block application
minting an id, and the job-loss shock in a run with nothing to draw on
borrowing a few dollars less than the shortfall). None of the six is
Phase A's; each is a finding for the section that owns the engine, and
the findings file is regenerated by the run. The property runner needs
`fast-check` under `tests/node_modules`, which stays untracked.

**Still proposals, each a DECIDE for Eli, unchanged by this merge:** P-1
(a CI workflow), P-3 (point the engines at the section 3 tables: the
415(c) limit, the ACA top percentage, 27 UI maxima and Ohio's flat tax
disagree with the copies the engines read), P-4 (the 18-month rule and
prior-year rows), the rest of P-5 (`aca`, `contribution_limits`,
`studentloans`, `tax_brackets` stay under `data/lane2/` until the section
that reads each one lands: 16.2 for the ACA table, the tax room for the
brackets), P-6 (wire the glossary hover into every room), P-7 (read the
lens copy from lane 2's file), P-8 (let Your Data import the flat
profile). The accessibility report's one-token fix (muted text contrast)
is section 21's.

Gate for this commit: unit 26426; dnd 5614; export 25; the five lane 2
suites above.

## D-183 — The Ledger, 18.2: every number the app can hold is one row, of one of three kinds

**Decision.** Section 18 (Phase B) is built one subsection a commit, in
the brief's order, starting with the registry the room, the dump box, the
nag and the sidebar all read. `data/ledger-rows.json` lists every number
the app can hold: 79 rows, each with its `path`, `letter`, `label`,
`kind`, `pass`, `appliesWhen`, `unit` and `minutes`; a lookup row carries
its `where` sentence and a `roughly` hint; a computed row names its
`engine` and its `inputs` (by row id). `shared/ledger-rows.js`
(`SLAF.LedgerRows`; the brief's `Ledger` is taken by the D-128
dated-income engine, so the reader is `LedgerRows`) is the one reader:
which rows apply, what state each is in, what is next.

- **Rows are ownership fields.** A row's `id` is the ownership field id,
  so it reads and will write through the one map every room already uses
  (D-017); `aliases` names a second field on the same path (`rentMonthly`
  is `accommodationMonthly`). The per-item rows (a debt's balance, rate
  and minimum; an asset's value, pile and basis; a source's type and
  whether it survives a job loss; the periods ahead; the yearly lines)
  are `repeat` rows: one line per item, the row's value the count, its
  items the lines. Every money or situation path DAITE declares has a row
  and every row path is unique (the first 18.8 gate, in unit form).
- **Three kinds, from the brief.** `know` (in your head), `lookup`
  (fetched; the `where` sentence is lane 2's where lane 2 wrote one, L-4,
  and the rest are written to the same rule: one sentence naming the
  document and the line), `computed` (never typed; the engine's answer
  with its inputs named, each a link to that input's row). A computed row
  is never given a `where`; the unit test resolves every `engine` string
  to a real function.
- **What is not a row.** Plans, preferences and progress paths
  (`plans.*`, `progress.*`): a decision room's what-if (an offer, a
  purchase, a housing price) is not a fact about the household and stays
  in its room; `prefs.*` has one row, the path choice (beginner or FI),
  which 18.7 makes the very first row and which reads from Prefs, never
  the household.
- **Order.** `pass` is the walk-through's order (`data/walk_stages.json`):
  1 what is true right now (the six situation rows first: the path,
  birth, state, dependents, working situation, filing), 2 make it hard to
  go backwards, 3 the rest. Within a pass, file order, which 18.4 will
  replace with the sphere order once `data/spheres.json` exists (19.1).
- **appliesWhen** reuses the levers' phrase reader (`Levers.appliesWhen`,
  D-174), which gains `situation == x`, `household.two`,
  `dependents.any`, `debt.any`, `debt.studentLoan`, `income.variable`,
  `cover.hsa`. A failing row is absent, not greyed. An unknown phrase
  never applies.
- **State.** `computed`; `missing` (nothing entered); `sure`; `roughly`
  (entered but never confirmed, which is every figure whose meta says
  `roughly`, `unsure` or `unknown`, 15.10); `stale` (sure but past the
  staleness window for its field, D-056). `next()` returns exactly one
  row, the first missing or rough non-computed row of the lowest pass,
  with the minutes left; `roughRows()` feeds the nag (18.6);
  `readersOf()` lists the rooms whose registry entry needs the field or
  reads its DAITE path, the tap targets of 18.5.
- **Compatibility note.** No stored shape changes. `Reference.TABLE_FILES`
  gains `ledgerRows`. Nothing reads the module yet; the room is 18.4.

Gate for this commit: unit 26536 (a new section of 60 checks: the
registry's shape, the DAITE coverage and uniqueness, the engines, the
phrases, the states on the demo and on nothing, next, the readers, the
inputs, the summary); dnd 5614; export 25.

## D-184 — The nine spheres, 19.1: one file, three faces, the shadow measured and never named

**Decision.** `data/spheres.json` is the brief's table, nine entries in
order, each with its depth (Ledger row ids from D-183), its shadow (a
measure, an engine, a sentence) and its virtue (the word on screen), plus
`unlocks`, `sharpens`, `action` (one room, one filter) and `drawer` (the
only place the shadow's name appears). `shared/spheres.js`
(`SLAF.Spheres`) is the one reader; the Ledger rings (18.4), the Dashboard
tiles (19.2), the tree map's roots and every room's sphere badge (19.3,
20) read it and nothing keeps a second copy. Built before the Ledger room
because 18.4 orders the room by it.

- **Depth gates precision, never access.** `Spheres.state(h)` reports
  every sphere with its rows' status: complete when every applicable
  non-computed row is at least `roughly`, sharp when every one is `sure`;
  the household's current sphere is the lowest incomplete one;
  `completeThrough` and `sharpThrough` are the runs from sphere 1, and
  the FI date precision (15.10) will follow `sharpThrough`. A computed row
  never gates. A sphere with no applicable rows is complete or sharp only
  when everything before it is, so an empty sphere cannot be reached by
  skipping.
- **Where the rows went.** Every Ledger row belongs to exactly one sphere
  (unit-enforced), and `depth.minutes` is the sum of its rows' minutes.
  Two departures from the brief's row pattern, both in the file's note:
  the six situation rows sit in sphere 1, because 18.7 makes them the
  first six rows of the Ledger and nothing else can be placed without
  them; sphere 9 has no rows until the time budget (16.12) stores hours
  and the price of a day off, so its measure says "not tracked yet"
  rather than inventing one. One row was added to the registry for
  sphere 6: `assetCharacter`, the tax character the Statement already
  asks (15.3 reads it as orientation, 15.8 as the pile), which the
  ownership map had no field for.
- **The shadow is a measurement with a cost.** Nine engines in the
  module, each a Result: rows never touched with the minutes to enter
  them; the Joy Curve's lowest line (what The Rerank would cut, a year;
  the brief's wants-share-against-a-band waits for a band that
  `data/bands.json` does not carry, since DRAFTT has no wants letter);
  dreams priced but not dated; the rough rows with the minutes to
  confirm them; the interest a month on the highest-rate line; cash
  above the runway need (the sleep-at-night months when set, else six,
  the full emergency fund of `data/foo_rules.json`, said so); the car as
  a share of net worth; the gap between last month's estimate and its
  actual; days off (not tracked yet). The sentence is the file's, with
  `{n}`, `{minutes}` and `{dollars}` filled, and carries no judgement
  word (unit-checked). The shadow's name is not in the sentence, the
  measure text, the action, the tile or either module's source
  (unit-checked); the drawer is the one place.
- **The target.** `Spheres.cells(h)` is the 45-cell grid, five letters by
  nine spheres: full when every row is sure, half when every row is at
  least rough, empty when nothing is entered, dashed when any row is
  stale. The situation rows carry no letter and sit outside the wedges.
- **Compatibility note.** No stored shape changes. `Reference.TABLE_FILES`
  gains `spheres`. Nothing reads the module yet; the room is next.

Gate for this commit: unit 26658 (a new section of 57 checks: the file's
shape and rules, every row in one sphere, the state on the demo, on
nothing, confirmed and rough, the cells, the nine measures and the tile);
dnd 5614; export 25; the lane 2 data suite.

## D-185 — The Ledger room, 18.4 and 18.5: the target, and one line per row

**Decision.** `rooms/ledger.html` is the room the registry (D-183) and the
spheres (D-184) were built for, as a view first: entry moves into it in
18.1, the dump box in 18.3, the nag in 18.6, the sidebar change in 18.7.
Until then a row's tap target is its owner room's box, through the one
link map (`Ownership.linkTo`), so nothing is entered twice and nothing
moves yet.

- **The target**, pinned while scrolling: five DAITE wedges by nine rings,
  the 45 cells of `Spheres.cells`, filled for sure, half for roughly,
  empty for missing, dashed for stale, hollow where a letter has no row
  at that sphere; each cell's title says which. Under it one line:
  "Sphere N of 9, Virtue. K rows left, about M minutes. This is already
  enough for most people." (the last sentence on spheres 1 to 4 only).
- **The rows**, grouped by sphere, then by letter (About you first, then
  D A I T E), in the fixed order of `spheres.json`, each numbered "n of
  N" inside its sphere and never reordered by what is missing. One line
  each: the status glyph (● sure, ◐ roughly, ○ not entered, = worked
  out, ◌ needs a look), the label, the value or, for a lookup row not yet
  entered, its `where` sentence; under it the source and as-of date in
  small text, and the rooms that read it as tap targets. A computed row
  is grey, names its inputs in words, and each missing input is a link to
  that input's row. Spheres past the household's current one sit under
  one fold, visible from the start. A search box filters rows by label
  (the room's only control; built once). The Empyrean is one line: "What
  Matters. No numbers there."
- **Registry.** Under Home after the Dashboard, `kind: 'about-you'` (the
  kind Start Here and What Comes Next carry) until 18.7 retires Start
  Here and it takes the core slot (D-051's four-room check is deliberate
  and untouched); reads every DAITE money and situation path, writes
  nothing; needs nothing, so it opens on an empty household. Every Front
  Doors arrangement shelves it beside Start Here.
- **A listed debt is a yes.** The "any debt" row carries `impliedBy:
  'debts'`: the D-061 question is answered by implication once a debt is
  listed, so the Ledger does not ask again.
- **Compatibility note.** No stored shape changes. `data/layouts.json`
  gains the room in all twenty arrangements; `rooms.json` regenerated.

Gate for this commit: unit 26844 (a new section of 18 checks on the
registry entry and the room's source); render on the Ledger empty and
with the demo; a phone walk empty (sphere 1, 8 rows, 17 empty cells) and
with the demo (sphere 1 with two rows left, cells full, half and empty,
the fold holding spheres 2 to 9, the search narrowing to the rent row,
the net worth row naming its four inputs, a lookup row carrying its where
sentence and its readers), with no console errors.

## D-186 — The simplification pass, first cut: fewer doors, one next, quieter rooms

**Why now.** The owner walked the app and said what it felt like: not
intuitive, a lot that is extra, the process unclear, "I am not sure what
to do and when, I keep getting lost." That is the brief's section 21
(Phase F) pulled forward, on the owner's word, ahead of the rest of
section 18. A phone walk as a first-time user found the same four things,
and this entry cuts them; nothing stored changes.

**What a first-time user saw, and what changed.**

- **Start Here showed the same "what is missing" list twice**, below the
  questions: a status panel ("Still to answer · 14 · 34 rooms waiting",
  then "Filled with a guess", "You answered", "Came from another room",
  "Does not apply") and, under it, the room footer's own "12 things left
  before this room can show you everything", each line with "N rooms
  want this". Two lists of the same thing, in room-count jargon, before a
  single number was typed. The status panel is gone (the aside, its five
  groups, the relevance counts and the jump handler, D-160), and the page
  is the situation, the numbered questions, Fine-tune, Paste, and one
  button. The Ledger room (D-185) is now the one place that lists every
  number and its state, and it is a page you go to, not one that follows
  you.
- **Four "next"s on the Dashboard.** A walk-through pitch at the top ("A
  lot of rooms…"), the next thing money should do, the next thing to
  learn, the next skill, and at the foot "Next unfinished: Start Here"
  on a household with everything entered. The pitch is gone: the walk
  card speaks only mid-walk (the walk stays one tap away in the menu),
  and the foot of every room now points in plain path order ("Next: The
  FIRE Room →") instead of jumping to a different room each time, which
  D-054 had reserved for the bottom strip and which turned out to be one
  of the ways people got lost.
- **Every room ended with the same furniture.** "This room has everything
  it needs. All 5 figures it reads are filled in." (or "stands on its
  own"), the three export buttons under "Take this room with you" with a
  two-sentence note, then the hop strip. The complete and standalone
  sentences are gone: silence is the signal that a room is complete, and
  the footer speaks only when something is missing ("2 still needed to
  finish this room", the two links, no room counts). The export buttons
  fold into one line, "Save or print this room", closed.
- **Three doors side by side under Home.** The Dashboard, Start Here and
  The Ledger. Until 18.1 makes the Ledger the place numbers are entered
  and 18.7 retires Start Here, the Ledger sits under Upkeep beside
  Refresh, a utility; Home is the Dashboard and Start Here. Every Front
  Doors arrangement still shelves it.

**What did not change, deliberately.** The Dashboard's four blocks (D-093
and after) and the five tiles; Start Here's numbered questions and their
"Use" suggestions; the walk-through itself; the top-of-room back and hop
controls; the disclaimer line. The rest of section 21 (the removal list,
the language pass on every room) is still ahead and will be done the
same way: walk it on a phone first, cut what a stranger stumbles on.

**The eighth promise moved.** D-170's gate checked that Start Here carried
the field-status ledger; it now checks that the Ledger room does, one line
per number with its state, and that Start Here no longer does.

**Compatibility note.** No stored shape changes. `Progress.stripHtml` no
longer reads `nextUnfinished` (the function stays, the Walk-Through and
the walk card use it); `RoomExport.mount` renders a `<details>` instead
of a `<div>`, same class and buttons; `rooms.json` regenerated.

Gate for this commit: unit 26844; render on Start Here, the FIRE room
and the Ledger; the phone forms gate for Start Here; the sidebar,
settings and features gates; a phone walk of Start Here after "Employed",
the Dashboard with the example numbers and a room footer. Start Here after
"Employed": 3527 to 2615 pixels tall on a phone, one list of what is
missing instead of two; the Dashboard with the example numbers: 2279 to
2009 pixels, no walk pitch, the foot reading "Next: Worth Learning";
the FIRE room's foot: the previous and next room and one folded line.

## D-187 — Debt Payoff, redone as one line per debt, the number first, the rest behind carets

**Why.** The owner: the debt screen is way too complicated, too long, too
many fields; make it like the other rooms, with the extras collapsible,
and let ten debts be ten lines. On a phone with the two example debts the
room was 2,946 pixels tall and 440 words, with each debt a card of eight
controls (name, balance, minimum, type, a three-way interest chooser, the
rate, and two drawers) and three long output cards below.

**What changed.**

- **The number first**, as every template room (D-093): "Debt-free in"
  with its three lines (interest, total, per month) and the one chart,
  before anything is asked.
- **One line per debt.** Name, owed, rate, minimum a month, and one caret
  called "More". On a wide screen that is one line; on a phone the name
  takes its own line and the three facts stay on one, so ten debts are
  ten short rows and a column head says what each box is instead of a
  label on every box. The formatted value carries its own $ or %, so the
  affixes are gone from the line.
- **Everything else behind the one caret:** the kind, how it feels, how
  interest behaves (the D-133 three-way chooser and its promo fields; the
  rate stays on the line, built once, D-133's rule kept), why you keep it
  (D-132's chips and the hold-back, still their own drawer), the two
  dates and the credit limit (D-124, still their own drawer), and Set
  aside and Remove. The caret's summary says the kind and whatever is
  set, so a closed row is never a black box.
- **The three output cards fold.** "Which order" (its summary line names
  the order in use and its interest), "The order they fall" and, on cards
  only, "Rewards vs. carrying a balance" are closed `details` cards; a
  deep link into one opens it. The extra-a-month box moved under the
  list, where the plan it changes is.
- **Result on the same two debts:** 1,620 pixels and 144 words, from
  2,946 and 440.

**What did not change.** The engine, every stored field, the guarded
live list (D-034), the warning painted under a row, the archive drawer,
the demo and clear buttons, the scope chips.

**Compatibility note.** No stored shape changes. The debt-fold room test
pins the new line (balance, rate, minimum, then the type behind the
caret) and the phone layout (the name on its own line); everything else
it pinned still holds.

Gate for this commit: unit 26966; the three debt room tests; render
on the room empty and with the demo; the phone forms gate (a debt typed
in, four fields kept); a phone walk with the example debts.

## D-188 — Debt Payoff: three finish lines, Avalanche ranks by the rate a debt will carry, the extra is worked out

**Why.** Three things the owner said after D-187, each fixed here.

**Three finish lines.** "Credit cards gone", "Anything above 7.5% gone",
"Everything gone", read off the one simulation (`Debt.milestones`): each
is the last payoff month of the debts in that class; a class with no
debt says so ("no cards listed") and one the plan never clears says "not
at this payment"; the last line is the headline again, so the three read
as one ladder. The high-interest line is the FOO ladder's figure
(`data/foo_rules.json`, `thresholds.highInterestDebtRate`, 7.5%), read
from the table, not a second copy.

**Snowball was beating Avalanche.** On a household with a 0% card that
becomes 24.99% in six months, Avalanche cost $982 of interest and
Snowball $571, because every ordering sorted on `rate`, the rate stored
today, and a promo card at 0% went last in Avalanche and stayed last
after its rate jumped. `Debt.rankRate(debt, month)` is now the ordering
key everywhere: the rate in force this month, or the rate a promo
reverts to when that is higher and the promo has not ended. An expired
promo ranks at the rate it already reverted to; a promo with no go-to
rate ranks at the rate it has (D-053: the plan cannot invent one). On
that household Avalanche now clears the promo card first and is no
dearer than Snowball; lane 2's property "the cheapest strategy really is
the cheapest" still holds.

**The extra is worked out, not asked.** When the box is blank the plan
uses what the household's pay leaves free each month: take-home
(`Schema.takeHomeMonthlyCents`) less spending
(`Schema.monthlyExpensesCents`) less every minimum
(`Schema.monthlyDebtPaymentsCents`), floored at zero, and the hint says
so with the figure. A typed figure wins and the hint says what clearing
it would use. With any of the three missing the box means what it did:
the minimums alone, and the hint points at Start Here. Nothing is
stored: the extra stays this room's own what-if (D-052).

**Closer.** The rows are tighter: less padding on a line, a shorter name
box, the "More" summary on the line's own baseline, the finish lines at
four pixels.

**Compatibility note.** No stored shape changes. `Debt.orderDebts` takes
the month and the as-of date; `Debt.milestones` and `Debt.rankRate` are
new; the room loads `fooRules` and `effectiveTaxRates` beside
`debtRules`.

Gate for this commit: unit 27036 (the promo household by hand, the
rank of an expired and an unknown promo, the three lines on the
three-debt household and on one with no cards, the room's wiring); the
three debt room tests; lane 2's debt properties; render and the phone
forms gate on the room; a phone walk with the example debts.

## D-189 — Debt Payoff: where the interest goes, a month

**Why.** The owner: "a pie chart to see which debt generates the most
interest; I don't mind paying student loan interest but I want to be
done with credit card debt asap." The plan card's chart was balances by
bar, which answers "how much do I owe" and not "which one is bleeding
me."

**Decision.** The plan card's one chart is now a donut of interest a
month by debt: each live debt's balance times the rate it carries this
month (`Debt.rateInMonth`, so a promo at 0% shows as 0% now), over
twelve; the centre is the total a month; the legend line carries the
rate on the balance, a hold-back and any keep reasons. Cards are drawn
in the debt colour, everything else in the series colours, and one line
under the ring says what the cards are of the total and what the rest
costs once they are gone. Balances are on every debt's own line, so the
bars are not missed. Drawn only once the plan is complete, so a debt
without a rate is named in the reason rather than pictured as costing
nothing. Hand-checked on the example: $18,400 at 5.5% is $84 a month,
$3,200 at 22.9% is $61, $145 together, the cards 42%.

**Compatibility note.** Nothing stored changes; the room draws with
`Charts.donut`, which every other ring uses.

Gate for this commit: unit 27038; render on the room; a phone walk with
the example debts reading the two slices and the line under them.

## D-190 — Debt Payoff: the extra is always a number, estimated then realized

**Why.** The owner, with the room open on their own household: "I don't
see the number being computed. Even if you have to wait for another room
it should be an estimate, and then there should be a realized version
based off other rooms." D-188 worked the extra out only when pay,
spending and the minimums were all typed, and showed $0 the moment the
arithmetic went to zero or below, which read as nothing computed at all.
The same message asked for a second ring: the interest each debt costs
over the whole plan, not only this month.

**Decision.** One formula, in the engine (`Debt.freeMonthlyCents`):
take-home less spending less every minimum. It is read two ways and both
show under the box, each saying what it came from and which is in use:

- **Estimate.** The formula over what Start Here holds, with the intake's
  own guesses (`Gate.fillGuesses`, D-097) standing in for a missing pay or
  month of spending. So a household with only its debts typed already
  sees a figure, marked "pay and spending guessed, fix it in Start Here".
  The room hands the guessed copy in as `opts.estimateFrom`; the engine
  never guesses on its own. When the pay falls short, the row reads $0 and
  says by how much, and the hint says to take the debt payments out of
  spending if they were counted there.
- **Realized.** `Debt.realizedFreeMonthlyCents`: the same arithmetic over
  the months closed in Budget with an income actual, the last three
  averaged, less the minimums as they stand today. Until a month is
  closed the row reads "waiting" and links to Budget.

`Debt.extraCapacity` picks the one the plan uses: typed beats realized
beats estimate, never below zero, the shortfall carried apart. A stale
engine after a deploy falls back to the typed figure (D-188's guard).
The plan card gains a second donut beside the monthly one: interest over
the plan by debt, read off the simulation's payoffs in the same colours,
with the total in the centre and the cards' share in one line. Loads
`onepagerDefaults` for the guesses. Hand-checked: the demo persona's
estimate is $4,860 less $3,150 less $305, $1,405; with three closed
months at $5,000, $4,800, $5,200 in and $3,000, $3,200, $3,200 out the
realized figure is $5,000 less $3,133 less $305, $1,562, and it wins.

**Compatibility note.** Nothing stored changes. The engine reads
`household.ledger.months[].actual.income` and `.expenses` (D-128) and
writes nothing; a future room wanting "what is free a month" calls
`Debt.extraCapacity` rather than re-deriving it.

Gate for this commit: unit 27086; render and forms on the room; a phone
walk with three households (debts only, the demo persona, the persona
with three closed months) reading the two rows, the hint, the
placeholder and both rings, and a typed figure taking over.

## D-191 — Debt Payoff: a stop line, and the payment says what it is built from

**Why.** The owner: "once I only have student loans I don't really plan
on paying that off any time soon, I'd just stick with minimums due to
the low interest rate. Build a stop gap thing." And, of the extra box:
"does 1000 mean above minimums? That system needs to be clearer." And a
screenshot showing the box reading "$ $1,000".

**Decision.** The plan card gains one select, "Keep the extra going
until": everything is gone (as before), the cards are gone, or anything
at the FOO high-interest rate or more is gone. Once nothing of the chosen
class is live, `Debt.simulate` stops the extra AND stops rolling freed
minimums on: from that month each remaining debt gets its own minimum and
no more, which is what "just stick with minimums" means. The result
carries `stopMonth` and `monthlyBudgetAfterStopCents`; the card reads
"Per month $1,710, then $210", says when the stop comes and when the rest
is gone, and the interest ring over the plan counts the long tail. The
class predicate (`Debt.inClass`) is the one the finish lines use, so the
line that says "cards gone" and the stop that says "when the cards are
gone" cannot disagree. A stop whose class is empty from the start stops
in month 1, minimums alone, and the card says so. Against minimums alone
a stopped plan can be cheaper and later at once, so that row says both
and the "sooner by" row is never a negative. The comparison and the
held-back check run with the same options (`simOpts`), so every figure
in the room is the same plan. The choice is a preference
(`Prefs` key `debt.stopAfter`), not household data: it is how this
person reads the plan, and it survives a reload.

The extra box is labelled "Extra each month, on top of the minimums";
the hints say "on top of the minimums" and name them; the Per month row's
note spells out the sum every time: the minimums as typed on each line
(and how many the card rule worked out), plus the extra and where it
came from. A typed extra shows digits only, since the shell's affix
already carries the dollar sign. The estimate row, when short, says to
take debt payments out of spending in Cash Flow if they were counted
there, whether or not a figure is typed.

Hand check on the example: the card falls in month 3 either way; with
the stop, $18,400 at 5.5% on its $210 minimum is gone in 8 years 8
months, interest $4,540 against $782 for the full plan and $6,639 for
minimums alone; 11 months later than minimums alone, because the card's
freed $95 no longer rolls on.

**Compatibility note.** Nothing stored on the household changes. The
plan result gains `stopAfter`, `stopMonth`, `monthlyBudgetAfterStopCents`,
`minimumsCents`, `extraMonthlyCents` and `derivedMinimums`; a caller
that never passes `stopAfter` sees `stopMonth` null and the same
numbers as before.

Gate for this commit: unit 27157; render, forms and features on the
room; a phone walk picking each stop, reloading to find it kept, typing
an extra and reading the digits-only box and the on-top hint.

**Follow-up, same session.** "It should total up the minimums also and
then be like total amount going to debt." Two sums, both painted as
text into static markup so the live list is never rebuilt for them: a
footer under the list (N debts, owed, minimums a month, with any blank
balance or minimum counted as missing rather than zero), and under the
extra box the one figure that leaves the account for debt each month,
minimums plus the extra in use, with where the extra came from.

## D-192 — Expenses is what a month costs; Cash Flow is when the money moves

**Why.** The owner: "I want to have spending be in expenses now. Cash
Flow is just measuring when that spending happens now." One room had
been holding two different questions, and the second was burying the
first: the four numbers everything reads sat above a log, a Sankey and
three comparisons, and "where do I type what a month costs" had no
plain answer. It also fed the debt-room confusion of the same day: with
everyday spending going through the cards, "what I spend" and "what I
pay the card" need to be typed in different places or they get typed
twice (D-190, D-191).

**Decision.** Cash Flow is split in two. **Expenses**
(`rooms/expenses.html`, registry id `expenses`, order 3, core) is what a
month costs: the four numbers and the therapy toggle, the yearly costs,
the optional split by category with its proposals, and the three
readings of that month (spending by category, against a budget split,
the lines against the four numbers). It takes over as the one owner of
`monthlyExpenses`, the four buckets, `therapyMonthly` and `rentMonthly`,
and the DAITE writes for them. **Cash Flow** (order 3.1, about-you) is
when the money moves: this month at a glance, the expense log on its
dates with the reimbursable path, where it flows, and what is left. It
writes the log only (`expenses.log`) and reads the typical month from
Expenses, saying so wherever it used to invite typing. The core stays
four rooms: Expenses takes the seat Cash Flow held (D-051). Every layout
in `data/layouts.json` lists Expenses beside Cash Flow; the walk's first
stage does too; the exercises, the skill tree, the advice translator,
the dashboard and every room that pointed at "categorise a month in
Cash Flow" now point at Expenses, and the ones that mean the log still
point at Cash Flow. No engine changed a formula.

**Compatibility note.** Nothing stored changes shape: the four numbers,
the lines, the yearly costs and the log all live where they did, in
`household.expenses`. Two tags change: `Ownership.FIELDS.*.owner` for the
spending fields is `expenses` (was `cash-flow`), so `Ownership.linkTo`
and every door and chip land on the new room; and
`Schema.rentMonthlyCents(h).source` reads `expenses` (was `cash-flow`)
when the rent is the housing line, and Housing Decision, the Calendar
engine and the ownership read were updated to match. A future room
reading spending calls the same helpers and needs to know nothing new;
one that wants to link to "where spending is typed" links to
`expenses.html#spending`, and to "where a receipt is logged" to
`cash-flow.html#log`.

Gate for this commit: unit, D&D and export suites; render, forms,
features and sidebar gates with both rooms; the twenty layouts reaching
every room; a phone walk typing the four numbers in Expenses and logging
a receipt in Cash Flow, each landing in the stored household.

## D-193 — Income: the entry form folds behind one line, and shows five things, not seven

**Why.** The owner, on a phone, with the Income room open: the "Add an
entry" card was seven stacked controls and a hint — a whole screen of
form under a list that is the actual point of the room — and they asked
for it to collapse and for the room to be "much, much cleaner". The form
was also the same size whether it was in use or not: every visit scrolled
past it.

**Decision.** The form is a `<details>` fold, `#add-fold`, inside the
`#add` card. Closed, the card is one row: a blue "+" and "Add an entry"
with a sub-line naming what counts. Open, the "+" turns to a cross and
the form shows **five** controls in the order a person thinks of them:
the kind, the amount beside how often, what to call it, when it was
received. The two that have a right default per kind — how sure the date
is, and how it is taxed — sit under a "More" line and open only when an
entry being edited holds something other than the kind's own default, so
the fold never hides a value the person chose. A gift still hides the
tax row. "Start a new one" is gone; a "Cancel" always sits by Save and
folds the form back with the fields cleared.

Opening and closing only set `open` on the fold; the inputs are never
rebuilt (D-034 still holds and the marker still reads *built once*). The
fold opens itself in three cases: a tap on Edit, an arrival on `#add`
(the deep link), and the budget's Add flow (`?for=budget`, D-128), which
sent the person here to add one. Save folds it back, and the confirmation
line sits under the fold, outside it, so "Added. Day job $2,400 …" is
visible with the form closed and the new row above it in the list.

**Compatibility note.** Nothing stored changes. The budget's link
`income.html?for=budget&month=…#add` still lands on an open form.

Gate for this commit: unit 27176; render on the room; the phone form
case now taps the summary open first, types into the amount and the
name, saves, and checks the fold closed with the entry in the ledger; a
Pixel-7 walk through closed, open, "More" open, Cancel, Edit (the fold
opens, the caption names the entry, "More" stays shut for a default
entry) and the budget deep link, with no console errors.

## D-194 — Income: the picture, and three more questions that feed it

**Why.** The owner, after D-193 landed: "start making some data
visualizations for income though have it ask more information." The
room had one figure for the month and a list; nothing showed the year
taking shape, where a month's gross actually goes, or which source
carries the household. And the entry knew nothing that would let a
chart say anything true about the future or about the tax: a job that
ends kept landing forever, and a paycheque's tax was always the year's
blended rate even when the stub was in the person's hand.

**Decision.** A card, *The picture*, between the month and the sources,
hidden until the first active entry exists, drawn by `shared/charts.js`
from `Ledger.month` alone — one call per month of a twelve-month window,
six back and six ahead, nothing computed in the room:

- **A year of it, month by month.** One stacked bar per month, gross,
  split by the kind of money. Colour follows the kind everywhere on the
  page (the nine kinds in `Schema.INCOME_KINDS` order over the chart
  palette, *other* in the muted grey), so the same colour means the same
  thing in every chart. A potential entry is never in the bar; the row's
  note says how much more could come.
- **Where this month's gross goes.** A donut: yours to keep, tax taken
  before it arrived, tax owed later, the costs of earning it. Per
  landing times the landings, costs once, exactly as `Ledger.month`
  counts them.
- **Source by source.** Every active entry's gross over the same twelve
  months, largest first, in its kind's colour, with whose it is and
  when it ends in the note. **Yours and theirs** follows only for a
  household of two, one bar per adult, plus one for anything no one is
  named on.

Three questions join the *More* fold, each shown only when it can mean
something, each optional, each feeding the picture:

- **Whose is it** — a household of two only. The entry always had a
  `personId`; the form never asked. It defaults to the first adult.
- **Last one on** (`endsOn`) — recurring entries only. `Ledger.occurrences`
  lands nothing after it: whole months after are empty, and the month it
  ends in keeps the landings up to that day. Empty means it runs on,
  which is a real answer and is never turned into a date.
- **Tax taken off it** (`withheldCents`) — W-2 and unemployment only,
  off the stub. Empty means the blended rate stands in, as before. Typed
  on W-2 pay it *is* the tax — the rate was only ever standing in for
  the stub; typed on unemployment it is what was held back at the
  person's request, the tax stays the estimate and the rest is owed,
  never below zero. `netOf` marks the result `pieces.typedWithholding`.
  A withheld figure larger than the pay is refused at the form.

The entry list says whose, until when, and what came off the stub.
Hand-checked: a $3,000 monthly job with $480 typed nets $2,520 with
nothing owed; the same job ending 15 September lands in September and
not in October; a $600 unemployment cheque with $30 held back owes the
estimate less $30.

**Compatibility note.** `household.ledger.income[]` entries gain two
fields, `endsOn` (ISO date or null; always null on a one-time entry) and
`withheldCents` (integer cents or null; always null unless the method is
w2 or unemployment). `Schema.createIncomeEntry` fills both on every
read, so an entry stored before this has them as null and behaves
exactly as it did. Income is the only writer; the Budget, Calendar and
Tax rooms read through `Ledger.month` / `Ledger.netOf` and pick the
change up without edits. A future room that reads an entry directly
should treat a null `withheldCents` as "estimate", never as zero.

Gate for this commit: unit suite; forms on the Income room, now typing
the withheld figure through the More fold; a phone walk with the demo
persona plus a job, a gig with costs and a gift, reading the three
charts and the fourth with a second adult.

## D-195 — Income: the year reads as what came in, then what is assumed

**Why.** The owner, on the live page with their own numbers: a benefit
and a monthly gift, so D-194's year chart was twelve identical bars
and "make the income thing make more sense." Three things were wrong
with it. It said nothing a sentence could not say better. It drew the
months already received and the months merely assumed in the same ink,
so a projection looked like a record. And it drew an unemployment
benefit to the horizon, which is the one thing a benefit never does.

**Decision.** The year chart becomes three things in order:

- **A sentence.** "Since Mar ’26: $26,612 gross has come in. Ahead, if
  nothing changes: $4,016 a month, $3,589 after tax." The first half is
  the past months with a landing summed; the second is the months
  ahead, one figure when they are all the same, a range when not, with
  next month's net beside it. When everything has ended it says so.
- **So far, then Ahead.** The same stacked bars, split at this month,
  on one shared scale, the *Ahead* half faded and captioned "assumed,
  not yet received". The legend appears once, under the ahead half.
- **A nudge.** A recurring unemployment benefit with no last date gets
  a line above the chart: it is drawn as if it keeps coming, benefits
  usually run about 26 weeks, *When does it end?* The button opens the
  entry with the *More* fold open and scrolls to *Last one on*; saving
  a date drops it from the months ahead and the nudge goes. Only
  unemployment gets the nudge for now — it is the one kind whose end
  is a rule rather than a choice.

And the month card, because the owner's next message was "I think the
numbers are off" over a line reading "$73 of tax taken off" on a
benefit. Nothing is taken off a benefit. `Ledger.month` now returns the
tax split the way it is felt, `withheldCents` and `owedCents`, summing
to `taxCents`; the card says "taken off before it arrived" and "owed at
tax time" as separate figures and never "taken off" for money that
arrived whole. Under it, *How this was worked out* opens one line per
entry: gross, the tax, the net, and in small type the rate used, the
yearly income it was banded on and where that income came from (Start
Here, the entries here annualised, or the entry alone), whether a
typed stub figure overrode the table, and why nothing or everything is
owed. The hint under the list names the table for what it is, an
unverified blended estimate, and links to Start Here, since the band
is the thing most likely to be wrong. The donut reads the same split.

Nothing stored changes. Hand-checked with the owner's shape: a $3,766
benefit from March and a $250 gift from September give $26,612 so far
and $4,016 a month ahead; an end date of 30 September leaves $250 a
month ahead. The month's split: a W-2 job with $480 typed shows $480
taken off and $0 owed; a weekly benefit with $30 held back shows $120
taken off across four landings and the rest owed.

Gate for this commit: unit suite; forms on the Income room; a phone
walk with that household, tapping the nudge through to a saved end
date.
## D-196 — Expenses: the picture first, then the four numbers, then the lines you name

**Why.** The owner, the day the room was split out (D-192): "make the
expenses way more optimized. I still need a way to add expenses I want,
a subscriptions area and a way to say how often it repeats. All the
things for expenses should be there, like I don't see estimates vs
actual anywhere. Data visualizations up top and then editing the data
below. Focus on FAT." The room had the four numbers and a category
split, and nothing that said how the month was going.

**Decision.** The room is now three bands. **At a glance** at the top:
a ring of the month by FAT bucket (food, rent or mortgage, getting
around, everything else, therapy when tracked, in a fixed colour order)
and, beside it, estimated against actual per bucket and in total: the
estimate is the four numbers as they stand, the actual is what has been
logged in Cash Flow this month (`CashFlow.logByFatBucket`, each receipt
landing in the bucket its category maps to), with the closed months'
average named under it once any month is closed. **The four numbers**
next, unchanged, with one line under each saying what the lines in that
bucket add up to; when the lines come to more than the number typed, it
says so and offers to make the number match, one tap, the same one
deliberate write D-172 allows. **Lines you name** last: a form for a
line as it is known (what, how much, every week / two weeks / month /
three months / year, and which bucket, subscriptions by default),
listed with subscriptions in their own area totalled a month and a
year; the yearly costs and the category split fold under it. The three
readings (by category, against a budget, lines against the four) sit at
the bottom.

A named line is an expense entry with a `descriptor`, kept as a month
in `amountCents` like every line, plus two new optional fields: `every`
and `everyCents`, the cadence and the amount as typed, so $120 a year
reads back as $120 a year. `Schema.monthlyFromEvery` is the one place
that turns a cadence into a month; the category boxes' "per" aid uses
it too. The category boxes ignore named lines (`entryFor` skips any
entry with a descriptor), so a $16 subscription and a $45 "subscriptions"
category total can coexist and both count once. The demo persona's
spending lines are untouched, since the suite pins their totals.

**Compatibility note.** Two optional fields join an expense entry,
`every` (enum) and `everyCents` (cents), both null unless a line was
added through the Expenses form; every reader of `amountCents` is
unchanged. The room's own subsections changed (`picture`, `spending`,
`lines`, then the three readings). Nothing else stored changes.

Gate for this commit: unit suite with pins on the cadence, the entry
fields, the log by bucket and the page order; render, forms (a yearly
subscription landing as a month) and features on the room; a phone walk
reading the ring, the bars and the subscriptions list on the example.

## D-197 — F, A, T are the boxes; everything else is what you name; FAT is the lean month

**Why.** The owner, on the reworked room (D-196): "remove everything
else, literally arrange it as FAT. Then total FAT and have that be lean
FI." The fourth box, "everything else", was a catch-all nobody could
fill honestly: it doubled the lines named under it, and once Start Here
had guessed a whole unsplit month into it, typing the three real
numbers beside it counted the month twice.

**Decision.** Expenses asks three numbers, F, A, T: food, accommodation
(rent, or mortgage plus tax plus insurance), transportation. Their sum
is the FAT total, shown a month and a year, and it is the **lean
month**: `Schema.fatNeedsCents` is the one place it is added up, and the
FIRE engine's lean variant (`basis: 'fat'` in `data/fire_variants.json`)
reads it at factor 1 whenever all three are typed, falling back to the
table's 70% of spending until then. The room shows that Lean FI number
under the total, at the household's withdrawal rate, linking to FIRE
Number. **Everything else** is no longer typed: once any of F, A, T is
typed, any line in the wants bucket, subscriptions, named lines, the
category boxes in the split, a yearly cost's twelfth, IS everything
else, and the stored total behind it is not read. With no such line the
stored `wants.totalCents` still counts and the room says where it came
from: the remainder Start Here left after the three, an import, a
block's line, or a household saved before the box went. While none of
the three is typed a stored total is the one unsplit month and the
lines are only its split, exactly as before. Nothing already entered
goes dark. The month is F + A + T + everything else (+ therapy when
tracked), and the room says so on four lines under the boxes. The ring
and the bars carry the same four rows. "The lines vs F, A, T" compares
the needs' lines with the three typed numbers once the month is split;
against one unsplit number it compares every line, as before.

The example household feels this: Robin's stored "everything else" of
$720 is read until the example lines are loaded, and then the wants
lines ($465) are everything else and the month with lines reads $2,895,
not $3,150. The engine fixtures built on that month were re-derived,
each exactly $255 a month lighter, and their check names say so.

**Compatibility note.** `Schema.fat(h).wants` changes meaning when any
of the three needs is typed and a wants line exists: it is the wants
lines' sum with source `lines`, never the stored total; with no wants
line it is the stored total with source `typed`, as before.
`Schema.withMonthlyExpensesDeltaCents` lands its delta on the first
typed need when the stored total is not the one in use. The
stored field `expenses.wants.totalCents` stays in the shape and is still
written by Start Here and by "use the lines as my month"; readers that
want "everything else" call `Schema.fat(h).wants` (the lenses' wants
measure now does). `Schema.fatNeedsCents(h)` is new. The FIRE result for
the lean variant carries `expenseSource: 'fat'` and `monthlyBasisCents`
when it used the FAT total. The ownership field `wantsMonthly` anchors
at the lines section.

Gate for this commit: unit suite with the lean pins re-derived (the
demo's FAT is $710 + $1,500 + $220 = $2,430, so lean is $2,430 × 12 ÷ 4%
= $729,000 rather than 70% of $3,150); render, forms and features on
Expenses and render on FIRE Number; a phone walk typing the three and
reading the FAT total, the lean number and everything else from a named
subscription.

## D-198 — Income: the year is columns, counts only what landed on a date, and folds

**Why.** The owner, with their own benefit in the room: "these numbers
do not seem to be based off reality — 869×4 is not 3766 or whatever."
It was not. The benefit was $869 a week with no first date, and
`Ledger.occurrences` draws an undated recurring entry as its yearly
average spread over twelve months, $3,766, on the first of every month,
past and future alike. So the picture said $26,612 had "come in" since
March when nothing in the room could know that, and the month card
netted an average instead of the four or five real landings. Dated, a
weekly entry lands on its real days: $3,476 in a four-Friday month,
$4,345 in a five-Friday one. The same message asked for the year drawn
vertically, to read as progress, and for the whole thing to fold.

**Decision.**

- **Only a dated landing counts as come in.** In the seven months up to
  and including this one, the picture drops any entry with no first
  date; ahead, an undated entry still shows as its average, faded like
  everything ahead. The sentence says "has landed", never "has come
  in", and when nothing is dated it says so: "Nothing here has a first
  date yet, so the picture cannot say what has actually come in." A
  nudge above the chart names each undated recurring entry, says that
  a weekly amount is being averaged and would land on its real days if
  dated, and *When did it start?* opens the entry scrolled to the date.
  The engine is unchanged: Budget and Calendar still take the average
  for an undated entry, which is the right guess for a bucket and the
  wrong claim for a record.
- **Columns.** `Charts.columns` joins `shared/charts.js`: twelve
  stacked columns left to right, a dashed line between this month and
  the next captioned *so far* and *ahead, assumed*, the ahead columns
  at 42% opacity, a value on a column only where the total changes and
  on this month, a title on every segment, one legend. The two
  horizontal halves of D-195 go.
- **The picture folds.** The card is a `<details>`, open by default,
  whose closed face is the eyebrow and the sentence, so a folded
  picture still says the one thing worth knowing.

- **The month's tax scales with what landed.** Reading the owner's
  numbers back found the engine bug behind them: `Ledger.month` took an
  undated entry's monthly average as the gross but netted one landing
  of `amountCents`, so $869 a week undated showed $3,766 gross, $73 of
  tax, and a net a quarter of the gross. The tax, the withheld and the
  owed now scale by gross ÷ amountCents, which is exactly the count of
  landings when they are dated (nothing changes there) and the
  average's share when they are not. The *How this was worked out* row
  says "a monthly average of $869 a week — no first date, so not real
  landings" in that case.

Hand-checked: $869 weekly from Friday 6 March 2026 lands four times in
March, April, June, July and September and five in May and August, and
September's tax is four landings' worth; undated, the month is $3,766
with the same rate on all of it, it is dropped from every past column
and the sentence says nothing has a date.

Gate for this commit: unit suite, the columns chart included; forms on
the Income room; a phone walk with the undated benefit, tapping the
nudge, dating it, and reading the columns change.
## D-199 — Expenses in three steps and one fold

**Why.** The owner, on the FAT rework (D-197): "expenses is confusing.
Make it simpler and more intuitive and make the sections clearer." Nine
blocks on one page, sums in two places, a picture that said nothing
until numbers existed, and folds inside sections inside folds.

**Decision.** The room is five things, in order, each one card:
**Your month at a glance** (the ring and the estimated-vs-actual bars,
or one sentence saying to type the three numbers until there is
anything to draw); **1 · The essentials** (F, A, T, and one line under
them: FAT a month and the Lean FI number); **2 · Everything else** (the
form, subscriptions, anything else, one total line, and the therapy
toggle at its foot); **3 · Your month** (the one figure, and a sentence
saying what it is made of and that the debt minimums leave on top);
and **More**, a single fold holding the yearly costs, the finer split by
category and the three comparisons, which a deep link opens on its way
in. The "kind" of a named line is a select, subscription by default,
rather than five pills. The bucket hints under F, A, T stay, since they
only speak when the lines say more than the number. Nothing stored
changes; the registry's subsections for the room are the five cards.

Gate for this commit: unit suite; render, forms and features on the
room; a phone screenshot of the empty page and of the example with a
subscription, and a deep link into a folded comparison landing open.

## D-200 — Sharing between devices: the share sheet, a smaller link, a pasted link

**Why.** The owner tried to send the share link to themself through a
chat app and hit its limit: the link was over nine thousand characters.
"You need to make it way easier to share." A phone cannot reach a
computer through a link that no chat app will carry.

**Decision.** Three things, no server still. **Send to another device**
is a new first button in Your Data and on the front door, shown only
where the browser has a share sheet, which is every phone: it hands the
export to the sheet as a small file (`Spine.sendToDevice`), so mail,
messages, a drive or a nearby device carry it with no length limit,
and falls back to sharing the link where files cannot be shared. **A
pasted link loads**: Your Data takes a share link pasted into a box and
reads it like a chosen file, with the same Replace or Add choice, for
the case where a link arrived as text. **Copying a long link says so**:
over 1,900 characters, the note says chat apps cut it off and points at
Send. The link itself is not made smaller: it is already deflated, the
constructors do not refill nested blanks so leaving them out is not
lossless, and even a link half the size stays far over a chat app's
limit. The file is the answer; the link stays for a note or an email.

**Compatibility note.** Nothing stored changes and the share code is
byte for byte what it was. `Spine.sendToDevice` and `Spine.siteRoot`
are new.

Gate for this commit: the export suite; unit pins on both pages; render
and features on Your Data and the front door.

## D-201 — A QR code of the share link, drawn here

**Why.** The owner: "can you do a QR code." For the direction Send does
not cover, computer to phone, or two phones side by side, a camera is
faster than any link: point it, tap, and the front door offers to load.

**Decision.** Your Data gains **Show a QR code** beside the link. It
draws the share link as a QR code (byte mode, error-correction L, the
version chosen to fit, the mask chosen by the standard's four penalty
rules) in `shared/qr.js`, written here from the standard's own block
and alignment tables, because D-038 and the README allow no vendored
code and the CDN is off limits anyway. Black modules on white whatever
the theme, with the quiet zone, so any camera reads it. One code holds
2,953 bytes, and that is the catch: the share link is the whole
household deflated, and even the example household packs to 2,816
characters before any snapshot or logged month, so a code fits only a
small household. The button shows only when this household's link fits;
otherwise one line under the buttons says how long the link is, what a
code holds, and that Send carries it as a file. The front door's
offer-before-load is unchanged, so a scanned code never replaces a
household without a yes. Leaving blanks out of the link would shrink it
by under half and is not lossless against the constructors as they
stand; a many-part code needs a scanner on the receiving page, which
means a decoder, which the no-vendored-code rule makes a project of its
own. Neither is done here.

The encoder is proved, not trusted. `tests/qr.test.js` reads every
one of the forty versions and a hundred and twenty random texts back
with two independent decoders (jsqr and ZXing's port, test dependencies
only, in `tests/`), plus the share-link shape and the exact capacity
edge. Each decoder has blind spots on large dense codes that the other
does not, and each fails the same way on the reference library's own
grids, so a code both miss is counted and held under five percent, and
a code that reads as a different text fails outright. Beyond the suite,
the grids were compared module for module against a reference
implementation for forty-odd texts, forced to the same mask: identical
every time.

**Compatibility note.** Nothing stored or shared changes; the code
carries the same link the copy button does. `SLAF.QR` is new and
loaded only by Your Data.

Gate for this commit: the QR suite; unit and export suites; render and
features on Your Data; a phone walk showing the code and its note.

## D-202 — One backup file for everything this browser holds

**Why.** The owner: "i want the backup to be uniform and simple and to
work." Every figure lives in localStorage: one browser, one device, one
"clear browsing data" from gone. Your Data's file carries the household
and the snapshots, which is right for a share link and wrong for a
backup: the preferences, the pinned scenarios, the Skill Tree's seen
marks and the D&D character were in no file at all, and the file still
looked complete. No sync, no account, no server: one device is the true
copy at a time and the file moves the truth.

**The audit.** Every localStorage write in the repo goes through four
wrappers (the spine, Prefs, Scenarios, the D&D store) plus two one-offs
(the Skill Tree's seen marks, the D&D skin). The keys, all of them:
`slaf.household.v2`, `slaf.snapshots.v1`, `slaf.household.unreadable`,
`slaf.prefs.v1`, `slaf.scenarios.v1`, `slaf.skilltree.seen`,
`dnd.character.v1`, `dnd.skin.v1`. Two prefixes, `slaf.` and `dnd.`.
Session-only keys (`slaf.lens`, `slaf.seed.<room>`, `slaf.budget.return`,
`slaf.dash.3d`) live in sessionStorage and are not a backup's business.
The spine's storage probe is written and removed in the same tick.

**Decision.** `shared/backup.js` carries every key under the two prefixes,
uniformly: each key's stored string, as `{json}` where it parses and
`{text}` where it does not, so the file is readable and a plain-string
key (the skin) survives unchanged. Nothing is reshaped, so a new room's
key is carried the day it is written with no wiring here. The file:
`{format:'money-rooms-backup', backupVersion:1, appVersion, schemaVersion,
savedAt, keys}`, named `money-rooms-backup-YYYY-MM-DD.json`.

Loading makes storage under the prefixes MATCH the file: keys the file has
are written, keys it lacks are removed. A backup is a copy of a device,
not a merge; the merge stays in Your Data. Before the first write the
current state is stashed under `slaf.backup.undo.v1`, so the load is one
click reversible until the next load; the stash is in no backup and the
guard does not count it. A write that does not fit puts everything back.
A file from a newer build (backup format or schema version ahead of this
one) is refused with the reason, since the migrations run forward only.
A household file from Your Data still loads here, through the spine, so a
phone that saved one is not a dead end.

The widget is two buttons and a status line, on the Ledger and in
Settings and nowhere else: Save a copy, Load a copy, and Undo last load
while a stash exists. Before a load, one confirm names the file, its date
and build, and what it adds, replaces and removes. After a load or an undo
the page reloads, so every module that caches (the spine, Prefs,
Scenarios) reads the new state; that is simpler and more honest than
teaching each cache to drop itself.

**The drift guard, twice.** On a dev host (localhost, a LAN address, a
file: URL) the widget warns in the console about any stored key outside
the prefixes; on the live site it is silent. That runs where the module
is loaded, the Ledger and Settings. The gate that actually stops a new
room shipping outside the prefixes is static: `test/run.js` resolves
every `localStorage.setItem` in the repo, through the wrappers, to a key
and fails on one outside the prefixes or one it cannot resolve, and pins
the audited list so a new key is a deliberate edit.

**The build stamp.** `Schema.BUILD`, a date, printed beside the version in
every footer ("Money Rooms v2.0 · build 2026-09-10") and in every backup,
so a phone showing an old page can be told from a bug. There is no build
step, so `node tools/stamp-build.js` sets it in schema.js (and the
vendored copy) and version.json; the test holds the three together.

**Not done, on purpose.** No storage abstraction under the rooms, no
merging of two devices, no sync. The Your Data file is unchanged, so every
share link and QR code still works.

**Compatibility.** No stored shape or key changed. One new key,
`slaf.backup.undo.v1`, written only by a load and removed by an undo.

## D-203 — Send, when the browser says it has a share sheet and then refuses it

**Why.** The owner tapped Send on a phone and got "Permission denied" in
red, and nothing else. The page had been opened from inside another app
(the X and the chevron in the header are that app's own browser). Those
browsers report `navigator.share` and then refuse it with
NotAllowedError. The file path was already synchronous, so it was not a
lost tap; the browser simply will not open a sheet there.

**Decision.** `Spine.sendToDevice()` falls through: the file, then the
link (some sheets take a URL and not a file), and only then one plain
error marked `blocked` that says what happened and what to do. A cancel
stays a cancel. Your Data and the front door catch a blocked error and
download the file instead, saying so: find it in Downloads and send it
from there, or open the page in Chrome or Safari and try Send again.
"Permission denied" never reaches the screen.

## D-204 — G1: protect the data that already exists

**Why.** The Ledger rework brief (five questions, DAITE doors, progressive
fill) opens with a hardening pass, G1, because the biggest problem with
entering a lot of data is that people stop trusting what they typed. Four
things could lose or corrupt a household today. Three are fixed here; the
fourth (a domain of its own) needs the owner, below.

**1. Dates on the person's clock.** `toISOString()` is UTC. In New York
anything saved after 8pm got tomorrow's date and the last evening of a
month landed in the next month. Thirteen sites stamped a day that way.
`Schema.localDay(when)` and `Schema.localMonth(when)` are now the only
way to stamp today (a day string passes through, a Date is formatted in
local time, nonsense is null). Arithmetic on a YYYY-MM-DD string (a day
plus n days, a month later) goes through `Schema.isoDayUTC(date)`, which
formats UTC parts without touching the clock, so day maths stays
timezone-free. Export filenames carry the local day too. `test/run.js`
fails on `toISOString().slice`, `.substr`, `.substring` or `.split`
anywhere the app runs, and runs a child process at 11:30pm on Aug 31 in
America/New_York to prove the day reads Aug 31 while UTC would have said
September.

**2. Surviving Safari's seven-day wipe.** Safari drops a site's storage
after seven days without a visit unless the site is persistent or on the
Home Screen, and this app's rhythm is monthly. The spine now calls
`navigator.storage.persist()` once per session, on the first real write,
and remembers the answer in Prefs (`storage.persisted`); `storageState()`
reports it. On iPhone Safari that is not installed, every room shows one
quiet line, once, with "Add to Home Screen" and a Got it that sets
`a2hs.seen`; never a popup, never on an installed web app. Every export
(the backup, Your Data's file, Send) notes the moment in Prefs
(`backup.lastExportAt`); the Backup box's idle line reads it back and,
past thirty days, says the copy is old and worth refreshing. And the
spine takes an automatic snapshot before a bulk change: before an import
(Replace), before a merge (Add), and before a change of situation. Each
carries a `reason` ('before-import', 'before-merge',
'before-situation-change'; null for one the person froze), is skipped when
there is nothing to keep, and is not doubled within a minute. On Replace
the file's snapshots become the snapshots, as they always did, plus the
one just taken, so a wrong file is one snapshot from the numbers it
replaced. A backup load has its own undo stash (D-202) instead.

**3. The page and the core must be the same build.** Every HTML file now
carries `<meta name="slaf-build">` with the same stamp as `Schema.BUILD`
(`node tools/stamp-build.js` writes all 84 pages, the schema, its vendored
copy and version.json). At load the spine compares the two; a mismatch, a
half-finished deploy or a cached old page over a new core, sets
`storageState()` to `stale-page`, not writable, and every room shows
"Updating, reload in a moment" at the top with a Reload button. The
session still reads and still works in memory; nothing reaches storage
until the two agree. No meta at all (a test, a bare page) is not a
mismatch.

**4. Gating the deploy.** `.github/workflows/test.yml` runs the whole suite
on every push and pull request: the unit suite, the D&D suite, the export
suite, lane 2, and the browser gates against a local server.
`.github/workflows/pages.yml` publishes to Pages only after that job is
green, and only once the owner switches the repository's Pages source to
"GitHub Actions" and sets the repository variable `PAGES_VIA_ACTIONS` to
`true`; until both, the branch publish carries on as before and the deploy
job is skipped. Flipping the switch is a Pages setting, which the brief
says to ask about first.

**Not done here, waiting on the owner.** A domain of its own (G1.1):
everything at sapphirestoneage.github.io is one origin, so any page ever
hosted there can read the household. Moving Money Rooms to a subdomain of
stresslessaboutmoney.com and the D&D sheet out of this repo needs DNS and
a Pages setting; the migration (an export on the old origin with a link to
the new one) is a small build once the domain exists.

**Compatibility.** No stored household field changed. A snapshot record
gains an optional `reason` (string or null); older records without it
read as null. Two new Prefs keys: `storage.persisted` (boolean) and
`backup.lastExportAt` (ISO timestamp), plus `a2hs.seen` (boolean). One
new storage status, `stale-page`. Rooms that call `storageState()` see two
new fields, `pageBuild` and `coreBuild`, and `persisted`.
`shared/roomexport.js` now takes the schema as a dependency.

## D-205 — Phase A: suggestions, derived and never stored

**Why.** The Ledger rework brief: every answer should fill more than one
row, as suggestions, never as silent values. A user between jobs answered
six things and could have filled forty rows by hand; the app asked for
all seventy instead.

**Decision: a suggestion is derived, never stored.** `shared/suggest.js`
gains a rules half beside its painting half (D-060). `suggestions(h,
tables)` runs every rule a ledger row names in its new `suggestFrom`
(data/ledger-rows.json) and returns what it could guess: the row, the
value, one line saying how, and the data/ file(s) behind it. A row the
person has entered is never suggested; a row with no rule stays blank; a
rule with nothing to read returns nothing; an empty household gets no
suggestions at all. Because nothing is stored, SPEC.md §4 and §5 stand
unchanged: the household never holds a guess, so Empty ≠ zero holds by
construction rather than by a flag. A rule may read an earlier suggestion
in the same run (the state feeds the benefit cap, filing and state feed
the marginal rate) and then says so in `dependsOn`; `overlay(h, tables)`
hands a formula a COPY with the suggestions applied plus the list of what
it used, so any output built on one is labelled rough by its caller.

**Confirming.** One tap: `confirm(s)` tags the write `source:
'suggested', confidence: 'roughly'` (a new entry in `Schema.SOURCES`) and
writes through `Ownership.write`, so the owner room's own path runs.
That needed write paths that did not exist: only cash and investments had
one (D-057). Every enterable row now has one, in a table beside the
ownership map, each the same spine call its owner room makes; the ten
one-line-per-item rows (a debt's balance, rate and minimum; an asset's
value, tax type, tier and basis; a source's type and whether it survives
the job; a yearly line) gained ownership entries, DAITE paths and registry
writer lines so the registry still agrees with every owner. The Express
page and the in-room asks will write through the same paths, so one owner
per number survives all three doors. An N/A suggestion ("no employer, so
no match") is information, not a value; confirming it writes nothing.

**The starter rules,** each one function, every number from data/:
ZIP → state (a new `data/zip_prefixes.json`, USPS three-digit prefixes,
recalled and marked verify); age → buffer months (Rule of 5, added to
`data/savings_presets.json`); between jobs + last pay + state → weekly
benefit (high quarter ÷ 26, capped; the method and New York's 2026 cap of
$869 added to `data/ui_benefits.json`); between jobs → match and
contribution N/A; between jobs → term life and disability $0 ("employer
coverage usually ends with the job", added to
`data/protection_conventions.json`); one adult → filing single (head of
household with dependents), dependents none; pay + state + filing →
marginal rate from the federal and state bracket files through
engines/tax.js; under 26 → "On a parent’s plan?" as one tap (the ACA age
added to protection_conventions); a card with a balance and no minimum →
2% or $25 from `data/debt_rules.json`. Plus five stand-ins the intake
already guessed (D-094), now suggestions too: spending from pay, a
typical deductible, the age milestone for investments, the floor and a
marketplace premium between jobs.

**The registry rows** carry seven new fields: `round` (1 for the five
first-round rows: birth date, ZIP, situation, pay, cash), `suggestFrom`,
`askIn` (the room that asks the row in context, Phase D), `door` (D, A,
I, T, E, you) and `level` (1 how much, 2 where it sits, 3 what it is made
of, 4 what it costs and where it came from; Phase C2), `moves` (whether a
monthly refresh re-asks it; G2.5) and `unlocks` (the insight the row
feeds; G2.10, and the build fails on a row without one). The buffer
target now applies to anyone, not only variable income, since the Rule
of 5 suggests it for everyone.

**On the Ledger,** a missing row with a suggestion shows it apart: a
quarter glyph, the value as a dashed "use it" button, and "How I guessed
this" folded under it with the data/ file named. Tapping writes it.

**Tests.** The persona (27, ZIP 12203, between jobs, last pay $95,000,
$3,000 cash): NY, $869 a week, match N/A, single, 5.4 months, fifteen
suggestions, and the stored household byte-identical before and after.
Tom: every suggestion names an existing data/ file. Empty ≠ zero: a row
without a rule is never suggested, an entered row is never suggested, an
empty household gets nothing. Confirm stamps suggested / roughly and the
benefit stops leaning on the state once the state is real.

**Compatibility.** No stored household field changed. `Schema.SOURCES`
gains `'suggested'`. The `unemployment` ownership reader now also returns
a weekly amount when the status is unset (a confirmed suggestion lands
there); rooms that read it as a status string should check `kind ===
'weekly'` on the result. `Ownership.write(fieldId, value, ctx)` takes a
third argument naming the item for a repeat row.

## D-206 — Phase B: the first round is five questions

**Why.** The brief: the first round is five questions, time to first
insight under 60 seconds, and nothing else. A user between jobs
answered six things and that was enough to fill forty rows; the app asked
for seventy. Start Here, the one-pager, stays as the long form; it is no
longer the way in.

**Decision.** `rooms/first-round.html`: five screens, one question each,
big tap targets, built once in the markup and only revealed (LIVE-FORM:
built once). Age (or the birth month and year, folded), ZIP, situation as
four buttons (working, between jobs, self-employed, a mix), pay a year
(the label turns into "Your last pay" between jobs), cash on hand. Each
answer writes through its owner's path (`Ownership.write`), so Start Here
still owns every one of them. Between jobs the pay lands on the person as
the last pay: a new ownership field `lastPay` with its own ledger row,
DAITE path `income.sources[].lastPay` and writer line, so the benefit
estimate, the marginal rate and the milestones can read it while the
gross-pay row does not apply. Skipping a screen is fine; a blank writes
nothing and never erases.

**Then one card.** `shared/doors.js` (new; Phase C builds the door
screen on it) gives `firstInsight(h, tables)`: about how many months of
runway, from the cash entered against a month's spending, suggested
where it is not entered (the suggestion overlay, D-205), plus the weekly
benefit between jobs. It says rough whenever a suggestion went into it
and how many, and never makes a number from nothing: without cash, or
without any spending figure, it says which. Under it, one sentence
pointing at one door, from `recommend()`: the most expensive unknown. A
card whose minimum is a guess costs more than any other blank, so Debt
first; then whether there is any debt at all; then the benefit between
jobs; then spending; then what is invested; then the tax facts; then the
door with the most rows open. No list of what is missing anywhere in the
flow.

**The front door** now says "Start: five questions", with the full
one-pager one quiet line below. The First Round sits in the home group
ahead of Start Here, in every one of the twenty arrangements, in the
sphere beside gross pay, and on the path first.

**Tests.** Alexis: five screens, the insight immediately (1.6 seconds on
a phone in the gate), zero lists of missing fields in the flow, every
answer stored as the persona typed it. `test/forms.js` taps through the
five screens with the keyboard staying open (a tap-only step was added to
the walk for Next buttons and choices). The persona's card reads about
five months of runway against suggested spending with $869 a week coming
in, rough, with Debt as the door.

**Compatibility.** One new ownership field, `lastPay`, reading
`person.unemployment.lastGrossAnnualCents`, which Start Here already
wrote. No stored shape changed.

## D-207 — Phases C, C2, D, E: the doors, the four levels, the inline ask, the line

**Why.** The brief: the Ledger should feel like "which DAITE do you want
to go into now?", not a long list; every door should go deeper in the
same four steps; a room that needs a blank row should ask it right there;
and one line should say how much of the picture is understood.

**The home is six doors.** `rooms/ledger.html` opens with "Which one do
you want to go into now?" and six cards from `shared/doors.js`: the
letter, the label, the DAITE say line, one headline number (Debt: total
owed; Assets: net worth; Income: money in a month, take-home where the
tax facts allow it, gross before that; Taxes: marginal rate; Expenses:
money out a month; You: situation), and a small ring, "k of n known". A
blank headline reads "not entered yet", never $0; "none" when the person
said there is no debt. One door is recommended with its reason from
`recommend()` (D-206). Search still finds any row at any time.

**Inside a door, three groups only.** Confirm these (the door's
suggestions at or below the level, one tap each), Add these (the next
three blank rows, each a tap target into its owner room, with what it
unlocks), and "N more unlock as you use the app" as a line. Plus the
level: 1 how much, 2 where it sits, 3 what it is made of, 4 what it costs
and where it came from, the same names in every door. A door is on the
lowest level with a blank row (a one-line-per-item row is blank while any
item lacks the value, so a card without a minimum holds Debt at level 3);
under it, one line says what the next level unlocks, read off its rows'
`unlocks`.

**Every level that has an engine behind it shows the insight it unlocks**
(`levelInsight`): Debt 1 total owed and the minimums; Debt 3 interest a
month and the payoff order, rough while a rate is missing and naming
which; Assets 1 net worth; Assets 2 reachable money in an emergency from
the liquidity ladder, rough while an account's tax type is unknown;
Assets 4 the Roth's free contributions from its basis, rough and naming
the account while the basis is blank, never assuming zero; Income 1
take-home a month; Income 4 the real hourly wage; Taxes 1 what the year
costs and the marginal rate; Expenses 1 spending a month; Expenses 4 the
leak line, subscriptions and fees a year from the repeating lines; You 1
age, situation, state. A level without an engine shows what its rows
unlock in words. A door shows its own level's insight and any deeper one
that already computes, two at most.

**Not built, on purpose.** Holdings inside an account, expense ratios per
holding, annual fees per card, promo end dates: the brief says holdings
are a new stored shape and to stop and ask before adding it. So the fee
drag insight (Assets 4) and card fees (Debt 4) wait on that answer; the
door still names them in the level line.

**The spheres.** The nine spheres are kept, not deleted, under a fold at
the bottom of the Ledger, with the target and the code that draws them.
Proposal, for a decision: retire the spheres as the depth order (the
four levels do that job now, the same in every door) and keep
`data/spheres.json` as an overall progress layer only, its virtue line
feeding the "already good" sentence on the doors home. Until then the
fold stays.

**Ask at the moment of need (Phase D).** `shared/ask.js`: when a room
opens and a row whose `askIn` is that room is blank, the room asks it at
the top, inline, one question, with a "Suggested … use it" chip beside
the box when the engine has a guess. At most one ask per visit. The
answer writes through the owner (`Ownership.write`); the ownership map is
unchanged. Debt Payoff asks each card's real minimum, the FI room asks
allocation, Estate asks the will, the power of attorney, the
beneficiaries. It mounts from `Progress.mount`, so no room needs wiring,
and loads what a room does not carry (the registry reader, the
suggestion engine) itself. Never on the Ledger, the First Round, Start
Here or Express, which ask their own way.

**The line (Phase E).** "You understand X% of your financial picture",
on the doors home: over every applicable enterable row, a confirmed
number counts 1, a rough one 0.85, a stale one 0.7, a suggestion the
person has not confirmed 0.5, a blank 0, from a new `rowStates` block in
`data/confidence_weights.json`. Each unlock is functionality, never a
badge.

**Compatibility.** No stored shape changed. A per-item write (a card's
minimum) stamps no per-item provenance yet: the field ids are per row,
not per item, so `meta.fields.debtMinPayment` describes the row; per-item
provenance is a G2 concern.

## D-208 — Express: the whole form at once, a second view of the same rows

**Why.** FI people and coaches already know their numbers and want every
question on one page, not a walk. The brief's Phase F.

**Decision.** `rooms/express.html`: one scrolling form grouped by door (D,
A, I, T, E, You) and level 1 to 4, each a fold open by default; only the
rows that apply, toggled live; debts, accounts, sources and yearly lines
repeatable with "+ Add another", named by lender and last four; a
suggestion as a chip beside the box, never in it; every box saves on
change through `Ownership.write`, a new item through `Ownership.addItem`
(the list owner's constructor); a sticky bar with the understanding line
and a jump menu. The front door offers "Walk me through it" (the First
Round) and "Give me the whole form"; `prefs.path = fi` leads with Express.

**Replaces or removes.** Nothing yet: STATUS.md already decided Start Here
retires into the Ledger; the First Round and Express are the two ways in
that replace it, and Start Here stays only until its owner role moves.

**Stored shape.** No change. `Ownership.addItem(kind, fields)` and
`removeItem(kind, id)` are new shared paths; Express owns no field.

**Verified.** `node test/run.js`; `node test/forms.js` (Express and the
First Round walks); the phone walk: the same five answers in the First
Round and in Express give a byte-identical household, the situation
toggle hides and shows rows without clearing anything typed.

## D-209 — G2: numbers that stay trustworthy (moving rows, the life-change sheet, two more states, units)

**Why.** People stop trusting what they typed when it goes stale, gets
asked again, or quietly turns wrong. The brief's G2, built alongside B to F.

**Decision.** `rooms/refresh.html` walks only the rows with `moves: true`
in `data/ledger-rows.json` (`LedgerRows.moving`), one line per debt,
account, source or yearly cost, pre-filled, "Still true" re-confirms, a
typed figure writes through `Ownership.write` with the item id, and a
"since last time" line per row reads the last refresh snapshot's `rows`.
A situation change records `meta.reopen`; `shared/reopen.js` shows one
sheet on the next page with the rows in the registry's `reopen` map plus
any row that newly applies; nothing is cleared. "Not sure yet" is a mark
in `meta.notSure` with an expected month, never a value; "from memory" is
source `memory` below confirmed; both weigh in `confidence_weights.rowStates`.
`LedgerRows.unitLabel` and `period` put gross or net and the period beside
every money box in the ask, Express and the Refresh; `Money.convertPeriod`
converts a figure typed a week or a year before it saves; `Ask.slip` turns
0.24 or 2499 on a percent box into a plain question. List items are named
lender plus last four. `test/onefact.js` opens every askIn room after
Express answered the rows and fails on any repeat question.

**Replaces or removes.** The Refresh's fixed three boxes and its rough-rows
list (15.10): the doors carry the rough rows now.

**Stored shape.** `meta.notSure` (`{ key: { at, expectedBy } }`, key a field
id or `fieldId:itemId`) and `meta.reopen` (`{ field, from, to, at, dismissed }`
or null) added to `slaf.household.v2`; `memory` added to `Schema.SOURCES`;
snapshots gain `rows` (null except on a refresh). Older households read with
both absent, which every reader treats as none. `data/ledger-rows.json`
gains a top-level `reopen` map. A future reader must treat a `notSure` row
as blank in every formula.

**Verified.** `node test/run.js` (28704), `node test/forms.js`,
`node test/onefact.js` (58), `node test/render.js` on refresh, express and
debt-payoff; the phone walk: a week's food converts to a month before
saving, from memory and not sure yet show as words, the slip asks 24% or
0.24%, the Refresh lists five moving lines and says what changed, the
sheet after between jobs → working lists six rows and clears nothing.

## D-210 — G3 with J1: hostile files, the policy, attribution, January 1, the error log, the release walk, the spreadsheet

**Why.** Before anyone else sees the app, a pasted file must not be able
to run code, "nothing leaves your browser" must be enforced, a new year
must not silently use old tables, an error must not be a blank screen,
and the numbers must be readable without the app. The brief's G3 and J1.

**Decision.** `test/xss.js` types `<img src=x onerror=…>` into every text
box of every room and loads a backup whose every string is the trap;
`test/run.js` ratchets `innerHTML` concatenations without `esc()` against
`test/xss-baseline.json` (58 spots today; a file may only go down).
`tools/stamp-build.js` puts a Content Security Policy and
`shared/errlog.js` (first script) on every page: only this origin,
`form-action 'none'`, nothing embedded; `connect-src 'self'` instead of
the brief's `'none'` because `shared/reference.js` fetches `data/*.json`
from the same origin. Every file under `data/` names a `source` and an
`asOf`. Year tables opt in with `taxYear`; `Reference.yearNote` says
"using 2026 limits" past that year, on `Tax.estimate`, the IRA and 401(k)
presets, and the footer; `test/jan1.js` runs with the clock at 2027-01-01.
The error log keeps the last 50 entries with every number of three or
more digits blanked, shows "Something went wrong. Your data is safe." with
Copy bug report, and rides in the backup like any `slaf.` key. `RELEASE.md`
names the four walks on a real Android phone and a real iPhone.
`shared/csvexport.js` writes one CSV per door with a readme in a
store-only zip, from Your Data, beside a link to the GitHub zip of the app.

**Replaces or removes.** Nothing: hardening adds gates and one export.

**Stored shape.** New key `slaf.errlog.v1` (an array of `{ at, kind, room,
message, where, build }`, no values). `taxYear: 2026` added to
`aca_2026.json` and `ss_bend_points_2026.json`; `source` added to the ten
event templates. No change to `slaf.household.v2`. A LICENSE is still the
owner's choice (stop-and-ask, G3.14).

**Verified.** `node test/run.js`, `node test/jan1.js` (14), `node test/xss.js`
(93, the trap never ran), `node test/onefact.js`, `node test/forms.js`;
the phone walk: no policy violation in the console on eight pages, a thrown
error shows the panel and a scrubbed log line, the spreadsheet zip
downloads and opens with seven entries.

## D-211 — H1, H3, H2: tap any number, your next $100 ranked, earned vs learned

**Why.** A number nobody can check is a number nobody trusts; the next
hundred dollars is the question everyone actually has; and a net worth
that rose because a basis was typed in is not the same as one that rose
because a card was paid down. The brief's H1, H3 and H2, in that order.

**Decision.** Every computed row in `data/ledger-rows.json` carries a
`formula`: the one engine function (`fn`, resolved by the build, which
fails when it is missing), the formula in words, its terms and its
reference tables. `shared/showmath.js` turns that into one sheet a page
(the words, the values plugged in, each input linked to its row, the
`data/` file and year, what would change this most, rough marked here);
the Ledger's computed rows and door headlines and Express's computed
boxes open it. `engines/next100.js` ranks every place the next $100 can
go on one scale, the return: a debt at its rate and the match at its
cents on the dollar are guaranteed, investing is expected with the band
from `data/return_bands.json`; never blended; the order of operations is
a note on each line, not a re-sort; `rooms/next-hundred.html` reads it.
`engines/sincelast.js` splits every change since the last snapshot into
money that moved (a moving row updated) and knowledge added (a first
entry, a confidence upgrade, a fixed fact corrected); the net worth strip
on the doors home says both, and they always add up to the whole.

**Replaces or removes.** Nothing: three readings of rows that exist.

**Stored shape.** Snapshots gain `fieldMeta` (`{ id: { confidence, source,
asOf } }`), taken by the spine on every snapshot; older snapshots read
with it absent, so a confidence upgrade before the first new snapshot is
not counted. `slaf.household.v2` unchanged. The new room is in every
arrangement in `data/layouts.json` beside the FOO Ladder.

**Verified.** `node test/run.js`; `node test/render.js` and
`node test/features.js` on next-hundred and the Ledger; the phone walk:
the Assets headline opens the sheet with the plugged-in sum, the ranked
list puts the match (50 cents on the dollar) above the 22.9% card above
investing, and the strip reads $700 earned after a cash change.

## D-212 — H4, H5, H7, H8: reachable money, the popular rules, privacy proved, share the shape

**Why.** The brief's H4 to H8, less H6. H6 (the real-history stress test)
needs sourced annual returns and inflation from 1871 in `data/`, and this
session's network egress refused the source pages; a rule that needs
reference data not yet in `data/` is a stop-and-ask, so H6 and the
pre-mortem that reads it (I7) wait for that file.

**Decision.** `engines/reachable.js` and `rooms/reachable.html`: an
amount and a by-when, the order to pull it and what each dollar costs;
cash and Roth contributions free, taxable on the gains at the rate on the
first dollar of gains above this year's taxable income, pre-tax at the
marginal federal plus state plus the 10% penalty under 59½, Roth earnings
the same until 59½; home equity shown, never counted; a missing basis or
date of birth is rough and named. `data/advice.json` and
`engines/advicerules.js`: nine popular rules with who said them, each
read as conditions over rows into applies now, not yet, outgrown, or
can't tell yet naming the deciding row, shown in the Unlearning room.
`Progress.privacyReceipt`: the footer counts requests to any other origin
from the browser's own resource timing and prints the bytes, or lists the
hosts. `shared/sharecard.js` and `rooms/progress-card.html`: five card
types carrying only ratios, percentages and time in the link, from a
fixed field list so a balance cannot be encoded; the doors home links it.

**Replaces or removes.** Nothing.

**Stored shape.** No change; a card lives in its link and nowhere else.
`advice` joins `Reference.TABLE_FILES`. Two rooms join every arrangement.

**Verified.** `node test/run.js` (the waterfall by hand on fixed rates,
every card leak-scanned), render and features gates on the three rooms,
the phone walk: the footer reads 0 bytes, the card opens from its link
with no amount on it.

## D-213 — I1, I3, I4, I5: Money Wrapped, the rank guess, the coast date, the Unlearning Quiz

**Why.** The brief's Phase I, the shareable ideas; I1 has a real
deadline, December 1, 2026. I2 (the cost of not knowing) follows on its
own; I6 waits for Eli's taxonomy, I7 for the H6 data, and I8 for the
roots-to-branches spine, which is not built yet (§11, task open).

**Decision.** `engines/wrapped.js` and `rooms/wrapped.html`: the year's
first snapshot re-run through the FI engine against now gives days of
freedom; the priciest recurring cost is priced in hours at the real
hourly wage; the biggest earned change is a percent of where it started
and the numbers learned a count, both from `engines/sincelast.js`; every
December and on demand, shareable as a card with days, hours, a percent
and a count only. `engines/coast.js` and `rooms/coast-date.html`: a
month-by-month walk, its own formula, real return from the assumptions,
today's dollars, "not reachable at this pace" said plainly, plus the
reverse view. `engines/rankguess.js` and `rooms/rank-guess.html`: a
slider guess before the survey band, bands never ranks, below the median
the copy names what the next band takes; the guess is a preference.
The Unlearning room gains the five-question quiz, each question skipped
when the Ledger has the reading, answers page-local, three rules most
worth letting go, shareable as names only. Two card types join
`shared/sharecard.js` with hours, counts and rule ids on the field list.

**Replaces or removes.** Nothing.

**Stored shape.** No change to the household. Prefs gain `rank.guess`.

**Verified.** `node test/run.js` (the coast date by hand: 60 months at no
growth, coast now when the pot doubles on its own, never at 2%; the
persona year gives four lines with no cents value), render and features
gates on the three rooms and Unlearning, the phone walk.

## D-214 — I2, J2, J3, J6: the cost of not knowing, the Comeback, the real pay cycle, no bare point

**Why.** The brief's I2 and the cheap J items. J4, J5, J7 and J8 follow on
their own; J7's gift privacy is a stop-and-ask.

**Decision.** `data/plausible_ranges.json` (confidence recalled, verify
true) gives a low and a high per commonly blank row and the insight it
feeds; `engines/notknowing.js` sets the row to each bound on a copy of
the household, never the spine, and reads the insight at both; the swing
is phrased as a swing, never as money lost, and the doors' "Add these"
sorts blanks by it. `rooms/comeback.html`: after 21 days away
(`Progress.COMEBACK_DAYS`, the last visit a preference) the front door
opens once on Welcome Back, which asks only the moving rows, oldest
first, and ends on the earned-vs-learned strip; `test/comeback.js` sets
the clock 45 days ahead and holds a banned-words list. The lens gains
"a payday" (weekly, every two weeks, twice a month, monthly from
`data/calendar_conventions.json`; irregular reads one low month), and
the calendar names a three- or five-paycheck month. The coast date and
the FI card carry their range from the return bands beside the point.

**Replaces or removes.** Nothing.

**Stored shape.** No change to the household. Prefs gain `visit.last` and
`comeback.due`. `plausibleRanges` joins `Reference.TABLE_FILES`.

**Verified.** `node test/run.js`, `node test/comeback.js` (9), render and
features gates on comeback and the Ledger; the phone walk.

## D-215 — J4, J5: bank CSV import on-device, the subscription finder

**Why.** The two things reviews ask for most after "don't lose my data":
get the numbers in from the bank without typing, and show me what I am
paying for every month without noticing.

**Decision.** `engines/bankcsv.js`: a CSV from a bank or card site is
parsed in the browser (comma, semicolon or tab; quoted fields), the
columns guessed from the headings and remembered per bank by their
signature in a preference, every line previewed, spending written to the
expense log as dated entries with the date from the file, deposits shown
and left out, and a line already in the log (same date, amount and
description) skipped, so the same file twice changes nothing. Three
invented layouts are fixtures. `engines/subscriptions.js`: charges that
repeat weekly, fortnightly, monthly, quarterly or yearly at a similar
amount (within 15%), each with its yearly cost and its hours of work at
the real wage; the person confirms, dismisses, or marks "cancel this",
a reminder stored on the household and never an action; the Expenses
door's level 4 and Money Wrapped read the leak line. `rooms/subscriptions.html`
owns the decisions; Your Data gains the Bank CSV section.

**Replaces or removes.** Nothing.

**Stored shape.** `household.subscriptions` added to `slaf.household.v2`:
`[{ key, status: confirmed | dismissed | cancel, label, yearlyCents, at }]`,
normalised by the constructor; absent reads as empty. Log entries from a
bank import carry `source: 'log'`, `categorizedBy: 'bank-csv'`, `period:
'once'` and their `date`. Prefs gain `bankcsv.maps`.

**Verified.** `node test/run.js` (three layouts give one result; the same
statement twice changes nothing; the finder names the two monthly charges
and prices them), render and features gates on the two rooms, the phone
walk with the fixture file.

## D-216 — J7, J8: two views of Partner, Roth conversions before 65

**Why.** A couple wants one sentence, not a room, most days; and the
two of them want to know whose each account is without a second store.
Between leaving work and Medicare, a Roth conversion is reported income
and reported income sets the marketplace premium: nothing in the app
priced the two together.

**Decision.** `rooms/partner.html` gains two views of the same rows: the
full room, and "Are we on track?", one sentence from
`Partner.onTrack()` in `engines/partner.js`, read off `split()` (out of
pocket is "no", a share past the watch line "close", both take-homes
known "yes", else "can't tell"). Each adult keeps their own default view
as a preference (`partner.view.<personId>`, `partner.viewer`), never on
the household. `Partner.tags()` labels every account and debt mine /
yours / ours / theirs from the viewer's side, read off `ownerIds` through
`Schema.ownerOf`. Gift privacy is not built: it waits on the owner.
`engines/rothaca.js` walks each year to 65: federal ordinary tax on
other income plus the conversion (`Tax.ordinaryTax`), the premium after
the credit (`Tax.acaCliff`, the benchmark typed by the person, never
guessed), under two rules, the cliff in force and the no-cliff cap
(`aca.ifNoCliff.capPercent`), shown as a range. `rooms/roth-aca.html`
sits behind the `preMedicare` switch and writes nothing.

**Replaces or removes.** Nothing: the brief adds views and one what-if
room, and the freeze does not cover them.

**Stored shape.** No change to `slaf.household.v2`. Prefs gain
`partner.view.<personId>` and `partner.viewer`. `data/aca_2026.json`
gains `ifNoCliff`.

**Verified.** `node test/run.js` (the sentence for each state, the tags
from either side, the household byte-identical after both; year one
tax and premium by hand under and over the cliff, the range, the
baseline, the capped conversion, every empty state), the render,
features and forms gates on both rooms, the phone walk (both views,
the viewer switch remembered across a reload, the switch off).

## D-217 — K4, K6, K7, K11: one countdown, four skins

**Why.** Every "when can I afford it" in the brief is the same sum with a
different name, and a suite that lets each room walk its own months ends
up with four answers to one question.

**Decision.** `engines/countdown.js` holds the one `goalCountdown()`:
target, set aside, a month's contribution, what it earns, the return
bands for a range, and a `monthlyNeededCents()` for the honest
alternative when a date is out of reach. Four skins on it, each a
standalone room writing nothing to the household: `engines/race.js` and
`rooms/race.html` (the next $100K rung and every rung to $1M, saving and
growth split at each, shareable as dates only through a `race` card);
`engines/downpayment.js` and `rooms/down-payment.html` (3.5% FHA, 5%, 10%
and 20% down, each with closing costs, reserves and the payment from
`engines/housing.js`; a home block on request); `engines/quitfund.js`
and `rooms/quit-fund.html` (months of freedom on the free tiers of the
reachable-money waterfall over the floor month plus COBRA cover; laid
off counts the state benefit, quit counts none); `engines/wedding.js`
and `rooms/wedding.html` (a total or a build-up from
`data/wedding_defaults.json`, each extra table in dollars and FI days
through the lens; a marriage block on request). Cash goals count at 0%,
so their range collapses on purpose. `test/run.js` fails the build if a
skin walks its own months.

**Replaces or removes.** Nothing: four new rooms and one shared engine.

**Stored shape.** No change to `slaf.household.v2`. New tables
`data/down_payment.json` and `data/wedding_defaults.json`, both marked
unverified. The scenarios store may gain a home or marriage block from
the two rooms that offer one.

**Verified.** `node test/run.js` (the countdown by hand, the demo's
rungs shrinking with growth taking over, the 20%-down payment to the
cent and its 78 months, family help moving every date, quit versus laid
off changing only the benefit, the wedding build-up and its target
month), the render, features and forms gates on the four rooms, the
phone walk.

## D-218 — K1, K3: the Middle Class Trap Test and the Referee

**Why.** People already argue these debates on podcasts; the app can be
the referee that runs both sides on the person's own numbers and never
picks a side in general.

**Decision.** `data/early_access_rules_2026.json` holds every rule for
reaching retirement money early (the access age, the penalty, the
seasoning years, the 72(t) method and rate ceiling, the Rule of 55 age,
the single life expectancy table, the home-equity borrowing share), each
with its statute or publication named and marked unverified.
`engines/trap.js` runs four paths year by year from the retirement age to
the access age: bridge accounts, the Roth conversion ladder, 72(t)
payments and the Rule of 55, with lead-time savings landing in the bridge,
federal tax from `engines/tax.js`, the 72(t) payment from
`engines/projection.js`, verdicts Trapped / Tight / Free with the range
across the three bands, and the earliest age not trapped per path.
`rooms/middle-class-trap.html` names both sides with their sources and
says what the numbers say. `data/debates.json` holds seven debates, each
side's best case with its source, the fields read and the flip point;
`engines/debates.js` runs each through the shared engines;
`rooms/debates.html` shows both sides, the answer as a range, the flip
point and the distance to it, shareable as the verdict only through a
`debate` card.

**Replaces or removes.** Nothing: two new rooms, two tables, two engines.

**Stored shape.** No change to `slaf.household.v2`.

**Verified.** `node test/run.js` (the brief's four households: trapped
in two years under bridge alone, the ladder reaching Free with eight
years of lead, the ladder unable to start with no bridge, Free under
every path with a solid bridge; the 72(t) payment to the cent; each
debate's answer flipping as the key input crosses its flip point), the
render, features and forms gates on both rooms, the phone walk.

## D-219 — K2, K5, K8, K9, K10: the One-Pager, the break, the offers, the degree, the car

**Why.** The rest of Phase K: the "one pager out" half of the suite's core
goal, and four decisions people bring to a friend who is good with money.

**Decision.** `engines/onepager.js` and `rooms/one-pager.html`: one page
of the household for an audience (partner, coach, lender prep, planner,
podcast), Private with full numbers or Public with ratios, percentages
and time only (checked against the share-card leak rule), any section
switchable, a print stylesheet, and a Private file in the shape Your Data
imports so a coach opens it as an intake. Every figure comes from the
engine that owns it; blanks stay blank. `engines/microretirement.js` and
`rooms/micro-retirement.html`: the fund for a 1 to 12 month break (the
break, cover, less income, plus the re-entry cushion), the ready date
through the one countdown, the FI move through the lens, the
career-momentum cost as a range from `data/career_momentum.json`, and a
sabbatical block on request. `engines/offers.js` and
`rooms/offer-compare.html`: two to four offers priced on a copy of the
household holding each pay (the one take-home figure, the true match
salary × cap × rate, equity as a range, less premiums and the commute),
per real hour with the commute in the hours, the FI date under each, the
one line that decides it; accepting writes the pay and the state and
records the life change for the reopen sheet. `engines/degree.js` and
`rooms/degree.html`: a degree as a sum, break-even age and lifetime
difference by 65 as ranges, the FI date with and without.
`engines/firstcar.js` and `rooms/first-car.html`: 20/3/8 through the one
rule call in `engines/quickmath.js`, each part inside or outside, the
price that fits, the gap in FI days, new against used from the
depreciation curve in `data/car_costs.json`.

**Replaces or removes.** Nothing: five new rooms. The 20/3/8 figures sit
both in `data/car_costs.json` and as the constant Quick Math has always
carried; a later pass should make the engine read the table.

**Stored shape.** No change to `slaf.household.v2`. Offer Compare writes
existing fields only (the primary's first income source and the state)
and `meta.reopen`. New table `data/career_momentum.json`, marked
unverified.

**Verified.** `node test/run.js` (the Public page with no cents, the
Private page to the cent, blanks and "not sure yet"; the six-month fund
and the zero-momentum case; the two match formulas by hand; the degree's
cost and break-even with its range; the car's three parts and the price
that fits), the render, features and forms gates on the five rooms, the
phone walk.

## D-220 — The front door stops refusing people

**Why.** An audit drove `index.html` with all eight fixture households.
Three never reached the dashboard, a retiree among them; and the First
Round writes only pay and cash, so nobody who took it and returned home
was let in either.

**Decision.** `index.html` `panelReady`: with a situation on file, one of
the panel's five numbers is enough — every block already names what it is
missing. `shared/ownership.js` `grossAnnualIncome` does not apply when the
situation earns nothing and nothing is entered (the `earning` flag in
`shared/schema.js` EMPLOYMENT_STATUSES, not a list of statuses), so
retired, not working and on disability join between jobs. The next action
reads the dashboard's own missing list, never Start Here's seventeen;
skips a field ruled out; and names the ladder's `stoppedAt.missing`.
`livingOffAssets` sends every non-earner who is not job-hunting to the
drawdown, so the retired branch renders at all. The DAITE income and taxes
tiles read "not asked", not "missing". `rooms/first-round.html` offers all
six `shared/gate.js` situations; Retired and Student were missing, with
pay copy per situation.

**Replaces or removes.** Removes the `totalDebt` special case in
`panelReady` and the landing page for anyone part-way through. Removes the
"answer everything before you may look" rule.

**Stored shape.** No change to `slaf.household.v2`. `employmentStatus`
gains no values; the First Round can now write `retired` and `student`,
which `shared/gate.js` already handled.

**Verified.** `node test/run.js` (30,147), `node test/forms.js`, and a
headless phone on all eight fixtures: every one reaches the panel, and the
retiree now reads "You draw 3.9% of your investments a year — inside the
4% convention" with "The age the money lasts to: outlasts you".

## D-221 — The dead controls and the links to nowhere

**Why.** The same audit tapped all 1,598 visible buttons and followed every
link. One button threw, one could never succeed, several links pointed at
anchors that do not exist, and the six tiles on the Ledger's home ran their
words together at every width.

**Decision.** `shared/roomexport.js` exports `download` (the One-Pager
called `RoomExport.download`, which was not there, so "Save a private file"
threw and saved nothing); `_download` stays as an alias. Four links now
name anchors that exist: `rooms/expenses.html` to `fire.html#targets`,
`rooms/health.html` to `start.html#q-about`, `rooms/roth-aca.html` to
`settings.html#horizon`, `rooms/credential.html` to
`real-hourly-wage.html#inputs`. `rooms/ledger.html`: a computed row's
missing inputs link to the room that owns them, not to `#row-<id>` which
is not an id anything carries; and a door is a flex column with a gutter
for its ring. `rooms/start.html` hides "Read a screenshot" unless the
browser has `TextDetector`. `shared/theme.css` puts undo and redo bottom
right at every width, not only on a phone. `shared/progress.js` puts the
Safari notice under the room's heading instead of above it, in one line.

**Replaces or removes.** Removes a button that always failed, a link
pattern that never resolved, and the undo pair's collision with the room
nav. No room, screen or field is added.

**Stored shape.** No change to `slaf.household.v2`.

**Verified.** `node test/run.js` (30,182), `node test/forms.js` (604), and
a headless phone over all 94 pages with a full and an empty household:
zero dead in-page anchors and zero console errors in both. The One-Pager
download was driven and saves a real file.

## D-223 — A month that does not close outranks every optimisation

**Why.** A persona audit drove the dashboard as a household spending $4,997
a month more than it earned. It answered: "$4,500 of cash sits beyond a
starter fund while $24,000 compounds above 7.5% — point the excess at the
debt." That is advice to spend the only buffer keeping them afloat.

**Decision.** `index.html`: `shortfall()` reads the ladder's own
`cover_basics` step, and when it is unmet the next action is the gap —
before every out-of-bounds flag, after the between-jobs and drawdown
branches, which are situations where outgoings above income are the plan.
The sentence names the gap, both sides of it, and what is absorbing it:
savings, with how many months they last at this rate, or credit, with the
balance growing while it is true. It links to The Rerank.

**Replaces or removes.** Removes the case where a flag about allocating
spare cash is shown to a household that has none spare. No new room, screen
or field.

**Stored shape.** No change to `slaf.household.v2`.

**Verified.** `node test/run.js` (30,215). Driven on eight fixtures: the
student (short $157, savings last 7 months) and negative-net-worth (short
$415, 9 months) get the gap; solvent households keep their ladder step or
flag unchanged; the retiree keeps the drawdown branch and the job-seeker
the runway.

## D-224 — One definition of what leaves each month

**Why.** A persona audit found two engines disagreeing about the same
household in opposite directions. `engines/cashflow.js`'s fallback basis
measured against essential expenses, which never hold a debt minimum, so
When It Won't All Get Paid told a household $415 short that it had "$1,800"
left. `engines/foo.js` added every minimum to expenses, which charges a
homeowner their mortgage twice, because accommodation is defined as "rent,
or mortgage plus tax plus insurance, one number".

**Decision.** `shared/schema.js` gains
`monthlyDebtPaymentsOutsideExpensesCents(household, tables)`: the minimums
of debts whose payment is not already inside an expense bucket. The rule is
`data/import_keywords.json` `monthlyMeansExpense`, which already stated it
in those words for the importer — mortgage maps to housing, every other
type to null. `engines/foo.js` step 0 and `engines/cashflow.js`'s
`monthlyTotal` basis both read it; the categorised basis already counted
minimums as a derived category and is unchanged. Four rooms now load the
table: cant-pay, debt-payoff, budget and the FOO ladder.

**Replaces or removes.** Removes the two contradictory definitions of what
is free each month. No new room, screen or field.

**Stored shape.** No change to `slaf.household.v2`.

**Verified.** `node test/run.js` (30,245), with the old assertions rewritten
to the corrected figure and a new guard that a mortgage minimum is not
added on top of accommodation. In the browser: the crisis room now reads
"$400 short — $5,900 comes in and $6,300 has to go out" where it read "No
gap"; a homeowner whose only debt is a mortgage is no longer reported as
short.

## D-225 — The room you need before you decide, and one threshold

**Why.** Two Sides of FI's audience is people at or near their number
working out whether they can stop. Drawing It Down was gated on having
already retired, so it told them "not for you right now, you said you are
employed" and opened only once the decision was irreversible. Separately,
the FOO ladder room judged high-interest debt at 6% while every other room
read 7.5% from the table — the same household was told both in one session.

**Decision.** `shared/gate.js` splits one key into two: `decumulation`
stays "is this household drawing down", which is what the withdrawal-rate
reading needs, and a new `drawdownPlanning` branch — everyone but a student
— is what `rooms/decumulation.html` requires. `engines/ratios.js` answers a
non-retiree with where the question is asked instead of "a number for a
retiree". `foo-ladder.js` reads `fooRules.thresholds.highInterestDebtRate`
and uses it in all eleven places, including the sentence on screen; the
typed 7.5 is a fallback until the table loads.

**Replaces or removes.** Removes a gate that shut the planning room to the
people planning, and the second definition of high-interest debt.

**Stored shape.** No change to `slaf.household.v2`. `Registry.requires`
for decumulation moves from `decumulation` to `drawdownPlanning`; the
generated `rooms.json` is rebuilt.

**Verified.** `node test/run.js` (30,279), with the hand-written situation
matrix and two room lists agreed to the change. In the browser the ladder
now reads "$18,000 above 7.5% APR", matching the dashboard, and the
drawdown room opens for a 61-year-old who is still working.

## D-226 — A low month, a high month and an average, on one basis

**Why.** On a household with a day job and a side business, Variable Income
printed "low $400 · average $5,300 · high $1,500" — a high month a third of
the average, which cannot happen. The low and high are typed against the
variable source and describe it alone; the average falls back to the whole
household's gross over twelve.

**Decision.** `engines/variableincome.js`: when the average is on the
household basis and the low and high came from one source, whatever else
arrives every month is added to both ends, so all three measure the same
thing — a whole month's income. Reported as `steadyCents`. Figures observed
from the ledger are already household-wide and are untouched.

**Replaces or removes.** Removes a line that contradicted itself. No new
room, screen or field.

**Stored shape.** No change to `slaf.household.v2`.

**Verified.** `node test/run.js` (30,310). The same household now reads
"low $4,700 · average $5,300 · high $5,800 · a low month clears spending",
and the salary it proposes moves from spending to the low month, which is
the convention the room states.

## D-227 — The last three serious accessibility failures

**Why.** The accessibility suite reported one serious failure in each of
three rooms, none of them contrast. They had been there throughout and were
named but not fixed when the contrast pass landed.

**Decision.** `index.html`: the "Your Data" link moves out of the Your data
`<summary>` and into the panel it opens — a summary is itself a control, so
a link inside it is one control nested in another, which a keyboard cannot
reach predictably. `rooms/fire-lab.html`: each fact row's third cell becomes
a second `<dd>` rather than a `<span>`, because a description list may hold
only dt, dd, div, script and template, and a wrapping div would break the
three-column grid; the `.why` rule regains the alignment and wrapping that
`.facts dd` would otherwise impose. `rooms/skill-tree.html`: the "You are
here" marker gains `role="img"`, since `aria-label` is prohibited on a bare
`<span>` and was never reliably announced.

**Replaces or removes.** Nothing: three defects removed, no screen or field
added.

**Stored shape.** No change to `slaf.household.v2`.

**Verified.** axe-core over the three rooms plus three controls: zero
serious or critical violations in each, where there had been one apiece.
`node test/run.js` (30,335). The FIRE Lab grid checked in a browser at phone
width — three cells a row, no sideways scroll.

---

# The Dungeons & Dividends entries

Everything below this line is about the `dnd/` tool, and **these entries have
their own sequence: `DD-001` onward.**

They did not always. The D&D entries were written while that tool was going to
be its own repository (DD-004, DD-005), so they restarted at DD-001 and collided
head-on with the SPARKS entries of the same numbers — "DECISIONS.md DD-001"
meant two different decisions depending on which file was doing the
referencing. Worse, two sessions working in parallel kept reaching for the same
next number and one of them had to renumber on merge; that happened four times
in two days.

So the two products now have two sequences that cannot contend:

    D-001 …    SPARKS / SLAF, above this line
    DD-001 …   Dungeons & Dividends, below it

**A new SPARKS entry takes the next `D-` number and goes immediately above this
divider. A new D&D entry takes the next `DD-` number and goes at the end of the
file.** Neither can collide with the other, whoever is writing and whenever
they merge.

One exception worth knowing: `dnd/shared/*.js` are byte-identical vendored
copies of the SPARKS files, so the `D-0xx` references inside them are SPARKS
numbers and must stay that way — changing them would break the vendored-copy
guard, which is the point of that guard.

`test/run.js` enforces the split: every heading above this line matches `D-`,
every heading below matches `DD-`, and no number appears twice in either
sequence.
---

## DD-001 — HP is measured in weeks, which is what makes §3A stop contradicting itself

The Dungeons & Dividends rulebook defines Hit Points twice in the same
section, and the two definitions do not agree.

First, in prose:

> **HP = Liquidity Runway.** Not net worth. Not Level. HP is how many months
> of expenses your liquid and near-liquid assets can cover.

Then, immediately after, as mechanics:

> Max HP at Level 1 = Hit Die max + CON modifier. Each level after: + (Hit
> Die average, rounded up) + CON modifier.

Those produce different quantities. A Level 20 Anchor with CON +3 has
`12 + 3 + 19 × (7 + 3) = 205` by the die formula. Nobody has 205 *months* —
seventeen years — of liquid runway, so read in months the two halves of §3A
describe different characters, and §10's encounter maths (a $3,000 car repair
as "2d6-ish") lands nowhere sensible against either.

**Decision: 1 HP = one week of expenses covered by liquid assets.** The owner
chose the unit; it is the choice that makes both halves of §3A true at once.

- **Max HP** is the die formula, unchanged, and now reads as a *capacity* —
  205 weeks is 3.9 years, which is exactly right for someone at Level 20.
  A Level 1 d6 class gets 6 weeks. Both are believable.
- **Current HP** is measured: liquid assets ÷ one week of expenses, capped at
  Max HP. Same unit, so the bar on the sheet means something.
- **Monster and Hazard damage** is denominated in weeks too. The $3,000 repair
  is ~3 weeks for a median household, which is genuinely trivial at 26 HP and
  genuinely fatal at 2 — the distinction §10 is built to make.

The alternative readings were both worse. Months made every damage figure in
the Monster Manual need rescaling before §10 could work at all. Reporting the
die pool and the runway as two unrelated numbers would have meant monster
damage could never be applied to runway, which guts the encounter mechanic
before it is written.

`engines/character.js` holds this — in the sibling repo, not here (DD-004):
`maxHp()` returns `{ weeks, reducedByDebt }`, `currentHp()` returns a measured
Result. `WEEKS_PER_YEAR = 52`.

### What a later room needs to know

**Max HP is withheld, not defaulted, when CON is unscored.** A Hit Die plus an
assumed +0 is a fabricated character, so `sheet().maxHp` is `null` until CON
has all three of its sub-stats. Current HP still computes from balances alone,
because that needs no stat at all. Any room that renders HP must handle
`maxHp === null` with `currentHp` present — that is the normal state for
someone who has filled in their money but not yet answered the quiz.

---

## DD-002 — The eighteen scoring formulas, and why "average" means the median American

The rulebook's own §13 lists what it had not settled:

> Exact sub-stat scoring formulas (real dollars/inputs → 8–20 scores) — this
> is the one piece the Claude Code build prompt still needs before the
> character sheet can actually compute anything.

So there was nothing to transcribe. These were agreed with the owner on
2026-09-04 and they live in `data/dnd_scoring.json`, deliberately apart from
the transcribed rulebook in `data/dnd_rules.json`, so a recalibration never
edits a rule and a rule change never silently moves a threshold.

### The calibration: a US-population-median household scores 10

§2 reads 10–11 as "Neutral / average", and the owner chose the population the
word "average" refers to. So median personal earnings (~$60k) score 10, the
median personal saving rate (~6% of gross) scores 10, the median household's
reserve (~1 month) scores 10, and so on. A median American comes out with +0
modifiers across the board, which is what a +0 modifier is supposed to mean.
Most people who actually build a sheet land 13–16, and that reads as earned
rather than flattering.

The two rejected alternatives are worth recording. Anchoring to the *FIRE
community's* median would discriminate better among the real audience but
score an ordinary person 8s nearly everywhere, which reads as punishment
rather than diagnosis. Anchoring to best practice would make "average" mean
"adequate", which contradicts §2's own wording.

Every rung is a `{v, s}` ladder with linear interpolation between rungs and
**flattening, never extrapolation, at both ends** — a $10m income reads 20,
not 47. `data/dnd_scoring.json` carries the median anchor for each ladder as
prose next to the numbers, so the claim can be argued with directly.

**These are rounded conventions, not fitted distributions.** The medians come
from widely published figures; the rungs above and below them are an agreed
shape. The file says so in its own `confidenceNote` rather than implying more
precision than exists.

### Nine compute, nine are generated

Only nine of the eighteen have a dollar figure behind them. All of INT, WIS
and CHA — literacy, judgment, negotiation, network — have none. Rather than
invent a dollar proxy for "Threat Detection", the room offers the same choice
a real table offers for ability scores, which is what the owner asked for:

| Method | What it is |
|---|---|
| **Feats of Strength** | Earn them. INT gets real right/wrong questions; WIS and CHA ask for evidence of what you have *done* ("have you negotiated in the last 3 years?"), never a self-rating |
| **Point Buy** | 45 points across the nine, on 5e's own cost curve extended to 20 |
| **Standard Array** | Nine fixed values, assigned where you want |
| **Roll** | 4d6 drop lowest, floored at 8 — so it cannot reach 19 or 20, the same ceiling rolling has in 5e |
| **Homebrew** | Type the nine. Nothing is checked |

Feats of Strength is the default because §12A claims the Spectrum is "the
format most resistant to flattering distortion", and nine self-rated sliders
would make that claim false.

Two questions per sub-stat, each worth 0–6 points, summed onto a base of 8.
That lands exactly on 8–20 with no rescaling — and a test asserts, for all
nine, that the best answers reach 20 and the worst floor at 8. That test
immediately caught a real fault: `personability` conflated "No" with "it
doesn't apply to me" in one 1-point option, so it could never score 8. Those
are different answers and are now different options.

### What a later room needs to know

- **`household.dndProfile` is new**, and `updateProfile()` replaces it
  wholesale rather than deep-merging. Read it, merge in JS, write it back —
  `patchProfile()` in the room does exactly this. Overwriting it with a
  partial object silently discards the other seventeen answers.
- **Nothing in it duplicates an owned field.** It holds only what no other
  room owns: a three-years-ago income, a mobility checklist, insurance flags,
  the nine declared scores. Income, expenses, cash, investments, assets and
  debts are read through `Schema`/`Tier0` and rendered as `Ownership.chip()`
  links back to their owning rooms.
- **The high-interest line is borrowed, not redefined.** Debt Burden 2 keys
  off `data/foo_rules.json`'s `thresholds.highInterestDebtRate` (0.075), so
  this room and the FOO room cannot drift apart about what "high" means. A
  test asserts they are the same number.
- **Level is `Tier0.fireProgress` read against §7's band table.** It is not a
  second FIRE calculation, and a test asserts the two agree.

---

## DD-003 — Seven classes, not ten

§4 of the rulebook gives seven levers and §8A–8G give seven complete Level
1–20 tables. But §7, describing the Epic Boon layer, says:

> the post-FI Epic Boon layer … that each of the ten classes' Level 19
> feature points toward

Ten is a leftover. The same section of the rulebook explains why: Insurance/
Risk Management, Tax Strategy, and Estate & Legacy were "tried as classes and
correctly called out as not valid ones" and became the three Feat Trees in
§8H. Seven levers plus three former classes is ten.

**Decision: seven.** §4 and the §8A–8G tables are explicit and complete; §7's
count is prose in a sentence about something else. `data/dnd_classes.json`
carries seven, records the discrepancy in its own `note`, and a test asserts
the count and every Hit Die against §3A's table — because Hit Dice are what
Max HP is built from, so a silent transcription slip there would quietly
change every character's runway.

The three Feat Trees are carried in `data/dnd_rules.json` under `featTrees`
and render in the Bestiary, so nothing from the rejected three is lost — it
just is not a class.

---

## DD-004 — The character sheet is a sibling, not a room

DD-001 through DD-003 were written while building the Dungeons & Dividends
character sheet as two rooms in this suite — `rooms/character-sheet.html` and
`rooms/dnd-reference.html`, registered in `shared/registry.js`, on the Map,
with their own engine and three reference tables in `data/`.

**That was the wrong shape, and the owner said so.** It is now its own
product: [dungeons-and-dividends](https://github.com/Sapphirestoneage/dungeons-and-dividends).

### Why it could not stay a room

A room in this suite assumes the household already exists. Every one of them
opens already filled in because Start Here ran first, and `shared/ownership.js`
guarantees each shared number is typed once, in one place. That assumption is
exactly what the character sheet needed to break: it is meant to be handed to
someone who has never opened SPARKS, has no household, and is not going to
build one before they will look at anything. As a room it could only ever be
the *last* thing someone saw. As its own front door it can be the first.

The intended audience is also just different. The people this is for arrive
because a friend sent them a link about a game, not because they were looking
for a personal-finance tool — and a suite whose entry point is nine questions
about income is the wrong container for that.

### What the split actually cost, and what it did not

It did **not** fork the maths, which was the thing worth protecting. The
sibling vendors `shared/money.js`, `shared/schema.js`, `shared/reference.js`,
`engines/tier0.js` and `engines/projection.js` from this repo **byte-identical**,
keeping their original namespace so a diff against this source is exact. One
file diverges: the table list in `reference.js`, trimmed to the tables that
product ships, because `load()` with no arguments fetches everything named
there and would otherwise 404 on boot. It is commented as such in both places.

More importantly, it stores **a real household in this repo's shape** — the
same `people` / `assets` / `debts` / `expenses` objects `shared/schema.js`
defines — rather than a private bag of fields. That is what makes carrying a
character into SPARKS a copy rather than a translation: nothing to map, nothing
to re-round, and the two tools cannot disagree about a number because they run
the same code over the same shape. Its `test/parity.js` asserts precisely that,
by building a character there and checking it produces the same Level, Debt
Burden, class and HP this suite produces for the same person.

The cost is real and worth naming: **five files are now duplicated across two
repos.** A fix to `tier0.js` here does not reach the sibling until someone
copies it. That is a maintenance debt, accepted deliberately — the alternative
was either a shared package (a build step, which this repo does not have and
does not want) or keeping the tool trapped behind an intake its audience will
never complete.

### What is left in this repo

Nothing but the record. No room, no registry entry, no engine, no `data/dnd_*`
tables, no tests. `ROADMAP.md` keeps one line under Tier 5 saying the idea was
built and where it went, and DD-001 through DD-003 stay exactly as written —
they document mechanics that are still true, and this log is the answer to
"where did that come from", which is the one thing this repo should still be
able to answer.

### What a later room needs to know

**`household.dndProfile` may arrive here.** A household exported from the
sibling carries a `dndProfile` key that nothing in this suite reads.
`Spine.updateProfile()` passes unknown keys through untouched, so it survives
round-trips and costs nothing — but do not assume every household has one, and
do not repurpose the key.

**There is no import path yet.** The sibling hands you the household object as
readable JSON; this suite has no way to accept it beyond editing localStorage
by hand. Closing that gap wants a general "restore a saved household" affordance
— worth having on its own merits, and deliberately not a D&D feature — and it
has not been built.


---

## DD-005 — The character sheet lives here after all, in a folder

DD-004 moved the Dungeons & Dividends sheet out of this repo and into its own.
That was the right shape and the wrong cost: creating and configuring a second
repository is GitHub work, and the owner is new to GitHub and does not write
code. A correct architecture nobody can operate is not correct.

**Decision: it lives in `dnd/`, as a folder in this repository.** Everything
DD-004 says about *what it is* still holds — it is not a room, it is not in
`shared/registry.js`, it never appears on the Map, it has its own front door
at `dnd/index.html` and its own browser storage under `dnd.character.v1`. It
shares an address, and nothing else.

### The folder is built to leave

The point of DD-004 was that this thing should be able to stand alone, and that
is preserved literally: `dnd/` carries its own copy of `money.js`, `schema.js`,
`reference.js`, `projection.js` and `tier0.js`, its own `theme.css`, fonts and
favicon. Moving it into its own repository later is `git mv` and nothing else
— no import to rewrite, no path to fix, no shared package to extract.

That is a deliberate trade against the obvious alternative, which was to have
`dnd/` load `../shared/money.js` and delete the duplicates. It would be tidier
today and would make the split expensive later, which is the wrong way round
for something the owner has said they may want to separate.

### The hazard that buys, and what stops it

Two copies of `tier0.js` in one repository is a real bug waiting to happen:
someone fixes one, the other silently keeps the bug, and the two tools start
disagreeing about a number while both look fine.

So `test/run.js` now asserts every vendored copy is **byte-identical** to its
original, with `shared/reference.js` as the one permitted divergence (its
table list is trimmed to what `dnd/` ships, because `load()` with no arguments
fetches everything it names). **That test caught real drift the first time it
ran** — `schema.js` and `theme.css` had both moved on `main` after the folder
was vendored. It is not a theoretical guard.

The same section asserts that no `data/dnd_*.json` creeps back into the main
suite, and that no registry entry points into `dnd/`.

### What this does not change

The export contract in `dnd/FORMAT.md` is untouched, and the importer it
describes is still worth building on its own terms. Note that being in one
repository means both tools are served from the same origin, so a future
importer *could* read the other's `localStorage` directly rather than passing
a file around — but the file remains the supported path, because it is the
one that keeps working if the folder ever does move out.

---

## DD-006 — The D&D tool's licence posture, and what "parody" actually constrains

The Dungeons & Dividends audit (BRIEF.md §T9) requires an SRD 5.1 CC-BY-4.0
attribution and a non-affiliation line **in the first commit**, and sets the
parody rule: riff on names, never reproduce a stat block, artwork, or a
Wizards-owned creature or setting name.

**What is actually borrowed is mechanics**, and mechanics only: the 8–20
ability scale and its modifier formula, the proficiency bonus, saving throws,
hit dice, death saves, the alignment grid, 5e's point-buy cost curve, and
4d6-drop-lowest. Game mechanics are not themselves copyrightable, but the SRD
is offered under CC BY 4.0 and attributing it is both the cheap option and the
honest one, so `dnd/README.md` and `bestiary.html` carry the full notice and
every page carries a short non-affiliation line.

An audit of the existing content found it already clean. Every monster and
hazard is either invented here (Lifestyle-Inflation Imp, Commission
Churn-Wraith, Timeshare Charm-Caster) or a public-domain figure pressed into
service — imp, wraith, basilisk, elemental, dragon, behemoth, familiar. No
stat block is reproduced; the damage expressions are dice notation, which is
not a stat block.

**The tests are the enforcement, not the intention.** `dnd/test/run.js` now
asserts the attribution and disclaimer are present on every surface, that the
title carries no D&D word mark, and that a tripwire list of Wizards-owned
creature and setting names (Tarrasque, Beholder, Mind Flayer, Waterdeep,
Forgotten Realms and a dozen more) appears nowhere in the data or the pages.
Note that the rulebook's own §12 FAQ discusses a Tarrasque; that reference was
never transcribed into `data/`, and the test now makes sure it never is.

### What a later change needs to know

Adding a monster means adding an original or public-domain name. If a new
entry trips the tripwire the build fails, and the fix is to rename it — not to
edit the list.

---

## DD-007 — The D&D sheet is the form, and how that survives D-034

BRIEF.md §9.1 asks for the Tier 2 page to be inverted: no intake form, the five
numbers typed into the boxes they actually feed. Income sits in Strength, cash
sits in Hit Points, investments sit in Experience, spending sits beside your FI
number, debt sits in Debt Burden. Optional questions become a "sharpen" toggle
on the panel they belong to.

**This puts live inputs inside a container that re-renders on every keystroke,
which is precisely the bug D-034 exists to prevent.** Rebuild that container
mid-tap on a phone and the soft keyboard closes and will not reopen, because a
programmatic `.focus()` cannot bring it back.

The resolution is a hard split, and it is the reason `sheet.html` is written
the way it is:

    buildShell()   runs once, at boot. Creates every node, inputs included.
    paint()        runs on every change. Writes textContent and .value ONLY.

The rule that keeps it true: **a container holding an input is never given
`innerHTML` after boot.** Containers with no inputs — the feature list, the
levers table, the senses panel — are rebuilt freely, and are. Event wiring is
one delegated listener on the shell, so it survives every repaint without
rebinding.

`test/forms.js` now taps all five money fields on a Pixel 7 and asserts each
node is the same node afterwards, then asserts the values landed in the right
places in the household. If `paint()` ever starts replacing a node instead of
writing to it, that test fails.

One knock-on: the class and subclass pickers are `<select>`s inside a repainted
region, so they are rebuilt only when their own signature changes (class,
subclass, availability). Rebuilding them on every keystroke would drop an open
dropdown.

### Initiative, and why it is not derived from the savings rate

§9.1 also adds initiative = DEX modifier + an automation bonus. The obvious
implementation reads the savings rate; that would be wrong. Initiative is how
fast you act *before you have decided to act*, and a large savings rate
executed by hand every month is exactly the case this is meant to tell apart
from money that moves itself. So it is a separate question with its own answer,
and `data/dnd_scoring.json` holds the bonus table.

Unanswered means unanswered: the sheet shows the DEX modifier alone and says
"DEX only — say how automatic your saving is", rather than adding +0 and
implying the question was asked and answered.

### The example state

An untouched sheet renders the full example character, visibly ghosted, with
one line and one button. Nothing is stored until the button is pressed — the
demo persona still never loads by itself. The example seeds the declared scores
as well as the money, because the ghosted preview shows a complete character
and writing only the money would drop INT, WIS and CHA the moment you pressed
the button; it never writes over a quiz someone already completed.

### A recurring bug, now caught mechanically

Pre-escaping a string that is then passed to a helper which escapes it has now
shipped three times in this repository — "Proficiencies &amp; training", then
"Investments &amp; retirement" and "Cash &amp; savings". `dnd/test/run.js` now
scans the string arguments of every escaping helper and fails on a pre-escaped
entity. Verified by reintroducing the bug deliberately: the suite catches it and
names the offending string.

---

## DD-008 — A monster's danger is a property of the meeting, not of the monster

BRIEF.md §9.3 asks for an encounter engine: pick a creature from the bestiary,
run it at the sheet, and get back what actually happens. The design question it
forces is where danger lives. A "CR 5 Timeshare Charm-Caster" sounds like a
fixed quantity, and it is not one — the same creature is a shrug to someone with
a high Wisdom score and six months of reserve, and a genuine threat to someone
with neither. So nothing in `engines/encounter.js` computes a monster's danger.
It computes a *meeting*: this creature, this sheet, this set of defences.

### Save DCs are derived from CR, because the rulebook never set them

Rulebook §13 leaves save DCs open. The two options were to invent a DC per
creature — fourteen unfalsifiable numbers — or to derive all of them from the
one property every creature already has, its Challenge Rating. The ladder is in
`data/dnd_rules.json` under `encounterRules.crToDc`: CR ≤ 0.25 → DC 10, rising
to DC 20 at CR 20 and DC 21 above it. It follows the shape of a CR-to-save-DC
progression — harder monster, harder save — and the specific numbers are a
convention chosen here, not a measurement and not agreed with anyone. That is
said in the data file itself, in the `source` field, so nobody later mistakes it
for research. Disagreeing with it means editing one array, and every creature
moves together. Inventing fourteen numbers would have meant disagreeing with it
fourteen times.

`crToNumber` handles the three shapes the bestiary actually uses: `1/4`, `7`,
and `18–20` (a range, which takes its lower bound so a range is never scored as
more dangerous than its floor).

### Three blocker states, and why the brief's two were not enough

A blocker is a thing you hold that changes the encounter — an emergency fund,
disability insurance, a high Threat Detection score. The brief's shape implies a
boolean: you have it or you don't. That is the same mistake as `|| 0`.

**"You have no disability insurance" and "nobody has asked you about disability
insurance" are different claims, and only the first should make a monster look
more dangerous.** So `blockerState()` returns `held`, `absent`, or `unknown`,
and unknown applies nothing — no effect, no penalty, no assumption either way.
The page lists them separately, under what it would need to know. This is the
deviation from the brief in this tranche and it is deliberate; the rest of the
repo would be lying about a blank if it did anything else.

The catalogue of fourteen blockers lives in data (`dnd_rules.json.blockers`) and
says what each blocker *is*. The predicates that decide whether this character
actually holds one live in the engine, because "six months of reserve" is a
computation over the household, not a fact to be stored. Blockers keyed to a
sub-stat need no predicate at all — they read `subScores[id] >= min`, and an
unscored sub-stat comes back unknown for free.

Three effects, all read from data: `negate` (the attack cannot land), `halve`,
and `advantage`. Advantage is rolling twice and keeping the better, which is
worth about **+3.7** on a d20 on average; it is applied as a flat modifier
rather than simulated, and the 3.7 is in `encounterRules.effects` where it can
be argued with.

### The save the monster targets is your worst one

`targetSave()` reads the creature's `saveAbility`. A single ability picks that
save. A pair like `CON+DEX` picks **whichever of the two is worse** — a monster
attacks where you are thinnest, not where it is convenient. `ALL` means the
worst of all six. Unscored saves are excluded from the comparison rather than
treated as terrible: a blank is a blank, not a weakness, and if none of the
targeted saves is scored the engine reports the target without a number instead
of guessing one.

The same rule drives the radar chart and the "natural predators" list. The two
lowest *scored* saves are the weak spokes, and the creatures that hunt there at
your tier are listed. Fewer than two scored saves and the panel says so rather
than drawing a shape out of nothing.

### The clamp, and Massive Damage

A natural 1 always fails and a natural 20 always succeeds, so the chance an
attack lands is clamped to 5%–95% however lopsided the arithmetic gets. A
character can be very well defended; they cannot be immune by having big
numbers. They *can* be immune by holding a `negate` blocker, which is the point
— the Payday Loan Wraith cannot touch you at all if you have three months of
reserve, and no Wisdom score achieves that.

Damage is already in weeks, because HP is weeks (DD-001). Rulebook §3A's Massive
Damage rule then falls out for free: a single hit at or above Max HP skips the
death saves and goes straight to insolvency, and the engine flags it.

### The worked example, hand-derived

The brief says the acceptance criterion is that this "reproduces the audit's
worked example". **I do not have the audit** — only BRIEF.md, which quotes its
conclusions but not its arithmetic. So the criterion was re-derived by hand
against the demo persona rather than checked against a source I cannot read, and
that is worth knowing before trusting the match:

    Timeshare Charm-Caster, CR 3      → DC 13 (CR ≤ 4 band)
    demo sheet's WIS save              → +1
    holds the Self-Awareness blocker   → advantage, +3.7
    effective modifier                 → +4.7
    chance it lands = (13 − 4.7 − 1)/20 = 7.3/20 = 0.365   → 37%
    damage 3d6 expected                → 10.5 weeks
    current HP 13                      → 2.5 weeks left

All six figures match what the page prints.

### The encounter log, which exists for T10

`shared/store.js` gains `logEncounter(rec)` / `encounters()`, capped at 50 and
newest first. Nothing in §9.3 needs a log — it is there because T10's type chart
wants to know which attack types actually landed on you over time, and a record
written from the start is worth more than one that begins the day T10 ships. The
shape is `{at, monster, attackType, tier, targetSave, dc, hitChance,
damageWeeks, hpBefore, hpAfter, mode}`. Anything reading it should treat missing
fields as missing, as ever.

### Compatibility note

**Stored shape:** `dnd.character.v1` gains `encounters` — an array, capped at
50, newest first, of the record above. It is **added**; absent means no
encounter has been run, which is not the same as zero encounters and should not
be rendered as one. Nothing existing changed shape. `household.dndProfile` gains
optional `disabilityInsurance` and `umbrellaPolicy` (booleans, absent = not
asked); `healthCoverage` and `automatedSaving` were already there.

**Rooms updated:** `dnd/encounter.html` (new), `dnd/sheet.html` and
`dnd/bestiary.html` (links to it only). No SPARKS room reads or writes any of
this.

**Before writing any of these from a new room:** the encounter log is the D&D
tool's own, under `dnd.character.v1`, not part of the household model, and it is
deliberately not exported by `shared/export.js` — a lead magnet ships a
character, not a play history.

---

## DD-009 — The free page tells you what hunts you, and is careful about what it cannot see

The Tier 1 page asks for no money at all. That is the whole point of it: it is
the thing you send to someone who has never thought about a savings rate. But it
meant the page ended on a class leaning, three ability scores and an alignment —
a personality quiz result, and personality quiz results are forgettable.

§9.3's encounter engine turned out to need nothing this page lacks. Predators are
computed from saving throws, saving throws come from ability scores, and the page
already has three of them. So the Tier 1 result now ends on **what hunts you**:
your three scored saves with the two thinnest marked, the moves those creatures
use, and the creatures themselves in CR order.

### What it refuses to claim

All of the care in this went into what the panel must *not* say.

**Three of six saves are blank, and a blank is not a weakness.** STR, DEX and CON
need real numbers. The obvious implementation treats them as zero, ranks all six,
and tells someone their Constitution save is their great vulnerability when
nobody ever asked. So the copy names them — "the other 3 (STR, DEX, CON) need
real numbers and are **blank, not bad**" — and `predators()` already excluded
unscored saves, which is why it could be reused unchanged. Four tests assert that
an unscored save never appears in `weakest`; breaking that rule in the engine
fails all four.

**"Your two thinnest" means thinnest of the three we could score**, and the
sentence says so rather than implying a ranking over six.

**No tier is shown.** `predators()` falls back to tier I when there is no Level,
which is right for its own callers, but a fallback tier is not a measured tier
and this page has no Level at all. So the creature list is not gated by tier and
the tier is never printed. The list spans CR 3 to CR 18 and is sorted ascending,
with the copy saying plainly that some of them are a long way off — which is
truer and more interesting than hiding the far ones.

**The moves are a set, not a ranking.** It would be easy to count attack types
across the matching creatures and announce "you are most exposed to guilt". That
number would measure how many guilt-monsters I happened to write, not anything
about the person. So the panel lists the distinct attack types with their blurbs
and makes no claim about which dominates.

### A tie is a tie — a change to §9.3's engine

Building this found a real bug in the engine shipped yesterday. `predators()`
took a flat slice of the two thinnest saves. Run the full quiz and it is easy to
come out with INT, WIS and CHA all on the same modifier — at which point the
panel marked two of three identical saves as thin and the third as safe, a claim
the numbers do not support. The demo sheet had it too: four of its six saves sit
on +1 and only two were being marked.

`weakest` now carries **every save tied with the second-thinnest**. With no tie
it still returns exactly two, so the common case is unchanged; with a tie it
returns all of them. Both callers were updated to match — the Tier 1 panel and
the encounter room's radar and intro — and both now say "all level, nothing
stands out" when the tie covers every scored save, rather than naming an
arbitrary pair.

That made a plain `join(' and ')` wrong in three places, since a three-way tie
rendered "INT and WIS and CHA". Both pages now have a `listJoin` that produces
"A, B and C".

The §9.3 acceptance criterion is unaffected: the Timeshare Charm-Caster against
the demo sheet still targets WIS at DC 13 for 37% and 10.5 weeks, 13 → 2.5.

### The share text is the product

This tool is a lead magnet meant to be pasted into a group chat, so the copy
button's output matters as much as the page. It was one `·`-joined line; it is
now five: the leaning and alignment, the three scores, the two thinnest saves,
the three nearest predators, and a link back. The predator names come through the
same CR sort the panel uses — one function, called twice — so "hunted by" names
the three that can actually reach you rather than three arbitrary ones.

### The locked block now promises something specific

It listed Level, HP and Armour as `?`. It still does, and adds the two things
§9.3 made real: the full sheet fills in the three saves this page had to leave
blank, and then you can actually *run* the creatures listed above — whether they
land, how hard, and what it costs in weeks.

### On the spec

**I did not have §9.6's text when I built this.** BRIEF.md is not in the
repository, and the pasted copy had aged out of the working context; all that
survived was my own one-line note, "Tier 1 result upgrade". The repo owner chose
to have me build from my own reading rather than re-paste the section, so this
entry is the record of what I decided that section ought to mean: give the free
page the encounter engine's payoff, and be scrupulous about the three scores it
cannot see. If the real §9.6 asked for something else, this is the entry to
argue with.

### Compatibility note

**Stored shape:** nothing. This page reads what it already read.

**Rooms updated:** `dnd/index.html` (the hunt panel, the share text, the locked
block), `dnd/engines/encounter.js` (`weakest` includes ties) and
`dnd/encounter.html` (radar legend and intro copy, to match). Apart from the tie
fix the engine needed no change to serve a class-less, level-less character with
three scored saves — it was written to exclude blanks rather than zero them, and
that is what made it reusable here.

**Before writing any of these from a new room:** `predators()` takes anything
with `stats`, `klass`, `proficiencyBonus` and `level`, and tolerates `null` for
the last three. It ranks only scored saves. If you call it, do not print its
`tier` unless your caller actually has a Level.

---

## DD-010 — Fifteen more creatures, and a mark saying which are ours

BRIEF §9.10. The bestiary had fourteen creatures from the rulebook. Three things
were wrong with that as a set, and none of them was "too few".

**"Greed" had no creature at all.** It is one of six declared attack types, so
§9.6's moves panel and T10's type chart could never show it. Five creatures now
use it — the Meme-Stock Swarm, the Crypto Siren, the Day-Trading Leech, the
Concentration Golem and the Golden Handcuffs — and a test asserts every declared
attack type is reachable, which is the check that would have caught the gap.

**Tier I had two creatures**, and tier I is where a first-time player is standing
when they open the thing. It now has six, all small: a Subscription Slime, an
Overdraft Gremlin, a Buy-Now-Pay-Later Sprite and a Free-Trial Snare. Tier IV
went from two to four, because the end of the game was thin in the other
direction.

**Strength had one.** Strength is earning power, and nothing much attacked it —
so the Wage-Stagnation Wraith (which does nothing at all, that being the attack)
and the Layoff Reaper (which does not damage the balance, it removes the thing
refilling it) now do.

Final spread: 29 creatures, every tier at six or more, every attack type used,
every save targeted by at least two.

### The provenance mark

The rulebook is someone else's work; these fifteen are not. Every added creature
carries `"origin": "extension"` in the data, the file's own `note` says so at the
top, and the bestiary page prints a `+` next to the name with the rest explained
in the section intro. Three tests hold this together: the fourteen rulebook
creatures are still present and still named exactly as supplied, everything else
is marked, and the file's note says which is which.

This matters more than tidiness. Someone reading `dnd_rules.json` in six months
needs to know which lines they can argue with freely and which came from a
document they should go back and check.

### Two creatures that deal no damage, deliberately

Writing the coverage tests turned up `"dice": "0"` on the Market Crash Elemental
and the Sudden Ability Drain, and my first test called it malformed. It is not:
one is a paper loss and the other reduces a stat, so neither costs weeks of
runway. `parseDice` returns null and `expectedDice` turns that into 0, which is
the right answer. The test now asserts exactly two such creatures exist, that
they expect zero weeks, and that each says in its note why there are no dice —
so the zero stays a decision rather than decaying into an oversight.

### A blocker the catalogue was missing

Three new creatures wanted to be blocked by Scenario Foresight — you had already
pictured this going wrong, so it arrives as a plan rather than as news. It is a
real declared sub-stat and was simply absent from the blocker catalogue, so it
was added there (marked as an extension too) rather than bending the creatures to
the fourteen blockers that happened to exist. A test now asserts every sub-stat
blocker points at a real sub-stat and carries a threshold.

### Compatibility note

**Stored shape:** nothing. Creatures are reference data, not stored state.

**Rooms updated:** `dnd/data/dnd_rules.json` (15 creatures, 1 blocker, the note)
and `dnd/bestiary.html` (the `+` marker and the two section intros). Every other
page picks the new creatures up for free, because they all read the same tables —
the Tier 1 hunt panel and the encounter room's predator list both grew without
being touched.

**Before writing any of these from a new room:** monsters carry `type`, hazards
carry `category` — that split is the rulebook's and was kept rather than tidied,
so a room rendering both must handle each. Do not assume `damageSpec.dice`
parses; `"0"` is a legitimate value meaning no hit-point damage.

---

## DD-011 — Four tiers of play, and a function that refuses to place you

BRIEF §9.4. The sheet could tell you your Level and the encounter room could
tell you what hunts you, but nothing told you what part of the game you were in
— which is the thing a tier is for. A level is a number; a tier is a job
description.

The four tiers already existed in `encounterRules.tiers` as names and level
ranges, put there by §9.3 so creatures could be tagged. Each now also says what
that stage is **about**, what it **looks like** from inside, what **ends** it,
and its **biggest risk**. That prose is written for this build, not the rulebook,
so every tier carries `origin: "extension"` and a test asserts it.

    I    1–4    Stop the bleeding and build the first buffer
    II   5–10   Widen the gap, then make it move without you
    III  11–16  Stop losing it — the pile is big enough that protecting beats adding
    IV   17–20  Turn a pile into an income, and work out what it was for

### tierProgress() takes a Result, not a number

This is the whole design decision in the tranche. `tierForLevel(3)` takes an
integer and always returns a tier, which is right for its caller — a creature
list needs *some* tier. But a character with no income and no spending figure has
no Level, and calling them "tier I — getting off the floor" is a diagnosis nobody
asked for and the page has no basis for.

So `tierProgress(levelResult, tables)` takes the Level **Result** and returns
`{ placed: false, reason }` when it is not `ok`. The sheet prints the reason. It
is the same rule as an unscored save not being a weakness, applied to the arc
instead of to a stat: absent is not the beginning.

### What the panels show

A four-segment strip with your tier lit and completed tiers dimmed, then two
panels: this tier (what it is about, a bar showing how far through it you are,
what it looks like, the milestone from the rulebook's own `levelBands`, and the
biggest risk) and what is next (what ends this tier, what the next one is about,
how many levels away, and **which creatures come into range when you cross**).

That last list is the part that makes a tier feel like a place rather than a
label. At level 3 it names nine creatures waiting in tier II, and they are the
same creatures the encounter room will run.

### The filter that was already there

`predators()` has taken a `tierOnly` option since §9.3 and nothing ever passed
it. §9.4 is what it was for: the encounter room now has "Only what can reach me
at my tier", which takes the demo character's predator list from 21 to 5.

It is **off by default**. Everything that hunts where you are thin is the more
honest first answer, and the far-off ones are the interesting half — the filter
is a narrowing you ask for, not one applied on your behalf.

### Compatibility note

**Stored shape:** nothing. The tier filter is a live control, not a stored
preference — deliberately, so nobody returns to a filtered view they have
forgotten they asked for.

**Rooms updated:** `dnd/data/dnd_rules.json` (tier prose + `tierNote`),
`dnd/engines/encounter.js` (`tierProgress`), `dnd/sheet.html` (the strip and two
panels; no inputs in any of the three containers, so they repaint freely under
D-034) and `dnd/encounter.html` (the filter checkbox, built once in the markup
and only read).

**Before writing any of these from a new room:** use `tierProgress()` and honour
`placed: false` — do not fall back to `tierForLevel()` to get a tier for someone
who has no Level. Tests assert the four tiers tile levels 1–20 with no gap and no
overlap, and that every level lands in exactly one tier and one milestone band;
if you add a tier, those are the checks that will tell you what you broke.

---

## DD-012 — Exhaustion is derived, statuses are declared, and both change the game

BRIEF §9.7. Two different kinds of condition, and the whole entry is about why
they are treated differently.

### Statuses are declared, because nothing in the household can see them

The rulebook gives eight status effects — Unemployed (Collecting), Disabled,
Discharged, Full-Time Student, W-2, 1099, Underwater, Means-Tested — each with
what it grants, what it restricts and how long it lasts. Not one of them is
visible in a number. A household with a modest income and a small balance looks
identical whether the person is a student, on benefits or between jobs, and the
restrictions differ enormously.

So they are self-declared, like alignment: eight checkboxes, nothing inferred.
`statuses()` returns `asked: false` when the key has never been written and
`asked: true` with an empty list when someone has ticked and unticked — because
"I have none of these" is an answer and "nobody asked me" is not, and collapsing
them would lose the difference. `FORMAT.md` now says so, so an importer does not
quietly throw the distinction away.

### Exhaustion is derived, because it is not a mood

The rulebook names **Exhausted** exactly once — as what Unemployed decays into —
and never defines it. That is a §13-shaped hole, so this fills it, marked
`origin: "extension"` like everything else written here.

The definition that makes it worth having: **exhaustion is what a thin buffer
costs you in decisions you can no longer afford to make well.** Not a feeling,
not a self-report. It reads current HP — weeks of runway — and nothing else:

    12+ weeks  0  Rested            you can say no, wait, and shop around
    8–12       1  Watchful          you check the balance before ordinary purchases
    4–8        2  Stretched         timing drives choices instead of price
    2–4        3  Cornered          you cannot walk away from a bad deal
    1–2        4  Running on fumes  decisions ordered by what is due next
    0–1        5  Spent             every option is urgent, so every option costs more
    0          6  Down              death saves, not decisions

### And it subtracts from every save, which is what stops it being decoration

Each level is a −1 to every saving throw, applied inside `Encounter.run()`. This
is the point of the whole tranche. Being near the edge genuinely does make you
easier to move — you cannot wait for a better offer, shop the policy, or walk
away — and every creature in the bestiary is built to exploit exactly that. Now
the model says so: the same character with the same Wisdom faces a Timeshare
Charm-Caster at 37% when rested and 56% on fumes, and it is the runway doing it,
not the Wisdom.

The encounter room prints the penalty as its own figure and a sentence saying
where it came from. A number that moves for unstated reasons is worse than no
number.

An unmeasurable runway applies **no** penalty rather than a guessed one, and
`exhaustion()` returns incomplete rather than "Rested" — absent is not rested,
the same way absent is not zero.

### Two bugs found by writing the tests

**The bottom of the ladder was unreachable.** Bands run minWeeks-inclusive to
maxWeeks-exclusive, so level 5 ("under a week", floor 0) swallowed exactly zero
and level 6 ("Down") could never happen. Zero is a different state from nearly
out — it is the death-save state — so level 5 now carries `minWeeksExclusive` in
the data and the engine honours it. Tests probe sixteen runway values including
every boundary, assert each lands in exactly one band, and assert more runway is
never more exhaustion.

**`blockerState` threw on a sheet with no `subScores`.** A partial sheet is
exactly who the three-state answer exists for, so a missing map now reads as
`unknown` like an unscored stat rather than crashing.

### Compatibility note

**Stored shape:** `dndProfile.statuses` is **added** — a map of
`{ statusId: boolean }` over the eight ids `unemployed`, `disability`,
`discharged`, `student`, `w2`, `selfEmployed`, `underwater`, `meansTested`.
Absent means never asked; present with all-false means asked and answered none.
Nothing existing changed. Exhaustion stores nothing at all — it is derived on
every read, so it can never go stale against the numbers it comes from.

**Rooms updated:** `dnd/data/dnd_rules.json` (the exhaustion ladder, status ids,
two notes), `dnd/engines/character.js` (`exhaustion`, `statuses`),
`dnd/engines/encounter.js` (the save penalty, and the `subScores` guard),
`dnd/sheet.html` (the Conditions section) and `dnd/encounter.html` (the penalty
figure and its explanation). `dnd/FORMAT.md` documents the new key.

**Before writing any of these from a new room:** the status checkboxes are
LIVE INPUTS built once in `buildShell` — `paint()` writes only `.checked` and
must never give `.statuslist` innerHTML (D-034). Write the map whole rather than
setting single keys, or unticking the last one becomes indistinguishable from
never having been asked.

---

## DD-013 — Rests and pace, in the only unit HP has

BRIEF §9.8, which the build-status table had marked as blocked on T7. It was not.
T7's Skill Stacker would supply *skill* XP; the Experience this sheet already has
is FIRE progress, and the rulebook already specifies all three recoveries under
`deathSaves.recovery`:

> **Short Rest** (a pay cycle) — regain HP equal to (income − expenses) for that
> cycle, if positive. **Long Rest** (a strong, uninterrupted month or quarter) —
> regain HP up to max, contingent on a CON save. **Potion** (a windfall) — heals
> a fixed amount immediately, no rest required.

Everything needed was already in the household. Only one number was missing.

### One conversion, because HP is weeks

All three recoveries convert through the same figure: **what a week of runway
costs, which is a week of expenses.** A short rest is the monthly surplus divided
by that. A potion is a windfall divided by that. A long rest is the deficit
divided by the short-rest rate. Nothing new was invented to make them commensurable
— DD-001 already did that work.

The demo persona: expenses of $3,150 a month make a week of HP cost **$727**, the
surplus restores **2.4 weeks a month**, and the 5-week deficit closes in **2.1
months**. Re-derived by hand and matched.

### A negative surplus is an answer, not an error

`shortRest` returns the negative number and flags `losing: true`, and the sheet
says it plainly: *"You are spending more than you keep, so rests take runway away
rather than restoring it. Nothing below this line gets better until that number
is positive."* `longRest` reports `unreachable` rather than offering a negative
month count as though it were a countdown, and `levelPace` says `goingBackwards`
rather than a time-to-arrival. Three places where the arithmetic would happily
produce a plausible-looking wrong number, and none of them do.

### The one number that was missing

The rulebook makes a Long Rest "contingent on a CON save" and never sets the DC.
That is the only judgement call in the tranche, so it is in data
(`longRest.baseDc` 10, `dcPerExhaustionLevel` 2) and marked `origin: extension`.

It rises with exhaustion, which is the honest shape: a good quarter restores
someone who is Watchful and barely dents someone who is Spent. The demo character
is Rested, so DC 10 against CON +2 — 65%. Drop their cash and it becomes DC 14
against +0, which is 35%. The save uses the same 5%–95% clamp as an encounter,
for the same reason.

### Pace asks the function that already knows

`nextLevelTarget()` has computed the dollars to the next level since the sheet
was built. `levelPace()` calls it and turns dollars into time. It does **not**
re-derive the target, and it does **not** apply investment growth over a single
level — compounding across one hop is noise dressed as precision, and the FIRE
projection, which spans decades, is where returns belong and is Tier0's already.
A test asserts `pace.needCents === nextLevelTarget(...).value`, so a second
derivation cannot creep in later.

### Two things the tests caught in the harness, not the code

Building a household by writing `monthlyExpensesCents` and `cashCents` flat onto
it produced a sheet with a null Level and no HP. That was the engine correctly
refusing a shape it does not read — cash is a liquid **asset** and expenses live
under `expenses.monthlyEssential` — so the test now builds households through
Schema's own constructors, as the sheet's example does.

Then Max HP stayed null because CON runs through the savings rate, which
subtracts estimated tax, which needs `effective_tax_rates_2026.json` — absent
from the D&D suite's table set. Both were the harness lying, not the engine, and
both are worth recording because the next person to write a test here will hit
them in the same order.

### Compatibility note

**Stored shape:** nothing. Every figure here is derived on read, so none of it
can go stale against the numbers it comes from.

**Rooms updated:** `dnd/data/dnd_rules.json` (`longRest`),
`dnd/engines/character.js` (`shortRest`, `longRest`, `levelPace`) and
`dnd/sheet.html` (the Rest and recovery section). No page stores anything new.

**Before writing any of these from a new room:** `shortRest` returns a Result
whose value may be **negative** — check `losing` rather than assuming a floor of
zero, and never clamp it, because the negative number is the finding. `longRest`
needs a sheet with both `currentHp` and `maxHp`; `maxHp` is null whenever CON is
incomplete, which is more often than you would expect.

---

## DD-014 — The card is the product, so it is drawn rather than laid out

BRIEF §9.2. This tool is a lead magnet, and what actually travels is not the
page — it is the thing someone pastes into a group chat. `card.html` builds it.

### Canvas, not HTML

An SVG or a screenshot of the DOM depends on web fonts having loaded, on CSS the
browser may not have applied yet, and in the general case on an html2canvas-shaped
library this repo will not take. A 2D canvas draws the same pixels everywhere,
exports with one `toBlob` call, and needs no dependency at all. The cost is doing
text fitting and wrapping by hand, which came to about thirty lines.

The canvas cannot read CSS custom properties, so the two skins are literal
palettes in the file. Reading them back off a probe element would break silently
the moment a token was renamed; a test asserts there is a palette for every skin
`shared/skin.js` declares, so adding a third skin fails loudly instead.

### It shows only what is scored

Every figure comes from the same engine the sheet uses, and anything incomplete
is **left off the card** rather than printed as a dash or a zero. A card with
four ability scores on it is a fine card. A card claiming a Constitution nobody
measured is a lie that then gets forwarded. Tests assert the ability list is
filtered on `isOk`, that vitals are pushed only when non-null, and that the file
never reaches for `EM_DASH` at all.

### It grows to fit

A character with three scored abilities and no alignment makes a shorter card
than one with six and a full spread, and a fixed height leaves a slab of empty
background that reads as a bug. So the layout runs once on a scratch canvas to
find where the content ends, the real canvas is sized to that between a floor and
a ceiling, and it draws again. Two passes, one layout function.

### Three ways out, because one is never enough

Save the PNG (`toBlob`, with a `toDataURL` fallback and a filename built from the
character's name). Copy the text, for anywhere an image will not go. And a hint
that press-and-hold works on a phone, because inside an embedded browser neither
of the first two reliably fires.

### A test-shaped bug found on the way

Five checks in the D&D suite named their pages in a literal list — the escaping
scan, the markup scan, the disclaimer check, the trademark scan and the skin
check. `encounter.html` was missing from four of them and `card.html` would have
been missing from five. The root suite's `<body class="slaf">` check, which
exists *because* three pages once shipped unstyled and every test passed, named
its pages too.

Both now read the directory. That turned on 45 checks that had never run, all of
which passed — but the next page added does not get to opt out of them by not
being mentioned.

### Compatibility note

**Stored shape:** nothing. The card is derived on every draw and stores nothing.

**Rooms updated:** `dnd/card.html` (new), linked from `dnd/sheet.html` and
`dnd/index.html`. Both test suites now find pages rather than list them.

**Before writing any of these from a new room:** the card reads
`Store.household()` and nothing else, so anything you want on it has to be in
the household or the profile first. If you add a page to `dnd/`, it is
automatically subject to the escaping, disclaimer, trademark, skin and
theme-class checks — that is deliberate.

---

## DD-015 — The file says which of itself may be believed, and a character can come home

BRIEF §9.5, which the build-status table had marked as blocked on T2's suggested
state. It was blocked on the wrong thing. T2 gives SPARKS somewhere to *put* a
suggestion (D-060); what was actually missing was this tool saying which values
belong there — and that is a D&D-side job, so it could have been done at any
point.

### The question an importer actually has

Not *what is in this file* but **which of it may I write down as fact?**

Money someone typed is fact. A Wisdom score they **rolled** is not a
self-assessment — it is a dice result, and a room that stored it would be
inventing a person. The export carried no way to tell those apart, and the
scores look identical in the JSON either way. That is the bug this fixes, and it
would have been an ugly one: a SPARKS room confidently showing someone a Threat
Detection of 15 that came out of `Math.random()`.

So every envelope now carries `provenance`, describing **only the keys actually
present** — describing absent ones would invite an importer to write defaults for
things nobody answered. Four trust levels:

    typed      the person entered this figure          → store it
    declared   a self-report, estimate or choice       → show as a suggestion
    generated  dice, standard array, or a point buy    → never store it
    mixed      a container whose fields differ         → read profileFields

`dndProfile` is always `mixed`, and its `profileFields` names every key present.
The entry an importer is most likely to get wrong — `declaredScores` — is
**resolved rather than deferred**: its trust is computed from `declaredMethod`
and stated outright, so nobody has to work it out.

Only `featsOfStrength` (the behavioural quiz) and `homebrew` (typed as a
self-assessment) come back `declared`. `roll`, `standardArray` and `pointBuy` are
`generated`, and **an unrecognised method is reported as `generated`** — failing
safe is the only sane default for a field this easy to misread. A test asserts
that, so adding a method without classifying it cannot quietly open the gate.

`FORMAT.md` documents the whole thing, including the fallback for an importer
that ignores `provenance` entirely: import the money, treat everything in
`dndProfile` as decoration.

### And the character can come home

The tool could export and never import, so a character could not move between
devices — start on a phone, finish on a laptop was impossible, which for a thing
people are meant to pass around is a real gap.

`Store.importCharacter(envelope)` **replaces** the keys the envelope names and
leaves every other key completely alone. Replace rather than merge, deliberately:
this tool holds exactly one character, and half-merging two produces a third
person who does not exist. Leaving unnamed keys alone means an older file missing
a newer key does not wipe it.

`contains` is the authority on what to take, not the payload's own key list —
`contains` is the part the format guarantees, so a key present but unnamed is
ignored. Validation runs first and a file that fails is not applied at all, which
was checked both ways in a browser: garbage and valid-JSON-wrong-shape both leave
the existing character exactly as it was.

The sheet's import does **not** rebuild the shell afterwards. The structure never
varies, only the values do, and rebuilding would replace every input node for no
reason — the one thing D-034 forbids. `hydrate()` writes the new values into the
nodes already there.

### Compatibility note

**Stored shape:** unchanged. `provenance` is **added to the export envelope**,
not to storage — an older importer that ignores it reads exactly what it read
before, and the payload is byte-identical.

**Rooms updated:** `dnd/shared/export.js` (`provenanceFor`, and the three trust
tables), `dnd/shared/store.js` (`importCharacter`), `dnd/sheet.html` ("Bring one
back" — a file picker and a paste box, both built once and only read) and
`dnd/FORMAT.md`.

**Before writing any of these from a new room:** if you add a field to
`dndProfile`, add it to `PROFILE_FIELDS` in `export.js` — a test asserts every
key the tool writes has a provenance entry, so it will fail if you forget, which
is the point. If you add a scoring method, add it to `METHOD_TRUST`; without an
entry it is reported `generated`, which is safe but wrong for a genuine
self-report.

---

## DD-016 — DM mode: the scenario is the URL, and it never touches your character

BRIEF §9.9, the last of T9. The encounter room answers *what does this do to
me*. `dm.html` answers *what would this do to someone like this* — a different
and more useful question, and the one you actually want when explaining to a
friend why an emergency fund is not optional.

### It needed no new engine

`Encounter.run()` takes a sheet. It does not care whether that sheet came from
someone's real numbers or from six boxes on a page, which is the whole reason
this tranche was small: a hand-composed target is just a sheet with a `stats`
map and a `currentHp`. A save left blank is simply **not put in the map**, so it
reads as unscored rather than as zero, and the creature cannot target it with a
number — the same rule as everywhere else, arrived at for free.

The one piece of real work is that the DM's answers about defences have to
override the engine's own predicates. That is done by running once to learn which
blockers the creature cares about, translating the DM's answers into the
sub-scores and profile fields that satisfy exactly the held ones, and running
again. Cheaper than teaching the engine a second source of truth, and it means
the engine's three-state logic still does the deciding.

### Three states, because a DM who has not decided is not a target who lacks it

Every defence is **held**, **missing**, or **not established**, and not
established applies nothing. Dropping to a boolean here would have made the DM
page more confident than the player's sheet, which is precisely backwards — the
DM knows *less* about a hypothetical person, not more. The result says how many
defences were left open and that they counted for nothing.

The controls are generated from the blocker catalogue, never listed, so a
blocker added later is answerable the day it lands. A test asserts no blocker id
appears literally anywhere on the page — verified by hardcoding one on purpose
and watching it fail.

### The scenario is the URL

Everything — the target's name, their runway, six save modifiers, fifteen
defence answers and the creature — is base64url in the hash. Sharing a scenario
is copying the address bar. No server, no account, and **nothing written to
storage**: a test asserts the page never touches `localStorage` at all.

An unreadable hash is ignored rather than raised. A broken link should open an
empty page, not an error, because the person who received it did nothing wrong.

### The one thing it writes

"Log against my sheet", which records the encounter with `source: 'dm'`. That
field has been in the log since §9.3 and this is the first thing to set it. It
matters: a scenario you composed for a friend must never read back later as
something that happened to you. Tests assert the page calls no other `Store`
writer at all — not `setMoney`, not `patchProfile`, not `importCharacter` — and
that `source: 'self'` appears nowhere in the file.

### The worked example, re-derived

A target with WIS +0 and three weeks of runway, meeting a Timeshare
Charm-Caster:

    three weeks of runway         → Cornered, −3 to every save
    WIS +0, effective             → −3
    CR 3                          → DC 13
    chance it lands = (13 + 3 − 1)/20 = 15/20   → 75%
    3d6 expected                  → 10.5 weeks
    runway 3                      → 0

Give the same person forty weeks of runway and nothing else changes but the
exhaustion, and the creature lands far less often. That is the entire argument
for an emergency fund, in one screen, about someone who is not you.

### Compatibility note

**Stored shape:** nothing added. The existing `encounters[].source` field gains
its second value, `'dm'` — anything reading the log should treat `source` as an
open set and not assume `'self'`.

**Rooms updated:** `dnd/dm.html` (new), linked from `dnd/encounter.html`.

**Before writing any of these from a new room:** if you add a blocker to the
catalogue it appears here automatically, but if it is answered from the
*household* rather than a sub-stat, add it to `dmProfileFor()` — otherwise a DM
can tick "they have it" and nothing will happen. That is the one place this page
has to know about specific blockers, and it is the one place to check.

---

## DD-017 — Six types, derived from the bestiary, and a log field I said existed and did not

T10. §9.3 gave every creature an `attackType` and nothing ever read them
sideways. This does: not *what is this monster* but **what kind of thing works on
me**. Twenty-nine creatures is too many to hold in your head. Six is not, and
*"urgency works on me"* is a sentence you can still use in a shop.

### The chart is counted, never written down

Which saves a type comes at, what blocks it and how hard, its CR range, and which
creatures belong to it are all **derived from the bestiary** by
`Encounter.typeChart()`. Add a creature and the chart moves on its own. Write it
by hand and it is wrong the first time somebody does — which, given §9.10 added
fifteen creatures a day earlier, is not hypothetical.

What it produces is genuinely informative rather than decorative:

    Fear        6 creatures  CON/DEX/STR/WIS  CR 9–18   ← the expensive end
    Flattery    4            CON/WIS          CR 0.1–7
    Urgency     4            DEX/CHA/CON      CR 0.25–8
    Complexity  6            INT/CON/STR/WIS  CR 0.25–6
    Guilt       4            CHA              CR 3–12   ← almost purely CHA
    Greed       5            WIS/CON/INT      CR 3–14

A test asserts the saves named for a type are exactly the saves its creatures
target, that every creature is counted once and only once, and that blockers are
ordered strongest-effect first.

### The one real design problem: creatures that target everything

Guilt is a Charisma type in every respect except that one of its four creatures —
the Divorce Dragon — targets **every save at once**. Pooling that in made Guilt
report itself as a *Dexterity* problem for a character whose Dexterity happened to
be their worst save, which is both wrong and actively misleading.

So `typeDefence()` measures against the saves a type **characteristically** comes
at, and reports what an all-targeting creature would find **separately**, in its
own sentence. Both facts get said; neither drowns the other. This is the check
worth keeping: it was verified by reintroducing the collapse deliberately and
watching two assertions fail.

### Unknown is not safe

A type whose saves are all unscored comes back `known: false` and is shown as
**Unmeasured**, held below the ranked ones. A character with Intelligence and
Wisdom but no Dexterity or Charisma is not *resistant* to Urgency and Guilt —
nobody has looked. The same rule as an unscored save not being a weakness and an
unstated runway not being rested, applied a fourth time.

Exhaustion (§9.7) is folded in, and the raw save and the effective one are both
reported, so a row that moved says why.

### A correction: DD-008 described a log that did not exist

DD-008's compatibility note said the encounter log's shape was
`{at, monster, attackType, tier, targetSave, dc, hitChance, damageWeeks,
hpBefore, hpAfter, mode}`. **It was not.** `logEncounter` wrote
`{on, monsterId, outcome, reason, damageWeeks, source}` and never carried
`attackType` at all — so the field T10 was supposedly being set up for was
missing, and the entry claiming otherwise had been sitting in this file for a
day.

`attackType` and `tier` are now genuinely stored, and both pages pass them.
`typeHistory()` **back-fills** older rows by looking the creature up by name, so
nothing logged before today is lost. A row naming a creature the bestiary no
longer has is counted as *unknown* rather than dropped and the page says how
many: it happened, and silently losing history is worse than an untidy total.

The related misnomer stays: `monsterId` holds the creature's **name**, not an id.
Renaming the field would orphan every stored record for no gain, so the name
stays and readers join on it — noted in the code rather than fixed.

### Compatibility note

**Stored shape:** `encounters[]` gains `attackType` and `tier`, both nullable.
**Older rows have neither and that is expected** — read them through
`Encounter.typeHistory()`, which recovers the type from `monsterId`, rather than
reading the field directly. `monsterId` is a creature **name**; join on it
accordingly.

**Rooms updated:** `dnd/engines/encounter.js` (`typeChart`, `typeDefence`,
`typeHistory`), `dnd/shared/store.js` (two logged fields), `dnd/types.html` (new),
and `dnd/encounter.html` / `dnd/dm.html` (pass the fields, link the page).

**Before writing any of these from a new room:** do not write a type chart down.
Call `typeChart()`. If you add an attack type to `encounterRules.attackTypes` and
no creature uses it, the §9.10 test that every declared type is reachable will
fail — which is the intended outcome, not an inconvenience.

---

## DD-018 — Six abilities to buy, like D&D Beyond, and what a bought Strength is worth

The repo owner, walking the live site with D&D Beyond open beside it: *"there are
only 6 metrics available to buy points in."* Point buy here spread 45 points
across the nine sub-stats. No table does that — you buy Wisdom, not Threat
Detection — and the screen looked wrong to anyone who had used the thing it was
modelled on. Standard array and roll had the same nine-slot shape.

### What changed

All four builder methods now set **six abilities**, D&D Beyond's way:

    point buy       27 points, every score starts at 8, nothing above 15,
                    5e's own cost table (8→0 … 15→9). 15/14/13/12/10/8 spends
                    exactly the pool.
    standard array  15, 14, 13, 12, 10, 8 — 5e's, assigned however you like
    roll            4d6 drop the lowest, six times
    homebrew        type six numbers

Each bought ability sets all of its sub-stats to that score, so the nine
declared sub-stats still exist underneath and the quiz still fills them
individually. `declaredScores` for the builder methods is now keyed by ability
(`STR`…`CHA`); a build saved before this holds nine sub-stat keys and **is still
read**, sub-stat key first, so nobody's character went blank.

### The decision that mattered: you can buy Strength

Strength, Dexterity and Constitution are computed from money. The question was
whether point buy should offer them at all. Two honest options: lock those three
rows ("set by your numbers"), or let them be bought like D&D Beyond does and have
money replace them later. **The owner chose the second**, and it is the right
call for a lead magnet: the free page now shows a full six-score character, and a
D&D player gets the screen they expect.

What that costs is a Strength nobody measured, so the rules around it are strict:

**A bought score is marked on every Result** (`bought: true`) and every page
says so — a dashed border and "bought" on the free page, "bought · until your
numbers replace it" on the sheet, `·b` and a legend line on the card, "(bought)"
in every share text. `FORMAT.md` tells the SPARKS importer never to import a
bought STR/DEX/CON as anything, not even a suggestion; they are game pieces.

**It is all-or-nothing per ability.** A bought score fills an ability only while
*none* of that ability's inputs exist. The first version filled just the gaps —
type income, and STR became the average of one measured number and two bought
ones, a figure nobody could explain. Now, the moment any money reaches an
ability, that ability is on measured terms: the bought score stops applying, the
missing sub-stats stay missing, and the sheet says *"your bought 15 no longer
applies — finish the numbers that set this"* rather than showing a blank where a
15 used to be. A blend of fact and fiction is worse than either.

**The quiz path buys nothing.** Feats of Strength still scores only INT, WIS and
CHA; STR/DEX/CON stay blank there, as DD-009 describes. That entry's "three of
six" framing now applies to the quiz route only, and the free page's copy is
conditional: it says what is blank, what is bought, and what is measured, whichever
of those is true.

### Compatibility note

**Stored shape:** `dndProfile.declaredScores` changes shape for `pointBuy`,
`standardArray`, `roll` and `homebrew` — six keys `STR`, `DEX`, `CON`, `INT`,
`WIS`, `CHA` instead of nine sub-stat keys. `featsOfStrength` is unchanged.
**Both shapes are read** (`declaredSubStats` tries the sub-stat key, then the
parent ability). `rolledValues` now holds six numbers. `Store.quizComplete()`
accepts either shape as complete.

**Rooms updated:** `dnd/data/dnd_scoring.json` (pool, costs, array, roll count,
blurbs), `dnd/engines/character.js` (`declaredSubStats`, `boughtFallback`,
`mainStats` carries `bought`, `ABILITY_METHODS` exported), `dnd/shared/store.js`
(`quizComplete`), `dnd/index.html` (six-row builders, six-card result, hunt copy,
share text), `dnd/sheet.html` (bought/superseded tag), `dnd/card.html`
(dashed box, `·b`, legend), `dnd/FORMAT.md`.

**Before writing any of these from a new room:** check `r.bought` on any STAT
Result before showing it as measured, and never write a bought STR/DEX/CON into
anything money owns. If you add a builder method, add it to `ABILITY_METHODS` or
its bought scores will be ignored for those three.

---

## DD-019 — Two ways to get hurt: bills attack your armour, pitches go around it

The repo owner, reviewing the tool as a D&D player: *"isn't insurance AC?"* Yes —
that is exactly the rulebook's design (§3A: emergency fund is the shield,
health insurance is armour, disability is heavier armour, umbrella is full
plate) and it is a good one. The problem was the other way round: **nothing ever
attacked your AC.** Every creature forced a saving throw, so Armour Class was
computed, printed as 17, and never rolled against — while the same insurance was
counted a second time as a *blocker* ("health insurance halves the Behemoth"),
because the encounter engine had no front door for armour and used a side one.

### The split

5e has two ways to get hurt, and they map onto money cleanly:

- **An attack roll against AC.** Something physical comes at you and your
  armour decides whether it lands. A hospital bill, a lawsuit, a stolen
  identity, a lost income stream. **Insurance is armour against these.** Eight
  creatures now carry `resolution: 'attack'` — the Medical Bankruptcy Behemoth,
  Identity Thief, Layoff Reaper, Dual-Income Collapse, Sudden Rent Spike,
  Care-Giving Toll, Overdraft Gremlin and the Sudden Ability Drain.
- **A saving throw.** Something goes *around* your armour and targets your
  judgment. The timeshare pitch, the crypto siren, the MLM cultist. **No policy
  stops you buying a timeshare**, so your armour is correctly irrelevant. The
  other twenty-one stay `resolution: 'save'`.

The to-hit bonus comes from CR, on a ladder in data with the shape of the DMG's
monster-statistics table (+3 through CR 3, +5 at 4, +6 at 5–7, +7 at 8–10, +8 at
11–15, +9 at 16–20): the attack-roll twin of the DC ladder, and a convention in
the same way. The Behemoth at +8 lands 90% against AC 11, 60% against 17, 20%
against 25. Armour finally moves a number.

### Counted once

Armour-layer blockers — health, disability, umbrella, emergency fund — were
**removed from the attack creatures' `blockedBy`** so they act through AC and
nowhere else. The exception is `negate`: "you have three months of cash, so the
Overdraft Gremlin has nothing to grab" is immunity, not armour, and stays. A
test asserts no attack creature carries an armour layer as a non-negate blocker.

A blocker that would give *you* advantage on a save instead gives the *attacker*
disadvantage on an attack — same value, applied to its roll. Exhaustion is a
judgment penalty and does not lower your cover, so it does not apply to attacks;
a test holds that.

### Debt Burden's disadvantage, applied at last

The rulebook says level 1 gives disadvantage on CON saves and level 3 on DEX
saves. The sheet printed that sentence and the engine never read it — half the
mechanic, and the half that makes debt scary. Each burden row now carries
`saveDisadvantage` as data and `run()` applies it to the targeted save. 5e's
cancel rule holds: advantage from something you hold and disadvantage from your
debt are together neither, and the result says so.

### What AC is for, said on the sheet

`armourGaps()` lists the attackers with the chance each reaches your AC. The
sheet prints "8 creatures attack this — bills, lawsuits, lost streams. 7 of them
would land more often than not. Only cover moves it." under the number, and the
encounter room has the full list. That is the sentence the AC panel could never
say before. DM mode takes an AC for the target; the bestiary's Save column reads
"attacks AC" for the eight; the type chart says how many of a type are bills.

### Found by the phone pass, not by a unit test

The first cut crashed the sheet on any household with no debt:
`debtBurden()` returned `Money.ok(0, …)` **without a row** when there were no
balances, attaching one only at levels 1–5, and the new AC note was the first
reader to touch `.row` on a debt-free household. Every unit suite was green;
`test/forms.js` — the one that taps through real pages — was not. Level 0 now
carries its row from the data like every other level, the sheet guards the read
anyway, and a unit test asserts a debt-free household comes back with a row.
That test was verified by reverting the fix: the suite goes red.

### Compatibility note

**Stored shape:** nothing. `resolution` is reference data on creatures;
`saveDisadvantage` is reference data on burden rows. Encounter log rows are
unchanged in shape.

**Rooms updated:** `dnd/data/dnd_rules.json`, `dnd/engines/encounter.js`
(`attackBonusFor`, `armourGaps`, the attack branch and disadvantage in `run()`,
`attacks` on `typeChart` rows), `dnd/encounter.html`, `dnd/dm.html`,
`dnd/sheet.html`, `dnd/bestiary.html`, `dnd/types.html`.

**Before writing any of these from a new room:** a creature you add must say
`resolution`, and if it attacks, must not carry an armour-layer blocker except
as `negate`. Check `r.resolution` before reading `r.dc` or `r.attackBonus` —
only one of them means anything for a given result.

---

## DD-020 — A failed save has to cost something

Two rulebook creatures dealt `0` damage: the Market Crash Elemental (CR 18) and
the Sudden Ability Drain (CR 10). Their own notes said damage happens *only on a
failed save* and *on a hit* respectively — but with dice of zero, a failed save
did nothing at all. A CR 18 that cannot hurt you is not a monster, and DD-010
had even written a test asserting the zero was deliberate. It was deliberate in
the rulebook and wrong in play.

**Market Crash Elemental — 8d10 on a failed WIS save.** The crash itself is a
paper loss and costs nothing; the damage is the *panic-sell*. A failed save
crystallises the loss, and 8d10 weeks is what selling at the bottom costs a
tier-IV pile. Pass the save and the paper recovers. That is the rulebook's own
design ("the save is about your reaction, not the event") given the dice it
needed.

**The Sudden Ability Drain — 6d8 on a hit.** An injury or illness that takes you
out of work. It is an attack creature (DD-019), so disability insurance is the
armour against it, and the weeks are the income that does not arrive while you
cannot earn. Written at the CR-10 peer rate — the Layoff Reaper is 6d8. The STR
reduction the rulebook describes is the Disabled status, which you declare.

Both creatures stay rulebook creatures (no `origin`); only their `damageSpec`
carries `origin: "extension"` and a `rulebook` field recording what was there
and why it changed. The test that asserted exactly two zero-damage creatures now
asserts none.

### Compatibility note

**Stored shape:** nothing. **Rooms updated:** `dnd/data/dnd_rules.json` only;
every page reads the dice from there. **Before writing any of these from a new
room:** a creature with no dice is a data error now, not a design choice — the
test will say so.

---

## DD-021 — A bleed is measured against a rest

Nine creatures deal damage *per period* — the Lifestyle-Inflation Imp's "1d4 a
month", the Hydra's "4d8 a year". The encounter room subtracted that once, as
if it were a single hit, and printed "HP 13 → 10.5". A D&D player's first
question is *"over how many rounds?"*, and the answer was that nobody had asked.

The honest figure for a creature that bleeds you per period is the **net**:
what it takes each period minus what a short rest gives back in the same
period (DD-013 — your surplus, in weeks of runway). From the net comes the
sentence that matters: **how long until the runway is gone.**

    Lifestyle-Inflation Imp, $72k earner   2.5 wk/month − 2.4 healed = −0.1 net  → gone in 130 months
    same Imp, $36k earner                  2.5 wk/month − (−0.9)     = 3.4 net   → gone in 4 months
    Lifestyle-Creep Hydra, $72k            18 wk/year − 28.2 healed  → never; you out-heal it
    same Hydra, $36k                       18 − (−10.4) = 28.4 net   → gone in 1 year

That is the game finally saying what a recurring creature *is*: the Imp is
harmless to a saver and lethal to an overspender, and the number is the reason.
A negative surplus is not clamped — it shows as negative healing, so the net is
worse than the chip, which is true.

Rules that fall out: "HP after" for a recurring creature means *after one
period, net*, and never goes up (out-healing is "never", not a heal). Massive
Damage stays a *single hit* at or above Max HP — a monthly chip never triggers
it however big the pile it eventually takes. Incident-shaped periods
("instalment", "incident") have no clock, so no healing offsets them and they
resolve as one hit. With no household — DM mode's hypothetical target — healing
is unknown, the raw chip stands, and the page says so rather than pretending.

### Compatibility note

**Stored shape:** nothing. Logged `damageWeeks` is still the gross per-period
figure. **Rooms updated:** `dnd/engines/encounter.js` (`recurring`,
`healPerPeriod`, `netPerPeriod`, `periodsToZero` on every result),
`dnd/encounter.html` (three new figures and the verdict), `dnd/dm.html` (says
the figure is gross). **Before writing any of these from a new room:** read
`r.recurring` first — `hpAfter` means a different thing on each side of it.

---

## DD-022 — One strong save, one weak, and every save covered

The rulebook gave three of the seven classes the identical CON/WIS pair, and
left Dexterity and Intelligence to one class each. In play that meant six
classes had no proficiency against anything that came at DEX — the Payday Loan
Wraith, the Identity Thief — and the type chart flattened for half the roster,
because Keeper, Compounder and Anchor were the same character as far as saves
went.

5e's own shape is one **strong** save (DEX, CON or WIS) and one **weak** (STR,
INT or CHA) per class, with every save covered. That is what the classes have
now:

    Earner      STR/CON   (was STR/CHA)   the fighter's pair: earning is a body
    Keeper      WIS/CHA   (was CON/WIS)   discipline, and immunity to the pitch
    Builder     DEX/CHA   (was STR/CHA)   the rogue's pair: quick, persuasive
    Compounder  CON/INT   (was CON/WIS)   patience and knowledge — its own primaries
    Landholder  DEX/INT   (was DEX/CON)   nimble, and reads the paperwork
    Anchor      CON/STR   (was CON/WIS)   the barbarian's pair: stability by bulk
    Speculator  WIS/INT   (unchanged)     the wizard's pair

Every save is now proficient for at least two classes; no pair is shared by
more than two (5e itself gives Fighter and Barbarian the same one). Each class
carries its rulebook pair as `savesRulebook`, so the original is recorded rather
than overwritten.

The demo character is an Earner, and the §9.3 acceptance figure — the Timeshare
targets WIS, which the Earner was not proficient in before and is not now — is
unchanged at 37%.

### Compatibility note

**Stored shape:** nothing. **Rooms updated:** `dnd/data/dnd_classes.json` only;
`savingThrows()`, the radar, the predators list and the type chart all read from
it. **Before writing any of these from a new room:** a new class needs one
strong and one weak save; the test will say so.

---

## DD-023 — ASIs and feats that do something

Every "ASI or Feat" level on every class read "—". Feats had a name and a
sentence and no mechanical field. A 5e player picks a feat *for* what it does,
and levelling up here changed nothing an encounter could feel. The last of the
review's items.

### ASIs: +2, or +1/+1, to an ability you decide

At each ASI level (4, 8, 12, 16, 19 — 5e's cadence, already in the data) you
take +2 to one ability or +1 to two, capped at 20, or a feat instead. The choice
is stored per level in `dndProfile.advancements` and **counts only once that
level is reached** — drop a level and the choice waits; it is not lost.

**Only INT, WIS and CHA can be raised.** They are the abilities you decide, and
levelling is exactly when you get to decide again. STR, DEX and CON are measured
from money — decreeing +2 income is fiction, and an ASI pointed at one is
ignored. A raised score carries `base` and `asi` on its Result and shows a ▲ on
the sheet.

### Feats: one mechanic each, and the engine reads it

The eight general feats each grant exactly one thing, written in data with a
`why`:

    House Hack                        +1 AC        housing cost hedged by a tenant
    Backdoor Roth                     +1 HP/level  more tax-advantaged capacity
    Real Estate Professional Status   INT save     you read the paperwork for a living
    Golden Handcuffs Break            selfAwareness held — you have already priced leaving
    The Ask                           negotiation held — you ask
    Lucky                             +1 all saves  5e's three rerolls, as an honest flat point
    Tough                             +1 HP/level  5e's +2 HP/level, in weeks
    Mobile                            DEX save     you can move, so nothing pins you

`saveProficiency` and `saveBonus` flow through `savingThrows()`; `maxHpPerLevel`
through `maxHp()`; `acBonus` is a named armour layer; `blocker` counts as held in
`blockerState()`, so The Ask makes the Wage-Stagnation Wraith unable to land on
someone who asks. All five reach the encounter engine, which is the test of
whether a feat is real.

Class, subclass and debt feats **stay flavour** and the sheet says so — "Flavour
— no mechanic yet" — rather than listing them beside real feats as if they did
something. Giving twenty-odd class feats mechanics is its own design pass.

### The picker lives with the class picker

One select per reached ASI level, in the same signature-guarded block as the
class and subclass pickers, so a live select is never rebuilt under a finger for
nothing (D-034). The signature now includes the choices and the open feats. Only
feats with a mechanic appear in the menu.

### Compatibility note

**Stored shape:** `dndProfile.advancements` is **added** — an object keyed by
ASI level as a string, each `{ kind: 'asi', plus: { WIS: 2 } }` or
`{ kind: 'feat', feat: 'Tough' }`. Absent means nothing chosen. Exported with
provenance `declared`; `FORMAT.md` says not to import it as anything.

**Rooms updated:** `dnd/data/dnd_rules.json` (feat grants), `dnd/data/dnd_classes.json`
(`cadence.asi`), `dnd/engines/character.js` (`advancements`, `grantsFrom`,
`applyAsi`, `featByName`; `savingThrows`, `maxHp`, `armorClass` take grants),
`dnd/engines/encounter.js` (grants passed to saves; granted blockers held),
`dnd/sheet.html`, `dnd/shared/export.js`, `dnd/FORMAT.md`.

**Before writing any of these from a new room:** pass `sheet.grants` to
`savingThrows()` or feats silently stop working there; a new general feat must
grant exactly one of the five kinds, and the test will insist.

---

## DD-024 — The campaign: ten rounds, a fork of your household, and advice that moves with you

The sheet was a snapshot. You filled in the form, you got a character, and that
was the whole game — nothing to *do* with it. This adds the loop the sheet was
missing: a board of six scenarios, one choice a round, ten rounds to a chapter,
and a chapter review that says where you shifted, what following the ladder
would have been worth, and whether you have been pulling the same lever every
single time.

`dnd/campaign.html`, `dnd/engines/campaign.js`, `dnd/data/dnd_scenarios.json`.

### It never writes to your real numbers

A campaign forks the household the moment it starts. Every consequence lands on
`state.household`, which is a deep copy. The sheet you filled in is untouched,
and the room says so on the prologue in plain words. A game that quietly edited
someone's actual recorded finances because they clicked a card would be
indefensible, and "we'd probably remember to undo it" is not a design.

The fork is written through the same ids the D&D suite already uses —
`dnd_person`, `dnd_asset_cash`, `dnd_asset_investments`, `dnd_income`,
`dnd_debt_total` — so `Schema` and `Tier0` read it exactly as they read the
real one. Nothing in the campaign knows a different shape of household.

### It does not author the right answer

This is the part that makes it a teaching tool rather than a quiz with an answer
key. **No scenario says which option is correct.** Each option declares only
which FOO step it *serves* — `serves: 3` means "this is a step-3 move" — and the
engine compares that against your **live** placement from `engines/foo.js`.

    onStep  100   it serves the step you are actually standing on
    behind   60   it serves a step you have already cleared
    ahead    20   it serves a step you have not reached yet
    none     10   it serves nothing

Money is a tiebreak only, never the ranking. So the same option scores
differently for two different players, and differently for *you* in round nine
than in round one: paying down a card is the right move on step 3 and premature
on step 1. "What you should have done" is therefore re-derived every round from
where you now stand, not looked up. `Foo.evaluate()` owns the ladder here as it
owns it everywhere else in the suite — the campaign re-derives nothing.

### The frontier: an honest answer when the ladder cannot see

`engines/foo.js` returns a placement only for an *unmet* judgeable step. Past
step 4 it honestly returns `unknown`, because the suite does not collect
contributions. The campaign cannot just go silent there — the players furthest
along would get the least.

So `fooStepOf()` returns a **frontier**: the step the ladder stopped at, marked
`certain: false`, with the reason and the missing fields. Everything below the
stop is established as *met*, so "at or past step N" is a fact even when "on
step N" is not, and the room shows it as a frontier rather than a verdict. A
completely empty household is not placeless either — it stops at step 0 and
names the two fields it needs.

### The prologue asks the two questions, and only the two

Rather than widening the ladder, the prologue asks the two things FOO is
actually missing to place most people: is there an employer match, and are you
capturing all of it. Two questions, built once and only read (D-034).

### Money three ways, so one scenario fits every character

A boiler costing a flat $800 is wrong for both incomes it might meet. Each
option's money is written as any of `cents` (absolute), `months` (multiples of
your monthly essential expenses) or `pctIncome` (a share of gross annual), and
they add. An unreadable basis returns `null`, not `0` — a scenario that cannot
be priced for you is incomplete, not free.

### The stacking warning

Two warnings, both from the record rather than from taste: six or more of ten
choices pulling the same class lever, and more than 40% of everything you
practised landing in one sub-stat. A character who solves every problem by
investing harder is a real failure mode and the review names it.

### The bank

37 scenarios, 111 options, spread across FOO steps 0–9 and tiers I–IV.

The per-tier floor took two goes to get right, and both wrong answers looked
reasonable. The first draft asked for a **board's** worth — six — which deals
the same six cards every round. The obvious correction, a **chapter's** worth —
ten — is also wrong: by the last of ten rounds the player has already used
nine, and the board still needs six unseen cards underneath them. The real
floor is `boardSize + roundsPerChapter - 1` = **15 per tier**, because
`board()` falls back to reoffering seen cards the moment fewer than a board's
worth are left.

A walk through a real chapter is what caught it — an eleven-card tier I dealt
three repeats in ten rounds while both count guards were green. Tier I was the
thinnest at seven, and tier I is exactly where a first-time reader lands. Five
new scenarios were written and seven existing ones re-tagged into the tier they
also genuinely belong to, bringing every tier to at least 15. The test now
states the real floor **and** plays a full chapter asserting no card is dealt
twice, because the count is only a proxy: the resolvability filter can thin a
pool that passes the count.

Board order is a deterministic PRNG seeded from the run — reload gives the same
six, because refreshing for a hand you like better is not the game. The test that
round two deals a fresh hand runs across a hundred seeds rather than one: with
six cards drawn from eleven, two rounds can legitimately coincide, and asserting
it on a single seed is a coin flip dressed as a test.

### Verification

Walked the whole loop in a browser on the demo persona: prologue, placement at
step 2, board of six, ten rounds, review showing "followed the ladder 4 times
out of 10", Level 3 → 5, net worth $35,900 → $72,570, and both stacking warnings
firing. Chapter 2 opened, survived a reload, and the real household was byte-for-
byte unchanged afterwards.

Re-derived outside the browser that the mechanic actually teaches: following the
ladder is worth **$32,720 more over ten rounds and $143,133 over thirty** than
choosing carelessly, and the careless player never leaves step 2. A teaching
mechanic that pays nothing is decoration.

### Compatibility note

**Stored shape:** `dndProfile.campaign` is **added** — `{ chapter, round,
household, chapterOpening, records: [{ scenarioId, optionId, serves, lever,
subStats, best, followed }] }`. `household` inside it is the **fork**, never the
real one; nothing outside the campaign may read it as the household. Absent
means no campaign started. Two prologue answers are written to the *real*
household where the schema already has homes for them: an income source's
`employerMatch` and the household's `capturingFullMatch`.

**Rooms updated:** `dnd/campaign.html` (new), `dnd/engines/campaign.js` (new),
`dnd/data/dnd_scenarios.json` (new), `dnd/engines/foo.js` (vendored byte-identical
from `engines/foo.js`; the guard in `test/run.js` now covers it),
`dnd/shared/reference.js` (`dndScenarios` registered), `dnd/sheet.html` (link).

**Before writing any of these from a new room:** never read
`dndProfile.campaign.household` as the household — it is a fork and its numbers
are fictional. A new scenario must declare `serves` for at least one option or
it teaches nothing, and the test insists; write its money as `cents`, `months`
or `pctIncome`, never as a bare number.

---

## DD-025 — Creation lives in the campaign: your numbers, your six, and the receipts

The campaign asked you to arrive with a character already built, and building
one was split across two other pages — `index.html` for the six abilities and
`sheet.html` for the numbers. Nobody was walked through it, and neither page
ended by telling you what you were and why. The repo owner's words: *"I put in
basic info about me and it shows me what stats I am and only then does it show
me in the campaign, and it gives me a detailed explanation."*

So creation now runs inside `campaign.html` as four signposted steps — About
you → Your six → Your character → The campaign — and you never leave the page.

### The exception, and what makes it survivable

**This deliberately breaks one-editor-per-field.** `sheet.html` and
`campaign.html` can now both write your income, spending, cash, investments and
debt. That is the thing `CLAUDE.md` says to stop and ask about, so it was
asked, and the answer was to put the whole flow in the campaign.

The exception is only safe because of two things, and both are enforced:

1. **`shared/charform.js` declares the fields once.** Label, hint, unit, the
   format-only placeholder, and *which Store writer the field uses*. Both rooms
   render from that list. If the two ever disagree about what a field is called
   or what an empty box means, one of them is not reading this file, and that
   is the bug.
2. **Every real write on the page goes through one function, `writeBasic()`.**
   A test asserts there is exactly one call to `Store.setMoney`, one to
   `Store.setDebt`, one to `Store.setFilingStatus`, that all three are inside
   that function, and that no painter in the play loop calls it. "The campaign
   never writes to your real numbers while you play" stops being a promise in a
   comment and becomes a thing that is checked.

The fork is untouched by any of this: starting a campaign still copies the
household, and every consequence still lands on the copy.

### Filing status is asked first, because it silently blocked a third of you

A phone walk through the new flow ended with Constitution unscored and the
reason `Choose a filing status to estimate taxes.` No filing status → no tax
estimate → no savings rate → no CON, and no place on the ladder either. It
looks like a detail and it blocks a third of the character, so it is now the
first thing asked rather than something the sheet happened to have.

### Point buy is D&D Beyond's, over all six

27 points, everything starts at 8, nothing above 15, 5e's own cost table, read
from `dnd_scoring.json` — no second copy. You are told to spend it on INT, WIS
and CHA, and told plainly that money takes over STR, DEX and CON the moment it
can measure them. Then the next screen shows that happening, which is a better
explanation than any paragraph.

### `Character.explain()` — the receipts

A score with no account of where it came from is a horoscope. `explain()`
returns, for each ability, its three sub-stats and **the actual figure of yours
that produced each one** — read back out of the Result's own `input`, never
re-derived, so the explanation cannot drift from the score it explains. On
screen that reads: *"10 Income Power — from your gross income of $52,000 a
year."* The phrasing per sub-stat lives in `dnd_rules.json` as `reads`, not in
the page.

Four honest statuses, and nothing is invented: `measured`, `chosen`, `partial`,
`blank`. An unscored sub-stat carries the engine's own reason and the fields it
waits on, so the optional finisher can offer exactly those and nothing else. An
ability with a bought score reads as *chosen*, never as measured.

### The mobility trap, which scored silently and wrongly

`checklistScore()` does `item.options[stored]` — the stored number is an
**index**, and the points are looked up from the table. The first version of
the finisher stored the option's *points*. A 3-point answer to a three-option
question becomes index 3, which does not exist, so Dexterity quietly refused to
score while every stored value looked plausible. Only a phone walk found it.
There is now a test that stores points on purpose and asserts it fails.

### The campaign itself: correlated, not arbitrary

Three changes, all from the same complaint — *"these qs dont feel correlated,
also show which trait it's boosting"*:

- **Options say what they train, before you pick.** "Practises **Self-Awareness
  & Discipline** +2 · **Consistency** +1 · pulls The Keeper's lever." This
  gives nothing away: which ability a move exercises is not the same as whether
  it is the right move *now*, and the ladder's verdict still waits until after.
  An option that trains nothing says so — "it is a way of not deciding".
- **Every card says why it is in front of you.** "This is a step-2 problem, and
  step 2 is where you are standing." A board of six that never explained itself
  read as a random draw. It was never one.
- **The two questions are motivated.** They used to appear with no stated
  connection to the character just built. They now say why they are the only
  two asked: an unclaimed employer match outranks nearly everything else, and
  everything else the ladder needs it can already read.

### Compatibility note

**Stored shape:** nothing changes shape. Creation writes the same fields the
sheet already wrote, through the same `Store` functions —
`grossAnnualIncomeCents` on the first person's first income source,
`monthlyEssential` on the household, the `dnd_asset_cash` / `dnd_asset_investments`
assets, the single `dnd_debt_total` debt with its rate, `filingStatus`, and on
`dndProfile`: `declaredMethod` / `declaredScores`, `incomeThreeYearsAgoCents`,
`sideIncomeAnnualCents`, `fixedCostShare`, `yearsSustained`,
`disruptionSurvived`, `mobility`. `dnd_rules.json` gains `reads` on each of the
nine computed sub-stats; readers that do not know the key are unaffected.

**Rooms updated:** `dnd/campaign.html` (the four-step flow, the finisher, the
trained-trait labels, the why-this-card lines), `dnd/shared/charform.js` (new),
`dnd/engines/character.js` (`explain()`), `dnd/data/dnd_rules.json` (`reads`),
`dnd/test/run.js`, `test/forms.js`.

**Before writing any of these from a new room:** `dndProfile.mobility` stores
the **option index**, not the points — write points there and the score fails
silently. Debt does not go through `Store.setMoney`; it has its own writer and
its rate is load-bearing. And a new room that wants to edit these fields must
render from `shared/charform.js` rather than inventing its own labels or units,
or the two rooms will drift and there is no longer a single answer to what a
field means.

---

## DD-026 — The whole run through: five questions, a build, your six, and what to do about them

The repo owner's brief, in their words: *"get the link, input 5 qs to find out
what kinda character they are, get the character, get asked how to build
character — whether IRL stats, point buy or the other items discussed — then it
shows them their stats, then it starts talking about how to improve each stat,
then you can focus on each stat via the question game. And the game should be
way less technical, way more fun."*

That is now one page, start to finish: **Five questions → Your six → Your
character → Getting better → Play.**

### The five questions are a read of temperament, not a measurement

They pick which lever you *reach for*. Nothing about them is measured, and the
file says so in its own confidence note. They exist because asking for
someone's income on the first screen is how you lose them — five questions cost
nothing and give something back immediately.

**And they are not rigged.** The options are written to sound like real people
rather than to balance a spreadsheet, so some levers appear in far more answers
than others — Anchor can reach 12 points across the five, Landholder only 6.
Scoring on raw totals would have handed nearly everyone the same two classes.
Each class is therefore scored as a **share of its own ceiling**, so leaning
hard on a rarely-offered lever counts for as much as leaning hard on a common
one. A test walks all **2,000** possible answer sets and insists every class
wins for somebody and none takes more than 25% (even would be 14.3%; the actual
spread is 11.2%–18.1%).

The "you're also a bit of X" line fires when first and second are within 0.05.
Not a rounder number: the median gap is 0.12, so at 0.15 it fired on 56% of all
answer sets and became wallpaper. At 0.05 it fires on 23%.

### The best screen in the tool

When the quiz class and the measured class differ, the page says so plainly:

> *Here is the interesting bit. You **play like The Compounder** — that is the
> lever you reach for. But your money moves through **The Earner**. Neither is
> wrong. The gap between the two is where most people lose years: working one
> lever in their head and a different one in their bank account.*

This is why the quiz class is stored separately and never overwrites the
measured one. Reconciling them would have thrown away the only thing here that
nothing else can tell you.

### Four ways to build, with the measured one first

Real numbers, point buy, standard array, or roll — the same four a table
offers, plus the one a table cannot. The measured route leads because it is the
only one that can tell you something you did not already know.

**Point buy can no longer be walked past.** Passing through without spending
left six 8s, a character that could not be ranked or trained, and a silent dead
end two screens later. The way out is now closed until the points are gone.

### How to improve, weakest first

`dnd_improve.json` — 54 moves across all 18 sub-stats, each with what to do,
how, how much it lifts (nudges it / moves it / moves it a lot) and what it
costs you (minutes / a weekend / months). Sorted weakest-ability-first, because
that is where the cheap points are. **Only scored abilities are ranked**: an
unscored one is not weak, it is unknown, and sending someone to train a number
nobody has measured would be the tool inventing a problem for them.

### The focused game, and the two bugs a full walk found

Pick an ability and the board deals situations that exercise it — read off the
scenario bank, never a second hand-kept list.

**Strength had one scenario.** The bank was entirely about spending, saving and
investing; not one card was about *earning*. "Train your Strength" would have
dealt nothing. Twenty-four new scenarios were written — pay reviews, counter
offers, day rates, the first pound earned outside a job, notice periods, leases,
liquidity — bringing every ability to at least 16 and every tier to at least 21.

**A focused chapter dealt four repeats in ten rounds.** Narrowing the pool to
the focus looked right: a tier's worth of cards that train one ability is
smaller than a tier, so the moment fewer than a board's worth remain unseen, the
deal starts reoffering cards already played. Focus is now a **preference, not a
filter** — every unseen card that trains the target first, then other unseen
cards, and a seen card only when nothing unseen is left. Six rounds would have
looked fine; only a full ten-round walk showed it.

Focus now leads the board for 6/10 rounds at worst (Strength, the thinnest) and
10/10 for four of the six. When it does run out the room **says so** rather than
dealing something else and letting the player think it still counts.

### Less technical, more fun

The acronym is gone from every label a player reads — a test enforces it.
"FOO step" is "Next up". "The ladder would have picked" is "The stronger move
was". "Chapter 1 — 10 decisions" is "Chapter 1 — how it went". The round header
is "pick your fight". The order-of-operations idea is now explained in one plain
sentence — *there's an order to money stuff, and doing the right thing at the
wrong time is how people lose years without ever making an obvious mistake* —
rather than named.

The voice is deliberately unchanged: dry, specific, and never pretending to know
more than it does. "Less technical" meant dropping internal vocabulary, not
dropping precision.

### Compatibility note

**Stored shape:** `dndProfile.quiz5` is **added** — `{ questionId: optionId }`
for the five questions. Absent means not taken. The resulting class is **not**
stored: it is re-derived from the answers every time, so it cannot drift from
them. `campaign.focusSubStats` is **added** to the campaign state — an array of
sub-stat ids, or null for an unfocused run. `Camp.start()` takes an optional
third argument for it; existing two-argument calls are unaffected.
`dnd_scenarios.json` gains 24 scenarios and no shape change.

**Rooms updated:** `dnd/campaign.html` (five new phases and the tone pass),
`dnd/engines/journey.js` (new), `dnd/data/dnd_quiz5.json` (new),
`dnd/data/dnd_improve.json` (new), `dnd/data/dnd_scenarios.json` (+24),
`dnd/engines/campaign.js` (focus as a preference in `board()`),
`dnd/shared/reference.js` (two tables registered), `dnd/index.html` (leads
into the run through), `dnd/test/run.js`.

**Before writing any of these from a new room:** the quiz class is a
temperament read and must never be shown as measured, or written over the class
`suggestClass()` derives from money. Score it through `Journey.scoreQuiz()` and
not by summing weights — raw totals are rigged toward whichever lever appears in
most answers. A new quiz option must carry a `says` line and lean on at least
one real class, and a new scenario that trains a thin ability is worth more than
another one that trains Wisdom.

### What walking the finished thing changed

Everything above was built, then walked end to end on a phone. Seven things
only showed up that way, and all of them are now fixed and tested:

- **A rolled set of six vanished on reload.** Regenerating them would have
  handed someone a different character from the one they were halfway through
  assigning, and let anyone reload until the numbers were nice. The bag and the
  mode are stored (`dndProfile.buildBag`), and an unfinished assignment resumes.
- **The "getting better" screen ran to sixteen thousand pixels** — six
  abilities times nine moves, all open. One compact row each now, weakest open,
  the rest a tap away, best-value moves first inside each.
- **The character screen claimed "three measured from your money"** to people
  who had rolled all six and measured nothing. The split is counted now, and an
  all-chosen character is told plainly that its numbers cannot surprise it yet.
- **The share card said "Unnamed" with no class on it** for anyone who had only
  answered the questions and bought their abilities — the measured class needs
  money. It falls back to the quiz class, marked "by instinct, not yet
  measured", and the run through links to it.
- **There was no name to put on a card.** One optional field on the character
  screen; blank still falls back to the class.
- **Three one-way doors**: no way back from the method screen to the five
  answers, none from the board to the advice screens without abandoning the
  run, none from the review to training something else. All three exist now,
  and leaving the board for advice returns to the game rather than throwing the
  chapter away.
- **Anyone with a sheet built before this flow** was made to answer five
  questions to reach their own character. There is a skip, shown only when
  there are already numbers to skip to.

`dndProfile.buildBag` is **added** — `{ mode, values }` for an in-progress
array or roll. `characterName` was already stored by the sheet and is unchanged.
The "you need a character first" view is **removed**: creation happens on this
page, so nothing could reach it.

---

## DD-027 — The long read: an Enneagram-shaped profile, and the one thing it refuses to do

The ask was a big personality profile off the back of the character: who you
are weak to, who you partner well with, who to be friends with, who you will
find annoying, who you are scared of, what triggers you — *"what your traumas
were growing up, what your parents were like, etc. Build like a huge profile
based off these assumptions."*

`dnd/profile.html`, `dnd/engines/persona.js`, `dnd/data/dnd_profile.json`.

Seven classes, each with a core desire, a core fear, the lie it tells itself
and the truth underneath, at-best and at-worst, a blind spot, an integration
direction and a disintegration direction, five named relationships, the
creature it is weak to, and the one thing it needs to hear.

### It says what it is, at the top rather than in the small print

Everywhere else in this suite, a number that cannot be derived is left **blank**
rather than guessed at. That is the whole voice. Here the entire output is a
guess, so the honesty has to come from labelling instead of arithmetic:

- The header carries a badge — **measured from your numbers**, or **from your
  five answers, not measured** — so a reader always knows which kind of claim
  they are looking at.
- The table's own `confidenceNote` says it plainly: *written to be recognised
  rather than to be true, and no more evidence-based than a star sign.*
- Where the quiz class and the measured class disagree, the page shows **both**
  rather than resolving them into a tidy single answer. "There are two of you"
  is the most interesting thing on the page and it only exists because nothing
  overwrites anything.

### What it will not do, and what it does instead

**It will not tell you what your parents were like.** Five questions about
money cannot see a childhood, and a tool that announced one would simply be
making it up — to a reader who, because this genre works by the Barnum effect,
would probably believe it. That is the one place this thing could do actual
harm, and "it's only a bit of fun" does not survive contact with somebody
reading that their parents were withholding.

So the origin stories are **offered, never asserted**. Three doors per class —
*"The house where money was there and then suddenly was not"*, *"The house
where you were the reliable one before you were old enough for it"* — plus a
**None of these** that is treated as a perfectly ordinary answer. Picking one
is recorded as `originPicked` and the page says, in as many words, that this is
**your recognition and not its finding, and that nothing here scores it**.

This is better than the assertion would have been, not a lesser version of it.
A verdict is something to agree or disagree with; a door is something to walk
through, and the walking is the part that tells you anything.

Four things enforce it, because a warning that can be quietly dropped is not a
control:

1. `persona()` returns `originsWarning` **alongside** `origins`, so a room
   cannot take the interesting half and leave the honest half behind.
2. A test asserts the warning exists, says the tool cannot see a childhood, and
   says it would be making it up.
3. A test asserts the page prints it **above** the doors, by source position.
4. A test asserts the page renders it from the table rather than retyping its
   own softer version.

Each of the four was broken on purpose and each one failed as intended.

### The relationships are about levers, not people

"Who will find you annoying" is read from **everyone else's profile**, not from
your own — so it is genuinely their opinion of you rather than your guess at
it, and two classes are allowed to find each other annoying. A test asserts
every line in the party view is traceable to the other class's own words.

Two content gaps showed up only once that view existed: **nobody found the
Earner annoying** (implausible for the relentless-hustle build) and the
**Landholder was nobody's friend**. The Anchor now finds the Earner annoying,
and the Compounder and Landholder are friends — they are the only two on the
list who measure in decades. A test now insists every class is named by at
least three others, so nobody opens this page to a blank section.

### What hunts you comes from the bestiary

Each class's weakness is a real creature with a real CR and a real save: the
Anchor is weak to the **Whole-Life-Insurance Basilisk**, because it sells
safety and safety is the one thing an Anchor never negotiates about. The
Builder is weak to the **MLM Cultist**, whose entire pitch — be your own boss,
own your time — is aimed at exactly what a Builder already wants. A test
asserts every named creature exists, so the page never sends a reader to look
up something that is not there.

### Compatibility note

**Stored shape:** nothing is added by the almanac pass — it is all read-only
table content. `dndProfile.originPicked` is **added** — the id of a chosen
origin story, the string `'none'`, or absent. It is **flavour only**: nothing
reads it into a score, and nothing should. It is not evidence of anything and
must never be treated as a fact about the person.

**Rooms updated:** `dnd/profile.html` (new), `dnd/engines/persona.js` (new),
`dnd/data/dnd_profile.json` (new), `dnd/shared/reference.js` (table
registered), `dnd/campaign.html` (links to it), `dnd/test/run.js`.

### The almanac, and the two perils that are not creatures

A later pass took the brief further: *"make it more dndesque but also like
astrology and just very esoteric, give people or circumstances each are weak
to."*

**The almanac.** Every class now has a sign — The Vault, The Forge, The Long
Odds — with a glyph, an element, a modality, a ruling body, an hour, a season,
a metal, a stone and a tarot card, plus a D&D layer: an alignment (*Lawful
Anxious*, *Chaotic Self-Employed*), a warlock-style patron and the pact it
carries, a curse, resistances and vulnerabilities, a bane, good and ill omens,
and a horoscope-voice reading with a drop cap.

**All of it is invented, and the page says so directly underneath rather than
in a footer.** `esotericaNote` is rendered from the table, not retyped in the
page, for the same reason `originsWarning` is: a softer local copy is exactly
how a caveat erodes. Signs and glyphs are asserted unique per class, because
two readers being handed the same horoscope is the one thing a horoscope must
never visibly do.

**The two perils.** `weakTo` used to be a single creature, which was the joke
rather than the substance. It now also names **three kinds of person** and
**three circumstances**, and these are the part written from how each lever
actually fails:

> **Anybody who says the word "guaranteed" while wearing a suit** — you
> negotiate on everything except safety, and they know which one they are
> selling.
> **Family, asking** — you are the one with the float, everyone knows it, and
> you have never once worked out the number at which you would say no.
> **A month where nothing at all goes wrong** — you find it suspicious rather
> than restful, and you will add to the floor to make the feeling go away.

Every one carries a mechanism, and a test enforces that: an archetype with no
reason behind it is just another horoscope line. The note draws the boundary
explicitly — the almanac is flavour and meant to be enjoyed as one; the people
and circumstances are the part worth taking seriously.

Five guards were broken on purpose to check they bite: duplicate sign, duplicate
glyph, a softened note, a note that drops the "worth taking seriously" line, and
a class with fewer than three people. All five failed as intended.

### Playing it cold: what a friend hits

Walked the whole thing as somebody arriving on a shared link who will not type
their salary — they roll dice instead. It was playable, and three things were
wrong on the way through.

**The last screen before play was written entirely for the money path.** It
told a character somebody had just built to *"add your numbers on the sheet"*,
claimed *"your numbers already work out most of where you are"* to a person who
had entered none, and asked them two questions about their employer's pension
match. The prologue now branches: with numbers it is unchanged; without them it
says plainly that the character was built from dice, that **the game can only
measure them against the very first step** so its advice will be generic, and
offers three ways on — add five numbers, use example numbers, or **Play
anyway**. The pension questions are hidden, because asking somebody who rolled
dice about their employer's match is nonsense.

**The review told a rolled character they had lost nine points.** A character
built by roll or point buy carries *bought* scores for STR, DEX and CON. The
first scenario that moves real money hands those abilities to measurement and
the bought score stops applying, so a rolled 17 becomes a measured 8 — and the
chapter review printed *"Income Power −9"* beside the choices they had made, as
though they had done something disastrous. `snapshot()` now records **where each
score came from** as well as what it is, and `chapterReview()` separates a
change of basis from a fall: it comes back as `becameReal` and the room says
*"Income Power stopped being a number you chose and started being one your money
decides. Nothing went wrong."* The same rule applies at ability level via
`basisChanged`.

**And a double full stop**, from joining an option label that already ended in
one to the sentence after it.

**Stored shape:** `snapshot()` gains `subBought` — a map of sub-stat id to
whether that score was bought rather than measured, or null where unscored.
Snapshots taken before this are missing it; every reader treats an absent map as
"unknown" and falls back to reporting the raw movement, which is the old
behaviour rather than a crash. `chapterReview()` gains `becameReal`, and each
entry of `statShifts` gains `basisChanged`.

### First, second, third — and the shadow

The astrology framing had one more thing in it worth taking: a big three. So
the profile now opens with **your first, your second and your third**, each
reading differently:

- **First** — what your money actually moves through.
- **Second** — what you fall back on when it tightens.
- **Third** — what people meet first.

Every class has a separate paragraph for each position, because the same lever
means a different thing in each slot: The Keeper as your first is a life run on
what leaves; as your third it is *"people read you as careful, and mostly mean
it as a compliment — it is also why nobody tells you about anything expensive
until it is decided."* A test asserts all four readings per class are distinct,
because the same paragraph in two slots would make the whole idea decorative.

**It is one ranking, not three readings.** `bigThree()` reads the ordering the
rest of the tool already uses — cents through each lever where there is money,
the quiz's shares where there is not — so the profile and the character screen
can never disagree about which lever is on top. A test asserts the first place
is the same class the rest of the page is showing. A lever with nothing moving
through it is **not** a second place; where only one lever is live, the room
says so rather than presenting two levers of zero as a chart.

**The shadow is the useful one.** It is the lever at the bottom of the full
ranking — the one never pulled — and it is the only position here read off
weakness rather than strength. Every class has a shadow paragraph ending in
*Watch for:*, which a test enforces. The Landholder as a shadow: *"You have no
claim on anything physical and no plan to get one. That is a completely
legitimate position, right up until it is not chosen. Watch for: thirty years
of rent that rises whether or not you do, and nothing at the end of it to point
at."*

It also lists what that lever loses to, on the grounds that the failure modes
you have never had to learn are the ones that will surprise you.

**Before writing any of these from a new room:** the big three must come from
`bigThree()` and never from a second ranking of your own — two derivations of
the same ordering is how a page ends up contradicting itself one screen later.
Never render `origins` without
`originsWarning`, and never above it. Never render the almanac without
`esotericaNote` — the sign is invented and a reader who is not told that is
being misled by omission. Never let `originPicked` reach a score, a
class, or an ability — it is a reader recognising a story, not a measurement,
and the moment it feeds arithmetic this page starts inventing biography. And
never present a profile without its `basis`: a characterisation shown as a
measurement is the only genuinely dishonest thing this suite could do.

---

## DD-028 — Four ways in, because one front door was asking before it gave

A panel of five designers each took a different lens at the same question:
how does a new person get into this thing? They arrived independently at the
same diagnosis, which is the finding worth recording. **The tool asked before
it gave.** Every route demanded a character before it showed anything, and the
best content in the repo — twenty-nine named creatures with their lairs, damage
and counters — was unreachable unless you already knew it existed.

One claim from the panel was checkable and turned out to be true, and worse
than stated: **point buy, the standard array and the dice all produce six
numbers and nothing else.** No class, no Level, no runway — because those are
derived from money and there is none. Three of the four build routes could not
show a new arrival a finished character at all. (A related claim, that a
character with all five numbers also had no HP, was mine and was wrong: my
probe had the tax-table key misspelled. With five numbers HP is fine.)

Three doors were built. Two more were designed and are recorded below unbuilt.

### The Descent — `dnd/descent.html`

One question. You answer it and it pays before anything else is asked.

> **$750,000.** That is your number — what you would need invested to cover this
> month, repeated forever, without working again. It is set by what you spend,
> not by what you earn.

That is **one input**: monthly spending. Then cash buys your HP in weeks, income
buys your Strength against the population ladder, and filing status buys your
savings rate. Four rungs, each paid for before the next appears, each naming the
assumption it rests on — the 4% withdrawal rate is called an assumption in the
sentence that uses it.

**The keyboard trap this page is built to avoid.** One-question-at-a-time is
exactly the shape that tempts a re-render per step, and re-rendering a live
input kills the phone keyboard permanently (D-034). So every rung exists from
boot, hidden; advancing only sets `hidden = false`; and the payoff paragraph is
a **sibling** of its input, never an ancestor, so no payoff re-render can reach
an input node. A browser test tags every input, edits rung one, and asserts all
three nodes are still the same nodes.

### The Starting Six — `dnd/data/dnd_pregens.json`

Four finished characters, playable in one tap: **The Glass Cannon** (Level 7,
one week of runway), **The Fortress** (Level 2, eighty-one weeks), **The
Millstone** (good income, debt burden 2), **Level One**.

A pregen is a household in this tool's own export shape, so loading one is
`Store.importCharacter()` and nothing else — no second write path, no parallel
scoring, and every number on the picker card is **derived** by the same engines
that read a character somebody typed. The class is never written into the file.

Two guards. **The gate:** loading over numbers somebody entered asks first.
**The badge:** `dndProfile.pregen` is stored and every surface that renders a
character says whose numbers these are — the campaign banner, the profile's
basis line, and the share card, which is the one artefact that travels away from
the tool. Under a pregen the ability labels change from *"measured from your
numbers"* to *"measured from these numbers"*, because the first is false and
sitting one paragraph under a banner that says so.

And the test asserts **the lesson, not the file**: a retuned scoring anchor could
quietly stop The Glass Cannon being a glass cannon while the file still
validated. `expect` on each pregen is what it is *for*, and it is checked.

### The Menagerie — `dnd/menagerie.html`

Twenty-nine creatures as the front door, each with what it attacks, what it
does and what stops it. One button per cage: **"This one got me."** At three
marks it names what they had in common.

> They nearly all came at the same door: **Wisdom**. The thing that would have
> stopped the most of them is **Threat Detection 14+** — it blocks 3 of your 3.

**A third kind of knowing, and the weakest one.** This suite already separates
`measured` (your money says so) from `instinct` (five questions say so).
Marking a creature is `recognised`: a self-report about *events*, which is
better input than a self-rating — and still not a measurement. So the page
**never writes a score, a sub-stat or a class**, `metCreatures` is its own
store key and deliberately not the encounter log, and a test asserts the page
contains no call that could write one. The read says in as many words: *"We have
not measured any of this."*

It also prints its own bias, which is structural rather than incidental: **you
cannot recognise the creature you never noticed.** Slow erosion is
under-reported here by construction and the loud disasters are over-reported,
and a read that did not say so would be quietly misleading.

### Designed and not built

**The Fellowship** — a party roster carried in a growing URL, so a group can see
which lever nobody has. It stalled on a decision that is not mine: the token
would carry six ability modifiers, and DEX is runway while STR is an income
band. That is a real, if coarse, disclosure about somebody's money in a link
that is forwardable forever. It needs the repo owner to choose, and there is a
class-only variant that gives up the ability floor and keeps the party read.

**Table Mode** — a printable session kit, because `Encounter.run()` already
derives a DC and never rolls the d20; the engine has been a tabletop referee
waiting for a physical die. Its smallest version is `print.css` plus a rules
card and a player card. Deferred only for scope.

### Compatibility note

**Stored shape:** two keys are **added** to `dndProfile`. `pregen` is
`{ id, name, at }` or absent, and means the household came from a ready-made
character — any room rendering a character must check it and say so rather than
presenting borrowed numbers as the reader's. `metCreatures` is
`[{ name, on }]` — creatures a person said had happened to them. It is a
**self-report and must never reach `declaredScores`, a sub-stat or a class**;
it is not the encounter log and must not be merged into it.

**Rooms updated:** `dnd/descent.html` (new), `dnd/menagerie.html` (new),
`dnd/data/dnd_pregens.json` (new), `dnd/shared/store.js` (`markMet`,
`metCreatures`), `dnd/engines/encounter.js` (`recognition`),
`dnd/shared/reference.js`, `dnd/campaign.html` (the pregen route, the badge,
the `#pregen` deep link), `dnd/index.html` (four doors), `dnd/card.html`,
`dnd/profile.html`, `dnd/test/run.js`.

**Before writing any of these from a new room:** never render a character
carrying `dndProfile.pregen` without saying whose numbers they are — the share
card is the one that matters, because it leaves. Never let `metCreatures` reach
a score; if you want a measurement, ask for the money. And a new pregen must
declare in `expect` what it is for, or the set drifts into four characters that
all teach the same thing.

## DD-029 — HP reads the one runway function; the lump is one total, not split

SPARKS 15.8 (D-181) put every asset in one of five piles and made
`Schema.runwayMonths(household, drawOrder)` the one runway. HP was already
"weeks of expenses the liquid assets cover" (DD-001); it now reads that
function with the draw order cash, taxable — the money you can reach without
a penalty — instead of its own loop over the `liquid` flag, and the campaign
card says "cash and taxable, before tax", because the campaign loads no tax
table and a number that pretends otherwise is the kind DD-001 refused.

The store's "Investments + retirement" lump is one total, not split, so it
is now written with `taxCharacter: 'unknown'`, which puts it in the
retirement pile, exactly where SPARKS files the same lump from Start Here;
the four pregens carry the same. Without that, The Glass Cannon's $380,000
of investments would have counted as taxable and its four-week runway,
the whole lesson, would have read as four years. The vendored
`dnd/shared/schema.js` is the byte-identical copy that carries the piles.
`liquidAssetsCents` (the DEX pool and the Anchor pool) reads the same two
piles, so nothing else moved.
