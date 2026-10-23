# Level 2 design critique, round 2 - Measure and One-pager

Reviewer stance: senior product designer, eMoney / audit-workpaper bar. 4 = a human designer ships it with minor notes. Round 1 is in `critique-round1.md`. Every score under 4 names one fix (P-number below); one fix may cover several cells.

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| maya-measure-coach-1440 | 4 | 3 P3 | 3 P1 | 4 | 3 P2 | 3 P4 |
| maya-measure-client-1440 | 4 | 4 | 3 P8 | 4 | 3 P7 | 3 P7 |
| maya-measure-coach-390 | 3 P17 | 4 | 2 P5 | 3 P17 | 3 P2 | 2 P5 |
| maya-onepager-coach-1440 | 4 | 4 | 3 P5 | 4 | 3 P14 | 3 P14 |
| maya-onepager-client-390 | 4 | 3 P15 | 2 P5 | 3 P16 | 2 P14 | 3 P14 |
| extreme-measure-coach-1440 | 3 P10 | 3 P12 | 2 P9 | 3 P6 | 3 P11 | 2 P10 |
| empty-measure-coach-1440 | 4 | 4 | 4 | 4 | 3 P13 | 4 |
| maya-home-client-1440 | 4 | 4 | 4 | 4 | 4 | 4 |

Movement since round 1: client Measure went from 2s to mostly 4s (N3, N13), the 1440 coach grid now lines up (N1, N2, N6), and Home is a clean 4. What holds scores at 3 is charts (N16 still open) and a handful of formatting seams.

## Fixes

Measure tiles (ui/app.css, ui/views/measure.js)
- P1 `.kpi .value` is `nowrap; text-overflow: ellipsis`, so the compound "Effective and marginal federal rate" prints "~10.9% / 22...." at 1440 and 390. A truncated number is never acceptable. In `kpi()` put the first figure in `.value` and the second in `.range` ("22% marginal").
- P2 List tiles use two renderers. DRAFTT shares, Tax bucket mix and Allocation are mini tables; Card net value, "Total, invested and liquid assets", "Room left under limits" and "Lean, Fat and Barista FI" are still prose joined with semicolons, in blue with no tilde. Send every list through the mini table in `listSummary()`, ink unless rough, with a tilde per rough row. At 390 the label column truncates ("Accommod...", "Transportati..."), so use the short labels from data/.
- P3 Every tile in a row stretches to match its tallest list tile (DRAFTT shares and Tax bucket mix make rows 157px tall, with 60px of blank space in the other five tiles). Add `.kpi.list { grid-row: span 2; }` with `grid-auto-flow: row dense` on the group grid so headline tiles stay 92px.
- P4 `.lens .impact` prints "no $ figure" in bold in the money column (3 of 9 Maya lenses). Show the lens' own figure ("29.3% reachable", "$27 an hour", "12 months sooner") in measure.js line 136, as N6 asked.
- P8 Client: `body[data-view="client"] .panel > h2` (20px) makes "Lenses" larger than "Key numbers" and "Charts", and runway renders as a 13px list ("3 / 4 / 4 months") among 24px values. Give section headings one style. Render runway as "3 months", with "4 needs only, 4 lean" in `.range`.
- P17 At 390 the five stage chips take 4 rows (about 120px) before the first number, and `.lens .impact` takes 110px of the line, so lens sentences run 4-5 lines. Under 720px collapse `.stage-row` to one line ("Stages 1-5 have rows") and put `.lens .impact` on its own line under `.text`.

Charts (ui/charts.js)
- P5 N16 is still open. `.chart-label` is 11px in a 720 viewBox: about 9px in the 1440 grid, about 6px on the one-pager, and 4px at 390 (one-pager and coach Measure). Pass `host.clientWidth` as W. One `ResizeObserver` on the chart grid, debounced to 150ms, replaces the resize listener that was skipped.
- P6 `legend()` chips have no colour key, so the unlabelled Taxable and HSA segments and the two debt lines cannot be matched. Extreme renders 14 chips (balance sheet and debt payoff). Prefix each chip with an 8px `.legend .swatch` in the series colour, and cap at 5 chips plus "and 9 more".
- P7 Client chart titles are translated but their insides are not: "FAT floor", "Rule of 5: 5 months", "FI at 49", "FI number $1.3M", "Lean / FI / Fat", "~17.4% of Coast FI", "Accommodation". The client Sankey also drops the dollar amounts the coach sees. Pass the glossary `t` into every builder and keep the $ labels.
- P12 The runway ladder writes its value labels at the bar end: "4 months at $3,125" sits on the Rule of 5 line (Maya), "64 months at" is clipped (extreme), and the "Needs only" row is missing even though the tile shows 32 / 32 / 64. Move the values into a fixed right column, as DRAFTT bands and the waterfall already do.

Formatting and copy (engine/format.js, engine/lenses.js, measure.js)
- P9 Rough negatives print "-~$60,510", "-~1.6%" and "-~1.6% of the FI number; -~2.0% of Coast FI", where the hyphen reads as a dash. "Short ~$36,580" sits over a range of "-$37,650 to -$35,510". Format as "~-$60,510" with a true minus in one `F.signed()` helper. Under a "Short" value the range reads "$35,510 to $37,650 short".
- P10 Extreme's first lens says "$1,086,051,382 a year" (wrong debt first): a lifetime figure from a payoff that never ends, labelled as yearly. When either order does not finish within 50 years, say "Minimums do not cover interest on Debt number 5" and show no dollar figure. Lens sentences that say "about" or "roughly" must pass `rough: true` ("$8,662", "$4,763" have no tilde).
- P11 Two copies of a truncation helper (`short()` in measure.js, `legend()` and the bar labels in charts.js) cut mid-word with "..": "Debt number 1 with a v..". Use one helper in engine/format.js that cuts at a word boundary and ends with a single ellipsis character. The `kpi()` fallback "Needs inputs" (Shelter rate, Fixed-cost rate, Debt-to-income) should name the need, as its neighbours do ("Needs take-home above zero"). Also rephrase "Needs a non-zero denominator".
- P13 Empty-state copy joins every need with "and": "a credit card row from the library and spending lines that name it and spending lines that name a card", "a rough total of 0 for none and an input". Remove duplicate needs, list at most 2 plus "and N more", and drop "planets" from the lens empty line. Remove the developer subtitle "Labels come from the metric registry." Disable "On the one-pager" on a chart in a needs state.

One-pager (ui/views/onepager.js, ui/app.css)
- P14 N25 has not landed. `strugglingSection()` still pairs readings by index (`lenses[i]`), and the lens list differs by view: the restaurants bullet cites Mr. Money Mustache in coach view and Vicki Robin in client view, and the parking bullet loses its reading for the client. Store the lens id with each struggle item. Render the reading on its own line (`.op-read li .muted { display: block; }`); the second bullet is inline today.
- P15 At 390 the to-do Due cells wrap ("20 Oct / 2026") and `.op-meta` wraps "Overall confidence / 86%". Set `.onepager table.data td:last-child { white-space: nowrap; }`, and under 720px stack `.op-meta` left-aligned under the name.
- P16 At 390 the gap between sections is 40px in some places and 16px in others (the two-column `.op-grid` gap plus `ul` margins). Use one `var(--s-3)` gap with `ul { margin: 0 }`.

## Which N fixes landed

| Status | Fixes |
|---|---|
| Landed | N1, N2, N3, N4, N7, N8, N10, N12, N13, N14, N17, N19, N20, N21, N22, N23, N24, N31 |
| Landed, with a remainder | N5 (generic "Needs inputs", P11), N6 (amount column says "no $ figure", P4), N9 (prose lists remain, P2), N11 (sign and tilde order, P9), N15 (cap works, ".." cuts, P11), N27 ("Health (employer) (coverage)" still doubles the parentheses), N30 (charts now on the one-pager, too small to read, P5) |
| Replaced as agreed | N18 by a legend row (needs swatches, P6). N26 by suggested lines: Maya's typed text now agrees with the numbers ("about two fifths", "three months of full spending") |
| Not landed | N16 (P5), N25 (P14). The "Prepared by / next session" line from the handout note is still missing |
| Not re-checked | N28, N29 (no new PDF in this round) |

## Overall

1. The tile grid and the client view are now at a professional bar. The remaining work is in charts (P5, P6, P7, P12) and in two shared helpers (P9 signs, P11 truncation). Fixing those six would move most 3s to 4.
2. The extreme household still produces output that no human would send (P10: a billion-dollar yearly figure). Lens sanity bounds belong in engine/lenses.js beside the math, not in the view.

## After round 2 (builder's note, not a reviewer score)

Fixes P1 to P17 were applied and every screen re-shot into this folder:
compound tiles split into value and range (P1), every list tile is one
`.shares` renderer (P2, P3), lenses show their own figure when there is no
dollar one (P4), charts take their width from the host and repaint through
one ResizeObserver (P5), legend chips carry a swatch and cap at 8 (P6),
client charts use client words (P7), section headings share one size (P8),
the tilde sits before the sign (P9), a payoff that never ends says so and
shows no figure (P10), one `shorten()` helper in engine/format.js (P11),
runway values sit in a fixed column (P12), needs are deduplicated and capped
(P13), one-pager readings follow the lens id (P14), one-pager cells and meta
do not wrap at 390 (P15, P16), stage chips collapse to one summary chip under
720px (P17). Not done, stated plainly: N28 and N29 (PDF margins) were not
re-checked by the reviewer; the "Prepared by / next session" line is still
absent from the one-pager by choice (the footer carries the date instead).
The reviewer did not re-score this round.
