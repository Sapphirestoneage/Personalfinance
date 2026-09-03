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

## D-007 — the existing FOO app becomes a room; index.html becomes the Map
**2026-09-03 · SPEC.md §12.6, §12.7**

§12.6 and §12.7 describe `index.html` as the Map shell carrying the tag
filter and the visited-rooms progress bar. The `index.html` on `main` was
instead the FOO ladder calculator.

Resolution: the calculator moves to `rooms/foo-ladder.html` and is listed in
the registry; `index.html` becomes the Map shell the spec describes. Nothing
is deleted. `Inheritance FOO` — the unbundled JSX source of the same app —
is left untouched at the repo root.

**This changes what loads at the site root.** If the repo is published via
GitHub Pages, visitors who bookmarked the calculator will land on the Map and
need one click to reach it. Flagged rather than assumed; say the word and
the two can swap back.

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
- **Reference-table refresh** — see D-009 for what each table's numbers are
  actually worth today.
