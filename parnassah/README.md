# Parnassah

The coach's own site: money coaching for the Modern Orthodox household, sold
around a set of free tools (tuition for every child, the Jewish year,
tzedakah, the simchas, a home within a walk of the shul, and what is left
once they are all paid). Its own app, built in parallel with
Money Rooms (SPARKS) the way `coach/` and `dnd/` are: nothing in `rooms/`,
`shared/`, `engines/` or `data/` changes for it, and nothing in SPARKS
depends on it.

Open `parnassah/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/parnassah/`). The example family carries invented
numbers only.

## The pages

| Page | What it does |
|---|---|
| `index.html` | The landing page: the hero, the squeeze, how coaching works, the offers, the tools, the coach |
| `coaching.html` | Who it is for, the three offers, the process, the questions people ask |
| `about.html` | The coach, in the coach's own words |
| `resources.html` | Every free tool, the checklists, Money Rooms |
| `book.html` | The free call: the booking link or the email from `data/site.json`, what to bring |
| `tools.html` | The household and the children (the only page that writes them); a tile a tool |
| `tuition.html` | Every child, every school year: this year, the peak, the lifetime, the mountain |
| `year.html` | Dues, holidays, the Shabbat table and camp on twelve months from Elul; the set-aside and the cushion |
| `tzedakah.html` | A tenth of what; owed, given, left, the pace; where it went; questions for your rav |
| `milestones.html` | Bar and bat mitzvahs, the year in Israel, weddings, support, aliyah, on a line of years |
| `home.html` | A house a month, its share of take-home alone and with tuition, the price that fits |
| `plan.html` | Take-home in, six lines out, what is left; the checklist; the tuition years and after |
| `guide.html` | The words, the checklists, the rules that change the arithmetic |

## What is in here

| Path | What it is |
|---|---|
| `common.js`, `parnassah.css` | The header, the field builder, help, chart frames, tooltips, the actions |
| `shared/store.js` | The one family, under `parnassah.household.v1`; the example family; backups |
| `shared/tables.js` | Loads `data/` |
| `shared/charts.js` | Every picture, as SVG from an engine's figures |
| `shared/money.js`, `shared/theme.css`, `shared/fonts.css` | Byte-identical copies of SPARKS (`tools/vendor.js`) |
| `engines/*.js` | Tuition, the year, tzedakah, milestones, the home, the picture: pure, a household in, a Result out |
| `data/*.json` | Every reference figure, dated and with a confidence; `help.json` is the plain words; `site.json` is every word of the selling pages, the offers, the prices and the booking link |
| `test/run.js` | The tests (`node parnassah/test/run.js`, also in CI) |
| `SPEC.md`, `DECISIONS.md`, `STATUS.md` | What it is; this lane's log (`PN-###`); where it stands |

## The rules that carry over from SPARKS

No real financial data, ever (the tests fail if a tracked file carries a
backup). Empty is not zero: a blank box is "not entered" and a figure that
needs it says so. Money in integer cents. No em dashes. One formula, one
function. Reference data in `data/`, never inlined. Nothing leaves the
device: no account, no server, no network request.

## Before it goes live

Open `data/site.json` and replace every `[edit: ...]` placeholder (the bio,
the community, the credentials, the prices), set `contact.bookingUrl` (a
Calendly or similar link) or `contact.email`, and drop a photo in the folder
and name it in `coach.photo`. `node parnassah/test/run.js` lists what is
still pending.

## Working on it

- `node parnassah/test/run.js` before every commit.
- New decisions go in `parnassah/DECISIONS.md` as the next `PN-###`.
- `node parnassah/tools/vendor.js --check` says when SPARKS has moved one of
  the carried files; the tests run it.
