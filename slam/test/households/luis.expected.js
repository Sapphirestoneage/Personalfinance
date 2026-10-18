// Luis, 33, Ohio. W-2 plus a side hustle, car loan, two credit cards, one
// buy-now-pay-later, actuals for about half the categories, a speeding ticket
// tagged mistake. Worked out by hand from luis.json, not by running the code.

// INCOME
// Warehouse: 2,000 per paycheck, semimonthly: 2,000 x 24 / 12 = 4,000 take-home a month
//   gross 62,400 a year / 12 = 5,200; pre-tax 100 x 24 / 12 = 200
//   taxes = 5,200 - 200 - 4,000 = 1,000
// Delivery driving (side): 600 a month, roughly, no gross given
// Take-home = 4,600. Hours: (40 + 10) x 52 / 12 = 216.667. Hourly = 4,600 x 12 / 2,600 = 21.230769

// DEBTS -> Debt payments (computed): 425 + 120 + 40 + 100 = 685

// CATEGORIES (estimate / dream from the rough pass; actual from lines)
// Housing   1100 / 1000 / rent 950 + utilities 160 = 1110
// Food       600 /  500 / groceries 520 + eating out 310 = 830
// Transport  350 /  300 / insurance 140 + gas 220 + ticket 180 = 540 (maintenance blank, partial)
// Debt       685 /  685 / 685
// Health     150 /  150 / none
// Bills      120 /  100 / interest 45 + ATM 5 = 50 (moved from Fees, S-123; Phone and streaming blank, partial)
// Fun        300 /  400 / none
// Annual    1,200 a year = 100 / 100 / none
// Giving    not for me: 0 / 0 / 0
// Savings    300 /  500 / emergency 200 (retirement blank)

// TOTALS (spending = all but Savings)
// estimates 1100+600+350+685+150+120+300+100+0 = 3,405
// dreams    1000+500+300+685+150+100+400+100+0 = 3,235
// actuals entered: 1110+830+540+685+50+0 = 3,215
// spending basis (actual, else estimate): 3,215 + health 150 + fun 300 + annual 100 = 3,765
//   (estimate used for Health, Personal and fun, Annual and irregular; Bills now has an actual, 50)
// outflow 3,765 + 200 = 3,965; surplus 4,600 - 3,965 = 635
// savings rate (200 + 200) / (4,600 + 200) = 400 / 4,800 = 0.083333
// housing share 1,110 / 4,600 = 0.241304 (under 35%)

// BLIND SPOT: housing 10 + food 230 + transport 190 (bills 50 is under its 120) = 430; 430 / 3,215:
//   3,215 x 0.1337 = 429.8455; 0.1545 / 3,215 = 0.0000481 -> 0.1337481 -> 0.133748
// CULPRITS: food +230 (830/600 = 1.383333, 2,760 a year); transport +190 (540/350 = 1.542857, 2,280);
//   housing +10 (1,110/1,100 = 1.00909091 -> 1.009091, 120 a year) takes the third place Fees held
// GUT: 3,000 / 3,405 / 3,235 / 3,765; 3,765 - 3,000 = 765; 3,765 / 3,000 = 1.255
// PROOF OF CASH: implied 4,600 - 200 - 685 = 3,715; entered 3,765 - 685 = 3,080
//   diff -635; 635 / 3,715: 3,715 x 0.17 = 631.55; 3.45 / 3,715 = 0.000929 -> 0.170929 -> flagged (over 15%)

// FIXED: rent 950 + car insurance 140 + debt 685 + health 150 (category is fixed) = 1,925 (Bills is its variable
//   interest and ATM lines now)
// VARIABLE: 160+520+310+220+180+300+100+45+5 = 1,840. 1,925 / 3,765: 3,765 x 0.5 = 1,882.5; 42.5 / 3,765 = 0.011288 -> 0.511288
// NEEDS: 950+160+520+140+220+685+150 = 2,825 (ticket is not a need). WANTS: 3,765 - 2,825 = 940
//   2,825/4,600 = 0.614130; 940/4,600 = 0.20434783 -> 0.204348; savings 200/4,600 = 0.043478; unassigned 635/4,600 = 0.13804348 -> 0.138043
// MISTAKES: ticket 180 + interest 45 + ATM 5 = 230 a month, 2,760 a year

// DRAFTT (descriptive, S-072). Base = take-home 4,600 + pre-tax retirement 200 = 4,800
//   ("take-home plus pre-tax retirement"). Letters use the actual where there is one.
// D debt 685 (computed); R = after-tax line (blank, not in the Savings actual) 0 + pre-tax 200 = 200
// A housing actual 1,110; F food actual 830; T transport actual 540; no therapy line, so no Th
// DRAFTT total = 685 + 200 + 1,110 + 830 + 540 = 3,365
// % of base:  D 685/4,800 = 0.14270833 -> 0.142708; R 200/4,800 = 0.04166667 -> 0.041667; A 1,110/4,800 = 0.23125
//   F 830/4,800 = 0.17291667 -> 0.172917; T 540/4,800 = 0.1125; DRAFTT 3,365/4,800 = 0.70104167 -> 0.701042
// % of DRAFTT: D 685/3,365 = 137/673 = 0.20356612 -> 0.203566; R 200/3,365 = 40/673 = 0.05943536 -> 0.059435
//   A 1,110/3,365 = 222/673 = 0.32986627 -> 0.329866; F 830/3,365 = 166/673 = 0.24665676 -> 0.246657
//   T 540/3,365 = 108/673 = 0.16047548 -> 0.160475 (sum 1)
// Everything else = outflow 3,965 - (685 + 1,110 + 830 + 540 + 0) = 3,965 - 3,165 = 800
//   (= health 150 + bills 50 + fun 300 + annual 100 + giving 0 + emergency fund 200); 800/4,800 = 0.16666667 -> 0.166667
// Left over = surplus 635; 635/4,800 = 0.13229167 -> 0.132292. Check: 3,365 + 800 + 635 = 4,800.
// Estimate % of base: D 685 -> 0.142708; R 0 + 200 (Savings estimate is one number, 300, not the line) -> 0.041667
//   A 1,100/4,800 = 0.22916667 -> 0.229167; F 600/4,800 = 0.125; T 350/4,800 = 0.07291667 -> 0.072917
// Change: A 10/4,800 = 0.00208333 -> 0.002083; F 230/4,800 = 0.04791667 -> 0.047917; T 190/4,800 = 0.03958333 -> 0.039583
// Taxes: the side gig has no gross, so household gross is unknown -> not shown.
// READING: 70.1% -> 70%; biggest letter A at 33.0% -> 33%; biggest change Food 12.5% -> 13% to 17.3% -> 17%;
//   everything else 16.7% -> 17%; left over 13.2% -> 13%.

// INCOME STATEMENT: revenue w2 5,200 + side 600 = 5,800; taxes 1,000; deductions 200; take-home 4,600
//   needs other than debt 2,825 - 685 = 2,140; debt 685; wants 940; savings 200; net 635 (7,620 a year)

// COMPLETION (weights: heavy 3, medium 2, light 1; line actuals share their category's weight)
// gut 1; income 3+3; housing 3+1+1.5+1.5; food 2+1+1+1; transport 2+1+4x0.5; health 2+1+1+1;
// bills 1+1+1; fun 1+1+0.5+0.5; annual 1+1+1; fees 1+1+0.5+0.5; giving 1; savings 1+1+0.5+0.5;
// debts 4 x (3+1+1) = 20. Total = 65.
// Not answered: maintenance 0.5, premiums 1, out of pocket 1, bills line 1, shopping 0.5,
// entertainment 0.5, yearly 1, retirement 0.5 = 6. Done 59 / 65 = 0.907692
// S-097: the dream questions leave completion. Each category above lists estimate, then dream (the
// second number, weight 1): housing, food, transport, health, bills, fun, annual, fees, savings = 9
// questions, all answered (Giving doesn't apply, so it never had one). Total 65 - 9 = 56,
// done 59 - 9 = 50. 50 / 56 = 0.89285714 -> 0.892857
// NEXT: unchanged. The dreams were answered, so none was ever ranked.
// S-123: Fees is gone and its two lines are in Bills. Fees' estimate (1) and two line actuals (0.5 + 0.5), all
// answered, leave: total 56 - 2 = 54, done 50 - 2 = 48. Bills keeps its weights (estimate 1, actual 1), but its
// actual is now shared by three lines, 1/3 each: interest and ATM answered (+2/3), Phone and streaming blank.
// Done 48 + 2/3 = 146/3 out of 54: 146/162 = 73/81 = 0.90123457 -> 0.901235
// NEXT: score = weight x weakness. Three blanks at 1.0 (premiums, out of pocket, yearly), tie broken by order;
// the bills line is now 1/3, under the 0.5 blanks.
// SMALL STUFF: ATM actual (roughly, 5 a month = 60 a year, under the 100 floor).

// FAT (strict, by category, whatever lines are labeled): Food + Housing + Transportation = 1,110 + 830 + 540 = 2,480; 2,480 / 4,600 = 0.539130

// REVIEW SEPTEMBER, PLAN OCTOBER 2026, started from September actuals (S-076). Every line with an actual is
// planned at it; lines with no actual stay blank (not 0), and Giving doesn't apply, so it is left out.
//   housing rent 950 + utilities 160 = 1,110; food 520 + 310 = 830; transport 140 + 220 + 180 = 540 (maintenance blank)
//   debt 685 (minimums); health, fun, annual: no actuals, so no plan yet; bills interest 45 + ATM 5 = 50; savings emergency 200
// Plan spending = 1,110 + 830 + 540 + 685 + 50 = 3,215; plan outflow = 3,215 + 200 = 3,415
// Plan vs take-home: 4,600 - 3,415 = 1,185 left over. This month's actual outflow = 3,215 + 200 = 3,415.
// Frees up: 3,415 - 3,415 = 0 (the plan matches this month's actual). Plan % of income = 3,415 / 4,600 = 0.74239130 -> 0.742391
// No lines are rated, so happiness spend is not rated (null), never 0.
// Checklist: 18 lines (housing 2, food 2, transport 4, health 2, bills 3, fun 2, annual 1, savings 2); 0 reviewed.
// Rent: plan 950 / 4,600 = 0.20652174 -> 0.206522 of income; 950 / 3,215 = 0.29548989 -> 0.295490 of spending

export default {
  review: {
    reviewMonth: '2026-09', planMonth: '2026-10',
    plan: 3415, planSpending: 3215, planLeft: 1185, actual: 3415, frees: 0, planPctIncome: 0.742391,
    happyNow: null, happyPlan: null, happyChange: null,
    checklist: [0, 18],
    rows: { rent: { plan: 950, decision: 'keep', planPctIncome: 0.206522, planPctSpending: 0.29549 }, maintenance: { plan: null, decision: null } },
    reading: "Next month's plan matches this month's actual. The plan leaves $1,185 of take-home."
  },
  fat: 2480, fatShare: 0.539130,
  takeHome: 4600, pretax: 200, hourly: 21.230769,
  categories: {
    // [estimate, actual]
    housing: [1100, 1110], food: [600, 830], transport: [350, 540], debt: [685, 685],
    health: [150, null], bills: [120, 50], fun: [300, null], annual: [100, null],
    giving: [0, 0], savings: [300, 200]
  },
  estimateTotal: 3405, actualTotal: 3215, spending: 3765, savings: 200,
  surplus: 635, savingsRate: 0.083333, housingShare: 0.241304, housingOver: false,
  roommateWorstCase: null,
  basisUsesEstimate: ['Health', 'Personal and fun', 'Annual and irregular'],
  blindSpot: 0.133748,
  culprits: [['Food', 230, 1.383333, 2760], ['Transportation', 190, 1.542857, 2280], ['Housing', 10, 1.009091, 120]],
  gut: { gut: 3000, estimates: 3405, actual: 3765, actualVsGut: 765, ratio: 1.255 },
  proofOfCash: { implied: 3715, entered: 3080, pct: 0.170929, flagged: true },
  fixed: 1925, variable: 1840, fixedPct: 0.511288,
  needs: 2825, wants: 940, needsPct: 0.614130, wantsPct: 0.204348, savingsPct: 0.043478, unassignedShare: 0.138043,
  mistakeMonthly: 230, mistakeYearly: 2760, owedBack: 0,
  draftt: {
    base: 4800, baseLabel: 'take-home plus pre-tax retirement', total: 3365, totalShare: 0.701042,
    everythingElse: 800, everythingElseShare: 0.166667, leftOver: 635, leftOverShare: 0.132292, taxes: null,
    // letter: [amount, % of base, % of DRAFTT, estimate % of base, change, uses estimate]; no therapy line
    letters: {
      debt: [685, 0.142708, 0.203566, 0.142708, 0, false], retirement: [200, 0.041667, 0.059435, 0.041667, 0, false],
      accommodation: [1110, 0.23125, 0.329866, 0.229167, 0.002083, false], food: [830, 0.172917, 0.246657, 0.125, 0.047917, false],
      transportation: [540, 0.1125, 0.160475, 0.072917, 0.039583, false]
    },
    reading: "DRAFTT is 70% of take-home plus pre-tax retirement. Accommodation is the biggest letter at 33% of DRAFTT. Food's share went from 13% estimated to 17% actual. Everything else is 17% and left over is 13%."
  },
  incomeStatement: { revenue: 5800, taxes: 1000, deductions: 200, needs: 2140, debt: 685, wants: 940, savings: 200, net: 635 },
  completion: 0.901235,
  next: ['Health / Premiums: actual', 'Health / Out of pocket: actual', 'Annual and irregular / Yearly costs: actual'],
  small: ['Bills and subscriptions / ATM: actual']
};
