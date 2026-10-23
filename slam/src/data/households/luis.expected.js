// Hand-computed expected answers for Luis, 33, Ohio: W-2 plus a side hustle, car loan, two credit
// cards, one buy-now-pay-later, actuals for about half the categories, a speeding ticket tagged
// mistake. Read by tests/households.test.js and tests/coverage.test.js, which compare them with
// buildSummary over luis.json, and by tools/screens-check.mjs, which checks the screens against
// them in a browser.

// INCOME
// Warehouse: 2,000 per paycheck, semimonthly: 2,000 x 24 / 12 = 4,000 take-home a month
//   gross 62,400 a year / 12 = 5,200; pre-tax 100 x 24 / 12 = 200
//   taxes = 5,200 - 200 - 4,000 = 1,000
// Delivery driving (side): 600 a month, roughly, no gross given
// Take-home = 4,600. Hours: (40 + 10) x 52 / 12 = 216.667. Hourly = 4,600 x 12 / 2,600 = 21.230769

// DEBTS -> Debt payments (computed): minimums 425 + 120 + 40 + 100 = 685, plus the cards' interest, computed as
// soon as each card has an APR and a balance (S-133): Chase 4,200 x 24.99 / 1,200 = 104,958 / 1,200 = 87.465
// -> 87.47; Discover 1,100 x 22.9 / 1,200 = 25,190 / 1,200 = 20.99166 -> 20.99. 685 + 87.47 + 20.99 = 793.46.
// The typed "Interest charged" 45 is replaced (counted as 0), never both.

// CATEGORIES (estimate / dream from the rough pass; actual from lines)
// Housing   1100 / 1000 / rent 950 + utilities 160 = 1110
// Food       600 /  500 / groceries 520 + eating out 310 = 830
// Transport  350 /  300 / insurance 140 + gas 220 + ticket 180 = 540 (maintenance blank, partial)
// Debt       793.46 / 685 / 793.46
// Health     150 /  150 / none
// Bills      120 /  100 / ATM 5 (interest replaced by computed, 0; moved from Fees, S-123; Phone and streaming blank, partial)
// Fun        300 /  400 / none
// Annual    1,200 a year = 100 / 100 / none
// Giving    not for me: 0 / 0 / 0
// Savings    300 /  500 / emergency 200 (retirement blank)

// TOTALS (spending = all but Savings)
// estimates 1100+600+350+793.46+150+120+300+100+0 = 3,513.46
// dreams    1000+500+300+685+150+100+400+100+0 = 3,235
// actuals entered: 1110+830+540+793.46+5+0 = 3,278.46
// spending basis (actual, else estimate): 3,278.46 + health 150 + fun 300 + annual 100 = 3,828.46
//   (estimate used for Health, Personal and fun, Annual and irregular; Bills has an actual, 5)
// outflow 3,828.46 + 200 = 4,028.46; surplus 4,600 - 4,028.46 = 571.54
// savings rate (200 + 200) / (4,600 + 200) = 400 / 4,800 = 0.083333
// housing share 1,110 / 4,600 = 0.241304 (under 35%)

// BLIND SPOT: housing 10 + food 230 + transport 190 (bills 5 is under its 120; debt is on its estimate) = 430;
//   430 / 3,278.46: 3,278.46 x 0.13 = 426.1998; 3.8002 / 3,278.46 = 0.00115915 -> 0.13115915 -> 0.131159
// CULPRITS: food +230 (830/600 = 1.383333, 2,760 a year); transport +190 (540/350 = 1.542857, 2,280);
//   housing +10 (1,110/1,100 = 1.00909091 -> 1.009091, 120 a year) takes the third place Fees held
// GUT: 3,000 / 3,513.46 / 3,235 / 3,828.46; 3,828.46 - 3,000 = 828.46; 3,828.46 / 3,000 = 1.27615333 -> 1.276153
// PROOF OF CASH: implied 4,600 - 200 - 793.46 = 3,606.54; entered 3,828.46 - 793.46 = 3,035
//   diff -571.54; 571.54 / 3,606.54: 3,606.54 x 0.158 = 569.83332; 1.70668 / 3,606.54 = 0.00047322 -> 0.158473 -> flagged (over 15%)

// FIXED: rent 950 + car insurance 140 + debt 793.46 (its lines are fixed) + health 150 (category is fixed) = 2,033.46
// VARIABLE: 160+520+310+220+180+300+100+5 = 1,795 (the typed interest is 0 now). 2,033.46 + 1,795 = 3,828.46.
//   2,033.46 / 3,828.46: 3,828.46 x 0.53 = 2,029.0838; 4.3762 / 3,828.46 = 0.00114307 -> 0.531143
// NEEDS: 950+160+520+140+220+793.46+150 = 2,933.46 (ticket is not a need). WANTS: 3,828.46 - 2,933.46 = 895
//   2,933.46/4,600 = 0.63770870 -> 0.637709; 895/4,600 = 0.19456522 -> 0.194565; savings 200/4,600 = 0.043478;
//   unassigned 571.54/4,600 = 0.12424783 -> 0.124248
// MISTAKES: ticket 180 + interest 0 (replaced by computed) + ATM 5 = 185 a month, 2,220 a year

// DRAFTT (descriptive, S-072). Base = take-home 4,600 + pre-tax retirement 200 = 4,800
//   ("take-home plus pre-tax retirement"). Letters use the actual where there is one.
// D debt 793.46 (computed); R = after-tax line (blank, not in the Savings actual) 0 + pre-tax 200 = 200
// A housing actual 1,110; F food actual 830; T transport actual 540; no therapy line, so no Th
// DRAFTT total = 793.46 + 200 + 1,110 + 830 + 540 = 3,473.46
// % of base:  D 793.46/4,800 = 0.16530417 -> 0.165304; R 200/4,800 = 0.04166667 -> 0.041667; A 1,110/4,800 = 0.23125
//   F 830/4,800 = 0.17291667 -> 0.172917; T 540/4,800 = 0.1125; DRAFTT 3,473.46/4,800 = 0.7236375 -> 0.723638
// % of DRAFTT (1 / 3,473.46 = 0.00028789737): D 793.46 x that = 0.22843505 -> 0.228435; R 200 x = 0.05757947 -> 0.057579
//   A 1,110 x = 0.31956608 -> 0.319566; F 830 x = 0.23895482 -> 0.238955; T 540 x = 0.15546458 -> 0.155465 (sum 1)
// Everything else = outflow 4,028.46 - (793.46 + 1,110 + 830 + 540 + 0) = 4,028.46 - 3,273.46 = 755
//   (= health 150 + bills 5 + fun 300 + annual 100 + giving 0 + emergency fund 200); 755/4,800 = 0.15729167 -> 0.157292
// Left over = surplus 571.54; 571.54/4,800 = 0.11907083 -> 0.119071. Check: 3,473.46 + 755 + 571.54 = 4,800.
// Estimate % of base: D 793.46 -> 0.165304; R 0 + 200 (Savings estimate is one number, 300, not the line) -> 0.041667
//   A 1,100/4,800 = 0.22916667 -> 0.229167; F 600/4,800 = 0.125; T 350/4,800 = 0.07291667 -> 0.072917
// Change: A 10/4,800 = 0.00208333 -> 0.002083; F 230/4,800 = 0.04791667 -> 0.047917; T 190/4,800 = 0.03958333 -> 0.039583
// Taxes: the side gig has no gross, so household gross is unknown -> not shown.
// READING: 72.4% -> 72%; biggest letter A at 32.0% -> 32%; biggest change Food 12.5% -> 13% to 17.3% -> 17%;
//   everything else 15.7% -> 16%; left over 11.9% -> 12%.

// INCOME STATEMENT: revenue w2 5,200 + side 600 = 5,800; taxes 1,000; deductions 200; take-home 4,600
//   needs other than debt 2,933.46 - 793.46 = 2,140; debt 793.46; wants 895; savings 200; net 571.54 (6,858.48 a year)

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
//   debt 793.46 (minimums and the computed interest); health, fun, annual: no actuals, so no plan yet; bills ATM 5 (the
//   typed interest is replaced, so it plans nothing, S-133); savings emergency 200
// Plan spending = 1,110 + 830 + 540 + 793.46 + 5 = 3,278.46; plan outflow = 3,278.46 + 200 = 3,478.46
// Plan vs take-home: 4,600 - 3,478.46 = 1,121.54 left over. This month's actual outflow = 3,278.46 + 200 = 3,478.46.
// Frees up: 3,478.46 - 3,478.46 = 0 (the plan matches this month's actual). Plan % of income = 3,478.46 / 4,600 = 0.75618696 -> 0.756187
// No lines are rated, so happiness spend is not rated (null), never 0.
// Checklist: 18 lines (housing 2, food 2, transport 4, health 2, bills 3, fun 2, annual 1, savings 2); 0 reviewed.
// Rent: plan 950 / 4,600 = 0.20652174 -> 0.206522 of income; 950 / 3,278.46: 3,278.46 x 0.28977 = 949.99935, so
//   0.2897702 -> 0.28977 of spending

export default {
  review: {
    reviewMonth: '2026-09', planMonth: '2026-10',
    plan: 3478.46, planSpending: 3278.46, planLeft: 1121.54, actual: 3478.46, frees: 0, planPctIncome: 0.756187,
    happyNow: null, happyPlan: null, happyChange: null,
    checklist: [0, 18],
    rows: { rent: { plan: 950, decision: 'keep', planPctIncome: 0.206522, planPctSpending: 0.28977 }, maintenance: { plan: null, decision: null } },
    reading: "Next month's plan matches this month's actual. The plan leaves $1,122 of take-home."
  },
  fat: 2480, fatShare: 0.539130,
  takeHome: 4600, pretax: 200, hourly: 21.230769,
  categories: {
    // [estimate, actual]
    housing: [1100, 1110], food: [600, 830], transport: [350, 540], debt: [793.46, 793.46],
    health: [150, null], bills: [120, 5], fun: [300, null], annual: [100, null],
    giving: [0, 0], savings: [300, 200]
  },
  estimateTotal: 3513.46, actualTotal: 3278.46, spending: 3828.46, savings: 200,
  surplus: 571.54, savingsRate: 0.083333, housingShare: 0.241304, housingOver: false,
  roommateWorstCase: null,
  basisUsesEstimate: ['Health', 'Personal and fun', 'Annual and irregular'],
  blindSpot: 0.131159,
  culprits: [['Food', 230, 1.383333, 2760], ['Transportation', 190, 1.542857, 2280], ['Housing', 10, 1.009091, 120]],
  gut: { gut: 3000, estimates: 3513.46, actual: 3828.46, actualVsGut: 828.46, ratio: 1.276153 },
  proofOfCash: { implied: 3606.54, entered: 3035, pct: 0.158473, flagged: true },
  fixed: 2033.46, variable: 1795, fixedPct: 0.531143,
  needs: 2933.46, wants: 895, needsPct: 0.637709, wantsPct: 0.194565, savingsPct: 0.043478, unassignedShare: 0.124248,
  mistakeMonthly: 185, mistakeYearly: 2220, owedBack: 0,
  draftt: {
    base: 4800, baseLabel: 'take-home plus pre-tax retirement', total: 3473.46, totalShare: 0.723638,
    everythingElse: 755, everythingElseShare: 0.157292, leftOver: 571.54, leftOverShare: 0.119071, taxes: null,
    // letter: [amount, % of base, % of DRAFTT, estimate % of base, change, uses estimate]; no therapy line
    letters: {
      debt: [793.46, 0.165304, 0.228435, 0.165304, 0, false], retirement: [200, 0.041667, 0.057579, 0.041667, 0, false],
      accommodation: [1110, 0.23125, 0.319566, 0.229167, 0.002083, false], food: [830, 0.172917, 0.238955, 0.125, 0.047917, false],
      transportation: [540, 0.1125, 0.155465, 0.072917, 0.039583, false]
    },
    reading: "DRAFTT is 72% of take-home plus pre-tax retirement. Accommodation is the biggest letter at 32% of DRAFTT. Food's share went from 13% estimated to 17% actual. Everything else is 16% and left over is 12%."
  },
  incomeStatement: { revenue: 5800, taxes: 1000, deductions: 200, needs: 2140, debt: 793.46, wants: 895, savings: 200, net: 571.54 },
  completion: 0.901235,
  next: ['Health / Premiums: actual', 'Health / Out of pocket: actual', 'Annual and irregular / Yearly costs: actual'],
  small: ['Bills and subscriptions / ATM: actual']
};
