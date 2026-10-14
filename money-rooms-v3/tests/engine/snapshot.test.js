/* Snapshot and Sharpen, Hours Everywhere (Level 15, MR-108 to MR-115): the resolver, the wage, the formatter, and six synthetic households. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTotal, rowStateOf, storedFor, snapshotComplete, overallCoverage } from '../../engine/resolve.js';
import { toHours, hourlyGrossAnnual, hourlyConversion, realHourlyWage, weeksFromTimeOff, salaryAsHourly, belowMateriality, WAGE_METHODS } from '../../engine/hours.js';
import * as F from '../../engine/format.js';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { setBase, BASE_NUMBERS, snapshotOf, diveRows } from '../../engine/snapshot.js';
import { whatsLeft } from '../../engine/whatsleft.js';
import { loadData } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-12'; const W = data.weights;
const run = rec => compute(rec, data, { today: TODAY });
const row = (st, src, cents, range) => ({ id: 'r' + Math.random().toString(36).slice(2, 6), label: 'x', cents, range: range || null, state: st, source: src || 'client' });
const base = id => BASE_NUMBERS.find(b => b.id === id);

test('resolver: partial itemization leaves a remainder; N/A counts as covered; coverage is itemized over the total', () => {
  const r = resolveTotal({ snapshot: { cents: 400000, state: 'rough', source: 'client' }, rows: [row('known', 'client', 150000), row('rough', 'client', 50000), row('not-for-me', 'client', null), row('unknown', 'client', null)] }, { weights: W });
  assert.equal(r.status, 'ok'); assert.equal(r.itemized, 200000); assert.equal(r.remainder, 200000); assert.equal(r.total, 400000); assert.equal(r.overGut, null);
  assert.equal(r.coverage, 0.5); assert.deepEqual(r.counts, { known: 1, estimated: 1, na: 1, notYet: 1, blank: 0 }); assert.ok(r.rough);
  assert.ok(r.range.low < 400000 && r.range.high > 400000, 'a band around the rough remainder: ' + JSON.stringify(r.range));
});
test('resolver: rows past the snapshot win, the gap is flagged in dollars and percent, and the snapshot is kept, never overwritten', () => {
  const snap = { cents: 300000, state: 'rough', source: 'client' };
  const r = resolveTotal({ snapshot: snap, rows: [row('known', 'client', 250000), row('known', 'client', 110000)] }, { weights: W });
  assert.equal(r.total, 360000); assert.equal(r.remainder, 0); assert.deepEqual(r.overGut, { gap: 60000, pct: 0.2 }); assert.equal(r.coverage, 1); assert.equal(r.snapshot.cents, 300000); assert.equal(snap.cents, 300000);
  assert.ok(!r.rough, 'two known rows and no remainder is not rough');
});
test('resolver: a range snapshot resolves at the midpoint and carries the range into the band', () => {
  const r = resolveTotal({ snapshot: { cents: 350000, range: { low: 300000, high: 400000 }, state: 'rough', source: 'client' }, rows: [row('known', 'client', 100000)] }, { weights: W });
  assert.equal(r.total, 350000); assert.equal(r.remainder, 250000); assert.equal(r.range.low, 95000 + 200000, 'the known row at its 5% spread plus the typed low'); assert.equal(r.range.high, 105000 + 300000);
});
test('resolver: all N/A is complete at zero; a zero snapshot with rows is over the gut; no snapshot and no rows is needs', () => {
  const na = resolveTotal({ snapshot: null, rows: [row('not-for-me', 'client', null), row('none', 'client', 0)] }, { weights: W });
  assert.equal(na.status, 'ok'); assert.equal(na.total, 0); assert.equal(na.coverage, 1); assert.equal(na.counts.na, 2);
  const zero = resolveTotal({ snapshot: { cents: 0, state: 'known', source: 'client' }, rows: [row('known', 'client', 20000)] }, { weights: W });
  assert.equal(zero.total, 20000); assert.equal(zero.overGut.gap, 20000); assert.equal(zero.overGut.pct, null, 'no percent of zero');
  assert.equal(resolveTotal({ snapshot: null, rows: [] }).status, 'needs');
  assert.equal(resolveTotal({ snapshot: { cents: 500000, state: 'rough', source: 'client' }, rows: [] }).coverage, 0, 'a snapshot alone covers nothing yet');
});
test('the four row states map onto the stored states both ways; a base number is complete with a value, a range, a guess or a not-for-me, never blank', () => {
  assert.equal(rowStateOf({ state: 'known', source: 'client' }), 'known'); assert.equal(rowStateOf({ state: 'known', source: 'estimated' }), 'estimated'); assert.equal(rowStateOf({ state: 'rough', source: 'client' }), 'estimated');
  assert.equal(rowStateOf({ state: 'not-for-me' }), 'na'); assert.equal(rowStateOf({ state: 'none' }), 'na'); assert.equal(rowStateOf({ state: 'will-send' }), 'notYet'); assert.equal(rowStateOf({ state: 'unknown' }), 'notYet'); assert.equal(rowStateOf(null), 'blank');
  assert.deepEqual(storedFor('notYet', 'email'), { state: 'will-send' }); assert.deepEqual(storedFor('notYet'), { state: 'unknown' }); assert.deepEqual(storedFor('na'), { state: 'not-for-me' });
  assert.ok(snapshotComplete({ v: { low: 1, high: 2 }, state: 'rough', source: 'client' })); assert.ok(snapshotComplete({ v: null, state: 'not-for-me', source: 'client' })); assert.ok(!snapshotComplete({ v: null, state: 'unknown', source: 'client' })); assert.ok(!snapshotComplete(null));
});

test('toHours: minutes under an hour, hours under a week, work-weeks, work-years; never NaN or Infinity', () => {
  const w = 2500; /* $25 an hour */
  assert.equal(toHours(1000, w).text, '24 min'); assert.equal(toHours(5000, w).text, '2 h'); assert.equal(toHours(250000, w, 40).text, '2.5 work-weeks'); assert.equal(toHours(100000, w, 40).text, '1 work-week');
  assert.equal(toHours(5000000, w, 40).text, '1 work-year'); assert.equal(toHours(-5000, w).text, '-2 h');
  assert.equal(toHours(5000, 0), null); assert.equal(toHours(5000, null), null); assert.equal(toHours(NaN, w), null); assert.equal(toHours(Infinity, w), null); assert.equal(toHours(5000, Infinity), null);
});
test('the one money formatter follows the lens: dollars, hours, both; inputs stay in dollars; rates never change', () => {
  F.setHoursLens({ mode: 'hours', wage: 2500, weeklyHours: 40 });
  assert.equal(F.dollarsWhole(5000), '2 h'); assert.equal(F.dollars(5000, { plain: true }), '$50.00'); assert.equal(F.percent(0.25), '25.0%'); assert.equal(F.dollarsCompact(250000), '2.5 work-weeks');
  F.setHoursLens({ mode: 'both', wage: 2500, weeklyHours: 40 }); assert.equal(F.dollarsWhole(5000), '$50 (2 h)');
  F.setHoursLens({ mode: 'hours', wage: null }); assert.equal(F.dollarsWhole(5000), '$50', 'no wage, no hours');
  F.setHoursLens({ mode: 'dollars' }); assert.equal(F.dollarsWhole(5000), '$50');
});

/* ---- the households ---- */
function sun(rec, facts) { Object.keys(facts).forEach(k => setField(rec, 'sun', k, facts[k], 'known', 'client')); }
function add(rec, planet, type, f, nick) { const r = createRow(planet, type, { nickname: nick || type, f: freshFacts(data.fields, planet, type) }); addRow(rec, r, { session: null }); Object.keys(f || {}).forEach(k => { const v = f[k]; const [val, st, cad] = Array.isArray(v) ? v : [v, 'known', undefined]; setField(rec, r.id, k, val, st, 'client', cad ? { cad } : {}); }); return r; }
function snapshotOnly() {
  const rec = createRecord(); sun(rec, { birthDate: '1996-07-01', state: 'OR', filingStatus: 'single', workSituation: 'employed' });
  setBase(rec, data.fields, base('incomeRegular'), 420000, 'rough', 'client', {}); setBase(rec, data.fields, base('incomeIrregular'), null, 'not-for-me', 'client', {});
  setBase(rec, data.fields, base('expensesFixed'), { low: 180000, high: 200000 }, 'rough', 'client', {}); setBase(rec, data.fields, base('expensesVariable'), 120000, 'rough', 'client', {}); setBase(rec, data.fields, base('expensesAnnual'), 360000, 'rough', 'client', {});
  setBase(rec, data.fields, base('assetsCash'), 800000, 'rough', 'client', {}); setBase(rec, data.fields, base('assetsRetirement'), 3000000, 'rough', 'client', {}); setBase(rec, data.fields, base('assetsOther'), null, 'not-for-me', 'client', {});
  setBase(rec, data.fields, base('debt'), 0, 'none', 'client', {});
  return rec;
}
test('snapshot-only household: every base number complete, the projection runs on snapshot data alone, and the figures are rough with a band', () => {
  const rec = snapshotOnly(); const R = run(rec); const S = R.sun.outputs; const snap = R.snapshot;
  assert.equal(snap.complete, snap.total, 'nine of nine'); assert.ok(snap.done); assert.equal(snap.coverage, 0, 'nothing itemized yet');
  assert.equal(S.income.takeHomeMonthly.cents, 420000); assert.ok(S.income.takeHomeMonthly.rough);
  assert.equal(S.spending.baselineMonthly.cents, 190000 + 120000 + 30000, 'fixed at the midpoint, variable, annual over twelve'); assert.ok(S.spending.baselineMonthly.rough); assert.ok(S.spending.baselineMonthly.range.low < 340000 && S.spending.baselineMonthly.range.high > 340000);
  assert.equal(S.spending.remainderMonthly.cents, 340000);
  assert.equal(S.invest.totalAssets.cents, 3800000); assert.equal(S.invest.cashBalances.cents, 800000); assert.equal(S.invest.investedAssets.cents, 3000000); assert.equal(S.debt.totalDebt.cents, 0); assert.equal(S.debt.debtServiceMonthly.cents, 0);
  assert.ok(R.projectionInputs, 'the projection runs'); assert.equal(R.metrics.spending.status, 'ok'); assert.ok(R.metrics.spending.rough, 'a metric fed by a remainder reads rough'); assert.ok(R.metrics.spending.value.range, 'with a band');
  assert.ok(R.metrics.surplus.status === 'ok' && R.metrics.fiNumber.status === 'ok' && R.projection, 'the surplus, the FI number and the projection all run on the snapshot alone');
  assert.equal(R.hours.method, 'guess', 'no hours on file: a guess from income and a 40-hour week'); assert.equal(R.hours.wage, Math.round(420000 / (40 * 52 / 12)));
});
test('half-itemized household with an over-gut expense: the rows win, the gap is flagged, the snapshot stays for the gut read, and coverage is partial', () => {
  const rec = snapshotOnly();
  add(rec, 'spending', 'line', { category: 'accommodation', amount: [160000, 'known', 'month'], needWant: 'need' }, 'Rent'); add(rec, 'spending', 'line', { category: 'utilities', amount: [30000, 'known', 'month'], needWant: 'need' }, 'Power'); add(rec, 'spending', 'line', { category: 'therapy', amount: [25000, 'rough', 'month'], needWant: 'need' }, 'Gym and therapy');
  add(rec, 'spending', 'line', { category: 'food', amount: [50000, 'known', 'month'], needWant: 'want' }, 'Groceries'); add(rec, 'spending', 'line', { category: 'wants', amount: [null, 'will-send', 'month'], needWant: 'want' }, 'Fun'); /* a line's Need or Want decides its split; a fresh line defaults to need */
  const R = run(rec); const S = R.sun.outputs; const fx = S.spending.resolved.expensesFixed; const vr = S.spending.resolved.expensesVariable;
  assert.equal(fx.itemized, 215000); assert.equal(fx.total, 215000); assert.deepEqual(fx.overGut, { gap: 25000, pct: 25000 / 190000 }); assert.equal(fx.snapshot.cents, 190000); assert.equal(fx.coverage, 1);
  assert.equal(vr.itemized, 50000); assert.equal(vr.remainder, 70000); assert.equal(vr.counts.notYet, 1); assert.ok(Math.abs(vr.coverage - 50000 / 120000) < 1e-9);
  assert.equal(S.spending.baselineMonthly.cents, 215000 + 50000 + 70000 + 30000); assert.equal(S.spending.remainderMonthly.cents, 100000);
  const b = R.snapshot.list.find(x => x.id === 'expensesFixed'); assert.ok(b.resolved.overGut && b.complete); assert.ok(R.snapshot.coverage > 0 && R.snapshot.coverage < 1);
  const WL = whatsLeft(rec, R, data); const ids = WL.all.map(i => i.kind + ':' + i.where);
  assert.ok(WL.all.some(i => i.kind === 'row' && i.where === 'Fun' && i.willEmail), ids.join('; ')); assert.ok(WL.all.some(i => i.kind === 'remainder' && i.where === 'Variable a month'));
  assert.ok(WL.all.some(i => i.kind === 'base' && i.where === 'Snapshot'), 'the rough snapshots still on the list');
  assert.ok(WL.willEmail.length >= 1); assert.ok(WL.next.length <= 3 && WL.next.every((x, i, a) => i === 0 || a[i - 1].score >= x.score), 'ranked');
  assert.equal(diveRows(rec, data.fields, base('expensesVariable')).find(x => x.name === 'Fun').rowState, 'notYet');
});
test('between jobs: no wage, the lens stays off, totals never break with blanks', () => {
  const rec = createRecord(); sun(rec, { birthDate: '1990-07-01', state: 'TX', filingStatus: 'single', workSituation: 'between-jobs' });
  setBase(rec, data.fields, base('expensesFixed'), 150000, 'rough', 'client', {}); setBase(rec, data.fields, base('assetsCash'), 900000, 'known', 'client', {});
  const R = run(rec); assert.equal(R.hours.method, 'none'); assert.equal(R.hours.wage, null); assert.equal(R.hours.label, WAGE_METHODS.none); assert.ok(R.hours.betweenJobs);
  assert.equal(R.sun.outputs.spending.baselineMonthly.cents, 150000); assert.equal(R.sun.outputs.income.takeHomeMonthly.status, 'needs'); assert.equal(R.metrics.surplus.status, 'needs');
  F.setHoursLens({ mode: 'hours', wage: R.hours.wage }); assert.equal(F.dollarsWhole(150000), '$1,500'); F.setHoursLens({ mode: 'dollars' });
  assert.ok(R.snapshot.list.every(b => b.resolved === null || b.resolved.status !== 'ok' || Number.isFinite(b.resolved.total)));
});
test('self-employed: the wage reads as a trailing average of the variable figures on file, labeled', () => {
  const rec = createRecord(); sun(rec, { birthDate: '1988-07-01', state: 'CO', filingStatus: 'single', workSituation: 'self-employed' });
  add(rec, 'income', 'c1099', { grossPay: [600000, 'rough', 'month'], hoursPaid: 35, stability: 'variable', workCosts: [20000, 'known', 'month'] }, 'Consulting');
  const R = run(rec); assert.equal(R.hours.method, 'trailing'); assert.ok(/Trailing average/.test(R.hours.label)); assert.ok(R.hours.wage > 0 && Number.isFinite(R.hours.wage));
  const src = R.hours.sources[0]; assert.ok(src.inferred, 'take-home inferred with self-employment tax'); assert.equal(src.method, 'real'); assert.equal(Math.round(src.hoursMonthly), Math.round(35 * 52 / 12));
});
test('hourly worker with two jobs: a 30-33 hour range gives an income range; the on-call job counts its few hours a month; unpaid weeks cost dollars; each source shows its own wage and the blend is weighted by hours', () => {
  const rec = createRecord(); sun(rec, { birthDate: '1998-07-01', state: 'WA', filingStatus: 'single', workSituation: 'employed' });
  const weeks = weeksFromTimeOff({ holidays: 10, sick: 5, vacation: 10, slowWeeks: 2 }); assert.equal(weeks, 45, '52 less five weeks of days less two slow weeks');
  const main = add(rec, 'income', 'w2', { hourlyRate: 2200, hoursPaid: { low: 30, high: 33 }, weeksPerYear: weeks, hoursCommute: 3, workCosts: [10000, 'known', 'month'] }, 'Clinic');
  const gig = add(rec, 'income', 'side', { hourlyRate: 6000, hoursPaid: 6, hoursPer: 'month' }, 'On-call gig');
  setField(rec, gig.id, 'weeksPerYear', 52, 'known', 'client');
  const g = hourlyGrossAnnual(main); assert.equal(g.cents, 2200 * 32 * 45, 'the range reads at its midpoint, 32 hours'); assert.deepEqual(g.range, { low: 2200 * 30 * 45, high: 2200 * 33 * 45 }); assert.equal(g.unpaidWeeks, 7); assert.equal(g.unpaidCostAnnual, 2200 * 32 * 52 - 2200 * 32 * 45);
  const g2 = hourlyGrossAnnual(gig); assert.equal(g2.cents, 6000 * 6 * 12);
  const conv = hourlyConversion(main, data.tax2026, 'single'); assert.equal(conv.grossMonthly, Math.round(g.cents / 12)); assert.ok(conv.takeHomeMonthly < conv.grossMonthly && conv.takeHomeRange.low < conv.takeHomeRange.high);
  const R = run(rec); const S = R.sun.outputs;
  assert.equal(S.income.grossMonthly.cents, Math.round(g.cents / 12) + Math.round(g2.cents / 12)); assert.ok(S.income.grossMonthly.range && S.income.grossMonthly.range.low < S.income.grossMonthly.range.high, 'the hours range flows into the income band');
  assert.ok(R.metrics.takeHome.value.range, 'take-home carries the band'); assert.equal(S.income.hourlySources.length, 2);
  const H = R.hours; assert.equal(H.method, 'real'); assert.ok(H.blended); assert.equal(H.sources.length, 2);
  const clinic = H.sources.find(s => s.name === 'Clinic'), oncall = H.sources.find(s => s.name === 'On-call gig');
  assert.ok(oncall.wage > clinic.wage, 'the gig pays more per hour of life'); assert.equal(Math.round(oncall.hoursMonthly * 10) / 10, 6);
  const expectedBlend = Math.round((clinic.takeHomeMonthly - clinic.costsMonthly + oncall.takeHomeMonthly) / (clinic.hoursMonthly + oncall.hoursMonthly)); assert.equal(H.wage, expectedBlend);
  assert.ok(toHours(100000, H.wage, H.weeklyHours).text.length > 0); assert.equal(salaryAsHourly(500000, 40, 52), Math.round(6000000 / 2080));
  assert.ok(!belowMateriality(500000, H.wage, 5)); assert.ok(belowMateriality(100, H.wage, 5));
});
test('fully filled household: coverage is full, nothing is left, the wage stands on the real rung', () => {
  const rec = snapshotOnly();
  add(rec, 'income', 'w2', { grossPay: [550000, 'known', 'month'], takeHome: [420000, 'known', 'month'], hoursPaid: 40, hoursCommute: 4, workCosts: [15000, 'known', 'month'] }, 'Job');
  add(rec, 'spending', 'line', { category: 'accommodation', amount: [190000, 'known', 'month'], needWant: 'need' }, 'Rent'); add(rec, 'spending', 'line', { category: 'food', amount: [120000, 'known', 'month'], needWant: 'want' }, 'Everything else'); add(rec, 'spending', 'line', { category: 'irregular', amount: [30000, 'known', 'month'] }, 'Travel');
  add(rec, 'invest', 'bank', { bankType: 'checking', accountBalance: 800000 }, 'Checking'); add(rec, 'invest', 'account', { accountType: '401k', accountBalance: 3000000 }, '401k');
  const R = run(rec); assert.equal(R.snapshot.coverage, 1); assert.equal(R.sun.outputs.spending.remainderMonthly.cents, 0); assert.ok(!R.metrics.spending.rough);
  assert.equal(R.hours.method, 'real'); assert.equal(R.hours.wage, Math.round((420000 - 15000) / ((40 + 4) * 52 / 12))); assert.equal(R.hours.wage, R.metrics.realHourlyWage.value.cents, 'one source of truth with the registry metric');
  assert.equal(whatsLeft(rec, R, data).items.length, 0);
});
test('debt: the no-debt answer completes it; rows itemize it; a rough total beyond the rows is a remainder with no rate', () => {
  const rec = createRecord(); setBase(rec, data.fields, base('debt'), 0, 'none', 'client', {}); let R = run(rec);
  assert.ok(R.snapshot.list.find(b => b.id === 'debt').complete); assert.equal(R.sun.outputs.debt.totalDebt.cents, 0);
  setBase(rec, data.fields, base('debt'), 1500000, 'rough', 'client', {}); add(rec, 'debt', 'card', { balance: 400000, apr: 0.24, minimum: [12000, 'known', 'month'] }, 'Visa');
  R = run(rec); const d = R.sun.outputs.debt; assert.equal(d.resolved.debt.remainder, 1100000); assert.equal(d.totalDebt.cents, 1500000); assert.ok(d.totalDebt.rough); assert.equal(R.debts.length, 1, 'the simulator keeps the rows it can run');
  assert.equal(overallCoverage(R.snapshot.list.filter(b => b.id === 'debt')), 400000 / 1500000);
});
