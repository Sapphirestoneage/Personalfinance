/* The cash flow calendar (Level 13, MR-067). Pure. One day-by-day run from
   today out to the window's end; every calendar view is a reading of that
   one run. Built from the reference spec (cashflow v9 to v44): paydays by
   cadence or imported landings, bills on their days, cards with statement
   and due dates, the grace period (interest only when the last statement
   was not paid in full), interest on the average daily balance, late fee
   and penalty rate after a missed payment, promo rates with a reversion
   date, pay-later plans, loans through the debt simulation's arithmetic,
   transfers and the month-end sweep, maybe money three ways, the cash
   floor guard, and overrides that move one occurrence without touching the
   rule. Amounts come from the Ledger; this module owns only the timing
   (record.calendar). Eli's corrections win: the floor is the lean month
   step of the cushion, not an invented emergency formula.
   null is never zero: a line whose amount is not entered is left out and
   named in result.needs. */
import { levelPayment } from './loanmath.js';
import { hasValue, numberOf } from './states.js';
import { setSection } from './record.js';
import { monthlyOf, paychecksPerYear } from './compute.js';
import { shareOf } from './household.js';
import { isQ } from './units.js';

/* ---- dates ---- */
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
export function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } /* m is 1 to 12 */
export function clampDay(day, days) { return Math.max(1, Math.min(Math.round(day), days)); }
export const domOf = iso => parseInt(iso.slice(8, 10), 10);
export const ymOf = iso => iso.slice(0, 7);
const yOf = iso => parseInt(iso.slice(0, 4), 10), mOf = iso => parseInt(iso.slice(5, 7), 10);
export function lastDayOf(iso) { return iso.slice(0, 8) + String(dim(yOf(iso), mOf(iso))).padStart(2, '0'); }
export function weekdayOf(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }
function monthDay(y, m, day) { return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(clampDay(day, dim(y, m))).padStart(2, '0'); }
function eachMonth(startIso, endIso, fn) { let y = yOf(startIso), m = mOf(startIso); const ey = yOf(endIso), em = mOf(endIso); while (y < ey || (y === ey && m <= em)) { fn(y, m); m++; if (m > 12) { m = 1; y++; } } }
const inWindow = (d, s, e) => d >= s && d <= e;

/* Paydays by cadence from an anchor (the next payday) across a window. Weekly and biweekly step both ways
   from the anchor; semimonthly is the anchor day and the day fifteen on (the 15th and the last day when the
   anchor is the 15th or the month's end); monthly is the anchor's day, clamped to the month. */
export function paydays(cadence, anchorIso, startIso, endIso) {
  const out = [];
  if (cadence === 'weekly' || cadence === 'biweekly') {
    const step = cadence === 'weekly' ? 7 : 14;
    let d = anchorIso; while (d > startIso) d = addDays(d, -step); while (d < startIso) d = addDays(d, step);
    while (d <= endIso) { out.push(d); d = addDays(d, step); }
    return out;
  }
  const a = domOf(anchorIso);
  if (cadence === 'semimonthly') {
    const endOfMonth = a >= 28 || a === 15;
    eachMonth(startIso, endIso, (y, m) => { const n = dim(y, m); const days = endOfMonth ? [15, n] : (a > 15 ? [a - 15, a] : [a, a + 15]); days.forEach(dd => { const iso = monthDay(y, m, dd); if (inWindow(iso, startIso, endIso)) out.push(iso); }); });
    return out.sort();
  }
  eachMonth(startIso, endIso, (y, m) => { const iso = monthDay(y, m, a); if (inWindow(iso, startIso, endIso)) out.push(iso); });
  return out;
}
/* The dates one item lands on. item: { cadence: once|month|year|week|biweekly|semimonthly, date, day, month, anchor, count } */
export function occurrences(item, startIso, endIso) {
  const c = item.cadence || 'month'; let out = [];
  if (c === 'once') out = item.date && inWindow(item.date, startIso, endIso) ? [item.date] : [];
  else if (c === 'month') eachMonth(startIso, endIso, (y, m) => { const iso = monthDay(y, m, item.day || 1); if (inWindow(iso, startIso, endIso)) out.push(iso); });
  else if (c === 'year') eachMonth(startIso, endIso, (y, m) => { if (m !== (item.month || 1)) return; const iso = monthDay(y, m, item.day || 1); if (inWindow(iso, startIso, endIso)) out.push(iso); });
  else out = paydays(c === 'week' ? 'weekly' : c, item.anchor || item.date || startIso, startIso, endIso);
  if (item.from) out = out.filter(d => d >= item.from);
  if (typeof item.count === 'number') out = out.slice(0, Math.max(0, item.count - (item.done || 0)));
  return out;
}

/* ---- the record section: timing only, amounts stay in the Ledger ---- */
export function defaultCalendar() { return { version: 1, anchor: {}, dueDays: {}, cards: {}, reimb: {}, budgeted: {}, payLater: [], maybe: [], transfers: [], extras: [], overrides: {}, floorMode: 'lean', floorCents: null, guard: true, sweep: false, sweepTo: null, logs: [], checkins: [], shock: null, movable: {}, window: null, extra: null }; }
export function calendarOf(record) { return Object.assign(defaultCalendar(), JSON.parse(JSON.stringify((record && record.calendar) || {}))); }
export function setCalendar(record, fn, meta) { const next = calendarOf(record); const r = fn(next); if (r === null) return null; return setSection(record, 'calendar', next, meta); }
export function newId(prefix) { return (prefix || 'c') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---- the model: what the run reads, built from the record and the computed result ---- */
const CASH_TYPES = ['checking', 'hysa', 'savings', 'cash', 'moneyMarket', 'cd'];
const DATED_CATEGORIES = { accommodation: 1, utilities: 15, therapy: 1, insurance: 1 };
const PAY_CADENCE = { weekly: 'weekly', biweekly: 'biweekly', semimonthly: 'semimonthly', monthly: 'monthly' };
function perPeriod(monthlyCents, cadence) { return Math.round(monthlyCents * 12 / ({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[cadence] || 12)); }
function nextWeekdayFrom(iso, weekday) { let d = iso; for (let i = 0; i < 7; i++) { if (weekdayOf(d) === weekday) return d; d = addDays(d, 1); } return iso; }
const nick = (r, fallback) => r.nickname || fallback;

export function buildModel(record, result, data, opts) {
  const o = opts || {}; const start = o.start || (result && result.today) || new Date().toISOString().slice(0, 10);
  const cal = calendarOf(record); const conv = (data && data.calendar) || {};
  const cardConv = conv.cards || {}; const S = result && result.sun && result.sun.outputs; const P = record.planets; const hh = record.household || {};
  const needs = []; const model = { start, days: o.days || cal.window || conv.defaultWindowDays || 60, accounts: [], incomes: [], bills: [], cards: [], loans: [], payLater: [], transfers: [], maybe: [], extras: [], overrides: cal.overrides || {}, logs: [], floor: 0, floorSource: 'none', guard: cal.guard !== false, sweep: !!cal.sweep, sweepTo: cal.sweepTo || null, sweepKeep: (conv.sweep && conv.sweep.keepCents) || 10000, shock: cal.shock || null, needs, likelyThreshold: conv.likelyThreshold || 0.6 };
  /* cash accounts: the checking account is primary; the cushion is the linked row or an account named for it */
  const links = (record.goals && record.goals.links) || {};
  P.invest.rows.forEach(r => { const t = r.type === 'bank' ? (r.f.bankType && r.f.bankType.v) : (r.f.accountType && r.f.accountType.v); if (!CASH_TYPES.includes(t)) return; const bal = r.f.accountBalance; if (!hasValue(bal)) { needs.push({ rowId: r.id, what: nick(r, 'cash account') + ': balance' }); return; } model.accounts.push({ id: r.id, name: nick(r, t), type: t, balance: numberOf(bal), primary: false, cushion: links.cushion === r.id || /emergency|cushion|safety/i.test(r.nickname || ''), autoCover: false }); });
  if (model.accounts.length) { const ck = model.accounts.find(a => a.type === 'checking') || model.accounts[0]; ck.primary = true; if (ck.type === 'checking' && !model.accounts.some(a => a.cushion)) model.accounts.forEach(a => { if (!a.primary && ['hysa', 'savings', 'moneyMarket', 'cd'].includes(a.type)) a.cushion = true; }); const spare = model.accounts.find(a => !a.primary && a.type !== 'cd'); if (spare) spare.autoCover = true; }
  else needs.push({ rowId: null, what: 'a checking or savings account balance' });
  const primary = model.accounts.find(a => a.primary); const primaryId = primary ? primary.id : null;
  /* income: imported landings win over the cadence */
  const T = record.program && record.program.transactions; const imported = T && T.calendar && T.calendar.paydays && T.calendar.paydays.length ? T.calendar.paydays : null;
  if (imported) imported.forEach((p, i) => p.days.forEach(d => model.incomes.push({ id: 'tx-pay-' + i + '-' + d, label: p.label, cents: Math.round(p.cents / p.days.length), cadence: 'month', day: d, to: primaryId, source: 'imported', variable: false })));
  else P.income.rows.forEach(r => {
    if (!['w2', 'c1099', 'side', 'other', 'unemployment', 'rental'].includes(r.type)) return;
    const fid = r.type === 'other' ? 'otherIncome' : r.type === 'unemployment' ? 'benefitAmount' : r.type === 'rental' ? 'rentCollected' : (r.f.takeHome && hasValue(r.f.takeHome) ? 'takeHome' : 'grossPay');
    let monthly = r.f[fid] ? monthlyOf(r, fid) : null;
    if (monthly === null) { if (r.f.grossPay && hasValue(r.f.grossPay)) monthly = monthlyOf(r, 'grossPay'); else { needs.push({ rowId: r.id, what: nick(r, 'income') + ': amount' }); return; } }
    /* a W-2 take-home inferred from gross is published by the Income planet; one row carries the whole take-home when it is the only paid job */
    if (r.type === 'w2' && fid === 'grossPay' && S && isQ(S.income.takeHomeMonthly) && P.income.rows.filter(x => x.type === 'w2').length === 1) monthly = S.income.takeHomeMonthly.cents - P.income.rows.filter(x => x.type !== 'w2' && x.type !== 'benefits').reduce((s, x) => { const f = x.type === 'other' ? 'otherIncome' : x.type === 'unemployment' ? 'benefitAmount' : x.type === 'rental' ? 'rentCollected' : 'grossPay'; const m = x.f[f] ? monthlyOf(x, f) : null; return s + (m || 0); }, 0);
    if (monthly <= 0) return;
    const cadence = PAY_CADENCE[r.f.payFrequency && hasValue(r.f.payFrequency) ? r.f.payFrequency.v : (r.type === 'w2' ? 'biweekly' : 'monthly')] || 'monthly';
    const anchor = cal.anchor[r.id] || (cadence === 'monthly' ? monthDay(yOf(start), mOf(start), 1) : cadence === 'semimonthly' ? monthDay(yOf(start), mOf(start), 15) : nextWeekdayFrom(start, 5));
    model.incomes.push({ id: r.id, label: nick(r, 'Pay'), cents: perPeriod(monthly, cadence), cadence, anchor, to: primaryId, source: cal.anchor[r.id] ? 'anchor' : 'default', variable: !!(r.f.stability && r.f.stability.v === 'variable') || r.type === 'side', estimated: !cal.anchor[r.id] });
  });
  /* bills: dated lines on their day, everyday lines spread across the month; shared lines at her share, with the roommate's part landing later when a reimbursement is set */
  const cardByName = {}; P.debt.rows.filter(r => r.type === 'card').forEach(r => { cardByName[(r.nickname || '').toLowerCase()] = r.id; if (r.f.cardName && r.f.cardName.v) cardByName[String(r.f.cardName.v).toLowerCase()] = r.id; });
  const paidWithOf = r => { const pc = r.f.primaryCard && hasValue(r.f.primaryCard) ? String(r.f.primaryCard.v).toLowerCase() : null; return pc && cardByName[pc] ? cardByName[pc] : 'cash'; };
  P.spending.rows.forEach(r => {
    if (r.type === 'summary' || r.guess) return;
    if (r.type === 'savings') { const m = r.f.savingsLanding ? monthlyOf(r, 'savingsLanding') : null; if (m === null) return; const to = model.accounts.find(a => a.id !== primaryId && (r.nickname || '').toLowerCase().indexOf((a.name || '').toLowerCase().split(' ')[0]) !== -1) || null; model.transfers.push({ id: r.id, label: nick(r, 'Savings transfer'), cents: m, cadence: 'month', day: cal.dueDays[r.id] || 2, from: primaryId, to: to ? to.id : 'goals', kind: 'savings' }); return; }
    const fid = r.type === 'other' ? 'otherSpending' : 'amount';
    const f = r.f[fid]; if (!f || !hasValue(f)) { needs.push({ rowId: r.id, what: nick(r, 'spending line') + ': amount' }); return; }
    const cat = r.f.category && hasValue(r.f.category) ? r.f.category.v : 'other';
    const shared = !!(r.f.shared && r.f.shared.v); const share = shared ? shareOf(hh, r.f.myShare && typeof r.f.myShare.v === 'number' ? r.f.myShare.v : null) : 1;
    const cad = f.cad || 'month'; const monthly = monthlyOf(r, fid); if (monthly === null) return;
    const due = cal.dueDays[r.id]; const paidWith = paidWithOf(r);
    const rough = f.state === 'rough' || (f.v && typeof f.v === 'object');
    if (cad === 'year') { const [mm, dd] = typeof due === 'string' && /^\d{2}-\d{2}$/.test(due) ? due.split('-').map(Number) : [((mOf(start) + 1) % 12) + 1, 15]; model.bills.push({ id: r.id, label: nick(r, cat), cents: Math.round((numberOf(f) || monthly * 12) * share), cadence: 'year', month: mm, day: dd, paidWith, category: cat, estimated: typeof due !== 'string', variable: rough, shared }); }
    else if (typeof due === 'number' || DATED_CATEGORIES[cat] !== undefined) {
      const day = typeof due === 'number' ? due : DATED_CATEGORIES[cat];
      model.bills.push({ id: r.id, label: nick(r, cat), cents: Math.round(monthly * (shared && !cal.reimb[r.id] ? share : 1)), cadence: 'month', day, paidWith, category: cat, estimated: typeof due !== 'number', variable: rough, shared, movable: !!cal.movable[r.id] || cat === 'utilities', budgeted: !!cal.budgeted[r.id] });
      if (shared && cal.reimb[r.id]) model.incomes.push({ id: r.id + ':reimb', label: nick(r, cat) + ', roommate share', cents: Math.round(monthly * (1 - share)), cadence: 'month', day, offsetDays: cal.reimb[r.id].days || 3, to: primaryId, source: 'reimb', variable: false });
    } else model.bills.push({ id: r.id, label: nick(r, cat), cents: Math.round(monthly * share), cadence: 'spread', paidWith, category: cat, variable: rough, shared, budgeted: !!cal.budgeted[r.id] });
  });
  P.safety.rows.forEach(r => { if (r.type !== 'insurance' || !r.f.premium || !hasValue(r.f.premium)) return; if ((r.f.premium.cad || 'month') === 'paycheck') return; const m = monthlyOf(r, 'premium'); if (m === null) return; model.bills.push({ id: r.id, label: nick(r, 'Insurance'), cents: m, cadence: r.f.premium.cad === 'year' ? 'year' : 'month', day: cal.dueDays[r.id] || 1, month: ((mOf(start) + 2) % 12) + 1, paidWith: 'cash', category: 'insurance', estimated: !cal.dueDays[r.id] }); });
  /* cards and loans */
  P.debt.rows.forEach(r => {
    if (r.type === 'card') {
      const bal = r.f.balance; if (!hasValue(bal)) { needs.push({ rowId: r.id, what: nick(r, 'card') + ': balance' }); return; }
      const c = cal.cards[r.id] || {}; const apr = r.f.apr && hasValue(r.f.apr) ? numberOf(r.f.apr) : 0.2;
      const autopay = r.f.autopay && hasValue(r.f.autopay) ? r.f.autopay.v : 'none';
      const stmtDay = c.stmtDay || cardConv.statementDayDefault || 15; const graceDays = c.graceDays || cardConv.graceDaysDefault || 24;
      model.cards.push({ id: r.id, name: nick(r, 'Card'), balance: numberOf(bal), apr, promoApr: r.f.promoApr && hasValue(r.f.promoApr) ? numberOf(r.f.promoApr) : null, promoEnd: r.f.promoEnd && hasValue(r.f.promoEnd) ? r.f.promoEnd.v : null, limit: r.f.creditLimit && hasValue(r.f.creditLimit) ? numberOf(r.f.creditLimit) : null, minimum: r.f.minimum && hasValue(r.f.minimum) ? monthlyOf(r, 'minimum') : null, stmtDay, graceDays, dueDay: c.dueDay || null, payInFull: !!c.payInFull, autopay: c.autopay || autopay, goalNoInterest: !!c.goalNoInterest, lateFee: c.lateFee || cardConv.lateFeeCents || 4000, penaltyApr: c.penaltyApr || cardConv.penaltyApr || 0.2999, reportDay: c.reportDay || stmtDay, payLast: !!c.payLast, annualFee: r.f.annualFee && hasValue(r.f.annualFee) ? numberOf(r.f.annualFee) : 0, minPct: cardConv.minPct || 0.02, minFloor: cardConv.minFloorCents || 3500, revolving: c.revolving !== undefined ? !!c.revolving : (numberOf(bal) > 0 && autopay !== 'full' && autopay !== 'statement'), estimated: !c.stmtDay, movable: true });
      return;
    }
    if (['student', 'auto', 'personal', 'mortgage', 'other'].includes(r.type)) {
      const bal = r.type === 'other' ? r.f.otherDebt : r.f.balance; const payF = r.f.minimum || r.f.payment || r.f.principalInterest; const payId = r.f.minimum ? 'minimum' : r.f.payment ? 'payment' : 'principalInterest';
      if (!bal || !hasValue(bal) || !payF || !hasValue(payF)) return;
      const extra = r.type === 'mortgage' ? ['escrowTaxes', 'escrowInsurance', 'hoa', 'pmi'].reduce((s, k) => s + (r.f[k] && hasValue(r.f[k]) ? (monthlyOf(r, k) || 0) : 0), 0) : 0;
      model.loans.push({ id: r.id, name: nick(r, r.type), balance: numberOf(bal), rate: r.f.rate && hasValue(r.f.rate) ? numberOf(r.f.rate) : 0, payment: (monthlyOf(r, payId) || 0) + extra, day: cal.dueDays[r.id] || 1, estimated: !cal.dueDays[r.id], type: r.type, payLast: r.type === 'student' && (cal.studentLast !== false) });
    }
  });
  (cal.payLater || []).forEach(p => model.payLater.push(Object.assign({ paidWith: 'cash' }, p)));
  (cal.transfers || []).forEach(t => model.transfers.push(Object.assign({ cadence: 'month' }, t)));
  (cal.maybe || []).forEach(m => model.maybe.push(m));
  (cal.extras || []).forEach(x => model.extras.push(x));
  (cal.logs || []).forEach(l => { if (l.date >= start) model.logs.push(l); });
  /* the floor: the lean month step when funded, a fixed amount, or zero */
  if (cal.floorMode === 'fixed' && typeof cal.floorCents === 'number') { model.floor = cal.floorCents; model.floorSource = 'fixed'; }
  else if (cal.floorMode !== 'zero' && result && result.goalPlan && result.goalPlan.input) {
    const lean = result.goalPlan.input.items.find(i => i.id === 'lean'); const cushionCash = model.accounts.filter(a => a.cushion).reduce((s, a) => s + a.balance, 0);
    if (lean && typeof lean.targetCents === 'number' && (lean.balanceCents || 0) >= lean.targetCents) { if (cushionCash >= lean.targetCents) { model.floor = 0; model.floorSource = 'cushion-account'; model.leanTarget = lean.targetCents; } else { model.floor = lean.targetCents; model.floorSource = 'lean'; } }
    else model.floorSource = lean && typeof lean.targetCents === 'number' ? 'lean-unfunded' : 'none';
  }
  /* v44 parity: the extra at the debt, on its day, aimed by strategy; the coach's figure wins, else the goal timeline's first-month debt funding */
  const ex = (conv.extra || {}); const GP = result && result.goalPlan; let planExtra = 0;
  if (GP && GP.run && GP.run.goals && GP.input) GP.input.items.filter(i => i.type === 'debt').forEach(i => { const g = GP.run.goals[i.id]; const f = g && g.funded ? g.funded[0] : 0; planExtra += f || 0; });
  model.extra = { cents: cal.extra && typeof cal.extra.cents === 'number' ? cal.extra.cents : Math.max(0, Math.round(planExtra)), day: (cal.extra && cal.extra.day) || ex.day || 14, strategy: (cal.extra && cal.extra.strategy) || ex.strategy || 'avalanche', stopAtHi: cal.extra && cal.extra.stopAtHi !== undefined ? !!cal.extra.stopAtHi : ex.stopAtHi !== false, hiRate: ex.hiRate || 0.10, rollFreed: ex.rollFreed !== false, source: cal.extra && typeof cal.extra.cents === 'number' ? 'coach' : (planExtra > 0 ? 'goal-plan' : 'none') };
  model.everydayMonthly = model.bills.filter(b => b.cadence === 'spread').reduce((s, b) => s + b.cents, 0);
  model.realHourlyWage = result && result.metrics && result.metrics.realHourlyWage && result.metrics.realHourlyWage.status === 'ok' ? result.metrics.realHourlyWage.value.cents : null;
  model.surplusMonthly = result && result.metrics && result.metrics.surplus && result.metrics.surplus.status === 'ok' ? result.metrics.surplus.value.cents : null;
  return model;
}

/* ---- the run ---- */
function overrideFor(model, sourceId, date) { return model.overrides[sourceId + '|' + date] || null; }
/* every dated occurrence in the window as flat items, overrides applied: moves, re-prices, skips */
export function schedule(model, opts) {
  const o = opts || {}; const start = model.start; const end = addDays(start, model.days - 1); const items = [];
  const mode = o.maybeMode || 'likely';
  const wob = o.wobble || null; /* (item) -> { k, shift } for the outlook */
  const place = (src, date, base) => {
    const ov = overrideFor(model, src.id, date); if (ov && ov.skip) return;
    let d = ov && ov.date ? ov.date : date; let cents = ov && typeof ov.cents === 'number' ? ov.cents : base;
    if (wob) { const w = wob(src); if (w) { if (src.variable || src.estimated) cents = Math.round(cents * w.k); if (src.estimated && w.shift) d = addDays(d, w.shift); } }
    if (d < start || d > end) return;
    items.push(Object.assign({}, src, { date: d, cents, sourceId: src.id, moved: !!(ov && ov.date), origDate: date }));
  };
  model.incomes.forEach(inc => { const dates = inc.cadence === 'month' && inc.day ? occurrences({ cadence: 'month', day: inc.day }, start, end) : paydays(inc.cadence, inc.anchor, start, end); dates.forEach(d => { const dd = inc.offsetDays ? addDays(d, inc.offsetDays) : d; if (model.shock && dd >= model.shock.from && dd < addDays(model.shock.from, Math.round((model.shock.months || 0) * 30.44)) && inc.source !== 'reimb') return; place(Object.assign({ kind: 'income' }, inc), dd, inc.cents); }); });
  model.bills.forEach(b => { if (b.cadence === 'spread') return; occurrences(b, start, end).forEach(d => place(Object.assign({ kind: 'bill' }, b), d, b.cents)); });
  model.payLater.forEach(p => { const left = Math.max(0, (p.total || 0) - (p.paid || 0)); if (left <= 0) return; let remaining = left; const dates = occurrences({ cadence: p.freq || 'biweekly', anchor: p.nextDate, date: p.nextDate, day: domOf(p.nextDate || start) }, start, end); dates.forEach(d => { if (remaining <= 0) return; const c = Math.min(p.installment || remaining, remaining); remaining -= c; place({ id: p.id, kind: 'paylater', label: p.label, paidWith: p.paidWith || 'cash', category: 'debt' }, d, c); }); });
  model.transfers.forEach(t => occurrences({ cadence: t.cadence, day: t.day, date: t.date, anchor: t.anchor, month: t.month, count: t.count }, start, end).forEach(d => place(Object.assign({ kind: 'transfer' }, t), d, t.cents))); /* a transfer's from is an account, not a start date */
  model.extras.forEach(x => occurrences(x, start, end).forEach(d => place(Object.assign({ kind: x.direction === 'in' ? 'income' : 'bill', paidWith: x.paidWith || 'cash', category: x.category || 'other', extra: true }, x), d, x.cents)));
  model.logs.forEach(l => place({ id: l.id, kind: 'log', label: l.what || l.tag || 'Logged', paidWith: l.paidWith || 'cash', category: l.tag || 'other' }, l.date, l.cents));
  model.maybe.forEach(m => { if (mode === 'ignore') return; const p = typeof m.likelihood === 'number' ? m.likelihood : 0.5; if (mode === 'likely' && p < model.likelyThreshold) return; const c = mode === 'weighted' ? Math.round(m.cents * p) : m.cents; if (m.date >= start && m.date <= end) place({ id: m.id, kind: m.direction === 'in' ? 'income' : 'bill', label: m.label, paidWith: 'cash', category: 'maybe', maybe: true, likelihood: p }, m.date, c); });
  items.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'income' ? -1 : b.kind === 'income' ? 1 : 0));
  return items;
}

function effRate(card, date) { if (card.penaltyUntil && date <= card.penaltyUntil) return card.penaltyApr; if (card.promoApr !== null && card.promoApr !== undefined && card.promoEnd && ymOf(date) <= card.promoEnd) return card.promoApr; return card.apr; }
function minimumOf(card, stmt) { if (stmt <= 0) return 0; const m = Math.max(card.minFloor, Math.round(stmt * card.minPct)); return Math.min(stmt, card.minimum !== null && card.minimum !== undefined && card.minimum > 0 ? Math.max(card.minimum, m) : m); }

export function simulate(model, opts) {
  const o = opts || {}; const start = model.start; const days = model.days;
  const items = schedule(model, o); const byDate = {}; items.forEach(it => { (byDate[it.date] = byDate[it.date] || []).push(it); });
  const acc = {}; model.accounts.forEach(a => { acc[a.id] = { balance: a.balance, floor: a.primary ? model.floor : 0, a }; });
  const primary = model.accounts.find(a => a.primary) || null; const pid = primary ? primary.id : null;
  const cards = model.cards.map(c => Object.assign({}, c, { stmt: null, stmtDate: null, dueDate: null, cycleSum: 0, cycleDays: 0, cycleCharges: 0, cycleBudgeted: 0, stmtBudgeted: 0, interest: 0, interestByMonth: {}, lateFees: 0, penaltyUntil: null, cleared: null, everRevolved: c.revolving, statements: [], paidCycle: 0, chargedBack: 0, paid: 0, peakBeforeReport: 0 }));
  const loans = model.loans.map(l => Object.assign({}, l, { interest: 0, paid: 0, paidOff: null }));
  let freed = 0; const planTotals = {}; model.payLater.forEach(p => { planTotals[p.id] = Math.max(0, (p.total || 0) - (p.paid || 0)); }); const extraLog = [];
  const out = { start, days: [], low: null, lowByMonth: {}, firstBelowFloor: null, firstBelowZero: null, firstDryTotal: null, extra: model.extra || null, extraPaid: 0, shortfalls: [], lateFees: 0, interest: { total: 0, byCard: {}, byMonth: {} }, paychecks: [], cards: {}, loans: {}, monthly: {}, totals: { in: 0, out: 0 }, floor: model.floor, floorSource: model.floorSource, needs: model.needs, items };
  const everydayPerDay = {}; const spread = model.bills.filter(b => b.cadence === 'spread');
  let payLaterOwed = model.payLater.reduce((s, p) => s + Math.max(0, (p.total || 0) - (p.paid || 0)), 0);
  const take = (accountId, cents, label, kind, date, guarded, ev) => {
    const A = acc[accountId] || acc[pid]; if (!A) { out.shortfalls.push({ date, label, cents, reason: 'no cash account' }); return 0; }
    let avail = A.balance - (guarded && model.guard ? A.floor : -Infinity);
    if (guarded && model.guard && cents > avail) { const cover = model.accounts.find(a => a.autoCover && a.id !== accountId && acc[a.id].balance > 0); if (cover) { const pull = Math.min(cents - Math.max(0, avail), acc[cover.id].balance); if (pull > 0) { acc[cover.id].balance -= pull; A.balance += pull; ev.push({ kind: 'auto-cover', label: 'From ' + cover.name + ' for ' + label.toLowerCase(), cents: pull, account: accountId }); avail += pull; } } }
    if (cents <= avail || !guarded || !model.guard) { A.balance -= cents; ev.push({ kind, label, cents: -cents, account: accountId, guarded }); return cents; }
    const part = Math.max(0, Math.min(cents, avail));
    out.shortfalls.push({ date, label, cents: cents - part, kind });
    if (part > 0) { A.balance -= part; ev.push({ kind, label, cents: -part, account: accountId, partial: true }); }
    ev.push({ kind: 'shortfall', label, cents: -(cents - part), account: accountId });
    return part;
  };
  const give = (accountId, cents, label, kind, ev) => { const A = acc[accountId] || acc[pid]; if (A) A.balance += cents; ev.push({ kind, label, cents, account: accountId }); };
  const charge = (card, cents, label, kind, ev, budgeted) => { card.balance += cents; card.cycleCharges += cents; card.chargedBack += cents; if (budgeted) card.cycleBudgeted += cents; ev.push({ kind, label, cents: -cents, card: card.id }); };
  /* the target of an extra payment: by rate (a promo at 0% sorts last while it runs) or by balance; cards and loans marked pay-last wait while anything else is open; with stopAtHi only debts at or above the high rate */
  const targetOf = (date) => { const open = cards.filter(c => c.balance > 0 && !c.payInFull && c.autopay !== 'statement' && c.autopay !== 'full' && (c.revolving || c.everRevolved)).map(c => ({ id: c.id, kind: 'card', rate: effRate(c, date), bal: c.balance, last: !!(c.payLast || c.goalNoInterest), base: c.apr })).concat(loans.filter(l => l.balance > 0 && !l.paidOff).map(l => ({ id: l.id, kind: 'loan', rate: l.rate, bal: l.balance, last: !!l.payLast, base: l.rate }))); let pool = open; if (model.extra && model.extra.stopAtHi) { const hi = open.filter(o => o.base >= model.extra.hiRate); if (!hi.length) return null; pool = hi; } const first = pool.filter(o => !o.last); if (first.length) pool = first; if (!pool.length) return null; return (model.extra && model.extra.strategy === 'snowball') ? pool.sort((a, b) => a.bal - b.bal)[0] : pool.sort((a, b) => b.rate - a.rate)[0]; };
  const cashTotal = () => model.accounts.reduce((s, a) => s + acc[a.id].balance, 0);
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i); const ym = ymOf(date); const d = domOf(date); const n = dim(yOf(date), mOf(date)); const ev = [];
    if (everydayPerDay[ym] === undefined) everydayPerDay[ym] = spread.map(b => ({ b, cents: Math.round(b.cents / n) }));
    /* 1. scheduled movements */
    (byDate[date] || []).forEach(it => {
      if (it.kind === 'income') { give(it.to || pid, it.cents, it.label, it.maybe ? 'maybe-in' : 'income', ev); out.totals.in += it.cents; return; }
      if (it.kind === 'transfer') { const moved = take(it.from || pid, it.cents, it.label, 'transfer', date, true, ev); if (moved > 0) { if (acc[it.to]) { acc[it.to].balance += moved; ev.push({ kind: 'transfer-in', label: it.label, cents: moved, account: it.to }); } else ev.push({ kind: 'to-goals', label: it.label, cents: moved, account: 'goals' }); } return; }
      const card = it.paidWith && it.paidWith !== 'cash' ? cards.find(c => c.id === it.paidWith) : null;
      if (card) charge(card, it.cents, it.label, it.kind, ev, it.budgeted); else { take(pid, it.cents, it.label, it.kind, date, it.kind !== 'log', ev); }
      if (it.kind === 'paylater') { payLaterOwed = Math.max(0, payLaterOwed - it.cents); planTotals[it.sourceId] = Math.max(0, (planTotals[it.sourceId] || 0) - it.cents); if (planTotals[it.sourceId] === 0 && model.extra && model.extra.rollFreed) { const p = model.payLater.find(x => x.id === it.sourceId); if (p && p.installment && !p.rolled) { p.rolled = true; freed += p.freq === 'biweekly' ? Math.round(p.installment * 26 / 12) : p.freq === 'weekly' ? Math.round(p.installment * 52 / 12) : p.installment; } } }
      out.totals.out += it.cents;
    });
    everydayPerDay[ym].forEach(({ b, cents }) => { if (!cents) return; const card = b.paidWith !== 'cash' ? cards.find(c => c.id === b.paidWith) : null; if (card) charge(card, cents, b.label, 'everyday', ev, b.budgeted); else take(pid, cents, b.label, 'everyday', date, false, ev); out.totals.out += cents; });
    /* 2. statement close */
    cards.forEach(c => {
      if (d !== clampDay(c.stmtDay, n)) return;
      const adb = c.cycleDays ? c.cycleSum / c.cycleDays : c.balance; const rate = effRate(c, date);
      const interest = c.revolving && adb > 0 && !c.payInFull ? Math.round(adb * rate / 12) : 0;
      if (interest) { c.balance += interest; c.interest += interest; c.interestByMonth[ym] = (c.interestByMonth[ym] || 0) + interest; out.interest.total += interest; out.interest.byMonth[ym] = out.interest.byMonth[ym] || {}; out.interest.byMonth[ym][c.id] = (out.interest.byMonth[ym][c.id] || 0) + interest; ev.push({ kind: 'interest', label: c.name + ' interest', cents: -interest, card: c.id }); }
      c.stmt = Math.max(0, c.balance); c.stmtDate = date; c.dueDate = c.dueDay ? (() => { let due = monthDay(yOf(date), mOf(date), c.dueDay); if (due <= date) { const nm = mOf(date) === 12 ? [yOf(date) + 1, 1] : [yOf(date), mOf(date) + 1]; due = monthDay(nm[0], nm[1], c.dueDay); } return due; })() : addDays(date, c.graceDays);
      c.statements.push({ date, balance: c.stmt, interest, due: c.dueDate, charges: c.cycleCharges, adb: Math.round(adb) });
      ev.push({ kind: 'statement', label: c.name + ' statement ' + (c.stmt / 100).toFixed(0), cents: 0, card: c.id, stmt: c.stmt, due: c.dueDate });
      c.stmtBudgeted = c.cycleBudgeted; c.cycleSum = 0; c.cycleDays = 0; c.cycleCharges = 0; c.cycleBudgeted = 0; c.paidCycle = 0;
    });
    /* 3. due dates */
    cards.forEach(c => {
      if (!c.dueDate || c.dueDate !== date) return;
      const stmt = c.stmt || 0; const min = Math.min(minimumOf(c, stmt), Math.max(0, c.balance)); /* an extra payment mid-cycle can leave less than the minimum owed */
      let planned = c.autopay === 'full' ? Math.max(0, c.balance) : c.payInFull || c.autopay === 'statement' ? stmt : typeof c.autopay === 'number' ? Math.min(c.autopay, Math.max(0, c.balance)) : c.goalNoInterest ? Math.max(min, Math.min(c.balance, (c.statements.length ? c.statements[c.statements.length - 1].charges + c.statements[c.statements.length - 1].interest : stmt))) : min;
      /* v44: spending the client already budgets for is paid off with the minimum, so it never becomes debt */
      if (!c.payInFull && c.autopay !== 'statement' && c.autopay !== 'full' && c.stmtBudgeted > 0) planned = Math.min(Math.max(0, c.balance), planned + c.stmtBudgeted);
      planned = Math.min(planned, Math.max(0, c.balance));
      let paid = 0;
      if (planned > 0) {
        const A = acc[pid]; const coverable = model.accounts.filter(a => a.autoCover && a.id !== pid).reduce((s, a) => s + Math.max(0, acc[a.id].balance), 0); const avail = A ? A.balance - (model.guard ? A.floor : -Infinity) + coverable : 0;
        if (!model.guard || planned <= avail) paid = take(pid, planned, c.name + ' payment', 'card-payment', date, true, ev);
        else if (min <= avail) paid = take(pid, min, c.name + ' minimum', 'card-payment', date, true, ev);
        else out.shortfalls.push({ date, label: c.name + ' minimum', cents: min, kind: 'card-payment', missed: true }); /* v44: a payment that cannot be funded is not made at all */
      }
      c.balance -= paid; c.paid += paid; c.paidCycle += paid;
      const inFull = paid >= stmt - 1 || c.balance <= 0;
      if (stmt > 0 && paid < min) { c.lateFees += c.lateFee; c.balance += c.lateFee; out.lateFees += c.lateFee; const until = addDays(date, Math.round(((o.penaltyMonths || 6)) * 30.44)); c.penaltyUntil = until; ev.push({ kind: 'late-fee', label: c.name + ' late fee', cents: -c.lateFee, card: c.id }); }
      const wasRevolving = c.revolving;
      c.revolving = !inFull && stmt > 0;
      if (c.revolving) c.everRevolved = true;
      if (wasRevolving && !c.revolving && c.cleared === null) c.cleared = date;
      if (!c.everRevolved && c.cleared === null) c.cleared = start;
      c.dueDate = null;
    });
    /* 4a. the extra at the debt on its day (v44): strategy target, guarded by the floor, with what finished plans freed */
    if (model.extra && (model.extra.cents > 0 || freed > 0) && d === clampDay(model.extra.day, n)) {
      let left = model.extra.cents + freed; let guard = 0;
      while (left > 0 && guard++ < 20) { const t = targetOf(date); if (!t) break; const want = Math.min(left, t.bal); const paid = take(pid, want, 'Extra to ' + (t.kind === 'card' ? cards.find(c => c.id === t.id).name : loans.find(l => l.id === t.id).name), 'extra-payment', date, true, ev); if (paid <= 0) break; if (t.kind === 'card') { const c = cards.find(x => x.id === t.id); c.balance -= paid; c.paid += paid; c.paidCycle += paid; } else { const l = loans.find(x => x.id === t.id); l.balance -= paid; l.paid += paid; if (l.balance <= 0) { l.balance = 0; l.paidOff = date; if (model.extra.rollFreed) freed += l.payment; } } out.extraPaid += paid; extraLog.push({ date, to: t.id, cents: paid }); left -= paid; }
    }
    /* 4. loans on their day */
    loans.forEach(l => { if (l.paidOff || d !== clampDay(l.day, n)) return; const int = Math.round(l.balance * l.rate / 12); l.balance += int; l.interest += int; const pay = Math.min(l.payment, l.balance); const paid = take(pid, pay, l.name + ' payment', 'loan-payment', date, true, ev); l.balance -= paid; l.paid += paid; if (l.balance <= 0) { l.balance = 0; l.paidOff = date; if (model.extra && model.extra.rollFreed && !l.rolled) { l.rolled = true; freed += l.payment; } } });
    /* 5. auto-cover: a spare account tops the primary back up to the floor */
    if (pid && acc[pid].balance < acc[pid].floor) { const cover = model.accounts.find(a => a.autoCover && acc[a.id].balance > 0); if (cover) { const need = Math.min(acc[pid].floor - acc[pid].balance, acc[cover.id].balance); if (need > 0) { acc[cover.id].balance -= need; acc[pid].balance += need; ev.push({ kind: 'auto-cover', label: 'From ' + cover.name, cents: need, account: pid }); } } }
    /* 6. month-end sweep */
    if (model.sweep && pid && date === lastDayOf(date)) { const excess = acc[pid].balance - acc[pid].floor - model.sweepKeep; if (excess > 0) { acc[pid].balance -= excess; const to = model.sweepTo && acc[model.sweepTo] ? model.sweepTo : null; if (to) acc[to].balance += excess; ev.push({ kind: 'sweep', label: 'Month-end sweep', cents: -excess, account: pid, to: to || 'goals' }); } }
    /* the day's record */
    cards.forEach(c => { if (c.balance <= 0 && !c.zeroDate && i > 0) c.zeroDate = date; c.cycleSum += Math.max(0, c.balance); c.cycleDays++; if (c.reportDay && d <= c.reportDay && c.balance > c.peakBeforeReport) c.peakBeforeReport = c.balance; });
    const balances = {}; model.accounts.forEach(a => { balances[a.id] = acc[a.id].balance; });
    const cash = cashTotal(); const cardDebt = cards.reduce((s, c) => s + Math.max(0, c.balance), 0); const loanDebt = loans.reduce((s, l) => s + l.balance, 0);
    const day = { date, dom: d, index: i, balances, cash, primary: pid ? acc[pid].balance : cash, cardDebt, loanDebt, payLater: payLaterOwed, debt: cardDebt + loanDebt + payLaterOwed, events: ev, in: ev.filter(e => e.cents > 0 && e.kind !== 'transfer-in' && e.kind !== 'auto-cover').reduce((s, e) => s + e.cents, 0), out: ev.filter(e => e.cents < 0 && e.kind !== 'shortfall' && e.kind !== 'statement').reduce((s, e) => s - e.cents, 0) };
    out.days.push(day);
    if (!out.low || day.primary < out.low.cents) out.low = { date, cents: day.primary, index: i };
    if (!out.lowByMonth[ym] || day.primary < out.lowByMonth[ym].cents) out.lowByMonth[ym] = { date, cents: day.primary };
    if (out.firstBelowFloor === null && day.primary < model.floor) out.firstBelowFloor = date;
    if (out.firstBelowZero === null && day.primary < 0) out.firstBelowZero = date;
    if (out.firstDryTotal === null && cash < model.floor) out.firstDryTotal = date;
    const mo = out.monthly[ym] = out.monthly[ym] || { in: 0, out: 0, net: 0, low: null, interest: 0 }; mo.in += day.in; mo.out += day.out; mo.net = mo.in - mo.out; mo.low = out.lowByMonth[ym].cents; mo.interest = Object.values(out.interest.byMonth[ym] || {}).reduce((s, v) => s + v, 0);
  }
  cards.forEach(c => { out.interest.byCard[c.id] = c.interest; out.cards[c.id] = { name: c.name, balance: c.balance, revolving: c.revolving, cleared: c.cleared, interest: c.interest, interestByMonth: c.interestByMonth, lateFees: c.lateFees, statements: c.statements, paid: c.paid, chargedBack: c.chargedBack, netPaydown: c.paid - c.chargedBack - c.interest, startBalance: model.cards.find(x => x.id === c.id).balance, limit: c.limit, peakBeforeReport: c.peakBeforeReport, penaltyUntil: c.penaltyUntil, payInFull: c.payInFull, zeroDate: c.zeroDate || null }; });
  loans.forEach(l => { out.loans[l.id] = { name: l.name, balance: l.balance, interest: l.interest, paid: l.paid, paidOff: l.paidOff }; });
  out.safeToSpend = safeToSpend(model, out);
  out.paychecks = paycheckMap(model, out);
  out.end = out.days.length ? out.days[out.days.length - 1] : null;
  out.everydayPerDay = Math.round(model.everydayMonthly / 30.44); out.extraLog = extraLog;
  return out;
}

/* Safe to spend: cash outside the cushion, minus everything committed before the next income, minus the floor. Per day too. */
export function safeToSpend(model, run) {
  const cushionIds = model.accounts.filter(a => a.cushion).map(a => a.id);
  const days = run.days; const incomeIdx = days.map((d, i) => d.events.some(e => e.kind === 'income') ? i : -1).filter(i => i >= 0);
  const byDay = days.map((d, i) => {
    const next = incomeIdx.find(k => k > i); const until = next === undefined ? days.length : next;
    let committed = 0; for (let k = i + 1; k < until; k++) days[k].events.forEach(e => { if (e.cents < 0 && !e.card && e.kind !== 'shortfall' && e.kind !== 'statement') committed -= e.cents; });
    const cash = Object.keys(d.balances).filter(id => !cushionIds.includes(id)).reduce((s, id) => s + d.balances[id], 0);
    return { date: d.date, cents: cash - committed - model.floor, committed, nextIncome: next === undefined ? null : days[next].date };
  });
  return { today: byDay[0] ? byDay[0].cents : null, committed: byDay[0] ? byDay[0].committed : null, nextIncome: byDay[0] ? byDay[0].nextIncome : null, byDay, excludesCushion: cushionIds.length > 0 };
}
/* Each paycheck and the cash outflows it funds until the next one. */
export function paycheckMap(model, run) {
  const days = run.days; const pays = [];
  days.forEach((d, i) => d.events.filter(e => e.kind === 'income' && !e.maybe).forEach(e => pays.push({ date: d.date, index: i, label: e.label, cents: e.cents, bills: [], left: e.cents })));
  pays.forEach((p, k) => { const to = k + 1 < pays.length ? pays[k + 1].index : days.length; let everyday = 0; for (let i = p.index; i < to; i++) days[i].events.forEach(e => { if (e.cents < 0 && !e.card && e.kind !== 'shortfall' && e.kind !== 'statement') { if (e.kind === 'everyday') everyday -= e.cents; else p.bills.push({ date: days[i].date, label: e.label, cents: -e.cents, kind: e.kind }); } }); if (everyday) p.bills.push({ date: p.date, label: 'Everyday spending', cents: everyday, kind: 'everyday' }); p.left = p.cents - p.bills.reduce((s, b) => s + b.cents, 0); p.until = to < days.length ? days[to].date : null; });
  return pays;
}
/* Maybe money three ways: ignore it, count what is likely, weight it. */
export function threeWays(model, opts) { const o = opts || {}; const r = {}; ['ignore', 'likely', 'weighted'].forEach(m => { const run = simulate(model, Object.assign({}, o, { maybeMode: m })); r[m] = { low: run.low, end: run.end ? run.end.primary : null, shortfalls: run.shortfalls.length }; }); return r; }

/* ---- features ---- */
/* Can I spend this: amount, date, paid with; yes, tight or no, with the new low point, hours of work, interest on a carried card, the goal it delays. */
export function canISpend(model, q, opts) {
  const base = simulate(model, opts); const date = q.date || model.start;
  const m2 = Object.assign({}, model, { extras: model.extras.concat([{ id: 'ask', label: q.label || 'This purchase', cadence: 'once', date, cents: q.cents, direction: 'out', paidWith: q.paidWith || 'cash' }]) });
  const run = simulate(m2, opts); const weekOfEveryday = Math.round(model.everydayMonthly * 7 / 30.44);
  const newShort = run.shortfalls.length > base.shortfalls.length;
  const verdict = newShort || run.low.cents < model.floor ? 'no' : run.low.cents < model.floor + weekOfEveryday ? 'tight' : 'yes';
  const card = q.paidWith && q.paidWith !== 'cash' ? model.cards.find(c => c.id === q.paidWith) : null;
  const interest = card && card.revolving ? Math.round(q.cents * card.apr) : 0;
  const hours = model.realHourlyWage ? Math.round(q.cents / model.realHourlyWage * 10) / 10 : null;
  const delayDays = model.surplusMonthly && model.surplusMonthly > 0 ? Math.round(q.cents / (model.surplusMonthly / 30.44)) : null;
  return { verdict, lowBefore: base.low, lowAfter: run.low, safeBefore: base.safeToSpend.today, safeAfter: run.safeToSpend.today, interest, interestNote: card ? (card.revolving ? 'if it rides on ' + card.name + ' for a year at its rate' : card.name + ' is paid in full, so no interest') : null, hours, delayDays, shortfalls: run.shortfalls.slice(base.shortfalls.length) };
}
/* Bill timing fixer: which due-date moves raise the lowest point most. Cards move by their statement day; utilities and lines marked movable move by their day. */
export function billTimingFixes(model, opts) {
  const base = simulate(model, opts); const fixes = [];
  const tryModel = (mut, label, from, to, kind, id) => { const m2 = JSON.parse(JSON.stringify(model)); mut(m2); const r = simulate(m2, opts); const gain = r.low.cents - base.low.cents; if (gain > 0) fixes.push({ id, kind, label, from, to, lowBefore: base.low, lowAfter: r.low, gain, shortfallsBefore: base.shortfalls.length, shortfallsAfter: r.shortfalls.length, script: 'Hi, I would like to move the due date on my ' + label.toLowerCase() + ' to the ' + ordinal(to) + ' of the month.' }); };
  const candidates = model.bills.filter(b => b.cadence === 'month' && b.movable).concat(model.cards);
  candidates.forEach(c => { const isCard = !!c.stmtDay; const from = isCard ? (c.dueDay || clampDay(c.stmtDay + c.graceDays - 1, 31)) : c.day; for (let day = 1; day <= 28; day += 3) { if (day === from) continue; tryModel(m2 => { if (isCard) { const cc = m2.cards.find(x => x.id === c.id); cc.dueDay = day; cc.stmtDay = ((day - c.graceDays - 1 + 62) % 31) + 1; } else { m2.bills.find(x => x.id === c.id).day = day; } }, isCard ? c.name : c.label, from, day, isCard ? 'card' : 'bill', c.id); } });
  const best = {}; fixes.forEach(f => { if (!best[f.id] || f.gain > best[f.id].gain) best[f.id] = f; });
  return { base: { low: base.low, shortfalls: base.shortfalls.length }, fixes: Object.values(best).sort((a, b) => b.gain - a.gain).slice(0, 3), tried: candidates.length };
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
/* Outlook: the window run many times with amounts wobbling and estimated dates shifting. Deterministic by seed. */
export function outlook(model, opts) {
  const o = opts || {}; const runs = o.runs || 200; const w = o.wobble === undefined ? 0.15 : o.wobble; const shift = o.shift === undefined ? 2 : o.shift; let seed = (o.seed || 13) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lows = [], ends = [], ints = []; let below = 0; const perDay = o.band ? [] : null;
  for (let r = 0; r < runs; r++) {
    const ks = {}; const wob = item => { if (!ks[item.id]) ks[item.id] = { k: 1 + (rnd() * 2 - 1) * w, shift: Math.round((rnd() * 2 - 1) * shift) }; return ks[item.id]; };
    const run = simulate(model, Object.assign({}, o, { wobble: wob }));
    lows.push(run.low.cents); ends.push(run.end ? run.end.primary : 0); ints.push(run.interest.total); if (run.low.cents < model.floor || run.shortfalls.length) below++;
    if (perDay) run.days.forEach((d, i) => { (perDay[i] = perDay[i] || []).push(d.primary); });
  }
  const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
  return { runs, wobble: w, low: { worst: pct(lows, 0.1), typical: pct(lows, 0.5), best: pct(lows, 0.9) }, end: { worst: pct(ends, 0.1), typical: pct(ends, 0.5), best: pct(ends, 0.9) }, interest: { low: pct(ints, 0.1), typical: pct(ints, 0.5), high: pct(ints, 0.9) }, shareBelowFloor: Math.round(below / runs * 1000) / 1000, band: perDay ? perDay.map(a => ({ lo: pct(a, 0.1), hi: pct(a, 0.9) })) : null };
}
/* Income shock: pause income for N months from a date; runway and the bills at risk first. */
export function incomeShock(model, q, opts) {
  const m2 = Object.assign({}, model, { shock: { from: q.from || model.start, months: q.months || 3 }, days: Math.max(model.days, Math.round((q.months || 3) * 30.44) + 30) });
  const run = simulate(m2, opts); const firstBad = run.firstBelowFloor || run.firstBelowZero;
  const atRisk = []; run.days.forEach(d => { if (firstBad && d.date >= firstBad) d.events.forEach(e => { if ((e.kind === 'bill' || e.kind === 'shortfall' || e.kind === 'card-payment' || e.kind === 'loan-payment') && atRisk.length < 6 && !atRisk.some(x => x.label === e.label)) atRisk.push({ date: d.date, label: e.label, cents: Math.abs(e.cents) }); }); });
  return { from: m2.shock.from, months: m2.shock.months, runwayDays: firstBad ? daysBetween(model.start, firstBad) : null, firstBad, low: run.low, atRisk, shortfalls: run.shortfalls };
}
/* A life event template as dated items, from its day; nothing is written until the coach confirms. */
export function lifeEventItems(template, dateIso) {
  return template.items.map((it, i) => Object.assign({ id: newId('ev'), template: template.id }, it, { cadence: it.cadence === 'once' ? 'once' : it.cadence, date: addDays(dateIso, it.offsetDays || 0), anchor: addDays(dateIso, it.offsetDays || 0), day: domOf(addDays(dateIso, it.offsetDays || 0)), from: addDays(dateIso, it.offsetDays || 0), count: it.count, direction: it.direction, likelihood: it.likelihood }));
}
/* Spend pace per tag this month: budget from the Ledger line, spent from the logs, what is left and the daily pace to stay inside. */
export function spendPace(model, result, cal, todayIso) {
  const S = result && result.sun && result.sun.outputs; const cats = (S && S.spending.byCategory) || {}; const ym = ymOf(todayIso); const d = domOf(todayIso); const n = dim(yOf(todayIso), mOf(todayIso));
  const prevYm = addDays(ym + '-01', -1).slice(0, 7);
  const tags = Object.keys(cats).filter(c => cats[c] && cats[c].cents > 0);
  return tags.map(tag => {
    const budget = cats[tag].cents; const logs = (cal.logs || []).filter(l => (l.tag || 'other') === tag);
    const spent = logs.filter(l => l.date.slice(0, 7) === ym).reduce((s, l) => s + l.cents, 0);
    const lastBySameDay = logs.filter(l => l.date.slice(0, 7) === prevYm && domOf(l.date) <= d).reduce((s, l) => s + l.cents, 0);
    const left = budget - spent; const daysLeft = n - d + 1; const perDay = Math.max(0, Math.round(left / daysLeft));
    return { tag, budget, spent, left, perDay, daysLeft, lastBySameDay, hot: spent > Math.round(budget * d / n) && spent > 0, logged: logs.length };
  });
}
/* Card helpers for the card drawer. */
export function utilizationCheck(card, run, warn) { const c = run.cards[card.id]; if (!c || !card.limit) return null; const peak = Math.max(c.peakBeforeReport, c.balance, card.balance); const u = peak / card.limit; return { peak, limit: card.limit, utilization: Math.round(u * 1000) / 1000, warn: u > (warn || 0.3) }; }
export function whichCard(model, run, q, cardsLib) {
  return model.cards.map(c => {
    const lib = cardsLib && cardsLib.cards ? cardsLib.cards.find(x => x.name && c.name.toLowerCase().indexOf(x.name.toLowerCase()) !== -1) : null;
    const earn = lib && lib.earn ? (lib.earn[q.category] || lib.earn.other || 1) : 1; const pv = lib && lib.pointValueCents ? lib.pointValueCents : 1;
    const rewards = Math.round(q.cents * earn * pv / 100);
    const st = run.cards[c.id]; const interest = st && st.revolving ? Math.round(q.cents * c.apr / 12) : 0;
    const nextStmt = st && st.statements.length ? null : null;
    const nextStatement = run.days.find(d => d.events.some(e => e.kind === 'statement' && e.card === c.id)); const freeDays = !(st && st.revolving) && nextStatement ? daysBetween(model.start, nextStatement.events.find(e => e.kind === 'statement' && e.card === c.id).due) : 0;
    const util = utilizationCheck(c, run, 0.3);
    return { id: c.id, name: c.name, rewards, interest, net: rewards - interest, interestFreeDays: freeDays, utilizationWarn: util ? util.warn : false, revolving: !!(st && st.revolving), nextStmt };
  }).sort((a, b) => b.net - a.net);
}
export function balanceTransfer(q) {
  /* q: { balance, apr, feeShare, promoMonths, postApr, payment } : interest skipped during the promo vs the fee, with the payoff by month */
  const fee = Math.round(q.balance * (q.feeShare || 0.03)); const months = q.promoMonths || 18; const pay = q.payment || Math.round(q.balance / months);
  let bal = q.balance, keptInterest = 0, movedBal = q.balance + fee, movedInterest = 0;
  for (let m = 1; m <= months; m++) { const i = Math.round(bal * q.apr / 12); keptInterest += i; bal = Math.max(0, bal + i - pay); const i2 = m > months ? Math.round(movedBal * (q.postApr || q.apr) / 12) : 0; movedInterest += i2; movedBal = Math.max(0, movedBal + i2 - pay); }
  return { fee, interestSkipped: keptInterest, netSaving: keptInterest - fee - movedInterest, worthIt: keptInterest > fee + movedInterest, balanceLeftAfterPromo: movedBal, months, payment: pay };
}
/* Weekly check-in: what was due since the last one, and the drift across check-ins read as a lean or as noise. */
export function dueSince(run, sinceIso, untilIso) { const out = []; run.days.forEach(d => { if (d.date <= sinceIso || d.date > untilIso) return; d.events.forEach(e => { if (['bill', 'card-payment', 'loan-payment', 'paylater', 'income', 'transfer'].includes(e.kind)) out.push({ date: d.date, label: e.label, cents: e.cents, kind: e.kind }); }); }); return out; }
export function drift(checkins) {
  const misses = (checkins || []).map(c => { const ids = Object.keys(c.actual || {}); return ids.reduce((s, id) => s + ((c.actual[id] || 0) - ((c.forecast || {})[id] || 0)), 0); });
  if (misses.length < 2) return { count: misses.length, mean: misses[0] || null, sd: null, kind: misses.length ? 'first' : 'none' };
  const mean = Math.round(misses.reduce((s, x) => s + x, 0) / misses.length); const sd = Math.round(Math.sqrt(misses.reduce((s, x) => s + (x - mean) * (x - mean), 0) / misses.length));
  return { count: misses.length, mean, sd, kind: Math.abs(mean) > sd ? 'bias' : 'noise' };
}
/* Agenda: the next N days grouped by day. */
export function agenda(run, days) { return run.days.slice(0, days || 14).map(d => ({ date: d.date, events: d.events.filter(e => e.kind !== 'everyday' && e.kind !== 'statement' || e.kind === 'statement'), primary: d.primary })).filter(d => d.events.length); }
/* The year strip: twelve months with the low point of each and the tight ones. */
export function yearStrip(model, opts) { const m2 = Object.assign({}, model, { days: 366 }); const run = simulate(m2, opts); return { months: Object.keys(run.monthly).map(ym => ({ ym, low: run.monthly[ym].low, in: run.monthly[ym].in, out: run.monthly[ym].out, net: run.monthly[ym].net, tight: run.monthly[ym].low < model.floor + Math.round(model.everydayMonthly * 7 / 30.44) })), floor: model.floor }; }
/* The level-payment installment of a pay-later plan with interest, for the editor. */
export function payLaterInstallment(total, apr, count) { return levelPayment(total, apr || 0, count || 4); }
export { levelPayment };

/* Why a card is taking so long (v44 stuckReason): the minimum under the interest, spending charged back on, payments starved by the floor, the everyday card paid last, or just slow. */
export function whyStuck(model, run, cardId) {
  const c = model.cards.find(x => x.id === cardId); const st = run.cards[cardId]; if (!c || !st) return null;
  const monthlyInterest = Math.round(c.balance * effRate(c, model.start) / 12); const min = minimumOf(c, c.balance);
  const months = Math.max(1, run.days.length / 30.44); const charged = st.chargedBack / months; const paid = st.paid / months;
  if (!st.revolving && c.balance > 0 && !st.cleared) return { code: 'float', text: c.name + ' is paid in full every statement; nothing to fix.' };
  if (st.cleared && st.cleared <= run.start) return { code: 'clear', text: c.name + ' is not revolving.' };
  if (min <= monthlyInterest) return { code: 'rate', text: 'The minimum of ' + (min / 100).toFixed(0) + ' dollars is less than the ' + (monthlyInterest / 100).toFixed(0) + ' dollars of interest it charges a month, so the balance can only grow. Raise what goes to this card, or aim the extra at it.', minimum: min, interest: monthlyInterest };
  if (charged > 50 && charged > paid - monthlyInterest) return { code: 'spending', text: 'About ' + Math.round(charged / 100) + ' dollars a month goes back on it and about ' + Math.round(paid / 100) + ' is paid. After ' + Math.round(monthlyInterest / 100) + ' of interest it goes backwards. If that spending is already in the budget, mark the lines as budgeted and the payment covers them.', charged, paid, interest: monthlyInterest };
  if (run.shortfalls.some(s => s.kind === 'card-payment' || s.kind === 'extra-payment')) return { code: 'starved', text: 'Payments are being held back by the floor; see the shortfalls.' };
  if (c.goalNoInterest || c.payLast) return { code: 'last', text: 'It is the everyday card, so it is paid last; nothing extra reaches it inside the window.' };
  return { code: 'slow', text: 'Not enough reaches it to clear inside the window at this pace.', charged, paid, interest: monthlyInterest };
}
/* The target solver (v44 solvePayoff): the extra a month that clears one card, or every card, by a date; says when it already does, or when no amount up to $600 a month can. */
export function solvePayoff(model, target, byDate, opts) {
  const days = Math.max(model.days, daysBetween(model.start, byDate) + 31);
  const run = extra => { const m2 = Object.assign({}, model, { days, extra: Object.assign({ day: 14, strategy: 'avalanche', hiRate: 0.10, rollFreed: true }, model.extra || {}, { cents: extra, stopAtHi: false }) }); const r = simulate(m2, opts); const clearedOf = id => { const c = r.cards[id]; if (c) return c.balance <= 0 && c.zeroDate ? c.zeroDate : (c.cleared && c.cleared > model.start ? c.cleared : null); const l = r.loans[id]; return l ? l.paidOff : null; }; /* paid off means the balance is gone, the day it goes */ const date = target === 'all' ? (() => { const ds = model.cards.filter(c => !c.payInFull && c.balance > 0).map(c => clearedOf(c.id)).concat(model.loans.map(l => clearedOf(l.id))); return ds.some(x => !x) ? null : ds.sort().pop(); })() : clearedOf(target); return { date, run: r }; };
  const base = run(model.extra ? model.extra.cents : 0); const ok = x => x.date && x.date <= byDate;
  if (ok(base)) return { already: true, need: model.extra ? model.extra.cents : 0, date: base.date, breaksCash: base.run.shortfalls.length > 0 };
  const top = run(60000); if (!ok(top)) return { impossible: true, best: top.date, breaksCash: top.run.shortfalls.length > 0 };
  let lo = model.extra ? model.extra.cents : 0, hi = 60000, best = top;
  for (let i = 0; i < 14; i++) { const mid = Math.round((lo + hi) / 2 / 500) * 500; const r = run(mid); if (ok(r)) { hi = mid; best = r; } else lo = mid; if (hi - lo <= 500) break; }
  return { need: hi, date: best.date, breaksCash: best.run.shortfalls.length > 0, shortfalls: best.run.shortfalls.length };
}
