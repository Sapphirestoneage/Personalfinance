// Part 2 of the monthly loop: the log, quick entry, and matching an import against what was already
// logged (S-085). Expected numbers by hand. Uses the store (schema, migrate, validate, accounts, log),
// the log, tx-import and tx-analysis engines, and the helpers, which load the reference data in
// src/data (the merchant rules map bank descriptions to lines).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newHousehold } from '../src/store/schema.js';
import { migrate } from '../src/store/migrate.js';
import { validateHousehold } from '../src/store/validate.js';
import { addAccount } from '../src/store/accounts.js';
import { addEntry, mergeImport, confirmMatch, rejectMatch, editEntry, markNotDuplicate } from '../src/store/log.js';
import { matchImport, matchSummary, similarMerchant, amountClose, recentLines, lastAccount, monthLog, counted } from '../src/engines/log.js';
import { importCSV } from '../src/engines/tx-import.js';
import { actualsFromTransactions, detect } from '../src/engines/tx-analysis.js';
import { loadRefs } from './helpers.js';

const refs = loadRefs();

function october() {
  const d = newHousehold('Log');
  d.currentMonth = '2026-10';
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  addAccount(d, { id: 'card', name: 'Visa', type: 'credit-card' });
  const m = {};
  // Logged during the month with quick entry (positive = money out)
  m.m1 = addEntry(d, { date: '2026-10-03', amount: 54.2, lineId: 'groceries', merchant: "Trader Joe's", note: 'weekly shop', account: 'chk' });
  m.m2 = addEntry(d, { date: '2026-10-05', amount: 40, lineId: 'gas', merchant: 'Shell', account: 'card' });
  m.m3 = addEntry(d, { date: '2026-10-07', amount: 6.5, lineId: 'eating-out', note: 'coffee' });
  m.m4 = addEntry(d, { date: '2026-10-09', amount: 13, lineId: 'eating-out', merchant: 'Chipotle', account: 'card' });
  m.m5 = addEntry(d, { date: '2026-10-12', amount: 30, lineId: 'shopping', merchant: 'Target', note: 'towels', account: 'chk' });
  m.m6 = addEntry(d, { date: '2026-10-25', amount: 20, lineId: 'transit', merchant: 'Uber', account: 'chk' });
  return { d, m };
}

const CSV = 'Date,Description,Amount\n' +
  '10/04/2026,TRADER JOE S #552,-54.20\n' +   // i1: m1, same amount, 1 day later, same shop: clear
  '10/06/2026,STARBUCKS 0091,-6.75\n' +       // i2: m3 (no account, no merchant), 0.25 off: possible
  '10/12/2026,TARGET T-1234,-31.00\n' +       // i3: m5, $1.00 off (within $1), same shop: clear
  '10/15/2026,PAYROLL ACME,2400.00\n' +       // i4: income, nothing logged: new
  '10/20/2026,WHOLE FOODS MKT,-80.10\n' +     // i5: nothing logged: new
  '10/25/2026,UBER TRIP,-20.00\n' +           // i7 and i8 both could be m6 (one ride logged, two taken): possible
  '10/26/2026,UBER TRIP,-20.00\n';

function imported(d) {
  return importCSV(CSV, { account: 'chk', rulesData: refs.merchantRules, memory: d.merchantMemory }).transactions;
}

test('quick entry: a manual entry, the merchant remembers its line, recent lines first', () => {
  const d = newHousehold('Quick');
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking' });
  addAccount(d, { id: 'card', name: 'Visa', type: 'credit-card' });
  const a = addEntry(d, { date: '2026-10-02', amount: 5.25, lineId: 'eating-out', merchant: 'Blue Bottle', account: 'card' });
  assert.deepEqual([a.source, a.merchant, a.lineId, a.account, a.kind], ['manual', 'BLUE BOTTLE', 'eating-out', 'card', 'spend']);
  assert.equal(d.merchantMemory['BLUE BOTTLE'], 'eating-out');
  // Same shop again, no line picked: the line comes from memory
  const b = addEntry(d, { date: '2026-10-04', amount: 4.75, merchant: 'blue bottle' });
  assert.equal(b.lineId, 'eating-out');
  // A refund is money back (negative) and an income has no line
  addEntry(d, { date: '2026-10-05', amount: -20, kind: 'refund', lineId: 'shopping' });
  addEntry(d, { date: '2026-10-06', amount: -1800, kind: 'income', account: 'chk' });
  addEntry(d, { date: '2026-10-07', amount: 61, lineId: 'groceries' });
  // Newest first: groceries (10-07), shopping (10-05), eating out (10-04)
  assert.deepEqual(recentLines(d), ['groceries', 'shopping', 'eating-out']);
  // Last account used: the income on 10-06 went to checking
  assert.equal(lastAccount(d), 'chk');
  const ml = monthLog(d, '2026-10');
  // 5 entries so far (a, b, the refund, the income, the groceries), all typed by hand.
  assert.deepEqual([ml.count, ml.bySource.manual, ml.last], [5, 5, '2026-10-07']);
  assert.throws(() => addEntry(d, { date: '2026-10-07' }), /amount/);
  assert.deepEqual(validateHousehold(d), []);
});

test('merchants and amounts: similar enough to match', () => {
  assert.equal(similarMerchant('TRADER JOE S', "TRADER JOE'S"), true);
  assert.equal(similarMerchant('TARGET T-', 'TARGET'), true);
  assert.equal(similarMerchant('SHELL OIL', 'CHEVRON'), false);
  // within $1, or within 2% for bigger amounts: 2% of 1,200 is 24
  assert.equal(amountClose(30, 31), true);
  assert.equal(amountClose(30, 31.01), false);
  assert.equal(amountClose(1200, 1224), true);
  assert.equal(amountClose(1200, 1224.5), false);
});

test('an import is matched against the log: matched 2, new 2, possible 3', () => {
  const { d, m } = october();
  const res = matchImport(d.transactions, imported(d));
  const by = Object.fromEntries(res.rows.map((r) => [r.tx.description, r]));
  assert.equal(by['TRADER JOE S #552'].status, 'matched');
  assert.equal(by['TRADER JOE S #552'].entryId, m.m1.id);
  assert.equal(by['TARGET T-1234'].status, 'matched');
  assert.equal(by['STARBUCKS 0091'].status, 'possible');
  assert.deepEqual(by['STARBUCKS 0091'].candidates, [m.m3.id]);
  assert.equal(by['PAYROLL ACME'].status, 'new');
  assert.equal(by['WHOLE FOODS MKT'].status, 'new');
  assert.deepEqual(res.rows.filter((r) => r.tx.merchant === 'UBER TRIP').map((r) => r.status), ['possible', 'possible']);
  assert.equal(matchSummary(res), 'Matched 2, new 2, possible matches 3 to confirm.');
});

test('merging keeps the bank date, amount, and merchant, and the logged line and note; nothing counts twice', () => {
  const { d, m } = october();
  // Before: groceries 54.20; eating out 6.50 + 13.00 = 19.50; shopping 30; transit 20
  const before = actualsFromTransactions(d.transactions, '2026-10').byLine;
  assert.deepEqual(before, { groceries: 54.2, gas: 40, 'eating-out': 19.5, shopping: 30, transit: 20 });
  const out = mergeImport(d, matchImport(d.transactions, imported(d)));
  // 7 rows: the 2 clear matches merge into the logged entries; the 2 new and the 3 possible are added, the possible ones waiting.
  assert.deepEqual(out, { added: 5, merged: 2, waiting: 3 });
  // 6 logged - 2 merged + 7 imported = 11 entries
  assert.equal(d.transactions.length, 11);
  const tj = d.transactions.find((t) => t.merchant === 'TRADER JOE S');
  assert.deepEqual([tj.date, tj.amount, tj.lineId, tj.note, tj.source, tj.mergedFrom.id], ['2026-10-04', 54.2, 'groceries', 'weekly shop', 'import', m.m1.id]);
  const tg = d.transactions.find((t) => t.merchant === 'TARGET T-');
  assert.deepEqual([tg.amount, tg.lineId, tg.note], [31, 'shopping', 'towels']);
  // Possible matches do not count yet; Whole Foods (80.10) is new, mapped by the rules
  // groceries 54.20 + 80.10 = 134.30; shopping 31 (bank amount); eating out still 19.50; transit still 20
  const after = actualsFromTransactions(d.transactions, '2026-10').byLine;
  assert.deepEqual(after, { groceries: 134.3, gas: 40, 'eating-out': 19.5, shopping: 31, transit: 20 });
  // 11 entries less the 3 possible matches still waiting = 8 counted.
  assert.equal(counted(d.transactions).length, 8);
  assert.deepEqual(validateHousehold(d), []);

  // Confirm Starbucks is the coffee: eating out 6.75 + 13.00 = 19.75
  const sb = d.transactions.find((t) => t.merchant === 'STARBUCKS');
  confirmMatch(d, sb.id, m.m3.id);
  assert.equal(actualsFromTransactions(d.transactions, '2026-10').byLine['eating-out'], 19.75);
  assert.equal(d.transactions.find((t) => t.merchant === 'STARBUCKS').note, 'coffee');
  // The first Uber is the logged ride; the second then stands on its own: transit 20 + 20 = 40
  const ubers = d.transactions.filter((t) => t.merchant === 'UBER TRIP');
  confirmMatch(d, ubers[0].id, m.m6.id);
  assert.equal(d.transactions.filter((t) => t.possible).length, 0);
  assert.equal(actualsFromTransactions(d.transactions, '2026-10').byLine.transit, 40);
  assert.deepEqual(validateHousehold(d), []);
  // Importing the same file again adds nothing
  const again = matchImport(d.transactions, imported(d));
  assert.equal(again.same, 7);
  assert.deepEqual(mergeImport(d, again), { added: 0, merged: 0, waiting: 0 });
});

test('not a match: both count on their own', () => {
  const { d, m } = october();
  mergeImport(d, matchImport(d.transactions, imported(d)));
  const sb = d.transactions.find((t) => t.merchant === 'STARBUCKS');
  rejectMatch(d, sb.id);
  // Starbucks is mapped to eating out by the keyword rules: 6.50 (coffee) + 13.00 + 6.75 = 26.25
  assert.equal(sb.lineId, 'eating-out');
  assert.equal(actualsFromTransactions(d.transactions, '2026-10').byLine['eating-out'], 26.25);
  assert.ok(m.m3);
});

test('editing an entry, and a likely duplicate marked as two real charges', () => {
  const d = newHousehold('Dup');
  const a = addEntry(d, { date: '2026-10-10', amount: 12, lineId: 'eating-out', merchant: 'Sweetgreen' });
  const b = addEntry(d, { date: '2026-10-10', amount: 12, lineId: 'eating-out', merchant: 'Sweetgreen' });
  assert.equal(detect(d.transactions).duplicates.length, 1);
  markNotDuplicate(d, [a.id, b.id]);
  assert.equal(detect(d.transactions).duplicates.length, 0);
  editEntry(d, b.id, { amount: 14.5, note: 'with a drink' });
  assert.equal(actualsFromTransactions(d.transactions, '2026-10').byLine['eating-out'], 26.5);
});

test('a version 5 file: transactions become the log, account names become accounts', () => {
  const raw = JSON.parse(JSON.stringify(newHousehold('Old')));
  raw.schemaVersion = 5;
  raw.transactions = [
    { id: 'tx-a', date: '2026-09-02', amount: 50, description: 'KROGER', account: 'Chase card', kind: 'spend', merchant: 'KROGER', lineId: 'groceries', bnpl: false },
    { id: 'tx-b', date: '2026-09-03', amount: -2400, description: 'PAYROLL', account: 'Checking', kind: 'income', merchant: 'PAYROLL', lineId: null, bnpl: false }
  ];
  const d = migrate(raw);
  assert.deepEqual(validateHousehold(d), []);
  assert.deepEqual(d.accounts.map((a) => [a.id, a.name, a.type]), [['acct-chase-card', 'Chase card', 'credit-card'], ['acct-checking', 'Checking', 'checking']]);
  assert.deepEqual(d.transactions.map((t) => [t.source, t.account]), [['import', 'acct-chase-card'], ['import', 'acct-checking']]);
});
