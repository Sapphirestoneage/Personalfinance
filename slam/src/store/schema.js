// The shape of one household document, its enums, and the default budget tree.
// newHousehold() builds a fresh, empty client.

import { makeValue } from './value.js';
import { DEFAULT_LINE_TYPES } from './types.js';
import { newId } from './ids.js';

export const SCHEMA_VERSION = 6;

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
export const ACCOUNT_TYPES = ['checking', 'savings', 'credit-card', 'cash', 'other'];
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
  ['fees', 'Fees', 'variable', false, false, 'planned', [
    ['fee-overdraft', 'Overdraft', 'variable', false], ['fee-late', 'Late fees', 'variable', false],
    ['fee-atm', 'ATM', 'variable', false], ['fee-foreign', 'Foreign transaction', 'variable', false],
    ['fee-interest', 'Interest charged', 'variable', false]]],
  ['giving', 'Giving', 'variable', false, false, 'planned', [
    ['giving-line', 'Giving', 'variable', false]]],
  ['savings', 'Savings', 'fixed', false, true, 'planned', [
    ['emergency-fund', 'Emergency fund', 'fixed', false], ['retirement', 'Retirement (after tax)', 'fixed', false],
    ['other-goals', 'Other goals', 'fixed', false]]]
];

export const DEBT_CATEGORY_ID = 'debt';
export const SAVINGS_CATEGORY_ID = 'savings';
export const HOUSING_CATEGORY_ID = 'housing';
export const EVERYTHING_CATEGORY_ID = 'everything';

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
    // The client's own tags (ids from doc.tags), like Subscription or Travel.
    tags: fields.tags || [],
    // Added during a monthly review for this month ('YYYY-MM'); not part of earlier months (S-076).
    addedFor: fields.addedFor || null
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
    pretax: fields.pretax === undefined ? true : fields.pretax
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
    state: 'active'
  };
}

// Eras: the chapters in order. Each era starts after the one before it, plus
// gapMonths of regular life. Cash comes from account balances (S-084).
export function newEras() {
  return { list: [] };
}

// A bank account, card, or cash. A card links to its debt (doc.debts), which
// keeps the APR, minimum, and due day; the account keeps the balances (S-084).
export function newAccount(fields = {}) {
  return {
    id: fields.id || newId('acct'),
    name: fields.name || 'Account',
    type: fields.type || 'checking',
    institution: fields.institution || '',
    state: fields.state || 'active',
    debtId: fields.debtId || null
  };
}

// One account's balances for one month. A card's balance is what is owed (positive).
export function newBalance() {
  return { start: makeValue(null, { cadence: 'one-off' }), end: makeValue(null, { cadence: 'one-off' }) };
}

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
      // On a parent's health plan (only counts while 25 or younger, S-073).
      parentsPlan: false,
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
    // Accounts and their month balances: balances['YYYY-MM'][accountId] = { start, end } (S-084).
    accounts: [],
    balances: {},
    nextStage: null,
    // Eras: life chapters laid end to end after today's budget (S-067).
    eras: newEras(),
    // Tags the client made: [{ id, name }]. Lines carry their ids.
    tags: [],
    // Monthly plans, separate from estimate, dream, and actual (S-076). See store/plans.js.
    plans: {},
    settings: { singleTotal: false, lens: 'dollars' },
    passesSeen: []
  };
}
