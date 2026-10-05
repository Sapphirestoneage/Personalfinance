# Level 5 (Learn) design critique, round 1

Reviewer stance: senior product designer, workpaper bar, judged as the screen a coach opens after Measure to say "here is what to read, and why". 4 = a human designer ships it with minor notes. Every score under 4 names the fix (S-number below) that would lift it; one fix may cover several cells. Selectors and lines are from `ui/views/learn.js`, `ui/app.css`, `engine/lenses.js`, `data/lenses.json` and `data/readings.json`.

All 30 images were read. Each screenshot has its own row because household, view and width all change what is on screen. No two rows are truly identical: the empty coach and client shots differ by the page subtitle and the sidebar, and the 1024 shots differ from the 1440 shots in wrapping.

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| empty-learn-coach-1440 | 3 [S2] | 3 [S2] | 3 [S3] | 3 [S7] | 3 [S4] | 3 [S2] |
| empty-learn-coach-1024 | 3 [S2] | 3 [S2] | 3 [S3] | 3 [S4] | 3 [S4] | 3 [S2] |
| empty-learn-coach-390 | 3 [S2] | 2 [S3] | 3 [S3] | 3 [S4] | 3 [S4] | 2 [S3] |
| empty-learn-client-1440 | 3 [S2] | 3 [S2] | 3 [S3] | 3 [S7] | 3 [S7] | 3 [S2] |
| empty-learn-client-1024 | 3 [S2] | 3 [S2] | 3 [S3] | 3 [S4] | 3 [S4] | 3 [S2] |
| empty-learn-client-390 | 3 [S2] | 2 [S3] | 3 [S3] | 3 [S4] | 3 [S4] | 2 [S3] |
| jordan-learn-coach-1440 | 3 [S1] | 3 [S1] | 3 [S5] | 2 [S1] | 3 [S5] | 3 [S1] |
| jordan-learn-coach-1024 | 3 [S1] | 3 [S1] | 3 [S5] | 2 [S1] | 3 [S5] | 3 [S1] |
| jordan-learn-coach-390 | 3 [S1] | 3 [S1] | 3 [S5] | 2 [S1] | 3 [S5] | 2 [S1] |
| jordan-learn-client-1440 | 2 [S2] | 3 [S2] | 3 [S4] | 3 [S4] | 2 [S2] | 2 [S2] |
| jordan-learn-client-1024 | 2 [S2] | 3 [S2] | 3 [S4] | 3 [S4] | 2 [S2] | 2 [S2] |
| jordan-learn-client-390 | 2 [S2] | 3 [S2] | 3 [S4] | 3 [S4] | 2 [S2] | 2 [S2] |
| dev-learn-coach-1440 | 3 [S1] | 3 [S1] | 3 [S3] | 2 [S1] | 2 [S6] | 3 [S1] |
| dev-learn-coach-1024 | 3 [S1] | 3 [S1] | 3 [S3] | 2 [S1] | 2 [S6] | 3 [S1] |
| dev-learn-coach-390 | 3 [S1] | 2 [S3] | 3 [S3] | 2 [S1] | 2 [S6] | 2 [S3] |
| dev-learn-client-1440 | 2 [S2] | 3 [S2] | 3 [S3] | 3 [S4] | 2 [S2] | 2 [S2] |
| dev-learn-client-1024 | 2 [S2] | 3 [S2] | 3 [S3] | 3 [S4] | 2 [S2] | 2 [S2] |
| dev-learn-client-390 | 2 [S2] | 2 [S3] | 3 [S3] | 3 [S4] | 2 [S2] | 2 [S2] |
| maya-learn-coach-1440 | 3 [S1] | 3 [S1] | 3 [S5] | 2 [S1] | 3 [S5] | 3 [S1] |
| maya-learn-coach-1024 | 3 [S1] | 3 [S1] | 3 [S5] | 2 [S1] | 3 [S5] | 3 [S1] |
| maya-learn-coach-390 | 3 [S1] | 2 [S3] | 3 [S5] | 2 [S1] | 3 [S5] | 2 [S3] |
| maya-learn-client-1440 | 4 | 4 | 3 [S5] | 3 [S7] | 3 [S4, S7] | 3 [S4] |
| maya-learn-client-1024 | 4 | 4 | 3 [S5] | 3 [S4] | 3 [S4] | 3 [S4] |
| maya-learn-client-390 | 4 | 2 [S3] | 3 [S5] | 3 [S4] | 3 [S4] | 3 [S3] |
| extreme-learn-coach-1440 | 3 [S1] | 3 [S1] | 3 [S3] | 2 [S1] | 2 [S6] | 3 [S6] |
| extreme-learn-coach-1024 | 3 [S1] | 3 [S1] | 3 [S3] | 2 [S1] | 2 [S6] | 3 [S6] |
| extreme-learn-coach-390 | 3 [S1] | 2 [S3] | 3 [S3] | 2 [S1] | 2 [S6] | 2 [S3] |
| extreme-learn-client-1440 | 2 [S2] | 3 [S2] | 2 [S3] | 3 [S4] | 2 [S2] | 2 [S2] |
| extreme-learn-client-1024 | 2 [S2] | 3 [S2] | 2 [S3] | 3 [S4] | 2 [S2] | 2 [S2] |
| extreme-learn-client-390 | 2 [S2] | 2 [S3] | 2 [S3] | 3 [S4] | 2 [S2] | 2 [S2] |

What works: titles only, never quotes, exactly as the brief asks. Every finding is one plain sentence with a dollar figure in it. Readings are ordered by the money behind them (Jordan opens on the $9,561 housing line). The sapphire table header, Inter throughout and sentence-case headings already match Measure and Session. Maya's client view (one shared finding, one gap) shows how calm the screen can be.

## Fixes

Merge and simplify

- S1 One panel of readings, not one panel per reading. `learn.js` line 18 builds a `section.panel` for every reading, so Jordan's coach view is 7 bordered cards at 1440 and 2021px tall at 390. Each book title is a 16px `h2` and is louder than the finding under it. Each finding also states its figure twice: "roughly $9,561 a year above the 35% line. About ~$9,561 a year." The muted suffix drifts to the end of the line, and at 1024 and 390 it wraps so "About" sits on one line and "~$187 a year." on the next. Replace lines 14 to 18 with one panel holding one table:
  - Sort groups by summed `impactAnnual` (largest first). Push one `tr.group` row per reading, `h('td', { colspan: 2 }, g.reading.title)`, then one row per lens: `h('td', { class: 'wrap' }, l.text)` and `h('td', { class: 'num' }, l.impactAnnual !== null ? F.dollarsWhole(l.impactAnnual, { rough: l.rough }) : '-')`.
  - Panel heading: `h2` "Readings" with `span.tag` "6 titles, 12 findings" (counts from `groups.length` and `lenses.length`). Table head: "What the numbers show" | "A year" (`th.num`).
  - Delete the "About " suffix span entirely; the A year column carries the figure once, right-aligned and tabular.
  - Add to `app.css` next to line 454: `table.data tr.group td { background: var(--paper-2); color: var(--sapphire-900); font-weight: var(--w-semibold); }` and `table.data td.wrap { padding-top: var(--s-1); padding-bottom: var(--s-1); }` so wrapped findings keep a 4px inset on an 8px rhythm.
  - This removes the two inline `style: { margin: '8px 0 0', paddingLeft: '18px' }` lists (18px is off the 8px grid) and takes the page from up to 8 panels to 2.

- S4 Delete "The shelf" panel (`learn.js` line 27). It lists all ten titles again under the readings that already name them, followed by raw topic ids in parentheses ("(match, promo-cliff, emergency-fund, tax-room, debt-order, thin-runway)"). Those are lower-case hyphenated slugs, not words a client reads, and at 1024 they break mid-word ("thin-" / "runway", "hidden-" / "leak"). Replace the panel with one muted line at the foot of the S1 panel, titles not already shown, no slugs: `h('p', { class: 'hint' }, 'Also on the shelf: ' + rest.map(r => r.title).join('; ') + '.')`, with `.hint` margin-top `var(--s-2)`. Then:
  - Remove the `topics` arrays from `data/readings.json`: `learn.js` line 27 is their only reader.
  - `mmm-car` (line 28) and `fed-student-aid` (line 87) are pointed at by no lens in `data/lenses.json`, so they can only ever appear on the shelf. Either point `real-hourly-wage` (lenses.json line 89, its topics already include transportation) at `mmm-car`, or delete both entries. Fewer titles, and every title has a reason to be on the page.

Empty and client states

- S2 The empty state lies in client view. `learn.js` line 13 filters lenses to `clientPicks`, so when the coach has shared nothing, Jordan (98% complete), Dev and the extreme household all show "Nothing to read yet. Readings appear as lenses fire. Enter income and spending first." Their income and spending are in. "Lenses fire" is engine vocabulary. Replace line 17 with two cases:
  - Client view, `R.lenses.length > 0` and nothing picked: h2 "No readings shared yet", p "Your coach picks which readings appear here."
  - No lenses at all: h2 "Nothing to read yet", p "Readings appear once income and spending are in. The table below lists what is still missing."

  Spacing: `.empty` is not a `.panel`, so `.panel + .panel` (app.css line 75) never adds a gap, and the dashed box touches the next panel with 0px between them in every empty and client shot. `.empty` also pads 24px (line 216) against the panel's 16px, so "Nothing to read yet" starts 8px to the right of "Gaps in the numbers". Fix: line 8 becomes `h('div', { class: 'stack learn' })` (`.stack > * + *` at line 85 gives the 16px gap), and add `.learn > .empty { padding: var(--s-3); }`.

Gaps table

- S3 "Gaps in the numbers" (`learn.js` lines 20 to 26) reads like engine output and breaks at 390.
  - Narrow: `td` is `white-space: nowrap` (app.css line 180), so at 390 the long need ("debt rows, or a rough total of 0 for none", "a match formula (Benefits and match row) and the pre-tax deferral") pushes "Numbers it unlocks" off the panel. The header shows "Number" or "Numbers it" and no count is visible in any 390 shot. Give the label cell `class: 'wrap'` (line 454 already lets it wrap) and shorten the header to "Unlocks".
  - Sentence case: every row starts lower case. Capitalise at render, `n.charAt(0).toUpperCase() + n.slice(1)`, and fix the strings at their source so Measure gets them too:
    - `engine/units.js` line 173 "a non-zero denominator" and `engine/metrics.js` line 20 "an input" are internal. Never show them to a client. Until each caller passes a field name, collapse both into one row, "Other inputs, see Measure".
    - `engine/planets/debt.js` lines 38 and 40: "Debts, or a rough total (0 if none)".
    - `engine/metrics.js` line 176: "An FI date".
    - Match row: "Match formula and pre-tax deferral (Benefits and match row)".
    - "gross pay above zero" and "take-home above zero" read as error text. Use "Gross pay" and "Take-home pay": the row already says it is missing.
  - The count does not reconcile. The tag says "13 of 48 waiting" for the extreme household, but the Unlocks column sums to 10, so three waiting numbers carry an empty `needs` list and vanish from the table. In the `forEach` on line 23, count a metric with `m.needs.length === 0` under "Other inputs". Replace the hard-coded `' of 48 waiting'` with `Object.keys(M).length`, and word the tag "13 of 48 numbers waiting".
  - Width: at 1440 the need and its count sit about 1,100px apart. S7 caps the column.

Copy and figures

- S5 One hedge, written once. `engine/lenses.js` line 22 turns "about" into "roughly", and the old suffix added "About ~", so one figure carried three hedges. S1 removes the suffix; also fix these:
  - Rough marking misses a sentence-initial "About". Maya's hidden-leak lens is rough (its suffix printed "~$11,592"), but its sentence still opens "About $11,592 a year" because the regex on line 22 only matches a lower-case " about " (`data/lenses.json` line 89 starts with "About {cost}"). Add `.replace(/^About /, 'Roughly ')` to line 22. The same $11,592 then appears in the tax-room line (line 125) with no hedge at all. Since it is the same rough figure, write it as "~$11,592" there too.
  - `data/lenses.json` line 176: "is {hours} of work" renders "68.5 h of work". Write the unit out: "68.5 hours of work".
  - Line 237: "the best library card for each category" uses the app's internal word. Use "the best card already in the wallet for each category".
  - Line 38: "goes from 0.0% to 25.0%" should print whole rates without decimals: "goes from 0% to 25% in 5 months".
  - Line 189: "roughly 24 months earlier". Use `F.months` so 24 months reads "about 2 years earlier".

- S6 Figures that are not what the column claims.
  - Thin runway (`engine/lenses.js` line 79) passes the one-time gap to three months as `impactAnnual`. Dev's "the gap to three months is roughly $1,475" is labelled "~$1,475 a year". Pass `impactAnnual: null` in the `extra` object, as `wrong-debt-first` does on line 57, so the A year cell shows "-".
  - The same cash is counted twice under two readings. `saving-at-a-loss` and `cash-drag` both use metric `cashDrag` and the same excess. For the extreme household, $259,790 of cash appears as "$50,113 a year" (Money Guy) and again as "$10,392 a year" (JL Collins). When `saving-at-a-loss` fires, skip `cash-drag`: one finding per dollar, one fewer row.

Shell and measure

- S7 Line length and sidebar.
  - At 1440 the readings sentences, shelf lines and gaps table run the full 1,180px content width; a workpaper column reads best near 960px. Add `.learn { max-width: 960px; }` (the class from S2). This also puts the gaps count next to its label.
  - In client view at 1440 the sidebar truncates "What com...", "Your cushi...", "Where yo..." and "Your one ...", yet the same labels fit at 1024. `app.css` line 252 hides `.kbd` but the grid on line 58 still reserves its 48px column. Add `body[data-view="client"] .sidenav a { grid-template-columns: minmax(0, 1fr) 32px; }`. Coach "Assumptio..." truncates for the same reason; drop the kbd column on rows that have no shortcut.

## Overall notes

1. What works: the screen respects its own rules. It shows titles only, never quotes, and states information, not instructions. Readings are ranked by the money behind them, and the visual language (Inter, sapphire table header, sentence-case headings, 32px rows) is already the house style. Maya's client view shows the target: one finding, one gap, nothing shouting.
2. Most low scores come from one choice: a card per reading, then a shelf that repeats every card. S1 and S4 together take the coach view from up to 8 panels to 2 and drop a data field (`topics`). They put every figure in one right-aligned column, which lifts Density and Would ship on every coach row. That is the freeze working in the screen's favour: fewer surfaces, nothing added.
3. The client view is the riskier half. It tells a 98%-complete household to "enter income and spending first" (S2). It also shows engine strings such as "a non-zero denominator" (S3), and it can show a one-time gap as a yearly cost or the same cash twice (S6). These are trust defects more than design ones. Fix S2, S3 and S6 before the next client session, even if S1 and S4 wait.

## After round 1 (builder's note, not a reviewer score)

Fixes S1 to S7 were applied and the screens re-shot: one "Readings" table
ranked by the money behind each title, with the figure once in an "A year"
column (S1); the empty state tells the client when the coach has not shared
readings yet and the panels keep one 16px gap (S2); the gaps table wraps its
label, capitalises, folds engine strings into "Other inputs (see Measure)",
counts every waiting number and reads the total from the registry (S3); the
shelf panel is gone, `topics` left readings.json and the two titles no lens
pointed at were removed (S4); a rough sentence that opens "About" now opens
"Roughly", hours are spelled out, the wallet lens no longer says "library
card", promo rates print whole, and 24 months and up read as years (S5); thin
runway shows no yearly figure and cash drag yields to saving at a loss (S6);
the column is capped at 960px and the sidebar gives back the shortcut column
in client view (S7). The reviewer did not re-score this round.
