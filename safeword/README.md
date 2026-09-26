# Safeword

Money for kink, sex work and the domme's house: a planner for a life most
planners pretend does not exist. Its own app, built beside Money Rooms
(SPARKS) the way `coach/` and `dnd/` are: nothing in `rooms/`, `shared/`,
`engines/` or `data/` changes for it, and nothing in SPARKS depends on it.

Two layers in one folder. The **site** (SF-011) sells the coaching: a landing
page, three audience pages, the offers, the guides, the booking page, all drawn
from `data/site.json`. The **planner** is the free tool behind it: ten screens
that keep every number in the visitor's browser.

Open `safeword/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/safeword/`). On the planner, "Try with example numbers"
loads Vesper, an invented pro domme; every figure in the example is made up.

## Changing the site (no code)

Everything a visitor reads about Eli, the prices, the guarantee, the capacity
line, the questions and the booking link live in **`data/site.json`**. Edit
that file and every page follows. Three things to do first:

1. `bookingUrl`: paste a scheduling link (Calendly, Google appointment
   schedule, HubSpot meetings). Until then "Book" opens an email. Set
   `embedBooking` to `true` to show the calendar inside the booking page.
2. `offers[].priceCents`: the session and house prices were set from the
   $300-an-hour figure in the existing offer document; change them freely.
3. `testimonials`: paste real client quotes as `{ "quote": "...", "who": "..." }`.
   The section stays hidden while the list is empty.

## What is in here

| Path | What it is |
|---|---|
| `index.html` | The landing page: who it is for, why the usual advice fails, the method, the offers, the free tools |
| `for-dommes.html`, `for-creators.html`, `for-houses.html` | One landing page an audience: the pains, what a session looks like, the offers, the guides |
| `services.html` | The three offers in full, the guarantee, the method, how booking works, the questions |
| `about.html` | Eli: the bio, the stance, how he works |
| `resources.html` | Six printable guides: the 48-hour list, the tax jar, the tribute protocol, the eight papers, what to ask a bank, the first $1,000 |
| `book.html` | Pick an offer, book (a scheduling link, or an email with the offer in the subject) |
| `site.js`, `site.css`, `data/site.json`, `og.svg` | The site's chrome, its look, its every word, its share image |
| `tools.html` | The planner's home: the three ways in, how far the plan is, backup and wipe |
| `streams.html` | Every way you earn: the typical and low month, the cuts, the cash share, where it lands |
| `house.html` | What the practice costs to run: fixed against variable, what a return usually carries, break-even |
| `taxes.html` | The jar (of every $100 from the work, how much to set aside) and the four estimated payments |
| `fund.html` | The safeword: the fund sized for this life, how far along, how long it carries you |
| `rails.html` | Where the money sits and moves, how each place can fail, five checks |
| `longgame.html` | Retiring without a boss: the account's room, the path, the number, the exit cushion |
| `dynamic.html` | House rules: the split of the shared month, and five guardrails on money inside the dynamic |
| `family.html` | Chosen family: the eight papers that put your people on the list |
| `play.html` | The life: what the scene costs to live, by the year |
| `plan.html` | The plan: the split of every dollar that lands, printable |
| `common.js`, `safeword.css` | The header, the strip, the "?", the money boxes; the look |
| `shared/model.js`, `shared/store.js`, `shared/demo.js` | Every stored shape; the one key; the example |
| `shared/charts.js`, `shared/tables.js` | Every picture; the table loader |
| `engines/*.js` | One pure module a page (`streams`, `house`, `taxplan`, `fund`, `rails`, `longgame`, `dynamic`, `family`, `play`, `plan`) |
| `data/*.json` | The app's own tables (stream, cost, rail and play kinds; papers; protocol rules; the words) and the SPARKS tables it carries |
| `tools/vendor.js` | The SPARKS files carried as byte-identical copies |
| `test/run.js`, `test/browser.js` | The tests (node only; the phone walk in Chromium), both in CI |
| `DECISIONS.md`, `STATUS.md` | This lane's log (`SF-###`) and where it stands |

## The rules that carry over from SPARKS

No real financial data, ever (the tests fail if a tracked file carries a
backup export). Empty is not zero. Money in integer cents. No em dashes.
One formula, one function: a figure SPARKS computes (self-employment tax,
the brackets, growth) is read from a vendored copy, never rewritten;
`node safeword/tools/vendor.js` refreshes the copies, `--check` says when
SPARKS has moved. Every table names its year and how sure it is.

## Working on it

- `node safeword/test/run.js` before every commit; `node safeword/test/browser.js`
  with a server on 8765 and playwright on `NODE_PATH` for any page change.
- New decisions go in `safeword/DECISIONS.md` as the next `SF-###`, not in the
  SPARKS log.
- A page owns its fields; a number owned elsewhere is shown as a link to the
  page that owns it, never typed twice.
