# Round 4 findings

The app looks finished and is mostly calm. Both automated gates pass: agree-check gives 21 metrics the same everywhere, and qa-crawl finds no errors, NaN or overflow. The headline numbers check out by hand. Net worth: $87,176 in assets less $24,200 in debts is $62,976. The flow sums to $6,500 in and $6,500 out, with $712 left after saving. Monthly surplus: $4,711 less $3,204 spending, $342 debt and $153 tax set-aside is $1,012. Cash runway: $12,000 divided by $3,546 a month is 3.4 months.

The trust problems come from counts and states the agree-check registry does not cover:
- Maybe money reads "none" on Calendar and "1 item" on Income.
- The Session's question counts do not match My numbers' "To fill in" counts.
- The Paychecks screen sends $495 and $478 a month to the Plan, which says $712 a month.
- The Rough mark comes and goes for the same number from screen to screen.

Beyond those, the Debt screen is the weak spot: 7,058px tall at 390, three primary buttons, and tables cut off on a phone. Several charts also repeat on a second screen, so things get said twice.

| # | Screen | Severity | Who hits it | What is wrong | Specific fix |
|---|---|---|---|---|---|
| 1 | calendar, income | high | Tom | Calendar row reads "Maybe money · none"; My numbers > Income row reads "Maybe money 1 item". Same list, two counts. | Read both rows from one count. If the Income item is dated outside the month or has no day, say so on Calendar, for example "1 with no day yet". Add the count to agree-check. |
| 2 | paychecks | high | Tom, Eli | Nov 1 + Nov 15 is a whole month, yet it sends "$495 to the Plan"; Dec sends "$478". The Plan says "$712 a month left after saving goes to these steps". The intro says the gap is bills falling between paydays, but a full month should still add up to $712. | Add a monthly subtotal under each pair, for example "November: $495 to the Plan (Plan average $712; $217 more went to X)", and name X. If it is the shortfall cover or card charges, say so. Otherwise fix the run so the monthly sum matches. |
| 3 | session, numbers, goals-fi, debt | high | Tom | The Session overview says "Goals · 2 questions" and "Debt · 3 questions". The screens themselves say Goals "To fill in (0)" and Debt "To fill in (7)". In total the Session lists 23 questions; My numbers says "To fill in (37)". | Use one open-questions count for both. If "questions" and "To fill in" really are different sets, rename one, for example "3 to ask today" against "7 blank fields", so they stop looking like the same number. |
| 4 | calendar | medium | Tom | "October 2026 · $686 more in than out" sits a tap away from "$712 a month left after saving". Nothing says why October differs. | Add a few words: "October: $686 more in than out (your average month leaves $712; October has X)". |
| 5 | session, numbers | medium | Tom | The Session marks Income "$6,500 a month before tax · Rough". My numbers shows Income "$6,500 a month before tax" with no guess chip. Still guessing counts 5 (Assets 1, Needs 3, Profile 1), so Income is not in it either. | Give Income one rough state in both places. Either show "1 guess to check" in My numbers or drop the Rough chip in the Session. |
| 6 | today, numbers, onepager | medium | Eli, Tom | Net worth $62,976 carries "Rough" in My numbers and a hatched total bar on the Net worth screen. The Today tile and the One-pager show it as plain fact. | Show a small "rough" mark (dashed underline or a "~") on the Today tile and the One-pager figure, as the chart standard asks. |
| 7 | profile, debt, numbers | medium | Tom, Alexis | Profile says "Your life 39 of 39 answered". My numbers says "Profile 7 of 7 filled in · 1 guess to check". Debt shows red "Missing: people in the household". All three can't be right. | Count household size as a Profile question and show it as open on Profile. Use one denominator for "Profile" in both places. |
| 8 | calendar | medium | Alexis, Eli | "Dates to know: Oct 31 Plan: $712 to high-interest debt (a suggestion, not in the cash line: check the lowest day first)". Following it on Oct 31 would deepen the Nov 14 low from -$227 to about -$939. | While a shortfall is ahead, show only what is safe, for example "Oct 31: pay $484 extra (keeps you above the floor)", or hold the suggestion until after the Nov 15 payday. |
| 9 | plan | medium | Tom | Steps 4 to 7 each say "about Aug 2028", with the note "These four run together from Aug 2028". It is unclear whether Aug 2028 is a start or a finish. Step 3 ends Apr 2027, so Apr 2027 to Aug 2028 is unexplained. | Label the dates as "starts" or "done by" (for example "Done about Aug 2028"), and say what the $712 does between Apr 2027 and Aug 2028. |
| 10 | debt | medium | Tom, Alexis | The main number is "On every card $4,200". Total debt ($24,200) is not at the top. The screen runs 7,058px at 390 and 5,426px at 1024 (orders, two charts, cards, utilization, which card, balance transfer, solve, IDR). | Lead with "$24,200 owed · debt free about Nov 2028". Move Which card, Balance transfer, Paid off by a date and Student loans into collapsed rows. |
| 11 | debt | medium | Eli | At 390 the Payoff order table shows only # / Debt / Balance. "RATE T…", Clears and Interest are cut off, leaving rows of empty space. The Which card table cuts off FLOAT ("29 d / inter / free"). | Below 600px, stack each row as a card (name, balance, rate, clears, interest), or drop to Debt / Balance / Clears with the rest one tap away. |
| 12 | debt | medium | Eli | Three filled primary buttons: "Compare the cards", "Work it out" (balance transfer) and "Work it out" (by a date). | Keep one primary. Make the others outlined secondary buttons, per rule 2. |
| 13 | debt | medium | Alexis | Student loans: red "Missing: people in the household" and a red "Missing" chip with no button to fix it. | Add "Add household size" next to the red text, opening the Profile question in place. Use the caution color, not danger. |
| 14 | debt | medium | Eli | The "Card interest, month by month" bars have no y-axis or values, so the height means nothing at a glance. | Add a money axis in whole dollars, or direct labels on each bar, for example "$51". |
| 15 | flow | medium | Eli | At 1024 the "Visa $90" and "Store card $40" nodes and labels sit on top of the Housing ribbon, so cards and rent look tangled. | Put the card nodes in their own lane above Debt payments, or route them below Housing. |
| 16 | income, solve | medium | Eli | Income repeats the whole "Where does a month's money go?" waterfall that the Flow screen already shows. Solve ("What it takes to get there") repeats both FI charts from Goals. | Keep each chart on one screen. Elsewhere, use a one-line row linking to it ("Where the money goes: $712 left ›"). |
| 17 | goals-fi | medium | Eli | Seven "Show the math" pills and six "Rough" chips on one card grid. Chips on nearly every tile. | Use one "Show the math" per card group and one line "FI numbers are rough: spending has 3 guesses". Let tapping a figure open its math. |
| 18 | goals-fi, solve | medium | Eli | In dark mode the "Invested, projected" line (orange dashed) and "Fat FI" (pink dashed) are nearly the same color and pattern. | Give the projection a solid accent with a dashed segment, and give Fat FI a neutral gray dash from the shared palette. |
| 19 | taxes | medium | Tom | The bracket bar fills the whole 22% bracket to the right edge past the triangle. The legend lists "Brackets above yours", which is not drawn. It reads as if income fills the 22% band. | Fill only up to $55,476, draw the rest of the 22% band and the higher brackets in light gray, and drop unused legend items. |
| 20 | calls | medium | Tom | The Store card row says "Intro 0% until Feb 28, 2027, then 29.99%: about $30 of interest a month after that". Today and the One-pager say interest is deferred: about $360 lands if not cleared. | Use the same sentence on Calls: "Deferred interest: about $360 lands if any is left on Feb 28, 2027." |
| 21 | session-needs | medium | Eli | Once filled, the second box beside each amount ("1", "10", "20", "5") has no label. "Due day" exists only as a placeholder on empty rows. | Put a visible "Due day" label above the box (rule 3), or show it as "Due on the 10th". |
| 22 | session-needs, session, numbers | medium | Tom | "Needs $3,204 a month" includes lines marked Want: Eating out $200, Gym $50 and Streaming $14. | Rename the step "Spending" (as Flow does), or split it: "Needs $2,940 + Wants $264". |
| 23 | plan-goals | medium | Tom | The "Costs the FI date" cell is blank for Six-month cushion (empty, not zero, unexplained). At 390 that column is cut off entirely. The bar says "no pace set yet" while the same row says "the Plan's step 8 puts it about Jan 2031". | Fill the cell or write "not figured: no pace". Use "Plan pace: about Jan 2031" in place of "no pace set yet". Stack the table at phone width. |
| 24 | spending, calendar | medium | Eli | "Check in balances: Up to date" while Cash by day is drawn "As of Oct 22" and today is Oct 27. | Show "Last checked Oct 22 (5 days)" on the row and turn it to caution past a set age. |
| 25 | all | medium | Eli | qa-crawl passes but reports "small tap: 399". Examples are the "Edit ›" links on each Flow row and "Call script" toggles. | Bring every target to at least 44x44px (rule 7). Make qa-crawl fail when the count goes up. |
| 26 | onepager | medium | Alexis, Tom | The handout leaves out the most urgent item on Today: checking hits -$227 on Nov 14 and $228 needs to move by Nov 11. | Add one calm line under "Your next step": "Before Nov 11: move $228 from High-yield savings to checking." |
| 27 | goals-fi, onepager | low | Tom | Progress "6.1%" is measured against $1,063,800 (today's spending), while the FI date "around 2046" uses $1,000,000 (your goal). Each is labelled, but Eli has to explain why there are two targets. | Measure both against the same target, or add "(of your $1,000,000 goal: 6.5%)". |
| 28 | whatif | low | Eli | Sliders have no visible range and no box to type an exact amount. "Set all back to zero" is enabled when everything is already zero. There is no chart. | Add a number box beside each slider, show min and max, disable "Set all back to zero" at zero with the reason, and add a small before/after chart. |
| 29 | calendar | low | Eli | At 1024 the page is full width (left edge 12px) while every other screen is centered at about 84px. The "Cash" end label overlaps the last dot. | Use the shared centered container and offset the end label. |
| 30 | subscriptions, profile | low | Eli | The demo shows "No subscriptions yet" even though Streaming and Gym are monthly renewals. The Audit and the Quarterly review can't be demoed. The empty state has no icon and no single primary button. | Mark Streaming and Gym as subscriptions in the demo household. Give the empty state an icon, one sentence and one primary button. |

## Count by severity

- High: 3
- Medium: 23
- Low: 4

## Per screen

- today: The net worth tile shows no rough mark, although My numbers marks the same number Rough (#6).
- networth: Fine.
- flow: At 1024 the card nodes sit on top of the Housing ribbon (#15).
- session: Question counts disagree with My numbers' "To fill in" counts (#3), and Income is marked Rough here only (#5).
- session-needs: Filled due-day boxes have no label (#21), and the "Needs" total includes Wants (#22).
- numbers: Net worth is Rough here but not elsewhere (#6). "To fill in (37)" does not match the Session (#3).
- debt: Too long, with no total at the top (#10); tables are cut off at 390 (#11); three primary buttons (#12).
- income: "Maybe money 1 item" disagrees with Calendar (#1), and the money waterfall is a copy of Flow's (#16).
- taxes: The bracket bar fills past your income (#19). (The "13 of 13" against "To fill in (2)" mismatch is Q159.)
- goals-fi: Seven Show the math pills and six Rough chips (#17); Invested and Fat FI lines look alike (#18).
- subscriptions: The demo is empty, so the audit can't be shown (#30).
- calendar: "Maybe money · none" disagrees with Income (#1); the Oct 31 $712 suggestion deepens the low (#8).
- spending: "Up to date" while balances are from Oct 22 (#24).
- plan: Steps 4 to 7 dates are unclear: start or finish (#9).
- paychecks: Monthly "to the Plan" ($495, $478) does not match $712 (#2).
- whatif: No typed value and no chart (#28).
- calls: Store card row leaves out the $360 deferred interest (#20).
- solve: Repeats both FI charts from Goals (#16). It does say it will not answer until an age is typed (Q160).
- plan-goals: Blank "Costs the FI date" cell and "no pace set yet" next to Jan 2031 (#23).
- scenarios: Fine.
- profile: "39 of 39 answered" while household size is missing on Debt (#7).
- onepager: Leaves out the Nov 14 cash shortfall (#26).
- windfall: Fine apart from asking about tax twice, which is Q158.

## Numbers that disagree

1. **Maybe money count.** Calendar: "Maybe money · none". My numbers > Income: "Maybe money 1 item".
2. **Money to the Plan each month.** Plan: "$712 a month left after saving goes to these steps". Paychecks: "Nov 15, 2026 … $495 to the Plan" (the Nov 1 paycheck goes "all to bills and spending", so the month is $495) and "Dec 15, 2026 … $478 to the Plan". The intro blames timing between paydays, which does not explain a full month coming up short.
3. **Open questions.**
   - Session: "Goals … 2 questions". Goals screen: "To fill in (0)".
   - Session: "Debt … 3 questions". Debt screen: "To fill in (7)".
   - The Session rows add up to 23 questions. My numbers: "To fill in (37)".
4. **This month's leftover.** Calendar: "October 2026 · $686 more in than out". Plan, Flow and Today: "$712 a month left after saving". Nothing says why October differs.
5. **Profile completeness.** Profile: "Your life 39 of 39 answered". My numbers: "Profile 7 of 7 filled in · 1 guess to check". Debt: "Missing: people in the household".
6. **Rough state of the same figures.** These are states, not values.
   - Net worth $62,976 is "Rough" in My numbers but unmarked on Today and the One-pager.
   - Income $6,500 is "Rough" in the Session but has no guess flag in My numbers.

Left out on purpose, because Q154, Q155, Q161 and Q162 already cover them:
- Debt free Nov 2028 against Jul or Jun 2033.
- "Every card clear Apr 2027" against Visa "$2,528, revolving" at the end of the run.
- Store card interest of $196 against the $360 deferred lump.
- Visa "paid last" against ranked #2.

Also left out:
- Calls "about $660 of interest a year at this balance" against Debt "$608" for the next 12 months: each is labelled as a different basis.
- Income "Lands in your account $4,211" against Flow "Checking $4,711": the second adds tutoring, and both labels say so.
