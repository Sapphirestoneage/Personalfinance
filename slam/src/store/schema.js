// The shape of one household document, its enums, and the default budget tree.
// newHousehold() builds a fresh, empty client.

import { makeValue } from './value.js';
import { newId } from './ids.js';

export const SCHEMA_VERSION = 1;

export const SITUATIONS = ['employed', 'self-employed', 'between-jobs', 'student'];
export const FILING_STATUSES = ['single', 'married-joint', 'married-separate', 'head-of-household'];
export const INCOME_TYPES = ['w2', '1099', 'side', 'unemployment', 'not-taxable'];
export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
export const ITEM_STATES = ['active', 'hidden', 'archived'];
export const LINE_KINDS = ['fixed', 'variable'];
export const LINE_PATHS = ['personal', 'linked', 'reimbursable'];
export const LINE_TAGS = ['planned', 'unavoidable', 'mistake'];
export const DEBT_TYPES = ['credit-card', 'student-loan', 'car-loan', 'personal-loan', 'medical', 'bnpl', 'mortgage', 'other'];
export const COL_TIERS = ['HCOL', 'MCOL', 'LCOL'];

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
  ['fees', 'Fees', 'variable', false, false, 'mistake', [
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
    kind: fields.kind || 'variable',
    need: fields.need || false,
    savings: fields.savings || false,
    path: fields.path || 'personal',
    linkedIncomeId: fields.linkedIncomeId || null,
    tag: fields.tag || 'planned',
    joy: fields.joy === undefined ? null : fields.joy,
    state: fields.state || 'active',
    estimate: makeValue(), dream: makeValue(), actual: makeValue(),
    owedBack: makeValue(), owedBackReceived: false
  };
}

export function newCategory(fields = {}) {
  return {
    id: fields.id || newId('cat'),
    name: fields.name || 'New category',
    kind: fields.kind || 'variable',
    need: fields.need || false,
    savings: fields.savings || false,
    tag: fields.tag || 'planned',
    state: fields.state || 'active',
    estimate: makeValue(), dream: makeValue(),
    lines: []
  };
}

export function defaultCategories() {
  return TREE.map(([id, name, kind, need, savings, tag, lines]) => {
    const cat = newCategory({ id, name, kind, need, savings, tag });
    cat.lines = lines.map(([lid, lname, lkind, lneed]) =>
      newLine({ id: lid, name: lname, kind: lkind, need: lneed, savings, tag }));
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
    pretaxRetirement: makeValue(null, { cadence: 'paycheck' }),
    hoursPerWeek: null,
    state: 'active'
  };
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
    profile: { name: name || 'New client', birthYear: null, state: null, zip: null, colTier: null, colTierSetBy: 'derived' },
    situation: [],
    household: {
      filingStatus: 'single',
      dependents: { count: null, ages: [] },
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
    settings: { singleTotal: false, benchmarkSource: 'eli', lens: 'dollars' },
    passesSeen: []
  };
}
