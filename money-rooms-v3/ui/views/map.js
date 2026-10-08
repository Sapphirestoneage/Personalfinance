/* The Map (Level 12, MR-063): how the numbers connect. Pick a number and see
   what feeds it, what it feeds, its path to the FI date and, since the last
   snapshot, which inputs moved it. A list at every width; Coach view on a
   wide screen can switch to the drawing shared with the levers screen.
   No internal words on screen: inputs, numbers and paths, never nodes or
   edges. Views never do math; the engine's graph and explain() answer. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { rootsOf, metricsFed, through, explain, netSign } from '../../engine/graph.js';
import { rewind, lastSnapshot, numOf, deltaText, defOf as defFrom } from '../../engine/momentum.js';
import { graphOf, openMetric, openRoot } from '../metricdrawer.js';
import { drawGraph } from './levers.js';
import { cachedSensitivity } from '../levers-bridge.js';
import { metricLabel } from '../glossary.js';
import { PLANET_LABELS } from '../../engine/sun.js';
import { visible, isClient, defOf, needsOf } from '../scorebits.js';

const LAYER_WORDS = { field: 'Typed in a room', sun: 'Household fact', asm: 'Assumption', record: 'From the program', slot: 'A room\'s own output', projection: 'The projection to 95', metric: 'A number' };
let graphOn = false;

export function mount(host, app) {
  const client = isClient(app); const g = graphOf(app); const picked = app.route.params.id && defOf(app, app.route.params.id) ? app.route.params.id : null;
  host.appendChild(h('header', null, h('h1', null, client ? 'How it connects' : 'Map'), h('span', { class: 'sub' }, client ? 'Every number comes from things you typed. Pick one to see the chain.' : 'Inputs to rooms to numbers to the FI date. Pick a number to follow its chain.'), h('div', { class: 'actions' },
    h('a', { class: 'btn', href: '#/scoreboard' }, 'Scoreboard'),
    !client && host.clientWidth > 900 ? h('button', { class: 'btn', 'aria-pressed': String(graphOn), onClick: () => { graphOn = !graphOn; app.rerender(); } }, graphOn ? 'Show as a list' : 'Show as a drawing') : null)));
  const body = h('div', { class: 'map-body' }); host.appendChild(body);
  function draw() {
    clear(body);
    const metrics = app.data.metrics.metrics.filter(m => visible(app, m));
    const sel = h('select', { class: 'select', 'aria-label': 'Which number', onChange: e => { location.hash = e.target.value ? '#/map/' + e.target.value : '#/map'; } }, h('option', { value: '' }, client ? 'Pick a number' : 'Pick a number'), metrics.map(m => h('option', { value: m.id, selected: m.id === picked }, metricLabel(app, m))));
    body.appendChild(h('div', { class: 'row map-pick' }, h('label', { class: 'small' }, client ? 'Number' : 'Number'), sel));
    if (!client && graphOn && host.clientWidth > 900) { const panel = h('section', { class: 'panel' }); body.appendChild(panel); drawGraph(panel, app, cachedSensitivity(app), { focus: picked ? 'm.' + picked : null, onSelect: n => { if (n.kind === 'metric') location.hash = '#/map/' + n.id.slice(2); else openRoot(app, n.id); } }); return; }
    if (!picked) { drawIndex(body, app, metrics); return; }
    drawMetric(body, app, g, picked);
  }
  draw();
  return { update() { draw(); } };
}

function drawIndex(body, app, metrics) {
  const groups = app.data.metrics.scoreGroups || {}; const client = isClient(app);
  body.appendChild(h('p', { class: 'small muted' }, client ? 'Pick any number to see what it is made of and what it changes.' : 'Every number by group; a tap follows its chain. The drawing (wide screens) shows them all at once.'));
  const grid = h('div', { class: 'grid grid-3 map-index' });
  Object.keys(groups).forEach(gid => { const list = metrics.filter(m => m.scoreGroup === gid); if (!list.length) return; grid.appendChild(h('section', { class: 'panel' }, h('h2', null, groups[gid]), h('ul', { class: 'map-list' }, list.map(m => { const ok = app.result.metrics[m.id] && app.result.metrics[m.id].status === 'ok'; return h('li', { class: ok ? '' : 'locked' }, h('a', { href: '#/map/' + m.id }, metricLabel(app, m))); })))); });
  body.appendChild(grid);
}

function drawMetric(body, app, g, id) {
  const client = isClient(app); const def = defOf(app, id); const m = app.result.metrics[id];
  body.appendChild(h('section', { class: 'panel map-focus' }, h('h2', null, metricLabel(app, def)), h('p', { class: 'small muted' }, def.definition), m && m.status === 'ok' ? h('p', { class: 'big-value' }, h('button', { class: 'linklike', onClick: () => openMetric(app, id) }, (m.value && typeof m.value.cents === 'number') ? F.dollarsWhole(m.value.cents, { rough: m.value.rough }) : F.value(m.value))) : h('p', { class: 'muted' }, (client ? 'Opens with ' : 'Needs ') + needsOf(m).join(', ') + '.')));
  const grid = h('div', { class: 'grid grid-2' }); body.appendChild(grid);
  /* what feeds it, by room */
  const roots = rootsOf(g, id).filter(n => !n.tag); const byPlanet = {};
  roots.forEach(n => { const k = n.kind === 'asm' ? 'Assumptions' : n.kind === 'sun' ? 'Household facts' : n.kind === 'record' ? 'The program' : PLANET_LABELS[n.planet] || n.planet; (byPlanet[k] = byPlanet[k] || []).push(n); });
  grid.appendChild(h('section', { class: 'panel' }, h('h2', null, client ? 'What goes into it' : 'What feeds it', h('span', { class: 'tag' }, roots.length + (roots.length === 1 ? ' input' : ' inputs'))),
    roots.length ? Object.keys(byPlanet).map(k => h('div', { class: 'map-group' }, h('h3', null, k), h('ul', { class: 'map-list' }, byPlanet[k].map(n => { const s = netSign(g, n.id, 'm.' + id); return h('li', null, client ? h('span', null, n.label) : h('button', { class: 'linklike', onClick: () => openRoot(app, n.id) }, n.label), h('span', { class: 'small muted' }, ' ' + (s === null ? '' : s === 0 ? 'moves it both ways' : s > 0 ? 'raises it' : 'lowers it'))); })))) : h('p', { class: 'muted small' }, 'Nothing typed feeds this one directly.')));
  /* what it feeds and the way to the FI date */
  const fed = metricsFed(g, 'm.' + id).filter(n => { const d = defOf(app, n.id.slice(2)); return d && visible(app, d); });
  const path = through(g, 'm.' + id, 'm.fiDate').filter(n => n.id !== 'm.' + id);
  grid.appendChild(h('section', { class: 'panel' }, h('h2', null, client ? 'What it changes' : 'What it feeds', h('span', { class: 'tag' }, fed.length + (fed.length === 1 ? ' number' : ' numbers'))),
    fed.length ? h('ul', { class: 'map-list' }, fed.slice(0, 24).map(n => h('li', null, h('a', { href: '#/map/' + n.id.slice(2) }, metricLabel(app, defOf(app, n.id.slice(2))))))) : h('p', { class: 'muted small' }, client ? 'This one is an end point: nothing else is built on it.' : 'An end point: no other number reads it.'),
    h('h3', { style: { marginTop: '12px' } }, client ? 'On the way to work being a choice' : 'On the way to the FI date'),
    id === 'fiDate' ? h('p', { class: 'small muted' }, client ? 'This is the date itself.' : 'This is the FI date.') : path.length ? h('p', { class: 'small path-line' }, path.map(n => n.kind === 'metric' ? metricLabel(app, defOf(app, n.id.slice(2)) || { name: n.label, clientLabel: n.label }) : n.kind === 'projection' ? (client ? 'the path to 95' : 'the projection') : (LAYER_WORDS[n.kind] ? n.label.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() : n.label)).join(' → ') + ' → ' + (client ? 'when work becomes a choice' : 'FI date')) : h('p', { class: 'small muted' }, client ? 'This number does not change the date; it describes something else.' : 'Does not reach the FI date.')));
  /* since the last snapshot: which inputs moved it (Coach; one engine run per changed input) */
  const snap = lastSnapshot(app.record);
  if (!client && snap && m && m.status === 'ok') {
    const panel = h('section', { class: 'panel' }, h('h2', null, 'Since the last snapshot'), h('p', { class: 'small muted' }, 'Working it out.')); body.appendChild(panel);
    setTimeout(() => {
      try {
        const before = rewind(app.record, snap.ts);
        const ex = explain(g, id, before, app.record, { compute: r => app.compute(r, app.data), numOf });
        clear(panel); panel.appendChild(h('h2', null, 'Since the last snapshot', h('span', { class: 'tag' }, F.dateLocal(snap.ts))));
        if (ex.total === null) panel.appendChild(h('p', { class: 'muted small' }, 'Not enough history yet.'));
        else if (!ex.parts.length && !ex.rowsAdded && !ex.rowsRemoved) panel.appendChild(h('p', { class: 'small' }, 'No input behind this number changed; it reads ' + deltaText(def, ex.total) + '.'));
        else {
          panel.appendChild(h('p', { class: 'small' }, 'Moved ' + deltaText(def, ex.total) + ' in all.'));
          panel.appendChild(h('ul', { class: 'map-list' }, ex.parts.slice(0, 8).map(p => h('li', null, h('button', { class: 'linklike', onClick: () => openRoot(app, p.root) }, p.label), h('span', { class: 'small muted' }, ' (' + (PLANET_LABELS[p.planet] || p.planet) + ', ' + p.changes + (p.changes === 1 ? ' change' : ' changes') + '): '), h('span', { class: 'small' }, p.delta === null ? 'no effect alone' : deltaText(def, p.delta))))));
          if (ex.rowsAdded || ex.rowsRemoved || Math.abs(ex.other || 0) > 1e-9) panel.appendChild(h('p', { class: 'small muted' }, [ex.rowsAdded ? ex.rowsAdded + (ex.rowsAdded === 1 ? ' row added' : ' rows added') : null, ex.rowsRemoved ? ex.rowsRemoved + (ex.rowsRemoved === 1 ? ' row removed' : ' rows removed') : null, Math.abs(ex.other || 0) > 1e-9 ? 'together and in combination: ' + deltaText(def, ex.other) : null].filter(Boolean).join('; ') + '.'));
        }
      } catch (e) { clear(panel); panel.appendChild(h('h2', null, 'Since the last snapshot')); panel.appendChild(h('p', { class: 'muted small' }, 'Could not work this one out.')); }
    }, 0);
  }
}
