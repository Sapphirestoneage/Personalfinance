// Sam, 24, between jobs and a student, on unemployment, no debt, lives with
// parents, mostly "not for me", and gave one total instead of categories.
// Tests that "none" counts as complete. Worked out by hand.

// INCOME: 400 a week x 52 / 12 = 1,733.333333 a month (unemployment, typed take-home)

// CATEGORIES: Housing, Transport, Health, Annual, Fees, Giving, Savings are "not for me" (0 / 0 / 0).
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

export default {
  takeHome: 1733.333333,
  categories: {
    housing: [0, 0, 0], food: [null, null, 250], transport: [0, 0, 0], debt: [0, 0, 0], health: [0, 0, 0],
    bills: [null, null, 40], fun: [null, null, null], annual: [0, 0, 0], fees: [0, 0, 0], giving: [0, 0, 0],
    savings: [0, 0, 0], everything: [800, null, null]
  },
  estimateTotal: 800, dreamTotal: null, actualTotal: 290, spending: 800, savings: 0,
  surplus: 933.333333, savingsRate: 0, housingShare: 0, housingOver: false,
  roommateWorstCase: null,
  basisMissing: [],
  blindSpot: 0,
  culprits: [],
  gut: { gut: 900, estimates: 800, dreams: null, actual: 800, actualVsGut: -100, ratio: 0.888889 },
  proofOfCash: { implied: 1733.333333, entered: 800, pct: 0.538462, flagged: true },
  fixed: 40, variable: 760, fixedPct: 0.05,
  needs: 0, wants: 800, needsPct: 0, wantsPct: 0.461538, savingsPct: 0,
  mistakeMonthly: 0, mistakeYearly: 0, owedBack: 0,
  completion: 0.923077,
  next: ['Personal and fun / Shopping: actual', 'Everything else: dream', 'Everything else: estimate']
};
