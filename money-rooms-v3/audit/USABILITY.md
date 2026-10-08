# Usability pass: Don't Make Me Think (Level 14, MR-072)

The owner walked every screen and listed 35 fixes. This file is the record:
the screen, the problem, the change, and the before and after screenshots.
Before: `screenshots/level-before14/`. After: `screenshots/level-after14/`.
Both folders are written by `node tests/ui.js --shots before14` and
`--shots after14`; a file is named `<household>-<screen>-<view>-<width>.jpg`.

## A. Contradictions and trust

| # | Screen | Problem | Change |
|---|---|---|---|
| 1 | Session, Scoreboard, Levers, One page, Measure | Percent to FI counted net worth in some places and invested assets in others, with different labels | The default is invested assets (`data/assumptions.json`); every label says "of the FI number invested"; the levers test and the workpapers follow |
| 2 | Session | "No FI date yet" while the FI date tile showed Feb 2050 | The sentence reads the FI date's state; without a date it says the ranking is by money moved |
| 3 | Every screen, the demo | Two Mayas: a Bay Area household and the Jersey City discovery client | The Bay Area household is Leah Brennan, Oakland (`tests/households/leah.json`); Maya is only the Jersey City client; the demo loads Maya, More holds Leah |
| 4 | Sidebar | Two sections both headed READ | Six groups: Today, Clients, Call, Plan, Progress, Tools |
| 5 | Levers | Every spending line read "8.5 months per $100 a month", which ranked nothing | Ranked by a realistic move: the gap to her own target, the side income or a three percent raise, the standard shock for balances and rates; the per-$100 figure is one explanatory line; the ladder climbs smallest to largest with Coast as its own line |

## B. Home screens

| # | Screen | Problem | Change |
|---|---|---|---|
| 6 | Home (coach) | An orbit of circles, the household form and the engineering journal; nothing said what to do | Today: the next session with its date, a prep card (goal, open loops, homework, what is missing, her words), one "Start the call", the client list below; the picture is a small meter with a link; the journal lives on Clients |
| 7 | Home (client) | The same orbit, with rows and percentages | Three things: safe to spend today, the next win and when, the three steps; then one link each to the scoreboard and the one page |

## C. Navigation

| # | Screen | Problem | Change |
|---|---|---|---|
| 8 | Sidebar | 29 items in a flat list | Coach: six groups, 25 items; client: Home, Your progress, Your calendar, Your goals, Your one page. Progress is one place with four tabs over the old routes, which all still work |
| 9 | Sidebar | No way to jump | Type to jump to any screen, row type, number or calculator; slash focuses the box; results say where the thing lives |
| 10 | Every screen | No test that a screen names itself | The trunk test in `tests/ui.js`: a page name, a section on the body, and a lit nav item on every screen |

## D. Say it once, in plain words

| # | Screen | Problem | Change |
|---|---|---|---|
| 11 | Every number | "Owned minus owed", "When the portfolio could carry the household" and other variants | One coach label and one client label per number, mirrored into `data/glossary.json`; `tests/engine/glossary.test.js` keeps them equal and the variants out |
| 12 | Home, Measure, Levers, Calendar, Session | "Tap a planet to open it", "Every number opens its math", "235 re-runs, 1492 ms", the ranking formula | Removed; what a coach needs moved into the "?" help for that screen |
| 13 | Client view | A bare tilde on rough numbers | "about" in Client view through `engine/format.js setRough`; the coach keeps the tilde with a tooltip |
| 14 | Client view | Rows, facts in, confidence, source and state columns, "after session N", plates, leverage, guesses | Removed from every client screen (a guess reads as an average, rows as items, the confidence column is gone); `tests/ui.js` scans every client screen for the forbidden list |
| 15 | Every screen | "8 Oct 2026", "Oct 9", "17 Sep 2026" mixed | US order everywhere through `engine/format.js`; a test fails on day-first or ISO dates in rendered text |
| 16 | Goals, Session | "Already there, twice" then two sentences | "Your first two cushion steps are already covered", once |

## E. Choices and hierarchy

| # | Screen | Problem | Change |
|---|---|---|---|
| 17 | Session | Eight panels of equal weight and five header actions | The next question (big), the two meters, four tiles with the rest behind All numbers; Since last time, What you said, Follow-up email, Progress and Sessions as one tabbed side panel; one primary action plus More |
| 18 | Home, Session, Prepare, Program | "Run the call", "Run it", "Open the call", "Start session 1" | "Start the call" everywhere; the session number sits beside it |
| 19 | Clients | Eight buttons in a row | "Start a discovery call" and "Open a client"; the rest under More |
| 20 | Ledger | Seven things in one strip | One sentence, one Go button, a small "N left" link that opens the whole list |
| 21 | Call | Numbered segments and a second list underneath | Every segment labelled; the full name on hover and in the current block card |
| 22 | Prepare | Twenty-five metric names and a "Session 2" button beside "Start session 1" | Three things (what they owe you, what is missing for today, the open loop first); counts behind a link; other sessions under More |
| 23 | Goals, Levers, Call | Toggles that looked like plain boxes | One segmented control (`ui/seg.js`) with a filled chosen segment |
| 24 | Calculators | "Already in the app" cards with a metric name | One grid ordered by use; every card's number answers its question (biggest lever, next rung, debt-free date, cushion steps) |
| 25 | Measure Sankey | Overlapping labels | Flows under 4% fold into Other; a label only with room; a collision test on every chart's text |

## F. Safety, speed and forms

| # | Screen | Problem | Change |
|---|---|---|---|
| 26 | Every screen | Sharing the screen showed every client's name | Presenting: a header switch that locks the app to Client view and hides the client list, notes, the toggle and every coach-only panel; off needs a deliberate click; on by itself when the call screen is shown in Client view; a test checks no other client's name appears |
| 27 | Ledger | 85 input boxes on one screen | Cells read as text; a tap or Tab opens the input, Escape cancels, Enter still moves down; row checkboxes behind Select rows; inputs at rest fell from 85 to under 14 |
| 28 | Every screen | 11px and 12px light gray text | 13px desktop, 14px phone minimums; a contrast and size check on every visible text element |
| 29 | Calendar (Weeks), Measure, Scoreboard | Clipped columns and wrapping tab rows on phones | Tables with more than three columns stack their rows under 500px; tab rows scroll with fading edges |
| 30 | Goals (client) | A box of what-if controls | Behind one "Try a what-if" button |
| 31 | Levers, Scoreboard, Calculators | A 1.5-second rerun on every visit, "Working out" as the first card | The levers run is remembered per record version across reloads; no screen opens on a working card; every mount is timed under 300 ms in the sweep |
| 32 | Ledger, Clients | One click wiped or overwrote | Use national averages, Delete client and Reset demo confirm in the page and offer Undo for ten seconds |
| 33 | Home | An orbit of zeros for a new client | One big "Start the discovery call" and one sentence on what happens next |
| 34 | Header | One generic help page | "?" explains the current screen in three sentences with a link to the guide; shortcuts fold underneath |
| 35 | Every screen | Clickable things that did not look clickable | A sweep check: a pointer cursor belongs to a button, a link, a sortable header or a control; the call timeline segments became buttons, static tiles lost their pointer |

## G. Hallway test kit

`audit/HALLWAY-TEST.md`: a one-page script for three people in an hour.

## Before and after

The five pairs that changed the most (open side by side):

| Screen | Before | After |
|---|---|---|
| Today, coach | `level-before14/jordan-home-coach-1440.jpg` | `level-after14/jordan-home-coach-1440.jpg` |
| Home, client, phone (a new client, so also the empty state of fix 33) | `level-before14/empty-home-client-390.jpg` | `level-after14/empty-home-client-390.jpg` |
| Spending lines at rest | `level-before14/jordan-spending-lines-coach-1440.jpg` | `level-after14/jordan-spending-lines-coach-1440.jpg` |
| Session notes | `level-before14/jordan-session-coach-1440.jpg` | `level-after14/jordan-session-coach-1440.jpg` |
| Prepare | `level-before14/jordan-prep-coach-1440.jpg` | `level-after14/jordan-prep-coach-1440.jpg` |

The before run was taken before the Bay Area household became Leah and covers the empty household and Jordan; the pairs use Jordan so both sides exist. Only these ten files are checked in (`screenshots/.gitignore`); the full folders are about 450 MB and regenerate with the two commands above.

## Numbers

Measured on Leah at 1440px after the pass (a headless browser, `tests/ui.js` and a probe reading `mr3.lastRenderMs`).

| Measure | Before | After |
|---|---|---|
| Sidebar items, coach | 29 in a flat list | 25 in 6 groups |
| Sidebar items, client | 29 | 5 |
| Inputs at rest, Spending lines | 85 | 9 |
| Words on Home, coach | the orbit, the household form and the journal | 151 words and 2 inputs: the next session, the prep card, one button, the list |
| Words on Home, client | the orbit with rows and percentages | 49 words: safe to spend, the next win, three steps |
| Render time, coach screens | up to about 1.5 s where the levers run was in the way | 1 to 69 ms (the call screen is the slowest) |
| Render time, client screens | the same | 1 to 8 ms; the first chart page used to rebuild the unlock list (1.6 s) and now paints first and fills in |
