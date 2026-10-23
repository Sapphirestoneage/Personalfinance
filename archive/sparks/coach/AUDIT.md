# Coach Mode audit, 26 Sept 2026

A walk through the three screens twice: once as a coach opening the app for the
first time, once as a client watching a shared screen on a phone. The bar the
owner set: a third grader, or someone overwhelmed by money, can fill it in; it
looks professional enough to show a client; every number set has a picture.

Each finding says what was wrong and what was done. "Fixed" points at the
decision that carries it (`coach/DECISIONS.md`).

## Words (the biggest gap)

| # | Found | Done |
|---|---|---|
| W1 | Every entry box was a bare label ("Pay before tax, a year") with no help. A client who has never looked at a payslip cannot answer it. | Fixed, CD-009. Every field has a plain question, what it means, where to find it, an example, and what to do if unsure, in `data/help.json`, shown by a "What is this?" toggle beside the box. |
| W2 | Read-outs were finance jargon: Debt-to-income, Liquidity, Savings rate, Housing share of pay, FI date. A green or amber number gave no clue what good looks like. | Fixed, CD-009. Plain names ("Spending on debt", "Months you could go", "How much you keep", "Rent as a share of pay", "The work-optional date"), a one-line meaning, and "good looks like" on every read-out. Colour is never alone: each carries a word (good, watch, needs care). |
| W3 | Stops were named for the coach ("Spending and cash flow", done when "Monthly surplus computes"). | Fixed, CD-009. Each stop has a plain title, a two-line "how to run it", and "done when" in words a client understands ("we know what is left at the end of a month"). |
| W4 | "FI", "coast", "financial independence" appeared on the client's screen. | Fixed, CD-009. Client-facing copy says "the work-optional date" and "the day work becomes a choice"; a Words panel explains any term in one sentence. |
| W5 | "Rough" tick beside a box, unexplained; "Rough or stale" as a roster column. | Fixed, CD-009. "This is a guess" with a hint; the roster column is "Numbers to check", with a tooltip. |
| W6 | The import and backup cards read like documentation (AES-256-GCM, CSV, "mapping"). | Fixed, CD-011. Each is folded behind a plain heading ("Bring a client over from a spreadsheet", "Keep a safe copy"), with the steps numbered and the jargon gone. |

## Pictures (there were almost none)

| # | Found | Done |
|---|---|---|
| P1 | The only picture in the app was the life map; every other number was text. | Fixed, CD-010. A chart library of its own (`shared/charts.js`) draws bars, columns, stacks, lines, areas, donuts, pies, meters, progress bars and bands from the engines' figures. |
| P2 | No way to choose how a number set is drawn, or in what colours. | Fixed, CD-010. Every chart has a Customise control: the chart types that fit that data, eight colour themes, and a swatch per series. Choices are kept per chart (`coach.prefs.v1`, display only, no money). |
| P3 | Colours would have been picked by eye. | Fixed, CD-010. The eight hues and every theme order were run through the colour-vision validator against the app's own dark surface; only passing orders ship. |
| P4 | The rail's zones were colour-only (green, amber, red). | Fixed, CD-010. Meters with the good and watch bands drawn, plus the word. |
| P5 | Life-map labels collided when two dates fell close together ("Buy a car next year" over "House down payment"). | Fixed, CD-010. Labels stagger by nearness, not by index, and the map draws at the width it is shown at. |
| P6 | No history: nothing showed a client moving over months. | Fixed, CD-010. Net worth across sessions and the check-in mood over time, on Client View and as a sparkline on the roster. The demo client carries three example sessions and three check-ins so the pictures are never empty. |
| P7 | Charts had no table twin, and no hover. | Fixed, CD-010. "Show as a table" on every chart; a tooltip on every mark, the same on keyboard focus. |

## Flow and layout

| # | Found | Done |
|---|---|---|
| F1 | Coach Home opened on a table with seven jargon columns and five buttons a row. | Fixed, CD-011. A welcome card with the three steps (add a client, run a session, share their view) until the first real client exists; one card a client with the picture, the next stop and one primary action; the rest under "More". |
| F2 | The quick-entry bar was sticky and drew over the notes card (visible on the desktop screenshot). | Fixed, CD-011. The bar is part of the work column with its own room; nothing draws over content. |
| F3 | Four note boxes on screen at once (coach and shared, stop and session). | Fixed, CD-011. One note box with a private/shared switch and a "this stop / this session" tab; the lists stay. |
| F4 | "not started" in monospace read as an error; Start session did not say what it does. | Fixed, CD-011. A friendly status chip, and one line: "freezes today's numbers so the recap can show what changed". |
| F5 | No sense of progress in a session. | Fixed, CD-011. A step bar at the top: stops done of total, the current stop named. |
| F6 | The rail label "Now, and at the start" and every read-out lacked a sentence. | Fixed, CD-009, CD-010. |
| F7 | Client View led with a 25-word sentence about financial independence. | Fixed, CD-011. A hero: the work-optional age in large type, the range under it in one short line. |
| F8 | The check-in's "Filled in by" select faced the coach even in presenter mode. | Fixed, CD-011. Hidden in presenter mode (the client is filling it in). |
| F9 | The mood buttons were bare numbers. | Fixed, CD-011. Words under the ends (awful, great) and a label on focus. |
| F10 | History opened at the bottom of Home, far from the button. | Fixed, CD-011. Opens under the client's card. |
| F11 | No consistent header: Home had none, the Session had actions, Client View a tiny bar. | Fixed, CD-011. One header on every screen: the app's name, the client, the actions. |
| F12 | Printing the Client View printed the form. | Fixed, CD-011. Print styles: the pictures and the sections, no form, no controls. |

## Accessibility

| # | Found | Done |
|---|---|---|
| A1 | Chart marks and colour zones carried meaning by colour alone. | Fixed, CD-010: words, direct labels, legends and a table view. |
| A2 | Help would have been hover-only. | Fixed, CD-009: toggles, keyboard-reachable, announced. |
| A3 | Axe was clean before and stays clean; every target is 32px or more on a coarse pointer; nothing scrolls sideways at 320px. | Held by the tests and the browser gates. |

## Not changed, on purpose

- No new screen: still Home, Session, Client View (D-339).
- No new engine: every figure a chart draws is one an engine already produced.
- No colour picker with a free wheel: the swatches are the eight validated hues, so a chart can never become unreadable to a colour-blind client.
