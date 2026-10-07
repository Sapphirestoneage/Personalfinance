/* Screens and the side navigation. A route is { title, mount(host, app), needsClient }. */
import * as Home from './views/home.js';
import * as Ledger from './views/ledger.js';
import * as Measure from './views/measure.js';
import * as OnePager from './views/onepager.js';
import * as Session from './views/session.js';
import * as Scenarios from './views/scenarios.js';
import * as Learn from './views/learn.js';
import * as Assumptions from './views/assumptions.js';
import * as Levers from './views/levers.js';
import * as Discovery from './views/discovery.js';
import * as Call from './views/call.js';
import { PLANETS, PLANET_LABELS, PLANET_SHORT } from '../engine/sun.js';
import { translator } from './glossary.js';

export const routes = {
  home: { title: 'Home', mount: Home.mount, needsClient: false },
  ledger: { title: 'Ledger', mount: Ledger.mount, needsClient: true },
  measure: { title: 'Measure', mount: Measure.mount, needsClient: true },
  onepager: { title: 'One-pager', mount: OnePager.mount, needsClient: true },
  session: { title: 'Session', mount: Session.mount, needsClient: true, coachOnly: true },
  scenarios: { title: 'Simulate', mount: Scenarios.mount, needsClient: true },
  learn: { title: 'Learn', mount: Learn.mount, needsClient: true },
  assumptions: { title: 'Assumptions', mount: Assumptions.mount, needsClient: true, coachOnly: true },
  levers: { title: 'Levers', mount: Levers.mount, needsClient: true },
  discovery: { title: 'Discovery call', mount: Discovery.mount, needsClient: false, coachOnly: true },
  call: { title: 'Call', mount: Call.mount, needsClient: true, coachOnly: true },
};

export function navItems(app) {
  const t = translator(app);
  const items = [];
  items.push({ label: 'Home', href: '#/home', active: r => r.name === 'home', key: 'Alt+1', fill: app.result ? app.result.fills.sun : null });
  PLANETS.forEach((p, i) => {
    items.push({ group: t('Ledger'), label: t(PLANET_LABELS[p]) === PLANET_LABELS[p] ? PLANET_SHORT[p] : t(PLANET_LABELS[p]), href: '#/ledger/' + p, active: r => r.name === 'ledger' && r.params.id === p, key: 'Alt+' + (i + 2), fill: app.result && app.result.fills[p] !== null ? app.result.fills[p] : null });
  });
  items.push({ group: 'Read', label: t('Measure'), href: '#/measure', active: r => r.name === 'measure', key: 'Alt+9' });
  items.push({ group: 'Read', label: t('One-pager'), href: '#/onepager', active: r => r.name === 'onepager', key: 'Alt+0' });
  items.push({ group: 'Read', label: app.view === 'client' ? 'What matters most' : 'Levers', href: '#/levers', active: r => r.name === 'levers', key: null });
  items.push({ group: 'Read', label: 'Session', href: '#/session', active: r => r.name === 'session', key: null, coachOnly: true });
  items.push({ group: 'Read', label: 'Call', href: '#/call', active: r => r.name === 'call', key: null, coachOnly: true });
  items.push({ group: 'Read', label: 'Discovery', href: '#/discovery', active: r => r.name === 'discovery', key: null, coachOnly: true });
  items.push({ group: 'Read', label: app.view === 'client' ? 'What if' : 'Simulate', href: '#/scenarios', active: r => r.name === 'scenarios', key: null });
  items.push({ group: 'Read', label: 'Learn', href: '#/learn', active: r => r.name === 'learn', key: null });
  items.push({ group: 'Read', label: 'Assumptions', href: '#/assumptions', active: r => r.name === 'assumptions', key: null, coachOnly: true });
  return items;
}

export { PLANETS, PLANET_LABELS };
