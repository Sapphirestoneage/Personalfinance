// How filled in is the picture (completion), what to ask next (next three),
// what is too small to chase (small stuff), and the rough-and-unknown list.
// This is about the data, never about how the client is doing.

import { guessFor } from './guesses.js';

export const WEIGHTS = { heavy: 3, medium: 2, light: 1 };
const COMPLETE = new Set(['known', 'roughly', 'not-for-me', 'computed']);
const WEAKNESS = { null: 1, 'dont-know': 1, 'will-email': 0.8, guess: 0.7, roughly: 0.3 };
export const MATERIALITY_FLOOR_YEARLY = 100;

function tierWeight(c) {
  if (c.type === 'housing' || c.isEverything) return WEIGHTS.heavy;
  if (c.type === 'food' || c.type === 'transport' || c.type === 'health') return WEIGHTS.medium;
  return WEIGHTS.light;
}

// Every applicable question, with its weight and current status.
export function questionItems(doc, model, income) {
  const items = [];
  const add = (key, label, path, weight, status, amount) => items.push({ key, label, path, weight, status: status === undefined ? null : status, amount: amount === undefined ? null : amount });

  add('gut', 'Gut number: what you think you spend a month', ['gut'], WEIGHTS.light, doc.gut.status, doc.gut.amount);

  const sources = income.sources;
  if (!sources.length) add('income', 'Take-home pay', ['income'], WEIGHTS.heavy, null, null);
  for (const s of sources) {
    add('income:' + s.id, 'Take-home: ' + s.label, ['income', s.id, 'takeHome'], WEIGHTS.heavy, s.takeHomeStatus, s.takeHomeMonthly);
  }

  for (const c of model.categories) {
    if (c.isDebt) continue;
    const w = tierWeight(c);
    if (c.notForMe) { add('est:' + c.id, c.name + ': estimate', ['categories', c.id, 'estimate'], w, 'not-for-me', 0); continue; }
    const coveredByTotal = doc.settings.singleTotal && !c.isEverything && c.estimate.amount === null;
    if (!coveredByTotal) {
      add('est:' + c.id, c.name + ': estimate', ['categories', c.id, 'estimate'], w, c.estimate.status, c.estimate.amount);
    }
    const lines = c.lines;
    for (const l of lines) {
      add('act:' + l.id, c.name + ' / ' + l.name + ': actual', ['line', l.id, 'actual'], w / lines.length, l.status.actual, l.actual !== null ? l.actual : l.estimate);
    }
  }

  if (doc.noDebts && !doc.debts.length) {
    add('debts', 'Debts: none', ['debts'], WEIGHTS.heavy, 'not-for-me', 0);
  } else if (!doc.debts.filter((d) => d.state !== 'archived').length) {
    add('debts', 'Any debts? (or mark none)', ['debts'], WEIGHTS.heavy, null, null);
  } else {
    for (const d of doc.debts) {
      if (d.state === 'archived') continue;
      add('min:' + d.id, d.label + ': minimum payment', ['debts', d.id, 'minimum'], WEIGHTS.heavy, d.minimum.status, d.minimum.amount);
      // A card linked to an account keeps its balance there (S-084), so it is not asked here.
      if (!(doc.accounts || []).some((a) => a.debtId === d.id && a.state !== 'archived')) add('bal:' + d.id, d.label + ': balance', ['debts', d.id, 'balance'], WEIGHTS.light, d.balance.status, null);
      add('apr:' + d.id, d.label + ': APR', ['debts', d.id, 'apr'], WEIGHTS.light, d.apr.status, null);
    }
  }
  return items;
}

export function completion(items) {
  let done = 0;
  let total = 0;
  for (const it of items) {
    total += it.weight;
    if (COMPLETE.has(it.status)) done += it.weight;
  }
  return { done, total, pct: total ? done / total : 0, answered: items.filter((i) => COMPLETE.has(i.status)).length, count: items.length };
}

// Rank what to firm up next: weight x weakness of status. Items worth less
// than $100 a year go to "small stuff" instead.
export function nextSteps(items, doc, refs) {
  const ranked = [];
  const small = [];
  items.forEach((it, index) => {
    const weakness = WEAKNESS[it.status];
    if (!weakness) return;
    let amount = it.amount;
    if (amount === null && it.key.startsWith('est:') && refs) {
      const cat = doc.categories.find((x) => x.id === it.path[1]);
      const g = cat ? guessFor(doc, cat.id === 'everything' ? 'everything' : cat.type, refs) : null;
      if (g) amount = g.amount;
    }
    const row = { ...it, weakness, score: it.weight * weakness, amountForRanking: amount, index };
    if (amount !== null && amount * 12 < MATERIALITY_FLOOR_YEARLY) small.push(row);
    else ranked.push(row);
  });
  const big = (x) => (x === null ? Infinity : x);
  ranked.sort((a, b) => b.score - a.score || big(b.amountForRanking) - big(a.amountForRanking) || a.index - b.index);
  return { next: ranked.slice(0, 3), more: ranked.slice(3), small };
}

const ROUGH = new Set(['roughly', 'will-email', 'dont-know']);

// Every value marked roughly, will-email, or dont-know, in one place.
export function roughList(doc) {
  const out = [];
  const check = (label, path, v) => { if (v && ROUGH.has(v.status)) out.push({ label, path, status: v.status, amount: v.amount, cadence: v.cadence }); };
  check('Gut number', ['gut'], doc.gut);
  for (const i of doc.income) {
    if (i.state === 'archived') continue;
    check(i.label + ': take-home', ['income', i.id, 'takeHome'], i.takeHome);
    check(i.label + ': gross', ['income', i.id, 'gross'], i.gross);
    for (const d of i.deductions || []) if (d.mode === 'amount') check(i.label + ': ' + (d.label || d.kind) + ' deduction', ['income', i.id, 'deductions', d.id, 'amount'], d.amount);
  }
  for (const c of doc.categories) {
    if (c.state === 'archived') continue;
    check(c.name + ': estimate', ['categories', c.id, 'estimate'], c.estimate);
    for (const l of c.lines) {
      if (l.state === 'archived') continue;
      for (const k of ['estimate', 'actual']) check(c.name + ' / ' + l.name + ': ' + k, ['line', l.id, k], l[k]);
    }
  }
  for (const d of doc.debts) {
    if (d.state === 'archived') continue;
    for (const k of ['balance', 'apr', 'minimum']) check(d.label + ': ' + k, ['debts', d.id, k], d[k]);
  }
  return out;
}

