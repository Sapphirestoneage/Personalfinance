/* The frame: header with the three-bar menu and Hide, the drawer, and the
   page. Presenter mode makes everything bigger. */
import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '@/data/store';
import { APP_NAME, APP_TAGLINE } from '@/content/credits';
import { href, useRoute } from './router';

const MENU: Array<{ to: string; label: string; testId: string }> = [
  { to: 'today', label: 'Today', testId: 'nav-today' },
  { to: 'levels', label: 'Levels', testId: 'nav-levels' },
  { to: 'numbers', label: 'My Numbers', testId: 'nav-numbers' },
  { to: 'clients', label: 'Clients', testId: 'nav-clients' },
  { to: 'businesses', label: 'My businesses', testId: 'nav-businesses' },
  { to: 'hypotheticals', label: 'Hypotheticals', testId: 'nav-hypotheticals' },
  { to: 'toolbox', label: 'Toolbox', testId: 'nav-toolbox' },
  { to: 'demo', label: 'Demo, backup and settings', testId: 'nav-demo' },
  { to: 'about', label: 'How SLAM thinks', testId: 'nav-about' },
];

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const hide = useAppStore((s) => s.hide);
  const presenter = useAppStore((s) => s.presenter);
  const route = useRoute();
  const demo = useAppStore((s) => s.profile?.demo ?? false);
  const error = useAppStore((s) => s.error);
  const status = useAppStore((s) => s.status);
  const clearError = useAppStore((s) => s.clearError);
  const current = route.parts[0] ?? 'today';
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={`mx-auto min-h-dvh max-w-md px-4 pb-8 pt-[max(env(safe-area-inset-top),0.75rem)] ${presenter ? 'text-[118%]' : ''}`}>
      <header className="mb-4 flex items-center justify-between">
        <button type="button" aria-label="Menu" data-testid="menu" onClick={() => setOpen(true)} className="rounded-lg p-2 -ml-2">
          <span className="block h-0.5 w-6 bg-current" />
          <span className="mt-1.5 block h-0.5 w-6 bg-current" />
          <span className="mt-1.5 block h-0.5 w-6 bg-current" />
        </button>
        <a href={href('today')} className="text-center">
          <div className="text-lg font-bold tracking-tight">{APP_NAME}</div>
          <div className="text-[11px] text-slate-500">{APP_TAGLINE}</div>
        </a>
        <button type="button" data-testid="hide" onClick={hide} aria-label="Hide" className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700">
          Hide
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <nav data-testid="drawer" className="absolute inset-y-0 left-0 w-72 bg-white p-4 shadow-xl dark:bg-slate-900">
            <div className="mb-4 text-lg font-bold">{APP_NAME}</div>
            <ul className="space-y-1">
              {MENU.map((m) => (
                <li key={m.to}>
                  <a
                    href={href(m.to)}
                    data-testid={m.testId}
                    className={`block rounded-lg px-3 py-3 font-medium ${current === m.to ? 'bg-sky-50 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    {m.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}

      {demo && (
        <p data-testid="sample-banner" className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          Sample numbers, not anyone's. <a href={href('demo')} className="underline">Use your own</a>
        </p>
      )}
      {status === 'ready' && error && (
        <div role="alert" data-testid="save-error" className="mb-3 flex items-start justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/30 dark:text-red-100">
          <span>Could not save that: {error}. The screen was reloaded from what is stored.</span>
          <button type="button" onClick={clearError} aria-label="Dismiss" className="shrink-0 px-1">
            ×
          </button>
        </div>
      )}
      <main>{children}</main>
    </div>
  );
}
