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
import { labelFor, namedPath, unnamedLabel } from '../engine/labels.js';
import { earnedIncome } from '../engine/tax.js';
import { maxIt, maxItSim, maxItCash } from '../engine/maxit.js';
import { setSectionSharing, editExpense } from '../engine/edits.js';
import { windfall } from '../engine/windfall.js';
import { calendar, rangeCashTerms } from '../engine/calendar.js';
import { weeks, paychecks } from '../engine/calendar-views.js';
import { debtView, balanceTransfer, solvePayoff, whichCard } from '../engine/debtview.js';
import { spendingView, cutSimulator, canISpend } from '../engine/spending.js';
import { burnTiers } from '../engine/cashsim.js';
import { estimatedVsActual, monthOutlook } from '../engine/compare.js';
import { fooLadder, realHourlyWage, draftt, fixedFloor, goalsView, allocator, solvers, outlook } from '../engine/plan.js';
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
  // The shape of a profile once its W-2 has ended (S-210): no earning line runs this month, and the next one,
  // a 1099 from January, has a blank amount (a 0 written next to kind missing). The Roth step reads earned
  // income for the year from the W-2 months that did run, and the blank is named by its own path.
  let e = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  e = { ...e, income: e.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-06-30' } : x.id === 'tutoring' ? { ...x, start: '2027-01-01', amount: { value: null, kind: 'missing', asOf: null, source: 'test' } } : x)) };
  list.push(['demo, W-2 ended and a blank 1099', e]);
  // The local profile's whole shape (S-210): the W-2 ended in June, a 1099 running this year with a blank amount (a 0 next
  // to kind missing), unemployment running, and a federal student loan, so the year's tax and earned income cannot be figured.
  let p = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  p = { ...p, income: [...p.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-06-30' } : x.id === 'tutoring' ? { ...x, amount: { value: null, kind: 'missing', asOf: null, source: 'test' } } : x)),
    { id: 'ui', type: 'unemployment', label: 'Unemployment benefits', personId: 'casey', amount: { value: 450, kind: 'known', asOf: null, source: 'test' }, cadence: 'weekly', start: '2026-07-06', end: '2026-12-28', withholding: { federal: { value: 0, kind: 'known', asOf: null, source: 'test' }, state: { value: 0, kind: 'known', asOf: null, source: 'test' } } }] };
  list.push(['demo, the local profile shape', p]);
  // A bill someone else covers with no amount, and a recurring bill with no amount (S-228): Show the math crashed on
  // them (a recompute read its first input when there was none).
  let c = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  c = editExpense(c, 'phone', { amount: null, cadence: 'monthly', coveredBy: 'Parents' }, '2026-10-23');
  c = { ...c, expenses: c.expenses.map((e) => (e.id === 'streaming' ? { ...e, amount: { value: null, kind: 'missing', asOf: null, source: 'test' } } : e)) };
  c = applyDefaults(c, R);
  // applyDefaults refills the phone with the house default, so a covered bill with no default stays blank here.
  const F = (value) => ({ value, kind: 'known', asOf: null, source: 'test' });
  c = { ...c, expenses: [...c.expenses, { id: 'cable', label: 'Cable', amount: { value: null, kind: 'missing', asOf: null, source: 'test' }, cadence: 'monthly', covered: F(true), coveredBy: F('Parents') }] };
  list.push(['demo, a covered bill with no amount', c]);
  if (exists('fixtures/eli.local.json')) list.push(['local profile', applyDefaults(loadHousehold(readJson('fixtures/eli.local.json')), R)]);
  // Each household also gets a windfall of $5,000 with tax taken out, so the Windfall steps are audited too (S-201).
  return list.map(([name, spine]) => {
    const s = summarize(spine, R);
    const c = calendar(spine, R, { from: '2026-11', months: 1 });
    const w = weeks(c.sim);
    // The weeks' span and the first paycheck are audited too (S-204).
    // The Debt tab (S-205): every card and loan, a balance transfer on the first card with a balance, the solver on it, which card for $100.
    const debt = debtView(spine, R, c.sim, s);
    const firstCard = c.sim.model.cards.find((x) => x.balance > 0);
    const ctx = { spine, rules: R, s, windfall: windfall(spine, R, s, { amount: 5000, taxed: true }), month: c.months[0], range: { terms: rangeCashTerms(c.sim, w[0].from, w[w.length - 1].to), kind: c.sim.kind }, paycheck: paychecks(spine, R, c.sim, s)[0] || null,
      spend: spendingView(spine, R, c.sim, s, { today: spine.meta.asOf }), tiers: burnTiers(spine, R, s.cashflow, { extra: 0 }), cut: cutSimulator(spine, R, s, { dropped: [spine.expenses[0].id], towardDebt: true }), ask: canISpend(spine, R, c.sim, { amount: 50 }),
      compare: estimatedVsActual(spine, R, { months: 1 }), monthOut: monthOutlook(spine, R, c.sim),
      plan: { foo: fooLadder(spine, R, s), wage: realHourlyWage(spine, R, s), draftt: draftt(spine, R, s), floor: fixedFloor(spine, R, s, null), goals: goalsView(spine, R, s), alloc: allocator(spine, R, c.sim, s) }, solvers: solvers(spine, R, s, { byAge: 60 }), outlook: outlook(spine, R, c.sim, { runs: 12 }),
      sim: c.sim, debt, bt: firstCard ? balanceTransfer(spine, R, { cardId: firstCard.id }) : null, solve: firstCard ? solvePayoff(spine, R, c.sim, { target: firstCard.id, byDate: '2027-06-01' }) : null, which: whichCard(spine, R, c.sim, { amount: 100 }) };
    // How much to max it (S-211): every account and open year, with the cash check one row at a time and all together.
    const msim = maxItSim(spine, R);
    ctx.maxit = maxIt(spine, R, { sim: msim });
    const cashMemo = new Map();
    ctx.maxitCash = (key) => { if (!cashMemo.has(key)) cashMemo.set(key, maxItCash(spine, R, ctx.maxit, { sim: msim, rows: key === 'all' ? null : ctx.maxit.rows.filter((r) => r.id === key) })); return cashMemo.get(key); };
    return { name, spine, s, windfall: ctx.windfall, month: ctx.month, ctx };
  });
};
const ALL = households();
const idsFor = (h) => [...METRICS.map((m) => m.id), ...h.s.debt.utilization.items.map((c) => 'cardUtil:' + c.id), ...h.spine.expenses.map((e) => 'expenseCost:' + e.id), ...h.windfall.steps.map((x) => 'windfall:' + x.id), 'calendar:monthCash', 'calendar:rangeCash', ...(h.ctx.paycheck ? ['calendar:paycheckLeft'] : []),
  'debt:interestWindow', 'debt:utilPersonal', 'debt:utilOverall',
  ...h.ctx.debt.cards.flatMap((c) => [c.trap ? 'debt:interestMonth:' + c.id : null, c.trap ? 'debt:minOnly:' + c.id : null, c.util && c.util.limit !== null ? 'debt:utilReport:' + c.id : null, c.fee ? 'debt:feeRoi:' + c.id : null, c.bonus ? 'debt:bonus:' + c.id : null].filter(Boolean)),
  ...h.ctx.debt.loans.filter((l) => l.federal !== false).map((l) => 'debt:idr:' + l.id),
  ...(h.ctx.bt && h.ctx.bt.value !== null ? ['debt:bt'] : []), ...(h.ctx.solve && !h.ctx.solve.impossible ? ['debt:solve'] : []), ...h.ctx.which.rows.map((r) => 'debt:whichCard:' + r.id),
  'spend:safeToday', ...(h.ctx.spend.safe.daysUntil ? ['spend:safePerDay'] : []), ...h.ctx.spend.tags.rows.flatMap((r) => ['spend:tagBudget:' + r.tag, 'spend:tagSpent:' + r.tag, ...(r.pace !== null ? ['spend:pace:' + r.tag] : [])]),
  ...h.ctx.tiers.tiers.map((x) => 'spend:tier:' + x.id), 'spend:cut', ...(h.ctx.cut.debt && h.ctx.cut.debt.interestSaved !== null ? ['spend:cutDebt'] : []), 'spend:ask', ...h.ctx.spend.autopsy.rows.slice(0, 5).map((r) => 'spend:autopsy:' + r.id),
  ...h.ctx.spend.prices.rows.map((r) => 'spend:priceChange:' + r.id), ...(h.ctx.spend.drift.count ? ['spend:drift'] : []), ...(h.ctx.spend.momentum.perMonth !== null ? ['spend:momentum'] : []), ...(h.ctx.spend.sweep.on ? ['spend:sweep'] : []),
  'compare:spend', 'compare:income', 'compare:savingsReal', 'compare:soFar', 'compare:expected', ...h.ctx.compare.lines.slice(0, 3).map((r) => 'compare:line:' + r.id), ...h.ctx.compare.tags.map((r) => 'compare:tag:' + r.tag),
  ...h.ctx.plan.foo.rungs.filter((r) => r.need !== null).map((r) => 'plan:foo:' + r.id), ...h.ctx.plan.alloc.paychecks.slice(0, 2).map((p) => 'plan:pay:' + p.date + ':' + p.streamId), ...h.ctx.solvers.rows.filter((r) => r.value !== null).map((r) => 'plan:solve:' + r.id),
  ...(h.ctx.plan.wage.wage !== null ? ['plan:wage'] : []), ...h.ctx.plan.draftt.rows.map((r) => 'plan:draftt:' + r.key), 'plan:floor', ...h.ctx.plan.goals.rows.filter((r) => r.toGo !== null).map((r) => 'plan:goal:' + r.id), 'plan:outlook',
  ...h.ctx.maxit.rows.filter((r) => r.applies).flatMap((r) => { const k = 'maxit:' + r.accountId + ':' + r.year + ':'; const cash = r.fillable && r.lump > 0 && (r.perMonth || (r.paychecks && r.paychecks.extra)) ? h.ctx.maxitCash(r.id) : null; return [k + 'room', ...(r.cap && r.cap.metric ? [r.cap.metric] : []), ...(r.lump !== null ? [k + 'lump'] : []), ...(r.perMonth !== null ? [k + 'month'] : []), ...(r.fillable && r.paychecks && r.paychecks.perPaycheck !== null ? [k + 'paycheck'] : []), ...(cash ? [k + 'low', ...(cash.measurable ? [k + 'payoff'] : [])] : [])]; }),
  ...(h.ctx.maxit.pools.length ? ['maxit:all:month', 'maxit:all:lump', ...(h.ctx.maxit.totals.lump > 0 ? ['maxit:all:low', ...(h.ctx.maxitCash('all').measurable ? ['maxit:all:payoff'] : [])] : [])] : [])];

test('a. every Dashboard number and every flag has a formula, inputs and rules', () => {
  const src = readFileSync(SLAM + 'ui/dashboard.js', 'utf8');
  const tiles = [...src.matchAll(/tile\(spine, \{\s*id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(tiles.length >= 4, 'found the tiles (four since the Krug pass)');
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
      const e = explainMetric(id, h.ctx);
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
    const e = explainMetric(id, h.ctx);
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
    const e = explainMetric(id, h.ctx);
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
  assert.equal(showNumber(null, 'usd', 'notForMe'), 'does not apply', 'not for me is not missing');
  for (const h of ALL) for (const id of idsFor(h)) {
    const e = explainMetric(id, h.ctx);
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

test('f. every path a number reads is a field the Ledger can name, never a bare collection (S-210)', () => {
  const bad = [];
  for (const h of ALL) {
    for (const id of idsFor(h)) {
      const raw = metricById(id).explain(h.ctx);
      for (const p of [...(raw.rough || []), ...(raw.missing || [])]) if (!namedPath(p)) bad.push(h.name + ': ' + id + ' names ' + JSON.stringify(p));
      for (const t of raw.terms) if (t.path && !namedPath(t.path)) bad.push(h.name + ': ' + id + ' links ' + JSON.stringify(t.path));
      const e = explainMetric(id, h.ctx);
      for (const w of [...e.roughBecause, ...e.missingBecause]) if (w.startsWith(unnamedLabel('').split(' (')[0])) bad.push(h.name + ': ' + id + ' says ' + w);
    }
    for (const st of h.windfall.steps) for (const p of [...st.from, ...(st.path ? [st.path] : [])]) if (!namedPath(p)) bad.push(h.name + ': windfall ' + st.id + ' reads ' + JSON.stringify(p));
    for (const r of h.ctx.plan.foo.rungs) for (const p of [...r.from, ...(r.path ? [r.path] : [])]) if (!namedPath(p)) bad.push(h.name + ': FOO ' + r.id + ' reads ' + JSON.stringify(p));
  }
  assert.deepEqual(bad, []);
});

test('g. labelFor never throws: an unknown path reads as a plain fallback', () => {
  const spine = ALL[0].spine;
  for (const p of ['income', 'income.salary', 'expenses', 'accounts.roth', 'nothing.here', '', null, undefined, 'income..amount', 'household.expenseDefaults', 'household.expenseDefaults.food', 'income.salary.withholding', 'household.situation']) {
    assert.doesNotThrow(() => labelFor(spine, p), String(p));
    assert.equal(labelFor(spine, p), unnamedLabel(p), String(p));
    assert.equal(namedPath(p), false, String(p));
  }
  assert.equal(labelFor(spine, 'income.salary.amount'), 'Salary at Hudson Valley Health: amount');
  assert.equal(labelFor(spine, 'rule:PSLF_PAYMENTS'), 'Rule PSLF_PAYMENTS');
});

test('h. the Roth step with the W-2 ended and a blank 1099: earned income is the W-2 months, the blank is named (S-210)', () => {
  const h = ALL.find((x) => x.name === 'demo, W-2 ended and a blank 1099');
  const ei = earnedIncome(h.spine, R, 2026);
  // Six months of $6,000 less six months of $500 pre-tax 401(k) saving.
  assert.equal(ei.value, 33000);
  assert.equal(ei.kind, 'computed');
  const roth = h.windfall.steps.find((x) => x.id === 'roth');
  assert.equal(roth.need, 3900, '$7,500 less about $3,000 put in so far and $600 still set to go in by December');
  assert.ok(!roth.missing.includes('income'));
  const e = explainMetric('windfall:roth', h.ctx);
  // The step links the Roth row's room, and the room links the year's earned income (the cap).
  const link = e.terms.find((t) => /^maxit:[^:]+:2026:lump$/.test(t.metric || ''));
  assert.ok(link, 'the step names the 2026 Roth new money');
  assert.ok(explainMetric(link.metric.replace(/lump$/, 'room'), h.ctx).terms.some((t) => /^earned:2026/.test(t.metric || '')));
  // 2027: the 1099 runs from January with no amount, so earned income is missing and names that line.
  const next = earnedIncome(h.spine, R, 2027);
  assert.equal(next.value, null);
  assert.deepEqual(next.missing, ['income.tutoring.amount']);
  const m = explainMetric('earned:2027', { spine: h.spine, rules: R, s: h.s });
  assert.equal(m.value, null);
  assert.ok(m.missingBecause.includes('Weekend tutoring: amount'));
  // A 1099 loss never lowers wages: $72,000 of salary less $6,000 pre-tax, with a $6,000 tutoring loss left out.
  const loss = { ...ALL[0].spine, income: ALL[0].spine.income.map((x) => (x.id === 'tutoring' ? { ...x, businessExpenses: { value: 1000, kind: 'known', asOf: null, source: 'test' } } : x)) };
  assert.equal(earnedIncome(loss, R, 2026).value, 66000);
  // No income in the Ledger at all: missing, named, never $0.
  const none = earnedIncome({ ...h.spine, income: [] }, R, 2026);
  assert.equal(none.value, null);
  assert.equal(none.label, '2026 earned income');
  const em = explainMetric('earned:2026', { spine: { ...h.spine, income: [] }, rules: R, s: h.s });
  assert.ok(em.missingBecause.some((x) => x.startsWith('2026 earned income')));
});

test('i. the local profile shape: earned income and the Roth room read missing and name the blank 1099, and the Debt tab names it too (S-210)', () => {
  const h = ALL.find((x) => x.name === 'demo, the local profile shape');
  const ei = earnedIncome(h.spine, R, 2026);
  assert.equal(ei.value, null);
  assert.deepEqual(ei.missing, ['income.tutoring.amount']);
  const roth = h.windfall.steps.find((x) => x.id === 'roth');
  assert.equal(roth.need, null);
  assert.match(roth.why, /^Missing: 2026 earned income/);
  const sl = h.ctx.debt.loans.find((l) => l.id === 'sl');
  assert.ok(sl && sl.missing.concat(sl.rough).includes('income.tutoring.amount'), 'the student loan names the blank line');
  assert.ok(!sl.missing.concat(sl.rough).includes('income'));
});

test('j. Show the math opens on every metric of a household with a covered bill that has no amount, without throwing (S-228)', () => {
  const h = ALL.find((x) => x.name === 'demo, a covered bill with no amount');
  const phone = h.s.cashflow.expenses.items.find((i) => i.id === 'phone');
  assert.ok(phone && phone.covered, 'the phone bill is covered by someone else');
  assert.ok(!h.ctx.spend.autopsy.rows.some((r) => r.id === 'phone'), 'a covered bill is not in the autopsy');
  // Every id the pages can ask for, and the per-item ids for every expense, debt and account, including ones a reading
  // leaves out (the covered phone bill, a bill with no amount, a card with no trap).
  const keys = (h.spine.expenses || []).map((e) => e.id).concat((h.spine.debts || []).map((d) => d.id), (h.spine.accounts || []).map((a) => a.id), ['nothing-here']);
  const perItem = keys.flatMap((k) => ['expenseCost:' + k, 'cardUtil:' + k, 'spend:autopsy:' + k, 'spend:priceChange:' + k, 'spend:tagBudget:' + k, 'spend:tagSpent:' + k, 'spend:pace:' + k, 'spend:tier:' + k,
    'debt:interestMonth:' + k, 'debt:minOnly:' + k, 'debt:utilReport:' + k, 'debt:feeRoi:' + k, 'debt:bonus:' + k, 'debt:idr:' + k, 'debt:whichCard:' + k, 'compare:line:' + k, 'compare:tag:' + k,
    'plan:goal:' + k, 'plan:draftt:' + k, 'plan:foo:' + k, 'plan:solve:' + k, 'maxit:' + k + ':2026:room', 'maxit:' + k + ':2026:lump', 'maxit:' + k + ':2026:month', 'maxit:' + k + ':2026:paycheck', 'maxit:' + k + ':2026:raise', 'maxit:' + k + ':2026:low', 'maxit:' + k + ':2026:payoff']);
  const loose = ['spend:safePerDay', 'spend:cutDebt', 'spend:drift', 'spend:momentum', 'spend:sweep', 'debt:bt', 'debt:solve', 'plan:wage', 'calendar:paycheckLeft', 'earned:2027',
    ...['taxOnIt', 'taxBill', 'cashFloor', 'promos', 'employerMatch', 'cards', 'cushion', 'roth', 'left'].map((x) => 'windfall:' + x)];
  const ids = [...new Set([...idsFor(h), ...perItem, ...loose])].filter((id) => metricById(id));
  assert.ok(ids.length > 300, 'opened ' + ids.length + ' metrics');
  // With the page's whole context, and with only the summary (a page that has not built the readings yet).
  for (const ctx of [h.ctx, { spine: h.spine, rules: R, s: h.s }]) for (const id of ids) {
    let e;
    assert.doesNotThrow(() => { e = explainMetric(id, ctx); }, id);
    assert.ok(!/undefined|NaN/.test(e.plugged), id + ' plugs in ' + e.plugged);
    if (e.value === null) { assert.equal(e.recomputed, null, id + ' is missing both ways'); assert.match(e.plugged, /missing$/, id + ' reads missing'); }
    if (!e.terms.length && e.value === null) assert.ok(!/\$0/.test(e.plugged), id + ' with nothing to work from never reads $0');
  }
  // The covered bill with no amount reads missing on the autopsy and its own cost a month is $0 to you, not a crash.
  const a = explainMetric('spend:autopsy:phone', h.ctx);
  assert.equal(a.value, null); assert.equal(a.recomputed, null); assert.equal(a.plugged, 'nothing to work from yet = missing');
  assert.equal(explainMetric('expenseCost:phone', h.ctx).value, 0, 'covered: $0 to you');
  assert.equal(explainMetric('expenseCost:streaming', h.ctx).value, null, 'no amount: missing, never $0');
});

