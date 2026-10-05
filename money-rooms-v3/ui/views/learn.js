/* Learn: every gap and every struggling item points at something to read.
   Titles only, never quotes; information, never instructions. One table of
   readings ranked by the money behind them, then the numbers still waiting. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';

const INTERNAL_NEEDS = { 'a non-zero denominator': 'Other inputs (see Measure)', 'an input': 'Other inputs (see Measure)' };
const OTHER = 'Other inputs (see Measure)';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function mount(host, app) {
  host.appendChild(h('header', null, h('h1', null, 'Learn'), h('span', { class: 'sub' }, 'What to read for each gap the numbers show.')));
  const body = h('div', { class: 'stack learn' }); host.appendChild(body);
  const readings = app.data.readings.readings;
  function draw() {
    clear(body);
    const R = app.result; const picks = app.record.sun.clientPicks || [];
    const all = R.lenses || [];
    const lenses = all.filter(l => app.view === 'coach' || picks.includes(l.id));
    const byReading = {};
    lenses.forEach(l => { if (!l.reading) return; (byReading[l.reading.id] = byReading[l.reading.id] || { reading: l.reading, lenses: [], total: 0 }).lenses.push(l); });
    const groups = Object.values(byReading);
    groups.forEach(g => { g.total = g.lenses.reduce((s, l) => s + (l.impactAnnual || 0), 0); });
    groups.sort((a, b) => b.total - a.total);
    if (!groups.length) {
      if (app.view === 'client' && all.length) body.appendChild(h('div', { class: 'empty' }, h('h2', null, 'No readings shared yet'), h('p', null, 'Your coach picks which readings appear here.')));
      else body.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Nothing to read yet'), h('p', null, 'Readings appear once income and spending are in. The table below lists what is still missing.')));
    } else {
      const shown = new Set(groups.map(g => g.reading.id));
      const rest = readings.filter(r => !shown.has(r.id));
      const rows = [];
      groups.forEach(g => {
        rows.push(h('tr', { class: 'group' }, h('td', { colspan: 2 }, g.reading.title)));
        g.lenses.forEach(l => rows.push(h('tr', null, h('td', { class: 'wrap' }, l.text), h('td', { class: 'num' }, l.impactAnnual !== null ? F.dollarsWhole(l.impactAnnual, { rough: l.rough }) : '-'))));
      });
      body.appendChild(h('section', { class: 'panel' },
        h('h2', null, 'Readings', h('span', { class: 'tag' }, groups.length + (groups.length === 1 ? ' title, ' : ' titles, ') + lenses.length + (lenses.length === 1 ? ' finding' : ' findings'))),
        h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'What the numbers show'), h('th', { class: 'num' }, 'A year'))), h('tbody', null, rows))),
        rest.length && app.view === 'coach' ? h('p', { class: 'hint' }, 'Also on the shelf: ' + rest.map(r => r.title).join('; ') + '.') : null));
    }
    /* gaps in the numbers themselves */
    const M = R.metrics || {};
    const needing = Object.values(M).filter(m => m.status === 'needs');
    if (needing.length) {
      const needs = {};
      needing.forEach(m => {
        const list = (m.needs || []).map(n => INTERNAL_NEEDS[n] || cap(n));
        (list.length ? list : [OTHER]).forEach(n => { needs[n] = (needs[n] || 0) + 1; });
      });
      const keys = Object.keys(needs).sort((a, b) => (a === OTHER) - (b === OTHER) || needs[b] - needs[a]).slice(0, 10);
      body.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Gaps in the numbers', h('span', { class: 'tag' }, needing.length + (needing.length === 1 ? ' number waiting' : ' numbers waiting'))),
        h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Needs'), h('th', { class: 'num' }, 'Unlocks'))), h('tbody', null, keys.map(n => h('tr', null, h('td', { class: 'wrap' }, n), h('td', { class: 'num' }, String(needs[n])))))))));
    }
  }
  draw();
  return { update() { draw(); } };
}
