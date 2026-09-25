/* Shared settings live once: hours, recovery days (never zero), fixed
   costs, income goal, tax set-aside, cash, hourly value, acquisition. */
import { useAppStore } from '@/data/store';
import { SHARED_FIELDS } from '@/content/fields';
import { NO_ADVICE } from '@/content/credits';
import type { LabelMode } from '@/data/schemas';
import { Card, Disclosure } from '../shared/ui';
import { NumberField } from '../shared/NumberField';
import { useLabelMode } from '../shared/hooks';

export function SharedSettings() {
  const profile = useAppStore((s) => s.profile);
  const setSetting = useAppStore((s) => s.setSetting);
  const setLabelMode = useAppStore((s) => s.setLabelMode);
  const mode = useLabelMode();
  if (!profile) return null;
  return (
    <div className="space-y-4">
      <Card title="Shared settings" testId="shared-settings">
        <p className="mb-3 text-xs text-slate-500">These live once and every business reads them.</p>
        <div className="space-y-4">
          {SHARED_FIELDS.filter((f) => f.tier !== 'more' || mode === 'pro').map((f) => (
            <NumberField key={f.key} id={`shared-${f.key}`} label={f.labels[mode]} help={f.help} unit={f.unit} min={f.min} max={f.max} assumption={profile.settings[f.key]} onCommit={(v) => void setSetting(f.key, v)} />
          ))}
          {mode !== 'pro' && (
            <Disclosure label="More detail" testId="settings-more" count={SHARED_FIELDS.filter((f) => f.tier === 'more').length}>
              <div className="space-y-4">
                {SHARED_FIELDS.filter((f) => f.tier === 'more').map((f) => (
                  <NumberField key={f.key} id={`shared-${f.key}`} label={f.labels[mode]} help={f.help} unit={f.unit} min={f.min} max={f.max} assumption={profile.settings[f.key]} onCommit={(v) => void setSetting(f.key, v)} />
                ))}
              </div>
            </Disclosure>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-500">{NO_ADVICE}</p>
      </Card>
      <Card title="Words on screen">
        <div className="grid grid-cols-3 gap-2">
          {(['plain', 'domme', 'pro'] as LabelMode[]).map((m) => (
            <button key={m} type="button" data-testid={`mode-${m}`} onClick={() => void setLabelMode(m)} className={`rounded-xl px-3 py-2 text-sm font-medium ${mode === m ? 'bg-sky-700 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
              {m === 'plain' ? 'Plain' : m === 'domme' ? 'Domme' : 'Pro'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Plain and Domme say it simply. Pro uses the business words.</p>
      </Card>
    </div>
  );
}
