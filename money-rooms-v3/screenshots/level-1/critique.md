# Level 1 (Capture) design critique, round 2

Same stance as round 1 (`critique-round1.md`): senior product designer, coach-driven tool, workpaper feel.
Scores 1-5; 4 = a human designer would ship with minor notes. Every score under 4 names its fix.

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| jordan-home-coach-1440 | 4 | 3 M23 | 4 | 3 M5 | 3 M7 | 3 M4 |
| jordan-home-client-1440 | 4 | 4 | 4 | 4 | 3 M1 | 4 |
| jordan-home-coach-390 | 4 | 3 M9 | 4 | 3 M6 | 3 M8 | 3 M6 |
| jordan-income-coach-1440 | 4 | 4 | 4 | 3 M12 | 3 M11 | 3 M3 |
| jordan-income-coach-390 | 4 | 4 | 3 M10 | 4 | 3 M8 | 3 M3 |
| jordan-income-w2-coach-1440 | 4 | 4 | 3 M2 | 4 | 3 M13 | 4 |
| jordan-spending-lines-coach-1440 | 4 | 3 M16 | 4 | 4 | 3 M17 | 4 |
| jordan-spending-lines-client-1440 | 4 | 4 | 4 | 4 | 3 M15 | 3 M14 |
| jordan-spending-lines-coach-390 | 4 | 2 M18 | 4 | 3 M14 | 3 M8 | 2 M18 |
| jordan-debt-cards-coach-1024 | 4 | 4 | 4 | 3 M22 | 3 M1 | 4 |
| jordan-invest-accounts-coach-1440 | 4 | 4 | 3 M2 | 4 | 3 M19 | 3 M14 |
| jordan-life-goals-coach-1440 | 4 | 4 | 4 | 4 | 3 M20 | 4 |
| empty-spending-lines-coach-1440 | 4 | 4 | 4 | 4 | 3 M21 | 4 |

Round 1 had 69 scores under 4 on these 13 screens (twenty 2s, one 1); round 2 has 32, all 3s except two 2s on the 390 ledger.

## Fixes

- M1 The sidenav still prints the long names and cuts them: "Debt and ...", "Investmen..." (1440) and "Debt and cre..." (1024), while the map and crumbs show the full name. `PLANET_SHORT` already exists in `engine/sun.js`: use it for the nav label in `ui/routes.js` line 15 ("Debt", "Investments").
- M2 Wide hyphens are still there: "Take - home" (`th.num`) and "High - yield savings" (`td`). Inter's tabular figures widen the hyphen, and `app.css` line 87 still applies them to `.num` and every `table.data td`. Change it to `table.data td.num, table.data tfoot td, .kpi .value, .fill-text, .orbit-count`, and add `table.data th.num { font-variant-numeric: normal; }`.
- M3 The primary button reads "Open w-2 job" because `ledger.js` line 70 and `home.js` line 74 call `.toLowerCase()` on the whole label. Add a `lowerFirst()` helper that lowercases only the first letter, and only when the second letter is already lowercase. Then the buttons read "Open W-2 job" and "Open life plan".
- M4 The panel says "Life plan is at 64%" and then "Every row has its headline figure." That contradicts the number, and the coach cannot tell what to fix. When `needs` is empty and the fill is under 90%, name what holds it back, for example "2 rows. 1 figure is rough; confirm the cost to raise it." (`home.js` line 74, `ledger.js` line 70).
- M5 The map sits alone in a 760px column with about 420px of blank space to its right, and History starts below the fold. Put `.maphost` and `.mapbar` in the first column of `.home-grid { grid-template-columns: minmax(0, 760px) minmax(0, 1fr); }` with Clients and History in the second column from the top. Map, panel and facts then share one right edge (it is 992 vs 932 today).
- M6 History at 390 clips the Now column ("impo", "Retir", "$1,4"), and at every width the planet chip and the field share one cell, so "Imported file" starts 70px left of the other entries. Move the chip into its own `td.where`, hide `.history .where` under 720px, and show "5 Oct 04:30" when an entry is not from today; right now 04:30 sits above 15:33 with no date.
- M7 Three date formats appear on one screen: "1999-03-14" in the coach facts, "14 Mar 1999" in client view, "5 Oct 2026" in Clients. Display "14 Mar 1999" in the coach field and parse on blur. Also, a "None" state chip beside Dependents 0 reads as "no dependents"; relabel `.chip.state-none` "No state".
- M8 The phone tab strip still cuts off at "Safety n" with no cue that it scrolls (L10 is only half done). With M1's short labels, add `@media (max-width: 720px) { .sidenav { flex-wrap: wrap; overflow-x: visible; } .sidenav a { padding: 8px; } }` so the eight tabs show in two 36px rows.
- M9 At 390 the facts inputs go full width, so Dependents "0" lands 300px from its label at the far right. Keep the number fields at column width: `.fieldrow .input.num { max-width: var(--field-w); }` inside the 560px container query.
- M10 At 390 the centre sub "2 rows, 91% confidence" touches the edge of the disc. Change the copy to "2 rows, 91%"; the word confidence is already implied by the ring.
- M11 In the row-type table the Needs column is blank in all five rows, and empty types print a lowercase "empty". In `ledger.js` lines 56-60, drop the Needs column when no type has needs, and print "No rows" as `.empty-token`. Also label the last row "Other (optional)" to match the map.
- M12 On the planet page, map, panel and table sit in a 760px column with 424px blank on the right. At 1280px and wider, put the row-type table beside the map: `.planet-grid { display: grid; grid-template-columns: minmax(0, 760px) minmax(0, 1fr); gap: 16px; align-items: start; }`.
- M13 The W-2 table totals Gross pay ($6,500) but not Take-home, and the Per column repeats its header ("Per /pay"). In `table.js` lines 113-124, total every money column that has a cadence, and print cadence as "pay", "mo", "yr" without the slash.
- M14 Trailing columns are still cut at the right edge with no cue: "In th"/"Yes" in client spending, "Contribute" on accounts. That breaks L22's intent. Move the low-use columns (Shared or reimbursed, In the budget, Contributed) to the row drawer, so each table fits at 1440 and the screen has fewer fields.
- M15 Rough amounts are ink in coach cells but sapphire in client view (~$310, ~$1,800). Make one rule: `table.data td .input.rough, .rough-value { color: var(--sapphire-700); }`.
- M16 The three filter selects are three widths (114, 120, 172px), and Paid to is free text, so as a filter it lists every payee. Set `.toolbar .filter .select { width: 144px; }` (same width for every field in a row) and filter by Category in place of Paid to.
- M17 Category clips ("Utilities and subs...", "Irregular and ann...") at 144px, while the next column has room. Give category selects `--field-w-wide`: `.ledger-table td .select.wide { width: var(--field-w-wide); }`.
- M18 At 390 the names overrun the sticky column: "Clothing and personal care" runs across the divider into Amount. Line 262 caps the width but does not clip. Add `overflow: hidden; text-overflow: ellipsis;` to `.ledger-table td.sticky` there, and `padding-right: 16px` on the last cell so the State chip is not half cut.
- M19 Not-applicable cells print a lowercase ink "n/a", unlike "Not entered" elsewhere. `table.js` line 196: return `h('span', { class: 'empty-token' }, 'Not applicable')`.
- M20 The Flag toggle is a 24px bordered ink button, not a 20px chip, and a one-row table still gets a Total row that repeats ~$60,000. Give the toggle the `.chip` class, and render the tfoot only when there are 2 or more rows.
- M21 The empty state shows "Use national averages" twice (header and card) and a "0 rows" toolbar above "No spending lines yet". Render the header button (`ledger.js` line 118) and the count (`table.js` line 83) only when there is at least 1 row.
- M22 The Card column repeats issuer and nickname and clips ("Chase Freedom Unlim..."). Show it in the drawer only, or replace the Lender column with it.
- M23 On the facts card the source chips do not line up: "Client" moves left on the Dependents row because the state column is `auto` ("None" is narrower than "Verified"). Set `.fieldrow { grid-template-columns: 128px var(--field-w-wide) 72px 64px; }` and make the chips fill their cell.

## Which L fixes landed

- Landed: L2, L4 (the % shows as text under each label), L5, L6, L7, L9, L12, L14, L15, L16, L17, L18, L20, L23, L24, L26 (cadence hidden), L27, L28, L29, L30, L31, L32, L33, L34.
- Partly landed: L1 (the map is left-aligned, but the panel and facts card still end at different right edges; M5). L3 (sentence case done, but the nav still shows the long names; M1). L8 (the panel opens on the weakest planet, but its copy contradicts the %; M4). L10 (the % is hidden, but the strip still clips; M8). L11 (body is fixed, but `td` and `.num` still get tabular figures; M2). L13 (the primary button exists, but the label is lowercased; M3). L21 (the ellipsis is in, but selects are still 144px; M17). L22 (Conf. is gone and the first column is sticky, but the last columns still clip; M14).
- Skipped as agreed: L19 (the tilde stays and digits stay right-aligned). L25: the CSS "Not entered" works in Paid to, Who or where and As of.

## Overall

1. This is a real step up. The ledger now reads like a workpaper: headers sit over their cells, money is whole dollars in tabular figures, there are totals, a sticky first column and plural titles, and nothing important is hidden at 1440. The W-2, credit cards and goals screens are at the point where a designer would ship them with notes. What remains is mostly small details in `table.js` (M2, M13, M14, M19), not structure.
2. The weakest part now is the copy, not the layout. "Open w-2 job", "Every row has its headline figure." under 64%, "n/a", "empty", "Per /pay", "send" in the field bar, and three date formats. A coach reads these words aloud in front of a client. One string pass (M3, M4, M7, M11, M19) is cheap. Also reword the field bar to "... send if the client will send it ...".
3. The 390 and 1024 widths still lag behind 1440. One shared fix (short planet labels everywhere, M1) solves the nav at 1024 and most of the phone tab strip (M8). M18 is the only bug left that a client would notice: text overlapping text. Fix M18 first, then re-shoot all three widths before calling Level 1 done.

## After round 2 (builder's note, not a reviewer score)

Fixes M1 to M23 were applied and the screenshots re-shot, with two exceptions
stated plainly: M14 and M22 (moving low-use columns into a row drawer) are not
done; the first column is sticky and the table scrolls sideways instead. The
reviewer did not re-score; Level 2 replaces the Home map's panel with metrics
and gets its own rounds.
