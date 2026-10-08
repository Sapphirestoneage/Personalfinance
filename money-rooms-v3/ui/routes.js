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
import * as Goals from './views/goals.js';
import * as Run from './views/run.js';
import * as Program from './views/program.js';
import * as Prep from './views/prep.js';
import * as Transactions from './views/transactions.js';
import * as Scoreboard from './views/scoreboard.js';
import * as MapView from './views/map.js';
import * as MoneyDate from './views/moneydate.js';
import * as Calculators from './views/calculators.js';
import * as Calendar from './views/calendar.js';
import * as Calc from './views/calc.js';
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
  goals: { title: 'Goals', mount: Goals.mount, needsClient: true },
  discovery: { title: 'Discovery call', mount: Discovery.mount, needsClient: false, coachOnly: true },
  call: { title: 'Session', mount: Run.mount, needsClient: true, coachOnly: true },
  callpath: { title: 'Call path', mount: Call.mount, needsClient: true, coachOnly: true },
  program: { title: 'Program', mount: Program.mount, needsClient: true, coachOnly: true },
  prep: { title: 'Prepare', mount: Prep.mount, needsClient: true, coachOnly: true },
  transactions: { title: 'Transactions', mount: Transactions.mount, needsClient: true, coachOnly: true },
  /* Level 12 (MR-063) */
  scoreboard: { title: 'Scoreboard', mount: Scoreboard.mount, needsClient: true },
  map: { title: 'Map', mount: MapView.mount, needsClient: true },
  'money-date': { title: 'Money date', mount: MoneyDate.mount, needsClient: true, coachOnly: true },
  /* Level 13 (MR-067) */
  calculators: { title: 'Calculators', mount: Calculators.mount, needsClient: true },
  calendar: { title: 'Cash flow calendar', mount: Calendar.mount, needsClient: true },
  calc: { title: 'Calculator', mount: Calc.mount, needsClient: true },
};

export function navItems(app) {
  const t = translator(app);
  const items = [];
  items.push({ label: 'Home', href: '#/home', active: r => r.name === 'home', key: 'Alt+1', fill: app.result ? app.result.fills.sun : null });
  PLANETS.forEach((p, i) => {
    items.push({ group: t('Ledger'), label: t(PLANET_LABELS[p]) === PLANET_LABELS[p] ? PLANET_SHORT[p] : t(PLANET_LABELS[p]), href: '#/ledger/' + p, active: r => r.name === 'ledger' && r.params.id === p, key: 'Alt+' + (i + 2), fill: app.result && app.result.fills[p] !== null ? app.result.fills[p] : null });
  });
  items.push({ group: 'Read', label: t('Measure'), href: '#/measure', active: r => r.name === 'measure', key: 'Alt+9' });
  items.push({ group: 'Read', label: 'Scoreboard', href: '#/scoreboard', active: r => r.name === 'scoreboard', key: null });
  items.push({ group: 'Read', label: 'Money date', href: '#/money-date', active: r => r.name === 'money-date', key: null, coachOnly: true });
  items.push({ group: 'Read', label: app.view === 'client' ? 'How it connects' : 'Map', href: '#/map', active: r => r.name === 'map', key: null });
  items.push({ group: 'Read', label: t('One-pager'), href: '#/onepager', active: r => r.name === 'onepager', key: 'Alt+0' });
  /* Level 13 (MR-067): the calculators as their own group */
  items.push({ group: 'Calculators', label: 'All calculators', href: '#/calculators', active: r => r.name === 'calculators', key: null });
  items.push({ group: 'Calculators', label: app.view === 'client' ? 'Day by day' : 'Cash flow calendar', href: '#/calendar', active: r => r.name === 'calendar', key: null });
  items.push({ group: 'Calculators', label: 'How much home', href: '#/calc/home-afford', active: r => r.name === 'calc' && r.params.id === 'home-afford', key: null });
  items.push({ group: 'Calculators', label: app.view === 'client' ? 'Owning a home' : 'House', href: '#/calc/house', active: r => r.name === 'calc' && r.params.id === 'house', key: null });
  items.push({ group: 'Calculators', label: 'Car', href: '#/calc/car', active: r => r.name === 'calc' && r.params.id === 'car', key: null });
  items.push({ group: 'Calculators', label: app.view === 'client' ? 'What investing becomes' : 'Retirement for two', href: '#/calc/retire', active: r => r.name === 'calc' && r.params.id === 'retire', key: null });
  items.push({ group: 'Read', label: app.view === 'client' ? 'What matters most' : 'Levers', href: '#/levers', active: r => r.name === 'levers', key: null });
  items.push({ group: 'Read', label: app.view === 'client' ? 'Your goals' : 'Goals', href: '#/goals', active: r => r.name === 'goals', key: null });
  items.push({ group: 'Read', label: 'Session', href: '#/session', active: r => r.name === 'session', key: null, coachOnly: true });
  items.push({ group: 'Read', label: 'Program', href: '#/program', active: r => r.name === 'program' || r.name === 'prep', key: null, coachOnly: true });
  items.push({ group: 'Read', label: 'Run session', href: '#/call', active: r => r.name === 'call' || r.name === 'callpath', key: null, coachOnly: true });
  items.push({ group: 'Read', label: 'Transactions', href: '#/transactions', active: r => r.name === 'transactions', key: null, coachOnly: true });
  items.push({ group: 'Read', label: 'Discovery', href: '#/discovery', active: r => r.name === 'discovery', key: null, coachOnly: true });
  items.push({ group: 'Read', label: app.view === 'client' ? 'What if' : 'Simulate', href: '#/scenarios', active: r => r.name === 'scenarios', key: null });
  items.push({ group: 'Read', label: 'Learn', href: '#/learn', active: r => r.name === 'learn', key: null });
  items.push({ group: 'Read', label: 'Assumptions', href: '#/assumptions', active: r => r.name === 'assumptions', key: null, coachOnly: true });
  return items;
}

export { PLANETS, PLANET_LABELS };
