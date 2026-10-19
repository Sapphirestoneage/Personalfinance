// The Accounts step (S-136), by hand: cash accounts, their latest balances, and when the step is done.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from './helpers.js';
import { accountsStatus, observations } from '../src/calc/balances.js';
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
  assert.deepEqual(s.cash.map((x) => [x.id, x.latest.amount, x.latest.date, x.days, x.fresh]), [['chk', 4001.03, '2026-09-30', 17, true], ['sav', 150, '2026-09-30', 17, true]]);
  assert.deepEqual([s.cashTotal, s.stale, s.done], [4151.03, [], true]);
  // On November 1 (32 days after September 30) both are out of date and the step reopens.
  assert.deepEqual([accountsStatus(d, '2026-11-01').done, accountsStatus(d, '2026-11-01').stale], [false, ['Checking', 'Savings']]);
});

test('a new client: no cash accounts, not done; one checking with a balance today, done', () => {
  const d = migrate(newHousehold('New'));
  assert.deepEqual([accountsStatus(d, '2026-10-19').cash.length, accountsStatus(d, '2026-10-19').done, accountsStatus(d, '2026-10-19').cashTotal], [0, false, null]);
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
  assert.deepEqual(observations(d, a.id).map((o) => [o.date, o.amount]), [['2026-10-05', 1200], ['2026-10-19', 900]]);
  // Read on the last day: the month's own end, no separate date.
  updateBalance(d, a.id, '2026-10-31', one(950));
  assert.deepEqual([d.balances['2026-10'][a.id].end.amount, d.balances['2026-10'][a.id].endOn], [950, undefined]);
});
