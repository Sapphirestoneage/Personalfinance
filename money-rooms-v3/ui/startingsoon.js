/* Starting soon: the scenario blocks that touch one planet, with a start date
   you can type ("Mar 2027"), what each costs, and the link to Simulate where
   the whole life replays with and without them. Blocks never change the
   record; only Promote does (MR-021). */
import { h, clear } from './dom.js';
import { newBlock, blockCosts, costSentence, startLabel, parseStart } from '../engine/scenarios.js';

export function mountStartingSoon(host, app, planet) {
  const defs = app.data.scenarioBlocks;
  const types = Object.keys(defs.types).filter(t => (defs.types[t].planets || []).includes(planet));
  function live() {
    const S = app.result.sun && app.result.sun.outputs;
    const th = S && S.income.takeHomeMonthly, sp = S && S.safety.spendingWithPremiums;
    return { takeHomeMonthly: th && th.cents !== undefined ? th.cents : null, spendingMonthly: sp && sp.cents !== undefined ? sp.cents : null };
  }
  function draw() {
    clear(host);
    if (!types.length) return;
    const coach = app.view === 'coach';
    const blocks = (app.record.scenarios || []).filter(b => types.includes(b.type)).sort((a, b) => a.startYear - b.startYear || (a.startMonth || 1) - (b.startMonth || 1));
    const panel = h('section', { class: 'panel starting-soon' });
    const today = new Date();
    const add = coach ? h('select', { class: 'select add-block', 'aria-label': 'Add a change', onChange: e => {
      const t = e.target.value; e.target.value = ''; if (!t) return;
      const m = today.getMonth() + 2; const b = newBlock(t, defs, today.getFullYear() + (m > 12 ? 1 : 0), m > 12 ? 1 : m);
      app.mutate(rec => { rec.scenarios.push(b); }, 'scenarios');
    } }, h('option', { value: '' }, 'Add a change'), types.map(t => h('option', { value: t }, defs.types[t].label))) : null;
    panel.appendChild(h('h2', { class: 'row' }, 'Starting soon', h('span', { class: 'tag hide-narrow' }, 'changes with a start date'), add));
    if (!blocks.length) {
      panel.appendChild(h('p', { class: 'muted small' }, coach ? 'Nothing scheduled. Pick a change above, then type when it starts.' : 'Nothing scheduled yet.'));
    } else {
      const L = live();
      panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Change'), h('th', null, 'Starts'), h('th', { class: 'wrap' }, 'What it does'), coach ? h('th', null, '') : null)),
        h('tbody', null, blocks.map(b => {
          const def = defs.types[b.type]; const c = blockCosts(def, b, L);
          const startInput = h('input', { class: 'input', value: startLabel(b), 'aria-label': 'Start of ' + b.name, title: 'A month and year, for example Mar 2027, or a year', style: { width: '112px' }, onChange: e => {
            const p = parseStart(e.target.value);
            if (!p) { app.toast('Type a month and year, for example Mar 2027, or a year.'); e.target.value = startLabel(b); return; }
            app.mutate(rec => { const x = rec.scenarios.find(s => s.id === b.id); x.startYear = p.startYear; x.startMonth = p.startMonth; }, 'scenarios');
          } });
          return h('tr', null,
            h('td', null, h('a', { href: '#/scenarios' }, b.name), b.promoted ? h('span', { class: 'chip state-known', style: { marginLeft: '8px' } }, 'In the Life plan') : null),
            h('td', null, coach ? startInput : startLabel(b)),
            h('td', { class: 'wrap small' }, costSentence(c)),
            coach ? h('td', { class: 'num' }, h('button', { class: 'btn small quiet', onClick: () => { app.mutate(rec => { rec.scenarios = rec.scenarios.filter(s => s.id !== b.id); }, 'scenarios'); app.toast('Change removed'); } }, 'Remove')) : null);
        })))));
      panel.appendChild(h('p', { class: 'hint', style: { marginTop: '8px' } }, h('a', { class: 'next', href: '#/scenarios' }, 'See the impact on Simulate'), ': today\'s path, each change alone and all together.'));
    }
    host.appendChild(panel);
  }
  draw();
  return { update() { draw(); } };
}
