# Phase 2.5: the plan for Batches 5 to 10 and Finish

Batches 0 to 4 are built (PROGRESS_25.md). These are saved, not built. Each batch keeps the run rules: one review
sub-agent and one round of fixes, at most two tries on any one problem, questions to QUESTIONS.md with the default
used, no new features beyond the batch, no em dashes, no real data, empty is not zero, commit and push after each
batch with one line in PROGRESS_25.md.

What every batch reuses, so nothing is built twice:
- The shell (ui/shell.js): each deeper screen is a level (page.html#/a/b), with Back, the trail and one undo history.
- My numbers' statement (Batch 4): liquid and total net worth with Show the math, the six DATING rows, group and item
  screens, rows biggest first. Today's tiles and the One-pager open these screens instead of drawing their own.
- networth.js liquidAssets and balanceSheet liquid and liquidNetWorth (Batch 3); math.js liquidNetWorth (Batch 4).
- tools/copy-check.mjs (banned words, every fold open) and tools/dead-clicks.mjs (375px) run at the end of each batch.

## 5. Today

- Five tiles, each opening its own screen (a level of dashboard.html): Net worth (liquid and total side by side; the
  screen is the Batch 4 drill-down), Monthly surplus, Savings rate of take-home, Cash runway, Next step (the Plan's
  current step, opening it).
- The surplus as three labeled lines: take-home, what goes out (spending, debt payments, saving, the tax set-aside),
  and what is left.
- The Sankey (flow-chart.js) is the hero under the tiles, with a One-pager button under it.
- What leaves Today: the credit card, FI, tax, safe to spend and month-vs-plan tiles move to the screens they belong
  to (Debt, Goals, Taxes, Calendar, Spending); the To work on list moves to the Next step screen.
- Done when: five tiles, each one tap to its screen; Today under 400 words; 0 dead clicks.

## 6. Calendar

- Top: cash today, left this month, lowest point (three numbers, each with Show the math).
- The balance line labeled (Cash, Debt), dollar y axis, month x axis; the savings line labeled as shown apart.
- View toggles: All, Money in, Bills, Debt, Rough or missing (filters on the one list of events).
- Agenda view with the balance after each item.
- Tap an item to mark happened, didn't, or different; select several at once; every mark undoable (the shell's
  history).
- A one-line hint that items can be moved, and a "What the colors mean" link that opens the legend.
- Done when: 0 dead clicks; mark three items in one go and undo them in one step.

## 7. Spending

- Two tabs, Do and See (levels of spending.html).
- Do: "Import a statement" as the main way in, then the review queue (matched, recurring, new; change or skip each;
  one Apply). Add a purchase below it. The check-in as a one-line chip that opens in place.
- See: the 1, 3, 6, 12 picker that visibly changes the numbers and says the range in words ("Showing Aug to Oct");
  each category opens its own screen; reference bands from data/benchmarks.json, never grades.
- Done when: the picker changes every number it says it changes; nothing on See is a verdict.

## 8. Plan

- Each step opens its own screen with inline fixes (type the missing number there).
- Fix the deductible step's 0 vs 100 behavior: a typed 0 means no deductible (the step is done), a blank one is
  missing (the step is not done), and neither reads as 100% covered.
- High-interest debt step: lists the debts with Add and Record a payment.
- DRAFTT: shares only, plus the dollars over 35% on housing; no verdict words.
- Outlook in one sentence on the Plan; the runs behind Show the math.
- Scenarios: explain in one line or hide behind More.
- Windfall opens as "Got extra money?" (the name is in place since Batch 1).
- Done when: every step screen can be completed without leaving it.

## 9. One-pager

- Both net worths, the monthly surplus, one small chart (the Sankey, small). Printable on one page.

## 10. Client test

- Mock sessions for two made-up clients, timed with a script that types what a coach would:
  - Maya, 27, renter, anxious: rent, a few bills, one paycheck, a savings account, one goal.
  - Dre, 31, self-employed, lumpy income, a card balance: 1099 pay with a set-aside, a card, an irregular month.
- A navigation test: four levels down, the phone's back to the top, three undos in a row.
- Fix whatever needed explaining out loud; rerun; the target is under an hour each.

## Finish

- The parking lot lines from the persona checker (claude/slam-checker-zdig1g, CHECKER_REPORT.md) added to
  PARKING_LOT.md, read only, not merged.
- Republish the phone artifact (https://claude.ai/artifact/WbU42ruKYa7Z7aZtgrUFU2).
- The final report: per batch what is done and skipped, words per page before and after, 375px screenshots, persona
  changes, and new questions with the defaults used.
