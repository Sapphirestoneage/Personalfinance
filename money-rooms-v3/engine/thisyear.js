/* This year (MR-081): the twelve-month plan around one focus goal. The
   focus is a flag on an existing goal (record.goals.focus = { id, months });
   its target is the goal's own figure, or a number of lean months when the
   focus is a buffer. The plan says where the household is, the number to
   set aside each month, the three in-year moves from the sensitivity run,
   and when the current allocation lands it. Pure: reads the goal plan the
   engine already computed; the only arithmetic is a gap, a division and a
   sum of three moves. */
import { setGoals } from './record.js';
import { FLOOR_IDS } from './goals.js';
import { addMonths, monthsBetween } from './debtsim.js';

export const MOVE_FAMILIES = Object.freeze(['spend', 'earn', 'keep']); /* moves that pay inside a year; returns and ages do not */

export function focusOf(record) { const f = record.goals && record.goals.focus; return f && f.id ? f : null; }
export function canFocus(item) { return !!item && !FLOOR_IDS.includes(item.id) && item.type !== 'long-term'; }
export function setFocus(record, focus, meta) { return setGoals(record, { focus: focus && focus.id ? { id: focus.id, months: typeof focus.months === 'number' && focus.months > 0 ? focus.months : null } : null }, meta); }

/* The three moves: realistic in-year changes from the sensitivity run, largest first. */
export function movesFor(sens, n) {
  if (!sens || !sens.ranked || !sens.ranked.impact) return null;
  return sens.ranked.impact
    .filter(i => !i.assumption && !i.windfall && !i.barista && !i.aggregate && i.realistic && i.realistic.cents > 0 && MOVE_FAMILIES.includes(i.family))
    .slice(0, n || 3)
    .map(i => ({ id: i.id, row: i.row || null, label: i.label, planet: i.planet, family: i.family, cents: i.realistic.cents, months: i.realistic.months, why: i.realistic.why, rowId: i.rowId || null, field: i.rootId || null }));
}

/* yearPlan(record, result, sens) -> null without a focus, else the plan for the year. sens may be null while the run is still working. */
export function yearPlan(record, result, sens) {
  const f = focusOf(record); const plan = result && result.goalPlan;
  if (!f || !plan) return null;
  const item = plan.input.items.find(i => i.id === f.id);
  if (!item || !canFocus(item)) return null;
  const T = plan.base.targets; const lean = T.step1;
  const months = f.months && lean ? f.months : null;
  const target = months ? Math.round(months * lean) : (typeof item.targetCents === 'number' ? item.targetCents : null);
  const have = item.type === 'debt' ? 0 : (item.balanceCents || 0);
  const from = plan.input.from;
  const by = item.targetDate || addMonths(from, 12);
  const monthsLeft = Math.max(1, monthsBetween(from, by));
  const gap = target === null ? null : Math.max(0, target - have);
  const perMonth = gap === null ? null : Math.ceil(gap / monthsLeft);
  const a = plan.assessment[item.id];
  const lands = a ? (a.status === 'done' ? 'done' : a.finishMonth || null) : null;
  const surplus = plan.surplusKnown ? plan.input.surplusMonthly : null;
  const M = result.metrics || {};
  const runway = M.runway && M.runway.status === 'ok' ? M.runway.value : null;
  const moves = movesFor(sens, 3);
  const movesTotal = moves ? moves.reduce((s, m) => s + m.cents, 0) : null;
  const withMoves = surplus === null || movesTotal === null ? null : surplus + movesTotal;
  return {
    focus: f, item, name: item.name, target, have, gap, by, monthsLeft, perMonth, lands,
    leanMonths: lean && target !== null ? Math.round(target / lean * 10) / 10 : null, targetFromMonths: !!months,
    where: { cash: plan.cashKnown ? plan.base.cash : null, lean, leanRough: !!T.step1Rough, runway, surplus, cashLeanMonths: plan.cashKnown && lean ? Math.round(plan.base.cash / lean * 10) / 10 : null },
    moves, movesTotal, withMoves,
    enough: perMonth === null ? null : surplus !== null && surplus >= perMonth ? 'surplus' : withMoves !== null && withMoves >= perMonth ? 'with-moves' : withMoves === null ? null : 'short',
    shortBy: perMonth !== null && withMoves !== null && withMoves < perMonth ? perMonth - withMoves : 0,
  };
}
