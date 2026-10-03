/* ==========================================================================
   F23: only active businesses enter any total; shared hours are allocated
   in priority order. F05 on the sum.

   Business #1 takes the hours it needs from the sellable hours, #2 gets
   what is left, and so on. In-person recomputes under the hour cap (F04).
   A flat-hour business that gets fewer hours than it asked for is scaled
   by the share it received and flagged `hoursLimited`.
   ========================================================================== */
import { type BusinessMonth, computeBusinessMonth, scaleMonth } from './businesses';
import { monthlyProfit, sellableHoursPerMonth } from './formulas';
import { type ProfileModel, activeInPriorityOrder } from './model';
import { reader } from './reader';
import { type BasedOn, type Result, incomplete, mergeBasedOn, ok } from './types';

export interface BusinessShare {
  id: string;
  name: string;
  type: BusinessMonth['type'];
  priority: number;
  month: BusinessMonth;
  /** share of total gross profit, 0..1 */
  shareOfGp: number;
  hoursAllocated: number | null;
  basedOn: BasedOn;
}

export interface MonthTotals {
  businesses: BusinessShare[];
  revenueCents: number;
  grossProfitCents: number;
  /** shared fixed costs plus every business's own */
  fixedCostsCents: number;
  acquisitionSpendCents: number;
  profitCents: number;
  hoursUsed: number;
  sellableHours: number | null;
  hoursUnknown: boolean;
}

export function aggregateMonth(model: ProfileModel): Result<MonthTotals> {
  const s = reader(model.shared, 'shared.');
  const fixedShared = s.req('fixedCostsCents');
  const acquisitionSpend = s.req('acquisitionSpendCents');
  const hoursKnown = model.shared.availableHoursPerWeek?.value !== null && model.shared.availableHoursPerWeek !== undefined;
  const available = hoursKnown ? s.req('availableHoursPerWeek') : null;
  if (s.missing.length) return incomplete(s.missing);

  const sellableHours = available === null ? null : sellableHoursPerMonth(available);
  let remaining = sellableHours;
  const shares: BusinessShare[] = [];
  const missing: string[] = [];
  const parts: BasedOn[] = [s.basedOn()];

  for (const b of activeInPriorityOrder(model.businesses)) {
    const ctx = { sellableHours: remaining === null ? null : Math.max(0, remaining) };
    const res = computeBusinessMonth(b.type, b.inputs, b.offers, ctx);
    if (!res.ok) {
      missing.push(...res.missing.map((k) => `${b.id}.${k}`));
      continue;
    }
    let month = res.value;
    if (ctx.sellableHours !== null && b.type !== 'inPerson' && month.hoursNeeded > ctx.sellableHours) {
      const factor = month.hoursNeeded > 0 ? ctx.sellableHours / month.hoursNeeded : 1;
      month = { ...scaleMonth(month, factor), hoursLimited: true };
    }
    if (remaining !== null) remaining -= month.hoursUsed;
    shares.push({ id: b.id, name: b.name, type: b.type, priority: b.priority, month, shareOfGp: 0, hoursAllocated: ctx.sellableHours, basedOn: res.basedOn });
    parts.push(res.basedOn);
  }
  if (missing.length) return incomplete(missing);

  const revenueCents = shares.reduce((t, x) => t + x.month.revenueCents, 0);
  const grossProfitCents = shares.reduce((t, x) => t + x.month.grossProfitCents, 0);
  const fixedCostsCents = fixedShared + shares.reduce((t, x) => t + x.month.fixedCostsCents, 0);
  const hoursUsed = shares.reduce((t, x) => t + x.month.hoursUsed, 0);
  for (const x of shares) x.shareOfGp = grossProfitCents > 0 ? x.month.grossProfitCents / grossProfitCents : 0;
  return ok(
    {
      businesses: shares,
      revenueCents,
      grossProfitCents,
      fixedCostsCents,
      acquisitionSpendCents: acquisitionSpend,
      profitCents: monthlyProfit(grossProfitCents, acquisitionSpend, fixedCostsCents),
      hoursUsed,
      sellableHours,
      hoursUnknown: sellableHours === null,
    },
    mergeBasedOn(parts),
  );
}

/** What she keeps after the tax set-aside; a reminder line, never advice. */
export function toKeepAfterSetAside(profitCents: number, taxSetAsideRate: number): { setAsideCents: number; toKeepCents: number } {
  const setAsideCents = Math.max(0, profitCents) * taxSetAsideRate;
  return { setAsideCents, toKeepCents: profitCents - setAsideCents };
}
