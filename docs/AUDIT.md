# SPARKS audit, 26 September 2026

A walk through the app twice: once as somebody who has never looked at a
payslip, once as a coach showing a client a screen. The bar the owner set:

> "Identify gaps in user knowledge on how to fill it. The goal is a 3rd grader
> or someone overwhelmed with finance can fill it out... Everything should be
> super easy to use and super incredibly smooth and user friendly and make it
> look very impressive when I show it to clients yet also super understandable.
> I want there to be a ton of data visualisations for each number set possible
> as well as the ability to change the type of chart and colors of each."

Every finding below says what was found, what was done, and which decision
carries it. Coach Mode has its own audit at `coach/AUDIT.md`; this one is the
37 rooms of SPARKS.

## How the app was measured

| Question | How it was answered |
|---|---|
| Can the questions be answered by someone who does not know the words? | Every typed row read against its label alone, then scored: Flesch-Kincaid over all the help text, a jargon list over every question. |
| Does every number set have a picture? | Every chart call counted per room, then every room opened at 390px with the example household and with nothing entered. |
| Does it look finished? | `docs/DESIGN.md`, 23 rules, each with the check that holds it. |
| Does it hold together under a finger? | The browser gates: every room rendered, every form typed into, every field link followed, the guided walk tapped through. |

## Words: the biggest gap, and it was measurable

| # | Found | Done |
|---|---|---|
| W1 | Of the 84 boxes a person can type into, **56 had no sentence saying where to find the number**, and **none** had a plain restatement of the question, what counts, or what to do when the answer is not known. A row said "Your highest insurance deductible" and stopped. | Fixed, D-346. Five sentences on every typed row: the question in plain words, what counts, where to find it, what a good enough answer looks like, and what to do if you do not know. Shown as a "What is this?" fold under the box. |
| W2 | The reading level of what help there was had never been measured. | Fixed, D-346. The whole set reads at **Flesch-Kincaid grade 3.8** (9.7 words a sentence, 1.32 syllables a word). A gate fails the build above grade 6. |
| W3 | Jargon sat in the questions themselves: deductible, marginal rate, allocation, cost basis, out-of-pocket maximum. | Fixed, D-346. The plain question carries no jargon (a gate holds it); the term is explained one line down, where the person has already decided to read. |
| W4 | Band 1 of the Planets had all of this (D-336) and nothing else did, so the app taught you for eighteen questions and then stopped. | Fixed, D-346. The same promise now covers every box in the Ledger, which is the one place a fact is typed (D-313). |
| W5 | A row that could be answered roughly never said so, so a person who did not know the exact figure left it blank. | Fixed, D-346. "Close enough" is one of the five sentences, with a real range in it ("$400 to $700 a month for one person"). |

## Pictures: there were plenty, and no way to change one

| # | Found | Done |
|---|---|---|
| P1 | About a hundred charts across 25 rooms, every one locked to the shape its room had chosen. | Fixed, D-347. `shared/chartbox.js` offers the shapes that are honest for the kind of number set: a share of a whole can be a ring, bars, columns or one stacked bar; a series can be an area or columns; a figure against a band stays a bullet bar. |
| P2 | One blue palette everywhere, and no way to change it. | Fixed, D-347. Eight colour orders, each validated (see below), switched per chart and remembered on the device. |
| P3 | The palette had never been checked for colour blindness. The first one written for this failed on the spot: worst adjacent pair ΔE 2.9 under deuteranopia. | Fixed, D-347. The eight hues are the dataviz reference palette's dark steps; every order passes the lightness band, the chroma floor, CVD separation, the normal-vision floor and contrast against this app's panel. A gate holds the exact hex values so a later edit has to re-run the validator. |
| P4 | No chart had a table twin, so a screen reader got a figure list and a picture it could not use. | Fixed, D-347. "Show as a table" on every chart, the same figures, remembered per chart. |
| P5 | The Scorecard's measuring stick was seven paragraphs and 28 buttons, about 4,000px, and said "no chart" by decision. | Fixed, D-344. Seven bullet bars on one axis, the band a stripe behind each, the figure and the verdict in words beside it. 780px. |
| P6 | Bar labels were cut to "Retirement s..." on a phone. | Fixed, D-344. The label takes the first line and the bar takes the rest, in every bars chart in the app. |
| P7 | A comparison chart drew a legend that repeated the axis labels. | Fixed, D-347. One series carries its name on the axis; the legend goes. |
| P8 | Four live rooms had figures and no drawing at all: the Statement, The Mix, The Bridge and the one-pager. | Fixed for the first two, D-348: net worth as what you own by bucket and what you owe, the liquidity ladder by distance from your hand, and The Mix's target and dollars. In the Statement they are folded, because that room promises four sections inside two phone screens (D-306) and its own gate caught the picture breaking it. |
| P9 | A ring of one slice was drawn as if it were a chart. | Fixed, D-348. A share of a whole needs two parts before it is a picture; until then the room says what would make it one. |

## Flow: what happened when a finger actually landed

| # | Found | Done |
|---|---|---|
| F1 | Tapping **Next** in the Ledger's guided walk did nothing on a phone. The save toast sat over the button for seven seconds after every answer, so the tap landed on Undo and took the answer back. | Fixed, D-343. The toast moved to the top; the bottom belongs to the action and the keyboard. |
| F2 | The same tap also missed because the row's focus extras collapsed between touchend and click, taking 68px out of the page. | Fixed, D-343. A row holds its height until the tap that took its focus has landed. |
| F3 | A link that named a field opened the room and then slid away from it, on a cold load, for two rooms in five. | Fixed, D-343. The address the page arrived with is remembered; the scroll sync holds off until the landing has begun. |
| F4 | The Cushion answered "how long can you last" after two screens of boxes. | Fixed, D-345. The months lead the room; the boxes that shape them follow. |
| F5 | The undo pair floated over the page and covered a figure in one corner and the labels in the other. | Fixed, D-342. It docks in the room's own strip and scrolls away with everything else. |
| F6 | Seven ways into the Ledger wrapped onto three lines of pills. | Fixed, D-342. One sideways row, the current one scrolled into view, the edges faded. |
| F7 | Every room opened with four lines of small print about what it shows and needs. | Fixed, D-342. Folded behind one line. |

## Numbers: what was being printed

| # | Found | Done |
|---|---|---|
| N1 | "to age 55.88101594379056" reached two rooms. | Fixed, D-342. `Money.formatAge`, and `test/render.js` now fails on any rendered text with three or more decimals, in every room, empty and with data. |
| N2 | 195 of the 274 facts the Planets asks about had nowhere to be typed: the panel said "nowhere to type it yet". | Fixed, D-340. `shared/levelstore.js` is the one writer for them; every question in the Planets can be answered. |
| N3 | Nothing showed how far in a person was, or what their answers had bought them. | Fixed, D-341. The Planets Overview: a ring, four tiles, bars by planet, band and tier, every reading with its figure and where it sits against its normal range. |

## Accessibility

| # | Found | Done |
|---|---|---|
| A1 | Chart colour carried meaning alone in places. | Fixed, D-344 and D-347: a verdict always ships with its word, every mark carries its own figure, and every chart has a table. |
| A2 | Help would have been focus-only, which a touch device never shows. | Fixed, D-346: a `<details>` fold, keyboard reachable, opened by the person. |
| A3 | Focus ring, reduced motion, 44px targets, and every multi-cell row aligned at every width. | Held by `docs/DESIGN.md` 11, 19, 20 and `test/alignment.js`. |

## Still open, and why

- **The rooms' own explanations.** D-346 covers every box in the Ledger, which
  is where facts are typed. A handful of rooms ask for a what-if figure of
  their own (a house price, a career move's new pay); those boxes carry their
  room's own hint but not the five sentences. They are next.
- **Charts inside string builders.** Eleven rooms draw through the new layer.
  The rest still draw their charts inline, which is the same library and the
  same figures, but without the shape and colour controls. Mechanical to
  finish, room by room.
- **Tier 3 readings and the moons** (`STATUS.md`), and the two owner decisions
  held there.

## How to check any of it

    node test/run.js          the lints, including the words and the palette
    node test/render.js       every room, empty and with data, no ugly numbers
    node test/forms.js        typing survives in every room
    node test/anchors.js      a link that names a field opens to the field
    node test/alignment.js    every multi-cell row, every width

And then look at it: `python3 -m http.server`, a phone-width window, both a
blank household and the example one. Every finding above came from looking.
