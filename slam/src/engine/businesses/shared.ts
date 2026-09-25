/* ==========================================================================
   The shape every business model returns for one month, so the aggregate
   (F23) and the scenarios (F24) treat all businesses alike.
   ========================================================================== */
import type { BusinessType, OfferType } from '@/data/schemas';
import type { Book } from '../reader';
import type { CapacityResult } from '../formulas';

export interface GpLine {
  key: string;
  /** plain label, non-explicit */
  label: string;
  units: number;
  revenueCents: number;
  grossProfitCents: number;
}

export interface BusinessMonth {
  type: BusinessType;
  revenueCents: number;
  grossProfitCents: number;
  /** this business's own fixed costs (space, tools); shared fixed costs live on the profile */
  fixedCostsCents: number;
  /** hours the demand asks for, before any allocation */
  hoursNeeded: number;
  /** hours actually used after the cap or the allocation */
  hoursUsed: number;
  hoursLimited: boolean;
  cap: CapacityResult | null;
  /** countable things: sessions, clients, subscribers, calls, regulars */
  volumes: Record<string, number>;
  lines: GpLine[];
  /** economics of one more inquiry or one more person, before any cap */
  perUnit: { unit: string; grossProfitCents: number; sessions: number } | null;
}

/** Offers that apply to a business, keyed by type; absent = not offered. */
export type OfferBooks = Partial<Record<OfferType, Book>>;

export interface MonthContext {
  /** hours this business may use this month; null = unknown, no hour cap */
  sellableHours: number | null;
}

export function sumLines(lines: GpLine[]): { revenueCents: number; grossProfitCents: number } {
  return {
    revenueCents: lines.reduce((s, l) => s + l.revenueCents, 0),
    grossProfitCents: lines.reduce((s, l) => s + l.grossProfitCents, 0),
  };
}

/** Scale every countable thing in a month by one factor (a binding cap). */
export function scaleMonth(m: BusinessMonth, factor: number): BusinessMonth {
  if (factor === 1) return m;
  const volumes: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.volumes)) volumes[k] = v * factor;
  const lines = m.lines.map((l) => ({
    ...l,
    units: l.units * factor,
    revenueCents: l.revenueCents * factor,
    grossProfitCents: l.grossProfitCents * factor,
  }));
  const sums = sumLines(lines);
  return { ...m, ...sums, volumes, lines, hoursUsed: m.hoursNeeded * factor };
}
