# Level 0 critique - Home (coach and client, 1440 / 1024 / 390)

Reviewer stance: senior product designer, planning-software background. A 5 means ship unchanged.
Fix IDs in brackets point to section 2. Selectors refer to `ui/app.css`, `ui/tokens.css` and `ui/views/home.js`.

## 1. Scores

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| empty-home-coach-1440 | 3 [F1, F9] | 3 [F3, F4, F5] | 3 [F6, F7] | 4 | 3 [F8, F10, F11] | 3 [F1-F11] |
| empty-home-client-1440 | 2 [F2, F9] | 2 [F2, F3, F4] | 2 [F6, F7] | 2 [F2, F12] | 3 [F8, F11] | 2 [F2, F6, F12] |
| empty-home-coach-1024 | 3 [F1, F9] | 1 [F13, F3] | 3 [F6, F7] | 3 [F13, F14] | 2 [F13, F8, F10] | 1 [F13] |
| empty-home-client-1024 | 2 [F2] | 2 [F2, F4] | 2 [F6, F7] | 2 [F2, F12] | 3 [F8, F11] | 2 [F2, F6] |
| empty-home-coach-390 | 3 [F15, F9] | 2 [F16, F4] | 3 [F6, F7] | 2 [F16, F14] | 2 [F16, F8] | 2 [F16] |
| empty-home-client-390 | 3 [F15, F12] | 3 [F4, F17] | 3 [F6, F7] | 3 [F17] | 3 [F8, F11] | 3 [F4, F6, F17] |

Summary: nothing here is shippable as is. The 1024 coach view is broken (inputs overlap chips),
and the client view at desktop widths leaves the left half of the page empty.

## 2. Fixes (one per score under 4)

**F1 - The Sun is the primary content but sits in the right column.** Coach eye lands on Clients first.
Swap DOM order in `home.js` line 18 so `sun` is the first grid child and `clients`/`history` stack on the right,
or make the grid `grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)` with Sun left.

**F2 - Client view leaves an empty left column.** `.coach-only` hides Clients and History but the
`.stack` wrapper still occupies track 1, so Sun renders right of a 584px void. Add
`body[data-view="client"] .grid-2 { grid-template-columns: minmax(0, 720px); }` and
`body[data-view="client"] .grid-2 > .stack { display: none; }`, or apply F1 so the hole is on the right.

**F3 - Chips are detached from their field.** At 1440 the input ends at x=1192 and chips start at x=1281;
the 1fr track absorbs the slack. Use `.fieldrow { grid-template-columns: 160px var(--field-w-wide) auto auto; justify-content: start; }`.

**F4 - Dependents field is 112px, every other field in the column is 176px.** `.fieldrow .input.num`
overrides the width. Remove that rule inside `.fieldrow`; keep 112px only for numeric cells in tables.
Right-align the number inside the 176px box (`text-align: right` already applies via `.input.num`).

**F5 - Field row pitch is 33px, off the 8px grid.** `min-height: 32px` plus `padding: 2px 0` plus a 28px
field plus a 1px border yields 33. Set `.fieldrow { padding: 0; min-height: var(--row-h); }`.
Same for `.topbar .ghost` and `.view-toggle button` at `height: 26px`: use 24px.

**F6 - Input text is larger than its label.** Inputs inherit body 14px (16px in client view) while
`.fieldrow > label` is fixed at 13px, so "Empty client" outweighs "Name". Set
`.input, .select { font-size: var(--fs-13); }` and, for client view, scale both together:
`body[data-view="client"] .fieldrow > label, body[data-view="client"] .input, body[data-view="client"] .select { font-size: var(--fs-16); }`
with `--field-h: 32px` in that view.

**F7 - Third font weight.** `<strong>` around "12.9%" renders at browser-default 700. Add
`strong, b { font-weight: var(--w-semibold); }`. Also show "13%" not "12.9%"; one decimal is false precision on a fill score.

**F8 - Empty looks like a value.** Selects show "Choose" in ink at full size; the date input shows the native
"mm/dd/yyyy" mask. Give empty selects a disabled first option "Not entered" styled `color: var(--slate)`
(`.select:has(option[value=""]:checked) { color: var(--slate); }`). Replace the native date picker
chrome or at least set `input[type=date]:invalid { color: var(--slate); }` with `required`. Dates elsewhere read
"5 Oct 2026"; the field should display the same format once filled.

**F9 - Copy is a metaphor, not a label.** "The Sun holds the facts that belong to no planet" tells a coach nothing.
Use "Household facts" as the panel title with "The Sun" as a secondary tag if the metaphor must stay, and
subtitle "Who the household is. Everything else hangs off these seven facts." Fix "1 lines" to "1 line"
(pluralize in `home.js` line 137). "Sun: name" in History should read "Name" with the panel shown as a
`.chip.src` ("Household"). "unknown" in the From column should be "Not entered" in slate.

**F10 - Selected client row is indistinguishable from the header.** Both use `--sapphire-100`. Change
`table.data tr.selected td` to `background: var(--paper); box-shadow: inset 2px 0 0 var(--sapphire-700)` on the first cell
(or a 2px left border), and add an "Open" text chip in the row so state is not colour alone.

**F11 - Planet row counts are a run-on sentence.** "Income: 0 rows, Spending: 0 rows, ..." is tabular data set as prose,
wrapping mid-label ("Safety Net: 0 / rows"). Render as a two-column `table.data` (planet left, count right, tabular),
or a single line "0 of 7 planets have rows". Hide it in client view (`coach-only`); "Sun confidence" is coach vocabulary.

**F12 - Client view shows editable empty inputs to the client.** On a shared screen the client sees seven blank
boxes and "Sun confidence". Show values as read-only text rows (`.fieldrow` with a `<span class="num">`), "Not entered"
in slate where null, and move the confidence line to `coach-only`. This also fixes the empty-page density.

**F13 - Inputs overlap chips at 1024 (coach).** The panel is ~395px wide; 160px label + fixed 176px input +
two auto chip tracks exceed it, so the input runs under "Known"/"Unknown" and "mm/dd/yy" is clipped.
Use `.fieldrow .input, .fieldrow .select { width: 100%; max-width: var(--field-w-wide); }`, drop the label
track to 128px, and collapse `.grid-2` to one column below 1280px. Better: make `.panel` a container
(`container-type: inline-size`) and switch `.fieldrow` layout with `@container (max-width: 520px)`.

**F14 - Clients toolbar wraps and the name input is unlabeled.** At 1024 and 390 "Import JSON" drops to a second line
under an input with no placeholder or visible label. Add `placeholder="New client name"` (or a visible label), shorten
"Import JSON" to "Import", and set the row to `flex-wrap: nowrap` with the input `flex: 1`. Make Delete a
`.btn.quiet` so it does not carry the same weight as Export.

**F15 - Header wastes space at 390.** "Home" and the subtitle wrap with a 16px gap, pushing content down 40px.
Set `main > header { row-gap: var(--s-1); }`; drop the subtitle below 720px if F9 copy is still long.

**F16 - Coach 390 field rows take three lines each.** The state chip sits right of the input and the source
chip wraps alone onto a third line, making the Sun panel ~800px tall. Use grid areas:
`grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "label state src" "input input input";`
so label and both chips share line 1 and the full-width input sits on line 2.

**F17 - Client 390 rows are cramped against the divider above.** Labels touch the previous row's border.
Use `.fieldrow { padding: var(--s-1) 0 var(--s-2); row-gap: var(--s-1); }` below 720px.

## 3. Overall observations

1. **Client view is a filter, not a layout.** It is built by hiding `.coach-only` nodes and bumping body font-size,
   which leaves a hole where the panels were (F2), grows inputs but not labels (F6), and still exposes coach
   vocabulary ("Sun confidence", row counts). Define the client view as its own composition at Level 0: one left
   column, read-only values, a single type scale token (`--fs-base`) that every label, value and field height derives from.
2. **The field row is the core component of every future room and it is not width-safe.** It mixes a fixed-width input
   with fluid and auto tracks, so it breaks wherever the panel narrows (1024 coach) and sprawls where it widens
   (1440 chips 90px from their field). Lock it now: fixed tracks with `justify-content: start`, container queries on
   `.panel` instead of viewport media queries, 32px pitch, one field width per column. Add a 1024 coach case to
   `tests/` so overlap is caught before Level 1 multiplies this row across planets.
3. **Empty states read as data or as jargon.** "Empty client" is used as the demo client's name (it appears in the top bar,
   the Clients table and as a History value), selects say "Choose" in ink, dates show "mm/dd/yyyy", History says "unknown",
   and planets say "0 rows". A coach cannot tell "not entered" from a value at a glance. Pick one empty token
   ("Not entered", slate, regular weight) and use it everywhere null is shown; rename the demo client to a real-looking
   placeholder household ("Example household") behind the example-numbers path.
