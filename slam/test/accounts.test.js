// Part 1 of the monthly loop: accounts and month balances (S-084). Every
// expected number is worked out by hand in the comments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold, newNextStage } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { addAccount, setBalance, setAccountField } from '../src/store/accounts.js';
import { addDebt } from '../src/store/edits.js';
import { monthBalance, balancesFor, cashOnHand, linkedCardBalance } from '../src/calc/balances.js';
import { debtsByType } from '../src/calc/breakdown.js';
import { eraTimeline } from '../src/calc/eras.js';
import { buildSummary } from '../src/calc/summary.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();
const one = (a) => makeValue(a, { cadence: 'one-off' });

function family() {
  const d = newHousehold('Balances');
  d.currentMonth = '2026-10';
  const chk = addAccount(d, { name: 'Checking', type: 'checking' });
  const sav = addAccount(d, { name: 'Savings', type: 'savings' });
  const card = addAccount(d, { name: 'Visa', type: 'credit-card' });
  return { d, chk, sav, card };
}

test('a version 4 file: Next stage cash on hand moves into a Cash on hand account', () => {
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  raw.schemaVersion = 4;
  raw.currentMonth = '2026-10';
  delete raw.accounts;
  delete raw.balances;
  raw.nextStage = { ...newNextStage([]), cashOnHand: { amount: 8000, cadence: 'one-off', status: 'roughly', source: 'client', asOf: null, note: '' } };
  raw.eras = { cashNow: { amount: 8000, cadence: 'month', status: 'known', source: 'client', asOf: null, note: '' }, list: [] };
  const d = migrate(raw);
  assert.deepEqual(validateHousehold(d), []);
  // Same 8,000 in both places: one account, started with it, nothing asked twice.
  assert.deepEqual(d.accounts.map((a) => [a.name, a.type, a.state]), [['Cash on hand', 'cash', 'active']]);
  const b = d.balances['2026-10'][d.accounts[0].id];
  assert.deepEqual([b.start.amount, b.start.status, b.end.amount], [8000, 'roughly', null]);
  assert.equal('cashOnHand' in d.nextStage, false);
  assert.equal('cashNow' in d.eras, false);
  assert.equal(cashOnHand(d).amount, 8000);
});

test('two different old answers: the first counts, the other is kept on an archived account', () => {
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  raw.schemaVersion = 4;
  raw.currentMonth = '2026-10';
  raw.nextStage = { ...newNextStage([]), cashOnHand: { amount: 5000, cadence: 'one-off', status: 'known' } };
  raw.eras = { cashNow: { amount: 7000, status: 'known' }, list: [] };
  const d = migrate(raw);
  assert.deepEqual(d.accounts.map((a) => [a.name, a.state]), [['Cash on hand', 'active'], ['Cash on hand (Eras cash now)', 'archived']]);
  // Archived accounts do not count: cash on hand is 5,000, and 7,000 is still on file.
  assert.equal(cashOnHand(d).amount, 5000);
  assert.equal(d.balances['2026-10'][d.accounts[1].id].start.amount, 7000);
});

test('no old cash: no account is made', () => {
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  raw.schemaVersion = 4;
  raw.eras = { cashNow: { amount: null, status: null }, list: [] };
  const d = migrate(raw);
  assert.deepEqual(d.accounts, []);
  assert.equal(cashOnHand(d).amount, null);
  assert.equal(cashOnHand(d).noAccounts, true);
});

test('a month start is carried from last month end until it is typed', () => {
  const { d, chk } = family();
  setBalance(d, '2026-09', chk.id, 'end', one(1250));
  // October start not typed: carried from September's end, 1,250
  assert.deepEqual(monthBalance(d, '2026-10', chk.id).start, { amount: 1250, status: 'known', from: 'carried' });
  // Typed: the typed number wins and the carried one is gone
  setBalance(d, '2026-10', chk.id, 'start', one(1300));
  assert.deepEqual(monthBalance(d, '2026-10', chk.id).start, { amount: 1300, status: 'known', from: 'typed' });
  // Nothing in August or before: missing, never zero
  assert.equal(monthBalance(d, '2026-08', chk.id).start.amount, null);
});

test('cash on hand: checking + savings + cash at the latest end, else this month start; cards apart', () => {
  const { d, chk, sav, card } = family();
  setBalance(d, '2026-09', chk.id, 'end', one(1250));
  setBalance(d, '2026-09', sav.id, 'end', one(4000));
  setBalance(d, '2026-09', card.id, 'end', one(600));
  // September ends: 1,250 + 4,000 = 5,250 (the card's 600 owed is not cash)
  assert.equal(cashOnHand(d).amount, 5250);
  // October ends for checking only: checking 980 (Oct end) + savings 4,000 (Sep end) = 4,980
  setBalance(d, '2026-10', chk.id, 'end', one(980));
  assert.equal(cashOnHand(d).amount, 4980);
  // A new cash account with only an October start of 60: 4,980 + 60 = 5,040
  const wallet = addAccount(d, { name: 'Wallet', type: 'cash' });
  setBalance(d, '2026-10', wallet.id, 'start', one(60));
  assert.equal(cashOnHand(d).amount, 5040);
  // October for all: checking start 1,250 (carried) end 980; savings start 4,000 (carried), no end; card start 600 (carried)
  const b = balancesFor(d, '2026-10');
  // cash start 1,250 + 4,000 + 60 = 5,310; cash end missing (savings, wallet)
  assert.deepEqual([b.cashStart, b.cashEnd, b.cardsStart, b.cardsEnd], [5310, null, 600, null]);
  assert.deepEqual(b.missing.map((m) => m.name + ' ' + m.which), ['Savings end', 'Visa end', 'Wallet end']);
  assert.deepEqual(validateHousehold(d), []);
});

test('Next stage and Eras read cash from the balances', () => {
  const { d, chk, sav } = family();
  setBalance(d, '2026-10', chk.id, 'start', one(2000));
  setBalance(d, '2026-10', sav.id, 'start', one(3000));
  d.noDebts = true;
  d.income.push({ id: 'job', type: 'w2', label: 'Job', payFrequency: 'monthly', takeHome: makeValue(4000), gross: makeValue(), deductions: [], state: 'active' });
  d.nextStage = newNextStage([]);
  d.nextStage.takeHome = makeValue(3000);
  const s = buildSummary(migrate(d), refs);
  // 2,000 + 3,000 = 5,000 in both
  assert.equal(s.nextStage.cash.onHand, 5000);
  assert.equal(s.eras.cashKnown, true);
  assert.equal(eraTimeline(d, { takeHome: 4000, spending: 3000 }, refs).path.length, 0);
});

test('a card links to its debt; the debt balance reads the account', () => {
  const d = newHousehold('Card');
  d.currentMonth = '2026-10';
  const debt = addDebt(d, { label: 'Visa', type: 'credit-card' });
  debt.balance = makeValue(999);
  const card = addAccount(d, { name: 'Visa', type: 'credit-card' });
  assert.equal(card.debtId, debt.id);
  setBalance(d, '2026-09', card.id, 'end', one(640));
  assert.deepEqual(linkedCardBalance(d, debt.id), { accountId: card.id, name: 'Visa', amount: 640, month: '2026-09' });
  // The typed 999 on the debt is ignored while linked: 640
  assert.equal(debtsByType(d)[0].balance, 640);
  setAccountField(d, card.id, 'debtId', null);
  assert.equal(debtsByType(d)[0].balance, 999);
  assert.throws(() => setAccountField(d, card.id, 'name', ' '), /needs a name/);
});

test('checks: unknown account types and balances for unknown accounts are refused', () => {
  const { d, chk } = family();
  d.accounts[0].type = 'piggy-bank';
  d.balances['2026-10'] = { 'acct-nope': { start: one(1), end: one(2) } };
  const errs = validateHousehold(d).join(' | ');
  assert.ok(errs.includes('piggy-bank'));
  assert.ok(errs.includes('unknown account acct-nope'));
  assert.throws(() => setBalance(d, '2026-10', 'acct-nope', 'start', one(1)), /No account/);
  assert.ok(chk);
});

// Every card, both ways (S-102). By hand: three debts, two of them credit cards (Amex, Chase), and a car loan.
// "Add an account for each" makes two card accounts, named and linked; the car loan gets none.
// Groceries are set to be paid on the Amex; in October, 40 (Oct 3) and 30 (Oct 5) are logged on it = 70 from
// 2 entries, and a 15 entry on Sep 30 is another month. The Chase has nothing set or logged.
test('every credit card: which debt it pays down, and what goes on it', async () => {
  const { addCardAccounts } = await import('../src/store/accounts.js');
  const { cardMap } = await import('../src/calc/balances.js');
  const { addDebt, findLine } = await import('../src/store/edits.js');
  const { addEntry } = await import('../src/store/log.js');
  const { newHousehold } = await import('../src/store/schema.js');
  const d = newHousehold('Cards');
  d.currentMonth = '2026-10';
  const amex = addDebt(d, { label: 'Amex', type: 'credit-card' });
  addDebt(d, { label: 'Chase', type: 'credit-card' });
  addDebt(d, { label: 'Car', type: 'car-loan' });
  assert.deepEqual(cardMap(d, '2026-10').noAccount.map((x) => x.label), ['Amex', 'Chase']);
  assert.equal(addCardAccounts(d), 2);
  assert.deepEqual(d.accounts.map((a) => [a.name, a.type, a.debtId === amex.id]), [['Amex', 'credit-card', true], ['Chase', 'credit-card', false]]);
  assert.equal(addCardAccounts(d), 0, 'running it again adds nothing');
  const amexAcct = d.accounts[0].id;
  findLine(d, 'groceries').line.accountId = amexAcct;
  addEntry(d, { date: '2026-10-03', amount: 40, lineId: 'groceries', account: amexAcct });
  addEntry(d, { date: '2026-10-05', amount: 30, lineId: 'gas', account: amexAcct });
  addEntry(d, { date: '2026-09-30', amount: 15, lineId: 'gas', account: amexAcct });
  const m = cardMap(d, '2026-10');
  assert.deepEqual(m.noAccount, []);
  assert.deepEqual(m.rows.map((r) => [r.name, r.debt && r.debt.label, r.paidOn, r.loggedCount, r.loggedAmount]),
    [['Amex', 'Amex', ['Groceries'], 2, 70], ['Chase', 'Chase', [], 0, 0]]);
});

// The Accounts pass (S-103), by hand. October: checking end 1,000; savings start 2,000 (no end yet, so its start
// is its latest); Amex card end 300 owed; Fidelity brokerage end 10,000; a 401(k) with no balance yet.
// With the 401(k) blank, investments and "you have" wait for it (blank is not 0). Once its start is 20,000:
// investments 10,000 + 20,000 = 30,000; you have 1,000 + 2,000 + 30,000 = 33,000; you owe 300; net 32,700.
test('investments are never cash on hand', () => {
  const d = newHousehold('Accounts');
  d.currentMonth = '2026-10';
  const one = (a) => makeValue(a, { cadence: 'one-off' });
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  addAccount(d, { id: 'sav', name: 'Savings', type: 'savings' });
  addAccount(d, { id: 'fid', name: 'Fidelity', type: 'investment', institution: 'Fidelity' });
  setBalance(d, '2026-10', 'chk', 'end', one(1000));
  setBalance(d, '2026-10', 'sav', 'start', one(2000));
  setBalance(d, '2026-10', 'fid', 'end', one(10000));
  // What you have and owe is the net worth now (S-111, test/networth.test.js). Cash is checking 1,000 + savings 2,000 only.
  assert.equal(cashOnHand(migrate(d)).amount, 3000);
});

test('a card or loan balance opens Credit and debt; a bank balance opens Accounts (S-126)', async () => {
  const { whereFor } = await import('../src/ui/nav.js');
  const { october } = await import('./fixtures/october.js');
  const d = october();
  // The October household has checking "chk" and the card "visa" (an account of type credit-card).
  assert.deepEqual(whereFor(d, ['balances', '2026-10', 'chk', 'end'])[0], 'balances');
  assert.deepEqual(whereFor(d, ['balances', '2026-10', 'visa', 'end'])[0], 'setup:debts');
});
