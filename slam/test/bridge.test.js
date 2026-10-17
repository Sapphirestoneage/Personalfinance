// Part 5 of the monthly loop: the budget-to-cash bridge (S-088), by hand.
//
// October 2026. Take-home 4,000 a month. Accounts at the start: checking 2,000,
// savings 5,000, Visa 500 owed (linked to the Visa debt, minimum 40).
// Budget actuals: rent 1,500 (typed); groceries 400 from the log (300 on the
// Visa, 100 from checking); car insurance is yearly (1,200 a year, due Oct 14),
// so the budget holds its share, 100, and the 1,200 payment is in the log;
// emergency fund 200 (typed, moved to savings by a transfer); shopping 60: a
// 120 concert from checking, 60 of it owed back by a friend; a 250 couch is a
// one-off; Debt payments 40 (the Visa minimum).
// Spending 1,500 + 400 + 100 + 60 + 40 = 2,100; savings 200; surplus 4,000 - 2,300 = 1,700.
// Income in the log: 2,000 + 2,000 + a 300 bonus = 4,300. The Visa was paid 450 from checking.
// Checking end: 2,000 + 4,300 - 100 - 1,200 - 200 - 120 - 250 - 450 - 1,500 rent = 2,480.
// Savings end 5,200. Visa end 500 + 300 - 450 = 350.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { addAccount, setBalance } from '../src/store/accounts.js';
import { addDebt, findLine } from '../src/store/edits.js';
import { addEntry, editEntry } from '../src/store/log.js';
import { closeMonth } from '../src/store/months.js';
import { bridgeFor } from '../src/calc/bridge.js';
import { buildSummary, closeMonthSnapshot } from '../src/calc/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();
const one = (a) => makeValue(a, { cadence: 'one-off' });

function october(opts = {}) {
  const raw = newHousehold('Bridge');
  raw.currentMonth = '2026-10';
  raw.income.push({ id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: makeValue(4000), gross: makeValue(), deductions: [], state: 'active' });
  const d = migrate(raw);
  const visa = addDebt(d, { label: 'Visa', type: 'credit-card' });
  visa.minimum = makeValue(40);
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  addAccount(d, { id: 'sav', name: 'Savings', type: 'savings' });
  addAccount(d, { id: 'visa', name: 'Visa', type: 'credit-card' });
  setBalance(d, '2026-10', 'chk', 'start', one(2000));
  setBalance(d, '2026-10', 'sav', 'start', one(5000));
  setBalance(d, '2026-10', 'visa', 'start', one(500));
  findLine(d, 'rent').line.actual = makeValue(1500);
  findLine(d, 'emergency-fund').line.actual = makeValue(200);
  const ins = findLine(d, 'car-insurance').line;
  ins.estimate = makeValue(1200, { cadence: 'year' });
  ins.dueMonth = one(10);
  ins.dueDay = one(14);
  addEntry(d, { date: '2026-10-01', amount: -2000, kind: 'income', account: 'chk' });
  addEntry(d, { date: '2026-10-15', amount: -2000, kind: 'income', account: 'chk' });
  addEntry(d, { date: '2026-10-20', amount: -300, kind: 'income', account: 'chk', note: 'bonus' });
  addEntry(d, { date: '2026-10-05', amount: 300, lineId: 'groceries', account: 'visa' });
  addEntry(d, { date: '2026-10-06', amount: 100, lineId: 'groceries', account: 'chk' });
  addEntry(d, { date: '2026-10-14', amount: 1200, lineId: 'car-insurance', account: 'chk', merchant: 'Geico' });
  addEntry(d, { date: '2026-10-03', amount: 200, kind: 'transfer', account: 'chk', note: 'to savings' });
  addEntry(d, { date: '2026-10-03', amount: -200, kind: 'transfer', account: 'sav', note: 'from checking' });
  const concert = addEntry(d, { date: '2026-10-10', amount: 120, lineId: 'shopping', account: 'chk', merchant: 'Ticketmaster' });
  editEntry(d, concert.id, { owed: 60 });
  const couch = addEntry(d, { date: '2026-10-12', amount: 250, lineId: 'shopping', account: 'chk', merchant: 'Couch' });
  editEntry(d, couch.id, { oneOff: true });
  addEntry(d, { date: '2026-10-25', amount: 450, kind: 'card-payment', account: 'chk' });
  addEntry(d, { date: '2026-10-25', amount: -450, kind: 'card-payment', account: 'visa' });
  if (opts.atm) addEntry(d, { date: '2026-10-28', amount: 60, account: 'chk', merchant: 'ATM withdrawal' });
  setBalance(d, '2026-10', 'chk', 'end', one(opts.atm ? 2420 : 2480));
  if (!opts.noSavingsEnd) setBalance(d, '2026-10', 'sav', 'end', one(5200));
  setBalance(d, '2026-10', 'visa', 'end', one(350));
  return d;
}

const stepsOf = (br) => Object.fromEntries(br.steps.map((s) => [s.key, s.amount]));

test('a month that ties: every step by hand', () => {
  const d = october();
  assert.deepEqual(validateHousehold(d), []);
  const s = buildSummary(d, refs);
  const br = bridgeFor(d, s.income, '2026-10');
  assert.equal(br.surplus, 1700);
  assert.deepEqual(stepsOf(br), {
    yearly: -1100,     // share 100 in the budget - 1,200 paid
    'set-aside': 200,  // emergency fund 200, no entry paid it out
    cards: -150,       // Visa 500 -> 350
    'card-min': 40,    // the Visa minimum in Debt payments
    owed: -60,         // the friend's half of the concert
    'one-off': -250,   // the couch
    income: 300        // 4,300 landed vs 4,000 take-home
  });
  // 1,700 - 1,100 + 200 - 150 + 40 - 60 - 250 + 300 = 680
  assert.equal(br.explained, 680);
  // cash 2,000 + 5,000 = 7,000 -> 2,480 + 5,200 = 7,680: +680
  assert.deepEqual([br.cashStart, br.cashEnd, br.actual, br.unexplained, br.ties], [7000, 7680, 680, 0, true]);
  assert.equal(br.reading, 'Your budget showed $1,700 left, but cash went up $680. The car insurance bill ($1,200) came due this month.');
  // $0 steps are hidden: no reimbursements were received for earlier months
  assert.equal(br.steps.some((x) => x.key === 'received'), false);
});

test('a month that does not tie: $60 of ATM cash not mapped', () => {
  const d = october({ atm: true });
  const br = bridgeFor(d, buildSummary(d, refs).income, '2026-10');
  // The ATM 60 is not in the budget (no line), so explained stays 680; cash 7,620 - 7,000 = 620
  assert.deepEqual([br.explained, br.actual, br.unexplained, br.ties], [680, 620, -60, false]);
  assert.equal(br.reading, 'Your budget showed $1,700 left, but cash went up $620. The car insurance bill ($1,200) came due this month. $60 is not explained yet.');
});

test('explained + not explained yet = the actual change in cash', () => {
  for (const opts of [{}, { atm: true }]) {
    const d = october(opts);
    const br = bridgeFor(d, buildSummary(d, refs).income, '2026-10');
    assert.ok(Math.abs(br.explained + br.unexplained - br.actual) < 0.005);
  }
});

test('a missing balance: it says which one and stops at explained', () => {
  const d = october({ noSavingsEnd: true });
  const br = bridgeFor(d, buildSummary(d, refs).income, '2026-10');
  assert.deepEqual([br.explained, br.actual, br.unexplained], [680, null, null]);
  assert.equal(br.reading, 'Your budget showed $1,700 left. The change in cash needs Savings end balance.');
});

test('after close the bridge reads the locked snapshot and gives the same answer', () => {
  const d = october();
  const s = buildSummary(d, refs);
  closeMonth(d, closeMonthSnapshot(s), '2026-11-01T09:00:00Z');
  const br = bridgeFor(d, buildSummary(d, refs).income, '2026-10');
  assert.equal(br.closed, true);
  assert.deepEqual([br.surplus, br.explained, br.actual, br.unexplained], [1700, 680, 680, 0]);
  // The friend pays back 60 in November: received for an earlier month, +60
  const concert = d.transactions.find((t) => t.owed);
  const back = addEntry(d, { date: '2026-11-04', amount: -60, kind: 'reimbursement', account: 'chk', merchant: 'Venmo' });
  editEntry(d, back.id, { settles: concert.id });
  const nov = bridgeFor(d, buildSummary(d, refs).income, '2026-11');
  assert.equal(stepsOf(nov).received, 60);
  assert.deepEqual(validateHousehold(d), []);
});
