# Level 4 (Simulate) design critique, round 1

Reviewer stance: senior product designer, eMoney / audit-workpaper bar, judged as the screen the coach drives live with the client watching. 4 = a human designer ships it with minor notes. Every score under 4 names one fix (R-number below); one fix may cover several cells. Selectors and line numbers are from `ui/views/scenarios.js`, `ui/app.css`, `ui/charts.js`, `engine/scenarios.js` and `data/scenario-blocks.json` as they stand today.

What the 30 shots contain: empty has no projection inputs (empty state only). Jordan, Dev and Extreme have inputs but no blocks, so they show the add row and an empty timeline. Maya is the only household with blocks (Condo in Oakland 2035, Four-day week 2029), so only Maya shows the comparison table and the chart. No shot has a block selected or promoted, so the editor panel and the promoted state were judged from source only (R9). All 30 images were read and each has its own row; rows that score the same do so because the screens are the same layout with different tick labels, not because they were skipped.

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| empty-scenarios-coach-1440 | 3 [R8] | 4 | 4 | 4 | 3 [R8] | 3 [R8] |
| empty-scenarios-coach-1024 | 3 [R8] | 4 | 4 | 4 | 3 [R8] | 3 [R8] |
| empty-scenarios-coach-390 | 3 [R8] | 4 | 4 | 4 | 3 [R8] | 3 [R8] |
| empty-scenarios-client-1440 | 3 [R8] | 4 | 4 | 4 | 2 [R8] | 3 [R8] |
| empty-scenarios-client-1024 | 3 [R8] | 4 | 4 | 4 | 2 [R8] | 3 [R8] |
| empty-scenarios-client-390 | 3 [R8] | 4 | 4 | 4 | 2 [R8] | 3 [R8] |
| jordan-scenarios-coach-1440 | 2 [R6] | 2 [R1] | 3 [R1] | 2 [R2] | 3 [R6] | 2 [R1] |
| jordan-scenarios-coach-1024 | 2 [R6] | 2 [R1] | 3 [R1] | 2 [R2] | 3 [R6] | 2 [R1] |
| jordan-scenarios-coach-390 | 2 [R6] | 1 [R1] | 2 [R1] | 2 [R6] | 3 [R6] | 1 [R1] |
| jordan-scenarios-client-1440 | 2 [R7] | 2 [R1] | 3 [R1] | 2 [R7] | 2 [R7] | 2 [R7] |
| jordan-scenarios-client-1024 | 2 [R7] | 2 [R1] | 3 [R1] | 2 [R7] | 2 [R7] | 2 [R7] |
| jordan-scenarios-client-390 | 2 [R7] | 1 [R1] | 2 [R1] | 2 [R7] | 2 [R7] | 1 [R7] |
| dev-scenarios-coach-1440 | 2 [R6] | 2 [R1] | 3 [R1] | 2 [R2] | 3 [R6] | 2 [R1] |
| dev-scenarios-coach-1024 | 2 [R6] | 2 [R1] | 3 [R1] | 2 [R2] | 3 [R6] | 2 [R1] |
| dev-scenarios-coach-390 | 2 [R6] | 1 [R1] | 2 [R1] | 2 [R6] | 3 [R6] | 1 [R1] |
| dev-scenarios-client-1440 | 2 [R7] | 2 [R1] | 3 [R1] | 2 [R7] | 2 [R7] | 2 [R7] |
| dev-scenarios-client-1024 | 2 [R7] | 2 [R1] | 3 [R1] | 2 [R7] | 2 [R7] | 2 [R7] |
| dev-scenarios-client-390 | 2 [R7] | 1 [R1] | 2 [R1] | 2 [R7] | 2 [R7] | 1 [R7] |
| extreme-scenarios-coach-1440 | 2 [R6] | 2 [R1] | 3 [R1] | 2 [R2] | 3 [R6] | 2 [R1] |
| extreme-scenarios-coach-1024 | 2 [R6] | 2 [R1] | 3 [R1] | 2 [R2] | 3 [R6] | 2 [R1] |
| extreme-scenarios-coach-390 | 2 [R6] | 1 [R1] | 2 [R1] | 2 [R6] | 3 [R6] | 1 [R1] |
| extreme-scenarios-client-1440 | 2 [R7] | 2 [R1] | 3 [R1] | 2 [R7] | 2 [R7] | 2 [R7] |
| extreme-scenarios-client-1024 | 2 [R7] | 2 [R1] | 3 [R1] | 2 [R7] | 2 [R7] | 2 [R7] |
| extreme-scenarios-client-390 | 2 [R7] | 1 [R1] | 2 [R1] | 2 [R7] | 2 [R7] | 1 [R7] |
| maya-scenarios-coach-1440 | 3 [R5] | 3 [R2] | 2 [R3] | 3 [R3] | 2 [R4] | 2 [R3] |
| maya-scenarios-coach-1024 | 3 [R5] | 3 [R1] | 3 [R2] | 3 [R6] | 2 [R4] | 3 [R4] |
| maya-scenarios-coach-390 | 2 [R5] | 1 [R1] | 1 [R3] | 2 [R5] | 2 [R4] | 1 [R3] |
| maya-scenarios-client-1440 | 3 [R5] | 3 [R2] | 2 [R3] | 3 [R3] | 2 [R7] | 2 [R7] |
| maya-scenarios-client-1024 | 3 [R5] | 3 [R1] | 3 [R2] | 3 [R5] | 2 [R7] | 2 [R7] |
| maya-scenarios-client-390 | 2 [R5] | 1 [R1] | 1 [R3] | 2 [R5] | 2 [R7] | 1 [R3] |

## Fixes

Timeline

- **R1 Tick labels collide at every width, and are unreadable at 390.** `scenarios.js` line 30 draws a tick every 5 years labelled "2027 (28)" and adds `.end` to every tick past 80% (`pct(y) > 80`), so several labels anchor right at once. Results: "2077 (78)" printed over "2082 (83)" (Jordan, Dev, Maya at 1440), "2052 (83)" over "2057 (88)" (Extreme at 1024), the last label sitting in the wrong column, and at 390 a single smear of digits across the lane. The unlabelled "(28)" also reads as a count, not an age, and the chart below uses plain ages, so the same time has two notations. Fix: tick on round ages only, same notation as the chart's x axis, no right-anchoring:
  ```js
  const endAge = inp.asm.projectionEndAge, firstAge = Math.ceil((inp.age + 1) / 10) * 10;
  for (let a = firstAge; a <= endAge; a += 10) {
    const y = inp.year + (a - inp.age);
    tl.appendChild(h('div', { class: 'tick', style: { left: pct(y) + '%' } }, h('span', null, a === firstAge ? 'age ' + a : String(a))));
  }
  ```
  Delete `.timeline .tick.end span` (app.css line 444). That gives 7 ticks for Maya and Jordan, 4 for Extreme, and fits at 390 without hiding any.

- **R2 Timeline geometry: 176px tall whatever it holds, not aligned with the chart, labels clipped.**
  - `.timeline { height: 176px }` (app.css line 441) leaves 120px of empty grid in Jordan, Dev and Extreme, and 80px below Maya's two blocks. Set the height from the lanes in use: `tl.style.height = (blocks.length ? 8 + lanes * 32 + 24 : 40) + 'px'`, and change the CSS to `height: auto; min-height: 40px;`.
  - Lanes are `i % 4` (line 33), so blocks stack by creation order, not by overlap. Pack greedily: keep `const laneEnd = []`, put each block (sorted by `startYear`) in the first lane whose end is at or before its start, and store the lane in a local `Map` (never on the record object). Step `top` by 32px (28px block + 4px gap) instead of 36px, so the lane stays on the 8px rhythm.
  - The lane spans the full panel width while the chart's plot area starts 64px in and ends 24px short (`m = { l: 64, r: 24 }`, line 92), so a block starting in 2035 sits about 50px left of the chart's 2035. Add `margin: var(--s-2) 24px 0 64px;` to `.timeline` so one age has one x across both.
  - Label: line 38 joins name and year with a space, "Four-day week 2029", which reads as part of the name. Use `b.name + ', ' + b.startYear`. At 1024 the year is cut with no ellipsis, at 390 "Condo in Oakland 20" and "Four". Add `.timeline .block-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }` and change `.timeline .block` `gap: 6px` to `gap: var(--s-1)`.

Chart and comparison

- **R3 The chart is drawn before it is on the page, so it is always 720 units wide and then stretched.** `comparison()` calls `drawPaths(chartHost, c)` (line 88) while the panel is still detached, so `hostEl.clientWidth` is 0 and `W` falls back to 720 (line 92). The viewBox then scales to the panel: at 1440 the axis text renders near 18px and the chart is about 440px tall, larger than the table it explains; at 390 the same text shrinks to about 5px and the axes cannot be read. Fix in two steps, both reuse:
  - Move `drawPaths` into `ui/charts.js` as `paths(host, d, o)` and add it to the `render()` map (charts.js line 26). That module already says "one chart module", already reads `o.width`, and already has `wordFor()` for client words. Under "one formula, one function" the screen should not keep a private chart.
  - In `draw()`, append the comparison panel first, then call `render('paths', chartHost, c, { client: app.view === 'client' })`. Use `H = o.width < 480 ? 200 : 240` so the chart never outweighs the table.

- **R4 Series colours and the legend do not map, and names differ from the table.** The legend (line 101) is four plain chips with no swatch, so nothing ties "Condo in Oakland" to a line. Line shades come from `shade-((i % 2) + 2)` (line 94), so a third block repeats the first block's colour, and `.line.shade-3` is slate while `.legend .swatch.shade-3` is sapphire-900 (app.css lines 372 and 452): the same class name means two colours. The table says "Today's path", "Condo in Oakland alone", "All together"; the legend says "Today", "Condo in Oakland", "Together". Fix with three fixed roles instead of one colour per block:
  ```css
  .line.path-today { stroke: var(--slate); stroke-width: 1.5; stroke-dasharray: 4 4; }
  .line.path-alone { stroke: var(--sapphire-300); stroke-width: 1.5; }
  .line.path-together { stroke: var(--sapphire-700); stroke-width: 2.5; }
  .legend .swatch.path-today { background: var(--slate); }
  .legend .swatch.path-alone { background: var(--sapphire-300); }
  .legend .swatch.path-together { background: var(--sapphire-700); }
  ```
  Give each "alone" path a `<title>` with the block name. Build the legend with the existing swatch chip pattern from charts.js line 76, using three chips with the table's words: "Today's path", "Each alone", "All together". Replace the h2 tag "likely return, real dollars" (line 82) with the caption charts.js already uses for net worth: `chart-label muted` at the bottom left reading "Age. Net worth in today's dollars at the likely return." That labels the x axis, which today shows bare 30 to 90, and says "today's dollars" instead of "real dollars". Place the chart above the table, so its lines sit straight under the blocks (R2 aligns them).

- **R5 The table has five columns where three would do, false precision, and a result that reads backwards.**
  - "FI date" holds ages ("age 49"). "FI moves" and "At 95 moves" are two extra columns that restate their neighbours. At 390 three of the five columns are off the panel with no scroll cue.
  - Projected net worth at 95 is shown to the dollar ("$6,483,027") 68 years out. A workpaper rounds a projection.
  - "All together", the row that answers the question (16 years later, against 5 and 2 alone), looks like every other row.
  - Condo alone shows FI 5 years later and "+$2,193,291" at 95. That is the model working (later FI means more working years), but with nothing to say so it reads as "the condo makes you richer".

  Fix at lines 84 to 86: three columns, Path | FI age (client: "Could stop working at", the existing `CLIENT_WORDS['FI at']`) | Net worth at 95. Cells read `age 54, 5 years later` and `$6.5M (+$2.2M)` using `F.dollarsCompact`. Zero moves read `age 51, same`. Put "All together" in a `tfoot` so it takes the existing `table.data tfoot td` style (paper-2, semibold, top rule). When any row has `fiDelta > 0 && at95Delta > 0`, add one `p.hint` under the table: "A later FI age means more working years, so net worth at 95 can rise even when a block costs money." Rename the panel "Each alone and together" to keep it, but drop its tag (R4 moves it into the chart caption).

Controls

- **R6 Nine equal buttons outside any panel are the loudest thing on the screen.** Line 26 renders one `btn small` per block type in a free row above the Timeline panel. It is one line at 1440, two at 1024 and three at 390, and it outranks the timeline it feeds. Replace it with one select inside the Timeline panel header, in the existing `.row`:
  ```js
  h('div', { class: 'row' }, h('h2', null, 'Timeline'),
    app.view === 'coach' ? h('select', { class: 'select', style: { marginLeft: 'auto', width: 'var(--field-w-wide)' }, 'aria-label': 'Add a block',
      onChange: e => { const t = e.target.value; if (!t) return; const b = newBlock(t, defs, year0 + 3); selected = b.id; app.mutate(rec => { rec.scenarios.push(b); }, 'scenarios'); } },
      h('option', { value: '' }, 'Add a block'), Object.keys(defs.types).map(t => h('option', { value: t }, defs.types[t].label))) : null)
  ```
  Nine controls become one, and the free row goes. Shorten the coach tag (line 43) to "drag, or use the arrow keys" and hide it under 720px. At 390 it wraps "keys" onto a second line today. The coach empty line becomes "No blocks yet. Pick one from Add a block; it starts three years out."

- **R7 The client view shows coach instructions and a lane it cannot use.** In client view there is no add row and no editor, yet the tag says "drag a block, or focus it and use the arrow keys" and the empty line says "Add one above". Blocks have no `draggable` for the client, but `onKeyDown` (line 35) is not guarded, so a client who tabs into the lane and presses an arrow key moves the coach's block. Clicking a block redraws with nothing new to see. Fix:
  - Line 33: give `tabindex: '0'`, `onClick` and `onKeyDown` only when `app.view === 'coach'`.
  - Line 43: show the tag and the empty line only to the coach.
  - When the client has no blocks, skip the timeline and render one `.empty` with h2 "No what-ifs yet" and p "Your coach adds these in a session, for example a home, a child or a job change. Each one runs on a copy of your numbers."
  - When the client does have blocks, keep the lane read-only and use the client words from R5 in the table.

Copy and states

- **R8 Header and empty-state copy.**
  - Line 14 subtitle "Blocks sit on top of the real numbers and never change them. Promote is the only bridge." The first sentence holds the idea; "the only bridge" is a slogan. Coach: "Each block runs on a copy of the real numbers. Only Promote writes one to the Life plan." Client: no subtitle; the page title "What if" is enough.
  - Line 23 empty state: every other screen titles it "Nothing to measure yet" or "Nothing to read yet". "The sandbox needs the real picture first" breaks the pattern, and "sandbox", "blocks" and "replay the whole life" are coach words shown to the client. Use h2 "Nothing to simulate yet" (client: "Nothing to try yet") and p "Needs income, spending, account balances and a birth date." Below it, add the links row pattern from `ledger.js` line 27: Income `#/ledger/income`, Spending `#/ledger/spending`, Investments `#/ledger/invest`, Birth date `#/home`, each `a.next`. The `.empty .next` style (app.css line 218) exists and is unused here. The empty state then has a next step, not just a reason.

- **R9 Editor panel (from source; it never appears in a shot).**
  - It is a fourth `.panel` (line 52) that appears between the timeline and the comparison and pushes the answer below the fold. Render it as a `div` inside the Timeline panel, under the lane, with `border-top: 1px solid var(--line-soft); margin-top: var(--s-3); padding-top: var(--s-3);` and an `h3` for the block name. No new panel.
  - D-034: each input commits on `change` through `app.mutate`, `update()` calls `draw()`, and `clear(body)` destroys the editor while Tab is moving focus to the next field, so the coach loses their place on every field. Split `body` into lane, editor and comparison hosts. Rebuild the editor only when `selected` changes, and mark it `LIVE-FORM: built once`.
  - "Starts in" (line 54) accepts any year; drag and the arrow keys clamp to `[year0, yearN]`. Clamp the same way.
  - Line 62 prints the hint inline inside the label. The home hint is 100 characters and wraps the label column. Keep it in `title` only, and shorten it in `data/scenario-blocks.json` to "Use a negative number if owning costs less than rent."
  - Line 64 joins `def.note` to the computed figures, so "One-off" appears twice in one paragraph. Show only the computed line, "One-off $105,000, then $400 a month more for 30 years.", and move `def.note` to the `title` of the h3.
  - Line 66 shows "Promoted to the Ledger" as `chip gold`, and app.css line 447 gives `.block.promoted` a gold border. Gold is "wins and unlocks only" (tokens.css line 12). Use `chip state-known` reading "In the Life plan" and `.timeline .block.promoted { border-color: var(--sapphire-900); background: var(--paper); }`.

- **R10 One field to remove and one silent zero.**
  - Inheritance asks "Amount after any tax" and then "Share lost to tax or fees", which takes tax out twice. Delete the `taxShare` question, set `oneOff` to `"-amount"` and relabel to "Amount after tax and fees". That is one field fewer. Compatibility: `blockCosts()` reads only `def.questions`, so a stored `answers.taxShare` is ignored; say so in the decision entry.
  - `live()` (view line 18) and `evalFormula()` (engine line 12, `Number(scope[name] || 0)`) turn a missing take-home or spending into 0. A Job change or Sabbatical block on a household without take-home then shows "One-off $0" as if it were a result. Return `null` from `blockCosts()` when a formula names a live figure that is null. Show "Needs take-home pay" in the editor's cost line and "needs" in the table cell, not a number.

## Overall notes

1. What works: the model is right for a coach. Blocks run on a copy of the facts, Promote is the one path into the Ledger, and "each alone and together" answers the question clients actually ask. Maya's table shows the condo and the four-day week costing 5 and 2 years alone but 16 together, an insight no single-scenario tool gives. The palette stays sapphire and slate with no alarm colour, numbers are right-aligned and tabular in 32px rows, block-type labels are plain sentence case ("Replace the car", "Move somewhere cheaper"), and blocks can be moved from the keyboard.
2. Most of the low scores come from two geometry bugs, not from taste. The tick loop marks every late tick as `.end` (R1), and the chart is measured before it is in the DOM (R3). Fixing those two lifts alignment and typography by one or two points on every row with data, and turns the 390 shots from unreadable into usable. R2 then aligns the lane with the chart so a block sits right above the kink it causes.
3. Under the freeze every fix here removes something: nine buttons become one select (R6), five columns become three (R5), the editor stops being a panel (R9), a per-block legend becomes three fixed chips (R4), Inheritance loses a field (R10), and the client gets one sentence instead of an empty grid it cannot use (R7). Round 2 needs two extra shots this set did not include: a block selected in coach view and a promoted block. Without them the editor scores are not yet earned.

## After round 1 (builder's note, not a reviewer score)

Fixes R1 to R10 were applied and the screens re-shot: ticks fall on round
ages in the chart's notation and never anchor right (R1); the lane sizes to
the lanes in use, packs blocks greedily, aligns with the chart's plot area and
labels read "Name, year" with an ellipsis (R2); the paths chart moved into
`ui/charts.js` as `paths` and is drawn after the panel is on the page (R3);
three fixed roles colour the lines and the legend carries swatches with the
table's words (R4); the table has three columns with compact dollars, "All
together" in the foot and a note when a later FI age raises net worth at 95
(R5); nine buttons became one "Add a block" select in the Timeline heading
(R6); the client gets a read-only lane or one plain empty state and no coach
instructions (R7); header and empty copy follow the house pattern with next
links (R8); the editor sits inside the Timeline panel, is built once per
selected block and patched in place, clamps the start year, keeps hints in
titles and marks a promoted block "In the Life plan" in sapphire (R9); the
Inheritance block asks one question and a block that cannot be costed says
"needs take-home pay" instead of $0 (R10, MR-024). The editor is now visible
in every coach shot because the first block is selected by default. Not done:
a promoted block does not appear in the Maya shots. The reviewer did not
re-score this round.
