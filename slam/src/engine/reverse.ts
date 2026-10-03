/* ==========================================================================
   F10 for a business: from the month's per-inquiry economics (before any
   cap) to the inquiries a profit goal needs, with the capacity check.
   Volume advice never exceeds capacity: when the goal is beyond it the
   result says so and gives the most the capacity allows.
   ========================================================================== */
import { computeBusinessMonth } from './businesses';
import { reverseSolve, type ReverseSolveResult } from './formulas';
import type { BusinessModel } from './model';
import { reader, type Book } from './reader';
import { type Result, incomplete, mergeBasedOn, ok } from './types';

export interface ReverseForGoal extends ReverseSolveResult {
  unit: string;
}

export function inquiriesForGoal(b: BusinessModel, shared: Book, goalCents: number): Result<ReverseForGoal> {
  const s = reader(shared, 'shared.');
  const fixed = s.req('fixedCostsCents');
  const acq = s.req('acquisitionSpendCents');
  if (s.missing.length) return incomplete(s.missing);
  const hoursRaw = shared.availableHoursPerWeek?.value;
  const sellable = hoursRaw === null || hoursRaw === undefined ? null : (hoursRaw * 52) / 12;
  const m = computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: sellable });
  if (!m.ok) return incomplete(m.missing);
  const per = m.value.perUnit;
  if (!per) return incomplete([`${b.id}.inquiriesPerMonth`]);
  const r = reverseSolve({
    goalCents,
    fixedCostsCents: fixed + m.value.fixedCostsCents,
    acquisitionSpendCents: acq,
    gpPerInquiryCents: per.grossProfitCents,
    sessionsPerInquiry: per.sessions,
    capacitySessions: m.value.cap?.capacity ?? null,
  });
  if (!r) return incomplete([`${b.id}.grossProfitPerInquiry`]);
  return ok({ ...r, unit: per.unit }, mergeBasedOn([s.basedOn(), m.basedOn]));
}
