# SLAM (Stress Less About Money)

Coach-operated financial planning software. A coach runs it live on a call with a
client, one household at a time, on a laptop or a phone.

The first tool is the **Budget**. It holds a client to their own words: they guess
first (the estimate), then we find the truth (the actual, and the plan for the month)
and measure how far off they were, and where. What they would like to spend (the
dream life, short and long term) lives in **Eras**, next to today.

Every later tool (FIRE, emergency fund, debt payoff, DRAFTT proportions) will read the
numbers the Budget collects, so the number store and the math library are built for
the whole suite.

## Run it locally

From this folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000/ in a browser. (Any static server works. There is
no build step.)

Click **Try with example numbers** on the Clients screen to load a demo household.
All demo households are made up.

## Run the tests

```
node --test
```

Run it from this folder. Needs Node 20 or newer. The math library runs in Node with no browser.

To also check that the screens show the same numbers as the hand-computed answers
(needs Playwright and the local server running on port 8765):

```
python3 -m http.server 8765 &
node tools/screens-check.mjs
```

## The monthly loop

Every month runs the same three steps, like an ice cream sandwich, and the menu follows them:

1. **Plan** (top cookie): before the month, make its plan on Plan, starting from last month's plan or the
   estimates. The client's original estimate is never overwritten.
2. **Track** (the ice cream): during the month, everything goes in one log on Track: quick entries (the
   Quick entry button, also on Today), scheduled bills and paychecks confirmed with one tap ("It
   happened"), and bank CSVs, which are matched against what was already logged so nothing counts twice.
3. **Review** (bottom cookie): at month-end most lines are already filled from the log; only the gaps
   need an answer. "Close month" opens a checklist, then saves the month in review: what went better
   than planned, what went worse, and how the budget ties to the cash (the bridge).

The log owns the money: a line with entries has its actual computed from them and is not typed over.
Today shows the three steps at the top (the one for now highlighted), and a 30-day cash strip (lowest
point, and safe to spend: what can go out today without any day ahead dropping under the cushion).
Riley's demo is a full year of the loop.

## Bank and card files

Track imports CSV files exported from Chase (credit card or checking),
American Express, Capital One, or any file with date, description, and amount
columns. Nothing leaves the browser. Each file goes into an account; its rows are matched
against the log first. The Jordan demo comes with two sample files; Riley's year has five.
`node tools/riley.mjs` rebuilds Riley's year and files (fixed seed); `node tools/dana.mjs` rebuilds Dana's.

## Phase 1: the household spine (Ledger and Dashboard)

Two pages beside the Budget, built on one household record (the spine) and
pure engines. Start the server as above, then open:

- http://localhost:8000/ledger.html : every field, grouped Debt, Assets,
  Income, Taxes, Expenses. Green is known, yellow is rough, red is missing.
  Tap a field to edit it, confirm it, or mark it not for me. Undo and Redo
  (or Ctrl+Z, Ctrl+Shift+Z) work for every edit. "Still guessing" at the top
  lists every rough and missing field, the ones that move the results most first.
- http://localhost:8000/dashboard.html : net worth, cash runway (with the
  Roth basis backstop on its own line), surplus, savings rate, cards and the
  promo deadline, FI number and percent, the year's tax balance due, and the
  flags. Every number has a Show the math button: the formula, the numbers
  plugged in, and every input as a link.
- http://localhost:8000/math.html : how every number is figured, built from
  the engines when the page loads, with every rule and its source.

### Loading your own profile

Every page's header says whose numbers they are (S-228). The made-up demo
says "Example household" with a Load my file button: pick your file and it
is read in the browser and saved in this browser only (nothing is uploaded),
and every page opens to it from then on. This works in a published page too.

On your own machine you can instead:

1. Copy your profile file to `slam/fixtures/eli.local.json` (any name ending
   in `.local.json` in that folder is ignored by git; the pages look for
   this exact name).
2. Serve the folder and open the Ledger. The header shows your name.
   Without the file the pages load the made-up demo household
   (`fixtures/demo.json`).
3. Edits are saved in this browser only. "Go back to the file" at the bottom
   of the Ledger drops them. The file itself is never rewritten.

The file can be a profile (the shape of `eli.profile.json`, version 3, 4, 5
or later), a spine (`slam-spine/1`, the shape of `fixtures/demo.json`) or the
Plan page's export. One loader reads them all (`engine/normalize.js
readHousehold`): a field it cannot use reads missing and is listed at the top
of the Ledger with what was wrong; nothing crashes a page.

### Design and sign-off

- `DESIGN.md`: the visual design rules (layout, color, charts, phone width); the affordance rules are in the repository's CLAUDE.md.
- `affordances.html`: every component in every state.
- `SIGNOFF.md`: the hand-check list for Phase 1 with phone-width screenshots of the demo household.

## Phase 2: the calendar and the Windfall room

Two more pages on the same spine and engines (branch `claude/slam-phase-2`,
report in `docs/PHASE2_REPORT.md`):

- http://localhost:8000/calendar.html : the month's money on the days it
  moves. Paychecks on their pay dates, bills on the day they are paid, minimums
  on their due days, subscriptions on the day they charge, promo rates ending,
  tax dates, and anything starting or ending. Items with no day yet are
  listed under "sometime this month". Month-end cash comes from the
  projection. Enter pay days and bill days in the Ledger to fill it in.
- http://localhost:8000/windfall.html : type a lump sum, say whether tax is
  still owed on it, and see where it goes in the house order (the
  `WINDFALL_ORDER` rule): tax on it, the year's tax bill, cash up to the
  stage 1 floor, promo balances the surplus cannot clear in time, cards
  charging interest, the Rule of 5 cushion, this year's Roth IRA room, then
  what is left. Every step has Show the math and a Ledger link. Nothing is
  written to the household.

In the Ledger, an income stream now shows how much, how often, since when,
until when and the day it is paid on one row, edited in one panel; an
expense's panel has start and end dates under "When does it run?".

### The day-by-day simulation (Batch A, S-203)

The calendar's cash line and month-end checking balance come from a day-by-day
run of the cashflow v44 engine, which Money Rooms v3 already ports
(`money-rooms-v3/engine/cashcal.js`). SLAM does not rewrite it: `engine/vendor/`
holds a byte copy with a drift test, and `engine/cashsim.js` is the adapter
that builds the engine's model from the spine and reads the run back as numbers
with a kind. The parity matrix for the whole calendar is
`docs/CALENDAR_PARITY.md`.

### The calendar views (Batch B, S-204)

One time selector (1, 3, 6 or 12 months; 12 is the year) sits over the
calendar and, from Batch E, the budget. The calendar page has tabs, every one a
reading of the same day-by-day run: the month grid with running checking and
debt in each cell, the weeks (in, out, ending balance), the next 14 days, each
paycheck with what it covers and what is left (a bonus chip on the third
biweekly or fifth weekly paycheck of a month, and what it could do), and the
year strip with tight months flagged. A paycheck shows what lands; the gross
and what came off fold out. Drag an item's grip to another day, or open it and
press Move; skip it once, re-price it this time, lock it. Maybe money waits in
a tray until it has a day. Milestones (a card cleared, debt free, a promo
ending) sit on their days and on a timeline. Search finds any item. Edits save
in this browser like the Ledger's, with Undo. `engine/calendar-views.js` holds
the readings; `ui/window.js` the selector; `ui/calendar.js` only formats.

### The Debt tab (Batch C, S-205)

A Debt tab on the calendar page, every number from the same run
(`engine/debtview.js`): the four clear dates, a payoff Gantt, the payoff order
with the interest each debt costs, card interest month by month stacked by
card, why a card is stuck, a target solver ("clear the Visa by June": the
extra a month it takes and whether that breaks cash), the minimum-payment
trap, utilization as the bureaus will see it (the peak before each card's
report day), a balance transfer worked out, the annual fee against what the
card gives back, which card to use for a purchase today (rewards minus
interest, with the float days), a signup bonus with its deadline on the
calendar, and the billing cycle on every card tile. Federal student loans get
the income-driven payment and the forgiveness dates from the rules registry;
a rule that is not in the registry shows as a missing row, never a number.

### The Spending page (Batch D, S-206)

`spending.html` keeps the plan true: safe to spend today and a day; a
five-second logger (amount, a tag, where, paid with) that writes the spine's
spend log; budgets by tag with what is left, the pace and a running-hot chip;
the four burn tiers; where the money goes as a donut, with a cut simulator
that drops lines as a what-if and can aim the saving at the debt; a bill
autopsy ranked by yearly cost; "can I spend this" on the same day-by-day run
(yes, tight or no, the new low, hours of life); price increases and free
trials; a check-in that records real balances against the forecast and
re-anchors the household (drift, momentum, a staleness banner after ten
days); and the month-end sweep. The log is a record, never a formula.

### The feed and estimated vs actual (Batch E, S-207)

The spine feeds the Budget; the Budget's log and your statements feed the
spine's log back. On the Spending page, paste a statement (Chase, Amex,
Capital One, or date, description, amount) or read the Budget app's
households saved in this browser: each line is proposed as matched to a
planned line (within 2% and 5 days), recurring, new, already in, or skipped
(a card payment is not spending); nothing lands until you apply, and nothing
lands twice. Estimated vs actual then reads the plan against the log per line
and per tag over the window, income logged against planned, and the savings
rate from the real ledger; the Dashboard carries this month's reading.

### The Plan page (Batch F, S-208)

`plan.html` holds the longer view: the Financial Order of Operations as a
nine-rung ladder funded by the surplus with a completion month per rung (and
dashed plan chips on the calendar); the surplus run through the Windfall
order (one function, now with the employer match before the cards, the
self-employment tax on 1099 money and the Roth cap at earned income); the
paycheck allocator; the solvers (what savings rate, spending, income or
return reaches FI by an age); the real hourly wage and a toggle that shows
amounts as hours of life on the Spending page; DRAFTT as shares with a
housing reference and no verdict; the fixed floor and an income shock; goals
and sinking funds; the outlook over many runs; life-event templates; saved
scenarios with a diff; the undo history; export and import; and a printable
one-pager. Every page carries a skip link, an error banner, the build stamp,
and on a phone the Save row stays pinned.

### What the Budget calendar did, now in SLAM (Batch G, S-209)

Before retiring the Budget's calendar, a second audit read its code and
listed what it did; most of it is now on the SLAM pages. On the calendar:
Cash by day (a chart of checking, recorded before the as-of date and the run
after it, savings apart, the floor, paydays and big bills, with every day as
a list), the month in words (checking today, the lowest day and whether it is
the day before payday, days under the floor or topped up from the cushion),
"Scheduled, on or before today" with It happened and It did not happen, Back
to its day for a moved item, Redo, the happened count, every movement by date
with checking after it and where it came from, pay-later readings, card
interest on its day, bill timing with Save the new due day. What you log now
moves the cash line once: a happened item replaces its plan, a typed bill or
paycheck claims its own occurrence, everyday spending moves cash only past the
plan. Safe to spend is capped at the lowest point ahead. So far and expected
by month end are on Spending and the Dashboard. No balance never reads as $0.

The Budget's own calendar is retired (answer 39, Phase 2.5); what it did that
SLAM does not is listed in `docs/PHASE2_REPORT.md`, Known differences.

### How much to max it? (S-211)

Every tax-advantaged account in the Ledger (401(k), Roth 401(k), 403(b),
457(b), TSP, SIMPLE IRA, Solo 401(k), SEP IRA, traditional, Roth and spousal
IRAs, HSA, 529) has a "How much to max it?" button among its actions. It opens
a panel with each tax year still open: the year's limit plus the catch-up for
your age on December 31, less what is in for the year across every account
that shares the limit, is the room left. What is in is the account's
contributions by year (a small form in the panel records one), else its
monthly amount so far as a guess. Every amount is new money on top of what
already goes in: a lump sum today, a month to the deadline, and a paycheck on
the real pay dates before it; a 401(k) leads with the deferral to set a
paycheck, an IRA or HSA with the month. IRA room is capped at that year's
earned income (W-2, tips and 1099; unemployment does not count; under married
filing jointly, for the spouse who earns less, the couple's) and the Roth
phase-out; while earned income is missing it reads "missing: 2026 earned
income", never a number. Conversions and rollovers never count. From January 1
to April 15 the two tax years sit side by side. The new money runs through the
day-by-day cash run: whether the cash floor breaks, how much comes out of the
cushion, and whether a card or loan payoff date moves. The deadlines are rules
in `data/rules-2026.json` (not yet checked against the IRS) and show on the
calendar as chips. The Plan page has one card for every account, and the FOO
ladder's Roth and HSA rung and retirement rung read the same numbers, as does
the Windfall's Roth step. In a household of two, a pay line says whose pay it
is.

### Where things are

| Path | What it is |
| --- | --- |
| `data/rules-2026.json` | every limit, bracket, rate and threshold, with source and a verified word |
| `engine/` | pure engines: rules, schema, cashflow, tax, projection, fi, debt, emergency, networth, flags, summary, ledger, edits, calendar, calendar-views, cashsim (over `vendor/`), debtview, spending, feed, compare, plan, windfall |
| `ui/` | the Ledger, Dashboard, Calendar (with its Debt tab), Spending, Plan, Windfall and one-pager views (formatting only) |
| `fixtures/` | `demo.json` (made up) and your `*.local.json` (never committed) |
| `CONTRACTS.md` | the spine shape and every engine signature |
| `BOARD.md`, `QUESTIONS.md` | what is done and next; open questions for Eli |

`node --test` runs the spine tests with the rest; `test/eli.golden.test.js`
reads its expected values from `fixtures/eli.golden.local.json` (also
gitignored) and skips itself when either file is not there.

## Folder layout

| Folder | What lives there |
| --- | --- |
| `src/store/` | number store: schema, validation, migrations, save and load, client list, export and import, undo and redo, month close |
| `src/calc/` | pure math functions. Every number on every screen comes from here |
| `src/ui/` | the screens (`nav.js` maps where everything lives), components, SVG charts, and `tokens.css` (every color and font) |
| `data/` | reference tables (tax constants, averages, the 50/30/20 and housing reference lines, merchant rules), each with source and year |
| `test/` | unit tests, plus `test/households/` with synthetic households and hand-computed expected answers |

## The screens

The menu follows the monthly loop (S-106). Every section lives in exactly one place. On a phone the
bottom bar has Today, Plan, Track, Review, and More (Insights, Setup, Clients).

1. **Today**: numbers, not charts. Plan, Track, Review for the month (the step for now highlighted),
   the first-session checklist until it is done, the Next card, the next 30 days of cash (today, the
   lowest point, safe to spend) with Quick entry, four headline numbers (take-home, spending, surplus,
   savings rate), and a link to each chart tab: every chart is one tap away.
2. **Plan**: the gut number (first for a new client, then one line), the start of the month, next
   month's plan (income first: scheduled pay from the month's real paydays, side income changeable for
   the month; then line by line, with % of income, % of spending, and happiness), and Your estimates
   (the Rough pass).
3. **Track**: weekly use, no setup. Scheduled items to confirm, Quick entry, the log for the month,
   the cash calendar, CSV import and matching, and checking a balance.
4. **Review**: fill gaps (income first, from the log; then spending lines still empty), close the month
   (the checklist, with the bridge in one line), mistakes this month, and past months (each closed
   month's saved review, income rows first, and its lines, with late entries). The surplus uses the
   month's actual income when the log has it, else take-home ("income not tracked this month").
5. **Insights**: read only. Every chart and lens once, in six tabs: Where it goes, Compared (estimate
   vs actual vs plan, accuracy, gut check, culprits), Over time (trends, months, 80/20), Cash (the
   bridge, the forecast check, merchants and habits), Net worth (below), and You (DRAFTT, joy,
   satisfaction and stress, mistakes, the income statement). The only inputs are range, focus, unit,
   and month pickers.
6. **Setup**: one-time setup in short sections: Basics, Health coverage (every coverage fact, in one
   place; other screens show one line with a link), Income and paychecks, Accounts, Debts (a loan can
   be paid by a budget line; cards get computed interest), Bills and due dates, Categories and lines,
   Tags, Cushion and coach settings, Coach notes, and Future tools (parked).
7. **Clients** (open it from the client name): client list, new client, open, export, import (a file
   for a client already here is merged record by record; changes made on both copies wait for the
   coach to pick), and the demo households.

**Net worth (the balance sheet).** Every account sits on one balance sheet: cash, cards, investments,
retirement, and things you own (a home, a vehicle), each with dated balances. Setup, Accounts lists them
by type with the latest balance and its date; Review's checklist asks for every month-end balance (cash
and cards required, the rest optional and marked stale). Two net worths: **Net worth (everything)**, and
**FI net worth (what can fund your life)**, which leaves out a home or car and the debt it secures; the
difference is **Locked in things you use**. Insights, Net worth shows both over time, what you have and
owe by month, what it is made of (by type and by how fast it becomes cash), the net worth bridge for any
month (surplus, timing, saved, debt paid down, market, values: it ties to the balances, and anything
not explained is drawn apart), what each home and vehicle costs to hold next to its alternative (rent;
rideshare, transit, a rental), with no verdict, and milestones (like FI net worth crossing $0, which
also gets a card in that month's review). Contributions are never typed: they come from transfers in the
log and paycheck deductions linked to an account. A yearly bill paid for months to come is **Paid ahead**:
an asset (not FI) that runs down by its monthly share, so net worth does not drop the month it is paid
(cash shows the payment; net worth shows the cost as it is used). Dana's demo owns a condo; Riley's has
a 401(k), a Roth IRA, and a car with a loan paid by his Car payment line.

**Finding things.** Type in the search box (or press "/") to find a line, category, merchant, entry,
net worth number, account (with its latest balance), debt, chart, setting, or month and jump to it. A dotted number is a link: it opens where the
number comes from, or, for a computed number, how it was worked out. The breadcrumb under the header
says where you are.

**Future tools (parked).** The dream life, Eras, and Next stage answer "what could life look like".
They are off by default. Turn them on in Setup, Future tools (parked), and a Future screen appears
with them exactly as they were. Old addresses (`#budget`, `#fill`, `#analyze`) open Today, Plan, and
Insights.

## Shared-version groundwork

Every record has an id, timestamps, author, and version; nothing is hard-deleted;
storage goes through one async interface (`src/store/storage.js`); who sees what is
one map (`src/store/visibility.js`). **View as client** in the header shows what the
client would see. See HOSTING.md for what a hosted version would add.

## House rules

- Read `LESSONS.md` before changing anything.
- Decisions go in `DECISIONS.md`. Ideas that are out of scope go in `PARKING_LOT.md`.
- No em dashes in copy or docs.

## Estimates are never overwritten

The estimate is the client's own words; estimate vs actual measures how well they knew themselves. The app never writes over it. Adjustments (last month's actual, the personal correction, decisions in review) go into a monthly plan (`doc.plans`), which the table in Insights, Compared shows as its own Plan column with actual vs plan gaps.

## How easy is it? (tools, S-109)

- `node tools/journeys.mjs` walks four journeys on a phone and a desktop and counts the taps: a first
  session (under 60), a month (under 120, each quick entry 6 or fewer), six questions from Today (the
  sixth, "what's my FI net worth", in 2), and month-end balances for 5 accounts (under 20).
  It checks every number at the end against numbers worked out by hand. The latest table is in AUDIT.md.
- `node tools/layout-check.mjs` (it also runs at the end of `tools/screens-check.mjs`) fails when a
  screen is taller than 6 phone screens (Review's fill gaps: 2 for Riley), a heading appears twice, an
  input sits in Insights, a setup input sits on Track, or a screen has more than 12 sections.
- `node tools/gallery.mjs` takes every screen and Insights tab (Net worth included), phone and desktop, light and dark, for
  Riley and Maya, and writes `tools/gallery/gallery.html`. Open it in a browser and scroll: one
  screenshot per screen, like a slide deck, each with a caption.

**How to approve the gallery.** The approved screenshots live in `tools/gallery-approved/`. After a
change, run `node tools/gallery.mjs`: anything that looks different from the approved set is saved in
`tools/gallery/` and marked "Changed since approved" in red. Look at each one. If it is right, run
`node tools/gallery.mjs --approve` and commit `tools/gallery-approved/`. If not, fix it first.

## The 5-task test

Hand this to a real person (not the coach who built the budget). Open Riley's demo (Clients, "Riley,
31"), go to Today, and read each task out loud. Do not explain the screens. Time each task and write
down every pause or wrong turn.

1. Log a $12 lunch.
2. How much is safe to spend right now?
3. Why did cash drop last month?
4. What went over plan last month?
5. Start closing the month.

| Task | Time (seconds) | Hesitations or wrong turns | Done? |
| --- | --- | --- | --- |
| 1. Log a $12 lunch | | | |
| 2. Safe to spend | | | |
| 3. Why cash dropped last month | | | |
| 4. What went over plan last month | | | |
| 5. Start closing the month | | | |

The tap counts for the same five tasks are in AUDIT.md (the journeys); this test is for what taps
cannot show: where a person looks first, and what they expect a word to mean.
