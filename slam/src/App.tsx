import { useEffect } from 'react';
import { useAppStore } from '@/data/store';
import { APP_NAME, APP_TAGLINE } from '@/content/credits';
import { QuickHide } from './features/quick-hide/QuickHide';
import { Phase0Screen } from './features/shell/Phase0Screen';

export function App() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const hidden = useAppStore((s) => s.hidden);
  const init = useAppStore((s) => s.init);
  const hide = useAppStore((s) => s.hide);
  const unhide = useAppStore((s) => s.unhide);

  useEffect(() => {
    void init();
  }, [init]);

  if (hidden) return <QuickHide onReturn={unhide} />;

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-6 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-xs text-slate-500">{APP_TAGLINE}</p>
        </div>
        <button
          type="button"
          data-testid="hide"
          onClick={hide}
          aria-label="Hide"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700"
        >
          Hide
        </button>
      </header>
      {status === 'loading' && <p data-testid="loading" className="p-4 text-sm text-slate-500">Opening your numbers…</p>}
      {status === 'error' && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-100">
          This device could not open its storage: {error}
        </p>
      )}
      {status === 'ready' && <Phase0Screen />}
    </div>
  );
}
