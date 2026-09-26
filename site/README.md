# The site (`site/`): Stress Less About Money

Eli's coaching site, and the public face of SPARKS for the FIRE community:
landing pages that send people to book a free call, the offers, Eli, and the
free tools (the calculator, how FIRE works, the glossary, the rooms) beside
them. Its own app in the `coach/` and `dnd/` pattern (D-339, SD-001):
nothing in `rooms/`, `shared/`, `engines/` or `data/` changes for it.

**The one thing to set:** `data/coach.json`, `bookingUrl`. Put the address
of your meetings page there (HubSpot Meetings, Calendly, anything) and every
"Book a free call" button on the site leads to it. The same file holds your
name, the offers and their prices (`null` reads "Price on the call"), and
the questions people ask first.

Open `site/index.html` served (`python3 -m http.server`, then
`http://localhost:8000/site/`). Published with the rest of the repo at
https://sapphirestoneage.github.io/Personalfinance/site/

## What is in here

| Path | What it is |
|---|---|
| `index.html` | The landing page: who it is for, the nine stops, the offers, Eli, the free tools, the questions (SD-007) |
| `coaching.html` | The services page: the free call, the three offers in full, the nine stops, between calls, the questions (SD-007) |
| `book.html` | Where every "Book a free call" lands: the outside booking link, what to bring, what happens after (SD-007) |
| `about.html` | Eli: why this exists, the rules he keeps, what coaching is not, the software (SD-006, SD-007) |
| `tools.html` | Free tools: the calculator, Learn, the glossary, the first round, then every room from the registry by question (SD-004, SD-007) |
| `number.html` | Your number: five boxes, six sizes, the years, the sensitivity table. `Fire.tiers` on a household built in memory (SD-002) |
| `learn.html` | How FIRE works on one page: the multiplication, the savings-rate table, the ladder, the six sizes, the words, the back half (SD-003) |
| `glossary.html` | `shared/glossary.json`, grouped and searchable (SD-005) |
| `data/coach.json` | The coach's details: brand, name, the booking link, the call, the offers, the questions. Edited by hand |
| `site.css` | The site's layer on `../shared/theme.css`: wider measure, the display serif for headings, the grids, the offers |
| `site.js` | The header with the booking button, the footer with the disclaimer, the call-to-action strip, `esc`, `readDollars`, the config loader |
| `test/run.js` | Node checks: policy line, no em dash, every link and anchor exists, no storage, no `|| 0`, one formula, the coach config, no email address, the log |
| `test/browser.js` | Chromium: every page at 390 and 1100 wide with a clean console, the offers and stops and questions fill, the calculator answers, the Book page says whether the link is set |
| `DECISIONS.md` | This lane's log, `SD-###` |

## The rules that carry over

No real financial data, ever. Empty is not zero (`Site.readDollars` returns
null for a blank box). Money in integer cents until display. No em dash. One
formula, one function: the site loads the SPARKS engines from `../engines`
and never restates a calculation. Nothing is stored: the site writes no
`slaf.` key, no cookie, nothing. No email address on the site; booking is
the one outside link, and nothing here posts anywhere.

## Working on it

- `node site/test/run.js` before every commit; `node site/test/browser.js`
  with the repo served on 8765 and playwright on `NODE_PATH`, as
  `test/render.js` runs.
- New decisions go in `site/DECISIONS.md` as the next `SD-###`.
- A new room appears on The rooms by itself (the registry is read live).
  A new question is one line in `tools.html`'s `QUESTIONS`; the test checks
  the id.
