// Hand-computed expected answers for Maya, 26, single renter in NYC, the worked example household:
// one W-2 job paid biweekly, a student loan, every category with an actual, rated lines, a plan
// and a review month. Read by tests/households.test.js and tests/coverage.test.js, which compare
// them with buildSummary over maya.json, and by tools/screens-check.mjs, which checks the screens
// against them in a browser. The dream column is not read from here: tests/dreams.test.js checks
// it in Eras with its own hand-worked numbers.

// INCOME
// Take-home 1,800 per paycheck, biweekly: 1,800 x 26 / 12 = 3,900.00 a month.
// Pre-tax retirement 120 per paycheck: 120 x 26 / 12 = 260.00 a month.
// Hours: 40 a week x 52 / 12 = 173.333 hours a month. Hourly = 3,900 / 173.333 = 22.50.

// CATEGORY TOTALS (estimate / dream / actual), all from lines. The budget checks estimate and
// actual only (S-097); the dream column is listed for the record, not checked from here.
// Housing:   rent 1600/1600/1600 + utilities 80/80/110 + internet 40/40/40 = 1720 / 1720 / 1750
// Food:      groceries 300/280/380 + eating out 200/150/340 + delivery 50/0/120 = 550 / 430 / 840
// Transport: MetroCard 132/132/132 = 132 / 132 / 132
// Debt:      student loan minimum 300 (computed) = 300 / 300 / 300
// Health:    out of pocket 40/40/25 + therapy 120/120/120 = 160 / 160 / 145
// Bills:     subscriptions 45/30/68 + late fee 0/0/39 (moved from Fees, S-123) = 45 / 30 / 107
// Fun:       shopping 100/80/210 + concert (no estimate, no dream) 160 = 100 / 80 / 370
// Annual:    1,200 a year = 100; 1,200 a year = 100; 1,440 a year = 120 -> 100 / 100 / 120
// Giving:    50 / 100 / 50
// Savings:   emergency 200/400/150 + retirement not-for-me (0) = 200 / 400 / 150

// SPENDING (everything except Savings)
// Estimates: 1720+550+132+300+160+45+100+100+50 = 3,157
// Dreams:    1720+430+132+300+160+30+80+100+100 = 3,052
// Actuals:   1750+840+132+300+145+107+370+120+50 = 3,814 (every category has an actual)
// Outflow = 3,814 + savings 150 = 3,964. Surplus = 3,900 - 3,964 = -64 (a shortfall).
// Savings rate = (150 + 260) / (3,900 + 260) = 410 / 4,160 = 0.098558
// Housing share = 1,750 / 3,900 = 0.448718 (over the 35% band)
// Roommate worst case = 1,750 - your share (the rent line, 1,600) + full rent 3,200 = 3,350; 3,350 / 3,900 = 0.858974

// BLIND SPOT: overage per category where actual > estimate
// housing 30, food 290, bills 62 (107 - 45), fun 270, annual 20 (all others 0) = 672
// 672 / 3,814 = 0.176193

// CULPRITS: food +290 (840/550 = 1.527273), fun +270 (370/100 = 3.7), bills +62 (107/45 = 2.37777778 -> 2.377778)
// Back to your own words, yearly: 290x12 = 3,480; 270x12 = 3,240; 62x12 = 744

// GUT CHECK (S-097: gut vs sum of estimates vs actual): gut 2,800 / estimates 3,157 / actual 3,814
// actual - gut = 1,014; actual / gut = 1.362143

// PROOF OF CASH: implied = 3,900 - savings 150 - debt 300 = 3,450
// entered = 3,814 - 300 = 3,514; diff = +64; 64 / 3,450 = 0.018551 -> not flagged

// FIXED vs VARIABLE (spending lines)
// fixed: rent 1600 + internet 40 + MetroCard 132 + debt 300 + therapy 120 + subscriptions 68 = 2,260
// variable: 110+380+340+120+25+210+160+120+39+50 = 1,554. 2,260 / 3,814 = 0.592554

// NEEDS vs WANTS
// needs: rent 1600 + utilities 110 + internet 40 + groceries 380 + MetroCard 132 + debt 300 + out of pocket 25 + therapy 120 = 2,707
// wants: 3,814 - 2,707 = 1,107. Shares of take-home: 2,707/3,900 = 0.694103; 1,107/3,900 = 0.283846; savings 150/3,900 = 0.038462
// 50/30/20 unassigned: -64 / 3,900 = -0.016410

// MISTAKES: late fee 39 a month, 468 a year. OWED BACK: Jo owes 80 (not received).

// DRAFTT (descriptive, S-072). Base = take-home 3,900 + pre-tax retirement 260 = 4,160
//   ("take-home plus pre-tax retirement"). Letters use the actual (every one has an actual here).
// D debt 300; R retirement = after-tax line 0 (not for me) + pre-tax 260 = 260;
// A accommodation (housing) 1,750; F food 840; T transport 132; Th therapy line 120 (has an amount)
// DRAFTT total = 300 + 260 + 1,750 + 840 + 132 + 120 = 3,402
// % of base:  D 300/4,160 = 15/208 = 0.07211538 -> 0.072115; R 260/4,160 = 0.0625
//   A 1,750/4,160 = 175/416 = 0.42067308 -> 0.420673; F 840/4,160 = 21/104 = 0.20192308 -> 0.201923
//   T 132/4,160 = 33/1,040 = 0.03173077 -> 0.031731; Th 120/4,160 = 3/104 = 0.02884615 -> 0.028846
//   DRAFTT 3,402/4,160 = 0.81778846 -> 0.817788
// % of DRAFTT: D 300/3,402 = 150/1,701 = 0.08818342 -> 0.088183; R 260/3,402 = 130/1,701 = 0.07642563 -> 0.076426
//   A 1,750/3,402 = 875/1,701 = 0.51440329 -> 0.514403; F 840/3,402 = 420/1,701 = 0.24691358 -> 0.246914
//   T 132/3,402 = 66/1,701 = 0.03880071 -> 0.038801; Th 120/3,402 = 60/1,701 = 0.03527337 -> 0.035273 (sum 1)
// Everything else = outflow 3,964 - (300 + 1,750 + 840 + 132 + 0 + 120) = 3,964 - 3,142 = 822
//   (= out of pocket 25 + bills 107 + fun 370 + annual 120 + giving 50 + emergency fund 150)
//   822/4,160 = 0.19759615 -> 0.197596
// Left over = surplus -64; -64/4,160 = -0.01538462 -> -0.015385
// Check: 3,402 + 822 - 64 = 4,160 = 100% of the base.
// Estimate % of base: D 300 -> 0.072115; R 0 + 260 -> 0.0625; A 1,720/4,160 = 43/104 = 0.41346154 -> 0.413462
//   F 550/4,160 = 55/416 = 0.13221154 -> 0.132212; T 132 -> 0.031731; Th 120 -> 0.028846
// Change (actual % - estimate %): A 30/4,160 = 0.00721154 -> 0.007212; F 290/4,160 = 29/416 = 0.06971154 -> 0.069712; others 0
// Taxes: no gross given, so not shown.
// READING: 81.8% -> 82%; biggest letter A at 51.4% -> 51%; the biggest change is Food, 13.2% -> 13% to 20.2% -> 20%;
//   everything else 19.8% -> 20%; shortfall 1.5% -> 2%.

// INCOME STATEMENT (monthly): revenue = take-home 3,900 (no gross given), taxes 0, deductions 0
// needs other than debt 2,707 - 300 = 2,407; debt 300; wants 1,107; savings 150; total 3,964; net -64

// JOY (spend-weighted, per $100)
// Food: (8x340 + 3x120) / 460 = 3,080 / 460 = 6.695652 joy; per $100 = 6.695652 / 4.6 = 1.455577
// Fun: (5x210 + 9x160) / 370 = 2,490 / 370 = 6.729730; per $100 = 1.818846
// Bills: 4 over 68 -> 4 / 0.68 = 5.882353. Health: 9 over 120 -> 7.5
// Lowest joy per dollar: Food, Personal and fun, Bills and subscriptions

// MONTH HISTORY
// Food: Jul 550 -> 700 (+150/550 = 0.272727); Aug 550 -> 790, groceries revised 330 -> 350 so 810 (+260/550 = 0.472727)
// Trend: 810 vs 700 = +15.7% -> up. Fun: 250 -> 300 = +20% -> up. Housing: 1,740 -> 1,760 = +1.1% -> flat
// Monthly totals: Jul est 1720+550+100 = 2,370, actual 1740+700+250 = 2,690 -> 320/2,370 = 0.135021
//                 Aug est 2,370, actual 1760+810+300 = 2,870 -> 500/2,370 = 0.210970
// Correction factor, Food: ratios 700/550, 810/550, 840/550 -> average = 2,350 / 1,650 = 1.424242
// Suggested next estimate = 550 x 1.424242 = 783.33. Last month's actual for Food = 810 (Aug, revised).

// COMPLETION: every item answered (utilities actual is "roughly", which counts) -> 1.0.
// S-097 drops the 10 dream questions (all answered, weight 1 each): still every item answered -> 1.0.
// NEXT: only one weak item: Housing / Utilities actual (roughly).
// ROUGH LIST: exactly one entry, Housing / Utilities: actual.

// FAT (strict, by category, whatever lines are labeled): Food + Housing + Transportation = 1,750 + 840 + 132 = 2,722; 2,722 / 3,900 = 0.697949

// PERCENTAGES (S-076). Every Maya category has an actual, so the basis is the actual.
// % of income = actual / take-home 3,900. % of spending = actual / actual spending 3,814.
//   housing 1,750: 0.44871795 -> 0.448718 | 1,750/3,814 = 0.45883587 -> 0.458836
//   food 840: 0.21538462 -> 0.215385 | 840/3,814 = 0.22024122 -> 0.220241
//   transport 132: 0.03384615 -> 0.033846 | 132/3,814 = 0.03460933 -> 0.034609
//   debt 300: 0.07692308 -> 0.076923 | 300/3,814 = 0.07865758 -> 0.078658
//   health 145: 0.03717949 -> 0.037179 | 145/3,814 = 0.03801783 -> 0.038018
//   bills 107: 107/3,900 = 0.02743590 -> 0.027436 | 107/3,814 = 0.02805454 -> 0.028055 (3,814 x 0.028 = 106.792; 0.208/3,814 = 0.0000545)
//   fun 370: 0.09487179 -> 0.094872 | 370/3,814 = 0.09701101 -> 0.097011
//   annual 120: 0.03076923 -> 0.030769 | 120/3,814 = 0.03146303 -> 0.031463
//   giving 50: 0.01282051 -> 0.012821 | 50/3,814 = 0.01310959 -> 0.013110
//   savings 150: 0.03846154 -> 0.038462 | not spending, so no % of spending
//   (the nine spending shares add to 3,814/3,814 = 100%)
// Estimate % of spending, food: 550 / estimate total 3,157 = 0.17421603 -> 0.174216
// Lines: eating out 340: 340/3,900 = 0.08717949 -> 0.087179 | 340/3,814 = 0.08914525 -> 0.089145
//        delivery 120: 120/3,900 = 0.03076923 -> 0.030769 | 120/3,814 = 0.03146303 -> 0.031463

// HAPPINESS: six rated lines: eating out 8, delivery 3, therapy 9, streaming 4, shopping 5, concert 9.
// Joy points = 8 + 3 + 9 + 4 + 5 + 9 = 38. % of happiness = rating / 38:
//   eating out 8/38 = 0.21052632 -> 0.210526; delivery 3/38 = 0.07894737 -> 0.078947; therapy 9/38 = 0.23684211 -> 0.236842
//   streaming 4/38 = 0.10526316 -> 0.105263; shopping 5/38 = 0.13157895 -> 0.131579; concert 9/38 -> 0.236842 (sum 38/38 = 1)
// Joy per $100 = rating / (actual / 100):
//   eating out 8 / 3.40 = 2.35294118 -> 2.352941; delivery 3 / 1.20 = 2.5; therapy 9 / 1.20 = 7.5
//   streaming 4 / 0.68 = 5.88235294 -> 5.882353; shopping 5 / 2.10 = 2.38095238 -> 2.380952; concert 9 / 1.60 = 5.625
// Food as a category: % of happiness = (8 + 3) / 38 = 0.28947368 -> 0.289474; rating and per $100 stay spend-weighted (joy lens above).

// PLAN FOR SEPTEMBER 2026 (the month on screen), started from estimates, two changes: groceries 300 -> 350, shopping 100 -> 150.
// Category plans: housing 1,600 + 80 + 40 = 1,720; food 350 + 200 + 50 = 600; transport 132; debt 300 (minimums);
//   health 40 + 120 = 160; bills 45 + late fee 0 = 45; fun shopping 150 (concert has no plan line) = 150; annual 1,200 a year = 100; giving 50
//   savings 200 + retirement 0 (doesn't apply) = 200
// Plan spending = 1,720 + 600 + 132 + 300 + 160 + 45 + 150 + 100 + 50 = 3,257. Plan outflow = 3,257 + 200 = 3,457.
// Plan % of income, food 600/3,900 = 0.15384615 -> 0.153846; plan % of spending, food 600/3,257 = 0.18421861 -> 0.184219
//   housing 1,720/3,257 = 0.52809334 -> 0.528093
// ACTUAL VS PLAN (September has both): housing 1,750 - 1,720 = +30, 30/1,720 = 0.01744186 -> 0.017442
//   food 840 - 600 = +240, 240/600 = 0.4; health 145 - 160 = -15, -15/160 = -0.09375; bills 107 - 45 = +62, 62/45 = 1.37777778 -> 1.377778
//   fun 370 - 150 = +220, 220/150 = 1.46666667 -> 1.466667; annual 120 - 100 = +20, 0.2
//   savings 150 - 200 = -50, -0.25; transport, debt, giving 0
// Culprits stay measured against the estimate (unchanged above).

// REVIEW SEPTEMBER, PLAN OCTOBER 2026 (started from September actuals):
//   keep: rent 1,600, utilities 110, internet 40, groceries 380, transit 132, out of pocket 25, therapy 120, shopping 210,
//         concert 160, yearly 1,440 a year (= 120), giving 50, emergency fund 150, retirement (doesn't apply, 0)
//   change: eating out 340 -> 280. cut: delivery 120 -> 0, streaming 68 -> 0, late fee 39 -> 0 (stop tracking from October).
//   new: Cooking class 60 (added in review for October; no estimate, not rated).
// Plan by category: housing 1,750; food 380 + 280 + 0 = 660; transport 132; debt 300; health 145; bills 0;
//   fun 210 + 160 + 60 = 430; annual 120; giving 50; savings 150 + 0 = 150
// Plan spending = 1,750 + 660 + 132 + 300 + 145 + 0 + 430 + 120 + 50 = 3,587; plan outflow = 3,587 + 150 = 3,737
// Plan vs take-home: 3,900 - 3,737 = 163 left over. This month's actual outflow = 3,814 + 150 = 3,964.
// Frees up: 3,964 - 3,737 = 227. Plan % of income = 3,737 / 3,900 = 0.95820513 -> 0.958205
// Happiness spend (lines rated 7 or above: eating out 8, therapy 9, concert 9):
//   September actual: (340 + 120 + 160) / 3,814 = 620 / 3,814 = 0.16255899 -> 0.162559
//   October plan: (280 + 120 + 160) / 3,587 = 560 / 3,587 = 0.15611932 -> 0.156119; change -0.00643967 -> -0.006440
// Eating out plan: 280/3,900 = 0.07179487 -> 0.071795 of income; 280/3,587 = 0.07805966 -> 0.078060 of spending
// Cooking class plan: 60/3,900 = 0.01538462 -> 0.015385 of income
// Checklist: 18 lines to plan (housing 3, food 3, transport 1, health 2, bills 2, fun 3, annual 1, giving 1, savings 2); 12 reviewed.
// READING: frees 227. Cuts held (120 + 68 + 39) / 3,814 = 227 / 3,814 = 0.0595 -> 6% of spending and (3 + 4) / 38 = 0.184 -> 18% of happiness.

// SATISFACTION AND STRESS (S-082). Stress ratings: rent 8, eating out 4, delivery 7, therapy 2, streaming 6, shopping 6, concert 1.
// Stress points = 8 + 4 + 7 + 2 + 6 + 6 + 1 = 34. % of stress: delivery 7/34 = 0.20588235 -> 0.205882; rent 8/34 = 0.23529412 -> 0.235294;
//   eating out 4/34 = 0.11764706 -> 0.117647
// Stress per $100: delivery 7 / 1.20 = 5.83333333 -> 5.833333; rent 8 / 16.00 = 0.5; eating out 4 / 3.40 = 1.17647059 -> 1.176471
// Net (joy - stress) and lean (3 or more apart): eating out 8 - 4 = +4 more of; delivery 3 - 7 = -4 less of;
//   streaming 4 - 6 = -2 about even; shopping 5 - 6 = -1 about even; therapy 9 - 2 = +7 more of; concert 9 - 1 = +8 more of;
//   rent has no joy or purpose rating, so no lean (asked to rate it).
// Look at first = (stress - joy) x (amount / 100), only where stress is higher:
//   delivery (7 - 3) x 1.20 = 4.8; shopping (6 - 5) x 2.10 = 2.1; streaming (6 - 4) x 0.68 = 1.36 -> order delivery, shopping, streaming
// Worth more of, by joy per $100: therapy 7.5, concert 5.625, eating out 2.352941.

export default {
  stress: {
    points: 34,
    // line: [stress, % of stress, stress per $100, net, lean]
    lines: { delivery: [7, 0.205882, 5.833333, -4, 'less'], rent: [8, 0.235294, 0.5, null, null], 'eating-out': [4, 0.117647, 1.176471, 4, 'more'],
      subscriptions: [6, null, null, -2, 'even'], therapy: [2, null, null, 7, 'more'], concert: [1, null, null, 8, 'more'] },
    lookFirst: [['delivery', 4.8], ['shopping', 2.1], ['subscriptions', 1.36]],
    moreOf: ['therapy', 'concert', 'eating-out'],
    reading: 'Look at Delivery first: $120 a month that drains more than it gives (stress 7, joy or purpose 3). Then Shopping and Streaming and apps. Worth more of: Therapy, Concert tickets (split with Jo), and Eating out. Rate joy or purpose for Rent to compare.'
  },
  shares: {
    // category: [% of income (basis), % of spending (basis)]
    categories: { housing: [0.448718, 0.458836], food: [0.215385, 0.220241], transport: [0.033846, 0.034609], debt: [0.076923, 0.078658],
      health: [0.037179, 0.038018], bills: [0.027436, 0.028055], fun: [0.094872, 0.097011], annual: [0.030769, 0.031463],
      giving: [0.012821, 0.013110], savings: [0.038462, null] },
    foodEstimateOfSpending: 0.174216,
    lines: { 'eating-out': [0.087179, 0.089145], delivery: [0.030769, 0.031463] }
  },
  happiness: {
    // line: [rating, % of happiness, joy per $100]
    lines: { 'eating-out': [8, 0.210526, 2.352941], delivery: [3, 0.078947, 2.5], therapy: [9, 0.236842, 7.5],
      subscriptions: [4, 0.105263, 5.882353], shopping: [5, 0.131579, 2.380952], concert: [9, 0.236842, 5.625] },
    foodShare: 0.289474, points: 38
  },
  plan: {
    spending: 3257, outflow: 3457,
    categories: { housing: [1720, 30, 0.017442], food: [600, 240, 0.4], health: [160, -15, -0.09375], bills: [45, 62, 1.377778],
      fun: [150, 220, 1.466667], annual: [100, 20, 0.2], savings: [200, -50, -0.25], transport: [132, 0, 0], debt: [300, 0, 0], giving: [50, 0, 0] },
    foodPctIncome: 0.153846, foodPctSpending: 0.184219, housingPctSpending: 0.528093
  },
  review: {
    reviewMonth: '2026-09', planMonth: '2026-10',
    plan: 3737, planSpending: 3587, planLeft: 163, actual: 3964, frees: 227, planPctIncome: 0.958205,
    happyNow: 0.162559, happyPlan: 0.156119, happyChange: -0.00644,
    checklist: [12, 18],
    rows: { 'eating-out': { plan: 280, decision: 'change', planPctIncome: 0.071795, planPctSpending: 0.07806 },
      'cooking-class': { plan: 60, decision: 'new', planPctIncome: 0.015385, estimate: null, addedInReview: true },
      delivery: { plan: 0, decision: 'cut' }, subscriptions: { plan: 0, decision: 'cut' }, 'fee-late': { plan: 0, decision: 'cut', stop: true } },
    reading: "Next month's plan frees $227. The cuts were in Delivery, Streaming and apps, and Late fee, which held 6% of spending and 18% of happiness. Eating out changes from $340 to $280. Added: Cooking class at $60. The plan leaves $163 of take-home."
  },
  fat: 2722, fatShare: 0.697949,
  takeHome: 3900, pretax: 260, hourly: 22.5,
  categories: {
    // [estimate, actual]
    housing: [1720, 1750], food: [550, 840], transport: [132, 132], debt: [300, 300],
    health: [160, 145], bills: [45, 107], fun: [100, 370], annual: [100, 120],
    giving: [50, 50], savings: [200, 150]
  },
  estimateTotal: 3157, actualTotal: 3814, spending: 3814, savings: 150,
  surplus: -64, savingsRate: 0.098558, housingShare: 0.448718, housingOver: true,
  roommateWorstCase: 3350, roommateWorstCaseShare: 0.858974,
  blindSpot: 0.176193,
  culprits: [['Food', 290, 1.527273, 3480], ['Personal and fun', 270, 3.7, 3240], ['Bills and subscriptions', 62, 2.377778, 744]],
  gut: { gut: 2800, estimates: 3157, actual: 3814, actualVsGut: 1014, ratio: 1.362143 },
  proofOfCash: { implied: 3450, entered: 3514, pct: 0.018551, flagged: false },
  fixed: 2260, variable: 1554, fixedPct: 0.592554,
  needs: 2707, wants: 1107, needsPct: 0.694103, wantsPct: 0.283846, savingsPct: 0.038462, unassignedShare: -0.016410,
  mistakeMonthly: 39, mistakeYearly: 468, owedBack: 80,
  draftt: {
    base: 4160, baseLabel: 'take-home plus pre-tax retirement', total: 3402, totalShare: 0.817788,
    everythingElse: 822, everythingElseShare: 0.197596, leftOver: -64, leftOverShare: -0.015385, taxes: null,
    // letter: [amount, % of base, % of DRAFTT, estimate % of base, change, uses estimate]
    letters: {
      debt: [300, 0.072115, 0.088183, 0.072115, 0, false], retirement: [260, 0.0625, 0.076426, 0.0625, 0, false],
      accommodation: [1750, 0.420673, 0.514403, 0.413462, 0.007212, false], food: [840, 0.201923, 0.246914, 0.132212, 0.069712, false],
      transportation: [132, 0.031731, 0.038801, 0.031731, 0, false], therapy: [120, 0.028846, 0.035273, 0.028846, 0, false]
    },
    reading: "DRAFTT is 82% of take-home plus pre-tax retirement. Accommodation is the biggest letter at 51% of DRAFTT. Food's share went from 13% estimated to 20% actual. Everything else is 20% and there is a shortfall of 2%."
  },
  incomeStatement: { revenue: 3900, taxes: 0, deductions: 0, needs: 2407, debt: 300, wants: 1107, savings: 150, net: -64 },
  joyLowest: [['Food', 1.455577], ['Personal and fun', 1.818846], ['Bills and subscriptions', 5.882353]],
  history: {
    food: [['2026-07', 550, 700, 0.272727], ['2026-08', 550, 810, 0.472727]],
    trends: { food: 'up', fun: 'up', housing: 'flat' },
    totals: [['2026-07', 2370, 2690, 0.135021], ['2026-08', 2370, 2870, 0.210970]],
    correctionFood: { factor: 1.424242, suggested: 783.33 },
    lastActualFood: 810
  },
  completion: 1,
  next: ['Housing / Utilities: actual'],
  roughCount: 1
};
