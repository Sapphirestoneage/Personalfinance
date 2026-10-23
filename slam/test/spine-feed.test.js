// The feed (S-207): a statement or an old Budget document becomes proposals
// against the spine's log; nothing lands until applied; a re-import adds
// nothing twice; merchants are cleaned; the log then drives estimated vs actual.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { putFact } from '../engine/edits.js';
import { parseCsv, detectFormat, readCsv, classifyKind, matchExpense, proposeCsv, proposeBudget, applyImport, budgetDocsFromStorage } from '../engine/feed.js';
import { estimatedVsActual } from '../engine/compare.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const SLAM = new URL('../', import.meta.url).pathname;
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const MR = readJson('data/merchant-rules.json');
const chase = readFileSync(SLAM + 'test/households/jordan-chase.csv', 'utf8');
const checking = readFileSync(SLAM + 'test/households/jordan-checking.csv', 'utf8');
const T = '2026-10-22';

test('CSV reading: quotes, formats, dates and money', () => {
  assert.deepEqual(parseCsv('a,"b, c",d\n1,"say ""hi""",3\r\n'), [['a', 'b, c', 'd'], ['1', 'say "hi"', '3']]);
  assert.equal(detectFormat(['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount', 'Memo']), 'chase-card');
  assert.equal(detectFormat(['Date', 'Description', 'Amount']), 'generic');
  assert.equal(detectFormat(['x', 'y']), null);
  const card = readCsv(chase);
  assert.equal(card.format, 'chase-card');
  assert.equal(card.isCard, true);
  assert.equal(card.rows.length, 21);
  const pay = card.rows.find((r) => /payment thank you/i.test(r.description));
  assert.ok(pay.outflow < 0, 'a payment to the card is money in on the card');
  assert.equal(classifyKind(pay, MR.kindRules, true), 'card-payment');
  const chk = readCsv(checking);
  assert.equal(chk.format, 'generic');
  const payroll = chk.rows.find((r) => /payroll/i.test(r.description));
  assert.equal(classifyKind(payroll, MR.kindRules, false), 'income');
  assert.throws(() => readCsv(''), /empty/);
  assert.throws(() => readCsv('x,y\n1,2'), /Could not tell/);
});

test('a line is matched by memory, by id, by the old Budget names and aliases, by the merchant rules, or not at all', () => {
  const s = demo();
  assert.equal(matchExpense(s, { lineId: 'rent' }), 'rent');
  assert.equal(matchExpense(s, { lineId: 'eating-out', name: 'Eating out' }), 'dining', 'the old name maps to the spine line');
  assert.equal(matchExpense(s, { lineId: 'subscriptions', name: 'Phone' }), 'streaming', 'the alias wins before the name');
  assert.equal(matchExpense(s, { name: 'Bus pass' }), 'transit', 'half the words is enough');
  assert.equal(matchExpense(s, { merchant: 'Trader Joe S', rules: MR.rules }), 'groceries', 'a merchant rule names the line');
  assert.equal(matchExpense(s, { merchant: 'Blue Bottle', memory: { 'Blue Bottle': 'dining' } }), 'dining');
  assert.equal(matchExpense(s, { merchant: 'Blue Bottle', memory: { 'Blue Bottle': 'nope' } }), null, 'memory to a line that is gone is ignored');
  assert.equal(matchExpense(s, { name: 'Pottery class' }), null);
});

test('a statement becomes proposals: card payments skipped, a planned line matched within 2% and 5 days, the rest new; apply once, never twice', () => {
  let s = demo();
  s = putFact(s, 'expenses.gym.payDay', 5, 'known', T);
  // A gym charge of $50 on the 5th: planned and matched. Build a small statement.
  const csv = 'Date,Description,Amount\n2026-10-05,CRUNCH FITNESS 44,-50.00\n2026-10-06,SQ *BLUE BOTTLE 4471,-7.25\n2026-10-07,PAYMENT THANK YOU,500.00\n2026-10-08,TRADER JOE S #512,-61.10\n2026-10-09,TRADER JOE S #512,-22.40\n2026-10-10,TRADER JOE S #512,-19.00\n';
  const p = proposeCsv(s, R, csv, { paidWith: 'visa', merchantRules: MR });
  assert.equal(p.format, 'generic');
  const gym = p.proposals.find((x) => /crunch/i.test(x.description));
  assert.equal(gym.status, 'matched');
  assert.equal(gym.expenseId, 'gym');
  assert.equal(gym.tag, 'other');
  const pay = p.proposals.find((x) => /payment thank you/i.test(x.description));
  assert.equal(pay.status, 'skip');
  assert.equal(pay.include, false);
  const tj = p.proposals.filter((x) => x.merchant === 'Trader Joe S');
  assert.equal(tj.length, 3);
  assert.ok(tj.every((x) => x.status === 'matched' && x.expenseId === 'groceries'), 'the merchant rule names groceries');
  const coffee = p.proposals.find((x) => x.merchant === 'Blue Bottle');
  assert.equal(coffee.status, 'new');
  assert.equal(coffee.kind, 'spend');
  assert.equal(coffee.paidWith, 'visa');
  assert.equal(p.counts.skip, 1);
  // Nothing has landed yet.
  assert.equal((s.log || []).length, 0);
  const a = applyImport(s, p.proposals);
  assert.equal(a.added, 5);
  assert.equal(a.skipped, 1);
  assert.equal(a.spine.log.length, 5);
  assert.ok(a.spine.log.every((e) => e.source === 'import' && e.importKey));
  assert.equal(a.spine.feed.memory['Trader Joe S'], 'groceries', 'the merchant is remembered to its line');
  assert.equal(validate(a.spine).ok, true, JSON.stringify(validate(a.spine).errors));
  // The same statement again: everything is already there.
  const again = proposeCsv(a.spine, R, csv, { paidWith: 'visa', merchantRules: MR });
  assert.equal(again.counts.same, 5);
  assert.equal(applyImport(a.spine, again.proposals).added, 0);
  // A merchant seen three times is recurring once nothing else claims it.
  const s2 = { ...a.spine, feed: { memory: {} } };
  const csv2 = 'Date,Description,Amount\n2026-10-11,BLUE BOTTLE 4471,-5.00\n2026-10-12,BLUE BOTTLE 4472,-5.00\n';
  const p2 = proposeCsv(s2, R, csv2, { paidWith: 'visa', merchantRules: { kindRules: MR.kindRules, rules: [] } });
  assert.ok(p2.proposals.every((x) => x.status === 'recurring'), JSON.stringify(p2.proposals.map((x) => x.status)));
  // Picks: only the keys named land.
  const picked = applyImport(s2, p2.proposals, { picks: [p2.proposals[0].key] });
  assert.equal(picked.added, 1);
});

test('an old Budget document feeds the log: lines by name, income by kind, a card by name; the log then drives estimated vs actual', () => {
  const s = demo();
  const doc = readJson('test/fixtures/riley-schema9.json');
  const p = proposeBudget(s, R, doc, { merchantRules: MR });
  assert.equal(p.count, doc.transactions.length);
  const rent = p.proposals.find((x) => x.key === 'budget:tx-j4o8wta');
  assert.equal(rent.expenseId, 'rent');
  assert.equal(rent.amount, 1750);
  assert.equal(rent.status, 'matched');
  const tj = p.proposals.find((x) => x.merchant === "Trader Joe's");
  assert.equal(tj.expenseId, 'groceries');
  assert.equal(tj.paidWith, 'visa', 'the Budget\'s Visa account is the spine\'s Visa');
  const income = p.proposals.filter((x) => x.kind === 'income');
  assert.ok(income.length > 20);
  assert.ok(income.every((x) => x.amount > 0));
  assert.ok(p.proposals.filter((x) => x.status === 'skip').length >= 15, 'card payments and transfers are not spending');
  const a = applyImport(s, p.proposals);
  assert.ok(a.added > 200);
  assert.equal(validate(a.spine).ok, true, JSON.stringify(validate(a.spine).errors));
  const c = estimatedVsActual(a.spine, R, { months: 3, asOf: '2025-12-31' });
  assert.deepEqual(c.monthsLogged.length, 3);
  assert.ok(c.lines.find((r) => r.id === 'rent').actual > 0);
  assert.ok(c.income.actual > 0 && c.savingsRate.real !== null);
  // The same document again adds nothing.
  assert.equal(applyImport(a.spine, proposeBudget(a.spine, R, doc, { merchantRules: MR }).proposals).added, 0);
});

test('the old Budget households saved in a browser are found by their keys', () => {
  const store = { 'slam:hh:riley': JSON.stringify({ profile: { name: 'Riley' }, transactions: [{ id: 't1' }] }), 'slam:index': '[]', 'slam:hh:bad': '{not json' };
  const docs = budgetDocsFromStorage((k) => store[k], Object.keys(store));
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, 'Riley');
  assert.equal(docs[0].transactions, 1);
});
