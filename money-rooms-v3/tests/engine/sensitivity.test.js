/* Sensitivity tie-out (Level 9, MR-042): two synthetic households built
   through the record API against tests/households/levers-expected.json,
   written by expected-levers.py from the same typed numbers and never from
   the engine. Plus the ladder, the barista rule and the progress basis. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from '../../engine/compute.js';
import { sensitivity, fiMonths, rank, whyFor } from '../../engine/sensitivity.js';
import { baristaRule, requiredMonthly, monthsToReach } from '../../engine/fiLadder.js';
import { session } from '../../engine/leverage.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { loadData } from './load-data.js';
import { LEVER_SPECS } from '../households/levers-specs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = loadData();
const TODAY = '2026-10-07';
const E = JSON.parse(fs.readFileSync(path.join(here, '..', 'households', 'levers-expected.json'), 'utf8'));

export function buildLevers(spec, id) {
  const rec = createRecord({ id, now: '2026-10-01T00:00:00.000Z' });
  const set = (rowId, fid, v, st, src, cad) => setField(rec, rowId, fid, v, st || 'known', src || 'client', { cad });
  set('sun', 'birthDate', spec.birthDate); set('sun', 'filingStatus', 'single'); set('sun', 'workSituation', 'employed'); set('sun', 'state', 'NY');
  const add = (planet, type, nick, f) => { const row = createRow(planet, type, { nickname: nick, f: freshFacts(data.fields, planet, type) }); addRow(rec, row); Object.keys(f).forEach(fid => { const [v, st, src, cad] = f[fid]; set(row.id, fid, v, st, src, cad); }); return row; };
  add('income', 'w2', 'Job', { grossPay: [spec.grossMonthly, 'known', 'client', 'month'], takeHome: [spec.takeHomeMonthly, 'known', 'client', 'month'] });
  spec.lines.forEach(([nick, cat, cents, floor]) => add('spending', 'line', nick, { category: [cat], amount: [cents, 'known', 'client', 'month'], fatFloor: [floor], needWant: [floor ? 'need' : 'want'], mistake: ['unavoidable'] }));
  const spend = spec.lines.reduce((s, l) => s + l[2], 0); const surplus = spec.takeHomeMonthly - spend;
  add('spending', 'savings', 'To brokerage', { savingsLanding: [surplus, 'known', 'client', 'month'] });
  add('debt', 'summary', 'No debt', { debtSummaryTotal: [0, 'none'] });
  add('invest', 'account', 'Brokerage', { accountType: ['taxable'], accountBalance: [spec.invested, 'known'], contribAmount: [surplus, 'known', 'client', 'month'] });
  if (spec.cash) add('invest', 'account', 'Checking', { accountType: ['checking'], accountBalance: [spec.cash, 'known'], contribAmount: [0, 'none', 'client', 'month'] });
  if (spec.baristaIncome) add('life', 'retirement', 'Retirement', { baristaIncome: [spec.baristaIncome, 'known', 'client', 'month'] });
  return rec;
}

for (const name of Object.keys(LEVER_SPECS)) {
  const rec = buildLevers(LEVER_SPECS[name], 'lv-' + name); const X = E[name];
  const R = compute(rec, data, { today: TODAY });
  const S = sensitivity({ record: rec, data, today: TODAY });
  const byId = id => S.items.find(i => i.id === id);
  const shock = (item, sid) => { const s = item.shocks.find(x => x.id === sid); assert.ok(s, item.id + ' ' + sid); return s.months; };
  const close = (a, b, what) => assert.ok(a !== null && Math.abs(a - b) <= 0.11, what + ': engine ' + a + ' vs workpaper ' + b);
  test(name + ': the FI crossing and every shock tie out to the month', () => {
    close(fiMonths(R), X.baseMonths, 'base months'); close(S.baseMonths, X.baseMonths, 'base');
    const all = byId('spending|all'); const take = S.items.find(i => i.rootId === 'takeHome');
    const brokerage = S.items.find(i => i.rootId === 'accountBalance' && !i.windfall);
    close(shock(all, 'minus10pct'), X.deltas.spendingMinus10pct, 'spending -10%');
    close(shock(take, 'plus10pct'), X.deltas.takeHomePlus10pct, 'take-home +10%');
    close(shock(all, 'minus100'), X.deltas.spendingMinus100, 'spending -$100');
    close(shock(take, 'plus100'), X.deltas.takeHomePlus100, 'take-home +$100');
    close(shock(brokerage, 'plus10pct'), X.deltas.investedPlus10pct, 'invested +10%');
    close(shock(byId('asm|returnLikely'), 'returnLikely'), X.deltas.returnPlus1pt, 'return +1');
    close(shock(byId('asm|withdrawalRate'), 'withdrawalRate'), X.deltas.withdrawal35, 'withdrawal 3.5%');
    close(shock(byId('windfall|1000'), 'windfall'), X.deltas.windfall1000, 'windfall');
  });
  test(name + ': a spending cut beats a raise of the same size, both ways', () => {
    const all = byId('spending|all'); const take = S.items.find(i => i.rootId === 'takeHome');
    assert.ok(Math.abs(shock(all, 'minus10pct')) > Math.abs(shock(take, 'plus10pct')), '10%');
    assert.ok(Math.abs(shock(all, 'minus100')) > Math.abs(shock(take, 'plus100')), '$100');
    const rk = rank(S); assert.ok(rk.impact.length > 3 && rk.headline && rk.headline.indexOf('Your biggest lever is') === 0);
    rk.impact.forEach((i, k) => { if (k) assert.ok(rk.impact[k - 1].impact >= i.impact, 'impact sorted'); assert.ok(whyFor(i).length > 20); });
    assert.ok(S.items.every(i => i.family && ['spend', 'earn', 'keep', 'grow', 'protect', 'assume'].includes(i.family)));
    const bar = byId('barista|10000'); assert.ok(bar && bar.shocks[0].rungs.baristaRegularFi === -baristaRule(0.04), 'part-time income moves the rungs by the rule, never the date');
    assert.equal(bar.shocks[0].months, 0);
  });
  test(name + ': the ladder, the barista rule and the progress basis', () => {
    const M = R.metrics;
    Object.keys(X.ladder).forEach(id => assert.equal(M[id].value.cents, X.ladder[id], id));
    assert.equal(M.baristaRule.value.cents, X.baristaRule); assert.equal(M.baristaRule.at35, X.baristaRuleAt35);
    assert.equal(baristaRule(0.04), 3000000); assert.equal(baristaRule(0.035), 3428571);
    assert.ok(Math.abs(M.pctToFi.value.value - X.pctToFiInvested) < 1e-6, 'invested basis by default');
    const rec2 = JSON.parse(JSON.stringify(rec)); rec2.sun.assumptions = { fiProgressBasis: 'netWorth' };
    const R2 = compute(rec2, data, { today: TODAY });
    assert.ok(Math.abs(R2.metrics.pctToFi.value.value - X.pctToFiNetWorth) < 1e-6, 'net worth basis by assumption');
    assert.equal(R2.metrics.pctToFi.basis, 'netWorth');
    const rec3 = JSON.parse(JSON.stringify(rec)); rec3.sun.assumptions = { withdrawalRate: 0.035 };
    assert.equal(compute(rec3, data, { today: TODAY }).metrics.baristaRule.value.cents, X.baristaRuleAt35);
    /* the reverse: part-time income that would make the household Barista FI today */
    const spend = LEVER_SPECS[name].lines.reduce((s, l) => s + l[2], 0);
    assert.equal(M.baristaIncomeNeededToday.value.cents, Math.max(0, spend - Math.round(LEVER_SPECS[name].invested * 0.04 / 12)));
    /* every rung carries a percent, a required monthly and a date */
    ['leanFi', 'baristaRegularFi', 'regularFi', 'fatFi'].forEach(id => { assert.ok(M[id].pct > 0 && M[id].requiredMonthly >= 0 && typeof M[id].months === 'number', id); });
    assert.equal(M.leanFi.pct, LEVER_SPECS[name].invested / X.ladder.leanFi);
    assert.equal(M.regularFi.months, fiMonths(R), 'the FI rung lands on the same month as the FI date');
  });
  test(name + ': the session ranks by ask priority when a FI date exists', () => {
    const s = session({ record: rec, fields: data.fields, weights: data.weights, sensitivity: S });
    assert.equal(s.rankedBy, 'ask');
    s.all.forEach(i => assert.ok(typeof i.why === 'string' && i.why.length > 10));
  });
}

test('requiredMonthly and monthsToReach: the closed forms', () => {
  assert.equal(requiredMonthly(100000, 100000, 10, 0.05), 0);
  assert.equal(requiredMonthly(100000, 0, 10, 0), Math.round(100000 / 120));
  const c = requiredMonthly(114000000, 4200000, 20, 0.05); let v = 4200000; for (let y = 0; y < 20; y++) v = v * 1.05 + c * 12; assert.ok(Math.abs(v - 114000000) < 20 * 12, 'the contribution lands on the target');
  assert.equal(monthsToReach(100, 100, []), 0); assert.equal(monthsToReach(100, 0, [{ value: 50 }, { value: 100 }]), 24); assert.equal(monthsToReach(75, 0, [{ value: 50 }, { value: 100 }]), 18); assert.equal(monthsToReach(500, 0, [{ value: 50 }]), null);
});
