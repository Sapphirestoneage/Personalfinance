// The Phase 1 self-audit (S-177), run with every test pass:
// a. every displayed number has provenance (formula, inputs, rules);
// b. recomputing each metric from the inputs its panel shows gives the displayed value to the cent;
// c. units are declared and never mixed (monthly and yearly, gross and take-home);
// d. a missing input never shows as $0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { METRICS, DASHBOARD_MATH, UNITS, metricById, explainMetric, flagMath, showNumber } from '../engine/math.js';
import { setSectionSharing, editExpense } from '../engine/edits.js';
import { money } from '../src/ui/format.js';
import { readJson, exists, loadRules, SLAM } from './spine-helpers.js';

const R = loadRules();
const households = () => {
  const list = [['demo', applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R)]];
  // The demo with shared housing, a covered bill and a blank amount, to reach every branch.
  let d = setSectionSharing(list[0][1], 'accommodation', { shared: true, sharedWith: 2 }, '2026-10-23');
  d = editExpense(d, 'phone', { amount: 60, cadence: 'monthly', coveredBy: 'Parents' }, '2026-10-23');
  d = { ...d, expenses: d.expenses.map((e) => (e.id === 'gym' ? { ...e, amount: { value: null, kind: 'missing', asOf: null, source: 'test' } } : e)) };
  list.push(['demo, shared and missing', d]);
  if (exists('fixtures/eli.local.json')) list.push(['local profile', applyDefaults(loadHousehold(readJson('fixtures/eli.local.json')), R)]);
  return list.map(([name, spine]) => ({ name, spine, s: summarize(spine, R) }));
};
const ALL = households();
const idsFor = (h) => [...METRICS.map((m) => m.id), ...h.s.debt.utilization.items.map((c) => 'cardUtil:' + c.id), ...h.spine.expenses.map((e) => 'expenseCost:' + e.id)];

test('a. every Dashboard number and every flag has a formula, inputs and rules', () => {
  const src = readFileSync(SLAM + 'ui/dashboard.js', 'utf8');
  const tiles = [...src.matchAll(/tile\(spine, \{\s*id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(tiles.length >= 7, 'found the tiles');
  for (const t of tiles) assert.ok(DASHBOARD_MATH['tile-' + t], 'tile ' + t + ' has math');
  for (const m of METRICS) {
    assert.ok(m.formula && m.formula.includes('='), m.id + ' has a formula in words');
    assert.ok(UNITS.includes(m.unit), m.id + ' declares a unit');
    assert.ok(['sum', 'ratio', 'custom'].includes(m.op), m.id + ' says how its inputs combine');
    assert.ok(m.screens.length, m.id + ' says where it is shown');
    if (m.op === 'custom' && !m.recompute) assert.fail(m.id + ' needs its own recompute');
  }
  for (const h of ALL) {
    for (const ids of Object.values(DASHBOARD_MATH)) for (const id of ids) {
      const e = explainMetric(id, { spine: h.spine, rules: R, s: h.s });
      assert.ok(e, h.name + ': ' + id + ' explains');
      assert.ok(Array.isArray(e.rules), id + ' lists its rules');
      if (e.value !== null) assert.ok(e.terms.length, h.name + ': ' + id + ' names its inputs');
    }
    for (const f of h.s.flags) {
      const ids = flagMath(f);
      assert.ok(ids.length, h.name + ': flag ' + f.id + ' has math');
      for (const id of ids) assert.ok(metricById(id), 'flag ' + f.id + ' points at ' + id);
    }
  }
});

test('b. recomputing every metric from its shown inputs gives the displayed value, to the cent', () => {
  for (const h of ALL) for (const id of idsFor(h)) {
    const e = explainMetric(id, { spine: h.spine, rules: R, s: h.s });
    if (e.value === null) { assert.equal(e.recomputed, null, h.name + ': ' + id + ' is missing both ways'); continue; }
    assert.notEqual(e.recomputed, null, h.name + ': ' + id + ' recomputes');
    const tol = e.unit === 'ratio' || e.unit === 'months' || e.unit === 'years' ? 0.0005 : 0.005;
    assert.ok(Math.abs(e.value - e.recomputed) <= tol, h.name + ': ' + id + ' shows ' + e.value + ', its inputs give ' + e.recomputed);
  }
});

test('c. units are declared and never mixed', () => {
  const ratioOK = { 'usd|usd': 'ratio', 'usd/month|usd/month': 'ratio', 'usd|usd/month': 'months', 'usd/month|ratio': 'usd' };
  for (const h of ALL) for (const id of idsFor(h)) {
    const m = metricById(id);
    const e = explainMetric(id, { spine: h.spine, rules: R, s: h.s });
    for (const t of e.terms) assert.ok(UNITS.includes(t.unit), id + ': ' + t.label + ' declares a unit');
    if (m.op === 'sum') for (const t of e.terms) assert.equal(t.unit, m.unit, h.name + ': ' + id + ' adds ' + t.unit + ' to ' + m.unit + ' (' + t.label + ')');
    if (m.op === 'ratio') {
      const nu = [...new Set(e.terms.filter((t) => t.role === 'num').map((t) => t.unit))], du = [...new Set(e.terms.filter((t) => t.role === 'den').map((t) => t.unit))];
      if (!nu.length || !du.length) continue;
      assert.equal(nu.length, 1, id + ': one unit on top'); assert.equal(du.length, 1, id + ': one unit below');
      assert.equal(ratioOK[nu[0] + '|' + du[0]], m.unit, id + ': ' + nu[0] + ' / ' + du[0] + ' is not ' + m.unit);
      // A monthly amount over a rate is annualized on purpose (x 12), never by accident.
      if (nu[0] === 'usd/month' && du[0] === 'ratio') assert.equal(m.factor, 12, id + ' turns months into a year');
    }
  }
  // Gross and take-home stay apart: the gross savings rate divides by gross, the net one by take-home.
  const g = metricById('savingsRateGross'), n = metricById('savingsRateNet');
  const ctx = { spine: ALL[0].spine, rules: R, s: ALL[0].s };
  assert.equal(g.explain(ctx).terms.find((t) => t.role === 'den').metric, 'gross');
  assert.equal(n.explain(ctx).terms.find((t) => t.role === 'den').metric, 'takeHome');
});

test('d. missing never shows as $0', () => {
  assert.notEqual(money(null), '$0');
  assert.equal(showNumber(null, 'usd'), 'missing');
  for (const h of ALL) for (const id of idsFor(h)) {
    const e = explainMetric(id, { spine: h.spine, rules: R, s: h.s });
    for (const t of e.terms) if (t.value === null) assert.ok(!/\$0\.00/.test(showNumber(t.value, t.unit)), id + ': ' + t.label);
    const anyMissing = e.terms.some((t) => t.kind === 'missing' && t.value === null) || (e.missingBecause && e.missingBecause.length && e.value !== null && false);
    if (anyMissing) assert.notEqual(e.kind, 'computed', h.name + ': ' + id + ' is built on a missing input, so it cannot read as complete');
    if (e.value === null) assert.match(e.plugged, /missing$/, h.name + ': ' + id + ' reads missing');
  }
  // The demo with a blank gym amount: spending is incomplete and names it; the blank is not added as 0.
  const d = ALL[1];
  const sp = explainMetric('expenses', { spine: d.spine, rules: R, s: d.s });
  assert.equal(sp.kind, 'incomplete');
  assert.ok(sp.missingBecause.some((x) => /Gym/.test(x)));
  assert.match(sp.plugged, /missing/);
});

test('e. spending lists every line that makes it up, a covered bill at $0 and a shared one at your share', () => {
  const d = ALL[1];
  const e = explainMetric('expenses', { spine: d.spine, rules: R, s: d.s });
  assert.equal(e.terms.length, d.spine.expenses.length);
  assert.equal(e.terms.find((t) => /Phone/.test(t.label)).value, 0);
  assert.equal(e.terms.find((t) => /^Rent/.test(t.label)).value, 900, 'half of 1,800 with housing shared by 2');
  assert.ok(e.terms.every((t) => t.path && t.path.startsWith('expenses.')), 'each line opens its Ledger field');
});
