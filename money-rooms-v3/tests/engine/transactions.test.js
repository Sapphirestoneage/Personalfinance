/* Level 10: transactions. A synthetic 60-day export for Maya, written here by hand (never from the engine): rent split with a roommate by Venmo, weeknight delivery, an annual subscription, two forgotten monthly subscriptions, an overdraft fee, a buy now pay later purchase, and a card payment that must not double count. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, guessMapping, normalize, categorize, clean, detect, patterns, actuals, compareToGut, foundMoney, applyActuals, merchantKey, parseMoney, isRocketMoney } from '../../engine/transactions.js';
import { compute } from '../../engine/compute.js';
import { setField, createRow, addRow } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { isGuessRow } from '../../engine/guesses.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const rules = data.merchantRules; const TODAY = '2026-10-07'; const NOW = '2026-10-07T15:00:00.000Z';

import { ROWS, CSV } from '../households/maya-transactions.mjs';
function sharedCtx() { return { sharedLines: [{ rowId: 'rent', name: 'Rent', fullCents: 330000, shareCents: 165000, category: 'accommodation' }] }; }
function pipeline() {
  const parsed = parseCsv(CSV); const map = guessMapping(parsed.headers, rules); const txs = categorize(normalize(parsed, map), rules, {});
  const cl = clean(txs, sharedCtx()); const det = detect(cl.kept, rules); const pat = patterns(cl.kept, { recurring: det.recurring }); const act = actuals(cl.kept, det.spanDays);
  return { parsed, map, txs, cl, det, pat, act };
}

test('the CSV parses with quotes and the mapper recognises a Rocket Money export; a bank export is guessed and remembered by the coach', () => {
  const parsed = parseCsv(CSV); assert.equal(parsed.rows.length, ROWS.length); assert.ok(isRocketMoney(parsed.headers, rules));
  const map = guessMapping(parsed.headers, rules); assert.equal(map.signs, 'rocket'); assert.equal(map.description, 'Name');
  const bank = parseCsv('Posting Date,Description,Debit,Credit\n09/01/2026,"HUDSON REALTY, RENT",3300.00,\n09/02/2026,VENMO FROM DANI,,1650.00\n');
  const bm = guessMapping(bank.headers, rules); assert.equal(bm.signs, 'columns'); assert.equal(bm.date, 'Posting Date');
  const txs = normalize(bank, bm, 'Chase'); assert.equal(txs[0].amount, 330000); assert.equal(txs[1].amount, -165000); assert.equal(txs[0].date, '2026-09-01'); assert.equal(txs[0].account, 'Chase');
  assert.equal(parseMoney('($1,234.50)'), -123450); assert.equal(merchantKey('DOORDASH*THAI PLACE 8821'), 'doordash thai place');
});

test('cleaning: the card payment and the transfer to savings never double count; the Target refund nets; Venmo from the roommate matches the rent share; Venmo to a friend is flagged', () => {
  const { cl } = pipeline();
  assert.equal(cl.removed.filter(r => r.reason === 'card payment').length, 2);
  assert.equal(cl.removed.filter(r => r.reason === 'transfer between your accounts').length, 2);
  const refund = cl.netted.find(n => n.kind === 'refund'); assert.ok(refund && refund.cents === 2000);
  const rm = cl.netted.filter(n => n.kind === 'roommate'); assert.equal(rm.length, 2); assert.equal(rm[0].lineName, 'Rent'); assert.equal(rm[0].cents, 165000); assert.equal(rm[0].confirmed, null, 'the coach confirms');
  assert.ok(cl.flags.some(f => f.kind === 'p2p out' && f.tx.amount === 6000));
  assert.ok(!cl.kept.some(t => t.category === 'cardPayment' || t.category === 'ownTransfer'));
});

test('detection: recurring bills, two forgotten monthly subscriptions and the annual one with its next renewal, the fee, the buy now pay later, price creep, no duplicates', () => {
  const { det } = pipeline();
  const names = det.recurring.map(r => r.merchant);
  assert.ok(names.includes('hudson realty rent') && names.includes('pse&g electric') && names.includes('nj transit'));
  const subs = det.subscriptions.map(s => s.description); assert.ok(subs.includes('NETFLIX.COM') && subs.includes('SPOTIFY USA') && subs.includes('HULU'));
  const adobe = det.subscriptions.find(s => s.description === 'ADOBE ANNUAL PLAN'); assert.ok(adobe); assert.equal(adobe.cadence, 'annual'); assert.equal(adobe.annual, 29988); assert.equal(adobe.nextDate, '2027-09-05');
  assert.equal(det.recurring.find(r => r.merchant === 'netflix com').cadence, 'monthly'); assert.equal(det.recurring.find(r => r.merchant === 'netflix com').nextDate, '2026-10-15');
  assert.equal(det.fees.length, 1); assert.equal(det.fees[0].tx.amount, 3500);
  assert.equal(det.bnpl.length, 2); assert.ok(det.bnpl.every(b => b.tx.category === 'bnpl'));
  assert.ok(det.priceCreep.length === 0 || det.priceCreep.every(p => p.to > p.from));
  assert.equal(det.duplicates.length, 0);
  assert.ok(det.spanDays >= 50 && det.spanDays <= 60, 'the window is the first to the last transaction: ' + det.spanDays);
});

test('patterns: the top five merchants, small and frequent against big and rare, weeknight delivery, and paydays against bills', () => {
  const { pat } = pipeline();
  assert.equal(pat.topMerchants.length, 5); assert.equal(pat.topMerchants[0].merchant, 'hudson realty rent'); assert.ok(pat.topMerchants[0].share > 0.5);
  assert.ok(pat.smallFrequent.count >= 8 && pat.bigRare.count >= 2);
  assert.ok(pat.weeknightEvening.food > 20000, 'weeknight delivery adds up');
  assert.deepEqual(pat.calendar.payDays, [11, 14, 25, 28]); assert.ok(pat.calendar.billDays.includes(1), 'rent lands on the first');
});

test('actuals against her gut: the ratio per area, the blind spot percent, the correction factor, and one found-money win', () => {
  const { det, act, cl } = pipeline();
  assert.ok(act.monthly.accommodation > 300000, 'the full rent until the roommate match is confirmed');
  const confirmed = cl.netted.filter(n => n.kind === 'roommate').map(n => Object.assign({}, n, { confirmed: true }));
  const act2 = actuals(cl.kept, det.spanDays, confirmed); assert.ok(act2.monthly.accommodation < act.monthly.accommodation && act2.monthly.accommodation > 150000, 'confirmed, the roommate share comes off: ' + act2.monthly.accommodation);
  const gut = { 'spending:food': { cents: 50000 }, 'spending:wants': { cents: 15000 }, 'spending:utilities': { cents: 10000 }, 'spending:accommodation': { cents: 165000 }, 'spending:transportation': { cents: 12000 }, 'spending:therapy': { cents: 10000 } };
  const cmp = compareToGut(act.monthly, gut);
  assert.ok(cmp.perArea.food.ratio > 1.2, 'food is more than she thought: ' + cmp.perArea.food.ratio);
  assert.ok(cmp.blindSpotPct > 0.2 && cmp.blindSpotPct < 0.8, 'blind spot ' + cmp.blindSpotPct);
  assert.equal(cmp.correction.food, cmp.perArea.food.ratio);
  const win = foundMoney(det, cl); assert.ok(win); assert.equal(win.kind, 'subscription'); assert.equal(win.label, 'ADOBE ANNUAL PLAN'); assert.ok(win.text.indexOf('$300 a year') !== -1);
});

test('applying the actuals writes verified lines per recurring merchant plus the rest, keeps her shared rent line, and clears the guesses', () => {
  const rec = loadHousehold('maya-discovery');
  const rent = rec.planets.spending.rows.find(r => /rent/i.test(r.nickname)); rent.guess = false;
  setField(rec, rent.id, 'amount', 330000, 'known', 'client', { now: NOW, cad: 'month' }); setField(rec, rent.id, 'shared', true, 'known', 'client', { now: NOW }); setField(rec, rent.id, 'myShare', 0.5, 'known', 'client', { now: NOW });
  const before = rec.planets.spending.rows.filter(isGuessRow).length; assert.ok(before > 0);
  const { det, act } = pipeline();
  const touched = applyActuals(rec, data, det, act, { now: NOW, session: 's3' });
  assert.ok(touched.length >= 8);
  assert.ok(rec.planets.spending.rows.some(r => r.id === rent.id), 'the shared rent line stays');
  assert.equal(rec.planets.spending.rows.filter(r => r.f.category && r.f.category.v === 'food' && isGuessRow(r)).length, 0, 'food guesses are gone');
  const food = rec.planets.spending.rows.filter(r => r.f.category && r.f.category.v === 'food'); assert.ok(food.every(r => r.f.amount.state === 'verified'));
  assert.ok(food.some(r => r.nickname.indexOf('TRADER JOES') === 0) && food.some(r => r.nickname.indexOf('Everything else') === 0));
  const R = compute(rec, data, { today: TODAY }); assert.equal(R.sun.outputs.spending.byCategory.food.cents, act.monthly.food);
  assert.ok(rec.journal.some(l => l.kind === 'set' && l.why === 'correction'));
});
