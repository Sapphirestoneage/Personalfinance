/* My businesses: active ones in priority order, inactive grayed out below
   with one-tap Add. Links to Setup (ranking) and shared settings. */
import { useAppStore } from '@/data/store';
import { BUSINESS_BLURBS, BUSINESS_NAMES } from '@/content/fields';
import { computeBusinessMonth } from '@/engine/businesses';
import { href } from '@/app/router';
import { Button, Card } from '../shared/ui';
import { useLabelMode, useModel, useSellableHours } from '../shared/hooks';
import { money } from '../shared/format';

export function Businesses() {
  const model = useModel();
  const mode = useLabelMode();
  const sellable = useSellableHours();
  const setActive = useAppStore((s) => s.setBusinessActive);
  if (!model) return null;
  const active = model.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority);
  const inactive = model.businesses.filter((b) => !b.active);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button to="businesses/setup" kind="secondary" testId="to-setup">
          Tick and rank
        </Button>
        <Button to="businesses/settings" kind="secondary" testId="to-settings">
          Shared settings
        </Button>
      </div>
      {active.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300">No business is ticked yet. Add one below or go to Setup.</p>
        </Card>
      )}
      {active.map((b) => {
        const m = computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: sellable });
        return (
          <a key={b.id} href={href(`businesses/${b.id}`)} data-testid={`biz-${b.type}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-semibold">
                #{b.priority} {BUSINESS_NAMES[b.type][mode]}
              </span>
              <span className="text-lg font-semibold tabular-nums">{m.ok ? money(m.value.grossProfitCents, { whole: true }) : 'not yet'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{m.ok ? 'gross profit a month' : `missing: ${m.missing.join(', ')}`}</p>
          </a>
        );
      })}
      {inactive.length > 0 && (
        <div className="space-y-2 opacity-70">
          <p className="px-1 text-xs uppercase tracking-wide text-slate-500">Not counted</p>
          {inactive.map((b) => (
            <div key={b.id} data-testid={`inactive-${b.type}`} className="flex items-center justify-between rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
              <div>
                <div className="font-medium text-slate-500">{BUSINESS_NAMES[b.type][mode]}</div>
                <div className="text-xs text-slate-500">{BUSINESS_BLURBS[b.type]}</div>
              </div>
              <button type="button" data-testid={`add-${b.type}`} onClick={() => void setActive(b.id, true)} className="rounded-full bg-sky-700 px-4 py-2 text-sm font-medium text-white">
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
