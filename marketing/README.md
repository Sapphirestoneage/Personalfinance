# Marketing Scoreboard

What gets measured gets managed. A content log, a small CRM, and the numbers
between them: posts and their results, people and their touches, weekly
targets with pace, the funnel, and who to contact today. Its own app, built
beside Money Rooms the way `coach/` and `dnd/` are: nothing in `rooms/`,
`shared/`, `engines/` or `data/` changes for it, and nothing in SPARKS
depends on it.

Open `marketing/index.html` (served: `python3 -m http.server`, then
`http://localhost:8000/marketing/`). "Try with example data" loads twelve
weeks of made-up posts and people; "Clear them and start fresh" removes them.

## The three screens

| Screen | What it does |
|---|---|
| `index.html`, `board.js` | The Scoreboard: this week against the targets with pace, the period's numbers, reach-outs by lane (the Core Four, and referrals), the funnel and its worst step, week-by-week pictures, by channel and by topic, the best posts, who to contact today, the share report |
| `posts.html`, `posts.js` | The Content log: log a post (date, channel, format, topic, hook, the ask, minutes), type its results later (reach, likes, comments, shares, saves, clicks, DMs, follows, leads), sort, search, CSV in and out |
| `people.html`, `people.js` | People: the pipeline by stage, everyone with their last and next touch, the open person with their touches and a touch form, add and edit, CSV import (LinkedIn connections, Google Contacts, any sheet with a name column), CSV out |

## What is in here

| Path | What it is |
|---|---|
| `shared/mkt.js` | The store: posts, people, touches, settings (`mkt.` keys only). Save and load. The CSV column mapping |
| `engines/kpi.js` | Every reading (pure): the period, the funnel, weekly series, the scorecard and pace, the streak, when and how to contact someone |
| `shared/demo.js` | The example data, built relative to today, the same every time |
| `data/tables.json` | Channels, formats, asks, results, stages (with rhythm and how), touch kinds, lanes, outcomes, sources, targets |
| `data/help.json` | The plain words: every read-out, every field, the Words panel |
| `common.js`, `mkt.css` | What the three screens share: the header, help toggles, the chart frame, CSV out |
| `shared/charts.js` | The coach's chart module, carried as a byte-identical copy (`tools/vendor.js`) |
| `shared/csv.js`, `shared/money.js`, `shared/theme.css`, `shared/fonts.css` | SPARKS files, carried the same way |
| `test/run.js` | The tests (`node marketing/test/run.js`, also in CI) |
| `DECISIONS.md`, `STATUS.md` | This lane's log (`MD-###`) and where it stands |

## The rules that carry over from SPARKS

- **Empty is not zero.** A result nobody typed is blank; a rate with a blank
  in it is "not yet", never 0%. A typed zero is a zero.
- **No real data in the repository.** Contacts and results live in the
  owner's browser. The tests fail if a tracked file carries a Scoreboard
  export; `.gitignore` refuses the save files.
- **One formula, one function.** Every figure comes from `engines/kpi.js`.
  Money is integer cents. No em dashes.
- New decisions go in `marketing/DECISIONS.md` as the next `MD-###`.

## The measures, in one line each

- **Reach**, the platform's own count of how often a post was shown.
- **Engagement rate**, likes + comments + shares + saves, over reach.
- **Reach-outs**, outgoing touches, by lane: warm, cold, from content, paid, referral.
- **Conversations**, people who replied or reached out first, once each.
- **Leads, calls, clients**, stage changes in the period; a booked touch counts as a call.
- **Hours a lead**, minutes typed on posts, over leads.
- **Pace**, where a weekly number should be by today if the week ends on target.
- **Streak**, weeks in a row the posting target was hit.
- **Next touch**, the last touch plus the stage's rhythm (or the person's own, or a date you set).
