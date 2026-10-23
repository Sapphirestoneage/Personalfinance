// Months. The month being worked on keeps its actuals on the lines; every other
// open month keeps them in monthActuals[YYYY-MM], so each fact lives in one place.
// A closed month is a locked snapshot of estimate and actual per line and
// category. The snapshot is never edited; late entries go into a separate
// "revised" record next to it. Needs plans.js (applyPlanStops, run whenever a month becomes the
// one being worked on); plans.js imports nextMonthKey back (a harmless cycle: no call at load time).

import { applyPlanStops } from './plans.js';

// A Value with no amount and no status is not entered; a typed 0 or "doesn't apply" is an answer.
const blank = () => ({ amount: null, cadence: 'month', status: null, source: 'client', asOf: null, note: '' });
const isBlankValue = (v) => !v || (v.amount === null && v.status === null);

function allLines(doc) {
  return doc.categories.flatMap((c) => c.lines);
}

// Put the lines' actuals away under the month they belong to.
function stashCurrent(doc) {
  const saved = {};
  for (const l of allLines(doc)) if (!isBlankValue(l.actual)) saved[l.id] = l.actual;
  if (Object.keys(saved).length) doc.monthActuals[doc.currentMonth] = saved;
  else delete doc.monthActuals[doc.currentMonth];
}

function loadMonth(doc, key) {
  const saved = doc.monthActuals[key] || {};
  for (const l of allLines(doc)) l.actual = saved[l.id] || blank();
  delete doc.monthActuals[key];
  doc.currentMonth = key;
  applyPlanStops(doc, key);
}

// Work on a different month. What was entered for the month you leave is kept.
export function switchMonth(doc, key) {
  if (!/^\d{4}-\d{2}$/.test(key)) throw new Error('Pick a month and a year');
  if (key === doc.currentMonth) return;
  if (doc.months.some((m) => m.key === key)) throw new Error(key + ' is closed. View it in Past months on Review.');
  stashCurrent(doc);
  loadMonth(doc, key);
}

// Fixed costs rarely change: copy them from the latest earlier month that has them.
export function copyFixedFromLastMonth(doc) {
  const earlier = Object.keys(doc.monthActuals).filter((k) => k < doc.currentMonth).sort();
  const closed = doc.months.filter((m) => m.key < doc.currentMonth).map((m) => m.key);
  const from = [...earlier, ...closed].sort().pop();
  if (!from) return null;
  const rec = doc.months.find((m) => m.key === from);
  let copied = 0;
  for (const l of allLines(doc)) {
    // Only blank fixed lines are filled; a typed actual is never overwritten. A snapshot holds plain
    // numbers, so a copy from a closed month is rebuilt as a known Value; an open month's Value is copied whole.
    if (l.kind !== 'fixed' || !isBlankValue(l.actual)) continue;
    const v = rec ? (rec.snapshot.lines[l.id] && rec.snapshot.lines[l.id].actual !== null ? { ...blank(), amount: rec.snapshot.lines[l.id].actual, status: 'known', note: 'Copied from ' + from } : null)
      : (doc.monthActuals[from][l.id] ? { ...doc.monthActuals[from][l.id], note: 'Copied from ' + from } : null);
    if (v) { l.actual = v; copied += 1; }
  }
  return { from, copied };
}

export function nextMonthKey(key) {
  let [y, m] = key.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}

// snapshot comes from the engines (monthSnapshot in engines/history.js) so the store never does math.
export function closeMonth(doc, snapshot, nowIso) {
  const key = doc.currentMonth;
  if (doc.months.some((m) => m.key === key)) throw new Error('Month ' + key + ' is already closed');
  doc.months.push({ key, closedAt: nowIso, snapshot: deepFreezeCopy(snapshot), revised: { lines: {} } });
  doc.months.sort((a, b) => (a.key < b.key ? -1 : 1));
  const next = nextMonthKey(key);
  // If the next month already has its own actuals, load them; otherwise the
  // closed month's numbers carry forward as a starting point (S-007).
  if (doc.monthActuals[next]) loadMonth(doc, next);
  else { doc.currentMonth = next; applyPlanStops(doc, next); }
  return key;
}

// Record a late actual for one line of a closed month. The original stays as it was. amount is a
// plain number; engines/history.js reads it in place of the snapshot's line actual.
export function reviseMonth(doc, key, lineId, amount, nowIso) {
  const rec = doc.months.find((m) => m.key === key);
  if (!rec) throw new Error('Month ' + key + ' is not closed');
  if (!rec.snapshot.lines[lineId]) throw new Error('Line ' + lineId + ' was not in month ' + key);
  rec.revised.lines[lineId] = { amount, at: nowIso };
}

// A detached copy: the snapshot shares nothing with the live document. Nothing is Object.frozen;
// the store simply never writes to it.
function deepFreezeCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}
