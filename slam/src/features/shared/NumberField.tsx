/* A phone-sized number field. Empty is null, never zero. Shows whether the
   number is hers or an estimate, and where the estimate came from. */
import { useEffect, useState } from 'react';
import type { Assumption } from '@/data/schemas';
import { LABEL_WORDS } from '@/data/assumptions';
import type { Unit } from '@/content/fields';
import type { FieldHelp } from '@/content/help';

interface Props {
  id: string;
  label: string;
  assumption: Assumption | undefined;
  unit?: Unit;
  help?: string;
  min?: number;
  max?: number;
  /** a tool's own question: no yours/estimate badge, just the answer */
  plain?: boolean;
  /** the "Not sure?" panel */
  guide?: FieldHelp;
  /** the typical number, offered as a one-tap fallback */
  typical?: number | null;
  onCommit(value: number | null): void;
  /** set the typical number as an estimate (not hers) */
  onUseTypical?(value: number): void;
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

export function NumberField({ id, label, assumption, unit = 'count', help, min, max, plain = false, guide, typical, onCommit, onUseTypical }: Props) {
  const stored = assumption?.value ?? null;
  const [text, setText] = useState(toDisplay(stored, unit));
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => setText(toDisplay(stored, unit)), [stored, unit]);
  const yours = assumption?.label === 'Yours';
  const badge = assumption ? LABEL_WORDS[assumption.label] : 'not set';

  if (unit === 'rating') {
    const lo = min ?? 1;
    const hi = max ?? 5;
    const steps = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    return (
      <div>
        <span className="mb-1 block text-sm font-medium">{label}</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label={label} data-testid={id}>
          {steps.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stored === n} data-testid={`${id}-${n}`} onClick={() => onCommit(n)} className={`h-11 flex-1 rounded-xl text-base font-medium ${stored === n ? 'bg-sky-700 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
              {n}
            </button>
          ))}
        </div>
        {help && <span className="mt-1 block text-xs text-slate-500">{help}</span>}
      </div>
    );
  }

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
        {/* fixed width, so the label never re-wraps when a number becomes hers (a moving button loses taps) */}
        {!plain && (
          <span data-testid={`${id}-label`} className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs ${yours ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
            {yours ? 'yours' : 'estimate'}
          </span>
        )}
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
      {/* always one line here, so the field never changes height when a number becomes hers */}
      <span className="mt-1 flex min-h-4 items-start justify-between gap-2 text-xs text-slate-500">
        <span>{help ?? (assumption && !plain ? (yours ? 'Your number.' : `${badge.charAt(0).toUpperCase() + badge.slice(1)}: ${assumption.source}.`) : '')}</span>
        {guide && (
          <button type="button" data-testid={`${id}-notsure`} aria-expanded={showGuide} onClick={(e) => { e.preventDefault(); setShowGuide(!showGuide); }} className="shrink-0 whitespace-nowrap text-sky-700 underline decoration-dotted dark:text-sky-300">
            {showGuide ? 'Got it' : 'Not sure?'}
          </button>
        )}
      </span>
      {guide && showGuide && (
        <span data-testid={`${id}-guide`} className="mt-2 block space-y-1.5 rounded-xl bg-sky-50 p-3 text-xs text-slate-700 dark:bg-sky-950/40 dark:text-slate-200">
          <span className="block"><strong>What counts.</strong> {guide.what}</span>
          <span className="block"><strong>Where to look.</strong> {guide.where}</span>
          <span className="block"><strong>No idea?</strong> {guide.unsure}</span>
          {typical !== null && typical !== undefined && onUseTypical && !(assumption?.label !== 'Yours' && assumption?.value === typical) && (
            <button type="button" data-testid={`${id}-typical`} onClick={(e) => { e.preventDefault(); onUseTypical(typical); setShowGuide(false); }} className="mt-1 block rounded-lg border border-sky-300 px-3 py-1.5 font-medium text-sky-800 dark:border-sky-800 dark:text-sky-200">
              Use the typical number: {toDisplay(typical, unit)}{unit === 'percent' ? '%' : unit === 'dollars' ? ' dollars' : unit === 'hours' ? ' h' : ''}
            </button>
          )}
        </span>
      )}
    </label>
  );
}
