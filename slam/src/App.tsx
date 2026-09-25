import { useEffect } from 'react';
import { useAppStore } from '@/data/store';
import { Layout } from './app/Layout';
import { ErrorBoundary } from './app/ErrorBoundary';
import { useRoute } from './app/router';
import type { ToolId } from './content/stages';
import { QuickHide } from './features/quick-hide/QuickHide';
import { Today } from './features/today/Today';
import { MyNumbers } from './features/numbers/MyNumbers';
import { Clients } from './features/clients/Clients';
import { Businesses } from './features/businesses/Businesses';
import { Setup } from './features/businesses/Setup';
import { SharedSettings } from './features/businesses/SharedSettings';
import { BusinessTab } from './features/businesses/BusinessTab';
import { Hypotheticals } from './features/hypotheticals/Hypotheticals';
import { Toolbox } from './features/toolbox/Toolbox';
import { ToolShell } from './features/toolbox/ToolShell';
import { Demo } from './features/demo/Demo';
import { About } from './features/about/About';

const TOOL_IDS: ToolId[] = ['diagnose', 'offer', 'presence', 'conversations', 'bookings', 'money', 'plan', 'strategy'];

function Page() {
  const route = useRoute();
  const [head, second] = route.parts;
  switch (head) {
    case undefined:
    case 'today':
      return <Today />;
    case 'numbers':
      return <MyNumbers />;
    case 'clients':
      return <Clients />;
    case 'businesses':
      if (second === 'setup') return <Setup />;
      if (second === 'settings') return <SharedSettings />;
      if (second) return <BusinessTab key={second} id={second} />;
      return <Businesses />;
    case 'hypotheticals':
      return <Hypotheticals />;
    case 'toolbox':
      if (second && (TOOL_IDS as string[]).includes(second)) {
        return <ToolShell key={`${second}-${route.query.get('business')}-${route.query.get('guided')}`} tool={second as Exclude<ToolId, 'setup'>} businessId={route.query.get('business')} guided={route.query.get('guided') === '1'} />;
      }
      return <Toolbox />;
    case 'demo':
      return <Demo />;
    case 'about':
      return <About />;
    default:
      return <Today />;
  }
}

export function App() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const hidden = useAppStore((s) => s.hidden);
  const init = useAppStore((s) => s.init);
  const unhide = useAppStore((s) => s.unhide);

  useEffect(() => {
    void init();
  }, [init]);

  if (hidden) return <QuickHide onReturn={unhide} />;

  return (
    <Layout>
      {status === 'loading' && <p data-testid="loading" className="p-4 text-sm text-slate-500">Opening your numbers…</p>}
      {status === 'error' && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-100">This device could not open its storage: {error}</p>}
      {status === 'ready' && (
        <ErrorBoundary>
          <Page />
        </ErrorBoundary>
      )}
    </Layout>
  );
}
