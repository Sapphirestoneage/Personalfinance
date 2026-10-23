/* The Ledger: one door in. #/ledger/<planet> shows the planet in the centre
   of the orbit map with its moons (row types) around it; #/ledger/<planet>/<type>
   shows that moon's table. Facts enter here and nowhere else. */
import { h, clear } from '../dom.js';
import { orbitMap, mapPanel } from '../orbit.js';
import { mountStartingSoon } from '../startingsoon.js';
import { ALL_CHARTS as CHARTS } from '../../engine/charts-all.js';
import * as Charts from '../charts.js';
import { ledgerTable, markTypeNone } from '../table.js';
import { PLANET_LABELS, PLANETS } from '../../engine/sun.js';
import { typesFor, typeDef, primaryFieldOf, freshFacts, fieldDef, isNoneRow } from '../../engine/fields.js';
import { createRow } from '../../engine/record.js';
import { hasValue } from '../../engine/states.js';
import * as F from '../../engine/format.js';
import { renderSun, updateSunValues } from '../sunpanel.js';
import { segmented } from '../seg.js';
import { clientName } from '../app.js';
import { overallConfidence } from './onepager.js';
import { fold } from '../fold.js';
import { taxQuiz, setTaxAnswer, quizCounts } from '../../engine/taxquiz.js';

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
    /* MR-072: the Plan overview carries the household facts (moved from Home) and the seven rooms */
    host.appendChild(h('header', null, h('h1', null, app.view === 'client' ? 'Your numbers' : 'Plan'), h('span', { class: 'sub' }, 'The facts behind every number, one room each.')));
    const grid = h('div', { class: 'grid grid-2 plan-grid' }); const sun = h('section', { class: 'panel sun-panel' }); const rooms = h('section', { class: 'panel' }); grid.appendChild(sun); grid.appendChild(rooms); host.appendChild(grid);
    /* MR-075: the planet view is back, on the Plan; the list stays one tap away and the choice is remembered on this device */
    let planView = 'planets'; try { planView = localStorage.getItem('mr3.planView') || 'planets'; } catch (e) { /* no storage: planets */ }
    const client = () => app.view === 'client'; const countWord = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const derived = p => !!(app.data.fields.planets[p] && app.data.fields.planets[p].derived);
    const computes = p => { const M = app.result.metrics; return !!M && app.data.metrics.metrics.some(x => x.group === p && M[x.id] && M[x.id].status === 'ok'); };
    const describePlanet = (bar, id) => {
      clear(bar); const R = app.result;
      if (!id) { const total = PLANETS.reduce((t, p) => t + R.rowCounts[p], 0); if (!total) { bar.appendChild(mapPanel({ title: 'Nothing entered yet', status: 'Income first: open Income and add the first job.', actions: [h('a', { class: 'btn primary coach-only', href: '#/ledger/income' }, 'Open Income')] })); return; } const score = p => (R.fills[p] === null ? (derived(p) && computes(p) ? 2 : -1) : R.fills[p]); id = PLANETS.slice().sort((a, b) => score(a) - score(b))[0]; }
      const needs = R.needs[id] || []; const n = R.rowCounts[id];
      if (!n && derived(id)) { const ok = computes(id); bar.appendChild(mapPanel({ title: PLANET_LABELS[id] + (ok ? ' is computed' : ' waits on Income'), status: ok ? 'Federal tax and FICA come from the Income rows. Add a row only for tax paid outside a paycheck.' : 'Federal tax and FICA come from the Income rows once gross pay and the filing status are in.', actions: [h('a', { class: 'btn primary', href: '#/ledger/' + id }, 'Open ' + lowerFirst(PLANET_LABELS[id]))] })); return; }
      bar.appendChild(mapPanel({ title: PLANET_LABELS[id] + (n ? ' is at ' + Math.round((R.fills[id] || 0) * 100) + '%' : ' is empty'), status: n ? countWord(n, client() ? 'item' : 'row', client() ? 'items' : 'rows') + '. ' + (needs.length ? 'Needs ' + needs.slice(0, 3).map(x => lowerFirst(x.label)).join(', ') + (needs.length > 3 ? ' and ' + (needs.length - 3) + ' more' : '') + '.' : 'Everything it needs is in.') : (client() ? 'Nothing here yet.' : 'No rows yet.'), actions: [h('a', { class: 'btn primary', href: '#/ledger/' + id }, 'Open ' + lowerFirst(PLANET_LABELS[id]))] }));
    };
    const drawRooms = () => {
      clear(rooms); const R = app.result;
      rooms.appendChild(h('div', { class: 'row rooms-head' }, h('h2', null, 'Rooms'), segmented([['planets', 'Planets'], ['list', 'List']], planView, v => { planView = v; try { localStorage.setItem('mr3.planView', v); } catch (e) { /* the pick lives for this screen only */ } drawRooms(); }, { label: 'How to show the rooms', small: true })));
      if (planView === 'planets') {
        const items = PLANETS.map(p => ({ id: p, label: PLANET_LABELS[p], count: R.rowCounts[p], fill: R.fills[p] === null ? 0 : R.fills[p], attention: (R.needs[p] || []).length > 0, badge: R.fills[p] === null ? (derived(p) && computes(p) ? 'computed' : 'nothing yet') : countWord(R.rowCounts[p], client() ? 'item' : 'row', client() ? 'items' : 'rows') + ', ' + Math.round(R.fills[p] * 100) + '%' }));
        const mapHost = h('div', { class: 'maphost' }); const bar = h('div', { class: 'mapbar-host' }); rooms.appendChild(mapHost); rooms.appendChild(bar);
        mapHost.appendChild(orbitMap({ compact: rooms.clientWidth > 0 && rooms.clientWidth < 560, ariaLabel: 'The household and its seven rooms', center: { title: clientName(app.record) || 'Household', sub: Math.round(overallConfidence(R) * 100) + '% in', fill: R.fills.sun }, items, onOpen: id => { location.hash = '#/ledger/' + id; }, onFocus: id => describePlanet(bar, id) }));
        mapHost.appendChild(h('p', { class: 'small muted orbit-caption' }, 'Each circle is a room. The number is how much it holds, the ring is how sure those numbers are. Tap one to open it.'));
        describePlanet(bar, null);
      } else rooms.appendChild(h('ul', { class: 'rooms-list' }, PLANETS.map(p => { const n = R.rowCounts[p]; const fill = R.fills[p]; return h('li', null, h('a', { href: '#/ledger/' + p }, PLANET_LABELS[p]), h('span', { class: 'small muted' }, ' ' + (n ? countWord(n, client() ? 'item' : 'row', client() ? 'items' : 'rows') + (fill !== null ? ', ' + Math.round(fill * 100) + '% in' : '') : 'nothing yet'))); })));
    };
    renderSun(sun, app); drawRooms();
    return { update(reason) { if (reason === 'rows' || reason === 'clients') renderSun(sun, app); else updateSunValues(sun, app); drawRooms(); } };
  }
  const fields = app.data.fields;
  const work = app.record.sun.f.workSituation ? app.record.sun.f.workSituation.v : null;
  if (typeId) return mountTable(host, app, planet, typeId);

  host.appendChild(crumbs([{ label: 'Plan', href: '#/ledger' }]));
  host.appendChild(h('header', null, h('h1', null, PLANET_LABELS[planet]), planet === 'invest' && F.hoursLens().mode !== 'dollars' && F.hoursLens().wage ? h('span', { class: 'sub lens-note' }, 'In hours, a balance reads as hours bought back: work you will not have to do.') : null)); /* MR-116 */
  const mapHost = h('div', { class: 'maphost' });
  const bar = h('div');
  const side = h('div');
  const soonHost = h('div', { style: { marginTop: '16px' } });
  host.appendChild(h('div', { class: 'planet-grid' }, h('div', null, mapHost, bar, soonHost), side));
  const soon = mountStartingSoon(soonHost, app, planet);
  /* MR-094: the Taxes room is computed; the picture and the ways to lower it sit on top, the rows it can take below */
  const taxHost = planet === 'taxes' ? h('section', { class: 'panel tax-room' }) : null;
  if (taxHost) host.insertBefore(taxHost, host.querySelector('.planet-grid'));
  const chartHost = planet === 'taxes' ? h('section', { class: 'panel tax-ladder', style: { marginTop: '16px' } }) : null;
  if (chartHost) host.appendChild(chartHost);
  function drawTaxes() {
    if (!chartHost) return;
    clear(chartHost); clear(taxHost);
    const client = app.view === 'client'; const S = app.result.sun && app.result.sun.outputs; const T = S && S.taxes; const B = T && T.breakdown;
    const money = c => F.dollarsWhole(c); const pct = r => F.percent(r, { places: 0 });
    taxHost.appendChild(h('h2', null, client ? 'Where your pay goes before you see it' : 'Your taxes, computed', h('span', { class: 'tag' }, B ? 'a year, from the rooms' : 'needs gross pay and a filing status')));
    if (!B) { taxHost.appendChild(h('p', { class: 'small muted' }, 'Gross pay on the Income room and a filing status in Household facts light this up. State and city come from Household facts too; dependents open the credits.')); return; }
    const kpi = (label, value, sub) => h('div', { class: 'kpi lit' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'small muted' }, sub) : null);
    taxHost.appendChild(h('div', { class: 'grid grid-4 tax-kpis' },
      kpi(client ? 'Every tax, a year' : 'All taxes a year', money(B.total), pct(T.totalRate) + ' of gross'),
      kpi(client ? 'Federal, after credits' : 'Federal after credits', money(B.federal), B.credits ? money(B.credits) + ' in credits' : null),
      kpi(client ? 'State and city' : 'State and local', money(B.state + B.local), B.stateRate === null ? 'needs a state' : (B.localCity ? B.localCity + ' included' : 'a flat stand-in')),
      kpi('Social Security and Medicare', money(B.socialSecurity + B.medicare + B.selfEmployment), B.selfEmployment ? 'both halves on 1099 pay' : null)));
    const flow = CHARTS.find(x => x.id === 'taxFlow'); const built = flow.build(app.result);
    if (built && !built.needs) { const body = h('div', { class: 'tax-flow' }); taxHost.appendChild(body); Charts.render('taxFlow', body, built, { client }); }
    /* MR-097: the return line by line: what was taxed, at what rate, what each deduction and credit took off */
    const places = r => (Math.round(r * 10000) % 100 ? 2 : (Math.round(r * 1000) % 10 ? 1 : 0));
    const rate = r => r === null || r === undefined ? '' : F.percent(r, { places: places(r) });
    const cell = (label, cls, child) => h('td', { class: cls, dataset: { label } }, child);
    const linesBody = h('div', { class: 'tablewrap' }, h('table', { class: 'data tax-lines' },
      h('thead', null, h('tr', null, h('th', null, 'Line'), h('th', { class: 'num' }, 'On'), h('th', { class: 'num' }, 'Rate'), h('th', { class: 'num' }, 'A year'))),
      h('tbody', null, (T.lines || []).map(l => h('tr', { class: 'k-' + l.kind, dataset: { line: l.id } },
        cell('Line', 'what', h('span', { class: 'line-label' }, l.label), l.note ? h('span', { class: 'small muted line-note' }, ' ' + l.note) : null),
        cell('On', 'num', l.base === null ? '' : money(l.base)),
        cell('Rate', 'num', rate(l.rate)),
        cell('A year', 'num', (l.amount < 0 ? '-' : '') + money(Math.abs(l.amount))))))));
    taxHost.appendChild(fold('taxes.lines', client ? 'Line by line' : 'The return, line by line', linesBody, { count: (T.lines || []).length, open: true }));
    /* MR-097: the questions a return asks; each yes points at the room that holds the fact */
    const quiz = taxQuiz(app.record, app.data); const qc = quizCounts(quiz);
    const addIt = qn => { const a = qn.next.add; if (a) { const row = createRow(a.planet, a.type, { f: freshFacts(app.data.fields, a.planet, a.type) }); app.addRow(row); if (a.field && a.value !== null) app.setField(row.id, a.field, a.value, 'known', 'client'); } if (qn.next.href) app.go(qn.next.href); };
    const quizBody = h('ol', { class: 'tax-quiz' }, quiz.map(qn => h('li', { dataset: { question: qn.id }, class: qn.done ? 'counted' : null },
      h('span', { class: 'quiz-ask' }, client ? qn.client : qn.ask),
      segmented([[true, 'Yes'], [false, 'No']], qn.answer, v => app.change(rec => setTaxAnswer(rec, qn.id, v, { session: app.session }), { reason: 'section' }), { label: qn.ask, small: true }),
      h('span', { class: 'small muted quiz-why' }, qn.done ? h('span', { class: 'chip src' }, 'counted') : null, qn.done ? ' ' : '', qn.why),
      qn.next ? h('span', { class: 'quiz-next' }, qn.note ? h('span', { class: 'small' }, qn.next.label) : h('button', { type: 'button', class: 'btn small primary', onClick: () => addIt(qn) }, qn.next.label)) : null)));
    taxHost.appendChild(fold('taxes.quiz', client ? 'A few questions a tax return asks' : 'The questions a return asks', quizBody, { count: qc.answered + ' of ' + qc.total + (qc.open ? ', ' + qc.open + ' to add' : ''), open: qc.answered < qc.total }));
    const D = T.deductionChoice;
    taxHost.appendChild(h('p', { class: 'small muted' }, (D.usesItemized ? 'Itemizing: ' + money(D.itemized.total) + ' against a standard deduction of ' + money(D.standard) + '.' : 'The standard deduction, ' + money(D.standard) + ', beats itemizing at ' + money(D.itemized.total) + '.') + (D.studentLoanInterest ? ' Student loan interest deducted: ' + money(D.studentLoanInterest) + '.' : '') + ' The marginal rate is ' + pct(B.marginal) + '.'));
    /* the ways to lower it */
    const lv = T.levers || [];
    taxHost.appendChild(h('h3', null, client ? 'Ways to lower it' : 'Ways to lower it, largest first'));
    taxHost.appendChild(h('ol', { class: 'tax-levers' }, lv.map(l => h('li', { dataset: l.field && l.href ? { go: l.href } : {}, class: l.counted ? 'counted' : null },
      h('span', { class: 'lever-name' }, l.label, l.counted ? h('span', { class: 'chip src' }, 'counted') : null),
      h('span', { class: 'lever-saves num' }, l.savesAnnual === null ? (client ? 'needs ' + l.needs : 'needs ' + l.needs) : l.per1000 ? money(l.savesAnnual) + ' per 1,000' : (l.savesAnnual > 0 ? money(l.savesAnnual) + ' a year' : (l.gapCents ? money(l.gapCents) + ' to go' : 'not now'))),
      h('span', { class: 'small muted lever-how' }, l.how)))));
    if (!client) taxHost.appendChild(h('p', { class: 'small muted' }, 'Deductions and credits paid this year go in the rows below; mortgage and student loan interest come from the Debt room; contribution room from Investments.'));
    const c = CHARTS.find(x => x.id === 'taxes');
    chartHost.appendChild(h('h2', null, client ? c.client : c.name, h('span', { class: 'tag' }, 'a year, step by step')));
    const body = h('div'); chartHost.appendChild(body);
    Charts.render('taxes', body, c.build(app.result), { client });
  }
  function draw() {
    clear(mapHost); clear(bar); clear(side);
    soon.update(); drawTaxes();
    const types = typesFor(fields, planet, work);
    const rowsOf = t => app.record.planets[planet].rows.filter(r => r.type === t.id);
    const items = types.map(t => ({ id: t.id, label: t.id === 'other' ? 'Other (optional)' : t.label, count: rowsOf(t).length, fill: app.result.typeFills[planet][t.id], dashed: t.id === 'other' && rowsOf(t).length === 0, attention: (app.result.needs[planet] || []).some(n => n.type === t.id), badge: rowsOf(t).length ? (rowsOf(t).every(r => isNoneRow(fields, r)) ? 'None' : Math.round((app.result.typeFills[planet][t.id] || 0) * 100) + '%') : (t.assumeNone ? 'None (assumed)' : null) }));
    mapHost.appendChild(orbitMap({
      compact: mapHost.clientWidth > 0 && mapHost.clientWidth < 560,
      ariaLabel: PLANET_LABELS[planet] + ' and its row types',
      center: { title: PLANET_LABELS[planet], sub: countText(app.record.planets[planet].rows.length, app.view === 'coach') + ', ' + Math.round((app.result.fills[planet] || 0) * 100) + '%', fill: app.result.fills[planet] || 0 },
      items,
      onOpen: id => { location.hash = '#/ledger/' + planet + '/' + id; },
      onFocus: id => describe(id),
    }));
    describe(null);
    /* the same row types as a scannable list under the map */
    const anyNeeds = (app.result.needs[planet] || []).length > 0;
    const list = h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, 'Row type'), h('th', { class: 'num' }, app.view === 'coach' ? 'Rows' : 'Items'), app.view === 'coach' ? h('th', { class: 'num' }, 'Confidence') : null, anyNeeds ? h('th', null, 'Needs') : null)),
      h('tbody', null, types.map(t => { const rows = rowsOf(t); const needs = (app.result.needs[planet] || []).filter(n => n.type === t.id); return h('tr', null,
        h('td', null, h('a', { href: '#/ledger/' + planet + '/' + t.id }, t.id === 'other' ? 'Other (optional)' : t.plural || t.label)),
        h('td', { class: 'num' }, rows.length ? String(rows.length) : (t.assumeNone ? h('span', { class: 'empty-token' }, 'None (assumed)') : (app.view === 'coach' && !t.single ? h('button', { class: 'btn small quiet', onClick: () => markTypeNone(app, planet, t.id) }, 'None') : h('span', { class: 'empty-token' }, app.view === 'coach' ? 'No rows' : 'None yet')))),
        app.view === 'coach' ? h('td', { class: 'num' }, rows.length ? Math.round((app.result.typeFills[planet][t.id] || 0) * 100) + '%' : '') : null,
        anyNeeds ? h('td', { class: 'small muted' }, needs.length ? needs.slice(0, 2).map(n => n.label).join(', ') + (needs.length > 2 ? ' and ' + (needs.length - 2) + ' more' : '') : '') : null); }))));
    /* the orbit already shows every row type; the list stays for narrow screens where the orbit is compact */
    side.appendChild(h('div', { class: 'row-types-list' }, h('h2', null, 'Row types'), list));
  }
  function describe(id) {
    clear(bar);
    if (!id) {
      const needs = app.result.needs[planet] || [];
      const types = typesFor(fields, planet, work);
      const first = types.find(t => needs.some(n => n.type === t.id)) || types.find(t => app.record.planets[planet].rows.some(r => r.type === t.id)) || types[0];
      bar.appendChild(mapPanel({ title: PLANET_LABELS[planet] + (app.record.planets[planet].rows.length ? ' is at ' + Math.round((app.result.fills[planet] || 0) * 100) + '%' : ' is empty'), status: needs.length ? 'Needs ' + needs.slice(0, 3).map(n => n.label.toLowerCase()).join(', ') + (needs.length > 3 ? ' and ' + (needs.length - 3) + ' more' : '') + '.' : (app.record.planets[planet].rows.length ? holdsBack(app, planet) : 'Nothing entered yet. Pick a circle to add the first row.'), actions: [h('a', { class: 'btn primary', href: '#/ledger/' + planet + '/' + first.id }, 'Open ' + lowerFirst(first.label)), h('a', { class: 'btn', href: '#/ledger' }, 'Back')] }));
      return;
    }
    const t = typeDef(fields, planet, id);
    const rows = app.record.planets[planet].rows.filter(r => r.type === id);
    const prim = primaryFieldOf(fields, planet, id);
    bar.appendChild(mapPanel({ title: t.label, status: (rows.length ? countText(rows.length, app.view === 'coach') + '. ' : '') + 'Fields: ' + t.fields.map(fid => fieldDef(fields, fid).label.toLowerCase()).slice(0, 6).join(', ') + (t.fields.length > 6 ? ' and ' + (t.fields.length - 6) + ' more' : '') + '.',
      actions: [h('a', { class: 'btn primary', href: '#/ledger/' + planet + '/' + id }, rows.length ? 'Open' : 'Add the first ' + (prim ? prim.label.toLowerCase() : 'row'))].concat(
        !rows.length && !t.single && app.view === 'coach' ? [h('button', { class: 'btn', title: 'No ' + (t.plural || t.label).toLowerCase() + ' for this household', onClick: () => markTypeNone(app, planet, id) }, t.assumeNone ? 'None (assumed)' : 'None')] : []) }));
  }
  draw();
  return { update() { draw(); } };
}

function countText(n, coach) { return n + (coach === false ? (n === 1 ? ' item' : ' items') : (n === 1 ? ' row' : ' rows')); }
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
  let fromSnapshot = false; try { fromSnapshot = sessionStorage.getItem('mr3.fromSnapshot') === '1'; } catch (e) { /* no storage */ }
  if (fromSnapshot) host.appendChild(h('div', { class: 'dive-bar' }, h('a', { class: 'btn primary', href: '#/snapshot' }, 'Back to snapshot'), h('span', { class: 'small muted' }, 'Fill any of it and leave whenever.'))); /* MR-110 */
  let tdef;
  try { tdef = typeDef(fields, planet, typeId); } catch (e) { location.hash = '#/ledger/' + planet; return null; }
  host.appendChild(crumbs([{ label: 'Plan', href: '#/ledger' }, { label: PLANET_LABELS[planet], href: '#/ledger/' + planet }]));
  host.appendChild(h('header', null, h('h1', null, tdef.plural || tdef.label), h('div', { class: 'actions' }, extraActions(app, planet, typeId))));
  if (tdef.single && !app.record.planets[planet].rows.some(r => r.type === typeId) && app.view === 'coach') {
    const row = createRow(planet, typeId, { f: freshFacts(fields, planet, typeId) });
    tdef.fields.forEach(id => { const d = fieldDef(fields, id); if (d.cadence) row.f[id].cad = d.defaultCadence; });
    app.addRow(row);
  }
  const summaryNote = h('div');
  host.appendChild(summaryNote);
  const inferredNote = h('div');
  host.appendChild(inferredNote);
  function inferred() {
    clear(inferredNote);
    const list = ((app.result.enriched || {})[planet] || []).filter(e => app.record.planets[planet].rows.some(r => r.id === e.rowId && r.type === typeId));
    if (!list.length) return;
    if (planet === 'invest') { inferredNote.appendChild(h('p', { class: 'hint', style: { marginBottom: '8px' } }, typeId === 'bank' ? 'All cash: the cushion, the calendar and safe to spend read these.' : 'Tax bucket and reach come from the account type.')); return; }
    list.forEach(e => {
      const row = app.record.planets[planet].rows.find(r => r.id === e.rowId);
      if (row && isNoneRow(fields, row)) return;
      const WORDS = { pretax: 'pre-tax', roth: 'Roth', hsa: 'HSA', taxable: 'taxable', cash: 'cash', now: 'reachable now', semi: 'reachable with care', locked: 'locked until 59.5' };
      const what = e.field === 'grossPay' ? 'gross pay a month' : e.field === 'takeHome' ? 'take-home a month' : e.field === 'unemploymentWeekly' ? 'weekly benefit if work stopped' : e.field === 'cutAbility' ? 'could cut a month' : e.field === 'matchMonthly' ? 'employer match a month' : e.field === 'taxBucket' ? 'tax bucket' : e.field === 'liquidity' ? 'reach' : e.field === 'weeksLeft' ? 'weeks left' : e.field;
      const shown = e.field === 'weeksLeft' ? String(e.value) + (e.endsOn ? ' (benefit ends ' + F.date(e.endsOn) + ')' : '') : typeof e.value === 'number' ? F.dollarsWhole(e.value) : typeof e.value === 'string' ? (WORDS[e.value] || e.value) : (e.value && e.value.cents !== undefined ? F.dollarsWhole(e.value.cents, { rough: e.value.rough || e.value.confidence < 0.7 }) : F.value(e.value));
      inferredNote.appendChild(h('p', { class: 'hint', style: { marginBottom: '8px' }, title: e.note || '' }, 'Inferred, not stored: ' + (row && row.nickname ? row.nickname + ', ' : '') + what + ' ' + shown + (e.field === 'takeHome' ? ' (before state tax)' : '') + ((e.field === 'unemploymentWeekly' || e.field === 'cutAbility') && e.note ? ' (' + e.note + ')' : '') + '.'));
    });
  }
  inferred();
  const tableHost = h('div');
  host.appendChild(tableHost);
  /* MR-060: a single row flagged `form` (Retirement and FI) shows as a form, not a one-row table */
  const formHost = tdef.form ? h('section', { class: 'panel single-form' }) : null;
  if (formHost) { host.appendChild(formHost); tableHost.style.display = 'none'; }
  function drawForm() {
    if (!formHost) return; clear(formHost);
    const row = app.record.planets[planet].rows.find(r => r.type === typeId);
    if (tdef.explain) formHost.appendChild(h('p', { class: 'hint', style: { marginBottom: '12px' } }, tdef.explain));
    if (!row) { formHost.appendChild(h('p', { class: 'muted' }, 'Nothing entered yet.')); return; }
    formHost.appendChild(table.detailsBody(row, { inline: true }));
  }
  const table = ledgerTable(tableHost, app, planet, typeId, { emptyActions: planet === 'spending' && typeId === 'line' && app.view === 'coach' ? [h('button', { class: 'btn', onClick: () => confirmDefaults(app) }, 'Use national averages')].concat(presetButtons(app)) : [] });
  const soonHost = h('div', { style: { marginTop: '16px' } });
  host.appendChild(soonHost);
  const soon = mountStartingSoon(soonHost, app, planet);
  const tagsHost = planet === 'spending' && typeId === 'line' ? h('div', { style: { marginTop: '16px' } }) : null; if (tagsHost) host.appendChild(tagsHost);
  /* MR-117: the lines by split and by feeling, read from the planet; a bar each, no math here */
  function drawTags() {
    if (!tagsHost) return; clear(tagsHost); const S = app.result.sun && app.result.sun.outputs; const sp = S && S.spending; if (!sp || !sp.bySplit) return;
    const feelDef = app.data.fields.fields.feeling; const labelOf = k => k === 'untagged' ? 'Untagged' : ((feelDef.options.find(o => o[0] === k) || [k, k])[1]);
    const bars = (title, entries, hint) => { const live = entries.filter(e => e.cents > 0); if (!live.length) return null; const max = Math.max.apply(null, live.map(e => e.cents)); const sec = h('section', { class: 'panel tag-bars' }); sec.appendChild(h('h2', null, title)); live.forEach(e => sec.appendChild(h('div', { class: 'hbar' }, h('span', { class: 'small muted' }, e.label), h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill likely', style: { width: Math.round(e.cents / max * 100) + '%' } })), h('span', { class: 'small num' }, F.dollarsWhole(e.cents) + ' a month')))); if (hint) sec.appendChild(h('p', { class: 'small muted' }, hint)); return sec; };
    const bs = bars('By split', [['fixed', 'Fixed'], ['variable', 'Variable'], ['annual', 'Annual']].map(([k, l]) => ({ label: l, cents: sp.bySplit[k] ? sp.bySplit[k].cents : 0 })), 'The split each line selects; blank lines follow Need or Want and the category. Annual lines are spread over twelve months.');
    const bf = bars('By feeling', Object.keys(sp.byFeeling || {}).map(k => ({ label: labelOf(k), cents: sp.byFeeling[k].cents })), 'The feeling tag on each line. Untagged lines have no tag yet.');
    if (bs) tagsHost.appendChild(bs); if (bf) tagsHost.appendChild(bf);
  }
  /* MR-059: the Next unlock button adds the first row and puts the cursor in the field that opens the most */
  if (app.addRowAfterRender && app.addRowAfterRender.planet === planet && app.addRowAfterRender.type === typeId && app.view === 'coach') {
    const a = app.addRowAfterRender; app.addRowAfterRender = null;
    setTimeout(() => {
      const existing = tdef.single ? app.record.planets[planet].rows.find(r => r.type === typeId) : null;
      const row = existing || table.addRow(a.field);
      if (!row || !a.field) return;
      const el = host.querySelector('tr[data-row="' + row.id + '"] [data-col="' + a.field + '"], .row-details[data-row="' + row.id + '"] [data-col="' + a.field + '"]');
      if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } else table.openDetails(row.id, a.field);
    }, 0);
  }
  function note() {
    clear(summaryNote);
    const s = app.result.summaries[planet];
    if (!s) return;
    if (typeId === 'summary' && s.detailCents !== null) {
      summaryNote.appendChild(h('p', { class: 'notice', style: { marginBottom: '16px' } }, 'Line items exist (' + F.dollarsWhole(s.detailCents) + ' a month), so they override this rough total' + (s.totalCents !== null ? '; the gap is ' + F.dollars(s.detailCents - s.totalCents) : '') + '.'));
    } else if (typeId !== 'summary' && s.totalCents !== null && s.detailCents !== null) {
      summaryNote.appendChild(h('p', { class: 'hint', style: { marginBottom: '16px' } }, 'Lines add up to ' + F.dollarsWhole(s.detailCents) + ', ' + (s.detailCents === s.totalCents ? 'the same as' : F.dollarsWhole(Math.abs(s.detailCents - s.totalCents)) + (s.detailCents > s.totalCents ? ' more than' : ' less than')) + ' the rough total of ' + F.dollarsWhole(s.totalCents) + '.'));
    }
  }
  note(); drawForm(); drawTags();
  return { update(reason) { note(); inferred(); soon.update(); drawTags(); if (reason === 'rows') { table.render(); drawForm(); } else table.refreshTotals(); }, addRow: () => table.addRow(), openDetails: (id, col) => table.openDetails(id, col) };
}

function extraActions(app, planet, typeId) {
  const out = [];
  if (planet === 'spending' && typeId === 'line' && app.view === 'coach' && app.record.planets.spending.rows.some(r => r.type === 'line')) {
    out.push(h('button', { class: 'btn', title: 'Adds one line per category at national-average amounts, marked Guess and Rough', onClick: () => confirmDefaults(app) }, 'Use national averages'));
    presetButtons(app).forEach(b => out.push(b));
  }
  return out;
}

/* Preset groups (data/presets.json): the FAT groups with the lines that travel with each, names only; every amount is asked. */
function presetButtons(app) {
  const groups = (app.data.presets && app.data.presets.groups) || [];
  return groups.map(g => h('button', { class: 'btn small', title: g.lines.length + ' lines: ' + g.lines.map(x => x[0]).join(', '), onClick: () => addPreset(app, g.id) }, '+ ' + g.label));
}
export function addPreset(app, groupId) {
  const g = (app.data.presets.groups || []).find(x => x.id === groupId); if (!g) return;
  const existing = app.record.planets.spending.rows.filter(r => r.type === 'line');
  let added = 0;
  g.lines.forEach(([name, cat, needWant, fat]) => {
    if (existing.some(r => r.nickname.toLowerCase() === name.toLowerCase())) return;
    const row = createRow('spending', 'line', { nickname: name, f: freshFacts(app.data.fields, 'spending', 'line') });
    row.f.category = { v: cat, state: 'known', source: 'client' };
    row.f.needWant = { v: needWant, state: 'known', source: 'client' };
    row.f.fatFloor = { v: !!fat, state: 'known', source: 'client' };
    row.f.amount.cad = 'month';
    app.addRow(row); added++;
  });
  app.toast(added ? 'Added ' + added + (added === 1 ? ' line' : ' lines') + ' under ' + g.label + '. Amounts are still to enter; delete any that do not apply.' : 'Every ' + g.label.toLowerCase() + ' line is already here.');
}

/* MR-072: a bulk change asks first, in the page, and can be undone for ten seconds. */
export function confirmDefaults(app) {
  app.confirm('Add one estimated line per spending category at national averages? Each is marked a guess and stays rough until the client confirms it. Lines already here are kept.', { title: 'Use national averages', label: 'Add the estimates', onConfirm: () => { const before = app.record.planets.spending.rows.length; useDefaults(app); const added = app.record.planets.spending.rows.length - before; if (added) app.toast('Added ' + added + ' estimated lines.', { label: 'Undo', ms: 10000, action: () => { for (let i = 0; i < added; i++) app.undo(); } }); } });
}
/* Defaults as estimates: one line per category for the household size, source Guess (0.5), shown with ~. */
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
  if (!added) app.toast('Every default line is already here.');
  app.rerender();
}
