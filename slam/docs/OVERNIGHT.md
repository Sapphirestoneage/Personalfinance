# Overnight loop (Part 3)

Each round: qa-crawl, agree-check, screen-budget and the full suites; every client screen at 390px light and 1024px
dark (docs/overnight/round-N/); one fresh-eyes reviewer given only docs/REVIEW_KIT.md, docs/FEATURES.md, the
screenshots and the reports, who writes round-N/findings.md; then low and medium findings fixed, high ones only when
they are clear bugs with a test. Money logic, stored shapes and removals go to QUESTIONS.md instead. Stop when no high
or medium findings remain, after two rounds in a row that change little, or after five rounds.

## Round 1

**Before.** qa-crawl PASS (151 screens x 3 looks, 330 taps; reported, not blocking: 3 cents, 6 placeholders that look
typed, 3 raw dates, 429 small taps). agree-check PASS (21 metrics). Suites: 1,066 pass; root 35,911. Reviewer:
14 high, 13 medium, 3 low (round-1/findings.md), most of the highs about two screens showing different numbers for
what reads as the same thing.

**Fixed (by finding number).**
- 2: "Cash after card debt" took away every debt, not only cards; renamed "Reachable after all debts" everywhere
  (the formula is unchanged and already said so).
- 3: a card's "Balance" on Debt was where the day-by-day run leaves it; it now shows "Balance today" (the figure every
  screen uses) and "At the end of the run" or "Clears" as its own row.
- 1: My numbers' Assets line now says "plus $176 owed to you", so Assets less Debt visibly makes net worth.
- 6: What if read the household without the picked assumption set, so its FI year was 2048 against 2046 elsewhere; it
  now reads the same set (a saved scenario still keeps the plain household). The savings curve leads with the
  projection's years and names its own point as the simple math.
- 7: Today's savings rate is shown to one decimal (15.4%), as on the One-pager.
- 8: Paychecks says what checking must already hold and, when checking holds less, how short it comes up; it no
  longer claims to agree with the Calendar's day-by-day low point.
- 9: the cash line's summary says the cushion money is already in the line where it covers the low point; the grid's
  tag reads "lowest this month".
- 10: the paycheck chart says its last bar "lands in your account", not "take-home".
- 11, 29: rates show to two decimals (29.99%) on Bills worth a call; a card's intro date reads "Feb 2027", not
  "2027-02"; card use shows one precision.
- 13: Subscriptions and its audit are never a dead end: bills that look like subscriptions (Streaming, Gym) each have
  "Make it a subscription", and a row opens every bill.
- 14: What it takes says when no age was typed (the default) and writes amounts as $1,512; when nothing more needs
  saving it says so in words instead of "save 0 dollars".
- 15: the phone Debt screen was 670px wide (a chart inside an open fold widened the fold); folds now hold their width.
  qa-crawl now opens the chart folds, so this is caught next time.
- 16: when every payoff order ties, one sentence says there is nothing to choose; the identical cards and the chart of
  three overlapping lines are left out.
- 19: the due-day boxes on Session say "Due day".
- 20: the move-money fix is one style (a plain small button) on Today, Spending, Plan and the Calendar.
- 21: Bills worth a call is ranked by dollars a month at stake (the Visa's interest before the gym), with a test.
- 23: waterfall labels in whole dollars ("-$1,950", not "-$2k").
- 26: Saved scenarios says "None saved yet" when empty; every projected line is dashed.
- 30: the page name wraps to two lines on a phone instead of being cut off.
- Also from qa-crawl: whole dollars in a max-it step, check-in hints that do not look typed, the script fold 44px tall;
  and from the root suite, a token the shortcuts dialog used that does not exist.

**To QUESTIONS (money logic).** 4 (154 and 155), 5 (154), 12 (156), 22 (157), 27 (158).

**Left, with reason.** 17 and 18 (open-question counts and Rough marks read from different lists on different
screens): engine work, logged for the day. 24 (the Spending form open): it is that tab's one job (marked as the main
form). 25 (seven FI numbers on Goals): every one is asked for in the spec; a calmer layout is a day-session change (the "When you reach FI" charts row sits under them).
28 ($228 to cover -$227): the fix rounds up to whole dollars on purpose.

**After.** Suites 1,066 pass (the paycheck plan test grew); root 35,911.

