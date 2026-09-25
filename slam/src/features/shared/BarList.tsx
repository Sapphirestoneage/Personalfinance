/* A list of labeled bars in plain HTML: labels wrap, values sit at the
   end, negatives run left from a zero line. Used where a lever list
   reads better than a chart. */
export interface BarListRow {
  label: string;
  value: number;
  emphasis?: boolean;
}

interface Props {
  rows: BarListRow[];
  format(v: number): string;
  summary?: string;
  testId?: string;
}

export function BarList({ rows, format, summary, testId }: Props) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  const hasNeg = rows.some((r) => r.value < 0);
  return (
    <figure data-testid={testId}>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = (Math.abs(r.value) / max) * (hasNeg ? 50 : 100);
          return (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={r.emphasis ? 'font-semibold' : ''}>{r.label}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${r.value < 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>{format(r.value)}</span>
              </div>
              <div className="relative mt-1 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                {hasNeg && <span className="absolute left-1/2 top-0 h-2 w-px bg-slate-300 dark:bg-slate-600" />}
                <span
                  className={`absolute top-0 h-2 rounded-full ${r.value < 0 ? 'bg-amber-400/70' : r.emphasis ? 'bg-sky-700' : 'bg-sky-300'}`}
                  style={hasNeg ? (r.value < 0 ? { right: '50%', width: `${pct}%` } : { left: '50%', width: `${pct}%` }) : { left: 0, width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {summary && <figcaption className="mt-2 text-sm text-slate-600 dark:text-slate-300">{summary}</figcaption>}
    </figure>
  );
}
