# ROADMAP.md — the master idea index

This is the full universe of SPARKS / SLAF ideas, tiers 0 through 24. It is
the **idea index**, not the build plan.

`SPEC.md` is the build plan, and it deliberately covers a slice of this
document: Tier 0, Tier 1, Tier 1.5 and Tier 2. Where the two disagree about
a locked decision, units, naming or build order, `SPEC.md` wins.
`DECISIONS.md` records what was decided and why while building.

## Read the status key carefully

The checklist below uses ✅ to mean **the idea is locked and clear** — not
that it exists. Nearly every line is ✅ under that meaning, and roughly a
fifth of them are actually shipped. Anyone opening this repo and reading two
hundred green ticks as "done" would be badly misled, so the build status
lives here, separately, and is kept honest against `shared/registry.js`.

## What is actually built, as of the last commit

Twenty-five rooms are live. Against this document's own tiers:

| Tier | In this doc | Shipped | What's shipped |
|---|---|---|---|
| **0** — MVP snapshot | 10 inputs, 9 outputs, FOO ladder, 5 flags | **all of it** | Start Here, Financial Snapshot, FOO Ladder |
| **1** — fully modular | 29 | **21** | Net Worth · Savings Rate · FIRE variants · Debt Calculator · Credit Card view · HYSA Switch · Cash Flow · Budget templates · Return on Hassle · Girl Math (cost per use) · Snapshot/save-state · Rule of Five · $30k/$90k · 20/3/8 · Real Hourly Wage · W2 vs 1099 · Quarterly Estimated Tax · Retroactive Worth · Prospective Worth · Lump Sum vs DCA · FAT FIRE template |
| **1.5** — one self-report | 3 | **3** | SWAN Number · Fulfillment Curve · Financial Health Score |
| **2** — a few decisions | 23 | **14** | Side Hustle · Solo 401(k) · Roth vs Traditional vs Brokerage · Wedding · Dream Calculator · Convenience Method · Zombie Apocalypse framing · Values vs Spending Audit · Career ROI · Skills Calculator · Leave-Job · Unemployment · Start-Business · Travel |
| **3 and up** | ~280 | **1** | Regret calc (Tier 4) — not a build of its own: it is `Worth.regrets()`, the same records filtered to low ratings. Everything else is out of `SPEC.md` scope |

**Build tranches from `BRIEF.md`** (the work order layered on top of the tiers):

| Tranche | Status | What landed |
|---|---|---|
| **T1** — Dashboard as home + the clock | **shipped** | Four §1.1 bugs fixed (take-home gap, ladder footer/timeline, stable intake count, map digits) · `meta.confirmedAt` per field + `Spine.confirm` + snapshots read back (D-056) · `data/staleness.json`, ages on every chip, the Refresh page (D-057) · six-instrument first screen with deltas and one next action · `index.html` as router, ladder in `rooms/`, map as drawer (D-058) · export / import / share link (D-059) |
| **T2** — Ask less, prepopulate more | **shipped** | Suggested state, shown never stored (D-060) · eleven-card intake with two people, born+state, three-box investments, the 401(k) card with the match proposed and capture derived, deductible and contribution moved in, "no debt" as an answer (D-061) · explore rooms open with your numbers proposed; the federal bracket derived as a proposal (D-062) · Cash Flow opens with a whole month proposed (D-063) · `data/states.json`, `match_defaults.json`, `federal_brackets_2026.json` (unverified), `wealth_multiplier.json`. Two judgement calls: Worth the Hassle already lists the chores with hours and applies its default rating only on pick, and Goals' templates carry no amounts to propose — both left as they are rather than inventing a figure to show |
| **T3** — The 10x Statement | **shipped** | Shape and tables (D-066) · `engines/tax.js` (D-067) · `engines/statement.js` (D-068) · The Statement room replaces Net Worth: three portfolios, weighted net worth, every asset rated, the ladder, the bridge to 59½, your bracket, the worst year, money that is coming (D-069) · the ages you plan around, owned by FIRE (D-070) · the Coverage Checkup in Sleep At Night and the target mix in Where It Goes (D-071). Two people at intake landed in T2 (D-061). Left for T4: the income-concentration ratio and a hassle rating on income sources, which are new numbers rather than statement shape |
| **T4** — New numbers | **shipped** | `engines/benchmarks.js` + `data/levels_of_wealth.json`: wealth multiplier, monthly to $1M/$2M, PAW, the five levels, 1% more, human capital, net worth in years (D-079) · the contributed savings rate beside the residual, and the unallocated gap as a finding (D-080) · fourteen ratios into the registry, three with bands, snapshots read back for lifestyle inflation and net worth growth (D-081) · fixed lines, the minimum viable month, cuttability, Runway at the floor (D-082) · the Weather and Flight plan panels, and the Snapshot's three benchmarks that disagree (D-083) |
| **T5** — The Rerank | **shipped** | `rooms/rerank.html` + `engines/rerank.js` + `data/common_costs.json`: four stages, cost order against value order, cut / keep / ok with the max(3, ¼) threshold, the year flagged and its 25× (D-085) |
| **T6** — Life events + Triple D | **shipped** | `engines/events.js` + `data/triple_d.json` + `data/return_bands.json`, `rooms/what-if-life.html`, the template schema, and the first template, the sabbatical (D-087) · templates so far: kids, job-change, house, freelance, move, debt-sprint, big-purchase, retire-or-coast with `engines/vpw.js` and `engines/ss.js`, partner-merge (D-088) — all ten · the dashboard's 3D toggle (D-089) |
| **T7** — Skill Stacker | **shipped** | `engines/skills.js`, `rooms/stacker.html`, the catalogue in `dnd/data/` (skills, hundred ways, stacks, curves), the household `skills` map and practice ledger, the automation ratio (D-090) |
| **T8** — FI-losophy rooms | **shipped**, on the template | Enough (D-114), Designed Week (D-115), Time Buckets (D-116), Dreamline (D-117), Reversibility (D-118), Unlearning (D-119); the time-denominated display is the lens (D-094) and its stored default (D-100) |
| **One pager in, one pager out** | **shipped** | The core: the spine's command log (undo / redo on every page), the gate and `Gate.exists`, the lens, `Registry.REQUIRES` (D-094) · the one-pager: one gate, ten cards at most, guesses with badges, the fine-tune drawer, paste import (D-095) · the dashboard as home: four blocks, the situation's lead first, the Advice Translator, the date with the lens (D-096) · the room template, `shared/room.js`, proven on Real Hourly Wage and frozen, with Get Help where every scope line points (D-097) · twelve rooms on it: Between Jobs, Protection, Decumulation, Tax, Estate Basics, Giving, Career Move, Partner, Kids and Tuition, Housing Decision, Big Purchase, Variable Income (D-098–D-113) · the LATER.md items that are not rooms (D-100) · the LATER.md rooms — Enough, Designed Week, Time Buckets, Dreamline, Reversibility, Unlearning, Student Loan Decision, Money Calendar & Pay-Later — and History last (D-101, D-114–D-122) |
| **Live fixes, round 2** | **shipped** | Freeze says what it did and every ratio has a ⓘ with what, why, what moves it and links to what it reads; invested share replaces investment-to-net-worth (D-123) · a debt from family, no interest, set aside, two dates (D-124) · Your Data: a file added or replacing, a pasted statement sorted into its lists (D-125) · Cash Flow at a glance, common lines open, a per aid (D-126) · the month as a calendar (D-127) · `MONEY-MAP.md`, the discovery pass for Income / Expenses / Budget / month-end close — awaiting answers, not built |
| **The ledger** — Income / Expenses / Budget / Estimated-vs-Actual | **shipped** | Dated income entries with the costs of earning them and one tax engine for entries (`engines/ledger.js`) · the expense log in Cash Flow with the deduction enforced at the data layer · the reflected Budget with the Add-and-return flow and the month-end close (`engines/budget.js`, `rooms/budget.html`) · Estimated vs Actual (`rooms/variance.html`) · hide and set aside with the archive prompt · the Sankey from live entries · Variable Income as a filtered view with a rolling average. D-128. Revised: four ways to be taxed incl. unemployment · personal / linked / reimbursable expenses with the repayment credited in the month it came · the budget as five cards with comparison bars · Rule of Five / Max IRA / Max 401(k) presets (`engines/presets.js`) · Not applicable and a Hypothetical view that never writes. D-129. What was pushed off: dates exact / estimated / potential · the calendar drawn from the ledger and the log · a month of spending as the closed months' average · one rent · what the log moved since cash was confirmed · N/A in the owner room · an emergency-fund preset. D-130 |
| **The Skill Tree & the Exercise Library** | **shipped on a seed** | `engines/skilltree.js` and `rooms/skill-tree.html`: five bands, the FOO ladder as the fortress line above them, four states plus fog, every lock saying why, boosts that open and never award, warps that reveal and never award; `engines/exercises.js` and `rooms/exercises.html`: five kinds, the twelve runs computed through the owning engines, the thirteen canon exercises credited; the Stacker and dashboard block 3 read the tree; `version.json` and the footer. Runs on a 40-skill seed until FI-Skill-Tree-v6.3 is dropped in for `scripts/extract-v63.mjs`. D-131 |
| **Reasons to keep a debt** | **shipped** | A debt now answers two questions: how it feels, and why it is worth keeping. Five reasons in `data/debt_rules.json` (low rate, tax-favourable, appreciating asset, building credit on purpose, subsidised or promotional), multi-select, default None. The tags change nothing about the plan; a separate per-debt "Exclude from aggressive payoff suggestions" checkbox the household ticks itself orders that debt last in every strategy while it still takes its minimum, and the room prints what that decision costs in interest. A suggestion from the debt's own Type and Rate is offered dashed at entry time and stored only when confirmed; a 0% card that reverts is promotional, not low-rate. Tags show inline in the payoff order. D-132 |
| **Debt Payoff: how interest works** | **shipped** | The row asked about interest in four controls across three places, two of which meant opposite things — so a balance-transfer card could be marked interest-free-forever in one tap. Now one question with three answers (a rate that stays · 0% or a promo rate · no interest, ever), only the fields that answer owns, and one line saying what the plan will do with it. The mode is derived from what is already stored, so nothing migrates. Promo fields work on any debt type, not just cards. Every figure in the plan sits on one rail with its meaning beside it; the four orderings read as a table; a tie badges nothing and drops its redundant charts. D-133 |
| **T9** — Dungeons & Dividends (`dnd/`) | **shipped — 11 of 11** | 9.1 the sheet is the form (DD-007) · 9.3 the encounter engine: CR→DC ladder, three blocker states, natural-predator radar, encounter log (DD-008) · 9.6 the free page runs the predator engine on the three saves it can score, and says the other three are blank not bad (DD-009) · 9.4 tiers of play: what each stage is for, tierProgress() that refuses to place an unplaced character, the tier filter (DD-011) · 9.7 conditions: eight declared statuses, and an exhaustion ladder derived from runway that subtracts from every save (DD-012) · 9.8 rests and pace: one conversion through the cost of a week, a long-rest DC that rises with exhaustion, negative surpluses said plainly (DD-013) · 9.2 the share card: drawn on canvas, sized to its content, showing only what scored (DD-014) · 9.5 provenance on every export, so an importer knows what it may store, plus an import so a character can come home (DD-015) · 9.9 DM mode: compose an encounter for someone else, the scenario in the URL, never touching your own character (DD-016) · 9.10 bestiary expansion: 29 creatures, every attack type reachable, extensions marked (DD-010) · 9.11 SRD attribution and the non-affiliation line. |
| **T10** — Attack-type chart | **shipped** | `types.html`: six types derived from the bestiary — what each comes at, what stops it, and which work on you — plus what has actually landed, from the encounter log. `attackType`/`tier` now genuinely stored and back-filled for older rows (DD-017) |
| **T11** — The 5e pass | **shipped** | Played through as a 5e player and fixed what did not hold up: point buy is six abilities like D&D Beyond, and a bought STR/DEX/CON stops applying the moment money can measure it (DD-018) · two ways to get hurt — bills roll against your AC, pitches go around it at a save — so insurance finally blocks something and stops double-counting (DD-019) · a failed save costs something (DD-020) · a bleed is netted against a rest, not subtracted once (DD-021) · one strong save and one weak per class, every save covered by someone (DD-022) · ASIs and feats with exactly one mechanic each that the encounter engine actually reads (DD-023) |
| **T12** — The campaign | **shipped** | `campaign.html` + `engines/campaign.js` + `data/dnd_scenarios.json`: fill in the form, get your character and why, then a board of six scenarios a round, ten rounds to a chapter. It forks your household so nothing lands on your real sheet, and it does not author the right answer — each option declares the FOO step it serves and the engine scores it against your live placement from `engines/foo.js`, so the advice moves as you move. The chapter review shows where you shifted, what following the ladder would have been worth, and warns when six of ten choices pulled the same lever (DD-024) |
| **T13** — Creation in the campaign | **shipped** | Four signposted steps inside `campaign.html` — About you → Your six → Your character → The campaign — so a character is built and explained without leaving the page. `Character.explain()` gives every ability its receipts, quoting the actual figure of yours that produced each sub-stat rather than re-deriving it; four honest statuses and nothing invented. Point buy is D&D Beyond's, read from `dnd_scoring.json`. Filing status is asked first because it silently blocked Constitution. `shared/charform.js` declares the fields once so the two rooms that can now write them cannot drift, and one `writeBasic()` is the single tested call site. In the campaign proper: options say which trait they train before you pick, and every card says why it is in front of you (DD-025) |

Wedding and Dream Calculator are one Goal Costing Engine with two templates,
per `SPEC.md` §8. Credit Card calc is a filtered view of the Debt Calculator,
not a separate build. Convenience Method is one of four payoff orderings.
Career ROI and Skills Calculator are one credential-ROI engine with two
presets (D-039). Retroactive and Prospective Worth are one record with two
ratings, and the Tier 4 Regret calc is a filter over it (D-040). Leave-Job,
Unemployment and Start-Business are one runway engine with three presets
(D-042) — the spec itself says they share math. Seven listed "tools", three
builds, which is the pattern rather than an exception.

Two more listed tools turned out to be **configuration, not code**, exactly
as `SPEC.md` intended: the **FAT FIRE template** is a row in
`data/fire_variants.json` and the **Travel calc** is a row in
`data/goal_templates.json`. Both were already shipped and were miscounted as
unbuilt here until this pass. That is the configuration-data pattern working
— and a reminder that this document's counts are only worth what the last
reconciliation against the repo was worth.

Two more rooms sit outside that table because their ideas live further down
this document: **Every Ratio** builds thirty of the Tier 19 ratios from the
household that already exists, and **The Dashboard** is the Tier 20 panel
over them — all seven gauges, including a Weather panel that names the three
risks it cannot see (D-044). Neither adds a number the other rooms did not
already own; the radar is deliberately not a score, and The Score is where
adding them up happens, with its weighting on the page (D-043).

One Tier 5 idea has been built, and it is **a separate product living in this
repo** — **Dungeons & Dividends**, in `dnd/`, served at
`sapphirestoneage.github.io/Personalfinance/dnd/`. It was going to be its own
repository and is not; see DD-004 and DD-005 for why it moved into a folder
instead. It is still not a room: it is not in `shared/registry.js`, it never
appears on the Map, and it has its own front door, built to be handed to
someone who has never opened SPARKS. See the D&D block of `DECISIONS.md`
(DD-001 onward, below the divider) for the mechanics settled while building it
— HP measured in weeks, the scoring calibration, why the class count is seven
and not ten, and how the sheet stays typeable on a phone.

It does not fork the maths. Its calculation core is `shared/money.js`,
`shared/schema.js`, `engines/tier0.js` and `engines/projection.js` from this
repo, vendored byte-identical, and it stores a real household in this repo's
own shape — so a character built there carries into SPARKS as a copy rather
than a translation. The counts in this document therefore stay at
twenty-five rooms: that build is a sibling, not a room.

One ratio moved from "cannot compute" to computed along the way: **credit
utilisation** now works, because Debt Payoff asks for the limit on a card
(D-045). It counts only cards whose limit you have given, on both sides of
the division — the thing this ratio is usually got wrong.

### Not built in Tier 1 (8)

Bank Bonus · Rent/Buy · Warranty · Car Depreciation · W4 · DRAFTT template ·
HCOL/MCOL/LCOL standalone · Mutant Expenses Identifier

Six of those are blocked on **maintained external datasets**, not on effort:
live bank offers, vehicle depreciation curves, warranty failure rates, COL
indices, IRS W-4 worksheet logic, and 12+ months of tracked spending history.
`SPEC.md` §10 already flags each as a data-maintenance dependency. They are
cheap to write and expensive to keep true, which is the opposite of every
tool shipped so far. Note that the Warranty calc's dataset is explicitly
*not* substitutable with a user input — the spec says the failure-probability
table is "a maintained reference dataset, not user-entered", which closes the
obvious workaround.

The seventh, **Rent/Buy**, is blocked structurally rather than on data, and
it is worth stating because the fix is different: `SPEC.md` says it is
"superseded/refined by the full True Cost of Homeownership build (Tier 17)"
and "should be a thin wrapper calling into that engine once it exists, **not
a parallel calculation path**". Same position as House Hack in Tier 2. What
unblocks it is building the Tier 17 ownership-cost engine, not finding a
dataset — and Tier 17 is outside this repo's scope.

The eighth is **DRAFTT**, below.

### Tier 1.5 is complete

The **Financial Health Score** was the last thing standing, and it was
blocked on a decision rather than on work: `SPEC.md` §12.4 left its
weighting `[PENDING]` with an instruction not to guess. That decision is now
resolved as **tunable by age cohort** (D-043), the weights live in
`data/health_score.json`, and §12 has no pending decisions left at all.

### Not built in Tier 2 (9)

Kids · House Hack · Whole Life Insurance · Prenup/Estate · Personal
Inflation · HCOL/MCOL/LCOL modifier · Second Mouse Framework · Trust
Framework · Advice Translator

Each is blocked on something specific, and none of them on effort:

- **House Hack** — `SPEC.md` says to build it "as an extension of the Tier 17
  ownership-cost engine … **not standalone**". That engine does not exist and
  Tier 17 is outside this repo's scope. Building it standalone would be
  building it against the instruction.
- **Kids** — regional childcare cost data, plus a tuition-inflation
  assumption.
- **Whole Life Insurance** — the spec says accurate modelling "needs actual
  policy illustration data". Cash value is back-loaded and non-linear; a
  straight-line guess would be wrong in the direction that flatters the
  policy.
- **Personal Inflation** — a maintained BLS category-level inflation
  dataset, weighted against 12+ months of tracked spend.
- **HCOL/MCOL/LCOL modifier** — a COL index, which is the same dataset
  problem as its Tier 1 standalone twin.
- **Prenup/Estate** — the spec calls it "a document-generation problem, not
  a calculation problem". The inputs are the Net Worth inventory, re-presented.
- **Second Mouse Framework** — "not a calculator; contextual guidance text
  attached to Bank Bonus calc and Sports Arb calc". Both of those are
  unbuilt or out of scope, so there is nothing for the text to attach to.
- **Advice Translator** — the spec flags it as "plausibly needs an
  LLM-backed classification step, not pure rules logic", and §10 puts
  free-text/LLM-backed tools on a separate build track, out of scope for
  Tier 0–2 unless explicitly requested.
- **Trust Framework** — the odd one out, and the only unbuilt Tier 2 item
  that is **not blocked by anything**. The spec describes it as a "static
  3-question vetting checklist", which is shippable as it stands. It is not
  built because it is *content*, not calculation: the three questions are
  someone's editorial voice, and this repo's disclaimer says "educational
  tool, not financial advice" — a how-to-vet-an-advisor checklist is the
  closest this suite would come to actual advice. That is the owner's call
  to make, not a gap to fill quietly.

And **DRAFTT** (Tier 1) is blocked on something smaller and more annoying:
nobody has written down which categories and weights the template actually
uses. It is a configuration row like FAT FIRE, and the moment someone
supplies the split it is a five-minute change. Guessing at it would put a
made-up budget framework in `data/` under someone else's name, which is
exactly what D-036 exists to stop.

## Discrepancies found reconciling this document against the repo

1. **Cost-Per-Use is listed twice at different tiers.** Tier 1 has it under
   "Girl Math / Lifetime Value calc" (shipped, in Quick Math); Tier 19 lists
   "Cost-Per-Use" as an unbuilt Tier 2 ratio. Same calculation. The Tier 19
   line should point at the Quick Math one rather than schedule a rebuild.

2. **Safe Withdrawal Rate is listed as unbuilt.** Tier 19 has SWR as a
   Tier 1 to-do, but it is already an Assumption-class field defaulting to
   4% (`SPEC.md` §12.2), globally tunable and adjustable in the FIRE room.
   What is missing is a *page that explains it*, not the number.

3. **Two items were dropped by the owner during the build** and are marked
   ✅ here: the **Two-Income Household Toggle** (Tier 12) and the **Soft
   Saving Balance Calculator** (Tier 23). Both were raised as blocking
   questions with D-030 — who owns a second earner's income, and which three
   buckets — and the answer was to drop them. They are not built, not
   blocked, and not scheduled. See "Still open" in `DECISIONS.md`.

4. **Emergency Fund Coverage / Ratio and Retirement Benchmark / Savings
   Multiple** are correctly noted in this document's own audit note as
   cross-references rather than duplicates. Confirmed against the code: one
   calculation each, in `engines/tier0.js`.

5. **The Ratio Glossary (Tier 18) has no room**, though six of its eighteen
   ratios already compute somewhere — DTI, savings rate, emergency fund
   coverage, net-worth-to-income, retirement multiple and FI ratio. A
   glossary room would mostly be assembling existing engine outputs and
   naming them, which makes it unusually cheap for its length.

---

# The checklist

Everything below this line is the owner's document, kept as written.

---

# Finance App Idea Master Checklist

**Status key:** ✅ Locked/clear · ❓ Needs clarification · 🔍 Still searching for more

**Audit note (this pass):** Tier 0 moved to top of doc (was buried after Tier 17 — it's the highest-priority build). Tier numbers 11 and 22 were never assigned (no content lost, just cosmetic gaps in numbering — left as-is rather than renumbering everything and breaking cross-references). Confirmed cross-references, not duplicates: "Emergency Fund Coverage" (Tier 0) = "Emergency Fund Ratio" (Tier 18) = same metric. "Retirement Benchmark Check" (Tier 0) = "Retirement Savings Multiple" (Tier 18) = same metric. No true misclassifications found on this audit pass.

---

## TIER 0 — MVP Demo: 10-Input Financial Snapshot (highest priority — fully buildable today)

### The 10 Inputs
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

### What Fully Pre-Populates From These 10 (all Tier 1 / 1.5)
- [x] ✅ Net Worth — (cash + investments) − total debt
- [x] ✅ Savings Rate — (gross income − expenses×12 − est. taxes) / gross income
- [x] ✅ Emergency Fund Coverage — cash ÷ monthly expenses = months covered
- [x] ✅ Debt-to-Income Ratio — monthly debt payments ÷ gross monthly income
- [x] ✅ FIRE Number — annual expenses × 25
- [x] ✅ FIRE Progress % — investments ÷ FIRE number
- [x] ✅ Net Worth Percentile — lookup vs. age/income population data
- [x] ✅ Retirement Benchmark Check — investments vs. age-based income-multiple milestones (1x@30, 3x@40, 6x@50, 8x@60, 10x@67)
- [x] ✅ FOO Placement (Tier 1.5) — rules engine off emergency fund status + employer match capture + high-interest debt presence + account-maxing status

### FOO (Financial Order of Operations) Ladder — the core output
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

### Out-of-Bounds Flags (auto-surfaced)
- [x] ✅ Emergency fund exists alongside high-interest debt → flag to redirect
- [x] ✅ Not capturing full employer match → flag as free money left on table
- [x] ✅ DTI above 36% → flag as outside standard lending comfort zone
- [x] ✅ Savings rate below ~10-15% at income level → flag as below typical benchmark for age
- [x] ✅ High implied credit utilization relative to debt load → flag for review

---

## TIER 1 — Fully Modular (pure math, prepopulate from basics)

- [x] ✅ Net Worth calc
- [x] ✅ Savings Rate calc
- [x] ✅ FIRE variants (Lean/Coast/Fat/Chubby/Barista)
- [x] ✅ Debt Calculator
- [x] ✅ Credit Card calc
- [x] ✅ Bank Bonus calc
- [x] ✅ Rent/Buy calc
- [x] ✅ Warranty calc
- [x] ✅ HYSA Switch calc
- [x] ✅ Lump Sum vs DCA
- [x] ✅ Car Depreciation calc
- [x] ✅ W2 vs 1099 calc
- [x] ✅ W4 calc
- [x] ✅ Quarterly Estimated Tax calc
- [x] ✅ Cash Flow calc
- [x] ✅ Budget templates (50/20/30, zero-based)
- [x] ✅ Return on Hassle calc
- [x] ✅ Girl Math / Lifetime Value calc
- [x] ✅ DRAFTT expense template (Debt/Retirement/Accommodations/Food/Transportation/wanTs)
- [x] ✅ FAT FIRE expense template
- [x] ✅ Retroactive Worth calc ("was it worth it")
- [x] ✅ Prospective Worth calc (time/energy vs. buying)
- [x] ✅ HCOL/MCOL/LCOL — standalone tool
- [x] ✅ Financial Snapshot / Save-State feature
- [x] ✅ Rule of Five (age ÷ 5 = salary multiples saved)
- [x] ✅ $30k/$90k Rule
- [x] ✅ 20/3/8 Car Buying Rule
- [x] ✅ Real Hourly Wage / Life Energy calc
- [x] ✅ Mutant Expenses Identifier

---

## TIER 1.5 — Modular, needs one self-report input

- [x] ✅ SWAN Number ("sleep well at night" liquid savings feeling-benchmark)
- [x] ✅ Fulfillment Curve (1–10 joy rating per spending category)
- [x] ✅ Financial Health Score (0–100 composite of other calcs) — ❓ needs other Tier 1 tools built first to aggregate

---

## TIER 2 — Self-contained, needs a few personal decisions

- [x] ✅ Leave-Job calc
- [x] ✅ Start-Business calc
- [x] ✅ Side Hustle calc
- [x] ✅ Wedding calc
- [x] ✅ Kids calc
- [x] ✅ Travel calc
- [x] ✅ Unemployment calc
- [x] ✅ Solo 401k (SEP/S-corp) calc
- [x] ✅ Roth vs Traditional vs Brokerage calc
- [x] ✅ House Hack calc
- [x] ✅ Whole Life Insurance calc
- [x] ✅ Prenup / Estate Planning / Beneficiaries
- [x] ✅ Personal Inflation calc
- [x] ✅ Career ROI calc
- [x] ✅ Dream Calculator
- [x] ✅ Skills Calculator (separate from Career ROI, confirmed)
- [x] ✅ HCOL/MCOL/LCOL — modifier for other tools + skill-learning ROI
- [x] ✅ Convenience Method (debt payoff by emotional weight, not rate)
- [x] ✅ Second Mouse Framework (informed-player checklist for bonuses/arb)
- [x] ✅ Zombie Apocalypse Theory of Savings (emergency fund framing/explainer)
- [x] ✅ Trust Framework for Financial Advice (3-question vetting checklist)
- [x] ✅ Advice Translator / Unlearning Layer (what applies now vs. needs unlearning)
- [x] ✅ Values vs. Spending Audit (bridges to Tier 1 if pulling live Cash Flow data)

---

## TIER 3 — Needs ongoing/tracked data

- [x] ✅ Goals calc
- [x] ✅ Scenario Planner
- [x] ✅ Audit / Checklist feature
- [x] ✅ Link Accounts feature
- [x] ✅ Finance Tech Stack
- [x] ✅ Automation feature
- [x] ✅ Credit Tracking
- [x] ✅ Peaks calc (peak earning years/net worth/health/family)
- [x] ✅ Risk calc
- [x] ✅ "Wrapped" — year-in-review across all categories
- [x] ✅ FI Timeline (living countdown, moves as skills/inputs update) — infra-dependent

---

## TIER 4 — Needs another person's data / subjective / relational

- [x] ✅ Compatibility Score (complementary traits/stress points/blind spots)
- [x] ✅ Partner Overlay
- [x] ✅ Equity Marriage calc
- [x] ✅ Relationship(s) calc
- [x] ✅ Satisfaction calc
- [x] ✅ Regret calc
- [x] ✅ Memory Dividends calc
- [x] ✅ Housekeeper/Chore calc
- [x] ✅ Network feature
- [x] ✅ Community feature
- [x] ✅ Charity calc
- [x] ✅ Mentorship feature
- [x] ✅ Family feature
- [x] ✅ Closet calc (cost of staying closeted vs. coming out)
- [x] ✅ Rainbow Handcuffs (queer-specific golden handcuffs)
- [x] ✅ Money Mirror / Financial Enneagram — couples overlay (dual radar, gap analysis)
- [x] ✅ The Ten-Variable State Layer (social capital, status, housing stability, etc.)

---

## TIER 5 — Frameworks (build system first, then results are cheap)

- [x] ✅ MBTI-for-Finance
- [x] ✅ Astrology-for-Finance
- [x] ✅ Financial Enneagram (solo version)
- [x] ✅ DND Character Sheet — **BUILT, as a separate product** that lives in this repo under `dnd/`. Not a room here. D&D block of `DECISIONS.md`, DD-001 onward
- [x] ✅ Harry Potter House / Divergent Faction
- [x] ✅ League of Legends / Smite Character System (individualized financial avatars)
- [x] ✅ Maslow's Hierarchy applied to finance
- [x] ✅ "Sins" framework
- [x] ✅ Buzzfeed-quiz style tests
- [x] ✅ BDSM-test-style financial quiz
- [x] ✅ FI Address System / FIRE MBTI (4-character code, 15 archetypes, 6,561 combos)
- [x] ✅ Five-Element Financial Personality System (Water/Earth/Air/Fire/Spirit + spell-slot spoon theory)
- [x] ✅ The FI Pathway (ski-mountain: 9 lodges, 8 paths, 7 villages, belt progression)
- [x] ✅ FI Skill Tree (625 skills, 25 trees, S-A-B-C tiers) — ❓ confirm relationship to standalone Skills Calculator
- [x] ✅ Quantum Collapse (onboarding decision-tree engine)
- [x] ✅ Multiverse-as-Diffs (scenario comparison engine, override-based not full-duplicate)
- [ ] ❓ Avalanche Generation — **UNRESOLVED, need definition**

---

## TIER 6 — Content / Voice / Narrative (not tools, framing devices)

- [x] ✅ The Religion of Money (explainer essay concept)
- [x] ✅ FI-losophy (brand voice/stance)
- [x] ✅ "Don't Cut the Latte, Get It Free" (curated cheap/free access hack database)
- [x] ✅ Avalanche Generation — generational-positioning line ("we are the avalanche method to FI's snowball method"), not a calculator

---

## TIER 7 — Money Psychology Exercises (journaling prompts, self-contained)

- [x] ✅ 1. Personified letter to money
- [x] ✅ 2. Earliest Money Memory
- [x] ✅ 3. Shame inventory
- [x] ✅ 4. Finish These Sentences
- [x] ✅ 5. Scarcity-vs-abundance audit
- [x] ✅ 6. The Financial Alter Ego
- [x] ✅ 7. The Forgiveness Letter
- [x] ✅ 8. Values vs. Spending Audit (also listed Tier 2 — bridges both)
- [x] ✅ 9. The "Enough" Exercise
- [x] ✅ 10. Money autobiography

---

## TIER 8 — Already-Built Products/Instruments (confirmed built, distinct from list above)

- [x] ✅ FIRE Community Quiz (129 Likert items, trait bars, 8 preference spectrums, SPARKS-branded — distinct from Five-Element quiz)
- [x] ✅ Money Map Pro (coach-facing plan engine, FOO ordering, what-if scenarios)
- [x] ✅ FinFit (standalone consumer app: Diagnose/Destination/Levers screens, Coast FI, milestone levels, Future Self Avatars)
- [x] ✅ Retirement Drawdown Simulator (decumulation-phase calc, inside Calculator Lab)
- [x] ✅ Debt Payoff calc w/ 4 selectable methods (avalanche/snowball/convenience/hybrid) — confirms Convenience Method is a built feature, not just content

---

## TIER 9 — Gap-Analysis Ideas (identified, NOT yet built) — ranked by modularity

### Tier 1 — Fully modular/static (no personal inputs needed)
- [ ] ⬜ Plain-English Glossary
- [ ] ⬜ Home-Buying Readiness Checklist (mostly static criteria + credit score/down payment inputs)

### Tier 1.5 — Static content, minor location/context adjustment
- [ ] ⬜ Account-Opening Checklist (state-specific variations)

### Tier 2 — Needs 1-2 new inputs or external lookup data
- [ ] ⬜ "Find Your Own Numbers" Discovery Flow (pre-tool floor layer)
- [ ] ⬜ Gamified entry: First-$1,000 Bonus Hunt (needs live bank-offer data by location)
- [ ] ⬜ Total-Comp / Salary Negotiation Calculator (needs offer details + market data)
- [ ] ⬜ Benefits Optimization Calc — HSA/FSA/ESPP (needs employer-specific plan details)
- [ ] ⬜ Insurance Gap Analysis (needs current coverage inputs, broader than whole-life calc)

### Tier 3 — Needs ongoing/tracked data
- [ ] ⬜ Gamified entry: Credit-Score Level-Up Mechanic (needs linked, continuously updating credit data)
- [ ] ⬜ Lifestyle-Inflation Tracker (standalone tool version of Mutant Expenses Identifier; needs historical spend/income over time)

### Tier 5 — Needs a framework/engine built first
- [ ] ⬜ Gamified entry: Sims-Style Life Simulator (biggest lift of the eleven — needs an actual simulation engine, not just a calculator)

---

## TIER 10 — Cross-Cutting Design Principles (not tools, apply to whole suite)

- [x] ✅ "Graceful re-entry after time away" architecture — never open on stale dashboard, re-anchor with one number, mark absent-period data as unverified projections not silent facts, replace streaks with "months anchored" (only goes up, doesn't punish returning)

---

## CONFIRMED NOT NEW (already tracked, just re-verified)

- Financial Diary / Wrapped-style capsule timeline → matches existing Tier 3 "Wrapped" item
- Cashflow Calendar, Client scenario dashboard, What It Takes, Modern Orthodox tool, remaining Calculator Lab calcs → already surfaced in prior batches

---

## TIER 12 — Anti-Cliché / Guilty Pleasure Tools (built to counter specific FIRE-community complaints)

- [x] ✅ Guilty Pleasure Calculator (latte/cigarette/etc.) — NOT shame-based. Inputs: item, cost/unit, frequency, years, return assumption. Outputs: total spent, opportunity cost, AND % of total budget (usually tiny). User picks their own ending: "show me and let me decide" / "find a cheaper version" / "I want to cut this." Optional sensitive health-cost layer for cigarettes specifically.
- [x] ✅ Frugality Floor Calculator — minimum viable spending guardrail below which frugality causes real harm (nutrition, health, isolation)
- [x] ✅ Head Start Quantifier — non-judgmental starting-line context (parental homeownership, tuition help, inheritance, first-gen status) framed as useful plan context, not a guilt score
- [x] ✅ Percentile Reality Check — shows real population percentile (income/net worth/savings rate by age) instead of comparing user to survivorship-biased blogger highlight reels
- [x] ✅ Two-Income Household Toggle — modifier applied across all FIRE/budget calcs, makes the dual-income assumption explicit and adjustable instead of buried
- [x] ✅ "Actually Retired" Transparency Meter — tracks % of "FI income" that's truly passive vs. side income/consulting, turns the "they're not really retired" criticism into a personal honesty feature
- [x] ✅ Boring Mode toggle — global setting that strips gamification/personality for users tired of novelty-seeking, shows numbers plainly

---

## TIER 13 — SPARKS Positioning / Copywriting Principles (not tools — brand voice rules)

- [x] ✅ Never use "just" in copy ("just cut lattes," "just get a better job") — most-cited trigger word across every complaint thread
- [x] ✅ Lead with "here's what applies to you," not "here's the one true path" — Advice Translator/Unlearning Layer is the flagship answer to this
- [x] ✅ Show the math, skip the sermon — repetition fatigue is about tone as much as content; deliver facts without personality-driven moralizing
- [x] ✅ Acknowledge starting-line differences explicitly (income, location, family support, discrimination) instead of pretending equal footing — ties directly to HCOL/MCOL/LCOL modifier, chosen-family tools, transition-cost calc
- [x] ✅ Avalanche Generation line ("mathematically optimal, built for a generation wired that way") — already achieves tone differentiation, skips evangelism

---

## TIER 14 — Demographic-Gap Tools (flagged earlier, now formally logged)

- [x] ✅ Transition Cost Calculator (Tier 1) — HRT, surgeries, legal name/gender marker change, therapy, electrolysis; inputs: procedure list, insurance coverage %, location, financial-assistance org eligibility (Jim Collins Foundation, Point of Pride, Genderbands, etc.)
- [x] ✅ Polycule Finance Splitter (Tier 4) — equity/contribution tracker for 3+ person households, models tax penalty when only 2 of N partners can legally marry
- [x] ✅ Chosen Family Estate Plan Generator (Tier 2) — guided questionnaire → plain-English document to bring to a lawyer (will, healthcare proxy, POA, HIPAA release)
- [x] ✅ FinTok Fact-Checker (Tier 2, generalized Advice Translator) — feed in a trend/tip, get back whether it applies to your stage/income/life structure
- [x] ✅ Discrimination-Adjusted Emergency Fund Sizing (Tier 2) — adjusts standard 3-6 month rule based on job-loss risk by location/identity
- [x] ✅ Gender-Affirming Care Benefits Gap-Checker (Tier 2) — queer-specific flavor of Benefits Optimization calc
- [x] ✅ Documentation Vault (Tier 3, feature not calc) — chosen-family recognition documents in one place, safety-net framing

---

## TIER 15 — 100 New Ideas (Queer / Gen Z / FIRE, alone or at intersections)

### Queer-specific (20)
1. Chosen Family Estate Plan Generator *(see Tier 14)*
2. Transition Cost Calculator *(see Tier 14)*
3. Polycule Finance Splitter *(see Tier 14)*
4. Discrimination-Adjusted Emergency Fund Calculator *(see Tier 14)*
5. Coming-Out Financial Runway Calculator — savings needed before coming out if job/housing risk exists
6. Name/Gender Marker Change Cost & Checklist Tracker
7. Fertility/Surrogacy/Adoption Cost Calculator for queer family-building
8. "Pink Dollar" Spend Tracker — LGBTQ-owned business directory + spend tracking
9. Safe Housing Finder — queer-friendly landlord/neighborhood screening cost calc
10. Queer-Competent Healthcare Provider Cost Comparison / sliding-scale finder
11. Pride Travel Budget Planner
12. Domestic Partnership vs. Marriage Financial Comparison (tax/benefit differences by state)
13. Multi-Parent Custody & Finance Agreement Generator
14. Conversion Therapy Survivor Financial Recovery Planner (sensitive, resource-linking only)
15. Queer Elder Care Planning Tool (AIDS-generation support-network gap)
16. HRT/Medication Cost Insurance Navigator
17. Detransition Financial Planning Tool
18. Queer Mentorship/Sponsor Matching for career advancement
19. LGBTQ Scholarship & Grant Finder
20. Inclusive-Benefits Employer Screener — true comp calc including trans healthcare, DP benefits

### Gen Z-specific (20)
21. Student Loan Forgiveness Eligibility Checker
22. Gig-Economy Tax Withholding Estimator
23. Crypto/NFT Risk Exposure Calculator
24. BNPL Debt Aggregator & Payoff Planner
25. Social-Media Impulse-Spend Cooldown Tool
26. First Apartment Budget Builder (deposit, utility setup costs)
27. Parental Financial Dependence Tracker
28. Creator Economy Income-Smoothing Calculator
29. College Major ROI Comparison Tool
30. Internship vs. Part-Time Job Opportunity Cost Calculator
31. Roommate Split & Shared Expense Tracker
32. First Credit Card Sandbox (safe practice simulator)
33. FOMO Spending Tracker (social-comparison-driven purchases)
34. Gap Year Cost/Benefit Calculator
35. Trade School vs. 4-Year Degree ROI Calculator
36. Micro-Investing Round-Up Simulator
37. Subscription Creep Auditor
38. Gig-Stacking Schedule Optimizer (multiple apps, max income)
39. Duolingo-style Financial Literacy Learning Path (standalone course, not just gamification layer)
40. "Messy Finances" Onboarding Mode — non-judgmental entry point for the 46% who call their finances messy

### FIRE-specific (20)
41. Geo-Arbitrage Relocation Calculator (move to LCOL, keep remote salary)
42. Sabbatical / Mini-Retirement Planner
43. Barista FIRE Job Matching Tool (part-time jobs with benefits)
44. Sequence-of-Returns Risk Simulator
45. Tax-Loss Harvesting Tracker
46. Backdoor Roth IRA Step-by-Step Walkthrough
47. Mega Backdoor Roth Eligibility Checker
48. FIRE Number Sensitivity/Stress-Test Analysis
49. Withdrawal Order Strategy Optimizer
50. ACA Subsidy Optimization / Healthcare Bridge Calculator (pre-Medicare)
51. Geographic Arbitrage Cost-of-Living Heatmap
52. FIRE Accountability Partner / Meetup Finder
53. Semi-Retirement Income Blend Calculator
54. Real-Estate FIRE (rental income path) Calculator
55. Dividend Growth FIRE Tracker
56. FIRE Countdown with Milestone Celebrations
57. "One More Year" Syndrome Checker — behavioral nudge assessing rational vs. fear-based delay
58. Post-FIRE Purpose Planning Tool (non-financial "now what")
59. FIRE Couple Alignment Calculator (reconciling two different target numbers)
60. Give-While-Living Calculator for FIRE'd individuals with surplus

### Cross-Intersection (20)
61. LGBTQ-Safe Geo-Arbitrage Map — cost of living + safety index combined
62. Coming Out While Financially Dependent on Parents Calculator
63. Compound Interest "Time Machine" Visualizer (start in 20s vs. 30s)
64. Chosen-Family FIRE Number — FI target calculated across a mutual-aid pod, not just individually
65. "Found Family" Group Savings Pod / mutual-aid circle tracker
66. Gender-Affirming Care Savings Goal Tracker with milestone gamification
67. "FIRE Before 30" Aggressive Timeline Stress-Test
68. Queer-Friendly Retirement/Assisted-Living Safety Screener + cost calc
69. Community Investment Pool / Co-op Investing Calculator
70. Safe-to-Work Employer Comparison — true comp including inclusive benefits + safety

### Standalone / Broad (30)
71. Financial Trauma Response Identifier (careful, pattern-level framing only)
72. Grief & Sudden-Inheritance Guidance Tool
73. Medical Debt Negotiation Script Generator
74. Freelancer Invoice & Late-Payment Tracker
75. Digital Nomad Multi-Currency Tax Calculator
76. Pet Cost-of-Ownership Calculator
77. Divorce/Breakup Financial Untangling Tool
78. Roommate Breakup Financial Split Calculator
79. Group Trip Expense Splitter with Currency Conversion
80. Emergency Fund Replenishment Tracker (post-use rebuild plan)
81. Salary Negotiation Script + Market-Rate Benchmarking Tool
82. Layoff Survival Budget Auto-Generator
83. Freelance Rate Calculator (taxes, benefits, downtime built in)
84. Financial Boundary-Setting Script Generator (declining to lend to family/friends)
85. Money Date Night Planner (couples check-in agenda generator)
86. Inheritance Tax/Estate Simulator for Beneficiaries
87. Mutual Aid / Community Fridge Contribution Tracker
88. Financial Independence "Why" Journal (values-first goal-setting, ties to "Enough" Exercise)
89. Debt Consolidation Comparison Tool
90. Rent Guarantor/Co-signer Risk Calculator
91. ACA Marketplace Plan Comparison Tool
92. Gig-Economy Retirement Account Setup Wizard
93. Local FIRE/Queer Meetup Directory
94. Cost-of-Waiting Calculator (delay-cost visualizer, generalized beyond FIRE)
95. Windfall Decision Tree (bonus/refund/inheritance allocation guide)
96. Financial Anxiety Symptom Tracker (non-diagnostic, journaling-based)
97. Money Script Quiz (avoidance / worship / status / vigilance archetypes)
98. Intentional Wealth Redistribution Calculator
99. Community Land Trust / Co-op Housing Cost Comparison Tool
100. **Vacation/Travel Calculator** — see Tier 16 for full build-out

---

## TIER 16 — Vacation/Travel Calculator (itemized + ranked build order)

**Why this matters beyond a generic trip-cost tool:** research shows queer travelers face a real, quantifiable safety layer no mainstream travel tool accounts for — 64% of trans travelers, 57% of intersex, and 56% of nonbinary travelers report feeling more insecure/self-conscious while traveling, and 31% report a negative experience with a fellow passenger due to LGBTQ+ identity. Existing safety indexes (Spartacus Gay Travel Index, Asher Fergusson's Trans Safety Index) exist as reference rankings but aren't integrated into any actual trip-cost calculator. That integration is the differentiator.

**Itemized components, ranked by build priority (per your instruction: cheap flight + cheap hotel first, tour guide last):**

1. **Cheaper Flight Finder/Comparator** — Tier 1. Inputs: origin, destination, date flexibility range, cabin class. Output: cheapest fare window + points-redemption value comparison (cents-per-point math).
2. **Cheaper Hotel/Lodging Comparator** — Tier 1. Inputs: destination, dates, party size. Output: hotel vs. Airbnb vs. hostel vs. points-redemption cost-per-night comparison.
3. **Points/Miles Redemption Value Calculator** — Tier 2 (needs user's actual point balances/programs entered). Output: whether to pay cash or redeem, based on real-time cents-per-point value.
4. **Food & Activity Daily Budget Estimator** — Tier 1.5. Destination-tier presets (backpacker/mid/luxury) modularly adjustable.
5. **Currency Conversion & Fee Calculator** — Tier 1. Pure math off exchange rate + card foreign-transaction fee %.
6. **Visa/Entry Fee Lookup** — Tier 1. Destination + passport-country lookup table.
7. **Travel Insurance Cost-vs-Risk Calculator** — Tier 1.5. Trip cost, destination risk tier, pre-existing condition flag.
8. **Safety/Inclusivity Overlay** — Tier 2. Integrates Spartacus Gay Travel Index / Trans Safety Index scores by destination; flags a "safety premium" (e.g., private transport instead of public transit, differently-priced neighborhoods) where relevant, framed as informational, not alarmist.
9. **Tour Guide Add-On** — Tier 4 (marketplace/human-matching, not pure calculation). Option to find vetted local guides, with an LGBTQ-friendly/vetted-guide filter specifically, sourced last since it requires a real vendor network rather than just data.

**Build-order recommendation:** 1 → 2 → 5 → 6 → 4 → 7 → 3 → 8 → 9. Get the pure-math, zero-dependency pieces live first (flights, hotels, currency, visas, food budget, insurance), then layer in the two pieces that need external data/matching (points valuation, safety index), and build the tour-guide marketplace last since it's the only piece requiring real human vendors rather than data.

---

## TIER 17 — Category Expense Tracking (feature + calculator) & True Cost of Homeownership

### Category Expense Tracker (feature + calculator, dual-purpose)
- [x] ✅ Category Tracker Engine (Tier 3, feature) — generic recurring-category tracking (dating, hobbies, pets, home improvement, kids' activities, etc.), trend charts over time, optional 1-10 satisfaction tag per entry that plugs into existing Fulfillment Curve
- [x] ✅ Dating Cost Calculator (Tier 1.5, calculator) — cost per date (meal/activity/transport/grooming/gifts), aggregated to cost-per-month/per-relationship/per-app-match, optional satisfaction rating per date
- [x] ✅ Pattern note: Dating Calculator = Category Tracker Engine pre-loaded with dating-specific fields; same structure reusable for any life category the user wants tracked

### True Cost of Homeownership vs. Renting (refines existing Tier 1 Rent/Buy calc)
- [x] ✅ Bank Payment Calculator — principal + interest only, off loan amount/rate/term
- [x] ✅ True Cost of Ownership Calculator — bank payment + property tax + homeowners insurance + PMI (if <20% down) + HOA + maintenance reserve (1-2%/yr default) + major-repair amortization (roof/HVAC/water heater spread over lifespan) + closing costs amortized over hold period + opportunity cost of down payment
- [x] ✅ Renter's True Cost Calculator — rent + renter's insurance + projected rent growth (default 3-4%/yr) compounded over hold period
- [x] ✅ Breakeven/Crossover Year Output — flags the year renting becomes more expensive than owning over the full hold period, and flags markets/scenarios where renting is pricier from year one (high rent-growth markets, long hold periods)

---

## TIER 18 — Ratio Glossary (what people actually reference/want to know)

- [x] ✅ Debt-to-Income (DTI) — monthly debt payments ÷ gross monthly income (lenders want <36%)
- [x] ✅ Front-End/Housing Ratio — housing costs ÷ gross monthly income (28% rule)
- [x] ✅ Back-End Ratio — total debt incl. housing ÷ gross monthly income (36% rule)
- [x] ✅ Savings Rate — savings ÷ gross (or net) income
- [x] ✅ Emergency Fund Ratio — liquid savings ÷ monthly expenses (in months)
- [x] ✅ Credit Utilization — card balances ÷ total credit limit (<30% good, <10% ideal)
- [x] ✅ Net Worth to Income Ratio — net worth ÷ annual income
- [x] ✅ Liquidity Ratio — liquid assets ÷ monthly expenses
- [x] ✅ Solvency Ratio — net worth ÷ total assets
- [x] ✅ Current Ratio (personal) — liquid assets ÷ current liabilities
- [x] ✅ Retirement Savings Multiple — investment balance ÷ annual income, benchmarked to age milestones
- [x] ✅ Life Insurance Needs Multiple — typically 10x annual income rule of thumb
- [x] ✅ Car Payment to Income Ratio — monthly payment ÷ gross monthly income (<10-15% of take-home)
- [x] ✅ Investment-to-Net-Worth Ratio — investable assets ÷ total net worth
- [x] ✅ FI Ratio — passive/investment income ÷ annual expenses
- [x] ✅ Debt-to-Asset Ratio — total debt ÷ total assets
- [x] ✅ Personal Cash Flow Ratio — (income − expenses) ÷ income
- [x] ✅ Rule of 72 — years to double an investment ≈ 72 ÷ interest rate (shortcut, not a true ratio, but universally cited)

---

## TIER 19 — 50 More Ratios, Ranked by Modularity

### Tier 1 — Fully modular (pure formula off the base 10 inputs, or a clean market lookup)
- [ ] ⬜ Safe Withdrawal Rate (SWR)
- [ ] ⬜ Loan-to-Value Ratio (LTV)
- [ ] ⬜ Home Equity Ratio
- [ ] ⬜ Price-to-Rent Ratio (market-level lookup)
- [ ] ⬜ Price-to-Income Ratio
- [ ] ⬜ Debt Payoff Velocity
- [ ] ⬜ Interest-to-Principal Ratio (per payment)
- [ ] ⬜ Total Interest Paid Ratio (lifetime)
- [ ] ⬜ Discretionary Income Ratio
- [ ] ⬜ Burn Rate
- [ ] ⬜ Runway (months)
- [ ] ⬜ Self-Insurance Threshold
- [ ] ⬜ Liquid-to-Illiquid Asset Ratio
- [ ] ⬜ Cash Drag Ratio

### Tier 1.5 — Modular, needs a one-time breakdown/categorization of data already on hand
- [ ] ⬜ Tax Efficiency Ratio (taxable vs. tax-advantaged split)
- [ ] ⬜ Revolving-to-Installment Debt Ratio (debt by type)
- [ ] ⬜ Fixed-to-Variable Expense Ratio (expense category split)
- [ ] ⬜ Needs-to-Wants Ratio (expense category split)
- [ ] ⬜ Side Income Ratio (income source split)
- [ ] ⬜ Real Estate Concentration Ratio (needs home value input)

### Tier 2 — Needs 1-2 new inputs beyond the base 10
- [ ] ⬜ Expense Ratio (fund-level fee data)
- [ ] ⬜ Asset Allocation Ratio (holdings breakdown)
- [ ] ⬜ Concentration Ratio (holdings breakdown)
- [ ] ⬜ Dividend Yield (specific holding data)
- [ ] ⬜ Dividend Payout Ratio (company earnings data)
- [ ] ⬜ Fee Drag (depends on Expense Ratio)
- [ ] ⬜ Tax Drag (tax bracket + account-type breakdown)
- [ ] ⬜ Cap Rate (rental NOI + property value)
- [ ] ⬜ Cash-on-Cash Return (rental cash flow + cash invested)
- [ ] ⬜ Debt Service Coverage Ratio (rental income + debt service)
- [ ] ⬜ Cost-Per-Use (per-item purchase input)
- [ ] ⬜ Income Replacement Ratio (projected retirement income)
- [ ] ⬜ Human Capital-to-Financial Capital Ratio (years left working + income)
- [ ] ⬜ Total Comp-to-Base Ratio (benefits valuation)
- [ ] ⬜ Underinsurance Gap (current coverage amount)
- [ ] ⬜ Disability Income Replacement Ratio (disability coverage data)
- [ ] ⬜ Dynamic Withdrawal Ratio (current withdrawal amount, retirees only)
- [ ] ⬜ Healthcare Reserve Ratio (dedicated savings + cost projection)
- [ ] ⬜ Business Equity Concentration Ratio (business valuation, niche/not all users)
- [ ] ⬜ Goal Funding Ratio (per named goal)
- [ ] ⬜ Time-to-Goal at Current Rate (per named goal)

### Tier 3 — Needs ongoing/tracked/historical data
- [ ] ⬜ Sharpe Ratio (return history + volatility + risk-free rate)
- [ ] ⬜ Credit Mix Ratio (account-level credit report data)
- [ ] ⬜ Lifestyle Inflation Rate (historical spend/income over time)
- [ ] ⬜ Real Wage Growth Ratio (historical salary data)
- [ ] ⬜ Longevity Risk Ratio (life expectancy assumption + depletion projection)
- [ ] ⬜ Social Security Replacement Ratio (SS benefit estimate off income history)
- [ ] ⬜ Windfall Allocation Ratio (historical windfall tracking)
- [ ] ⬜ Spending Volatility (month-to-month tracked variance)

### Tier 4 — Subjective/self-report
- [ ] ⬜ Financial Confidence Score (self-reported, tracked against actual metrics)

---

## TIER 20 — Pilot's Dashboard Architecture (visualization framework for all ratios)

| Panel | Contains | Visualization |
|---|---|---|
| Altitude (Net Worth) | Net worth, percentile, composition, concentration ratios | Line chart (trend) + donut chart (composition) |
| Fuel (Liquidity) | Emergency fund ratio, liquidity ratio, runway, cash drag | Gauge/speedometer, green/yellow/red zones |
| Engine Load (Debt) | DTI, front/back-end ratio, credit utilization, payoff velocity | Gauge + stacked bar (debt by type) |
| Thrust (Growth/Savings) | Savings rate, FIRE progress %, retirement benchmark, dividend yield | Progress bar + line chart trend |
| Navigation (Ratios vs. Benchmark) | All threshold-based ratios at once | Radar/spider chart — single glance, all spokes in/out of green zone |
| Weather (Risk Exposure) | Sequence-of-returns risk, longevity risk, underinsurance gap, concentration risk | Gauge + risk-heat table |
| Flight Plan (Goals) | Goal funding ratio, time-to-goal, FOO placement, next-step flag | Progress bars per goal + FOO ladder level-up visual |

**Built:** all seven panels, in `rooms/dashboard.html`. Weather shows the one
risk of its four that this app can see — concentration — and names the three
it cannot (sequence-of-returns needs a return distribution, longevity needs
mortality tables, underinsurance needs your actual cover, which nothing here
asks for). See `DECISIONS.md` D-044.

- [x] ✅ Radar/spider chart flagged as the single highest-value visualization — plots every threshold-based ratio (DTI, housing ratio, EF months, credit utilization, savings rate, insurance coverage) as one spoke each against its healthy-zone boundary, answering "am I in the green everywhere?" in one glance

---

## TIER 21 — Additional Gap Items (ranked by modularity)

### Tier 1 — Fully modular/static
- [ ] ⬜ Financial Advisor Vetting / Red-Flag Checker (static checklist: fiduciary status, fee-only vs. commission, AUM comparison)
- [ ] ⬜ Crisis First-Responder Checklist (fire/flood/eviction immediate-action steps + resource links)

### Tier 1.5 — Static content, minor input
- [ ] ⬜ Crowdfunding Strategy Calculator (goal amount, platform fee %, network size estimate)
- [ ] ⬜ Widowhood/Sudden Loss of Spouse Financial Checklist (mostly static 90-day checklist + a few inputs)

### Tier 2 — Needs 1-2 new inputs beyond the base 10
- [ ] ⬜ Benefits Cliff Calculator (income, household size, state, program type)
- [ ] ⬜ Immigration/Visa-Status Financial Planning (visa status, country, income)
- [ ] ⬜ Gig/Tip Income Reconciliation Tool (multiple income streams)
- [ ] ⬜ ABLE Account / Disability Asset-Limit Planner (benefit type, asset limit, state)
- [ ] ⬜ Sober Living / Recovery Financial Rebuilding Tool (starting point, credit history)
- [ ] ⬜ Sandwich Generation Caregiving Cost Calculator (parent care cost estimate + own budget)
- [ ] ⬜ AI/Automation Job Displacement Risk Calculator (occupation/industry lookup)
- [ ] ⬜ Climate/Natural Disaster Financial Resilience Planner (location risk lookup + insurance coverage)
- [ ] ⬜ Multi-Generational Wealth Transfer Calculator (estate size, heir count, gift tax rules)
- [ ] ⬜ Surrogate/Donor Compensation & Tax Tool (compensation amount, tax treatment)

### Tier 3 — Needs ongoing/tracked data or is a UX/feature layer
- [ ] ⬜ Neurodivergent-Friendly Money Management (ADHD-aware reminders, body-doubling, dopamine-friendly tracking — feature layer, not one-time calc)
- [ ] ⬜ Time-Banking / Skill-Swap Tracker (ongoing tracked exchanges)
- [ ] ⬜ Grief-Period Financial Pause Feature (ties to Tier 10 graceful re-entry principle — temporarily suspends goals/streaks during declared grief periods)

### Tier 4 — Sensitive/crisis-context, needs local resource matching
- [ ] ⬜ LGBTQ Youth Homelessness / Housing Instability Calculator
- [ ] ⬜ Financial Abuse / Leaving-a-Relationship Safety Planning Tool

---

## TIER 23 — Trend-Driven Gaps (Soft Saving, Loud Budgeting, No-Buy Culture)

### Tier 1 — Fully modular
- [ ] ⬜ Soft Saving Balance Calculator — splits income into 3 buckets (save / essentials / joy-spend now), shows long-term trajectory of each split; reconciles FIRE philosophy with the dominant Gen Z "soft saving" counter-trend (~3 in 4 Gen Z prefer quality of life now over extra bank savings)
- [ ] ⬜ Loud Budgeting Script/Shareable Card Generator — generates shareable text/graphic for transparently declining spending; builds on existing Financial Boundary-Setting Script Generator (Tier 15), branded to this specific viral mechanic (42% of Gen Z practices this)
- [ ] ⬜ Digital Cash Envelope Method (feature) — visual "fill and empty" envelope budgeting UI, distinct from existing zero-based template

### Tier 2 — Needs 1-2 new inputs
- [ ] ⬜ No-Buy Year/Month Challenge Tracker — category-specific spending freeze tracker, streak-free design per Tier 10 "months anchored" principle (1 in 5 Gen Z/millennials did a no-buy year; 56% did low-buy)
- [ ] ⬜ Resale/Pre-Owned Value Tracker — general resale-value tracker for big-ticket/luxury items, extends existing Car Depreciation calc (60% of Gen Z now prefers pre-owned luxury specifically to avoid depreciation)

---

## TIER 24 — Additional Behavioral & Housing Gaps

### Tier 2 — Needs 1-2 new inputs, ongoing tagging
- [ ] ⬜ Doom Spending Pattern Tracker — flags purchases that are unplanned + non-essential + preceded by a stress/anxiety moment; distinct from FOMO Spending Tracker (Tier 15 #33) since the trigger is economic anxiety/hopelessness rather than social comparison. Framing must stay in awareness-building territory (monthly total, gentle pattern surfacing, healthy coping alternatives) — never shame-based or diagnostic.
- [ ] ⬜ Boomerang Kids Cost-Benefit Calculator — models the tradeoff of living with parents longer (rent saved vs. independence/timeline cost), distinct from the existing Parental Financial Dependence Tracker (Tier 15 #27) which tracks the fact of dependence, not the decision tradeoff
- [ ] ⬜ Co-Buying With Friends (Tenancy in Common) Calculator — platonic/chosen-family group property purchase, distinct from Polycule Finance Splitter (Tier 14, relationship-based); covers TIC agreements, exit clauses, uneven contribution splits

---

## OPEN QUESTIONS / UNRESOLVED ITEMS

- [x] ✅ **Avalanche Generation** — resolved, see Tier 6
- [x] ✅ **FI Skill Tree vs. Skills Calculator (#111)** — resolved: two separate items, NOT the same thing.
  - FI Skill Tree = 625-skill, 25-tree system w/ belts, avatars, dialect modes, homestead progression, plus its own embedded "Calculator Lab" (7 calcs: Investment Growth Visualizer, Path to FI Projector, Shockingly Simple Math, Coast FI, Debt Crusher, Retirement Drawdown Simulator, Rent vs. Buy)
  - Skills Calculator (#111) = small, single-skill ROI calc (Tier 2), unrelated in scope
  - No confirmed relationship between them — treat as fully separate line items unless later scoped as a "Skill Tree teaser"
- [ ] 🔍 **More items pending** — search still ongoing; append below as found

---

## NEWLY FOUND (append here as new search results come in)

### Pending intake from "Early retirement tools for young adults" conversation
A past instance already built a full consolidated inventory of everything created, organized by:
- Intake / diagnosis tools
- Planning / pathing tools
- Day-to-day operating tools
- Calculators

**Not yet pulled in — paste that inventory here next so it can be merged without re-doing the categorization work.**
