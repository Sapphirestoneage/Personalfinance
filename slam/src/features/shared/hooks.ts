import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { profileToModel } from '@/data/model';
import type { LabelMode } from '@/data/schemas';
import type { ProfileModel } from '@/engine/model';
import { aggregateMonth, type MonthTotals } from '@/engine/aggregate';
import { sellableHoursPerMonth } from '@/engine/formulas';
import type { Result } from '@/engine/types';

export function useLabelMode(): LabelMode {
  return useAppStore((s) => s.profile?.labelMode ?? 'plain');
}

export function useModel(): ProfileModel | null {
  const profile = useAppStore((s) => s.profile);
  const businesses = useAppStore((s) => s.businesses);
  const offers = useAppStore((s) => s.offers);
  const sources = useAppStore((s) => s.sources);
  return useMemo(() => (profile ? profileToModel(profile, businesses, offers, sources) : null), [profile, businesses, offers, sources]);
}

export function useTotals(): Result<MonthTotals> | null {
  const model = useModel();
  return useMemo(() => (model ? aggregateMonth(model) : null), [model]);
}

export function useSellableHours(): number | null {
  const v = useAppStore((s) => s.profile?.settings.availableHoursPerWeek?.value ?? null);
  return v === null ? null : sellableHoursPerMonth(v);
}

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d: Date = new Date()): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
