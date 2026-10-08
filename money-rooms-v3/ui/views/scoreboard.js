/* The Scoreboard (Level 12, MR-063): six numbers, each with its trend since
   last time, the band it sits in and the next rung; one next action; every
   other metric one tap away by group; what was crossed lately and the
   personal bests. Coach view names the rule behind each band; Client view
   speaks gently and never shows a warning colour. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { headlineIds, personalBests, snapshotsOf, lastSnapshot, textOf, numOf, trend } from '../../engine/momentum.js';
import { openMetric } from '../metricdrawer.js';
import { metricLabel } from '../glossary.js';
import { clientName } from '../app.js';
import { tile, nextActionCard, trendLine, bandLine, visible, defOf, isClient, gentleSentence, needsOf } from '../scorebits.js';

export function mount(host, app) {
  const client = isClient(app); const groups = app.data.metrics.scoreGroups || {};
  const groupIds = Object.keys(groups);
  const pickedGroup = groupIds.includes(app.route.params.id) ? app.route.params.id : null;
  const deepMetric = app.route.params.id === 'm' ? app.route.params.sub : null;
  const name = (clientName(app.record) || 'Household').split(' ')[0];
  host.appendChild(h('header', null, h('h1', null, client ? 'Your scoreboard' : 'Scoreboard'), h('span', { class: 'sub', id: 'score-sub' }), h('div', { class: 'actions' },
    h('a', { class: 'btn primary', href: '#/money-date' }, client ? 'Monthly check' : 'Money date'),
    h('a', { class: 'btn', href: '#/map' }, client ? 'How it connects' : 'Map'),
    client ? null : h('button', { class: 'btn', onClick: () => chooseSix(app) }, 'Choose the six'))));
  const hero = h('div', { class: 'score-hero' }); const tiles = h('div', { class: 'score-tiles' }); const rest = h('section', { class: 'panel score-rest' }); const lately = h('div', { class: 'grid grid-2 score-lately' });
  host.appendChild(hero); host.appendChild(tiles); host.appendChild(rest); host.appendChild(lately);
  const open = id => { location.hash = '#/scoreboard/m/' + id; };
  function draw() {
    clear(hero); clear(tiles); clear(rest); clear(lately);
    const ids = headlineIds(app.record, app.result, app.data);
    /* the read-aloud line under the title: the first headline number with a trend, else the picture */
    const sub = host.querySelector('#score-sub');
    const lead = ids.map(id => ({ id, t: trend(app.record, app.result, app.data, id) })).find(x => x.t && x.t.sinceLast && x.t.sinceLast.delta);
    sub.textContent = lead ? (client ? gentleSentence(app, lead.id) : metricLabel(app, defOf(app, lead.id)) + ': ' + lead.t.nowText + ', ' + lead.t.sinceLast.text + '.') : (snapshotsOf(app.record).length ? (client ? 'Steady since last time, ' + name + '.' : 'No headline number moved since the last snapshot.') : (client ? 'Your first reading. The trends start at the next check.' : 'No snapshot yet: a session close or a money date starts the trends.'));
    hero.appendChild(nextActionCard(app));
    ids.forEach(id => { const el = tile(app, id, open); if (el) tiles.appendChild(el); });
    /* the rest, by group */
    rest.appendChild(h('h2', null, client ? 'Everything else' : 'All numbers by group'));
    const bar = h('nav', { class: 'group-chips', 'aria-label': 'Groups' }, groupIds.map(g => { const n = app.data.metrics.metrics.filter(m => m.scoreGroup === g && visible(app, m) && !ids.includes(m.id)).length; return n ? h('a', { href: '#/scoreboard/' + g, 'aria-current': g === pickedGroup ? 'page' : null, class: 'chip gchip' }, groups[g], h('span', { class: 'muted' }, ' ' + n)) : null; }));
    rest.appendChild(bar);
    const g = pickedGroup || groupIds.find(x => app.data.metrics.metrics.some(m => m.scoreGroup === x && visible(app, m) && !ids.includes(m.id)));
    const list = app.data.metrics.metrics.filter(m => m.scoreGroup === g && visible(app, m) && !ids.includes(m.id));
    rest.appendChild(h('ul', { class: 'score-list' }, list.map(def => { const m = app.result.metrics[def.id]; const ok = m && m.status === 'ok'; return h('li', { class: ok ? '' : 'locked' }, h('button', { class: 'linklike score-row', onClick: () => open(def.id) }, h('span', { class: 'row-label' }, metricLabel(app, def)), h('span', { class: 'row-value' + (ok && m.rough ? ' rough-value' : '') }, ok ? textOf(m) : (client ? 'not yet' : 'needs ' + needsOf(m)[0]))), ok ? h('span', { class: 'row-meta' }, trendLine(app, def.id), ' ', bandLine(app, def.id)) : null); })));
    /* lately: crossings and bests */
    const cel = (app.record.celebrations || []).filter(c => !c.seeded).slice(-6).reverse();
    lately.appendChild(h('section', { class: 'panel' }, h('h2', null, client ? 'Worth marking' : 'Milestones crossed'), cel.length ? h('ul', { class: 'cheer-list' }, cel.map(c => h('li', null, h('span', { class: 'cheer-dot', 'aria-hidden': 'true' }), c.text, h('span', { class: 'small muted' }, ' ' + F.dateLocal(c.ts))))) : h('p', { class: 'muted small' }, client ? 'The first rung you cross shows up here.' : 'Nothing crossed since the first snapshot; the ladders live in each number\'s drawer.')));
    const bests = personalBests(app.record, app.result, app.data);
    lately.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Personal bests'), bests.length ? h('ul', { class: 'bests' }, bests.map(b => h('li', null, h('span', { class: 'row-label' }, b.label), h('span', { class: 'row-value' }, b.value), b.isNew ? h('span', { class: 'chip zone-healthy' }, 'New') : null))) : h('p', { class: 'muted small' }, 'Bests appear after the first snapshot.')));
    const last = lastSnapshot(app.record);
    lately.appendChild(h('p', { class: 'small muted score-foot' }, (last ? 'Compared with ' + (last.kind === 'session' ? 'the last session' : last.kind === 'money-date' ? 'the last money date' : 'the last snapshot') + ', ' + F.dateLocal(last.ts) + '. ' : '') + (client ? 'Tap any number for what it means and what moves it.' : 'Every number opens its math, where it sits and whose rule says so, its ladder and its levers.')));
  }
  draw();
  if (deepMetric && defOf(app, deepMetric)) setTimeout(() => openMetric(app, deepMetric), 0);
  return { update() { draw(); } };
}

/* Coach: pick the six headline numbers; the engine keeps swapping the debt-free tile for net worth when there is no debt */
function chooseSix(app) {
  const current = headlineIds(app.record, app.result, app.data); const picked = new Set(current);
  const list = app.data.metrics.metrics.filter(m => m.clientVisible !== false && m.scoreGroup);
  const body = h('div', null, h('h2', null, 'Choose the six'), h('p', { class: 'small muted' }, 'Six tiles on the scoreboard, in this order. The default six are savings rate, FI date, FI progress, runway, debt-free date and picture completeness. Net worth can discourage someone starting below zero; keep it off the six unless the client asks.'));
  const count = h('p', { class: 'small' }); const paint = () => { count.textContent = picked.size + ' of 6 chosen.'; };
  body.appendChild(count); paint();
  body.appendChild(h('div', { class: 'choose-list' }, list.map(def => h('label', { class: 'choose-row' }, h('input', { type: 'checkbox', checked: picked.has(def.id), onChange: e => { if (e.target.checked) { if (picked.size >= 6) { e.target.checked = false; app.toast('Six is the limit; untick one first.'); return; } picked.add(def.id); } else picked.delete(def.id); paint(); } }), ' ', def.name, h('span', { class: 'small muted' }, ' ' + (app.data.metrics.scoreGroups[def.scoreGroup] || ''))))));
  body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { if (picked.size !== 6) { app.toast('Pick exactly six.'); return; } app.mutate(rec => { rec.scoreboard = Object.assign({}, rec.scoreboard || {}, { headline: list.map(d => d.id).filter(id => picked.has(id)) }); }, 'scoreboard'); app.toast('The six are set.'); location.hash = '#/scoreboard'; } }, 'Save'), h('button', { class: 'btn', onClick: () => { app.mutate(rec => { if (rec.scoreboard) delete rec.scoreboard.headline; }, 'scoreboard'); location.hash = '#/scoreboard'; } }, 'Back to the default six')));
  app.openDrawer(body, { label: 'Choose the six', title: 'Choose the six' });
}
