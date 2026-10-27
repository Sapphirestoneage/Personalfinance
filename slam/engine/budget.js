// Budget vs actual, one view (Budget brief, 2026-10-27). No store for a budget: the plan is the monthly amounts
// already in My numbers (Needs, and Income for income); what happened is the log (spine.log).
//
// Where Actual comes from (one rule, Show the math "budget:actual"):
//   - a bill or paycheck marked happened is a log entry on its day;
//   - imported statement lines count once reviewed (they reach the log only then);
//   - logged purchases count (cash and anything not imported);
//   - card payments, transfers between the household's own accounts and money coming back from shared bills are never
//     log entries, so they never count as spending; a refund comes off its category;
//   - a card purchase counts in its category on the day it was made (the log's day), not when the card is paid;
//   - a shared bill you pay all of counts your part of each charge; the rest is owed to you, not spent.
// An entry with no line and no category is "Not sorted yet" until it is sorted.
//
// A difference is marked only when it is real: at least APP_MATERIALITY ($100 a month) or APP_BUDGET_SHARE (10%) of the
// line's plan, whichever is larger. Mid-month, Actual is held against what the plan expects by today (its pace).
// A line that is not monthly (yearly, quarterly) is planned as its monthly share and held against its own cycle, so
// its month never reads as an overspend.
//
// Closing a month (spine.closes): each real difference gets one choice; the month locks; an over carried into the next
// month or an under rolled over moves that category's plan there. Reopening removes the close.
//
// Compatibility: spine.closes and spine.planKept are new and optional; a file without them reads as no month closed
// and nothing kept.

import { cashflow } from './cashflow.js';
import { round2, monthKey, addMonths, daysInMonth, valueOf as v } from './spine.js';
import { SECTION_WORDS } from './schema.js';
import { chargeDates } from './owed.js';
import { shareOf } from './sharing.js';

export const RANGES = [['month', 'This month'], ['3m', 'Last 3 months'], ['year', 'This year']];
const CATS = ['accommodation', 'food', 'transportation', 'other'];
const CAT_WORDS = { ...SECTION_WORDS };
const CYCLE = { quarterly: 3, yearly: 12 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dollars = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
const dim = (ym) => daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7));

export const isLumpy = (e) => !!CYCLE[e.cadence];
// The day of the month a monthly bill is paid, or null when it has none (spread through the month).
const billDay = (e) => (e.cadence !== 'monthly' ? null : e.payDay && v(e.payDay) ? v(e.payDay) : e.renews && v(e.renews) ? +v(e.renews).slice(8, 10) : null);
// The months a range covers, oldest first, ending at ym.
export function rangeMonths(ym, range) {
  if (range === '3m') return [addMonths(ym, -2), addMonths(ym, -1), ym];
  if (range === 'year') return Array.from({ length: +ym.slice(5, 7) }, (_, i) => ym.slice(0, 4) + '-' + String(i + 1).padStart(2, '0'));
  return [ym];
}
// The smallest difference worth a mark, for a plan over n months.
export function budgetThreshold(rules, year, plan, months = 1) {
  return Math.max(rules.get('APP_MATERIALITY', year) * months, rules.get('APP_BUDGET_SHARE', year) * Math.abs(plan || 0));
}
// Which category a log entry counts in: its line's, else its own tag; null is not sorted yet.
export function entryCategory(spine, e) {
  if (e.expenseId) { const x = (spine.expenses || []).find((y) => y.id === e.expenseId); if (x) return x.fat || 'other'; }
  return e.tag || null;
}
const signed = (e) => (e.kind === 'refund' ? -e.amount : e.amount);
// A shared bill you pay all of: a charge counts only your part; the rest is owed to you, not spent.
function yourShareOf(spine, id) {
  const e = (spine.expenses || []).find((x) => x.id === id);
  const sh = e ? shareOf(spine, e) : null;
  return sh && sh.shared && sh.whoPays === 'whole' && sh.share !== null ? sh.share : 1;
}

// What happened in the months: { income, incomeEntries, lines: Map(id -> { actual, entries }), cats: Map(cat ->
// { unassigned, entries }), notSorted: [entries] }.
export function actualsOf(spine, yms) {
  const set = new Set(yms);
  const out = { income: 0, incomeEntries: [], lines: new Map(), cats: new Map(CATS.map((c) => [c, { unassigned: 0, entries: [] }])), notSorted: [] };
  for (const e of spine.log || []) {
    if (!set.has(e.date.slice(0, 7))) continue;
    if (e.kind === 'income') { out.income = round2(out.income + e.amount); out.incomeEntries.push(e); continue; }
    const cat = entryCategory(spine, e);
    if (!cat) { out.notSorted.push(e); continue; }
    if (e.expenseId && (spine.expenses || []).some((x) => x.id === e.expenseId)) {
      const l = out.lines.get(e.expenseId) || { actual: 0, entries: [] };
      l.actual = round2(l.actual + signed(e) * yourShareOf(spine, e.expenseId)); l.entries.push(e);
      out.lines.set(e.expenseId, l);
    } else {
      const c = out.cats.get(cat) || { unassigned: 0, entries: [] };
      c.unassigned = round2(c.unassigned + signed(e)); c.entries.push(e);
      out.cats.set(cat, c);
    }
  }
  return out;
}

// The words for a spending row: a whole month "$112 over", "$110 left", "on plan"; mid-month against its pace.
function spendWords(diff, { pace = false } = {}) {
  if (diff === null) return 'not set';
  if (Math.abs(diff) < 1) return pace ? 'on pace' : 'on plan';
  if (pace) return dollars(diff) + (diff > 0 ? ' ahead of pace' : ' under pace');
  return dollars(diff) + (diff > 0 ? ' over' : ' left');
}

// A close's effect on the next month's plan: a category's carry (over, taken off) and rollover (under, added).
function carried(spine, ym) {
  const prev = (spine.closes || []).find((c) => c.ym === addMonths(ym, -1));
  const out = new Map();
  for (const c of prev ? prev.choices : []) {
    if (c.choice === 'carry') out.set(c.key, round2((out.get(c.key) || 0) - c.amount));
    if (c.choice === 'roll') out.set(c.key, round2((out.get(c.key) || 0) + c.amount));
  }
  return out;
}

// The Budget view for a month and a range.
export function budgetView(spine, rules, { ym = monthKey(spine.meta.asOf), range = 'month', asOf = spine.meta.asOf } = {}) {
  const yms = rangeMonths(ym, range);
  const year = +ym.slice(0, 4);
  const nowYm = monthKey(asOf);
  // Mid-month: only a single month that is this month reads against its pace.
  const partial = yms.length === 1 && ym === nowYm;
  const dayFrac = partial ? Math.min(1, +asOf.slice(8, 10) / dim(ym)) : 1;
  const plan = { income: 0, incomeMissing: false, saving: 0, lines: new Map() };
  const taxCache = new Map();
  for (const m of yms) {
    const cf = cashflow(spine, rules, m, { mode: 'expected', taxCache });
    if (cf.income.takeHome.value === null) plan.incomeMissing = true; else plan.income = round2(plan.income + cf.income.takeHome.value);
    plan.saving = round2(plan.saving + (cf.saving.afterTax.value || 0));
    for (const i of [...cf.expenses.items, ...(cf.expenses.linked || [])]) {
      if (i.covered) continue;
      const l = plan.lines.get(i.id) || { id: i.id, label: i.label, cat: i.fat || 'other', plan: 0, missing: false };
      if (i.amount === null) l.missing = true; else l.plan = round2(l.plan + i.amount);
      plan.lines.set(i.id, l);
    }
  }
  const act = actualsOf(spine, yms);
  const anyLogged = (spine.log || []).some((e) => yms.includes(e.date.slice(0, 7)));
  const carry = range === 'month' ? carried(spine, ym) : new Map();
  const mark = (diff, planned, n) => (diff === null || Math.abs(diff) < budgetThreshold(rules, year, planned, n) ? null : diff > 0 ? 'over' : 'under');
  const n = yms.length;
  // Each line, with its actual; a lumpy line goes to its own cycle list.
  const lines = [...plan.lines.values()].map((l) => {
    const e = (spine.expenses || []).find((x) => x.id === l.id);
    const a = act.lines.get(l.id) || { actual: 0, entries: [] };
    const planned = l.missing ? null : l.plan;
    // A bill with a day is expected whole once its day has passed; anything spread (groceries) at its pace.
    const day = e ? billDay(e) : null;
    const expected = planned === null ? null : !partial ? planned : day !== null ? (day <= +asOf.slice(8, 10) ? planned : 0) : round2(planned * dayFrac);
    const diff = planned === null ? null : round2(a.actual - expected);
    return { id: l.id, label: l.label, cat: l.cat, path: 'expenses.' + l.id + '.amount', plan: planned, expected, actual: a.actual, entries: a.entries, diff, lumpy: !!e && isLumpy(e), fixed: e ? e.fixed : null, words: anyLogged ? spendWords(diff, { pace: partial }) : 'nothing logged yet', mark: anyLogged ? mark(diff, planned, n) : null };
  });
  const cats = CATS.map((cat) => {
    const ls = lines.filter((l) => l.cat === cat && !l.lumpy);
    const extra = carry.get(cat) || 0;
    const missing = ls.some((l) => l.plan === null);
    const planned = missing ? null : round2(ls.reduce((t, l) => t + l.plan, 0) + extra);
    const un = act.cats.get(cat) || { unassigned: 0, entries: [] };
    const actual = round2(ls.reduce((t, l) => t + l.actual, 0) + un.unassigned);
    const expected = planned === null ? null : round2(ls.reduce((t, l) => t + l.expected, 0) + extra * dayFrac);
    const diff = planned === null ? null : round2(actual - expected);
    return { key: cat, label: CAT_WORDS[cat] || cat, plan: planned, expected, actual, diff, carried: extra || null, unassigned: un.unassigned, unassignedEntries: un.entries, lines: ls, words: anyLogged ? spendWords(diff, { pace: partial }) : 'nothing logged yet', mark: anyLogged ? mark(diff, planned, n) : null };
  }).filter((c) => c.lines.length || c.unassigned);
  const incomeActual = act.incomeEntries.length ? act.income : null;
  const incomePlan = plan.incomeMissing ? null : plan.income;
  const incomeDiff = incomeActual === null || incomePlan === null ? null : round2(incomeActual - incomePlan * dayFrac);
  const income = { key: 'income', label: 'Take-home pay', plan: incomePlan, actual: incomeActual, diff: incomeDiff, entries: act.incomeEntries,
    words: incomeActual === null ? 'nothing logged yet' : incomeDiff === null ? 'not set' : Math.abs(incomeDiff) < 1 ? 'on plan' : dollars(incomeDiff) + (incomeDiff > 0 ? ' more' : ' less'), mark: partial ? null : mark(incomeDiff === null ? null : -incomeDiff, incomePlan, n) };
  // Saving: the plan's saving from take-home; what was left after spending is the actual when pay is logged.
  const spentAll = round2(cats.reduce((t, c) => t + c.actual, 0));
  const savingActual = incomeActual === null ? null : round2(incomeActual - spentAll);
  const saving = { key: 'saving', label: 'Saving from take-home', plan: plan.saving, actual: savingActual, diff: savingActual === null ? null : round2(savingActual - plan.saving * dayFrac),
    words: savingActual === null ? 'needs pay logged' : 'left after spending' };
  // Lumpy lines, held against their own cycle: "$900 due in March, $750 set aside of $900".
  const cycles = lines.filter((l) => l.lumpy).map((l) => cycleRow(spine, l, asOf));
  const close = (spine.closes || []).find((c) => c.ym === ym) || null;
  return {
    ym, range, months: yms, partial, anyLogged, dayFrac: round2(dayFrac), day: partial ? +asOf.slice(8, 10) : null,
    income, cats, saving, cycles, notSorted: act.notSorted, closed: range === 'month' ? close : null,
    plannedSpend: cats.some((c) => c.plan === null) ? null : round2(cats.reduce((t, c) => t + c.plan, 0)), spent: spentAll,
    threshold: { materiality: rules.get('APP_MATERIALITY', year), share: rules.get('APP_BUDGET_SHARE', year) }
  };
}

// One lumpy line on its own cycle: the bill, the next day it is due, and what is set aside toward it (a sinking fund's
// balance when one is named for it, else the monthly share times the months since it was last due).
export function cycleRow(spine, l, asOf) {
  const e = (spine.expenses || []).find((x) => x.id === l.id);
  const bill = v(e.amount), cycle = CYCLE[e.cadence];
  const next = chargeDates(e, asOf, addMonths(asOf.slice(0, 7), cycle + 1) + '-28')[0] || null;
  const fund = (spine.goals || []).find((g) => g.sinkingFund && v(g.sinkingFund) === true && g.linkedAccount && String(g.label || '').toLowerCase().includes(String(e.label || '').toLowerCase().split(/\s+/)[0]));
  const fundAcct = fund ? (spine.accounts || []).find((a) => a.id === v(fund.linkedAccount)) : null;
  let setAside = null, from = 'share';
  if (fundAcct && v(fundAcct.balance) !== null) { setAside = v(fundAcct.balance); from = 'fund'; }
  else if (bill !== null && next) {
    const monthsLeft = (+next.slice(0, 4) - +asOf.slice(0, 4)) * 12 + (+next.slice(5, 7) - +asOf.slice(5, 7));
    setAside = round2((bill / cycle) * Math.max(0, cycle - monthsLeft));
  }
  const words = bill === null ? 'no amount yet' : dollars(bill) + (next ? ' due in ' + MONTHS[+next.slice(5, 7) - 1] : '') + (setAside !== null ? ', ' + dollars(setAside) + ' set aside of ' + dollars(bill) : '');
  return { ...l, bill, next, setAside, from, fund: fund ? fund.id : null, words };
}

// ---------------------------------------------------------------- close the month
// The real differences, one at a time: spending categories marked over or under (a lumpy line never is).
export const realDifferences = (view) => view.cats.filter((c) => c.mark).map((c) => ({ key: c.key, label: c.label, kind: c.mark, amount: Math.abs(c.diff) }));
export const OVER_CHOICES = ['cover', 'savings', 'carry'];
export const UNDER_CHOICES = ['roll', 'fund', 'sweep'];
const CHOICE_WORDS = { cover: 'covered from', savings: 'covered from savings', carry: 'carried into next month', roll: 'rolled over in', fund: 'moved to', sweep: 'swept to savings' };
// One summary line: "October closed: $112 over on Food, covered from Fun; $240 to the emergency fund".
export function closeSummary(ym, choices) {
  const parts = choices.map((c) => {
    if (c.kind === 'over') return dollars(c.amount) + ' over on ' + c.label + ', ' + (c.choice === 'cover' ? 'covered from ' + (c.fromLabel || 'another category') : CHOICE_WORDS[c.choice]);
    if (c.choice === 'roll') return dollars(c.amount) + ' left on ' + c.label + ', rolled over';
    if (c.choice === 'fund') return dollars(c.amount) + ' to ' + (c.toLabel || 'a goal');
    return dollars(c.amount) + ' left on ' + c.label + ', swept to savings';
  });
  return MONTHS[+ym.slice(5, 7) - 1] + ' closed' + (parts.length ? ': ' + parts.join('; ') : ': on plan, nothing to move');
}
// Close: one History entry with the choices and the summary; the month locks.
export function closeMonth(spine, ym, choices, today) {
  const list = (spine.closes || []).filter((c) => c.ym !== ym);
  const clean = choices.map((c) => ({ key: c.key, label: c.label, kind: c.kind, amount: round2(c.amount), choice: c.choice, from: c.from || null, fromLabel: c.fromLabel || null, to: c.to || null, toLabel: c.toLabel || null }));
  return { ...spine, closes: [...list, { ym, date: today, choices: clean, summary: closeSummary(ym, clean) }].sort((a, b) => (a.ym < b.ym ? -1 : 1)) };
}
export const reopenMonth = (spine, ym) => ({ ...spine, closes: (spine.closes || []).filter((c) => c.ym !== ym) });

// ---------------------------------------------------------------- the plan learns
// A variable line whose last three full months average differs from its plan by more than the threshold offers to
// update ("Update plan to $860 (your 3-month average)?"). A fixed line whose price changed offers the new price. Nothing
// changes until Update; Keep remembers the answer for that average (spine.planKept).
export function planSuggestions(spine, rules, { asOf = spine.meta.asOf } = {}) {
  const now = monthKey(asOf), year = +now.slice(0, 4);
  const yms = [addMonths(now, -3), addMonths(now, -2), addMonths(now, -1)];
  const act = actualsOf(spine, yms);
  const logged = new Set((spine.log || []).map((e) => e.date.slice(0, 7)));
  if (!yms.every((m) => logged.has(m))) return [];
  const cf = cashflow(spine, rules, now, { mode: 'expected' });
  const out = [];
  for (const i of cf.expenses.items) {
    const e = (spine.expenses || []).find((x) => x.id === i.id);
    if (!e || i.covered || i.amount === null || isLumpy(e) || e.cadence !== 'monthly') continue;
    const a = act.lines.get(i.id);
    if (!a || !a.entries.length) continue;
    const avg = Math.round(a.actual / 3);
    const kept = spine.planKept && spine.planKept[i.id];
    if (kept && Math.round(kept.avg) === avg) continue;
    if (Math.abs(avg - i.amount) < budgetThreshold(rules, year, i.amount)) continue;
    // A fixed line: its price changed (the last month's charge); a variable one: its average.
    if (e.fixed === true) {
      const last = a.entries.filter((x) => x.kind === 'spend').sort((x, y) => (x.date < y.date ? 1 : -1))[0];
      if (!last || Math.abs(last.amount - v(e.amount)) < 1) continue;
      out.push({ id: i.id, label: e.label, plan: v(e.amount), to: last.amount, kind: 'price', words: e.label + ' went ' + (last.amount > v(e.amount) ? 'up' : 'down') + ' to ' + dollars(last.amount) + '. Update?' });
    } else out.push({ id: i.id, label: e.label, plan: i.amount, to: avg, avg, kind: 'average', words: 'Update plan to ' + dollars(avg) + ' (your 3-month average)?' });
  }
  return out;
}
export const keepPlan = (spine, id, avg, today) => ({ ...spine, planKept: { ...(spine.planKept || {}), [id]: { avg, date: today } } });

// The month the Budget opens on: this month when anything is logged in it, else the latest month that has entries.
export function startMonth(spine, asOf = spine.meta.asOf) {
  const now = monthKey(asOf);
  const months = [...new Set((spine.log || []).map((e) => e.date.slice(0, 7)))].filter((m) => m <= now).sort();
  return months.includes(now) || !months.length ? now : months[months.length - 1];
}

// ---------------------------------------------------------------- sorting and merchant rules
// Sort a log entry onto a line (its category comes with it) or just a category. Sorted onto a line, its merchant is
// learned, so the next one from the same place is suggested there ("Trader Joe's is Food").
export function sortEntry(spine, id, { expenseId = null, tag = null }) {
  const e = (spine.log || []).find((x) => x.id === id);
  if (!e) throw new Error('No log entry ' + id);
  const line = expenseId ? (spine.expenses || []).find((x) => x.id === expenseId) : null;
  const next = { ...e, expenseId: line ? line.id : null, tag: line ? line.fat || 'other' : tag };
  let s = { ...spine, log: spine.log.map((x) => (x.id === id ? next : x)) };
  if (line && e.merchant) s = setMerchantRule(s, e.merchant, line.id);
  return s;
}
// The household's merchant rules (feed.memory, data/merchant-rules.json is only the starting set): a merchant to a
// line; null removes it.
export function setMerchantRule(spine, merchant, expenseId) {
  const memory = { ...((spine.feed && spine.feed.memory) || {}) };
  if (expenseId) memory[merchant] = expenseId; else delete memory[merchant];
  return { ...spine, feed: { ...(spine.feed || {}), memory } };
}
export const merchantRules = (spine) => Object.entries((spine.feed && spine.feed.memory) || {}).map(([merchant, id]) => ({ merchant, expenseId: id, label: ((spine.expenses || []).find((e) => e.id === id) || {}).label || null })).sort((a, b) => a.merchant.localeCompare(b.merchant));
