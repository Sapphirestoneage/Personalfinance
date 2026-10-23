import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQuick, readQuick, quickRow, picture, intervalToStored, INTERVALS, INCOME_INTERVALS, SPEND_INTERVALS, QUESTIONS, HEADLINE, QUICK_LIB } from '../../engine/quickstart.js';
import { toMonthly, hourlyToMonthly } from '../../engine/parse.js';
import { addMonths } from '../../engine/debtsim.js';
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

test('the picture (MR-085): runway, the buffer target, and the month it is full at the current pace', () => {
  const rec = fresh();
  assert.deepEqual(picture(compute(rec, data, { today: TODAY }), 3).needs, ['income', 'monthly expenses', 'cash on hand']);
  applyQuick(rec, { income: { has: true, kinds: { w2: { picked: true, said: '4000 a month' } } }, expenses: { said: '3000' }, assets: { has: true, kinds: { 'bank:savings': { picked: true, said: '6000' } } } }, data, { today: TODAY });
  const P0 = picture(compute(rec, data, { today: TODAY }), 3); assert.equal(P0.surplus, null); assert.equal(P0.needs.length, 1, 'what is left over waits on the debt answer: ' + P0.needs.join(', ')); assert.ok(!P0.stuck && P0.by === null);
  applyQuick(rec, { debt: { has: false } }, data, { today: TODAY });
  const R = compute(rec, data, { today: TODAY }); const P = picture(R, 3);
  assert.deepEqual(P.needs, []); assert.equal(P.spending, 300000); assert.equal(P.cash, 600000); assert.equal(P.runway, 2); assert.equal(P.target, 900000); assert.equal(P.shortBy, 300000);
  assert.ok(P.surplus > 0 && P.surplus < 100000, 'take-home on 4,000 gross leaves under 1,000 after 3,000 out');
  assert.equal(P.monthsTo, Math.ceil(300000 / P.surplus)); assert.equal(P.by, addMonths('2026-10', P.monthsTo)); assert.ok(!P.there && !P.stuck);
  const P6 = picture(R, 6); assert.equal(P6.target, 1800000); assert.ok(P6.monthsTo > P.monthsTo);
  const P1 = picture(R, 1); assert.ok(P1.there && P1.shortBy === 0 && P1.monthsTo === 0);
  applyQuick(rec, { expenses: { said: '4500' } }, data, { today: TODAY });
  const Ps = picture(compute(rec, data, { today: TODAY }), 3); assert.ok(Ps.stuck && Ps.by === null, 'spending above take-home: the buffer never grows');
});

test('an amount and its interval (MR-089): the pick beside the box is the cadence; hourly pay becomes a month through one formula', () => {
  assert.deepEqual(INTERVALS.map(i => i[0]), ['month', 'year', 'biweekly', 'week', 'day', 'hour']);
  assert.ok(INCOME_INTERVALS.includes('hour') && !SPEND_INTERVALS.includes('hour'));
  QUESTIONS.forEach(q => { if (q.intervals) q.intervals.forEach(i => assert.ok(INTERVALS.some(x => x[0] === i), q.id + ' ' + i)); });
  assert.deepEqual(intervalToStored(200000, 'biweekly', null), { cents: 200000, cad: 'biweekly', hours: null });
  assert.deepEqual(intervalToStored(2000, 'hour', 35), { cents: hourlyToMonthly(2000, 35), cad: 'month', hours: 35 });
  assert.equal(intervalToStored(2000, 'hour', null).hours, 40);
  assert.equal(toMonthly(100000, 'biweekly'), Math.round(100000 * 26 / 12)); assert.equal(toMonthly(1000, 'day'), Math.round(1000 * 365 / 12));
  const rec = fresh();
  applyQuick(rec, {
    income: { has: true, kinds: { w2: { picked: true, said: '2000', cad: 'biweekly' }, side: { picked: true, said: '20', cad: 'hour', hours: 10 } } },
    expenses: { said: '3000', cad: 'month', kinds: { food: { picked: true, said: '150', cad: 'week' } } },
  }, data, { today: TODAY });
  const job = rows(rec, 'income', 'w2')[0]; assert.equal(job.f.grossPay.v, 200000); assert.equal(job.f.grossPay.cad, 'biweekly');
  const side = rows(rec, 'income', 'side')[0]; assert.equal(side.f.grossPay.v, hourlyToMonthly(2000, 10)); assert.equal(side.f.grossPay.cad, 'month'); assert.equal(side.f.hoursPaid.v, 10);
  const food = rows(rec, 'spending', 'line').find(l => l.f.category.v === 'food'); assert.equal(food.f.amount.v, 15000); assert.equal(food.f.amount.cad, 'week');
  const R = compute(rec, data, { today: TODAY });
  assert.equal(R.sun.outputs.income.grossMonthly.cents, Math.round(200000 * 26 / 12) + hourlyToMonthly(2000, 10), 'every two weeks and hourly both land as months');
  const back = readQuick(rec, data);
  assert.equal(back.income.kinds.w2.cad, 'biweekly'); assert.equal(back.income.kinds.side.cad, 'hour'); assert.equal(back.income.kinds.side.said, '20'); assert.equal(back.income.kinds.side.hours, 10);
  assert.equal(back.expenses.cad, 'month'); assert.equal(back.expenses.kinds.food.cad, 'week');
  /* the words typed still name an interval when no pick is given */
  applyQuick(rec, { income: { has: true, kinds: { w2: { picked: true, said: '52k a year' } } } }, data, { today: TODAY });
  assert.equal(rows(rec, 'income', 'w2')[0].f.grossPay.cad, 'year');
});

test('before tax or after tax (MR-095): after-tax pay lands in Take-home and the gross side goes back to unknown; the screen reads the basis back', () => {
  const rec = fresh();
  applyQuick(rec, { income: { has: true, kinds: { w2: { picked: true, said: '4000', cad: 'biweekly', basis: 'net' } } } }, data, { today: TODAY });
  const job = rows(rec, 'income', 'w2')[0];
  assert.equal(job.f.takeHome.v, 400000); assert.equal(job.f.takeHome.cad, 'biweekly'); assert.equal(job.f.takeHome.state, 'rough');
  assert.ok(!job.f.grossPay || job.f.grossPay.v === null, 'gross stays unknown');
  const R = compute(rec, data, { today: TODAY });
  assert.equal(R.metrics.takeHome.value.cents, Math.round(400000 * 26 / 12), 'the typed take-home is the take-home');
  assert.equal(readQuick(rec, data).income.kinds.w2.basis, 'net'); assert.equal(readQuick(rec, data).income.kinds.w2.said, '4000');
  applyQuick(rec, { income: { has: true, kinds: { w2: { picked: true, said: '5000', cad: 'biweekly', basis: 'gross' } } } }, data, { today: TODAY });
  assert.equal(job.f.grossPay.v, 500000); assert.equal(job.f.takeHome.v, null, 'switching back clears the quick take-home');
  assert.equal(readQuick(rec, data).income.kinds.w2.basis, 'gross');
});
