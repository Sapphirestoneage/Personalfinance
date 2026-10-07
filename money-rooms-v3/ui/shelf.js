/* The headline metrics shelf (Level 9, MR-044): the standard numbers in one
   row of tiles, each opening its metric drawer (inputs, levers, lens). A tile
   whose inputs are missing says what it needs. Views only draw. */
import { h, clear } from './dom.js';
import * as F from '../engine/format.js';
import { metricLabel } from './glossary.js';
import { openMetric } from './metricdrawer.js';
import { RUNGS, RUNG_LABELS, RUNG_CLIENT } from '../engine/fiLadder.js';

export const SHELF = ['savingsRateTakeHome', 'savingsRateGross', 'federalRates', 'impliedTaxRate', 'fica', 'surplus', 'leak', 'netWorth', 'assets', 'totalDebt', 'dti', 'runway', 'emergencyGap', 'fiNumber', 'pctToFi', 'fiDate'];
export const SHELF_COMPACT = ['savingsRateTakeHome', 'savingsRateGross', 'federalRates', 'surplus', 'netWorth', 'totalDebt', 'runway', 'fiNumber', 'pctToFi', 'fiDate'];

function text(app, id, m) {
  const v = m.value;
  switch (id) {
    case 'federalRates': return [F.percent(v.value, { rough: v.rough }), 'marginal ' + F.percent(v.marginal)];
    case 'fica': return [F.dollarsWhole(v.cents, { rough: v.rough }) + ' a year', ''];
    case 'surplus': return [v.cents < 0 ? 'Short ' + F.dollarsWhole(-v.cents, { rough: v.rough }) : F.dollarsWhole(v.cents, { rough: v.rough }) + ' a month', ''];
    case 'leak': return [F.percent(v.value, { rough: v.rough }), m.leakMonthly ? F.dollarsWhole(m.leakMonthly.cents) + ' a month' : ''];
    case 'assets': return [F.dollarsWhole(v.value.invested), 'invested of ' + F.dollarsCompact(v.value.total)];
    case 'runway': return [F.months(v.value.full, { rough: v.rough }), v.value.fat !== null ? F.months(v.value.fat) + ' at the floor' : ''];
    case 'emergencyGap': return [v.cents === 0 ? 'Covered' : F.dollarsWhole(v.cents, { rough: v.rough }), m.monthlyToClose && m.monthlyToClose.cents ? F.dollarsWhole(m.monthlyToClose.cents) + ' a month to close' : 'Rule of 5 met'];
    case 'fiDate': return [F.date(v.value), m.ages ? 'age ' + m.ages.likely + ', best ' + (m.ages.best || 'never') + ', worst ' + (m.ages.worst || 'never') : ''];
    case 'pctToFi': return [F.percent(v.value, { rough: v.rough }), m.basis === 'netWorth' ? 'of net worth' : 'invested assets'];
    default:
      if (typeof v.cents === 'number') return [F.dollarsWhole(v.cents, { rough: v.rough }), v.range ? F.dollarsWhole(v.range.low) + ' to ' + F.dollarsWhole(v.range.high) : ''];
      return [F.value(v), v.range ? F.rangeOfValue(v) : ''];
  }
}
const SHELF_LABELS = { assets: ['Invested assets', 'What you own and invest'], federalRates: ['Effective federal rate', 'Federal tax rate'], emergencyGap: ['Rule of 5 gap', 'Cash cushion gap'], fiDate: ['FI date', 'When the portfolio could carry you'] };

export function tile(app, id) {
  const def = app.data.metrics.metrics.find(x => x.id === id); const m = app.result.metrics[id];
  const label = SHELF_LABELS[id] ? SHELF_LABELS[id][app.view === 'coach' ? 0 : 1] : metricLabel(app, def);
  const open = () => openMetric(app, id);
  if (!m || m.status !== 'ok') {
    const needs = (m && m.needs && m.needs.length ? m.needs : ['inputs']).slice(0, 2).join(', ');
    const el = h('div', { class: 'kpi shelf-tile needs-tile', role: 'button', tabindex: '0', 'aria-label': label + ', needs ' + needs, dataset: { metric: id }, onClick: open }, h('div', { class: 'label' }, label), h('div', { class: 'value needs' }, 'Needs ' + needs));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    return el;
  }
  const [main, sub] = text(app, id, m);
  const el = h('div', { class: 'kpi shelf-tile', role: 'button', tabindex: '0', 'aria-label': label + ' ' + main, dataset: { metric: id }, onClick: open },
    h('div', { class: 'label', title: def.definition }, label), h('div', { class: 'value' + (m.value.rough ? ' rough' : ''), title: main }, main), sub ? h('div', { class: 'range', title: sub }, sub) : null);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return el;
}

/* The ladder as a compact staircase: five rungs plus the coast marker. */
export function miniLadder(app) {
  const M = app.result.metrics; const L = app.result.ladder; const coach = app.view === 'coach';
  const wrap = h('div', { class: 'mini-ladder', role: 'group', 'aria-label': coach ? 'FI ladder' : 'Kinds of enough' });
  if (!L || !M.regularFi || M.regularFi.status !== 'ok') { wrap.appendChild(h('div', { class: 'small muted' }, 'The ladder needs monthly spending.')); return wrap; }
  const max = Math.max(...L.rungs.filter(r => r.number !== null).map(r => r.number), 1);
  RUNGS.forEach((id, i) => {
    const m = M[id]; const r = L.rungs.find(x => x.id === id);
    const ok = m && m.status === 'ok';
    const step = h('button', { class: 'mini-step' + (ok && r.pct >= 1 ? ' reached' : ''), style: { height: (28 + i * 10) + 'px' }, 'aria-label': (coach ? RUNG_LABELS[id] : RUNG_CLIENT[id]) + (ok ? ' ' + F.dollarsCompact(m.value.cents) + ', ' + F.percent(r.pct, { places: 0 }) + ' there' : ', needs inputs'), title: ok ? (coach ? RUNG_LABELS[id] : RUNG_CLIENT[id]) + ' ' + F.dollarsWhole(m.value.cents) : '', onClick: () => openMetric(app, id) },
      ok ? h('span', { class: 'fill', style: { height: Math.round(Math.min(1, r.pct) * 100) + '%' } }) : null,
      h('span', { class: 'mini-label' }, (coach ? RUNG_LABELS[id] : RUNG_CLIENT[id]).replace('Barista Lean FI', 'Barista Lean').replace('Barista FI', 'Barista')), h('span', { class: 'mini-num' }, ok ? F.dollarsCompact(m.value.cents) : ''));
    wrap.appendChild(step);
  });
  if (L.coast && L.coast.number !== null) wrap.appendChild(h('button', { class: 'mini-coast', 'aria-label': 'Coast FI ' + F.dollarsCompact(L.coast.number) + ', ' + F.percent(L.coast.pct || 0, { places: 0 }) + ' there', onClick: () => openMetric(app, 'coastFi') }, h('span', { class: 'mini-label' }, 'Coast'), h('span', { class: 'mini-num' }, F.dollarsCompact(L.coast.number))));
  return wrap;
}

/* opts: { compact, title, ladder } */
export function renderShelf(host, app, opts) {
  clear(host);
  const o = opts || {}; const coach = app.view === 'coach';
  if (!app.record || !app.result || !app.result.metrics) return;
  const ids = o.compact ? SHELF_COMPACT : SHELF;
  host.classList.add('shelf');
  host.appendChild(h('div', { class: 'shelf-head' }, h('h2', null, o.title || (coach ? 'Headline numbers' : 'Your numbers')), coach ? h('a', { class: 'small', href: '#/levers' }, 'What moves the FI date') : null));
  const grid = h('div', { class: 'kpis shelf-grid' + (o.compact ? ' compact' : '') });
  ids.forEach(id => grid.appendChild(tile(app, id)));
  host.appendChild(grid);
  if (o.ladder !== false) host.appendChild(miniLadder(app));
}
