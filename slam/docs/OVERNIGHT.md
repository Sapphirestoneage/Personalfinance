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

## Round 2

**Before.** qa-crawl PASS (151 screens x 3 looks, 333 taps; reported: 1 dead click, 399 small taps; cents, raw
dates and typed-looking placeholders now 0). agree-check PASS. Suites 1,066; root 35,911. Reviewer: 8 high, 18 medium,
4 low (round-2/findings.md), down from 14 high.

**Fixed.**
- 2 (high, a clear bug, with a test): the Plan's low-interest step counted the Store card's $1,200 at its 0% intro
  rate, which the high-interest step already counts by its rate after: $21,200 is now $20,000, and steps 3 and 9 add to
  the debt total.
- 7 (high, with a test): Saved scenarios projected without investing the surplus, the FI chart with it, so net worth
  read below invested money; both now read one projection.
- 1 (high): Session Needs did not show the household's "Miscellaneous" line (named like the section, with lines of
  its own beside it), so $274 was in the total and on no row; it now has its own row.
- 4 (high): the Calendar's "Plan: $712 to high-interest debt" says "(a suggestion, not in the cash line)".
- 5 (high): the order table's column reads "Interest, next 12 months", so it no longer reads as part of the monthly
  plan's total under it.
- 8 (high): What it takes asks for an age before answering (no "0.0% needed" for an age nobody typed); the curve's
  target dot shows only for a typed age (QUESTIONS 160).
- 3: Paychecks says the last paycheck shown counts no bills after the three months; the stray space before the
  separator is gone.
- 9, 13: the payoff order says why a promo card with deferred interest comes first; the clear dates say "after the
  12-month run" with the monthly plan below for the months.
- 10: a debt wears one color on every chart (its place in the household's list).
- 18: a card on an intro rate says "Intro 0% until Feb 28, 2027, then 29.99%" on Bills worth a call.
- 20: a goal with nothing set aside says "none yet", not a blank.
- 25: the One-pager's Debt card says "With $712 a month extra at the debt, in this order".
- 28: Save as a scenario is disabled at all zero, with the reason under it.
- From qa-crawl: "Add the note" on an empty box says to type one (it was a dead click).

**To QUESTIONS.** 6 (159), 8 (160).

**Left, with reason.** 11 (the order table scrolls sideways inside its box at 390, by design), 12 (forgiveness words
on a standard plan: engine), 14 (which run each Debt block uses: QUESTIONS 155), 15 and 16 (the move-money line on four
screens and the Spending form: each is that screen's job), 17 (Session transport lines), 19 (the Plan's steps that run
together), 21 (FI numbers), 22 (a payday and a big bill on the same day show the payday dot), 23 ($686 in the month
against $712 a month: the calendar month counts what others owe back), 24 (the Rough chip on Today), 26 (the small-tap
count), 27 (an icon on the empty state), 29 (the FI charts on two screens: two ways in, on purpose), 30 ($228 to cover
$227: rounded up on purpose).

**After.** Suites 1,068 pass; root 35,911.

## Round 3

**Before.** qa-crawl PASS (151 x 3, 333 taps; no dead clicks; 399 small taps reported). agree-check PASS. Suites
1,068; root 35,911. Reviewer: 9 high, 17 medium, 6 low (round-3/findings.md). Most highs are the two-runs questions
already in QUESTIONS (154, 155) seen from new angles, plus a few new ones.

**Fixed.**
- 6 (high): the savings rate said "of take-home" beside a take-home that gives a different rate; it now says "of pay
  after tax" (the One-pager adds "with what goes from pay to saving"), which is the base the rate uses.
- 7 (high): Session Needs says "Shared bills count your part in the total: Streaming (family plan) $14 of $40", so
  the lines add to the header.
- 8 (high): a goal with no set-aside says when the Plan's step puts it ("the Plan's step 8 puts it about Jan 2031").
- 4 (high): the Payoff dates line says "Debt free about Nov 2028" (the monthly plan) instead of "past Oct 2027" (the
  end of the 12-month run), and the clear dates say the run ends Oct 2027 and the rest comes later.
- 2 (high): the order table says its interest column is the next 12 months day by day with new charges and the total
  is the monthly plan without them, so the two are not meant to add up.
- 5 (high): Paychecks says the Plan's $712 is the month as a whole and a paycheck sends more or less as bills fall.
- 9 (high): the Calendar's Plan suggestion says to check the lowest day first.
- 3 (high, part): Bills worth a call says the Store card's cost after its intro as a month, not "$360 a year" (which
  read as the deferred lump); the run charging the lump is QUESTIONS 161.
- 10: Session's Assets line says "plus $176 owed to you". 11: the savings curve's dot is named "your saving plus what
  is left over, 23.3% of gross pay (not the savings rate on Today)". 13: the self-reference on What it takes is gone.
  18: Paychecks no longer gives its own shortfall figure; it points to the Calendar's lowest day. 24: "Call script"
  has a chevron and the link color. 26: What if's row reads "Debt free (all extra at the debt)". 30: the One-pager
  lists what is left last.

**To QUESTIONS.** 1 (162), 3 (161).

**Left, with reason.** 12 (FI numbers, as before), 14 and 16 (the Debt screen's length and its older interest chart:
a day session should fold its tools and move that chart to the shared module), 15 (forgiveness words: engine), 17,
22, 23 (as before), 19 (the Plan's steps that share the surplus: the step words come from the ladder; worth a day
session), 20 and 21 (Session controls), 25 (two completeness counts: as round 1, 17), 27 and 28 (tool scope: small taps
and more metrics; recorded for the day), 29, 31, 32 (as before).

**After.** Suites 1,068; root 35,911.

