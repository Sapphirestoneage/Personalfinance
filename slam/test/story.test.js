// Their money in words, and what moves it (S-286). Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { editFact } from '../engine/edits.js';
import { moneySentence, homeLevers, pullLevers, milestones, fiMovers } from '../engine/story.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const T = '2026-10-28';
const sum = (s) => summarize(s, R, { flags: false });

test('one sentence from the engine\'s numbers, "about" when it rests on guesses', () => {
  const s = demo(), x = sum(s);
  const said = moneySentence(s, x);
  assert.equal(said, 'You keep about $1,012 a month after bills and debt payments, you save about 19% of your pay, and at this pace you could stop working about ' + (2026 + Math.round(x.fi.yearsToFi.value)) + '.');
  const exact = { ...x, cashflow: { ...x.cashflow, monthlySurplus: { value: 500, kind: 'known' }, savingsRate: { net: { value: 0.1, kind: 'known' } } }, fi: { ...x.fi, yearsToFi: { value: 10, kind: 'known' } } };
  assert.match(moneySentence(s, exact), /^You keep \$500 a month.*save 10%.*stop working in 2036\.$/);
});

test('sliders: rent, saved a month, pay; the preview moves the FI date; nothing changes until kept', () => {
  const s = demo(), lv = homeLevers(s);
  assert.deepEqual(lv.map((l) => [l.id, l.path, l.now]), [['rent', 'expenses.rent.amount', 1800], ['saved', 'accounts.k401.monthlyContribution', 500], ['pay', 'income.salary.amount', 6000]]);
  const moved = pullLevers(s, lv, { rent: 1200 }, T);
  assert.ok(sum(moved).fi.yearsToFi.value < sum(s).fi.yearsToFi.value, 'lower rent, FI sooner');
  assert.equal(s.expenses.find((e) => e.id === 'rent').amount.value, 1800, 'the household itself is untouched');
  assert.equal(pullLevers(s, lv, { rent: 1200 }, T, 'known').expenses.find((e) => e.id === 'rent').amount.kind, 'known', 'Keep this keeps it as known');
});

test('milestones: a card paid off, a fifth of pay saved; nothing for a small move', () => {
  const s = demo(), paid = editFact(s, 'debts.visa.balance', 'set', { value: 0, today: T });
  assert.ok(milestones(sum(s), sum(paid), s, paid).includes('Visa is paid off.'));
  const more = editFact(s, 'accounts.k401.monthlyContribution', 'set', { value: 700, today: T });
  assert.ok(milestones(sum(s), sum(more), s, more).includes('You save a fifth of your pay.'));
  const tiny = editFact(s, 'expenses.rent.amount', 'set', { value: 1795, today: T });
  assert.deepEqual(milestones(sum(s), sum(tiny), s, tiny), []);
});

test('what moved the FI date since the call started, biggest first', () => {
  const s = demo();
  let n = editFact(s, 'expenses.rent.amount', 'set', { value: 1200, today: T });
  n = editFact(n, 'expenses.dining.amount', 'set', { value: (n.expenses.find((e) => e.id === 'dining').amount.value || 0) + 20, today: T });
  const r = fiMovers(s, n, R);
  assert.equal(r.movers[0].path, 'expenses.rent.amount');
  assert.ok(r.movers[0].years > 0, 'without the rent cut, FI would be later');
  assert.ok(r.yearsNow < r.yearsStart);
});
