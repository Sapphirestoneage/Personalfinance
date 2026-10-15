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
// Bills      120 /  100 / none
// Fun        300 /  400 / none
// Annual    1,200 a year = 100 / 100 / none
// Fees         0 /    0 / interest 45 + ATM 5 = 50
// Giving    not for me: 0 / 0 / 0
// Savings    300 /  500 / emergency 200 (retirement blank)

// TOTALS (spending = all but Savings)
// estimates 1100+600+350+685+150+120+300+100+0+0 = 3,405
// dreams    1000+500+300+685+150+100+400+100+0+0 = 3,235
// actuals entered: 1110+830+540+685+50+0 = 3,215
// spending basis (actual, else estimate): 3,215 + health 150 + bills 120 + fun 300 + annual 100 = 3,885
//   (estimate used for Health, Bills and subscriptions, Personal and fun, Annual and irregular)
// outflow 3,885 + 200 = 4,085; surplus 4,600 - 4,085 = 515
// savings rate (200 + 200) / (4,600 + 200) = 400 / 4,800 = 0.083333
// housing share 1,110 / 4,600 = 0.241304 (under 35%)

// BLIND SPOT: housing 10 + food 230 + transport 190 + fees 50 = 480; 480 / 3,215 = 0.149300
// CULPRITS: food +230 (830/600 = 1.383333, 2,760 a year); transport +190 (540/350 = 1.542857, 2,280); fees +50 (600)
// GUT: 3,000 / 3,405 / 3,235 / 3,885; 3,885 - 3,000 = 885; 3,885 / 3,000 = 1.295
// PROOF OF CASH: implied 4,600 - 200 - 685 = 3,715; entered 3,885 - 685 = 3,200
//   diff -515; 515 / 3,715 = 0.138627 -> not flagged (under 15%)

// FIXED: rent 950 + car insurance 140 + debt 685 + health 150 (category is fixed) + bills 120 = 2,045
// VARIABLE: 160+520+310+220+180+300+100+45+5 = 1,840. 2,045 / 3,885 = 0.526384
// NEEDS: 950+160+520+140+220+685+150 = 2,825 (ticket is not a need). WANTS: 3,885 - 2,825 = 1,060
//   2,825/4,600 = 0.614130; 1,060/4,600 = 0.230435; savings 200/4,600 = 0.043478; unassigned 515/4,600 = 0.111957
// MISTAKES: ticket 180 + interest 45 + ATM 5 = 230 a month, 2,760 a year

// DRAFTT (Eli's default): debt 685/4,600 = 0.148913 high; retirement (0 + 200)/4,600 = 0.043478 low
//   accommodation 0.241304 healthy; food 830/4,600 = 0.180435 high; transport 540/4,600 = 0.117391 healthy
//   taxes: side gig has no gross, so household gross is unknown -> null; therapy: no line -> null

// INCOME STATEMENT: revenue w2 5,200 + side 600 = 5,800; taxes 1,000; deductions 200; take-home 4,600
//   needs other than debt 2,825 - 685 = 2,140; debt 685; wants 1,060; savings 200; net 515 (6,180 a year)

// COMPLETION (weights: heavy 3, medium 2, light 1; line actuals share their category's weight)
// gut 1; income 3+3; housing 3+1+1.5+1.5; food 2+1+1+1; transport 2+1+4x0.5; health 2+1+1+1;
// bills 1+1+1; fun 1+1+0.5+0.5; annual 1+1+1; fees 1+1+0.5+0.5; giving 1; savings 1+1+0.5+0.5;
// debts 4 x (3+1+1) = 20. Total = 65.
// Not answered: maintenance 0.5, premiums 1, out of pocket 1, bills line 1, shopping 0.5,
// entertainment 0.5, yearly 1, retirement 0.5 = 6. Done 59 / 65 = 0.907692
// NEXT: score = weight x weakness. Four blanks at 1.0 (premiums, out of pocket, bills line, yearly),
// tie broken by order: premiums, out of pocket, bills line.
// SMALL STUFF: ATM actual (roughly, 5 a month = 60 a year, under the 100 floor).

// FAT (strict, by category, whatever lines are labeled): Food + Housing + Transportation = 1,110 + 830 + 540 = 2,480; 2,480 / 4,600 = 0.539130

export default {
  fat: 2480, fatShare: 0.539130,
  takeHome: 4600, pretax: 200, hourly: 21.230769,
  categories: {
    housing: [1100, 1000, 1110], food: [600, 500, 830], transport: [350, 300, 540], debt: [685, 685, 685],
    health: [150, 150, null], bills: [120, 100, null], fun: [300, 400, null], annual: [100, 100, null],
    fees: [0, 0, 50], giving: [0, 0, 0], savings: [300, 500, 200]
  },
  estimateTotal: 3405, dreamTotal: 3235, actualTotal: 3215, spending: 3885, savings: 200,
  surplus: 515, savingsRate: 0.083333, housingShare: 0.241304, housingOver: false,
  roommateWorstCase: null,
  basisUsesEstimate: ['Health', 'Bills and subscriptions', 'Personal and fun', 'Annual and irregular'],
  blindSpot: 0.149300,
  culprits: [['Food', 230, 1.383333, 2760], ['Transportation', 190, 1.542857, 2280], ['Fees', 50, null, 600]],
  gut: { gut: 3000, estimates: 3405, dreams: 3235, actual: 3885, actualVsGut: 885, ratio: 1.295 },
  proofOfCash: { implied: 3715, entered: 3200, pct: 0.138627, flagged: false },
  fixed: 2045, variable: 1840, fixedPct: 0.526384,
  needs: 2825, wants: 1060, needsPct: 0.614130, wantsPct: 0.230435, savingsPct: 0.043478, unassignedShare: 0.111957,
  mistakeMonthly: 230, mistakeYearly: 2760, owedBack: 0,
  draftt: { debt: [0.148913, 'high'], retirement: [0.043478, 'low'], accommodation: [0.241304, 'healthy'], food: [0.180435, 'high'], transportation: [0.117391, 'healthy'], taxes: [null, null], therapy: [null, null] },
  incomeStatement: { revenue: 5800, taxes: 1000, deductions: 200, needs: 2140, debt: 685, wants: 1060, savings: 200, net: 515 },
  completion: 0.907692,
  next: ['Health / Premiums: actual', 'Health / Out of pocket: actual', 'Bills and subscriptions / Phone and streaming: actual'],
  small: ['Fees / ATM: actual']
};
