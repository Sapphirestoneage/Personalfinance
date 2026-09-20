# Amendment 1 to the solar system master prompt

Paste this into the running Claude Code session, or commit it beside the spec as docs/solar-system-amendment-1.md and tell Claude Code to read it.

---

Read this before continuing. It amends sparks-solar-system-master-prompt.md, which you already have. Where the two disagree, this amendment wins. It exists because the master prompt was written as if the entry system were new. It is not: the live Ledger already has six doors, an Express form, arrangements, a route checklist, snapshots, find-a-row, and an assumptions panel, and the master prompt specced over all of it. This amendment restores what was dropped and fixes six places where the spec, as written, would be a downgrade on what is already live.

If you have already completed a step, apply the changes for that step now as a fix-up commit before going on.

## A. Changes to Part 0

### A1. Add a fourth stored value: not for me

The master prompt has three (number, none, unknown). Add a fourth. It is in the live app and removing it would be the single change most likely to make the avoidance persona quit.

- "Not for me" means the user has decided this does not apply or they are setting it aside. It is a choice, not a gap, and it is different from the situation gate deciding a field is absent.
- It counts as done for leveling and for band and tier completion.
- Any metric that needs it stays locked and reads "you set this aside," never "missing," never a nag.
- It is reversible in one tap, and reversing it re-locks nothing.
- It never appears in the revisit list.
- Store it distinctly. Do not encode it as none or as null.

This changes the value store, so it belongs in build step 2. Add a corpus household that answers "not for me" to a whole planet.

### A2. Add to the principles in 0.3

- The signature move: every room takes a traditional calculator and adds depth. A retirement calculator gains contribution phases and a milestone ladder. That depth is the product.
- Privacy line on every screen that shows a number: nothing is sent anywhere, every figure stays in this browser. Plus "not financial advice."
- A step is done when the user says it is, not when every box has a number. Those are different things.

### A3. Replace the line in 0.4 about replacing the Ledger

The Sky does not replace the Ledger's progression. The Sky is one arrangement of the Ledger's rows. These all survive and must keep working: the six doors ("which one do you want to go into now?"), the Express all-at-once form, dump-then-sort entry with a remembered sorting preference, arrangements, the route checklist, snapshots and "since last time," find-a-row, the assumptions panel, the progress card, and the three kinds of number (you know it, look it up with where to find it and a "roughly for now" option, computed with inputs linked).

### A4. Arrangements is a first-class concept

The rows are the app. Every organizing scheme is a view of the same rows, switchable, with a plain "why this arrangement, and what it costs" explainer. Ship at least four: by band (the Sky), by DAITE door, by the nine spheres, and by room. Never delete an arrangement when adding one.

Consequence for the nine Dante spheres: they are not a badge. They are the arrangement that shows sharpness (how well you know your numbers) as opposed to depth (how much you have entered). Keep their existing three-face structure from data/spheres.json: depth, shadow (sin names in the drawer only), virtue (shown on screen). Keep "this is already good" on the first four.

### A5. The route checklist

Restore it with its rules intact: nothing is locked behind it, every room is open from the map at any time in any order, a step is done when the user says it is, "not for me" is a real answer that moves the bar and is never held against them, clearing the list clears the ticks and no figures.

### A6. Add section 0.8, the ten schema shapes

These are the foundation the levels sit on. Implement them in the value store in step 2, before any level UI:

1. Every number is as-of a date, with a source and a confidence.
2. Nominal vs. real is declared once, globally. All projections in today's dollars.
3. Assets carry pretax vs. after-tax.
4. Income is stored by type, including unemployment as its own type (taxable, not withheld by default, and not subject to self-employment tax).
5. Every amount carries a cadence: monthly, annual, or one-off.
6. State is a first-class field.
7. Household of two is native, not an afterthought.
8. Every asset carries a liquidity tier.
9. Ages carry inflection dates.
10. Precision follows confidence: never display more precision than the input supports.

### A7. Files to add in step 1

- data/arrangements.json
- data/rooms.json: the room registry, including the 14-room expansion (Between Jobs, Protection, History, Decumulation, Tax, Estate Basics, Giving, Career Move, Partner, Kids & Tuition, Housing Decision, Big Purchase, Variable Income, Get Help) and the sidebar groups (Home, Your Numbers by DAITE, Scorecard, Decisions with its subgroups, What Matters, Level Up, Upkeep)
- data/settings.json: four groups (Accuracy, Household, Horizon, Advanced) holding the twelve financial phenomena as feature switches, beginner path starts with defaults-on only

### A8. Build order changes

- Step 2 also delivers: not-for-me, the ten schema shapes, versioned JSON export and import with a pre-import snapshot.
- Step 3 also delivers: the Express form, the privacy and disclaimer line.
- Step 4 also delivers: arrangements and the sphere view.
- Step 6 also delivers: find-a-row, the assumptions panel, the rough and stale nag (dashboard line, ring fill, Refresh room, approximate label).
- Step 5 also delivers: the global toggle mode (hours costed, time bought back, FI date pushed).
- Step 12 takes the decided merges as an explicit checklist: the three onboarding rooms into the Ledger, Snapshot and Savings Rate and Every Ratio and Score into DRAFTT, FIRE Number plus FIRE Lab, the Worth It group, Designed Week plus Time Buckets.

## B. Numbers to add to data/recipes.json

The spec's 141 metrics and 79 ratios are strong on rates and shares and weak on three things: probabilities, dollar amounts of need, and dates. Add these under the same lint rules (tier equals the highest band among inputs).

### B1. Do these in step 1, they change what the app is

- **successRate**, Tier 6. Historical-sequence backtest: run the plan against every start year in the data set, report how many survived, plus **worstStartYear**. Word it as "X of the historical start years survived," never as a probability of the future. Inputs: A13, E1 or E28, Y3, Y28.
- **healthScore**, Tier 3, plus five sub-scores: liquidity, savings, debt, housing, wealth building. Always decomposable, every component tappable through to the ratio behind it. A score you cannot take apart is someone else's opinion wearing a number.
- **pointValue**, Tier 1, derived. Months pulled off the FI date per one extra percentage point of savings rate, at this person's numbers. Show it on the savings rate card itself.
- **foTOStep**, Tier 2. Which step of the order of operations the user is standing on right now. This is different from slotFirst (the next action). Both ship.
- **lowBalanceDate**, Tier 2, derived. The lowest projected balance before the next payday and the date it happens. Inputs: I5 paydays, E7 bills, A4. Asks the user nothing new.

### B2. Ratios the live tool already computes and the spec dropped

- **consumerDebtRatio**, Tier 3: card and personal loan balances over annual take-home.
- **investmentRate**, Tier 3: money into investments over gross, separate from cash saving and from retirement-only.
- **basicLiquidity**, Tier 2: liquid assets over full monthly spending (the classic version), shown next to runwayMonths which uses the bare-bones month. Label both.
- Give **nwToIncome** its visible age ladder, and **investedShare** its target band.
- **mortgageQualRead**, Tier 9: turn front-end and back-end DTI into a plain answer inside mortgageCapacity.
- **furthestFromNormal**, Tier 6: top three areas ranked by distance from the healthy band. Ships alongside the FI-date-impact levers, labeled differently.

### B3. Expense classification (correctness fix)

Add a three-path tag to every expense line at E7, E8, E9: personal, linked to an income source (deductible against it), or reimbursable. New metrics: **deductibleExpenses** (Tier 4, feeds Taxes), **reimbursablePending** (Tier 3, money owed to you), **trueNetSpend** (spending after reimbursements). Without this, reimbursable spending inflates the FI number.

### B4. Dates and breakevens

All Tier 4 or later, each cheap once its inputs exist: refinance breakeven month, PMI removal date, promo cliff as dated calendar entries, PSLF payments remaining and projected forgiven amount, Social Security claiming breakeven age, rent vs. buy breakeven year, car total cost of ownership over ten years, time to next milestone, Coast FI as a small table by target age (55, 60, 65) rather than one number, and the break-even date for net worth zero.

### B5. Investing

portfolioIncome and its share of spending (Tier 7), rebalancing drift (Portfolio Design moon), after-tax expected return by account type (the spec's single expectedReturn makes taxable and Roth look identical), tax drag in dollars (Tier 9, beside feeDrag), and sequence risk as a number: years of spending held in safe assets at the FI date.

### B6. Protection

lifeInsuranceNeed in dollars (only when Y23 shows dependents), disabilityGap in dollars (not just the replacement ratio), selfInsureThreshold (the deductible level this household can comfortably carry, which is the number behind the "outgrown" advice on low deductibles), and umbrellaNeed.

### B7. Data table fixes

- Contribution limits vary by age: the 50-plus catch-up and the 60 to 63 band. Key benefit-tables.json by age, read through Y1.
- Savings presets at A14: max IRA, max 401k including catch-up, Rule of Five. Generalize Rule of Five as: any goal, any date, monthly number out.

### B8. Restore on the levels

- The therapy line as an optional separate expense category at E9.
- Debt "reasons to keep it" as a multi-select flag on D7 (low rate, tax-favorable interest, backed by an appreciating asset, building credit on purpose, employer-subsidized), feeding a per-debt exclusion toggle inside payoffPlan.
- Per-tag estimated vs. actual comparison bars survive into the Budget view.
- Household of two: declare per-metric which rates show per person and combined (savings rate and income rates do, FI number and net worth are household only).

## C. DRAFTT, defined

The master prompt references DRAFTT throughout as the scorecard and never defines it. This is that definition. Put it in section 0.8 as a table and build `engines/draftt.js` plus `data/bands.json` from it.

DRAFTT is the measuring stick. DAITE is the spine (what you enter), FAT is the breakdown of needs (food, accommodation, transportation), and DRAFTT is the scorecard: each letter is a share of take-home with a healthy band. That is the "one pager in, one pager out" chain. The name came from RAFT to DAFT to DRAFTT, and the thesis is that budgeting is a design problem rather than a discipline problem, because six categories drive nearly every outcome. The line that goes with it: it was never the coffee, it was always these six.

| Letter | What it measures | Source field | Solar system levels |
|---|---|---|---|
| D | Debt payments, non-mortgage minimums | debt items, minimums | D2, D4, D7 |
| R | Retirement saving. Basis is gross, not take-home | asset contributions | A3, A8, I9, I2 |
| A | Accommodation | expenses needs, accommodation | E2 |
| F | Food | expenses needs, food | E4, E9 |
| T | Transportation | expenses needs, transportation | E4, E8 |
| T | Taxes, effective rate of gross, shown as its own line | tax effective rate | T2, T10, T19 |
| (T) | Therapy, only when the toggle is on | therapy line | E9 |

Rules that come with it:

- Debt minimums are not expenses. They live under debt and are pulled into the D share from there. Do not let them appear in both.
- R is a share of gross. Every other letter is a share of take-home unless its selected source says gross. Convert on the fly so the scorecard always compares like with like, and print which basis is in use.
- Therapy is a plainly labelled toggle ("Track mental health spending separately"). When on it gets its own line and its own band, and it is subtracted from wants so nothing double counts. When off it does not exist in the schema.
- Accommodation share is a real number. Never hard-code a housing share. Fall back to 30% only when accommodation is unknown, and print "assumed 30% because accommodation is not filled in" beside any number that used it.

`data/bands.json`, one entry per letter, each with a `sources` map and a `default`:

```json
{
  "accommodation": {
    "default": "slaf",
    "sources": {
      "slaf":        { "low": 0, "high": 0.25, "note": "Eli's default. Under a quarter of take-home." },
      "trench":      { "low": 0, "high": 0.25, "note": "Scott Trench, Set for Life." },
      "moneyguy":    { "low": 0, "high": 0.25, "note": "Money Guy: 25% of gross.", "basis": "gross" },
      "fiftythirty": { "low": 0, "high": 0.30, "note": "50/30/20, housing inside the 50." }
    }
  }
}
```

Populate every letter with at least slaf, trench, moneyguy and fiftythirty. The slaf numbers are the visible defaults, marked as the owner's own and meant to be overwritten by him in the JSON. Do not invent a study behind any number: use `note` to say where it comes from or to say plainly that it is a stated opinion. The user picks the source per band from a small control on the scorecard, buttons only, no typing, stored per user under a `prefs` key outside DAITE.

The scorecard is one screen: seven rows at most, each row showing the share, the band, one verdict word (under, in, over), and a link to the owning room. No charts. That screen is the "one pager out."

Where this lands in the build: bands.json in step 1, the engine in step 2, the scorecard screen in step 6 with the Metrics tab. METRIC `draftt` in recipes.json keeps its Tier 3 slot and now has a real definition behind it.
