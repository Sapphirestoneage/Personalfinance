// The net worth bridge (S-112): netWorthBridge and netWorthBridgeRows in engines/networth-bridge.js,
// by hand, on the October household (fixtures/october.js, worked out in tests/bridge.test.js). Uses
// the cash bridge (engines/bridge.js), contributionsFor (engines/contributions.js), balanceMonths
// (engines/networth.js), buildSummary (engines/summary.js), the store's accounts, edits, log, value
// and validate modules, and helpers.js for the reference data in src/data and every demo household
// in src/data/households (the last test reads that folder). Here the October household also has:
//   a Roth IRA: 6,000 at the start, 6,500 at the end, 300 a month from the paycheck (a Roth deduction);
//   a car: worth 9,000 at the start, 8,850 at the end;
//   an auto loan on the car (no account): 6,000 owed at the start, 5,780 at the end; its 250 payment
//     is in Debt payments and was paid from checking (so checking ends 2,480 - 250 = 2,230).
// The cash bridge: surplus 4,300 (the income in the log, S-118) - (2,100 + 250) - 200 = 1,750; steps as
// in bridge.test.js (yearly -1,100, set aside +200, cards -150, card minimum +40, owed -60, one-off -250);
// explained 1,750 - 1,100 + 200 - 150 + 40 - 60 - 250 = 430; cash 7,000 -> 2,230 + 5,200 = 7,430, ties.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { makeValue } from '../src/store/value.js';
import { validateHousehold } from '../src/store/validate.js';
import { addAccount, setBalance, setAccountField, setDeductionAccount } from '../src/store/accounts.js';
import { addDebt, addDeduction } from '../src/store/edits.js';
import { addEntry } from '../src/store/log.js';
import { netWorthBridge, netWorthBridgeRows } from '../src/engines/networth-bridge.js';
import { bridgeFor } from '../src/engines/bridge.js';
import { contributionsFor } from '../src/engines/contributions.js';
import { balanceMonths } from '../src/engines/networth.js';
import { buildSummary } from '../src/engines/summary.js';
import { october } from './fixtures/october.js';
import { loadRefs, loadHousehold } from './helpers.js';

const refs = loadRefs();
const one = (a, opts = {}) => makeValue(a, { cadence: 'one-off', ...opts });
const M = '2026-10';

function household(opts = {}) {
  const d = october({ atm: opts.atm });
  const roth = addAccount(d, { id: 'roth', name: 'Roth IRA', type: 'roth-ira' });
  const car = addAccount(d, { id: 'car', name: 'Car', type: 'vehicle' });
  const loan = addDebt(d, { id: 'loan', label: 'Auto loan', type: 'car-loan' });
  Object.assign(loan, { minimum: makeValue(250), apr: one(6) });
  setAccountField(d, car.id, 'securedDebtId', loan.id);
  const ded = addDeduction(d, 'job', 'roth');
  Object.assign(ded, { mode: 'amount', amount: makeValue(300, { cadence: 'paycheck' }) });
  setDeductionAccount(d, 'job', ded.id, roth.id);
  addEntry(d, { date: '2026-10-15', amount: 250, kind: 'card-payment', account: 'chk', note: 'Auto loan' });
  setBalance(d, M, 'chk', 'end', one(opts.atm ? 2170 : 2230));
  setBalance(d, M, roth.id, 'start', one(6000));
  if (!opts.staleRoth) setBalance(d, M, roth.id, 'end', one(6500));
  setBalance(d, M, car.id, 'start', one(9000, { status: 'roughly' }));
  setBalance(d, M, car.id, 'end', one(8850, { status: 'roughly' }));
  setBalance(d, M, loan.id, 'start', one(6000));
  setBalance(d, M, loan.id, 'end', one(5780));
  return d;
}

const lines = (b) => Object.fromEntries(b.lines.map((l) => [l.key, l.amount]));

test('a month that ties: every line by hand, total and FI', () => {
  const d = household();
  assert.deepEqual(validateHousehold(d), []);
  const inc = buildSummary(d, refs).income;
  assert.equal(bridgeFor(d, inc, M).unexplained, 0);
  const b = netWorthBridge(d, inc, M);
  // Start: checking 2,000 + savings 5,000 + Roth 6,000 + car 9,000 = 22,000; Visa 500 + loan 6,000 = 6,500; 15,500.
  // End: 2,230 + 5,200 + 6,500 + 8,850 = 22,780, plus the car insurance paid ahead (S-119): 1,200 paid
  // on October 14 for 12 months, 100 a month, so 1,200 - 100 = 1,100 left at October's end: 23,880.
  // Visa 350 + loan 5,780 = 6,130; 17,750. Up 2,250.
  assert.deepEqual([b.total.start, b.total.actual, b.total.change], [15500, 17750, 2250]);
  assert.deepEqual(lines(b.total), {
    surplus: 1750,
    timing: -310, // yearly -1,100 + paid ahead +1,100 = 0 (the bill's line is gone), owed -60, one-off -250
    saved: 500, // the savings line 200 + the Roth from the paycheck 300
    'paid-down': 260, // the Visa minimum 40 + the loan 6,000 -> 5,780 = 220
    market: 200, // Roth 6,500 - 6,000 - 300 contributed
    value: -150 // car 9,000 -> 8,850
  });
  // 15,500 + 1,750 - 310 + 500 + 260 + 200 - 150 = 17,750: explained, nothing left over.
  assert.deepEqual([b.total.explained, b.total.unexplained, b.total.ties], [17750, 0, true]);
  // Saved: 1,750 - 310 + 500 = 1,940.
  assert.equal(
    b.reading,
    'Net worth rose $2,250. $1,940 you saved, $200 the market added, $260 of debt paid down, $150 of value lost on things you own.'
  );
  // FI leaves out the car, its loan, and what is paid ahead (the cash went out: FI tells that story). Start: 2,000 + 5,000 + 6,000 - 500 = 12,500. End: 2,230 + 5,200 + 6,500 - 350 = 13,580.
  assert.deepEqual([b.fi.start, b.fi.actual, b.fi.change], [12500, 13580, 1080]);
  // Lines: the loan's 220 and the car's -150 are gone: 1,750 - 1,410 + 500 + 40 + 200 = 1,080.
  assert.deepEqual(lines(b.fi), { surplus: 1750, timing: -1410, saved: 500, 'paid-down': 40, market: 200 });
  assert.deepEqual([b.fi.explained, b.fi.unexplained], [13580, 0]);
  // The waterfall: start, six lines, explained, end (nothing unexplained to draw).
  assert.deepEqual(
    netWorthBridgeRows(b.total).map((r) => r.label),
    ['Start', 'Surplus', 'Timing', 'Saved', 'Debt paid', 'Market', 'Values', 'Explained', 'End']
  );
});

test('a month with $60 not explained (the ATM cash), the same in the total and FI', () => {
  const d = household({ atm: true });
  const b = netWorthBridge(d, buildSummary(d, refs).income, M);
  // Checking ends 60 lower (2,170): actual 17,690; explained still 17,750; not explained -60, as in the cash bridge.
  assert.deepEqual([b.total.actual, b.total.explained, b.total.unexplained, b.total.ties], [17690, 17750, -60, false]);
  assert.deepEqual([b.fi.unexplained, b.parts.cash], [-60, -60]);
  assert.equal(
    b.reading,
    'Net worth rose $2,190. $1,940 you saved, $200 the market added, $260 of debt paid down, $150 of value lost on things you own. $60 is not explained yet.'
  );
  assert.equal(netWorthBridgeRows(b.total).find((r) => r.kind === 'unexplained').label, 'Not explained yet');
});

test('an investment not updated this month: no market line, and its contributions wait', () => {
  const d = household({ staleRoth: true });
  const b = netWorthBridge(d, buildSummary(d, refs).income, M);
  // The Roth stays at its start, 6,000: end 22,280 + 1,100 paid ahead - 6,130 = 17,250. No market line:
  // explained 15,500 + 1,750 - 310 + 500 + 260 - 150 = 17,550, so -300 (the 300 contributed) is not explained yet.
  assert.equal(lines(b.total).market, undefined);
  assert.deepEqual([b.total.actual, b.total.explained, b.total.unexplained], [17250, 17550, -300]);
  assert.deepEqual(
    b.total.stale.map((x) => [x.name, x.contributions]),
    [['Roth IRA', 300]]
  );
  assert.equal(b.parts.stale, -300);
  assert.match(b.reading, /\$300 is not explained yet \(Roth IRA not updated this month\)\.$/);
});

test('contributions are never typed twice: balances do not change them', () => {
  const d = household();
  const inc = buildSummary(d, refs).income;
  const before = contributionsFor(d, inc, M);
  setBalance(d, M, 'roth', 'end', one(9999));
  assert.deepEqual(contributionsFor(d, inc, M), before);
  assert.equal(before.total, 300);
});

test('the bridge always ties, for every month of every household file', () => {
  const files = readdirSync(new URL('../src/data/households/', import.meta.url))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
  let checked = 0;
  for (const name of files) {
    const d = loadHousehold(name);
    const inc = buildSummary(d, refs).income;
    for (const month of balanceMonths(d)) {
      const b = netWorthBridge(d, inc, month);
      for (const k of ['total', 'fi']) {
        const x = b[k];
        if (x.unexplained === null) continue;
        // Explained + not explained = the actual change, to the cent.
        assert.equal(
          Math.round((x.explained - x.start + x.unexplained) * 100),
          Math.round(x.change * 100),
          name + ' ' + month + ' ' + k
        );
        // And not explained = the cash bridge's + money moved outside the budget + contributions not seen yet.
        assert.equal(
          Math.round(x.unexplained * 100),
          Math.round((b.parts.cash + b.parts.moved + b.parts.stale) * 100),
          name + ' ' + month + ' ' + k + ' parts'
        );
        checked += 1;
      }
    }
  }
  // 24 is one household's worth: Riley and Dana each add 24 (twelve months, total and FI); the other demos have no balances to check.
  assert.ok(checked >= 24, 'checked ' + checked);
});
