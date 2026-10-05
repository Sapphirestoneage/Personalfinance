# Level 1 (Capture) design critique

Reviewer stance: senior product designer, coach-driven planning tool, workpaper feel.
Scores 1-5 (4 = a human designer would ship with minor notes). Each score under 4 cites
the fix that would lift it; fixes are shared across screens because most issues are
systemic (one CSS rule or one copy string fixes several screens).

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| jordan-home-coach-1440 | 3 L8 | 2 L1 | 3 L32 | 3 L6 | 2 L2 | 3 L5 |
| jordan-home-client-1440 | 4 | 2 L1 | 4 | 3 L30 | 3 L3 | 3 L4 |
| jordan-home-coach-390 | 3 L8 | 4 | 2 L9 | 3 L5 | 3 L7 | 2 L10 |
| jordan-home-client-390 | 4 | 4 | 2 L9 | 4 | 3 L8 | 3 L4 |
| jordan-income-coach-1440 (planet map) | 3 L12 | 3 L1 | 3 L11 | 2 L14 | 3 L15 | 3 L13 |
| jordan-income-coach-390 | 3 L12 | 4 | 3 L11 | 3 L14 | 4 | 3 L13 |
| jordan-income-w2-coach-1440 | 3 L20 | 2 L16 | 3 L11 | 3 L31 | 3 L29 | 3 L17 |
| jordan-spending-lines-coach-1440 | 3 L20 | 2 L18 | 3 L19 | 4 | 2 L21 | 2 L22 |
| jordan-spending-lines-client-1440 | 3 L20 | 3 L18 | 4 | 4 | 3 L22 | 3 L29 |
| jordan-spending-lines-coach-390 | 2 L23 | 3 L12 | 3 L11 | 2 L34 | 3 L21 | 1 L23 |
| jordan-debt-cards-coach-1024 | 3 L29 | 2 L24 | 3 L33 | 3 L22 | 2 L18 | 2 L21 |
| jordan-invest-accounts-coach-1440 | 3 L20 | 2 L17 | 3 L11 | 3 L22 | 2 L26 | 2 L18 |
| jordan-life-goals-coach-1440 | 3 L29 | 3 L16 | 3 L11 | 3 L25 | 2 L27 | 3 L25 |
| empty-spending-lines-coach-1440 | 3 L28 | 2 L24 | 4 | 3 L33 | 3 L34 | 3 L28 |

## Fixes

- L1 Map and its panel are centred (`.orbit`, `.maphost`, `.mapbar` all use `margin: 0 auto`) while the h1 and `.home-grid` start at the left gutter, so there are two left edges. Set `.maphost, .mapbar { margin-left: 0; }` and keep `max-width: 760px`; in client view the map, panel and 720px facts card then share one edge.
- L2 Gold is decided on the raw fraction (`orbit.js`: `it.fill >= 0.9`) but the sidenav prints `Math.round(fill * 100)`. Debt reads "90%" with a blue ring while Taxes reads "90%" with a gold one. Compare the rounded value in both places: `Math.round(it.fill * 100) >= 90` (centre and satellites).
- L3 Three names per planet: sidenav "Debt", map "Debt and Credit", crumb "Debt and Credit"; also title case breaks the sentence-case rule. Use one sentence-case set in `engine/sun.js` PLANET_LABELS ("Debt", "Safety net", "Investments", "Life plan") and read it in the sidenav too.
- L4 Satellite confidence is colour only (gold vs sapphire arc); the % exists only in the sidenav. Pass `badge: '91%'` per item in `home.js` and restyle `.orbit-badge { fill: var(--slate); }`; keep amber for a text badge like "Needs 2".
- L5 History table is clipped at the card edge ("Retiren", "~$60,0") and From is almost always "Not entered". Drop the From column on Home and give `.history td:last-child { max-width: 128px; overflow: hidden; text-overflow: ellipsis; }`.
- L6 Household facts card stretches to History's height, leaving ~260px of blank card. Add `.home-grid { align-items: start; }`.
- L7 Copy: delete the "The Sun" tag (`home.js` `.tag.coach-only`) and change the sub "Facts enter through the Ledger only." (contradicted by the editable facts below) to "Pick a planet to open it."
- L8 Copy: "Hover or focus a planet to see what it needs." means nothing on touch or to a client watching. Default the panel to the weakest planet: "Life plan is at 64%. Needs a target date for 1 goal." with button "Open life plan" (`home.js` line 68).
- L9 At compact size the centre sub "98% of the household facts" (10px in a 132px disc) runs past the circle, and labels are 11px. Copy "98% complete"; set `GEOM.compact.label: 12`, `sub: 11`.
- L10 Phone tab strip cuts "Debt 90%" with no cue. Under 720px hide `.sidenav .fill-text` so the tabs fit, and shorten labels per L3.
- L11 `body { font-feature-settings: 'tnum' 1, 'cv11' 1 }` makes hyphens render wide: "W- 2 job", "Take - home", "High - yield", "1500 - 2000". Keep `cv11` on body; apply `tnum` only to `.num, table.data td, .kpi .value, .fill-text`.
- L12 The breadcrumb sits to the right of the h1 (`main > header` is a baseline flex row), then wraps under it at 390; the reference puts it on top. Render `nav.crumbs` before the h1 on its own 16px line and drop the last crumb, which repeats the h1.
- L13 Planet panel is a dead end: only "Back to the household" (`ledger.js` line 58). Add a primary "Open W-2 job" (first row type with needs, else first with rows) and make "Back" secondary.
- L14 Below the planet map there is nothing, about 60% of the 1440 canvas. Under `.mapbar` list each row type as one 32px `table.data` row: type left, rows and confidence right. No new fields, and the map becomes scannable.
- L15 The dashed "Other" circle uses stroke style alone to say "optional". Label it "Other (optional)" in `ledger.js` items.
- L16 Cell text sits 5px right of its header: `table.data td .input` has `padding: 0 4px` plus a 1px border, `th` has `padding: 6px 8px`. Add `table.data td .input, table.data td .select { margin-left: -5px; }` (and `margin-right: -5px` on `.num`).
- L17 The 64px `.cell-money .select.cad` sits to the right of each figure, so right-aligned headers ("Take-home", "Contribution") end 70px past the numbers. Move cadence into its own narrow "Per" column, or give `th.num` in cadence columns `padding-right: 72px`.
- L18 Mixed precision in one column: "$2,150" next to "$142.00", "$0" next to "$250.00", because `dollars()` drops cents at $1,000+. In `table.js` `display()` case 'money' call `F.dollarsWhole`; keep cents in the drawer.
- L19 The rough tilde shifts digits left ("~$310.00" vs "$420.00"), and the State chip already says Rough. Drop the tilde inside ledger cells (keep `.rough-value` colour plus chip); keep it in prose and KPIs.
- L20 No total anywhere on a money table; `table.data tfoot td` is styled but `table.js` never renders a tfoot. Render "Total a month" from the engine's existing `detailCents` (one formula, one function).
- L21 Text inputs are 112px (`--field-w`) and selects 144px inside 200px+ columns, so "Hudson Yards Re", "American Exp", "Utilities and subscri" clip with no ellipsis. `.ledger-table td .input:not(.num), .ledger-table td .select { width: 100%; text-overflow: ellipsis; }`; the column sets one width for every field in it.
- L22 Last columns are silently off the right edge ("Shared or reimbursed", "Contributed", "Card"). Remove the Conf. column (the field bar already shows "conf. 90%"), and make `.ledger-table td:first-child, th:first-child { position: sticky; left: 0; background: var(--paper); border-right: 1px solid var(--line); }`.
- L23 At 390 only Name and Paid to are visible; the amount, the one number that matters, needs a sideways scroll. Order columns name, headline money, State, then the rest, and cap `td:first-child` at 144px under 720px.
- L24 Sidenav % and Alt badges float: at 1024 labels wrap ("Safety / Net") and Alt+6 crosses the border; in the empty household the % is absent so badges jump left. `.sidenav a { display: grid; grid-template-columns: minmax(0,1fr) 32px 48px; white-space: nowrap; }`, always render `.fill-text` (show "-" when null), hide `.kbd` under 1100px.
- L25 Empty text cells are blank ("Who or where", "As of", "Private note", "Paid to"), unlike Home's "Not entered". Empty is not zero, and it is not blank either: add `placeholder="Not entered"` in `table.js` text editors with `::placeholder { color: var(--slate); }`.
- L26 "n/a /mo" prints a cadence for a non-applicable value. In `table.js` hide `.select.cad` when state is not-applicable and render "Not applicable" as `.empty-token`.
- L27 Flag is a raw browser checkbox, the only control outside the chip language. Render a `.chip` toggle reading "Flagged" or "Not flagged".
- L28 Empty state shows two primary buttons ("Add row" and "Add the first row") and stiff copy. Hide the toolbar's Add row when `all.length === 0`; copy "No spending lines yet" with "Add a line" primary and "Use national averages" secondary.
- L29 h1 is the singular type label over a list: "Spending line", "Credit card", "Account", "Goal". Use plurals: "Spending lines", "Credit cards", "Accounts", "Goals".
- L30 Client view still shows the Alt+1..8 badges and leaves the right half empty. `body[data-view="client"] .sidenav .kbd { display: none; }` and cap `.maphost` at 720px in client view so map and facts form one column.
- L31 Off-grid spacing: `.sidenav a { padding: 6px }`, `table.data th { padding: 6px 8px }`, `table.data td { padding: 2px 8px }`, `.chip { padding: 0 6px }`, `textarea` 6px. Move to 4 or 8. `.fieldrow` dividers use `box-shadow`; switch to `border-bottom: 1px solid var(--line-soft)`.
- L32 "LEDGER" (`.sidenav .group`) and `h3 { text-transform: uppercase }` break sentence case. Remove the transform; use slate 12px regular.
- L33 Field bar copy is long, wraps to an orphan "zero." at 1024, and repeats the empty-state hint. Copy: "Pick a cell for its state and source. ~ rough, ? unknown, 1500-2000 range, send, 0 is a real zero." Hide `.fieldbar` when there are no rows.
- L34 Filters show for 0 or 1 row and stack three rows high at 390. Render `.toolbar .filter` only when rows > 5, and never under 720px.

## Overall

1. The map has the reference's parts (big centre, ring, spokes, dashed orbit, counts inside, labels under, crumbs, panel) but it does not tell the coach anything yet. Confidence shows as arc colour only, the panel waits for a hover, and the planet map leads nowhere. Fixing L4, L8 and L13 makes it something a coach can work from in a session, not just a pretty view.
2. The Ledger is the closest to the workpaper brief: chips carry text, borders are 1px, there are two weights (400/600), no gradients and no red. It loses points on table details, all in `table.js` and the `table.data` rules: cells offset from headers, mixed cents, the cadence select breaking the right edge, clipped inputs, hidden columns, no total. One systemic pass (L16-L22) lifts all six ledger screens at once and is the best return on effort.
3. Smaller widths and the client view look unfinished, and the vocabulary drifts. At 390 the ledger hides its number, at 1024 the sidebar wraps, client view still shows keyboard shortcuts, and each planet has up to three names across the sidebar, map and crumbs, plus "The Sun". Pick one label set (L3) and test 1024 and 390 before calling Level 1 done.
