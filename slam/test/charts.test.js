// The numbers behind every chart (overnight Track C): each chart ends where its screen's number is.
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { moneyFlow, flowTable } from '../engine/flow.js';
import { budgetView } from '../engine/budget.js';
import { payoffPlan } from '../engine/debt.js';
import { solvers, goalsView } from '../engine/plan.js';
import * as C from '../engine/charts.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const sum = (list) => Math.round(list.reduce((a, x) => a + x, 0) * 100) / 100;

test('the net worth waterfall adds up to net worth', () => {
  const s = demo(), x = summarize(s, R), steps = C.netWorthSteps(x.sheet, s);
  const last = steps[steps.length - 1];
  assert.equal(last.total, true);
  assert.equal(last.v, x.sheet.netWorth.value);
  assert.ok(Math.abs(sum(steps.slice(0, -1).map((st) => st.v)) - last.v) < 1);
  assert.ok(steps.some((st) => st.label === 'Cards' && st.v === -x.sheet.cards.value));
  assert.ok(steps.some((st) => st.label === 'Owed to you' && st.v === x.sheet.owed));
});

test('net worth over time: points kept one a day, the projection ahead, calm until two points', () => {
  let pts = C.addNetWorthPoint([], '2026-10-01', 60000);
  pts = C.addNetWorthPoint(pts, '2026-10-01', 61000);
  assert.deepEqual(pts, [{ date: '2026-10-01', value: 61000 }]);
  assert.equal(C.netWorthPath(pts, [], { asOf: '2026-10-22' }).enough, false);
  pts = C.addNetWorthPoint(pts, '2026-10-22', 62976);
  const p = C.netWorthPath(pts, [{ ym: '2026-11', netWorth: 64000 }, { ym: '2028-01', netWorth: 80000 }], { asOf: '2026-10-22', range: '1y' });
  assert.equal(p.enough, true);
  assert.equal(p.past.length, 2);
  assert.equal(p.ahead.length, 1, 'past the range is cut');
  assert.equal(C.addNetWorthPoint(pts, '2026-10-23', null), pts, 'a missing net worth adds no point');
});

test('the paycheck waterfall ends at the stream\'s take-home to its account', () => {
  const s = demo(), x = summarize(s, R), flow = moneyFlow(s, R, x.cashflow);
  const steps = C.paycheckSteps(flow, 'salary');
  const st = x.cashflow.income.streams.find((y) => y.id === 'salary');
  assert.equal(steps[0].v, st.gross);
  assert.ok(Math.abs(sum(steps.slice(0, -1).map((y) => y.v)) - steps[steps.length - 1].v) < 0.02);
  assert.ok(steps.some((y) => y.label === 'Taxes taken out' && Math.abs(y.v + st.withheld + st.fica) < 0.01));
  const m = C.monthSteps(flowTable(flow));
  assert.ok(Math.abs(m[m.length - 1].v - x.cashflow.surplus.value) < 1, 'the month ends at what is left');
});

test('budget charts read the Budget view', () => {
  const s = demo(), b = budgetView(s, R, { ym: '2026-09' });
  const rows = C.budgetRows(b).rows;
  assert.deepEqual(rows.map((r) => r.plan), b.cats.map((c) => c.plan));
  assert.equal(rows.find((r) => r.key === 'food').over, true);
  const shares = C.planShares(b);
  assert.equal(Math.round(sum(shares.map((x) => x.v))), Math.round(sum(b.cats.map((c) => c.lines.reduce((a, l) => a + (l.plan || 0), 0)))));
  const days = C.spendByDay(s, '2026-09');
  assert.ok(days.length > 5 && days.every((d) => d.date.startsWith('2026-09')));
  assert.equal(Math.round(sum(days.map((d) => d.v))), Math.round(sum(s.log.filter((e) => e.kind === 'spend' && e.date.startsWith('2026-09')).map((e) => e.amount))));
  const m = C.monthlySpent(s, R, C.monthsBack('2026-09', 3));
  assert.deepEqual(m.map((x) => x.ym), ['2026-07', '2026-08', '2026-09']);
  assert.equal(sum(m[2].cats.map((c) => c.v)), sum(b.cats.map((c) => c.actual)));
});

test('the debt path walks the payoff plan to zero; the three methods each end debt free', () => {
  const s = demo(), plain = payoffPlan(s, R, { strategy: 'avalanche', extra: 200, asOf: s.meta.asOf });
  const traced = payoffPlan(s, R, { strategy: 'avalanche', extra: 200, asOf: s.meta.asOf, trace: true });
  assert.equal(traced.debtFreeYm, plain.debtFreeYm, 'trace changes nothing');
  assert.equal(traced.totalInterest.value, plain.totalInterest.value);
  const p = C.debtPath(s, R, { extra: 200 });
  assert.equal(p.months[p.months.length - 1], plain.debtFreeYm);
  assert.ok(p.debts.every((d) => d.points[d.points.length - 1] === 0));
  assert.ok(Math.abs(sum(p.byYear.map((y) => y.interest)) - plain.totalInterest.value) < 1);
  const m = C.methodPaths(s, R, { extra: 200 });
  assert.deepEqual(m.map((x) => x.id), ['avalanche', 'snowball', 'stress']);
  assert.ok(m.every((x) => x.totals[x.totals.length - 1] === 0 && x.first));
  assert.equal(m[0].debtFreeYm, plain.debtFreeYm);
});

test('FI path crosses the FI number near the FI year; the savings curve passes through you are here', () => {
  const s = demo(), x = summarize(s, R), f = C.fiPath(s, R, x);
  assert.equal(f.lines.standard, x.fi.fiNumber.value);
  assert.ok(f.crossYear && Math.abs(f.crossYear - (+x.asOf.slice(0, 4) + x.fi.yearsToFi.value)) <= 1.5, 'crosses about when the FI year says');
  assert.ok(f.coast.length && f.coast[0][1] === x.fi.coastFi.value || Math.abs(f.coast[0][1] - x.fi.coastFi.value) < 1);
  const sv = solvers(s, R, x), c = C.savingsCurve(sv);
  assert.ok(c.points.length > 10);
  assert.ok(c.points.every((p, i) => !i || p[1] <= c.points[i - 1][1]), 'more saved, sooner');
  assert.equal(c.here.years, Math.round(sv.yearsNow * 10) / 10);
  assert.ok(c.target && c.target.rate > 0);
});

test('the bracket bar marks taxable income in its marginal band', () => {
  const s = demo(), x = summarize(s, R), b = C.bracketBar(x.tax, R);
  assert.equal(b.taxable, x.tax.lines.taxable.value);
  const inBand = b.bands.find((y) => b.taxable > y.from && b.taxable <= y.to);
  assert.equal(inBand.rate, b.marginal);
  assert.ok(Math.abs(sum(b.bands.map((y) => y.filled)) - b.taxable) < 0.01);
});

test('scenario lines and goal bars', () => {
  const s = demo(), lines = C.scenarioLines(s, R, { years: 10 });
  assert.equal(lines.length, 3);
  const last = (l) => l.points[l.points.length - 1][1];
  assert.ok(last(lines[0]) < last(lines[1]) && last(lines[1]) < last(lines[2]), 'conservative under standard under optimistic');
  const x = summarize(s, R), g = C.goalBars(goalsView(s, R, x));
  assert.ok(g.length >= 1 && g.every((y) => y.share >= 0 && y.share <= 1));
});

test('the recommended order: highest rate first unless a quick win costs about nothing', () => {
  const m = (id, interest, firstYm, never = false) => ({ id, interest, first: { name: id === 'snowball' ? 'Store card' : 'Visa', ym: firstYm }, neverPaysOff: never });
  assert.equal(C.recommendOrder([m('avalanche', 1000, '2027-06'), m('snowball', 1050, '2027-02')], R, 2026).id, 'snowball');
  assert.match(C.recommendOrder([m('avalanche', 1000, '2027-06'), m('snowball', 1050, '2027-02')], R, 2026).words, /4 months sooner for only \$50 more/);
  assert.equal(C.recommendOrder([m('avalanche', 1000, '2027-06'), m('snowball', 1400, '2027-02')], R, 2026).id, 'avalanche');
  assert.match(C.recommendOrder([m('avalanche', 1000, '2027-06'), m('snowball', 1400, '2027-02')], R, 2026).words, /saves \$400/);
  assert.equal(C.recommendOrder([m('avalanche', 1000, '2027-06'), m('snowball', 1000, '2027-06')], R, 2026).id, 'avalanche');
  assert.equal(C.recommendOrder([m('avalanche', 1000, '2027-06'), m('snowball', 900, '2027-02', true)], R, 2026).id, 'avalanche');
  const s = demo();
  for (const d of s.debts) delete d.stress;
  assert.deepEqual(C.methodPaths(s, R, { extra: 200 }).map((x) => x.id), ['avalanche', 'snowball'], 'no stress scores: two orders');
});

test('the recommended order\'s quick-win amount is the house default on the Assumptions page (morning answer 3)', () => {
  const m = (id, interest, firstYm) => ({ id, interest, first: { name: id === 'snowball' ? 'Store card' : 'Visa', ym: firstYm }, neverPaysOff: false });
  const pair = [m('avalanche', 1000, '2027-06'), m('snowball', 1150, '2027-02')];
  assert.equal(C.recommendOrder(pair, R, 2026).id, 'avalanche', '$150 more is over the $100 default');
  const looser = { get: (id, y) => (id === 'APP_MATERIALITY' ? 200 : R.get(id, y)) };
  assert.equal(C.recommendOrder(pair, looser, 2026).id, 'snowball', 'a $200 default makes it a quick win');
  assert.equal(C.recommendOrder(pair, R, 2026).rule, 'APP_MATERIALITY');
  assert.doesNotMatch(readFileSync(new URL('../engine/charts.js', import.meta.url), 'utf8'), /materiality = 100/);
});
