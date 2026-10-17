// Tasha, 29, Texas. Gross pay only (tests the take-home guess), credit card
// debt, only a gut number and rough estimates, several "dont-know" values, and
// a proof of cash that is off by more than 15%. Worked out by hand.

// TAKE-HOME GUESS (2026 federal, single, W-2, gross 60,000 a year)
// taxable = 60,000 - standard deduction 16,100 = 43,900
// income tax = 12,400 x 10% = 1,240 + (43,900 - 12,400) = 31,500 x 12% = 3,780 -> 5,020
// FICA = 60,000 x 6.2% = 3,720 + 60,000 x 1.45% = 870 -> 4,590
// take-home = 60,000 - 5,020 - 4,590 = 50,390 a year = 4,199.166667 a month, status "guess"
// tax per month = (5,020 + 4,590) / 12 = 800.833333 (income tax 418.333333, FICA 382.50)

// CATEGORIES: only rough estimates. Debt (computed) 195. Giving not for me (0).
// Housing 1,400; Food 500; Transport 400; Bills 150; Savings 100 (all "roughly")
// Health and Fun "dont-know", Annual "will-email", Fees blank
// estimates = 1,400 + 500 + 400 + 195 + 150 + 0 = 2,645. No dreams given -> null. No real actuals -> null.
// spending basis = 2,645 (missing: Health, Personal and fun, Annual and irregular, Fees)
// surplus = 4,199.166667 - (2,645 + 100) = 1,454.166667
// savings rate = 100 / 4,199.166667 = 1,200 / 50,390 = 0.023814
// housing share = 1,400 / 4,199.166667 = 16,800 / 50,390 = 0.333399 (under 35%)

// BLIND SPOT: no actuals except the computed debt line -> null (nothing to measure yet)
// GUT: 2,500 vs estimates 2,645 vs dreams (none) vs actual basis 2,645; +145; 2,645/2,500 = 1.058

// PROOF OF CASH: implied = 4,199.166667 - 100 - 195 = 3,904.166667; entered = 2,645 - 195 = 2,450
// diff = -1,454.166667; 1,454.166667 / 3,904.166667 = 0.372465 -> FLAGGED (over 15%)

// FIXED: housing 1,400 + debt 195 + bills 150 = 1,745; VARIABLE: food 500 + transport 400 = 900
// 1,745 / 2,645 = 0.659735
// NEEDS: 1,400 + 500 + 400 + 195 = 2,495 -> 29,940 / 50,390 = 0.594166; WANTS: bills 150 -> 1,800/50,390 = 0.035721

// DRAFTT (descriptive, S-072). No pre-tax retirement, so base = take-home 4,199.166667 = 50,390 / 12 ("take-home").
//   Every share of the base = amount x 12 / 50,390.
// D debt 195 (computed); R = 0 (Savings is one number, 100, not a retirement line; no pre-tax)
// A housing 1,400, F food 500, T transport 400: all estimates standing in (no actuals); therapy has no amount, so no Th
// DRAFTT total = 195 + 0 + 1,400 + 500 + 400 = 2,495
// % of base:  D 2,340/50,390 = 0.04643779 -> 0.046438; R 0; A 16,800/50,390 = 0.33339948 -> 0.333399
//   F 6,000/50,390 = 0.11907124 -> 0.119071; T 4,800/50,390 = 0.09525700 -> 0.095257; DRAFTT 29,940/50,390 = 0.59416551 -> 0.594166
// % of DRAFTT: D 195/2,495 = 39/499 = 0.07815631 -> 0.078156; R 0; A 1,400/2,495 = 280/499 = 0.56112224 -> 0.561122
//   F 500/2,495 = 100/499 = 0.20040080 -> 0.200401; T 400/2,495 = 80/499 = 0.16032064 -> 0.160321 (sum 1)
// Everything else = outflow 2,745 - 2,495 = 250 (bills 150 + savings 100); 3,000/50,390 = 0.05953562 -> 0.059536
// Left over = surplus 1,454.166667; 17,450/50,390 = 0.34629887 -> 0.346299. Check: 29,940 + 3,000 + 17,450 = 50,390.
// Estimate % = actual % (no actuals yet), so every change is 0.
// Taxes: 800.833333 / gross 5,000 = 0.16016667 -> 0.160167, shown on its own "of gross".
// READING: 59.4% -> 59%; biggest letter A at 56.1% -> 56%; no actuals to compare, so the estimates note;
//   everything else 6.0% -> 6%; left over 34.6% -> 35%; taxes 16.0% -> 16%.

// INCOME STATEMENT: revenue 5,000; taxes 800.833333; deductions 0; needs other than debt 2,300;
// debt 195; wants 150; savings 100; net 1,454.166667

// COMPLETION: total weight 47 (gut 1, income 3, housing 3+1+3, food 2+1+2, transport 2+1+2,
// health 2+1+2, bills 1+1+1, fun 1+1+1, annual 1+1+1, fees 1+1+1, giving 1, savings 1+1+1, debt 3+1+1)
// answered: gut 1, housing est 3, food est 2, transport est 2, bills est 1, giving 1, savings est 1,
// debt minimum 3, debt balance 1 = 15. 15 / 47 = 0.319149
// S-097: the dream questions leave completion. Each category's middle number above is its dream (weight 1):
// housing, food, transport, health, bills, fun, annual, fees, savings = 9, none answered (no dreams given;
// Giving doesn't apply). Total 47 - 9 = 38, done still 15. 15 / 38 = 0.39473684 -> 0.394737
// NEXT: unchanged. A blank dream scored 1 x 1.0 = 1, below every item in the top three.
// NEXT: rent actual (3 x 1 = 3), take-home guess (3 x 0.7 = 2.1), then four items at 2.0 with
// blanks ranked before the Health estimate (which has a 400 guess): groceries actual first by order.
// ROUGH LIST: 10 values. GUESSES offered: the national average for a household of 1, used as is (S-070):
// spending-averages.json, household of 1: Health 400, Personal and fun 300, Annual 100.

// FAT (strict, by category, whatever lines are labeled): Food + Housing + Transportation = 1,400 + 500 + 400 = 2,300; 27,600 / 50,390 = 0.547728

export default {
  fat: 2300, fatShare: 0.547728,
  takeHome: 4199.166667, takeHomeStatus: 'guess', taxMonthly: 800.833333, incomeTaxMonthly: 418.333333, ficaMonthly: 382.5,
  categories: {
    // [estimate, actual]
    housing: [1400, null], food: [500, null], transport: [400, null], debt: [195, 195],
    health: [null, null], bills: [150, null], fun: [null, null], annual: [null, null],
    fees: [null, null], giving: [0, 0], savings: [100, null]
  },
  estimateTotal: 2645, actualTotal: null, spending: 2645, savings: 100,
  surplus: 1454.166667, savingsRate: 0.023814, housingShare: 0.333399, housingOver: false,
  roommateWorstCase: null,
  basisMissing: ['Health', 'Personal and fun', 'Annual and irregular', 'Fees'],
  blindSpot: null,
  culprits: [],
  gut: { gut: 2500, estimates: 2645, actual: 2645, actualVsGut: 145, ratio: 1.058 },
  proofOfCash: { implied: 3904.166667, entered: 2450, pct: 0.372465, flagged: true },
  fixed: 1745, variable: 900, fixedPct: 0.659735,
  needs: 2495, wants: 150, needsPct: 0.594166, wantsPct: 0.035721, savingsPct: 0.023814,
  mistakeMonthly: 0, mistakeYearly: 0, owedBack: 0,
  draftt: {
    base: 4199.166667, baseLabel: 'take-home', total: 2495, totalShare: 0.594166,
    everythingElse: 250, everythingElseShare: 0.059536, leftOver: 1454.166667, leftOverShare: 0.346299, taxes: 0.160167,
    // letter: [amount, % of base, % of DRAFTT, estimate % of base, change, uses estimate]; no therapy amount
    letters: {
      debt: [195, 0.046438, 0.078156, 0.046438, 0, false], retirement: [0, 0, 0, 0, 0, false],
      accommodation: [1400, 0.333399, 0.561122, 0.333399, 0, true], food: [500, 0.119071, 0.200401, 0.119071, 0, true],
      transportation: [400, 0.095257, 0.160321, 0.095257, 0, true]
    },
    reading: 'DRAFTT is 59% of take-home. Accommodation is the biggest letter at 56% of DRAFTT. Estimates stand in where actuals are missing (Accommodation, Food, Transportation). Everything else is 6% and left over is 35%. Taxes are 16% of gross, outside this picture.'
  },
  incomeStatement: { revenue: 5000, taxes: 800.833333, deductions: 0, needs: 2300, debt: 195, wants: 150, savings: 100, net: 1454.166667 },
  completion: 0.394737,
  next: ['Housing / Rent: actual', 'Take-home: Hospital admin', 'Food / Groceries: actual'],
  roughCount: 10,
  guesses: { health: 400, fun: 300, annual: 100 }
};
