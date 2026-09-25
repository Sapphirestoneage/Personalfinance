/* ==========================================================================
   The engine's view of a profile: plain books, no storage types.
   `data/store.ts` builds this from Dexie rows; tests build it by hand.
   ========================================================================== */
import type { Business, BusinessType, ScenarioKind, ScenarioOverride } from '@/data/schemas';
import type { Book } from './reader';
import type { OfferBooks } from './businesses/shared';

export interface BusinessModel {
  id: string;
  type: BusinessType;
  name: string;
  active: boolean;
  priority: number;
  inputs: Book;
  offers: OfferBooks;
  scenarioOverrides?: Business['scenarioOverrides'];
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
