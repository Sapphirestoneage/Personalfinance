// Loads each synthetic household and checks the full summary against the
// hand-computed expected file next to it (test/households/*.expected.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../src/calc/summary.js';
import { lastActual } from '../src/calc/history.js';
import { loadRefs, loadHousehold, near } from './helpers.js';

const refs = loadRefs();
const money = (a, e, label) => assert.ok(near(a, e, 2), label + ': got ' + a + ', expected ' + e);
const share = (a, e, label) => assert.ok(near(a, e, 6), label + ': got ' + a + ', expected ' + e);

for (const name of ['maya', 'luis', 'tasha', 'sam']) {
  const { default: exp } = await import('./households/' + name + '.expected.js');
  const doc = loadHousehold(name);
  const s = buildSummary(doc, refs);
  const t = s.totals;

  test(name + ': income', () => {
    money(s.income.takeHome, exp.takeHome, 'take-home');
    if (exp.pretax !== undefined) money(s.income.retirementDeductions, exp.pretax, 'retirement deductions');
    if (exp.hourly !== undefined) share(s.income.hourlyTakeHome, exp.hourly, 'hourly');
    if (exp.takeHomeStatus) {
      const src = s.income.sources[0];
      assert.equal(src.takeHomeStatus, exp.takeHomeStatus);
      assert.match(src.takeHomeNote, /State tax not included/);
      share(src.taxMonthly, exp.taxMonthly, 'tax');
      share(src.estimate.incomeTax, exp.incomeTaxMonthly, 'income tax');
      share(src.estimate.fica, exp.ficaMonthly, 'fica');
    }
  });

  test(name + ': category estimate / dream / actual', () => {
    for (const [id, [e, d, a]] of Object.entries(exp.categories)) {
      const row = s.rows.find((r) => r.id === id);
      assert.ok(row, 'missing category ' + id);
      money(row.estimate, e, id + ' estimate');
      money(row.dream, d, id + ' dream');
      money(row.actual, a, id + ' actual');
    }
  });

  test(name + ': totals and shares', () => {
    money(t.estimateTotal, exp.estimateTotal, 'estimate total');
    money(t.dreamTotal, exp.dreamTotal, 'dream total');
    money(t.actualTotal, exp.actualTotal, 'actual total');
    money(t.spending, exp.spending, 'spending');
    money(t.savings, exp.savings, 'savings');
    money(t.surplus, exp.surplus, 'surplus');
    share(t.savingsRate, exp.savingsRate, 'savings rate');
    share(t.housingShare, exp.housingShare, 'housing share');
    assert.equal(t.housingOver, exp.housingOver);
    money(t.roommateWorstCase, exp.roommateWorstCase, 'roommate worst case');
    if (exp.roommateWorstCaseShare !== undefined) share(t.roommateWorstCaseShare, exp.roommateWorstCaseShare, 'roommate share');
    if (exp.basisUsesEstimate) assert.deepEqual(t.basisUsesEstimate, exp.basisUsesEstimate);
    if (exp.basisMissing) assert.deepEqual(t.basisMissing, exp.basisMissing);
    money(t.fixed, exp.fixed, 'fixed');
    money(t.variable, exp.variable, 'variable');
    share(t.fixedPct, exp.fixedPct, 'fixed %');
    money(t.fat, exp.fat, 'FAT');
    share(t.fatShare, exp.fatShare, 'FAT share');
    money(t.needs, exp.needs, 'needs');
    money(t.wants, exp.wants, 'wants');
    share(t.needsPct, exp.needsPct, 'needs %');
    share(t.wantsPct, exp.wantsPct, 'wants %');
    share(t.savingsPct, exp.savingsPct, 'savings %');
    money(t.mistakeMonthly, exp.mistakeMonthly, 'mistakes monthly');
    money(t.mistakeYearly, exp.mistakeYearly, 'mistakes yearly');
    money(t.owedBack, exp.owedBack, 'owed back');
    if (exp.moveOut) {
      assert.equal(s.moveOut.guess.amount, exp.moveOut[0]);
      assert.equal(s.moveOut.guess.status, 'guess');
      money(s.moveOut.now, exp.moveOut[1], 'housing now');
    } else assert.equal(s.moveOut, null);
    if (exp.unassignedShare !== undefined) share(s.lenses.fiftyThirtyTwenty.unassignedShare, exp.unassignedShare, 'unassigned');
  });

  test(name + ': compares', () => {
    share(s.blindSpot.pct, exp.blindSpot, 'blind spot');
    assert.equal(s.culprits.length, exp.culprits.length, 'culprit count');
    exp.culprits.forEach(([cname, gap, ratio, yearly], i) => {
      const c = s.culprits[i];
      assert.equal(c.name, cname);
      money(c.gap, gap, cname + ' gap');
      share(c.ratio, ratio, cname + ' ratio');
      money(c.cutYearly, yearly, cname + ' yearly cut');
    });
    const g = s.gutCheck;
    money(g.gut, exp.gut.gut, 'gut');
    money(g.estimates, exp.gut.estimates, 'gut estimates');
    money(g.dreams, exp.gut.dreams, 'gut dreams');
    money(g.actual, exp.gut.actual, 'gut actual');
    money(g.actualVsGut, exp.gut.actualVsGut, 'actual vs gut');
    share(g.actualVsGutRatio, exp.gut.ratio, 'actual / gut');
    const p = s.proofOfCash;
    money(p.implied, exp.proofOfCash.implied, 'implied spending');
    money(p.entered, exp.proofOfCash.entered, 'entered spending');
    share(p.pct, exp.proofOfCash.pct, 'proof of cash %');
    assert.equal(p.flagged, exp.proofOfCash.flagged, 'proof of cash flag');
  });

  if (exp.draftt) test(name + ': DRAFTT lens', () => {
    for (const [key, [sh, verdict]] of Object.entries(exp.draftt)) {
      const row = s.lenses.draftt.rows.find((r) => r.key === key);
      share(row.share, sh, 'DRAFTT ' + key);
      assert.equal(row.verdict, verdict, 'DRAFTT verdict ' + key);
    }
  });

  if (exp.incomeStatement) test(name + ': income statement', () => {
    const m = s.lenses.incomeStatement.monthly;
    const e = exp.incomeStatement;
    money(m.revenue, e.revenue, 'revenue');
    money(m.taxes, e.taxes, 'taxes');
    money(m.deductions, e.deductions, 'deductions');
    const g = Object.fromEntries(m.expenses.map((x) => [x.key, x.amount]));
    for (const k of ['needs', 'debt', 'wants', 'savings']) money(g[k], e[k], 'statement ' + k);
    money(m.net, e.net, 'net');
    money(s.lenses.incomeStatement.annual.net, e.net * 12, 'annual net');
    money(m.net, t.surplus, 'net equals surplus');
  });

  test(name + ': completion and next steps', () => {
    share(s.completion.pct, exp.completion, 'completion');
    assert.deepEqual(s.next.map((n) => n.label), exp.next);
    if (exp.small) assert.deepEqual(s.smallStuff.map((n) => n.label), exp.small);
    if (exp.roughCount !== undefined) assert.equal(s.rough.length, exp.roughCount);
    if (exp.guesses) {
      assert.deepEqual(Object.fromEntries(s.guesses.map((g) => [g.categoryId, g.value.amount])), exp.guesses);
      assert.ok(s.guesses.every((g) => g.value.status === 'guess' && /Guess/.test(g.value.note)));
    }
  });

  if (exp.joyLowest) test(name + ': joy lens', () => {
    const low = s.lenses.joy.lowest;
    exp.joyLowest.forEach(([cname, per100], i) => {
      assert.equal(low[i].name, cname);
      share(low[i].joyPer100, per100, cname + ' joy per $100');
    });
  });

  if (exp.history) test(name + ': month history', () => {
    const h = s.history;
    exp.history.food.forEach(([key, e, a, v], i) => {
      const p = h.byCategory.food[i];
      assert.equal(p.key, key);
      money(p.estimate, e, key + ' estimate');
      money(p.actual, a, key + ' actual');
      share(p.variancePct, v, key + ' variance');
    });
    for (const [id, tr] of Object.entries(exp.history.trends)) assert.equal(h.trends[id], tr, 'trend ' + id);
    exp.history.totals.forEach(([key, e, a, v], i) => {
      assert.equal(h.totals[i].key, key);
      money(h.totals[i].estimate, e, 'total est');
      money(h.totals[i].actual, a, 'total actual');
      share(h.totals[i].variancePct, v, 'total variance');
    });
    const c = s.corrections.find((x) => x.id === 'food');
    share(c.factor, exp.history.correctionFood.factor, 'correction factor');
    money(c.suggested, exp.history.correctionFood.suggested, 'suggested estimate');
    money(lastActual(h, 'food').amount, exp.history.lastActualFood, 'last actual');
  });
}
