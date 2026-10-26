// Spending and keeping it true (S-206): the spend log, per-tag budgets with
// their pace, safe to spend, "can I spend this", the cut simulator, the donut,
// the bill autopsy, price increases and free trials, check-ins (drift,
// momentum, staleness) and the month-end sweep. Every number comes from the
// cash flow, the one day-by-day run (engine/cashsim.js) or the monthly plan
// (engine/debt.js); the log is a record of what happened. Views only format.

import { valueOf as v, tracker, round2, monthKey, addMonths, daysBetween, daysInMonth } from './spine.js';
import { payoffPlan } from './debt.js';
import { FAT, isEarmarked, SECTION_WORDS } from './schema.js';
import { setAsideFor, setAsideWords, setAsideNote } from './networth.js';
import * as C from './vendor/cashcal.js';
import { hiddenLine } from './profile.js';

const dollars = (c) => (c === null || c === undefined ? null : round2(c / 100));
const cents = (d) => Math.round(d * 100);
const TAGS = [...FAT, 'other'];
export const TAG_WORDS = SECTION_WORDS;
const tagOf = (spine, entry) => { if (entry.tag) return entry.tag; const e = entry.expenseId ? (spine.expenses || []).find((x) => x.id === entry.expenseId) : null; return e ? e.fat || 'other' : 'other'; };
const dayOf = (iso) => +iso.slice(8, 10);
const dim = (ym) => daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7));

// A short, readable merchant: "SQ *BLUE BOTTLE 4471" to "Blue Bottle". The
// same key the old Budget's import used (its merchant rules), in title case.
export function cleanMerchant(description) {
  if (description === null || description === undefined) return null;
  let d = String(description).toUpperCase();
  d = d.replace(/^(SQ \*|TST\* ?|POS |PURCHASE AUTHORIZED ON \d\d\/\d\d |DEBIT CARD PURCHASE |PAYPAL \*)/, '');
  d = d.replace(/#\s*\d+/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/[*]/g, ' ').replace(/[^A-Z0-9&.' /-]/g, ' ');
  const words = d.split(/\s+/).filter(Boolean).slice(0, 3);
  if (!words.length) return null;
  return words.map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}

// The log for one month, newest first; spending counts, refunds come off, income is listed but not spending.
export function monthLog(spine, ym) {
  return (spine.log || []).filter((x) => x.date.slice(0, 7) === ym).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.id).localeCompare(String(a.id))));
}
const spentByTag = (spine, entries) => { const out = Object.fromEntries(TAGS.map((t) => [t, 0])); for (const e of entries) { if (e.kind === 'income') continue; out[tagOf(spine, e)] = round2(out[tagOf(spine, e)] + (e.kind === 'refund' ? -e.amount : e.amount)); } return out; };

// Per-tag budgets: the plan from the spine, what is spent from the log, what
// is left, the pace (what this month's spending runs to), last month by the
// same day, and running hot when spending is past what the budget expects by
// today by the house margin.
export function tagBudgets(spine, rules, cf, { ym, asOf = spine.meta.asOf } = {}) {
  const month = ym || monthKey(asOf);
  const year = +asOf.slice(0, 4);
  const t = tracker();
  const hot = t.rule(rules, 'APP_RUNNING_HOT', year);
  t.absorb({ ...cf.expenses.total, value: undefined });
  const inMonth = monthKey(asOf) === month;
  const dayFrac = inMonth ? Math.min(1, dayOf(asOf) / dim(month)) : month < monthKey(asOf) ? 1 : 0;
  const entries = monthLog(spine, month);
  const spent = spentByTag(spine, entries);
  const prev = addMonths(month, -1);
  const prevSame = spentByTag(spine, monthLog(spine, prev).filter((e) => !inMonth || dayOf(e.date) <= dayOf(asOf)));
  const rows = TAGS.map((tag) => {
    // A line that pays a debt keeps its tag's budget (answer 35), so logging the payment there is on plan.
    const items = [...cf.expenses.items, ...(cf.expenses.linked || [])].filter((i) => (i.fat || 'other') === tag && !i.covered);
    const anyMissing = items.some((i) => i.amount === null);
    const budget = anyMissing ? null : round2(items.reduce((a, i) => a + (i.amount ?? 0), 0));
    const expected = budget === null ? null : round2(budget * dayFrac);
    const pace = dayFrac > 0 ? round2(spent[tag] / dayFrac) : null;
    return { tag, label: TAG_WORDS[tag], budget, spent: spent[tag], left: budget === null ? null : round2(budget - spent[tag]), expected, pace, lastMonthSameDay: prevSame[tag], hot: expected !== null && expected > 0 && spent[tag] > expected * hot, over: budget !== null && spent[tag] > budget, items: items.map((i) => ({ id: i.id, label: i.label, amount: i.amount, path: 'expenses.' + i.id + '.amount' })), kind: anyMissing ? 'missing' : 'computed' };
  });
  const out = t.out(rows.some((r) => r.budget === null) ? null : round2(rows.reduce((a, r) => a + r.budget, 0)));
  return { ym: month, dayFrac: round2(dayFrac), day: inMonth ? dayOf(asOf) : null, daysInMonth: dim(month), rows, spentTotal: round2(rows.reduce((a, r) => a + r.spent, 0)), budgetTotal: out.value, hotMultiple: hot, entries: entries.length, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// Safe to spend today: the lower of two readings. The engine's: cash outside the
// cushion, less what is committed before the next paycheck, less the floor. And
// the Budget's (S-209): the lowest point ahead in the window, less the floor,
// because a dollar spent today is a dollar lower on every later day, so money a
// later bill needs is never offered today. The lowest point is read before the
// run's protections: what the cushion topped up and any payment the floor held
// back still count against it, or a household that is dipping into savings
// would read as safe. Per day until the next paycheck; when it is below zero,
// how far short and on which day.
export function safeToSpend(sim) {
  const s = sim.safeToSpend;
  if (!sim.checking.known) return { today: null, byPaycheck: null, byLow: null, binding: null, low: null, through: null, shortfall: null, cashPath: sim.checking.path, committed: null, nextIncome: s.nextIncome, daysUntil: null, perDay: null, cash: null, floor: sim.floor.amount, excludesCushion: s.excludesCushion, byDay: [], kind: 'incomplete', from: sim.from, rough: sim.rough, missing: [...new Set([...sim.missing, ...(sim.checking.path ? [sim.checking.path] : [])])], rules: sim.rules };
  const cushion = sim.model.accounts.filter((a) => a.cushion);
  const outside = (d) => round2(Object.entries(d.balances).filter(([id]) => !cushion.find((a) => a.id === id)).reduce((a, [, x]) => a + x, 0));
  const fromCushion = (e) => e.kind === 'auto-cover' && cushion.some((a) => e.label.startsWith('From ' + a.name));
  const daysUntil = s.nextIncome ? daysBetween(sim.start, s.nextIncome) : null;
  const cash = sim.daily.length ? outside(sim.daily[0]) : null;
  let covered = 0, held = 0, lowDay = null, low = null;
  for (const d of sim.daily) {
    for (const e of d.events) { if (fromCushion(e)) covered = round2(covered + e.amount); if (e.kind === 'shortfall') held = round2(held - e.amount); }
    const x = round2(outside(d) - covered - held);
    if (low === null || x < low.amount) { lowDay = d; low = { date: d.date, amount: x, asRun: outside(d), covered, held }; }
  }
  const byLow = s.today === null || !low ? null : round2(low.amount - sim.floor.amount);
  const binding = byLow !== null && byLow < s.today ? 'low' : 'paycheck';
  const today = s.today === null ? null : binding === 'low' ? byLow : s.today;
  const perDay = today === null ? null : daysUntil && daysUntil > 0 ? round2(today / daysUntil) : today;
  const shortfall = today !== null && today < 0 ? { amount: round2(-today), date: binding === 'low' ? lowDay.date : s.nextIncome || lowDay.date, covered: low.covered, held: low.held } : null;
  const through = sim.daily.length ? sim.daily[sim.daily.length - 1].date : null;
  const primary = sim.model.accounts.find((a) => a.primary);
  // Money set aside for a goal is left out with the cushion (S-228); the page names it.
  const setAside = sim.model.accounts.filter((a) => a.earmarked).map((a) => ({ id: a.id, name: a.name, goal: a.goal || null, words: setAsideWords(a.goal), balance: round2(a.balance / 100) }));
  return { today, byPaycheck: s.today, byLow, binding, low, through, shortfall, cashPath: primary ? 'accounts.' + primary.id + '.balance' : null, committed: s.committed, nextIncome: s.nextIncome, daysUntil, perDay, cash, floor: sim.floor.amount, excludesCushion: cushion.some((a) => !a.earmarked), setAside, setAsideNote: setAsideNote(setAside), byDay: s.byDay.slice(0, 31), kind: sim.kind, from: sim.from, rough: sim.rough, missing: sim.missing, rules: sim.rules };
}

// Can I spend this: the same run with the purchase added. Yes, tight or no;
// the new low point; a month of interest if it rides on a revolving card;
// hours of life at take-home per hour worked; the days it delays what the
// surplus would have bought.
export function canISpend(spine, rules, sim, { amount, date = null, paidWith = 'cash', label = 'This purchase' } = {}) {
  const year = +sim.start.slice(0, 4);
  const t = tracker();
  if (!(amount > 0)) return { amount: null, verdict: null, ...t.out(null) };
  const r = C.canISpend(sim.model, { cents: cents(amount), date: date || sim.start, paidWith, label }, { maybeMode: sim.mode, penaltyMonths: rules.get('CARD_PENALTY_MONTHS', year) });
  if (sim.model.realHourlyWage === null) t.addMissing('household.workHoursPerWeek'); else { t.useFact('household.workHoursPerWeek', spine.household.workHoursPerWeek); t.rule(rules, 'APP_WEEKS_PER_MONTH', year); }
  t.absorb({ ...sim, value: undefined });
  const out = t.out(dollars(r.safeAfter));
  return {
    amount, date: date || sim.start, paidWith, verdict: r.verdict,
    lowBefore: { date: r.lowBefore.date, amount: dollars(r.lowBefore.cents) }, lowAfter: { date: r.lowAfter.date, amount: dollars(r.lowAfter.cents) },
    safeBefore: dollars(r.safeBefore), safeAfter: dollars(r.safeAfter), interest: dollars(r.interest), interestNote: r.interestNote,
    hours: r.hours, hourlyWage: dollars(sim.model.realHourlyWage), delayDays: r.delayDays, shortfalls: r.shortfalls.length,
    kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules
  };
}

// The cut simulator: drop lines, see the surplus move; aim what is saved at
// the debt and see the debt-free month and the interest move (the monthly
// plan, engine/debt.js, before and after).
export function cutSimulator(spine, rules, s, { dropped = [], towardDebt = false, asOf = spine.meta.asOf } = {}) {
  const t = tracker();
  const items = s.cashflow.expenses.items.filter((i) => dropped.includes(i.id));
  for (const i of items) t.useFact('expenses.' + i.id + '.amount', (spine.expenses.find((e) => e.id === i.id) || {}).amount);
  const saved = round2(items.reduce((a, i) => a + (i.amount ?? 0), 0));
  t.absorb({ ...s.cashflow.surplus, value: undefined });
  const surplusBefore = s.cashflow.surplus.value;
  const surplusAfter = surplusBefore === null ? null : round2(surplusBefore + saved);
  let debt = null;
  if (towardDebt) {
    const plan = spine.debtPlan || {};
    const extraNow = plan.extra ? t.useFact('debtPlan.extra', plan.extra) ?? 0 : 0;
    const strategy = plan.strategy && v(plan.strategy) === 'snowball' ? 'snowball' : 'avalanche';
    const before = payoffPlan(spine, rules, { strategy, extra: extraNow, asOf });
    const after = payoffPlan(spine, rules, { strategy, extra: round2(extraNow + saved), asOf });
    t.absorb({ ...before.totalInterest, value: undefined });
    const months = before.debtFreeYm && after.debtFreeYm ? (+before.debtFreeYm.slice(0, 4) - +after.debtFreeYm.slice(0, 4)) * 12 + (+before.debtFreeYm.slice(5) - +after.debtFreeYm.slice(5)) : null;
    debt = { extraNow, extraAfter: round2(extraNow + saved), strategy, debtFreeBefore: before.debtFreeYm, debtFreeAfter: after.debtFreeYm, neverBefore: before.neverPaysOff, neverAfter: after.neverPaysOff, interestBefore: before.totalInterest.value, interestAfter: after.totalInterest.value, interestSaved: before.totalInterest.value === null || after.totalInterest.value === null ? null : round2(before.totalInterest.value - after.totalInterest.value), monthsSooner: months };
  }
  const out = t.out(saved);
  return { dropped: items.map((i) => ({ id: i.id, label: i.label, amount: i.amount, path: 'expenses.' + i.id + '.amount' })), saved, surplusBefore, surplusAfter, towardDebt, debt, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// Where the take-home goes: a slice per tag (expandable to its lines), the
// minimums, saving and the set-aside, and what is left.
export function donut(spine, rules, s) {
  const cf = s.cashflow;
  const t = tracker();
  t.absorb({ ...cf.income.takeHome, value: undefined }); t.absorb({ ...cf.expenses.total, value: undefined }); t.absorb({ ...cf.debtMinimums.total, value: undefined }); t.absorb({ ...cf.saving.afterTax, value: undefined }); t.absorb({ ...cf.taxSetAside.total, value: undefined });
  const total = cf.income.takeHome.value;
  // A line that pays a debt sits in its own tag's slice (answer 35), so it leaves the minimums slice.
  const linked = cf.expenses.linked || [];
  const slices = TAGS.map((tag) => { const items = [...cf.expenses.items, ...linked].filter((i) => (i.fat || 'other') === tag && !i.covered && i.amount); return { id: tag, label: TAG_WORDS[tag], amount: round2(items.reduce((a, i) => a + i.amount, 0)), items: items.map((i) => ({ id: i.id, label: i.label, amount: i.amount, path: 'expenses.' + i.id + '.amount' })) }; }).filter((x) => x.amount > 0);
  const minimums = round2((cf.debtMinimums.total.value ?? 0) - linked.reduce((a, i) => a + i.amount, 0));
  const saving = round2((cf.saving.afterTax.value ?? 0) + (cf.taxSetAside.total.value ?? 0));
  if (minimums > 0) slices.push({ id: 'minimums', label: 'Debt minimums', amount: minimums, items: cf.debtMinimums.items.filter((i) => !(i.line && i.amount !== null)).map((i) => ({ id: i.id, label: i.label || i.name || i.id, amount: i.amount, path: i.path || 'debts.' + i.id + '.minimum' })) });
  if (saving > 0) slices.push({ id: 'saving', label: 'Saving and the tax set-aside', amount: saving, items: [] });
  const spent = round2(slices.reduce((a, x) => a + x.amount, 0));
  const left = total === null ? null : round2(total - spent);
  if (left !== null && left > 0) slices.push({ id: 'left', label: 'Left over', amount: left, items: [] });
  const base = total !== null && total > 0 ? total : spent;
  for (const x of slices) x.share = base ? round2(x.amount / base * 10000) / 10000 : null;
  const out = t.out(total);
  return { slices, total, spent, left, short: left !== null && left < 0 ? round2(-left) : null, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// The bill autopsy: every recurring item ranked by what it costs a year, with
// when it was last reviewed; a subscription never reviewed, or not in a year, is stale.
export function billAutopsy(spine, rules, s, asOf = spine.meta.asOf) {
  const rows = [];
  for (const i of s.cashflow.expenses.items) {
    if (i.covered || !i.amount) continue;
    const e = (spine.expenses || []).find((x) => x.id === i.id) || {};
    const reviewed = e.reviewed ? v(e.reviewed) : null;
    rows.push({ id: i.id, label: i.label, monthly: i.amount, yearly: round2(i.amount * 12), path: 'expenses.' + i.id + '.amount', subscription: !!(e.subscription && v(e.subscription) === true), need: i.need, reviewed, stale: !reviewed || daysBetween(reviewed, asOf) > 365, kind: 'computed' });
  }
  for (const m of s.cashflow.debtMinimums.items) if (m.amount) rows.push({ id: 'min:' + m.id, label: (m.label || m.name || m.id) + (m.line ? ' payment (the ' + m.lineLabel + ' line)' : ' minimum'), monthly: m.amount, yearly: round2(m.amount * 12), path: m.path || 'debts.' + m.id + '.minimum', subscription: false, need: true, reviewed: null, stale: false, kind: 'computed' });
  rows.sort((a, b) => b.yearly - a.yearly);
  const t = tracker();
  t.absorb({ ...s.cashflow.expenses.total, value: undefined }); t.absorb({ ...s.cashflow.debtMinimums.total, value: undefined });
  const out = t.out(round2(rows.reduce((a, r) => a + r.yearly, 0)));
  return { rows, yearlyTotal: out.value, staleCount: rows.filter((r) => r.stale && r.subscription).length, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// Price increases: the latest logged charge for an expense against its planned amount.
export function priceChanges(spine, rules, asOf = spine.meta.asOf) {
  const year = +asOf.slice(0, 4);
  const drift = rules.get('APP_PRICE_DRIFT', year);
  const out = [];
  for (const e of spine.expenses || []) {
    if (hiddenLine(spine, e)) continue;
    const planned = v(e.amount);
    if (planned === null || !(planned > 0)) continue;
    const logged = (spine.log || []).filter((x) => x.expenseId === e.id && x.kind === 'spend').sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!logged.length) continue;
    const last = logged[0];
    const change = round2((last.amount - planned) / planned * 10000) / 10000;
    if (change > drift) out.push({ id: e.id, label: e.label, planned, logged: last.amount, date: last.date, change, path: 'expenses.' + e.id + '.amount', subscription: !!(e.subscription && v(e.subscription) === true) });
  }
  return { rows: out, drift, rules: ['APP_PRICE_DRIFT'] };
}

// Free trials: an expense with a trial end date, flagged inside the warning window or once it has converted.
export function freeTrials(spine, rules, asOf = spine.meta.asOf) {
  const year = +asOf.slice(0, 4);
  const warn = rules.get('APP_TRIAL_WARN_DAYS', year);
  const rows = [];
  for (const e of spine.expenses || []) {
    const ends = e.trialEnds && e.trialEnds.kind !== 'notForMe' ? v(e.trialEnds) : null;
    if (!ends) continue;
    const days = daysBetween(asOf, ends);
    rows.push({ id: e.id, label: e.label, trialEnds: ends, daysLeft: days, converted: days < 0, soon: days >= 0 && days <= warn, converts: v(e.amount), path: 'expenses.' + e.id + '.trialEnds' });
  }
  rows.sort((a, b) => a.daysLeft - b.daysLeft);
  return { rows, warnDays: warn, rules: ['APP_TRIAL_WARN_DAYS'] };
}

// The forecast for a check-in: what the run says each cash account holds on that day.
export function checkInForecast(spine, sim, date = sim.start) {
  const day = sim.daily.find((d) => d.date === date) || sim.daily[sim.daily.length - 1] || null;
  // Every cash account, the ones the run left out for a missing balance too (S-209): a check-in is where it gets one.
  const inRun = new Map(sim.model.accounts.map((a) => [a.id, a]));
  // An account set aside for a goal says so (S-228); it is never called the cushion.
  const accounts = (spine.accounts || []).filter((a) => a.family === 'cash').map((a) => ({ id: a.id, name: inRun.has(a.id) ? inRun.get(a.id).name : v(a.name) || a.id, path: 'accounts.' + a.id + '.balance', cushion: inRun.has(a.id) ? !!inRun.get(a.id).cushion && !isEarmarked(a) : false, setAside: isEarmarked(a) ? setAsideWords(setAsideFor(spine, a)) : null, now: v(a.balance), inRun: inRun.has(a.id) }));
  return { date: day ? day.date : date, forecast: Object.fromEntries(accounts.map((a) => [a.id, day && a.inRun ? (day.balances[a.id] ?? null) : null])), accounts };
}

// Drift across check-ins: the mean miss (actual less forecast) and its spread;
// a mean bigger than the spread is bias (the plan leans one way), else noise.
export function drift(spine) {
  const list = (spine.checkins || []).filter((c) => c.forecast && Object.values(c.forecast).some((x) => x !== null));
  const r = C.drift(list.map((c) => ({ actual: Object.fromEntries(Object.entries(c.balances).map(([k, x]) => [k, cents(x)])), forecast: Object.fromEntries(Object.entries(c.forecast).map(([k, x]) => [k, x === null ? 0 : cents(x)])) })));
  const words = r.kind === 'none' ? 'No check-in with a forecast yet.' : r.kind === 'first' ? 'One check-in: the plan was ' + (r.mean >= 0 ? 'under' : 'over') + ' by ' + Math.abs(dollars(r.mean)) + ' dollars. Two or more tell bias from noise.' : r.kind === 'bias' ? 'Bias: real balances run ' + (r.mean >= 0 ? 'above' : 'below') + ' the plan by about ' + Math.abs(dollars(r.mean)) + ' dollars each check-in. Something regular is missing from the plan.' : 'Noise: the misses go both ways (spread ' + dollars(r.sd) + ' dollars around a mean of ' + dollars(r.mean) + '). The plan is not leaning; days just vary.';
  return { count: r.count, mean: dollars(r.mean), sd: dollars(r.sd), kind: r.kind, words, checkins: list.map((c) => ({ id: c.id, date: c.date, miss: round2(Object.keys(c.balances).reduce((a, k) => a + (c.balances[k] - (c.forecast[k] ?? 0)), 0)) })) };
}

// Staleness: days since the household was last anchored (a check-in, else the as-of date).
export function staleness(spine, rules, today) {
  const year = +today.slice(0, 4);
  const limit = rules.get('APP_STALE_DAYS', year);
  const last = (spine.checkins || []).reduce((m, c) => (c.date > m ? c.date : m), spine.meta.asOf);
  const days = Math.max(0, daysBetween(last, today));
  return { anchor: last, days, limit, stale: days > limit, words: days === 0 ? 'Checked in today.' : days === 1 ? 'Last checked in yesterday.' : 'Last checked in ' + days + ' days ago' + (days > limit ? '. Time to check in.' : '.'), rules: ['APP_STALE_DAYS'] };
}

// Momentum from check-in snapshots: cash (every account checked in) over time, as a change a month.
export function momentum(spine, rules) {
  const year = +spine.meta.asOf.slice(0, 4);
  const flat = rules.get('APP_MOMENTUM_FLAT', year);
  const list = (spine.checkins || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((c) => ({ date: c.date, cash: round2(Object.values(c.balances).reduce((a, x) => a + x, 0)) }));
  if (list.length < 2) return { points: list, perMonth: null, kind: list.length ? 'first' : 'none', words: list.length ? 'One snapshot. The next check-in shows which way cash is moving.' : 'No check-in yet.', flat, rules: ['APP_MOMENTUM_FLAT'] };
  const first = list[0], last = list[list.length - 1];
  const days = Math.max(1, daysBetween(first.date, last.date));
  const perMonth = round2((last.cash - first.cash) / days * 30.44);
  const kind = Math.abs(perMonth) < flat ? 'flat' : perMonth > 0 ? 'building' : 'slipping';
  return { points: list, perMonth, from: first.date, to: last.date, kind, words: kind === 'flat' ? 'Flat: cash is about where it was at the first check-in.' : kind === 'building' ? 'Building: cash is up about ' + perMonth + ' dollars a month across the check-ins.' : 'Slipping: cash is down about ' + Math.abs(perMonth) + ' dollars a month across the check-ins.', flat, rules: ['APP_MOMENTUM_FLAT'] };
}

// The month-end sweep as the run did it: what moved, when, where.
export function sweepReading(sim) {
  const moves = [];
  for (const d of sim.daily) for (const e of d.events) if (e.kind === 'sweep') moves.push({ date: d.date, amount: Math.abs(e.amount), to: e.to || null, toName: e.to ? (sim.model.accounts.find((a) => a.id === e.to) || {}).name || e.to : null });
  return { on: !!sim.model.sweep, to: sim.model.sweepTo, keep: dollars(sim.model.sweepKeep), moves, total: round2(moves.reduce((a, m) => a + m.amount, 0)) };
}

// Everything the Spending page shows, from one run.
export function spendingView(spine, rules, sim, s, { today = spine.meta.asOf, ym = null } = {}) {
  const asOf = spine.meta.asOf;
  return {
    asOf, today, ym: ym || monthKey(asOf),
    safe: safeToSpend(sim), tags: tagBudgets(spine, rules, s.cashflow, { ym: ym || monthKey(asOf), asOf }), donut: donut(spine, rules, s), autopsy: billAutopsy(spine, rules, s, asOf),
    prices: priceChanges(spine, rules, asOf), trials: freeTrials(spine, rules, asOf), drift: drift(spine), stale: staleness(spine, rules, today), momentum: momentum(spine, rules), sweep: sweepReading(sim),
    log: monthLog(spine, ym || monthKey(asOf))
  };
}

// Reference bands (Phase 2.5 Batch 7, data/benchmarks.json): needs, wants and saving as shares of take-home, each
// beside its 50/30/20 reference line. A reference, never a grade: no row says good or bad. Needs are the lines marked
// need plus debt minimums; wants are the rest of spending; saving is everything set to be saved (docs/FORMULAS.md).
export function referenceBands(s, bench) {
  const cf = s.cashflow, ref = (bench && bench.fiftyThirtyTwenty) || null;
  if (!ref) return null;
  // Over pay as the savings rate reads it (take-home + pre-tax + match), so the three never add past 100%.
  const th = cf.income.takeHome.value, pay = th === null ? null : round2(th + (cf.saving.payroll.value ?? 0) + (cf.saving.match.value ?? 0));
  // Each line once: a line that pays a debt is in linked (with its need or want), the other minimums are needs.
  const lines = [...cf.expenses.items.filter((i) => !i.covered), ...(cf.expenses.linked || [])];
  const sum = (f) => round2(lines.filter(f).reduce((a, i) => a + (i.amount ?? 0), 0));
  const linkedSum = round2((cf.expenses.linked || []).reduce((a, i) => a + i.amount, 0));
  const unmarked = sum((i) => i.need === null || i.need === undefined);
  const needs = unmarked ? null : round2(sum((i) => i.need === true) + (cf.debtMinimums.total.value ?? 0) - linkedSum);
  const wants = unmarked ? null : sum((i) => i.need === false);
  const share = (x) => (x === null || !pay ? null : Math.round(x / pay * 1000) / 1000);
  return {
    pay, unmarked: unmarked || 0, source: ref.source,
    rows: [['needs', 'Needs (and debt minimums)', needs, ref.needs], ['wants', 'Wants', wants, ref.wants], ['saving', 'Saving', cf.saving.total, ref.savings]].map(([id, label, amount, reference]) => ({ id, label, amount, share: share(amount), reference }))
  };
}
