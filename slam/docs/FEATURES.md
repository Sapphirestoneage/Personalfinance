# SLAM features against the skeleton

Every user-facing feature should have six things: Entry points (two or more ways in), Views (two or more views of its data), States (empty, partly filled, rough, full, error), Actions (add, edit in place, stop or close, delete, undo), Math (a Show the math button from `ui/math-panel.js` with ids from `engine/math.js`) and Tests (`slam/test/*.test.js`).
Each cell starts with **done**, **partial** (with what is missing) or **missing**; **n/a** means the column does not apply (a read-only number has no Actions, a screen with no numbers needs no Math). A few words of evidence follow.
Checked by reading `ui/`, `engine/` and `test/` on branch `claude/slam-phase-2` (2026-10-27). The generic "Something went wrong" banner (`ui/page.js`) is not counted as a designed error state.

## Summary

| Column | Done | Partial | Missing | n/a |
|---|---|---|---|---|
| Entry points | 41 | 31 | 0 | 0 |
| Views | 38 | 33 | 0 | 1 |
| States | 1 | 71 | 0 | 0 |
| Actions | 11 | 42 | 0 | 19 |
| Math | 23 | 10 | 24 | 15 |
| Tests | 62 | 8 | 2 | 0 |
| **All cells** | **176** | **195** | **26** | **35** |

72 feature rows (Builder pages listed separately, not counted). No row has all six cells done; the closest is My numbers' DATING tree (Math partial).

## Today (dashboard.html, ui/dashboard.js)

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Net worth tile and screen | done: Today tile, My numbers top pair | done: tile, screen, My numbers lists | partial: missing and incomplete with "Needs:" links; no rough mark on the tile, no error | n/a: read-only, edits in My numbers | done: `DASHBOARD_MATH['tile-networth']` | done: p25-b1-shell, demo.golden, networth |
| Monthly surplus tile and screen | done: Today tile, One-pager grid | done: tile, three-line screen, money flow | partial: missing and incomplete; no rough mark, no error | n/a: read-only | done: surplus, leftAfterSaving | done: p25-b1-shell, eli.golden |
| Savings rate tile and screen | partial: Today tile only (One-pager shows the number, no link) | done: tile, screen with each kind of saving | partial: missing; no rough, no error | n/a: read-only | done: savingsRateNet, savingsRateGross | done: eli.golden, spine-engines |
| Cash runway and cushion steps | partial: Today tile only | done: tile, screen (two runways, cushion in three steps) | partial: missing; no rough, no error | n/a: read-only | done: runway, runwayNeeds, cushion ids | done: spine-engines, unemployment |
| Next step card | done: Today, Plan current step, One-pager | done: card, Plan step screen, One-pager words | partial: "Nothing to work on", question card when a number is missing; no error | partial: opens the step; no done or dismiss | partial: none on the step card itself | done: next-step, audit7-protection |
| Also worth doing (steps, cards, Done) | partial: Today row only | partial: one list plus a Done fold | partial: "Nothing else" empty; no rough, no error | partial: each card's button; no dismiss or snooze | done: `flagMath` per card | partial: next-step covers ranking; no UI test of the screen |
| Where the money goes (flow) | done: Today row, One-pager table | done: band chart, phone bar list, list twin, One-pager table | partial: guessed routes dashed; no empty or error design | partial: rows link to My numbers to edit | missing | done: krug7, spine-engines, p25-b2 |

## Session (session.html, ui/session.js)

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Five-step session (overview and steps) | done: tab, header search | done: overview list with open questions, step screens | partial: running totals with missing, rough chip or dot; no error | partial: skip, Back, Next, undo; no reset of a step | missing: running totals have no Show the math | done: p25-b3, p25-b1-shell |
| Needs tick lists and presets | partial: Session Needs step only | partial: one list | partial: rough dot or chip, missing; no error | partial: add, edit, Yes/No/Skip, undo; no delete of a line | missing | done: p25-b3, rough-now-later |
| Income step (pay, taxes, side money, money from a person) | partial: Session Income step only (same data in My numbers) | partial: one list per person | partial: missing, tax words; no error | done: add, edit, remove extra, convert to an IOU, undo | missing | partial: p25-b3, add-form; no test of the gift or support flow |
| Goals step (with the assumption set) | done: Session Goals, My numbers Goals, Plan goals | partial: list only in the Session | partial: goal with no target is named and left out | partial: add on the shared form, edit; no delete here | missing | done: slim, p25-b3 |

## My numbers (ledger.html, ui/ledger.js)

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| DATING tree with editor in place | done: tab, search, every "Needs:" link, Show the math inputs | done: sections, groups, item list, item detail | done: missing, rough, known, incomplete totals, "To fill in", bad-file card, parse messages | done: add, edit in place, Not for me or Not now, delete without asking, copy, undo | partial: section totals and expense cost only, not every row | done: p25-b1-mynumbers, p25-b4, spine-ledger |
| Liquid and total net worth pair | done: My numbers top, Today tile | done: pair, Assets and Debt lists | partial: incomplete when a line is blank; no error | n/a: read-only | done: worthPair ids | done: p25-b4, networth, basis-by-year |
| Filter by kind and select several | partial: My numbers top only | partial: filtered list only | partial: empty result words; no error | partial: bulk set and bulk delete, undo; no saved filter | n/a | partial: p25-b1-mynumbers; no bulk bar test |
| Subscriptions (under Needs) | done: Needs row, search, Profile quarterly review, bill's "Move to Subscriptions" | done: one-line list, row editor in place, Calendar items, review list | partial: rough day from house default, empty in review; no error | partial: move in, edit in place, set for all, delete, undo; "Stop it" only opens the bill | missing | done: subscriptions-sweep, p25-b1fix-ui |
| Covered by others | partial: Needs "Covered by others" line only | partial: one list | partial: never missing or rough by design; no empty or error | partial: edit the cover in the expense editor, undo | missing | done: covered-sweep |
| Owed to you (people and loans) | done: Assets group, Calendar ask day, shared bill editor | done: people list, person screen, Calendar ask item | partial: "Nothing owed", part paid; no rough, no error design | done: add money lent, Mark paid, Settled up, It was a gift, undo | missing | done: owed |
| Shared bills (people on a bill) | done: expense editor, Session row More | partial: editor only; totals show in Owed to you | partial: problem message; no rough or empty design | done: add person, edit part, remove, undo | partial: "Your share" term inside expense cost math | done: owed |
| Charged to this card | done: card screen, Spending line Paid with, Subscriptions Paid with | partial: card list and a picker | partial: empty text only | partial: attach, remove, undo; no stop | missing | done: card-charges |
| Debt payoff dates (ui/debt-tab.js) | done: My numbers Debt, Calendar row, One-pager debt card | done: debt list, timeline, solve form | partial: missing rows in words, rough; no error | partial: extra and solve boxes; debts edit in the tree | done: debt:solve, debt:bt, utilization, interest window | done: spine-debtview, p25-b1-calendar |
| Unemployment card | done: Income, Your situation (when between jobs) | partial: one card | partial: ongoing or ended sentence, box hints; no rough | partial: edit in place, delete, undo; add only by setting "not working" | done: runway, runwayNeeds, taxSetAside | done: unemployment |
| How much to max it (ui/maxit-panel.js) | done: account in My numbers, Plan row | done: account panel, Plan summary card | partial: rough and missing words; no empty or error | partial: record a contribution; no edit or delete of one | done: maxit room, lump, month ids | done: spine-maxit, p25-b0fix-maxit |

## Calendar (calendar.html, ui/calendar.js)

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Month views (List, Month, Year) | done: tab, header search | done: list, month grid, year table | partial: "~" for a guess, Sometime this month, missing amount left out; no error | partial: give it a day, filters, undo; no delete of a bill here | partial: month line only (`calendar:monthCash`) | done: p25-b1-calendar, spine-calendar-views, calendar-days.browser |
| Day and item screens, drag to move | done: list, month grid, event search, drag | done: day list, item detail | partial: an item that cannot move says why; no error | done: happened, move, skip, amount this time, lock, undo | missing | done: p25-b1-calendar, calendar-days.browser |
| Did these happen? (confirm) | done: "N to confirm" row, item screen | done: confirm list, item screen | partial: row hides at zero, Actual box check; no rough | done: Happened, Mark all, different amount, unconfirm, undo | missing | done: p25-b1-calendar, spine-calendar-views |
| Cash by day chart | partial: Calendar fold only | done: chart, List view's checking after each day | partial: back-to option, pre-cover mark; no empty or error | n/a: read-only | missing | done: p25-b2, p25-a |
| Maybe money | partial: Calendar fold and + Add only | partial: one list | partial: "none"; pick a day first message | partial: add, give a day, drag, remove, undo; no edit in place | missing | done: slim, spine-calendar-views |
| Bill timing | partial: Calendar fold only | partial: one list | partial: "timing already works"; no error | partial: apply a new due day, undo | missing | done: spine-calendar-views |

## Spending, Do tab (spending.html, ui/spending.js)

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Cash forecast and the fix (Safe to spend, Today warning, Calendar top) | done: Spending Do, Today warning, Calendar top | done: one line, Today card, Calendar sentence, Cash by day | partial: short, above floor, no checking (gaps card); no rough | partial: Move button opens the savings account | partial: Spending only (`spend:safeToday`); Today and Calendar tops have none | done: cash-story, spine-spending |
| Add a purchase and this month's log | partial: Spending Do, #log link | done: form, this month's list, line screen entries | partial: "Nothing added this month", amount check; no rough | partial: add, add as refund, remove, undo; no edit of an entry | partial: only through `budget:cat` | done: p25-b1-spending, budget |
| Import a statement and review | partial: Spending Do row (leads when the Profile says import) | partial: review table only | partial: skipped rows named, parse message; no empty | partial: add ticked lines, cancel, undo; no edit of a line before adding | n/a | done: budget, spine-feed |
| Check in balances | done: Do row, #checkin links | partial: one form | partial: stale or up to date; no error design | partial: type balances, undo | done: check-in ids | partial: staleness in spine-spending; no UI test |
| Can I spend this? | partial: Do row only | partial: one result | partial: missing words; no error | n/a: nothing saved | done: `spend:ask` | done: spine-spending, spine-audit |
| Month-end sweep | partial: Do row only | partial: one card | partial: on or off | partial: turn on, choose where, undo | done: `spend:sweep` | done: spine-spending |

## Spending, Budget tab

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Budget vs actual table | partial: Budget tab only | done: table, category screen, line screen, three ranges | partial: missing plan, "none" actual, on pace mid-month; no rough mark, no error | partial: plan edited in place on a line screen, undo; no add line here | done: `budget:income`, `budget:cat` | done: budget |
| Lumpy bills (on their own cycle) | partial: Budget table only | partial: one row group | partial: set aside of total; no empty or error | n/a: read-only | missing | done: budget |
| Close the month and History | partial: Budget button and History fold | done: one-at-a-time walk, History list | partial: on plan, ready, closed | done: choose, close, start over, reopen, undo | missing | done: budget, loop |
| The plan learns (Update plan to average) | partial: Budget only | partial: one card | partial: shows only past the threshold | partial: Update or Keep, undo | missing | done: budget |
| Not sorted yet and Stores and their lines | partial: Budget rows only | partial: two lists | partial: "Everything is sorted", "No stores learned yet" | partial: sort, change, remove store, undo | n/a | missing: sortEntry, setMerchantRule, learnedMerchants untested |
| Target column (set, switch, what it buys, step toward) | done: Budget row, Plan saved scenarios | done: target column, what it changes list, line screen | partial: none set, "same", storage blocked message; no rough | done: set, switch, clear, step toward, undo | missing | done: target |
| Budgets with pace (by tag) | partial: Budget row only | partial: bars only | partial: missing amount; no error | n/a: read-only | done: tag budget, spent, pace | done: spine-spending, p25-b0fix-links |
| Estimated vs actual and How the month could end | partial: Budget rows only | done: compare card, outlook card | partial: window words; no error | n/a: read-only | done: compare and soFar ids | done: spine-compare |
| Where it goes, layers, Try cutting something | partial: Budget rows only | done: donut, layers, cut list | partial: missing total; no error | partial: tick lines to cut (this browser only) | partial: layers and cut have it, the donut does not | done: spine-spending, chart-data |
| Each bill a year and Price changes | partial: Budget rows only | done: autopsy list, price list, line screen | partial: "None this month" | n/a: read-only | done: autopsy and priceChange ids | done: spine-spending |
| Fixed and variable | partial: Budget row only | partial: one card | partial: no empty or error design | partial: switch a line fixed or variable, undo | missing | done: fixed-variable |
| Beside a common reference (50/30/20) | partial: Budget row only | partial: one list | partial: unmarked need or want reads missing | n/a: read-only | missing | done: p25-a |

## Plan (plan.html, ui/plan.js)

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Steps in order and step screens | done: tab, Today next step, One-pager, search | done: step list, step screen, "together" grouping | partial: missing box per step, deductible 0 vs blank; no rough mark | partial: fill a number in place, undo; no skip or stop a step | done: `plan:foo:*` | done: spine-plan, p25-b1-plan |
| High-interest debt step | done: Plan step, Today next step | partial: one list | partial: 0% promo left off; no empty design | partial: record a payment, add a debt, undo; no delete | partial: the step's own math only | partial: recordDebtPayment engine only; no UI test |
| Got extra money? (ui/windfall.js) | done: Plan card, search | done: steps list, step screen | partial: "Cannot figure yet", "Nothing left for it"; no error | n/a: nothing written | done: `windfall:*` | done: spine-windfall, p25-b1-plan |
| Surplus step by step and paychecks | partial: Plan folds only | done: waterfall, paychecks list, paycheck screen | partial: missing; no error | n/a: read-only | done: `windfall:*`, `plan:pay:*` | done: spine-plan, p25-b1-plan |
| Real hourly wage, DRAFTT, fixed floor | partial: Plan folds only | partial: one screen each | partial: missing chip with what it needs | n/a: read-only | done: `plan:wage`, `plan:draftt:*`, `plan:floor` | done: spine-plan, draftt |
| Goals and Pick an age (solve) | done: Plan, My numbers Goals, Session, Profile | done: Plan goals screen, My numbers list, solve rows | partial: goal with no target left out; no error | partial: edits live in My numbers | done: `plan:goal:*`, `plan:solve:*` | done: spine-plan, spine-audit |
| Outlook (next three months) | partial: Plan line and screen only | done: sentence, runs screen | partial: no error design | n/a: read-only | done: `plan:outlook` | partial: spine-plan; the $0 demo reading is an open question |
| Life events | partial: Plan only | partial: form and list | partial: pick and date messages | partial: add, remove, undo; no edit | missing | done: p25-b1-plan, spine-plan |
| Saved scenarios (compare, load) | done: Plan, Budget target | done: list, diff against today | partial: storage blocked message, "Nothing differs" | done: save, load, delete, undo | n/a | partial: keepScenarios in p25-b1-plan; ui/scenarios-store.js untested |
| Download or read a file | done: Plan files, Builder Open file, name menu | done: diff preview, file words | partial: bad-file words, brought up to date; no empty | partial: download, read, apply with undo; no partial apply | n/a | done: p25-b1-plan, whose-numbers |

## Profile (profile.html, ui/profile.js)

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Your life (Level 1 and 2 answers, disagreements) | done: Profile, Session links, Import answers | done: areas, question screens, "answers disagree" card | partial: Not sure, known later; no error | partial: answer, change, Fix it, undo; no clear an answer | n/a | done: profile-tab, answers-agree |
| Homework and to-dos (Check again) | done: Profile, Still guessing "Add to homework", One-pager to-dos | done: Profile list, One-pager list | partial: drops off once filled | partial: add from Still guessing, undo; no remove by hand | n/a | done: p25-b-profile, where-to-find |
| FI assumption set | done: Profile Goals settings, daily screens' one-line link, My numbers Profile section | partial: one bar | partial: rough Fat and Barista FI from defaults | partial: pick a set; undo | partial: FI numbers explain elsewhere, not on this screen | done: fi-defaults |
| Protection (insurance, will) | done: Profile, Today steps, One-pager | partial: question list, one Plan line | partial: Not sure; no error | partial: answer, undo | n/a | done: audit7-protection |
| Quarterly review (subscriptions) | partial: Profile only | partial: one list | partial: empty words, due marks | partial: Keep it, Keep all, Stop it opens the bill | missing | missing: no test of the review screen |
| Life changes log | partial: Profile only | partial: one list | partial: empty words | partial: read only; undo takes the last back | n/a | partial: target covers "target" entries only |
| Preferences | done: Profile, search, Spending's one-line link | partial: one list | partial: an option needing a missing number says what to add | partial: change, undo; no reset all | n/a | done: prefs |

## One-pager and client pages

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| One-pager handout (onepager.html) | done: Today row, search | done: screen, printed page | partial: missing words, example label; no error | n/a: print only | missing: by design plain, but no link back to the math | done: audit6-onepager, p25-b1-rest |
| Before our first call (before.html) | done: search, the link sent to a client, Profile Import answers | partial: one section at a time | partial: Not sure, saved progress, amount check | partial: answer, Back, Next, Send; no undo | n/a | done: audit5-coaching, krug7 |
| Assumptions page (assumptions.html) | done: Builder, Profile, search, formula entries | done: grouped list, row screen with before and after | partial: default and changed chips, Nothing changed; no error design | done: change, save, reset, undo at both levels | partial: before and after preview, no Show the math button | done: assumptions, krug7 |

## Cross-cutting

| Feature | Entry points | Views | States | Actions | Math | Tests |
|---|---|---|---|---|---|---|
| Header search (ui/search.js) | done: magnifier in every page header | partial: results list only | partial: no "nothing found" design checked | n/a | n/a | done: krug-header |
| Undo and redo (25 steps) | done: header icons, undo bar, Ctrl/Cmd+Z | partial: bar message only, no history list | partial: nothing to undo | done: undo, redo across pages | n/a | done: p25-b1-history, p25-b1-shell |
| Show the math (ui/math-panel.js) | done: about 40 buttons, All formulas page | done: panel, nested inputs, All formulas entry | partial: rough and missing reasons; an unknown id shows nothing | n/a | done | done: p25-b0fix-math, p25-b-formulas |
| Still guessing (rough now and later) | done: Today row, My numbers row, search, homework | done: list, grouped by where or section, four sorts | partial: "Working it out", check now vs later; no error | partial: Check now or later, Add to homework, undo; no dismiss | missing: reasons only | done: rough-now-later, where-to-find |
| One add form (ui/add-form.js) | done: My numbers "+ Add", Session, Calendar maybe money | n/a | partial: hint while empty, amount check | partial: add, cancel; edit happens elsewhere | n/a | done: add-form, slim |
| Whose numbers (example to yours, name menu) | done: every header, Builder | partial: name menu only | partial: example, yours, "Your household" | partial: first edit makes it yours, undo brings the example back | n/a | done: whose-numbers |

## Builder pages (coach tools, not in the counts)

| Page | Entry points | Views | Actions | Math | Tests |
|---|---|---|---|---|---|
| Builder (builder.html) | partial: footer link only | partial: list | partial: Open file, Try with example numbers | n/a | done: p25-b1-shell, whose-numbers |
| All formulas (math.html) | done: Builder, "See the formula" | done: list, entry | n/a | done | done: p25-b1-rest |
| Rules (rules.html) | partial: Builder only | partial: list | partial: edit, import differences | n/a | done: p25-b-layers, rules |
| House defaults (house.html) | partial: Builder only | partial: list | partial: edit in this browser | n/a | partial: p25-b-layers |
| Where to find (where.html) | partial: Builder only | partial: table | partial: edit words and minutes, download | n/a | done: where-to-find |
| Design kit (affordances.html) | partial: Builder only | done: every component in every state | n/a | n/a | partial: spine-style |

## Most-used features with missing cells, first

1. Today, Where the money goes: no Show the math on the flow.
2. Today, Savings rate and Cash runway tiles: one way in each; add a link from My numbers or the One-pager.
3. My numbers, Subscriptions: no Show the math, and "Stop it" only opens the bill (add a real stop with an end date).
4. My numbers, Owed to you: no Show the math for the per-person total.
5. My numbers, Charged to this card and Covered by others: no Show the math; Covered by others has one way in.
6. Calendar, Day and item screens and Did these happen?: no Show the math on an item's amount or on checking after it.
7. Calendar, Cash by day and the top "Lowest" sentence: no Show the math (the Calendar made simple pass dropped it).
8. Calendar, Maybe money and Bill timing: one way in each, no Show the math, Maybe money has no edit in place.
9. Spending, Not sorted yet and Stores and their lines: no tests at all.
10. Spending, Close the month, The plan learns, Lumpy bills: no Show the math.
11. Spending, Target column: no Show the math for "what the target buys".
12. Spending, Add a purchase: no edit of a logged entry (only Remove).
13. Plan, Life events: no Show the math and no edit; Plan, High-interest debt step: no UI test.
14. Session, all steps: running totals have no Show the math; Needs lines cannot be deleted.
15. Profile, Quarterly review: no test and no real stop action.
