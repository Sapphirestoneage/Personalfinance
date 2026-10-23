// Part 1 of the net worth statement (S-110): every account in one place, dated balances for every
// account and debt, and contributions worked out from the log and the paycheck. Every expected number
// is worked out by hand in the comments. Depends on the store (schema, value, migrate, validate,
// accounts, edits, cashflow, log, store, storage), on the engines balances.js, contributions.js and
// summary.js, and reads every demo household in src/data/households/ and the reference data (helpers.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newHousehold, newAccount, ACCOUNT_TYPE_INFO, tierOf, countsForFI, SCHEMA_VERSION } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { addAccount, setBalance, setAccountField, setPurchase, setDeductionAccount, setBalanceDate } from '../src/store/accounts.js';
import { addDebt, addIncome, addDeduction } from '../src/store/edits.js';
import { addBalanceCheck } from '../src/store/cashflow.js';
import { addEntry } from '../src/store/log.js';
import { balanceAt, balancesFor, liabilities, observations, lastUpdated } from '../src/engines/balances.js';
import { contributionsFor } from '../src/engines/contributions.js';
import { buildSummary } from '../src/engines/summary.js';
import { createStore } from '../src/store/store.js';
import { createStorage, memoryBackend } from '../src/store/storage.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();
const one = (a, opts = {}) => makeValue(a, { cadence: 'one-off', ...opts });

test('each new type has its tier and FI default; a home and a vehicle carry their purchase and secured debt', () => {
  const t = (type) => { const a = newAccount({ type }); return [a.tier, a.countsForFI]; };
  assert.deepEqual(t('checking'), [1, true]);
  assert.deepEqual(t('hysa'), [1, true]);
  assert.deepEqual(t('brokerage'), [2, true]);
  assert.deepEqual(t('crypto'), [2, true]);
  for (const type of ['401k', 'trad-ira', 'roth-ira', 'hsa', '529', 'cash-value-life']) assert.deepEqual(t(type), [3, true], type);
  for (const type of ['home', 'vehicle', 'other-asset']) assert.deepEqual(t(type), [4, false], type);
  assert.deepEqual(t('credit-card'), [null, true]);
  const home = newAccount({ type: 'home' });
  assert.deepEqual([home.purchasePrice.amount, home.purchaseDate.date, home.securedDebtId], [null, null, null]);
  assert.equal(newAccount({ type: 'brokerage' }).securedDebtId, undefined, 'only a home or vehicle has one');
  // Absent fields fall back to the type (an account made before S-110 and never normalized).
  assert.deepEqual([tierOf({ type: 'roth-ira' }), countsForFI({ type: 'vehicle' })], [3, false]);
  // 18 types before S-116; "Investment" and "Retirement" became one "Type not set": 17. High-yield
  // savings (S-139): 18.
  assert.equal(Object.keys(ACCOUNT_TYPE_INFO).length, 18);
});

test('changing a type brings its defaults; the coach can change the tier and FI flag', () => {
  const d = migrate(newHousehold('Types'));
  const a = addAccount(d, { name: 'Thing', type: 'brokerage' });
  setAccountField(d, a.id, 'type', 'vehicle');
  assert.deepEqual([a.tier, a.countsForFI, a.securedDebtId, a.purchasePrice.amount], [4, false, null, null]);
  setAccountField(d, a.id, 'countsForFI', true);
  setAccountField(d, a.id, 'tier', 2);
  assert.deepEqual([a.tier, a.countsForFI], [2, true]);
  setAccountField(d, a.id, 'type', 'brokerage');
  assert.deepEqual([a.tier, a.countsForFI, a.securedDebtId], [2, true, undefined]);
  assert.throws(() => setAccountField(d, a.id, 'tier', 5), /1 to 4/);
  const loan = addDebt(d, { label: 'Auto loan', type: 'car-loan' });
  setAccountField(d, a.id, 'type', 'vehicle');
  setAccountField(d, a.id, 'securedDebtId', loan.id);
  setPurchase(d, a.id, 'price', one(14500));
  setPurchase(d, a.id, 'date', '2023-04-10');
  assert.deepEqual([a.securedDebtId, a.purchasePrice.amount, a.purchaseDate.date], [loan.id, 14500, '2023-04-10']);
  assert.deepEqual(validateHousehold(d), []);
});

test('migration changes no number: every file loads with the same balances and debts, plus tiers', () => {
  const dir = new URL('../src/data/households/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const raw = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const d = migrate(raw);
    assert.equal(d.schemaVersion, SCHEMA_VERSION, f);
    // Every typed balance is exactly what the file had.
    for (const [m, accts] of Object.entries(raw.balances || {})) {
      for (const [id, b] of Object.entries(accts)) {
        for (const w of ['start', 'end']) if (b[w] && b[w].amount !== undefined && b[w].amount !== null) assert.equal(d.balances[m][id][w].amount, b[w].amount, f + ' ' + m + ' ' + id + ' ' + w);
      }
    }
    for (const debt of raw.debts || []) {
      const got = d.debts.find((x) => x.id === debt.id);
      for (const k of ['balance', 'apr', 'minimum']) if (debt[k] && debt[k].amount !== undefined) assert.equal(got[k].amount, debt[k].amount, f + ' ' + debt.id + ' ' + k);
    }
    for (const a of d.accounts) assert.deepEqual([a.tier, a.countsForFI], [ACCOUNT_TYPE_INFO[a.type].tier, ACCOUNT_TYPE_INFO[a.type].fi], f + ' ' + a.id);
    // Loading again changes nothing.
    assert.deepEqual(migrate(JSON.parse(JSON.stringify(d))), d, f);
    assert.deepEqual(validateHousehold(d), [], f);
  }
});

test('dated balances for every account and debt: the latest one on or before a day', () => {
  const d = migrate(newHousehold('Dated'));
  const roth = addAccount(d, { name: 'Roth IRA', type: 'roth-ira' });
  const loan = addDebt(d, { label: 'Auto loan', type: 'car-loan' });
  loan.balance = one(8000, { asOf: '2026-08-15' });
  // The loan has no account: before any dated balance, the debt's own balance is used.
  assert.deepEqual([balanceAt(d, loan.id, '2026-09-30').amount, balanceAt(d, loan.id, '2026-09-30').from], [8000, 'debt']);
  setBalance(d, '2026-09', loan.id, 'end', one(7800));
  setBalance(d, '2026-09', roth.id, 'start', one(5000));
  setBalance(d, '2026-09', roth.id, 'end', one(5300, { status: 'roughly' }));
  setBalanceDate(d, '2026-09', roth.id, 'end', '2026-09-28');
  addBalanceCheck(d, roth.id, '2026-10-12', one(5450));
  // Sep 1: the start, 5,000. Sep 30: the end read on the 28th, 5,300. Oct 20: the check on the 12th, 5,450.
  assert.equal(balanceAt(d, roth.id, '2026-09-01').amount, 5000);
  assert.equal(balanceAt(d, roth.id, '2026-09-27').amount, 5000);
  assert.deepEqual([balanceAt(d, roth.id, '2026-09-30').amount, balanceAt(d, roth.id, '2026-09-30').status], [5300, 'roughly']);
  assert.deepEqual([balanceAt(d, roth.id, '2026-10-20').amount, balanceAt(d, roth.id, '2026-10-20').from], [5450, 'check']);
  assert.equal(balanceAt(d, roth.id, '2026-08-31'), null, 'nothing before the first balance');
  assert.equal(observations(d, roth.id).length, 3);
  assert.equal(lastUpdated(d, roth.id, '2026-10-31'), '2026-10-12');
  // The loan: 7,800 at the end of September, kept under the debt's own id.
  assert.equal(balanceAt(d, loan.id, '2026-10-05').amount, 7800);
  assert.deepEqual(liabilities(d).map((l) => [l.key, l.debtType]), [[loan.id, 'car-loan']]);
  assert.deepEqual(validateHousehold(d), []);
});

test('month-end: cash and cards are needed, investments and things you own are optional and show their last date', () => {
  const d = migrate(newHousehold('Month end'));
  d.currentMonth = '2026-10';
  const chk = addAccount(d, { name: 'Checking', type: 'checking' });
  const visa = addAccount(d, { name: 'Visa', type: 'credit-card' });
  const k = addAccount(d, { name: '401(k)', type: '401k' });
  addAccount(d, { name: 'Car', type: 'vehicle' });
  for (const a of [chk, visa]) { setBalance(d, '2026-10', a.id, 'start', one(100)); setBalance(d, '2026-10', a.id, 'end', one(100)); }
  setBalance(d, '2026-09', k.id, 'end', one(20000, { status: 'roughly' }));
  const b = balancesFor(d, '2026-10');
  // Two needed accounts x start and end = 4, all in; the 401(k) (carried start) and the car have no end.
  assert.deepEqual([b.required.length, b.missing.length], [2, 0]);
  assert.deepEqual(b.stale.map((x) => [x.name, x.last]), [['401(k)', '2026-09-30'], ['Car', null]]);
});

test('contributions: transfers in, less transfers out, plus the paycheck deductions that go in', () => {
  const d = migrate(newHousehold('Contributions'));
  d.currentMonth = '2026-10';
  const chk = addAccount(d, { name: 'Checking', type: 'checking' });
  const roth = addAccount(d, { name: 'Roth IRA', type: 'roth-ira' });
  const k = addAccount(d, { name: '401(k)', type: '401k' });
  const inc = addIncome(d, { type: 'w2', label: 'Job' });
  Object.assign(inc, { payFrequency: 'biweekly', takeHome: makeValue(1500, { cadence: 'paycheck' }) });
  const ded = addDeduction(d, inc.id, 'retirement');
  ded.mode = 'amount';
  ded.amount = makeValue(150, { cadence: 'paycheck' });
  setDeductionAccount(d, inc.id, ded.id, k.id);
  // Into the Roth: 400 on Oct 28 (a transfer in is a negative amount on the Roth), 50 taken back out on Oct 30.
  addEntry(d, { date: '2026-10-28', amount: 400, account: chk.id, lineId: 'retirement' });
  addEntry(d, { date: '2026-10-28', amount: -400, kind: 'transfer', account: roth.id });
  addEntry(d, { date: '2026-10-30', amount: 50, kind: 'transfer', account: roth.id });
  // September's transfer is not October's.
  addEntry(d, { date: '2026-09-28', amount: -400, kind: 'transfer', account: roth.id });
  const c = contributionsFor(d, buildSummary(d, refs).income, '2026-10');
  // Roth: 400 - 50 = 350, nothing from the paycheck.
  assert.deepEqual([c.byAccount[roth.id].transfers, c.byAccount[roth.id].deductions, c.byAccount[roth.id].total], [350, 0, 350]);
  // 401(k): 150 a paycheck, every two weeks: 150 x 26 / 12 = 325 a month.
  assert.deepEqual([c.byAccount[k.id].transfers, c.byAccount[k.id].deductions, c.byAccount[k.id].total], [0, 325, 325]);
  // 350 + 325 = 675. Checking is cash, not an investment, so it has no row.
  assert.deepEqual([c.total, c.byAccount[chk.id]], [675, undefined]);
  assert.deepEqual(validateHousehold(d), []);
});

test('lesson 21: a new home, its balance, and a balance check are records with an id, times, author, and version', () => {
  let n = 0;
  const s = createStore(createStorage(memoryBackend()), () => new Date(Date.parse('2026-10-17T12:00:00.000Z') + 60000 * n++));
  s.create('Records');
  let home;
  s.update('Home', (d) => { home = addAccount(d, { name: 'Condo', type: 'home' }); });
  s.update('Value', (d) => { setBalance(d, '2026-10', home.id, 'end', one(310000, { status: 'roughly' })); addBalanceCheck(d, home.id, '2026-10-20', one(312000)); });
  const a = s.doc.accounts.find((x) => x.id === home.id);
  for (const r of [a, s.doc.balances['2026-10'][home.id], s.doc.cashflow.checks[0]]) {
    assert.ok(r.id && r.createdAt && r.updatedAt && r.createdBy && r.updatedBy && r.version >= 1, JSON.stringify(r).slice(0, 80));
  }
});
