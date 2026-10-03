/* The Toolbox: every tool, standalone, sandbox on. */
import { useState } from 'react';
import { STAGES } from '@/content/stages';
import { href } from '@/app/router';
import { Card } from '../shared/ui';
import { useModel } from '../shared/hooks';

export function Toolbox() {
  const model = useModel();
  const active = model?.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority) ?? [];
  const [chosen, setChosen] = useState<string>('');
  const first = active.find((b) => b.id === chosen) ?? active[0];
  return (
    <div className="space-y-4">
      <Card title="Toolbox" testId="toolbox">
        <p className="mb-3 text-xs text-slate-500">Every tool works on its own, in a sandbox. Finishing one checks it off on your pathway.</p>
        {active.length > 1 && (
          <label className="mb-3 block text-sm">
            <span className="font-medium">For which business?</span>
            <select data-testid="toolbox-business" value={first?.id ?? ''} onChange={(e) => setChosen(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              {active.map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.priority} {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="space-y-2">
          {STAGES.filter((s) => s.tool !== 'setup').map((s) => (
            <li key={s.tool}>
              <a href={href(`toolbox/${s.tool}${first ? `?business=${first.id}` : ''}`)} data-testid={`tool-${s.tool}`} className="block rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <span className="block font-medium">{s.title}</span>
                <span className="block text-xs text-slate-500">
                  {s.question} About {s.minutes} min.
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
