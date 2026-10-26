// Quick add (S-193): a first step that lists the usual accounts,
// cards, loans, income and bills. Each one ticked is added with its fields
// missing, so the Ledger then asks for the details. One step, one Undo.

import { addItem, editExpense } from './edits.js';
import { setAt } from './spine.js';

const A = (type, label, many = false) => ({ key: type, label, collection: 'accounts', type, many });
const D = (type, label, many = false) => ({ key: type, label, collection: 'debts', type, many });
const I = (type, label) => ({ key: 'in-' + type, label, collection: 'income', type, many: true });
const E = (label, fat = null, extra = {}) => ({ key: 'ex-' + label.toLowerCase().replace(/[^a-z]+/g, '-'), label, collection: 'expenses', fat, many: false, ...extra });

export const STARTER = [
  { group: 'Bank accounts', items: [A('checking', 'Checking', true), A('savings', 'Savings', true), A('hysa', 'High-yield savings', true), A('money_market', 'Money market', true)] },
  { group: 'Cards and loans', items: [D('credit_card', 'Credit card', true), D('student_loan', 'Federal student loan', true), D('private_student_loan', 'Private student loan', true), D('auto_loan', 'Car loan', true), D('mortgage', 'Mortgage'), D('personal_loan', 'Personal loan', true), D('bnpl', 'Buy now, pay later', true), D('medical', 'Medical bill', true), D('family_iou', 'Money owed to family or friends', true)] },
  { group: 'Saving and investing', items: [A('k401', '401(k)'), A('k403b', '403(b)'), A('roth_ira', 'Roth IRA'), A('traditional_ira', 'Traditional IRA'), A('hsa', 'HSA'), A('brokerage', 'Brokerage account', true), A('crypto', 'Crypto'), A('k529', '529 college savings')] },
  { group: 'Things you own', items: [A('car', 'Car', true), A('home', 'Home')] },
  { group: 'Income', items: [I('w2', 'A paycheck (W-2)'), I('1099', 'Freelance or contract (1099)'), I('unemployment', 'Unemployment'), I('tips', 'Tips'), I('side', 'Side money (not 1099)'), I('person', 'Money from a person')] },
  { group: 'Regular bills', items: [
    E('Rent', 'accommodation'), E('Utilities', 'accommodation'), E('Internet', 'accommodation'), E('Renters insurance', 'accommodation'),
    E('Groceries', 'food'), E('Eating out', 'food'),
    E('Gas', 'transportation'), E('Transit', 'transportation'), E('Car insurance', 'transportation'),
    E('Phone'), E('Health insurance'), E('Medical and prescriptions'), E('Gym'), E('Streaming and apps', null, { subscription: true }), E('Charity'), E('Pets'), E('Childcare'), E('Personal care'), E('Clothes')
  ] }
];
const BY_KEY = new Map(STARTER.flatMap((g) => g.items).map((x) => [x.key, x]));

// How many of each the household already has, to show beside the choices.
export function haveCounts(spine) {
  const n = new Map();
  for (const a of spine.accounts || []) n.set(a.type, (n.get(a.type) || 0) + 1);
  for (const d of spine.debts || []) n.set(d.type, (n.get(d.type) || 0) + 1);
  for (const s of spine.income || []) n.set('in-' + s.type, (n.get('in-' + s.type) || 0) + 1);
  for (const e of spine.expenses || []) { const k = 'ex-' + String(e.label).toLowerCase().replace(/[^a-z]+/g, '-'); n.set(k, (n.get(k) || 0) + 1); }
  return n;
}

// picks: [{ key, count }]. Returns { spine, added: [first paths], count }.
export function addPicked(spine, picks, today) {
  let s = spine;
  const added = [];
  for (const { key, count = 1 } of picks) {
    const x = BY_KEY.get(key);
    if (!x) throw new Error('Not a starter choice: ' + key);
    for (let k = 1; k <= Math.max(1, count); k++) {
      const label = count > 1 ? x.label + ' ' + k : x.label;
      const r = addItem(s, { collection: x.collection, type: x.collection === 'expenses' ? undefined : x.type, label, fat: x.fat }, today);
      s = r.spine;
      if (x.subscription) s = editExpense(s, r.id, { amount: null, cadence: 'monthly', subscription: true, kind: 'known' }, today);
      added.push(r.firstPath);
    }
  }
  return { spine: s, added, count: added.length };
}
