# Round 5 findings

Overall verdict: SLAM is in good shape. The headline numbers agree everywhere the agree-check looks: net worth $62,976, surplus $1,012, $712 left after saving, 15.4% savings rate and 3.4 months of runway match across Today, My numbers, Plan and the One-pager. The flow adds up to the dollar ($6,500 in, $6,500 out), and the Needs total of $3,204 reconciles line by line. Dark mode looks designed, and charts mostly answer their titled question and carry "Show as table". The real problems sit at the edges the automated checks skip. The student loan card prints a raw localhost URL. Session and My numbers count open questions differently. The Calendar's month line, the Paychecks plan and the Plan disagree on what October or November actually leaves, and none of these numbers are in the agree-check. The Debt screen is still a 7,000px wall that clips its own table on a phone. The Needs step opens every empty line as a form nobody asked for. The qa-crawl passes while it reports 399 small tap targets and misses a 507px-wide phone page.

| # | Screen | Severity | Who hits it | What is wrong | Specific fix |
|---|---|---|---|---|---|
| 1 | debt (both sizes) | high | Eli, Tom, Alexis | The Student loans card reads "Income-driven payment: Missing: people in the household ,http://127.0.0.1:43735/ledger.html#household.householdSize". It shows a raw URL as text instead of a link, under a red "Missing" chip with no working fix. At 390 that string pushes the page to 507px wide. | Render it as a link: "Add people in the household" pointing at the field. Never print an href as text. Add visible "http" text to the crawl's never-show words. |
| 2 | session, numbers, debt, goals-fi | high | Tom, Eli | The open-question counts disagree. Session says Debt "3 to ask" but the Debt tab says "To fill in (7)". Session says Goals "2 to ask" but Goals says "To fill in (0)". Session's rows add up to 23 while My numbers says "To fill in (37)". | Read both from one open-questions list, with one word ("to fill in") and the same number on both screens. This is the same fix as Q159, extended to every section. |
| 3 | calendar | high | Tom | "October 2026 · $686 more in than out" sits beside a Plan that says "$712 a month left after saving", with nothing to explain the $26 gap. The gap is Streaming: the Calendar charges the full $40, while the Plan counts your $14 share. | Add one line to the month row: "$26 less than the Plan's $712: you front Streaming's $40 and $26 is owed back." Or show the $26 as an "Owed to you" item on the 5th. |
| 4 | paychecks | medium | Tom, Eli | The Nov 1 paycheck needs "$3,070 ... in checking already", and the Calendar shows $2,636 on Oct 31, so it is $434 short. The Calendar and Spending say the shortfall is $227. The Nov 15 paycheck still sends "$495 to the Plan" in the month checking dips under the floor. | Feed Paychecks from the same day-by-day run as the Calendar. Show "Short $227 by Nov 14: move $228" on the Nov 1 row. Hold the Plan share until the shortfall is covered, or say why the two differ (the tax set-aside?). |
| 5 | paychecks | medium | Eli, Tom | "Jan: $3,896 to the Plan" and an all-orange Jan 15 bar are an artifact of the three-month window, because no bills are counted after it. Eli would have to explain this out loud. | End the list at the last paycheck whose bills are known, or hatch the Jan bar and label it "bills after Jan not counted". |
| 6 | paychecks | low | Eli | "The Plan's $712 is a month across the year; this month's bills and paydays fall differently" appears three times, on top of the intro paragraph. | Say it once in the intro and keep each month line to "$495 to the Plan, $3,053 carried". |
| 7 | calendar | medium | Tom | Oct 1 shows Rent, Gym and Federal loan but no "Weekend tutoring +$500". Paychecks puts tutoring on the 1st, and the month's $686 only works if tutoring is counted. | Show the tutoring income on its day in the grid, as the salary already is on the 15th. If it has no fixed day, say so in Maybe money. |
| 8 | calendar | medium | Alexis, Tom | Dates to know reads "Oct 31 Plan: $712 to high-interest debt (a suggestion...)". That is two weeks before checking hits -$227, and Paychecks says November sends only $495. The app suggests a payment that would make the dip worse. | Suggest the amount that keeps checking above the floor, for example "$495 on Nov 15, after moving $228". Or hold the suggestion until the low point is covered. |
| 9 | debt 390, plan-goals 390 | medium | Eli, Tom | The Payoff order table is clipped at phone width: Rate today, Clears and Interest are cut off and the rows are tall and empty. On Plan Goals, "Reached" and "Costs the FI date" are cut the same way. | Below 600px, stack each row as a small card (debt name, balance, rate, clears, interest). |
| 10 | debt | medium | Eli, Tom | The page is 7,038px tall at 390 and 5,426px at 1024. It holds three tiles, each with Show the math, three charts, the order table, three card blocks, utilization, the card picker, a balance-transfer form, a payoff-by-date form and the student loan block, all open. It is all detail, and the answer is hard to find. | Lead with "Debt free about Nov 2028" and the "When is your debt gone?" chart. Fold Every card, Which card should I use?, A balance transfer, Paid off by a date and Student loans into one-line rows. |
| 11 | debt | low | Tom | The "Card interest, month by month" bars have no y-axis and no values, and use a list fold where every other chart has "Show as table". | Add a $ axis or direct labels, and the standard "Show as table" button. |
| 12 | session-needs | medium | Eli, Alexis | Every empty line opens as Amount + Need/Want/No: Renter's insurance, Internet, Car payment, Car insurance, Gas, Car upkeep, Transit, Rides and rideshare, Trainer and Subscriptions. That is shown to a renter whose Profile says she gets around by "A mix" and who already has a bus pass. The page is 3,168px at 390. | Show only filled lines, plus one row "Other lines you might have (10)" that expands. Hide the car lines when the Profile says there is no car. |
| 13 | session-needs | medium | Eli, Tom | The amount boxes have no "$" and no "a month" hint. Once the due-day box is filled it shows a bare "1", "10", "20" or "5", because "Due day" is only a placeholder. | Put a "Due day" label above the box (or prefix it "Day"), and prefix the amount with "$" and the suffix "a month". |
| 14 | session-needs, flow, onepager | medium | Tom | The groups disagree between screens. Session files Phone ($60) under "Accommodation" and Gym under "Health and fitness". Flow and the One-pager put both in "Miscellaneous $424" and call the first group "Housing $1,950". | Use one category list (names and membership) for Session, Flow, Spending chips and the One-pager. |
| 15 | session-needs | low | Eli | Transportation has "Transit", "Rides and rideshare", "Bus pass and rideshare" and "Or one number for all of it": four overlapping ways to enter the same money. | Merge them into "Transit and rideshare" plus the one-number box. |
| 16 | session-needs, numbers | low | Eli | Three words for one idea: the "Rough" chip, the "guess" chip and "guesses to check". | Pick one word, for example "Rough", everywhere. |
| 17 | goals-fi, plan-goals, plan | medium | Tom | "FI number: your goal $1,000,000" is presented as a goal, yet "Your goals: $20,000 in goals", Plan's "Your future 1 goal" and the Plan Goals table list only the Six-month cushion. "There so far: 6.1% of today's" measures against $1,063,800, while the chart beneath it measures against $1,000,000. | Choose one FI target for both the progress and the chart, or label them "6.1% of $1,063,800". Then either list the FI target as a goal or rename it "FI target" so it is not counted as one. |
| 18 | spending | medium | Eli | The Do tab opens with the full Add a purchase form (five fields) and "Miscellaneous" preselected, so a careless entry lands in Misc. The category options are pill chips, not buttons. | Make "Add a purchase" a one-line row that opens the form. Preselect no category. Style the categories as segmented buttons (rule 1). |
| 19 | subscriptions, profile | low | Eli | The demo has no subscriptions, so Subscriptions, the audit chart and the Quarterly review ("no subscriptions yet") are all empty in a demo call. Streaming and Gym show no price. The empty state has no icon. Session Needs also has a separate "Subscriptions" amount line. | Mark Streaming as a subscription in the demo. Show "$40 a month" beside each candidate. Add the designed empty-state icon. Point the Session line at this screen. |
| 20 | plan | low | Tom | Step 3 reads "Store card $1,200, Visa $3,000 at or above 10%", but the Store card is at 0% intro. | Reword to "Visa $3,000 at 22%; Store card $1,200 before its 0% ends Feb 28, 2027". |
| 21 | plan | low | Eli | The bottom rows ("Your money each month", "Your future", "Saved and files") carry grey chips ("$712 a month left", "1 goal", "Download or read in a file") and use a taller, borderless card style unlike the step rows above. | Use the same row style as the steps, with plain right-aligned text instead of chips. |
| 22 | today | low | Tom | The Net worth tile has an unlabelled dashed sparkline, though only one point has been recorded. The tile shows $62,976 as solid while My numbers marks the same number "Rough". | Hide the sparkline until there are two readings, or label it "projected". Carry the Rough mark onto the tile. |
| 23 | today, spending, calendar | low | Tom | "Short $227 by Nov 14" sits next to "Move $228". | Show the same figure, or say "Move $228 (covers the $227 short)". |
| 24 | calendar | low | Eli | At 1024 the page runs full width, left-aligned, while every other screen uses the centered column. The 390 month grid has coloured dots with no legend. It is over budget at 1024 (196 words, 1,504px). | Use the shared page column. Put the colour legend under the grid at 390 too. |
| 25 | qa-crawl report | medium | Eli | The crawl reports "PASS" with "small tap: 399" listed. It misses the 507px-wide debt page at 390 and the visible localhost URL, so the pass overstates the real state. | Make small taps fail (or list the worst screens). Check document scrollWidth at 390 as well as 375. Add "http" and "127.0.0.1" to the never-show words. |
| 26 | whatif | low | Eli | No chart, and the sliders show no range or step, so Eli cannot tell how far a drag goes. | Add min/max labels under each slider and a before/after debt-balance line. |
| 27 | scenarios | low | Eli | "The futures side by side" compares three return sets, not saved scenarios, on a screen titled Saved scenarios. | Retitle it "Same plan, three return sets", or move it to Goals beside the FI chart. |
| 28 | income | low | Eli | "Where does a month's money go?" repeats the Where the money goes screen and the One-pager table. | Replace it with a one-line link to Where the money goes. |

## Count by severity

- High: 3
- Medium: 12
- Low: 13

## Per screen

- today: fine, except the unlabelled dashed sparkline (low).
- networth: fine; the waterfall adds up to $62,976 including the $176 owed to you.
- flow: fine; the totals reconcile to $6,500 and $712.
- session: open-question counts disagree with My numbers (Debt 3 vs 7, Goals 2 vs 0).
- session-needs: every empty line is open as a form; due-day boxes lose their label.
- numbers: "To fill in (37)" does not match Session's 23.
- debt: raw localhost URL in the student loan card; 7,000px tall; table clipped on a phone.
- income: fine; the month chart repeats the flow (low).
- taxes: fine (13 of 13 vs To fill in (2) is Q159).
- goals-fi: 6.1% progress uses $1,063,800 while the chart and "your goal" use $1,000,000.
- subscriptions: empty in the demo; candidates show no price.
- calendar: "$686 more in than out" vs the Plan's $712; tutoring missing on Oct 1.
- spending: purchase form open by default with Miscellaneous preselected.
- plan: step 3 calls a 0% Store card "at or above 10%".
- paychecks: Nov shortfall ($3,070 needed vs $2,636) does not match the Calendar's -$227; the Jan $3,896 artifact.
- whatif: fine, apart from no chart and unlabelled slider ranges.
- calls: fine.
- solve: fine; it waits for an age as Q160 says.
- plan-goals: table clipped at 390; the FI target is not listed as a goal.
- scenarios: the futures chart is titled under Saved scenarios but compares return sets.
- profile: fine.
- onepager: fine; name, date, preparer and the education line are all present.
- windfall: fine (asking about tax twice is Q158).

## Numbers that disagree

1. Open questions. Session: "Debt ... 3 to ask" vs Debt tab: "To fill in (7)". Session: "Goals ... 2 to ask" vs Goals: "To fill in (0)". Session's rows total 23 (4+3+6+8+2) vs My numbers: "To fill in (37)".
2. What October leaves. Calendar: "October 2026 · $686 more in than out" vs Plan and Today: "$712 a month left after saving". The $26 gap equals Streaming's $40 bill less the $14 share the Plan counts, and neither screen says so.
3. The November shortfall. Paychecks: "$3,070 has to be in checking already, more than checking holds", against the Calendar's Oct 31 balance of "$2,636", which makes $434 short. Calendar and Spending say "Lowest: -$227 on Nov 14, 2026" and "Short $227 by Nov 14". If the $207 difference is the tax set-aside, the Paychecks screen should say so.
4. What goes to the Plan in November. Calendar: "Oct 31 Plan: $712 to high-interest debt" vs Paychecks: "Nov: $495 to the Plan". These are the same month, with the Calendar's own low point between them.
5. The FI target. Goals: "FI number: your goal $1,000,000" and "Invested money passes the FI number of $1,000,000 around 2046", vs "There so far 6.1% of today's" and the One-pager's "6.1% of $1,063,800 at today's spending". The goal shown as yours is not the one progress is measured against. Separately, "Your goals: $20,000 in goals" and Plan's "Your future 1 goal" leave the $1,000,000 goal out.
