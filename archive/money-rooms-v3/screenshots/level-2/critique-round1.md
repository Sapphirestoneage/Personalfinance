# Level 2 design critique - Measure and One-pager

Reviewer stance: senior product designer, eMoney / audit-workpaper bar. 4 = a human designer ships it with minor notes. Every score under 4 names its fix (N-number below); one fix may cover several cells. PDF read OK (1 letter page).

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| maya-measure-coach-1440 | 3 N2 | 3 N1 | 3 N9 | 4 | 3 N10 | 3 N16 |
| maya-measure-client-1440 | 3 N13 | 2 N3 | 2 N4 | 2 N13 | 3 N12 | 2 N3 |
| maya-measure-coach-390 | 2 N7 | 3 N6 | 2 N16 | 2 N8 | 3 N10 | 2 N16 |
| maya-measure-client-390 | 2 N13 | 3 N4 | 2 N3 | 2 N8 | 3 N9 | 2 N3 |
| maya-onepager-coach-1440 | 4 | 3 N23 | 3 N24 | 4 | 3 N25 | 3 N26 |
| maya-onepager-client-1440 | 4 | 3 N23 | 3 N4 | 4 | 3 N25 | 3 N26 |
| maya-onepager-client-390 | 3 N22 | 3 N23 | 3 N27 | 3 N22 | 3 N24 | 3 N22 |
| jordan-measure-coach-1024 | 3 N2 | 3 N6 | 3 N17 | 4 | 3 N10 | 3 N6 |
| dev-measure-coach-1440 | 3 N21 | 3 N1 | 3 N11 | 4 | 3 N10 | 3 N21 |
| empty-measure-coach-1440 | 4 | 3 N1 | 3 N5 | 3 N14 | 4 | 3 N5 |
| extreme-measure-coach-1440 | 3 N21 | 2 N15 | 2 N11 | 3 N18 | 2 N5 | 2 N5 |
| maya-home-client-1440 | 4 | 4 | 4 | 3 N31 | 4 | 4 |
| maya-onepager.pdf (print) | 4 | 3 N23 | 3 N28 | 3 N30 | 3 N29 | 3 N30 |

## Fixes

Measure, layout (ui/app.css)
- N1 `.panel + .panel { margin-top: 16px }` leaks into `.grid`: every chart panel but the first gets 16px, so chart row 1 sits 16px out of line (Net worth, Empty states) and row gaps are 32px not 16px. Add `.grid > .panel + .panel { margin-top: 0; }`.
- N2 `.metric-group > h3` and `.chart-panel header h3` inherit global `h3` (12px slate regular), the same style as tile labels, so "Debt and credit" does not separate groups and chart titles are the faintest text in the card. Set `color: var(--sapphire-900); font-weight: var(--w-semibold); font-size: var(--fs-13);`.
- N3 Specificity bug: `body[data-view="client"] .kpi .value` (0,3,1) beats `.kpi .value.list` and `.value.needs` (0,3,0), so client list values render at 24px and run 6-9 lines ("Stoc 75.7%, / Bond 4.2%,"), giving 230px tiles. Add `body[data-view="client"] .kpi .value.list, body[data-view="client"] .kpi .value.needs { font-size: var(--fs-14); line-height: 20px; font-weight: var(--w-regular); }`.
- N4 `.kpi .label` is nowrap plus ellipsis: "Savings rate (gross, FIRE ...", "Debt-free date and freed ...", and client labels "What lands in the bank ea..." lose their meaning. Allow two lines (`white-space: normal; -webkit-line-clamp: 2; display: -webkit-box; -webkit-box-orient: vertical; min-height: 32px`) and cap glossary client labels at 28 characters.
- N5 `.kpi .value.needs` is nowrap, so "Needs take-home pay, ..." hides the one thing the coach must ask for. Extreme also shows a bare "Needs" (Shelter rate) and blank values (Fixed-cost rate, Debt-to-income). Set `.kpi .value.needs { white-space: normal; line-height: 18px; }`; in `kpi()` (measure.js) never emit an empty string - fall back to "Needs inputs" and log the missing need list.
- N6 `.lens .foot` is a wrapping flex row, so "Show to client" floats after a variable-length "Read:" title and never forms a column (Jordan at 1024 wraps it to its own line). Use `display: grid; grid-template-columns: 128px 104px minmax(0,1fr) 120px;` with the checkbox right-aligned in the last column. When `impactAnnual` is null ("Only 29.3% of assets..."), show the lens' own figure so the amount column is never blank.
- N7 In `@media (max-width: 720px)` a later `.sidenav { flex-wrap: wrap; overflow-x: visible; }` overrides `overflow-x: auto`, so 10 tabs wrap to 3 rows (about 110px) above every 390 screen. Delete that override; keep one scrolling row.
- N8 At 390 each lens stacks five lines (text, amount, foot, reading, checkbox); nine lenses cost about 2,000px. Under 720px hide `.lens .foot .muted` (the reading is already in the drawer) and put the checkbox on the amount line.

Measure, content (ui/views/measure.js, engine/format.js)
- N9 `kpi()` abbreviates share keys with `k.slice(0,1).toUpperCase() + k.slice(1,4)`: "Reti, Acco, Tran, Ther, Othe, Hsa, Stoc". `listSummary('roomLeft')` prints raw ids "ira", "hsa-self". Use the labels from data/ and render shares as a 2-column mini table (label left, % right, tabular figures).
- N10 Mixed precision side by side: "$166.00", "$744.06", "~$703.84" next to "$12,410". Tiles and lens sentences ("$480.00 a year" beside an impact of "$480 a year") should use `F.dollarsWhole`; a tilde with cents is false precision.
- N11 Signed rough values read as typos: "~-$36,580", "~-1.6%", "~-6.0%". Copy fix: negative surplus reads "Short ~$36,580 a month"; other negatives put the sign first with a true minus, "-~1.6%" becomes "~1.6% below zero" in the range line.
- N12 Gold is wins at 90%+ only, but `stage-row` uses `chip gold` for "has rows" (state by colour alone), and charts.js draws the Rule of 5 and FI number targets with `.marker.gold`. Use `chip state-known` plus text ("Stage 1: income and spending - has rows") and `.marker` (ink dashed) for targets; gold only once a target is reached.
- N13 Client Measure is the coach workpaper at larger size: 48 tiles, coach jargon ("The lean month", "FAT"), 5,700px at 390. In client view render the one-pager `KEY_METRICS` plus groups with a picked lens, with the rest behind one "All numbers" link.
- N14 Empty state: 48 tiles saying "Needs ..." is honest but heavy. When every tile in a group needs input, collapse the group to one line in `draw()`: "Debt and credit - needs debt rows (9 numbers waiting)".
- N15 Extreme: `listSummary` lists every card in promoCliff and cardNetValue (9-line tiles). Cap at 2 items plus "and 4 more"; truncate names at 24 characters as charts.js already does.

Charts (ui/charts.js)
- N16 Every builder uses a fixed viewBox W = 720 scaled to the card, so the 11px `.chart-label` shows at about 8px in a 1440 two-column grid and about 5px at 390. Pass `host.clientWidth` as W (re-render on resize), and below 720px make the chart grid one column.
- N17 Clipped labels: fiGauge "Fat $1.9" (last mark needs `text-anchor: end`), waterfall "$5,694 of $24,500, sav" (move ", saves" into the `<title>` and widen the right margin to 160), and the debtRace x-axis "May 20" (`m.r: 40`).
- N18 Label collisions: debtRace labels sit at the first point, so "Sapphire Preferred" and "Bilt" overprint, and extreme debts overlap. Label at the line end with 12px minimum spacing, or use a legend table. In the sankey, merge nodes under 2% into "Smaller lines $X".
- N19 balanceSheet drops labels on segments under 70px (an unlabelled light-blue and a navy block in Maya). Add a legend row of text chips (label and $) under each bar.
- N20 draftt: the amber over-band marker for Accommodation is colour only, and the bands have no axis. Add text after the value ("~40.9%, above 25-35%") and a 0/20/40/60% axis.
- N21 The sankey turns a deficit into a source: dev shows amber "Not yet placed $325" beside gross pay, and extreme's largest block is "Not yet placed $36,580" when take-home is $0. Label a negative remainder "Short $X a month" in slate. Keep amber for real unplaced money.

One-pager (ui/views/onepager.js, ui/app.css)
- N22 `@media (max-width: 720px) { .op-grid, .op-numbers { 2 columns } }` keeps prose sections in two 150px columns at 390 (3-word lines). Make `.op-grid` one column there.
- N23 `.op-numbers` uses `auto-fit, minmax(140px)`, so 8 tiles fall 5 + 3 on screen and 6 + 2 in print, and the runway tile wraps to 3 lines of 16px blue. Use `repeat(4, ...)` on screen and `repeat(8, ...)` in print, and give runway a short form "3 / 4 / 4 months" with "full / needs / lean" in the range line.
- N24 `changeText()` formats a changed range as "from $250.00 to $350.00 to $240.00 to $320.00", which cannot be read. Use "from $250-$350 to $240-$320" (whole dollars).
- N25 `strugglingSection()` falls back to `lenses[0].reading` for every coach-written bullet. The same printed bullet cites Mr. Money Mustache in coach view and Your Money or Your Life in client view, and both bullets cite the same book. Show only a reading tied to that item, on its own `.small.muted` line.
- N26 Typed text contradicts the computed numbers on the same page: "Housing takes just over half of take-home" against a shelter rate of ~40.9%, and "about three months of the lean month" against "4 months FAT". In edit mode show the `suggestImportant()` figure beside each typed line, and flag any number that disagrees.
- N27 "Bring next time" joins row and label into field names: "Rough total rough monthly total", "Tutoring, occasional amount". Join as "Tutoring (occasional amount)" and drop repeated words.

Print (ui/print.css)
- N28 `table.data th { font-size: var(--fs-12) }` beats print's `table.data { font-size: 9px }`, so "Task Owner Due" prints larger than its rows. Add `table.data th { font-size: 9px; height: 16px; }`.
- N29 Print follows the screen toggle: the PDF carries coach labels ("Runway months ... FAT", "% to FI"). The print path should always pass the client translator to `kpi()`.
- N30 The page is 62% used with 38% blank, ranges are hidden (`.op-numbers .kpi .range { display: none }`), and there is no chart. Keep the range line at 8px, and if none are ticked, default Net worth and Cash flow onto the page.

Home
- N31 Orbit counts ("17", "4") have no unit, and in client view `.home-grid` forces one 720px column, leaving 490px empty at 1440. Label counts "17 rows" and place Household facts beside the orbit at 1280px and wider.

## Does the one-pager read like a coach's handout?

Almost. The structure is right: name and goal, date, session, confidence, key numbers, wins before struggles, more/less, owned and dated to-dos, goals, a bring list, and it really prints to one page. What stops a coach handing it over today:
- Two of its own sentences contradict its key numbers (N26).
- One reading is repeated on both struggles and changes with the view toggle (N25).
- The "Changes" line cannot be read (N24), and "Bring next time" reads like database field names (N27).
- The print carries coach jargon (N29) and leaves a third of the page blank with no chart (N30).
- There is no coach name, contact or next-session date, which every handout from an adviser has.

Fix N24 to N30 and add a "Prepared by / next session" line in `op-meta`, and it is a 4.

## Overall observations

1. The tokens are right: two weights, 1px lines, 8px steps, no red, a tilde on rough figures, and "needs X" in empty states. Most defects sit in the seams: three CSS specificity collisions (N1, N3, N28) and three formatting helpers (N9, N10, N11). About six small changes would move most scores up a point.
2. Charts are the weakest layer. A fixed 720 viewBox shrinks the labels (5px at 390), labels clip and collide, gold marks targets rather than wins, and amber carries meaning alone. Size the charts to their host, test at 390, and give every coloured mark a text twin.
3. The client view is the coach view at a larger size, not an edited one. Client Measure shows 48 tiles of coach jargon with truncated plain-language labels, about 5,700px long at 390. The one-pager already defines what a client should see; client Measure should start from it (N13).
