/* Setup: tick every business she runs, then drag (or nudge) them into
   priority order. #1 is the main engine. Warn gently above 5 active. */
import { useState } from 'react';
import { useAppStore } from '@/data/store';
import { BUSINESS_BLURBS, BUSINESS_NAMES } from '@/content/fields';
import { navigate } from '@/app/router';
import { Button, Card, Note } from '../shared/ui';
import { useLabelMode } from '../shared/hooks';

export function Setup() {
  const businesses = useAppStore((s) => s.businesses);
  const setActive = useAppStore((s) => s.setBusinessActive);
  const setOrder = useAppStore((s) => s.setPriorityOrder);
  const mode = useLabelMode();
  const [dragging, setDragging] = useState<string | null>(null);
  const ordered = [...businesses].sort((a, b) => a.priority - b.priority);
  const active = ordered.filter((b) => b.active);

  const move = (id: string, dir: -1 | 1) => {
    const ids = active.map((b) => b.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void setOrder([...ids, ...ordered.filter((b) => !b.active).map((b) => b.id)]);
  };
  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const ids = active.map((b) => b.id).filter((x) => x !== dragging);
    ids.splice(ids.indexOf(targetId), 0, dragging);
    void setOrder([...ids, ...ordered.filter((b) => !b.active).map((b) => b.id)]);
    setDragging(null);
  };

  return (
    <div className="space-y-4">
      <Card title="Which businesses do you run?" testId="setup-tick">
        <ul className="space-y-2">
          {ordered.map((b) => (
            <li key={b.id}>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800">
                <input type="checkbox" data-testid={`tick-${b.type}`} checked={b.active} onChange={(e) => void setActive(b.id, e.target.checked)} className="mt-1 h-5 w-5" />
                <span>
                  <span className="block font-medium">{BUSINESS_NAMES[b.type][mode]}</span>
                  <span className="block text-xs text-slate-500">{BUSINESS_BLURBS[b.type]}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {active.length > 5 && <div className="mt-3"><Note tone="warn">More than five at once spreads you thin. Consider parking one.</Note></div>}
      </Card>

      <Card title="Which is #1?" testId="setup-rank">
        <p className="mb-2 text-xs text-slate-500">#1 is your main engine: it gets your hours first and the pathway starts there. Drag, or use the arrows.</p>
        {active.length === 0 ? (
          <p className="text-sm text-slate-500">Tick at least one above.</p>
        ) : (
          <ol className="space-y-2">
            {active.map((b, i) => (
              <li
                key={b.id}
                draggable
                data-testid={`rank-${b.type}`}
                onDragStart={() => setDragging(b.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(b.id)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 ${dragging === b.id ? 'border-sky-500 opacity-60' : 'border-slate-200 dark:border-slate-800'}`}
              >
                <span className="font-medium">
                  #{i + 1} {BUSINESS_NAMES[b.type][mode]}
                </span>
                <span className="flex gap-1">
                  <button type="button" aria-label={`move ${b.name} up`} data-testid={`up-${b.type}`} disabled={i === 0} onClick={() => move(b.id, -1)} className="h-9 w-9 rounded-full border border-slate-300 disabled:opacity-30 dark:border-slate-700">
                    ↑
                  </button>
                  <button type="button" aria-label={`move ${b.name} down`} data-testid={`down-${b.type}`} disabled={i === active.length - 1} onClick={() => move(b.id, 1)} className="h-9 w-9 rounded-full border border-slate-300 disabled:opacity-30 dark:border-slate-700">
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Button testId="setup-done" disabled={active.length === 0} onClick={() => navigate('today')}>
        Done
      </Button>
    </div>
  );
}
