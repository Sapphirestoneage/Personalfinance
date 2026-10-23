// Hand-computed expected answers for Sam, 24, Michigan, between jobs and a student: unemployment
// benefits of 400 a week, no debt, living with parents, most categories "not for me", and one
// rough total (Everything else) in place of category estimates. Tests that "none" counts as
// complete and that actuals found inside the single total come out of it. Read by
// tests/households.test.js and tests/coverage.test.js, which compare them with buildSummary over
// sam.json, and by tools/screens-check.mjs, which checks the screens against them in a browser.

// INCOME: 400 a week x 52 / 12 = 1,733.333333 a month (unemployment, typed take-home)

// CATEGORIES: Housing, Transport, Health, Annual, Giving, Savings are "not for me" (0 / 0 / 0). (Fees, also "not for me"
//   with no lines, is gone in S-123.)
// Debts: marked none -> Debt payments 0.
// Single total: Everything else = 800 a month (roughly). No category estimates given since,
// so nothing is carved out: remainder 800.
// Inside the total: Food (groceries not for me = 0, eating out 250 -> 250), Bills 40, Fun (shopping dont-know -> none).
// Actuals found inside the total = 250 + 40 = 290, so Everything else still stands for 800 - 290 = 510.

// TOTALS
// estimates = 800 (Everything else) + zeros = 800. Dreams: none given -> null.
// actuals entered = 250 + 40 = 290
// spending basis = 250 + 40 + 510 = 800. Savings 0. Surplus = 1,733.333333 - 800 = 933.333333
// savings rate 0; housing share 0 (lives with parents)
// blind spot: inside actuals 290 vs the total 800 -> nothing unaccounted -> 0 / 290 = 0
// gut: 900 vs estimates 800 vs dreams (none) vs actual 800; 800 - 900 = -100; 800/900 = 0.888889
// proof of cash: implied 1,733.333333 - 0 - 0 = 1,733.333333; entered 800; 933.333333 / 1,733.333333 = 0.538462 -> flagged
// fixed: Phone and streaming 40; variable: eating out 250 + Everything else 510 = 760; 40 / 800 = 0.05
// needs: groceries 0 -> 0; wants 800 -> 800 / 1,733.333333 = 0.461538

// COMPLETION (none counts as complete):
// gut 1 (roughly, done); income 3 (done); housing 3 (not for me, done); food lines 1 + 1 (done: not for me, 250);
// transport 2, health 2 (not for me, done); bills line 1 (done); fun line 1 (dont-know, NOT done);
// annual 1, fees 1, giving 1, savings 1 (not for me, done); Everything else estimate 3 (done) + dream 1 (NOT done);
// debts: none 3 (done). Total 26, done 24 -> 24 / 26 = 0.923077
// NEXT: shopping actual (1 x 1), Everything else dream (1 x 1), Everything else estimate (3 x 0.3 = 0.9)
// S-097: the dream question leaves completion. Sam's only one was Everything else dream (1, NOT done).
// Total 26 - 1 = 25, done 24. 24 / 25 = 0.96
// S-123: Fees (not for me, 1, done) is gone: total 24, done 23. 23 / 24 = 0.95833333 -> 0.958333
// NEXT (S-097): weak items left, score = weight x weakness: shopping actual dont-know 1 x 1 = 1;
// Everything else estimate roughly 3 x 0.3 = 0.9; gut roughly 1 x 0.3 = 0.3 (900 a month, over the
// $100-a-year floor). Everything else known or doesn't apply. So: shopping, Everything else estimate, gut.

// FAT (strict, by category, whatever lines are labeled): Food + Housing + Transportation = 0 + 250 + 0 = 250; 250 / 1,733.333333 = 0.144231

// LIVING WITH FAMILY: if Sam moved out, housing guess = household of 1 (family members are not
// counted in Sam's own budget). The guess is the national average for that size, used as is (S-070):
// spending-averages.json, household of 1, housing = 1,500 a month (Guess). Housing now: 0.

export default {
  moveOut: [1500, 0],
  fat: 250,
  fatShare: 0.144231,
  takeHome: 1733.333333,
  categories: {
    // [estimate, actual]
    housing: [0, 0],
    food: [null, 250],
    transport: [0, 0],
    debt: [0, 0],
    health: [0, 0],
    bills: [null, 40],
    fun: [null, null],
    annual: [0, 0],
    giving: [0, 0],
    savings: [0, 0],
    everything: [800, null]
  },
  estimateTotal: 800,
  actualTotal: 290,
  spending: 800,
  savings: 0,
  surplus: 933.333333,
  savingsRate: 0,
  housingShare: 0,
  housingOver: false,
  roommateWorstCase: null,
  basisMissing: [],
  blindSpot: 0,
  culprits: [],
  gut: { gut: 900, estimates: 800, actual: 800, actualVsGut: -100, ratio: 0.888889 },
  proofOfCash: { implied: 1733.333333, entered: 800, pct: 0.538462, flagged: true },
  fixed: 40,
  variable: 760,
  fixedPct: 0.05,
  needs: 0,
  wants: 800,
  needsPct: 0,
  wantsPct: 0.461538,
  savingsPct: 0,
  mistakeMonthly: 0,
  mistakeYearly: 0,
  owedBack: 0,
  completion: 0.958333,
  next: [
    'Personal and fun / Shopping: actual',
    'Everything else: estimate',
    'Gut number: what you think you spend a month'
  ]
};
