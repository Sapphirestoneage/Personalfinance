import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQuick, readQuick, quickRow, QUESTIONS, HEADLINE, QUICK_LIB } from '../../engine/quickstart.js';
import { compute } from '../../engine/compute.js';
import { createRecord } from '../../engine/record.js';
import { isNoneRow } from '../../engine/fields.js';
import { loadData } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12';
const fresh = () => createRecord();
const rows = (rec, p, t) => rec.planets[p].rows.filter(r => r.type === t);

test('the four questions are income, debt, expenses, assets, in that order, and every kind names a real row type', () => {
  assert.deepEqual(QUESTIONS.map(q => q.id), ['income', 'debt', 'expenses', 'assets']);
  QUESTIONS.forEach(q => q.kinds.forEach(([kind]) => { const type = q.id === 'assets' ? kind.split(':')[0] : q.id === 'expenses' ? 'line' : kind; assert.ok(data.fields.planets[q.planet].types[type], q.id + ' ' + kind); }));
  HEADLINE.forEach(id => assert.ok(data.metrics.metrics.find(m => m.id === id), id));
});

test('a rough income lands as a rough W-2 row with its cadence; a birth year lands rough', () => {
  const rec = fresh();
  applyQuick(rec, { birth: '1996', income: { has: true, kinds: { w2: { picked: true, said: '3600 a paycheck' } } } }, data, { today: TODAY });
  const job = rows(rec, 'income', 'w2')[0];
  assert.ok(job); assert.equal(job.lib, QUICK_LIB); assert.equal(job.nickname, 'A job (W-2)');
  assert.equal(job.f.grossPay.v, 360000); assert.equal(job.f.grossPay.state, 'rough'); assert.equal(job.f.grossPay.cad, 'paycheck'); assert.equal(job.f.grossPay.source, 'client');
  assert.equal(rec.sun.f.birthDate.v, '1996-07-01'); assert.equal(rec.sun.f.birthDate.state, 'rough');
  const R = compute(rec, data, { today: TODAY });
  assert.equal(R.metrics.takeHome.status, 'ok');
  assert.notEqual(R.metrics.fiNumber.status, 'ok', 'no spending yet, so no FI number');
});

test('No marks every kind of the room None; Yes again clears those None rows; re-applying never duplicates', () => {
  const rec = fresh();
  applyQuick(rec, { debt: { has: false } }, data, { today: TODAY });
  ['card', 'student', 'auto', 'mortgage', 'personal'].forEach(t => { const r = rows(rec, 'debt', t); assert.equal(r.length, 1, t); assert.ok(isNoneRow(data.fields, r[0]), t); });
  const R = compute(rec, data, { today: TODAY });
  assert.equal(R.metrics.totalDebt.status, 'ok'); assert.equal(R.metrics.totalDebt.value.cents, 0);
  applyQuick(rec, { debt: { has: true, kinds: { card: { picked: true, said: '2,400', extras: { apr: '24', minimum: '60' } } } } }, data, { today: TODAY });
  assert.equal(rows(rec, 'debt', 'student').length, 0, 'the None rows go when the answer turns to Yes');
  const card = rows(rec, 'debt', 'card'); assert.equal(card.length, 1);
  assert.equal(card[0].f.balance.v, 240000); assert.equal(card[0].f.balance.state, 'rough'); assert.equal(card[0].f.apr.v, 0.24); assert.equal(card[0].f.minimum.v, 6000);
  applyQuick(rec, { debt: { has: true, kinds: { card: { picked: true, said: '2,600', extras: { apr: '24', minimum: '60' } } } } }, data, { today: TODAY });
  assert.equal(rows(rec, 'debt', 'card').length, 1); assert.equal(rows(rec, 'debt', 'card')[0].f.balance.v, 260000);
  applyQuick(rec, { debt: { has: true, kinds: { card: { picked: false, said: '2,600' } } } }, data, { today: TODAY });
  assert.equal(rows(rec, 'debt', 'card').length, 0, 'an unpicked kind loses its quick row');
});

test('expenses are the rough total plus optional lines by area; assets are typed bank and investing rows; six numbers light', () => {
  const rec = fresh();
  applyQuick(rec, {
    birth: '1996',
    income: { has: true, kinds: { w2: { picked: true, said: '3600 a paycheck' } } },
    debt: { has: false },
    expenses: { said: '4000', kinds: { accommodation: { picked: true, said: '1800' }, wants: { picked: true, said: '300' } } },
    assets: { has: true, kinds: { 'bank:savings': { picked: true, said: '8000' }, 'account:rothIra': { picked: true, said: '12k' } } },
  }, data, { today: TODAY });
  const sum = rows(rec, 'spending', 'summary')[0]; assert.equal(sum.f.summaryTotal.v, 400000); assert.equal(sum.f.summaryTotal.state, 'rough');
  const lines = rows(rec, 'spending', 'line'); assert.equal(lines.length, 2);
  assert.equal(lines.find(l => l.f.category.v === 'accommodation').f.amount.v, 180000); assert.equal(lines.find(l => l.f.category.v === 'wants').f.needWant.v, 'want');
  const bank = rows(rec, 'invest', 'bank')[0]; assert.equal(bank.f.bankType.v, 'savings'); assert.equal(bank.f.accountBalance.v, 800000);
  const roth = rows(rec, 'invest', 'account')[0]; assert.equal(roth.f.accountType.v, 'rothIra'); assert.equal(roth.f.accountBalance.v, 1200000);
  const R = compute(rec, data, { today: TODAY });
  HEADLINE.forEach(id => assert.equal(R.metrics[id].status, 'ok', id));
  /* the screen reads its answers back in the same shape */
  const back = readQuick(rec, data);
  assert.equal(back.birth, '1996'); assert.equal(back.income.has, true); assert.equal(back.income.kinds.w2.said, '3600'); assert.equal(back.debt.has, false);
  assert.equal(back.expenses.said, '4000'); assert.equal(back.assets.kinds['account:rothIra'].said, '12000');
  assert.ok(quickRow(rec, QUESTIONS[3], 'bank:savings', data.fields));
});

test('words still work: none, n/a and don\'t know land as their states', () => {
  const rec = fresh();
  applyQuick(rec, { income: { has: true, kinds: { side: { picked: true, said: "don't know" }, other: { picked: true, said: 'none' } } } }, data, { today: TODAY });
  assert.equal(rows(rec, 'income', 'side')[0].f.grossPay.state, 'unknown');
  assert.equal(rows(rec, 'income', 'other')[0].f.otherIncome.state, 'none');
});
