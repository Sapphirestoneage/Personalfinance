/* The planets by bands view: five planets across, five bands down, one
   dot per level. Tap a level to run it. Below, the readings each band
   unlocks, with what each is still waiting on. */
import { useState } from 'react';
import { BANDS, PLANETS } from '@/content/levels';
import { href } from '@/app/router';
import { Button, Card } from '../shared/ui';
import { useModel } from '../shared/hooks';
import { Rounds } from './Rounds';
import { Viz } from '../shared/Viz';
import { useLevels } from './useLevels';

const DOT: Record<string, string> = {
  done: 'bg-sky-700',
  partly: 'bg-sky-300',
  open: 'border-2 border-slate-300 dark:border-slate-600',
  absent: 'opacity-0',
};

export function Levels() {
  const model = useModel();
  const active = model?.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority) ?? [];
  const [chosen, setChosen] = useState<string>('');
  const business = active.find((b) => b.id === chosen) ?? active[0];
  const { overview } = useLevels(business?.id);
  if (!business || !overview) {
    return (
      <Card title="Levels">
        <p className="text-sm text-slate-600 dark:text-slate-300">Tick a business first; the levels are its numbers, planet by planet.</p>
        <div className="mt-3">
          <Button to="businesses/setup">Go to Setup</Button>
        </div>
      </Card>
    );
  }
  const q = `?business=${business.id}`;
  return (
    <div className="space-y-4">
      <Card title="Rounds" testId="levels" action={<span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{overview.doneCount} of {overview.total} levels</span>}>
        {active.length > 1 && (
          <select data-testid="levels-business" value={business.id} onChange={(e) => setChosen(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            {active.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.priority} {b.name}
              </option>
            ))}
          </select>
        )}
        <Rounds rounds={overview.rounds} />
        <p className="mt-3 text-xs text-slate-500">A round is a band finished on every planet. Nothing is locked: every reading exists from the first minute as an estimate and becomes yours as its levels are done.</p>
      </Card>

      <Card title="Planets by bands" testId="grid">
        <div className="grid grid-cols-[3.4rem_repeat(5,1fr)] gap-y-2 text-center text-xs">
          <div />
          {PLANETS.map((p) => (
            <div key={p.id} className="font-medium text-slate-600 dark:text-slate-300">
              {p.name}
            </div>
          ))}
          {BANDS.map((b) => (
            <div key={b.band} className="contents">
              <div className="text-left">
                <div className="font-medium">{b.band}</div>
                <div className="text-[10px] text-slate-500">{b.name}</div>
              </div>
              {PLANETS.map((p) => {
                const cell = overview.grid.find((g) => g.band === b.band && g.planet === p.id)!;
                const level = cell.levels[0];
                if (!level) return <div key={p.id} className="flex items-center justify-center text-slate-300 dark:text-slate-700">·</div>;
                return (
                  <a key={p.id} href={href(`levels/${level.level.id}${q}`)} data-testid={`cell-${level.level.id}`} aria-label={`${level.level.title}, ${level.status}`} className="flex items-center justify-center py-1">
                    <span className={`inline-block h-5 w-5 rounded-full ${DOT[level.status]}`} />
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Filled: done. Pale: partly. Ring: open. Tap any to run it.</p>
      </Card>

      {overview.next.length > 0 && (
        <Card title="Next up" testId="next-levels">
          <ul className="space-y-2">
            {overview.next.slice(0, 3).map((l) => (
              <li key={l.level.id}>
                <a href={href(`levels/${l.level.id}${q}`)} data-testid={`next-${l.level.id}`} className="block rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <span className="block text-sm font-medium">{l.level.title}</span>
                  <span className="block text-xs text-slate-500">
                    Round {l.level.band} · {PLANETS.find((p) => p.id === l.level.planet)!.name} · about {l.level.minutes} min
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Levels done, by band" testId="levels-viz">
        <Viz
          id="levels-by-band"
          kinds={['column', 'bar']}
          rows={BANDS.map((b) => ({ label: b.name, value: overview.levels.filter((l) => l.level.band === b.band && l.status === 'done').length, emphasis: overview.rounds.find((r) => r.band === b.band)?.complete }))}
          format={(v) => `${v}`}
          summary={`${overview.doneCount} of ${overview.total} levels done: ${overview.rounds.map((r) => `${r.name} ${r.planetsDone} of ${r.planetsTotal}`).join(', ')}.`}
        />
      </Card>

      <Card title="What the levels unlock" testId="readings">
        {BANDS.map((b) => {
          const mine = overview.readings.filter((r) => r.reading.tier === b.band);
          if (!mine.length) return null;
          return (
            <div key={b.band} className="mb-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                Tier {b.band}: {b.name}
              </p>
              <ul className="space-y-1">
                {mine.map((r) => (
                  <li key={r.reading.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <a href={href(r.reading.to)} className="underline decoration-slate-300 dark:decoration-slate-700">
                      {r.reading.label}
                    </a>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${r.status === 'yours' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`} title={r.waitingOn.map((l) => l.title).join(', ')}>
                      {r.status === 'yours' ? 'yours' : `estimate · ${r.waitingOn.length} to go`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
