# Level 3 design critique - Session (coach only)

Reviewer stance: senior product designer, eMoney / audit-workpaper bar, judged as a screen the coach drives live with the client on the call. 4 = a human designer ships it with minor notes. Every score under 4 names one fix (Q-number below); one fix may cover several cells. Selectors are from `ui/views/session.js` and `ui/app.css`.

| Screenshot | Hierarchy | Alignment | Typography | Density | Consistency | Would ship |
|---|---|---|---|---|---|---|
| maya-session-coach-1440 | 3 Q4 | 2 Q1 | 3 Q6 | 3 Q5 | 2 Q2 | 2 Q1 |
| jordan-session-coach-1440 | 3 Q4 | 2 Q1 | 3 Q6 | 3 Q5 | 2 Q3 | 2 Q1 |
| jordan-session-coach-1024 | 3 Q8 | 2 Q1 | 3 Q6 | 3 Q5 | 3 Q7 | 2 Q1 |
| maya-session-coach-390 | 3 Q8 | 2 Q9 | 3 Q6 | 3 Q5 | 3 Q2 | 2 Q9 |

What works: one big question with a single next action, the 32px table rows, right-aligned tabular "A year" figures, the plate counts in the tabs, and an email the coach can send without retyping. The job of each panel is clear.

## Fixes

Layout
- Q1 The circle-back table does not fit its half column. `table.data td { white-space: nowrap }` across five columns in `.grid.grid-2` clips "Leverage" to "Leverag" / "Lev", and its values ("36.7", "3", "2") are cut at 1440. At 1024 State, A year and Leverage are all off-panel and only Fact and Where show. Their plate loses Institution and A year the same way. `.tablewrap` scrolls, but nothing shows that it does. Fix:
  - Give the session its own grid: `.session-grid { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }`, one column below 1280px.
  - Drop the Leverage column from `circleBack()`. The order is the rank, and the score belongs in the drawer.
  - Let the fact cell wrap: `.session-grid table.data td:first-child { white-space: normal; }`.
  - The Sessions note cell is clipped too ("Accounts and safety net ir"); give `td.small` `white-space: normal`.
- Q9 Under 720px every session table clips: plate tasks end at "(rou", circle back shows two of five columns, and session notes are cut. Put the existing `.hide-narrow` on the Where, Institution and Leverage cells, let the task cell wrap, and keep the A year column visible. Money is the reason the list exists.

Hierarchy and headings
- Q4 The next-question card has three filled primary buttons (`askLink()` always returns `btn primary`), and the filled active tab sits beside them, so four blue blocks compete with the one question that matters. Keep `btn primary` for "Ask it" on `.ask.big` only, and make the secondary asks `btn small` outline. Give the smaller cards the same state chip as the big one; today big has Household + Unknown and the small ones have only a planet chip. Replace "leverage 75, about $10,000 a year" with "~$10,000 a year at stake". The rough figure needs its tilde, and the raw score means nothing to a coach mid-call.
- Q8 Header and headings drift:
  - At 390 `main > header .actions` wraps "Close this session" to a centred second line, and shows "Ctrl+. quick note" on a phone. Hide `.actions .kbd` and its label under 1100px, and set `justify-content: flex-start` when wrapped.
  - At 1024 `.panel > h2 .tag` ("their plate by institution, with where to find each number") wraps under the heading. Shorten it to "by institution".
  - The plates panel is the only card with no `h2`, because it opens straight on tabs. Add "Plates" so both columns start on a heading.

Consistency
- Q2 State is written three ways on one screen:
  - Next question and circle back use chips.
  - Their plate appends text: "(rough)", "(will send)".
  - `circleBack()` falls back to the raw `i.source`, so "lookup-verify" appears in lower case with a hyphen.

  Write one `stateChip(i)` in session.js and use it in `nextCard()`, `circleBack()` and `plates()`. Labels: Rough, Will send, Unknown, Estimate, Verify. Give their plate a State column instead of the suffix.
- Q3 Same word, two meanings, wrong colour:
  - The plates column is headed "Done" but each cell is a chip reading "Open" (a status).
  - The filled "Open" buttons in Next question navigate.
  - Jordan's "lookup-verify" chip shows in two styles: the class follows `i.state` while the text follows `i.source`.
  - A done row turns `chip gold`, though gold is for wins at 90%+ confidence.

  Use a real checkbox in a 40px Done column (`aria-label` "Done: <task>"), show done rows in slate with a line-through and no gold, and rename the secondary next-card action "Go to row".
- Q7 Numbers and copy that read as data errors:
  - "Retirement: retirement age $100", "FXAIX: expense ratio $100", "VTSAX $100" and "Target 2060 $100" show a figure borrowed from the row headline (leverage.js line 39) as if it were the fact's own yearly dollars. Keep it for ranking, but show "-" with a title "ranked by its row" in the A year cell.
  - One fact appears in two periods: "$650" (monthly) in the question and "$7,800" (yearly) on the plate.
  - Joins repeat words: "Could cut: could cut per month", "Retirement: retirement age", "Analyst at Brightline Health bonus", "Freelance illustration at Direct clients gross pay". Fix `questionFor()` and the plate label join to read "Freelance illustration (Direct clients): gross pay is ~$650 a month. Can we pin it down?" and to drop a field word that repeats the row.

Typography and density
- Q6 Three text systems in one column:
  - Since last time is a 12px `ul.small` of prose deltas ("balance up $400").
  - The one-pager words the same changes "was $9,800, now $10,200". Two functions, two phrasings.
  - The email is a 12px monospace `textarea.input.email`: a third typeface, and it shows 9 of about 30 lines.

  Render Since last time as a `table.data` (Item, Was, Now, Change; numbers right, tabular) from the same `sinceLastSession()` text the one-pager uses. Set the email in `var(--font)` 13px/20px and auto-grow it to its content, up to 480px.
- Q5 The same unsure fact appears up to four times: "401k: contributed this year" for Maya is the big question, circle-back row 1, their-plate row 3, and the first email block. In Jordan, 8 of 12 circle-back rows repeat on their plate. Under the freeze, merge, do not add: make circle back the one ranked table with a Who column (Them / Me / Small), and let the three tabs filter it. That removes one table and about 400px per column.

## Overall notes

1. The screen asks the right question in the right order. Its defects are tables built for a full-width page placed in half columns. Q1 and Q9 are layout-only changes and would move every alignment and would-ship score up a point.
2. One fact, four places, three notations. Under the freeze, the cheapest win is fewer surfaces (Q5) and one chip vocabulary (Q2, Q3), shared with the one-pager's "Changes since last time" (Q6). Then the coach reads each item once, in one language.
3. One functional gap behind a design one: `snapshot()` sets `const note = window.prompt ? '' : ''`, so every session closed from now on saves an empty summary, and the Sessions table will fill with blank rows. Add a one-line note field in the Sessions panel that "Close this session" saves. The seeded notes show how useful that column is.

## After round 1 (builder's note, not a reviewer score)

Fixes Q1 to Q9 were applied and the session screens re-shot: the session has
its own 7/5 grid that drops to one column under 1280px (Q1), narrow widths
hide Where and Institution and let the task cell wrap (Q9), only the big
question keeps a filled button and the smaller ones read "Go to row" (Q3,
Q4), header actions hide the shortcut hint on phones and the plates panel
starts on a heading (Q8), one `stateChipOf()` writes every state and source
chip (Q2), done rows are a "Done" chip in slate with no gold (Q3), the
borrowed row figure no longer prints as the fact's own yearly dollars and
joins no longer repeat words (Q7), since-last-time uses the one-pager's
"was X, now Y" wording and the email is set in the body face and grows to
its content (Q6), and circle back and both plates are one ranked table,
"Everything unsure", with tabs that filter it (Q5). The functional gap in
`snapshot()` is closed: a note field beside "Close this session" is saved
with the snapshot. The reviewer did not re-score this round.
