/* ==========================================================================
   The snapshot she can send to Sapphire: her settings, businesses, offers,
   week logs and milestones, plus this month's numbers as the engine sees
   them today. Never client records or sales. Plain JSON, neutral name.
   ========================================================================== */
import { aggregateMonth } from '@/engine/aggregate';
import { compareScenarios, defaultScenarios } from '@/engine/scenarios';
import { profileToModel } from './model';
import type { Business, Milestone, Offer, Profile, WeekLog } from './schemas';

export const SNAPSHOT_FORMAT = 'slam-snapshot';

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  createdAt: string;
  note: string;
  profile: Profile;
  businesses: Business[];
  offers: Offer[];
  weekLogs: WeekLog[];
  milestones: Milestone[];
  /** computed today, for reading only; the engine recomputes from the rows */
  thisMonth: unknown;
  scenarios: unknown;
}

export function buildSnapshot(profile: Profile, businesses: Business[], offers: Offer[], weekLogs: WeekLog[], milestones: Milestone[], now: Date = new Date()): Snapshot {
  const model = profileToModel(profile, businesses, offers);
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    createdAt: now.toISOString(),
    note: 'Numbers only. No client records are included.',
    profile,
    businesses,
    offers,
    weekLogs,
    milestones,
    thisMonth: aggregateMonth(model),
    scenarios: compareScenarios(model, defaultScenarios()),
  };
}
