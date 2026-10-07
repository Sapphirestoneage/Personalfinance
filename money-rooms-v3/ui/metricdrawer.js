/* One drawer for any metric (Level 9, MR-044): the math as before, then the
   inputs that feed it (from the graph), the levers that move it and which
   way (from data/metrics.json), and the lens that reads it. Views only draw. */
import { h } from './dom.js';
import * as F from '../engine/format.js';
import { buildGraph, rootsOf, metricsFed, netSign } from '../engine/graph.js';
import { metricLabel } from './glossary.js';
import { PLANET_LABELS } from '../engine/sun.js';

let graphCache = null;
export function graphOf(app) { if (!graphCache || graphCache.data !== app.data) graphCache = { data: app.data, g: buildGraph(app.data) }; return graphCache.g; }

const FAMILY_WORDS = { spend: 'Spend less', earn: 'Earn more', keep: 'Keep more', grow: 'Grow', protect: 'Protect', assume: 'Assume' };
export function familyLabel(f) { return FAMILY_WORDS[f] || f; }
const dirWord = d => d === 'higher' ? 'Higher is better' : d === 'lower' ? 'Lower is better' : 'A shape, not a score';
export function signWord(sign, direction) {
  if (sign === null) return 'does not reach it';
  if (sign === 0) return 'moves it both ways';
  return sign > 0 ? 'raises it' : 'lowers it';
}
function rootLabel(app, g, id) { const n = g.nodes.get(id); if (!n) return id; if (n.kind === 'asm') return n.label; if (n.kind === 'sun') return n.label; return n.label + (n.planet && n.planet !== 'asm' && n.planet !== 'sun' ? ' (' + (PLANET_LABELS[n.planet] || n.planet) + ')' : ''); }
function valueText(m) {
  if (!m || m.status !== 'ok') return null;
  const v = m.value;
  if (typeof v.cents === 'number') return F.dollarsWhole(v.cents, { rough: v.rough });
  if (v.kind === 'list' || v.kind === 'shares') return '';
  try { return F.value(v) || ''; } catch (e) { return ''; }
}

/* The body of the metric drawer; `math` is the existing show-the-math body builder from Measure. */
export function metricBody(app, id, mathBody) {
  const def = app.data.metrics.metrics.find(x => x.id === id); const m = app.result.metrics[id];
  const g = graphOf(app); const coach = app.view === 'coach';
  const body = h('div', { class: 'metric-drawer' });
  if (mathBody) body.appendChild(mathBody);
  else body.appendChild(h('div', null, h('h2', null, metricLabel(app, def)), h('p', { class: 'muted small' }, def.definition), m && m.status === 'ok' ? h('p', { class: 'big-value' }, valueText(m)) : h('p', { class: 'muted' }, 'Needs ' + ((m && m.needs) || ['inputs']).join(', '))));
  body.appendChild(h('p', { class: 'small muted', style: { marginTop: '8px' } }, dirWord(def.direction) + '.'));
  /* levers */
  if (def.levers && def.levers.length) {
    body.appendChild(h('h3', { style: { marginTop: '12px' } }, coach ? 'Levers' : 'What moves it'));
    body.appendChild(h('ul', { class: 'levers-list' }, def.levers.map(l => { const n = g.nodes.get(l.root); return h('li', null, h('span', { class: 'chip fam-' + ((n && n.family) || 'assume') }, familyLabel((n && n.family) || 'assume')), ' ', h('strong', null, n ? n.label : l.root), ' ', h('span', { class: 'muted' }, l.sign > 0 ? 'raises it. ' : 'lowers it. '), l.text); })));
  }
  /* inputs from the graph */
  const roots = rootsOf(g, id).filter(n => !n.tag).sort((a, b) => (a.planet || '').localeCompare(b.planet || '') || a.label.localeCompare(b.label));
  if (roots.length && coach) {
    body.appendChild(h('h3', { style: { marginTop: '12px' } }, 'Inputs that feed it', h('span', { class: 'tag' }, roots.length + ' roots')));
    body.appendChild(h('p', { class: 'small muted' }, roots.slice(0, 18).map(n => rootLabel(app, g, n.id)).join(', ') + (roots.length > 18 ? ' and ' + (roots.length - 18) + ' more' : '') + '.'));
  }
  /* the lens that reads it */
  const lensDefs = app.data.lenses.lenses.filter(l => l.metric === id);
  if (lensDefs.length) {
    const firing = (app.result.lenses || []);
    body.appendChild(h('h3', { style: { marginTop: '12px' } }, lensDefs.length === 1 ? 'The lens that reads it' : 'Lenses that read it'));
    lensDefs.forEach(ld => { const live = firing.find(l => l.id === ld.id); body.appendChild(h('p', { class: 'small' }, h('strong', null, ld.name + ': '), live ? live.text : h('span', { class: 'muted' }, 'quiet now; fires when ' + ld.trigger + '.'))); });
  }
  if (coach) body.appendChild(h('p', { style: { marginTop: '12px' } }, h('a', { class: 'btn small', href: '#/levers' }, 'Open What moves the FI date')));
  return body;
}

/* The body of the root drawer: every metric a root feeds and which way. */
export function rootBody(app, rootId, extra, title) {
  const g = graphOf(app); const n = g.nodes.get(rootId); const coach = app.view === 'coach';
  const body = h('div', { class: 'root-drawer' });
  body.appendChild(h('h2', null, title || (n ? n.label : rootId), n ? h('span', { class: 'tag' }, familyLabel(n.family)) : null));
  if (n && n.noFiEffect) body.appendChild(h('p', { class: 'small muted' }, 'Does not move the FI date: ' + n.noFiEffect + '.'));
  if (extra) body.appendChild(extra);
  const fed = metricsFed(g, rootId).filter(m => coach || !m.coachOnly).map(m => ({ m, sign: netSign(g, rootId, m.id) })).sort((a, b) => (a.m.group || '').localeCompare(b.m.group || ''));
  if (fed.length) {
    body.appendChild(h('h3', { style: { marginTop: '12px' } }, coach ? 'Every number it feeds' : 'What it changes', h('span', { class: 'tag' }, fed.length + (fed.length === 1 ? ' number' : ' numbers'))));
    body.appendChild(h('table', { class: 'data math-table' }, h('tbody', null, fed.map(({ m, sign }) => { const live = app.result.metrics[m.id.slice(2)]; return h('tr', null, h('td', null, h('button', { class: 'linklike', onClick: () => openMetric(app, m.id.slice(2)) }, coach ? m.label : m.clientLabel)), h('td', { class: 'small muted' }, 'rising ' + signWord(sign)), h('td', { class: 'num' }, valueText(live) || '')); }))));
  }
  return body;
}

let mathBuilder = null;
export function registerMath(fn) { mathBuilder = fn; }
export function openMetric(app, id) {
  const def = app.data.metrics.metrics.find(x => x.id === id); if (!def) return;
  const math = mathBuilder ? mathBuilder(app, app.result.metrics[id], def) : null;
  app.openDrawer(metricBody(app, id, math), { label: metricLabel(app, def) });
}
export function openRoot(app, rootId, extra, title) { app.openDrawer(rootBody(app, rootId, extra, title), { label: 'What this feeds' }); }
