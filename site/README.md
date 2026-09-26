# The community front (`site/`)

The public face of SPARKS for the FIRE community: what it is, how FIRE works,
a number to try, every room by the question it answers, the dictionary, and
the rules. Its own app in the `coach/` and `dnd/` pattern (D-339, SD-001):
nothing in `rooms/`, `shared/`, `engines/` or `data/` changes for it.

Open `site/index.html` served (`python3 -m http.server`, then
`http://localhost:8000/site/`). Published with the rest of the repo at
https://sapphirestoneage.github.io/Personalfinance/site/

## What is in here

| Path | What it is |
|---|---|
| `index.html` | Home: the three doors, what it is, how it goes, the rules, for coaches |
| `number.html` | Your number: five boxes, six sizes, the years, the sensitivity table. `Fire.tiers` on a household built in memory (SD-002) |
| `learn.html` | How FIRE works on one page: the multiplication, the savings-rate table, the ladder, the six sizes, the words, the back half (SD-003) |
| `tools.html` | Every room from the registry, plus sixteen questions (SD-004) |
| `glossary.html` | `shared/glossary.json`, grouped and searchable (SD-005) |
| `about.html` | The rules, the limits, the three apps, how to help (SD-006) |
| `site.css` | The site's layer on `../shared/theme.css`: wider measure, the display serif for headings, the grids |
| `site.js` | The header, the footer, `esc`, `readDollars` |
| `test/run.js` | Node checks: policy line, no em dash, every link and anchor exists, no storage, no `|| 0`, one formula, the log |
| `test/browser.js` | Chromium: every page at 390 and 1100 wide with a clean console, the tables fill, the calculator answers |
| `DECISIONS.md` | This lane's log, `SD-###` |

## The rules that carry over

No real financial data, ever. Empty is not zero (`Site.readDollars` returns
null for a blank box). Money in integer cents until display. No em dash. One
formula, one function: the site loads the SPARKS engines from `../engines`
and never restates a calculation. Nothing is stored: the site writes no
`slaf.` key, no cookie, nothing.

## Working on it

- `node site/test/run.js` before every commit; `node site/test/browser.js`
  with the repo served on 8765 and playwright on `NODE_PATH`, as
  `test/render.js` runs.
- New decisions go in `site/DECISIONS.md` as the next `SD-###`.
- A new room appears on The rooms by itself (the registry is read live).
  A new question is one line in `tools.html`'s `QUESTIONS`; the test checks
  the id.
