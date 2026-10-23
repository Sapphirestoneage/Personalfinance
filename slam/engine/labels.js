// Plain words for a spine path, and the DAITE group it belongs to.
// Used by flags (to name a missing field) and by the Ledger.

import { getAt, valueOf } from './spine.js';

const FIELD = {
  balance: 'balance', apr: 'APR', promoApr: 'promo rate', promoEnds: 'promo ends', deferredInterest: 'deferred interest',
  limit: 'credit limit', minimum: 'minimum payment', dueDay: 'due day', statementCloseDay: 'statement closes', secured: 'secured',
  payoffDate: 'payoff date', federal: 'federal loan', plan: 'repayment plan', stress: 'stress (1 to 10)', reasonsToKeep: 'reasons to keep',
  name: 'name', institution: 'institution', owner: 'owner', taxTreatment: 'tax treatment', liquidity: 'liquidity',
  monthlyContribution: 'monthly contribution', linkedGoal: 'goal it funds', apy: 'APY', minBalance: 'minimum balance', monthlyFee: 'monthly fee',
  role: 'role', rate: 'rate', maturityDate: 'maturity date', basis: 'contribution basis', contributions: 'contributions by year',
  firstRothYear: 'first Roth year', conversions: 'conversions', costBasis: 'cost basis', appreciationRate: 'yearly change in value',
  amount: 'amount', likelihood: 'how likely', target: 'target', fiNumber: 'FI number', annualSpending: 'yearly spending',
  estimatedPaidFederal: 'estimated payments made (federal)', estimatedPaidState: 'estimated payments made (state)',
  capitalGainsLong: 'long-term gains', qualifiedDividends: 'qualified dividends', otherIncome: 'other income',
  matchFormula: 'employer match', vesting: 'vesting', planType: 'plan type',
  business: 'business card', reportsToPersonalCredit: 'reports to personal credit',
  setAside: 'set aside', enrolled: 'enrolled', businessExpenses: 'business expenses',
  paidFrom: 'paid from', payDay: 'day paid', subscription: 'subscription', renews: 'next charge', reviewed: 'last reviewed', depositTo: 'paid into', fundedFrom: 'paid in from', payPolicy: 'pays each month',
  need: 'a need (not a want)', covered: 'paid by someone else', everydayCard: 'everyday card (paid in full, held flat)', payLast: 'paid last',
  reportDay: 'reports to the bureaus on day', annualFee: 'annual fee', annualValue: 'what it gives back a year (rewards and credits)', rewardsRate: 'rewards on everyday spending', bonusSpend: 'signup bonus: spend required', bonusBy: 'signup bonus: by', bonusSpent: 'signup bonus: spent so far', bonusValue: 'signup bonus: worth', pslf: 'on track for Public Service Loan Forgiveness',
  extra: 'extra at the debt a month', day: 'day the extra lands', strategy: 'aimed at', stopAtHi: 'stop once nothing is high-interest', hiRate: 'high-interest rate line', rollFreed: 'a finished plan rolls into the extra',
  coveredBy: 'covered by', shared: 'shared', sharedWith: 'people sharing it', yourShare: 'your share', whoPays: 'who pays the bill'
};
const ASSUME = { inflation: 'Inflation', realReturn: 'Real return', withdrawalRate: 'Withdrawal rate', lifeExpectancy: 'Life expectancy', coastAge: 'Coast FI age' };
const HOUSE = { filingStatus: 'Filing status', state: 'State', county: 'County', nycResident: 'Lives in New York City', cardPayPolicy: 'How every card is paid', householdSize: 'People in the household' };
const words = (k) => FIELD[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase();
// On a credit card the three rate fields read as one interest rate (S-161).
const CARD_FIELD = { apr: 'interest rate', promoApr: 'intro rate', promoEnds: 'intro ends' };
// A duplicate starts with no name until one is typed (S-190).
export const UNNAMED = 'No name yet';
const dateWords = (iso) => (iso ? 'from ' + iso : 'now');

export function labelFor(spine, path) {
  const s = path.split('.');
  const item = (coll, id) => getAt(spine, coll + '.' + id);
  switch (s[0]) {
    case 'household': {
      if (HOUSE[s[1]]) return HOUSE[s[1]];
      if (s[1] === 'expenseDefaults') return ({ food: 'Food', accommodation: 'Housing', transportation: 'Transportation', other: 'Everything else' }[s[2]] || s[2]) + ' bills by default: ' + words(s[3]);
      if (s[1] === 'people') { const p = item('household.people', s[2]); return (p ? p.name : s[2]) + ': birth date'; }
      const e = item('household.' + s[1], s[2]);
      const what = s[1] === 'situation' ? 'Situation' : 'Health coverage';
      const sub = { planType: 'Health plan type', enrolled: 'Enrolled in the new health plan', setAside: 'Set aside for the new health plan' }[s[3]];
      return (sub || what) + ' (' + dateWords(e && e.from) + ')';
    }
    case 'income': {
      const x = item('income', s[1]);
      const name = x ? x.label || UNNAMED : s[1];
      if (s[2] === 'withholding') return name + ': ' + s[3] + ' tax withheld';
      return name + ': ' + words(s[2]);
    }
    case 'expenses': { const x = item('expenses', s[1]); const name = x ? x.label || UNNAMED : s[1]; return s[2] === 'amount' ? name : name + ': ' + words(s[2]); }
    case 'accounts': case 'debts': {
      const x = item(s[0], s[1]);
      const name = x ? valueOf(x.name) || s[1] : s[1];
      return name + ': ' + ((x && x.type === 'credit_card' && CARD_FIELD[s[2]]) || words(s[2]));
    }
    case 'goals': { const x = item('goals', s[1]); return 'Goal ' + (x ? x.label || UNNAMED : s[1]) + ': ' + words(s[2]); }
    case 'assumptions': return ASSUME[s[1]] || words(s[1]);
    case 'debtPlan': return 'Debt plan: ' + words(s[1]);
    case 'taxYears': return s[1] + ' ' + words(s[2]);
    default: return path;
  }
}

// DAITE: Debt, Assets, Income, Taxes, Expenses, then goals and assumptions.
export const GROUPS = [
  { id: 'D', label: 'Debt' }, { id: 'A', label: 'Assets' }, { id: 'I', label: 'Income' }, { id: 'T', label: 'Taxes' },
  { id: 'E', label: 'Expenses' }, { id: 'G', label: 'Goals and assumptions' }
];

export function groupFor(path) {
  const s = path.split('.');
  if (s[0] === 'debts') return 'D';
  if (s[0] === 'accounts') return 'A';
  if (s[0] === 'income') return s[2] === 'withholding' ? 'T' : 'I';
  if (s[0] === 'taxYears') return 'T';
  if (s[0] === 'expenses') return 'E';
  if (s[0] === 'household') return s[1] === 'situation' ? 'I' : s[1] === 'healthCoverage' ? 'E' : s[1] === 'cardPayPolicy' ? 'D' : 'T';
  return 'G';
}

export const listWords = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
