/* Starting soon: the scenario blocks that touch one planet, with a start date
   you can type ("Mar 2027"), what each costs, and the link to Simulate where
   the whole life replays with and without them. Blocks never change the
   record; only Promote does (MR-021). */
import { h, clear } from './dom.js';
import * as F from '../engine/format.js';
import { parseTyped } from './typed.js';
import { newBlock, blockCosts, costSentence, startLabel, parseStart } from '../engine/scenarios.js';

/* One question of a block as an input: money, percent or a count. Shows the formatted value, edits the raw one. */
export function questionField(app, b, qd) {
  const cur = () => (app.record.scenarios || []).find(x => x.id === b.id);
  const show = v => qd.kind === 'money' ? F.dollarsWhole(v) : qd.kind === 'percent' ? F.percent(v) : String(v);
  const v0 = b.answers && b.answers[qd.id] !== undefined ? b.answers[qd.id] : qd.default;
  const input = h('input', { class: 'input' + (qd.kind === 'text' ? '' : ' num'), value: show(v0), 'aria-label': qd.label + ' for ' + b.name, title: qd.hint || '' });
  input.addEventListener('focus', () => { const c = cur(); const v = c ? c.answers[qd.id] : v0; input.value = qd.kind === 'money' ? String(v / 100) : qd.kind === 'percent' ? String(Math.round(v * 10000) / 100) : String(v); input.select(); });
  input.addEventListener('change', e => { try { const p = parseTyped(qd.kind === 'int' ? 'int' : qd.kind, e.target.value); if (p && p.v !== null) app.mutate(rec => { rec.scenarios.find(x => x.id === b.id).answers[qd.id] = p.v; }, 'scenarios'); } catch (err) { app.toast(err.message); } });
  input.addEventListener('blur', () => { const c = cur(); if (c) input.value = show(c.answers[qd.id] !== undefined ? c.answers[qd.id] : qd.default); });
  return input;
}

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
      blocks.forEach(b => {
        const def = defs.types[b.type]; const c = blockCosts(def, b, L);
        const card = h('div', { class: 'change', dataset: { block: b.id } });
        const startInput = h('input', { class: 'input', value: startLabel(b), 'aria-label': 'Start of ' + b.name, title: 'A month and year, for example Mar 2027, or a year', onChange: e => {
          const p = parseStart(e.target.value);
          if (!p) { app.toast('Type a month and year, for example Mar 2027, or a year.'); e.target.value = startLabel(b); return; }
          app.mutate(rec => { const x = rec.scenarios.find(y => y.id === b.id); x.startYear = p.startYear; x.startMonth = p.startMonth; }, 'scenarios');
        } });
        card.appendChild(h('div', { class: 'row change-head' },
          h('a', { class: 'change-name', href: '#/scenarios' }, b.name),
          b.promoted ? h('span', { class: 'chip state-known' }, 'In the Life plan') : null,
          h('span', { style: { flex: 1 } }),
          coach ? h('button', { class: 'btn small quiet', onClick: () => { app.mutate(rec => { rec.scenarios = rec.scenarios.filter(y => y.id !== b.id); }, 'scenarios'); app.toast('Change removed'); } }, 'Remove') : null));
        card.appendChild(h('div', { class: 'fieldrow detail' }, h('label', null, 'Starts'), h('div', { class: 'control' }, coach ? startInput : h('span', { class: 'value' }, startLabel(b)))));
        if (coach) def.questions.forEach(qd => card.appendChild(h('div', { class: 'fieldrow detail' }, h('label', { title: qd.hint || '' }, qd.label), h('div', { class: 'control' }, questionField(app, b, qd)))));
        card.appendChild(h('p', { class: 'hint change-sum' }, costSentence(c)));
        panel.appendChild(card);
      });
      panel.appendChild(h('p', { class: 'hint', style: { marginTop: '8px' } }, h('a', { class: 'next', href: '#/scenarios' }, 'See the impact on Simulate'), ': today\'s path, each change alone and all together.'));
    }
    host.appendChild(panel);
  }
  draw();
  return { update() { draw(); } };
}
