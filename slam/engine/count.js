// Count first (owner's ask, 2026-10-28): a section opens with a short list of types, each with a count. Setting a
// count makes that many items at once, each a slim row for the first pass; the detail waits behind More detail. A
// count of 0 is "not for me" for that type and counts as complete. One list per collection (debts, accounts,
// income); a type the list does not name is "Other", whose plus opens the add form instead. Pure; no DOM.

import { PRESETS, INCOME_TYPES } from './schema.js';
import { addItem, removeItem } from './edits.js';
import { valueOf as v } from './spine.js';

// { key, label, one, many, add (the type a plus makes; null: the add form), types (the types it counts), cadence? }
const G = (key, label, one, many, add, types, extra = {}) => ({ key, label, one, many, add, types, ...extra });
export const TYPE_GROUPS = {
  debts: [
    G('cards', 'Credit cards', 'card', 'cards', 'credit_card', ['credit_card']),
    G('student', 'Student loans', 'student loan', 'student loans', 'student_loan', ['student_loan', 'private_student_loan']),
    G('car', 'Car loans', 'car loan', 'car loans', 'auto_loan', ['auto_loan']),
    G('mortgage', 'Mortgage', 'mortgage', 'mortgages', 'mortgage', ['mortgage', 'heloc']),
    G('personal', 'Personal or family loans', 'personal loan', 'personal loans', 'personal_loan', ['personal_loan', 'family_iou']),
    G('medical', 'Medical', 'medical bill', 'medical bills', 'medical', ['medical']),
    G('bnpl', 'Buy now pay later', 'buy now pay later plan', 'buy now pay later plans', 'bnpl', ['bnpl']),
    G('other', 'Other', 'other debt', 'other debts', null, [])
  ],
  accounts: [
    G('checking', 'Checking', 'checking account', 'checking accounts', 'checking', ['checking']),
    G('savings', 'Savings or HYSA', 'savings account', 'savings accounts', 'savings', ['savings', 'hysa', 'money_market']),
    G('work', '401(k) or 403(b)', 'plan at work', 'plans at work', 'k401', ['k401', 'roth_k401', 'k403b', 'k457b', 'tsp', 'solo_k401', 'after_tax_k401']),
    G('ira', 'IRA or Roth IRA', 'IRA', 'IRAs', 'roth_ira', ['traditional_ira', 'roth_ira', 'rollover_ira', 'inherited_ira', 'spousal_ira', 'sep_ira', 'simple_ira']),
    G('hsa', 'HSA', 'HSA', 'HSAs', 'hsa', ['hsa']),
    G('brokerage', 'Brokerage', 'brokerage account', 'brokerage accounts', 'brokerage', ['brokerage', 'joint_brokerage', 'espp', 'rsu']),
    G('crypto', 'Crypto', 'crypto account', 'crypto accounts', 'crypto', ['crypto']),
    G('home', 'Home', 'home', 'homes', 'home', ['home', 'rental']),
    G('car', 'Car', 'car', 'cars', 'car', ['car']),
    G('other', 'Other', 'other asset', 'other assets', null, [])
  ],
  income: [
    G('w2', 'W-2 job', 'job', 'jobs', 'w2', ['w2', 'tips'], { label1: 'Paycheck', cadence: 'biweekly' }),
    G('self', 'Self-employed or side income', 'self-employed line', 'self-employed lines', '1099', ['1099', 'side'], { label1: 'Self-employed pay', cadence: 'monthly' }),
    G('benefits', 'Benefits', 'benefit', 'benefits', 'unemployment', ['unemployment', 'ss'], { label1: 'Unemployment benefit', cadence: 'weekly' }),
    G('other', 'Other', 'other income', 'other income lines', null, [])
  ]
};
export const COLLECTION_OF = { debt: 'debts', assets: 'accounts', income: 'income' };

// Every type a collection can hold, for the Other group: what no named group counts.
function allTypes(collection) {
  if (collection === 'income') return INCOME_TYPES;
  return Object.keys(PRESETS).filter((k) => (collection === 'debts') === (PRESETS[k].family === 'debt'));
}
export function groupsOf(collection) {
  const groups = TYPE_GROUPS[collection];
  if (!groups) throw new Error('No count list for ' + collection);
  const named = new Set(groups.flatMap((g) => g.types));
  return groups.map((g) => (g.key === 'other' ? { ...g, types: allTypes(collection).filter((t) => !named.has(t)) } : g));
}
export const groupOf = (collection, key) => groupsOf(collection).find((g) => g.key === key) || null;
// The group an item belongs to.
export const groupFor = (collection, item) => groupsOf(collection).find((g) => g.types.includes(item.type)) || groupOf(collection, 'other');

// countsOf(spine, collection) -> [{ ...group, n, items }], in list order; items in the order the household holds them.
export function countsOf(spine, collection) {
  const list = spine[collection] || [];
  return groupsOf(collection).map((g) => { const items = list.filter((x) => g.types.includes(x.type)); return { ...g, n: items.length, items }; });
}

const nameOf = (collection, x) => (collection === 'income' ? x.label : v(x.name)) || x.id;
// One more of a group: the item is named after its type ("Credit card", then "Credit card 2"), its details blank so
// the row asks for them. A group with no type of its own (Other) has nothing to add here: the add form does that.
export function addToGroup(spine, collection, key, today) {
  const g = groupOf(collection, key);
  if (!g || !g.add) throw new Error('Nothing to add for ' + key);
  const have = (spine[collection] || []).filter((x) => g.types.includes(x.type)).length;
  const base = g.label1 || PRESETS[g.add].label;
  const label = have ? base + ' ' + (have + 1) : base;
  const r = addItem(spine, { collection, type: g.add, label, cadence: g.cadence || 'monthly' }, today);
  return { spine: r.spine, id: r.id, label, firstPath: r.firstPath };
}
// One fewer: the group's last item goes (Undo brings it back). Returns { spine, id, label }, or null when it is at 0.
export function removeLastOf(spine, collection, key) {
  const g = groupOf(collection, key);
  if (!g) throw new Error('No group ' + key);
  const items = (spine[collection] || []).filter((x) => g.types.includes(x.type));
  if (!items.length) return null;
  const last = items[items.length - 1];
  return { spine: removeItem(spine, collection, last.id), id: last.id, label: nameOf(collection, last) };
}

// "3 cards, 1 car loan" for the groups with something in them; "nothing yet" with none.
export function countWords(spine, collection) {
  const parts = countsOf(spine, collection).filter((g) => g.n).map((g) => g.n + ' ' + (g.n === 1 ? g.one : g.many));
  return parts.length ? parts.join(', ') : 'nothing yet';
}
