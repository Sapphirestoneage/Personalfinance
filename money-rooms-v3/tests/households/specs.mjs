/* Synthetic households. Invented people; no real data. Money is in cents.
   A fact is [value, state, source, cadence]; state defaults to known, source to client. */

export const jordan = {
  id: 'jordan', start: '2026-09-10T15:00:00.000Z',
  sun: {
    name: ['Jordan Avila', 'verified'], birthDate: ['1999-03-14', 'verified'], state: ['NY', 'verified'], city: ['Brooklyn'],
    workSituation: ['employed', 'verified'], dependents: [0, 'none'], filingStatus: ['single', 'verified'], bigGoal: ['An apartment of my own by 32']
  },
  rows: [
    { id: 'j-w2', planet: 'income', type: 'w2', nickname: 'Analyst', institution: 'Brightline Health', asOf: '2026-09', f: {
      grossPay: [300000, 'verified', 'client', 'paycheck'], takeHome: [206147, 'verified', 'client', 'paycheck'], payFrequency: 'biweekly', stability: 'steady',
      pretaxRetirement: [12000, 'verified', 'client', 'paycheck'], rothRetirement: [0, 'none'], hsaPayroll: [null, 'not-applicable'], pretaxOther: [9500, 'verified', 'client', 'paycheck'],
      bonus: [300000, 'rough', 'client', 'year'], equity: [0, 'none'], startDate: '2024-07',
      hoursPaid: 40, hoursCommute: 7.5, workCosts: [18000, 'rough', 'client', 'month'] } },
    { id: 'j-ben', planet: 'income', type: 'benefits', nickname: 'Brightline 401k match', institution: 'Brightline Health', f: { matchRate: 0.5, matchUpTo: 0.06, otherBenefit: [0, 'none'] } },
    { id: 'j-rent', planet: 'spending', type: 'line', nickname: 'Rent', institution: 'Hudson Yards Realty', f: { category: 'accommodation', amount: [215000, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: [null, 'not-applicable'] } },
    { id: 'j-util', planet: 'spending', type: 'line', nickname: 'Electric and internet', institution: 'Con Edison, Verizon Fios', f: { category: 'utilities', amount: [14200, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Freedom Unlimited' } },
    { id: 'j-groc', planet: 'spending', type: 'line', nickname: 'Groceries', institution: 'Trader Joe\'s', f: { category: 'food', amount: [42000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Gold Card' } },
    { id: 'j-rest', planet: 'spending', type: 'line', nickname: 'Restaurants and takeout', institution: '', f: { category: 'food', amount: [31000, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Gold Card' } },
    { id: 'j-sub', planet: 'spending', type: 'line', nickname: 'Subway and bus', institution: 'MTA', f: { category: 'transportation', amount: [13200, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Freedom Unlimited' } },
    { id: 'j-phone', planet: 'spending', type: 'line', nickname: 'Phone', institution: 'Mint Mobile', f: { category: 'utilities', amount: [3000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Freedom Unlimited' } },
    { id: 'j-stream', planet: 'spending', type: 'line', nickname: 'Streaming', institution: 'Netflix, Spotify', f: { category: 'utilities', amount: [3800, 'known', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Freedom Unlimited' } },
    { id: 'j-gym', planet: 'spending', type: 'line', nickname: 'Gym', institution: 'Blink Fitness', f: { category: 'therapy', amount: [5500, 'known', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Freedom Unlimited' } },
    { id: 'j-ther', planet: 'spending', type: 'line', nickname: 'Therapy', institution: '', f: { category: 'therapy', amount: [24000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: false, primaryCard: [null, 'not-applicable'] } },
    { id: 'j-cloth', planet: 'spending', type: 'line', nickname: 'Clothing and personal care', institution: '', f: { category: 'wants', amount: [9000, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Freedom Unlimited' } },
    { id: 'j-travel', planet: 'spending', type: 'line', nickname: 'Travel', institution: '', f: { category: 'irregular', amount: [180000, 'rough', 'client', 'year'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Gold Card' } },
    { id: 'j-gifts', planet: 'spending', type: 'line', nickname: 'Gifts', institution: '', f: { category: 'irregular', amount: [60000, 'rough', 'client', 'year'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Gold Card' } },
    { id: 'j-fees', planet: 'spending', type: 'line', nickname: 'Overdraft and late fees', institution: 'Chase', f: { category: 'mistakes', amount: [3500, 'known', 'client', 'month'], needWant: 'want', mistake: 'mistake', fatFloor: false, primaryCard: [null, 'not-applicable'] } },
    { id: 'j-save', planet: 'spending', type: 'savings', nickname: 'Roth IRA transfer', institution: 'Vanguard', f: { savingsLanding: [25000, 'verified', 'client', 'month'] } },
    { id: 'j-cfu', planet: 'debt', type: 'card', nickname: 'Freedom Unlimited', institution: 'Chase', lib: 'chase-freedom-unlimited', asOf: '2026-09', stress: 4, f: {
      cardName: 'Chase Freedom Unlimited', balance: [284000, 'verified'], apr: [0.2499, 'known'], promoApr: [0, 'none'], promoEnd: '2027-03', minimum: [8500, 'known', 'client', 'month'], creditLimit: 650000, annualFee: [0, 'none', 'lookup-verify', 'year'], creditsUsed: [null, 'none', 'lookup-verify'], autopay: 'minimum' } },
    { id: 'j-gold', planet: 'debt', type: 'card', nickname: 'Gold Card', institution: 'American Express', lib: 'american-express-gold-card', asOf: '2026-09', stress: 2, f: {
      cardName: 'American Express Gold Card', balance: [41000, 'known'], apr: [0.2524, 'known'], promoApr: [null, 'not-applicable'], promoEnd: [null, 'not-applicable'], minimum: [3500, 'known', 'client', 'month'], creditLimit: 1000000, annualFee: [32500, 'known', 'lookup-verify', 'year'],
      creditsUsed: [{ 'Dining credit': 'no', 'Uber Cash': 'no', 'Resy credit': 'no', 'Dunkin credit': 'no' }, 'known', 'client'], autopay: 'full' } },
    { id: 'j-loan', planet: 'debt', type: 'student', nickname: 'Direct unsubsidized', institution: 'MOHELA', asOf: '2026-08', stress: 3, f: {
      balance: [1840000, 'verified'], rate: [0.055, 'verified'], minimum: [19600, 'verified', 'client', 'month'] } },
    { id: 'j-score', planet: 'debt', type: 'score', nickname: 'Credit score', institution: 'Experian', asOf: '2026-09', f: { score: 718, bureau: 'experian' } },
    { id: 'j-rent-ins', planet: 'safety', type: 'insurance', nickname: 'Renters', institution: 'Lemonade', f: { insuranceType: 'renters', coverage: 3000000, premium: [1400, 'known', 'client', 'month'], deductible: 50000 } },
    { id: 'j-health', planet: 'safety', type: 'insurance', nickname: 'Health (employer)', institution: 'Aetna', f: { insuranceType: 'health', coverage: [null, 'unknown'], premium: [9500, 'known', 'client', 'paycheck'], deductible: 150000 } },
    { id: 'j-ui', planet: 'safety', type: 'unemployment', nickname: 'If work stopped', institution: 'NY DOL', f: { unemploymentWeekly: [50400, 'known', 'lookup-verify'] } },
    { id: 'j-cut', planet: 'safety', type: 'cut', nickname: 'Could cut', f: { cutAbility: [40000, 'rough', 'client', 'month'] } },
    { id: 'j-401k', planet: 'invest', type: 'account', nickname: '401k', institution: 'Fidelity', asOf: '2026-09', stress: 1, f: {
      accountType: '401k', accountBalance: [1125000, 'verified'], contribAmount: [null, 'not-applicable'], allocStocks: 0.9, allocBonds: 0.1, allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 0.7, beneficiary: true } },
    { id: 'j-roth', planet: 'invest', type: 'account', nickname: 'Roth IRA', institution: 'Vanguard', asOf: '2026-09', stress: 1, f: {
      accountType: 'rothIra', accountBalance: [680000, 'verified'], contribAmount: [25000, 'verified', 'client', 'month'], allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 1, beneficiary: false } },
    { id: 'j-hysa', planet: 'invest', type: 'account', nickname: 'Savings', institution: 'Ally', asOf: '2026-09', stress: 1, f: {
      accountType: 'hysa', accountBalance: [2260000, 'verified'], contribAmount: [0, 'none'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: true } },
    { id: 'j-chk', planet: 'invest', type: 'account', nickname: 'Checking', institution: 'Chase', asOf: '2026-09', stress: 2, f: {
      accountType: 'checking', accountBalance: [290000, 'known'], contribAmount: [null, 'not-applicable'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: [null, 'not-applicable'] } },
    { id: 'j-vtsax', planet: 'invest', type: 'holding', nickname: 'VTSAX', institution: 'Vanguard', lib: 'VTSAX', f: { accountRef: 'Roth IRA', fundName: ['Vanguard Total Stock Market Index Admiral', 'known', 'lookup-verify'], expenseRatio: [0.0004, 'known', 'lookup-verify'], pctOfAccount: 1 } },
    { id: 'j-2060', planet: 'invest', type: 'holding', nickname: 'Target 2060', institution: 'Fidelity', lib: 'FDEWX', f: { accountRef: '401k', fundName: ['Fidelity Freedom Index 2060', 'known', 'lookup-verify'], expenseRatio: [0.0012, 'known', 'lookup-verify'], pctOfAccount: 1 } },
    { id: 'j-goal', planet: 'life', type: 'goal', nickname: 'Apartment down payment', f: { goalCost: [6000000, 'rough'], targetDate: '2031-06', priority: '1' } },
    { id: 'j-ret', planet: 'life', type: 'retirement', nickname: 'Retirement', f: { retirementAge: [60, 'rough'], gogo: [1, 'known', 'estimated'], slowgo: [0.85, 'known', 'estimated'], nogo: [0.75, 'known', 'estimated'] } },
  ]
};

export const specs = { jordan };

/* Dev: 31, self-employed 1099 around $95k variable, car loan only, HSA, Solo 401k,
   a taxable brokerage with a high-fee fund, thin runway. */
export const dev = {
  id: 'dev', start: '2026-09-18T17:00:00.000Z',
  sun: {
    name: ['Dev Okafor', 'verified'], birthDate: ['1995-06-22', 'verified'], state: ['TX', 'verified'], city: ['Austin'],
    workSituation: ['self-employed', 'verified'], dependents: [0, 'none'], filingStatus: ['single', 'verified'], bigGoal: ['Stop trading hours for money by 45']
  },
  rows: [
    { id: 'd-1099', planet: 'income', type: 'c1099', nickname: 'Design consulting', institution: 'Four retainer clients', asOf: '2026-09', f: {
      grossPay: [{ low: 650000, high: 950000 }, 'rough', 'client', 'month'], takeHome: [540000, 'rough', 'client', 'month'], payFrequency: 'monthly', stability: 'variable',
      businessExpenses: [90000, 'known', 'client', 'month'], hsaPayroll: [null, 'not-applicable'], startDate: '2022-03',
      hoursPaid: 38, hoursCommute: 4, workCosts: [22000, 'rough', 'client', 'month'] } },
    { id: 'd-rent', planet: 'spending', type: 'line', nickname: 'Rent', institution: 'East Austin lofts', f: { category: 'accommodation', amount: [175000, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: [null, 'not-applicable'] } },
    { id: 'd-util', planet: 'spending', type: 'line', nickname: 'Electric, water and internet', institution: 'Austin Energy, Google Fiber', f: { category: 'utilities', amount: [19000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Double Cash' } },
    { id: 'd-groc', planet: 'spending', type: 'line', nickname: 'Groceries', institution: 'H-E-B', f: { category: 'food', amount: [48000, 'rough', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Double Cash' } },
    { id: 'd-rest', planet: 'spending', type: 'line', nickname: 'Restaurants and takeout', institution: '', f: { category: 'food', amount: [36000, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-gas', planet: 'spending', type: 'line', nickname: 'Gas and parking', institution: '', f: { category: 'transportation', amount: [16000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Double Cash' } },
    { id: 'd-carins', planet: 'spending', type: 'line', nickname: 'Car insurance', institution: 'Progressive', f: { category: 'transportation', amount: [14500, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Double Cash' } },
    { id: 'd-phone', planet: 'spending', type: 'line', nickname: 'Phone', institution: 'Verizon', f: { category: 'utilities', amount: [7000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-soft', planet: 'spending', type: 'line', nickname: 'Software subscriptions', institution: 'Adobe, Figma', f: { category: 'utilities', amount: [8500, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-gym', planet: 'spending', type: 'line', nickname: 'Climbing gym', institution: 'Austin Bouldering Project', f: { category: 'therapy', amount: [9500, 'known', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-cloth', planet: 'spending', type: 'line', nickname: 'Clothing and personal care', institution: '', f: { category: 'wants', amount: [7500, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-coffee', planet: 'spending', type: 'line', nickname: 'Coffee shops', institution: '', f: { category: 'wants', amount: [12000, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-travel', planet: 'spending', type: 'line', nickname: 'Travel', institution: '', f: { category: 'irregular', amount: [240000, 'rough', 'client', 'year'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-gifts', planet: 'spending', type: 'line', nickname: 'Gifts', institution: '', f: { category: 'irregular', amount: [50000, 'rough', 'client', 'year'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Double Cash' } },
    { id: 'd-late', planet: 'spending', type: 'line', nickname: 'Late payment fees', institution: '', f: { category: 'mistakes', amount: [1500, 'known', 'client', 'month'], needWant: 'want', mistake: 'mistake', fatFloor: false, primaryCard: [null, 'not-applicable'] } },
    { id: 'd-save', planet: 'spending', type: 'savings', nickname: 'Brokerage, HSA and Solo 401k transfers', institution: 'Robinhood, Fidelity, Schwab', f: { savingsLanding: [120000, 'known', 'client', 'month'] } },
    { id: 'd-auto', planet: 'debt', type: 'auto', nickname: '2022 Subaru Crosstrek', institution: 'Capital One Auto Finance', asOf: '2026-09', stress: 2, f: { balance: [1420000, 'verified'], rate: [0.069, 'verified'], payment: [31800, 'verified', 'client', 'month'], monthsLeft: 51 } },
    { id: 'd-dc', planet: 'debt', type: 'card', nickname: 'Double Cash', institution: 'Citi', lib: 'citi-double-cash', asOf: '2026-09', stress: 1, f: {
      cardName: 'Citi Double Cash', balance: [0, 'none'], apr: [0.2224, 'known'], promoApr: [null, 'not-applicable'], promoEnd: [null, 'not-applicable'], minimum: [0, 'none', 'client', 'month'], creditLimit: 800000, annualFee: [0, 'none', 'lookup-verify', 'year'], creditsUsed: [null, 'none', 'lookup-verify'], autopay: 'full' } },
    { id: 'd-score', planet: 'debt', type: 'score', nickname: 'Credit score', institution: 'Equifax', asOf: '2026-09', f: { score: 742, bureau: 'equifax' } },
    { id: 'd-health', planet: 'safety', type: 'insurance', nickname: 'Health (marketplace)', institution: 'Blue Cross Blue Shield of Texas', f: { insuranceType: 'health', coverage: [null, 'unknown'], premium: [42000, 'verified', 'client', 'month'], deductible: 700000 } },
    { id: 'd-ui', planet: 'safety', type: 'unemployment', nickname: 'If work stopped', institution: 'Texas Workforce Commission', f: { unemploymentWeekly: [null, 'not-applicable'] } },
    { id: 'd-cut', planet: 'safety', type: 'cut', nickname: 'Could cut', f: { cutAbility: [60000, 'rough', 'client', 'month'] } },
    { id: 'd-hsa', planet: 'invest', type: 'account', nickname: 'HSA', institution: 'Fidelity', asOf: '2026-09', stress: 1, f: {
      accountType: 'hsa', accountBalance: [310000, 'verified'], contribAmount: [30000, 'verified', 'client', 'month'], allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 1, beneficiary: false } },
    { id: 'd-solo', planet: 'invest', type: 'account', nickname: 'Solo 401k', institution: 'Schwab', asOf: '2026-09', stress: 1, f: {
      accountType: 'solo401k', accountBalance: [2140000, 'verified'], contribAmount: [50000, 'verified', 'client', 'month'], allocStocks: 0.9, allocBonds: 0.1, allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 0.75, beneficiary: true } },
    { id: 'd-brk', planet: 'invest', type: 'account', nickname: 'Brokerage', institution: 'Robinhood', asOf: '2026-09', stress: 3, f: {
      accountType: 'taxable', accountBalance: [2475000, 'verified'], contribAmount: [40000, 'known', 'client', 'month'], allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 0.95, beneficiary: false } },
    { id: 'd-chk', planet: 'invest', type: 'account', nickname: 'Checking', institution: 'Chase', asOf: '2026-09', stress: 4, f: {
      accountType: 'checking', accountBalance: [410000, 'known'], contribAmount: [null, 'not-applicable'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: [null, 'not-applicable'] } },
    { id: 'd-hysa', planet: 'invest', type: 'account', nickname: 'Savings', institution: 'Marcus', asOf: '2026-09', stress: 3, f: {
      accountType: 'hysa', accountBalance: [260000, 'known'], contribAmount: [0, 'none'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: true } },
    { id: 'd-arkk', planet: 'invest', type: 'holding', nickname: 'ARKK', institution: 'Robinhood', lib: 'ARKK', f: { accountRef: 'Brokerage', fundName: ['ARK Innovation ETF', 'known', 'lookup-verify'], expenseRatio: [0.0075, 'known', 'lookup-verify'], pctOfAccount: 0.8 } },
    { id: 'd-vti', planet: 'invest', type: 'holding', nickname: 'VTI', institution: 'Robinhood', lib: 'VTI', f: { accountRef: 'Brokerage', fundName: ['Vanguard Total Stock Market ETF', 'known', 'lookup-verify'], expenseRatio: [0.0003, 'known', 'lookup-verify'], pctOfAccount: 0.2 } },
    { id: 'd-goal', planet: 'life', type: 'goal', nickname: 'Six months of runway', f: { goalCost: [2500000, 'known'], targetDate: '2027-12', priority: '1' } },
    { id: 'd-ret', planet: 'life', type: 'retirement', nickname: 'Retirement', f: { retirementAge: [45, 'rough'], gogo: [1, 'known', 'estimated'], slowgo: [0.85, 'known', 'estimated'], nogo: [0.75, 'known', 'estimated'] } },
  ]
};

/* Maya: 26, the showcase. Every answer state and source, a range, Other rows,
   two saved scenarios, two past sessions in the journal. */
const mayaS1Rows = [
  { id: 'm-w2', planet: 'income', type: 'w2', nickname: 'Product designer', institution: 'Lumen Health', asOf: '2026-08', f: {
    grossPay: [365000, 'verified', 'client', 'paycheck'], takeHome: [251237, 'verified', 'client', 'paycheck'], payFrequency: 'biweekly', stability: 'steady',
    pretaxRetirement: [21900, 'verified', 'client', 'paycheck'], rothRetirement: [0, 'none'], hsaPayroll: [11000, 'verified', 'client', 'paycheck'], pretaxOther: [12800, 'verified', 'client', 'paycheck'],
    bonus: [0, 'none'], equity: [null, 'not-for-me'], startDate: '2023-09',
    hoursPaid: 40, hoursCommute: 5, workCosts: [14000, 'rough', 'client', 'month'] } },
  { id: 'm-ben', planet: 'income', type: 'benefits', nickname: 'Lumen 401k match', institution: 'Lumen Health', f: { matchRate: 1, matchUpTo: 0.04, otherBenefit: [5000, 'known', 'client', 'month'] } },
  { id: 'm-side', planet: 'income', type: 'side', nickname: 'Freelance illustration', institution: 'Direct clients', f: { grossPay: [65000, 'rough', 'client', 'month'], payFrequency: 'monthly', stability: 'variable', hoursPaid: 6 } },
  { id: 'm-oth', planet: 'income', type: 'other', nickname: 'Tutoring, occasional', institution: '', f: { otherIncome: [15000, 'rough', 'client', 'month'], payFrequency: 'monthly' } },
  { id: 'm-sum', planet: 'spending', type: 'summary', nickname: 'Rough total', f: { summaryTotal: [420000, 'rough', 'client', 'month'] } },
  { id: 'm-csp', planet: 'debt', type: 'card', nickname: 'Sapphire Preferred', institution: 'Chase', lib: 'chase-sapphire-preferred', asOf: '2026-08', stress: 2, f: {
    cardName: 'Chase Sapphire Preferred', balance: [123000, 'known'], apr: [0.2449, 'known'], promoApr: [null, 'not-applicable'], promoEnd: [null, 'not-applicable'], minimum: [4000, 'known', 'client', 'month'], creditLimit: 1200000, annualFee: [9500, 'known', 'lookup-verify', 'year'], creditsUsed: [{ 'Hotel credit (Chase Travel)': 'yes' }, 'known', 'client'], autopay: 'statement' } },
  { id: 'm-bilt', planet: 'debt', type: 'card', nickname: 'Bilt', institution: 'Wells Fargo', lib: 'wells-fargo-bilt-mastercard', asOf: '2026-08', stress: 1, f: {
    cardName: 'Wells Fargo Bilt Mastercard', balance: [0, 'none'], apr: [0.2474, 'known'], promoApr: [null, 'not-applicable'], promoEnd: [null, 'not-applicable'], minimum: [0, 'none', 'client', 'month'], creditLimit: [null, 'unknown'], annualFee: [0, 'none', 'lookup-verify', 'year'], creditsUsed: [null, 'none', 'lookup-verify'], autopay: 'full' } },
  { id: 'm-loan', planet: 'debt', type: 'student', nickname: 'Direct unsubsidized', institution: 'Nelnet', asOf: '2026-08', stress: 3, f: {
    balance: [1190000, 'verified'], rate: [0.0499, 'verified'], minimum: [12600, 'verified', 'client', 'month'] } },
  { id: 'm-score', planet: 'debt', type: 'score', nickname: 'Credit score', institution: 'TransUnion', asOf: '2026-08', f: { score: 761, bureau: 'transunion' } },
];
const mayaS2Rows = [
  { id: 'm-rent', planet: 'spending', type: 'line', nickname: 'Rent', institution: 'Temescal Commons', f: { category: 'accommodation', amount: [225000, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Bilt' } },
  { id: 'm-util', planet: 'spending', type: 'line', nickname: 'PG&E and internet', institution: 'PG&E, Sonic', f: { category: 'utilities', amount: [16500, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-groc', planet: 'spending', type: 'line', nickname: 'Groceries', institution: 'Berkeley Bowl', f: { category: 'food', amount: [52000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-rest', planet: 'spending', type: 'line', nickname: 'Restaurants and takeout', institution: '', f: { category: 'food', amount: [{ low: 25000, high: 35000 }, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-bart', planet: 'spending', type: 'line', nickname: 'BART and Lyft', institution: 'Clipper, Lyft', f: { category: 'transportation', amount: [19000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-phone', planet: 'spending', type: 'line', nickname: 'Phone', institution: 'Visible', f: { category: 'utilities', amount: [4500, 'verified', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-stream', planet: 'spending', type: 'line', nickname: 'Streaming and subscriptions', institution: '', f: { category: 'utilities', amount: [5500, 'known', 'estimated', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-climb', planet: 'spending', type: 'line', nickname: 'Climbing gym', institution: 'Pacific Pipe', f: { category: 'therapy', amount: [9500, 'known', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-ther', planet: 'spending', type: 'line', nickname: 'Therapy', institution: '', f: { category: 'therapy', amount: [16000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: false, primaryCard: [null, 'not-applicable'] } },
  { id: 'm-cloth', planet: 'spending', type: 'line', nickname: 'Clothing and personal care', institution: '', f: { category: 'wants', amount: [11000, 'rough', 'client', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-travel', planet: 'spending', type: 'line', nickname: 'Travel', institution: '', f: { category: 'irregular', amount: [260000, 'rough', 'client', 'year'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-gifts', planet: 'spending', type: 'line', nickname: 'Gifts and giving', institution: '', f: { category: 'irregular', amount: [9000, 'rough', 'estimated', 'month'], needWant: 'want', mistake: 'unavoidable', fatFloor: false, primaryCard: 'Sapphire Preferred' } },
  { id: 'm-park', planet: 'spending', type: 'line', nickname: 'Parking tickets', institution: 'City of Oakland', f: { category: 'mistakes', amount: [4000, 'known', 'client', 'month'], needWant: 'want', mistake: 'mistake', fatFloor: false, primaryCard: [null, 'not-applicable'] } },
  { id: 'm-cat', planet: 'spending', type: 'other', nickname: 'Cat, vet and food', institution: '', f: { otherSpending: [8500, 'known', 'client', 'month'] } },
  { id: 'm-save1', planet: 'spending', type: 'savings', nickname: 'Roth IRA transfer', institution: 'Vanguard', f: { savingsLanding: [30000, 'verified', 'client', 'month'] } },
  { id: 'm-save2', planet: 'spending', type: 'savings', nickname: 'Savings transfer', institution: 'Marcus', f: { savingsLanding: [40000, 'verified', 'client', 'month'] } },
  { id: 'm-rentins', planet: 'safety', type: 'insurance', nickname: 'Renters', institution: 'Lemonade', f: { insuranceType: 'renters', coverage: 4000000, premium: [1800, 'known', 'client', 'month'], deductible: 50000 } },
  { id: 'm-health', planet: 'safety', type: 'insurance', nickname: 'Health (employer)', institution: 'Kaiser', f: { insuranceType: 'health', coverage: [null, 'unknown'], premium: [12800, 'known', 'client', 'paycheck'], deductible: 200000 } },
  { id: 'm-ltd', planet: 'safety', type: 'insurance', nickname: 'Long-term disability', institution: 'Unum', f: { insuranceType: 'disability', coverage: [null, 'will-send'], premium: [1200, 'known', 'client', 'paycheck'], deductible: [null, 'not-applicable'] } },
  { id: 'm-ui', planet: 'safety', type: 'unemployment', nickname: 'If work stopped', institution: 'California EDD', f: { unemploymentWeekly: [45000, 'known', 'lookup-verify'] } },
  { id: 'm-cut', planet: 'safety', type: 'cut', nickname: 'Could cut', f: { cutAbility: [50000, 'rough', 'client', 'month'] } },
  { id: 'm-401k', planet: 'invest', type: 'account', nickname: '401k', institution: 'Fidelity', asOf: '2026-09', stress: 1, f: {
    accountType: '401k', accountBalance: [2840000, 'known'], contribAmount: [null, 'not-applicable'], allocStocks: 0.9, allocBonds: 0.1, allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 0.65, beneficiary: true } },
  { id: 'm-roth', planet: 'invest', type: 'account', nickname: 'Roth IRA', institution: 'Vanguard', asOf: '2026-09', stress: 1, f: {
    accountType: 'rothIra', accountBalance: [1490000, 'verified'], contribAmount: [30000, 'verified', 'client', 'month'], allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 1, beneficiary: true } },
  { id: 'm-hsa', planet: 'invest', type: 'account', nickname: 'HSA', institution: 'Fidelity', asOf: '2026-09', stress: 1, f: {
    accountType: 'hsa', accountBalance: [425000, 'known'], contribAmount: [null, 'not-applicable'], allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 1, beneficiary: false } },
  { id: 'm-brk', planet: 'invest', type: 'account', nickname: 'Brokerage', institution: 'Fidelity', asOf: '2026-09', stress: 2, f: {
    accountType: 'taxable', accountBalance: [620000, 'known'], contribAmount: [0, 'none'], allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 1, beneficiary: [null, 'not-applicable'] } },
  { id: 'm-hysa', planet: 'invest', type: 'account', nickname: 'Savings', institution: 'Marcus', asOf: '2026-09', stress: 1, f: {
    accountType: 'hysa', accountBalance: [980000, 'verified'], contribAmount: [40000, 'verified', 'client', 'month'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: true } },
  { id: 'm-chk', planet: 'invest', type: 'account', nickname: 'Checking', institution: 'Chase', asOf: '2026-09', stress: 2, f: {
    accountType: 'checking', accountBalance: [330000, 'known'], contribAmount: [null, 'not-applicable'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: [null, 'not-applicable'] } },
  { id: 'm-fxaix', planet: 'invest', type: 'holding', nickname: 'FXAIX', institution: 'Fidelity', lib: 'FXAIX', f: { accountRef: 'Brokerage', fundName: ['Fidelity 500 Index', 'known', 'lookup-verify'], expenseRatio: [0.00015, 'known', 'lookup-verify'], pctOfAccount: 1 } },
  { id: 'm-vttsx', planet: 'invest', type: 'holding', nickname: 'Target 2060', institution: 'Fidelity', lib: 'VTTSX', f: { accountRef: '401k', fundName: ['Vanguard Target Retirement 2060', 'known', 'lookup-verify'], expenseRatio: [0.0008, 'known', 'lookup-verify'], pctOfAccount: 1 } },
  { id: 'm-vtsax', planet: 'invest', type: 'holding', nickname: 'VTSAX', institution: 'Vanguard', lib: 'VTSAX', f: { accountRef: 'Roth IRA', fundName: ['Vanguard Total Stock Market Index Admiral', 'known', 'lookup-verify'], expenseRatio: [0.0004, 'known', 'lookup-verify'], pctOfAccount: 1 } },
  { id: 'm-est', planet: 'taxes', type: 'other', nickname: 'Quarterly estimated tax', institution: 'IRS', f: { otherTax: [240000, 'known', 'client', 'year'] } },
  { id: 'm-njest', planet: 'taxes', type: 'other', nickname: 'NJ estimated tax', institution: 'NJ Division of Taxation', f: { otherTax: [60000, 'rough', 'client', 'year'] } },
  { id: 'm-goal1', planet: 'life', type: 'goal', nickname: 'Condo down payment', f: { goalCost: [8000000, 'rough'], targetDate: '2035-06', priority: '1' } },
  { id: 'm-goal2', planet: 'life', type: 'goal', nickname: 'Japan with my sister', f: { goalCost: [600000, 'known'], targetDate: '2027-10', priority: '3' } },
  { id: 'm-ret', planet: 'life', type: 'retirement', nickname: 'Retirement', f: { retirementAge: [55, 'rough'], gogo: [1, 'known', 'estimated'], slowgo: [0.85, 'known', 'estimated'], nogo: [0.75, 'known', 'estimated'] } },
];
export const maya = {
  id: 'maya',
  sun: {
    name: ['Maya Lindqvist', 'verified'], birthDate: ['2000-02-11', 'verified'], state: ['NJ', 'verified'], city: ['Jersey City'],
    workSituation: ['mixed', 'verified'], dependents: [0, 'none'], filingStatus: ['single', 'verified'], bigGoal: ['A small home by 35 and a four-day week']
  },
  rows: mayaS1Rows.concat(mayaS2Rows),
  sessions: [
    { start: '2026-08-20T16:00:00.000Z', label: 'Session 1', facts: { name: ['Maya Lindqvist', 'verified'], birthDate: ['2000-02-11', 'verified'], state: ['NJ', 'verified'], city: ['Jersey City'], workSituation: ['mixed', 'verified'], dependents: [0, 'none'], filingStatus: ['single', 'verified'], bigGoal: ['A small home by 35 and a four-day week'] }, rows: mayaS1Rows, snapshot: true, note: 'First meeting. Income and debts in; spending as one rough number.' },
    { start: '2026-09-17T16:00:00.000Z', label: 'Session 2', rows: mayaS2Rows, edits: [
      { rowId: 'm-csp', field: 'balance', value: 98000, state: 'known' },
      { rowId: 'm-loan', field: 'balance', value: 1177000, state: 'verified' },
    ], snapshot: true, note: 'Spending detail replaced the rough total. Accounts and safety net in.' },
    { start: '2026-10-03T16:00:00.000Z', label: 'Between sessions', edits: [
      { rowId: 'm-csp', field: 'balance', value: 64000, state: 'known' },
      { rowId: 'm-hysa', field: 'accountBalance', value: 1020000, state: 'verified' },
      { rowId: 'm-rest', field: 'amount', value: { low: 24000, high: 32000 }, state: 'rough', cad: 'month' },
    ], snapshot: false },
  ],
  scenarios: [
    { id: 'sc-condo', type: 'home', name: 'Condo in Oakland', startYear: 2035, durationYears: 0, cents: 8000000, monthlyCents: 65000, answers: { price: 42000000, downPct: 0.19, rateNote: 65000 }, promoted: false, createdAt: '2026-09-17T17:10:00.000Z' },
    { id: 'sc-fourday', type: 'job', name: 'Four-day week', startYear: 2029, durationYears: 30, cents: 0, monthlyCents: -73000, answers: { payChange: -0.2 }, promoted: false, createdAt: '2026-09-17T17:20:00.000Z' },
  ],
  quickNotes: [
    { id: 'qn1', ts: '2026-09-17T16:40:00.000Z', text: 'Ask for the 401k statement with YTD contributions', filed: false, screen: 'ledger' },
    { id: 'qn2', ts: '2026-09-17T16:55:00.000Z', text: 'Check whether Bilt reports the limit to the bureaus', filed: true, screen: 'ledger' },
  ],
  coachNotes: [{ id: 'cn1', ts: '2026-09-17T17:30:00.000Z', text: 'Wants the condo but is nervous about the side income drying up. Lead with runway, not FI.' }],
  clientPicks: ['match-left', 'card-fee', 'cash-drag', 'shelter-heavy'],
  onepager: { important: ['Housing takes about two fifths of take-home', 'The 401k match is fully taken; the Roth IRA fills about half of its room', 'Cash covers about three months of full spending'], amazing: ['Four accounts, all with named beneficiaries except the HSA', 'Savings land every month without fail'], struggling: ['Restaurants and clothing are still rough numbers', 'Parking tickets are a $480 a year habit'], doMore: 'Keep the Roth transfer automatic; move the gifts line to a known figure after the holidays.', doLess: 'Street parking downtown on Thursdays.', todos: [{ task: 'Send the 401k statement', owner: 'Maya', due: '2026-10-20' }, { task: 'Confirm the Sapphire hotel credit posted', owner: 'Eli', due: '2026-10-12' }] }
};

specs.dev = dev;
specs.maya = maya;

/* Extreme: zero income, $3.2M of assets, a negative surplus, 14 debts, 40-character names. */
const long = (s) => (s + ' ' + 'x'.repeat(40)).slice(0, 40);
const extremeDebts = [];
for (let i = 0; i < 14; i++) {
  const kind = ['card', 'student', 'auto', 'personal', 'mortgage', 'card', 'card'][i % 7];
  const base = { id: 'x-d' + i, planet: 'debt', type: kind, nickname: long('Debt number ' + (i + 1) + ' with a very long nickname'), institution: long('Lender ' + (i + 1) + ' with an unusually long name'), stress: (i % 5) + 1 };
  if (kind === 'card') base.f = { cardName: long('Custom card ' + i), balance: [410000 + i * 137000, 'known'], apr: [0.2199 + i * 0.001, 'known'], promoApr: i % 3 === 0 ? [0, 'none'] : [null, 'not-applicable'], promoEnd: i % 3 === 0 ? '2027-0' + ((i % 8) + 1) : [null, 'not-applicable'], minimum: [12000 + i * 1000, 'known', 'client', 'month'], creditLimit: 900000 + i * 100000, annualFee: [0, 'none'], creditsUsed: [null, 'none'], autopay: 'minimum' };
  if (kind === 'student') base.f = { balance: [3800000, 'rough'], rate: [0.079, 'known'], minimum: [41000, 'known', 'client', 'month'] };
  if (kind === 'auto') base.f = { balance: [5200000, 'known'], rate: [0.109, 'known'], payment: [112000, 'known', 'client', 'month'], monthsLeft: 60 };
  if (kind === 'personal') base.f = { balance: [1850000, 'will-send'], rate: [0, 'none'], payment: [25000, 'known', 'client', 'month'] };
  if (kind === 'mortgage') base.f = { balance: [148000000, 'verified'], rate: [0.0675, 'verified'], principalInterest: [961000, 'verified', 'client', 'month'], escrowTaxes: [210000, 'known', 'client', 'month'], escrowInsurance: [38000, 'known', 'client', 'month'], hoa: [0, 'none'], pmi: [0, 'none'] };
  extremeDebts.push(base);
}
export const extreme = {
  id: 'extreme', start: '2026-10-01T12:00:00.000Z',
  sun: { name: [long('Alexandria Montgomery-Rutherford III'), 'known'], birthDate: ['1968-11-30', 'known'], state: ['FL', 'known'], city: [long('Saint Augustine Beach by the sea')], workSituation: ['between-jobs', 'known'], dependents: [3, 'known'], filingStatus: ['hoh', 'known'], bigGoal: [long('Keep the house and the three kids in school')] },
  rows: [
    { id: 'x-inc', planet: 'income', type: 'w2', nickname: long('Former role, ended last month'), institution: long('A company with a forty character name here'), f: { grossPay: [0, 'none', 'client', 'paycheck'], takeHome: [0, 'none', 'client', 'paycheck'], payFrequency: 'biweekly', stability: 'at-risk', pretaxRetirement: [0, 'none'], rothRetirement: [0, 'none'], hsaPayroll: [0, 'none'], pretaxOther: [0, 'none'], bonus: [0, 'none'], equity: [0, 'none'], startDate: '2015-01', hoursPaid: [0, 'none'], hoursCommute: [0, 'none'], workCosts: [0, 'none'] } },
    { id: 'x-rent', planet: 'spending', type: 'line', nickname: long('Mortgage escrow shortfall and house costs'), institution: '', f: { category: 'accommodation', amount: [410000, 'rough', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: [null, 'not-applicable'] } },
    { id: 'x-food', planet: 'spending', type: 'line', nickname: long('Groceries for a family of four, organic'), institution: '', f: { category: 'food', amount: [{ low: 140000, high: 190000 }, 'rough', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: 'Debt number 1 with a very long nickname' } },
    { id: 'x-school', planet: 'spending', type: 'line', nickname: long('Private school tuition for three children'), institution: '', f: { category: 'other', amount: [4800000, 'verified', 'client', 'year'], needWant: 'need', mistake: 'unavoidable', fatFloor: false, primaryCard: [null, 'not-applicable'] } },
    { id: 'x-car', planet: 'spending', type: 'line', nickname: 'Fuel', institution: '', f: { category: 'transportation', amount: [52000, 'known', 'client', 'month'], needWant: 'need', mistake: 'unavoidable', fatFloor: true, primaryCard: [null, 'not-applicable'] } },
    { id: 'x-save', planet: 'spending', type: 'savings', nickname: 'Nothing landing', institution: '', f: { savingsLanding: [0, 'none', 'client', 'month'] } },
  ].concat(extremeDebts).concat([
    { id: 'x-ins', planet: 'safety', type: 'insurance', nickname: long('COBRA health coverage for the whole family'), institution: 'Florida Blue', f: { insuranceType: 'health', coverage: [null, 'unknown'], premium: [238000, 'known', 'client', 'month'], deductible: 600000 } },
    { id: 'x-ui', planet: 'safety', type: 'unemployment', nickname: 'If work stopped', institution: 'Florida DEO', f: { unemploymentWeekly: [27500, 'known', 'lookup-verify'] } },
    { id: 'x-cut', planet: 'safety', type: 'cut', nickname: 'Could cut', f: { cutAbility: [120000, 'rough', 'client', 'month'] } },
    { id: 'x-a1', planet: 'invest', type: 'account', nickname: long('Rollover IRA from three former employers'), institution: 'Vanguard', asOf: '2026-09', stress: 2, f: { accountType: 'tradIra', accountBalance: [142000000, 'verified'], contribAmount: [0, 'none'], allocStocks: 0.7, allocBonds: 0.3, allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 0.8, beneficiary: true } },
    { id: 'x-a2', planet: 'invest', type: 'account', nickname: long('Taxable brokerage, inherited, concentrated'), institution: 'Schwab', asOf: '2026-09', stress: 4, f: { accountType: 'taxable', accountBalance: [116000000, 'known'], contribAmount: [0, 'none'], allocStocks: 1, allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: [0, 'none'], usShare: 1, beneficiary: false } },
    { id: 'x-a3', planet: 'invest', type: 'account', nickname: 'Savings', institution: 'Ally', asOf: '2026-09', stress: 1, f: { accountType: 'hysa', accountBalance: [38000000, 'verified'], contribAmount: [0, 'none'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: true } },
    { id: 'x-a4', planet: 'invest', type: 'account', nickname: 'Checking', institution: 'Chase', asOf: '2026-09', stress: 5, f: { accountType: 'checking', accountBalance: [2400000, 'known'], contribAmount: [null, 'not-applicable'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: 1, allocOther: [0, 'none'], usShare: [null, 'not-applicable'], beneficiary: [null, 'not-applicable'] } },
    { id: 'x-a5', planet: 'invest', type: 'account', nickname: long('Home equity, the Saint Augustine house'), institution: '', asOf: '2026-09', stress: 3, f: { accountType: 'realEstate', accountBalance: [21600000, 'rough'], contribAmount: [null, 'not-applicable'], allocStocks: [0, 'none'], allocBonds: [0, 'none'], allocCash: [0, 'none'], allocOther: 1, usShare: [null, 'not-applicable'], beneficiary: [null, 'not-applicable'] } },
    { id: 'x-h1', planet: 'invest', type: 'holding', nickname: 'AGTHX', institution: 'Vanguard', lib: 'AGTHX', f: { accountRef: long('Rollover IRA from three former employers'), fundName: ['American Funds Growth Fund of America A', 'known', 'lookup-verify'], expenseRatio: [0.0061, 'known', 'lookup-verify'], pctOfAccount: 1 } },
    { id: 'x-goal', planet: 'life', type: 'goal', nickname: long('Three college educations, starting 2029'), f: { goalCost: [45000000, 'rough'], targetDate: '2029-08', priority: '1' } },
    { id: 'x-ret', planet: 'life', type: 'retirement', nickname: 'Retirement', f: { retirementAge: [62, 'rough'], gogo: [1, 'known', 'estimated'], slowgo: [0.85, 'known', 'estimated'], nogo: [0.75, 'known', 'estimated'] } },
  ])
};
specs.extreme = extreme;
