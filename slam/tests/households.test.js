// Loads four of the demo households and checks the full summary against the hand-computed expected
// file next to it (src/data/households/<name>.expected.js): income, estimate vs actual, totals and
// shares, compares, the DRAFTT, happiness, plan, review, stress, income statement, completion, joy
// and history. Runs for Maya, Luis, Tasha and Sam (Jordan's file is checked in transactions.test.js).
// Uses the summary, history, lenses, plan and happiness engines and the helpers, which load the
// reference data in src/data and the households.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../src/engines/summary.js';
import { lastActual } from '../src/engines/history.js';
import { drafttReading } from '../src/engines/lenses.js';
import { reviewSummary } from '../src/engines/plan.js';
import { stressReading } from '../src/engines/happiness.js';
import { loadRefs, loadHousehold, near } from './helpers.js';

const refs = loadRefs();
const money = (a, e, label) => assert.ok(near(a, e, 2), label + ': got ' + a + ', expected ' + e);
const share = (a, e, label) => assert.ok(near(a, e, 6), label + ': got ' + a + ', expected ' + e);

for (const name of ['maya', 'luis', 'tasha', 'sam']) {
  const { default: exp } = await import('../src/data/households/' + name + '.expected.js');
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

  // The budget is estimate vs actual (and the plan); the dream life is in Eras (S-097).
  test(name + ': category estimate / actual', () => {
    for (const [id, [e, a]] of Object.entries(exp.categories)) {
      const row = s.rows.find((r) => r.id === id);
      assert.ok(row, 'missing category ' + id);
      money(row.estimate, e, id + ' estimate');
      money(row.actual, a, id + ' actual');
      assert.ok(!('dream' in row) && !('dreamLong' in row), id + ': no dream column in the budget');
    }
  });

  test(name + ': totals and shares', () => {
    money(t.estimateTotal, exp.estimateTotal, 'estimate total');
    assert.ok(!Object.keys(t).some((k) => /dream/i.test(k)), 'no dream totals in the budget');
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
    assert.ok(!('dreams' in g), 'the gut check is gut vs estimates vs actual');
    money(g.actual, exp.gut.actual, 'gut actual');
    money(g.actualVsGut, exp.gut.actualVsGut, 'actual vs gut');
    share(g.actualVsGutRatio, exp.gut.ratio, 'actual / gut');
    const p = s.proofOfCash;
    money(p.implied, exp.proofOfCash.implied, 'implied spending');
    money(p.entered, exp.proofOfCash.entered, 'entered spending');
    share(p.pct, exp.proofOfCash.pct, 'proof of cash %');
    assert.equal(p.flagged, exp.proofOfCash.flagged, 'proof of cash flag');
  });

  if (exp.draftt) test(name + ': DRAFTT lens (proportions, no bands)', () => {
    const d = s.lenses.draftt;
    const e = exp.draftt;
    money(d.base.amount, e.base, 'DRAFTT base');
    assert.equal(d.base.label, e.baseLabel);
    money(d.total, e.total, 'DRAFTT total');
    share(d.totalShare, e.totalShare, 'DRAFTT share of base');
    money(d.everythingElse, e.everythingElse, 'everything else');
    share(d.everythingElseShare, e.everythingElseShare, 'everything else share');
    money(d.leftOver, e.leftOver, 'left over');
    share(d.leftOverShare, e.leftOverShare, 'left over share');
    share(d.taxes ? d.taxes.shareOfGross : null, e.taxes, 'taxes of gross');
    assert.deepEqual(d.rows.map((r) => r.key), Object.keys(e.letters), 'letters shown');
    for (const [key, [amount, sh, ofD, est, change, usesEst]] of Object.entries(e.letters)) {
      const r = d.rows.find((x) => x.key === key);
      money(r.amount, amount, key + ' amount');
      share(r.share, sh, key + ' % of base');
      share(r.shareOfDraftt, ofD, key + ' % of DRAFTT');
      share(r.estimateShare, est, key + ' estimate %');
      share(r.change, change, key + ' change');
      assert.equal(r.usesEstimate, usesEst, key + ' uses estimate');
      assert.equal('verdict' in r || 'band' in r, false, 'no verdicts or bands');
    }
    assert.equal(drafttReading(d), e.reading);
  });

  test(name + ': DRAFTT + everything else + left over = 100% of the base', () => {
    const d = s.lenses.draftt;
    if (d.base.amount === null) return;
    money(d.total + d.everythingElse + d.leftOver, d.base.amount, 'parts add to the base');
    share(d.totalShare + d.everythingElseShare + d.leftOverShare, 1, 'shares add to 100%');
    if (d.total) share(d.rows.reduce((a, r) => a + (r.shareOfDraftt || 0), 0), 1, 'letters add to 100% of DRAFTT');
  });

  if (exp.shares) test(name + ': % of income and % of spending (S-076)', () => {
    for (const [id, [inc, sp]] of Object.entries(exp.shares.categories)) {
      const r = s.rows.find((x) => x.id === id);
      share(r.pct.income.basis, inc, id + ' % of income');
      share(r.pct.spending.basis, sp, id + ' % of spending');
    }
    share(s.rows.find((x) => x.id === 'food').pct.spending.estimate, exp.shares.foodEstimateOfSpending, 'food estimate % of spending');
    for (const [id, [inc, sp]] of Object.entries(exp.shares.lines)) {
      const l = s.rows.flatMap((r) => r.lines).find((x) => x.id === id);
      share(l.pct.income.basis, inc, id + ' % of income');
      share(l.pct.spending.basis, sp, id + ' % of spending');
    }
  });

  if (exp.happiness) test(name + ': happiness three ways', () => {
    assert.equal(s.happinessPoints, exp.happiness.points);
    for (const [id, [rating, sh, per]] of Object.entries(exp.happiness.lines)) {
      const l = s.rows.flatMap((r) => r.lines).find((x) => x.id === id);
      assert.equal(l.happiness.rating, rating, id + ' rating');
      share(l.happiness.share, sh, id + ' % of happiness');
      share(l.happiness.per100, per, id + ' joy per $100');
    }
    share(s.rows.find((x) => x.id === 'food').happiness.share, exp.happiness.foodShare, 'food % of happiness');
    const unrated = s.rows.flatMap((r) => r.lines).filter((l) => l.joy === null);
    assert.ok(unrated.every((l) => l.happiness === null), 'no rating is not rated, never 0');
  });

  if (exp.plan) test(name + ': plan for the month on screen, and actual vs plan', () => {
    money(s.plan.spending, exp.plan.spending, 'plan spending');
    money(s.plan.outflow, exp.plan.outflow, 'plan outflow');
    for (const [id, [planAmt, gap, gapPct]] of Object.entries(exp.plan.categories)) {
      const r = s.rows.find((x) => x.id === id);
      money(r.plan, planAmt, id + ' plan');
      money(r.gaps.actualMinusPlan, gap, id + ' actual vs plan');
      share(r.gaps.actualMinusPlanPct, gapPct, id + ' actual vs plan %');
    }
    share(s.rows.find((x) => x.id === 'food').pct.income.plan, exp.plan.foodPctIncome, 'food plan % of income');
    share(s.rows.find((x) => x.id === 'food').pct.spending.plan, exp.plan.foodPctSpending, 'food plan % of spending');
    share(s.rows.find((x) => x.id === 'housing').pct.spending.plan, exp.plan.housingPctSpending, 'housing plan % of spending');
  });

  if (exp.review) test(name + ': review and plan', () => {
    const e = exp.review;
    const rv = reviewSummary(doc, s, e.reviewMonth, e.planMonth);
    const t = rv.totals;
    money(t.plan, e.plan, 'plan total');
    money(t.planSpending, e.planSpending, 'plan spending');
    money(t.planLeft, e.planLeft, 'plan vs take-home');
    money(t.actual, e.actual, 'this month actual');
    money(t.frees, e.frees, 'frees up');
    share(t.planPctIncome, e.planPctIncome, 'plan % of income');
    share(t.happyNow, e.happyNow, 'happiness spend now');
    share(t.happyPlan, e.happyPlan, 'happiness spend plan');
    share(t.happyChange, e.happyChange, 'happiness spend change');
    assert.deepEqual([rv.checklist.reviewed, rv.checklist.total], e.checklist);
    const rows = rv.groups.flatMap((g) => g.rows);
    for (const [key, x] of Object.entries(e.rows)) {
      const r = rows.find((y) => y.key === key);
      assert.ok(r, 'row ' + key);
      money(r.plan, x.plan, key + ' plan');
      assert.equal(r.decision, x.decision, key + ' decision');
      if (x.planPctIncome !== undefined) share(r.pctIncome.plan, x.planPctIncome, key + ' plan % of income');
      if (x.planPctSpending !== undefined) share(r.pctSpending.plan, x.planPctSpending, key + ' plan % of spending');
      if (x.estimate !== undefined) assert.equal(r.estimate, x.estimate, key + ' estimate stays blank');
      if (x.addedInReview !== undefined) assert.equal(r.addedInReview, x.addedInReview);
      if (x.stop !== undefined) assert.equal(r.stop, x.stop);
    }
    assert.equal(rv.reading, e.reading);
  });

  if (exp.stress) test(name + ': satisfaction and stress', () => {
    const st = s.stress;
    assert.equal(st.points, exp.stress.points);
    for (const [id, [stress, sh, per, net, lean]] of Object.entries(exp.stress.lines)) {
      const x = st.byId[id];
      assert.equal(x.stress, stress, id + ' stress');
      if (sh !== null) share(x.share, sh, id + ' % of stress');
      if (per !== null) share(x.per100, per, id + ' stress per $100');
      assert.equal(x.net, net, id + ' net');
      assert.equal(x.lean, lean, id + ' lean');
    }
    assert.deepEqual(st.lookFirst.map((x) => x.id), exp.stress.lookFirst.map(([id]) => id));
    exp.stress.lookFirst.forEach(([, drain], i) => share(st.lookFirst[i].drain, drain, 'drain ' + i));
    assert.deepEqual(st.moreOf.map((x) => x.id), exp.stress.moreOf);
    assert.equal(stressReading(st), exp.stress.reading);
    share(Object.values(st.byId).reduce((a, x) => a + x.share, 0), 1, '% of stress adds to 100%');
  });

  test(name + ': % of spending adds to 100% per column, % of happiness adds to 100%', () => {
    for (const col of ['estimate', 'actual', 'basis', 'plan']) {
      const cats = s.rows.filter((r) => !r.savings && r.pct.spending[col] !== null);
      if (cats.length) share(cats.reduce((a, r) => a + r.pct.spending[col], 0), 1, col + ' % of spending adds to 100%');
    }
    const rated = s.rows.flatMap((r) => r.lines).filter((l) => l.happiness);
    if (rated.length) share(rated.reduce((a, l) => a + l.happiness.share, 0), 1, '% of happiness adds to 100%');
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
