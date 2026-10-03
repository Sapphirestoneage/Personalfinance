/* Where contacts come from. Each source is owned (yours: a list, a site,
   referrals) or rented (a platform, a house, a directory). Shares feed the
   "platform ban" and "house stops" events; platform follower counts add up
   to the business's followers. */
import { useMemo, useState } from 'react';
import { useAppStore } from '@/data/store';
import { SOURCE_TYPES, type Business, type Source, type SourceType } from '@/data/schemas';
import { SOURCE_OWNED_DEFAULT, SOURCE_TYPE_WORDS } from '@/content/fields';
import { yours } from '@/data/assumptions';
import { Button, Note } from '../shared/ui';
import { useLabelMode, newId } from '../shared/hooks';
import { money, percent } from '../shared/format';

const sel = 'w-full rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export function SourcesEditor({ business }: { business: Business }) {
  const allSources = useAppStore((s) => s.sources);
  const sources = useMemo(() => allSources.filter((x) => x.businessId === business.id), [allSources, business.id]);
  const putSource = useAppStore((s) => s.putSource);
  const deleteSource = useAppStore((s) => s.deleteSource);
  const setInput = useAppStore((s) => s.setInput);
  const mode = useLabelMode();
  const [draft, setDraft] = useState<Source | null>(null);
  const audience = business.type === 'content' || business.type === 'regulars';
  const shareTotal = sources.reduce((t, s) => t + (s.shareOfInquiries.value ?? 0), 0);
  const followerTotal = sources.reduce((t, s) => t + (s.followers?.value ?? 0), 0);

  const syncFollowers = async (list: Source[]) => {
    if (!audience) return;
    const total = list.reduce((t, s) => t + (s.followers?.value ?? 0), 0);
    if (list.some((s) => s.followers?.value !== null && s.followers !== undefined)) await setInput(business.id, 'followers', total, 'Yours', 'the sum of your platforms');
  };

  const blank = (): Source => ({
    id: newId('src'),
    profileId: business.profileId,
    businessId: business.id,
    type: audience ? 'platform' : 'referral',
    name: '',
    owned: audience ? false : true,
    costCents: yours('costCents', 0),
    shareOfInquiries: yours('shareOfInquiries', null),
    ...(audience ? { followers: yours('followers', null) } : {}),
    updatedAt: new Date().toISOString(),
  });

  const save = async () => {
    if (!draft) return;
    const row: Source = { ...draft, name: draft.name.trim() || SOURCE_TYPE_WORDS[draft.type]![mode], updatedAt: new Date().toISOString() };
    await putSource(row);
    await syncFollowers([...sources.filter((s) => s.id !== row.id), row]);
    setDraft(null);
  };
  const remove = async (id: string) => {
    await deleteSource(id);
    await syncFollowers(sources.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-3">
      {sources.length === 0 && !draft && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {audience ? 'Add each platform with its followers; the total becomes your followers number.' : 'Where do people find you? Owned sources are yours to keep; rented ones can vanish. The Disaster futures use these shares.'}
        </p>
      )}
      <ul className="space-y-2">
        {sources.map((s) => (
          <li key={s.id} data-testid={`source-${s.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
            <button type="button" onClick={() => setDraft(s)} className="text-left">
              <span className="block font-medium">{s.name}</span>
              <span className="block text-xs text-slate-500">
                {s.owned ? 'Owned' : 'Rented'} · {SOURCE_TYPE_WORDS[s.type]![mode]}
                {audience ? ` · ${s.followers?.value ?? '?'} followers` : ` · ${s.shareOfInquiries.value === null ? 'share not set' : percent(s.shareOfInquiries.value) + ' of contacts'}`}
                {s.costCents.value ? ` · ${money(s.costCents.value, { whole: true })} a month` : ''}
              </span>
            </button>
            <button type="button" aria-label={`remove ${s.name}`} onClick={() => void remove(s.id)} className="ml-2 rounded-full px-2 py-1 text-slate-400">
              ×
            </button>
          </li>
        ))}
      </ul>
      {sources.length > 0 && !audience && shareTotal > 1.0001 && <Note tone="warn">The shares add up to {percent(shareTotal)}; they should add up to 100% or less.</Note>}
      {sources.length > 0 && audience && <p className="text-xs text-slate-500">{followerTotal.toLocaleString('en-US')} followers across {sources.length} platform{sources.length === 1 ? '' : 's'}; that total is your followers number.</p>}
      {draft ? (
        <div className="space-y-2 rounded-xl border border-sky-200 p-3 dark:border-sky-900">
          <label className="block text-sm">
            <span className="font-medium">Kind</span>
            <select
              data-testid="src-type"
              value={draft.type}
              onChange={(e) => {
                const type = e.target.value as SourceType;
                setDraft({ ...draft, type, owned: SOURCE_OWNED_DEFAULT[type] ?? false });
              }}
              className={sel}
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SOURCE_TYPE_WORDS[t]![mode]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Name (no need to be specific)</span>
            <input data-testid="src-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={sel} maxLength={40} placeholder={SOURCE_TYPE_WORDS[draft.type]![mode]} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.owned} onChange={(e) => setDraft({ ...draft, owned: e.target.checked })} className="h-5 w-5" />
            <span>Owned (it cannot be taken away)</span>
          </label>
          {audience ? (
            <label className="block text-sm">
              <span className="font-medium">Followers there</span>
              <input data-testid="src-followers" type="number" inputMode="numeric" value={draft.followers?.value ?? ''} onChange={(e) => setDraft({ ...draft, followers: yours('followers', e.target.value === '' ? null : Number(e.target.value)) })} className={sel} placeholder="not yet" />
            </label>
          ) : (
            <label className="block text-sm">
              <span className="font-medium">Share of your contacts (%)</span>
              <input data-testid="src-share" type="number" inputMode="numeric" value={draft.shareOfInquiries.value === null ? '' : Math.round(draft.shareOfInquiries.value * 100)} onChange={(e) => setDraft({ ...draft, shareOfInquiries: yours('shareOfInquiries', e.target.value === '' ? null : Math.min(1, Math.max(0, Number(e.target.value) / 100))) })} className={sel} placeholder="not yet" />
            </label>
          )}
          <label className="block text-sm">
            <span className="font-medium">What it costs a month ($)</span>
            <input data-testid="src-cost" type="number" inputMode="decimal" value={draft.costCents.value === null ? '' : draft.costCents.value / 100} onChange={(e) => setDraft({ ...draft, costCents: yours('costCents', e.target.value === '' ? null : Math.round(Number(e.target.value) * 100)) })} className={sel} placeholder="0" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button kind="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button testId="src-save" onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <Button kind="secondary" testId="src-add" onClick={() => setDraft(blank())}>
          + Add {audience ? 'a platform' : 'a source'}
        </Button>
      )}
    </div>
  );
}
