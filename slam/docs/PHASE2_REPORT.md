# SLAM Phase 2 report (2026-10-23)

Branch: `claude/slam-phase-2`. Nothing was merged into `main`. No real data was
used or created: every page was checked on the made-up demo household (Casey
Rivera, `fixtures/demo.json`), on a separate port, never in your browser.

GitHub Pages serves `main` only, so there is no live link. The branch:
https://github.com/sapphirestoneage/Personalfinance/tree/claude/slam-phase-2/slam

To look at it on your computer:

```
git fetch origin claude/slam-phase-2 && git checkout claude/slam-phase-2
cd slam && python3 -m http.server 8000
```

then open http://localhost:8000/dashboard.html (it links to the Ledger,
Calendar, Spending, Plan and Windfall pages). On a phone on the same network,
use the computer's address instead of localhost.

## Where it stands

Batches 0 and A to F are built, tested, committed and pushed. Batch G brought
what the Budget's calendar does to SLAM, but **the Budget calendar is not
retired**: a second audit of its own code found a few things SLAM cannot do yet
without changing the vendored engine, or without a decision from you
(questions 29 to 39). The retirement is ready as one patch,
`docs/phase2/batch-g-retire.patch`, and applies cleanly when you say go.

## What was built

Before the batches (S-199 to S-201): income dates and the pay day in the Ledger,
the first cash flow calendar, the Windfall room, links between the pages.

| Batch | Decision | What it added |
| --- | --- | --- |
| 0 | S-202 | `docs/CALENDAR_PARITY.md`, every feature of the cash flow spec placed in SLAM, the Budget, or the v44 engine; answers 21 to 28 recorded |
| A | S-203 | The day-by-day simulation: the v44 engine vendored unchanged (a test fails if it drifts), an adapter from the household record, the calendar's cash line from it |
| B | S-204 | The calendar's views: month, weeks, next 14 days, paychecks with the gross fold-out, the year; drag or Move, skip, re-price, lock; the maybe tray; search; milestones; the time selector |
| C | S-205 | The Debt tab: clear dates, the payoff timeline, interest by month, why a card is stuck, the target solver, the minimum-payment trap, utilization, balance transfer, which card, signup bonus |
| D | S-206 | The Spending page: the five-second logger, budgets by tag with pace, safe to spend, burn tiers, the cut simulator, bill autopsy, can I spend this, check-ins with drift, the sweep |
| E | S-207 | The feed: a statement or the Budget's log becomes proposals applied once; estimated vs actual per line and tag; a Dashboard tile |
| F | S-208 | The Plan page: the windfall order with the match, SE tax and the Roth cap; the ladder; the allocator; the solvers; the hourly wage; DRAFTT; goals; scenarios; the one-pager |
| G | S-209 | What the Budget calendar did, in SLAM (below); the retirement held |

Batch G in more detail, all on the SLAM pages:

- **What you log moves the cash line once.** "It happened" replaces the planned
  amount and day. A typed bill or paycheck claims its own occurrence. Everyday
  spending moves cash only when it goes past the plan. Anything else lands on
  its day.
- **Safe to spend** is now the lower of "until the next paycheck" and "the
  lowest point ahead less the floor", read before the cushion tops checking up.
  On the demo it now says nothing is safe (checking runs $219 short by Nov 14),
  where before it offered $2,622.
- **Cash by day**, a chart on the calendar: checking recorded before the as-of
  date (check-ins and the log), the run after it, savings apart, the floor,
  paydays and big bills, every day also as a list.
- **The month in words**: checking today, the lowest day and whether it is the
  day before payday, days under the floor or topped up from the cushion.
- **Waiting**: paychecks and bills due on or before today and not marked yet,
  one tap each way; Back to its day; Redo; "3 of 6 marked happened".
- **By date**: every movement with what checking holds after it, and where it
  came from (scheduled, happened, logged).
- **So far and expected by month end** on Spending and the Dashboard.
- Smaller: pay-later readings, bill timing with Save the new due day, card
  interest on its day, yearly bills once a year, a paycheck or debt with no
  amount named, every checking account in the line, paychecks into their own
  account, the check-in offers every cash account, a 2-month window.
- **No balance is never $0**: with no checking balance, nothing that reads
  checking shows a number; a card says what to add, with a button to it.

A review of Batch G (three reviewers and a skeptic per finding) found nine
defects in this new code, and all nine are fixed with tests. The gap audit's
skeptics then named fourteen more differences worth closing, also fixed (among
them: a household with no checking account no longer sees savings drawn as
checking, and items nobody marked count toward expected by month end). Among them: a
moved bill could drop out of the cash line or count twice; two checking
accounts broke the month's Show the math; the waiting card could ask about a
bill you had already typed in.

## Test results

| After | SLAM tests (`node --test` in `slam/`) | Repository suite (`node test/run.js`) | Browser, 375px and 1024px |
| --- | --- | --- | --- |
| The first part (S-199 to S-201) | 466 pass, 2 skipped | 35,885 checks | no errors, no sideways scroll |
| Batch 0 | 466 pass, 2 skipped | 35,909 checks | (docs only) |
| Batch A | 481 pass, 2 skipped | 35,909 checks | calendar |
| Batch B | 489 pass | 35,909 checks | every tab, the editor, a drag |
| Batch C | 499 pass | 35,909 checks | the Debt tab and its tools |
| Batch D | 511 pass | 35,909 checks | the Spending page walk |
| Batch E | 518 pass | 35,909 checks | paste, apply, estimated vs actual |
| Batch F | 532 pass | 35,909 checks | the Plan page and the one-pager |
| Batch G | 560 pass, 2 skipped, 0 fail | 35,909 checks | calendar, spending, dashboard, plan, one-pager, affordances |
| Batch G review fixes | 566 pass, 2 skipped, 0 fail | 35,909 checks | the same pages, again |
| The gap audit's second reading | 571 pass, 2 skipped, 0 fail | 35,909 checks | the same pages, again |

The 2 skipped are your local golden tests (no profile here). The Budget app's
own browser checks (`tools/screens-check.mjs`, `journeys.mjs`,
`layout-check.mjs`) pass as it is, and also with the retirement patch applied.
The one console error on every page is the expected 404 for the absent local
profile.

## The parity matrix

From the spec (Batch 0, recounted): in SLAM 99, in the v44 engine 40, missing 1,
excluded 3, old Budget only 0.

From the Budget calendar's own code (the gap audit, Batch G), 147 capabilities:

| Now | Count |
| --- | --- |
| In SLAM before Batch G | 29 |
| Ported in Batch G | 45 |
| Ported, with a difference named in the table | 24 |
| The same outcome by SLAM's design | 18 |
| In the retirement patch | 2 |
| Not a capability (a speed cache) | 1 |
| Still Budget only, in whole or part | 28 |

The 28 come down to questions 29 to 38; the biggest is card and loan payments
as items (13 rows). A skeptic re-read every row against the code at a strict
bar (any difference reads partial): in SLAM 33, partial 110, missing 4. Every
row, with both readings, is in `docs/CALENDAR_PARITY.md`, "The gap audit".

## Skipped, and why

- **The retirement** (Batch G's last step): held by the rule in the brief, since
  the gap audit found capabilities still Budget only. Ready as a patch.
- **Engine changes**: bills from a second account, and card or loan payments
  you can move or mark, need the vendored engine changed; S-203 says never
  edit it, so they wait on questions 29 and 30.
- **The Repayment Assistance Plan** is not modeled; income-driven repayment and
  the poverty line are marked "verify" in the rules.
- **The bottom sheet** for editing on a phone became a pinned Save row.
- **Google Sheets** export is a CSV you can open in Sheets, not live tabs.

## What still needs checking against your real data

Your profile (`fixtures/eli.local.json`), golden values and sign-off notes were
not in this environment and were never created here. With the file in place:

1. **Golden tests**: `node --test` in `slam/` should still report every local
   golden value passing (nothing in Phase 2 changes a Dashboard number; the demo
   fixture only gained pay days).
2. **Ledger, Income**: each stream's row should read right. The 2026-only W-2
   line (cadence total) reads "from ... to ..."; weekly unemployment reads
   "a week, since <start>". If the stream's `start` is the claim date rather
   than the first payment date, the calendar's pay dates will be off by that
   gap: open the row and set the first pay date.
3. **Calendar**: paychecks on the right days, minimums on each card's due day
   (a house-default 1st reads rough), the two 0% promos' switch dates, the
   subscription charge days, the 1099 contract at its likelihood, and the 2026
   return in April 2027 with the balance due you expect. The month-end cash
   should match the Dashboard's projection for the same month.
4. **Windfall**: run it with an amount you have in mind, both tax answers. Check
   the marginal rate on the tax step (it is rough while the W-2 numbers are
   rough), the 2026 balance due less your set-aside, which promo balances it
   pays and how much (deferred interest first), that cards with a $0 balance do
   not appear under "cards charging interest", and the Roth step: the 2026 entry
   in the contributions list counts as "put in for 2026" (if that entry is the
   plan rather than what is in, the room is overstated), and the phase-out
   against 2026 AGI.
5. **SIGNOFF.local.md**: Phase 2 changes no Phase 1 number. The Ledger's
   "paid from" rows on the demo now read "Checking, on the 1st" where a day was
   added; your own file has no pay days until you enter them.

6. **Batch G on your data**: open the Calendar and Spending. Safe to spend may
   now be lower (it looks past the next paycheck); check the day it names. Log
   a spend, mark a bill "It happened", and see the line move once.

## Questions for you

The full wording is in `QUESTIONS.md`. Short form:

29. Bills from a second account, and payments from a chosen account: change the engine, or keep main checking?
30. Card and loan payments you can move, skip or mark happened: change the engine, or keep them automatic?
31. The cushion: derived floor only, or a typed override too?
32. A forecast saved on the 1st: is drift at each check-in enough?
33. Balance checks per account and per debt on their own dates, or the household check-in?
34. Two named semimonthly pay days (the 1st and 15th): add a field?
35. A debt paid by a budget line counted once: add the link?
36. Everyday spending: SLAM's even spread, or what is left over the days left?
37. A category planned as one number: needed?
38. A card set to pay the statement in full: never charge interest?
39. Retire the Budget calendar now (what is left becomes known differences), or after the ones you want are built?

## Answers recorded (2026-10-23, S-202)

Eli answered questions 21 to 28 the same day (`QUESTIONS.md`, S-202 in
`DECISIONS.md`). 21 and 23 to 25 are built (Batches E and F), 26 to 28 were
applied, and 22 (retire the Budget calendar) waits on questions 29 to 39.

| # | Answer | What it means for the next build |
| --- | --- | --- |
| 21 | Feed | The spine is the source of truth, the Budget reads from it, and the Budget's transaction log supplies actuals back as Facts. |
| 22 | The spine calendar survives | Batch G brought what the Budget calendar does to SLAM; the retirement waits on questions 29 to 39 (the patch is ready). |
| 23 | The windfall order is right, cards included | An `employerMatch` step goes before `cards` whenever a paycheck has a match. The match is a text field today (`matchFormula`); the build needs it as numbers. |
| 24 | Yes | A 1099 windfall adds the self-employment rate to the tax step. |
| 25 | Cap at known earned income | The Roth step is capped at the year's known earned income and reads rough when that income is rough or missing. |
| 26 | Leave it | Commit 452b444 stays in history. |
| 27 | Yes | `slam/` is now in CLAUDE.md as a separate app. The line points at S-202 in SLAM's own log rather than a new root D-number, because root entry headings must carry an em dash by the root suite's own check and SLAM's style forbids one. Say the word if you want a root D-342 anyway. |
| 28 | Yes | Calendar paychecks stay net of payroll saving. |

## Stopped for your sign-off

This is where the session stops. Look at it on a phone (the steps at the top),
answer 29 to 39 in any order, and say go for the retirement when you are ready.

## Known differences (2026-10-25, after the retirement)

The Budget calendar is retired: the patch is applied (answer 39, S-226). These are the 28 rows of the gap audit
(`docs/CALENDAR_PARITY.md`) that were still Budget only, each with how your answers settle it.

| # | What the Budget calendar did | How it is settled |
| --- | --- | --- |
| 9 | Each scheduled item lands in its own chosen account | Known difference: paychecks land in their own account; bills and payments stay on main checking (29, parked). |
| 20 | Pay date rules per pay frequency | Closed: twice a month can name both days, the 1st and the 15th (34). |
| 26 | Debt payments scheduled on the debt's due day | Known difference: paid on the due day, from main checking only (29, parked). |
| 28 | A debt paid by a budget line is scheduled as that line, not twice | Closed: a line can name the debt it pays, counted and paid once (35). |
| 29 | Future scheduled items hit their account on their day | Known difference: paychecks do; bills come out of main checking (29, parked). |
| 30 | List of scheduled items with their states | Known difference: card and loan payments stay automatic, not items (30, parked). |
| 32 | Spread for a category planned as one number | Decided: a category can be one number, split into lines later; the screen is a later batch (37). |
| 37 | A stable key for each scheduled item | Known difference: paychecks and bills have keys; card and loan payments are not items (30). |
| 38 | Move a scheduled item to another day | Known difference: paychecks and bills move; card and loan payments do not (30). |
| 39 | Skip a scheduled item this month | Known difference: paychecks and bills skip; card and loan payments do not (30). |
| 40 | Confirm a scheduled item by an explicit link ('It happened') | Known difference: for paychecks and bills only (30). |
| 41 | Auto-confirm a scheduled item from a matching log entry | Known difference: for paychecks and bills only (30). |
| 48 | Month-end cash forecast made on the 1st | Known difference: drift at each check-in instead; no month-start forecast (32). |
| 49 | Forecast check: predicted against actual month end | Known difference: drift at check-ins is enough (32). |
| 56 | Cushion: the amount to keep in checking | Known difference: the floor stays derived; no typed override (31). |
| 77 | Forecast check: each month's predicted end cash against the real end balance | Known difference: drift at check-ins is enough (32). |
| 100 | Editable, prefilled amount on each waiting item | Known difference: for paychecks and bills; card and loan payments are automatic (30). |
| 101 | "It happened": confirm a scheduled item into the log | Known difference: for paychecks and bills only (30). |
| 102 | "Didn't happen / moved": move one occurrence to a new date | Known difference: for paychecks and bills only (30). |
| 103 | "Skip this month": drop one scheduled occurrence | Known difference: for paychecks and bills only (30). |
| 105 | Waiting items clear themselves when a matching log entry already exists | Known difference: for paychecks and bills only (30). |
| 108 | Track "Check balances" card: a real balance for any account or debt on any day | Known difference: the household check-in covers every cash account; per-account and debt checks are parked (33). |
| 128 | Predicted end cash saved at month close | Known difference: no month-start forecast is stored (32). |
| 129 | Insights, Cash tab: Forecast check card | Known difference: drift at check-ins instead (32). |
| 132 | "Didn't happen / moved": move a scheduled item to a new date | Known difference: card and loan payments do not move (30). |
| 133 | Track: Check balances for any account on any day | Known difference: the household check-in; per-account checks are parked (33). |
| 142 | Automatic tick-off of scheduled items by matching log or bank entries | Known difference: for paychecks and bills only (30). |
| 145 | Setup cash-flow inputs had a visible effect | Known difference: due days and the card pay setting work (a card paying its statement never carries a balance, 38); paid-from accounts stay on main checking (29); the cushion stays derived (31). |
