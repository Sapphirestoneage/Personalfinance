/* The unlock loop (MR-059): what a save opened up, where it lives, and the one
   input that would open the most next. Views only draw: every state, diff,
   count and ranking comes from engine/unlocks.js. The reveal is a side panel
   on a laptop and a slide-up sheet on a phone; small unlocks fold to a toast.
   Motion honours prefers-reduced-motion through CSS. */
import { h, clear, qs } from './dom.js';
import * as F from '../engine/format.js';
import * as U from '../engine/unlocks.js';
import { CHARTS } from '../engine/chartdata.js';
import * as Charts from './charts.js';
import { versionKey } from '../engine/sensitivity.js';
import { buildGraph, rootsOf } from '../engine/graph.js';
import { PLANET_LABELS } from '../engine/sun.js';
import { fieldDef } from '../engine/fields.js';
import { closeOverlay } from './app.js';

/* ---- watching saves ---- */
let pending = { items: [], timer: null };
let lastState = null;
export function installUnlockWatch(app) {
  const change = app.change.bind(app);
  app.change = function (fn, opts) {
    const before = app.result && app.data ? (lastState && lastState.key === versionKey(app.record, app.result.today) ? lastState.state : U.stateOf(app.result, app.data)) : null;
    const line = change(fn, opts);
    if (line === null || !before || !app.result) return line;
    if (line && (line.kind === 'import' || line.kind === 'remove-row' || line.kind === 'undo' || line.kind === 'redo')) { lastState = null; return line; }
    const after = U.stateOf(app.result, app.data);
    lastState = { key: versionKey(app.record, app.result.today), state: after };
    const u = U.unlocksBetween(before, after, app.result, app.data);
    if (u.count) queue(app, u);
    return line;
  };
  /* a client change resets the memory */
  const open = app.open.bind(app);
  app.open = function (id) { lastState = null; pending.items = []; return open(id); };
}
function queue(app, u) {
  pending.items = pending.items.concat(u.metrics, u.lenses, u.charts);
  pending.hash = location.hash;
  clearTimeout(pending.timer);
  /* saves inside 400 ms land in one panel (a row's three fields typed in a row) */
  pending.timer = setTimeout(() => { const items = dedupe(pending.items); pending.items = []; reveal(app, items, { moved: location.hash !== pending.hash }); }, 400);
}
function dedupe(items) { const seen = new Set(); return items.filter(it => { const k = it.kind + ':' + it.id; if (seen.has(k)) return false; seen.add(k); return true; }); }

/* what the client may see: every lens the coach ticked, every chart not hidden */
export function visibleToClient(app, item) {
  if (app.view === 'coach') return true;
  if (item.kind === 'lens') return (app.record.sun.clientPicks || []).includes(item.id);
  if (item.kind === 'chart') return clientCharts(app).includes(item.id);
  return true;
}
export function clientCharts(app) { const c = app.record.sun.clientCharts; return Array.isArray(c) ? c : CHARTS.map(x => x.id); }
const nameOf = (app, it) => (app.view === 'client' ? it.clientName : it.name) || it.name;

/* ---- the reveal ---- */
export function reveal(app, allItems, o) {
  o = o || {};
  const items = allItems.filter(it => visibleToClient(app, it));
  if (!items.length) return;
  const charts = items.filter(i => i.kind === 'chart'), metrics = items.filter(i => i.kind === 'metric'), lenses = items.filter(i => i.kind === 'lens');
  const big = charts.length > 0 || items.length >= 3;
  /* never take over while the coach is typing or has another drawer open: a toast carries the news and opens the panel on tap */
  const active = document.activeElement;
  const typing = !!(active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName));
  const otherDrawer = !!document.querySelector('#overlay .drawer:not(.unlock-sheet)');
  if (!big || otherDrawer || o.moved || (typing && !charts.length)) { /* moved: the screen changed since the save, so the news waits in a toast */
    const first = items[0];
    app.toast((app.view === 'coach' ? 'Unlocked: ' : 'New: ') + nameOf(app, first) + (items.length > 1 ? ' and ' + (items.length - 1) + ' more' : ''), { label: 'See what you unlocked', ms: 7000, action: () => openPanel(app, items) });
    return;
  }
  openPanel(app, items, { keepFocus: typing });
}
export function openPanel(app, items, o) {
  o = o || {}; const before = document.activeElement;
  const charts = items.filter(i => i.kind === 'chart'), metrics = items.filter(i => i.kind === 'metric'), lenses = items.filter(i => i.kind === 'lens');
  const coach = app.view === 'coach';
  const body = h('div', { class: 'unlock-panel', dataset: { count: String(items.length) } });
  body.appendChild(h('h2', null, coach ? 'Unlocked' : 'What just opened up', h('span', { class: 'tag' }, items.length + (items.length === 1 ? ' item' : ' items'))));
  body.appendChild(h('p', { class: 'small muted' }, coach ? 'What that save made possible. Tap anything to see it on Measure.' : 'Each number here comes straight from what you just told us.'));
  let i = 0;
  const group = (title, list, draw) => { if (!list.length) return; body.appendChild(h('h3', null, title, h('span', { class: 'tag' }, String(list.length)))); const ul = h('div', { class: 'unlock-list' }); list.forEach(it => { const el = draw(it); el.style.setProperty('--i', String(i++)); ul.appendChild(el); }); body.appendChild(ul); };
  group('Charts', charts, it => itemCard(app, it, { thumb: true }));
  group('Numbers', metrics, it => itemCard(app, it));
  group('Lenses', lenses, it => itemCard(app, it));
  body.appendChild(nextUnlockCard(app, { compact: true, from: location.hash }));
  app.openDrawer(body, { label: coach ? 'Unlocked' : 'What just opened up', cls: 'unlock-sheet' });
  if (o.keepFocus && before && before.isConnected && before.focus) before.focus(); /* the cursor stays where the coach was typing */
  /* a tap anywhere outside the sheet puts it away */
  const away = e => { const sheet = document.querySelector('#overlay .unlock-sheet'); if (!sheet) { document.removeEventListener('mousedown', away, true); return; } if (!sheet.contains(e.target)) { closeOverlay(); document.removeEventListener('mousedown', away, true); } };
  setTimeout(() => document.addEventListener('mousedown', away, true), 0);
}
function itemCard(app, it, o) {
  o = o || {};
  const upWord = it.from === 'rough' ? 'now solid' : it.to === 'rough' ? 'rough for now' : 'new';
  const card = h('a', { class: 'reveal-item kind-' + it.kind + ' to-' + it.to, href: it.href, onClick: e => { e.preventDefault(); closeOverlay(); location.hash = it.href; } },
    o.thumb ? chartThumb(app, it.id) : null,
    h('div', { class: 'reveal-text' },
      h('div', { class: 'reveal-name' }, nameOf(app, it), h('span', { class: 'chip state-' + (it.to === 'solid' ? 'known' : 'rough') }, upWord)),
      it.value ? h('div', { class: 'reveal-value' + (it.to === 'rough' ? ' rough' : '') }, it.value) : null,
      h('div', { class: 'small muted reveal-take' }, it.takeaway)));
  return card;
}
/* a small live chart, drawn from the same data the big one uses */
export function chartThumb(app, chartId, o) {
  o = o || {};
  const def = CHARTS.find(c => c.id === chartId);
  const host = h('div', { class: 'chart-thumb' + (o.locked ? ' locked' : ''), 'aria-hidden': 'true' });
  if (o.locked || !def) { host.appendChild(h('div', { class: 'thumb-name' }, def ? (app.view === 'client' ? def.client : def.name) : chartId)); return host; }
  setTimeout(() => { try { host.style.width = (o.width || 240) + 'px'; Charts.render(chartId, host, def.build(app.result), { client: app.view === 'client' }); } catch (e) { host.appendChild(h('div', { class: 'thumb-name' }, def.name)); } }, 0);
  return host;
}

/* ---- the next unlock ---- */
let nextCache = { key: null, list: null };
export function nextUnlocksFor(app) {
  if (!app.record || !app.result) return [];
  const key = versionKey(app.record, app.result.today) + ':' + app.view;
  if (nextCache.key === key) return nextCache.list;
  const list = U.nextUnlocks(app.record, app.result, app.data, { top: 3 });
  nextCache = { key, list };
  return list;
}
export function describeProbe(app, probe) {
  if (probe.kind === 'sun') return 'Add the ' + probe.label.toLowerCase() + ' under Household facts';
  if (probe.kind === 'type') return 'Add a first ' + probe.label.split(':')[0].toLowerCase() + ' row and its ' + probe.label.split(': ')[1].toLowerCase();
  if (probe.kind === 'confirm') return probe.label + ' (it is rough today)';
  return 'Fill in ' + probe.label.toLowerCase();
}
/* opens the Ledger row with the cursor in the field; remembers where we came from for "Back to where I was" */
export function goToProbe(app, probe, from) {
  app.unlockBack = from || location.hash;
  closeOverlay();
  if (probe.kind === 'sun') { app.focusAfterRender = { rowId: 'sun', field: probe.field }; location.hash = '#/home'; return; }
  if (probe.addRow) app.addRowAfterRender = { planet: probe.planet, type: probe.type, field: probe.field };
  else app.focusAfterRender = { rowId: probe.rowId, field: probe.field, details: true };
  location.hash = probe.href;
  setTimeout(() => app.toast('Cursor is in ' + probe.label.toLowerCase() + '.', { label: 'Back to where I was', ms: 8000, action: () => { location.hash = app.unlockBack || '#/measure'; } }), 350);
}
export function nextUnlockCard(app, o) {
  o = o || {};
  const list = nextUnlocksFor(app);
  const coach = app.view === 'coach';
  const card = h('section', { class: 'panel next-unlock' + (o.compact ? ' compact' : '') });
  card.appendChild(h('h3', null, coach ? 'Next unlock' : 'What would open the most next'));
  if (!list.length) { card.appendChild(h('p', { class: 'small muted' }, 'Nothing left that one input would open. Every number has what it needs.')); return card; }
  const big = list[0];
  const names = big.unlocks.charts.map(c => nameOf(app, c)).concat(big.unlocks.metrics.map(m => nameOf(app, m)), big.unlocks.lenses.map(l => nameOf(app, l)));
  card.appendChild(h('div', { class: 'next-big' },
    h('div', { class: 'next-count' }, String(big.unlocks.count)),
    h('div', { class: 'next-text' },
      h('div', { class: 'next-label' }, describeProbe(app, big.probe)),
      h('div', { class: 'small muted' }, big.probe.where + '. Opens ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' and ' + (names.length - 4) + ' more' : '') + '.'),
      big.unlocks.charts.length ? h('div', { class: 'thumb-row' }, big.unlocks.charts.slice(0, 3).map(c => chartThumb(app, c.id, { locked: true }))) : null,
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn primary small', onClick: () => goToProbe(app, big.probe, o.from) }, coach ? 'Open the Ledger row' : 'Add it now'), o.from || app.unlockBack ? h('button', { class: 'btn small quiet', onClick: () => { closeOverlay(); location.hash = app.unlockBack || o.from || '#/measure'; } }, 'Back to where I was') : null))));
  if (list.length > 1) card.appendChild(h('ol', { class: 'next-more' }, list.slice(1).map(x => h('li', null, h('button', { class: 'linklike', onClick: () => goToProbe(app, x.probe, o.from) }, describeProbe(app, x.probe)), h('span', { class: 'small muted' }, ' opens ' + x.unlocks.count)))));
  return card;
}

/* ---- rings ---- */
export function ring(pct, label, sub, cls) {
  const r = 26, c = 2 * Math.PI * r; const p = Math.max(0, Math.min(1, pct || 0));
  const svg = '<svg viewBox="0 0 64 64" role="img" aria-label="' + label + ' ' + Math.round(p * 100) + ' percent"><circle class="ring-track" cx="32" cy="32" r="' + r + '"/><circle class="ring-fill" cx="32" cy="32" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '" transform="rotate(-90 32 32)"/><text class="ring-text" x="32" y="36" text-anchor="middle">' + Math.round(p * 100) + '%</text></svg>';
  const el = h('div', { class: 'ring ' + (cls || '') });
  el.innerHTML = svg;
  el.appendChild(h('div', { class: 'ring-label' }, label));
  if (sub) el.appendChild(h('div', { class: 'small muted' }, sub));
  return el;
}
export function ringsRow(app, map) {
  const t = map.totals; const M = app.result.metrics;
  const row = h('div', { class: 'rings' });
  row.appendChild(ring(t.metrics.open / t.metrics.total, 'Numbers', t.metrics.open + ' of ' + t.metrics.total, 'completion'));
  row.appendChild(ring(t.lenses.open / t.lenses.total, 'Lenses', t.lenses.open + ' of ' + t.lenses.total + (t.lenses.firing ? ', ' + t.lenses.firing + ' firing' : ''), 'completion'));
  row.appendChild(ring(t.charts.open / t.charts.total, 'Charts', t.charts.open + ' of ' + t.charts.total, 'completion'));
  const fi = M && M.pctToFi && M.pctToFi.status === 'ok' ? M.pctToFi.value.value : null;
  row.appendChild(h('div', { class: 'ring-sep', 'aria-hidden': 'true' }));
  row.appendChild(fi === null ? h('div', { class: 'ring fi locked' }, h('div', { class: 'ring-empty' }, 'FI'), h('div', { class: 'ring-label' }, app.view === 'coach' ? 'FI progress' : 'How far along'), h('div', { class: 'small muted' }, 'needs spending and balances')) : ring(fi, app.view === 'coach' ? 'FI progress' : 'How far along', F.percent(fi, { places: 1 }) + ' of the FI number, a different thing from completion', 'fi'));
  return row;
}

/* ---- the map ---- */
export function unlockMapFor(app) { return U.unlockMap(app.record, app.result, app.data); }
export function renderUnlockMap(host, app) {
  clear(host);
  const coach = app.view === 'coach';
  const map = unlockMapFor(app);
  host.appendChild(h('h2', null, coach ? 'Unlock Map' : 'Everything your numbers can show', coach ? h('span', { class: 'tag' }, map.totals.metrics.open + map.totals.lenses.open + map.totals.charts.open + ' of ' + (map.totals.metrics.total + map.totals.lenses.total + map.totals.charts.total) + ' open') : null));
  host.appendChild(ringsRow(app, map));
  /* best next inputs: ranked by how much each opens */
  const next = nextUnlocksFor(app);
  if (next.length) {
    const sec = h('section', { class: 'panel best-next' }, h('h3', null, coach ? 'Best next inputs' : 'What would open the most'));
    sec.appendChild(h('ol', { class: 'best-list' }, next.map(x => h('li', null, h('button', { class: 'linklike', onClick: () => goToProbe(app, x.probe, '#/measure/unlocks') }, describeProbe(app, x.probe)), h('span', { class: 'small muted' }, ' opens ' + x.unlocks.count + ': ' + x.unlocks.charts.map(c => nameOf(app, c)).concat(x.unlocks.metrics.map(m => nameOf(app, m))).slice(0, 3).join(', ') + (x.unlocks.count > 3 ? '...' : ''))))));
    host.appendChild(sec);
  }
  map.stages.forEach(st => {
    const items = st.items.filter(it => visibleToClient(app, it) && !(it.coachOnly && !coach));
    if (!items.length) return;
    const open = items.filter(i => i.state !== 'locked').length;
    const sec = h('section', { class: 'panel stage-block', dataset: { stage: String(st.stage) } }, h('h3', null, 'Stage ' + st.stage + ': ' + st.label, h('span', { class: 'tag' }, open + ' of ' + items.length + ' open')));
    ['chart', 'metric', 'lens'].forEach(kind => {
      const list = items.filter(i => i.kind === kind); if (!list.length) return;
      sec.appendChild(h('div', { class: 'small muted tile-kind' }, kind === 'chart' ? 'Charts' : kind === 'metric' ? 'Numbers' : 'Lenses'));
      sec.appendChild(h('div', { class: 'tiles' }, list.map(it => tile(app, it))));
    });
    host.appendChild(sec);
  });
}
function tile(app, it) {
  const coach = app.view === 'coach';
  const label = nameOf(app, it);
  if (it.state === 'locked') {
    const input = it.input;
    const el = h('button', { class: 'utile locked kind-' + it.kind, dataset: { item: it.kind + ':' + it.id }, title: input ? 'Needs ' + input.label.toLowerCase() + ' (' + input.where + ')' : 'Locked', onClick: () => { if (input) goToProbe(app, Object.assign({ kind: input.planet === 'sun' ? 'sun' : 'field' }, input), '#/measure/unlocks'); } },
      h('span', { class: 'utile-name' }, label),
      h('span', { class: 'small utile-need' }, input ? 'Needs ' + input.label.toLowerCase() : 'Needs more inputs'));
    return el;
  }
  const quiet = it.state === 'quiet';
  return h('a', { class: 'utile ' + it.state + ' kind-' + it.kind, dataset: { item: it.kind + ':' + it.id }, href: it.href, title: quiet ? (it.trigger ? 'Fires when ' + it.trigger : 'Not firing') : (it.state === 'rough' ? 'Rough: a rough input feeds it' : 'Solid') },
    h('span', { class: 'utile-name' }, label),
    h('span', { class: 'small utile-value' }, quiet ? 'quiet' : (it.value || (it.kind === 'chart' ? 'open' : ''))),
    it.state === 'rough' ? h('span', { class: 'chip state-rough' }, 'rough') : null);
}
/* the compact card on Home */
export function renderHomeUnlockCard(host, app) {
  clear(host);
  if (!app.record || !app.result || !app.result.metrics) return;
  const map = unlockMapFor(app); const coach = app.view === 'coach';
  host.appendChild(h('h2', null, coach ? 'Unlock Map' : 'What your numbers can show', h('a', { class: 'small', href: '#/measure/unlocks', style: { marginLeft: 'auto' } }, 'Open the map')));
  host.appendChild(ringsRow(app, map));
  const next = nextUnlocksFor(app);
  if (next.length) host.appendChild(h('p', { class: 'small next-line' }, (coach ? 'Next unlock: ' : 'Next: ') + describeProbe(app, next[0].probe) + ' (opens ' + next[0].unlocks.count + '). ', h('button', { class: 'linklike', onClick: () => goToProbe(app, next[0].probe, '#/home') }, 'Go')));
}

/* ---- deep links: scroll to and highlight an item ---- */
export function highlight(el) {
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.add('highlight');
  setTimeout(() => el.classList.remove('highlight'), 3200);
  return true;
}

/* ---- the focused chart view ---- */
let graphCache = null;
function graphOf(app) { if (!graphCache || graphCache.data !== app.data) graphCache = { data: app.data, g: buildGraph(app.data) }; return graphCache.g; }
export function chartInputs(app, chartId) {
  const meta = app.data.unlocks.charts[chartId]; if (!meta) return { fed: [], sharpen: [] };
  const g = graphOf(app); const fed = []; const sharpen = []; const seen = new Set();
  meta.metrics.forEach(mid => {
    const m = app.result.metrics[mid];
    if (m && m.status !== 'ok' && m.needs) m.needs.forEach(n => { if (!seen.has('need:' + n)) { seen.add('need:' + n); sharpen.push({ text: 'Needs ' + n, target: U.targetFor(n, app.record, app.data) }); } });
    rootsOf(g, 'm.' + mid).forEach(node => {
      if (node.kind !== 'field' && node.kind !== 'sun') return;
      if (node.kind === 'sun') { const id = node.id.replace('sun.', ''); const f = app.record.sun.f[id]; if (f && f.v !== null && f.v !== undefined && !seen.has(node.id)) { seen.add(node.id); fed.push({ label: node.label, value: String(f.v), href: '#/home', rowId: 'sun', field: id, rough: f.state === 'rough' }); } return; }
      app.record.planets[node.planet] && app.record.planets[node.planet].rows.forEach(r => {
        const f = r.f[node.id]; if (!f || f.v === null || f.v === undefined || f.state === 'unknown') return;
        const key = r.id + ':' + node.id; if (seen.has(key)) return; seen.add(key);
        const d = fieldDef(app.data.fields, node.id);
        const text = typeof f.v === 'number' && d.kind === 'money' ? F.dollarsWhole(f.v, { rough: f.state === 'rough' }) : typeof f.v === 'number' && d.kind === 'percent' ? F.percent(f.v) : (f.v && typeof f.v === 'object' && 'low' in f.v ? F.dollarsWhole(f.v.low) + ' to ' + F.dollarsWhole(f.v.high) : String(f.v));
        const item = { label: (r.nickname ? r.nickname + ': ' : '') + d.label, value: text, href: '#/ledger/' + node.planet + '/' + r.type, rowId: r.id, field: node.id, rough: f.state === 'rough' || f.source === 'estimated' || f.source === 'lookup-verify', planet: node.planet };
        fed.push(item);
        if (item.rough) sharpen.push({ text: 'Confirm ' + item.label.toLowerCase() + ' (' + (f.source === 'estimated' ? 'a guess' : f.state === 'rough' ? 'rough' : 'looked up, verify') + ')', target: { href: item.href, rowId: r.id, field: node.id, label: d.label, planet: node.planet, type: r.type } });
      });
    });
  });
  return { fed: fed.slice(0, 10), sharpen: sharpen.slice(0, 5) };
}
export function chartTakeaway(app, chartId) {
  const def = CHARTS.find(c => c.id === chartId); const meta = app.data.unlocks.charts[chartId];
  const parts = [];
  (meta ? meta.metrics : []).forEach(mid => { const m = app.result.metrics[mid]; const d = app.data.metrics.metrics.find(x => x.id === mid); if (m && m.status === 'ok' && d) { const v = U.valueText(m); if (v) parts.push((app.view === 'client' ? d.clientLabel : d.name) + ' ' + v); } });
  return def.client + (parts.length ? '. ' + parts.slice(0, 2).join('; ') + '.' : '.');
}
export function renderFocusedChart(host, app, chartId, back) {
  clear(host);
  const def = CHARTS.find(c => c.id === chartId);
  if (!def) { host.appendChild(h('p', { class: 'muted' }, 'No chart by that name.')); return; }
  const coach = app.view === 'coach';
  const data = def.build(app.result);
  host.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('a', { class: 'btn small', href: back || '#/measure/charts' }, 'Back to where I was')));
  const panel = h('section', { class: 'panel chart-panel focused', dataset: { chart: chartId } });
  panel.appendChild(h('header', null, h('h2', null, data && !data.needs ? chartTakeaway(app, chartId) : (coach ? def.name : def.client))));
  const body = h('div', { class: 'chart-big', dataset: { chartBody: chartId } });
  panel.appendChild(body);
  host.appendChild(panel);
  setTimeout(() => Charts.render(chartId, body, data, { client: !coach }), 0);
  if (data && data.needs) {
    panel.appendChild(h('p', { class: 'muted' }, 'Needs ' + data.needs.join(', ') + '.'));
    const t = U.targetFor(data.needs[0], app.record, app.data);
    if (t) panel.appendChild(h('button', { class: 'btn primary small', onClick: () => goToProbe(app, Object.assign({ kind: t.planet === 'sun' ? 'sun' : 'field' }, t), '#/measure/charts/' + chartId) }, 'Add ' + t.label.toLowerCase()));
  } else {
    const inputs = chartInputs(app, chartId);
    if (inputs.fed.length) host.appendChild(h('section', { class: 'panel' }, h('h3', null, coach ? 'Inputs that fed it' : 'What this is built from'), h('ul', { class: 'fed-list' }, inputs.fed.map(i => h('li', null, h('a', { href: i.href, onClick: () => { app.focusAfterRender = { rowId: i.rowId, field: i.field, details: i.rowId !== 'sun' }; } }, i.label), h('span', { class: 'num' + (i.rough ? ' rough' : '') }, i.value))))));
    if (inputs.sharpen.length) host.appendChild(h('section', { class: 'panel' }, h('h3', null, coach ? 'What would sharpen it' : 'What would make this more exact'), h('ul', { class: 'sharpen-list' }, inputs.sharpen.map(sx => h('li', null, sx.target ? h('button', { class: 'linklike', onClick: () => goToProbe(app, Object.assign({ kind: sx.target.rowId === 'sun' ? 'sun' : 'field', addRow: !sx.target.rowId || sx.target.addRow }, sx.target), '#/measure/charts/' + chartId) }, sx.text) : sx.text)))));
  }
  host.appendChild(nextUnlockCard(app, { from: '#/measure/charts/' + chartId }));
}
