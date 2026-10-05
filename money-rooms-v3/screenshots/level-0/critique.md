# Level 0 critique, round 3 - Home (coach and client, 1440 / 1024 / 390)

Rounds 1 and 2: F1-F17 in `critique-round1.md`; G1-G12 status in section 3. 4 = ships with minor notes. H1-H8 are new.

## 1. Scores

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| empty-home-coach-1440 | 4 | 3 [H1, H2] | 4 | 4 | 3 [H4, H7, H8] | 3 [H1] |
| empty-home-client-1440 | 4 | 3 [H3] | 4 | 4 | 4 | 3 [H1] |
| empty-home-coach-1024 | 4 | 3 [H2] | 4 | 4 | 3 [H4, H7] | 4 |
| empty-home-client-1024 | 4 | 3 [H3] | 4 | 4 | 4 | 3 [H1] |
| empty-home-coach-390 | 4 | 4 | 4 | 4 | 3 [H4, H6] | 3 [H5] |
| empty-home-client-390 | 4 | 4 | 4 | 4 | 4 | 4 |

Summary: rhythm and type are right everywhere now (40px pitch, sentence case, clear empty tokens); client 390 ships.
The G11 fix caused a one-line desktop regression (H1). Left: panel sizing (H2, H3), one field width (H4), 390 tables (H5).

## 2. Fixes (one per score under 4)

**H1 - Sidebar stops mid-page (regression from G11).** `.layout { align-content: start }` (app.css line 57) now applies at
every width, so the white sidebar and its 1px rule end at y=535 (coach 1440) and y=493 (both client views) with page grey
below. Remove `align-content: start` from line 57 and add `.layout { grid-template-rows: auto 1fr; }` inside the 720px query.
**H2 - Ruled rows stop inside the panel (G2 partial).** Rows are capped at 640px (line 119) but the panel is 700px at 1440
and 808px at 1024, so dividers end 43px and 150px short of the border, after ~200px of empty rule past the chips.
Set `.fieldrow { max-width: none; }`, `.home-grid { grid-template-columns: minmax(0, 512px) minmax(0, 1fr); }`, and in the
1100px query `.home-grid { grid-template-columns: minmax(0, 640px); }`. Rules then span the panel; chips end 40px from it.
**H3 - Client panel wider than its rows (G9 partial).** Panel is 720px, rows stop at 560px: 140px of empty card on the right.
Line 223: `body[data-view="client"] .home-grid { grid-template-columns: minmax(0, 592px); }` (560 + 2 x 16 padding).
**H4 - Clients name field still swings 202 / 240 / 93px (G6 not landed).** Inline styles in `home.js` lines 44-47
(`flex: 1`, `maxWidth: 240px`, `flexWrap: nowrap`) override any CSS. Delete them, then
`.panel .row .input { flex: 0 0 var(--field-w-wide); }` and
`@container (max-width: 400px) { .panel .row { flex-wrap: wrap; } .panel .row .input { flex-basis: 100%; } }`.
**H5 - Tables still clip at 390 (G7 not landed).** `scrollbar-width: thin` draws nothing with overlay scrollbars; "Export"
and "Exam..." are cut at the panel edge. Add `class: 'col-optional'` to the Last saved and From th/td in `home.js` and
`@media (max-width: 720px) { .col-optional { display: none; } }`. Both tables then fit 324px without scrolling.
**H6 - Undo still hidden at 390 (G8 partial).** Line 253: drop `.topbar #undo`; add `.topbar .brand { display: none; }`.
**H7 - Birth date is still native (G4 partial).** Overlay works; the ink calendar glyph sets it apart and focus shows "mm/dd/yyyy".
`.input[type="date"]::-webkit-calendar-picker-indicator { display: none; }`; real fix: `type: 'text'`, home.js line 106.
**H8 - Sidebar meter still drawn at 1440 (G12 partial).** "13%" text landed, but the 32x4px bar with a 5px stub still sits
before it, plus a mono "Alt+1" key (third typeface in a 208px column). `.sidenav .fill, .sidenav .kbd { display: none; }`;
delete the `.fill` span at app.js line 162. Harness: "New client" is still captured in hover colour at 1440.

## 3. Round 2 fixes

| Fix | Status | Note |
|---|---|---|
| G1 8px pitch | Landed | 40px rows at all six; 390 coach rows 72px |
| G2 Sun dead zone | Partial | Rows capped, panel not resized (H2) |
| G3 Sentence case tag | Landed | "The Sun" 12px slate; hidden for client |
| G4 One empty token | Partial | Inputs and selects say "Not entered"; date glyph remains (H7) |
| G5 Open chip | Landed | Quiet source-style chip, now distinct from Export |
| G6 Name field width | Not landed | Inline styles win (H4) |
| G7 390 table clip | Not landed | Thin scrollbar only, invisible in capture (H5) |
| G8 390 save state | Partial | "Saved" shown; Undo hidden (H6) |
| G9 Client gap | Landed | Values 208px from labels; panel still 720px (H3) |
| G10 Client title | Landed | 20px title clearly outranks 16px values |
| G11 390 nav strip | Landed | Tab is 38px tall; caused H1 on desktop |
| G12 Text meter | Partial | "13%" text added; bar still drawn (H8) |

## After round 3 (builder's note, not a reviewer score)

Fixes H1 to H8 were applied and the six screenshots re-shot: the layout rule
that leaked to desktop is gone, rows run to the panel border in both views, the
name field is a fixed 240px, narrow tables drop their Last saved and From
columns, Undo shows at 390, the birth date is a typed YYYY-MM-DD field, and the
sidebar shows the fill as text only. The reviewer did not re-score; the next
scored round is Level 1's, which replaces Home with the orbit map (MR-010).
