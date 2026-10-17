# SLAM (Stress Less About Money)

Coach-operated financial planning software. A coach runs it live on a call with a
client, one household at a time, on a laptop or a phone.

The first tool is the **Budget**. It holds a client to their own words: they guess
first (the estimate), say what they would like (the dream), then we find the truth
(the actual) and measure how far off they were, and where.

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

Every month runs the same three steps, like an ice cream sandwich:

1. **Plan** (top cookie): before the month, make its plan in Analyze, Review and plan, starting from last
   month's plan or the estimates. The client's original estimate is never overwritten.
2. **Track** (the ice cream): during the month, everything goes in one log in Fill in, Cash flow: quick
   entries (the Quick entry button on Budget), scheduled bills and paychecks confirmed with one tap
   ("It happened"), and bank CSVs, which are matched against what was already logged so nothing counts twice.
3. **Review** (bottom cookie): at month-end the Actual pass is already filled from the log; only the gaps
   need an answer. "Close month" opens a checklist, then saves the month in review: what went better
   than planned, what went worse, and how the budget ties to the cash (the bridge).

The log owns the money: a line with entries has its actual computed from them and is not typed over.
The Budget screen shows the three steps at the top, and a 30-day cash strip (lowest point, safe to spend
until payday). Riley's demo is a full year of the loop.

## Bank and card files

Fill in, pass 6 Cash flow imports CSV files exported from Chase (credit card or checking),
American Express, Capital One, or any file with date, description, and amount
columns. Nothing leaves the browser. Each file goes into an account; its rows are matched
against the log first. The Jordan demo comes with two sample files; Riley's year has five.
`node tools/riley.mjs` rebuilds Riley's year and files (fixed seed).

## Folder layout

| Folder | What lives there |
| --- | --- |
| `src/store/` | number store: schema, validation, migrations, save and load, client list, export and import, undo and redo, month close |
| `src/calc/` | pure math functions. Every number on every screen comes from here |
| `src/ui/` | the four screens, components, SVG charts, and `tokens.css` (every color and font) |
| `data/` | reference tables (tax constants, averages, the 50/30/20 and housing reference lines, merchant rules), each with source and year |
| `test/` | unit tests, plus `test/households/` with synthetic households and hand-computed expected answers |

## The four screens

Still four. The monthly loop lives inside them.

1. **Clients**: client list, new client, open, export, import (a file for a client already here is merged record by record; changes made on both copies wait for the coach to pick), and the demo households.
2. **Fill in**: guided passes (Gut, Basics, Rough, Dream, Actual, Cash flow, Next stage, Eras). Actual is
   "review and fill gaps": lines filled from the log are collapsed, empty lines come first. Cash flow holds
   accounts and month balances, paydays and bill dates, scheduled items waiting on "It happened", the log,
   possible matches to confirm, and CSV import.
3. **Budget**: the main view. Plan, Track, Review for the month at the top, the 30-day cash strip with Quick
   entry, the key numbers and charts, and Close month (with the month-end checklist and the review card).
4. **Analyze**: every chart and lens, each with a one-line reading. **Cash flow** (cash by day, the
   budget-to-cash bridge, pay-later flags, the month grid, this month so far, a due-day what-if),
   **Review and plan** (a month's actuals next to next month's plan, line by line), **Months** (any closed
   month's saved review, its bridge, estimate history, and 80/20), and **Trends** (by merchant, category or
   line, and period, plus one-line stats).

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

The estimate is the client's own words; estimate vs actual measures how well they knew themselves. The app never writes over it. Adjustments (last month's actual, the personal correction, decisions in review) go into a monthly plan (`doc.plans`), which the Budget table shows as its own Plan column with actual vs plan gaps.
