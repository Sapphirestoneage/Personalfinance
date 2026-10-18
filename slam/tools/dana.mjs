// Builds Dana's test year (made up, no real data): a 34-year-old who owns a condo with a mortgage,
// has a 401(k) from the paycheck, a car with no loan, and a Visa on a 0% balance transfer. October
// 2025 to September 2026 closed, October 2026 open. Every month's actuals are typed (no log), so the
// budget is the same each month; only the balances move. test/dana.test.js checks it by hand.
//
// Run from the slam folder:
//   node tools/dana.mjs
// Writes test/households/dana.json.

import { writeFileSync } from 'node:fs';
import { createStore } from '../src/store/store.js';
import { createStorage, memoryBackend } from '../src/store/storage.js';
import { makeValue } from '../src/store/value.js';
import { makeDate } from '../src/store/schema.js';
import { addIncome, addDebt, addDeduction, addLine, findLine, setField } from '../src/store/edits.js';
import { addAccount, setBalance, setAccountField, setDeductionAccount, setAlternative, setPurchase } from '../src/store/accounts.js';
import { startPlan, copyPlanForward } from '../src/store/plans.js';
import { planStartValues } from '../src/calc/plan.js';
import { buildSummary, closeMonthSnapshot } from '../src/calc/summary.js';
import { monthReview, lastDay } from '../src/calc/loop.js';
import { loadRefs } from '../test/helpers.js';

const root = new URL('../', import.meta.url);
const refs = loadRefs();
// Ids (newId) use Math.random; a seeded one (mulberry32) makes the file the same on every run.
Math.random = ((seed) => () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
})(34);

const CLOSED = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const one = (n, opts = {}) => makeValue(n, { cadence: 'one-off', ...opts });

// The balances, typed by hand (none of them from a formula):
//   Take-home 4,000 a month. Spending 1,560 in lines + the mortgage 1,700 + the Visa minimum 250 = 3,510;
//   the emergency fund 300 (stays in savings). Each month checking gets 4,000, pays the 1,560 and the
//   1,700, pays the Visa 440 (the 250 minimum and 190 more), and moves 300 to savings: checking stays
//   2,400, savings goes up 300, the Visa (0% for now) goes down 440.
//   February: 85 of cash taken out and never written down, so checking ends 2,315 (and stays there).
//   401(k): 6,000 at the start; each month + 400 from the paycheck + the market:
//     +60, +90, -120, +80, -150, +110, +140, +40, -60, +120, -30, +90.
//   Mortgage: 240,000 at the start, 6% a year, 1,700 a month: each month the interest (balance x 0.5%,
//     to the cent) is added and 1,700 comes off.
//   The condo and the car ("roughly") are updated every three months; the other months they keep
//   their last value.
const START = { chk: 2400, sav: 1200, visa: 16000, k401: 6000, condo: 285000, car: 14000, 'debt-mort': 240000 };
const ENDS = {
  chk: [2400, 2400, 2400, 2400, 2315, 2315, 2315, 2315, 2315, 2315, 2315, 2315],
  sav: [1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600, 3900, 4200, 4500, 4800],
  visa: [15560, 15120, 14680, 14240, 13800, 13360, 12920, 12480, 12040, 11600, 11160, 10720],
  k401: [6460, 6950, 7230, 7710, 7960, 8470, 9010, 9450, 9790, 10310, 10680, 11170],
  // 240,000 + 1,200.00 - 1,700 = 239,500.00; + 1,197.50 = 238,997.50; + 1,194.99 = 238,492.49;
  // + 1,192.46 = 237,984.95; + 1,189.92 = 237,474.87; + 1,187.37 = 236,962.24; + 1,184.81 = 236,447.05;
  // + 1,182.24 = 235,929.29; + 1,179.65 = 235,408.94; + 1,177.04 = 234,885.98; + 1,174.43 = 234,360.41;
  // + 1,171.80 = 233,832.21 (each less 1,700).
  'debt-mort': [239500, 238997.50, 238492.49, 237984.95, 237474.87, 236962.24, 236447.05, 235929.29, 235408.94, 234885.98, 234360.41, 233832.21],
  condo: [null, null, 286500, null, null, 288000, null, null, 290000, null, null, 289000],
  car: [null, null, 13400, null, null, 12800, null, null, 12200, null, null, 11600]
};
const ROUGHLY = new Set(['condo', 'car']);

let now = new Date('2025-10-01T09:00:00Z');
const at = (iso) => { now = new Date(iso); };
const store = createStore(createStorage(memoryBackend()), () => now);
const upd = (label, fn) => store.update(label, fn);

store.create('Dana (demo, owns a condo)');
upd('Setup', (d) => {
  Object.assign(d.profile, { birthYear: 1992, state: 'CO' });
  d.situation = ['employed'];
  d.household.livingWith = 'alone';
  const job = addIncome(d, { id: 'job', type: 'w2', label: 'Juniper Health', payFrequency: 'monthly' });
  job.takeHome = makeValue(4000, { cadence: 'paycheck' });
  job.nextPayDate = makeDate('2025-10-31');
  const visa = addDebt(d, { id: 'debt-visa', label: 'Visa', type: 'credit-card' });
  Object.assign(visa, { minimum: makeValue(250), apr: one(0), dueDay: one(20) });
  const mort = addDebt(d, { id: 'debt-mort', label: 'Mortgage', type: 'mortgage' });
  Object.assign(mort, { minimum: makeValue(1700), apr: one(6), dueDay: one(1) });
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking', institution: 'Aspen Bank' });
  addAccount(d, { id: 'sav', name: 'Savings', type: 'savings', institution: 'Aspen Bank' });
  addAccount(d, { id: 'visa', name: 'Visa', type: 'credit-card', debtId: 'debt-visa' });
  addAccount(d, { id: 'k401', name: '401(k)', type: '401k', institution: 'Juniper plan' });
  addAccount(d, { id: 'condo', name: 'Condo', type: 'home' });
  addAccount(d, { id: 'car', name: 'Car', type: 'vehicle' });
  setAccountField(d, 'condo', 'securedDebtId', 'debt-mort');
  setPurchase(d, 'condo', 'price', one(280000));
  setPurchase(d, 'condo', 'date', '2023-06-15');
  setPurchase(d, 'car', 'price', one(19000));
  setPurchase(d, 'car', 'date', '2022-03-01');
  setAlternative(d, 'condo', 'rentAlt', makeValue(1900));
  const k = addDeduction(d, 'job', 'retirement');
  Object.assign(k, { mode: 'amount', amount: makeValue(400, { cadence: 'paycheck' }) });
  setDeductionAccount(d, 'job', k.id, 'k401');
  // The budget: estimates, and the same actuals typed (they carry into each new month).
  const L = (id) => findLine(d, id).line;
  const tax = addLine(d, 'housing', 'Property tax');
  tax.type = 'taxes';
  const lines = [['utilities', 140], ['home-insurance', 60], [tax.id, 250], ['groceries', 450], ['eating-out', 150],
    ['car-insurance', 90], ['gas', 110], ['maintenance', 40], ['subscriptions', 70], ['shopping', 120], ['entertainment', 80], ['emergency-fund', 300]];
  for (const [id, n] of lines) { L(id).estimate = makeValue(n); setField(d, ['line', id, 'actual'], makeValue(n)); }
  L('subscriptions').name = 'Phone';
  d.cashflow.cushion = one(500);
  for (const [id, v] of Object.entries(START)) setBalance(d, '2025-10', id, 'start', one(v, ROUGHLY.has(id) ? { status: 'roughly' } : {}));
  startPlan(d, '2025-10', 'estimates', planStartValues(d, null, 'estimates', null, '2025-10'));
});

CLOSED.forEach((month, i) => {
  at(lastDay(month) + 'T20:00:00Z');
  upd('End balances', (d) => {
    for (const [id, list] of Object.entries(ENDS)) if (list[i] !== null) setBalance(d, month, id, 'end', one(list[i], ROUGHLY.has(id) ? { status: 'roughly' } : {}));
  });
  upd('Plan next month', (d) => copyPlanForward(d, month));
  const [y, m] = month.split('-').map(Number);
  at((m === 12 ? y + 1 + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-01T08:00:00Z');
  const s = buildSummary(store.doc, refs);
  store.closeMonth({ ...closeMonthSnapshot(s), review: monthReview(store.doc, s, lastDay(month)) });
});

at('2026-10-17T18:00:00Z');
upd('Next pay date', (d) => { d.income.find((i) => i.id === 'job').nextPayDate = makeDate('2026-10-31'); });
writeFileSync(new URL('test/households/dana.json', root), JSON.stringify(store.doc, null, 1) + '\n');
console.log('Wrote dana.json: ' + store.doc.months.length + ' closed months, now on ' + store.doc.currentMonth);
