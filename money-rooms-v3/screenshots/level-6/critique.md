# Level 6 (Depth) design critique, round 1

Reviewer stance: senior product designer, workpaper bar (Inter, light sapphire, 8px rhythm, sentence case, no marketing tone). 4 = a human designer ships it with minor notes. Every score under 4 names one fix (T-number below); one fix may cover several cells. Selectors and lines are from `ui/views/assumptions.js`, `ui/app.css`, `data/assumptions.json` and `engine/compute.js` unless another file is named. Line numbers in `app.css` move while other work lands, so the selector is the anchor.

All 30 assumptions screenshots were read. The five households render the same Assumptions screen: no household has a single override, so every row shows "Default" and the same value. They differ only in the client name in the top bar and the sidebar percentages (and Undo is enabled for the empty household). Rows are therefore grouped by view and width, and each group covers all five households. The "Set here" state was never captured (see Overall note 3).

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| assumptions-coach-1440 (empty, jordan, dev, maya, extreme: identical content) | 2 [T3] | 2 [T4] | 3 [T5] | 2 [T1] | 2 [T2] | 2 [T1] |
| assumptions-coach-1024 (all five: identical content) | 2 [T3] | 2 [T4] | 3 [T5] | 2 [T1] | 2 [T2] | 2 [T1] |
| assumptions-coach-390 (all five: identical content) | 2 [T3] | 3 [T4] | 3 [T5] | 2 [T1] | 2 [T2] | 2 [T1] |
| assumptions-client-1440 (all five: identical content) | 3 [T7] | 3 [T8] | 4 | 3 [T7] | 2 [T7] | 2 [T7] |
| assumptions-client-1024 (all five: identical content) | 3 [T7] | 4 | 4 | 3 [T7] | 2 [T7] | 2 [T7] |
| assumptions-client-390 (all five: identical content) | 3 [T7] | 4 | 4 | 3 [T7] | 2 [T7] | 2 [T7] |
| maya-home-coach-1440 | 4 | 3 [T16] | 4 | 3 [T17] | 3 [T17] | 3 [T16] |
| maya-home-client-1440 | 4 | 3 [T8] | 4 | 4 | 3 [T15] | 4 |
| maya-income-coach-1440 | 4 | 4 | 4 | 4 | 3 [T15] | 4 |
| maya-income-client-1440 | 4 | 3 [T8] | 4 | 4 | 3 [T15] | 4 |
| maya-income-w2-coach-1440 | 4 | 4 | 4 | 4 | 3 [T13] | 4 |
| maya-income-w2-client-1440 | 4 | 3 [T13] | 4 | 4 | 3 [T13] | 3 [T13] |
| maya-spending-lines-coach-1440 | 4 | 3 [T13] | 4 | 4 | 3 [T16] | 3 [T13] |
| maya-spending-lines-client-1440 | 4 | 3 [T13] | 4 | 4 | 3 [T16] | 3 [T13] |
| maya-debt-cards-coach-1440 | 4 | 4 | 4 | 3 [T16] | 4 | 4 |
| maya-debt-cards-client-1440 | 4 | 3 [T13] | 4 | 3 [T16] | 3 [T15] | 3 [T13] |
| maya-invest-accounts-coach-1440 | 2 [T11] | 4 | 3 [T11] | 2 [T11] | 3 [T15] | 2 [T11] |
| maya-invest-accounts-client-1440 | 2 [T11] | 3 [T13] | 3 [T11] | 2 [T11] | 3 [T16] | 2 [T11] |
| maya-life-goals-coach-1440 | 4 | 4 | 4 | 4 | 3 [T16] | 4 |
| maya-life-goals-client-1440 | 4 | 4 | 4 | 4 | 3 [T15] | 4 |
| maya-measure-coach-1440 | 3 [T9] | 3 [T19] | 3 [T10] | 2 [T19] | 3 [T15] | 3 [T9] |
| maya-measure-client-1440 | 4 | 4 | 4 | 4 | 3 [T9] | 3 [T9] |
| maya-onepager-coach-1440 | 4 | 3 [T14] | 4 | 4 | 3 [T17] | 3 [T9] |
| maya-onepager-client-1440 | 4 | 3 [T14] | 4 | 4 | 3 [T17] | 3 [T9] |
| maya-session-coach-1440 | 3 [T12] | 2 [T12] | 3 [T12] | 3 [T12] | 2 [T12] | 2 [T12] |
| maya-session-client-1440 | 4 | 4 | 4 | 4 | 3 [T7] | 3 [T7] |
| maya-scenarios-coach-1440 | 4 | 3 [T14] | 2 [T14] | 4 | 3 [T10] | 3 [T14] |
| maya-scenarios-client-1440 | 4 | 3 [T14] | 2 [T14] | 4 | 3 [T10] | 3 [T14] |
| maya-learn-coach-1440 | 4 | 4 | 3 [T18] | 4 | 3 [T18] | 4 |
| maya-learn-client-1440 | 4 | 4 | 3 [T18] | 4 | 3 [T18] | 3 [T18] |
| maya-assumptions-coach-1440 | 2 [T3] | 2 [T4] | 3 [T5] | 2 [T1] | 2 [T2] | 2 [T1] |
| maya-assumptions-client-1440 | 3 [T7] | 3 [T8] | 4 | 3 [T7] | 2 [T7] | 2 [T7] |

What works: every engine default lives in one versioned file with its own label, `assumptionsFor()` merges sparse per-client overrides in one line, and `commit()` deletes an override that equals the default, so the stored shape stays small. Inputs are right-aligned with tabular figures, the 390 container query stacks label, chip and value cleanly, and Simulate is the one screen that already says what basis it uses ("likely return, real dollars").

## Fixes

Assumptions: fewer, true, grouped

- T1 Six of the 31 rows do nothing. The engine never reads `basis`, `inflation`, `bondRealReturn`, `withdrawalRateLow`, `withdrawalRateHigh` or `materialityAnnualCents` (grep `engine/` and `ui/`: zero reads outside `assumptions.js`). Every Quantity in `engine/units.js` is built with `basis: 'real'`, so the "Nominal dollars (with inflation)" option changes nothing. The session's materiality line comes from `data/weights.json` `materiality.trivialBelowAnnualCents`, not from this screen, so a coach who edits "Materiality line, a year" sees no effect. Fix:
  - Remove the six keys from `ORDER` in `assumptions.js` line 7 and from `defaults` and `labels` in `data/assumptions.json` (lines 6, 7, 12, 14, 15, 29 and labels 49, 54, 56, 57, 62).
  - Delete the `choice` branch in `KIND` (line 8) and the `select` in line 22.
  - Compatibility note for the decision entry: overrides already stored under these six keys on `rec.sun.assumptions` are ignored by `assumptionsFor()` and dropped on the next save. No other stored shape changes.
  - Under the freeze, delete rather than wire up a nominal mode. The basis is stated once in the header (T5) and wherever a projection is drawn (T9).
- T2 Go-go, slow-go and no-go shares have two owners. `data/fields.json` gives `gogo`, `slowgo` and `nogo` `"owner": "life"` on the Retirement row. `engine/planets/life.js` lines 14 to 16 use the Life plan value and fall back to `asm.gogo`. So Assumptions shows "Go-go spending share 100.0% Default" for Maya while Session lists "Retirement: go-go years" as Estimated on her Life plan row. Remove `gogo`, `slowgo` and `nogo` from `ORDER`, but keep them in `defaults` because the engine still needs the fallback. In their place, put one read-only line at the top of the Retirement group: label "Spending in retirement", value "100% / 85% / 75% of today's, from Life plan", linking `#/ledger/life`. Also fix the Life plan hint in `data/fields.json` (`gogo.hint`): "Spending as a percent of today's, roughly 60 to 75" contradicts the 100% default. Use "Share of today's spending. 100% means no change."
- T3 31 rows in one flat list, with the raw key `basis` as the first label (it has no entry in `labels`). After T1 and T2 there are 22 rows. Group them inside the same panel with three `h3` subheads, so no new panel is added. Make `ORDER` an array of `[heading, keys]` pairs:
  - "Growth": returnLikely, returnBest, returnWorst, cashRealReturn.
  - "Retirement and independence": withdrawalRate, retirementAgeDefault, socialSecurityAge, socialSecurityScale, slowgoAge, nogoAge, projectionEndAge, fatFiMultiplier, baristaIncomeAnnualCents.
  - "Flags": shelterHeavyShare, hiddenLeakShare, utilizationCardMax, utilizationTotalMax, feeDragEr, thinRunwayMonths, lockedLiquidityShare, realWageShare, noFeeBaselineRate.

  Relabel in `data/assumptions.json`:
  - retirementAgeDefault: "Retirement age if Life plan is blank"
  - socialSecurityScale: "Social Security, share of scheduled benefit"
  - slowgoAge: "Slow-go years start at"
  - nogoAge: "No-go years start at"
  - realWageShare: "Real wage flag below this share of stated"
  - noFeeBaselineRate: "No-fee card baseline earn rate"
  - fatFiMultiplier: "Fat FI spending multiple". Show it as "1.5x": today `KIND` maps it to 'hours' and prints a bare "1.5".
- T4 The panel spans 1180px at 1440 but uses the left 450px. Labels wrap to two or three lines in the 128px label column, so rows jump between 40px and 60px. Give the panel `class: 'panel assumptions'` (line 14) and add to `app.css` after the `.fieldrow` block:

  ```css
  .assumptions { max-width: 760px; }
  .assumptions .fieldrow { grid-template-columns: minmax(0, 1fr) var(--field-w) 160px; grid-template-areas: "label input src"; }
  .assumptions > h3 { margin: var(--s-3) 0 var(--s-1); color: var(--sapphire-900); font-weight: var(--w-semibold); font-size: var(--fs-13); }
  .assumptions > h3:first-child { margin-top: 0; }
  ```

  Every label then fits on one line, every row is 40px, and the column matches the 760px left column used by `.planet-grid` and `.maphost`. At 390 the existing `@container (max-width: 560px)` rule keeps the stacked layout. The "Default" chips now sit at ragged x positions, and T5 removes them.
- T5 Each row says "default" twice: a "Default" chip, then the default value again in the `src` column, identical to the input beside it. The header sub "Blank means the default" is false, because the blur handler (line 28) always refills the field.
  - In line 30, drop the `state` span. Render the `src` span empty when the value is the default. When it is overridden, render `'Default ' + fmt(defaults[k])` plus a `btn quiet small` "Use default" that calls `commit(null)`. That also removes the second chip vocabulary: "Set here" borrowed `state-known`, a fact-confidence class.
  - Header sub (line 13): "In today's dollars. A change here applies to this client only."
  - "Reset all" reads "Reset N changes" and is `disabled` when N is 0.
- T6 `F.percent` rounds to one decimal, so the 0.25% fee-drag line prints as "0.3%", and before T1 a 3.25% default printed as "3.3%". A coach who reads the screen copies a wrong number. Parameterize the one function: in `engine/format.js` `percent()`, add `o.places` (default 1), use `Math.pow(10, places)` and `toFixed(places)`, and compare the zero test against `(0).toFixed(places)`. In `assumptions.js` lines 24 and 28, pass `{ places: 2 }` only when `Math.abs(v * 1000 - Math.round(v * 1000)) > 1e-9`. This is a format change in one function, not a new formatter.

Assumptions in the client view, and coach-only screens

- T7 The client view of Assumptions is a dead end with coach-voice copy: a dashed box reading "Assumptions stay with the coach." Session says the same thing a different way ("Coach only. The session screen stays with the coach. Switch back to Coach view to see it."). Both routes are already hidden from the client nav (`coachOnly: true` in `ui/routes.js` lines 33 and 36), so the only way to land here is to flip the view while on the page.
  - Add `coachOnly: true` to the `assumptions` and `session` route definitions in `ui/routes.js` (lines 21 and 18).
  - In the router in `ui/app.js` (next to the `needsClient` check, line 136), send `if (def.coachOnly && this.view === 'client')` to `#/measure` with `location.replace`.
  - Delete the client branches in `assumptions.js` line 11 and `ui/views/session.js` line 18.

  That is two fewer client screens and one less wording.
- T8 At 1440 the client sidebar truncates every planet name ("What com...", "Your cushi..."), but at 1024 it does not. `.sidenav a` reserves `grid-template-columns: minmax(0, 1fr) 32px 48px` for the shortcut, and `body[data-view="client"] .sidenav .kbd { display: none; }` hides the shortcut without giving back its column. Add `body[data-view="client"] .sidenav a { grid-template-columns: minmax(0, 1fr) 32px; }` beside that rule. For the coach "Assumptio..." row, stop printing "-" for items with no fill (`ui/app.js` line 165 prints `'-'`). Render no `fill-text` or `kbd` span for an item that has neither, and add `.sidenav a > .navlabel:only-child { grid-column: 1 / -1; }`. A dash in this product should mean only "not applicable" (T16), never "no data".

Depth where the numbers are read

- T9 Projections are stated without their assumptions. "Could stop working at 49", "FI at 49" and "Enough to live on $1.3M" rest on a 5% likely real return, a 3% to 7% band and a 4% withdrawal rate. None of the three screens that show them say so, and the client chart caption uses jargon ("Age. Band: worst to best real return; line: likely."). Simulate states "likely return, real dollars" but not the rate. Fix with one line each, from `result.asm` (set in `compute.js` line 138), with no new panel:
  - `ui/charts.js` line 54, coach: `"Age. Today's dollars. Line " + F.percent(asm.returnLikely) + " a year after inflation; band " + F.percent(asm.returnWorst) + " to " + F.percent(asm.returnBest) + "."`
  - Same line, client: `"Age. In today's dollars, growing about " + F.percent(asm.returnLikely) + " a year after inflation."`
  - `ui/views/onepager.js`: one `p.small.muted` under the two charts: "Assumes 5.0% a year after inflation (3.0% to 7.0%), a 4.0% withdrawal rate and Social Security from 67, in today's dollars." Build it from `asm`, and when `rec.sun.assumptions` has keys, append "Set for this client."
  - `ui/views/scenarios.js` line 82: replace the tag "likely return, real dollars" with `F.percent(asm.returnLikely) + " a year after inflation, today's dollars"`.
- T10 False precision on rough figures:
  - Measure shows "FI number ~$1,295,901" and "Coast FI ~$314,834", while the chart beside them says "$1.3M". A tilde plus dollar-level digits contradicts itself.
  - Simulate shows a 70-year likely-return projection to the dollar ("$4,289,736", "+$2,193,291"), and its "FI date" column holds ages ("age 49").

  Fix:
  - In `engine/format.js` `dollars()`, when `o.rough` and the absolute value is at least $100,000, round to the nearest $1,000 ("~$1,296,000").
  - In the Simulate table use `F.dollarsCompact` ("$4.29M", "+$2.19M").
  - Rename the column "FI age". Measure keeps "~Feb 2049" as the date.

Other screens (Maya pass)

- T11 Investments opens on a 12-row panel, "Inferred by the engine (not stored, read-only)", that pushes the ledger below the fold. It shows engine tokens in lower case ("pretax", "semi", "locked", "hsa"), to the client too. Delete the panel (`ui/views/ledger.js` lines 110 to 118). Show tax bucket and reach as two read-only columns on the accounts table, in the vocabulary the Measure balance-sheet chart already uses: "Pre-tax", "Roth", "HSA", "Taxable", "Cash" and "Reachable now", "Reachable with care", "Locked until 59.5". That is one surface instead of two, and about 420px shorter.
- T12 The Level 3 fixes recorded as applied do not show in these session shots:
  - The State column is clipped at 1440 ("Looked up (ver") and missing at 390 and in the extreme household. Give State a fixed width: `.session-grid table.data td:last-child { width: 112px; }`. Hide Where under 1280px with the existing `.hide-narrow`.
  - The chip text is "Looked up (verify)" where the agreed label is "Verify". Fix it in `stateChipOf()`.
  - Raw scores still print ("leverage 75", "leverage 48"). Replace them with "~$X a year at stake", or nothing when there is no dollar figure.
  - The email is still monospace. In `textarea.input.email`, set `font-family: var(--font); font-size: var(--fs-13); line-height: 20px;`.
  - Since last time still says "balance up $400" (`session.js` line 114), while the one-pager says "was $9,800, now $10,200". Use the one-pager's text.
  - "Could cut: could cut per month" still repeats its word.
- T13 Wide ledger tables clip at the right edge with no cue: W-2 client ends on "$1", debt client on "Minim", spending on "Unavoidable or m". Add scroll shadows to `.tablewrap`: `background: linear-gradient(to right, var(--paper) 30%, transparent) left / 24px 100% no-repeat local, linear-gradient(to left, var(--paper) 30%, transparent) right / 24px 100% no-repeat local, linear-gradient(to right, var(--line), transparent) left / 8px 100% no-repeat scroll, linear-gradient(to left, var(--line), transparent) right / 8px 100% no-repeat scroll, var(--paper);`. In the client view, hide the Source column in `ui/table.js`: "Client" on every row tells the client nothing. The client then sees the same columns as the coach, not more.
- T14 Chart craft:
  - The Sankey (one-pager and Measure) puts "Take-home $6,152" on top of "Food $800" and clips "Utilities and subscriptions $265" at the left. In `ui/charts.js`, put the middle node label above its node (`y = y0 - 6`, `text-anchor: start`), and fold right-hand lines under 3% of gross into "Smaller lines" so labels keep at least 14px apart.
  - The Simulate chart axis text renders at about 18px because `W` is read before the host is laid out (`ui/views/scenarios.js` line 92) and the SVG is then scaled up. Measure `hostEl.getBoundingClientRect().width` after the panel is attached.
  - The timeline prints "2077 (77)" over "2082 (82)": line 30 right-aligns every tick past 80%. Use `y + 5 > yearN` so only the last tick is `.end`.
  - Give the four legend chips the existing `.legend .swatch` so each one names its line.
- T15 One name per thing:
  - "FAT floor" (coach Measure, `engine/chartdata.js` line 73, `ui/views/measure.js` line 101) is "Lean month" in the client view. The glossary already defines it as "the lean month". Use "Lean month" in both views and drop the mapping from `CLIENT_WORDS` in `ui/charts.js` line 8.
  - Income: the orbit says "Rental" and "W-2 job" while the table says "Rentals" and "W-2 jobs". Use the plural `plural` label in both places.
  - "401k" (nickname, one-pager, "401k to the limit") and "401(k)" (account type, Measure): use "401(k)" in generated copy.
  - The client home mapbar says "Life plan is at 72%" and "Open life plan" while the client nav says "Your plans". Run the mapbar label through the same `translator(app)` as the nav.
  - "Investments" (nav), "Investments and accounts" (orbit, crumb) and "Accounts" (h1) name one place three ways. Keep the planet name in nav and crumb, and the row type in h1.
- T16 One format per value:
  - Home History mixes "05:47" with "3 Oct 2026". Always use `F.dateLong` and put the time in a `title` (`ui/views/home.js` line 258).
  - History prints "$640.00" and "~$240.00 to $320" (`home.js` line 296 calls `F.dollars`) where every ledger prints whole dollars. Use `F.dollarsWhole`, which also stops `.history td.now` from clipping at 160px.
  - Spending's summary line shows "Gap: $16.67". Use whole dollars.
  - Investments shows a zero percent as "0" beside "100.0%". Route it through `F.percent`.
  - "Not applicable" fills 4 of 9 cells on the debt table and most percent cells on investments. Print a quiet "-" with `title="Not applicable"` for `state-not-applicable` cells.
  - Goals sets "Not entered" at 12px in As of and 13px in Who or where. Use 13px.
  - Streaming shows "~$55" next to a "Known" chip. Draw the rough tilde from the state (`rough`) only, never from an Estimated source, so the mark and the chip agree.
- T17 One confidence number, one session count:
  - Home centre says "98% complete" (Sun facts only, `home.js` line 55), its facts footer says "Confidence 98% across the eight facts", and the one-pager says "Overall confidence 86%" (`onepager.js` line 32). Show the overall figure in both headline places as "86% confident". Keep 98% only in the Household facts footer.
  - The one-pager says "Session 3" (sessions length plus one) while Session lists "Session 2" as the latest and History says "Session snapshot s2". Use "After session 2" on the one-pager, and "Session 2" in History.
  - Home coach also carries the Clients panel on the household's own home. Under the freeze, move it behind the top-bar client name rather than adding anything.
- T18 Learn copy:
  - "About $11,592 a year ... About ~$11,592 a year." hedges twice. Drop the trailing "About ~$X a year." when the sentence already states the figure.
  - The shelf prints metric slugs ("fee-drag, coast, fi-number"), to the client too. Print the metric names from `data/metrics.json` in the coach view and nothing in the client view.
  - "a card with a promo rate and end date" starts in lower case. Make it "A card with a promo rate and end date".
- T19 Measure coach is 4,150px at 1440 and 7,277px at 390, and its grid is ragged: Allocation sits alone on a row, Cards has two tiles, and Taxes has four of six. Merge and do not add:
  - Fold Cards' two tiles into Debt and credit.
  - Fold Allocation into the Tax bucket mix tile as a second list ("Mix: by tax, by asset").
  - Under 720px, collapse each metric group to its heading with the existing `.group-collapsed` style, and open one group at a time.

## Maya consistency

1. Basis worded three ways. Simulate says "likely return, real dollars". Measure and the one-pager say "Band: worst to best real return; line: likely.". Assumptions offers "Real dollars (today's)" as a select that does nothing. Fix T1 and T9: "today's dollars" plus the rate, everywhere.
2. Go-go years have two homes. Assumptions shows "Go-go spending share 100.0%, Default". Session shows "Retirement: go-go years, Estimated" from the Life plan row, whose hint says "roughly 60 to 75". Fix T2.
3. Same fact, two numbers. Home shows "98% complete". The one-pager shows "Overall confidence 86%". Fix T17.
4. Session count. The one-pager says "Session 3". Session lists "Session 2" as the latest, and Home History says "Session snapshot s2". Fix T17.
5. Changes since last time, two phrasings. Session says "Savings: balance up $400". The one-pager says "Savings: balance was $9,800, now $10,200". Fix T12.
6. Two names for one floor. Measure coach says "FAT floor". Measure client and the one-pager say "Lean month", while FI levels on Measure say "Lean". Fix T15.
7. One FI number, two precisions. Measure coach shows "~$1,295,901". The Measure chart and the one-pager show "$1.3M" and "Enough to live on $1.3M". Fix T10.
8. Money with and without cents. Home History shows "$640.00" and "~$240.00 to $320". Debt cards shows "$640" and Spending shows "~$240 to $320". Fix T16.
9. Two date formats in one column. Home History shows "05:47" beside "3 Oct 2026". The rest of the app uses "17 Sep 2026" for past events and "Jun 2035" for targets. That rule is sound, so keep it and apply it in History. Fix T16.
10. Planet names drift. The sidebar says "Debt" and "Investments", the crumb says "Debt and credit" and "Investments and accounts", and the h1 says "Accounts". On the client home, the mapbar says "Life plan" while the nav says "Your plans". Fix T15.
11. Row type names drift within Income. The orbit shows "Rental" and "W-2 job", the Row types table "Rentals" and "W-2 jobs". Fix T15.
12. 401(k) spelled two ways. Investments shows nickname "401k" and account type "401(k)". Measure shows "401(k)" while the client chart shows "401k to the limit". Fix T15.
13. Two chip vocabularies for one idea. Assumptions uses "Default" and "Set here" (`state-known`). Ledger screens use Known, Rough, Estimated and Verified for fact confidence. Fix T5: Assumptions stops using chips.
14. Two coach-only screens, two wordings. Session says "Coach only. ... Switch back to Coach view to see it.". Assumptions says "Assumptions stay with the coach.". Fix T7.
15. Heading sizes drift. Measure, Session and Learn put a 20px h1 with an inline sub. Ledger screens put a crumb over a 20px h1 with no sub. Income's "Row types" is a 12px slate `h3` where Measure group labels are 13px semibold sapphire. Fix: use the `.metric-group > h3` style for `ledger.js`'s row-types heading. Keep the two h1 patterns: crumbs belong to ledger depth, and the inline sub belongs to the Read screens, Assumptions included.
16. "FI" shown as a date in one place, an age in another. Measure shows "FI date ~Feb 2049". Simulate shows "FI date: age 49". Fix T10.

## Overall notes

1. What works: the assumption layer is architecturally right. One versioned JSON holds values and labels, one `assumptionsFor()` merge feeds every planet, overrides are stored sparsely and removed when they equal the default, and the projection, scenarios and metrics all read the same `asm`. The screen inherits the field-row system, right-aligned tabular inputs and the 390 container query, so it already looks like the rest of the app. Simulate's "likely return, real dollars" tag shows the right instinct.
2. Depth here is mostly breadth. The screen has 31 knobs: 6 are dead, 3 duplicate a Life plan field, and 1 toggle changes nothing. Meanwhile the four assumptions that decide the headline numbers (likely return, band, withdrawal rate, Social Security) are invisible exactly where a client reads "Could stop working at 49". T1 and T2 take the screen from 31 rows to 22, still one panel, about 980px tall instead of 1,420px. T3 and T4 make it scannable. T9 adds one line under each projection rather than a new panel. That is the real depth gain, and it leaves the app with fewer fields.
3. Two process gaps. First, Level 3 fixes the builder recorded as applied (State clipping, raw leverage, monospace email, the "was X, now Y" wording, repeated words) are not visible in these Level 6 session shots, so the shots are stale or the work regressed. Re-shoot before round 2. Second, no household has an assumption override, so the overridden state, the most important one to review on this screen, has never been seen. Have the screenshot script set one override (for example `returnLikely` to 4.0% on the extreme household) before capture, without changing the demo data.

## After round 1 (builder's note, not a reviewer score)

Applied: T1 to T7 (22 settings in three groups, each one read by the engine;
retirement spending shares read-only from the Life plan; default shown only
when overridden; percent places; coach-only routes send a client view to
Measure), T8 (sidebar columns), T9 (chart captions, the one-pager assumptions
line and the Simulate caption state the return, band and withdrawal rate),
T10 (rough figures above $100,000 round to $1,000; compact dollars in
Simulate), T11 (the inferred panel is one hint line per inferred value),
T12 (all six session leftovers), T13 (scroll shadows on every table; the
Source column is coach-only), T16 in part (History dates and whole dollars,
"-" for not applicable), T17 in part (Home centre shows the overall
confidence; the one-pager says "After session N"), T18 (through the Level 5
fixes). Declined, stated plainly: T15's one name for the FAT floor, because
the spec names the FAT floor and the glossary already gives the client "Lean
month"; T14's Sankey label repositioning and T19's Measure regrouping, which
are left for the next round; T17's move of the Clients panel. The reviewer did
not re-score this round.
