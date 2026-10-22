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
  matchFormula: 'employer match', vesting: 'vesting', planType: 'plan type'
};
const ASSUME = { inflation: 'Inflation', realReturn: 'Real return', withdrawalRate: 'Withdrawal rate', lifeExpectancy: 'Life expectancy', coastAge: 'Coast FI age' };
const HOUSE = { filingStatus: 'Filing status', state: 'State', county: 'County', nycResident: 'Lives in New York City' };
const words = (k) => FIELD[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase();
const dateWords = (iso) => (iso ? 'from ' + iso : 'now');

export function labelFor(spine, path) {
  const s = path.split('.');
  const item = (coll, id) => getAt(spine, coll + '.' + id);
  switch (s[0]) {
    case 'household': {
      if (HOUSE[s[1]]) return HOUSE[s[1]];
      if (s[1] === 'people') { const p = item('household.people', s[2]); return (p ? p.name : s[2]) + ': birth date'; }
      const e = item('household.' + s[1], s[2]);
      const what = s[1] === 'situation' ? 'Situation' : 'Health coverage';
      return (s[3] === 'planType' ? 'Health plan type' : what) + ' (' + dateWords(e && e.from) + ')';
    }
    case 'income': {
      const x = item('income', s[1]);
      const name = x ? x.label : s[1];
      if (s[2] === 'withholding') return name + ': ' + s[3] + ' tax withheld';
      return name + ': ' + words(s[2]);
    }
    case 'expenses': { const x = item('expenses', s[1]); return x ? x.label : s[1]; }
    case 'accounts': case 'debts': {
      const x = item(s[0], s[1]);
      const name = x ? valueOf(x.name) || s[1] : s[1];
      return name + ': ' + words(s[2]);
    }
    case 'goals': { const x = item('goals', s[1]); return 'Goal ' + (x ? x.label : s[1]) + ': ' + words(s[2]); }
    case 'assumptions': return ASSUME[s[1]] || words(s[1]);
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
  if (s[0] === 'household') return s[1] === 'situation' ? 'I' : s[1] === 'healthCoverage' ? 'E' : 'T';
  return 'G';
}

export const listWords = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
