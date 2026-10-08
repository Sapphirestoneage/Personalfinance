/* The Calculators hub (Level 13, MR-067): one card per calculator, each
   with a live number from the client's record, the four new tools first
   and every calculator-like screen that already existed after them. The
   registry is data/calculators.json; the live numbers come from
   engine/calculators.js and the computed metrics. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { liveNumbers } from '../../engine/calculators.js';
import { textOf } from '../../engine/momentum.js';
import { clientName } from '../app.js';

export function mount(host, app) {
  const client = app.view === 'client'; const name = (clientName(app.record) || 'Household').split(' ')[0];
  host.appendChild(h('header', null, h('h1', null, 'Calculators'), h('span', { class: 'sub' }, client ? 'Each one starts from your numbers.' : 'Each one is prefilled from ' + name + '’s record and labels its guesses.')));
  const grid = h('div', { class: 'calc-cards' }); const more = h('section', { class: 'panel' }); host.appendChild(grid); host.appendChild(more);
  function draw() {
    clear(grid); clear(more);
    const live = liveNumbers(app.record, app.result, app.data); const M = app.result.metrics;
    const text = c => {
      const ok = v => v !== null && v !== undefined;
      switch (c.id) {
        case 'calendar': return ok(live.safeToSpend) ? ['Safe to spend today', F.dollarsWhole(live.safeToSpend)] : ['Needs', 'a checking balance and an income'];
        case 'home-afford': return ok(live.homeComfortable) ? ['Comfortable home price', 'about ' + F.dollarsCompact(live.homeComfortable)] : ['Needs', 'gross and take-home pay'];
        case 'house': return ok(live.houseMonthly) ? ['Owning at that price, a month', F.dollarsWhole(live.houseMonthly)] : ['Needs', 'gross and take-home pay'];
        case 'car': return ok(live.carBest) ? [live.carBestLabel + ' costs least', F.dollarsWhole(live.carBest) + ' a month'] : ['Needs', 'a state'];
        case 'retire': return ok(live.retireNestEgg) ? ['By ' + live.retireAge + ', at today’s pace', F.dollarsCompact(live.retireNestEgg)] : ['Needs', 'a birth date, balances and contributions'];
        default: { const m = M[c.liveMetric]; const d = app.data.metrics.metrics.find(x => x.id === c.liveMetric); return m && m.status === 'ok' && d ? [client ? d.clientLabel : d.name, textOf(m)] : ['Needs', (m && m.needs && m.needs[0]) || 'more of the picture']; }
      }
    };
    const list = app.data.calculators.calculators.filter(c => !client || c.clientVisible);
    list.filter(c => c.group === 'new').forEach(c => { const [label, value] = text(c); grid.appendChild(h('a', { class: 'calc-card' + (label === 'Needs' ? ' locked' : ''), href: c.route, dataset: { calc: c.id } }, h('div', { class: 'calc-card-name' }, client ? c.client : c.name), h('div', { class: 'calc-card-live' }, h('span', { class: 'small muted' }, label), h('strong', null, value)), h('p', { class: 'small' }, c.purpose))); });
    more.appendChild(h('h2', null, client ? 'Also yours' : 'Already in the app'));
    more.appendChild(h('div', { class: 'calc-cards small-cards' }, list.filter(c => c.group === 'existing').map(c => { const [label, value] = text(c); return h('a', { class: 'calc-card' + (label === 'Needs' ? ' locked' : ''), href: c.route, dataset: { calc: c.id } }, h('div', { class: 'calc-card-name' }, client ? c.client : c.name), h('div', { class: 'calc-card-live' }, h('span', { class: 'small muted' }, label), h('strong', null, value)), h('p', { class: 'small' }, c.purpose)); })));
  }
  draw();
  return { update() { draw(); } };
}
