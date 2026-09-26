/* The rounds strip: one ring per band, filling as planets finish it. */
import type { RoundState } from '@/engine/levels';

export function Rounds({ rounds, compact = false }: { rounds: RoundState[]; compact?: boolean }) {
  return (
    <ol className={`flex items-start justify-between gap-1 ${compact ? '' : 'px-1'}`} aria-label="Rounds">
      {rounds.map((r) => {
        const share = r.planetsTotal ? r.planetsDone / r.planetsTotal : 0;
        const deg = Math.round(share * 360);
        return (
          <li key={r.band} className="flex flex-1 flex-col items-center text-center" data-testid={`round-${r.band}`}>
            <span
              aria-hidden="true"
              className={`flex ${compact ? 'h-8 w-8' : 'h-11 w-11'} items-center justify-center rounded-full`}
              style={{ background: r.complete ? '#be185d' : `conic-gradient(#ec4899 ${deg}deg, var(--ring-rest) ${deg}deg)` }}
            >
              <span className={`flex ${compact ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'} items-center justify-center rounded-full font-semibold ${r.complete ? 'bg-sky-700 text-white' : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{r.band}</span>
            </span>
            <span className={`mt-1 ${compact ? 'text-[10px]' : 'text-xs'} text-slate-600 dark:text-slate-300`}>{r.name}</span>
            {!compact && <span className="text-[10px] text-slate-500">{r.complete ? 'done' : `${r.planetsDone} of ${r.planetsTotal}`}</span>}
          </li>
        );
      })}
    </ol>
  );
}
