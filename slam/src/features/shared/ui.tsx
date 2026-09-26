/* Small, phone-first building blocks used by every screen. */
import { useEffect, useState, type ReactNode } from 'react';
import type { Label } from '@/data/schemas';
import type { BasedOn } from '@/engine/types';
import { href } from '@/app/router';

export function Card({ title, children, testId, action }: { title?: string; children: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <section data-testid={testId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-sky-900/5 dark:border-sky-950 dark:bg-slate-900">
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Big({ label, value, testId, tone = 'plain', sub }: { label: string; value: string; testId?: string; tone?: 'plain' | 'good' | 'warn'; sub?: string }) {
  const color = tone === 'good' ? 'text-green-700 dark:text-green-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : '';
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div data-testid={testId} className={`display text-3xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = 'primary',
  testId,
  disabled,
  to,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  testId?: string;
  disabled?: boolean;
  to?: string;
  type?: 'button' | 'submit';
}) {
  const cls = {
    primary: 'bg-gradient-to-r from-sky-700 to-sky-500 text-white shadow-sm shadow-sky-900/20 hover:from-sky-800 hover:to-sky-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:from-slate-800 dark:disabled:to-slate-800 dark:disabled:text-slate-500',
    secondary: 'border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
    quiet: 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
    danger: 'border border-red-300 text-red-700 dark:border-red-800 dark:text-red-300',
  }[kind];
  const base = `block w-full rounded-xl px-4 py-3 text-center font-medium ${cls}`;
  if (to) {
    return (
      <a href={href(to)} data-testid={testId} className={base}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} data-testid={testId} disabled={disabled} className={base}>
      {children}
    </button>
  );
}

export function Pill({ label, testId }: { label: Label | 'mixed'; testId?: string }) {
  const yours = label === 'Yours';
  const text = label === 'Yours' ? 'yours' : label === 'mixed' ? 'partly yours' : `estimate`;
  return (
    <span data-testid={testId} className={`rounded-full px-2 py-0.5 text-xs ${yours ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
      {text}
    </span>
  );
}

/** One line under a computed number: is it hers, and what is the weakest input. */
export function Basis({ basedOn, testId }: { basedOn: BasedOn; testId?: string }) {
  const weak = basedOn.weakest.toLowerCase();
  return (
    <p data-testid={testId} className="mt-2 text-xs text-slate-500">
      {basedOn.allYours ? 'All from your own numbers.' : `An estimate: the weakest input is ${weak === 'yours' ? 'yours' : 'a ' + weak}. Tap any estimate to replace it.`}
    </p>
  );
}

export function Toggle({ on, onChange, label, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={testId}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left dark:border-slate-800"
    >
      <span className="font-medium">{label}</span>
      <span className={`relative inline-block h-6 w-11 rounded-full transition ${on ? 'bg-sky-700' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-5.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function Note({ children, tone = 'info', testId }: { children: ReactNode; tone?: 'info' | 'warn' | 'good'; testId?: string }) {
  const cls = {
    info: 'bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100',
    warn: 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100',
    good: 'bg-green-50 text-green-900 dark:bg-green-900/30 dark:text-green-100',
  }[tone];
  return (
    <p data-testid={testId} className={`rounded-lg p-3 text-sm ${cls}`}>
      {children}
    </p>
  );
}

/** A destructive action that asks in the page: first tap arms it, second tap does it. No browser dialogs. */
export function ConfirmButton({ children, confirmLabel = 'Tap again to confirm', onConfirm, kind = 'danger', testId }: { children: ReactNode; confirmLabel?: string; onConfirm: () => void; kind?: 'primary' | 'secondary' | 'quiet' | 'danger'; testId?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      kind={armed ? 'primary' : kind}
      testId={testId}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

/** Progressive disclosure: a labeled fold. Open by default when `open`. */
export function Disclosure({ label, children, open = false, testId, count }: { label: string; children: ReactNode; open?: boolean; testId?: string; count?: number }) {
  const [isOpen, setOpen] = useState(open);
  useEffect(() => setOpen(open), [open]);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button type="button" data-testid={testId} aria-expanded={isOpen} onClick={() => setOpen(!isOpen)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium">
        <span>
          {label}
          {count !== undefined && <span className="ml-2 text-xs font-normal text-slate-500">{count}</span>}
        </span>
        <span aria-hidden="true" className={`text-slate-400 transition ${isOpen ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {isOpen && <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">{children}</p>;
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}
