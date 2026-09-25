/* The Toolbox: every tool, standalone, sandbox on. */
import { STAGES } from '@/content/stages';
import { href } from '@/app/router';
import { Card } from '../shared/ui';
import { useModel } from '../shared/hooks';

export function Toolbox() {
  const model = useModel();
  const first = model?.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority)[0];
  return (
    <div className="space-y-4">
      <Card title="Toolbox" testId="toolbox">
        <p className="mb-3 text-xs text-slate-500">Every tool works on its own, in a sandbox, for {first ? first.name : 'your #1 business'}. Finishing one checks it off on your pathway.</p>
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
