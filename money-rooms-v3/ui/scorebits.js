/* Shared pieces of the Scoreboard (Level 12, MR-063): a tile, a trend line,
   a band word, a milestone line, the next action, and the words for the
   client's gentle mode. Views only draw; every figure comes from
   engine/momentum.js, the computed result or the sensitivity run. No
   internal words reach the screen: no registry, node, edge or band. */
import { h } from './dom.js';
import * as F from '../engine/format.js';
import { trend, milestone, bandOf, numOf, textOf, nextActionFor, overallNextAction, snapshotsOf } from '../engine/momentum.js';
import { targetFor } from '../engine/unlocks.js';
import { goToProbe } from './unlocks.js';
import { metricLabel } from './glossary.js';
import { sparkline } from './charts-more.js';
import { cachedSensitivity, getSensitivity } from './levers-bridge.js';

/* what a locked metric needs, never an empty list */
export function needsOf(m) { const n = m && Array.isArray(m.needs) ? m.needs.filter(Boolean) : []; return n.length ? n : ['more of the picture']; }
export const ARROWS = { up: '↑', down: '↓', flat: '→' };
const ZONE_COACH = { healthy: 'Healthy', ok: 'OK', watch: 'Watch' };
const ZONE_CLIENT = { healthy: 'In a good place', ok: 'Getting there', watch: 'Worth a look' };
export function zoneWord(zone, client) { return (client ? ZONE_CLIENT : ZONE_COACH)[zone] || ''; }
export const defOf = (app, id) => app.data.metrics.metrics.find(m => m.id === id);
export const isClient = app => app.view === 'client';
/* a metric the client may see: true, or 'coach' only in Coach view */
export function visible(app, def) { return isClient(app) ? def.clientVisible === true : def.clientVisible !== false; }

/* the client's sentence for a tile: the gentle template from the registry, with the value and the trend filled in */
export function gentleSentence(app, id) {
  const def = defOf(app, id); const m = app.result.metrics[id]; if (!def || !m || m.status !== 'ok') return '';
  const t = trend(app.record, app.result, app.data, id);
  const base = (def.gentleCopy || 'Your {label}: {value}.').replace('{label}', (def.clientLabel || def.name).toLowerCase()).replace('{value}', textOf(m));
  if (t && t.sinceLast && t.sinceLast.delta) return base.replace(/, and it has been moving since you started\.?$/, '') + ' ' + (t.sinceLast.verdict === 'better' ? 'It moved the right way since last time.' : t.sinceLast.verdict === 'worse' ? 'It slipped a little since last time; that happens, and the plan still holds.' : 'It moved since last time.');
  return base.replace(/, and it has been moving since you started\.?$/, '.');
}

/* the sparkline of a metric across the snapshots and today */
export function sparkOf(app, id) {
  const vals = snapshotsOf(app.record).map(s => s.values[id]).filter(v => typeof v === 'number'); const now = numOf(app.result.metrics[id]);
  if (now !== null) vals.push(now);
  return vals.length >= 2 ? sparkline(vals, { width: 96, height: 22, markX: vals.length - 1 }) : null;
}

/* one trend line: arrow, change, since when; the client's words never alarm */
export function trendLine(app, id) {
  const t = trend(app.record, app.result, app.data, id); if (!t || !t.sinceLast) return h('span', { class: 'small muted trend' }, ''); /* MR-072: the first-reading note is said once per screen, in the heading, not on every tile */
  const leg = t.sinceLast; const cls = 'trend ' + (leg.verdict === 'better' ? 'better' : leg.verdict === 'worse' ? 'softer' : 'same');
  return h('span', { class: 'small ' + cls }, h('span', { class: 'arrow', 'aria-hidden': 'true' }, ARROWS[leg.arrow]), ' ', leg.delta ? leg.text : (isClient(app) ? 'steady since last time' : 'unchanged since last time'));
}

/* the band a value sits in and whose rule says so (Coach), or the gentle word (Client) */
export function bandLine(app, id) {
  const def = defOf(app, id); const m = app.result.metrics[id]; if (!def || !m || m.status !== 'ok') return null;
  const b = bandOf(def, numOf(m), app.record.scoreboard && app.record.scoreboard.bandSource ? app.record.scoreboard.bandSource[id] : null); if (!b) return null;
  if (isClient(app)) return h('span', { class: 'chip zone-' + b.zone }, zoneWord(b.zone, true));
  return h('span', { class: 'band-line small' }, h('span', { class: 'chip zone-' + b.zone }, zoneWord(b.zone, false)), ' ', h('span', { class: 'muted' }, 'by ' + b.source + (b.verify ? ' (verify)' : '')), b.alternatives.length ? h('span', { class: 'muted' }, '; ' + b.alternatives.map(a => a.label + ': ' + zoneWord(a.zone, false).toLowerCase()).join(', ')) : null);
}

/* the next rung on this metric's ladder, with the dollars and the earliest month when the pace says so */
export function milestoneLine(app, id) {
  const ms = milestone(app.record, app.result, app.data, id); if (!ms) return null;
  if (ms.done) return h('span', { class: 'small muted ms-line' }, isClient(app) ? 'Top of the ladder. Nothing left to climb here.' : 'Every rung reached.');
  const parts = [(isClient(app) ? 'Next: ' : 'Next rung: ') + ms.nextText, ms.dollarsText ? ms.dollarsText + ' to go' : ms.distanceText];
  if (ms.earliest) parts.push((isClient(app) ? 'could land ' : 'at this pace ') + F.date(ms.earliest));
  return h('span', { class: 'small ms-line' }, parts.join(', ') + '.');
}

/* what to do about this one metric: its best lever, with the FI months when the sensitivity run has landed */
export function actionLine(app, id) {
  const def = defOf(app, id); if (!def) return null;
  const sens = cachedSensitivity(app); const a = nextActionFor(def, sens, app.result); if (!a) return null;
  return h('span', { class: 'small action-line' }, a.sentence);
}

/* a missing metric: what it needs, and the one tap that goes there */
export function needsBlock(app, id) {
  const m = app.result.metrics[id]; const needs = needsOf(m);
  const probe = needs.map(n => targetFor(n, app.record, app.data)).find(Boolean) || null;
  return h('div', { class: 'tile-needs' }, h('span', { class: 'small muted' }, (isClient(app) ? 'Opens with ' : 'Needs ') + needs.join(', ') + '.'), probe ? h('button', { class: 'btn small', onClick: () => goToProbe(app, probe, location.hash) }, isClient(app) ? 'Add it' : 'Go there') : null);
}

/* a headline tile: label, the one big value, the trend, the band and the next rung; a tap opens the drawer */
export function tile(app, id, onOpen) {
  const def = defOf(app, id); const m = app.result.metrics[id]; if (!def) return null;
  const ok = m && m.status === 'ok';
  const card = h('article', { class: 'score-tile' + (ok ? '' : ' locked'), dataset: { metric: id }, tabindex: '0', role: 'button', 'aria-label': metricLabel(app, def) + (ok ? ': ' + textOf(m) : ': not yet'), onClick: () => onOpen(id), onKeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } } },
    h('div', { class: 'tile-head' }, h('span', { class: 'tile-label' }, metricLabel(app, def)), ok ? sparkOf(app, id) : null),
    ok ? h('div', { class: 'tile-value' + (m.rough ? ' rough-value' : '') }, textOf(m)) : h('div', { class: 'tile-value muted small-value' }, isClient(app) ? 'Not yet' : 'Needs inputs'),
    ok ? trendLine(app, id) : needsBlock(app, id),
    ok ? h('div', { class: 'tile-foot' }, bandLine(app, id), milestoneLine(app, id)) : null);
  return card;
}

/* the one next action for the household: the top lever when the run has landed, else a request for it */
export function nextActionCard(app, opts) {
  const o = opts || {}; const sens = cachedSensitivity(app); const client = isClient(app);
  const card = h('section', { class: 'panel next-action' });
  const paint = s => {
    const a = overallNextAction(s, app.record, app.result);
    if (!a) { card.appendChild(h('h2', null, client ? 'Your next step' : 'Next action')); const fi = app.result.metrics.fiDate && app.result.metrics.fiDate.status === 'ok'; card.appendChild(h('p', { class: fi ? 'big' : 'muted small' }, fi ? (client ? 'Keep doing what you are doing; the one thing shows in a moment.' : 'The one action arrives with the levers run.') : (client ? 'Your first step shows once your coach has your income and spending in.' : 'Needs a FI date: income, spending and balances that reach the FI number.'))); if (fi) card.appendChild(h('p', { class: 'small muted updating' }, 'updating')); return; }
    card.appendChild(h('h2', null, client ? 'Your next step' : 'Next action'));
    card.appendChild(h('p', { class: 'big-number' }, a.months !== null ? F.months(Math.abs(a.months)) : 'Soon', h('span', { class: 'big-unit' }, a.months !== null ? (client ? ' sooner to work being a choice' : ' on the FI date') + (a.impactLabel ? ' ' + a.impactLabel.replace(/^per /, 'for every ') : '') : '')));
    card.appendChild(h('p', { class: 'read-aloud' }, a.sentence));
    if (!o.noLink) card.appendChild(h('p', { class: 'small' }, h('a', { href: '#/levers' }, client ? 'See what matters most' : 'Open the levers')));
  };
  if (sens) paint(sens); else { paint(null); getSensitivity(app, s => { if (!card.isConnected) return; while (card.firstChild) card.removeChild(card.firstChild); paint(s); }); }
  return card;
}
