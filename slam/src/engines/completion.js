// How filled in is the picture (completion), what to ask next (next three),
// what is too small to chase (small stuff), and the rough-and-unknown list.
// This is about the data, never about how the client is doing. Depends on
// guesses.js (a national-average guess, to size a blank estimate for ranking)
// and debts.js (linkedLine: a debt a budget line pays is asked on the line).
// Amounts are dollars a month; weights and scores have no unit.

import { guessFor } from './guesses.js';
import { linkedLine } from './debts.js';

export const WEIGHTS = { heavy: 3, medium: 2, light: 1 };
// Statuses that count as answered. "Roughly" is complete for the picture, but still weak enough to rank below.
const COMPLETE = new Set(['known', 'roughly', 'not-for-me', 'computed']);
// How much a status needs firming up, 0 to 1 (not entered is 1). Known, computed and not-for-me
// are absent, so they never rank.
const WEAKNESS = { null: 1, 'dont-know': 1, 'will-email': 0.8, guess: 0.7, roughly: 0.3 };
// Dollars a year. Below this an item is small stuff, not worth a question.
export const MATERIALITY_FLOOR_YEARLY = 100;

function tierWeight(c) {
  if (c.type === 'housing' || c.isEverything) return WEIGHTS.heavy;
  if (c.type === 'food' || c.type === 'transport' || c.type === 'health') return WEIGHTS.medium;
  return WEIGHTS.light;
}

/**
 * Every applicable question, with its weight and current status.
 * @param {object} doc the household document.
 * @param {object} model the budget model (budgetModel in model.js).
 * @param {object} income the income summary (incomeSummary in income.js), take-home in dollars a month.
 * @returns {Array<{key: string, label: string, path: Array, weight: number, status: string|null, amount:
 *   number|null}>} amount is dollars a month (null = not entered), used only to rank; path is where the answer lives in
 *   the doc.
 */
export function questionItems(doc, model, income) {
  const items = [];
  const add = (key, label, path, weight, status, amount) => items.push({ key, label, path, weight, status: status === undefined ? null : status, amount: amount === undefined ? null : amount });

  add('gut', 'Gut number: what you think you spend a month', ['gut'], WEIGHTS.light, doc.gut.status, doc.gut.amount);

  const sources = income.sources;
  // No income source yet: one heavy question stands in for all of them.
  if (!sources.length) add('income', 'Take-home pay', ['income'], WEIGHTS.heavy, null, null);
  for (const s of sources) {
    add('income:' + s.id, 'Take-home: ' + s.label, ['income', s.id, 'takeHome'], WEIGHTS.heavy, s.takeHomeStatus, s.takeHomeMonthly);
  }

  for (const c of model.categories) {
    if (c.isDebt) continue;
    const w = tierWeight(c);
    if (c.notForMe) { add('est:' + c.id, c.name + ': estimate', ['categories', c.id, 'estimate'], w, 'not-for-me', 0); continue; }
    // Single-total households: a blank category estimate is covered by the one total, so it is not a question.
    const coveredByTotal = doc.settings.singleTotal && !c.isEverything && c.estimate.amount === null;
    if (!coveredByTotal) {
      add('est:' + c.id, c.name + ': estimate', ['categories', c.id, 'estimate'], w, c.estimate.status, c.estimate.amount);
    }
    const lines = c.lines;
    // The category's weight is shared across its lines, so ten lines do not outweigh a category with two.
    // A line is sized by its actual, else its estimate.
    for (const l of lines) {
      add('act:' + l.id, c.name + ' / ' + l.name + ': actual', ['line', l.id, 'actual'], w / lines.length, l.status.actual, l.actual !== null ? l.actual : l.estimate);
    }
  }

  // "No debts" is an answer; no debts and no answer is one heavy open question.
  if (doc.noDebts && !doc.debts.length) {
    add('debts', 'Debts: none', ['debts'], WEIGHTS.heavy, 'not-for-me', 0);
  } else if (!doc.debts.filter((d) => d.state !== 'archived').length) {
    add('debts', 'Any debts? (or mark none)', ['debts'], WEIGHTS.heavy, null, null);
  } else {
    for (const d of doc.debts) {
      if (d.state === 'archived') continue;
      // A debt a budget line pays reads its minimum from that line (S-116): asked once, on the line.
      if (!linkedLine(doc, d)) add('min:' + d.id, d.label + ': minimum payment', ['debts', d.id, 'minimum'], WEIGHTS.heavy, d.minimum.status, d.minimum.amount);
      // A card linked to an account keeps its balance there (S-084), so it is not asked here.
      if (!(doc.accounts || []).some((a) => a.debtId === d.id && a.state !== 'archived')) add('bal:' + d.id, d.label + ': balance', ['debts', d.id, 'balance'], WEIGHTS.light, d.balance.status, null);
      add('apr:' + d.id, d.label + ': APR', ['debts', d.id, 'apr'], WEIGHTS.light, d.apr.status, null);
    }
  }
  return items;
}

/**
 * The weighted share of the questions that are answered.
 * @param {Array<object>} items from questionItems.
 * @returns {{done: number, total: number, pct: number, answered: number, count: number}} done and total are summed
 *   weights, pct is done over total (0 to 1, 0 with no items); answered and count are plain counts.
 */
export function completion(items) {
  let done = 0;
  let total = 0;
  for (const it of items) {
    total += it.weight;
    if (COMPLETE.has(it.status)) done += it.weight;
  }
  return { done, total, pct: total ? done / total : 0, answered: items.filter((i) => COMPLETE.has(i.status)).length, count: items.length };
}

/**
 * Rank what to firm up next: weight x weakness of status. Items worth less
 * than $100 a year go to "small stuff" instead.
 * @param {Array<object>} items from questionItems.
 * @param {object} doc the household document.
 * @param {object|null} refs reference data (spending averages), to size a blank estimate; may be null.
 * @returns {{next: Array<object>, more: Array<object>, small: Array<object>}} the top three, the rest, and the small
 *   stuff; each row is the item plus weakness, score and amountForRanking (dollars a month).
 */
export function nextSteps(items, doc, refs) {
  const ranked = [];
  const small = [];
  items.forEach((it, index) => {
    const weakness = WEAKNESS[it.status];
    if (!weakness) return;
    let amount = it.amount;
    // A blank estimate has no dollars to size by, so the national-average guess for its type
    // stands in. Ranking only; nothing is stored.
    if (amount === null && it.key.startsWith('est:') && refs) {
      const cat = doc.categories.find((x) => x.id === it.path[1]);
      const g = cat ? guessFor(doc, cat.id === 'everything' ? 'everything' : cat.type, refs) : null;
      if (g) amount = g.amount;
    }
    const row = { ...it, weakness, score: it.weight * weakness, amountForRanking: amount, index };
    // Materiality is judged a year: $8 a month is $96 a year, under the floor.
    if (amount !== null && amount * 12 < MATERIALITY_FLOOR_YEARLY) small.push(row);
    else ranked.push(row);
  });
  // Ties on score: bigger dollars first, and unknown dollars (null) ahead of any amount since they
  // could be anything; then the order the questions were asked in.
  const big = (x) => (x === null ? Infinity : x);
  ranked.sort((a, b) => b.score - a.score || big(b.amountForRanking) - big(a.amountForRanking) || a.index - b.index);
  return { next: ranked.slice(0, 3), more: ranked.slice(3), small };
}

const ROUGH = new Set(['roughly', 'will-email', 'dont-know']);

/**
 * Every value marked roughly, will-email, or dont-know, in one place.
 * @param {object} doc the household document.
 * @returns {Array<{label: string, path: Array, status: string, amount: number|null, cadence: string}>} amount as
 *   typed, in its own cadence (not normalized to a month).
 */
export function roughList(doc) {
  const out = [];
  const check = (label, path, v) => { if (v && ROUGH.has(v.status)) out.push({ label, path, status: v.status, amount: v.amount, cadence: v.cadence }); };
  check('Gut number', ['gut'], doc.gut);
  for (const i of doc.income) {
    if (i.state === 'archived') continue;
    check(i.label + ': take-home', ['income', i.id, 'takeHome'], i.takeHome);
    check(i.label + ': gross', ['income', i.id, 'gross'], i.gross);
    // A percent deduction has no typed amount to be rough about.
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
    // A linked debt's minimum is the line's estimate, already listed under the line.
    for (const k of ['balance', 'apr', 'minimum']) if (!(k === 'minimum' && linkedLine(doc, d))) check(d.label + ': ' + k, ['debts', d.id, k], d[k]);
  }
  return out;
}

