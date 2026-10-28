# My method: defaults to review

This lists 15 open questions from `QUESTIONS.md` where the default the app uses changes a number on Today, the Plan or Goals, with what each one is worth on the demo household.
No default was changed: every number below was computed with the engine on `fixtures/demo.json` (made up, numbers as of Oct 22, 2026, Standard assumption set), once as the app is and once with the other option.

How to read it. Part A moves the demo as it stands, biggest first. Part B only moves the demo once a field is blank or a Profile answer is different, so each was run on a copy of the demo with that one change, named in the entry. Biggest first again.

The demo today, for reference: net worth $62,976, reachable after all debts $4,800, Left a month (monthly surplus) $1,011.77, savings rate 19.1%, FI number $1,000,000, years to FI 20.1, cash runway 3.4 months, tax due at tax time $1,072.63, Store card clear Dec 2026, Visa clear Apr 2027, all debt gone Oct 2029, next step "Clear the Store card before its intro rate ends".

| # | Question | Headline that moves | Size on the demo |
| --- | --- | --- | --- |
| **A** | **Moves the demo as it is** | | |
| 103 | Does money left over count as saving? | Savings rate | 19.1% to 32.1% (+13.1 points) |
| 93 | Which assumption set opens first, and are its numbers right? | FI number, years to FI | 20.1 years to 26.1 (Conservative) or 16.9 (Optimistic); FI number $1,000,000 to $1,142,857 or $851,064 |
| 102 | Is "Left a month" before or after saving? | Monthly surplus | $1,011.77 to $711.77 (-$300 a month) |
| 137 | Should the 5% student loan be paid down by its interest, like the cards? | Card payoff dates, all debt gone | Visa clear Apr 2027 to Dec 2028 (20 months later); all debt gone Oct 2029 to Dec 2028 (10 months sooner) |
| 104 | Does the employer match count in the savings rate? | Savings rate | 19.1% to 15.4% (-3.7 points) |
| 9 | Do runway and the cushion count debt minimums as spending? | Cash runway, the Plan's reserve step | 3.4 to 3.7 months; reserve step $10,695 to $8,506; all debt gone 2 months sooner |
| 1 | Are the 2026 New York tax rates right? | Tax due at tax time, monthly surplus | $1,072.63 to $1,136.20 (+$63.57); Left a month -$9.08 |
| 12 | Should the projection count only certain income? | Years to FI | 20.1 to 20.2 years |
| 14 | Should Lean FI count eating out? | Lean FI number (Goals) | $774,000 to $834,000 (+$60,000) |
| **B** | **Moves only with one change to the demo** | | |
| 169 | Should Social Security count toward FI? | FI number, years to FI | Per $1,000 a month counted: $1,000,000 to $700,000; 20.1 to 15.9 years |
| 165 | Is 5.2% the right start for guardrails? | FI number, years to FI | $769,231 and 18.3 years at 5.2%, against $1,000,000 and 21.8 years at 4% |
| 107 | How many months does okay or shaky income add to the cushion? | The Plan's reserve step, all debt gone | If income is okay: reserve step $14,241 now, $17,787 at +2 months; all debt gone 4 or 7 months later |
| 143 | Does a protection gap go ahead of card interest? | The Plan's next step | "Get disability insurance" against "Clear the Store card" |
| 6, 19 | Is $40 the right smallest card minimum? | Monthly surplus, cash runway | +$15 a month at $25 |
| 7 | What rate does a card with no rate typed get? | Next step's dollars, Plan interest | $62.50 against $52.50 a month on the Visa; $47 of interest |

---

## Part A: moves the demo as it is

### A1. Question 103: does money left over count as saving?

- **Question:** The savings rate counts only money given a job (into an account, or extra at a debt). Should money left over at the end of the month count too?
- **Default now:** assigned money only. The demo saves $1,040 a month (Roth $300, 401(k) $500, match $240) over $5,451 (take-home plus 401(k) plus match).
- **Other option:** count the $711.77 left after saving as saved, too (how the app worked before).
- **On the demo:** savings rate **19.1% now, 32.1%** with the other option (+13.1 points). Nothing else on Today moves.
- **Your answer:** ______________________________

### A2. Question 93: which assumption set opens first, and are its numbers right?

- **Question:** Every FI number reads one of four sets. Standard opens first. Are the sets' numbers right (please check Optimistic's 7% and 4.7%), and is Standard the right one to open on?
- **Default now:** Standard: 6% real return, 4% withdrawal rate.
- **Other option:** Conservative first: 4% return, 3.5% withdrawal rate.
- **On the demo:**
  - Standard (now): FI number **$1,000,000**, years to FI **20.1**.
  - Conservative: FI number **$1,142,857** (+$142,857), years to FI **26.1** (+6.0 years).
  - Optimistic: FI number **$851,064** (-$148,936), years to FI **16.9** (-3.2 years).
  - Your own (the demo's typed 5% and 4%): FI number $1,000,000, years to FI **21.8** (+1.7 years).
- **Your answer:** ______________________________

### A3. Question 102: is "Left a month" before or after saving?

- **Question:** Today's Monthly surplus is take-home less spending, debt minimums and the tax set-aside, before saving. Should it be what is left after saving instead?
- **Default now:** before saving: **$1,011.77**, with "$711.77 after saving" under it. The Plan already works from the after-saving number.
- **Other option:** lead with what is left after saving (the $300 Roth taken off too).
- **On the demo:** Left a month **$1,011.77 now, $711.77** with the other option (-$300 a month, about 30% less).
- **Your answer:** ______________________________

### A4. Question 137: should the 5% student loan be paid down by its interest, like the cards?

- **Question:** A debt under the high-rate line (10%) is not ranked by the interest it costs; it waits until after reserves, the Roth and retirement. Should the student loan join the cards instead?
- **Default now:** the loan keeps its place at the end. Its $83.33 a month of interest is not ranked.
- **Other option:** rank it by its interest like the cards. The engine does this only when the loan sits at or above the high-rate line, so this was run with the line at 5%.
- **On the demo:**
  - Next step: unchanged ("Clear the Store card", $119.96 a month). The loan becomes the second step ($83.33), ahead of the Visa ($55).
  - Visa clear: **Apr 2027 now, Dec 2028** (20 months later).
  - High-interest debt gone: Apr 2027 to Dec 2028. All debt gone: **Oct 2029 to Dec 2028** (10 months sooner).
  - Interest on the Plan: $2,255 to $2,216 (-$39).
- **Your answer:** ______________________________

### A5. Question 104: does the employer match count in the savings rate?

- **Question:** The savings rate adds the employer match to both what is saved and what comes in. Should the match be left out?
- **Default now:** counted: ($1,040) / ($5,451) = 19.1%.
- **Other option:** leave the match out: ($800) / ($5,211).
- **On the demo:** savings rate **19.1% now, 15.4%** with the other option (-3.7 points).
- **Your answer:** ______________________________

### A6. Question 9: do runway and the cushion count debt minimums as spending?

- **Question:** Cash runway and the cushion target both use spending plus debt minimums ($3,204 + $342 = $3,546 a month). The brief says "months of expenses". Which base do you want?
- **Default now:** spending plus minimums.
- **Other option:** spending only ($3,204).
- **On the demo:**
  - Cash runway: **3.4 months now, 3.7 months** (+0.4 month).
  - Cushion target (age 32 / 5 = 6.4 months): $22,695 to $20,506, so the Plan's reserve step goes from **$10,695 to $8,506** to go.
  - All debt gone: **Oct 2029 to Aug 2029** (2 months sooner); interest $2,255 to $2,078.
  - Next step: unchanged.
- **Your answer:** ______________________________

### A7. Question 1: are the 2026 New York tax rates right?

- **Question:** The 2026 NY rates were entered from memory of the 2026 budget (the lower five cut to 3.9%, 4.4%, 5.15%, 5.4%, 5.9%). Please check them against the 2026 IT-201 instructions.
- **Default now:** the cut rates above.
- **Other option:** the cut is not in effect for 2026, so the 2025 rates apply (4%, 4.5%, 5.25%, 5.5%, 6%; same thresholds).
- **On the demo:** tax due at tax time **$1,072.63 now, $1,136.20** (+$63.57). The monthly tax set-aside rises from $153.23 to $162.31, so Left a month drops $9.08 to $1,002.69.
- **Your answer:** ______________________________

### A8. Question 12: should the projection count only certain income?

- **Question:** The projection weighs money that may come by how likely it is (the demo's $3,000 spring bonus at 50%). Would you rather see only certain income first?
- **Default now:** weighted by likelihood.
- **Other option:** certain income only (the bonus left out).
- **On the demo:** years to FI **20.1 now, 20.2** (+0.1 year). Nothing else on Today moves.
- **Your answer:** ______________________________

### A9. Question 14: should Lean FI count eating out?

- **Question:** Lean FI counts food, housing and transport that are needs, so eating out (a want) is left out. Question 106 kept it that way. Should eating out count?
- **Default now:** needs only: $2,580 a month, Lean FI **$774,000**.
- **Other option:** every food, housing and transport line, eating out included ($2,780 a month).
- **On the demo:** Lean FI **$774,000 now, $834,000** (+$60,000). This shows on Goals, not on Today. The main FI number does not move.
- **Your answer:** ______________________________

---

## Part B: moves only with one change to the demo

### B1. Question 169: should Social Security count toward FI?

- **Question:** One Social Security estimate per person is recorded, but the FI date and number do not count it yet. Should they?
- **Default now:** recorded only; not counted.
- **Other option:** count it the way a pension is counted now: in full against spending when it starts by age 65.
- **On the demo:** the demo has no estimate typed, so nothing moves today. On a copy with an illustration of $1,000 a month from age 65 (or 62, the same result): FI number **$1,000,000 to $700,000** (-$300,000, which is $12,000 a year / 4%), years to FI **20.1 to 15.9** (-4.2 years). The size scales with the estimate. Note that the pension method counts it in full even though FI comes at about age 52, years before it starts (question 181 asks about this).
- **Your answer:** ______________________________

### B2. Question 165: is 5.2% the right start for guardrails?

- **Question:** Guardrails are offered as a 5.2% starting rate. The FI number uses 5.2%, but the yearly spending cuts and raises are not modelled. Keep 5.2%, or start lower until they are modelled?
- **Default now:** 5.2% when guardrails is picked (it switches to the Your own set, the demo's 5% return).
- **Other option:** a plain 4% (or 4.7%, Bengen 2025) until the guardrails are modelled.
- **On the demo:** the demo does not pick guardrails, so nothing moves today. With it picked:
  - 5.2%: FI number **$769,231**, years to FI **18.3**.
  - 4.7%: $851,064, 19.6 years.
  - 4%: **$1,000,000**, **21.8** years.
  - So guardrails at 5.2% shows $230,769 less to reach and 3.5 fewer years than 4%.
- **Your answer:** ______________________________

### B3. Question 107: how many months does okay or shaky income add to the cushion?

- **Question:** Income security adds months to the Rule of 5 cushion: okay adds 1, shaky adds 3. Right amounts?
- **Default now:** okay +1, shaky +3.
- **Other option:** okay +2 (shaky left at 3).
- **On the demo:** the demo has no income security answer, so nothing moves today. On a copy that answers "okay":
  - Default (+1): the Plan's reserve step goes from $10,695 to **$14,241** to go; all debt gone **Oct 2029 to Feb 2030**.
  - Other option (+2): reserve step **$17,787**; all debt gone **May 2030**.
  - Shaky (+3), for reference: $21,333; Aug 2030.
  - Each month added is $3,546 more to save and pushes the student loan's clear month back 3 or 4 months. Runway, the next step and the card dates do not move.
- **Your answer:** ______________________________

### B4. Question 143: does a protection gap go ahead of card interest?

- **Question:** Once the starter fund is there, a protection gap from the Profile (no disability cover, no renters insurance, and the like) becomes the next step, ahead of the cards. Right place?
- **Default now:** right after the starter fund, so ahead of card interest.
- **Other option:** after the steps that lose money each month (card interest, the promo, a missed match).
- **On the demo:** the demo has no gap, so nothing moves today. On a copy that answers "no disability insurance": the next step is **"Get disability insurance"** now, and **"Clear the Store card before its intro rate ends"** ($119.96 a month) with the other option. No dollar number moves.
- **Your answer:** ______________________________

### B5. Questions 6 and 19: is $40 the right smallest card minimum?

- **Question:** A card with no minimum typed gets the larger of $40 or 1% of the balance plus a month of interest. Keep $40, or go back to $25?
- **Default now:** $40 at the least.
- **Other option:** $25 at the least.
- **On the demo:** both card minimums are typed, so nothing moves today. On a copy with both left blank: the Visa reads $85 either way; the Store card (0% promo, $1,200) reads $40 now or $25. Left a month **$1,016.77 to $1,031.77** (+$15 a month); runway 3.39 to 3.40 months; reserve step $10,663 to $10,567; Plan interest $2,235 to $2,228. Card dates do not move.
- **Your answer:** ______________________________

### B6. Question 7: what rate does a card with no rate typed get?

- **Question:** A card with no rate typed (including the rate after a 0% promo) uses 25%, marked as a guess. Right number?
- **Default now:** 25%.
- **Other option:** 21%, closer to a typical card rate.
- **On the demo:** every card has a rate typed, so nothing moves today. On a copy with the Visa's rate left blank: the step "Pay down the Visa" says **$62.50 a month** of interest now, **$52.50** with 21%; Plan interest $2,291 against $2,244 (-$47). The order, the next step and the dates do not move. (Blanking the Store card's rate instead moves its promo step from $119.96 to $100 a month; it still leads.)
- **Your answer:** ______________________________

---

## Checked and left out

- **Question 153 (payoff order):** highest rate first, smallest balance first and most stressful first clear the demo's debts in the same order and month, so there is no difference to show.
- **Questions 176, 177, 178, 181 (unvested money, graded vesting, stock and bond returns, a pension's raise):** the demo has no vesting, no typed mix and no pension, so none of these move it. Each would need a made-up account to show a number.
- **Question 188 (housing line, car or no car):** a reference line on Spending and the Plan, not a headline number.
