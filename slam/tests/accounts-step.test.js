// The Accounts step (S-136), by hand: cash accounts, their latest balances, and when the step is done;
// then Credit and debt (S-137): what is owed on cards and loans, and what a limit leaves available.
// Reads the Riley demo household (src/data/households/riley.json, numbers from tools/riley.mjs) through
// helpers.js and calls accountsStatus, creditStatus and observations in engines/balances.js. The other
// households start blank (store/schema.js, store/migrate.js); store/accounts.js adds accounts and
// balances, and store/value.js makes the one-off values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from './helpers.js';
import { accountsStatus, observations } from '../src/engines/balances.js';
import { updateBalance, addAccount } from '../src/store/accounts.js';
import { makeValue } from '../src/store/value.js';
import { newHousehold } from '../src/store/schema.js';
import { migrate } from '../src/store/migrate.js';

const one = (n) => makeValue(n, { cadence: 'one-off' });

test('Riley on October 17: two cash accounts, both read on September 30, so the step is done', () => {
  const d = loadHousehold('riley');
  const s = accountsStatus(d, '2026-10-17');
  // Checking 4,001.03 and savings 150 at September's end (tools/riley.mjs), 17 days old (under 30).
  // Together 4,151.03.
  assert.deepEqual(
    s.cash.map((x) => [x.id, x.latest.amount, x.latest.date, x.days, x.fresh]),
    [
      ['chk', 4001.03, '2026-09-30', 17, true],
      ['sav', 150, '2026-09-30', 17, true]
    ]
  );
  assert.deepEqual([s.cashTotal, s.stale, s.done], [4151.03, [], true]);
  // On November 1 (32 days after September 30) both are out of date and the step reopens.
  assert.deepEqual(
    [accountsStatus(d, '2026-11-01').done, accountsStatus(d, '2026-11-01').stale],
    [false, ['Checking', 'Savings']]
  );
});

test('a new client: no cash accounts, not done; one checking with a balance today, done', () => {
  const d = migrate(newHousehold('New'));
  assert.deepEqual(
    [
      accountsStatus(d, '2026-10-19').cash.length,
      accountsStatus(d, '2026-10-19').done,
      accountsStatus(d, '2026-10-19').cashTotal
    ],
    [0, false, null]
  );
  const a = addAccount(d, { name: 'Checking', type: 'checking' });
  // No balance yet: not done, and blank (never 0).
  assert.deepEqual([accountsStatus(d, '2026-10-19').done, accountsStatus(d, '2026-10-19').cashTotal], [false, null]);
  updateBalance(d, a.id, '2026-10-19', one(2500));
  assert.deepEqual([accountsStatus(d, '2026-10-19').done, accountsStatus(d, '2026-10-19').cashTotal], [true, 2500]);
});

test('updating twice in a month keeps both readings in the history; the latest is the month end', () => {
  const d = migrate(newHousehold('Twice'));
  const a = addAccount(d, { name: 'Checking', type: 'checking' });
  updateBalance(d, a.id, '2026-10-05', one(1200));
  updateBalance(d, a.id, '2026-10-19', one(900));
  // October's end is 900, read on the 19th; the 1,200 of the 5th stays, as a balance check.
  assert.deepEqual([d.balances['2026-10'][a.id].end.amount, d.balances['2026-10'][a.id].endOn], [900, '2026-10-19']);
  assert.deepEqual(
    observations(d, a.id).map((o) => [o.date, o.amount]),
    [
      ['2026-10-05', 1200],
      ['2026-10-19', 900]
    ]
  );
  // Read on the last day: the month's own end, no separate date.
  updateBalance(d, a.id, '2026-10-31', one(950));
  assert.deepEqual([d.balances['2026-10'][a.id].end.amount, d.balances['2026-10'][a.id].endOn], [950, undefined]);
});

test('Credit and debt (S-137), Riley on October 17: the Visa and the car loan, with and without a limit', async () => {
  const { creditStatus } = await import('../src/engines/balances.js');
  const d = loadHousehold('riley');
  // September's ends (tools/riley.mjs): the Visa 2,818.03 (the card account), the car loan 3,237.64. Both read
  // September 30, 17 days ago: up to date. Owed 2,818.03 + 3,237.64 = 6,055.67. No limit yet: nothing available.
  const s = creditStatus(d, '2026-10-17');
  assert.deepEqual(
    s.rows.map((r) => [r.key, r.owed, r.days, r.revolving, r.available]),
    [
      ['visa', 2818.03, 17, true, null],
      ['debt-car', 3237.64, 17, false, null]
    ]
  );
  assert.deepEqual([s.owed, s.done, s.available], [6055.67, true, null]);
  // A 10,000 limit on the Visa: 10,000 - 2,818.03 = 7,181.97 available; 2,818.03 / 10,000 = 28.18% used.
  d.debts.find((x) => x.id === 'debt-visa').creditLimit = one(10000);
  const t = creditStatus(d, '2026-10-17');
  assert.deepEqual(
    [t.rows[0].available, t.rows[0].used, t.limit, t.available, t.used],
    [7181.97, 0.281803, 10000, 7181.97, 0.281803]
  );
  // A card paid off (0 owed) is still credit: all 10,000 available, 0% used.
  updateBalance(d, 'visa', '2026-10-17', one(0));
  assert.deepEqual(
    [
      creditStatus(d, '2026-10-17').rows[0].owed,
      creditStatus(d, '2026-10-17').rows[0].available,
      creditStatus(d, '2026-10-17').rows[0].used
    ],
    [0, 10000, 0]
  );
});

test('no cards or loans: done only when "No debts" is answered', async () => {
  const { creditStatus } = await import('../src/engines/balances.js');
  const d = migrate(newHousehold('None'));
  assert.equal(creditStatus(d, '2026-10-19').done, false);
  d.noDebts = true;
  assert.deepEqual([creditStatus(d, '2026-10-19').done, creditStatus(d, '2026-10-19').owed], [true, null]);
});
