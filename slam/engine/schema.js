// The household spine schema (slam-spine/1) and its validator.
// Source: Account_Shells.xlsx, tabs Shells, Variables and Account Rules.
// CONTRACTS.md describes the same shape in words.

import { KINDS, isFact, isDay } from './spine.js';
import { questionById, cleanAnswer, STATUS } from './profile.js';

export const SCHEMA_ID = 'slam-spine/1';

export const FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh'];
export const SITUATIONS = ['employed', 'self_employed', 'between_jobs', 'student', 'retired', 'mixed'];
export const COVERAGES = ['employer', 'parent_plan', 'own_plan', 'marketplace', 'medicaid', 'medicare', 'none', 'other'];
// HSA-eligible plan types (HDHP_MIN_S notes: bronze and catastrophic count from 2026).
// Two Profile answers live on the household's "now" rows, never kept twice (owner's ask, 2026-10-27: "if I'm
// unemployed how do I have employer health insurance"): the answer word on the left, the stored value on the right.
export const ANSWER_ON_HOUSEHOLD = {
  work: { at: 'situation', map: { w2: 'employed', self: 'self_employed', both: 'mixed', between: 'between_jobs', student: 'student', retired: 'retired' } },
  health: { at: 'healthCoverage', map: { work: 'employer', parent: 'parent_plan', own: 'own_plan', marketplace: 'marketplace', medicaid: 'medicaid', medicare: 'medicare', none: 'none', other: 'other' } }
};
export const PLAN_TYPES = ['hdhp', 'bronze', 'catastrophic', 'other'];
export const HSA_ELIGIBLE_PLANS = ['hdhp', 'bronze', 'catastrophic'];
// How a card is paid each month (S-189): the new charges plus the minimum on
// the balance carried, or the full statement balance.
export const PAY_POLICIES = ['minimum', 'statement'];
// Federal student loan repayment plans (S-181): suggestions, not a closed list,
// so a plan typed under "Other" is kept as typed. Plan names change with the
// law (RAP opened July 2026; SAVE, PAYE and ICR are closing): check them yearly.
export const LOAN_PLANS = ['standard', 'graduated', 'extended', 'ibr', 'rap', 'paye', 'icr', 'save', 'paused', 'not_sure'];
export const LOAN_PLAN_WORDS = {
  standard: 'Standard (same payment, 10 years)', graduated: 'Graduated (starts low, goes up)', extended: 'Extended (up to 25 years)',
  ibr: 'Income-Based Repayment (IBR)', rap: 'Repayment Assistance Plan (RAP)', paye: 'Pay As You Earn (PAYE)',
  icr: 'Income-Contingent Repayment (ICR)', save: 'SAVE (closing)', paused: 'Paused (deferment or forbearance)', not_sure: 'Not sure'
};

export const INCOME_TYPES = ['w2', '1099', 'unemployment', 'tips', 'rental', 'pension', 'ss', 'maybeMoney', 'other', 'side', 'person'];
// Money from a person (Batch 3): who it is from and what it is for. A loan is never income: the Session makes it a debt.
export const PERSON_PURPOSES = ['gift', 'allowance', 'childSupport', 'alimony'];
export const PERSON_PURPOSE_WORDS = { gift: 'A gift or support', allowance: 'An allowance', childSupport: 'Child support', alimony: 'Alimony', loan: 'A loan' };
export const ALLOWANCE_MODES = ['gift', 'time'];
// How a paycheck is figured (Batch 3, the questions): a yearly salary, an hourly rate times hours a week, or for 1099
// pay that comes in lumps, the last 12 months' total. The amount a payday is figured from these (edits.js setPay).
export const PAY_BASES = ['salary', 'hourly', 'lumpy', 'steady'];
// Pay for your own work with no paycheck: 1099 pay, side money that comes with no 1099, and an allowance that is pay for
// your time. Each owes self-employment tax and has nothing withheld.
export const isSelfEmployment = (s) => !!s && (s.type === '1099' || s.type === 'side' || (s.type === 'person' && s.purpose && s.purpose.value === 'allowance' && s.allowanceMode && s.allowanceMode.value === 'time'));
// How money from a person is taxed: 'none', 'ordinary' (alimony under a decree from before 2019), 'se' (an allowance
// that is pay for your time), or null when what decides it is not given yet (the purpose, or an alimony decree's year).
export function personTax(s) {
  const purpose = s.purpose ? s.purpose.value : null;
  if (purpose === null) return null;
  if (purpose === 'alimony') { const y = s.decreeYear ? s.decreeYear.value : null; return y === null ? null : y >= 2019 ? 'none' : 'ordinary'; }
  if (purpose === 'allowance') { const m = s.allowanceMode ? s.allowanceMode.value : null; return m === null ? null : m === 'time' ? 'se' : 'none'; }
  return 'none';
}
// total: the amount is spread evenly from start to end (a known total for a window).
// once: paid on the start date.
export const CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly', 'total', 'once'];
export const PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, yearly: 1 };
export const FAT = ['food', 'accommodation', 'transportation'];
export const STARTER_BASES = ['fixed', 'deductible', 'housing', 'needs'];
// The four spending sections in words, one map for every screen (Batch 2: "Everything else" reads Miscellaneous).
export const SECTION_WORDS = { food: 'Food', accommodation: 'Housing', transportation: 'Transportation', other: 'Miscellaneous' };
export const DEBT_PLAN_FIELDS = ['extra', 'day', 'strategy', 'stopAtHi', 'hiRate', 'rollFreed'];
export const TAX_YEAR_FIELDS = ['estimatedPaidFederal', 'estimatedPaidState', 'capitalGainsLong', 'qualifiedDividends', 'otherIncome', 'setAside'];

// ---------------------------------------------------------------- families
// Field types: money, rate, date, int, text, bool, choice:<a|b>, list.
// Every field is stored as a Fact. Base fields apply to every family.
export const FAMILIES = {
  base: {
    label: 'Base', fields: {
      name: 'text', institution: 'text', owner: 'choice:me|partner|joint|child', balance: 'money',
      taxTreatment: 'choice:pretax|roth|taxable|tripleTaxFree|na', liquidity: 'choice:instant|days|penalty|locked|na',
      monthlyContribution: 'money', linkedGoal: 'text', fundedFrom: 'link',
      // Counted in liquid net worth (Batch 3): set only to override the default by type (liquidDefault in networth.js).
      liquid: 'bool'
    }
  },
  cash: { label: 'Cash', fields: { apy: 'rate', minBalance: 'money', monthlyFee: 'money', role: 'choice:spending|emergency|sinking|holding' } },
  fixedTerm: { label: 'Fixed-term', fields: { rate: 'rate', maturityDate: 'date', earlyWithdrawalPenalty: 'text' } },
  employerRetirement: {
    label: 'Employer retirement', fields: {
      rothShare: 'rate', matchFormula: 'text', matchRate: 'rate', matchCap: 'rate', vesting: 'text',
      // The vesting schedule of the employer's money (S-264): yours now, all at once after N years, or a share each year to N.
      vestingType: 'choice:immediate|cliff|graded', vestingYears: 'int', annualLimit: 'money', catchUpEligible: 'bool', loanBalance: 'money',
      priorYearFicaWages: 'money', allowsAfterTax: 'bool', allowsLoans: 'bool', employerType: 'choice:private|nonprofit|government|federal|self',
      // What went in for each tax year (S-211), as on an IRA: [{ year, amount, kind? }]; rollovers and conversions never count.
      contributions: 'list',
      // The job a plan from pay is paid through (S-227, answer 60): one of the owner's W-2 lines; blank, the sponsoring job.
      paidThrough: 'link'
    }
  },
  ira: {
    label: 'IRA', fields: {
      annualLimit: 'money', incomeLimitApplies: 'bool', basis: 'money', contributions: 'list', firstRothYear: 'int', conversions: 'list',
      proRataExposure: 'money', nondeductibleBasis: 'money', coveredByWorkplacePlan: 'bool', rmdApplies: 'bool'
    }
  },
  hsaFsa: {
    label: 'HSA / FSA', fields: {
      coverageLevel: 'choice:self|family', annualLimit: 'money', investedPortion: 'money', unreimbursedReceipts: 'money',
      rolloverRule: 'choice:rolls|forfeit', planEligible: 'choice:hdhp|bronze|catastrophic|no', monthsEligible: 'int', employerSeed: 'money', contributions: 'list',
      // An HSA's monthly amount comes out of the paycheck only when this is on (S-227, answer 47); off, from take-home.
      throughPayroll: 'bool'
    }
  },
  education: { label: 'Education / kids', fields: { beneficiary: 'text', stateTaxDeduction: 'bool', annualLimit: 'money', ageOfControl: 'int', stateDeduction: 'money', openDate: 'date', childBirthYear: 'int', contributions: 'list' } },
  // holdings (Batch 3): optional rows [{ ticker, share, expenseRatio, managedBy, advisoryFee }]; share and the two fees are rates.
  taxable: { label: 'Taxable investing', fields: { costBasis: 'money', contributions: 'list', unrealizedGain: 'money', expectedReturn: 'rate', employerStockShare: 'rate', holdings: 'list' } },
  debt: {
    label: 'Debt', fields: {
      apr: 'rate', promoApr: 'rate', promoEnds: 'date', deferredInterest: 'bool', limit: 'money', minimum: 'money', dueDay: 'int',
      statementCloseDay: 'int', secured: 'bool', payoffDate: 'date', federal: 'bool', plan: 'text', stress: 'int', reasonsToKeep: 'list',
      business: 'bool', reportsToPersonalCredit: 'bool', paidFrom: 'link', payPolicy: 'choice:minimum|statement',
      // The everyday (float) card is paid in full and held flat; a debt paid last waits for the others (S-203).
      everydayCard: 'bool', payLast: 'bool',
      // The Debt tab (S-205): the day the card reports to the bureaus, the annual fee and what the card gives back a year,
      // the rewards rate on everyday spending, a signup bonus (spend required, by when, spent so far, what it is worth),
      // and whether a federal loan is on track for Public Service Loan Forgiveness.
      reportDay: 'int', annualFee: 'money', annualValue: 'money', rewardsRate: 'rate',
      bonusSpend: 'money', bonusBy: 'date', bonusSpent: 'money', bonusValue: 'money', pslf: 'bool'
    }
  },
  otherAssets: { label: 'Other assets', fields: { appreciationRate: 'rate', linkedDebt: 'text', incomeProduced: 'money' } }
};
// Type depth (S-266): the fields data/type-features.json reveals, by family, on top of the ones above. All optional.
// matchTiers: [{ rate, upTo }] (rate: the share of what you put in that is matched; upTo: up to this share of pay,
// counted from where the tier before it stopped), in order; it replaces matchRate and matchCap when present.
const DEPTH = {
  employerRetirement: { contributionPct: 'rate', perPaycheck: 'money', matchTiers: 'tiers', trueUp: 'bool', employerNonElective: 'rate', profitSharing: 'money', yearsOfService: 'int', employerBalance: 'money', contributedYtd: 'money', autoIncrease: 'rate', loanDebt: 'link', allowsInPlanRoth: 'bool', expenseRatio: 'rate', stockShare: 'rate', beneficiaryNamed: 'bool', separatedFromEmployer: 'bool', separationYear: 'int', tspFunds: 'text', soloEmployerPart: 'money' },
  ira: { expenseRatio: 'rate', stockShare: 'rate', beneficiaryNamed: 'bool', inheritedDate: 'date', beneficiaryType: 'choice:spouse|eligible|designated', mustEmptyBy: 'date', sepEmployerPct: 'rate', simpleStartDate: 'date' },
  hsaFsa: { planYearEnd: 'date', graceAmount: 'money' },
  cash: { fdic: 'bool', signupBonus: 'money', bonusBy: 'date' },
  fixedTerm: { purchaseDate: 'date' },
  taxable: { longTermShare: 'rate', expenseRatio: 'rate', stockShare: 'rate', dividendsReinvested: 'bool', esppDiscount: 'rate', offeringPeriodEnd: 'date', rsuNextVest: 'date', rsuVestValue: 'money', rsuVestSchedule: 'choice:monthly|quarterly|yearly' },
  education: { rothRolloverUsed: 'money' },
  otherAssets: { propertyTaxYear: 'money', insuranceYear: 'money', rentalExpenses: 'money', vacancyRate: 'rate', pensionMonthly: 'money', pensionStartAge: 'int', cola: 'bool' },
  debt: { federalLoanType: 'choice:direct|ffel|perkins|parentPlus', servicer: 'text', pslfPayments: 'int', forgivenessDate: 'date', rateType: 'choice:fixed|arm', termYears: 'int', startDate: 'date', pmiMonthly: 'money', pmiEnds: 'date', escrowMonthly: 'money', extraPrincipal: 'money', securedBy: 'link', drawEnds: 'date', monthsLeft: 'int', fromAccount: 'link' }
};
for (const [f, x] of Object.entries(DEPTH)) Object.assign(FAMILIES[f].fields, x);
// Every account (S-267): a beneficiary named, and how it is titled. Every item: a coach-only note, never printed.
// employerName keys the employer plan memory (ui/employer-plans.js). Compatibility: all optional; older files have none.
export const TITLINGS = ['individual', 'joint', 'tod', 'trust'];
for (const f of ['employerRetirement', 'ira', 'hsaFsa', 'cash', 'fixedTerm', 'taxable', 'education', 'otherAssets']) Object.assign(FAMILIES[f].fields, { beneficiaryNamed: 'bool', titling: 'choice:' + TITLINGS.join('|') });
FAMILIES.base.fields.coachNote = 'text';
FAMILIES.employerRetirement.fields.employerName = 'text';
// A Social Security estimate per person (S-267), from their SSA statement: a month at 62, at full retirement age and at
// 70, and the statement's date. Recorded only; the FI math does not count it yet.
export const SS_FIELDS = { ssAt62: 'money', ssAtFra: 'money', ssAt70: 'money', ssAsOf: 'date' };
// An income line's optional depth fields (S-266).
export const INCOME_DEPTH = { pretaxDeductions: 'money', bonusAmount: 'money', bonusMonth: 'int', raiseDate: 'date', raisePct: 'rate', quarterlyEstimates: 'bool', estimatesPaid: 'money', cashShare: 'rate', cola: 'bool', claimAge: 'int', openEnrollmentMonth: 'int', coachNote: 'text' };
// A feature's tick (S-266): ticks: { featureId: 'yes' | 'no' | 'notSure' } on an account, debt or income line.
export const TICKS = ['yes', 'no', 'notSure'];

// ---------------------------------------------------------------- presets
// Each account type is a preset of its family (Account Rules tab). limitRule
// and catchUpRule name rules in data/rules-<year>.json.
const P = (family, label, taxTreatment, liquidity, limitRule = null, catchUpRule = null) => ({ family, label, taxTreatment, liquidity, limitRule, catchUpRule });
export const PRESETS = {
  checking: P('cash', 'Checking', 'taxable', 'instant'),
  savings: P('cash', 'Savings', 'taxable', 'instant'),
  hysa: P('cash', 'High-yield savings', 'taxable', 'instant'),
  money_market: P('cash', 'Money market / cash management', 'taxable', 'days'),
  cd: P('fixedTerm', 'CD', 'taxable', 'penalty'),
  treasury: P('fixedTerm', 'Treasury bills / notes', 'taxable', 'days'),
  i_bond: P('fixedTerm', 'I bonds', 'taxable', 'locked'),
  k401: P('employerRetirement', '401(k) traditional', 'pretax', 'penalty', 'K401_DEF', 'K401_CU50'),
  roth_k401: P('employerRetirement', 'Roth 401(k)', 'roth', 'penalty', 'K401_DEF', 'K401_CU50'),
  k403b: P('employerRetirement', '403(b)', 'pretax', 'penalty', 'K401_DEF', 'K401_CU50'),
  k457b: P('employerRetirement', '457(b) governmental', 'pretax', 'days', 'K401_DEF', 'K401_CU50'),
  tsp: P('employerRetirement', 'TSP', 'pretax', 'penalty', 'K401_DEF', 'K401_CU50'),
  solo_k401: P('employerRetirement', 'Solo 401(k)', 'pretax', 'penalty', 'K401_DEF', 'K401_CU50'),
  after_tax_k401: P('employerRetirement', 'After-tax 401(k) (mega backdoor)', 'roth', 'penalty', 'ADD_415C'),
  traditional_ira: P('ira', 'Traditional IRA', 'pretax', 'penalty', 'IRA_LIMIT', 'IRA_CU50'),
  roth_ira: P('ira', 'Roth IRA', 'roth', 'penalty', 'IRA_LIMIT', 'IRA_CU50'),
  rollover_ira: P('ira', 'Rollover IRA', 'pretax', 'penalty'),
  inherited_ira: P('ira', 'Inherited IRA', 'pretax', 'days'),
  spousal_ira: P('ira', 'Spousal IRA', 'pretax', 'penalty', 'IRA_LIMIT', 'IRA_CU50'),
  sep_ira: P('ira', 'SEP IRA', 'pretax', 'penalty', 'SEP_MAX'),
  simple_ira: P('ira', 'SIMPLE IRA', 'pretax', 'penalty', 'SIMPLE_DEF', 'SIMPLE_CU50'),
  hsa: P('hsaFsa', 'HSA', 'tripleTaxFree', 'days', 'HSA_SELF', 'HSA_CU55'),
  health_fsa: P('hsaFsa', 'Health FSA', 'pretax', 'instant', 'FSA_LIMIT'),
  lp_fsa: P('hsaFsa', 'Limited-purpose FSA', 'pretax', 'instant', 'FSA_LIMIT'),
  dc_fsa: P('hsaFsa', 'Dependent care FSA', 'pretax', 'days', 'DCFSA'),
  k529: P('education', '529 plan', 'taxable', 'penalty', 'GIFT_EXCL'),
  coverdell: P('education', 'Coverdell ESA', 'taxable', 'penalty', 'COVERDELL'),
  utma: P('education', 'UTMA / UGMA custodial', 'taxable', 'locked', 'GIFT_EXCL'),
  custodial_roth: P('education', 'Custodial Roth IRA', 'roth', 'penalty', 'IRA_LIMIT'),
  able: P('education', 'ABLE account', 'taxable', 'days', 'ABLE_LIMIT'),
  trump: P('education', 'Trump account', 'pretax', 'locked', 'TRUMP_LIMIT'),
  brokerage: P('taxable', 'Individual brokerage', 'taxable', 'days'),
  joint_brokerage: P('taxable', 'Joint brokerage', 'taxable', 'days'),
  crypto: P('taxable', 'Crypto', 'taxable', 'days'),
  espp: P('taxable', 'ESPP', 'taxable', 'days', 'ESPP_CAP'),
  rsu: P('taxable', 'RSUs and stock options', 'taxable', 'days', 'ISO_CAP'),
  credit_card: P('debt', 'Credit card', 'na', 'na'),
  student_loan: P('debt', 'Federal student loan', 'na', 'na', 'STUDENT_INT'),
  private_student_loan: P('debt', 'Private student loan', 'na', 'na', 'STUDENT_INT'),
  mortgage: P('debt', 'Mortgage', 'na', 'na', 'MORT_CAP'),
  heloc: P('debt', 'HELOC', 'na', 'na', 'MORT_CAP'),
  auto_loan: P('debt', 'Auto loan', 'na', 'na'),
  personal_loan: P('debt', 'Personal loan', 'na', 'na'),
  bnpl: P('debt', 'Buy now, pay later', 'na', 'na'),
  payday: P('debt', 'Payday / cash advance', 'na', 'na'),
  medical: P('debt', 'Medical debt', 'na', 'na'),
  irs_plan: P('debt', 'IRS payment plan', 'na', 'na'),
  k401_loan: P('debt', '401(k) loan', 'na', 'na', 'LOAN_401K'),
  family_iou: P('debt', 'Family IOU', 'na', 'na', 'GIFT_EXCL'),
  home: P('otherAssets', 'Primary home', 'na', 'locked', 'SEC121'),
  rental: P('otherAssets', 'Rental property', 'na', 'locked'),
  car: P('otherAssets', 'Car', 'na', 'days'),
  business: P('otherAssets', 'Business equity', 'na', 'locked'),
  pension: P('otherAssets', 'Pension', 'na', 'locked'),
  cash_value_life: P('otherAssets', 'Cash-value life insurance', 'na', 'penalty'),
  annuity: P('otherAssets', 'Annuity', 'na', 'penalty')
};
// Money that comes out of a paycheck before take-home (S-227): workplace plans, a SIMPLE IRA (answer 50), an FSA, and
// an HSA only when it is set to go through payroll (answer 47); any other HSA is paid in from take-home. The cash
// flow, the day-by-day run, the calendar and the tax figures all read this.
export const throughPayroll = (a) => !!(a.throughPayroll && a.throughPayroll.value === true);
export const fromPaycheck = (a) => a.family === 'employerRetirement' || a.type === 'simple_ira' || (a.family === 'hsaFsa' && (a.type !== 'hsa' || throughPayroll(a)));
// Money set aside for a goal (S-228): an account with the sinking-fund role (a surgery fund, a down payment). It is the
// household's money (assets and net worth count it) but never emergency cash: runway, the cushion and the floor, and
// safe to spend leave it out, and wherever cash is listed it reads "set aside for <goal>".
export const isEarmarked = (a) => !!(a && a.role && a.role.value === 'sinking');
// Revolving debt types: utilization applies.
export const REVOLVING = ['credit_card', 'heloc'];
// Families whose balance counts as invested assets for FI.
export const INVESTED_FAMILIES = ['employerRetirement', 'ira', 'hsaFsa', 'taxable'];

// Which family fields each spine field holds (accounts and debts both use FAMILIES).
export function fieldsFor(family) {
  return { ...FAMILIES.base.fields, ...(FAMILIES[family] ? FAMILIES[family].fields : {}) };
}

// ---------------------------------------------------------------- validator
// validate(spine) -> { ok, errors: [{ path, message }] }. Checks shape, Fact
// kinds (missing and notForMe carry null), enums, dates, ids and presets.
export function validate(spine) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  const isDate = isDay;
  const optDate = (path, s) => { if (s !== null && s !== undefined && !isDate(s)) err(path, 'not a date (YYYY-MM-DD)'); };

  function checkTicks(p, t) { if (!t || typeof t !== 'object' || Array.isArray(t)) { err(p + '.ticks', 'a map of feature to yes, no or notSure'); return; } for (const [k, x] of Object.entries(t)) if (!TICKS.includes(x)) err(p + '.ticks.' + k, 'yes, no or notSure'); }
  function checkFact(path, f, type, required = true) {
    if (f === undefined) { if (required) err(path, 'missing field (store a Fact with kind missing instead)'); return; }
    if (!isFact(f)) { err(path, 'not a Fact { value, asOf, source, kind }'); return; }
    for (const k of ['asOf', 'source']) if (!(k in f)) err(path, 'Fact has no ' + k);
    if (!KINDS.includes(f.kind)) err(path, 'unknown kind ' + f.kind);
    if ((f.kind === 'missing' || f.kind === 'notForMe') && f.value !== null) err(path, f.kind + ' must carry null, not ' + JSON.stringify(f.value));
    if (['known', 'rough', 'computed'].includes(f.kind) && f.value === null) err(path, f.kind + ' with no value (use kind missing)');
    if (f.asOf !== null && !isDate(f.asOf)) err(path, 'asOf is not a date');
    if (f.value === null || !type) return;
    const v = f.value;
    if (Array.isArray(type)) { if (!type.includes(v)) err(path, 'not one of ' + type.join('|')); }
    else if (type === 'money' || type === 'rate') { if (typeof v !== 'number' || !Number.isFinite(v)) err(path, type + ' must be a number'); else if (type === 'rate' && (v < -1 || v > 10)) err(path, 'rate out of range (use 0.25 for 25%)'); }
    else if (type === 'int') { if (!Number.isInteger(v)) err(path, 'must be a whole number'); }
    else if (type === 'date') { if (!isDate(v)) err(path, 'not a date'); }
    else if (type === 'bool') { if (typeof v !== 'boolean') err(path, 'must be true or false'); }
    else if (type === 'text') { if (typeof v !== 'string') err(path, 'must be text'); }
    // A link names an account or card by id, or "paycheck" (S-189).
    else if (type === 'link') { if (typeof v !== 'string' || !v) err(path, 'must name an account'); }
    else if (type === 'list') { if (!Array.isArray(v)) err(path, 'must be a list'); }
    else if (type === 'tiers') { if (!Array.isArray(v) || v.some((x) => !x || typeof x.rate !== 'number' || typeof x.upTo !== 'number' || x.rate < 0 || x.upTo <= 0 || x.upTo > 1)) err(path, 'tiers of { rate, upTo } (shares of pay)'); }
    else if (type.startsWith('choice:')) { if (!type.slice(7).split('|').includes(v)) err(path, 'not one of ' + type.slice(7)); }
  }

  function uniqueIds(path, list) {
    const seen = new Set();
    for (const x of list) {
      if (!x || typeof x.id !== 'string' || !x.id) { err(path, 'item without an id'); continue; }
      if (x.id.includes('.')) err(path + '.' + x.id, 'id may not contain a dot');
      if (seen.has(x.id)) err(path + '.' + x.id, 'duplicate id');
      seen.add(x.id);
    }
  }

  if (!spine || typeof spine !== 'object') return { ok: false, errors: [{ path: '', message: 'not an object' }] };
  if (spine.schema !== SCHEMA_ID) err('schema', 'expected ' + SCHEMA_ID);
  if (!spine.meta || !isDate(spine.meta.asOf)) err('meta.asOf', 'needs an as-of date');

  // household
  const h = spine.household || {};
  if (!Array.isArray(h.people) || !h.people.length) err('household.people', 'at least one person');
  else {
    uniqueIds('household.people', h.people);
    for (const p of h.people) { if (typeof p.name !== 'string') err('household.people.' + p.id + '.name', 'needs a name'); checkFact('household.people.' + p.id + '.birthDate', p.birthDate, 'date'); for (const [k, t] of Object.entries(SS_FIELDS)) checkFact('household.people.' + p.id + '.' + k, p[k], t, false); }
  }
  checkFact('household.filingStatus', h.filingStatus, FILING_STATUSES);
  checkFact('household.state', h.state, 'text');
  checkFact('household.county', h.county, 'text');
  checkFact('household.nycResident', h.nycResident, 'bool');
  // People in the household for the poverty line (S-205): adults and dependents together.
  checkFact('household.householdSize', h.householdSize, 'int', false);
  // Hours worked a week, for hours of life (S-206).
  checkFact('household.workHoursPerWeek', h.workHoursPerWeek, 'int', false);
  // Batch F (S-208): the biggest insurance deductible (FOO rung 1), the commute (real hourly wage).
  checkFact('household.deductible', h.deductible, 'money', false);
  checkFact('household.commuteHoursPerWeek', h.commuteHoursPerWeek, 'int', false);
  // Batch 3: last year's tax result (a refund is positive, an amount owed negative), and how goals are funded.
  checkFact('household.lastRefund', h.lastRefund, 'money', false);
  checkFact('household.goalOrder', h.goalOrder, ['oneAtATime', 'byDeadline'], false);
  // The Plan's starter cushion (S-261): a fixed amount, the biggest deductible, a month of housing or a month of needs.
  checkFact('household.starterBasis', h.starterBasis, STARTER_BASES, false);
  // The gut number (Profile Level 1): "About how much do you spend a month?", a guess in Numbers.
  checkFact('household.gutSpending', h.gutSpending, 'money', false);
  // How every card is paid unless a card says otherwise (S-189).
  checkFact('household.cardPayPolicy', h.cardPayPolicy, PAY_POLICIES, false);
  // Names that cover bills, beyond the built-in ones (S-176).
  if (h.payers !== undefined && (!Array.isArray(h.payers) || h.payers.some((x) => typeof x !== 'string' || !x.trim()))) err('household.payers', 'a list of names');
  // A section's sharing default (S-175): food, accommodation, transportation, other.
  for (const [tag, d] of Object.entries(h.expenseDefaults || {})) {
    if (![...FAT, 'other'].includes(tag)) err('household.expenseDefaults.' + tag, 'not a section');
    const p = 'household.expenseDefaults.' + tag;
    checkFact(p + '.shared', d.shared, 'bool', false); checkFact(p + '.sharedWith', d.sharedWith, 'int', false);
    checkFact(p + '.yourShare', d.yourShare, 'rate', false); checkFact(p + '.whoPays', d.whoPays, 'choice:part|whole', false);
  }
  for (const [key, values, extra] of [['situation', SITUATIONS], ['healthCoverage', COVERAGES, true]]) {
    const tl = h[key];
    if (!Array.isArray(tl) || !tl.length) { err('household.' + key, 'a dated list with at least one entry'); continue; }
    uniqueIds('household.' + key, tl);
    for (const e of tl) {
      const p = 'household.' + key + '.' + e.id;
      if (e.from !== null) optDate(p + '.from', e.from);
      checkFact(p + '.value', e.value, values);
      if (extra) {
        checkFact(p + '.planType', e.planType, PLAN_TYPES, false);
        // A coming coverage change can say it is enrolled and what is set aside for it (S-165).
        checkFact(p + '.enrolled', e.enrolled, 'bool', false);
        checkFact(p + '.setAside', e.setAside, 'money', false);
        if (e.personId && !(h.people || []).some((x) => x.id === e.personId)) err(p + '.personId', 'no such person');
      }
    }
    if (!tl.some((e) => e.from === null)) err('household.' + key, 'needs one entry with from null (the starting state)');
  }

  // income
  const inc = spine.income || [];
  if (!Array.isArray(inc)) err('income', 'must be a list');
  else {
    uniqueIds('income', inc);
    for (const s of inc) {
      const p = 'income.' + s.id;
      if (!INCOME_TYPES.includes(s.type)) err(p + '.type', 'not one of ' + INCOME_TYPES.join('|'));
      if (!CADENCES.includes(s.cadence)) err(p + '.cadence', 'not one of ' + CADENCES.join('|'));
      checkFact(p + '.amount', s.amount, 'money');
      optDate(p + '.start', s.start); optDate(p + '.end', s.end);
      if ((s.cadence === 'total' || s.cadence === 'once') && !s.start) err(p + '.start', s.cadence + ' needs a start date');
      if (s.cadence === 'total' && !s.end) err(p + '.end', 'total needs an end date');
      if (s.start && s.end && s.end < s.start) err(p + '.end', 'ends before it starts');
      checkFact(p + '.likelihood', s.likelihood, 'rate', false);
      checkFact(p + '.businessExpenses', s.businessExpenses, 'money', false);
      checkFact(p + '.depositTo', s.depositTo, 'link', false);
      // The day of the month it is paid (S-199), for monthly and less often.
      checkFact(p + '.payDay', s.payDay, 'int', false);
      if (s.payDay && s.payDay.value !== null && (s.payDay.value < 1 || s.payDay.value > 31)) err(p + '.payDay', 'a day from 1 to 31');
      // Twice a month, the second day it is paid (S-226): the 1st and the 15th. Optional; without it the run's rule makes it.
      checkFact(p + '.payDay2', s.payDay2, 'int', false);
      if (s.payDay2 && s.payDay2.value !== null && (s.payDay2.value < 1 || s.payDay2.value > 31)) err(p + '.payDay2', 'a day from 1 to 31');
      else if (s.payDay2 && s.payDay2.value !== null && s.payDay && s.payDay.value === s.payDay2.value) err(p + '.payDay2', 'a different day from the first');
      if (s.likelihood && s.likelihood.value !== null && (s.likelihood.value < 0 || s.likelihood.value > 1)) err(p + '.likelihood', 'between 0 and 1');
      if (s.type === 'maybeMoney' && !s.likelihood) err(p + '.likelihood', 'maybe money needs a likelihood');
      if (!s.withholding) err(p + '.withholding', 'needs { federal, state } Facts');
      else { checkFact(p + '.withholding.federal', s.withholding.federal, 'money'); checkFact(p + '.withholding.state', s.withholding.state, 'money'); }
      if (s.personId && !(h.people || []).some((x) => x.id === s.personId)) err(p + '.personId', 'no such person');
      checkFact(p + '.payBasis', s.payBasis, PAY_BASES, false);
      for (const k of ['salary', 'hourlyRate', 'yearTotal']) checkFact(p + '.' + k, s[k], 'money', false);
      checkFact(p + '.hoursPerWeek', s.hoursPerWeek, 'int', false);
      for (const [k, t] of Object.entries(INCOME_DEPTH)) checkFact(p + '.' + k, s[k], t, false);
      if (s.ticks !== undefined) checkTicks(p, s.ticks);
      if (s.type === 'person') {
        checkFact(p + '.from', s.from, 'text', false);
        checkFact(p + '.purpose', s.purpose, PERSON_PURPOSES);
        checkFact(p + '.decreeYear', s.decreeYear, 'int', false);
        checkFact(p + '.allowanceMode', s.allowanceMode, ALLOWANCE_MODES, false);
      }
    }
  }

  // expenses
  const ex = spine.expenses || [];
  uniqueIds('expenses', ex);
  for (const e of ex) {
    const p = 'expenses.' + e.id;
    if (!CADENCES.includes(e.cadence)) err(p + '.cadence', 'not a cadence');
    checkFact(p + '.amount', e.amount, 'money');
    optDate(p + '.start', e.start); optDate(p + '.end', e.end);
    if (e.fat !== null && !FAT.includes(e.fat)) err(p + '.fat', 'food, accommodation, transportation or null');
    if (e.fixed !== null && e.fixed !== undefined && typeof e.fixed !== 'boolean') err(p + '.fixed', 'true, false or null');
    // Need or want, and paid by someone else, are Facts (S-171): a missing tag shows in the Ledger.
    checkFact(p + '.need', e.need, 'bool', false);
    checkFact(p + '.covered', e.covered, 'bool', false);
    checkFact(p + '.coveredBy', e.coveredBy, 'text', false);
    // Paid from an account or card, on a day of the month (S-189).
    checkFact(p + '.paidFrom', e.paidFrom, 'link', false);
    // The debt this line pays (S-226): its payment is counted once, under debt payments.
    checkFact(p + '.paysDebt', e.paysDebt, 'link', false);
    if (e.paysDebt && e.paysDebt.value !== null) {
      if (!(spine.debts || []).some((d) => d.id === e.paysDebt.value)) err(p + '.paysDebt', 'no such debt');
      else if (!PER_YEAR[e.cadence]) err(p + '.paysDebt', 'a line that pays a debt repeats');
      else if (ex.some((x) => x !== e && ex.indexOf(x) < ex.indexOf(e) && x.paysDebt && x.paysDebt.value === e.paysDebt.value)) err(p + '.paysDebt', 'another line already pays this debt');
    }
    checkFact(p + '.payDay', e.payDay, 'int', false);
    checkFact(p + '.coachNote', e.coachNote, 'text', false);
    // A subscription renews on its own (S-191): when it next charges, when it was last reviewed.
    checkFact(p + '.subscription', e.subscription, 'bool', false);
    checkFact(p + '.renews', e.renews, 'date', false);
    checkFact(p + '.reviewed', e.reviewed, 'date', false);
    // The subscription audit (overnight Track G): how often it is used a month, and marked to cancel. Both optional;
    // a file without them reads as not answered.
    checkFact(p + '.usesPerMonth', e.usesPerMonth, 'int', false); checkFact(p + '.cancelCandidate', e.cancelCandidate, 'bool', false);
    // A free trial that converts on a day (S-206).
    checkFact(p + '.trialEnds', e.trialEnds, 'date', false);
    // A cost of working (S-208): comes off the real hourly wage.
    checkFact(p + '.workRelated', e.workRelated, 'bool', false);
    if (e.payDay && e.payDay.value !== null && (e.payDay.value < 1 || e.payDay.value > 31)) err(p + '.payDay', 'a day from 1 to 31');
    // Shared with other people (S-175).
    checkFact(p + '.shared', e.shared, 'bool', false);
    checkFact(p + '.sharedWith', e.sharedWith, 'int', false);
    checkFact(p + '.yourShare', e.yourShare, 'rate', false);
    checkFact(p + '.whoPays', e.whoPays, 'choice:part|whole', false);
    // The people on a shared bill (engine/owed.js): each a name, a part, and how they pay you back.
    checkFact(p + '.sharers', e.sharers, 'list', false);
    if (e.sharers && Array.isArray(e.sharers.value)) e.sharers.value.forEach((x, i) => {
      const q = p + '.sharers.' + i;
      if (!x || typeof x.name !== 'string' || !x.name.trim()) err(q + '.name', 'a name');
      if (!x || !x.share || !['even', 'percent', 'amount'].includes(x.share.mode)) err(q + '.share', 'even, percent or amount');
      else if (x.share.mode !== 'even' && x.share.value !== null && !(typeof x.share.value === 'number' && x.share.value >= 0)) err(q + '.share', 'a number, 0 or more');
      if (!x || !['each', 'ahead', 'every', 'yearly', 'cover'].includes(x.payBack)) err(q + '.payBack', 'each, ahead, every, yearly or cover');
      for (const k of ['since', 'paidThrough', 'askOn', 'start']) if (x && x[k] !== null && x[k] !== undefined && !isDate(x[k])) err(q + '.' + k, 'a date or null');
    });
  }

  // accounts and debts: shells of a family, with preset types
  for (const coll of ['accounts', 'debts']) {
    const list = spine[coll] || [];
    uniqueIds(coll, list);
    for (const a of list) {
      const p = coll + '.' + a.id;
      const preset = PRESETS[a.type];
      if (!preset) { err(p + '.type', 'unknown account type ' + a.type); continue; }
      if (a.family !== preset.family) err(p + '.family', a.type + ' belongs to ' + preset.family);
      if ((coll === 'debts') !== (preset.family === 'debt')) err(p + '.family', coll === 'debts' ? 'debts hold the debt family only' : 'debts go in debts');
      const fields = fieldsFor(a.family);
      checkFact(p + '.balance', a.balance, 'money');
      for (const k of Object.keys(a)) {
        if (['id', 'family', 'type', 'notes'].includes(k)) continue;
        if (k === 'ticks') { checkTicks(p, a.ticks); continue; }
        if (!(k in fields)) { err(p + '.' + k, 'not a field of the ' + a.family + ' family'); continue; }
        checkFact(p + '.' + k, a[k], fields[k]);
      }
      if (a.stress && a.stress.value !== null && (a.stress.value < 1 || a.stress.value > 10)) err(p + '.stress', '1 to 10');
      if (a.paidThrough && a.paidThrough.value !== null && !(spine.income || []).some((s) => s.id === a.paidThrough.value && s.type === 'w2')) err(p + '.paidThrough', 'not a W-2 line');
      // A card says whether it is a business card and whether it reports to personal credit (S-157).
      if (a.type === 'credit_card') for (const k of ['business', 'reportsToPersonalCredit']) if (!a[k]) err(p + '.' + k, 'a card carries this (kind missing when unknown)');
      for (const [k, need] of [['contributions', ['year', 'amount']], ['conversions', ['year', 'amount', 'taxable']]]) {
        const v = a[k] && a[k].value;
        if (Array.isArray(v)) v.forEach((x, i) => need.forEach((n) => { if (typeof x[n] !== 'number') err(p + '.' + k + '[' + i + '].' + n, 'needs a number'); }));
      }
      // A contribution entry may say what it was (S-211): a rollover or a conversion never counts against a limit, a 529
      // rolled into a Roth IRA does (from529), and employer marks a Solo 401(k)'s or SEP's employer part.
      const cl = a.contributions && a.contributions.value;
      if (Array.isArray(cl)) cl.forEach((x, i) => {
        if (x.kind !== undefined && !['contribution', 'rollover', 'conversion', 'from529', 'employer'].includes(x.kind)) err(p + '.contributions[' + i + '].kind', 'contribution, rollover, conversion, from529 or employer');
        if (x.through !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(x.through)) err(p + '.contributions[' + i + '].through', 'a date (YYYY-MM-DD)');
      });
    }
  }

  // goals
  const goals = spine.goals || [];
  uniqueIds('goals', goals);
  for (const g of goals) {
    const p = 'goals.' + g.id;
    if (!['fi', 'savings', 'emergency', 'payoff', 'other'].includes(g.type)) err(p + '.type', 'fi, savings, emergency, payoff or other');
    for (const k of ['target', 'annualSpending', 'fiNumber', 'dreamSpending', 'partTimeIncome']) if (k in g) checkFact(p + '.' + k, g[k], 'money');
    optDate(p + '.by', g.by);
    // F009 (S-208): priority, the account it lives in, a sinking fund with a monthly set-aside, spent on a date, repeating yearly.
    checkFact(p + '.priority', g.priority, 'int', false);
    checkFact(p + '.linkedAccount', g.linkedAccount, 'link', false);
    checkFact(p + '.sinkingFund', g.sinkingFund, 'bool', false);
    checkFact(p + '.monthly', g.monthly, 'money', false);
    checkFact(p + '.spendOn', g.spendOn, 'date', false);
    checkFact(p + '.repeatYearly', g.repeatYearly, 'bool', false);
    checkFact(p + '.coachNote', g.coachNote, 'text', false);
  }

  // tax years: the year's own entries (estimated payments made, gains, dividends)
  const tys = spine.taxYears || [];
  uniqueIds('taxYears', tys);
  for (const ty of tys) {
    const p = 'taxYears.' + ty.id;
    if (!Number.isInteger(ty.year) || String(ty.year) !== ty.id) err(p + '.year', 'a whole year matching the id');
    for (const k of Object.keys(ty)) {
      if (k === 'id' || k === 'year') continue;
      if (!TAX_YEAR_FIELDS.includes(k)) err(p + '.' + k, 'not a tax year field');
      else checkFact(p + '.' + k, ty[k], 'money');
    }
  }

  // The debt plan (S-203): the extra at the debt and how it is aimed. Every field optional.
  const dp = spine.debtPlan || {};
  checkFact('debtPlan.extra', dp.extra, 'money', false); checkFact('debtPlan.day', dp.day, 'int', false);
  checkFact('debtPlan.strategy', dp.strategy, 'choice:avalanche|snowball', false); checkFact('debtPlan.stopAtHi', dp.stopAtHi, 'bool', false);
  checkFact('debtPlan.hiRate', dp.hiRate, 'rate', false); checkFact('debtPlan.rollFreed', dp.rollFreed, 'bool', false);
  for (const k of Object.keys(dp)) if (!DEBT_PLAN_FIELDS.includes(k)) err('debtPlan.' + k, 'not a debt plan field');
  // Calendar timing decisions (S-203): overrides of one occurrence, the maybe tray, locks, two switches. Plain values, not Facts: a decision, not a fact about the household.
  const cal = spine.calendar || {};
  for (const [key, o] of Object.entries(cal.overrides || {})) {
    if (!/^[^|]+\|\d{4}-\d{2}-\d{2}$/.test(key)) err('calendar.overrides.' + key, 'key is sourceId|YYYY-MM-DD');
    if (o.date !== undefined && !isDate(o.date)) err('calendar.overrides.' + key, 'date is not a date');
    if (o.amount !== undefined && typeof o.amount !== 'number') err('calendar.overrides.' + key, 'amount must be a number');
  }
  if (cal.maybe !== undefined) { if (!Array.isArray(cal.maybe)) err('calendar.maybe', 'a list'); else { uniqueIds('calendar.maybe', cal.maybe); for (const m of cal.maybe) { const p = 'calendar.maybe.' + m.id; if (typeof m.label !== 'string') err(p, 'needs a label'); if (typeof m.amount !== 'number') err(p, 'amount must be a number'); if (m.date !== null && m.date !== undefined && !isDate(m.date)) err(p, 'date is not a date'); if (m.likelihood !== undefined && (typeof m.likelihood !== 'number' || m.likelihood < 0 || m.likelihood > 1)) err(p, 'likelihood is 0 to 1'); if (m.direction !== undefined && !['in', 'out'].includes(m.direction)) err(p, 'direction is in or out'); } } }
  for (const k of ['guard', 'autoCover']) if (cal[k] !== undefined && typeof cal[k] !== 'boolean') err('calendar.' + k, 'true or false');
  for (const [key, on] of Object.entries(cal.locks || {})) { if (!/^[^|]+\|\d{4}-\d{2}-\d{2}$/.test(key)) err('calendar.locks.' + key, 'key is sourceId|YYYY-MM-DD'); if (on !== true) err('calendar.locks.' + key, 'a lock is true or absent'); }

  // The month-end sweep (S-206): on, to an account, keeping an amount above the floor.
  if (cal.sweep !== undefined) {
    if (typeof cal.sweep !== 'object' || cal.sweep === null) err('calendar.sweep', 'an object');
    else { if (typeof cal.sweep.on !== 'boolean') err('calendar.sweep.on', 'true or false'); if (cal.sweep.to !== null && cal.sweep.to !== undefined && !(spine.accounts || []).some((a) => a.id === cal.sweep.to)) err('calendar.sweep.to', 'an account id or null'); if (cal.sweep.keep !== undefined && (typeof cal.sweep.keep !== 'number' || cal.sweep.keep < 0)) err('calendar.sweep.keep', 'a number, zero or more'); }
  }

  // The spend log (S-206): plain records of what happened.
  const log = spine.log || [];
  if (!Array.isArray(log)) err('log', 'a list');
  else {
    uniqueIds('log', log);
    for (const x of log) {
      const p = 'log.' + x.id;
      if (!isDate(x.date)) err(p + '.date', 'not a date (YYYY-MM-DD)');
      if (typeof x.amount !== 'number' || !Number.isFinite(x.amount) || x.amount < 0) err(p + '.amount', 'a number, zero or more');
      if (!['spend', 'refund', 'income'].includes(x.kind)) err(p + '.kind', 'spend, refund or income');
      if (x.tag !== null && x.tag !== undefined && ![...FAT, 'other'].includes(x.tag)) err(p + '.tag', 'food, accommodation, transportation, other or null');
      if (x.expenseId !== null && x.expenseId !== undefined && !(spine.expenses || []).some((e) => e.id === x.expenseId)) err(p + '.expenseId', 'an expense id or null');
    }
  }
  // The feed's memory (S-207): a merchant learned to a line.
  // Closed budget months (engine/budget.js): one entry a month, its choices and its summary line.
  if (spine.closes !== undefined) {
    if (!Array.isArray(spine.closes)) err('closes', 'must be a list');
    else for (const c of spine.closes) { if (!/^\d{4}-\d{2}$/.test(c.ym || '')) err('closes', 'each close names its month (YYYY-MM)'); if (!Array.isArray(c.choices)) err('closes.' + c.ym, 'its choices are a list'); if (typeof c.summary !== 'string') err('closes.' + c.ym, 'a summary line'); }
  }
  if (spine.planKept !== undefined && (typeof spine.planKept !== 'object' || spine.planKept === null || Array.isArray(spine.planKept))) err('planKept', 'an object');
  // Money lent to someone (engine/owed.js): owed to you until repaid; a gift never is.
  if (spine.lent !== undefined) {
    if (!Array.isArray(spine.lent)) err('lent', 'must be a list');
    else { uniqueIds('lent', spine.lent); for (const l of spine.lent) {
      const p = 'lent.' + l.id;
      if (typeof l.person !== 'string' || !l.person.trim()) err(p + '.person', 'a name');
      checkFact(p + '.amount', l.amount, 'money');
      if (!isDate(l.date)) err(p + '.date', 'a date');
      if (l.due !== null && l.due !== undefined) checkFact(p + '.due', l.due, 'date', false);
      if (!['loan', 'gift'].includes(l.kind)) err(p + '.kind', 'loan or gift');
      if (typeof l.repaid !== 'number' || l.repaid < 0) err(p + '.repaid', 'dollars repaid, 0 or more');
    } }
  }
  if (spine.feed !== undefined) { if (typeof spine.feed !== 'object' || spine.feed === null) err('feed', 'an object'); else for (const [m, id] of Object.entries(spine.feed.memory || {})) if (!(spine.expenses || []).some((e) => e.id === id)) err('feed.memory.' + m, 'an expense id'); }
  // Check-ins (S-206): real balances against the forecast, by day.
  const checkins = spine.checkins || [];
  if (!Array.isArray(checkins)) err('checkins', 'a list');
  else {
    uniqueIds('checkins', checkins);
    for (const c of checkins) {
      const p = 'checkins.' + c.id;
      if (!isDate(c.date)) err(p + '.date', 'not a date (YYYY-MM-DD)');
      if (typeof c.balances !== 'object' || c.balances === null) err(p + '.balances', 'an object of account id to amount');
      else for (const [id, amt] of Object.entries(c.balances)) if (typeof amt !== 'number') err(p + '.balances.' + id, 'a number');
      if (c.forecast !== undefined && (typeof c.forecast !== 'object' || c.forecast === null)) err(p + '.forecast', 'an object of account id to amount or null');
    }
  }

  // The Profile (Phase 2.5 B3): one Fact per question, its value one the question allows; the life-change log; homework.
  const pf = spine.profile;
  if (pf !== undefined) {
    if (!pf || typeof pf !== 'object' || Array.isArray(pf)) err('profile', 'a record of answers');
    else for (const [k, f] of Object.entries(pf)) {
      const path = 'profile.' + k;
      if (!questionById(k)) { err(path, 'not a profile question'); continue; }
      if (!isFact(f)) { err(path, 'not a Fact'); continue; }
      if (f.value !== null && cleanAnswer(k, f.value) === undefined) err(path, 'not an answer this question allows');
    }
  }
  // Notes (overnight Track I): optional; each { id, date, path (a field, an item or null), text, shared }.
  if (spine.notes !== undefined) {
    if (!Array.isArray(spine.notes)) err('notes', 'a list');
    else { uniqueIds('notes', spine.notes); for (const n of spine.notes) { if (!isDate(n.date)) err('notes.' + n.id + '.date', 'not a date (YYYY-MM-DD)'); if (typeof n.text !== 'string' || !n.text.trim()) err('notes.' + n.id + '.text', 'says something'); if (n.path !== null && typeof n.path !== 'string') err('notes.' + n.id + '.path', 'a field, an item or null'); if (typeof n.shared !== 'boolean') err('notes.' + n.id + '.shared', 'true or false'); } }
  }
  // Life changes: a Profile answer (question), a step toward the Budget target (kind 'target') or a bill called about
  // (kind 'called', overnight Track H: { id, date, kind, path, label, from, to }). Older files hold only the first.
  if (spine.lifeChanges !== undefined) {
    if (!Array.isArray(spine.lifeChanges)) err('lifeChanges', 'a list');
    else { uniqueIds('lifeChanges', spine.lifeChanges); for (const c of spine.lifeChanges) { if (!isDate(c.date)) err('lifeChanges.' + c.id + '.date', 'not a date (YYYY-MM-DD)'); if (c.kind === 'target' || c.kind === 'called') { if (typeof c.path !== 'string') err('lifeChanges.' + c.id + '.path', 'names a field'); } else if (typeof c.question !== 'string') err('lifeChanges.' + c.id + '.question', 'names a question'); } }
  }
  const hw = spine.coaching && spine.coaching.homework;
  if (hw !== undefined) {
    if (!Array.isArray(hw)) err('coaching.homework', 'a list');
    else { uniqueIds('coaching.homework', hw); for (const x of hw) if (!STATUS.includes(x.status)) err('coaching.homework.' + x.id + '.status', 'not one of ' + STATUS.join('|')); }
  }

  // assumptions
  const as = spine.assumptions || {};
  for (const k of ['inflation', 'realReturn', 'withdrawalRate']) checkFact('assumptions.' + k, as[k], 'rate');
  checkFact('assumptions.lifeExpectancy', as.lifeExpectancy, 'int');
  checkFact('assumptions.coastAge', as.coastAge, 'int', false);

  return { ok: errors.length === 0, errors };
}
