/* What moves the FI date (Level 9, MR-044): the FI ladder as a staircase with
   the part-time income field and its two live lines, the ranked list of what
   moves the FI date (Impact or Ask priority), the one-sentence top card, a
   graph view, and drawers for any root or metric. Client view: the ladder,
   the top three levers and the sentence, in gentle words. Views never do
   math: every number comes from the computed result or the sensitivity run. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { RUNGS, RUNG_LABELS, RUNG_CLIENT } from '../../engine/fiLadder.js';
import { whyFor, fmtMonths } from '../../engine/sensitivity.js';
import { layerOf, upstream, downstream, isRoot } from '../../engine/graph.js';
import { getSensitivity } from '../levers-bridge.js';
import { openMetric, openRoot, graphOf, familyLabel } from '../metricdrawer.js';
import { parseTyped } from '../typed.js';
import { createRow } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { PLANET_SHORT } from '../../engine/sun.js';

const FAMILY_ORDER = ['spend', 'earn', 'keep', 'grow', 'protect', 'assume', 'value'];

export function mount(host, app) {
  const coach = app.view === 'coach';
  let mode = 'impact'; let graphOn = false; let sens = null;
  const header = h('header', null, h('h1', null, coach ? 'What moves the FI date' : 'What matters most'), h('span', { class: 'sub' }, coach ? 'The ladder, then the levers ranked by how far each moves the date.' : ''));
  host.appendChild(header);
  const ladderHost = h('section', { class: 'panel ladder-panel' });
  const topHost = h('section', { class: 'panel top-card' });
  const listHost = h('section', { class: 'panel levers-panel' });
  host.appendChild(ladderHost); host.appendChild(topHost); host.appendChild(listHost);
  function draw() {
    drawLadder(ladderHost, app);
    drawTop(topHost, app, sens);
    drawList(listHost, app, sens, { mode, graphOn, setMode: m => { mode = m; draw(); }, setGraph: g => { graphOn = g; draw(); } });
    if (app.result && app.result.metrics && app.result.metrics.fiDate) getSensitivity(app, r => { if (r === sens) return; sens = r; setTimeout(() => { drawTop(topHost, app, sens); drawList(listHost, app, sens, { mode, graphOn, setMode: m => { mode = m; draw(); }, setGraph: g => { graphOn = g; draw(); } }); }, 0); });
  }
  draw();
  return { update() { draw(); } };
}

/* ---- the ladder ---- */
function drawLadder(panel, app) {
  clear(panel);
  const coach = app.view === 'coach'; const M = app.result.metrics; const L = app.result.ladder;
  panel.appendChild(h('h2', null, coach ? 'The FI ladder' : 'Kinds of enough', coach && L && L.baseSpending ? h('span', { class: 'tag' }, 'spending basis: ' + L.baseSpending.source + (L.basis === 'netWorth' ? '; progress counts net worth' : '; progress counts invested assets')) : null));
  if (!L || !M.regularFi || M.regularFi.status !== 'ok') { panel.appendChild(h('p', { class: 'muted' }, 'The ladder needs monthly spending' + (M.regularFi && M.regularFi.needs ? ' (' + M.regularFi.needs.join(', ') + ')' : '') + '. Account balances place you on it; a birth date gives each rung a date.')); return; }
  const stairs = h('div', { class: 'stairs', role: 'list' });
  RUNGS.forEach((id, i) => {
    const m = M[id]; const r = L.rungs.find(x => x.id === id); const ok = m && m.status === 'ok';
    const label = coach ? RUNG_LABELS[id] : RUNG_CLIENT[id];
    const step = h('div', { class: 'stair' + (ok && r.pct >= 1 ? ' reached' : ''), role: 'listitem', style: { paddingTop: (8 + (4 - i) * 14) + 'px' } });
    const box = h('button', { class: 'stair-box', 'aria-label': label + (ok ? ' ' + F.dollarsWhole(m.value.cents) : ''), onClick: () => openMetric(app, id) },
      h('div', { class: 'stair-label' }, label),
      ok ? h('div', { class: 'stair-number' + (m.value.rough ? ' rough' : '') }, F.dollarsCompact(m.value.cents)) : h('div', { class: 'stair-number needs' }, 'Needs ' + ((m && m.needs) || ['inputs'])[0]),
      ok ? h('div', { class: 'stair-bar' }, h('span', { style: { width: Math.round(Math.min(1, r.pct) * 100) + '%' } })) : null,
      ok ? h('div', { class: 'stair-meta' }, F.percent(r.pct, { places: 0 }) + ' there' + (r.months === 0 ? ', reached' : r.date ? ', ' + F.date(r.date) : r.months === null ? ', past 95' : '')) : null,
      ok && r.requiredMonthly !== null && r.pct < 1 && coach ? h('div', { class: 'stair-meta' }, F.dollarsWhole(r.requiredMonthly) + ' a month by ' + L.targetAge) : null);
    step.appendChild(box); stairs.appendChild(step);
  });
  panel.appendChild(stairs);
  if (L.coast && L.coast.number !== null) panel.appendChild(h('p', { class: 'small coast-line' }, h('button', { class: 'linklike', onClick: () => openMetric(app, 'coastFi') }, coach ? 'Coast FI' : 'Coast'), ': ' + F.dollarsWhole(L.coast.number) + ' today coasts to ' + (coach ? 'the FI number' : 'enough') + ' by ' + L.coast.retirementAge + '; ' + F.percent(L.coast.pct || 0, { places: 0 }) + ' there' + (L.coast.months === 0 ? ', reached.' : L.coast.months !== null ? ', about ' + fmtMonths(L.coast.months) + ' away.' : '.')));
  if (coach && L.targetAge) panel.appendChild(h('p', { class: 'small muted' }, 'Required monthly is what reaches each rung by ' + L.targetAge + (app.result.sun.outputs.life.dreamFiAge ? ' (the dream FI age)' : ' (the retirement age; type a dream FI age on the Life plan to change it)') + ' at ' + F.percent(L.realReturn, { places: 0 }) + ' after inflation.'));
  /* part-time income at FI, inline */
  panel.appendChild(baristaRow(app, L));
}

function baristaRow(app, L) {
  const coach = app.view === 'coach'; const M = app.result.metrics;
  const ret = app.record.planets.life.rows.find(r => r.type === 'retirement');
  const cur = ret && ret.f.baristaIncome && ret.f.baristaIncome.v !== null && ret.f.baristaIncome.v !== undefined ? ret.f.baristaIncome.v : null;
  const rule = M.baristaRule && M.baristaRule.status === 'ok' ? M.baristaRule.value.cents : null;
  const need = M.baristaIncomeNeededToday && M.baristaIncomeNeededToday.status === 'ok' ? M.baristaIncomeNeededToday : null;
  const row = h('div', { class: 'barista-row' });
  const input = h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': 'Part-time income at FI, a month', value: cur !== null ? F.dollarsWhole(cur) : '', title: 'Pay after tax from part-time work once the main job stops, a month' });
  input.addEventListener('focus', () => { input.value = cur !== null ? String(cur / 100) : ''; input.select(); });
  input.addEventListener('change', e => {
    let p = null; try { p = parseTyped('money', e.target.value); } catch (err) { app.toast(err.message); return; }
    const v = p ? (typeof p.v === 'object' ? Math.round((p.v.low + p.v.high) / 2) : p.v) : null;
    if (!ret) { const nr = createRow('life', 'retirement', { nickname: 'Retirement', f: freshFacts(app.data.fields, 'life', 'retirement') }); app.addRow(nr); app.setField(nr.id, 'baristaIncome', v, v === null ? 'unknown' : (p.state || 'known'), 'client', 'month'); }
    else app.setField(ret.id, 'baristaIncome', v, v === null ? 'unknown' : (p.state || 'known'), 'client', 'month');
  });
  input.addEventListener('blur', () => { const r2 = app.record.planets.life.rows.find(r => r.type === 'retirement'); const c2 = r2 && r2.f.baristaIncome && r2.f.baristaIncome.v !== null && r2.f.baristaIncome.v !== undefined ? r2.f.baristaIncome.v : null; input.value = c2 !== null ? F.dollarsWhole(c2) : ''; });
  row.appendChild(h('div', { class: 'fieldrow barista-field' }, h('label', null, coach ? 'Part-time income at FI' : 'Part-time pay, a month'), h('div', { class: 'control' }, coach ? input : h('span', { class: 'value' }, cur !== null ? F.dollarsWhole(cur) + ' a month' : 'Not entered')), h('span', { class: 'src small muted' }, cur === null && L && L.barista ? 'Assumed ' + F.dollarsWhole(L.barista.monthly) + ' a month until typed' : 'a month, after tax')));
  if (rule !== null) row.appendChild(h('p', { class: 'small barista-rule' }, 'Every $100 a month of part-time income lowers the target by ' + h2t(F.dollarsWhole(rule)) + ' at ' + F.percent(app.result.asm.withdrawalRate) + (M.baristaRule.at35 ? ' (' + F.dollarsWhole(M.baristaRule.at35) + ' at 3.5%)' : '') + '.'));
  if (need) row.appendChild(h('p', { class: 'small barista-reverse' }, (coach ? 'Part-time income that would make the household Barista FI today: ' : 'Part-time pay that would make today enough: ') + h2t(F.dollarsWhole(need.value.cents)) + ' a month' + (need.lean !== null && need.lean !== undefined ? ' (' + F.dollarsWhole(need.lean) + ' for the floor)' : '') + '.'));
  return row;
}
function h2t(s) { return s; }

/* MR-057: the shape of what is coming, not a spinner. Honours prefers-reduced-motion through CSS. */
function skeleton(kind) {
  const host = h('div', { class: 'skeleton-host', 'aria-busy': 'true' }, h('span', { class: 'sr-only' }, 'Working out the levers'));
  if (kind === 'top') { host.appendChild(h('div', { class: 'skeleton line wide' })); host.appendChild(h('div', { class: 'skeleton line' })); return host; }
  for (let i = 0; i < 6; i++) host.appendChild(h('div', { class: 'skeleton row' }, h('div', { class: 'skeleton name', style: { width: (34 + (i * 17) % 40) + '%' } }), h('div', { class: 'skeleton bar', style: { width: (70 - i * 9) + '%' } })));
  return host;
}

/* ---- the top card ---- */
function drawTop(panel, app, sens) {
  clear(panel);
  const coach = app.view === 'coach'; const M = app.result.metrics;
  if (!M.fiDate || M.fiDate.status !== 'ok') { panel.appendChild(h('h2', null, coach ? 'Your biggest lever' : 'What matters most')); panel.appendChild(h('p', { class: 'muted' }, 'The levers need a FI date: income, spending and account balances that reach the FI number before 95. ' + (M.fiDate && M.fiDate.needs ? 'Needs ' + M.fiDate.needs.join(', ') + '.' : ''))); return; }
  panel.appendChild(h('h2', null, coach ? 'Your biggest lever' : 'What matters most', h('span', { class: 'tag' }, 'FI ' + F.date(M.fiDate.value.value) + (M.fiDate.ages ? ', age ' + M.fiDate.ages.likely : ''))));
  if (!sens) { panel.appendChild(skeleton('top')); return; }
  if (!sens.ranked || !sens.ranked.headline) { panel.appendChild(h('p', { class: 'muted' }, 'No lever measured yet.')); return; }
  const top = sens.ranked.top;
  panel.appendChild(h('p', { class: 'headline' }, coach ? sens.ranked.headline : sens.ranked.headline.replace('Your biggest lever is', 'The number that matters most is')));
  if (top) panel.appendChild(h('p', { class: 'small muted' }, whyFor(top) + (coach ? ' Measured on ' + (sens.computes - 1) + ' re-runs of the whole engine, ' + Math.round(sens.ms) + ' ms.' : '')));
}

/* ---- the ranked list and the graph ---- */
function drawList(panel, app, sens, st) {
  clear(panel);
  const coach = app.view === 'coach'; const M = app.result.metrics;
  if (!M.fiDate || M.fiDate.status !== 'ok') return;
  const narrow = panel.clientWidth > 0 && panel.clientWidth < 700;
  const head = h('div', { class: 'levers-head' }, h('h2', null, coach ? 'What moves your FI date' : 'The three things that move it most'));
  if (coach) head.appendChild(h('div', { class: 'row' },
    h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Ranking' }, h('button', { 'aria-pressed': String(st.mode === 'impact'), onClick: () => st.setMode('impact') }, 'Impact'), h('button', { 'aria-pressed': String(st.mode === 'ask'), onClick: () => st.setMode('ask') }, 'Ask priority')),
    narrow ? null : h('button', { class: 'btn small' + (st.graphOn ? ' primary' : ''), 'aria-pressed': String(st.graphOn), onClick: () => st.setGraph(!st.graphOn) }, st.graphOn ? 'List' : 'Graph'),
    h('label', { class: 'small muted', style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: !!(app.record.sun.flags && app.record.sun.flags.geoArbitrage), onChange: e => app.mutate(rec => { rec.sun.flags = Object.assign({}, rec.sun.flags || {}, { geoArbitrage: e.target.checked }); }, 'flags') }), 'Considering a move')));
  panel.appendChild(head);
  if (!sens) { panel.appendChild(skeleton('list')); return; }
  if (coach && st.graphOn && !narrow) { drawGraph(panel, app, sens); return; }
  const list = st.mode === 'ask' && coach ? sens.ranked.ask : sens.ranked.impact;
  const live = list.filter(i => (st.mode === 'ask' && coach ? i.askRange : i.impact) > 0);
  const shown = coach ? live : live.filter(i => !i.assumption && !i.windfall).slice(0, 3);
  if (!shown.length) { panel.appendChild(h('p', { class: 'muted' }, st.mode === 'ask' ? 'Nothing unsure moves the date: every money fact is verified or has no range.' : 'No lever measured.')); return; }
  const max = Math.max(...shown.map(i => st.mode === 'ask' ? i.askRange : i.impact), 0.1);
  if (coach) panel.appendChild(h('p', { class: 'small muted' }, st.mode === 'ask' ? 'Ask priority: how far the FI date moves across each figure’s plausible range by its answer state (verified 2%, known 5%, rough 20% or the typed range, will send 30%, estimated 35%).' : 'Impact: months of FI date per standard shock ($100 a month, 10% of a balance, one point of a rate, one year of an age), grouped by lever family.'));
  const families = coach ? FAMILY_ORDER.filter(f => shown.some(i => i.family === f)) : [null];
  families.forEach(fam => {
    const items = fam ? shown.filter(i => i.family === fam) : shown;
    const group = h('div', { class: 'lever-group' });
    if (fam) group.appendChild(h('h3', null, familyLabel(fam), app.data.graph.families[fam] !== familyLabel(fam) ? h('span', { class: 'tag' }, app.data.graph.families[fam]) : null));
    items.forEach(i => {
      const months = st.mode === 'ask' && coach ? i.askRange : i.impact;
      const row = h('button', { class: 'lever-row', 'aria-label': leverLabel(app, i) + ', ' + fmtMonths(months), onClick: () => openLever(app, i, sens) },
        h('span', { class: 'lever-name' }, h('strong', null, leverLabel(app, i)), coach ? h('span', { class: 'small muted' }, ' ' + (i.aggregate ? '' : i.assumption ? 'assumption' : (PLANET_SHORT[i.planet] || i.planet) + (i.state ? ', ' + i.state : ''))) : null),
        h('span', { class: 'lever-bar' }, h('span', { class: 'fill fam-' + i.family, style: { width: Math.round(months / max * 100) + '%' } })),
        h('span', { class: 'lever-months num' }, fmtMonths(months), h('span', { class: 'small muted' }, ' ' + (st.mode === 'ask' && coach ? 'at stake' : i.impactLabel.replace('per $100 a month', 'per $100/mo')))),
        coach ? h('span', { class: 'lever-why small muted' }, whyFor(st.mode === 'ask' ? i : Object.assign({}, i, { askRange: null }))) : null);
      group.appendChild(row);
    });
    panel.appendChild(group);
  });
}
function leverLabel(app, i) {
  if (i.aggregate) return app.view === 'coach' ? 'All spending lines' : 'Spending';
  if (i.assumption || i.windfall || i.barista) return i.label;
  return (i.row && i.row !== i.label ? i.row + ': ' : '') + i.label.toLowerCase();
}
function openLever(app, i, sens) {
  const coach = app.view === 'coach';
  const extra = h('div', null,
    h('p', { class: 'small' }, whyFor(i)),
    h('table', { class: 'data math-table' }, h('thead', null, h('tr', null, h('th', null, 'Shock'), h('th', { class: 'num' }, 'FI date'), h('th', { class: 'num' }, coach ? 'FI number' : 'Enough'))),
      h('tbody', null, i.shocks.map(s => h('tr', null, h('td', null, s.label), h('td', { class: 'num' }, s.months === null ? 'never' : (s.months > 0 ? '+' : '') + fmtMonths(s.months).replace(/^(\d)/, (s.months < 0 ? '-' : '') + '$1')), h('td', { class: 'num' }, s.rungs && s.rungs.regularFi !== null && s.rungs.regularFi !== undefined ? (s.rungs.regularFi > 0 ? '+' : '') + F.dollarsCompact(s.rungs.regularFi) : ''))))));
  if (i.range && coach) extra.appendChild(h('p', { class: 'small muted' }, 'Plausible range: ' + (i.kind === 'percent' ? F.percent(i.range.low) + ' to ' + F.percent(i.range.high) : F.dollarsWhole(i.range.low) + ' to ' + F.dollarsWhole(i.range.high)) + (i.range.typed ? ' (typed).' : ' (' + Math.round(i.range.spread * 100) + '% band for ' + i.state + ').')));
  if (i.rowId && !i.windfall && coach) extra.appendChild(h('p', null, h('a', { class: 'btn small', href: '#/ledger/' + i.planet, onClick: () => { app.focusAfterRender = { rowId: i.rowId, field: i.rootId }; } }, 'Go to the cell')));
  openRoot(app, i.rootId, extra, leverLabel(app, i));
}

/* The graph: layered left to right, roots to the FI date; a tap highlights everything upstream and downstream. */
export function drawGraph(panel, app, sens, opts) {
  const g = graphOf(app); const d3 = globalThis.d3; sens = sens || { items: [] }; const o = opts || {};
  const keep = upstream(g, 'm.fiDate'); keep.add('m.fiDate'); ['m.leanFi', 'm.baristaLeanFi', 'm.baristaRegularFi', 'm.regularFi', 'm.fatFi', 'm.coastFi', 'm.fiNumber'].forEach(id => { keep.add(id); upstream(g, id).forEach(x => keep.add(x)); });
  const impactBy = {}; (sens.items || []).forEach(i => { if (i.rootId && (impactBy[i.rootId] === undefined || i.impact > impactBy[i.rootId])) impactBy[i.rootId] = i.impact || 0; });
  const nodes = Array.from(keep).map(id => g.nodes.get(id)).filter(n => n && (n.kind !== 'field' || !n.tag) && n.kind !== 'sink');
  const layers = [[], [], [], [], [], []]; nodes.forEach(n => layers[layerOf(n)].push(n));
  layers.forEach(l => l.sort((a, b) => (impactBy[b.id] || 0) - (impactBy[a.id] || 0) || a.label.localeCompare(b.label)));
  const W = Math.max(720, panel.clientWidth - 32), rowH = 16, H = Math.max(...layers.map(l => l.length)) * rowH + 40;
  const host = h('div', { class: 'graph-host' }); panel.appendChild(host);
  if (!o.quiet) panel.appendChild(h('p', { class: 'small muted' }, 'Left to right: inputs, planet outputs, the projection, metrics, the FI ladder, the FI date. Tap a node to light its paths; bolder inputs move the date more.'));
  const svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('class', 'chart graph').attr('role', 'img').attr('aria-label', 'Dependency graph from inputs to the FI date');
  const colX = i => 20 + i * ((W - 40) / 5);
  const pos = {}; layers.forEach((l, i) => l.forEach((n, j) => { pos[n.id] = { x: colX(i), y: 24 + j * rowH + (H - 40 - l.length * rowH) / 2 }; }));
  const edges = g.edges.filter(e => pos[e.from] && pos[e.to]);
  const lines = svg.append('g').selectAll('path').data(edges).join('path').attr('class', e => 'graph-edge' + (e.sign < 0 ? ' neg' : '')).attr('d', e => { const a = pos[e.from], b = pos[e.to]; const mx = (a.x + b.x) / 2; return 'M' + a.x + ',' + a.y + 'C' + mx + ',' + a.y + ' ' + mx + ',' + b.y + ' ' + b.x + ',' + b.y; });
  const labelsG = svg.append('g');
  const dots = svg.append('g').selectAll('circle').data(nodes).join('circle').attr('class', n => 'graph-node kind-' + n.kind + ' fam-' + (n.family || 'none')).attr('cx', n => pos[n.id].x).attr('cy', n => pos[n.id].y).attr('r', n => isRoot(n) ? 3 + Math.min(5, Math.sqrt(impactBy[n.id] || 0)) : 4).style('cursor', 'pointer');
  labelsG.selectAll('text').data(nodes).join('text').attr('class', n => 'chart-label graph-label' + (isRoot(n) && (impactBy[n.id] || 0) > 0 ? ' strong' : '')).attr('x', n => pos[n.id].x + (layerOf(n) === 5 ? 0 : 8)).attr('y', n => pos[n.id].y + (layerOf(n) === 5 ? 18 : 4)).attr('text-anchor', n => layerOf(n) === 5 ? 'end' : 'start').text(n => F.shorten(n.kind === 'metric' ? n.label : n.label, 22)).style('cursor', 'pointer').on('click', (ev, n) => select(n));
  dots.append('title').text(n => n.label); dots.on('click', (ev, n) => select(n));
  function select(n) {
    const up = upstream(g, n.id), down = downstream(g, n.id); up.add(n.id); down.add(n.id);
    lines.classed('lit', e => (up.has(e.from) && up.has(e.to)) || (down.has(e.from) && down.has(e.to))).classed('dim', e => !((up.has(e.from) && up.has(e.to)) || (down.has(e.from) && down.has(e.to))));
    dots.classed('lit', m => up.has(m.id) || down.has(m.id)).classed('dim', m => !(up.has(m.id) || down.has(m.id)));
    labelsG.selectAll('text').classed('dim', m => !(up.has(m.id) || down.has(m.id)));
    if (o.onSelect) { o.onSelect(n); return; }
    if (n.kind === 'metric') openMetric(app, n.id.slice(2)); else if (isRoot(n)) { const item = (sens.items || []).find(i => i.rootId === n.id); if (item) openLever(app, item, sens); else openRoot(app, n.id); }
  }
  if (o.focus && g.nodes.has(o.focus)) select(g.nodes.get(o.focus));
}
