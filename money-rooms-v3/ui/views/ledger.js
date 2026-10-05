/* The Ledger: one door in. #/ledger/<planet> shows the planet in the centre
   of the orbit map with its moons (row types) around it; #/ledger/<planet>/<type>
   shows that moon's table. Facts enter here and nowhere else. */
import { h, clear } from '../dom.js';
import { orbitMap, mapPanel } from '../orbit.js';
import { ledgerTable } from '../table.js';
import { PLANET_LABELS, PLANETS } from '../../engine/sun.js';
import { typesFor, typeDef, primaryFieldOf, freshFacts, fieldDef } from '../../engine/fields.js';
import { createRow } from '../../engine/record.js';
import { hasValue } from '../../engine/states.js';
import * as F from '../../engine/format.js';

export function crumbs(parts) {
  const out = h('nav', { class: 'crumbs', 'aria-label': 'Where you are' });
  parts.forEach((p, i) => {
    if (i) out.appendChild(h('span', { class: 'sep' }, '/'));
    out.appendChild(h('a', { href: p.href }, p.label));
  });
  return out;
}

export function mount(host, app) {
  const planet = app.route.params.id;
  const typeId = app.route.params.sub;
  if (!planet || PLANETS.indexOf(planet) === -1) {
    host.appendChild(h('header', null, h('h1', null, 'Ledger'), h('span', { class: 'sub' }, 'Pick a planet.')));
    host.appendChild(h('div', { class: 'empty' }, h('p', null, PLANETS.map(p => h('a', { href: '#/ledger/' + p, style: { marginRight: '16px' } }, PLANET_LABELS[p])))));
    return null;
  }
  const fields = app.data.fields;
  const work = app.record.sun.f.workSituation ? app.record.sun.f.workSituation.v : null;
  if (typeId) return mountTable(host, app, planet, typeId);

  host.appendChild(crumbs([{ label: 'Household', href: '#/home' }]));
  host.appendChild(h('header', null, h('h1', null, PLANET_LABELS[planet])));
  const mapHost = h('div', { class: 'maphost' });
  const bar = h('div');
  const side = h('div');
  host.appendChild(h('div', { class: 'planet-grid' }, h('div', null, mapHost, bar), side));
  function draw() {
    clear(mapHost); clear(bar); clear(side);
    const types = typesFor(fields, planet, work);
    const rowsOf = t => app.record.planets[planet].rows.filter(r => r.type === t.id);
    const items = types.map(t => ({ id: t.id, label: t.id === 'other' ? 'Other (optional)' : t.label, count: rowsOf(t).length, fill: app.result.typeFills[planet][t.id], dashed: t.id === 'other' && rowsOf(t).length === 0, attention: (app.result.needs[planet] || []).some(n => n.type === t.id), badge: rowsOf(t).length ? Math.round((app.result.typeFills[planet][t.id] || 0) * 100) + '%' : null }));
    mapHost.appendChild(orbitMap({
      compact: mapHost.clientWidth > 0 && mapHost.clientWidth < 560,
      ariaLabel: PLANET_LABELS[planet] + ' and its row types',
      center: { title: PLANET_LABELS[planet], sub: countText(app.record.planets[planet].rows.length) + ', ' + Math.round((app.result.fills[planet] || 0) * 100) + '%', fill: app.result.fills[planet] || 0 },
      items,
      onOpen: id => { location.hash = '#/ledger/' + planet + '/' + id; },
      onFocus: id => describe(id),
    }));
    describe(null);
    /* the same row types as a scannable list under the map */
    const anyNeeds = (app.result.needs[planet] || []).length > 0;
    const list = h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, 'Row type'), h('th', { class: 'num' }, 'Rows'), h('th', { class: 'num' }, 'Confidence'), anyNeeds ? h('th', null, 'Needs') : null)),
      h('tbody', null, types.map(t => { const rows = rowsOf(t); const needs = (app.result.needs[planet] || []).filter(n => n.type === t.id); return h('tr', null,
        h('td', null, h('a', { href: '#/ledger/' + planet + '/' + t.id }, t.id === 'other' ? 'Other (optional)' : t.plural || t.label)),
        h('td', { class: 'num' }, rows.length ? String(rows.length) : h('span', { class: 'empty-token' }, 'No rows')),
        h('td', { class: 'num' }, rows.length ? Math.round((app.result.typeFills[planet][t.id] || 0) * 100) + '%' : ''),
        anyNeeds ? h('td', { class: 'small muted' }, needs.length ? needs.slice(0, 2).map(n => n.label).join(', ') + (needs.length > 2 ? ' and ' + (needs.length - 2) + ' more' : '') : '') : null); }))));
    side.appendChild(h('h3', { style: { marginBottom: '8px' } }, 'Row types'));
    side.appendChild(list);
  }
  function describe(id) {
    clear(bar);
    if (!id) {
      const needs = app.result.needs[planet] || [];
      const types = typesFor(fields, planet, work);
      const first = types.find(t => needs.some(n => n.type === t.id)) || types.find(t => app.record.planets[planet].rows.some(r => r.type === t.id)) || types[0];
      bar.appendChild(mapPanel({ title: PLANET_LABELS[planet] + (app.record.planets[planet].rows.length ? ' is at ' + Math.round((app.result.fills[planet] || 0) * 100) + '%' : ' is empty'), status: needs.length ? 'Needs ' + needs.slice(0, 3).map(n => n.label.toLowerCase()).join(', ') + (needs.length > 3 ? ' and ' + (needs.length - 3) + ' more' : '') + '.' : (app.record.planets[planet].rows.length ? holdsBack(app, planet) : 'Nothing entered yet. Pick a circle to add the first row.'), actions: [h('a', { class: 'btn primary', href: '#/ledger/' + planet + '/' + first.id }, 'Open ' + lowerFirst(first.label)), h('a', { class: 'btn', href: '#/home' }, 'Back')] }));
      return;
    }
    const t = typeDef(fields, planet, id);
    const rows = app.record.planets[planet].rows.filter(r => r.type === id);
    const prim = primaryFieldOf(fields, planet, id);
    bar.appendChild(mapPanel({ title: t.label, status: (rows.length ? countText(rows.length) + '. ' : '') + 'Fields: ' + t.fields.map(fid => fieldDef(fields, fid).label.toLowerCase()).slice(0, 6).join(', ') + (t.fields.length > 6 ? ' and ' + (t.fields.length - 6) + ' more' : '') + '.',
      actions: [h('a', { class: 'btn primary', href: '#/ledger/' + planet + '/' + id }, rows.length ? 'Open' : 'Add the first ' + (prim ? prim.label.toLowerCase() : 'row'))] }));
  }
  draw();
  return { update() { draw(); } };
}

function countText(n) { return n + (n === 1 ? ' row' : ' rows'); }
export function lowerFirst(t) { return t && t.length > 1 && t[1] === t[1].toLowerCase() && /[a-z]/.test(t[1]) ? t[0].toLowerCase() + t.slice(1) : t; }
export function holdsBack(app, planet, typeId) {
  const rows = app.record.planets[planet].rows.filter(r => !typeId || r.type === typeId);
  let rough = 0, lookups = 0;
  rows.forEach(r => Object.values(r.f).forEach(f => { if (f.state === 'rough' || f.state === 'will-send') rough++; else if (f.source === 'estimated' || f.source === 'lookup-verify') lookups++; }));
  const parts = [];
  if (rough) parts.push(rough + (rough === 1 ? ' figure is rough' : ' figures are rough'));
  if (lookups) parts.push(lookups + (lookups === 1 ? ' looked-up value to confirm' : ' looked-up values to confirm'));
  return parts.length ? parts.join('; ') + '.' : 'Every figure is known or verified.';
}

function mountTable(host, app, planet, typeId) {
  const fields = app.data.fields;
  let tdef;
  try { tdef = typeDef(fields, planet, typeId); } catch (e) { location.hash = '#/ledger/' + planet; return null; }
  host.appendChild(crumbs([{ label: 'Household', href: '#/home' }, { label: PLANET_LABELS[planet], href: '#/ledger/' + planet }]));
  host.appendChild(h('header', null, h('h1', null, tdef.plural || tdef.label), h('div', { class: 'actions' }, extraActions(app, planet, typeId))));
  if (tdef.single && !app.record.planets[planet].rows.some(r => r.type === typeId) && app.view === 'coach') {
    const row = createRow(planet, typeId, { f: freshFacts(fields, planet, typeId) });
    tdef.fields.forEach(id => { const d = fieldDef(fields, id); if (d.cadence) row.f[id].cad = d.defaultCadence; });
    app.addRow(row);
  }
  const summaryNote = h('div');
  host.appendChild(summaryNote);
  const tableHost = h('div');
  host.appendChild(tableHost);
  const table = ledgerTable(tableHost, app, planet, typeId, { emptyActions: planet === 'spending' && typeId === 'line' && app.view === 'coach' ? [h('button', { class: 'btn', onClick: () => useDefaults(app) }, 'Use national averages')] : [] });
  function note() {
    clear(summaryNote);
    const s = app.result.summaries[planet];
    if (!s) return;
    if (typeId === 'summary' && s.detailCents !== null) {
      summaryNote.appendChild(h('p', { class: 'notice', style: { marginBottom: '16px' } }, 'Line items exist (' + F.dollars(s.detailCents) + ' a month), so they override this rough total' + (s.totalCents !== null ? '; the gap is ' + F.dollars(s.detailCents - s.totalCents) : '') + '.'));
    } else if (typeId !== 'summary' && s.totalCents !== null && s.detailCents !== null) {
      summaryNote.appendChild(h('p', { class: 'hint', style: { marginBottom: '16px' } }, 'Rough total typed: ' + F.dollars(s.totalCents) + '. Detail so far: ' + F.dollars(s.detailCents) + '. Gap: ' + F.dollars(s.detailCents - s.totalCents) + '.'));
    }
  }
  note();
  return { update(reason) { note(); if (reason === 'rows') table.render(); }, addRow: () => table.addRow() };
}

function extraActions(app, planet, typeId) {
  const out = [];
  if (planet === 'spending' && typeId === 'line' && app.view === 'coach' && app.record.planets.spending.rows.some(r => r.type === 'line')) {
    out.push(h('button', { class: 'btn', title: 'Adds one line per category at national-average amounts, marked Estimated and Rough', onClick: () => useDefaults(app) }, 'Use national averages'));
  }
  return out;
}

/* Defaults as estimates: one line per category for the household size, source Estimated (0.5), shown with ~. */
export function useDefaults(app) {
  const d = app.data.defaults;
  const dep = app.record.sun.f.dependents && hasValue(app.record.sun.f.dependents) ? app.record.sun.f.dependents.v : 0;
  const size = String(Math.min(4, Math.max(1, 1 + (dep || 0))));
  const existing = app.record.planets.spending.rows.filter(r => r.type === 'line');
  let added = 0;
  Object.keys(d.categories).forEach(cat => {
    d.categories[cat].lines[size].forEach(([name, cents]) => {
      if (existing.some(r => r.nickname === name)) return;
      const row = createRow('spending', 'line', { nickname: name, f: freshFacts(app.data.fields, 'spending', 'line') });
      row.f.category = { v: cat, state: 'known', source: 'estimated' };
      row.f.amount = { v: cents, state: 'rough', source: 'estimated', cad: 'month' };
      row.f.needWant = { v: ['wants', 'irregular'].includes(cat) ? 'want' : 'need', state: 'known', source: 'estimated' };
      row.f.fatFloor = { v: ['accommodation', 'food', 'transportation'].includes(cat), state: 'known', source: 'estimated' };
      app.addRow(row); added++;
    });
  });
  app.toast(added ? 'Added ' + added + ' estimated lines for a household of ' + size + '. Each is rough until the client confirms.' : 'Every default line is already here.');
  app.rerender();
}
