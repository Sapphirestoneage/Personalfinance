// The shape of one household document, its enums, and the default budget tree.
// newHousehold() builds a fresh, empty client.

import { makeValue } from './value.js';
import { newId } from './ids.js';

export const SCHEMA_VERSION = 1;

export const SITUATIONS = ['employed', 'self-employed', 'between-jobs', 'student'];
export const FILING_STATUSES = ['single', 'married-joint', 'married-separate', 'head-of-household'];
export const INCOME_TYPES = ['w2', '1099', 'side', 'unemployment', 'family', 'not-taxable'];
export const PAY_BASES = ['salary', 'hourly'];
export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
export const ITEM_STATES = ['active', 'hidden', 'archived'];
export const LINE_KINDS = ['fixed', 'variable'];
export const LINE_PATHS = ['personal', 'linked', 'reimbursable'];
export const LINE_TAGS = ['planned', 'unavoidable', 'mistake'];
export const DEBT_TYPES = ['credit-card', 'student-loan', 'car-loan', 'personal-loan', 'medical', 'bnpl', 'mortgage', 'other'];
export const COL_TIERS = ['HCOL', 'MCOL', 'LCOL'];
export const LIVING_WITH = ['alone', 'partner', 'roommates', 'family'];

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
    // Hourly pay: gross is computed from the rate and hours, never asked twice.
    payBasis: fields.payBasis || 'salary',
    hourlyRate: makeValue(null, { cadence: 'month' }),
    deductions: [],
    hoursPerWeek: null,
    state: 'active'
  };
}

export const DEDUCTION_KIND_IDS = ['retirement', 'roth', 'health', 'hsa', 'transportation', 'other'];

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
    // Savings the client could put toward the switch (for runway).
    cashOnHand: makeValue(null, { cadence: 'one-off' }),
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
    nextStage: null,
    settings: { singleTotal: false, benchmarkSource: 'eli', lens: 'dollars' },
    passesSeen: []
  };
}
