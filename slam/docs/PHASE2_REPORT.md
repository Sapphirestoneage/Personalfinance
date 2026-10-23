# SLAM Phase 2 report (2026-10-23)

Branch: `claude/slam-phase-2`, built on `claude/slam-phase-1-foundation` at e6b8533.
Nothing was merged into `main`; `claude/slam-phase-1-foundation` and
`cleanup-for-review` were not touched. Every change is one commit, pushed as it
was made. No real data was used or created here: the pages were checked on the
made-up demo household (Casey Rivera, `fixtures/demo.json`).

GitHub Pages serves `main` only, so there is no live link yet. To look at it:

```
git fetch origin claude/slam-phase-2 && git checkout claude/slam-phase-2
cd slam && python3 -m http.server 8000
```

then open http://localhost:8000/calendar.html and http://localhost:8000/windfall.html
(and the Ledger and Dashboard, which link to both). The branch on GitHub:
https://github.com/sapphirestoneage/Personalfinance/tree/claude/slam-phase-2/slam

## What was built

In the order the brief asked for: Phase 1 open items first, then the Phase 2
plan from `BOARD.md`. Each line is one commit.

1. **Income dates and pay day in the Ledger (S-199)**, the one Phase 1 item marked
   open that needed no decision from you (S-169 left cadence and dates set only
   when an item was added). An income stream is now one row, "$6,000 a month,
   since Jan 1, 2024, paid on the 15th", with one panel: name, how much and how
   often, the day it lands (for pay that comes monthly or less often), and
   "When does it run?" with start and end dates folded away unless set. Weekly
   and biweekly pay ask for the first pay date instead, because their pay dates
   count from it. The expense panel gets the same "When does it run?" fold.
   New optional field `income.payDay`; older files load unchanged.
2. **The cash flow calendar (S-200)**, `calendar.html`. One month at a time,
   Previous and Next as real buttons. Each paycheck lands on its pay date for
   what actually arrives (gross less tax withheld, Social Security and Medicare,
   and its share of payroll saving, so the month adds up to take-home); each
   bill on the day it is paid; each minimum on its due day; a subscription for
   its whole charge on its charge day; promo rates ending; income and expenses
   starting and ending; the four estimated tax dates and the April return date
   with the balance due; health coverage and situation changes. Anything with no
   day is listed under "Sometime this month", never dropped and never put on a
   made-up day. A guessed day (a house-default due day) or a rough amount wears a
   "rough" tag. The month-end cash comes from the projection (expected mode, the
   assumption set picked on the Dashboard); this month shows cash today. A list
   by day on a phone, a seven-column grid from 640px, a legend, and a list twin
   with a Ledger link on every item.
3. **The Windfall room (S-201)**, `windfall.html`. Type a lump sum in a bordered
   box, say whether tax is already taken out (two choice cards), tap "Show where
   it goes". The money is assigned in the order of a new rule, `WINDFALL_ORDER`
   (a house assumption in `data/rules-2026.json`, so the order changes in data,
   not code): tax on the money itself at your marginal federal plus state rate
   when tax is still owed; the year's balance due less what is already set
   aside; cash up to the stage 1 floor; promo balances the monthly surplus
   cannot clear before their deadline (deferred interest first, paying just
   enough now that the rest fits the surplus); cards charging interest today,
   highest rate first; cash up to the Rule of 5 target; this year's Roth IRA
   room (the limit, the age 50 catch-up, what is in so far, the income
   phase-out); then what is left, named "not assigned yet". Every step says what
   it needs, what it takes, why, links to its Ledger field, and has Show the
   math. A step with a missing input takes nothing and reads missing, never $0.
   Nothing is written to the household.
4. **Wiring**: every page links to the Calendar and Windfall; the Dashboard has an
   "Also" card pointing at both; `affordances.html` shows the new components;
   the page-links row wraps on a phone (five links overflowed by 3px).
5. **Docs**: decisions S-199 to S-201, `BOARD.md`, `CONTRACTS.md`, `README.md`
   (a Phase 2 section), `QUESTIONS.md` (21 to 28), `AUDIT.md`, screenshots in
   `docs/phase2/`, and this report.

**Not built: Budget estimated vs actual** (Phase 2 item 2). It rests on S-140,
which is still open: does the spine feed the Budget app, or replace its store?
Either reading leads to different code, so nothing was built. See question 21.

## Test results

| Suite | Result |
| --- | --- |
| `node --test` in `slam/` (before any change) | 455 tests, 453 pass, 2 skipped (the local golden tests, no profile here) |
| `node --test` in `slam/` (after the last commit) | 468 tests, 466 pass, 2 skipped, 0 fail |
| `node test/run.js` (the repository suite) | 35,885 checks pass, before and after every commit |
| Headless browser, every page at 375px and 1024px | no console errors (one expected 404 for the absent local profile), no horizontal scroll |

New tests: `test/spine-calendar.test.js` (5), `test/spine-windfall.test.js` (6),
and two in `test/spine-ledger.test.js` for the income panel and expense dates.
The self-audit (`test/spine-audit.test.js`) now recomputes every Windfall step to
the cent on the demo household, and the calendar test checks that a month's
paychecks add up to take-home and its outgoings to spending, minimums, saving
and the set-aside, with the surplus left over.

Screenshots (demo household, phone width unless named): `docs/phase2/`
1 the income panel, 2 the expense dates fold, 3 the calendar on a phone,
4 the calendar grid at 1024px, 5 the Windfall form, 6 the Windfall steps,
7 the Dashboard's "Also" card.

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

## Questions for you

The numbered ones are also in `QUESTIONS.md` (21 to 28).

21. **Budget estimated vs actual (S-140)**: feed or replace? (a) *Feed*: the
    Budget keeps its own store; its estimates are read from the spine's expenses
    (one owner per number, S-140's spirit), and the Budget's log stays where it
    is. Least code, two stores. (b) *Replace*: the log is written into the spine
    (a new `log` collection), the Budget's screens read it, and the Budget's
    store goes. One record, but a large migration of a working app.
    Recommendation: (a) first, since it answers "estimated vs actual" on the
    Dashboard in a week, and leaves (b) open.
22. **Two calendars**: the Budget app already has a cash calendar from its log
    (`src/calc/calendar.js`, with a day-by-day cash line and the lowest point).
    The new one is built from the household record and has no day line, because
    undated items cannot be placed honestly. After 21, one should go, or the log
    should feed the real dates into the spine calendar.
23. **The windfall order**: is `WINDFALL_ORDER` your order? "Cards charging
    interest" was added as a step beyond the four the brief named. Change the
    rule's value to reorder or drop a step.
24. **Windfall tax on 1099 money**: the tax step holds back marginal federal
    plus state only. Should it ask "is this self-employment income?" and add the
    self-employment rate?
25. **Roth room with unknown income**: while the year's tax cannot be figured,
    the Roth step cannot check the phase-out and marks the room rough. Keep, or
    take nothing until income is known?
26. **The $869 commit**: commit 452b444 carries a made-up $869 in its example
    text (replaced by b8ec54a). History was not rewritten. Scrub it or leave it?
27. **`slam/` and the freeze**: the repository CLAUDE.md lists `coach/`,
    `marketing/` and `money-rooms-v3/` as separate apps; `slam/` is not listed,
    though Phase 1 and 2 build pages inside it. Add the one line?
28. **Paychecks net of payroll saving**: the calendar shows a W-2 paycheck less
    its share of the 401(k) contribution (split across W-2 pay by gross). Right
    for your pay, and should tips get a share too?

Two smaller ones, not in `QUESTIONS.md`:

- The calendar's "Comes in" counts actual pay dates, so a biweekly month with
  three paychecks reads higher than the Dashboard's monthly rate (26 a year /
  12). The month-end cash uses the rate. Say so on the page (done), or make the
  projection use real pay dates too?
- Do you want the Dashboard to carry the next 30 days from the calendar as a
  tile (next paycheck, next bill, the big one coming), or keep the calendar on
  its own page?

## Answers recorded (2026-10-23, S-202)

Eli answered questions 21 to 28 the same day. They are recorded in
`QUESTIONS.md` and as S-202 in `DECISIONS.md`; nothing from them is built yet,
by Eli's instruction to wait for sign-off.

| # | Answer | What it means for the next build |
| --- | --- | --- |
| 21 | Feed | The spine is the source of truth, the Budget reads from it, and the Budget's transaction log supplies actuals back as Facts. |
| 22 | The spine calendar survives | The Budget calendar is to be retired; what that touches is listed below. Nothing removed yet. |
| 23 | The windfall order is right, cards included | An `employerMatch` step goes before `cards` whenever a paycheck has a match. The match is a text field today (`matchFormula`); the build needs it as numbers. |
| 24 | Yes | A 1099 windfall adds the self-employment rate to the tax step. |
| 25 | Cap at known earned income | The Roth step is capped at the year's known earned income and reads rough when that income is rough or missing. |
| 26 | Leave it | Commit 452b444 stays in history. |
| 27 | Yes | `slam/` is now in CLAUDE.md as a separate app. The line points at S-202 in SLAM's own log rather than a new root D-number, because root entry headings must carry an em dash by the root suite's own check and SLAM's style forbids one. Say the word if you want a root D-342 anyway. |
| 28 | Yes | Calendar paychecks stay net of payroll saving. |

## Open decisions and things I did not do

- The $869 commit stays in history (question 26).
- Nothing was merged to `main`; GitHub Pages still shows Phase 0 (the Budget).
- Phase 2 item 2 (Budget estimated vs actual) is not started; the feed model is decided (question 21).
- The repository `CLAUDE.md` gained the `slam/` exception line (question 27).

## Suggested next step

Answer 21 and 23. With 21 answered as (a), the next session can build
"estimated vs actual" on the Dashboard in one commit per screen: the spine's
expenses as the estimate column, the Budget's log actuals for the month beside
them, a gap per line, and the calendar fed with the log's real pay and bill
dates (which also settles 22). With 23 answered, the Windfall order is one
data edit. Then the Phase 1 questions that move numbers most (card minimums,
the rough W-2 figures) are still the biggest lever on the Dashboard.
