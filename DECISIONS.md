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

# The Dungeons & Dividends entries

Everything below this line is about the `dnd/` tool. **The numbers D-046
through D-052 appear twice in this file** — once above for SPARKS and once
below for D&D — because these entries were written while the D&D tool was
going to be its own repository (D-049, D-050). In a reference like
"DECISIONS.md D-046", the one that is meant is the one on the same side of
this line as the file doing the referencing: `shared/suggest.js` means the
SPARKS D-046, `dnd/engines/character.js` means the D&D one. The exception is
`dnd/shared/*.js`, which are byte-identical vendored copies of the SPARKS
files and therefore carry SPARKS numbers.

**From here on the log is one sequence.** A new entry — for either side —
takes the highest number in the whole file plus one, which is why the next
D&D entry after D-052 is D-064. A new SPARKS entry goes immediately *above*
this divider; a new D&D entry goes at the end of the file. Renumbering the
seven duplicates properly is a documentation pass of its own and has not
been done. The SPARKS entries written at the same time as the D&D D-064
and D-065 were renumbered to D-066–D-071 on merge, so from D-064 on every
number is unique.

---

## D-046 — HP is measured in weeks, which is what makes §3A stop contradicting itself

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

`engines/character.js` holds this — in the sibling repo, not here (D-049):
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

## D-047 — The eighteen scoring formulas, and why "average" means the median American

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

## D-048 — Seven classes, not ten

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

## D-049 — The character sheet is a sibling, not a room

D-046 through D-048 were written while building the Dungeons & Dividends
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
built and where it went, and D-046 through D-048 stay exactly as written —
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

## D-050 — The character sheet lives here after all, in a folder

D-049 moved the Dungeons & Dividends sheet out of this repo and into its own.
That was the right shape and the wrong cost: creating and configuring a second
repository is GitHub work, and the owner is new to GitHub and does not write
code. A correct architecture nobody can operate is not correct.

**Decision: it lives in `dnd/`, as a folder in this repository.** Everything
D-049 says about *what it is* still holds — it is not a room, it is not in
`shared/registry.js`, it never appears on the Map, it has its own front door
at `dnd/index.html` and its own browser storage under `dnd.character.v1`. It
shares an address, and nothing else.

### The folder is built to leave

The point of D-049 was that this thing should be able to stand alone, and that
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

## D-051 — The D&D tool's licence posture, and what "parody" actually constrains

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

## D-052 — The D&D sheet is the form, and how that survives D-034

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

## D-064 — A monster's danger is a property of the meeting, not of the monster

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

Damage is already in weeks, because HP is weeks (D-046). Rulebook §3A's Massive
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

## D-065 — The free page tells you what hunts you, and is careful about what it cannot see

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
