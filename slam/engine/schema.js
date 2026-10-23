// The household spine schema (slam-spine/1) and its validator.
// Source: Account_Shells.xlsx, tabs Shells, Variables and Account Rules.
// CONTRACTS.md describes the same shape in words.

import { KINDS, isFact, ISO_DATE } from './spine.js';

export const SCHEMA_ID = 'slam-spine/1';

export const FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh'];
export const SITUATIONS = ['employed', 'self_employed', 'between_jobs', 'student', 'retired', 'mixed'];
export const COVERAGES = ['employer', 'parent_plan', 'own_plan', 'marketplace', 'medicaid', 'medicare', 'none', 'other'];
// HSA-eligible plan types (HDHP_MIN_S notes: bronze and catastrophic count from 2026).
export const PLAN_TYPES = ['hdhp', 'bronze', 'catastrophic', 'other'];
export const HSA_ELIGIBLE_PLANS = ['hdhp', 'bronze', 'catastrophic'];

export const INCOME_TYPES = ['w2', '1099', 'unemployment', 'tips', 'rental', 'pension', 'ss', 'maybeMoney', 'other'];
// total: the amount is spread evenly from start to end (a known total for a window).
// once: paid on the start date.
export const CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly', 'total', 'once'];
export const PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, quarterly: 4, yearly: 1 };
export const FAT = ['food', 'accommodation', 'transportation'];
export const TAX_YEAR_FIELDS = ['estimatedPaidFederal', 'estimatedPaidState', 'capitalGainsLong', 'qualifiedDividends', 'otherIncome', 'setAside'];

// ---------------------------------------------------------------- families
// Field types: money, rate, date, int, text, bool, choice:<a|b>, list.
// Every field is stored as a Fact. Base fields apply to every family.
export const FAMILIES = {
  base: {
    label: 'Base', fields: {
      name: 'text', institution: 'text', owner: 'choice:me|partner|joint|child', balance: 'money',
      taxTreatment: 'choice:pretax|roth|taxable|tripleTaxFree|na', liquidity: 'choice:instant|days|penalty|locked|na',
      monthlyContribution: 'money', linkedGoal: 'text'
    }
  },
  cash: { label: 'Cash', fields: { apy: 'rate', minBalance: 'money', monthlyFee: 'money', role: 'choice:spending|emergency|sinking|holding' } },
  fixedTerm: { label: 'Fixed-term', fields: { rate: 'rate', maturityDate: 'date', earlyWithdrawalPenalty: 'text' } },
  employerRetirement: {
    label: 'Employer retirement', fields: {
      rothShare: 'rate', matchFormula: 'text', vesting: 'text', annualLimit: 'money', catchUpEligible: 'bool', loanBalance: 'money',
      priorYearFicaWages: 'money', allowsAfterTax: 'bool', allowsLoans: 'bool', employerType: 'choice:private|nonprofit|government|federal|self'
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
      rolloverRule: 'choice:rolls|forfeit', planEligible: 'choice:hdhp|bronze|catastrophic|no', monthsEligible: 'int', employerSeed: 'money'
    }
  },
  education: { label: 'Education / kids', fields: { beneficiary: 'text', stateTaxDeduction: 'bool', annualLimit: 'money', ageOfControl: 'int', stateDeduction: 'money', openDate: 'date', childBirthYear: 'int' } },
  taxable: { label: 'Taxable investing', fields: { costBasis: 'money', unrealizedGain: 'money', expectedReturn: 'rate', employerStockShare: 'rate' } },
  debt: {
    label: 'Debt', fields: {
      apr: 'rate', promoApr: 'rate', promoEnds: 'date', deferredInterest: 'bool', limit: 'money', minimum: 'money', dueDay: 'int',
      statementCloseDay: 'int', secured: 'bool', payoffDate: 'date', federal: 'bool', plan: 'text', stress: 'int', reasonsToKeep: 'list',
      business: 'bool', reportsToPersonalCredit: 'bool'
    }
  },
  otherAssets: { label: 'Other assets', fields: { appreciationRate: 'rate', linkedDebt: 'text', incomeProduced: 'money' } }
};

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
  const isDate = (s) => typeof s === 'string' && ISO_DATE.test(s);
  const optDate = (path, s) => { if (s !== null && s !== undefined && !isDate(s)) err(path, 'not a date (YYYY-MM-DD)'); };

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
    else if (type === 'list') { if (!Array.isArray(v)) err(path, 'must be a list'); }
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
    for (const p of h.people) { if (typeof p.name !== 'string') err('household.people.' + p.id + '.name', 'needs a name'); checkFact('household.people.' + p.id + '.birthDate', p.birthDate, 'date'); }
  }
  checkFact('household.filingStatus', h.filingStatus, FILING_STATUSES);
  checkFact('household.state', h.state, 'text');
  checkFact('household.county', h.county, 'text');
  checkFact('household.nycResident', h.nycResident, 'bool');
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
      if (s.likelihood && s.likelihood.value !== null && (s.likelihood.value < 0 || s.likelihood.value > 1)) err(p + '.likelihood', 'between 0 and 1');
      if (s.type === 'maybeMoney' && !s.likelihood) err(p + '.likelihood', 'maybe money needs a likelihood');
      if (!s.withholding) err(p + '.withholding', 'needs { federal, state } Facts');
      else { checkFact(p + '.withholding.federal', s.withholding.federal, 'money'); checkFact(p + '.withholding.state', s.withholding.state, 'money'); }
      if (s.personId && !(h.people || []).some((x) => x.id === s.personId)) err(p + '.personId', 'no such person');
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
        if (!(k in fields)) { err(p + '.' + k, 'not a field of the ' + a.family + ' family'); continue; }
        checkFact(p + '.' + k, a[k], fields[k]);
      }
      if (a.stress && a.stress.value !== null && (a.stress.value < 1 || a.stress.value > 10)) err(p + '.stress', '1 to 10');
      // A card says whether it is a business card and whether it reports to personal credit (S-157).
      if (a.type === 'credit_card') for (const k of ['business', 'reportsToPersonalCredit']) if (!a[k]) err(p + '.' + k, 'a card carries this (kind missing when unknown)');
      for (const [k, need] of [['contributions', ['year', 'amount']], ['conversions', ['year', 'amount', 'taxable']]]) {
        const v = a[k] && a[k].value;
        if (Array.isArray(v)) v.forEach((x, i) => need.forEach((n) => { if (typeof x[n] !== 'number') err(p + '.' + k + '[' + i + '].' + n, 'needs a number'); }));
      }
    }
  }

  // goals
  const goals = spine.goals || [];
  uniqueIds('goals', goals);
  for (const g of goals) {
    const p = 'goals.' + g.id;
    if (!['fi', 'savings', 'payoff', 'other'].includes(g.type)) err(p + '.type', 'fi, savings, payoff or other');
    for (const k of ['target', 'annualSpending', 'fiNumber']) if (k in g) checkFact(p + '.' + k, g[k], 'money');
    optDate(p + '.by', g.by);
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

  // assumptions
  const as = spine.assumptions || {};
  for (const k of ['inflation', 'realReturn', 'withdrawalRate']) checkFact('assumptions.' + k, as[k], 'rate');
  checkFact('assumptions.lifeExpectancy', as.lifeExpectancy, 'int');
  checkFact('assumptions.coastAge', as.coastAge, 'int', false);

  return { ok: errors.length === 0, errors };
}
