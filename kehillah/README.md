# Kehillah

Stress Less About Money: Eli Saperstein's money-coaching site for queer
Jewish life. Four pages sell the coaching (Home, Work with me, About, Book);
eight free tools cover the costs a general budget forgets. Its own app, built beside Money Rooms (SPARKS) the way `dnd/`
and `coach/` are: nothing in `rooms/`, `shared/`, `engines/` or `data/`
changes for it, and nothing in SPARKS depends on it (D-340).

Open `kehillah/index.html` served (`python3 -m http.server`, then
`http://localhost:8000/kehillah/`). The example household is invented.

## The pages

| Page | What it does |
|---|---|
| `index.html` | Home, the landing page: the offer, who it is for, how it works, the services, the tools, a word from Eli, the questions, the call |
| `work-with-me.html` | The services, what a session is like (the nine stops), the price rule, the questions |
| `about.html` | Who Eli is and what he believes about money, from `data/practice.json` |
| `book.html` | The booking button when an address is set; what happens on the call; honest when it is not set yet |
| `year.html` | The Jewish year 5787 as a calendar of costs, the twelve months ahead, the monthly set-aside |
| `tzedakah.html` | A rate (a tenth, a fifth, your own), the target, the gifts, the ladder of giving |
| `chosen-family.html` | The ten papers that replace the law's defaults, by household shape, with a price; the leaving-safely cushion |
| `family.html` | Making a family: the path, one try and the one-time costs, what comes back, the month you get there |
| `care.html` | Gender-affirming care out of pocket once covered lines cap at the plan's maximum; the HSA; the name change |
| `gemach.html` | A Hebrew free loan beside a card and a bank loan; save it first; where to find one |
| `elul.html` | The accounting of the soul, for money: eight questions a year, four a month, in your words |
| `resources.html` | Four groups of doors, all free to knock on |

## What is in here

| Path | What it is |
|---|---|
| `kehillah.js`, `kehillah.css` | What every page shares: the header and nav, the demo strip, the bindings, the figure tiles, the words fold |
| `page-*.js` | One script a page; builds its boxes once and repaints its read-outs on change |
| `engines/timeline.js` | The one savings timeline every "there by" reads |
| `engines/year.js`, `tzedakah.js`, `protections.js`, `family.js`, `care.js`, `loan.js` | One pure reading a page |
| `shared/store.js` | The plan: one object under `kehillah.plan.v1`, every money field null until typed |
| `shared/demo.js` | The example household, Noa and Sam |
| `shared/tables.js` | Loads `data/` |
| `data/practice.json` | Every word about the practice: person, booking address, services, prices (null until set), the copy |
| `data/*.json` | Year-versioned reference tables, each with its source and its confidence note |
| `tools/og.js`, `og.png` | The link-preview picture, drawn from the practice file |
| `shared/money.js`, `shared/theme.css`, `shared/fonts.css`, `vendor/fonts/` | SPARKS files carried as byte-identical copies (`tools/vendor.js`) |
| `test/run.js` | The tests (`node kehillah/test/run.js`, also in CI) |
| `DECISIONS.md`, `STATUS.md` | This lane's log (`KD-###`) and where it stands |

## The rules that carry over from SPARKS

No real financial data, ever. Empty is not zero: a blank box is "not entered"
and every reading says so rather than showing a 0. Money is integer cents,
formatted only at display. One formula, one function: every date on every
page comes from `engines/timeline.js`. No em dashes. Reference figures live
in `data/`, never in a page. A container of typed boxes is built once (D-034).

## Working on it

- `node kehillah/test/run.js` before every commit; `node kehillah/tools/vendor.js --check` says when SPARKS has moved.
- New decisions go in `kehillah/DECISIONS.md` as the next `KD-###`.
- A new page needs a `LIVE-FORM: built once` note, a description, the link-preview tags, the header, the site foot, and a test line; a tool page also needs the words fold and the call to action.
- To go live for booking: set `booking.url` (a Calendly or HubSpot meetings link) and `booking.email` in `data/practice.json`; set a service's `priceCents` only if you want a price shown; add `person.photo` for the About page.
