/* The 60-second check-in: this week's counts, tapped in. "+1 contact" is
   the two-tap inquiry log: open Today, tap once. */
import { useState } from 'react';
import { useAppStore } from '@/data/store';
import type { WeekLog } from '@/data/schemas';
import { Button, Card, Note } from '../shared/ui';
import { newId, weekStartOf } from '../shared/hooks';

function Counter({ label, value, onChange, testId }: { label: string; value: number | null; onChange: (v: number | null) => void; testId: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label={`${label} minus one`} onClick={() => onChange(value === null ? null : Math.max(0, value - 1))} className="h-10 w-10 rounded-full border border-slate-300 text-lg dark:border-slate-700">
          -
        </button>
        <span data-testid={testId} className="w-8 text-center text-lg tabular-nums">
          {value === null ? '·' : value}
        </span>
        <button type="button" aria-label={`${label} plus one`} data-testid={`${testId}-plus`} onClick={() => onChange((value ?? 0) + 1)} className="h-10 w-10 rounded-full bg-sky-700 text-lg text-white">
          +
        </button>
      </span>
    </div>
  );
}

export function CheckIn() {
  const profile = useAppStore((s) => s.profile);
  const weekLogs = useAppStore((s) => s.weekLogs);
  const putWeekLog = useAppStore((s) => s.putWeekLog);
  const week = weekStartOf();
  const existing = weekLogs.find((w) => w.weekStart === week && !w.businessId);
  const [draft, setDraft] = useState<WeekLog | null>(null);
  const [saved, setSaved] = useState(false);
  if (!profile) return null;

  const base: WeekLog = existing ?? {
    id: newId('w'),
    profileId: profile.id,
    weekStart: week,
    inquiries: null,
    bookings: null,
    sessionsHeld: null,
    reachActions: null,
    revenueCents: null,
    hours: null,
    energy: null,
    checkedIn: false,
    loggedAt: new Date().toISOString(),
  };
  const log = draft ?? base;
  const set = (patch: Partial<WeekLog>) => setDraft({ ...log, ...patch });

  const plusOne = async () => {
    const next: WeekLog = { ...log, inquiries: (log.inquiries ?? 0) + 1, loggedAt: new Date().toISOString() };
    setDraft(next);
    await putWeekLog(next);
  };

  const save = async () => {
    await putWeekLog({ ...log, checkedIn: true, loggedAt: new Date().toISOString() });
    setDraft(null);
    setSaved(true);
  };

  return (
    <Card title="60-second check-in" testId="checkin">
      <p className="mb-3 text-xs text-slate-500">Week of {week}. Tap what happened; leave what you do not know.</p>
      <div className="space-y-2">
        <Counter label="Contacts" value={log.inquiries} onChange={(v) => set({ inquiries: v })} testId="ci-inquiries" />
        <Counter label="Bookings" value={log.bookings} onChange={(v) => set({ bookings: v })} testId="ci-bookings" />
        <Counter label="Sessions or calls held" value={log.sessionsHeld} onChange={(v) => set({ sessionsHeld: v })} testId="ci-sessions" />
        <Counter label="Reach actions (posts, messages)" value={log.reachActions} onChange={(v) => set({ reachActions: v })} testId="ci-reach" />
        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
          <span className="text-sm font-medium">Energy</span>
          <span className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`energy ${n}`} onClick={() => set({ energy: n })} className={`h-9 w-9 rounded-full text-sm ${log.energy === n ? 'bg-sky-700 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
                {n}
              </button>
            ))}
          </span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button kind="secondary" testId="plus-contact" onClick={() => void plusOne()}>
          +1 contact
        </Button>
        <Button testId="save-checkin" onClick={() => void save()}>
          {existing ? 'Update' : 'Save check-in'}
        </Button>
      </div>
      {saved && (
        <div className="mt-3">
          <Note tone="good" testId="checkin-saved">
            Saved. {profile.checkInCount} check-in{profile.checkInCount === 1 ? '' : 's'} so far.
          </Note>
        </div>
      )}
    </Card>
  );
}
