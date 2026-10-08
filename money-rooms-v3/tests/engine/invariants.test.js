/* Invariants on every fixture household plus 200 randomised ones. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts, fieldDef } from '../../engine/fields.js';
import { sankey } from '../../engine/chartdata.js';
import { isQ } from '../../engine/units.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData();
const TODAY = '2026-10-05';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function randomHousehold(seed) {
  const rnd = mulberry32(seed);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const cents = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100);
  const state = () => pick(['verified', 'known', 'known', 'rough', 'rough', 'will-send', 'unknown', 'none']);
  const rec = createRecord({ id: 'rnd' + seed, now: '2026-10-01T00:00:00.000Z' });
  const set = (rowId, fid, v, st, src, cad) => setField(rec, rowId, fid, v, st || 'known', src || 'client', { cad });
  set('sun', 'name', 'Random ' + seed, 'known'); set('sun', 'birthDate', (1960 + Math.floor(rnd() * 45)) + '-' + String(1 + Math.floor(rnd() * 12)).padStart(2, '0') + '-15', 'known');
  set('sun', 'filingStatus', pick(['single', 'mfj', 'hoh']), 'known'); set('sun', 'workSituation', pick(['employed', 'self-employed', 'mixed']), 'known'); set('sun', 'dependents', Math.floor(rnd() * 4), 'known');
  const add = (planet, type, f) => { const row = createRow(planet, type, { nickname: type + ' ' + Math.floor(rnd() * 1000), f: freshFacts(data.fields, planet, type) }); Object.keys(row.f).forEach(fid => { const d = fieldDef(data.fields, fid); if (d.cadence) row.f[fid].cad = d.defaultCadence; }); addRow(rec, row); Object.keys(f || {}).forEach(fid => { const [v, st, src, cad] = f[fid]; set(row.id, fid, v, st, src, cad); }); return row; };
  const nInc = Math.floor(rnd() * 3);
  for (let i = 0; i < nInc; i++) {
    const t = pick(['w2', 'w2', 'c1099', 'side']);
    const f = { grossPay: [cents(1200, 9000), state(), 'client', 'paycheck'], payFrequency: [pick(['weekly', 'biweekly', 'semimonthly', 'monthly']), 'known'] };
    if (t !== 'side' && rnd() < 0.6) f.takeHome = [cents(900, 6000), state(), 'client', 'paycheck'];
    if (t === 'w2') { f.pretaxRetirement = [cents(0, 600), state(), 'client', 'paycheck']; f.hsaPayroll = [cents(0, 150), state(), 'client', 'paycheck']; f.bonus = [cents(0, 9000), state(), 'client', 'year']; f.hoursPaid = [Math.round(rnd() * 50), 'known']; }
    add('income', t, f);
  }
  if (rnd() < 0.5) add('income', 'benefits', { matchRate: [pick([0.5, 1]), 'known'], matchUpTo: [pick([0.03, 0.04, 0.06]), 'known'] });
  const nSp = Math.floor(rnd() * 12);
  for (let i = 0; i < nSp; i++) {
    const st = state(); const v = st === 'rough' && rnd() < 0.3 ? { low: cents(100, 500), high: cents(500, 900) } : cents(10, 3000);
    add('spending', 'line', { category: [pick(['accommodation', 'food', 'transportation', 'therapy', 'utilities', 'wants', 'irregular', 'mistakes', 'other']), 'known'], amount: [v, st, pick(['client', 'client', 'estimated']), pick(['month', 'month', 'year'])], needWant: [pick(['need', 'want']), 'known'], fatFloor: [rnd() < 0.4, 'known'], mistake: [rnd() < 0.1 ? 'mistake' : 'unavoidable', 'known'] });
  }
  if (rnd() < 0.5) add('spending', 'savings', { savingsLanding: [cents(0, 1500), state(), 'client', 'month'] });
  if (rnd() < 0.3) add('spending', 'summary', { summaryTotal: [cents(1500, 6000), 'rough', 'client', 'month'] });
  const nDebt = Math.floor(rnd() * 6);
  for (let i = 0; i < nDebt; i++) {
    const t = pick(['card', 'card', 'student', 'auto', 'personal', 'mortgage']);
    if (t === 'card') { const promo = rnd() < 0.4; add('debt', 'card', { balance: [cents(0, 9000), state()], apr: [0.15 + rnd() * 0.15, 'known'], promoApr: promo ? [0, 'none'] : [null, 'not-applicable'], promoEnd: promo ? ['2027-' + String(1 + Math.floor(rnd() * 12)).padStart(2, '0'), 'known'] : [null, 'not-applicable'], minimum: [cents(25, 400), state(), 'client', 'month'], creditLimit: [cents(1000, 20000), state()], autopay: [pick(['none', 'minimum', 'full']), 'known'] }); }
    else if (t === 'mortgage') add('debt', 'mortgage', { balance: [cents(50000, 600000), state()], rate: [0.03 + rnd() * 0.05, 'known'], principalInterest: [cents(800, 4000), state(), 'client', 'month'] });
    else add('debt', t, { balance: [cents(500, 60000), state()], rate: [rnd() * 0.12, 'known'], [t === 'student' ? 'minimum' : 'payment']: [cents(20, 900), state(), 'client', 'month'] });
  }
  const nAcc = Math.floor(rnd() * 7);
  const types = ['401k', 'rothIra', 'hsa', 'taxable', 'tradIra', 'realEstate', 'crypto', 'ibonds'];
  const bankTypes = ['hysa', 'checking', 'cd', 'savings'];
  for (let i = 0; i < nAcc; i++) {
    const st = rnd(); const bonds = rnd() * (1 - st);
    if (rnd() < 0.35) add('invest', 'bank', { bankType: [pick(bankTypes), 'known'], accountBalance: [cents(0, 400000), state()], contribAmount: [cents(0, 800), state(), 'client', 'month'] });
    else add('invest', 'account', { accountType: [pick(types), 'known'], accountBalance: [cents(0, 400000), state()], contribAmount: [cents(0, 800), state(), 'client', 'month'], allocStocks: [st, 'known'], allocBonds: [bonds, 'known'], allocCash: [1 - st - bonds, 'known'] });
  }
  if (rnd() < 0.4) add('safety', 'insurance', { insuranceType: ['health', 'known'], premium: [cents(50, 900), state(), 'client', pick(['month', 'paycheck'])] });
  if (rnd() < 0.5) add('life', 'retirement', { retirementAge: [45 + Math.floor(rnd() * 25), 'known'] });
  return rec;
}

function scanBad(obj, path, out) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'number') { if (!Number.isFinite(obj)) out.push(path + ' = ' + obj); return; }
  if (typeof obj !== 'object') return;
  if (obj.status === 'needs') return;
  Object.keys(obj).forEach(k => { if (k === 'def' || k === 'data') return; scanBad(obj[k], path + '.' + k, out); });
}

function checkInvariants(name, rec) {
  const R = compute(rec, data, { today: TODAY });
  const bad = []; scanBad(R.metrics, name + '.metrics', bad); scanBad(R.sun.outputs, name + '.sun', bad); scanBad(R.projection, name + '.projection', bad); scanBad(R.lenses, name + '.lenses', bad);
  assert.deepEqual(bad.slice(0, 5), [], name + ': no NaN or Infinity anywhere');
  const S = R.sun.outputs; const M = R.metrics;
  if (M.netWorth.status === 'ok') assert.equal(M.netWorth.value.cents, S.invest.totalAssets.cents - (isQ(S.debt.totalDebt) ? S.debt.totalDebt.cents : 0), name + ': net worth = assets - debts');
  const sk = sankey(R);
  if (!sk.needs) assert.equal(sk.inflow, sk.outflow, name + ': Sankey inflows equal outflows');
  if (M.surplus.status === 'ok') {
    const take = S.income.takeHomeMonthly.cents; const cats = Object.values(S.spending.byCategory).reduce((s, q) => s + q.cents, 0); const prem = S.safety.premiumsMonthly.cents; const service = S.debt.debtServiceMonthly.cents;
    const baseline = isQ(S.spending.baselineMonthly) ? S.spending.baselineMonthly.cents : 0;
    const spendUsed = S.spending.summaryTotalMonthly && !rec.planets.spending.rows.some(r => r.type === 'line' || r.type === 'other') ? baseline : cats;
    assert.equal(spendUsed + prem + service + M.surplus.value.cents, take, name + ': categories + premiums + debt service + surplus = take-home');
  }
  if (M.savingsRateTakeHome.status === 'ok') { assert.ok(M.savingsRateTakeHome.value.value <= 1, name + ': savings rate never above 100%'); const take = S.income.takeHomeMonthly.cents; const sp = S.safety.spendingWithPremiums.cents; assert.ok(Math.abs(M.savingsRateTakeHome.value.value - (take - sp) / take) < 1e-9, name + ': take-home, not gross, feeds the savings rate'); }
  if (R.projection) {
    /* cash never takes market returns: while every path is still working, the cash lines are identical; after that each year's cash is last year's x (1 + cash return) with nothing added */
    R.projection.likely.path.forEach((p, i) => {
      const b = R.projection.best.path[i], w = R.projection.worst.path[i];
      if (p.working && b.working && w.working) { assert.equal(p.cash, b.cash, name + ': cash never takes market returns (year ' + p.year + ')'); assert.equal(p.cash, w.cash); }
      if (i > 0 && !p.working) assert.equal(p.cash, Math.round(R.projection.likely.path[i - 1].cash * (1 + R.asm.cashRealReturn)), name + ': retired cash grows at the cash return only (' + p.year + ')');
    });
    /* raising the savings rate never moves FI later */
    const more = JSON.parse(JSON.stringify(rec)); const acc = more.planets.invest.rows.find(r => r.type === 'account');
    if (acc) { acc.f.contribAmount = { v: (acc.f.contribAmount && typeof acc.f.contribAmount.v === 'number' ? acc.f.contribAmount.v : 0) + 50000, state: 'known', source: 'client', cad: 'month' }; const R2 = compute(more, data, { today: TODAY }); if (R2.projection && R.projection.likely.fiAge !== null) assert.ok(R2.projection.likely.fiAge === null ? false : R2.projection.likely.fiAge <= R.projection.likely.fiAge, name + ': more saving never moves FI later'); }
  }
  /* 401k and match live in savings, never in spending */
  const ben = rec.planets.income.rows.find(r => r.type === 'benefits');
  if (ben && M.savingsRateGross.status === 'ok') { const alt = JSON.parse(JSON.stringify(rec)); alt.planets.income.rows.find(r => r.type === 'benefits').f.matchRate = { v: 0, state: 'none', source: 'client' }; const R2 = compute(alt, data, { today: TODAY }); assert.equal(R2.sun.outputs.spending.baselineMonthly.cents, S.spending.baselineMonthly.cents, name + ': the match never touches spending'); }
  return R;
}

for (const name of ['jordan', 'dev', 'leah', 'extreme']) {
  test('invariants: ' + name, () => { const R = checkInvariants(name, loadHousehold(name)); assert.ok(R.metrics); });
}
test('invariants: an empty record computes without a single number invented', () => {
  const R = checkInvariants('empty', createRecord({ id: 'e' }));
  Object.values(R.metrics).forEach(m => assert.equal(m.status, 'needs', m.id + ' must say what it needs, not show a number'));
  assert.equal(R.lenses.length, 0);
});
test('invariants: 200 random households', () => {
  for (let seed = 1; seed <= 200; seed++) checkInvariants('seed ' + seed, randomHousehold(seed));
});
