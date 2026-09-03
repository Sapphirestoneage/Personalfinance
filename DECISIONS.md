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

**Not built: the "$30k–$90k Rule".** I could not establish what it actually
states, and a threshold people would plan a car purchase around is not
something to infer from a name. It is the one item in this batch left out on
purpose — `CLAUDE.md` says stop and ask rather than guess, and this is that
case. **Eli: what is the rule?**

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

## Still open

- **SPEC.md §12.4 — Financial Health Score weighting** (`[PENDING]` in the
  spec): tunable by age cohort, or one fixed formula for v1? Not yet
  blocking; the score is built last by §9.
- **The three Tranche 1 rooms** (`real-hourly-wage`, `money-calendar`,
  `student-loan-decision`) do not exist in this repo. Whether to build them,
  and to what spec, is open. See D-001.
- **`student-loan-decision`** appears in §0, §1 and §5.1 as shipped, but in
  no part of the §13 tool specification. If it is to be rebuilt it needs a
  spec.
- **What is the "$30k–$90k Rule"?** Named in `SPEC.md` §13 but never defined
  there, and not inferable from the name. Everything else in that group is
  built; this one is blocked on Eli. See D-022.
- **Reference-table refresh** — see D-009 for what each table's numbers are
  actually worth today. The effective-tax-rate bands and the SCF percentile
  breakpoints are the two that most need a primary-source pass before any
  output is shown to a real user.
- **`foo-ladder` writes nothing back to the household** — see D-010. It needs
  the Cash Flow and Goal Costing engines before its step inputs have a home
  in the schema.
- ~~Whether `index.html` should be the Map or the FOO calculator~~ —
  resolved: the calculator keeps the root, the Map is `map.html`. See D-007.
