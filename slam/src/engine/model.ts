/* ==========================================================================
   The engine's view of a profile: plain books, no storage types.
   `data/store.ts` builds this from Dexie rows; tests build it by hand.
   ========================================================================== */
import type { Business, BusinessType, ScenarioKind, ScenarioOverride, SourceType } from '@/data/schemas';
import type { Book } from './reader';
import type { OfferBooks } from './businesses/shared';

/** Where contacts come from, as the engine sees it. */
export interface SourceModel {
  id: string;
  type: SourceType;
  owned: boolean;
  /** share of contacts, 0..1; null when not entered */
  share: number | null;
  followers: number | null;
  costCents: number | null;
}

export interface BusinessModel {
  id: string;
  type: BusinessType;
  name: string;
  active: boolean;
  priority: number;
  inputs: Book;
  offers: OfferBooks;
  scenarioOverrides?: Business['scenarioOverrides'];
  sources?: SourceModel[];
}

/** Share of contacts that come through rented platforms, or through the house; null when no source says. */
export function sourceShare(b: BusinessModel, pick: (s: SourceModel) => boolean): number | null {
  const list = (b.sources ?? []).filter(pick);
  if (!list.length) return null;
  const known = list.filter((s) => s.share !== null);
  if (!known.length) return null;
  return Math.min(1, known.reduce((t, s) => t + (s.share ?? 0), 0));
}

export interface ProfileModel {
  businesses: BusinessModel[];
  /** shared settings: availableHoursPerWeek, recoveryDaysPerWeek, fixedCostsCents,
      incomeGoalCents, taxSetAsideRate, cashOnHandCents, hourlyValueCents,
      acquisitionSpendCents, acquisitionHoursPerMonth */
  shared: Book;
}

export const SHARED_KEYS = [
  'availableHoursPerWeek',
  'recoveryDaysPerWeek',
  'fixedCostsCents',
  'incomeGoalCents',
  'taxSetAsideRate',
  'cashOnHandCents',
  'hourlyValueCents',
  'acquisitionSpendCents',
  'acquisitionHoursPerMonth',
] as const;
export type SharedKey = (typeof SHARED_KEYS)[number];

export function overrideFor(b: BusinessModel, kind: ScenarioKind): ScenarioOverride | undefined {
  return b.scenarioOverrides?.[kind];
}

/** Active businesses in priority order (#1 first). Inactive ones never enter a total. */
export function activeInPriorityOrder(businesses: BusinessModel[]): BusinessModel[] {
  return businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority);
}
