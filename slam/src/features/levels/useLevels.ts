import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { levelsOverview, type Facts, type LevelsOverview } from '@/engine/levels';
import { useModel } from '../shared/hooks';

/** The level overview for one business (default: #1). */
export function useLevels(businessId?: string | null): { overview: LevelsOverview | null; facts: Facts | null } {
  const profile = useAppStore((s) => s.profile);
  const clients = useAppStore((s) => s.clients);
  const weekLogs = useAppStore((s) => s.weekLogs);
  const model = useModel();
  return useMemo(() => {
    if (!profile || !model) return { overview: null, facts: null };
    const active = model.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority);
    const business = model.businesses.find((b) => b.id === businessId) ?? active[0];
    if (!business) return { overview: null, facts: null };
    const facts: Facts = { profile, business, shared: model.shared, clients, weekLogs };
    return { overview: levelsOverview(facts), facts };
  }, [profile, model, clients, weekLogs, businessId]);
}
