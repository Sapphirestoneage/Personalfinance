// The shape of one household document, its enums, and the default budget tree.
// newHousehold() builds a fresh, empty client.

import { makeValue } from './value.js';
import { DEFAULT_LINE_TYPES } from './types.js';
import { newId } from './ids.js';

export const SCHEMA_VERSION = 20;

export const SITUATIONS = ['employed', 'self-employed', 'between-jobs', 'student'];
export const FILING_STATUSES = ['single', 'married-joint', 'married-separate', 'head-of-household'];
export const WITHHOLDING = [null, 'ten-percent', 'none'];
export const INCOME_TYPES = ['w2', '1099', 'side', 'unemployment', 'family', 'not-taxable'];
export const PAY_BASES = ['salary', 'hourly'];
export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
export const ITEM_STATES = ['active', 'hidden', 'archived'];
export const LINE_KINDS = ['fixed', 'variable'];
export const LINE_PATHS = ['personal', 'linked', 'reimbursable'];
export const LINE_TAGS = ['planned', 'unavoidable', 'mistake'];
export const DEBT_TYPES = ['credit-card', 'line-of-credit', 'student-loan', 'car-loan', 'personal-loan', 'medical', 'bnpl', 'mortgage', 'family-friend', 'other'];
export const LIVING_WITH = ['alone', 'partner', 'roommates', 'family'];
// Investment, retirement, and HSA accounts (S-103) hold money that is not spent day to day: never cash on hand.
// S-110 adds every kind of asset, so the balance sheet has one place for all of them.
export const ACCOUNT_TYPES = ['checking', 'savings', 'credit-card', 'cash', 'unset', 'hsa', 'other',
  '401k', 'trad-ira', 'roth-ira', 'brokerage', '529', 'crypto', 'cash-value-life', 'home', 'vehicle', 'other-asset'];
// What each type is (S-110). kind: cash (counted in the cash bridge), invested (it can rise or fall with
// a market), valued (a thing you own and use: its value is entered), or owed (a card).
// tier: how fast it becomes cash. 1 cash now, 2 sell within days, 3 retirement with a penalty or rules,
// 4 not liquid. fi: whether it counts toward FI net worth by default (the coach can change it per account).
export const ACCOUNT_TYPE_INFO = {
  checking: { label: 'Checking', kind: 'cash', tier: 1, fi: true },
  savings: { label: 'Savings', kind: 'cash', tier: 1, fi: true },
  cash: { label: 'Cash', kind: 'cash', tier: 1, fi: true },
  'credit-card': { label: 'Credit card', kind: 'owed', tier: null, fi: true },
  brokerage: { label: 'Brokerage', kind: 'invested', tier: 2, fi: true },
  // Type not set (S-116): the old "Investment" and "Retirement" types, until the coach picks one.
  unset: { label: 'Type not set', kind: 'invested', tier: 2, fi: true },
  crypto: { label: 'Crypto', kind: 'invested', tier: 2, fi: true },
  other: { label: 'Other money account', kind: 'invested', tier: 2, fi: true },
  '401k': { label: '401(k), 403(b), or 457', kind: 'invested', tier: 3, fi: true },
  'trad-ira': { label: 'Traditional IRA', kind: 'invested', tier: 3, fi: true },
  'roth-ira': { label: 'Roth IRA', kind: 'invested', tier: 3, fi: true },
  hsa: { label: 'HSA', kind: 'invested', tier: 3, fi: true },
  529: { label: '529 college savings', kind: 'invested', tier: 3, fi: true },
  'cash-value-life': { label: 'Cash value life insurance', kind: 'invested', tier: 3, fi: true },
  home: { label: 'Home', kind: 'valued', tier: 4, fi: false },
  vehicle: { label: 'Vehicle', kind: 'valued', tier: 4, fi: false },
  'other-asset': { label: 'Other thing you own', kind: 'valued', tier: 4, fi: false }
};
export const LIQUIDITY_TIERS = [1, 2, 3, 4];
// The return the equity in a home could earn elsewhere, a year after inflation (S-113): an assumption.
// Not stored until the coach changes it (settings.ownReturn).
export const DEFAULT_OWN_RETURN = 0.05;
// An account's tier and FI flag, falling back to its type's default when not stored.
export const typeInfo = (a) => ACCOUNT_TYPE_INFO[a.type] || ACCOUNT_TYPE_INFO.other;
export const tierOf = (a) => (a.tier === undefined ? typeInfo(a).tier : a.tier);
export const countsForFI = (a) => (a.countsForFI === undefined ? typeInfo(a).fi : a.countsForFI);
// A home or a vehicle can name the debt it secures (a mortgage, an auto loan), and its purchase.
export const SECURED_TYPES = ['home', 'vehicle'];
// Cash on hand counts these; cards are money owed, shown separately.
export const CASH_ACCOUNT_TYPES = ['checking', 'savings', 'cash'];
export const ACCOUNT_STATES = ['active', 'archived'];

// [id, name, kind, need, savings, tag, lines[[id, name, kind, need]]]
// need = whatever the line is labeled; these are only starting labels, editable per line.
// FAT is separate and strict: the Food, Housing (accommodation), and Transportation
// categories, whatever their lines are labeled (see DECISIONS.md S-048).
const TREE = [
  ['housing', 'Housing', 'fixed', true, false, 'planned', [
    ['rent', 'Rent or mortgage', 'fixed', true], ['utilities', 'Utilities', 'variable', true],
    ['internet', 'Internet', 'fixed', true], ['home-insurance', 'Renters or home insurance', 'fixed', true]]],
  ['food', 'Food', 'variable', true, false, 'planned', [
    ['groceries', 'Groceries', 'variable', true], ['eating-out', 'Eating out', 'variable', false],
    ['delivery', 'Delivery', 'variable', false]]],
  ['transport', 'Transportation', 'variable', true, false, 'planned', [
    ['car-payment', 'Car payment', 'fixed', true], ['car-insurance', 'Car insurance', 'fixed', true],
    ['gas', 'Gas', 'variable', true], ['transit', 'Transit', 'variable', true],
    ['maintenance', 'Maintenance', 'variable', true]]],
  ['debt', 'Debt payments', 'fixed', true, false, 'planned', []],
  ['health', 'Health', 'fixed', true, false, 'planned', [
    ['premiums', 'Premiums', 'fixed', true], ['out-of-pocket', 'Out of pocket', 'variable', true],
    ['therapy', 'Therapy', 'fixed', true]]],
  ['bills', 'Bills and subscriptions', 'fixed', false, false, 'planned', [
    ['subscriptions', 'Bills and subscriptions', 'fixed', false]]],
  ['fun', 'Personal and fun', 'variable', false, false, 'planned', [
    ['shopping', 'Shopping', 'variable', false], ['entertainment', 'Entertainment', 'variable', false],
    ['travel', 'Travel', 'variable', false], ['hobbies', 'Hobbies', 'variable', false],
    ['gifts', 'Gifts', 'variable', false]]],
  ['annual', 'Annual and irregular', 'variable', false, false, 'planned', [
    ['yearly', 'Yearly and irregular costs', 'variable', false]]],
  ['giving', 'Giving', 'variable', false, false, 'planned', [
    ['giving-line', 'Giving', 'variable', false]]],
  ['savings', 'Savings', 'fixed', false, true, 'planned', [
    ['emergency-fund', 'Emergency fund', 'fixed', false], ['retirement', 'Retirement (after tax)', 'fixed', false],
    ['other-goals', 'Other goals', 'fixed', false]]]
];

export const EVERYTHING_CATEGORY_ID = 'everything';

// Fee lines (S-123): no Fees category and no fee lines up front. A fee line is made in Bills and
// subscriptions the first time an entry is mapped to it (a bank import's "LATE FEE", say).
export const FEE_LINES = {
  'fee-overdraft': 'Overdraft', 'fee-late': 'Late fees', 'fee-atm': 'ATM', 'fee-foreign': 'Foreign transaction', 'fee-interest': 'Interest charged'
};

export function newLine(fields = {}) {
  return {
    id: fields.id || newId('line'),
    name: fields.name || 'New line',
    // What the line is, whatever it is called (S-068). Calculations and tracking follow this.
    type: fields.type || 'other',
    kind: fields.kind || 'variable',
    need: fields.need || false,
    savings: fields.savings || false,
    path: fields.path || 'personal',
    linkedIncomeId: fields.linkedIncomeId || null,
    tag: fields.tag || 'planned',
    joy: fields.joy === undefined ? null : fields.joy,
    // How much this drains the client, 1 to 10 (S-082). null = not rated, never 0.
    stress: fields.stress === undefined ? null : fields.stress,
    state: fields.state || 'active',
    // dream = short term (this year, or the next step); dreamLong = long term (S-075).
    estimate: makeValue(), dream: makeValue(), dreamLong: makeValue(), actual: makeValue(),
    owedBack: makeValue(), owedBackReceived: false,
    // Split with someone (S-122): a mark the client sets; the amount is still what they pay. S-134: with how
    // many other people, and your share in percent (blank = an even split). S-138: who pays the bill,
    // 'part' (you pay your part; the amount is your part) or 'whole' (on your card; the amount is the whole bill).
    shared: false, splitPeople: makeValue(null, { cadence: 'one-off' }), splitShare: makeValue(null, { cadence: 'one-off' }), splitPays: 'part',
    // Opening Paid ahead (S-130): for a yearly or irregular bill paid before the client's first month, what
    // is left of it and for how many more months, as of that first month. Blank when there is none.
    openingAhead: makeValue(null, { cadence: 'one-off' }), openingAheadMonths: makeValue(null, { cadence: 'one-off' }),
    // Cash flow (S-086): an optional due day (1 to 31); with a due month (1 to 12) it is
    // once a year. The account it is paid from (null = the first checking account).
    dueDay: makeValue(null, { cadence: 'one-off' }), dueMonth: makeValue(null, { cadence: 'one-off' }), accountId: null,
    // The client's own tags (ids from doc.tags), like Subscription or Travel.
    tags: fields.tags || [],
    // Added during a monthly review for this month ('YYYY-MM'); not part of earlier months (S-076).
    addedFor: fields.addedFor || null,
    // A mistake tag stays coach-only until the coach shares it (S-096).
    mistakeShared: false
  };
}

export function newCategory(fields = {}) {
  return {
    id: fields.id || newId('cat'),
    name: fields.name || 'New category',
    // What the category counts as (FAT, housing share, guesses), whatever it is called.
    type: fields.type || 'other',
    kind: fields.kind || 'variable',
    need: fields.need || false,
    savings: fields.savings || false,
    tag: fields.tag || 'planned',
    state: fields.state || 'active',
    estimate: makeValue(), dream: makeValue(), dreamLong: makeValue(),
    // Broken down in the Rough pass: the estimate comes from the sub-categories (lines).
    split: fields.split || false,
    lines: []
  };
}

export function defaultCategories() {
  return TREE.map(([id, name, kind, need, savings, tag, lines]) => {
    const cat = newCategory({ id, name, type: id, kind, need, savings, tag });
    cat.lines = lines.map(([lid, lname, lkind, lneed]) =>
      newLine({ id: lid, name: lname, type: DEFAULT_LINE_TYPES[lid], kind: lkind, need: lneed, savings, tag }));
    return cat;
  });
}

export function newIncome(fields = {}) {
  return {
    id: fields.id || newId('inc'),
    type: fields.type || 'w2',
    label: fields.label || 'Paycheck',
    takeHome: makeValue(null, { cadence: 'paycheck' }),
    gross: makeValue(null, { cadence: 'year' }),
    payFrequency: fields.payFrequency || 'biweekly',
    // Hourly pay: gross is computed from the rate and hours, never asked twice.
    payBasis: fields.payBasis || 'salary',
    hourlyRate: makeValue(null, { cadence: 'month' }),
    deductions: [],
    withheld: newWithheld(),
    hoursPerWeek: null,
    // Unemployment only: federal withholding ('ten-percent', 'none', or null = not sure) and weeks left.
    withholding: null,
    benefitWeeksLeft: null,
    // Cash flow (S-086): the next pay date schedules every paycheck with the pay frequency;
    // semimonthly pays on two days of the month. accountId null = the first checking account.
    nextPayDate: makeDate(), payDays: [1, 15], accountId: null,
    state: 'active'
  };
}

export const DEDUCTION_KIND_IDS = ['retirement', 'roth', 'health', 'hsa', 'transportation', 'dental', 'vision', 'life', 'disability', 'union', 'garnishment', 'other'];

// Taxes withheld, copied line by line from a paystub (W-2 pay). Each is a Value, per paycheck by default.
// sdi = state disability insurance; pfl = paid family or medical leave; sui = state unemployment (employee share) (S-080).
export const WITHHELD_KEYS = ['federal', 'socialSecurity', 'medicare', 'state', 'local', 'sdi', 'pfl', 'sui', 'other'];
export function newWithheld() {
  return Object.fromEntries(WITHHELD_KEYS.map((k) => [k, makeValue(null, { cadence: 'paycheck' })]));
}

// A paycheck deduction: a % of gross pay, or an amount in any cadence.
export function newDeduction(fields = {}) {
  const kind = fields.kind || 'retirement';
  return {
    id: fields.id || newId('ded'),
    kind,
    label: fields.label || '',
    mode: fields.mode || (kind === 'retirement' || kind === 'roth' ? 'percent' : 'amount'),
    percent: fields.percent === undefined ? null : fields.percent,
    amount: makeValue(null, { cadence: 'paycheck' }),
    pretax: fields.pretax === undefined ? true : fields.pretax,
    // The account it goes into (S-110), so a 401(k) or Roth deduction counts as money moved into it.
    accountId: fields.accountId || null
  };
}

// Next stage: one drastic change (new job, school, a move), its costs, and the
// measures it should improve. Metrics are [label, better] pairs ('higher' or 'lower').
export function newNextStage(metrics = []) {
  return {
    name: '',
    takeHome: makeValue(null, { cadence: 'month' }),
    hoursPerWeek: null,
    transitionMonths: null,
    transitionTakeHome: makeValue(null, { cadence: 'month' }),
    oneOffCosts: [],
    costChanges: [],
    laterTakeHome: makeValue(null, { cadence: 'month' }),
    laterAfterMonths: null,
    metrics: metrics.map(([label, better]) => ({ id: newId('met'), label, now: null, next: null, better })),
    // Disaster and dream lenses: only what differs from likely; blanks follow likely.
    cases: { disaster: newCaseOverrides(), dream: newCaseOverrides() }
  };
}

export function newCaseOverrides() {
  return {
    takeHome: makeValue(null, { cadence: 'month' }), transitionTakeHome: makeValue(null, { cadence: 'month' }),
    laterTakeHome: makeValue(null, { cadence: 'month' }), hoursPerWeek: null, transitionMonths: null, laterAfterMonths: null
  };
}

export function newNextStageItem(label) {
  return { id: newId('ns'), label: label || '', amount: makeValue(null, { cadence: 'month' }), disaster: makeValue(null, { cadence: 'month' }), dream: makeValue(null, { cadence: 'month' }) };
}

export function newDebt(fields = {}) {
  return {
    id: fields.id || newId('debt'),
    label: fields.label || 'Debt',
    type: fields.type || 'credit-card',
    balance: makeValue(), apr: makeValue(), minimum: makeValue(), dueDay: makeValue(),
    // Cash flow (S-086): paid from this account (null = checking), the minimum or the statement balance.
    payFrom: null, payWith: 'minimum',
    // S-116: the budget line that pays it (its estimate is the minimum), and a card's promo APR until a date.
    lineId: null, promoApr: makeValue(null, { cadence: 'one-off' }), promoEnds: null,
    // S-137: a card's or line of credit's limit (blank for a loan, or not given yet).
    creditLimit: makeValue(null, { cadence: 'one-off' }),
    state: 'active'
  };
}

// Eras: the chapters in order. Each era starts after the one before it, plus
// gapMonths of regular life. Cash comes from account balances (S-084).
export function newEras() {
  return { list: [] };
}

// Any account (S-084, S-110): money, an investment, a card, or a thing you own. A card links to its
// debt (doc.debts), which keeps the APR, minimum, and due day; the account keeps the balances.
// A home or vehicle keeps its value; the debt it secures keeps what is owed (one owner each).
export function newAccount(fields = {}) {
  const type = fields.type || 'checking';
  const info = ACCOUNT_TYPE_INFO[type] || ACCOUNT_TYPE_INFO.other;
  return {
    id: fields.id || newId('acct'),
    name: fields.name || 'Account',
    type,
    institution: fields.institution || '',
    state: fields.state || 'active',
    debtId: fields.debtId || null,
    tier: fields.tier === undefined ? info.tier : fields.tier,
    countsForFI: fields.countsForFI === undefined ? info.fi : fields.countsForFI,
    ...(SECURED_TYPES.includes(type) ? securedFields(fields) : {}),
    ...(info.kind === 'valued' ? ownedFields(type, fields) : {})
  };
}

// A thing you own (S-113): the coach's notes (coach-only), and the alternative to owning it, a month:
// rent for a similar home; rideshare, transit, and an occasional rental for a vehicle.
export const ALTERNATIVES = { home: ['rentAlt'], vehicle: ['rideshareAlt', 'transitAlt', 'rentalAlt'] };
export function ownedFields(type, fields = {}) {
  const out = { notes: fields.notes || '' };
  for (const k of ALTERNATIVES[type] || []) out[k] = fields[k] || makeValue(null, { cadence: 'month' });
  return out;
}

// Purchase price and date (optional), and the debt the home or vehicle secures.
export function securedFields(fields = {}) {
  return {
    purchasePrice: fields.purchasePrice || makeValue(null, { cadence: 'one-off' }),
    purchaseDate: fields.purchaseDate || makeDate(),
    securedDebtId: fields.securedDebtId || null
  };
}

// A date with a status, like a Value without an amount (S-086).
export function makeDate(date = null, opts = {}) {
  return { date, status: opts.status !== undefined ? opts.status : (date ? 'known' : null), source: opts.source || 'client', asOf: opts.asOf || null, note: opts.note || '' };
}

// Cash flow settings and records (S-086): the coach's cushion, scheduled items
// moved or skipped (moves[key] = { to: date or null, at }), real balances checked
// on a day, and each month's predicted end cash saved on the 1st.
export function newCashflow() {
  return { cushion: makeValue(null, { cadence: 'one-off' }), moves: {}, checks: [], forecasts: {} };
}

// One account's balances for one month. A card's balance is what is owed (positive).
export function newBalance() {
  return { start: makeValue(null, { cadence: 'one-off' }), end: makeValue(null, { cadence: 'one-off' }) };
}

// Where an era's blank spending starts (S-097). Not stored on new eras: absent means 'template'.
export const ERA_SPEND_FROM = ['template', 'today', 'dream', 'dreamLong'];

export function newEra(fields = {}) {
  return {
    id: fields.id || newId('era'),
    template: fields.template || 'custom',
    name: fields.name || 'My own era',
    months: fields.months === undefined ? 6 : fields.months,
    gapMonths: fields.gapMonths || 0,
    takeHome: makeValue(), spending: makeValue(),
    oneTime: makeValue(null, { cadence: 'month' }),
    note: ''
  };
}

export function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

// Health coverage (S-117). how: employer, parent, marketplace, public (Medicaid or Medicare), school,
// none, not-sure, or null (not asked). premiumFrom: paycheck (then premiumIncomeId names the income and
// the amount is that income's health deduction) or direct (then premium is the amount). Deductible and
// out-of-pocket max are optional, a year. hsa: true, false, or null; hsaFrom: paycheck or direct.
export const COVERAGE_HOW = ['employer', 'parent', 'marketplace', 'public', 'school', 'none', 'not-sure'];
export function newCoverage() {
  return {
    how: null, premiumFrom: null, premiumIncomeId: null, premium: makeValue(),
    deductible: makeValue(null, { cadence: 'year' }), outOfPocketMax: makeValue(null, { cadence: 'year' }),
    hsa: null, hsaFrom: null
  };
}

export function newHousehold(name, now = new Date()) {
  const iso = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('hh'),
    createdAt: iso,
    updatedAt: iso,
    profile: { name: name || 'New client', birthYear: null, state: null },
    situation: [],
    household: {
      filingStatus: 'single',
      dependents: { count: null, ages: [] },
      // Who the client lives with: 'alone', 'partner', 'roommates', or 'family' (null = not asked yet).
      livingWith: null,
      family: { count: null },
      roommates: { count: null, totalRent: makeValue() }
    },
    income: [],
    gut: makeValue(),
    categories: defaultCategories(),
    debts: [],
    noDebts: false,
    currentMonth: monthKey(now),
    months: [],
    transactions: [],
    merchantMemory: {},
    snapshots: [],
    blindRounds: [],
    // Actuals for open months other than the one being worked on: { 'YYYY-MM': { lineId: Value } }.
    monthActuals: {},
    // Income typed for a month where a source has no log entries (S-118): { 'YYYY-MM': { incomeId: Value } };
    // "none this month" is status not-for-me.
    incomeActuals: {},
    // Health coverage (S-117): the one place every coverage fact is kept.
    coverage: newCoverage(),
    // Accounts and their month balances: balances['YYYY-MM'][accountId] = { start, end } (S-084).
    accounts: [],
    balances: {},
    cashflow: newCashflow(),
    // Estimate history (S-090): append-only, written by the store.
    estimateLog: [],
    // The last shared version of each record (S-096): written on export and merge, read on import.
    sync: { versions: {}, at: null },
    nextStage: null,
    // Eras: life chapters laid end to end after today's budget (S-067).
    eras: newEras(),
    // Tags the client made: [{ id, name }]. Lines carry their ids.
    tags: [],
    // Monthly plans, separate from estimate, dream, and actual (S-076). See store/plans.js.
    plans: {},
    // materiality: the bridge "ties" when not explained is under this many dollars (coach-only, S-096).
    settings: { singleTotal: false, lens: 'dollars', materiality: 25 },
    // The coach's own notes about the client; coach-only (S-096).
    coachNotes: '',
    passesSeen: []
  };
}
