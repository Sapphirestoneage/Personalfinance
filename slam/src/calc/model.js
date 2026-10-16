// Turns the stored category tree into monthly numbers: estimate, dream, and
// actual per line and per category. Adds the computed Debt payments lines and
// carves the single "Everything else" total. Archived items drop out here.

import { toMonthly, hasAnswer, isOneOff } from './normalize.js';
import { sumKnown } from './money.js';

const WEAKNESS_ORDER = ['dont-know', 'will-email', null, 'guess', 'roughly', 'known', 'computed', 'not-for-me'];

// The weakest status among several values (used when a category total comes from its lines).
export function weakestStatus(statuses) {
  let best = null;
  let idx = Infinity;
  for (const s of statuses) {
    const i = WEAKNESS_ORDER.indexOf(s);
    if (i < idx) { idx = i; best = s; }
  }
  return best;
}

export function primaryPayFrequency(doc) {
  const inc = doc.income.find((i) => i.state !== 'archived');
  return inc ? inc.payFrequency : null;
}

function lineRow(line, freq) {
  const oneOffs = [];
  for (const k of ['estimate', 'dream', 'actual']) {
    if (isOneOff(line[k])) oneOffs.push({ which: k, amount: line[k].amount });
  }
  const owed = line.path === 'reimbursable' ? toMonthly(line.owedBack, freq) : null;
  let actual = toMonthly(line.actual, freq);
  // Reimbursable: counts fully until marked received, then only your share counts.
  if (actual !== null && owed !== null && line.owedBackReceived) actual -= owed;
  return {
    id: line.id, name: line.name, kind: line.kind, need: line.need, savings: line.savings,
    path: line.path, tag: line.tag, tags: line.tags || [], type: line.type || 'other', joy: line.joy, state: line.state, computed: false,
    estimate: toMonthly(line.estimate, freq), dream: toMonthly(line.dream, freq), actual,
    status: { estimate: line.estimate.status, dream: line.dream.status, actual: line.actual.status },
    owedOutstanding: owed !== null && !line.owedBackReceived ? owed : 0,
    oneOffs
  };
}

function debtRows(doc) {
  return doc.debts.filter((d) => d.state !== 'archived').map((d) => {
    const min = toMonthly(d.minimum, 'monthly');
    return {
      id: 'debt:' + d.id, debtId: d.id, name: d.label, type: 'loan', kind: 'fixed', need: true, savings: false,
      path: 'personal', tag: 'planned', joy: null, state: d.state, computed: true,
      estimate: min, dream: min, actual: min,
      status: { estimate: 'computed', dream: 'computed', actual: 'computed' },
      sourceStatus: d.minimum.status, owedOutstanding: 0, oneOffs: []
    };
  });
}

// Category-level answer first (the client's own words), then the sum of its lines.
function resolveTop(cat, lines, key, freq) {
  if (hasAnswer(cat[key])) {
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

export function budgetModel(doc) {
  const freq = primaryPayFrequency(doc);
  const cats = [];
  for (const cat of doc.categories) {
    if (cat.state === 'archived') continue;
    const isDebt = cat.id === 'debt';
    const lines = isDebt ? debtRows(doc) : cat.lines.filter((l) => l.state !== 'archived').map((l) => lineRow(l, freq));
    const notForMe = cat.estimate.status === 'not-for-me' && !isDebt;
    const row = {
      id: cat.id, name: cat.name, type: isDebt ? 'debt' : (cat.type || 'other'), kind: cat.kind, need: cat.need, savings: cat.savings, tag: cat.tag,
      state: cat.state, isDebt, isEverything: cat.id === 'everything', notForMe, lines
    };
    if (isDebt) {
      const t = doc.noDebts && !lines.length ? 0 : sumKnown(lines.map((l) => l.actual)).total;
      row.estimate = { amount: t, from: 'debts', status: 'computed' };
      row.dream = { amount: t, from: 'debts', status: 'computed' };
      row.actual = { amount: t, partial: lines.some((l) => l.actual === null), status: 'computed' };
    } else if (notForMe) {
      row.estimate = { amount: 0, from: 'category', status: 'not-for-me' };
      row.dream = { amount: 0, from: 'category', status: 'not-for-me' };
      row.actual = { amount: 0, partial: false, status: 'not-for-me' };
    } else {
      row.estimate = resolveTop(cat, lines, 'estimate', freq);
      row.dream = resolveTop(cat, lines, 'dream', freq);
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
  ev.estimate.total = ev.estimate.amount;
  ev.estimate.carved = carved;
  ev.estimate.overSplit = carved > ev.estimate.amount;
  ev.estimate.amount = Math.max(0, ev.estimate.amount - carved);
}
