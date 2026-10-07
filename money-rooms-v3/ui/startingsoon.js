/* Starting soon: the scenario blocks that touch one planet, with a start date
   you can type ("Mar 2027"), what each costs, and the link to Simulate where
   the whole life replays with and without them. Blocks never change the
   record; only Promote does (MR-021). */
import { h, clear } from './dom.js';
import * as F from '../engine/format.js';
import { parseTyped } from './typed.js';
import { datePicker } from './datepicker.js';
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

/* The household's live figures a block can read: take-home, spending and gross pay a month; null when not known. */
export function liveFigures(app) {
  const S = app.result.sun && app.result.sun.outputs;
  const q = x => x && x.cents !== undefined ? x.cents : null;
  const gap = S && S.spending.sharedFullMonthly && S.spending.sharedFullMonthly.cents !== undefined && S.spending.sharedShareMonthly ? S.spending.sharedFullMonthly.cents - S.spending.sharedShareMonthly.cents : null;
  return { takeHomeMonthly: q(S && S.income.takeHomeMonthly), spendingMonthly: q(S && S.safety.spendingWithPremiums), grossMonthly: q(S && S.income.grossMonthly), sharedGapMonthly: gap };
}
/* The start of a change is picked on a calendar (MR-036, MR-038): the year and month are stored, the day is not. */
export function startPicker(app, b, opts) {
  const cur = () => (app.record.scenarios || []).find(x => x.id === b.id);
  return datePicker({ value: b.startYear + '-' + String(b.startMonth || 1).padStart(2, '0'), precision: 'month', className: 'start-picker', label: (opts && opts.label) || 'Start of ' + b.name, min: '2000-01-01', max: '2100-12-01', onCommit: iso => {
    const p = iso ? parseStart(iso) : null;
    if (!p || !cur()) return;
    app.mutate(rec => { const x = rec.scenarios.find(y => y.id === b.id); x.startYear = p.startYear; x.startMonth = p.startMonth || 1; }, 'scenarios');
  } });
}

export function mountStartingSoon(host, app, planet) {
  const defs = app.data.scenarioBlocks;
  const types = Object.keys(defs.types).filter(t => (defs.types[t].planets || []).includes(planet));
  const live = () => liveFigures(app);
  const openDetails = {};
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
        card.appendChild(h('div', { class: 'row change-head' },
          h('a', { class: 'change-name', href: '#/scenarios' }, b.name),
          b.promoted ? h('span', { class: 'chip state-known' }, 'In the Life plan') : null,
          h('span', { style: { flex: 1 } }),
          coach ? h('button', { class: 'btn small quiet', onClick: () => { app.mutate(rec => { rec.scenarios = rec.scenarios.filter(y => y.id !== b.id); }, 'scenarios'); app.toast('Change removed'); } }, 'Remove') : null));
        card.appendChild(h('div', { class: 'fieldrow detail' }, h('label', null, 'Starts'), h('div', { class: 'control' }, coach ? startPicker(app, b) : h('span', { class: 'value' }, startLabel(b)))));
        if (coach) {
          const head = def.questions.filter(q => !q.detail), rest = def.questions.filter(q => q.detail);
          head.forEach(qd => card.appendChild(h('div', { class: 'fieldrow detail' }, h('label', { title: qd.hint || '' }, qd.label), h('div', { class: 'control' }, questionField(app, b, qd)))));
          if (rest.length) {
            const more = h('div', { class: 'change-more', style: { display: openDetails[b.id] ? '' : 'none' } });
            rest.forEach(qd => more.appendChild(h('div', { class: 'fieldrow detail' }, h('label', { title: qd.hint || '' }, qd.label), h('div', { class: 'control' }, questionField(app, b, qd)))));
            const btn = h('button', { class: 'btn small quiet', 'aria-expanded': String(!!openDetails[b.id]), onClick: () => { openDetails[b.id] = !openDetails[b.id]; more.style.display = openDetails[b.id] ? '' : 'none'; btn.setAttribute('aria-expanded', String(!!openDetails[b.id])); btn.textContent = (openDetails[b.id] ? 'Hide details' : 'Details') + ' (' + rest.length + ')'; } }, (openDetails[b.id] ? 'Hide details' : 'Details') + ' (' + rest.length + ')');
            card.appendChild(btn); card.appendChild(more);
          }
        }
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
