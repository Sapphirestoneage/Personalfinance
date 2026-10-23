// The cash flow calendar (S-200): the month's money on the days it moves.
// Paychecks on their pay dates (weekly and biweekly count from the first pay
// date; monthly and less often land on the day paid), each bill on the day it
// is paid, each minimum on its due day, a subscription on the day it charges,
// promo rates ending, income and expenses starting and ending, estimated tax
// dates and the return date, and coverage or situation changes. Anything with
// no day is listed as "sometime this month", never dropped and never put on a
// made-up day. The month's cash at its end comes from the projection.
//
// calendar(spine, rules, { from, months, mode }) ->
//   { asOf, mode, from, months: [{ ym, days: [{ date, events, in, out }], undated: [events],
//     in, out, net, cash: { value, kind, note, path }, events, kind, rough, missing }], rules }
// An event: { id, date (YYYY-MM-DD or null), day, kind, label, amount (positive, or null),
//   direction: in | out | null, rough (the day or the amount is a guess), note, path, source }.
// Event kinds: pay, bill, subscription, debt, saving, setAside, promoEnds, estimatedTax,
//   taxReturn, incomeStarts, incomeEnds, expenseStarts, expenseEnds, coverage, situation.

import { valueOf as v, tracker, round2, monthKey, monthStart, monthEnd, addMonths, addDays, toDay, fromDay, dayIn, daysInMonth, isFact } from './spine.js';
import { cashflow, streamWeight } from './cashflow.js';
import { cashsim } from './cashsim.js';
import { promoDeadlines } from './debt.js';
import { yearTax } from './tax.js';
import { nextCharge, isSubscription } from './subscriptions.js';
import { shareOf, coverOf } from './sharing.js';
import { balanceSheet } from './networth.js';
import { money } from '../src/ui/format.js';

const STEP = { weekly: 7, biweekly: 14 };
const roughFact = (f) => !f || f.kind !== 'known';

// Pay dates of a weekly or biweekly stream inside month ym, counted from its start.
export function payDatesIn(start, cadence, end, ym) {
  const step = STEP[cadence];
  if (!step || !start) return [];
  const lo = toDay(monthStart(ym)), hi = Math.min(toDay(monthEnd(ym)), end ? toDay(end) : Infinity);
  const out = [];
  let d = toDay(start);
  if (d < lo) d += Math.ceil((lo - d) / step) * step;
  for (; d <= hi; d += step) out.push(fromDay(d));
  return out;
}

// One month of events.
function monthEvents(spine, rules, ym, { mode, asOf, taxCache, schedule }) {
  const year = +ym.slice(0, 4);
  const t = tracker();
  const cf = cashflow(spine, rules, ym, { mode, taxCache, schedule });
  const events = [];
  const add = (e) => events.push({ amount: null, direction: null, rough: false, note: null, path: null, counted: true, ...e, amount: e.amount === null || e.amount === undefined ? null : round2(e.amount) });
  const inMonth = (iso) => !!iso && iso.slice(0, 7) === ym;
  const first = monthStart(ym), last = monthEnd(ym);

  // ------------------------------------------------------------ pay
  // What lands from each paycheck: its gross less its tax withheld, Social
  // Security and Medicare, and its share of payroll saving (split across W-2
  // pay by gross, as the money flow does), so the month adds up to take-home.
  const w2Gross = cf.income.streams.filter((x) => x.included && x.type === 'w2').reduce((x, y) => x + (y.gross || 0), 0);
  const payroll = cf.saving.payroll.value || 0;
  for (const st of cf.income.streams) {
    if (!st.included || !st.gross) continue;
    const s = (spine.income || []).find((x) => x.id === st.id);
    const base = 'income.' + s.id;
    const path = base + '.amount';
    t.useFact(path, s.amount);
    const w = streamWeight(s, mode) ?? 1;
    const likely = w < 1 ? ' (' + Math.round(w * 100) + '% likely)' : '';
    const deducted = s.type === 'w2' && w2Gross > 0 ? payroll * st.gross / w2Gross : 0;
    const net = st.takeHome === null ? null : round2(st.takeHome - deducted);
    const amountRough = roughFact(s.amount);
    const perPay = (n) => (net === null ? null : net / n);
    const common = { kind: 'pay', label: s.label + likely, direction: 'in', path, id: 'pay:' + s.id, sourceId: s.id, repeats: s.cadence !== 'once', movable: true, note: deducted ? 'after tax, Social Security and Medicare, and ' + money(deducted) + ' saved from pay' : 'after tax', gross: st ? round2(st.gross) : null, withheld: st ? round2(st.withheld) : null, fica: st ? round2(st.fica) : null, saved: round2(deducted) };
    if (s.cadence === 'once') { add({ ...common, date: s.start, amount: net, rough: amountRough }); continue; }
    if (STEP[s.cadence]) {
      const dates = payDatesIn(s.start, s.cadence, s.end, ym);
      if (!dates.length) { add({ ...common, date: null, amount: net, rough: amountRough, note: 'no pay date falls in this month' }); continue; }
      // One paycheck: the stream's net per dollar of gross, times the gross of one pay.
      const each = v(s.amount) === null || !st.gross ? null : v(s.amount) * w * net / st.gross;
      const perPayGross = v(s.amount) === null ? null : v(s.amount) * w;
      const share = st && st.gross ? perPayGross / st.gross : null;
      for (const d of dates) add({ ...common, date: d, amount: each, rough: amountRough, note: 'counted from the first pay date; ' + common.note, gross: perPayGross, withheld: share !== null ? round2(st.withheld * share) : null, fica: share !== null ? round2(st.fica * share) : null, saved: share !== null ? round2(deducted * share) : null });
      continue;
    }
    const day = s.payDay ? t.useFact(base + '.payDay', s.payDay) : null;
    if (day === null) { add({ ...common, date: null, amount: net, rough: amountRough, note: s.cadence === 'total' ? 'a total spread over its months' : 'day paid not entered' }); continue; }
    const dayRough = roughFact(s.payDay);
    if (s.cadence === 'semimonthly') {
      const d2 = Math.min(day + 15, daysInMonth(year, +ym.slice(5, 7)));
      const half = { gross: common.gross === null ? null : round2(common.gross / 2), withheld: common.withheld === null ? null : round2(common.withheld / 2), fica: common.fica === null ? null : round2(common.fica / 2), saved: round2(common.saved / 2) };
      add({ ...common, ...half, date: dayIn(ym, day), amount: perPay(2), rough: amountRough || dayRough });
      add({ ...common, ...half, date: dayIn(ym, d2), amount: perPay(2), rough: amountRough || dayRough, note: 'the second pay of the month, 15 days after the first' });
    } else add({ ...common, date: dayIn(ym, day), amount: net, rough: amountRough || dayRough, note: s.cadence === 'monthly' ? null : 'counted as its monthly share' });
  }

  // ------------------------------------------------------------ bills and subscriptions
  for (const it of cf.expenses.items) {
    if (it.covered) continue;
    const e = (spine.expenses || []).find((x) => x.id === it.id);
    const base = 'expenses.' + e.id, path = base + '.amount';
    t.useFact(path, e.amount);
    const sh = shareOf(spine, e);
    const amountRough = roughFact(e.amount) || (sh.rough || []).length > 0;
    const yours = it.amount;
    if (isSubscription(e)) {
      // A subscription charges its whole amount on its day (a yearly one once a year).
      const renews = e.renews ? t.useFact(base + '.renews', e.renews) : null;
      const charge = v(e.amount) === null ? null : (sh.shared && sh.share !== null ? v(e.amount) * sh.share : v(e.amount));
      const next = renews ? nextCharge(renews, e.cadence, first) : null;
      if (next && inMonth(next)) add({ id: 'sub:' + e.id, sourceId: e.id, repeats: true, movable: true, kind: 'subscription', label: e.label, date: next, amount: charge, direction: 'out', rough: amountRough || roughFact(e.renews), path });
      else if (!renews) add({ id: 'sub:' + e.id, sourceId: e.id, repeats: true, kind: 'subscription', label: e.label, date: null, amount: yours, direction: 'out', rough: true, note: 'next charge date not entered', path });
      // A charge in another month: nothing this month; the monthly share is in the month-end cash from the projection.
      continue;
    }
    const day = e.payDay ? t.useFact(base + '.payDay', e.payDay) : null;
    if (day === null) { add({ id: 'bill:' + e.id, sourceId: e.id, repeats: e.cadence !== 'once', kind: 'bill', label: e.label, date: null, amount: yours, direction: 'out', rough: amountRough, note: 'day paid not entered', path: base + '.paidFrom' }); continue; }
    add({ id: 'bill:' + e.id, sourceId: e.id, repeats: e.cadence !== 'once', movable: true, kind: 'bill', label: e.label, date: dayIn(ym, day), amount: yours, direction: 'out', rough: amountRough || roughFact(e.payDay), path: base + '.paidFrom', note: e.cadence === 'monthly' ? null : 'counted as its monthly share' });
  }

  // ------------------------------------------------------------ debt minimums on their due days
  for (const m of cf.debtMinimums.items) {
    if (m.amount === null || m.amount <= 0) continue;
    const d = (spine.debts || []).find((x) => x.id === m.id);
    t.useFact('debts.' + d.id + '.minimum', d.minimum);
    const dueRough = roughFact(d.dueDay);
    add({ id: 'debt:' + d.id, sourceId: null, repeats: true, plan: d.type === 'bnpl', kind: 'debt', label: (m.name || d.id) + (m.estimated ? ' (minimum, house default)' : ' minimum'), date: m.dueDate, amount: m.amount, direction: 'out', rough: !!m.estimated || dueRough, note: m.dueDate ? (dueRough ? 'due day is a house guess' : null) : 'due day not entered', path: 'debts.' + d.id + '.minimum' });
  }

  // ------------------------------------------------------------ saving from take-home, the tax set-aside
  for (const a of spine.accounts || []) {
    if (!a.monthlyContribution || a.family === 'cash' || ['employerRetirement', 'hsaFsa'].includes(a.family)) continue;
    const x = t.useFact('accounts.' + a.id + '.monthlyContribution', a.monthlyContribution);
    if (!x) continue;
    add({ id: 'save:' + a.id, sourceId: 'save:' + a.id, repeats: true, kind: 'saving', label: 'Into ' + (v(a.name) || a.id), date: null, amount: x, direction: 'out', rough: roughFact(a.monthlyContribution), note: 'paid in from take-home; no day entered', path: 'accounts.' + a.id + '.monthlyContribution' });
  }
  if (cf.taxSetAside.total.value) add({ id: 'setAside', sourceId: 'setAside', repeats: true, kind: 'setAside', label: 'Tax set-aside', date: null, amount: cf.taxSetAside.total.value, direction: 'out', rough: cf.taxSetAside.total.kind !== 'computed', note: 'money to hold back for tax that nothing withholds', path: setAsidePath(spine, cf) });

  // ------------------------------------------------------------ dates: promos, tax, starts and ends, changes
  // A signup bonus deadline (S-205): the day the spend has to be done by.
  for (const d of spine.debts || []) {
    const by = d.bonusBy && d.bonusBy.kind !== 'notForMe' ? v(d.bonusBy) : null;
    if (by && inMonth(by)) add({ id: 'bonus:' + d.id, kind: 'bonusBy', label: (v(d.name) || d.id) + ': signup bonus deadline', date: by, amount: v(d.bonusSpend), direction: null, counted: false, path: 'debts.' + d.id + '.bonusBy', note: v(d.bonusSpend) !== null ? 'spend ' + Math.round(v(d.bonusSpend)) + ' by this day' : 'spend required not entered' });
  }
  for (const p of promoDeadlines(spine, asOf).items) if (inMonth(p.switchDate)) add({ id: 'promo:' + p.id, kind: 'promoEnds', label: p.name + ': intro rate ends, ' + (p.aprAfter === null ? 'regular rate not entered' : Math.round(p.aprAfter * 10000) / 100 + '% from this day'), date: p.switchDate, rough: p.aprAfterKind === 'rough', path: 'debts.' + p.id + '.promoEnds' });
  for (const [q, rid] of [[1, 'EST_Q1'], [2, 'EST_Q2'], [3, 'EST_Q3']]) { const d = year + '-' + rules.get(rid, year); if (inMonth(d)) add({ id: 'est:' + q, kind: 'estimatedTax', label: 'Estimated tax payment date (quarter ' + q + ')', date: d, note: 'no payment is planned here; the tax set-aside covers the balance due at the return', source: rid }); }
  { const d = year + '-' + rules.get('EST_Q4', year - 1); if (inMonth(d)) add({ id: 'est:4', kind: 'estimatedTax', label: 'Estimated tax payment date (quarter 4 of ' + (year - 1) + ')', date: d, note: 'no payment is planned here; the tax set-aside covers the balance due at the return', source: 'EST_Q4' }); }
  { const d = year + '-' + rules.get('TAX_RETURN_DUE', year); if (inMonth(d)) { const tx = yearTax(spine, rules, year - 1, mode, taxCache); const due = tx.balanceDue.value; add({ counted: false, id: 'return:' + (year - 1), kind: 'taxReturn', label: (year - 1) + ' tax return due' + (due === null ? ' (balance not figured yet)' : due >= 0 ? ': balance due' : ': refund'), date: d, amount: due === null ? null : Math.abs(due), direction: due === null ? null : due >= 0 ? 'out' : 'in', rough: tx.balanceDue.kind !== 'computed', note: due === null ? 'needs ' + (tx.missingText || 'more inputs').replace(/^missing: /, '') : 'paid from what the tax set-aside put by, so it is not counted again in the month\'s total', source: 'TAX_RETURN_DUE' }); } }
  for (const s of spine.income || []) {
    if (inMonth(s.start) && s.cadence !== 'once' && s.start > asOf) add({ id: 'starts:' + s.id, kind: 'incomeStarts', label: s.label + ' starts', date: s.start, path: 'income.' + s.id + '.amount' });
    if (inMonth(s.end)) add({ id: 'ends:' + s.id, kind: 'incomeEnds', label: s.label + ' ends', date: s.end, path: 'income.' + s.id + '.amount' });
  }
  for (const e of spine.expenses || []) {
    if (inMonth(e.start) && e.start > asOf) add({ id: 'estarts:' + e.id, kind: 'expenseStarts', label: e.label + ' starts', date: e.start, path: 'expenses.' + e.id + '.amount' });
    if (inMonth(e.end)) add({ id: 'eends:' + e.id, kind: 'expenseEnds', label: e.label + ' ends', date: e.end, path: 'expenses.' + e.id + '.amount' });
  }
  for (const [k, word] of [['healthCoverage', 'Health coverage becomes '], ['situation', 'Situation becomes ']]) for (const e of spine.household[k] || []) if (inMonth(e.from)) add({ id: k + ':' + e.id, kind: k === 'situation' ? 'situation' : 'coverage', label: word + String(v(e.value)).replace(/_/g, ' '), date: e.from, path: 'household.' + k + '.' + e.id + '.value' });

  t.absorb({ ...cf.income.takeHome, value: undefined }); t.absorb({ ...cf.expenses.total, value: undefined }); t.absorb({ ...cf.debtMinimums.total, value: undefined });

  // ------------------------------------------------------------ the household's own timing decisions (S-203, S-204)
  // Overrides move, re-price or skip one occurrence (keyed sourceId|original date);
  // the maybe tray's dated items land as maybe money; locks are pills.
  const cal = spine.calendar || {};
  const overrides = cal.overrides || {};
  const kept = [];
  for (const e of events) {
    e.key = e.sourceId && e.date ? e.sourceId + '|' + e.date : null;
    e.origDate = e.date;
    const ov = e.key ? overrides[e.key] : null;
    if (ov) {
      if (ov.skip) { e.skipped = true; continue; }
      if (ov.date) { e.date = ov.date; e.moved = true; e.note = 'moved from ' + e.origDate + (e.note ? '; ' + e.note : ''); }
      if (typeof ov.amount === 'number') { e.amount = round2(ov.amount); e.repriced = true; }
    }
    if (e.date && !inMonth(e.date)) continue;
    kept.push(e);
  }
  // Moved into this month from another one.
  for (const [key, ov] of Object.entries(overrides)) {
    if (!ov.date || !inMonth(ov.date)) continue;
    const [sourceId, orig] = key.split('|');
    if (inMonth(orig)) continue;
    const src = (spine.income || []).find((x) => x.id === sourceId) || (spine.expenses || []).find((x) => x.id === sourceId);
    if (!src) continue;
    const isIncome = !!(spine.income || []).find((x) => x.id === sourceId);
    const base = (isIncome ? 'income.' : 'expenses.') + sourceId;
    kept.push({ amount: typeof ov.amount === 'number' ? round2(ov.amount) : null, direction: isIncome ? 'in' : 'out', rough: true, note: 'moved from ' + orig + '; amount as of that day', path: base + '.amount', counted: true, id: (isIncome ? 'pay:' : 'bill:') + sourceId, sourceId, repeats: true, movable: true, kind: isIncome ? 'pay' : 'bill', label: src.label, date: ov.date, key, origDate: orig, moved: true });
  }
  for (const m of cal.maybe || []) {
    if (!m.date || !inMonth(m.date)) continue;
    kept.push({ amount: round2(m.amount), direction: m.direction === 'out' ? 'out' : 'in', rough: true, note: Math.round((typeof m.likelihood === 'number' ? m.likelihood : 0.5) * 100) + '% likely; counted at that weight in the cash line', path: null, counted: false, id: 'maybe:' + m.id, sourceId: 'maybe:' + m.id, maybeId: m.id, kind: 'maybe', label: m.label, date: m.date, key: 'maybe:' + m.id + '|' + m.date, origDate: m.date, movable: true, likelihood: typeof m.likelihood === 'number' ? m.likelihood : 0.5 });
  }
  for (const e of kept) {
    e.day = e.date ? +e.date.slice(8, 10) : null;
    e.locked = !!(e.key && cal.locks && cal.locks[e.key]);
    e.pills = [...(e.kind === 'subscription' ? ['sub'] : []), ...(e.plan ? ['plan'] : []), ...(e.repeats ? ['repeat'] : []), ...(e.locked ? ['locked'] : []), ...(e.date && e.date < asOf ? ['done'] : []), ...(e.kind === 'maybe' ? ['maybe'] : [])];
  }
  return { events: kept, cf, tracker: t, first, last };
}

// Where the tax set-aside line opens: the tax year's set-aside field, else the untaxed income.
function setAsidePath(spine, cf) {
  const l = cf.taxSetAside.lines[0];
  if (!l) return null;
  if (l.kind === 'income') return 'income.' + l.id + '.amount';
  if (l.kind === 'conversion') return 'accounts.' + l.id + '.conversions';
  const ty = (spine.taxYears || []).find((x) => x.year === l.taxYear);
  return ty && ty.setAside ? 'taxYears.' + ty.id + '.setAside' : null;
}

// The day-by-day cash line behind a month (S-203): checking and total cash at the end
// of each day from the cash simulation, read by date.
function cashLineFor(sim, ym) {
  if (!sim) return [];
  return sim.daily.filter((d) => d.date.slice(0, 7) === ym).map((d) => ({ date: d.date, cash: d.cash, primary: d.primary, debt: d.debt, in: d.in, out: d.out }));
}

// The month-end cash number and how it was reached (S-203): the start-of-month
// checking balance plus every event on the checking account in the month, by kind.
export function monthCashTerms(sim, ym) { return rangeCashTerms(sim, ym + '-01', ym + '-31'); }
export function rangeCashTerms(sim, from, to) {
  if (!sim) return null;
  const days = sim.daily.filter((d) => d.date >= from && d.date <= to);
  if (!days.length) return null;
  const pid = sim.model.accounts.find((a) => a.primary);
  if (!pid) return null;
  const before = sim.daily[sim.daily.indexOf(days[0]) - 1];
  const start = before ? before.primary : pid.balance / 100;
  const groups = {};
  for (const d of days) for (const e of d.events) {
    if (e.account !== pid.id || e.kind === 'shortfall' || e.kind === 'statement' || e.amount === null) continue;
    const k = e.kind === 'income' || e.kind === 'maybe-in' ? 'Pay and money in' : e.kind === 'everyday' ? 'Everyday spending, spread by day' : e.kind === 'card-payment' || e.kind === 'extra-payment' ? 'Card payments' : e.kind === 'loan-payment' || e.kind === 'paylater' ? 'Loan and plan payments' : e.kind === 'transfer' ? 'Saving and the tax set-aside' : e.kind === 'auto-cover' ? 'Topped up from the cushion' : e.kind === 'sweep' ? 'Month-end sweep' : 'Bills';
    groups[k] = (groups[k] || 0) + e.amount;
  }
  return { start: round2(start), startDate: before ? before.date : sim.start, end: days[days.length - 1].primary, endDate: days[days.length - 1].date, groups: Object.entries(groups).map(([label, amount]) => ({ label, amount: round2(amount) })) };
}

// The calendar from a month, for a number of months.
export function calendar(spine, rules, { from = null, months = 1, mode = 'expected', asOf = spine.meta.asOf, maybeMode = 'weighted' } = {}) {
  const asOfYm = monthKey(asOf);
  const start = from || asOfYm;
  const last = addMonths(start, months - 1);
  const taxCache = new Map();
  // The day-by-day cash line from the simulation (S-203), as far as the last month asked for.
  const span = (+last.slice(0, 4) - +asOfYm.slice(0, 4)) * 12 + (+last.slice(5) - +asOfYm.slice(5)) + 1;
  const sim = last >= asOfYm ? cashsim(spine, rules, { asOf, months: span, maybeMode }) : null;
  const sheet = balanceSheet(spine);
  const out = [];
  const all = tracker();
  for (let ym = start, i = 0; i < months; ym = addMonths(ym, 1), i++) {
    const { events, cf, tracker: t } = monthEvents(spine, rules, ym, { mode, asOf, taxCache, schedule: null });
    all.absorb({ value: 0, ...t.snapshot() });
    const dated = events.filter((e) => e.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));
    const days = [];
    for (const e of dated) { let d = days.find((x) => x.date === e.date); if (!d) { d = { date: e.date, day: e.day, events: [], in: 0, out: 0 }; days.push(d); } d.events.push(e); if (e.amount !== null && e.counted) d[e.direction === 'in' ? 'in' : e.direction === 'out' ? 'out' : 'skip'] += e.amount; }
    for (const d of days) { d.in = round2(d.in); d.out = round2(d.out); delete d.skip; }
    const sum = (dir) => round2(events.filter((e) => e.direction === dir && e.amount !== null && e.counted).reduce((x, e) => x + e.amount, 0));
    const inn = sum('in'), outt = sum('out');
    let cash;
    const line = cashLineFor(sim, ym);
    const lastDay = line.length ? line[line.length - 1] : null;
    if (ym < asOfYm) cash = { value: null, kind: 'missing', note: 'a month before the as-of date: the simulation does not look back', path: null, when: 'past', today: null };
    else cash = { value: lastDay ? lastDay.primary : null, total: lastDay ? lastDay.cash : null, kind: lastDay ? sim.kind : 'missing', note: lastDay ? 'checking at the end of ' + (ym === asOfYm ? 'this month' : 'the month') + ', from the day-by-day simulation (' + maybeMode + ' maybe money, the floor guard ' + (sim.floor.guard ? 'on' : 'off') + ')' : 'no day of this month is in the simulation', path: sheet.cash.from[0] || null, when: ym === asOfYm ? 'now' : 'end', today: ym === asOfYm ? sheet.cash.value : null };
    if (sim) all.absorb({ value: 0, from: sim.from, rough: sim.rough, missing: sim.missing, rules: sim.rules });
    const snap = t.snapshot();
    const low = sim && sim.monthly[ym] ? sim.monthly[ym].low : null;
    out.push({
      ym, days, undated: events.filter((e) => !e.date), events, in: inn, out: outt, net: round2(inn - outt), cash, line, low,
      monthCash: monthCashTerms(sim, ym),
      surplus: cf.surplus, kind: snap.missing.length ? 'incomplete' : snap.rough.length || events.some((e) => e.rough) ? 'rough' : 'computed', rough: snap.rough, missing: snap.missing
    });
  }
  all.rule(rules, 'EST_Q1', +start.slice(0, 4)); all.rule(rules, 'EST_Q2', +start.slice(0, 4)); all.rule(rules, 'EST_Q3', +start.slice(0, 4)); all.rule(rules, 'EST_Q4', +start.slice(0, 4)); all.rule(rules, 'TAX_RETURN_DUE', +start.slice(0, 4));
  const snap = all.snapshot();
  const tray = ((spine.calendar || {}).maybe || []).filter((m) => !m.date).map((m) => ({ id: m.id, label: m.label, amount: m.amount, likelihood: typeof m.likelihood === 'number' ? m.likelihood : 0.5, direction: m.direction || 'in' }));
  return { asOf, mode, maybeMode, from: start, months: out, sim, tray, ...snap };
}

// The first day of the week (0 Sunday) a month starts on, for a grid.
export const weekdayOf = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
export { isFact, addDays };
