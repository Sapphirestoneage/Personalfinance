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
`node tools/riley.mjs` rebuilds Riley's year and files (fixed seed).

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

1. **Today**: Plan, Track, Review for the month (the step for now highlighted), the first-session
   checklist until it is done, the Next card, the next 30 days of cash with safe to spend and Quick
   entry, and four headline numbers (take-home, spending, surplus, savings rate).
2. **Plan**: the gut number (first for a new client, then one line), the start of the month, next
   month's plan (line by line, with % of income, % of spending, and happiness), and Your estimates
   (the Rough pass).
3. **Track**: weekly use, no setup. Scheduled items to confirm, Quick entry, the log for the month,
   the cash calendar, CSV import and matching, and checking a balance.
4. **Review**: fill gaps, close the month (the checklist, with the bridge in one line), mistakes this
   month, and past months (each closed month's saved review and its lines, with late entries).
5. **Insights**: read only. Every chart and lens once, in five tabs: Where it goes, Compared (estimate
   vs actual vs plan, accuracy, gut check, culprits), Over time (trends, months, 80/20), Cash (the
   bridge, the forecast check, merchants and habits), and You (DRAFTT, joy, satisfaction and stress,
   mistakes, the income statement). The only inputs are range, focus, and unit pickers.
6. **Setup**: one-time setup in short sections: Basics, Income and paychecks, Accounts, Debts, Bills
   and due dates, Categories and lines, Tags, Cushion and coach settings, Coach notes, and Future
   tools (parked).
7. **Clients** (open it from the client name): client list, new client, open, export, import (a file
   for a client already here is merged record by record; changes made on both copies wait for the
   coach to pick), and the demo households.

**Finding things.** Type in the search box (or press "/") to find a line, category, merchant, entry,
account, debt, chart, setting, or month and jump to it. A dotted number is a link: it opens where the
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
