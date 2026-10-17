// Monthly plans (S-076): doc.plans['YYYY-MM'] = { createdFrom, lines: { key: entry } }.
// key is a line id, or 'cat:<categoryId>' for a category planned as one number.
// entry = { amount: Value, start: Value, decision, reviewed, note, stop }.
// Plans are the only place plan amounts live; estimates are never touched here.
// No math here: amounts arrive as Values worked out by calc.

import { makeValue } from './value.js';
import { addLine, addCategory, findLine } from './edits.js';
import { nextMonthKey } from './months.js';

export const PLAN_DECISIONS = ['keep', 'cut', 'change', 'new'];
const copy = (v) => JSON.parse(JSON.stringify(v));

function entry(value, decision = 'keep') {
  const v = value ? copy(value) : makeValue();
  return { amount: v, start: copy(v), decision, reviewed: false, note: '', stop: false };
}

export function getPlan(doc, month) {
  return (doc.plans || {})[month] || null;
}

// Start a month's plan from a set of Values (from calc: last plan, actuals, or estimates; older plans may say they came from dreams).
export function startPlan(doc, month, createdFrom, values) {
  if (getPlan(doc, month)) throw new Error('There is already a plan for ' + month);
  doc.plans[month] = { createdFrom, lines: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, entry(v)])) };
  return doc.plans[month];
}

function ensure(doc, month, key) {
  if (!doc.plans[month]) doc.plans[month] = { createdFrom: 'manual', lines: {} };
  const p = doc.plans[month];
  if (!p.lines[key]) p.lines[key] = entry(null, 'change');
  return p.lines[key];
}

// Typing a plan amount makes it a change, unless the line is new this month.
export function setPlanAmount(doc, month, key, value) {
  const e = ensure(doc, month, key);
  e.amount = copy(value);
  if (e.decision !== 'new') e.decision = 'change';
}

// Keep: back to the starting amount. Cut: 0, the line stays so a comeback shows.
export function setPlanDecision(doc, month, key, decision) {
  if (!PLAN_DECISIONS.includes(decision)) throw new Error('Unknown decision ' + decision);
  const e = ensure(doc, month, key);
  e.decision = decision;
  if (decision === 'keep') e.amount = copy(e.start);
  if (decision === 'cut') e.amount = makeValue(0, { cadence: 'month' });
  if (decision !== 'cut') e.stop = false;
}

export function setPlanReviewed(doc, month, key, reviewed) {
  ensure(doc, month, key).reviewed = !!reviewed;
}

// Stop tracking from the plan month: the line is archived when that month starts.
export function setPlanStop(doc, month, key, stop) {
  const e = ensure(doc, month, key);
  if (stop && e.decision !== 'cut') throw new Error('Cut the line first');
  e.stop = !!stop;
}

export function setPlanNote(doc, month, key, note) {
  ensure(doc, month, key).note = String(note || '');
}

// A line added in review is a real line in its category, from the plan month on.
// Its estimate stays blank: it was added in review, not guessed.
export function addPlanLine(doc, month, catId, name) {
  const line = addLine(doc, catId, name || 'New line');
  line.addedFor = month;
  ensure(doc, month, line.id).decision = 'new';
  return line;
}

export function addPlanCategory(doc, name) {
  return addCategory(doc, name || 'New category');
}

// A category planned as one number can switch to line by line.
export function planLineByLine(doc, month, catId) {
  const p = getPlan(doc, month);
  if (p) delete p.lines['cat:' + catId];
}

// Copy a plan into the next month: same amounts, every decision back to keep, nothing reviewed.
export function copyPlanForward(doc, month) {
  const p = getPlan(doc, month);
  if (!p) throw new Error('No plan for ' + month);
  const next = nextMonthKey(month);
  if (getPlan(doc, next)) throw new Error('There is already a plan for ' + next);
  const values = Object.fromEntries(Object.entries(p.lines).filter(([, e]) => !e.stop).map(([k, e]) => [k, e.amount]));
  return startPlan(doc, next, 'plan:' + month, values);
}

// When a month becomes the one being worked on, lines its plan stopped are archived.
export function applyPlanStops(doc, month) {
  const p = getPlan(doc, month);
  if (!p) return;
  for (const [k, e] of Object.entries(p.lines)) {
    if (!e.stop || k.startsWith('cat:')) continue;
    const hit = findLine(doc, k);
    if (hit) hit.line.state = 'archived';
  }
}
