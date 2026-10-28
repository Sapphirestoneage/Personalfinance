// Needs in two passes (owner's ask, 2026-10-28). Pass 1 is seven category totals, one number each, rough allowed:
// Housing, Food, Getting around, Bills and subscriptions, Health, Fun, Other. Each total is an estimate line: an
// expense with `estimate: <category>`, monthly, need or want set by its category (Fun is a want). Pass 2 is the lines
// in each category. One rule for every total in the app: a category counts its lines once any line in it has an
// amount (or is covered); until then it counts the estimate. shadowedEstimate says which estimate is not counted;
// every engine that walks the expenses asks it beside hiddenLine. Pure; no DOM.

import { valueOf as v, fact, round2 } from './spine.js';
import { hiddenLine } from './profile.js';
import { PER_YEAR } from './schema.js';

export const CATEGORIES = [
  { id: 'housing', label: 'Housing', fat: 'accommodation', need: true },
  { id: 'food', label: 'Food', fat: 'food', need: true },
  { id: 'around', label: 'Getting around', fat: 'transportation', need: true },
  { id: 'bills', label: 'Bills and subscriptions', fat: null, need: true },
  { id: 'health', label: 'Health', fat: null, need: true },
  { id: 'fun', label: 'Fun', fat: null, need: false },
  { id: 'other', label: 'Other', fat: null, need: true }
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || null;
const BY_FAT = { accommodation: 'housing', food: 'food', transportation: 'around' };
const HEALTH = /\b(health|medical|doctor|dental|dentist|therap|counsel|prescription|pharmac|gym|fitness|trainer|vision|glasses|contacts)\b/i;
const BILLS = /\b(phone|cell|mobile|wireless|internet|utilit|electric|water|trash|streaming|subscriptions?|netflix|spotify|apps?|software|cloud)\b/i;
const FUN = /\b(fun|entertainment|hobby|hobbies|travel|vacation|trips?|concerts?|games?|going out|bars?|drinks|dates?)\b/i;

// An estimate line: the first-pass number for a whole category.
export const isEstimate = (e) => !!e && typeof e.estimate === 'string' && CATEGORY_IDS.includes(e.estimate);

// Which category a line belongs to: its own category when it has one, else its section (food, housing, getting
// around), else by what it is (a subscription, a phone or internet bill, a health cost, a want), else Other.
export function categoryOf(e) {
  if (!e) return 'other';
  if (isEstimate(e)) return e.estimate;
  if (typeof e.category === 'string' && CATEGORY_IDS.includes(e.category)) return e.category;
  if (e.fat && BY_FAT[e.fat]) return BY_FAT[e.fat];
  const words = (e.label || '') + ' ' + (e.key || '');
  if (e.subscription && v(e.subscription) === true) return 'bills';
  if (HEALTH.test(words)) return 'health';
  if (BILLS.test(words)) return 'bills';
  if (v(e.need) === false || FUN.test(words)) return 'fun';
  return 'other';
}

// The lines of a category: every expense in it that is not an estimate and not hidden by the Profile.
export const linesOf = (spine, catId) => (spine.expenses || []).filter((e) => !isEstimate(e) && !hiddenLine(spine, e) && categoryOf(e) === catId);
// A line with something to count: an amount, or paid by someone else.
const counted = (e) => v(e.amount) !== null || (!!e.covered && v(e.covered) === true);
// A category has lines once one of its lines has an amount (or is covered).
export const hasLines = (spine, catId) => linesOf(spine, catId).some(counted);
// An estimate that is not counted, because its category has lines.
export const shadowedEstimate = (spine, e) => isEstimate(e) && hasLines(spine, e.estimate);
export const estimateOf = (spine, catId) => (spine.expenses || []).find((e) => isEstimate(e) && e.estimate === catId) || null;

// Set a category's first-pass number: value with kind known or rough; null with kind missing (cleared) or notForMe.
// The line is made the first time, named after its category, monthly, need or want by the category.
export function setEstimate(spine, catId, value, kind, today) {
  const cat = categoryById(catId);
  if (!cat) throw new Error('Not a category: ' + catId);
  const k = value === null ? (kind === 'notForMe' ? 'notForMe' : 'missing') : kind === 'rough' ? 'rough' : 'known';
  const amount = { value: k === 'known' || k === 'rough' ? value : null, kind: k, asOf: today, source: 'onboarding' };
  const list = spine.expenses || [];
  const have = estimateOf(spine, catId);
  if (have) {
    const cur = have.amount || {};
    if (cur.value === amount.value && cur.kind === amount.kind) return spine;
    return { ...spine, expenses: list.map((e) => (e === have ? { ...e, amount } : e)) };
  }
  let id = 'est-' + catId, n = 2;
  while (list.some((e) => e.id === id)) id = 'est-' + catId + '-' + n++;
  const line = { id, label: cat.label + ' estimate', estimate: catId, amount, cadence: 'monthly', start: null, end: null, fixed: null, need: fact(cat.need, { kind: 'known', asOf: today, source: 'onboarding' }), fat: cat.fat };
  return { ...spine, expenses: [...list, line] };
}

// Put a line in a category (pass 2: a line added from a category's own Add). null drops the choice.
export function setCategory(spine, id, catId) {
  if (catId !== null && !CATEGORY_IDS.includes(catId)) throw new Error('Not a category: ' + catId);
  return { ...spine, expenses: (spine.expenses || []).map((e) => { if (e.id !== id) return e; const next = { ...e }; if (catId === null) delete next.category; else next.category = catId; return next; }) };
}

// A line's month, as the cash flow counts it when it can be told without the month: the amount by how often.
const monthly = (e) => { const a = v(e.amount); return a === null || !PER_YEAR[e.cadence] ? null : round2(a * PER_YEAR[e.cadence] / 12); };

// Every category side by side: the estimate, the lines and their total, which one the app is using, and the gap.
// cf: this month's cashflow() (its items carry each line's cost to you); without it the lines read their own amounts.
//   { categories: [{ id, label, estimate: { id, path, value, kind } | null, lines: [{ id, label, amount, need, kind }],
//     linesTotal, linesIncomplete, inUse: 'lines' | 'estimate' | 'none', gap, counted }], fromLines, fromEstimates }
export function needsView(spine, cf = null) {
  const cost = new Map();
  if (cf) for (const i of [...(cf.expenses.items || []), ...(cf.expenses.linked || [])]) cost.set(i.id, i.amount);
  const categories = CATEGORIES.map((cat) => {
    const est = estimateOf(spine, cat.id);
    const lines = linesOf(spine, cat.id).map((e) => ({ id: e.id, label: e.label, amount: cost.has(e.id) ? cost.get(e.id) : (e.covered && v(e.covered) === true ? 0 : monthly(e)), need: v(e.need), kind: e.amount ? e.amount.kind : 'missing', estimateLike: false }));
    const known = lines.filter((l) => l.amount !== null);
    const linesTotal = known.length ? round2(known.reduce((a, l) => a + l.amount, 0)) : null;
    const estimate = est ? { id: est.id, path: 'expenses.' + est.id + '.amount', value: v(est.amount), kind: est.amount.kind } : null;
    const inUse = hasLines(spine, cat.id) ? 'lines' : estimate && estimate.value !== null ? 'estimate' : 'none';
    const gap = estimate && estimate.value !== null && linesTotal !== null ? round2(estimate.value - linesTotal) : null;
    return { id: cat.id, label: cat.label, need: cat.need, fat: cat.fat, estimate, lines, linesTotal, linesIncomplete: lines.some((l) => l.amount === null), inUse, gap, counted: inUse === 'lines' ? linesTotal : inUse === 'estimate' ? estimate.value : null };
  });
  return { categories, fromLines: categories.filter((c) => c.inUse === 'lines').length, fromEstimates: categories.filter((c) => c.inUse === 'estimate').length };
}

// The words for which number a category is using, for the small label beside it.
export const inUseWords = (c) => (c.inUse === 'lines' ? 'using the lines' : c.inUse === 'estimate' ? 'using the estimate' : 'nothing yet');
// The gap in words: "$140 not in lines yet", "$30 over the estimate", or null.
export function gapWords(c, money) {
  if (c.gap === null || c.gap === 0) return null;
  return c.gap > 0 ? money(c.gap) + ' not in lines yet' : money(-c.gap) + ' over the estimate';
}
