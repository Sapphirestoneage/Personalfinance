// Shared bills with arrangements, and Owed to you (engine/owed.js). Every person and household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { validate } from '../engine/schema.js';
import { fact } from '../engine/spine.js';
import * as O from '../engine/owed.js';

const R = loadRules();
const T = '2026-10-27';
// The demo without its own shared bill and loan, so each test sets up only what it checks.
const demo = () => {
  const s = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  delete s.lent;
  s.expenses = s.expenses.map((e) => { if (e.id !== 'streaming') return e; const x = { ...e }; for (const k of ['shared', 'whoPays', 'sharers']) delete x[k]; return x; });
  return s;
};
const F = (x) => fact(x, { kind: 'known', asOf: '2026-01-01', source: 'test' });
// A $22 streaming bill on the 5th, paid in full by you; Sam and Jo share it.
function withBill(people, whoPays = 'whole', asOf = T) {
  const s = demo();
  s.meta = { ...s.meta, asOf };
  s.expenses = [...s.expenses.filter((e) => e.id !== 'tv'), { id: 'tv', label: 'Netflix', amount: F(22), cadence: 'monthly', fat: null, payDay: F(5) }];
  return O.setSharers(s, 'tv', people, whoPays, '2026-01-01');
}
const status = (s, i = 0, asOf = s.meta.asOf) => { const e = s.expenses.find((x) => x.id === 'tv'), arr = O.arrangementOf(s, e); return O.personStatus(s, e, arr, arr.people[i], asOf); };

test('the bill shows what leaves, your part, and what comes back; your part is what is left after theirs', () => {
  const s = withBill([{ name: 'Sam', share: { mode: 'amount', value: 9 } }, { name: 'Jo', share: { mode: 'amount', value: 9 } }]);
  const e = s.expenses.find((x) => x.id === 'tv');
  const sum = summarize(s, R, { flags: false });
  const line = sum.cashflow.expenses.items.find((x) => x.id === 'tv');
  assert.equal(line.amount, 4, 'your share: $22 less $9 and $9');
  assert.equal(O.yourPart(O.arrangementOf(s, e), 22), 4 / 22);
  assert.ok(validate(s).ok, validate(s).errors.map((x) => x.path + ' ' + x.message).join('\n'));
  // A family plan: $30 for one line, $45 for another.
  const fam = withBill([{ name: 'Mom', share: { mode: 'amount', value: 30 } }, { name: 'Dad', share: { mode: 'amount', value: 45 } }]);
  fam.expenses = fam.expenses.map((x) => (x.id === 'tv' ? { ...x, amount: F(100) } : x));
  assert.equal(summarize(fam, R, { flags: false }).cashflow.expenses.items.find((x) => x.id === 'tv').amount, 25);
});

test('each time: owes every charge until marked paid; a partial payment leaves the rest owed', () => {
  const s = withBill([{ name: 'Sam', share: { mode: 'amount', value: 9 }, payBack: 'each', since: '2026-08-01', paidThrough: '2026-08-31' }], 'whole');
  const st = status(s);
  assert.deepEqual(st.charges.map((c) => c.date), ['2026-09-05', '2026-10-05']);
  assert.equal(st.owed, 18);
  assert.equal(st.status, 'Owes $18 since Sep');
  const part = O.markPaid(s, 'tv', 'p1', 10, { today: T });
  const after = status(part);
  assert.equal(after.owed, 8, '$10 paid of $18: $8 still owed');
  assert.deepEqual(after.charges.map((c) => c.date), ['2026-10-05'], 'the oldest charge is settled first');
  assert.equal(O.owedToYou(part).find((x) => x.name === 'Sam').total, 8);
});

test('paid ahead counts down by month and owes again after it', () => {
  const s = withBill([{ name: 'Jo', share: { mode: 'even' }, payBack: 'ahead', since: '2026-01-01', paidThrough: '2027-01-31' }]);
  assert.equal(status(s).status, 'Covered through Jan 2027');
  assert.equal(status(s).owed, 0);
  assert.equal(status(s).askOn, '2027-02-01', 'ask the day after');
  // Two months later than the paid-through day, two charges are owed.
  const later = status(s, 0, '2027-03-10');
  assert.deepEqual(later.charges.map((c) => c.date), ['2027-02-05', '2027-03-05']);
  assert.equal(later.owed, 22);
});

test('every few months and once a year ask on their own days; I cover them is my cost, never owed', () => {
  const s = withBill([{ name: 'Sam', share: { mode: 'amount', value: 9 }, payBack: 'every', every: 3, start: '2026-09-01', since: '2026-09-01', paidThrough: '2026-08-31' }]);
  assert.equal(status(s).askOn, '2026-12-01', 'Sep to Nov, asked at the end of the 3 months');
  const y = withBill([{ name: 'Gran', share: { mode: 'amount', value: 9 }, payBack: 'yearly', month: 12, since: '2026-10-01', paidThrough: '2026-09-30' }]);
  assert.equal(status(y).askOn, '2026-12-01');
  const c = withBill([{ name: 'Kid', share: { mode: 'amount', value: 9 }, payBack: 'cover' }]);
  assert.equal(status(c).owed, 0);
  assert.equal(summarize(c, R, { flags: false }).cashflow.expenses.items.find((x) => x.id === 'tv').amount, 22, 'their part counts as yours');
  assert.equal(O.askMessage({ label: 'Netflix' }, {}, { charges: [{ date: '2026-09-05' }, { date: '2026-11-05' }], owed: 13 }), 'Hey! Your share of Netflix for Sep to Nov is $13.');
});

test('owed money counts in total net worth, never as cash, until it lands', () => {
  const base = withBill([{ name: 'Sam', share: { mode: 'amount', value: 9 }, payBack: 'each', since: '2026-08-01', paidThrough: '2026-08-31' }]);
  const s = O.addLent(base, { person: 'Riley', amount: 200, date: '2026-10-01' }, T);
  const plain = withBill([{ name: 'Sam', share: { mode: 'amount', value: 9 }, payBack: 'cover' }]);
  const a = summarize(s, R, { flags: false }).sheet, b = summarize(plain, R, { flags: false }).sheet;
  assert.equal(a.owed, 218);
  assert.equal(a.netWorth.value, b.netWorth.value + 218);
  assert.equal(a.liquidNetWorth.value, b.liquidNetWorth.value, 'not cash');
  assert.equal(cashsim(s, R, { months: 2 }).safeToSpend.today, cashsim(plain, R, { months: 2 }).safeToSpend.today, 'never in safe to spend');
  // Marked paid into checking: now it is cash.
  const landed = O.settleUp(s, 'riley', { today: T, into: 'chk' });
  assert.equal(summarize(landed, R, { flags: false }).sheet.liquidNetWorth.value, a.liquidNetWorth.value + 200);
  assert.equal(summarize(landed, R, { flags: false }).sheet.owed, 18);
  // A gift is never owed.
  assert.equal(O.owedToYou(O.setLentKind(s, s.lent[0].id, 'gift')).some((x) => x.name === 'Riley'), false);
});

test('an old shared bill loads unchanged: the same cost, read as the same arrangement, nothing owed yet', () => {
  const s = demo();
  const old = { ...s.expenses.find((x) => x.id === 'streaming'), shared: F(true), sharedWith: F(3), whoPays: F('whole') };
  const s1 = { ...s, expenses: s.expenses.map((x) => (x.id === 'streaming' ? old : x)) };
  const arr = O.arrangementOf(s1, old);
  assert.equal(arr.fromOld, true);
  assert.deepEqual(arr.people.map((p) => [p.name, p.share.mode, p.payBack]), [['Person 2', 'even', 'each'], ['Person 3', 'even', 'each']]);
  // The same cost as before, read through the new list.
  const before = summarize(s1, R, { flags: false }).cashflow.expenses.items.find((x) => x.id === 'streaming').amount;
  const moved = O.setSharers(s1, 'streaming', arr.people, arr.whoPays, '2026-01-01');
  assert.equal(summarize(moved, R, { flags: false }).cashflow.expenses.items.find((x) => x.id === 'streaming').amount, before);
  assert.equal(O.owedTotal(s1, s1.meta.asOf), 0);
});

test('the demo shows it off: a family plan with one person paid ahead and one paying every 3 months, and a loan', () => {
  const s = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  const owed = O.owedToYou(s);
  assert.deepEqual(owed.map((x) => [x.name, x.total]), [['Jordan', 150], ['Theo', 26]]);
  const e = s.expenses.find((x) => x.id === 'streaming'), arr = O.arrangementOf(s, e);
  assert.equal(O.personStatus(s, e, arr, arr.people[0], s.meta.asOf).status, 'Covered through Jul 2027');
  assert.equal(O.personStatus(s, e, arr, arr.people[1], s.meta.asOf).askOn, '2026-12-01');
  assert.ok(validate(s).ok, validate(s).errors.map((x) => x.path + ' ' + x.message).join('\n'));
});

test('the Calendar dates the ask: "Ask Theo: $39 for Sep to Nov", a dated item, not money moving', async () => {
  const { calendar } = await import('../engine/calendar.js');
  const s = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  const dec = calendar(s, R, { from: '2026-12', months: 1 }).months[0];
  const ask = dec.events.find((e) => e.kind === 'ask');
  assert.equal(ask.date, '2026-12-01');
  assert.equal(ask.label, 'Ask Theo: $39 for Streaming (family plan), Sep to Nov');
  assert.equal(ask.amount, null);
  assert.equal(ask.note, 'Hey! Your share of Streaming (family plan) for Sep to Nov is $39.');
  // The bill itself (a subscription in the demo, morning answer 6) leaves whole on its day.
  assert.equal(dec.events.find((e) => e.id === 'sub:streaming').amount, 40);
});
