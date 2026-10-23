// Phase 6: transaction import. Checks the Jordan household's two CSV files
// (src/data/households/jordan-chase.csv and jordan-checking.csv) against the hand-computed
// answers in src/data/households/jordan.expected.js, plus format detection for Amex and Capital One.
// Depends on the tx-import, tx-analysis, csv and model engines, the store's edits, accounts,
// validate and log modules, the October fixture, and tests/helpers.js for the merchant rules
// and the Jordan household file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importCSV, detectFormat, merchantKey, parseDate, parseMoney } from '../src/engines/tx-import.js';
import { parseCSV } from '../src/engines/csv.js';
import { actualsFromTransactions, detect, topMerchants, weekdaySpending, sizeVsCount } from '../src/engines/tx-analysis.js';
import { budgetModel } from '../src/engines/model.js';
import { addTransactions, setTransactionLine } from '../src/store/edits.js';
import { validateHousehold } from '../src/store/validate.js';
import { addAccount } from '../src/store/accounts.js';
import { loadRefs, loadHousehold, readText, near } from './helpers.js';
import exp from '../src/data/households/jordan.expected.js';

const refs = loadRefs();

function loadJordan() {
  const doc = loadHousehold('jordan');
  const opts = { rulesData: refs.merchantRules, memory: doc.merchantMemory };
  // Accounts first (S-084): imports carry the account id.
  addAccount(doc, { id: 'acct-chase', name: 'Chase card', type: 'credit-card' });
  addAccount(doc, { id: 'acct-checking', name: 'Checking', type: 'checking' });
  const card = importCSV(readText('src/data/households/jordan-chase.csv'), { ...opts, account: 'acct-chase' });
  const bank = importCSV(readText('src/data/households/jordan-checking.csv'), { ...opts, account: 'acct-checking' });
  addTransactions(doc, card.transactions);
  addTransactions(doc, bank.transactions);
  return { doc, card, bank };
}

const money = (a, e, l) => assert.ok(near(a, e, 2), l + ': got ' + a + ', expected ' + e);
const share = (a, e, l) => assert.ok(near(a, e, 6), l + ': got ' + a + ', expected ' + e);

test('CSV reader handles quotes, commas inside quotes, and CRLF', () => {
  assert.deepEqual(parseCSV('a,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('formats are detected from the header row', () => {
  assert.equal(detectFormat(['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount', 'Memo']), 'chase-card');
  assert.equal(detectFormat(['Details', 'Posting Date', 'Description', 'Amount', 'Type', 'Balance', 'Check or Slip #']), 'chase-checking');
  assert.equal(detectFormat(['Date', 'Description', 'Card Member', 'Account #', 'Amount']), 'amex');
  assert.equal(detectFormat(['Transaction Date', 'Posted Date', 'Card No.', 'Description', 'Category', 'Debit', 'Credit']), 'capital-one');
  assert.equal(detectFormat(['Date', 'Description', 'Amount']), 'generic');
  assert.equal(detectFormat(['foo', 'bar']), null);
});

test('dates, money, and merchant keys', () => {
  assert.equal(parseDate('9/3/26'), '2026-09-03');
  assert.equal(parseDate('2026-09-03'), '2026-09-03');
  assert.equal(parseMoney('($1,200.50)'), -1200.5);
  assert.equal(merchantKey('WHOLE FOODS MARKET #123'), 'WHOLE FOODS MARKET');
  assert.equal(merchantKey('SQ *BLUE BOTTLE 4433'), 'BLUE BOTTLE');
});

test('Amex: positive is a charge; refunds and payments are not spending', () => {
  const r = importCSV('Date,Description,Card Member,Account #,Amount\n09/05/2026,STARBUCKS,JORDAN,-1001,6.50\n09/07/2026,STARBUCKS REFUND,JORDAN,-1001,-6.50\n09/10/2026,AUTOPAY PAYMENT - THANK YOU,JORDAN,-1001,-200.00\n',
    { account: 'Amex', rulesData: refs.merchantRules });
  assert.equal(r.format, 'amex');
  assert.deepEqual(r.transactions.map((t) => [t.amount, t.kind, t.lineId]), [[6.5, 'spend', 'eating-out'], [-6.5, 'refund', 'eating-out'], [-200, 'card-payment', null]]);
});

test('Capital One: debit and credit columns', () => {
  const r = importCSV('Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n2026-09-03,2026-09-04,1234,KROGER #12,Merchandise,54.20,\n2026-09-09,2026-09-10,1234,CAPITAL ONE MOBILE PYMT,Payment/Credit,,300.00\n',
    { account: 'Capital One', rulesData: refs.merchantRules });
  assert.equal(r.format, 'capital-one');
  assert.deepEqual(r.transactions.map((t) => [t.amount, t.kind, t.lineId]), [[54.2, 'spend', 'groceries'], [-300, 'card-payment', null]]);
});

test('Jordan: every row imported and classified', () => {
  const { doc } = loadJordan();
  assert.equal(doc.transactions.length, exp.count);
  const kinds = {};
  for (const t of doc.transactions) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
  assert.deepEqual(kinds, exp.kinds);
  assert.deepEqual(validateHousehold(doc), []);
});

test('Jordan: importing the same file again adds nothing (but real same-day repeats were kept)', () => {
  const { doc } = loadJordan();
  const again = importCSV(readText('src/data/households/jordan-chase.csv'), { account: 'acct-chase', rulesData: refs.merchantRules, memory: doc.merchantMemory });
  assert.equal(addTransactions(doc, again.transactions), 0);
  assert.equal(doc.transactions.filter((t) => t.merchant === 'TRADER JOE S').length, 2);
});

test('Jordan: September and August actuals, double counting removed', () => {
  const { doc } = loadJordan();
  const sep = actualsFromTransactions(doc.transactions, '2026-09');
  for (const [k, v] of Object.entries(exp.september)) money(sep.byLine[k], v, 'Sep ' + k);
  assert.deepEqual(Object.keys(sep.byLine).sort(), Object.keys(exp.september).sort());
  assert.deepEqual(sep.counts, exp.septemberCounts);
  money(sep.unmapped, exp.septemberUnmapped[0], 'unmapped');
  assert.equal(sep.unmappedCount, exp.septemberUnmapped[1]);
  const aug = actualsFromTransactions(doc.transactions, '2026-08');
  for (const [k, v] of Object.entries(exp.august)) money(aug.byLine[k], v, 'Aug ' + k);
});

test('Jordan: actuals come from the log, with no confirm step (S-087)', () => {
  const { doc } = loadJordan();
  // Groceries was typed as 300, but September has 3 grocery entries: the log owns it,
  // 95.60 + 61.30 + 61.30 = 218.20 (the same-day Trader Joe's repeat is kept until someone removes it).
  const food = budgetModel(doc).categories.find((c) => c.id === 'food');
  const g = food.lines.find((l) => l.id === 'groceries');
  money(g.actual, 218.2, 'groceries');
  assert.deepEqual([g.actualFrom, g.logCount, g.status.actual], ['log', 3, 'computed']);
  money(food.actual.amount, exp.foodActualAfterApplying, 'food actual');
  // Rent has no entries: the typed 1,500 stays
  const rent = budgetModel(doc).categories.find((c) => c.id === 'housing').lines[0];
  assert.deepEqual([rent.actual, rent.actualFrom], [1500, 'typed']);
});

test('Jordan: detections', () => {
  const { doc } = loadJordan();
  const d = detect(doc.transactions);
  assert.deepEqual(d.subscriptions.map((s) => [s.merchant, s.yearly]), exp.subscriptions);
  money(d.subscriptionsYearly, exp.subscriptionsYearly, 'subscriptions yearly');
  assert.deepEqual(d.priceCreep.map((p) => [p.merchant, p.from, p.to, p.monthly, p.yearly]), exp.priceCreep);
  assert.deepEqual(d.trials.map((t) => [t.merchant, t.trialDate, t.paidDate, t.amount]), exp.trials);
  assert.deepEqual(d.duplicates.map((x) => [x.merchant, x.date, x.amount]), exp.duplicates);
  money(d.feesTotal, exp.feesTotal, 'fees');
  money(d.bnplTotal, exp.bnplTotal, 'bnpl');
});

test('Jordan: top merchants, weekdays, size vs count', () => {
  const { doc } = loadJordan();
  const tm = topMerchants(doc.transactions);
  money(tm.total, exp.topTotal, 'merchant total');
  exp.top.forEach(([m, amt, sh], i) => {
    assert.equal(tm.top[i].merchant, m);
    money(tm.top[i].amount, amt, m);
    share(tm.top[i].share, sh, m + ' share');
  });
  share(tm.topShare, exp.topShare, 'top 5 share');
  const w = weekdaySpending(doc.transactions);
  w.days.forEach((d, i) => money(d.amount, exp.weekdays[i], d.label));
  money(w.total, exp.weekdayTotal, 'weekday total');
  money(w.weekend, exp.weekend, 'weekend');
  money(w.weekday, exp.weekday, 'weekday');
  share(w.weekendShare, exp.weekendShare, 'weekend share');
  money(w.perWeekendDay, exp.perWeekendDay, 'per weekend day');
  money(w.perWeekday, exp.perWeekday, 'per weekday');
  const sc = Object.fromEntries(sizeVsCount(doc.transactions).map((x) => [x.merchant, [x.count, x.average]]));
  for (const [m, [c, avg]] of Object.entries(exp.sizeVsCount)) { assert.equal(sc[m][0], c, m); money(sc[m][1], avg, m + ' average'); }
});

test('re-mapping a merchant is remembered and applied to its other transactions', () => {
  const { doc } = loadJordan();
  const affirm = doc.transactions.filter((t) => t.merchant === 'AFFIRM PAYMENT');
  setTransactionLine(doc, affirm[0].id, 'shopping', true);
  assert.equal(doc.merchantMemory['AFFIRM PAYMENT'], 'shopping');
  assert.ok(doc.transactions.filter((t) => t.merchant === 'AFFIRM PAYMENT').every((t) => t.lineId === 'shopping'));
});

test('a fee line is made in Bills the first time an import maps to it (S-123)', async () => {
  const { october } = await import('./fixtures/october.js');
  const { mergeImport } = await import('../src/store/log.js');
  const { findLine } = await import('../src/store/edits.js');
  const d = october();
  assert.equal(findLine(d, 'fee-late'), null);
  mergeImport(d, { rows: [{ status: 'new', tx: { id: 'tx-late', date: '2026-10-05', amount: 39, merchant: 'LATE FEE', lineId: 'fee-late', account: 'chk', kind: 'spend' } }] });
  const hit = findLine(d, 'fee-late');
  // In Bills and subscriptions, named "Late fees", and the entry points to it.
  assert.deepEqual([hit.category.id, hit.line.name, d.transactions.find((t) => t.id === 'tx-late').lineId], ['bills', 'Late fees', 'fee-late']);
});
