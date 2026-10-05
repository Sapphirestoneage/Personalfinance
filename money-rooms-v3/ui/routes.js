/* Screens and the side navigation. A route is { title, mount(host, app), needsClient }. */
import * as Home from './views/home.js';
import { PLANETS, PLANET_LABELS } from '../engine/sun.js';

export const routes = {
  home: { title: 'Home', mount: Home.mount, needsClient: false },
};

export function navItems(app) {
  const items = [];
  items.push({ label: 'Home', href: '#/home', active: r => r.name === 'home', key: 'Alt+1', fill: app.result ? app.result.fills.sun : null });
  return items;
}

export { PLANETS, PLANET_LABELS };
