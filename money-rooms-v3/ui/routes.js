/* Screens and the side navigation. A route is { title, mount(host, app), needsClient }.
   Level 14 (MR-072): six groups for the coach (Today, Clients, Call, Plan,
   Progress, Tools), five items for the client (Home, Progress, Calendar,
   Goals, One page); every older route keeps working. Each route carries its
   section and three sentences of help for the "?" button. */
import * as Home from './views/home.js';
import * as Clients from './views/clients.js';
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

/* section: the sidebar group the screen belongs to (the trunk test reads it); help: what this screen is, in three sentences or fewer */
export const routes = {
  home: { title: 'Today', mount: Home.mount, needsClient: false, section: 'Today', help: 'Today is the coach\'s start screen: the next session, what to bring to it, and one button to start the call. In Client view it shows what is safe to spend today, the next win and the three steps. Open a client from the Clients screen.' },
  clients: { title: 'Clients', mount: Clients.mount, needsClient: false, coachOnly: true, section: 'Clients', help: 'Every client in this browser, with where each one is in the program. Open one to work on it. Import, export, delete and the demo households live under More; the history of every change is in a client\'s details.' },
  ledger: { title: 'Plan', mount: Ledger.mount, needsClient: true, section: 'Plan', help: 'The Plan is where facts go in, one room per part of the money picture. Tables read as plain text; tap a cell to change it, Escape cancels, Tab moves on. Each row\'s Details holds the rest of its facts.' },
  measure: { title: 'Charts and numbers', mount: Measure.mount, needsClient: true, section: 'Progress', help: 'Every chart and number the picture supports so far, in one place. A number opens what it is made of; a chart appears as soon as its inputs are in. The Unlocks tab says which fact opens what next.' },
  onepager: { title: 'One page', mount: OnePager.mount, needsClient: true, section: 'Progress', help: 'The one page the client takes home: the six numbers, what changed, the next wins and what to bring next time. Edit lets the coach write the words; Print makes one sheet.' },
  session: { title: 'Session notes', mount: Session.mount, needsClient: true, coachOnly: true, section: 'Call', help: 'Between calls: the next question to ask, the two meters, and the plates of what is still unsure. Close this session takes the snapshot the scoreboard compares against.' },
  scenarios: { title: 'Simulate', mount: Scenarios.mount, needsClient: true, section: 'Tools', help: 'What-if blocks with a start date: a move, a baby, a new job, a pay cut. Each block shows its cost and what it does to the FI date, alone and together.' },
  learn: { title: 'Learn', mount: Learn.mount, needsClient: true, section: 'Tools', help: 'The readings behind the numbers, each tied to the lens that cites it.' },
  assumptions: { title: 'Assumptions', mount: Assumptions.mount, needsClient: true, coachOnly: true, section: 'Tools', help: 'The rates and rules every projection rests on, set for this client. Change one and every number that reads it moves.' },
  levers: { title: 'Levers', mount: Levers.mount, needsClient: true, section: 'Tools', help: 'What moves the FI date, ranked by how far a realistic change in each one moves it. The FI ladder on top shows how far along the household is on each kind of enough.' },
  goals: { title: 'Goals', mount: Goals.mount, needsClient: true, section: 'Tools', help: 'Every goal on one timeline, funded from the monthly surplus with the cushion first. Move a goal\'s date or amount as a try and the FI line follows; Confirm saves it.' },
  discovery: { title: 'Discovery call', mount: Discovery.mount, needsClient: false, coachOnly: true, section: 'Clients', help: 'The one-screen form for a first call: what they said, in their words, becomes a new client with rough numbers the sessions will firm up.' },
  call: { title: 'Call', mount: Run.mount, needsClient: true, coachOnly: true, section: 'Call', help: 'The call screen: one block at a time with the clock on top. Done moves on; Park it saves something for next time. Switch to Client view, or turn on Presenting, before sharing the screen.' },
  callpath: { title: 'Call path', mount: Call.mount, needsClient: true, coachOnly: true, section: 'Call', help: 'The six stops of the first calls: what they said, what it really is, what they would want, and the targets that come out of the gap.' },
  program: { title: 'Program', mount: Program.mount, needsClient: true, coachOnly: true, section: 'Call', help: 'The twelve sessions and the money dates after them, each with its status, and the before-and-after sheet.' },
  prep: { title: 'Prepare', mount: Prep.mount, needsClient: true, coachOnly: true, section: 'Call', help: 'Three things before the call: what they owe you, what is still missing for today\'s targets, and the open loop to answer first. Start the call begins the session.' },
  transactions: { title: 'Transactions', mount: Transactions.mount, needsClient: true, coachOnly: true, section: 'Call', help: 'A bank or card export, cleaned and categorized, becomes real monthly actuals with one click per line.' },
  scoreboard: { title: 'Scoreboard', mount: Scoreboard.mount, needsClient: true, section: 'Progress', help: 'The six numbers that matter, each with how it moved since last time, and the one next action. Every other number is a tap away by group.' },
  map: { title: 'Map', mount: MapView.mount, needsClient: true, section: 'Progress', help: 'How the numbers connect: pick one and see what feeds it, what it feeds, and its path to the FI date.' },
  'money-date': { title: 'Money date', mount: MoneyDate.mount, needsClient: true, coachOnly: true, section: 'Call', help: 'The fifteen-minute monthly check after graduation: what moved, the one action, the satisfaction question.' },
  calculators: { title: 'Calculators', mount: Calculators.mount, needsClient: true, section: 'Tools', help: 'Every calculator, each prefilled from the client\'s record, with the number that answers its question on the card.' },
  calendar: { title: 'Cash flow calendar', mount: Calendar.mount, needsClient: true, section: 'Tools', help: 'Paydays against bills, day by day, and what is safe to spend today. The tabs are different readings of the same run; the tools set dates and the floor.' },
  calc: { title: 'Calculator', mount: Calc.mount, needsClient: true, section: 'Tools', help: 'One question, one number, one sentence. Change an input on the left and the answer and its chart follow.' },
};

/* The client's five items (MR-072) */
const CLIENT_ITEMS = [
  { label: 'Home', href: '#/home', active: r => ['home', 'ledger', 'clients', 'learn', 'scenarios', 'assumptions', 'discovery'].includes(r.name) },
  { label: 'Your progress', href: '#/scoreboard', active: r => ['scoreboard', 'measure', 'map', 'levers', 'calculators', 'calc'].includes(r.name) },
  { label: 'Your calendar', href: '#/calendar', active: r => r.name === 'calendar' },
  { label: 'Your goals', href: '#/goals', active: r => r.name === 'goals' },
  { label: 'Your one page', href: '#/onepager', active: r => r.name === 'onepager' },
];

export function navItems(app) {
  const t = translator(app);
  if (app.view === 'client') return CLIENT_ITEMS.map(i => Object.assign({ key: null }, i));
  const items = [];
  items.push({ group: 'Today', label: 'Today', href: '#/home', active: r => r.name === 'home', key: 'Alt+1' });
  items.push({ group: 'Clients', label: 'Clients', href: '#/clients', active: r => r.name === 'clients', key: null });
  items.push({ group: 'Clients', label: 'Discovery call', href: '#/discovery', active: r => r.name === 'discovery', key: null });
  items.push({ group: 'Call', label: 'Start the call', href: '#/call', active: r => r.name === 'call' || r.name === 'callpath', key: null });
  items.push({ group: 'Call', label: 'Prepare', href: '#/prep', active: r => r.name === 'prep', key: null });
  items.push({ group: 'Call', label: 'Session notes', href: '#/session', active: r => r.name === 'session', key: null });
  items.push({ group: 'Call', label: 'Program', href: '#/program', active: r => r.name === 'program', key: null });
  items.push({ group: 'Call', label: 'Money date', href: '#/money-date', active: r => r.name === 'money-date', key: null });
  items.push({ group: 'Call', label: 'Transactions', href: '#/transactions', active: r => r.name === 'transactions', key: null });
  items.push({ group: 'Plan', label: 'Household facts', href: '#/ledger', active: r => r.name === 'ledger' && !r.params.id, key: null });
  PLANETS.forEach((p, i) => {
    items.push({ group: 'Plan', label: t(PLANET_LABELS[p]) === PLANET_LABELS[p] ? PLANET_SHORT[p] : t(PLANET_LABELS[p]), href: '#/ledger/' + p, active: r => r.name === 'ledger' && r.params.id === p, key: 'Alt+' + (i + 2), fill: app.result && app.result.fills[p] !== null ? app.result.fills[p] : null });
  });
  items.push({ group: 'Progress', label: 'Progress', href: '#/scoreboard', active: r => ['scoreboard', 'measure', 'map', 'onepager'].includes(r.name), key: 'Alt+9' });
  items.push({ group: 'Tools', label: 'Calculators', href: '#/calculators', active: r => r.name === 'calculators' || r.name === 'calc', key: null });
  items.push({ group: 'Tools', label: 'Cash flow calendar', href: '#/calendar', active: r => r.name === 'calendar', key: null });
  items.push({ group: 'Tools', label: 'Goals', href: '#/goals', active: r => r.name === 'goals', key: null });
  items.push({ group: 'Tools', label: 'Levers', href: '#/levers', active: r => r.name === 'levers', key: null });
  items.push({ group: 'Tools', label: 'Simulate', href: '#/scenarios', active: r => r.name === 'scenarios', key: null });
  items.push({ group: 'Tools', label: 'Assumptions', href: '#/assumptions', active: r => r.name === 'assumptions', key: null });
  items.push({ group: 'Tools', label: 'Learn', href: '#/learn', active: r => r.name === 'learn', key: null });
  return items;
}

/* Everything the sidebar search can jump to: screens, ledger row types, metrics, calculators. */
export function searchTargets(app) {
  const out = [];
  navItems(app).forEach(i => out.push({ label: i.label, where: i.group || 'Screens', href: i.href, kind: 'screen' }));
  if (app.view === 'coach') [['Charts and numbers', '#/measure'], ['Map', '#/map'], ['One page', '#/onepager'], ['Call path', '#/callpath'], ['Discovery call', '#/discovery']].forEach(([label, href]) => { if (!out.some(o => o.href === href)) out.push({ label, where: 'Progress', href, kind: 'screen' }); });
  if (app.data && app.data.fields && app.view === 'coach') PLANETS.forEach(p => { const types = app.data.fields.planets[p].types; Object.keys(types).forEach(tid => out.push({ label: types[tid].plural || types[tid].label, where: PLANET_SHORT[p], href: '#/ledger/' + p + '/' + tid, kind: 'rows' })); });
  if (app.data && app.data.metrics) app.data.metrics.metrics.filter(m => m.clientVisible !== false || app.view === 'coach').forEach(m => out.push({ label: app.view === 'client' ? m.clientLabel : m.name, where: 'Progress', href: '#/scoreboard/m/' + m.id, kind: 'number' }));
  if (app.data && app.data.calculators) app.data.calculators.calculators.filter(c => app.view === 'coach' || c.clientVisible).forEach(c => out.push({ label: app.view === 'client' ? c.client : c.name, where: 'Tools', href: c.route, kind: 'calculator' }));
  return out;
}

export { PLANETS, PLANET_LABELS };
