/* A phone-sized number field. Empty is null, never zero. Shows whether the
   number is hers or an estimate, and where the estimate came from. */
import { useEffect, useState } from 'react';
import type { Assumption } from '@/data/schemas';
import { LABEL_WORDS } from '@/data/assumptions';

interface Props {
  id: string;
  label: string;
  assumption: Assumption | undefined;
  /** how the stored value maps to what she types: cents -> dollars, rate -> percent */
  unit?: 'count' | 'dollars' | 'percent' | 'hours';
  onCommit(value: number | null): void;
}

function toDisplay(value: number | null, unit: Props['unit']): string {
  if (value === null) return '';
  if (unit === 'dollars') return String(Math.round(value) / 100);
  if (unit === 'percent') return String(Math.round(value * 1000) / 10);
  return String(value);
}

function fromDisplay(text: string, unit: Props['unit']): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  if (unit === 'dollars') return Math.round(n * 100);
  if (unit === 'percent') return n / 100;
  return n;
}

export function NumberField({ id, label, assumption, unit = 'count', onCommit }: Props) {
  const stored = assumption?.value ?? null;
  const [text, setText] = useState(toDisplay(stored, unit));
  useEffect(() => setText(toDisplay(stored, unit)), [stored, unit]);
  const yours = assumption?.label === 'Yours';
  const badge = assumption ? LABEL_WORDS[assumption.label] : 'not set';

  const commit = () => {
    const v = fromDisplay(text, unit);
    if (v === undefined) {
      setText(toDisplay(stored, unit));
      return;
    }
    if (v !== stored) onCommit(v);
  };

  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span data-testid={`${id}-label`} className={`rounded-full px-2 py-0.5 text-xs ${yours ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
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
      </span>
      {assumption && !yours && <span className="mt-1 block text-xs text-slate-500">Source: {assumption.source}. Tap to replace with your number.</span>}
    </label>
  );
}
