# Polish pass: one rhythm (Level 16, MR-079)

The owner's brief: "a ton of things are uneven or there's more space than there
needs to be ... would a graphic designer be proud to show off this work? Would
a usability tester be proud to use it? Would a presenter be proud to show it?"
So this pass measured first and fixed second.

## How it was measured

A script walked every screen in `tests/ui-screens.js` at 1440px and 390px, in
Coach and Client view, with the Leah household (364 screens), and recorded:
the height of every control; every margin, padding and gap off the 4px scale;
the font sizes in use; gaps over 40px between siblings; panels with over 40px
of air under their last child; numeric inputs with no keyboard hint; tap
targets under 24px; paragraphs wider than a reading measure. Then every
screenshot was read by eye. The sweep in `tests/ui.js` now keeps the rhythm
(control heights, number keyboards, heading tags) on every screen it visits.

What the numbers said before: buttons at 20, 24, 26, 28, 30, 32 and 40px;
inputs at 24, 28, 30 and 32px; 26 panels stretched to a neighbour's height
with air below; 40 numeric inputs that opened a text keyboard on a phone,
three of them spinner inputs; four charts with colliding or cut labels.

## Systemic changes

| # | Problem | Change |
|---|---|---|
| S1 | Panels in a grid stretched to the tallest sibling: 450px of air under a one-row table on Clients, four nearly empty panels on Map, a Rooms panel taller than its orbit on the Plan | `.grid { align-items: start }`: a panel is as tall as its content |
| S2 | Three control heights side by side (24px small buttons, 28px fields, 30px checklist inputs, 24px filter selects) | One height for every standalone control, `--field-h` (28px); table rows keep 32px; "small" means a smaller word, not a shorter button |
| S3 | A tag after a heading touched the heading ("Household facts4 of 5 in", "Keep more Keep more") | One rule for every `h2 .tag` and `h3 .tag`; the Levers tag carries only what the heading does not say |
| S4 | Prose ran the full 1180px column (chart notes, hints, muted paragraphs) | A 72ch reading measure on panel prose, sub-heads, chart notes and hints |
| S5 | Empty bordered panels (Transactions before an import) | `section.panel:empty` is hidden |
| S6 | Phone keyboards: 40 numeric boxes opened a text keyboard; three were spinner inputs | Every money, percent, count and day box carries `inputmode` (decimal or numeric); no `type=number` anywhere |
| S7 | One way back | Backspace outside a field goes back a screen, beside the browser's Back; listed in the help panel |
| S8 | Off-scale spacing (3px list padding, 6px chart-note margins) | On the 4px scale |

## Per-screen changes

| Screen | Problem | Change |
|---|---|---|
| Today | Four unlock rings bunched left with 60% of the panel empty; a divider floating mid-panel; a five-line caption | Rings spread across the panel in a 4-column grid (2 on phones); the FI ring carries a hairline; the caption is "4.1% of the FI number" |
| Today, Clients | The Open button filled the whole last column (1183 to 1390px); "Open" next to the name meant the current client | The button is its own size; the state word is "Current" |
| Clients | The sessions list ran off the panel; the client panel stretched | S1 |
| Income and every room | The right column of the planet screen was empty at 1440px (the row-type list was hidden on wide screens) | The list sits beside the orbit at every width; the orbit column is 640px |
| Levers | The value column wrapped on every line ("3 years for $422 a / month"); group headings repeated their word | A 190px minimum, no wrap; S3 |
| Goals | The allocation table ran out of its half panel; "Dates first" broke mid-word | The bottom row is 3:2 (one column under 1100px); goal names never wrap |
| Cash flow calendar | Days before today had no box; December carried three empty weeks | Past days keep a quiet box; weeks after the run's last day are not drawn |
| Map | Panels stretched to the row's tallest (Awareness, Safety, Goals, Outcomes mostly air) | S1 |
| Scoreboard (coach) | The seventh tile sat alone on a third row | The coach's completeness tile is a wide low strip under the six |
| Session notes | Five side tabs read as underlined links; "Since last timeSep 17, 2026"; the unsure table's State column was cut | Tabs read as tabs; S3; the table drops its Where column when the panel is narrower than 720px and never breaks a word |
| Plan (Household facts) | Empty optional facts rendered as 70px dashed boxes, six of them stacking into 450px | A fact at rest in a form is a 28px field, dashed when empty |
| Program | The before-and-after sheet was narrower than the table above it | Full width on the Program screen |
| Transactions | A bare full-width input, a native file control and a button above the box it referred to; an empty panel below | A labelled row (From, File), the paste box under its own line, its button under the box; S5 |
| Assumptions | One 380px column of 40 fields down a 1200px page | Two columns from 1100px |
| Charts and numbers | Milestone labels collided; treemap names truncated ("Irregul..."); waterfall label rows crowded; debt-compared values cut | Milestones lay out in age order with three lanes above and one below; a treemap tile shows its name only when the name fits, else the amount; narrow waterfalls keep amounts in the tooltip; hbars give value text up to 45% of the width |
| Spending lines on a phone | Each stacked row was five labelled lines and a lone chevron | Name, amount, Details; state and source live behind Details |
| One page | The calendar lines sat tight against the sections around them | The same beat as the sections |

## Left for later (QUESTIONS.md 85 to 87)

- The one-pager's ten key-number boxes have sub-lines of different lengths, so baselines wander.
- Client Home at 1440px is three wide, calm panels; a narrower reading column may suit it.
- The discovery form's short fields (name, city, a count) are as wide as its text areas.
