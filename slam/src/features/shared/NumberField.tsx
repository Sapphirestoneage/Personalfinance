/* A phone-sized number field. Empty is null, never zero. Shows whether the
   number is hers or an estimate, and where the estimate came from. */
import { useEffect, useState } from 'react';
import type { Assumption } from '@/data/schemas';
import { LABEL_WORDS } from '@/data/assumptions';
import type { Unit } from '@/content/fields';

interface Props {
  id: string;
  label: string;
  assumption: Assumption | undefined;
  unit?: Unit;
  help?: string;
  min?: number;
  max?: number;
  onCommit(value: number | null): void;
}

export function toDisplay(value: number | null, unit: Unit): string {
  if (value === null) return '';
  if (unit === 'dollars') return String(Math.round(value) / 100);
  if (unit === 'percent') return String(Math.round(value * 1000) / 10);
  return String(Math.round(value * 100) / 100);
}

export function fromDisplay(text: string, unit: Unit): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  if (unit === 'dollars') return Math.round(n * 100);
  if (unit === 'percent') return n / 100;
  return n;
}

export function NumberField({ id, label, assumption, unit = 'count', help, min, max, onCommit }: Props) {
  const stored = assumption?.value ?? null;
  const [text, setText] = useState(toDisplay(stored, unit));
  useEffect(() => setText(toDisplay(stored, unit)), [stored, unit]);
  const yours = assumption?.label === 'Yours';
  const badge = assumption ? LABEL_WORDS[assumption.label] : 'not set';

  if (unit === 'flag') {
    const on = stored === 1;
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="text-sm font-medium">{label}</span>
        <button type="button" role="switch" aria-checked={on} data-testid={id} onClick={() => onCommit(on ? 0 : 1)} className={`relative h-6 w-11 rounded-full ${on ? 'bg-sky-700' : 'bg-slate-300 dark:bg-slate-700'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-5.5' : 'left-0.5'}`} />
        </button>
      </div>
    );
  }

  const commit = () => {
    let v = fromDisplay(text, unit);
    if (v === undefined) {
      setText(toDisplay(stored, unit));
      return;
    }
    if (v !== null && min !== undefined && v < min) v = min;
    if (v !== null && max !== undefined && v > max) v = max;
    setText(toDisplay(v, unit));
    if (v !== stored) onCommit(v);
  };

  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span data-testid={`${id}-label`} className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${yours ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
          {yours ? 'yours' : `estimate: ${badge}`}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {unit === 'dollars' && <span className="text-slate-500">$</span>}
        <input
          id={id}
          data-testid={id}
          inputMode="decimal"
          type="number"
          step="any"
          value={text}
          placeholder="not yet"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg dark:border-slate-700 dark:bg-slate-900"
        />
        {unit === 'percent' && <span className="text-slate-500">%</span>}
        {unit === 'hours' && <span className="text-slate-500">h</span>}
        {unit === 'months' && <span className="text-slate-500">mo</span>}
        {unit === 'minutes' && <span className="text-slate-500">min</span>}
      </span>
      {help && <span className="mt-1 block text-xs text-slate-500">{help}</span>}
      {assumption && !yours && !help && <span className="mt-1 block text-xs text-slate-500">Source: {assumption.source}.</span>}
    </label>
  );
}
