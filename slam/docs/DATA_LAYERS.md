# Data layers

Every piece of data lives in one layer. A layer says who may change it, where it is stored, and what reads it.
The map below covers what exists today. It describes what is there and does not rebuild it. The code follows these rules:
`test/p25-b-layers.test.js` checks the ones a test can check.

| # | Layer | What it holds | Who changes it | Where it lives |
| --- | --- | --- | --- | --- |
| 1 | Rules | The law: limits, brackets, deadlines, the gift exclusion. Yearly, sourced. | Builder only (Rules) | `data/rules-<year>.json`; browser changes in `slam-rules:v1` under the year |
| 2 | Reference data | Facts about the world: institutions, typical costs, spending averages, benchmarks, withdrawal-rate sources. Shown to clients as "typical". | Builder only | `data/institutions.json`, `data/session-presets.json` (typical amounts, withdrawal rates), `data/spending-averages.json`, `data/benchmarks.json`, `data/merchant-rules.json` |
| 3 | House defaults | Eli's method for everyone: a card's rate when unknown (25%), the due day (the 1st), the Rule of 5, the housing reference (35%), the FOO order, what is too small to matter ($100), the phone plan, a car's yearly loss, a plain account's rate. | Builder only (House defaults) | `data/house-defaults.json`; browser changes in `slam-rules:v1` under `house`. Read by every engine through `rules.get()` (`engine/rules.js withHouse`) |
| 4 | Formulas | The definition of every metric and lens. | Code, reviewed | `engine/math.js` (the one registry); `docs/FORMULAS.md` is written from it (`tools/formulas-doc.mjs`) |
| 5 | Assumptions | Guesses about the future: inflation, real return, withdrawal rate, life expectancy, the coast age. Standard, Conservative, Optimistic or Your own per client. Past Optimistic the app says "beyond what most planners use". | The client with Eli (Profile, Session Goals step) | `spine.assumptions` (Facts); the three sets in `engine/scenarios.js` from the `SCENARIO_*` rules |
| 6 | Profile | How the client's life works now: where they live, how they get around, work, who they share money with, which debts and accounts they have, health cover, how they keep track, goals picked. | The client (Before our first call) and Eli (Profile page) | `spine.profile` (Facts, one per answer). Every change is also written to History as a life change |
| 7 | Intentions | What they decided to do: goals with an amount and a date, planned events, debts kept on purpose, maaser %. | The client with Eli | `spine.goals`, `spine.debtPlan`, `spine.profile.maaserPct`; progress shows in My numbers under G |
| 8 | Scenarios | What-ifs. Never written over real numbers. | Anyone, on Plan | `slam-scenarios:v1` and `slam-scenario:v1` (browser); applied in memory by `engine/scenarios.js withScenario` |
| 9 | Numbers | What is true right now: balances, monthly amounts, saved so far, the gut number. | The client, Eli | `spine.income`, `spine.expenses`, `spine.accounts`, `spine.debts`, `spine.household.gutSpending` (Facts) |
| 10 | History | What already happened: entries, closed months, check-ins, the life-change log, the undo steps. Append only. | Added to, never edited | `spine.log`, `spine.checkins`, `spine.lifeChanges`; the 25-step undo history in `slam-history:v1` |
| 11 | Coaching | Notes (private unless marked shared), to-dos for Eli and for the client, homework and its status, recaps, stress and satisfaction scores. | Eli | `spine.coaching.homework` today (Profile Level 3). Notes, recaps and scores come with Phase 3 |
| 12 | Results | Everything the formulas produce. Never typed in, never stored as truth. | Nobody | Figured on every render by the engines (`engine/summary.js` and the rest) |
| 13 | Preferences | Theme, the hours toggle, discretion mode, tone. | The person using the browser; tone in Profile | Browser keys (`slam-hours:v1`, `slam-window:v1`, `slam-ledger-view:v1`, ...); tone is `spine.profile.tone` |

## The rules each layer keeps

- **Rules and reference data are never typed on a client screen.** A client screen may show them, marked "typical".
- **A house default is used only where the client's number is blank.** It is stored as a guess (`kind: 'rough'`,
  `by: 'default'`, `source:` the default's id), and the client screen says "using Eli's default". Changing a house
  default on the Builder changes every guess that used it, and nothing the client typed (`engine/defaults.js`).
- **Changing a number never changes which fields show.** Only a Profile answer does (`engine/profile.js
  fieldsFor`). A Profile change hides fields and never deletes them. Switching back shows what was typed.
- **A Profile change is a life change.** It is logged with its date, what it was and what it became
  (`spine.lifeChanges`), and the shell's Undo takes it back.
- **Scenarios never write to Numbers.** They are applied to a copy in memory.
- **Results are never stored.** A number on a screen is figured from the layers above it every time.

## The four tags on every number

Every Fact (`engine/spine.js fact`) keeps:

1. **Where it came from**: `source` (the profile file, the ledger, a statement, the house default's id, `typical: ...`).
2. **As of when**: `asOf` (a date).
3. **How sure**: `kind`: `known`, `rough` (a guess), `missing`, `notForMe` (does not apply).
4. **Who supplies it**: `by`: `client`, `coach`, `lookedUp` or `default`. A Fact saved before Phase 2.5 has no `by`;
   `whoSupplies(f)` reads it from the source.

Compatibility: `by` is optional. Older files load unchanged; nothing is rewritten on load.

## Starting guesses, in order

A blank field's first value comes from the first of these that has one (`engine/defaults.js startingGuess`):

1. The client's own number.
2. A guess from their profile (for example, living with family puts rent at $0 to them).
3. Reference data ("typical for people like you": `data/session-presets.json` typical amounts).
4. Eli's house default ("using Eli's default").

Each guess carries its words in the Fact's `note`, so the screen says which one it is.

## What moved in Phase 2.5

- Thirteen rules that were Eli's method, not the law, moved from `data/rules-2026.json` to `data/house-defaults.json`
  (`DEFAULT_CARD_APR`, `DEFAULT_DUE_DAY`, `DEFAULT_APY`, `DEFAULT_PHONE_PLAN_1`, `DEFAULT_VEHICLE_DEPRECIATION`,
  `APP_CARD_MIN_PCT`, `APP_CARD_MIN_FLOOR`, `APP_RULE_OF_5`, `APP_HOUSING_REF`, `FOO_RUNGS`, `FOO_HYPER_RATE`,
  `APP_HI_RATE`, `WINDFALL_ORDER`), plus one new one, `APP_MATERIALITY` ($100). Their ids did not change, so every
  engine reads them as before.
- `household.home` and `household.getAround` (the Session's first questions, S-236) moved into the Profile
  (`profile.home`, `profile.getAround`). The loader moves an older file's answers across.
- The stage thresholds (`STAGE_*`), the scenario sets (`SCENARIO_*`) and the coast age (`APP_COAST_AGE`) moved to the
  house defaults too (question 101); the app's other design settings (`APP_*`) stay in the rules file.

## Assumptions, for everyone and for one client

The Assumptions page (assumptions.html, engine/assumptions.js) lists every number the app assumes: Eli's method, the
stage lines, the order money goes in, the future guesses, the typical amounts and the law. "For everyone" changes a
house default (kept in this browser, like the Builder's House defaults page). "For this client" saves an override on
the household (`spine.assumptionOverrides`: `{ <rule id>: { value, asOf } }`), and every page reads the rules through
`withClient(rules, spine)`, so the client's own value wins wherever the house default would. A client's typed numbers
are never changed by either. Compatibility: the field is optional; a file without it reads every default as it is.
