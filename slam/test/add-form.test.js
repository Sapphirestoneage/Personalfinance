// S-237: one add form for every item type, used by the Session and My numbers. The saving is engine/add.js; both
// screens build the same form (ui/add-form.js), so the same answers give the same saved item. Made-up numbers only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { addWithAnswers, firstIncomeType, namePlaceholder, INCOME_FIRST } from '../engine/add.js';
import { setAt } from '../engine/spine.js';

const R = loadRules();
const T = '2026-10-26';
const demo = () => applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: '2026-10-22' }).spine, R);
const add = (spec) => { const r = addWithAnswers(demo(), spec, T); return { r, x: r.spine[r.collection].find((y) => y.id === r.id) }; };
const val = (f) => (f ? f.value : undefined);

test('a paycheck on salary: the amount is the yearly salary, each paycheck worked out', () => {
  const { x } = add({ collection: 'income', type: 'w2', label: 'Hudson Valley Health', amount: 52000, cadence: 'biweekly', answers: { payBasis: 'salary' } });
  assert.equal(val(x.payBasis), 'salary'); assert.equal(val(x.salary), 52000); assert.equal(x.cadence, 'biweekly'); assert.equal(val(x.amount), 2000);
});
test('a paycheck by the hour, and salary plus tips adds its own line', () => {
  const { x } = add({ collection: 'income', type: 'w2', label: 'Cafe', amount: 20, cadence: 'weekly', answers: { payBasis: 'hourly', hoursPerWeek: 30 } });
  assert.equal(val(x.amount), 600);
  const { r } = add({ collection: 'income', type: 'w2', label: 'Bistro', amount: 26000, cadence: 'monthly', answers: { payBasis: 'both' } });
  assert.ok(r.spine.income.some((y) => y.type === 'tips' && y.label === 'Bistro: tips, overtime, commission'));
});
test('1099 steady or in lumps', () => {
  const steady = add({ collection: 'income', type: '1099', label: 'Design work', amount: 3000, cadence: 'monthly', answers: { payBasis: 'steady' } }).x;
  assert.equal(val(steady.payBasis), 'steady'); assert.equal(val(steady.amount), 3000); assert.equal(val(steady.withholding.federal), 0);
  const lumps = add({ collection: 'income', type: '1099', label: 'Gigs', amount: 24000, answers: { payBasis: 'lumpy' } }).x;
  assert.equal(val(lumps.yearTotal), 24000); assert.equal(val(lumps.amount), 2000); assert.equal(lumps.amount.kind, 'rough');
});
test('unemployment: a week, and weeks left or an end date', () => {
  const a = add({ collection: 'income', type: 'unemployment', label: '', amount: 504, answers: { weeksLeft: 10 } }).x;
  assert.equal(a.label, 'Unemployment'); assert.equal(a.cadence, 'weekly'); assert.equal(val(a.amount), 504); assert.equal(a.end, '2027-01-04');
  assert.equal(add({ collection: 'income', type: 'unemployment', amount: 504, answers: { endDate: '2027-02-01' } }).x.end, '2027-02-01');
});
test('money from a person: who and what for; a loan is a debt', () => {
  const g = add({ collection: 'income', type: 'person', label: 'Help from home', amount: 300, answers: { from: 'Parents', purpose: 'gift' } }).x;
  assert.equal(val(g.from), 'Parents'); assert.equal(val(g.purpose), 'gift');
  const { r } = add({ collection: 'income', type: 'person', label: 'Loan', amount: 1500, answers: { from: 'Family', purpose: 'loan' } });
  assert.equal(r.collection, 'debts'); assert.equal(r.spine.debts.find((d) => d.id === r.id).balance.value, 1500);
});
test('a blank amount stays missing, never $0; other kinds save their amount', () => {
  assert.equal(add({ collection: 'income', type: 'side', label: 'Tutoring' }).x.amount.kind, 'missing');
  assert.equal(add({ collection: 'expenses', label: 'Rent', amount: 1400, cadence: 'monthly', fat: 'accommodation' }).x.amount.value, 1400);
  assert.equal(add({ collection: 'debts', type: 'credit_card', label: 'Chase Freedom', amount: 900 }).x.balance.value, 900);
});
test('the situation sets the first choice', () => {
  const sit = (value) => setAt(demo(), 'household.situation', [{ id: 'now', from: null, value: { value, kind: 'known' } }]);
  assert.equal(firstIncomeType(sit('between_jobs'), T), 'unemployment');
  assert.equal(firstIncomeType(sit('self_employed'), T), '1099');
  assert.equal(firstIncomeType(sit('employed'), T), 'w2');
});
test('placeholders match the item; no raw codes in what the form shows', () => {
  assert.match(namePlaceholder('income'), /Hudson Valley Health/);
  assert.match(namePlaceholder('expenses'), /Rent/);
  assert.match(namePlaceholder('debts', 'credit_card'), /Chase Freedom/);
  assert.match(namePlaceholder('accounts', 'savings'), /Chase savings/);
  for (const [, w] of INCOME_FIRST) assert.doesNotMatch(w, /^(w2|1099|monthly)$/);
  const src = readFileSync(new URL('../ui/add-form.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /words\(t\)/);
});
test('My numbers uses the one form; the Session saves as it is typed, with no Add form (owner, 2026-10-28)', () => {
  const ledger = readFileSync(new URL('../ui/ledger.js', import.meta.url), 'utf8');
  assert.match(ledger, /from '\.\/add-form\.js'/);
  const guide = readFileSync(new URL('../ui/guide.js', import.meta.url), 'utf8');
  assert.doesNotMatch(guide, /from '\.\/add-form\.js'/);
  assert.doesNotMatch(guide, /'\+ Add (income|a goal)'/);
  for (const f of [ledger, guide]) assert.doesNotMatch(f, /Name, for example Chase Freedom/);
});

test('the account picker: grouped, the 401(k)s together and the IRAs together, Roth a tick box (S-262)', () => {
  const src = readFileSync(new URL('../ui/add-form.js', import.meta.url), 'utf8');
  assert.match(src, /\['401\(k\) and workplace plans', \['k401', 'solo_k401', 'after_tax_k401', 'k403b', 'k457b', 'tsp'\]\]/);
  assert.match(src, /\['IRAs', \['traditional_ira', 'rollover_ira', 'spousal_ira', 'inherited_ira', 'sep_ira', 'simple_ira'\]\]/);
  assert.match(src, /const ROTH_OF = \{ k401: 'roth_k401', traditional_ira: 'roth_ira' \};/);
  assert.match(src, /h\('optgroup', \{ label: g \}/);
});
