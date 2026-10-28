// Plain words for a spine path, and the DATING group it belongs to.
// Used by flags (to name a missing field) and by the Ledger.

import { getAt, valueOf } from './spine.js';
import { questionById } from './profile.js';
import { SECTION_WORDS } from './schema.js';

const FIELD = {
  // Type depth (S-266), from data/type-features.json.
  contributionPct: 'or: this share of your pay', perPaycheck: 'or: this much each paycheck', rothShare: 'share that goes in as Roth', matchTiers: 'the match, tier by tier', trueUp: 'a year-end true-up?', employerNonElective: 'employer puts in this share of pay', profitSharing: 'profit sharing a year', yearsOfService: 'years you have worked there', employerBalance: 'of the balance, money the employer put in', contributedYtd: 'put in so far this year', autoIncrease: 'it rises by this much of pay a year', loanDebt: 'the loan (in Debt)', loanBalance: 'loan owed', allowsAfterTax: 'takes after-tax money', allowsInPlanRoth: 'converts it to Roth in the plan', expenseRatio: 'fund fees a year (expense ratio)', stockShare: 'share in stocks (the rest in bonds and cash)', beneficiaryNamed: 'beneficiary named', separatedFromEmployer: 'left that job', separationYear: 'year you left', nondeductibleBasis: 'put in without a deduction (Form 8606 basis)', proRataExposure: 'pre-tax IRA money that makes part of a conversion taxed (pro-rata)', coveredByWorkplacePlan: 'covered at work', investedPortion: 'of it, invested', unreimbursedReceipts: 'receipts saved, not yet paid back', fdic: 'insured', signupBonus: 'bonus', purchaseDate: 'bought on', earlyWithdrawalPenalty: 'the penalty', longTermShare: 'share held more than a year', dividendsReinvested: 'reinvested', employerStockShare: 'share in employer stock', beneficiary: 'for whom', childBirthYear: 'their birth year', stateTaxDeduction: 'state tax break', stateDeduction: 'deduction a year', tspFunds: 'funds', employerType: 'employer', soloEmployerPart: 'as employer (profit sharing) a year', inheritedDate: 'date inherited', beneficiaryType: "you are the owner's", mustEmptyBy: 'must be emptied by (10 years after you inherit it)', sepEmployerPct: 'employer puts in this share of pay', simpleStartDate: 'first money in', planYearEnd: 'plan year ends', rolloverRule: 'money left at the end', graceAmount: 'amount that carries over or has a grace period', esppDiscount: 'discount', offeringPeriodEnd: 'offering period ends', rsuNextVest: 'next vest', rsuVestValue: 'worth about, each vest', rsuVestSchedule: 'vests every', openDate: 'opened on', rothRolloverUsed: 'already moved to a Roth', propertyTaxYear: 'property tax a year', insuranceYear: 'insurance a year', linkedDebt: 'the mortgage (in Debt)', incomeProduced: 'rent a month', rentalExpenses: 'running costs a month (repairs, management)', vacancyRate: 'empty part of the year', pensionMonthly: 'pays a month at the start', pensionStartAge: 'starting at age', cola: 'rises with inflation (COLA)', federalLoanType: 'loan kind', servicer: 'servicer', pslfPayments: 'qualifying payments made (of 120)', forgivenessDate: 'expected forgiveness', rateType: 'rate', termYears: 'term in years', startDate: 'started on', pmiMonthly: 'pMI a month', pmiEnds: 'pMI ends (about 78% of the original value owed)', escrowMonthly: 'escrow a month', extraPrincipal: 'extra a month', securedBy: 'the home (in Assets)', drawEnds: 'draw period ends', monthsLeft: 'payments left', fromAccount: 'the plan (in Assets)', pretaxDeductions: 'taken out before tax a month', bonusAmount: 'bonus a year, before tax', bonusMonth: 'paid in month (1 to 12)', raiseDate: 'raise on', raisePct: 'about this much', quarterlyEstimates: 'paying quarterly', estimatesPaid: 'paid so far this year', cashShare: 'share in cash', claimAge: 'claiming at age', openEnrollmentMonth: 'open enrollment month', titling: 'titled as', employerName: 'employer', coachNote: 'coach note (never printed)', ssAt62: 'social Security a month at 62', ssAtFra: 'social Security a month at full retirement age', ssAt70: 'social Security a month at 70', ssAsOf: 'social Security statement date',
  balance: 'balance', apr: 'APR', promoApr: 'promo rate', promoEnds: 'promo ends', deferredInterest: 'deferred interest',
  limit: 'credit limit', minimum: 'minimum payment', dueDay: 'due day', statementCloseDay: 'statement closes', secured: 'secured',
  payoffDate: 'payoff date', federal: 'federal loan', plan: 'repayment plan', stress: 'stress (1 to 10)', reasonsToKeep: 'reasons to keep',
  name: 'name', institution: 'institution', owner: 'owner', taxTreatment: 'tax treatment', liquidity: 'liquidity',
  monthlyContribution: 'monthly contribution', linkedGoal: 'goal it funds', apy: 'APY', minBalance: 'minimum balance', monthlyFee: 'monthly fee',
  role: 'what this money is for', rate: 'rate', maturityDate: 'maturity date', basis: 'contribution basis', contributions: 'contributions by year',
  firstRothYear: 'first Roth year', conversions: 'conversions', costBasis: 'cost basis', appreciationRate: 'yearly change in value',
  amount: 'amount', likelihood: 'how likely', target: 'target', fiNumber: 'FI number', annualSpending: 'yearly spending', dreamSpending: 'dream spending a year', partTimeIncome: 'part-time income a year',
  estimatedPaidFederal: 'estimated payments made (federal)', estimatedPaidState: 'estimated payments made (state)',
  capitalGainsLong: 'long-term gains', qualifiedDividends: 'qualified dividends', otherIncome: 'other income',
  matchFormula: 'employer match, as written', vesting: 'vesting', vestingType: 'vesting schedule', vestingYears: 'years until fully vested', planType: 'plan type',
  business: 'business card', reportsToPersonalCredit: 'reports to personal credit',
  setAside: 'set aside', enrolled: 'enrolled', businessExpenses: 'business expenses',
  paidFrom: 'paid from', paysDebt: 'the debt it pays', payDay: 'day paid', payDay2: 'second day paid', personId: 'whose pay', subscription: 'subscription', renews: 'next charge', reviewed: 'last reviewed', usesPerMonth: 'uses a month', cancelCandidate: 'cancel candidate', depositTo: 'paid into', fundedFrom: 'paid in from', payPolicy: 'pays each month',
  need: 'need or want', covered: 'paid by someone else', everydayCard: 'everyday card (paid in full, held flat)', payLast: 'paid last',
  trialEnds: 'free trial ends', workHoursPerWeek: 'hours worked a week', workRelated: 'a cost of working', deductible: 'biggest insurance deductible', commuteHoursPerWeek: 'commute hours a week',
  matchRate: 'employer match (share of what you put in)', matchCap: 'match up to (share of gross)',
  priority: 'priority (1 first)', linkedAccount: 'the account it lives in', sinkingFund: 'a sinking fund', monthly: 'set aside a month', spendOn: 'spent on', repeatYearly: 'repeats every year',
  reportDay: 'reports to the bureaus on day', annualFee: 'annual fee', annualValue: 'what it gives back a year (rewards and credits)', rewardsRate: 'rewards on everyday spending', bonusSpend: 'signup bonus: spend required', bonusBy: 'signup bonus: by', bonusSpent: 'signup bonus: spent so far', bonusValue: 'signup bonus: worth', pslf: 'on track for Public Service Loan Forgiveness',
  extra: 'extra at the debt a month', day: 'day the extra lands', strategy: 'aimed at', stopAtHi: 'stop once nothing is high-interest', hiRate: 'high-interest rate line', rollFreed: 'a finished plan rolls into the extra',
  coveredBy: 'covered by', shared: 'shared', sharedWith: 'people sharing it', yourShare: 'your share', whoPays: 'who pays the bill',
  from: 'from', purpose: 'what it is for', decreeYear: 'year of the divorce decree', allowanceMode: 'a gift, or pay for my time', liquid: 'counted as liquid', holdings: 'holdings', payBasis: 'paid by', salary: 'yearly salary', hourlyRate: 'hourly rate', hoursPerWeek: 'hours a week', yearTotal: 'last 12 months in all',
  coverageLevel: 'coverage (self or family)', throughPayroll: 'through payroll', paidThrough: 'paid through (the job)', monthsEligible: 'months eligible this year', employerSeed: 'employer money in a year', planEligible: 'HSA-eligible plan'
};
const ASSUME = { inflation: 'Inflation', realReturn: 'Real return', withdrawalRate: 'Withdrawal rate', lifeExpectancy: 'Life expectancy', coastAge: 'Coast FI age' };
const HOUSE = { filingStatus: 'Filing status', state: 'State', county: 'County', nycResident: 'Lives in New York City', yonkersResident: 'Lives in Yonkers', cardPayPolicy: 'How every card is paid', householdSize: 'People in the household', workHoursPerWeek: 'Hours worked a week', deductible: 'Biggest insurance deductible', commuteHoursPerWeek: 'Commute hours a week', lastRefund: 'Last tax refund (owed is negative)', goalOrder: 'How goals are funded', gutSpending: 'Your guess: spending a month' };
const words = (k) => FIELD[k] || String(k ?? '').replace(/([A-Z])/g, ' $1').toLowerCase();
// On a credit card the three rate fields read as one interest rate (S-161).
const CARD_FIELD = { apr: 'interest rate', promoApr: 'intro rate', promoEnds: 'intro ends' };
// A duplicate starts with no name until one is typed (S-190).
export const UNNAMED = 'No name yet';
const dateWords = (iso) => (iso ? 'from ' + iso : 'now');

// How many segments a path needs to name one field, by its first segment
// ("income.salary.amount": the collection, the item id, the field).
const NEEDS = { profile: 2, household: 2, income: 3, expenses: 3, accounts: 3, debts: 3, goals: 3, assumptions: 2, debtPlan: 2, taxYears: 3, lent: 3 };
// A path labelFor can name: a known root with every segment it needs, or a
// rule reference ("rule:PSLF_PAYMENTS"). Anything else is a bug in the engine
// that emitted it; the self-audit fails on it (S-210).
export function namedPath(path) {
  if (typeof path !== 'string' || !path) return false;
  if (/^rule:[A-Z0-9_]+$/.test(path)) return true;
  const s = path.split('.');
  // A few fields sit one level deeper: a section default, a dated household entry, a stream's withholding.
  const need = s[0] === 'household' ? (s[1] === 'expenseDefaults' ? 4 : ['people', 'situation', 'healthCoverage'].includes(s[1]) ? 3 : 2) : s[0] === 'income' && s[2] === 'withholding' ? 4 : NEEDS[s[0]];
  return !!need && s.length >= need && s.every((x) => x !== '' && x !== 'undefined' && x !== 'null');
}
// What an unnamed path reads as: never a crash, and plainly not a field name.
export const unnamedLabel = (path) => 'An input with no name yet (' + (typeof path === 'string' && path ? path : 'no path') + ')';

export function labelFor(spine, path) {
  if (!namedPath(path)) return unnamedLabel(path);
  if (path.startsWith('rule:')) return 'Rule ' + path.slice(5);
  const s = path.split('.');
  const item = (coll, id) => getAt(spine, coll + '.' + id);
  switch (s[0]) {
    case 'household': {
      if (HOUSE[s[1]]) return HOUSE[s[1]];
      if (s[1] === 'expenseDefaults') return (SECTION_WORDS[s[2]] || s[2]) + ' bills by default: ' + words(s[3]);
      if (s[1] === 'people') { const p = item('household.people', s[2]); return (p ? p.name : s[2]) + ': ' + (s[3] && s[3] !== 'birthDate' && FIELD[s[3]] ? FIELD[s[3]].replace(/^social/, 'Social') : 'birth date'); }
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
    case 'profile': { const q = questionById(s[1]); return 'Profile: ' + (q ? q.label : words(s[1])); }
    case 'debtPlan': return 'Debt plan: ' + words(s[1]);
    case 'taxYears': return s[1] + ' ' + words(s[2]);
    // Money lent (shared bills brief): "Jordan: amount lent", "Jordan: when they said they'd pay".
    case 'lent': { const x = item('lent', s[1]); const name = x ? x.person : s[1]; return name + ': ' + ({ amount: 'amount lent', due: 'when they said they\'d pay' }[s[2]] || words(s[2])); }
    default: return path;
  }
}

// DATING (S-231): Debt, Assets, Taxes, Income, Needs (every expense; the id stays E, as the stored key stays
// expenses), then Goals with the assumptions.
export const GROUPS = [
  { id: 'D', label: 'Debt' }, { id: 'A', label: 'Assets' }, { id: 'T', label: 'Taxes' }, { id: 'I', label: 'Income' },
  { id: 'E', label: 'Needs' }, { id: 'G', label: 'Goals' }
];

export function groupFor(path) {
  if (typeof path !== 'string') return 'G';
  const s = path.split('.');
  if (s[0] === 'debts') return 'D';
  if (s[0] === 'accounts' || s[0] === 'lent') return 'A';
  if (s[0] === 'income') return s[2] === 'withholding' ? 'T' : 'I';
  if (s[0] === 'taxYears') return 'T';
  if (s[0] === 'expenses') return 'E';
  if (s[0] === 'profile') return PROFILE_GROUP[(questionById(s[1]) || {}).area] || 'G';
  if (s[0] === 'household') return s[1] === 'situation' ? 'I' : s[1] === 'healthCoverage' || s[1] === 'gutSpending' ? 'E' : s[1] === 'cardPayPolicy' ? 'D' : 'T';
  return 'G';
}

// A profile answer's DATING letter, by its area.
const PROFILE_GROUP = { home: 'E', around: 'E', work: 'I', people: 'I', debt: 'D', accounts: 'A', health: 'E', style: 'E', you: 'T', goals: 'G', k401: 'A', ira: 'A', hsa: 'A', brokerage: 'A', cards: 'D', student: 'D', car: 'D', mortgage: 'D', debtAll: 'D', goalsAll: 'G', statements: 'A' };
export const listWords = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
