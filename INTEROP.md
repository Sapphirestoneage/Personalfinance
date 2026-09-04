# INTEROP.md — reconciling the Vue/TS build with this repo

Two codebases are being built against one specification.

- **This repo** (`Sapphirestoneage/Personalfinance`) — static HTML and vanilla
  JS, no build step, no `package.json`, zero runtime dependencies. That is a
  non-negotiable in `CLAUDE.md`, and `SPEC.md` is the authority on its data
  model, units and naming.
- **The Vue 3 / TypeScript build** — a separate project with a bundler, a
  component framework, an anonymous-user id, and a SQLite target schema.

Artefacts from the second keep arriving in sessions for the first:
`persistence/userDataStore.ts`, the SPARKS scaffolding folder, and the Master
Variable Registry. None of them can be dropped into this repo as-is — not
because they are wrong, but because they are TypeScript and Vue, and because
`shared/spine-v2.js` already owns persistence here. Adding a second store for
the same numbers is the thing `CLAUDE.md`'s ownership guardrail exists to
prevent.

What follows is what actually matters: where the two builds **disagree about
the data**, which is what will corrupt numbers if they are ever merged or if a
user's blob moves between them.

---

## 1. Money. This is the one that loses cents.

**`SPEC.md` §6 locks money to integer cents.** The TS build uses
floating-point dollars, and so does the target database:

```ts
grossAnnualIncome: number;        // Tier0Inputs — dollars
```
```sql
gross_annual_income REAL,         -- schema.sql — IEEE 754 float
```

`REAL` is a floating-point column. Money in floats does not survive
arithmetic:

| | float dollars | integer cents |
|---|---|---|
| ten 10¢ deposits | `0.9999999999999999` | `100` |
| $1,234.56 × 22.9% | `282.71424` | `28271` |
| a year of `balance × 1.0229 − 95` | `2903.892578189377` | `290389` → **$2,903.89** |

This is not a style preference and it is not specific to either framework.
Every serious ledger stores integer minor units. The fix in the TS build is
the same as here: store cents as integers, name the field with a `Cents`
suffix so the unit is impossible to forget, and format to dollars only at
display time. In SQL that means `INTEGER`, not `REAL`.

The `Cents` suffix is doing real work. `grossAnnualIncome` and
`grossAnnualIncomeCents` are different variables, and a codebase where the
name does not say which one it is will eventually add a dollar figure to a
cent figure.

## 2. Rates already agree — keep it that way

`SPEC.md` §4 stores every rate as a decimal fraction: `0.07` is 7%. The TS
validation agrees, explicitly:

```ts
"Interest rate should be entered as a decimal between 0 and 1 (e.g., 0.18 for 18%)"
```

Good. `Money.parseRatePercent("22.9")` returns `0.229` here, so the two
builds are already compatible on rates. The Master Variable Registry does not
state the unit for `mortgage_rate`, `rent_growth_rate`,
`home_appreciation_rate`, `property_tax_rate`, `maintenance_reserve_percent`
or `vacancy_rate` — and `maintenance_reserve_percent` is named as a percent
while `expected_return_rate` is named as a rate. Those should all say
"decimal fraction" before someone stores `4` meaning 4%.

## 3. Empty is not zero, and the TS types cannot express it

`SPEC.md` §5 is strict: `null`/`undefined` means "not entered", `0` means the
user typed zero, and the two never collapse. Every output is a Result
(`{status, value, reason, missing}`), never a bare number, so a missing input
produces an *incomplete state* rather than a wrong answer.

`Tier0Inputs` types every field as `number`. There is no representation for
"not entered". The validation only tests `!== undefined`, and `schema.sql`
allows NULL in columns whose TypeScript type says it cannot be null.

The consequence is not theoretical. `debtWeightedAvgRate: 0` is either "I have
no debt" or "I have not told you my rate yet", and a debt calculator that
cannot tell them apart will quietly report a payoff plan with no interest.

The test file has a related gap:

```ts
it("handles zero cash without dividing weirdly", () => {
  expect(calculateEmergencyFundMonths({ cash: 0, monthlyExpenses: 3000 })).toBe(0);
});
```

`0 / 3000` is fine. The hazard is the **denominator**: `monthlyExpenses: 0`,
and `monthlyExpenses` missing. This repo routes every ratio through
`Money.safeDivide()` for exactly that reason, and `test/run.js` has a section
called "Zero denominators and negative values". The TS suite needs the
mirror-image test.

## 4. A live bug in `userDataStore.ts`, in the function that warns against it

The file's header says:

> Never silently read old-shaped data as if it matches the new interface.

`migrateIfNeeded()` then does exactly that:

```ts
if (!migrationFn) {
  console.warn(`No migration found for ${schemaKey} v${version} → v${nextVersion}...`);
  break;                      // ← leaves the loop
}
...
return payload as T;          // ← old shape, cast to the new interface
```

A `console.warn` in a browser nobody is watching is not a guard. The same
applies to the unversioned branch of `load()`, which returns `parsed as T`
as a "best-effort fallback".

**This repo had the same class of bug and it was worse — it destroyed data.**
`load()` only accepted an exactly-matching `schemaVersion`; anything else fell
through to a fresh empty household, and the next write overwrote the user's
real blob with it. Shipping a version bump would have wiped every existing
user on their next page load. Fixed in `a9062af`: a migration registry keyed
by the version being migrated *to*, `test/run.js` failing the build if a bump
ships without a migration, and — the important part — a blob that cannot be
brought forward is **never overwritten**. It stays where it is, a copy goes to
a quarantine key, and the session runs in memory. Not persisting is the
correct price of not destroying what is already there.

The TS build should do the same three things. The pattern is in
`shared/spine-v2.js` under "Schema migration".

## 5. The snapshot table repeats the trap

```sql
data_json TEXT NOT NULL,      -- serialized Tier0Inputs at time of snapshot
schema_version INTEGER NOT NULL DEFAULT 1
```

Good that the version is stored. But the migration note says to "bump
`schema_version` for that table's rows accordingly" after an `ALTER TABLE` —
and bumping a stored row's version without transforming its `data_json` is
precisely the silent misread the header forbids. A snapshot is a frozen copy
of an old shape by definition; it needs the version it was written at, left
alone, and read through a migration on the way out.

## 6. Autosave on a deep watch will reproduce a bug this repo just fixed

```ts
watch(data, (newVal) => { if (newVal) saveTier0Inputs(userId, newVal); }, { deep: true });
```

That writes on every keystroke. If any component re-renders a list of inputs
in response to that write, tapping from one field to the next destroys the
node the tap was headed for — and because a programmatic `.focus()` does not
raise the soft keyboard on Android or iOS, the keyboard closes and typing
stops working. It is invisible on a desktop.

That is a real bug that shipped here and was reported from a phone as *"when
I type things don't enter or a keypad doesn't pop up"*. The fix, the reasoning
and a mobile regression test are in `shared/liveform.js`, `DECISIONS.md` D-034
and `test/forms.js`. Vue's reactivity makes this easier to hit, not harder —
worth reading before wiring the composable in.

## 7. `crypto.randomUUID()` needs a fallback

`getAnonymousUserId()` calls it directly. It is only available in secure
contexts, so it throws on a plain `http://` origin — which includes the
`python3 -m http.server` setup used for local testing — and it is missing in
older Safari. Wrap it.

## 8. Unbounded arrays

`saveSnapshot()` and `saveCategoryEntry()` both read the whole array, push,
and write it all back, with no cap. localStorage is a few megabytes; a daily
snapshot of a growing blob reaches it. When it does, `setItem` throws,
`save()` catches it, logs, and returns — so writes start failing silently
while the UI still looks like it saved. This repo's `writeRaw()` degrades to
an in-memory store on quota so the session keeps working; either way, the
history needs a cap or a prune.

---

## Field mapping

Registry name → what this repo calls it. Where the unit differs, this repo's
is the one `SPEC.md` locks.

| Registry (Vue/TS) | This repo | Unit here |
|---|---|---|
| `dob` | `person.dob` | ISO `YYYY-MM-DD` |
| `age` | `Schema.primaryAge()` | derived int |
| `state_zip` | `household.state` | 2-letter USPS |
| `filing_status` | `household.filingStatus` | same enum |
| `gross_annual_income` | `incomeSource.grossAnnualIncomeCents` | **integer cents** |
| `effective_tax_rate` | `Reference.lookupEffectiveTaxRate()` | decimal fraction |
| `marginal_tax_rate` | user input (Side Hustle, Where It Goes) | decimal fraction |
| `cash_savings_balance` | `asset.category === 'cash'` | **integer cents** |
| `investment_retirement_balance` | `asset.category` investment/retirement | **integer cents** |
| `assets_itemized[]` | `household.assets[]` + `ownerIds` | — |
| `debts_itemized[]` | `household.debts[]` + `ownerIds` | — |
| `debt_balance_total` | `Schema.totalDebtCents()` | derived, **cents** |
| `monthly_debt_payments_total` | `Schema.monthlyDebtPaymentsCents()` | derived, **cents** |
| `monthly_essential_expenses` | `expenses.monthlyEssential` | **cents**, monthly |
| `is_estimated` / `expense_data_source` | `.estimatedValueCents` vs `.trackedValueCents` | both kept |
| `expenses_itemized_by_category[]` | `expenses.entries[]` | see note below |
| `employer_match_percent` | `employerMatch.matchPercent` | decimal fraction |
| `employer_match_cap_percent_salary` | `employerMatch.matchCapPercentOfSalary` | decimal fraction |
| `expected_return_rate` | `assumptions.expectedReturnRate` | decimal fraction |
| `safe_withdrawal_rate` | `assumptions.swrRate` | decimal fraction |
| `fire_variant` | `data/fire_variants.json` | config |
| `swan_number` | `household.swan` | see note below |
| `fulfillment_rating` | `ratings.joy[categoryId]` | int 1-10 |
| `hassle_score` | `ratings.hassle[activityId]` | int 1-10 |
| `goal_*` | `household.goals[]` | cents |
| `snapshot_timestamp` / `snapshot_json_blob` | `Spine.appendSnapshot()` | — |
| `foo_step_current` / `foo_flags[]` | `Foo.evaluate()` | computed, never stored |

Three of those are more than a rename:

**`expenses_itemized_by_category[]`** is specified as
`{category, amount, fixed_or_variable}`. That cannot hold a dated
transaction, so bank import later needs a second store and a second roll-up.
`SPEC.md` §12.5 requires the transaction shape from day one, which is why
`createExpenseEntry()` is `{categoryId, amountCents, period, date, descriptor,
source, categorizedBy}` — a typed monthly total and an imported transaction
are the same record with different fields filled in.

**`swan_number`** as a single dollar figure loses the distinction the tool
depends on. A person names it either as an amount or as months of expenses,
and only what they said is stored; the other is derived on read so it moves
when their spending moves. See `DECISIONS.md` D-028.

**`fulfillment_rating` — "per expense category, timestamped"** is a real gap
on this side. `ratings.joy[categoryId]` stores the number without a
timestamp, which is fine for the Fulfillment Curve as built but not enough
for the Category Tracker Engine's trend charts. Deliberately not changed yet:
adding a timestamp is a schema-version bump, and bumping the version to
support an unbuilt feature is churn. When the Tracker is built, the shape
becomes `{value, at}` and `MIGRATIONS[3]` back-fills `at: null` — "rated, but
we do not know when", which is honest and not a fabricated date.

## Two things worth resolving

- **"derive `age` server-side, never client-side"** (registry, Identity).
  There is no server in this repo, so age is derived in
  `Schema.primaryAge()`. If that rule exists for a real reason — trusting the
  client's clock for an age-gated output — it needs stating; if it is
  inherited from the Vue build's future backend, it does not apply here.
- **`financial_confidence_score` vs the Tier 4 Satisfaction calc.** The
  registry recommends merging them. Neither is built here. Worth deciding
  once, in `ROADMAP.md`, before either gets built twice.

## What is worth taking from the scaffolding regardless of framework

The scaffolding is Vue and TypeScript, so none of it lands here as code. Three
pieces are framework-independent content and are worth having on both sides:
`SECURITY.md`'s pre-production checklist, `content/disclaimers.ts` (with its
own honest note that the text has not been lawyer-reviewed), and the
validation *rules* — bounds, not the implementation. This repo currently
validates at parse time (`parseMoney`, `parseRatePercent`) and through the
Result contract, but has no equivalent of "date of birth cannot be in the
future" or "age over 120 looks like a typo". Those are cheap and worth adding.

---

## 9. `external-data/index.ts` — every stub returns a plausible number

The module's premise is right, and matches this repo: calculators call the
data layer, never inline the values, so swapping in a real source changes no
calculator code. That is exactly `shared/reference.js` plus `data/*.json`.

The problem is what the stubs return. **Every one of them returns a number.**
Not null, not an error, not "unavailable" — a believable figure that flows
into a calculator and out to a user with nothing marking it as invented:

| Stub | Returns | What the user is told |
|---|---|---|
| `getNetWorthPercentile` | `{percentile: 50}` | everyone is exactly median |
| `getCostOfLivingIndex` | `{index: 100}` | everywhere costs the national average |
| `getEffectiveTaxRate` | `0.22` | one rate for every income, filing status and state |
| `getSafetyIndexScore` | `{score: 50}` | a fabricated middling score to a queer traveller asking if a place is safe |
| `getFailureProbability` | `0.10` | the number that decides whether a warranty is worth buying |
| `getBenefitCliffThresholds` | one fake program | the file's own comment calls this "the highest-stakes placeholder" |

`getUnemploymentBenefit` is the clearest case: `priorWages * 0.02` weekly. On
a $60,000 salary that is **$1,200 a week**, roughly double the highest state
cap in the country. Someone modelling a job exit on that number is modelling
a fantasy, and nothing on screen would tell them.

This is the failure mode this repo's Result contract exists to prevent
(`SPEC.md` §5, §6): a missing input produces an *incomplete state with a
reason*, never a number. A believable wrong answer is worse than a missing
one, because a missing one cannot be acted on.

**The fix is small.** Have every placeholder return the unavailable shape
rather than a value:

```ts
type Unavailable = { status: "unavailable"; reason: string; source: string };
export function getNetWorthPercentile(...): PercentileResult | Unavailable {
  return { status: "unavailable", reason: "No percentile data loaded yet.",
           source: "Fed Survey of Consumer Finances" };
}
```

A calculator then physically cannot render a fabricated percentile, and the
room says "we don't have this yet" — which is true, and which someone can
act on.

**`getIrsLimits(year)` ignores its own `year` argument** and returns 2024
figures. The signature promises year-tagged data and delivers a constant.
Against `data/irs_limits_2026.json`: 401(k) elective 23,000 vs **24,500**,
IRA 7,000 vs **7,500**, HSA 4,150/8,300 vs **4,400/8,750**. Anything built on
that stub is wrong by real money today, not "later when it's wired up".
`getStandardDeductionThreshold` ("2024-ish") and `getGiftTaxExclusion`
(2024's 18,000 / 13.61M) have the same problem, and
`getCurrentMortgageRate()` returns a hardcoded 6.5% for a number that moves
daily.

**Two things in that file are right and worth keeping.**
`getMinimumPaymentFormula` — 2% of balance or $25, whichever is greater —
matches `data/debt_rules.json` exactly, so the two builds already agree
there. And `getJobLossRiskMultiplier` is the best decision in the file: a
deliberate pass-through, with a comment arguing *against* building an
automated "risk by state or identity" dataset and taking the number from the
person instead. That is the right instinct, and it generalises — where data
is contested, sensitive, or cannot be maintained honestly, ask rather than
fabricate. The rest of the file would be safer built that way.

## 10. What this repo changed as a result

Our tables were honest about provenance, but only in prose, and rooms
surfaced it inconsistently — some said "unverified for 2026", most said
nothing. Nothing enforced it. So every table in `data/` now carries a
machine-readable `confidence` and a `confidenceNote`:

- **`sourced`** — traceable to a named primary source, quoted as published
  (SCF percentiles, SE-tax mechanics)
- **`convention`** — a rule of thumb or stated convention, not a measurement
  (budget splits, FIRE variants, hassle weights, retirement multiples)
- **`unverified`** — believed current, not checked against the source
  (effective tax bands, 2026 IRS limits)

`test/run.js` fails any table without one, an untagged table reads as
`unverified` rather than trustworthy by default, and
`Reference.provenance()` returns them weakest-first so a room leads with the
figure a reader should trust least. Where It Goes and the Financial Snapshot
now print it, generated from the tables rather than hand-written prose that
goes stale the moment a table is refreshed.
