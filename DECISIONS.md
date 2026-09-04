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

## Still open

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
- **The three Tranche 1 rooms** (`real-hourly-wage`, `money-calendar`,
  `student-loan-decision`) do not exist in this repo. Whether to build them,
  and to what spec, is open. See D-001.
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
