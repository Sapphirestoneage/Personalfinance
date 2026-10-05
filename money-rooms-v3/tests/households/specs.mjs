/* Synthetic households. Invented people; no real data. Money is in cents.
   A fact is [value, state, source, cadence]; state defaults to known, source to client. */

export const jordan = {
  id: 'jordan', start: '2026-09-10T15:00:00.000Z',
  sun: {
    name: ['Jordan Avila', 'verified'], birthDate: ['1999-03-14', 'verified'], state: ['NY', 'verified'], city: ['Brooklyn'],
    workSituation: ['employed', 'verified'], dependents: [0, 'none'], filingStatus: ['single', 'verified'], bigGoal: ['An apartment of my own by 32'],
  },
  rows: [
    { id: 'j-w2', planet: 'income', type: 'w2', nickname: 'Analyst', institution: 'Brightline Health', asOf: '2026-09', f: {
      grossPay: [300000, 'verified', 'client', 'paycheck'], takeHome: [206147, 'verified', 'client', 'paycheck'], payFrequency: 'biweekly', stability: 'steady',
      pretaxRetirement: [12000, 'verified', 'client', 'paycheck'], rothRetirement: [0, 'none'], hsaPayroll: [null, 'not-applicable'], pretaxOther: [9500, 'verified', 'client', 'paycheck'],
      withholdingFederal: [27308, 'known', 'client', 'paycheck'], bonus: [300000, 'rough', 'client', 'year'], equity: [0, 'none'], startDate: '2024-07',
      hoursPaid: 40, hoursCommute: 7.5, workCosts: [18000, 'rough', 'client', 'month'] } },
    { id: 'j-ben', planet: 'income', type: 'benefits', nickname: 'Brightline 401k match', institution: 'Brightline Health', f: { matchRate: 0.5, matchUpTo: 0.06, vestingPct: 1, otherBenefit: [0, 'none'] } },
    { id: 'j-rent', planet: 'spending', type: 'line', nickname: 'Rent', institution: 'Hudson Yards Realty', f: { category: 'accommodation', amount: [215000, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', shared: 'no', fatFloor: true, primaryCard: [null, 'not-applicable'], linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-util', planet: 'spending', type: 'line', nickname: 'Electric and internet', institution: 'Con Edison, Verizon Fios', f: { category: 'utilities', amount: [14200, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', shared: 'no', fatFloor: true, primaryCard: 'Freedom Unlimited', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-groc', planet: 'spending', type: 'line', nickname: 'Groceries', institution: 'Trader Joe\'s', f: { category: 'food', amount: [42000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', shared: 'no', fatFloor: true, primaryCard: 'Gold Card', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-rest', planet: 'spending', type: 'line', nickname: 'Restaurants and takeout', institution: '', f: { category: 'food', amount: [31000, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: 'Gold Card', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-sub', planet: 'spending', type: 'line', nickname: 'Subway and bus', institution: 'MTA', f: { category: 'transportation', amount: [13200, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', shared: 'no', fatFloor: true, primaryCard: 'Freedom Unlimited', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-phone', planet: 'spending', type: 'line', nickname: 'Phone', institution: 'Mint Mobile', f: { category: 'utilities', amount: [3000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: 'Freedom Unlimited', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-stream', planet: 'spending', type: 'line', nickname: 'Streaming', institution: 'Netflix, Spotify', f: { category: 'utilities', amount: [3800, 'known', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: 'Freedom Unlimited', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-gym', planet: 'spending', type: 'line', nickname: 'Gym', institution: 'Blink Fitness', f: { category: 'therapy', amount: [5500, 'known', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: 'Freedom Unlimited', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-ther', planet: 'spending', type: 'line', nickname: 'Therapy', institution: '', f: { category: 'therapy', amount: [24000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: [null, 'not-applicable'], linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-cloth', planet: 'spending', type: 'line', nickname: 'Clothing and personal care', institution: '', f: { category: 'wants', amount: [9000, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: 'Freedom Unlimited', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-travel', planet: 'spending', type: 'line', nickname: 'Travel', institution: '', f: { category: 'irregular', amount: [180000, 'rough', 'client', 'year'], needWant: 'want', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: 'Gold Card', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-gifts', planet: 'spending', type: 'line', nickname: 'Gifts', institution: '', f: { category: 'irregular', amount: [60000, 'rough', 'client', 'year'], needWant: 'want', mistake: 'unavoidable', shared: 'no', fatFloor: false, primaryCard: 'Gold Card', linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-fees', planet: 'spending', type: 'line', nickname: 'Overdraft and late fees', institution: 'Chase', f: { category: 'mistakes', amount: [3500, 'known', 'client', 'month'], needWant: 'want', mistake: 'mistake', shared: 'no', fatFloor: false, primaryCard: [null, 'not-applicable'], linkedIncome: [null, 'not-applicable'] } },
    { id: 'j-save', planet: 'spending', type: 'savings', nickname: 'Roth IRA transfer', institution: 'Vanguard', f: { savingsDestination: 'Roth IRA', savingsLanding: [25000, 'verified', 'client', 'month'] } },
    { id: 'j-cfu', planet: 'debt', type: 'card', nickname: 'Freedom Unlimited', institution: 'Chase', lib: 'chase-freedom-unlimited', asOf: '2026-09', stress: 4, f: {
      cardName: 'Chase Freedom Unlimited', balance: [284000, 'verified'], apr: [0.2499, 'known'], promoApr: [0, 'none'], promoEnd: '2027-03', promoType: 'purchase', btFee: [null, 'not-applicable'],
      minimum: [8500, 'known', 'client', 'month'], creditLimit: 650000, dueDay: 17, annualFee: [0, 'none', 'lookup-verify', 'year'], creditsUsed: [null, 'none', 'lookup-verify'], autopay: 'minimum' } },
    { id: 'j-gold', planet: 'debt', type: 'card', nickname: 'Gold Card', institution: 'American Express', lib: 'american-express-gold-card', asOf: '2026-09', stress: 2, f: {
      cardName: 'American Express Gold Card', balance: [41000, 'known'], apr: [0.2524, 'known'], promoApr: [null, 'not-applicable'], promoEnd: [null, 'not-applicable'], promoType: [null, 'not-applicable'], btFee: [null, 'not-applicable'],
      minimum: [3500, 'known', 'client', 'month'], creditLimit: 1000000, dueDay: 3, annualFee: [32500, 'known', 'lookup-verify', 'year'],
      creditsUsed: [{ 'Dining credit': 'no', 'Uber Cash': 'no', 'Resy credit': 'no', 'Dunkin credit': 'no' }, 'known', 'client'], autopay: 'full' } },
    { id: 'j-loan', planet: 'debt', type: 'student', nickname: 'Direct unsubsidized', institution: 'MOHELA', asOf: '2026-08', stress: 3, f: {
      federalPrivate: 'federal', loanType: 'direct-unsub', balance: [1840000, 'verified'], rate: [0.055, 'verified'], minimum: [19600, 'verified', 'client', 'month'], repaymentPlan: 'standard',
      pslfEligible: false, pslfPayments: [null, 'not-applicable'], forbearance: false, interestDeductible: true } },
    { id: 'j-score', planet: 'debt', type: 'score', nickname: 'Credit score', institution: 'Experian', asOf: '2026-09', f: { score: 718, bureau: 'experian' } },
    { id: 'j-rent-ins', planet: 'safety', type: 'insurance', nickname: 'Renters', institution: 'Lemonade', f: { insuranceType: 'renters', coverage: 3000000, premium: [1400, 'known', 'client', 'month'], deductible: 50000 } },
    { id: 'j-health', planet: 'safety', type: 'insurance', nickname: 'Health (employer)', institution: 'Aetna', f: { insuranceType: 'health', coverage: [null, 'unknown'], premium: [9500, 'known', 'client', 'paycheck'], deductible: 150000 } },
    { id: 'j-ui', planet: 'safety', type: 'unemployment', nickname: 'If work stopped', institution: 'NY DOL', f: { unemploymentWeekly: [50400, 'known', 'lookup-verify'], unemploymentWeeks: [26, 'known', 'lookup-verify'] } },
    { id: 'j-cut', planet: 'safety', type: 'cut', nickname: 'Could cut', f: { cutAbility: [40000, 'rough', 'client', 'month'] } },
    { id: 'j-401k', planet: 'invest', type: 'account', nickname: '401k', institution: 'Fidelity', asOf: '2026-09', stress: 1, f: {
      accountType: '401k', accountBalance: [1125000, 'verified'], contribAmount: [null, 'not-applicable'], contribPct: [null, 'not-applicable'], ytdContrib: [216000, 'known'],
      allocStocks: 0.9, allocBonds: 0.1, allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 0.7, targetYear: 2060, costBasis: [null, 'not-applicable'], beneficiary: true } },
    { id: 'j-roth', planet: 'invest', type: 'account', nickname: 'Roth IRA', institution: 'Vanguard', asOf: '2026-09', stress: 1, f: {
      accountType: 'rothIra', accountBalance: [680000, 'verified'], contribAmount: [25000, 'verified', 'client', 'month'], contribPct: [null, 'not-applicable'], ytdContrib: [225000, 'known'],
      allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 1, targetYear: [null, 'not-applicable'], costBasis: [null, 'not-applicable'], beneficiary: false } },
    { id: 'j-hysa', planet: 'invest', type: 'account', nickname: 'Savings', institution: 'Ally', asOf: '2026-09', stress: 1, f: {
      accountType: 'hysa', accountBalance: [2260000, 'verified'], contribAmount: [0, 'none'], contribPct: [null, 'not-applicable'], ytdContrib: [null, 'not-applicable'],
      allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], targetYear: [null, 'not-applicable'], costBasis: [null, 'not-applicable'], beneficiary: true } },
    { id: 'j-chk', planet: 'invest', type: 'account', nickname: 'Checking', institution: 'Chase', asOf: '2026-09', stress: 2, f: {
      accountType: 'checking', accountBalance: [290000, 'known'], contribAmount: [null, 'not-applicable'], contribPct: [null, 'not-applicable'], ytdContrib: [null, 'not-applicable'],
      allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], targetYear: [null, 'not-applicable'], costBasis: [null, 'not-applicable'], beneficiary: [null, 'not-applicable'] } },
    { id: 'j-vtsax', planet: 'invest', type: 'holding', nickname: 'VTSAX', institution: 'Vanguard', lib: 'VTSAX', f: { accountRef: 'Roth IRA', ticker: 'VTSAX', fundName: ['Vanguard Total Stock Market Index Admiral', 'known', 'lookup-verify'], expenseRatio: [0.0004, 'known', 'lookup-verify'], assetClass: ['us-stock', 'known', 'lookup-verify'], pctOfAccount: 1 } },
    { id: 'j-2060', planet: 'invest', type: 'holding', nickname: 'Target 2060', institution: 'Fidelity', lib: 'FDEWX', f: { accountRef: '401k', ticker: 'FDEWX', fundName: ['Fidelity Freedom Index 2060', 'known', 'lookup-verify'], expenseRatio: [0.0012, 'known', 'lookup-verify'], assetClass: ['target-date', 'known', 'lookup-verify'], pctOfAccount: 1 } },
    { id: 'j-tax', planet: 'taxes', type: 'note', nickname: 'Last return', institution: 'IRS', f: { lastRefund: [142000, 'known'], taxNote: 'Got a refund; withholding may be high' } },
    { id: 'j-goal', planet: 'life', type: 'goal', nickname: 'Apartment down payment', f: { goalCost: [6000000, 'rough'], targetDate: '2031-06', priority: '1' } },
    { id: 'j-ret', planet: 'life', type: 'retirement', nickname: 'Retirement', f: { retirementAge: [60, 'rough'], gogo: [1, 'known', 'estimated'], slowgo: [0.85, 'known', 'estimated'], nogo: [0.75, 'known', 'estimated'] } },
  ],
};

export const specs = { jordan };
