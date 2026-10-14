/* What's left (Level 15, MR-111): one live list of every Not yet row and
   every base number still on a guess or a rough figure, across every planet,
   ranked by leverage on the FI number times the dollars still uncertain.
   Grouped by planet, by who supplies it, or by session. Fillable inline or a
   tap to the deep dive. Items under the materiality line sit in Small wins.
   The list comes from engine/whatsleft.js; this file only draws. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { segmented } from '../seg.js';
import { whatsLeft } from '../../engine/whatsleft.js';
import { cachedSensitivity } from '../levers-bridge.js';
import { BASE_NUMBERS, setBase } from '../../engine/snapshot.js';

const GROUPINGS = [['rank', 'Ranked'], ['planet', 'By room'], ['supplier', 'By who supplies it'], ['session', 'By session']];
const money = c => F.dollarsWhole(c);

export function listOf(app) { return whatsLeft(app.record, app.result, app.data, { sensitivity: cachedSensitivity(app) }); }

export function mount(host, app) {
  let grouping = 'rank'; try { grouping = localStorage.getItem('mr3.whatsLeftGroup') || 'rank'; } catch (e) { /* no storage */ }
  host.appendChild(h('header', null, h('h1', null, 'What\'s left'), h('span', { class: 'sub' }, 'Every number still unsure, ranked by what it moves times what is still uncertain. Fill it here or open where it lives.')));
  const body = h('div', { class: 'whatsleft' }); host.appendChild(body);
  function draw() {
    clear(body); const WL = listOf(app);
    const panel = h('section', { class: 'panel' }); body.appendChild(panel);
    panel.appendChild(h('div', { class: 'row wl-head' }, h('h2', null, WL.items.length + (WL.items.length === 1 ? ' item' : ' items') + ' above the line'), segmented(GROUPINGS, grouping, v => { grouping = v; try { localStorage.setItem('mr3.whatsLeftGroup', v); } catch (e) { /* no storage */ } draw(); }, { label: 'Group the list', small: true })));
    panel.appendChild(h('p', { class: 'small muted' }, (WL.wage ? 'The materiality line is the real hourly wage, ' + F.dollars(WL.wage, { plain: true }) + ' an hour, times the minutes to find a fact. ' : 'Without an income the line is off and everything shows here. ') + (WL.small.length ? WL.small.length + ' small ' + (WL.small.length === 1 ? 'item sits' : 'items sit') + ' in ' : '') + (WL.small.length ? '' : ''), WL.small.length ? h('a', { href: '#/session' }, 'Small wins') : null, WL.small.length ? '.' : '', WL.willEmail.length ? ' ' + WL.willEmail.length + ' will-email ' + (WL.willEmail.length === 1 ? 'item rolls' : 'items roll') + ' into the one-pager to-dos.' : ''));
    if (!WL.items.length) { panel.appendChild(h('p', { class: 'muted' }, 'Nothing left above the line. The picture stands on known rows.')); return; }
    const groups = grouping === 'rank' ? [{ key: null, items: WL.items }] : WL.groups[grouping];
    groups.forEach(g => { if (g.key) panel.appendChild(h('h3', null, g.key)); panel.appendChild(h('ol', { class: 'wl-list' }, g.items.map(i => item(i)))); });
  }
  function item(i) {
    const li = h('li', { class: 'wl-item', dataset: { item: i.id, kind: i.kind } });
    li.appendChild(h('div', { class: 'wl-main' }, h('strong', null, i.question || i.label), h('div', { class: 'small muted' }, i.planetLabel + ', ' + i.where + '. ' + i.reason + (i.months !== null && i.months !== undefined ? ' About ' + F.months(Math.abs(i.months)) + ' of FI date at stake.' : '') + (i.dollars ? ' ' + money(i.dollars) + ' a year still uncertain.' : ''))));
    const ctl = h('div', { class: 'row wl-ctl' });
    if (i.inline && (i.kind === 'row' || i.kind === 'base')) ctl.appendChild(h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': 'Fill in ' + (i.label || i.question), placeholder: i.kind === 'base' ? 'number or range' : 'number', onChange: e => { const t = e.target.value.trim(); if (!t) return; try { const v = F.parseMoney(t); if (i.kind === 'base') { const def = BASE_NUMBERS.find(b => b.id === i.base); app.change(rec => setBase(rec, app.data.fields, def, v, 'known', 'client', { session: app.session }), { reason: 'rows' }); } else app.setField(i.rowId, i.field, v, 'known', 'client'); } catch (err) { app.toast('A number, or a range like 1500-2000.'); } } }));
    ctl.appendChild(h('a', { class: 'btn small', href: i.href }, i.kind === 'row' ? 'Open the row' : 'Open the deep dive'));
    ctl.appendChild(h('span', { class: 'chip src' }, i.supplier === 'coach' ? 'coach looks up' : 'client supplies'));
    li.appendChild(ctl);
    return li;
  }
  draw();
  return { update() { draw(); } };
}
