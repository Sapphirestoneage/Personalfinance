// A target column on the Budget view (target brief, 2026-10-27). The target is a saved scenario (a copy of the
// household's numbers kept in this browser, ui/plan.js), never a second copy inside My numbers: it is read beside
// today's plan in memory, and only "Step toward target" changes My numbers, by the user's tap, with a dated life change.
//
// Compatibility: lifeChanges gains entries of kind "target" ({ id, date, kind, path, label, from, to, target }); older
// entries (a Profile answer) are unchanged.

import { cashflow } from './cashflow.js';
import { summarize } from './summary.js';
import { payoffPlan } from './debt.js';
import { budgetView } from './budget.js';
import { getAt, valueOf as v, round2, monthKey } from './spine.js';
import { editExpense, editIncome } from './edits.js';

const dollars = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');

// The Target and "To target" columns for every Budget row: { income, cats: Map(key -> { target, words }), lines,
// saving }. A row whose plan the target does not change reads "same".
export function targetColumns(spine, target, rules, { ym = monthKey(spine.meta.asOf), range = 'month', asOf = spine.meta.asOf } = {}) {
  const now = budgetView(spine, rules, { ym, range, asOf });
  const t = budgetView({ ...target, log: spine.log, closes: spine.closes, meta: { ...target.meta, asOf: spine.meta.asOf } }, rules, { ym, range, asOf });
  const words = (plan, tgt, more = 'above', less = 'below') => (plan === null || tgt === null ? 'not set' : Math.abs(plan - tgt) < 1 ? 'same' : dollars(plan - tgt) + ' ' + (plan > tgt ? more : less) + ' target');
  const cats = new Map(now.cats.map((c) => { const x = t.cats.find((y) => y.key === c.key); const tgt = x ? x.plan : 0; return [c.key, { target: tgt, words: words(c.plan, tgt) }]; }));
  const lines = new Map(now.cats.flatMap((c) => c.lines).map((l) => { const x = t.cats.flatMap((c) => c.lines).find((y) => y.id === l.id); const tgt = x ? x.plan : 0; return [l.id, { target: tgt, words: words(l.plan, tgt) }]; }));
  // Income and saving: below target is the gap ("$500 below target" means a raise would close it).
  return {
    income: { target: t.income.plan, words: words(now.income.plan, t.income.plan) },
    saving: { target: t.saving.plan, words: words(now.saving.plan, t.saving.plan) },
    cats, lines
  };
}

// What the target buys, figured by reading the target beside today: the surplus a month, the FI year, and the
// debt-free month when the surplus goes at the debt. { more, fiNow, fiTarget, freeNow, freeTarget, changes, words }.
export function targetBuys(spine, target, rules) {
  const asOf = spine.meta.asOf, year = +asOf.slice(0, 4);
  const tgt = { ...target, meta: { ...target.meta, asOf } };
  const a = summarize(spine, rules, { flags: false }), b = summarize(tgt, rules, { flags: false });
  const more = a.cashflow.surplus.value === null || b.cashflow.surplus.value === null ? null : round2(b.cashflow.surplus.value - a.cashflow.surplus.value);
  const fiYear = (s) => (s.fi.yearsToFi.value === null ? null : Math.floor(year + s.fi.yearsToFi.value));
  const free = (sp, s) => { const extra = Math.max(0, s.cashflow.surplus.value || 0); const p = payoffPlan(sp, rules, { extra, asOf }); return p.neverPaysOff ? null : p.debtFreeYm || null; };
  const fiNow = fiYear(a), fiTarget = fiYear(b), freeNow = free(spine, a), freeTarget = free(tgt, b);
  const parts = [];
  if (more !== null && Math.abs(more) >= 1) parts.push(dollars(more) + (more > 0 ? ' more' : ' less') + ' a month');
  if (fiNow !== null && fiTarget !== null && fiNow !== fiTarget) parts.push('FI ' + fiTarget + ' instead of ' + fiNow);
  if (freeNow && freeTarget && freeNow.slice(0, 4) !== freeTarget.slice(0, 4)) parts.push('debt-free ' + freeTarget.slice(0, 4) + ' instead of ' + freeNow.slice(0, 4));
  return { more, fiNow, fiTarget, freeNow, freeTarget, changes: lineChanges(spine, tgt), words: parts.length ? 'At target: ' + parts.join(', ') + '.' : 'At target: the same as today.' };
}
// Each line the target changes: { path, label, now, target } (bills and income amounts).
export function lineChanges(spine, target) {
  const out = [];
  for (const [coll, field] of [['expenses', 'amount'], ['income', 'amount']]) {
    for (const x of target[coll] || []) {
      const path = coll + '.' + x.id + '.' + field, now = getAt(spine, path);
      const a = now ? v(now) : null, b = v(x[field]);
      if (typeof b === 'number' && a !== b) out.push({ path, id: x.id, coll, label: x.label, now: a, target: b });
    }
  }
  return out;
}

// Where one step lands: all the way, halfway, or an amount toward the target (never past it).
export function stepValue(from, target, how) {
  const gap = target - from;
  return round2(how === 'all' ? target : how === 'half' ? from + gap / 2 : from + Math.sign(gap) * Math.min(Math.abs(gap), Math.abs(Number(how) || 0)));
}
// Step toward the target on one line: all the way, halfway, or an amount ($ toward it). Changes My numbers (Undo
// takes it back) and logs a dated life change; the target stays as set.
export function stepToward(spine, target, path, how, today) {
  const [coll, id] = path.split('.');
  const change = lineChanges(spine, target).find((c) => c.path === path);
  if (!change) return spine;
  const from = change.now ?? 0, to = stepValue(from, change.target, how);
  if (to === from) return spine;
  let s = coll === 'expenses' ? editExpense(spine, id, { amount: to, kind: 'known' }, today) : editIncome(spine, id, { amount: to, kind: 'known' }, today);
  const log = [...(s.lifeChanges || [])];
  log.push({ id: 'lc-' + (log.length + 1), date: today, kind: 'target', path, label: change.label, from, to, target: change.target });
  return { ...s, lifeChanges: log };
}
