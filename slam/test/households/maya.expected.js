// Maya, 26, single renter in NYC. Every number below was worked out by hand
// from maya.json, step by step. None of it was produced by running the code.

// INCOME
// Take-home 1,800 per paycheck, biweekly: 1,800 x 26 / 12 = 3,900.00 a month.
// Pre-tax retirement 120 per paycheck: 120 x 26 / 12 = 260.00 a month.
// Hours: 40 a week x 52 / 12 = 173.333 hours a month. Hourly = 3,900 / 173.333 = 22.50.

// CATEGORY TOTALS (estimate / dream / actual), all from lines
// Housing:   rent 1600/1600/1600 + utilities 80/80/110 + internet 40/40/40 = 1720 / 1720 / 1750
// Food:      groceries 300/280/380 + eating out 200/150/340 + delivery 50/0/120 = 550 / 430 / 840
// Transport: MetroCard 132/132/132 = 132 / 132 / 132
// Debt:      student loan minimum 300 (computed) = 300 / 300 / 300
// Health:    out of pocket 40/40/25 + therapy 120/120/120 = 160 / 160 / 145
// Bills:     45 / 30 / 68
// Fun:       shopping 100/80/210 + concert (no estimate, no dream) 160 = 100 / 80 / 370
// Annual:    1,200 a year = 100; 1,200 a year = 100; 1,440 a year = 120 -> 100 / 100 / 120
// Fees:      late fee 0 / 0 / 39
// Giving:    50 / 100 / 50
// Savings:   emergency 200/400/150 + retirement not-for-me (0) = 200 / 400 / 150

// SPENDING (everything except Savings)
// Estimates: 1720+550+132+300+160+45+100+100+0+50 = 3,157
// Dreams:    1720+430+132+300+160+30+80+100+0+100 = 3,052
// Actuals:   1750+840+132+300+145+68+370+120+39+50 = 3,814 (every category has an actual)
// Outflow = 3,814 + savings 150 = 3,964. Surplus = 3,900 - 3,964 = -64 (a shortfall).
// Savings rate = (150 + 260) / (3,900 + 260) = 410 / 4,160 = 0.098558
// Housing share = 1,750 / 3,900 = 0.448718 (over the 35% band)
// Roommate worst case = 1,750 - your share (the rent line, 1,600) + full rent 3,200 = 3,350; 3,350 / 3,900 = 0.858974

// BLIND SPOT: overage per category where actual > estimate
// housing 30, food 290, bills 23, fun 270, annual 20, fees 39 (all others 0) = 672
// 672 / 3,814 = 0.176193

// CULPRITS: food +290 (840/550 = 1.527273), fun +270 (370/100 = 3.7), fees +39 (estimate 0, no ratio)
// Back to your own words, yearly: 290x12 = 3,480; 270x12 = 3,240; 39x12 = 468

// GUT CHECK: gut 2,800 / estimates 3,157 / dreams 3,052 / actual 3,814
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
//   (= out of pocket 25 + bills 68 + fun 370 + annual 120 + fees 39 + giving 50 + emergency fund 150)
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

// COMPLETION: every item answered (utilities actual is "roughly", which counts) -> 1.0
// NEXT: only one weak item: Housing / Utilities actual (roughly).
// ROUGH LIST: exactly one entry, Housing / Utilities: actual.

// FAT (strict, by category, whatever lines are labeled): Food + Housing + Transportation = 1,750 + 840 + 132 = 2,722; 2,722 / 3,900 = 0.697949

export default {
  fat: 2722, fatShare: 0.697949,
  takeHome: 3900, pretax: 260, hourly: 22.5,
  categories: {
    housing: [1720, 1720, 1750], food: [550, 430, 840], transport: [132, 132, 132], debt: [300, 300, 300],
    health: [160, 160, 145], bills: [45, 30, 68], fun: [100, 80, 370], annual: [100, 100, 120],
    fees: [0, 0, 39], giving: [50, 100, 50], savings: [200, 400, 150]
  },
  estimateTotal: 3157, dreamTotal: 3052, actualTotal: 3814, spending: 3814, savings: 150,
  surplus: -64, savingsRate: 0.098558, housingShare: 0.448718, housingOver: true,
  roommateWorstCase: 3350, roommateWorstCaseShare: 0.858974,
  blindSpot: 0.176193,
  culprits: [['Food', 290, 1.527273, 3480], ['Personal and fun', 270, 3.7, 3240], ['Fees', 39, null, 468]],
  gut: { gut: 2800, estimates: 3157, dreams: 3052, actual: 3814, actualVsGut: 1014, ratio: 1.362143 },
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
