// Turns the stored category tree into monthly numbers: estimate and actual
// per line and per category (the dream life is not part of the budget, S-097;
// columnModel serves it to Eras). Adds the computed Debt payments lines and
// carves the single "Everything else" total. Archived items drop out here.
// Dollars a month throughout (toMonthly). Depends on normalize.js, money.js (sumKnown), coverage.js (the
// health premium), tx-analysis.js (the month's log by line), debts.js (linked lines and card interest),
// and split.js (your share of a split bill).

import { toMonthly, hasAnswer, isOneOff } from './normalize.js';
import { sumKnown } from './money.js';
import { premiumFor, PREMIUM_LINE_TYPES } from './coverage.js';
import { actualsFromTransactions } from './tx-analysis.js';
import { linkedLine, interestHandoff } from './debts.js';
import { splitOf, countedAmount } from './split.js';

// Weakest first: an open question beats a blank (null), a blank beats a guess, and "doesn't apply" is a
// complete answer.
const WEAKNESS_ORDER = ['dont-know', 'will-email', null, 'guess', 'roughly', 'known', 'computed', 'not-for-me'];

/**
 * The weakest status among several values (used when a category total comes from its lines).
 * @param {Array<?string>} statuses value statuses, null for not entered
 * @returns {?string} the weakest one by WEAKNESS_ORDER; null for an empty list
 */
export function weakestStatus(statuses) {
  let best = null;
  let idx = Infinity;
  for (const s of statuses) {
    const i = WEAKNESS_ORDER.indexOf(s);
    if (i < idx) { idx = i; best = s; }
  }
  return best;
}

/**
 * The pay frequency every per-paycheck value in the budget is read with.
 * @param {object} doc the household file
 * @returns {?string} 'weekly' | 'biweekly' | 'semimonthly' | 'monthly', from the first live income; null with none
 */
export function primaryPayFrequency(doc) {
  const inc = doc.income.find((i) => i.state !== 'archived');
  return inc ? inc.payFrequency : null;
}

// A premium line is owned by health coverage (S-117). Covered (a parent's plan, from the paycheck, or no
// coverage): "doesn't apply", 0, and complete. Paid directly: the premium is the estimate, and the actual
// is the log (or a typed actual), else the premium. Not answered yet: blank.
function premiumRow(line, freq, src, prem) {
  if (prem.amount === 0 && prem.status === 'not-for-me') {
    const zero = { ...line, estimate: NOT_FOR_ME, actual: NOT_FOR_ME };
    return { ...lineRow(zero, freq, null), covered: prem.from === 'parent' ? 'parents-plan' : prem.from };
  }
  const row = lineRow({ ...line, estimate: prem.from === 'direct' ? prem.value : BLANK }, freq, src);
  if (prem.from === 'direct' && row.actual === null && prem.amount !== null) {
    row.actual = prem.amount;
    row.status = { ...row.status, actual: 'computed' };
  }
  return { ...row, covered: null, fromCoverage: true };
}
const BLANK = { amount: null, cadence: 'month', status: null, source: 'client', asOf: null, note: '' };

/**
 * A line with a due month is a yearly cost (S-086). Its monthly actual is its
 * share (the month's plan, else the estimate); the payment itself is in the log
 * and shows in the budget-to-cash bridge (S-087).
 * @param {object} line a stored budget line
 * @returns {boolean}
 */
export function isYearlyLine(line) {
  return !!(line.dueMonth && line.dueMonth.amount !== null && line.dueMonth.amount !== undefined);
}

// The log owns the money (S-087): a line with entries this month has its actual
// computed from them and is not typed over. A line with none keeps a typed actual.
function actualOf(line, freq, src) {
  if (src && isYearlyLine(line)) {
    // The share is this month's plan for the line, else the estimate (your part of a split). The log count
    // rides along so the Review can show the bill itself was paid.
    const p = src.plan && src.plan.lines[line.id] ? toMonthly(src.plan.lines[line.id].amount, freq) : null;
    const share = p !== null ? p : countedAmount(line, toMonthly(line.estimate, freq));
    if (share !== null) return { amount: share, status: 'computed', from: 'share', count: src.log.counts[line.id] || 0 };
  }
  if (src && src.log.counts[line.id]) return { amount: src.log.byLine[line.id], status: 'computed', from: 'log', count: src.log.counts[line.id] };
  const typed = toMonthly(line.actual, freq);
  // from is null only when nothing at all was typed; a status with no number ("don't know") is still typed.
  return { amount: typed, status: line.actual.status, from: typed === null && line.actual.status === null ? null : 'typed', count: 0 };
}
// A Value answering "doesn't apply": counts as 0 and as complete.
const NOT_FOR_ME = { amount: null, cadence: 'month', status: 'not-for-me', source: 'client', asOf: null, note: '' };

function lineRow(line, freq, src) {
  const oneOffs = [];
  const a = actualOf(line, freq, src);
  // A one-off estimate is always listed; a one-off actual only when it was typed (the log lists its own).
  for (const k of ['estimate', 'actual']) {
    if (k === 'actual' && a.from !== 'typed') continue;
    if (isOneOff(line[k])) oneOffs.push({ which: k, amount: line[k].amount });
  }
  const owed = line.path === 'reimbursable' ? toMonthly(line.owedBack, freq) : null;
  // A split you pay in full counts only your part (S-138, engines/split.js).
  let actual = a.from === 'typed' ? countedAmount(line, a.amount) : a.amount;
  // Reimbursable (typed actuals): counts fully until marked received, then only your share counts.
  // From the log, reimbursements are entries that already reduce the line.
  if (a.from === 'typed' && actual !== null && owed !== null && line.owedBackReceived) actual -= owed;
  return {
    id: line.id, name: line.name, kind: line.kind, need: line.need, savings: line.savings,
    addedFor: line.addedFor || null,
    path: line.path, tag: line.tag, tags: line.tags || [], type: line.type || 'other', joy: line.joy, stress: line.stress === undefined ? null : line.stress, state: line.state, computed: false,
    estimate: countedAmount(line, toMonthly(line.estimate, freq)), actual,
    split: splitOf(line, toMonthly(line.estimate, freq)),
    status: { estimate: line.estimate.status, actual: a.status },
    actualFrom: a.from, logCount: a.count, yearly: isYearlyLine(line),
    // What is still owed back to you; a real 0 once received or when nothing is owed.
    owedOutstanding: owed !== null && !line.owedBackReceived ? owed : 0,
    oneOffs
  };
}

// Debt payments: each debt's minimum, except a debt a budget line pays (the line is the payment,
// S-116), plus each tracked card's computed interest (never typed).
function debtRows(doc) {
  const live = doc.debts.filter((d) => d.state !== 'archived');
  const row = (fields) => ({ type: 'loan', kind: 'fixed', need: true, savings: false, path: 'personal', tag: 'planned', joy: null, stress: null, computed: true, owedOutstanding: 0, oneOffs: [], ...fields });
  const mins = live.filter((d) => !linkedLine(doc, d)).map((d) => {
    // A minimum is a Value in the default 'month' cadence (makeValue), so toMonthly's pay frequency is never
    // consulted and 'monthly' is only a stand-in. sourceStatus keeps the typed minimum's own status (a guessed
    // minimum still shows as a guess although the row is computed).
    const min = toMonthly(d.minimum, 'monthly');
    return row({ id: 'debt:' + d.id, debtId: d.id, name: d.label, state: d.state, estimate: min, actual: min, status: { estimate: 'computed', actual: 'computed' }, sourceStatus: d.minimum.status });
  });
  const ho = interestHandoff(doc, doc.currentMonth);
  const interest = (ho.show ? ho.rows : []).map(({ d, i }) =>
    row({ id: 'interest:' + d.id, debtId: null, interestOf: d.id, name: 'Interest (computed): ' + d.label, state: d.state, estimate: i.amount, actual: i.amount, status: { estimate: 'computed', actual: 'computed' }, sourceStatus: 'computed', why: i.why }));
  return [...mins, ...interest];
}

// Category-level answer first (the client's own words), then the sum of its lines.
function resolveTop(cat, lines, key, freq) {
  // Broken down in Rough: the lines carry the estimate; the category's own first number stays stored, untouched.
  if (hasAnswer(cat[key]) && !(cat.split && key === 'estimate')) {
    return { amount: toMonthly(cat[key], freq), from: 'category', status: cat[key].status };
  }
  const answered = lines.filter((l) => l[key] !== null);
  if (!answered.length) return { amount: null, from: null, status: null };
  return {
    amount: sumKnown(answered.map((l) => l[key])).total,
    from: 'lines',
    status: weakestStatus(answered.map((l) => l.status[key]))
  };
}

/**
 * The budget for the month being worked on: every live category with its lines, estimate, and actual.
 * @param {object} doc the household file
 * @returns {{payFrequency: ?string, categories: Array<object>, oneOffs: Array<object>}} dollars a month;
 *   each category { id, name, type, isDebt, isEverything, notForMe, lines, estimate: {amount, from, status},
 *   actual: {amount, partial, status} }, null amounts where nothing is entered
 */
export function budgetModel(doc) {
  const freq = primaryPayFrequency(doc);
  const prem = premiumFor(doc, freq);
  const handoff = interestHandoff(doc, doc.currentMonth).computed;
  // The month's log, once, for every line (S-087).
  const src = { log: actualsFromTransactions(doc.transactions || [], doc.currentMonth), plan: (doc.plans || {})[doc.currentMonth] || null };
  const cats = [];
  for (const cat of doc.categories) {
    if (cat.state === 'archived') continue;
    const isDebt = cat.id === 'debt';
    // A line added in review for a later month is not part of this month (S-076).
    const lines = isDebt ? debtRows(doc) : cat.lines.filter((l) => l.state !== 'archived' && !(l.addedFor && l.addedFor > doc.currentMonth))
      .map((l) => (PREMIUM_LINE_TYPES.includes(l.type) ? premiumRow(l, freq, src, prem)
        // A typed interest line, once every card's interest is computed (S-120): replaced, never counted twice.
        : l.type === 'interest' && handoff ? { ...lineRow({ ...l, estimate: NOT_FOR_ME, actual: NOT_FOR_ME }, freq, null), covered: 'computed-interest' }
          : lineRow(l, freq, src)));
    const notForMe = cat.estimate.status === 'not-for-me' && !isDebt;
    const row = {
      id: cat.id, name: cat.name, type: isDebt ? 'debt' : (cat.type || 'other'), kind: cat.kind, need: cat.need, savings: cat.savings, tag: cat.tag,
      state: cat.state, isDebt, isEverything: cat.id === 'everything', notForMe, lines
    };
    if (isDebt) {
      // "No debts" said outright is a real 0; debts not entered yet stay null.
      const t = doc.noDebts && !lines.length ? 0 : sumKnown(lines.map((l) => l.actual)).total;
      row.estimate = { amount: t, from: 'debts', status: 'computed' };
      row.actual = { amount: t, partial: lines.some((l) => l.actual === null), status: 'computed' };
    } else if (notForMe) {
      row.estimate = { amount: 0, from: 'category', status: 'not-for-me' };
      row.actual = { amount: 0, partial: false, status: 'not-for-me' };
    } else {
      row.estimate = resolveTop(cat, lines, 'estimate', freq);
      const withActual = lines.filter((l) => l.actual !== null);
      row.actual = {
        amount: withActual.length ? sumKnown(withActual.map((l) => l.actual)).total : null,
        partial: withActual.length > 0 && withActual.length < lines.length,
        status: lines.length ? weakestStatus(lines.map((l) => l.status.actual)) : null
      };
    }
    cats.push(row);
  }
  carveEverything(cats);
  return {
    payFrequency: freq,
    categories: cats,
    oneOffs: cats.flatMap((c) => c.lines.flatMap((l) => l.oneOffs.map((o) => ({ lineId: l.id, name: l.name, category: c.name, ...o }))))
  };
}

/**
 * One stored column per category, by the same rules as the budget's estimate: the
 * category's own answer first, else the sum of its lines; debts are their minimums;
 * "doesn't apply" is 0; archived and parents'-plan lines drop out. A blank line
 * follows its fallback column when one is given. own: the column itself has an
 * answer in this category. Eras reads the dream life through this (S-097), so no
 * budget number ever reads it.
 * @param {object} doc the household file
 * @param {string} key the Value key on each line and category to read ('estimate', or a dream-life column)
 * @param {?string} [fallback=null] the key a blank line falls back to
 * @returns {Array<object>} per category { id, name, type, savings, isDebt, isEverything, amount, from, status,
 *   own, notForMe, lines }: dollars a month, amount null where nothing is entered
 */
export function columnModel(doc, key, fallback = null) {
  const freq = primaryPayFrequency(doc);
  const prem = premiumFor(doc, freq);
  const valueOf = (x) => (hasAnswer(x[key]) || !fallback ? x[key] || NOT_FOR_ME : x[fallback] || NOT_FOR_ME);
  const lineOf = (l) => {
    // A premium line follows health coverage (S-117), whatever the column.
    if (PREMIUM_LINE_TYPES.includes(l.type)) return { id: l.id, name: l.name, [key]: prem.status === 'not-for-me' ? null : prem.amount, status: { [key]: prem.status } };
    const v = valueOf(l);
    return { id: l.id, name: l.name, [key]: countedAmount(l, toMonthly(v, freq)), status: { [key]: v.status } };
  };
  return doc.categories.filter((c) => c.state !== 'archived').map((cat) => {
    const base = { id: cat.id, name: cat.name, type: cat.id === 'debt' ? 'debt' : (cat.type || 'other'), savings: !!cat.savings, isDebt: cat.id === 'debt', isEverything: cat.id === 'everything' };
    if (base.isDebt) {
      const debts = debtRows(doc);
      return { ...base, amount: doc.noDebts && !debts.length ? 0 : sumKnown(debts.map((l) => l.actual)).total, from: 'debts', status: 'computed', own: true, notForMe: false, lines: [] };
    }
    if (cat.estimate.status === 'not-for-me') return { ...base, amount: 0, from: 'category', status: 'not-for-me', own: true, notForMe: true, lines: [] };
    const live = cat.lines.filter((l) => l.state !== 'archived' && !(l.addedFor && l.addedFor > doc.currentMonth));
    const own = hasAnswer(cat[key] || NOT_FOR_ME) || live.some((l) => hasAnswer(l[key] || NOT_FOR_ME));
    const top = resolveTop({ ...cat, [key]: cat[key] || NOT_FOR_ME }, live.map(lineOf), key, freq);
    return { ...base, ...top, own, notForMe: false, lines: live.map(lineOf) };
  });
}

// Single-total households: Everything else = the total minus estimates given
// for other spending categories since. The stored total is never changed.
// Actuals of categories still inside the total draw it down (see totals.js).
function carveEverything(cats) {
  const ev = cats.find((c) => c.isEverything);
  if (!ev) return;
  // Categories with no estimate of their own sit inside the single total.
  const inside = cats.filter((c) => !c.isEverything && !c.savings && !c.isDebt && !c.notForMe && c.estimate.amount === null);
  inside.forEach((c) => { c.insideTotal = true; });
  ev.insideActual = sumKnown(inside.map((c) => c.actual.amount)).total;
  if (ev.estimate.amount === null) return;
  const others = cats.filter((c) => !c.isEverything && !c.savings && c.estimate.amount !== null);
  const carved = sumKnown(others.map((c) => c.estimate.amount)).total || 0;
  // What is left of the total after the carve-outs; overSplit flags carve-outs that already exceed it,
  // and the remainder never goes below 0.
  ev.estimate.total = ev.estimate.amount;
  ev.estimate.carved = carved;
  ev.estimate.overSplit = carved > ev.estimate.amount;
  ev.estimate.amount = Math.max(0, ev.estimate.amount - carved);
}

