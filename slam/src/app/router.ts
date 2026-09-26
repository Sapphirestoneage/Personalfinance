/* A hash router with no dependency: #/today, #/businesses/<id>, #/toolbox/<tool>?guided=1 */
import { useEffect, useState } from 'react';

export interface Route {
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path = '', q = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
}

export function href(to: string): string {
  return `#/${to.replace(/^\//, '')}`;
}
