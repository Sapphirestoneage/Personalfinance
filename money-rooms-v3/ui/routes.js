/* Screens and the side navigation. A route is { title, mount(host, app), needsClient }. */
import * as Home from './views/home.js';
import * as Ledger from './views/ledger.js';
import { PLANETS, PLANET_LABELS, PLANET_SHORT } from '../engine/sun.js';

export const routes = {
  home: { title: 'Home', mount: Home.mount, needsClient: false },
  ledger: { title: 'Ledger', mount: Ledger.mount, needsClient: true },
};

export function navItems(app) {
  const items = [];
  items.push({ label: 'Home', href: '#/home', active: r => r.name === 'home', key: 'Alt+1', fill: app.result ? app.result.fills.sun : null });
  PLANETS.forEach((p, i) => {
    items.push({ group: 'Ledger', label: PLANET_SHORT[p], href: '#/ledger/' + p, active: r => r.name === 'ledger' && r.params.id === p, key: i < 7 ? 'Alt+' + (i + 2) : null, fill: app.result && app.result.fills[p] !== null ? app.result.fills[p] : null });
  });
  return items;
}

export { PLANETS, PLANET_LABELS };
