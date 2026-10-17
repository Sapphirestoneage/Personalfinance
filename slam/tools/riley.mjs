// Builds Riley's test year (made-up numbers, no real data): October 2025 to
// September 2026 closed, October 2026 open, run the way the monthly loop runs.
// Each month: a plan (copied forward), the log during the month (quick
// entries, "It happened" on scheduled bills and paychecks, a bank CSV some
// months), lines typed at month-end, real end balances, next month's plan,
// then close with the month's review. A small "bank" follows every dollar so
// balances are what really happened, logged or not.
//
// Deterministic: a fixed seed for the filler months; December, February,
// March, June, and October 2026 are written out by hand (test/riley.test.js
// checks them by hand). Run from the slam folder:
//   node tools/riley.mjs
// Writes test/households/riley.json and the CSV files it imported
// (test/households/riley-YYYY-MM-<account>.csv).

import { readFileSync, writeFileSync } from 'node:fs';
import { createStore } from '../src/store/store.js';
import { createStorage, memoryBackend } from '../src/store/storage.js';
import { makeValue } from '../src/store/value.js';
import { makeDate } from '../src/store/schema.js';
import { addIncome, addDebt, findLine, setField, setTransactionLine } from '../src/store/edits.js';
import { addAccount, setBalance } from '../src/store/accounts.js';
import { addEntry, editEntry, mergeImport, confirmMatch } from '../src/store/log.js';
import { confirmScheduled, saveForecast } from '../src/store/cashflow.js';
import { startPlan, copyPlanForward, setPlanAmount } from '../src/store/plans.js';
import { planStartValues } from '../src/calc/plan.js';
import { importCSV } from '../src/calc/tx-import.js';
import { matchImport, matchSummary } from '../src/calc/log.js';
import { scheduledItems, forecastFor } from '../src/calc/calendar.js';
import { incomeSummary } from '../src/calc/income.js';
import { buildSummary, closeMonthSnapshot, snapshotOf } from '../src/calc/summary.js';
import { monthReview, lastDay } from '../src/calc/loop.js';

const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const refs = {
  tax: json('data/tax-constants.json'), benchmarks: json('data/benchmarks.json'), averages: json('data/spending-averages.json'),
  merchantRules: json('data/merchant-rules.json'), subcategoryIdeas: json('data/subcategory-ideas.json'), eraTemplates: json('data/era-templates.json')
};

// A small seeded random number generator (mulberry32), so every run is the same.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20251001);
// Ids (newId) use Math.random; a seeded one makes the file the same on every run.
Math.random = mulberry32(17);
const cents = (x) => Math.round(x * 100) / 100;
const between = (lo, hi) => cents(lo + rand() * (hi - lo));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

const CLOSED = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const OPEN = '2026-10';
const TODAY = '2026-10-17';
const START = { chk: 2900, sav: 700, visa: 412.37 };
const VISA_LINES = ['groceries', 'eating-out', 'gas', 'shopping', 'entertainment', 'gifts'];

let now = new Date('2025-10-01T09:00:00Z');
const at = (iso) => { now = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso); };
const store = createStore(createStorage(memoryBackend()), () => now);
const upd = (label, fn) => store.update(label, fn);

// ---- Setup: Riley as the coach first types them in ----
store.create('Riley (demo, a year of the loop)');
upd('Setup', (d) => {
  Object.assign(d.profile, { birthYear: 1995, state: 'OR' });
  d.situation = ['employed'];
  d.household.livingWith = 'alone';
  d.gut = makeValue(3200, { status: 'roughly' });
  const job = addIncome(d, { id: 'job', type: 'w2', label: 'Northwind Labs', payFrequency: 'biweekly' });
  job.takeHome = makeValue(1500, { cadence: 'paycheck' });
  job.nextPayDate = makeDate('2025-10-10');
  const side = addIncome(d, { id: 'side', type: 'side', label: 'Dog walking', payFrequency: 'monthly' });
  side.takeHome = makeValue(250, { cadence: 'month' });
  const visa = addDebt(d, { id: 'debt-visa', label: 'Visa', type: 'credit-card' });
  Object.assign(visa, { minimum: makeValue(35), apr: makeValue(24.99, { cadence: 'one-off' }), dueDay: makeValue(25, { cadence: 'one-off' }), payWith: 'statement' });
  addAccount(d, { id: 'chk', name: 'Checking', type: 'checking', institution: 'Harbor Credit Union' });
  addAccount(d, { id: 'sav', name: 'Savings', type: 'savings', institution: 'Harbor Credit Union' });
  addAccount(d, { id: 'visa', name: 'Visa', type: 'credit-card', debtId: 'debt-visa' });
  const L = (id) => findLine(d, id).line;
  const one = (n) => makeValue(n, { cadence: 'one-off' });
  Object.assign(L('rent'), { name: 'Rent', estimate: makeValue(1750), dueDay: one(1) });
  L('utilities').estimate = makeValue(84);
  Object.assign(L('groceries'), { estimate: makeValue(350), joy: 6 });
  Object.assign(L('eating-out'), { estimate: makeValue(100), joy: 8 });
  Object.assign(L('car-payment'), { estimate: makeValue(340), dueDay: one(15) });
  Object.assign(L('car-insurance'), { estimate: makeValue(960, { cadence: 'year' }), dueMonth: one(3), dueDay: one(14) });
  L('gas').estimate = makeValue(120);
  Object.assign(L('subscriptions'), { name: 'Phone', estimate: makeValue(65), dueDay: one(18) });
  Object.assign(L('shopping'), { estimate: makeValue(100), joy: 5 });
  Object.assign(L('entertainment'), { estimate: makeValue(60), joy: 9 });
  Object.assign(L('gifts'), { estimate: makeValue(40), joy: 8 });
  Object.assign(L('yearly'), { name: 'Car registration', estimate: makeValue(180, { cadence: 'year' }), dueMonth: one(7), dueDay: one(10) });
  L('emergency-fund').estimate = makeValue(200);
  L('retirement').estimate = makeValue(400);
  Object.assign(L('other-goals'), { name: 'Car repair fund', estimate: makeValue(50) });
  for (const id of VISA_LINES) L(id).accountId = 'visa';
  d.cashflow.cushion = one(100);
  setBalance(d, '2025-10', 'chk', 'start', one(START.chk));
  setBalance(d, '2025-10', 'sav', 'start', one(START.sav));
  setBalance(d, '2025-10', 'visa', 'start', one(START.visa));
  startPlan(d, '2025-10', 'estimates', planStartValues(d, null, 'estimates', null, '2025-10'));
});

// ---- The bank, and applying one month's events ----
const bank = { ...START };
const ends = {};
let lowChecking = { amount: Infinity, date: null };
const csvFiles = [];

// ev: { date, acct, amt (positive = money out of the account, or onto the card), how, ...entry fields }
// how: 'scheduled' (It happened), 'manual' (quick entry), 'csv' (bank row only),
// 'both' (quick entry and a bank row, on ev.loggedOn if the days differ), 'bank' (not logged).
function applyEvents(month, events, csvAccounts) {
  const rows = {};
  const ordered = events.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const ev of ordered) {
    at(ev.date);
    bank[ev.acct] = cents(bank[ev.acct] + (ev.acct === 'visa' ? ev.amt : -ev.amt));
    if (ev.acct === 'chk' && bank.chk < lowChecking.amount) lowChecking = { amount: bank.chk, date: ev.date };
    if (ev.how === 'scheduled') {
      const key = ev.key + ':' + ev.date;
      const item = scheduledItems(store.doc, month, incomeSummary(store.doc, refs.tax)).items.find((i) => i.key === key);
      if (!item) throw new Error('No scheduled item ' + key);
      upd('It happened', (d) => confirmScheduled(d, item, Math.abs(ev.amt), ev.date));
    }
    if (ev.how === 'manual' || ev.how === 'both') {
      if (ev.loggedOn) at(ev.loggedOn);
      upd('Quick entry', (d) => {
        const e = addEntry(d, { date: ev.loggedOn || ev.date, amount: ev.logAmt !== undefined ? ev.logAmt : ev.amt, kind: ev.kind || 'spend', lineId: ev.lineId || null, incomeId: ev.incomeId || null, merchant: ev.merchant || '', note: ev.note || '', account: ev.logAcct === undefined ? ev.acct : ev.logAcct });
        if (ev.owed) editEntry(d, e.id, { owed: ev.owed });
        if (ev.ref) ev.ref.id = e.id;
      });
    }
    if ((ev.how === 'csv' || ev.how === 'both') && csvAccounts.includes(ev.acct)) {
      const [y, m, dd] = ev.date.split('-');
      (rows[ev.acct] = rows[ev.acct] || []).push(m + '/' + dd + '/' + y + ',' + ev.desc + ',' + (-ev.amt).toFixed(2));
    }
  }
  return rows;
}

function importRows(month, rows, after) {
  for (const [acct, list] of Object.entries(rows)) {
    const text = 'Date,Description,Amount\n' + list.join('\n') + '\n';
    const file = 'riley-' + month + '-' + acct + '.csv';
    writeFileSync(new URL('test/households/' + file, root), text);
    csvFiles.push(file);
    at(lastDay(month) + 'T18:00:00Z');
    const res = importCSV(text, { account: acct, rulesData: refs.merchantRules, memory: store.doc.merchantMemory });
    const m = matchImport(store.doc.transactions, res.transactions);
    console.log('  ' + file + ': ' + matchSummary(m));
    upd('Import ' + file, (d) => mergeImport(d, m));
  }
  if (after) after();
}

function monthEnd(month, typed, planTweaks) {
  at(lastDay(month) + 'T20:00:00Z');
  for (const [lineId, amount, note] of typed) upd('Actual', (d) => setField(d, ['line', lineId, 'actual'], makeValue(amount, { note: note || '' })));
  upd('End balances', (d) => { for (const a of ['chk', 'sav', 'visa']) setBalance(d, month, a, 'end', makeValue(bank[a], { cadence: 'one-off' })); });
  ends[month] = { ...bank };
  const next = nextKey(month);
  upd('Plan ' + next, (d) => { copyPlanForward(d, month); for (const [k, v] of planTweaks || []) setPlanAmount(d, next, k, makeValue(v)); });
}

function close(month) {
  at(nextKey(month) + '-01T08:00:00Z');
  const s = buildSummary(store.doc, refs);
  const review = monthReview(store.doc, s, lastDay(month));
  store.closeMonth({ ...closeMonthSnapshot(s), review });
  upd('Save snapshot', (d) => { d.snapshots.push(snapshotOf(s, now.toISOString())); });
  const next = store.doc.currentMonth;
  upd('Save forecast', (d) => saveForecast(d, next, forecastFor(d, s.income, next), now.toISOString()));
  console.log(month + ': ' + review.openItems.summary + '; bridge ' + (review.bridge.ties ? 'ties' : 'off by ' + review.bridge.unexplained));
}

function nextKey(key) {
  let [y, m] = key.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}

// Biweekly Fridays from October 10, 2025.
function paydays(month) {
  const out = [];
  for (let t = Date.parse('2025-10-10T00:00:00Z'); ; t += 14 * 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d.slice(0, 7) > month) break;
    if (d.slice(0, 7) === month) out.push(d);
  }
  return out;
}

const day = (month, d) => month + '-' + String(d).padStart(2, '0');
const statement = (month) => { const prev = CLOSED[CLOSED.indexOf(month) - 1]; return prev ? ends[prev].visa : START.visa; };

// Checking: rent, the savings transfer, utilities (typed later), the car payment, phone, Visa, and paychecks.
function checkingEvents(month, o = {}) {
  const ev = [
    { date: day(month, 1), acct: 'chk', amt: 1750, how: 'scheduled', key: 'bill:rent', desc: 'RENT PAYMENT ACH' },
    { date: day(month, 3), acct: 'chk', amt: 250, how: o.csv ? 'csv' : 'bank', desc: 'ONLINE TRANSFER TO SAVINGS' },
    { date: day(month, 3), acct: 'sav', amt: -250, how: 'bank' },
    { date: day(month, 15), acct: 'chk', amt: 340, how: 'scheduled', key: 'bill:car-payment', desc: 'NW AUTO LOAN' },
    { date: day(month, 18), acct: 'chk', amt: 65, how: 'scheduled', key: 'bill:subscriptions', desc: 'T-MOBILE BILL' },
    { date: day(month, 25), acct: 'chk', amt: statement(month), how: 'scheduled', key: 'debt:debt-visa', desc: 'VISA ONLINE PAYMENT' },
    { date: day(month, 26), acct: 'visa', amt: -statement(month), how: 'csv', desc: 'PAYMENT THANK YOU' },
    // A Roth IRA at an outside broker: the money leaves Riley's accounts, so it is logged.
    { date: day(month, 28), acct: 'chk', amt: 400, how: o.csv ? 'both' : 'manual', desc: 'VANGUARD ROTH IRA', merchant: 'Vanguard', lineId: 'retirement' }
  ];
  for (const p of paydays(month)) ev.push({ date: p, acct: 'chk', amt: -1500, how: 'scheduled', key: 'pay:job', desc: 'PAYROLL NORTHWIND' });
  if (o.utilities !== undefined) ev.push({ date: day(month, 8), acct: 'chk', amt: o.utilities, how: o.csv ? 'csv' : 'bank', desc: 'PGE ELECTRIC BILL', lineId: 'utilities' });
  for (const [d, a] of o.side || []) ev.push({ date: day(month, d), acct: 'chk', amt: -a, how: 'manual', kind: 'income', incomeId: 'side', note: 'Dog walking' });
  if (o.csv) for (const e of ev) if (e.how === 'scheduled') e.how = 'scheduled-csv';
  return ev;
}

// Filler: a month of Visa spending from the seeded generator.
function visaFiller(month, how) {
  const ev = [];
  const groc = [['TRADER JOE S #552', "Trader Joe's"], ['SAFEWAY 0412', 'Safeway'], ['WHOLE FOODS MKT', 'Whole Foods']];
  for (const d of [2, 9, 16, 23]) { const [desc, m] = pick(groc); ev.push({ date: day(month, d + Math.floor(rand() * 2)), acct: 'visa', amt: between(58, 118), how, desc, merchant: m, lineId: 'groceries' }); }
  const coffeeDays = [4, 7, 11, 14, 19, 24].filter(() => rand() < 0.85);
  for (const d of coffeeDays) ev.push({ date: day(month, d), acct: 'visa', amt: 4.75, how, desc: 'CORNER COFFEE', merchant: 'Corner Coffee', lineId: 'eating-out' });
  const meals = [['CHIPOTLE 1234', 'Chipotle'], ['SWEETGREEN', 'Sweetgreen'], ['THAI BASIL', 'Thai Basil']];
  for (const d of [10, 20]) { const [desc, m] = pick(meals); ev.push({ date: day(month, d), acct: 'visa', amt: between(12, 48), how, desc, merchant: m, lineId: 'eating-out' }); }
  for (const d of [6, 21]) ev.push({ date: day(month, d), acct: 'visa', amt: between(40, 55), how, desc: 'SHELL OIL 5744', merchant: 'Shell', lineId: 'gas' });
  const shops = [['TARGET', 'Target'], ['AMAZON MKTPL', 'Amazon']];
  for (const d of [13, 27].slice(0, 1 + Math.floor(rand() * 2))) { const [desc, m] = pick(shops); ev.push({ date: day(month, d), acct: 'visa', amt: between(20, 60), how, desc, merchant: m, lineId: 'shopping' }); }
  ev.push({ date: day(month, 17), acct: 'visa', amt: between(15, 40), how, desc: 'AMC 0921', merchant: 'AMC', lineId: 'entertainment' });
  const gift = rand() < 0.5;
  if (gift) ev.push({ date: day(month, 12), acct: 'visa', amt: between(20, 45), how, desc: 'ETSY', merchant: 'Etsy', lineId: 'gifts' });
  return { ev, gift };
}

// Savings back to checking: an internal move, not logged.
const sweep = (month, d, amount) => [{ date: day(month, d), acct: 'sav', amt: amount, how: 'bank' }, { date: day(month, d), acct: 'chk', amt: -amount, how: 'bank' }];

const SAVINGS_TYPED = [['emergency-fund', 200], ['other-goals', 50]];

function fillerMonth(month, o = {}) {
  const utilities = between(72, 96);
  const side = [[5 + Math.floor(rand() * 8), between(60, 160)]];
  if (rand() < 0.5) side.push([18 + Math.floor(rand() * 8), between(60, 140)]);
  const vf = visaFiller(month, o.csvVisa ? 'csv' : 'manual');
  const ev = [...checkingEvents(month, { utilities, side }), ...vf.ev, ...(o.extra || [])];
  const rows = applyEvents(month, ev, o.csvVisa ? ['visa'] : []);
  importRows(month, rows, o.afterImport);
  const typed = [['utilities', utilities], ...SAVINGS_TYPED];
  if (!vf.gift && !(o.extra || []).some((e) => e.lineId === 'gifts')) typed.push(['gifts', 0, 'None this month']);
  return typed;
}

// ---- The year ----
for (const month of CLOSED) {
  console.log('-- ' + month);
  let typed;
  let tweaks = [];
  if (month === '2025-10') {
    typed = fillerMonth(month);
  } else if (month === '2025-11') {
    typed = fillerMonth(month);
    tweaks = [['gifts', 400], ['eating-out', 150]];
  } else if (month === '2025-12') {
    // December by hand: a holiday month. Eating out's estimate goes from 100 to 150 on the 1st.
    at('2025-12-01T10:00:00Z');
    upd('Eating out estimate', (d) => { findLine(d, 'eating-out').line.estimate = makeValue(150); });
    const v = (date, amt, merchant, lineId) => ({ date: day(month, date), acct: 'visa', amt, how: 'manual', merchant, lineId });
    const ev = [...checkingEvents(month, { utilities: 92.40, side: [[13, 140]] }),
      v(2, 91.30, "Trader Joe's", 'groceries'), v(6, 4.75, 'Corner Coffee', 'eating-out'), v(9, 104.20, 'Safeway', 'groceries'),
      v(10, 140, "Powell's Books", 'gifts'), v(12, 4.75, 'Corner Coffee', 'eating-out'), v(14, 48.10, 'Shell', 'gas'),
      v(16, 87.65, "Trader Joe's", 'groceries'), v(17, 180, 'Etsy', 'gifts'), v(20, 56, 'Thai Basil', 'eating-out'),
      v(21, 32.40, 'Target', 'shopping'), v(22, 100, 'Nordstrom', 'gifts'), v(23, 118.90, 'Whole Foods', 'groceries'),
      v(27, 31, 'AMC', 'entertainment'), v(28, 44.60, 'Shell', 'gas'), v(30, 4.75, 'Corner Coffee', 'eating-out')];
    applyEvents(month, ev, []);
    typed = [['utilities', 92.40], ...SAVINGS_TYPED];
    tweaks = [['gifts', 40], ['groceries', 400]];
  } else if (month === '2026-01') {
    // January: the groceries estimate goes from 350 to 400; the first Visa CSV. The coach maps
    // Corner Coffee to eating out and asks the app to remember it.
    at('2026-01-02T10:00:00Z');
    upd('Groceries estimate', (d) => { findLine(d, 'groceries').line.estimate = makeValue(400); });
    typed = fillerMonth(month, { csvVisa: true, afterImport: () => {
      const cc = store.doc.transactions.find((t) => t.merchant === 'CORNER COFFEE' && !t.lineId);
      if (cc) upd('Map Corner Coffee', (d) => setTransactionLine(d, cc.id, 'eating-out', true));
    } });
  } else if (month === '2026-02') {
    // February by hand.
    const v = (date, amt, merchant, lineId) => ({ date: day(month, date), acct: 'visa', amt, how: 'manual', merchant, lineId });
    const ev = [...checkingEvents(month, { utilities: 88.10, side: [[21, 110]] }),
      v(2, 84.60, "Trader Joe's", 'groceries'), v(4, 4.75, 'Corner Coffee', 'eating-out'), v(7, 47.20, 'Shell', 'gas'),
      v(9, 99.40, 'Safeway', 'groceries'), v(11, 4.75, 'Corner Coffee', 'eating-out'), v(14, 64, 'Thai Basil', 'eating-out'),
      v(16, 79.80, "Trader Joe's", 'groceries'), v(18, 4.75, 'Corner Coffee', 'eating-out'), v(21, 45.90, 'Amazon', 'shopping'),
      v(22, 50.30, 'Shell', 'gas'), v(23, 72.15, 'Whole Foods', 'groceries'), v(25, 4.75, 'Corner Coffee', 'eating-out'),
      v(26, 24, 'AMC', 'entertainment'),
      // Savings runs ahead of checking; Riley moves some back (an internal move, cash stays the same).
      ...sweep(month, 26, 1500)];
    applyEvents(month, ev, []);
    typed = [['utilities', 88.10], ...SAVINGS_TYPED, ['gifts', 0, 'None this month']];
    tweaks = [['shopping', 60]];
  } else if (month === '2026-03') {
    // March by hand: the month checked start to finish in test/riley.test.js.
    const coffee = { id: null };
    const c = (date, amt, desc, how = 'csv', more = {}) => ({ date: day(month, date), acct: 'visa', amt, how, desc, ...more });
    const ev = [...checkingEvents(month, { utilities: 84.30, side: [[9, 120], [23, 100]] }),
      { date: day(month, 14), acct: 'chk', amt: 960, how: 'manual', merchant: 'Geico', lineId: 'car-insurance' },
      c(2, 82.40, 'TRADER JOE S #552', 'both', { merchant: "Trader Joe's", lineId: 'groceries' }),
      c(4, 13.50, 'CHIPOTLE 1234'), c(5, 4.75, 'CORNER COFFEE'), c(6, 45.00, 'SHELL OIL 5744'), c(7, 4.75, 'CORNER COFFEE'),
      c(9, 96.10, 'SAFEWAY 0412'), c(11, 15.25, 'SWEETGREEN'), c(12, 4.75, 'CORNER COFFEE'), c(14, 38.99, 'TARGET T-1234'),
      c(15, 28.00, 'AMC 0921'),
      c(17, 74.25, 'TRADER JOE S #552', 'both', { loggedOn: day(month, 16), merchant: "Trader Joe's", lineId: 'groceries' }),
      c(19, 4.75, 'CORNER COFFEE'),
      c(20, 42.00, 'THAI BASIL', 'both', { merchant: 'Thai Basil', lineId: 'eating-out' }),
      c(21, 4.75, 'CORNER COFFEE', 'both', { logAmt: 4.50, logAcct: null, note: 'coffee', lineId: 'eating-out', ref: coffee }),
      c(23, 61.80, 'WHOLE FOODS MKT'), c(24, 48.30, 'SHELL OIL 5744'), c(25, 24.50, 'AMAZON MKTPL'), c(26, 4.75, 'CORNER COFFEE'),
      c(29, 54.00, 'WALMART')];
    importRows(month, applyEvents(month, ev, ['visa']), () => {
      // The coach says the Mar 21 Corner Coffee is the coffee logged that day.
      const bank21 = store.doc.transactions.find((t) => t.date === '2026-03-21' && t.merchant === 'CORNER COFFEE');
      upd('Same entry', (d) => confirmMatch(d, bank21.id, coffee.id));
    });
    typed = [['utilities', 84.30], ...SAVINGS_TYPED, ['gifts', 0, 'None this month']];
    tweaks = [['shopping', 100]];
  } else if (month === '2026-04') {
    typed = fillerMonth(month);
    tweaks = [['groceries', 420]];
  } else if (month === '2026-05') {
    // May: the groceries estimate goes to 420; a concert, half of it owed back by a friend.
    at('2026-05-01T10:00:00Z');
    upd('Groceries estimate', (d) => { findLine(d, 'groceries').line.estimate = makeValue(420); });
    // A late April utility bill, after April closed: a revision, never part of April's saved review.
    at('2026-05-03T10:00:00Z');
    store.reviseMonth('2026-04', 'utilities', 91.20);
    typed = fillerMonth(month, { extra: [{ date: day(month, 9), acct: 'visa', amt: 120, how: 'manual', merchant: 'Ticketmaster', lineId: 'entertainment', owed: 60, note: 'Concert, Sam owes half' }, ...sweep(month, 29, 1000)] });
  } else if (month === '2026-06') {
    // June by hand: both CSVs; $60 of ATM cash no line explains; Sam pays back the concert.
    const c = (date, amt, desc) => ({ date: day(month, date), acct: 'visa', amt, how: 'csv', desc });
    const ev = [...checkingEvents(month, { utilities: 79.60, csv: true }),
      { date: day(month, 12), acct: 'chk', amt: 60, how: 'csv', desc: 'ATM WITHDRAWAL 0612' },
      { date: day(month, 14), acct: 'chk', amt: -60, how: 'csv', desc: 'ZELLE FROM SAM' },
      { date: day(month, 20), acct: 'chk', amt: -150, how: 'both', desc: 'ZELLE FROM PAT', kind: 'income', incomeId: 'side', note: 'Dog walking' },
      c(2, 93.40, 'TRADER JOE S #552'), c(4, 4.75, 'CORNER COFFEE'), c(6, 49.90, 'SHELL OIL 5744'), c(9, 88.75, 'SAFEWAY 0412'),
      c(11, 4.75, 'CORNER COFFEE'), c(13, 14.25, 'CHIPOTLE 1234'), c(16, 81.20, 'TRADER JOE S #552'), c(18, 4.75, 'CORNER COFFEE'),
      c(20, 46.10, 'SHELL OIL 5744'), c(23, 77.35, 'WHOLE FOODS MKT'), c(25, 4.75, 'CORNER COFFEE'), c(27, 41.80, 'TARGET')];
    for (const e of ev) if (e.how === 'scheduled-csv') e.how = 'scheduled+csv';
    applyScheduledCsv(month, ev);
    // Sam's Zelle settles May's concert.
    const zelle = store.doc.transactions.find((t) => t.merchant === 'ZELLE FROM SAM');
    const concert = store.doc.transactions.find((t) => t.owed);
    upd('Pays back', (d) => editEntry(d, zelle.id, { settles: concert.id }));
    typed = [...SAVINGS_TYPED, ['gifts', 0, 'None this month'], ['entertainment', 0, 'None this month']];
  } else if (month === '2026-07') {
    // July: the car registration (a yearly bill) comes due on the 10th.
    typed = fillerMonth(month, { extra: [{ date: day(month, 10), acct: 'chk', amt: 180, how: 'manual', merchant: 'Oregon DMV', lineId: 'yearly' }] });
  } else if (month === '2026-08') {
    typed = fillerMonth(month);
  } else if (month === '2026-09') {
    // September: a car repair on the Visa, sized so October's calendar tells the story checked in the
    // test: with the repair paid on Oct 25, rent on Nov 1 lands before the Nov 6 paycheck.
    typed = septemberWithRepair(month);
  }
  monthEnd(month, typed, tweaks);
  close(month);
}

// June: every checking row is in the bank file, and scheduled ones were also tapped "It happened".
function applyScheduledCsv(month, ev) {
  for (const e of ev) if (e.how === 'scheduled+csv') { e.how = 'scheduled'; e.alsoCsv = true; }
  const rows = applyEvents(month, ev, ['chk', 'visa']);
  for (const e of ev.filter((x) => x.alsoCsv)) {
    const [y, m, dd] = e.date.split('-');
    (rows.chk = rows.chk || []).push(m + '/' + dd + '/' + y + ',' + e.desc + ',' + (-e.amt).toFixed(2));
  }
  rows.chk.sort((a, b) => (a.slice(0, 10) < b.slice(0, 10) ? -1 : 1));
  importRows(month, rows);
}

function septemberWithRepair(month) {
  const utilities = between(72, 96);
  const side = [[9, between(60, 160)]];
  const vf = visaFiller(month, 'csv');
  const ev = [...checkingEvents(month, { utilities, side }), ...vf.ev];
  // Most of savings moves to checking on the 29th to cover the repair bill and rent (an internal move).
  const move = cents(Math.max(0, bank.sav + 250 - 150));
  ev.push({ date: day(month, 29), acct: 'sav', amt: move, how: 'bank' }, { date: day(month, 29), acct: 'chk', amt: -move, how: 'bank' });
  // Checking at the end of September does not depend on the repair (it is on the card).
  let checking = bank.chk;
  for (const e of ev) if (e.acct === 'chk') checking -= e.amt;
  const purchases = vf.ev.reduce((a, e) => a + e.amt, 0);
  // October by hand (the calendar counts checking only, S-094): today X = Sep-end checking - 1,750 rent
  // - 250 to savings + 1,500 pay + 130 side - 340 car = checking - 710, and Nov 1 = X - V - 401.80 where
  // V is September's Visa statement. For Nov 1 to be $71.20, V = checking - 1,183.
  const repair = cents(checking - 1183 - purchases);
  console.log('  checking before repair ' + cents(checking) + ', purchases ' + cents(purchases) + ', repair ' + repair);
  if (repair < 400 || repair > 3000) throw new Error('Car repair out of range: ' + repair + ' (tune START)');
  ev.push({ date: day(month, 12), acct: 'visa', amt: repair, how: 'both', desc: 'BRAKE AND TIRE CO', merchant: 'Brake and Tire Co', lineId: 'maintenance', note: 'Brakes and tires' });
  importRows(month, applyEvents(month, ev, ['visa']));
  const typed = [['utilities', utilities], ...SAVINGS_TYPED];
  if (!vf.gift) typed.push(['gifts', 0, 'None this month']);
  return typed;
}

// ---- October 2026, the open month, up to today (the 17th) ----
console.log('-- ' + OPEN + ' (open)');
const octV = ends['2026-09'].visa;
const oct = [
  { date: '2026-10-01', acct: 'chk', amt: 1750, how: 'scheduled', key: 'bill:rent' },
  // The move to savings is logged this month (both sides), so the checking calendar is right.
  { date: '2026-10-03', acct: 'chk', amt: 250, how: 'manual', kind: 'transfer', note: 'To savings' },
  { date: '2026-10-03', acct: 'sav', amt: -250, how: 'manual', kind: 'transfer', note: 'From checking' },
  { date: '2026-10-09', acct: 'chk', amt: -1500, how: 'scheduled', key: 'pay:job' },
  { date: '2026-10-12', acct: 'chk', amt: -130, how: 'manual', kind: 'income', incomeId: 'side', note: 'Dog walking' },
  { date: '2026-10-15', acct: 'chk', amt: 340, how: 'scheduled', key: 'bill:car-payment' },
  { date: '2026-10-04', acct: 'visa', amt: 88.20, how: 'manual', merchant: "Trader Joe's", lineId: 'groceries' },
  { date: '2026-10-06', acct: 'visa', amt: 4.75, how: 'manual', merchant: 'Corner Coffee', lineId: 'eating-out' },
  { date: '2026-10-07', acct: 'visa', amt: 46.00, how: 'manual', merchant: 'Shell', lineId: 'gas' },
  { date: '2026-10-11', acct: 'visa', amt: 121.80, how: 'manual', merchant: 'Safeway', lineId: 'groceries' },
  { date: '2026-10-13', acct: 'visa', amt: 4.75, how: 'manual', merchant: 'Corner Coffee', lineId: 'eating-out' },
  { date: '2026-10-15', acct: 'visa', amt: 13.75, how: 'manual', merchant: 'Chipotle', lineId: 'eating-out' }
];
applyEvents(OPEN, oct, []);
at(TODAY + 'T18:00:00Z');
upd('Next pay date', (d) => { d.income.find((i) => i.id === 'job').nextPayDate = makeDate('2026-10-23'); });

const doc = store.doc;
writeFileSync(new URL('test/households/riley.json', root), JSON.stringify(doc, null, 1) + '\n');
console.log('Wrote riley.json: ' + doc.transactions.length + ' log entries, ' + doc.months.length + ' closed months, ' + doc.estimateLog.length + ' estimate changes, CSVs ' + csvFiles.join(', '));
console.log('Lowest checking: ' + lowChecking.amount + ' on ' + lowChecking.date + '; September Visa statement ' + octV + '; Sep-end checking ' + ends['2026-09'].chk);
console.log('Balances at each month end: ' + JSON.stringify(ends));
