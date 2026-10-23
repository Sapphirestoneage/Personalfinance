// Part 5 of the monthly loop: the budget-to-cash bridge (S-088), by hand.
// Depends on bridgeFor in engines/bridge.js, buildSummary and closeMonthSnapshot in engines/summary.js,
// the store's log.js, months.js and validate.js, the October fixture (fixtures/october.js) that holds the
// month below, and the reference data through helpers.js.
//
// October 2026. Take-home 4,000 a month. Accounts at the start: checking 2,000,
// savings 5,000, Visa 500 owed (linked to the Visa debt, minimum 40).
// Budget actuals: rent 1,500 (typed); groceries 400 from the log (300 on the
// Visa, 100 from checking); car insurance is yearly (1,200 a year, due Oct 14),
// so the budget holds its share, 100, and the 1,200 payment is in the log;
// emergency fund 200 (typed, moved to savings by a transfer); shopping 60: a
// 120 concert from checking, 60 of it owed back by a friend; a 250 couch is a
// one-off; Debt payments 40 (the Visa minimum).
// Spending 1,500 + 400 + 100 + 60 + 40 = 2,100; savings 200.
// Income in the log, all from the job: 2,000 + 2,000 + a 300 bonus = 4,300 (S-118: the month's income is
// tracked, so the surplus uses it): surplus 4,300 - 2,300 = 2,000. The Visa was paid 450 from checking.
// Checking end: 2,000 + 4,300 - 100 - 1,200 - 200 - 120 - 250 - 450 - 1,500 rent = 2,480.
// Savings end 5,200. Visa end 500 + 300 - 450 = 350.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHousehold } from '../src/store/validate.js';
import { addEntry, editEntry } from '../src/store/log.js';
import { closeMonth } from '../src/store/months.js';
import { bridgeFor } from '../src/engines/bridge.js';
import { october } from './fixtures/october.js';
import { buildSummary, closeMonthSnapshot } from '../src/engines/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

const stepsOf = (br) => Object.fromEntries(br.steps.map((s) => [s.key, s.amount]));

test('a month that ties: every step by hand', () => {
  const d = october();
  assert.deepEqual(validateHousehold(d), []);
  const s = buildSummary(d, refs);
  const br = bridgeFor(d, s.income, '2026-10');
  assert.equal(br.surplus, 2000);
  // No income step (S-118): the surplus already uses the 4,300 that landed.
  assert.deepEqual(stepsOf(br), {
    yearly: -1100, // share 100 in the budget - 1,200 paid
    'set-aside': 200, // emergency fund 200, no entry paid it out
    cards: -150, // Visa 500 -> 350
    'card-min': 40, // the Visa minimum in Debt payments
    owed: -60, // the friend's half of the concert
    'one-off': -250 // the couch
  });
  // 2,000 - 1,100 + 200 - 150 + 40 - 60 - 250 = 680
  assert.equal(br.explained, 680);
  // cash 2,000 + 5,000 = 7,000 -> 2,480 + 5,200 = 7,680: +680
  assert.deepEqual([br.cashStart, br.cashEnd, br.actual, br.unexplained, br.ties], [7000, 7680, 680, 0, true]);
  assert.equal(
    br.reading,
    'Your budget showed $2,000 left, but cash went up $680. The car insurance bill ($1,200) came due this month.'
  );
  // $0 steps are hidden: no reimbursements were received for earlier months
  assert.equal(
    br.steps.some((x) => x.key === 'received'),
    false
  );
});

test('a month that does not tie: $60 of ATM cash not mapped', () => {
  const d = october({ atm: true });
  const br = bridgeFor(d, buildSummary(d, refs).income, '2026-10');
  // The ATM 60 is not in the budget (no line), so explained stays 680; cash 7,620 - 7,000 = 620
  assert.deepEqual([br.explained, br.actual, br.unexplained, br.ties], [680, 620, -60, false]);
  assert.equal(
    br.reading,
    'Your budget showed $2,000 left, but cash went up $620. The car insurance bill ($1,200) came due this month. $60 is not explained yet.'
  );
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
  assert.equal(br.reading, 'Your budget showed $2,000 left. The change in cash needs Savings end balance.');
});

test('after close the bridge reads the locked snapshot and gives the same answer', () => {
  const d = october();
  const s = buildSummary(d, refs);
  closeMonth(d, closeMonthSnapshot(s), '2026-11-01T09:00:00Z');
  const br = bridgeFor(d, buildSummary(d, refs).income, '2026-10');
  assert.equal(br.closed, true);
  // The month's income (4,300 from the log) is saved with it, so the surplus stays 2,000.
  assert.deepEqual([br.surplus, br.explained, br.actual, br.unexplained], [2000, 680, 680, 0]);
  // The friend pays back 60 in November: received for an earlier month, +60
  const concert = d.transactions.find((t) => t.owed);
  const back = addEntry(d, {
    date: '2026-11-04',
    amount: -60,
    kind: 'reimbursement',
    account: 'chk',
    merchant: 'Venmo'
  });
  editEntry(d, back.id, { settles: concert.id });
  const nov = bridgeFor(d, buildSummary(d, refs).income, '2026-11');
  assert.equal(stepsOf(nov).received, 60);
  assert.deepEqual(validateHousehold(d), []);
});
