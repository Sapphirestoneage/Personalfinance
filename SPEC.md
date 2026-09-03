# SPARKS / SLAF — Tier 0–2 Build Brief for Claude Code
*Paste this whole file into Claude Code as the session-opening message.*

---

## 0. Before touching code

Read `CLAUDE.md`, `README.md`, and `DECISIONS.md` in this repo. Confirm the
current state — `index.html`, `shared/spine-v2.js`, `shared/registry.js`, and
the three rooms (`real-hourly-wage`, `money-calendar`,
`student-loan-decision`) should already exist. Verify they still work the way
`DECISIONS.md` describes: serve locally (`python3 -m http.server`), no
console errors, deep-link hashes still jump to the right section in each
room. Don't assume they're fine because they're present — actually check.

> **Note from last verification pass (outside this session):** all six files
> served with 200s, all inline `<script>` blocks and both shared JS files
> passed a syntax check, and every subsection id declared in
> `shared/registry.js` exists as a real element id in its room. That covers
> "doesn't crash." It does **not** cover visual/mobile rendering (calendar
> grid, phone-width layout) — do a real browser pass on that before treating
> Tranche 1 as closed.

---

## 0.1 First action, before anything else: commit this brief into the repo

This entire brief — including every resolved decision in Section 12, the
7%/4% defaults, the navy-sapphire requirement, the demo-data policy in
Section 5.1 — currently exists only in this chat message. It is not durable
across sessions unless it's a file in the repo. **Before any other work,
commit this document verbatim as `SPEC.md` at the repo root**, and add one
line to `CLAUDE.md` pointing at it ("see `SPEC.md` for the full Tier 0–2
build spec and locked decisions"). A future session that only reads
`CLAUDE.md` and `DECISIONS.md` per Section 0 would otherwise have no way to
recover any of this.



Every room ships in the navy-sapphire design system: **Fraunces** for display/
headline type, **Space Grotesk** for body/UI type. This isn't a Tier 0–2
feature to build — it's the visual baseline every room in this build should
already be using.

**Confirmed gap, not a hypothetical:** all four existing files
(`index.html` and all three Tranche 1 rooms) currently use the system font
stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) — no
Fraunces, no Space Grotesk — and a slate/amber/teal palette
(`#0f1720` base, `#f2b45a` amber, `#4fd1a5` teal, `#e0715a`, plus grays)
with no sapphire tone anywhere. Bring all four into the navy-sapphire system
before any new Tier 0 work ships, as its own commit, separate from any
feature work. Build the type/color values as CSS custom properties in one
shared stylesheet or `<style>` block every room includes, rather than
repeating hex values per file — this is exactly the kind of value that will
drift across 25+ rooms if it isn't centralized now. Log the exact palette/
type values chosen in `DECISIONS.md` so later rooms don't have to
reverse-engineer them from a finished file.

## 1. Structural conflict to resolve first — read this before section 2

`shared/spine-v2.js` (as built) is a flat `localStorage` key-value merge:
`updateProfile({annualSalary: 65000})` shallow-merges into one flat object.
The data model this build brief now locks in (Section 3 below) is a
**household with an array of people, itemized arrays for assets/debts/income,
and `ownerIds` on shared items** — nothing like a flat profile object.

These two are not compatible as-is. Before building anything past Tranche 1,
**migrate `spine-v2`'s stored shape to the `household` schema in Section 3**,
keeping the existing function names (`getProfile`, `updateProfile`,
`onChange`, `registerRoom`, `getVisitedRooms`) as the API surface. Log this
migration in `DECISIONS.md` as its own entry.

> **Pre-approved, not a fresh stop-and-ask:** `CLAUDE.md` lists "you'd need to
> change the spine v2 contract itself" as a stop-and-ask case. This migration
> was already worked through with Eli directly (outside this repo) — proceed
> with it rather than pausing again. Still log it in `DECISIONS.md` per the
> normal workflow.

**This is a two-part migration, not just a spine-file change — confirmed by
reading the actual current calls:**

1. `shared/spine-v2.js` — change what `getProfile()` returns and what
   `updateProfile()` expects, per Section 3.
2. **Every room that currently calls the old flat shape has to be updated to
   match, in the same pass:**
   - `real-hourly-wage.html` currently calls
     `updateProfile({ annualSalary, hoursPerWeek })` — flat keys that don't
     exist in the household model. Migrate to writing an `incomeSources`
     entry under the relevant person in `household.people[]`.
   - `student-loan-decision.html` currently calls
     `updateProfile({ studentLoanBalance, studentLoanRate })` — same issue.
     Migrate to writing a debt item (`{id, balance, rate, minPayment: null,
     type: 'student_loan', ownerIds}`) into the itemized debt array.
   - `money-calendar.html` currently **only** calls `registerRoom()` — it
     doesn't read or write shared profile data at all yet, so there's no
     existing call to break here, but it also isn't feeding or consuming
     the household model. Wiring it in is new integration work, not a
     migration, and can happen on its own timeline rather than blocking
     the spine-v2 change.
   Keeping `updateProfile`'s *name* stable doesn't help if callers still
   pass the old flat keys into a function now expecting person/ownerIds
   shape — the call sites themselves must change.
3. **Compatibility note (required by `CLAUDE.md`'s "never change how
   existing rooms read shared profile data without a compatibility note"
   guardrail):** write a short note in `DECISIONS.md` stating exactly what
   changed in the profile shape, which two rooms were updated to match, and
   what a future room needs to know before calling `getProfile()`/
   `updateProfile()` for the first time (i.e. "read Section 3 of this brief
   or the schema file, don't assume flat keys").

This also answers open item 3 below: once `spine-v2` stores
`household.people[].incomeSources[]`, multi-income-source support isn't a
separate feature to bolt onto Money Calendar later — it's already there in
the data model. Money Calendar's UI can stay single-income for now if that's
the right scope for this tranche, but the *storage* should already be
array-shaped so it isn't rebuilt twice.

---

## 2. The three open items from `DECISIONS.md`

1. **Spine v2 contract** — resolved above: migrate to the household schema,
   keep the existing API function names.
2. **Starting-spot picker / level track on the Map shell — resolved, see
   Section 12, items 6 and 7.** Picker stays as the existing tag filter;
   level track becomes a simple visited-rooms progress bar off
   `getVisitedRooms()`.
3. **Money Calendar multi-income-source support** — resolved above via the
   schema migration.

---

## 3. The Central Data Model — locked, build to this exactly

One canonical object is the single source of truth. Every tool *reads* from
it and *writes* to it. No tool holds a private copy of a number that also
exists elsewhere.

**The root is a household, not a person.** Unlimited array of people —
partners, kids, any future relationship the app needs to model, without a
schema change:

```
household: {
  people: [
    { id, label, role: 'adult' | 'child' | 'dependent' | 'other',
      dob, incomeSources: [...] }   // incomeSources only meaningful for adults
  ],
  filingStatus, state
}
```

Every shared item (asset, debt, income source) carries `ownerIds` instead of
belonging to a fixed "individual" or "joint" bucket:

```
ownerIds: [personId]              // one person = individually owned
ownerIds: [personId, personId2]   // two+ people = joint
```

**Aggregation rule:** household-level Tier 0/1 outputs (Net Worth, DTI,
Savings Rate, etc.) sum every item exactly once regardless of `ownerIds`
length — a jointly-owned asset isn't double-counted because two people are
listed. Per-person views (Real Hourly Wage, Career ROI, W2 vs. 1099 — anything
inherently individual) filter to items where `ownerIds` includes that
specific person. Kids (`role: 'child'`) are excluded from income/asset/debt
aggregation by default.

**Three data classes — tag every field, no exceptions:**

| Class | Definition | Example | Rule |
|---|---|---|---|
| Raw input | User-typed, nothing derives it | `grossAnnualIncome`, `cashBalance` | Only place this is edited. Editing cascades everywhere. |
| Computed | Formula output, never directly editable | `netWorth`, `savingsRate` | Recalculates on every raw-input change. Never stored stale. |
| Assumption | User-set but not a "fact" | `expectedReturnRate`, `swrPercent` | Has a system default; user override persists separately so it can be reset. |

Any field whose class is ambiguous (e.g. "monthly expenses" — raw estimate
until Cash Flow calc makes it computed/tracked) needs an explicit
`source: 'estimated' | 'tracked'` tag from day one, not retrofitted later.

**Itemized over lump-sum, always, with ownership attached:**
- Debts: `[{id, balance, rate, minPayment, type, emotionalTag, ownerIds}]`
- Assets: `[{id, category, value, liquid: bool, ownerIds}]`
- Income: `[{personId, source, grossAmount, frequency, type: 'w2'|'1099'}]`
  (income is individual — no joint paycheck — so this uses `personId`, not
  `ownerIds`)

Retrofitting a lump-sum schema into an array later is the single most
expensive mistake available here. Don't make it.

---

## 4. Naming & Units — lock a dictionary before writing tools

For every field used in more than one tool, decide once and write it into a
schema file (JSON Schema or TypeScript types) that gets read before any tool
is written — not a convention hoped-for:

- Exact field name (`grossAnnualIncome`, never `income` in one tool and
  `grossIncome` in another).
- Unit — is `savingsRate` stored as `0.15` or `15`? Pick one, convert only at
  display time.
- Period — pick one canonical period per field (e.g. expenses always
  monthly); convert at the edges.
- Nullable vs. zero — `undefined`/`null` means "not yet entered." `0` means
  "user affirmatively entered zero." These must never collapse into each
  other. A never-touched field renders blank, not `0` or `$0`.

---

## 5. "No Random Zeros, Fully Editable" — engineering rules

1. Empty ≠ zero, always. Inputs default to empty/placeholder, never a
   pre-filled `0`. Placeholder shows format (`"e.g. 75000"`), not a fake
   value.
2. Computed fields never show a stale number. If an upstream raw input is
   empty, the computed field shows "—" or "enter income above," never `$0`,
   `NaN`, or last session's leftover value.
3. No silent fallback to `0` in formulas. `income || 0` is exactly how a
   zero survives. Missing required input → output shows its "incomplete"
   state, it doesn't compute.
4. Editing is always in place, always to the one canonical field. No local
   state that can drift from the registry.
5. Currency/percent fields format on blur, not keystroke.

### 5.1 Demo data vs. empty state — confirmed conflict to fix, not a hypothetical

**Confirmed by reading the actual files:** every input in all three shipped
rooms currently ships with a real pre-filled `value` attribute
(`value="65000"` for salary, `value="24000"` for loan balance, etc.), not an
empty field with placeholder text. This directly violates rule 1 above, and
it's also a bad first impression for the "free sample, look what I can do"
framing — a first-time visitor sees a stranger's numbers already sitting in
the form, not a blank tool waiting for theirs.

**Fix, applied consistently across all Tier 0–2 rooms including the three
already shipped:**

- Every input's live default is **empty**, using `placeholder="e.g. 65000"`
  (format only, no fake value) — not a pre-filled `value`. This is the
  default state anyone landing on a shared link sees.
- Separately, add a clearly-labeled **"Try with example numbers"** action
  (a button or link, not the default state) that fills the form with one
  consistent, obviously-fictional demo persona — same name/numbers reused
  across every room that shares data through the household model, so
  Real Hourly Wage's example salary matches what Student Loan Decision's
  example household would actually show, instead of each room inventing its
  own unrelated demo numbers. Define this persona once (e.g. in
  `shared/registry.js` or a new `shared/demo-persona.js`) and reference it
  everywhere, rather than hardcoding the same numbers into each room's file.
  Log the exact persona values in `DECISIONS.md` so they don't drift.
- This does not change Section 14's verification step: keep re-deriving the
  math by hand against this same demo persona's numbers to confirm formulas
  are correct — the numbers just move from being the silent default to being
  behind an explicit "try an example" action.
- Converting existing rooms from pre-filled `value=` to empty +
  `placeholder=` is itself a small, isolated change — do it as part of the
  same commit as the brand pass (Section 0.5) rather than a separate one,
  since both are "bring Tranche 1 in line with a rule this brief adds," not
  new features.


---

## 6. Cross-Cutting Design Rules — locked

- **Divide-by-zero / undefined ratios:** any ratio with a zero or missing
  denominator displays as `—` with a one-line reason ("add your expenses to
  see this"), never `0`, `NaN`, or `Infinity`. Build one shared "safe divide"
  utility every calculator calls.
- **Negative net worth (and negative anything):** displays plainly as
  negative, never hidden. A percentile/benchmark table that can't rank a
  negative value shows "below chart," not a fake extrapolated percentile.
- **Assumptions never silently reshape past data:** every snapshot stores
  `{rawInputs, assumptionsUsed, computedOutputs}` — the assumption values
  used *at that moment* — so historical comparisons stay honest if a default
  (e.g. SWR) changes later.
- **Money precision:** store dollar amounts as integer cents internally,
  never floating-point dollars. Format to dollars only at display time.
- **Reference-data "as of" dating:** every computed output records which
  version of a reference table it used (IRS limits, percentile tables, COL
  indices, all versioned by year). A snapshot's numbers don't silently
  recompute against next year's table.

---

## 7. Reference Data — separate from code, now

Some outputs are pure formulas (Net Worth); some need externally maintained
data (percentile tables, state benefit tables, COL indices, depreciation
curves, IRS limits). Every reference table becomes a config file/data source,
versioned by year where relevant (`irs_limits_2026.json`), never hardcoded
inline in a calculator function. None of these need to exist for MVP, but the
shape — "pulls from config, not code" — has to be right from Tier 0 so Tier 2
doesn't have to undo it. Covers: age-bucketed retirement milestones, net
worth percentile table (Fed SCF), state unemployment/COBRA formulas,
401k/IRA/HSA limits, depreciation curves, COL indices, failure-probability
tables.

---

## 8. One Formula, One Function — DRY rule for math

- One function per *concept*, parameterized for variants — never
  copy-pasted with small edits. Examples: `calculateFIRE()` parameterized by
  variant instead of five copies; Credit Card calc as a filtered view of the
  general Debt Calculator, not a separate build; Wedding calc and Dream
  Calculator sharing one Goal Costing Engine; Career ROI and Skills
  Calculator sharing one credential-ROI engine.
- Build the shared engine **before** the first specific tool that uses it, if
  2+ tools are already known to need it.
- A ratio that's a denominator-swap of another (DTI vs. Debt-to-Asset, both
  use total debt) shares the underlying function, not a recomputation.

---

## 9. Dependency Build Order — build in this order or you'll build things twice

1. Schema + registry (Section 3) — nothing else starts without this.
2. Itemized data model for assets/debts/income — store in array shape even
   for Tier 0's "lump sum."
3. Tier 0's 9 outputs — pure functions off the registry.
4. Cash Flow calc (categorized) — Fulfillment Curve, Values vs. Spending
   Audit, Mutant Expenses Identifier, Personal Inflation calc, and real
   Savings Rate all sit downstream of this existing in categorized form.
5. Debt array + Debt Calculator engine — Credit Card calc is a filtered view
   of this.
6. Goal Costing Engine — before Wedding/Dream/any future goal calculator.
7. Real Hourly Wage engine — before Prospective Worth calc and Side Hustle
   calc, which both consume it. *(Already built in Tranche 1 — reconcile
   its output shape against this engine spec rather than building a second
   one.)*
8. Financial Health Score — explicitly last; it's a weighted aggregate of
   everything else.

---

## 10. Name the genuinely complex parts so nothing gets improvised

- **Tax estimation** — flat effective-rate lookup table (income bracket +
  filing status) for MVP, not inline math, so a real tax engine can swap in
  later without touching calculator code.
- **Amortization math** (Debt Calculator with extra payments) — month-by-month
  simulation loop, not a closed-form formula. *(Student Loan Decision room
  already does single-loan amortization — extend, don't duplicate, when the
  general Debt Calculator is built.)*
- **Non-linear models** (whole life cash value, revenue ramps) — need a
  curve/model choice exposed as a toggle, not one hardcoded formula.
- **State-specific rules** (unemployment, COBRA, tax) — 50-way branches; data
  problems dressed as calculators, kept out of core calculation code.
- **Free-text/LLM-backed tools** (Advice Translator, FinTok Fact-Checker) —
  architecturally distinct from the rest of the suite; separate build track,
  not "just another calculator." Out of scope for Tier 0–2 unless explicitly
  requested.
- **Snapshot/history** (Financial Snapshot, Lifestyle-Inflation Tracker,
  Retroactive vs. Prospective pairing) — append-only versioned table from day
  one.

---

## 11. Per-Tool Spec Template — answer all five before building any tool

1. Which registry fields does it **read**?
2. Which registry fields does it **write** (raw inputs only — never write to
   computed fields)?
3. Which shared engine/function does it call, if any — don't invent a
   parallel calculation?
4. What does the empty/incomplete state look like, field by field?
5. Which reference/config data does it depend on, and where does that config
   live?

If you can't answer all five for a tool, stop and ask rather than guessing.

---

## 12. Decisions still needed from Eli before autonomous build

Do not guess on these. If any are still marked `PENDING` when you reach the
relevant tool, stop and ask instead of picking a default.

1. **Savings rate — does it include employer match dollars? RESOLVED:
   build both.** Compute two labeled variants —
   `savingsRateExcludingMatch` and `savingsRateIncludingMatch` — both as
   Computed fields off the same registry data, never two separately
   maintained calculations. Every place Savings Rate is displayed (Tier 0
   output, Financial Health Score input, etc.) needs to be explicit about
   which variant it's showing, not just label it "Savings Rate." Decide the
   default *displayed* variant per surface as you build it; both must always
   be available.
2. **Default assumed return rate and SWR — RESOLVED: 7% return, 4% SWR.**
   Store both as Assumption-class fields (Section 3) with these as the
   system defaults — never hardcoded inline in a formula. Globally tunable:
   one setting on the household/registry, not a per-tool override. Any tool
   that lets a user override it (e.g. testing a more conservative SWR on the
   FIRE Number output) does so as a local, non-persistent override for that
   view, not a change to the stored default — see Section 6's rule on
   assumptions never silently reshaping past data.
3. **Estimated → tracked transition — RESOLVED: never overwrite, keep
   both permanently.** When Cash Flow calc produces real category data, the
   original `source: 'estimated'` value is preserved forever, not replaced.
   Add a `trackedValue` alongside the existing `estimatedValue` +
   `source` tag from Section 3, and compute a `divergence` (tracked −
   estimated) as its own Computed field. This is a real feature (ties into
   the divergence-flagging idea already in the spec — "how far off was your
   self-estimate"), not a migration step to clean up. Any UI showing the
   "current" number for a field with both should default to `trackedValue`
   once it exists, but `estimatedValue` stays queryable indefinitely for the
   comparison.
4. **Financial Health Score weighting** — tunable by age cohort, or one fixed
   formula for v1? (Build this last regardless — see Section 9.)
   `[PENDING]`
5. **Manual entry only for v1, or bank-linked import architected in from the
   start? RESOLVED: manual entry now, but architect for bank-linked import.**
   Cash Flow calc's schema (Tier 1) must be built to support a future
   transaction-import source without a rewrite — e.g. a `source: 'manual' |
   'imported'` tag per transaction/category-entry, and categorization logic
   that operates on a transaction shape rather than assuming hand-typed
   totals. No import UI or connector work this tranche.
6. **Map shell — starting-spot picker: RESOLVED, closed, no build needed.**
   Keep the current tag filter (All / income / cashflow / debt) as-is —
   it's staying, not a placeholder to replace.
7. **Map shell — level track: RESOLVED.** Build a simple visited-rooms
   progress bar. `shared/spine-v2.js` already has `getVisitedRooms()` — use
   it directly rather than adding new tracking state. Progress is just
   "N of {total rooms in registry.js} visited," rendered as a bar on the Map
   shell. No XP, streaks, or scoring system — that's explicitly out of scope
   unless raised again later.

---

## 13. Full Tier 0–2 Tool Specification

*(This is the complete spec — every input, output, formula, and per-tool
coding note for Tier 0 through Tier 2. Build order still follows Section 9
above regardless of the order tools are listed here.)*

### TIER 0 — MVP Demo: 10-Input Financial Snapshot

**The 10 Inputs**
1. Date of birth
2. State/zip
3. Gross annual income
4. Filing status
5. Current cash/savings balance
6. Current investment + retirement balance
7. Total debt balances (lump sum + weighted avg rate acceptable for MVP)
8. Total monthly minimum debt payments
9. Monthly essential expenses / total monthly spend
10. Employer retirement match (% and cap, or "none")

**Input specs**

- *DOB + State/Zip:* establishes age (benchmark lookups) and jurisdiction
  (tax brackets, COL indexing). Store as ISO date + 2-letter state code;
  derive age server-side, never trust client-calculated age.
- *Gross Annual Income + Filing Status:* base for nearly every income-relative
  ratio (DTI, Savings Rate, Housing Ratio, FI Ratio, Retirement Savings
  Multiple, Net Worth to Income). W2 vs 1099 calc should feed this for
  self-employed users (compute effective gross after SE tax). Store as
  annual figure; normalize on input if entered hourly/monthly.
- *Cash/Savings + Investment/Retirement Balances:* asset side of net worth;
  splits liquid vs. illiquid for Emergency Fund calc. Keep cash and
  investments as separate fields — Liquidity Ratio and Emergency Fund
  Coverage use cash alone, not combined assets.
- *Total Debt Balance + Monthly Minimum Payments:* balance feeds Net Worth
  and Debt-to-Asset Ratio; payment feeds DTI — a different calculation people
  conflate. MVP can accept lump sum + weighted average rate, but the data
  model must already support itemized debts (Section 3).
- *Monthly Essential Expenses:* denominator for Emergency Fund Coverage,
  basis for FIRE Number (×12×25), input to Savings Rate. Tag as
  `source: 'estimated'` vs `'tracked'` per Section 3 — this is exactly the
  field Cash Flow calc later supersedes with real data.
- *Employer Retirement Match:* model as two sub-fields
  (`matchPercent`, `matchCapPercentOfSalary`) — "50% up to 6%" needs both
  numbers to compute the dollar value.

**The 9 Outputs**

- **Net Worth:** `(cash + investments) − debt`. Show component bars (assets,
  liabilities), not just the final number.
- **Savings Rate:** `(gross_income − (expenses × 12) − estimated_taxes) /
  gross_income`. `estimated_taxes` uses a flat effective-rate lookup table by
  income bracket + filing status for MVP.
- **Emergency Fund Coverage:** `cash / monthly_expenses`, output in months.
- **Debt-to-Income Ratio:** `monthly_debt_payments / (gross_income / 12)`.
  Use gross income, not net — benchmark thresholds (28%/36%) are calibrated
  to gross.
- **FIRE Number:** `(monthly_expenses × 12) × 25` (inverse of 4% SWR — if SWR
  becomes user-adjustable, formula becomes `annual_expenses / assumed_swr`).
- **FIRE Progress %:** `investments / fire_number`. Pair with a
  time-to-FIRE projection (needs a return-rate assumption).
- **Net Worth Percentile:** needs an external lookup table (age × income →
  percentile), sourced from Fed SCF or similar, refreshed periodically, not
  computed live.
- **Retirement Benchmark Check:** `investments / gross_income`, compared
  against an age-bucketed milestone table (1x@30, 3x@40, 6x@50, 8x@60,
  10x@67 — linear-interpolate between buckets).
- **FOO Placement:** rules-based, not formula-based — a sequential
  boolean-gate check evaluating the FOO ladder steps in order, stopping at
  the first unmet condition. Also the home for the 5 Out-of-Bounds flags
  (a flag fires when a *later* step is pursued while an *earlier* step is
  incomplete).

**FOO (Financial Order of Operations) Ladder**
0. Cover basic living expenses + enroll in employer benefits
1. Starter emergency fund (~$1,000 or 1 month expenses)
2. Capture full employer 401k match
3. Pay off high-interest debt (>~7-8%)
4. Build full emergency fund (3-6 months)
5. Max HSA if eligible
6. Max Roth IRA (or backdoor Roth)
7. Max remaining tax-advantaged space (401k, etc.)
8. Hyper-accumulation / taxable brokerage
9. Prepay low-interest debt or other goals

**Out-of-Bounds Flags (auto-surfaced)**
- Emergency fund exists alongside high-interest debt → flag to redirect
- Not capturing full employer match → flag as free money left on table
- DTI above 36% → flag as outside standard lending comfort zone
- Savings rate below ~10-15% at income level → flag as below typical
  benchmark for age
- High implied credit utilization relative to debt load → flag for review

---

### TIER 1 — Fully Modular (pure math, prepopulate from basics)

- **Net Worth calc** — sums assets, subtracts liabilities. Most-referenced
  number in the app. Inputs: cash, investments, real estate equity, vehicle
  value, other assets; all debts. Store assets/liabilities as itemized
  arrays even in MVP.
- **Savings Rate calc** — % of income saved/invested. Two-Income Household
  Toggle must multiply/adjust this; Soft Saving Balance Calculator is this
  formula split into 3 buckets. Decide once whether "savings" includes
  employer match dollars (Section 12, item 1) and stay consistent everywhere.
- **FIRE variants (Lean/Coast/Fat/Chubby/Barista)** — five flavors of
  `expenses × 25`, each changing the expense assumption or adding a twist.
  Coast FI needs current-age + target-age + return-rate projection. Build
  one `calculateFIRE()` parameterized by variant, not five calculators.
- **Debt Calculator** — payoff timeline and total interest across multiple
  debts, orderable by avalanche/snowball/convenience/hybrid. Makes the
  itemized-debt-array data model non-negotiable. Amortization math is a
  month-by-month simulation loop once extra payments are involved.
- **Credit Card calc** — payoff time and interest at current vs. accelerated
  payment; optionally compares rewards value vs. carrying-balance cost.
  Decide whether this is a specialized view or filtered display of the
  general Debt Calculator. Minimum payment formulas vary by issuer
  (typically 1-3% of balance or a flat floor) — don't hardcode one formula.
- **Bank Bonus calc** — net value of a signup bonus after funding
  requirements and opportunity cost of tied-up funds. Needs a live or
  periodically-refreshed database of current bank offers — flag as a
  data-maintenance dependency, not just a formula.
- **Rent/Buy calc** — renting vs. buying over a hold period. Superseded/
  refined by the full True Cost of Homeownership build (Tier 17) — this
  should be a thin wrapper calling into that engine once it exists, not a
  parallel calculation path.
- **Warranty calc** — expected value math on extended warranties. The
  failure-probability lookup table (by category) is the hard part — a
  maintained reference dataset, not user-entered.
- **HYSA Switch calc** — value of moving cash from lower-APY to higher-APY
  account, net of switching friction. Trivial math
  (`balance × (new_apy − old_apy)`); value-add is pairing with a live
  rate-comparison feed.
- **Lump Sum vs. DCA** — investing a lump sum vs. spreading over time.
  Showing the "usually loses but reduces regret risk" nuance properly needs
  a Monte Carlo simulation, not a single deterministic projection.
- **Car Depreciation calc** — value loss over time by make/model/mileage.
  Feeds the Resale/Pre-Owned Value Tracker. Needs a depreciation-curve
  dataset by vehicle category at minimum; true model specificity needs a
  licensed data source — scope MVP to category-level curves.
- **W2 vs. 1099 calc** — normalizes take-home pay accounting for SE tax and
  lost benefits. SE tax calc (15.3% on net earnings, employer-equivalent
  half deductible) is a common source of off-by-a-factor errors — test
  against IRS worksheet examples directly.
- **W4 calc** — sets withholding to hit a target refund/owed amount. Treat
  as an external, versioned dependency since it replicates IRS Form W-4
  worksheet logic, which changes periodically.
- **Quarterly Estimated Tax calc** — required quarterly payments for
  self-employed/1099 income. Include the safe harbor rule (pay 100-110% of
  prior year's liability) — most DIY calculators skip it.
- **Cash Flow calc** — income minus expenses by category. Design schema to
  support both manual entry and bank-linked transaction import from day one,
  even if MVP is manual-only.
- **Budget templates (50/20/30, zero-based)** — keep template logic
  (percentage splits/category list) as configuration data, not hardcoded, so
  DRAFTT and other templates can be added without new code.
- **Return on Hassle calc** — dollars saved vs. time/effort. Defaultable
  hassle-score-by-activity-type is a small reference table worth building
  early.
- **Girl Math / Lifetime Value calc** — cost-per-use math, playful framing.
  Trivial math — entire value is in tone/copy.
- **DRAFTT / FAT FIRE expense templates** — alternative category-weighting
  presets for the FIRE expense input. Same configuration-data pattern as
  Budget templates.
- **Retroactive Worth calc / Prospective Worth calc** — designed as a
  before/after pair; Prospective's prediction should be storable and later
  compared against Retroactive's actual outcome if wired together with a
  shared ID.
- **HCOL/MCOL/LCOL standalone** — COL index and salary equivalency between
  locations. Also functions as a Tier 2 modifier across other tools. Needs a
  maintained COL index dataset (BEA regional price parities or licensed COL
  API).
- **Financial Snapshot / Save-State feature** — implement as a versioned
  snapshot table (`user_id, timestamp, JSON blob of all Tier 0 inputs/
  outputs`) rather than reconstructing history from a mutable "current"
  record.
- **Rule of Five / $30k-$90k Rule / 20/3/8 Car Buying Rule** — one-line
  formulas; decide standalone mini-calculators vs. inline annotations
  wherever the relevant number already appears.
- **Real Hourly Wage / Life Energy calc** — nets true income (after
  work-related costs) against true time cost (commute, prep, decompression)
  to get a real hourly rate. *(Already built in Tranche 1 — reconcile
  against Prospective Worth calc's "hourly value" input so it's reused, not
  duplicated.)*
- **Mutant Expenses Identifier** — flags expense categories growing faster
  than inflation. Needs 12+ months of tracked history — the formula is
  simple but can't run without it.

---

### TIER 1.5 — Modular, needs one self-report input

- **SWAN Number** — feeling-based liquid-savings benchmark ("sleep well at
  night" amount), stored as a standalone user-set target, separate from
  computed Emergency Fund Coverage — display both side by side.
- **Fulfillment Curve** — cross-references spend-per-category against a
  1-10 joy rating. The 1-10 rating mechanism is shared infrastructure with
  Category Tracker Engine, Dating Cost Calculator, and Retroactive Worth
  calc — build one reusable rating component, not four. Needs Cash Flow
  calc's categorized data as a prerequisite.
- **Financial Health Score** — single 0-100 composite; weighted aggregate of
  DTI, Savings Rate, Emergency Fund Ratio, Net Worth trajectory, etc.
  Genuinely blocked on sequencing — build last (Section 9, item 8), and see
  Section 12, item 4 for the weighting decision.

---

### TIER 2 — Self-contained, needs a few personal decisions

- **Leave-Job calc** — runway/risk of quitting: severance, COBRA, unemployment
  eligibility, emergency fund drawdown timeline. Shares math with
  Unemployment calc and Emergency Fund Coverage. COBRA/unemployment amounts
  are state/employer-specific lookups, not pure user input.
- **Start-Business calc** — runway/breakeven for launching a business.
  Needs a revenue-ramp curve (linear vs. hockey-stick) as a togglable model.
- **Side Hustle calc** — net profitability of side income after taxes, time
  cost, expenses. Shares the Real Hourly Wage engine. Use marginal (not
  effective) tax rate, since side income stacks on primary income.
- **Wedding calc** — itemized wedding budget against a savings timeline.
  Structurally identical to Dream Calculator — one Goal Costing Engine both
  call into.
- **Kids calc** — cumulative cost of raising a child vs. income/savings
  plan. Childcare cost data is regional and needs a maintained lookup table;
  college cost projection needs an assumed tuition-inflation rate.
- **Travel calc** — entry-level tier of the full Vacation/Travel Calculator
  (Tier 16) engine, not a separate codebase.
- **Unemployment calc** — benefit amount/duration by state; runway until
  benefits deplete. Needs a 50-state reference table.
- **Solo 401k (SEP/S-corp) calc** — contribution limits and tax treatment
  across self-employed retirement structures. Store limits as versioned/
  year-tagged config (IRS-defined, changes annually).
- **Roth vs. Traditional vs. Brokerage calc** — after-tax outcomes given
  current vs. assumed future tax rates. Surface the tax-rate assumption
  prominently — the whole comparison hinges on it.
- **House Hack calc** — owner-occupied multi-unit/room-rental income
  offsetting mortgage cost. Build as an extension of the Tier 17
  ownership-cost engine with a rental-income offset line, not standalone.
- **Whole Life Insurance calc** — cash-value accumulation and death benefit
  vs. "buy term, invest the difference." Cash value growth is back-loaded
  (non-linear) — accurate modeling needs actual policy illustration data.
- **Prenup / Estate Planning / Beneficiaries** — guided questionnaire
  generating a plain-English asset/debt/distribution summary. Document-
  generation problem, not a calculation problem — inputs are the same
  asset/debt inventory from Net Worth calc, re-presented as a document.
- **Personal Inflation calc** — individual cost-of-living increase from
  their specific spending mix. Needs a maintained category-level inflation
  dataset (BLS), weighted against actual category spend from Cash Flow calc.
- **Career ROI calc** — payback period and lifetime value of a career move.
  Overlaps with College Major ROI, Trade School vs. 4-Year ROI, Skills
  Calculator — could share one "credential ROI" engine with different
  preset data per pathway. Discount future income delta to present value.
- **Dream Calculator** — merge into the shared Goal Costing Engine with a
  template library (wedding, dream home, sabbatical, etc.).
- **Skills Calculator** — ROI of learning a single skill; shares ROI math
  with Career ROI calc, narrower scope. Distinct from FI Skill Tree (a
  625-skill framework).
- **HCOL/MCOL/LCOL — modifier** — implement as a multiplier/lookup service
  other calculators call, not duplicated logic inside each one.
- **Convenience Method** — orders debt payoff by relational/emotional
  weight. Already one of four selectable methods in the Debt Calculator —
  needs a way for users to manually tag debts by emotional priority (e.g.
  "owed to family").
- **Second Mouse Framework** — not a calculator; contextual guidance text
  attached to Bank Bonus calc and Sports Arb calc.
- **Zombie Apocalypse Theory of Savings** — content, not code; contextual
  copy attached to the Emergency Fund Coverage output in Tier 0.
- **Trust Framework for Financial Advice** — static 3-question vetting
  checklist; pairs with the Financial Advisor Vetting/Red-Flag Checker.
- **Advice Translator / Unlearning Layer** — evaluates whether advice
  applies to the user's current stage. Plausibly needs an LLM-backed
  classification step, not pure rules logic — flag as out of scope for this
  tranche unless explicitly requested.
- **Values vs. Spending Audit** — stated top-5 values vs. actual last-month
  spending. The "gap" output is inherently qualitative/visual — design as a
  comparison view, not a scalar. Bridges to Tier 1 fully once wired to live
  Cash Flow calc data.

---

## 14. Execution rules for this session

- Full autonomy within the current tranche, once Section 12's pending items
  are answered.
- One commit per room.
- Verify each room yourself on a local server before calling it done — serve
  it, check for console errors, click through deep-link hashes, re-run the
  core math outside the browser against demo inputs to confirm formulas are
  correct (not just "doesn't crash").
- Log every assumption in `DECISIONS.md`, same format as the existing
  entries.
- This repo is public. No real financial data, ever — demo/placeholder
  values only.
