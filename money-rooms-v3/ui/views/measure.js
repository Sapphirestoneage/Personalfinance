/* Measure: the 74 metrics by stage with a show-the-math drawer on every
   number, the lenses that fire (coach picks which the client sees), and the
   eight charts, each with a switch onto the one-pager. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { CHARTS } from '../../engine/chartdata.js';
import * as Charts from '../charts.js';
import { translator, metricLabel } from '../glossary.js';
import { PLANET_LABELS } from '../../engine/sun.js';
import { registerMath, openMetric } from '../metricdrawer.js';

const SHARE_LABELS = { debt: 'Debt', retirement: 'Retirement', accommodation: 'Accommodation', food: 'Food', transportation: 'Transportation', therapy: 'Therapy', pretax: 'Pre-tax', roth: 'Roth', taxable: 'Taxable', hsa: 'HSA', cash: 'Cash', other: 'Other', stocks: 'Stocks', bonds: 'Bonds' };
const KEY_METRICS = ['takeHome', 'spending', 'surplus', 'savingsRateTakeHome', 'netWorth', 'totalDebt', 'runway', 'pctToFi'];
const GROUPS = [['cash flow', 'Cash flow'], ['debt', 'Debt and credit'], ['cards', 'Cards'], ['balance sheet', 'Balance sheet'], ['safety', 'Safety net'], ['retirement', 'Retirement'], ['taxes', 'Taxes'], ['FI', 'Financial independence'], ['benchmarks', 'Benchmarks (verify)']];
const STAGE_PLANETS = { 1: ['income', 'spending'], 2: ['debt'], 3: ['safety', 'invest'], 4: ['taxes'], 5: ['life'] };

export function mount(host, app) {
  const t = translator(app);
  host.appendChild(h('header', null, h('h1', null, t('Measure')), h('span', { class: 'sub' }, app.view === 'coach' ? 'Every number opens its math.' : '')));
  const stage = h('div', { class: 'stage-row' });
  const kpis = h('div');
  const lenses = h('section', { class: 'panel' });
  const charts = h('section');
  host.appendChild(stage); host.appendChild(kpis); host.appendChild(lenses); host.appendChild(charts);
  function draw() {
    clear(stage); clear(kpis); clear(lenses); clear(charts);
    const R = app.result; const M = R.metrics;
    if (!M) { kpis.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Nothing to measure yet'), h('p', null, 'Enter income first, then spending. Numbers appear as their inputs arrive.'))); return; }
    if (app.view === 'coach') Object.keys(STAGE_PLANETS).forEach(s => {
      const planets = STAGE_PLANETS[s]; const filled = planets.every(p => R.rowCounts[p] > 0);
      stage.appendChild(h('span', { class: 'chip stage' + (filled ? '' : ' waiting') }, 'Stage ' + s + ': ' + planets.map(p => PLANET_LABELS[p].toLowerCase()).join(' and ') + (filled ? ', has rows' : ', needs rows')));
    });
    if (app.view === 'coach') { const filledStages = Object.keys(STAGE_PLANETS).filter(s => STAGE_PLANETS[s].every(p => R.rowCounts[p] > 0)); stage.appendChild(h('span', { class: 'chip stage stage-summary' }, filledStages.length === 5 ? 'Stages 1 to 5 have rows' : filledStages.length + ' of 5 stages have rows')); }
    if (app.view === 'client') {
      /* Client view starts from the key numbers; the rest sits behind one switch */
      const grid = h('div', { class: 'kpis' });
      KEY_METRICS.forEach(id => { const def = app.data.metrics.metrics.find(m => m.id === id); grid.appendChild(kpi(app, M[id], def, t)); });
      kpis.appendChild(h('div', { class: 'metric-group' }, h('h3', null, 'Key numbers'), grid));
      const rest = h('div', { style: { display: 'none' } });
      const toggle = h('button', { class: 'btn', 'aria-expanded': 'false', onClick: () => { const open = rest.style.display === 'none'; rest.style.display = open ? '' : 'none'; toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? 'Hide the other numbers' : 'All numbers'; } }, 'All numbers');
      kpis.appendChild(h('p', { style: { margin: '8px 0 16px' } }, toggle));
      GROUPS.forEach(([key, label]) => groupInto(rest, key, label));
      kpis.appendChild(rest);
    } else GROUPS.forEach(([key, label]) => groupInto(kpis, key, label));
    function groupInto(host2, key, label) {
      const defs = app.data.metrics.metrics.filter(m => m.group === key && (app.view === 'coach' || !m.coachOnly || (app.result.asm && app.result.asm.showBenchmarksToClient)));
      if (!defs.length) return;
      const allNeed = defs.every(def => !M[def.id] || M[def.id].status !== 'ok');
      if (allNeed) {
        const needs = Array.from(new Set(defs.flatMap(def => (M[def.id] && M[def.id].needs) || []))).slice(0, 2);
        host2.appendChild(h('div', { class: 'metric-group' }, h('h3', null, t(label)), h('p', { class: 'group-collapsed' }, 'Needs ' + (needs.join(' and ') || 'inputs') + ' (' + defs.length + (defs.length === 1 ? ' number' : ' numbers') + ' waiting).')));
        return;
      }
      const grid = h('div', { class: 'kpis' });
      defs.forEach(def => grid.appendChild(kpi(app, M[def.id], def, t)));
      host2.appendChild(h('div', { class: 'metric-group' }, h('h3', null, t(label)), grid));
    }
    drawLenses(lenses, app, t);
    drawCharts(charts, app, t);
  }
  draw();
  return { update() { draw(); } };
}

export function kpi(app, m, def, t) {
  const coach = app.view === 'coach';
  const label = metricLabel(app, def);
  if (!m || m.status !== 'ok') {
    const needsList = (m && m.needs && m.needs.length) ? m.needs : ['inputs'];
    const tile = h('div', { class: 'kpi', role: 'button', tabindex: '0' }, h('div', { class: 'label', title: def.definition }, label), h('div', { class: 'value needs' }, 'Needs ' + needsList.slice(0, 2).join(', ') + (needsList.length > 2 ? ' and more' : '')));
    tile.addEventListener('click', () => openMath(app, m, def));
    return tile;
  }
  const v = m.value;
  let text = '', range = '';
  let node = null;
  if (v.kind === 'shares') { const keys = Object.keys(v.value).filter(k => typeof v.value[k] === 'number' && k !== 'usShare'); node = h('div', { class: 'shares' }, keys.map(k => [h('span', null, SHARE_LABELS[k] || k), h('span', { class: 'num' }, F.percent(v.value[k], { rough: v.rough }))])); text = keys.map(k => (SHARE_LABELS[k] || k) + ' ' + F.percent(v.value[k])).join(', '); }
  else if (v.kind === 'list') { const rows = listRows(def.id, v.value, m, app); node = h('div', { class: 'shares' }, rows.map(r => [h('span', { title: r[0] }, r[0]), h('span', { class: 'num' }, r[1])])); text = rows.map(r => r[0] + ' ' + r[1]).join(', '); }
  else if (typeof v.cents === 'number') { text = F.dollarsWhole(v.cents, { rough: v.rough }); range = v.range ? F.dollarsWhole(v.range.low) + ' to ' + F.dollarsWhole(v.range.high) : ''; }
  else { text = F.value(v); if (def.id === 'federalRates') { text = F.percent(v.value, { rough: v.rough }); range = 'marginal ' + F.percent(v.marginal); } else range = v.range ? F.rangeOfValue(v) : (def.id === 'fiDate' && m.ages ? 'best ' + (m.ages.best || 'never') + ', worst ' + (m.ages.worst || 'never') : ''); }
  if (def.id === 'surplus' && v.cents < 0) { text = 'Short ' + F.dollarsWhole(-v.cents, { rough: v.rough }); }
  if (text === '') text = 'Needs inputs';
  if (!range && def.range && v.kind === 'ratio') range = 'band ' + F.percent(def.range.low) + ' to ' + F.percent(def.range.high);
  if (def.id === 'matchCapture' && m.dollarsLeftAnnual) range = F.dollarsWhole(m.dollarsLeftAnnual) + ' a year left';
  if (def.id === 'emergencyGap' && m.monthlyToClose && m.monthlyToClose.cents) range = F.dollarsWhole(m.monthlyToClose.cents) + ' a month to close';
  if (def.id === 'coastFi' && m.coastPct !== null) range = F.percent(m.coastPct) + ' there';
  const isList = v.kind === 'shares' || v.kind === 'list';
  const tile = h('div', { class: 'kpi', role: 'button', tabindex: '0', 'aria-label': label + ' ' + text }, h('div', { class: 'label', title: def.definition }, label), h('div', { class: 'value' + (v.rough ? ' rough' : '') + (isList ? ' list' : ''), title: text }, node || text), range ? h('div', { class: 'range', title: range }, range) : null);
  tile.addEventListener('click', () => openMath(app, m, def));
  tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMath(app, m, def); } });
  return tile;
}

function short(name) { return F.shorten(name, 24); }
/* Every list tile is rows of [label, figure]; at most four rows plus "and N more". */
function listRows(id, v, m, app) {
  const limitLabel = lid => { const l = app && app.data.limits2026 ? app.data.limits2026.limits.find(x => x.id === lid) : null; return l ? l.label.split(' (')[0].split(',')[0] : lid; };
  const cap = (list, fn) => list.slice(0, 3).map(fn).concat(list.length > 3 ? [['and ' + (list.length - 3) + ' more', '']] : []);
  const client = app && app.view === 'client';
  switch (id) {
    case 'promoCliff': return cap(v, c => [short(c.name), F.months(c.monthsLeft)]);
    case 'assets': return [['Total', F.dollarsWhole(v.total)], ['Invested', F.dollarsWhole(v.invested)], [client ? 'Reachable now' : 'Liquid', F.dollarsWhole(v.liquid)]];
    case 'runway': return [[client ? 'Full spending' : 'Full', F.months(v.full)], v.fullAlone !== null && v.fullAlone !== undefined ? ['If it all falls on you', F.months(v.fullAlone)] : null, v.draftt !== null ? ['Needs only', F.months(v.draftt)] : null, v.fat !== null ? [client ? 'Lean month' : 'FAT floor', F.months(v.fat)] : null].filter(Boolean);
    case 'roomLeft': return cap(v, r => [limitLabel(r.limitId), F.dollarsWhole(r.left)]);
    case 'fiLevels': return [['Lean', v.lean !== null ? F.dollarsCompact(v.lean) : 'needs'], [client ? 'Enough' : 'FI', F.dollarsCompact(v.fi)], ['Fat', F.dollarsCompact(v.fat)], ['Barista', F.dollarsCompact(v.barista)]];
    case 'cardNetValue': return cap(v, c => [short(c.name), F.dollarsWhole(c.netAnnual)]);
    default: return [];
  }
}

/* Every metric drawer now carries its levers, inputs and lens (MR-044); the math body is built here and handed to the shared drawer. */
export function openMath(app, m, def) { openMetric(app, def.id); }
registerMath((app, m, def) => mathBody(app, m, def));
export function mathBody(app, m, def) {
  const body = h('div', null,
    h('h2', null, metricLabel(app, def)),
    h('p', { class: 'muted small', style: { margin: '4px 0 12px' } }, def.definition),
    h('h3', null, 'Formula'),
    h('div', { class: 'formula' }, (m && m.math && m.math.formula) || def.formula));
  if (m && m.status === 'ok' && m.math && m.math.inputs && m.math.inputs.length) {
    body.appendChild(h('h3', { style: { marginTop: '12px' } }, 'Inputs'));
    body.appendChild(h('table', { class: 'data math-table' }, h('tbody', null, m.math.inputs.filter(i => i.value !== null && i.value !== undefined).map(i => h('tr', null, h('td', null, i.label), h('td', { class: 'num' }, typeof i.value === 'number' ? String(i.value) : (typeof i.value.cents === 'number' ? F.dollarsWhole(i.value.cents, { rough: i.value.rough }) : (F.value(i.value) || (i.value.needs ? 'needs ' + i.value.needs.join(', ') : '')))), h('td', { class: 'small muted' }, i.value && typeof i.value.confidence === 'number' ? Math.round(i.value.confidence * 100) + '% conf.' : ''))))));
    if (m.math.result) { body.appendChild(h('h3', { style: { marginTop: '12px' } }, 'Result')); body.appendChild(h('p', null, h('strong', null, F.value(m.math.result) || ''), m.value && m.value.range ? h('span', { class: 'muted' }, ' (' + F.rangeOfValue(m.value) + ')') : null)); }
  } else if (m && m.status === 'needs') {
    body.appendChild(h('h3', { style: { marginTop: '12px' } }, 'Needs')); body.appendChild(h('p', null, m.needs.join(', ')));
  }
  if (def.range) body.appendChild(h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Band ' + F.percent(def.range.low) + ' to ' + F.percent(def.range.high) + '. Source: ' + def.range.source + '.'));
  body.appendChild(h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Owner: ' + (PLANET_LABELS[def.owner] || 'the engine') + '. Units: ' + Object.values(def.units).join(', ') + '.'));
  return body;
}

export function drawLenses(panel, app, t) {
  clear(panel);
  const coach = app.view === 'coach';
  const picks = app.record.sun.clientPicks || [];
  const all = app.result.lenses || [];
  const list = coach ? all : all.filter(l => picks.includes(l.id));
  panel.appendChild(h('h2', null, t('Lenses'), coach ? h('span', { class: 'tag' }, all.length + ' firing; tick the ones the client should see') : null));
  if (!list.length) { panel.appendChild(h('p', { class: 'muted' }, coach ? 'No lens fires yet. Lenses need income, spending and the planets they read.' : 'Nothing to show here yet.')); return; }
  list.forEach(l => {
    const el = h('div', { class: 'lens', dataset: { lens: l.id } },
      h('div', { class: 'text' }, l.text),
      h('div', { class: 'impact' }, l.impactAnnual !== null ? F.dollarsWhole(l.impactAnnual, { rough: l.rough }) + ' a year' : (l.figure || '')),
      h('div', { class: 'foot' },
        h('span', null, l.name),
        h('button', { class: 'btn small quiet', onClick: () => app.openDrawer(h('div', null, h('h2', null, l.name), h('p', { style: { margin: '8px 0 12px' } }, l.text), h('table', { class: 'data math-table' }, h('tbody', null, l.inputs.map(i => h('tr', null, h('td', null, i[0]), h('td', { class: 'num' }, i[1]))))), l.reading ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Reading: ' + l.reading.title) : null)) }, 'Show the math'),
        l.reading ? h('span', { class: 'muted' }, 'Read: ' + l.reading.title) : null,
        coach ? h('label', null, h('input', { type: 'checkbox', checked: picks.includes(l.id), onChange: e => { app.mutate(rec => { const set = new Set(rec.sun.clientPicks || []); if (e.target.checked) set.add(l.id); else set.delete(l.id); rec.sun.clientPicks = Array.from(set); }, 'picks'); } }), 'Show to client') : null));
    panel.appendChild(el);
  });
}

export function drawCharts(host, app, t) {
  clear(host);
  const coach = app.view === 'coach';
  const onPage = app.record.sun.onepager.charts || [];
  const grid = h('div', { class: 'grid grid-2' });
  CHARTS.forEach(c => {
    const data = c.build(app.result);
    const panel = h('section', { class: 'panel chart-panel', dataset: { chart: c.id } }, h('header', null, h('h3', null, coach ? c.name : c.client), coach ? h('label', { class: 'small muted', style: { display: 'inline-flex', gap: '4px' } }, h('input', { type: 'checkbox', checked: onPage.includes(c.id), onChange: e => { app.mutate(rec => { const set = new Set(rec.sun.onepager.charts || []); if (e.target.checked) set.add(c.id); else set.delete(c.id); rec.sun.onepager.charts = Array.from(set); }, 'picks'); } }), 'On the one-pager') : null));
    const body = h('div', { dataset: { chartBody: c.id } });
    panel.appendChild(body);
    grid.appendChild(panel);
  });
  host.appendChild(h('h2', { style: { margin: '16px 0 8px' } }, 'Charts'));
  host.appendChild(grid);
  const paint = () => CHARTS.forEach(c => { const body = grid.querySelector('[data-chart-body="' + c.id + '"]'); if (body) Charts.render(c.id, body, c.build(app.result), { client: !coach }); });
  paint();
  if (globalThis.ResizeObserver) { let t = null; let last = grid.clientWidth; const ro = new ResizeObserver(() => { if (Math.abs(grid.clientWidth - last) < 24) return; last = grid.clientWidth; clearTimeout(t); t = setTimeout(paint, 150); }); ro.observe(grid); }
}
