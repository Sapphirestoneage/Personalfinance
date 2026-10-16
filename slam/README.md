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

## Bank and card files

Fill in, pass 6 imports CSV files exported from Chase (credit card or checking),
American Express, Capital One, or any file with date, description, and amount
columns. Nothing leaves the browser. The Jordan demo comes with two sample files.

## Folder layout

| Folder | What lives there |
| --- | --- |
| `src/store/` | number store: schema, validation, migrations, save and load, client list, export and import, undo and redo, month close |
| `src/calc/` | pure math functions. Every number on every screen comes from here |
| `src/ui/` | the four screens, components, SVG charts, and `tokens.css` (every color and font) |
| `data/` | reference tables (tax constants, averages, the 50/30/20 and housing reference lines, merchant rules), each with source and year |
| `test/` | unit tests, plus `test/households/` with synthetic households and hand-computed expected answers |

## The four screens

1. **Clients**: client list, new client, open, export, import.
2. **Fill in**: guided passes (Gut, Basics, Rough, Dream, Actual, Transactions import and review).
3. **Budget**: the main view. Everything important without clicking.
4. **Analyze**: every chart and lens, each with a one-line reading, and **Review and plan**: a month's actuals next to next month's plan, line by line, with % of income, % of spending, and happiness. Adjust, keep, cut, or change each line, tick it off, and carry the plan into the next month. A Satisfaction and stress card (joy or purpose next to stress) says what to keep more of and what to look at first.

## House rules

- Read `LESSONS.md` before changing anything.
- Decisions go in `DECISIONS.md`. Ideas that are out of scope go in `PARKING_LOT.md`.
- No em dashes in copy or docs.

## Estimates are never overwritten

The estimate is the client's own words; estimate vs actual measures how well they knew themselves. The app never writes over it. Adjustments (last month's actual, the personal correction, decisions in review) go into a monthly plan (`doc.plans`), which the Budget table shows as its own Plan column with actual vs plan gaps.
