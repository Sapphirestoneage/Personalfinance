/* Measure: the 74 metrics by stage with a show-the-math drawer on every
   number, the lenses that fire (coach picks which the client sees), and the
   eight charts, each with a switch onto the one-pager. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { ALL_CHARTS as CHARTS, HERO_ORDER } from '../../engine/charts-all.js';
import { PLANETS } from '../../engine/sun.js';
import { cachedSensitivity, getSensitivity } from '../levers-bridge.js';
import { targetFor } from '../../engine/unlocks.js';
import { sparkline } from '../charts-more.js';
import * as Charts from '../charts.js';
import { translator, metricLabel } from '../glossary.js';
import { PLANET_LABELS } from '../../engine/sun.js';
import { registerMath, openMetric } from '../metricdrawer.js';
import { renderUnlockMap, renderFocusedChart, highlight, clientCharts, chartTakeaway, goToProbe } from '../unlocks.js';

/* MR-059: Measure is tabs with stable deep links: #/measure/numbers/<metric>, #/measure/lenses/<lens>, #/measure/charts/<chart>, #/measure/unlocks */
const TABS = [['overview', 'Overview'], ['charts', 'Charts'], ['numbers', 'Numbers'], ['lenses', 'Lenses'], ['unlocks', 'Unlocks']];
export function tabOf(app) { const id = app.route.params.id; return TABS.some(t => t[0] === id) ? id : 'overview'; }
/* tiles with a time dimension carry a sparkline of the path they are read from (MR-061) */
const TIME_METRICS = { netWorth: 'netWorth', fiDate: 'netWorth', pctToFi: 'netWorth', crossoverDate: 'netWorth', first100kDate: 'netWorth', theFlip: 'invested', coastFi: 'invested', regularFi: 'netWorth', leanFi: 'netWorth', fatFi: 'netWorth', fiNumber: 'netWorth', totalDebt: 'debt', debtFree: 'debt', weightedApr: 'debt', annualInterest: 'debt', assets: 'invested' };
function sparkFor(app, id) {
  const key = TIME_METRICS[id]; const pj = app.result && app.result.projection; if (!key || !pj || !pj.likely) return null;
  const vals = pj.likely.path.map(p => p[key]); if (key === 'debt' && !vals.some(v => v > 0)) return null;
  const fi = pj.likely.fiAge !== null ? pj.likely.path.findIndex(p => p.age === pj.likely.fiAge) : null;
  return sparkline(vals, { markX: fi !== null && fi >= 0 ? fi : null });
}
function tabBar(app, current) {
  return h('nav', { class: 'mtabs', 'aria-label': 'Measure sections' }, TABS.map(([id, label]) => h('a', { href: '#/measure/' + id, 'aria-current': id === current ? 'page' : null }, label)));
}
/* scroll to the item a deep link names and light it up; opens any fold that hides it */
function revealItem(host, sel) {
  const el = host.querySelector(sel); if (!el) return false;
  let p = el; while (p && p !== host) { if (p.style && p.style.display === 'none') p.style.display = ''; p = p.parentElement; }
  setTimeout(() => highlight(el), 60);
  return true;
}

const SHARE_LABELS = { debt: 'Debt', retirement: 'Retirement', accommodation: 'Accommodation', food: 'Food', transportation: 'Transportation', therapy: 'Therapy', pretax: 'Pre-tax', roth: 'Roth', taxable: 'Taxable', hsa: 'HSA', cash: 'Cash', other: 'Other', stocks: 'Stocks', bonds: 'Bonds' };
const KEY_METRICS = ['takeHome', 'spending', 'surplus', 'savingsRateTakeHome', 'netWorth', 'totalDebt', 'runway', 'pctToFi'];
const GROUPS = [['cash flow', 'Cash flow'], ['debt', 'Debt and credit'], ['cards', 'Cards'], ['balance sheet', 'Balance sheet'], ['safety', 'Safety net'], ['retirement', 'Retirement'], ['taxes', 'Taxes'], ['FI', 'Financial independence'], ['benchmarks', 'Benchmarks (verify)']];
const STAGE_PLANETS = { 1: ['income', 'spending'], 2: ['debt'], 3: ['safety', 'invest'], 4: ['taxes'], 5: ['life'] };

export function mount(host, app) {
  const t = translator(app);
  const tab = tabOf(app); const sub = app.route.params.sub || null;
  host.appendChild(h('header', null, h('h1', null, t('Measure')), h('span', { class: 'sub' }, app.view === 'coach' ? 'Every number opens its math.' : '')));
  host.appendChild(tabBar(app, tab));
  const stage = h('div', { class: 'stage-row' });
  const kpis = h('div');
  const lenses = h('section', { class: 'panel' });
  const charts = h('section');
  const unlocks = h('section', { class: 'unlock-map' });
  const overview = h('section', { class: 'overview' });
  if (tab === 'overview') host.appendChild(overview);
  if (tab === 'numbers') { host.appendChild(stage); host.appendChild(kpis); }
  if (tab === 'lenses') host.appendChild(lenses);
  if (tab === 'charts') host.appendChild(charts);
  if (tab === 'unlocks') host.appendChild(unlocks);
  function draw() {
    clear(stage); clear(kpis); clear(lenses); clear(charts); clear(unlocks); clear(overview);
    const R = app.result; const M = R.metrics; const phone = isPhone(host);
    if (tab === 'overview') { if (!M) { overview.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Nothing to show yet'), h('p', null, 'Enter income first, then spending. The charts arrive as their inputs do.'))); return; } drawOverview(overview, app, t, phone); return; }
    if (tab === 'unlocks') { if (!M) { unlocks.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Nothing to map yet'), h('p', null, 'Enter income first, then spending. The map fills as numbers open.'))); return; } renderUnlockMap(unlocks, app); return; }
    if (tab === 'charts' && sub) { if (!M) { charts.appendChild(h('div', { class: 'empty' }, h('h2', null, 'Nothing to chart yet'), h('p', null, 'Enter income first, then spending.'))); return; } renderFocusedChart(charts, app, sub, app.unlockBack); return; }
    if (!M) { (tab === 'numbers' ? kpis : tab === 'lenses' ? lenses : charts).appendChild(h('div', { class: 'empty' }, h('h2', null, 'Nothing to measure yet'), h('p', null, 'Enter income first, then spending. Numbers appear as their inputs arrive.'))); return; }
    if (app.view === 'coach') Object.keys(STAGE_PLANETS).forEach(s => {
      const planets = STAGE_PLANETS[s]; const filled = planets.every(p => R.rowCounts[p] > 0);
      stage.appendChild(h('span', { class: 'chip stage' + (filled ? '' : ' waiting') }, 'Stage ' + s + ': ' + planets.map(p => PLANET_LABELS[p].toLowerCase()).join(' and ') + (filled ? ', has rows' : ', needs rows')));
    });
    if (app.view === 'coach') { const filledStages = Object.keys(STAGE_PLANETS).filter(s => STAGE_PLANETS[s].every(p => R.rowCounts[p] > 0)); stage.appendChild(h('span', { class: 'chip stage stage-summary' }, filledStages.length === 5 ? 'Stages 1 to 5 have rows' : filledStages.length + ' of 5 stages have rows')); }
    if (tab !== 'numbers') { if (tab === 'lenses') { drawLenses(lenses, app, t, phone); if (sub) revealItem(lenses, '.lens[data-lens="' + sub + '"]'); } if (tab === 'charts') drawCharts(charts, app, t, phone); return; }
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
      if (key === 'benchmarks' && app.view === 'client') return; /* MR-057: benchmarks are the coach's, with their verify tag */
      const defs = app.data.metrics.metrics.filter(m => m.group === key && (app.view === 'coach' || !m.coachOnly));
      if (!defs.length) return;
      const allNeed = defs.every(def => !M[def.id] || M[def.id].status !== 'ok');
      if (allNeed) {
        const needs = Array.from(new Set(defs.flatMap(def => (M[def.id] && M[def.id].needs) || []))).slice(0, 2);
        host2.appendChild(h('div', { class: 'metric-group' }, h('h3', null, t(label)), h('p', { class: 'group-collapsed' }, 'Needs ' + (needs.join(' and ') || 'inputs') + ' (' + defs.length + (defs.length === 1 ? ' number' : ' numbers') + ' waiting).')));
        return;
      }
      const grid = h('div', { class: 'kpis' });
      defs.forEach(def => grid.appendChild(kpi(app, M[def.id], def, t)));
      host2.appendChild(collapsible(h('div', { class: 'metric-group' }), t(label), grid, phone, { count: defs.length, word: 'numbers' }));
    }
    if (tab === 'lenses') { drawLenses(lenses, app, t, phone); if (sub) revealItem(lenses, '.lens[data-lens="' + sub + '"]'); }
    if (tab === 'charts') drawCharts(charts, app, t, phone);
    if (tab === 'numbers' && sub) revealItem(kpis, '.kpi[data-metric="' + sub + '"]');
  }
  draw();
  return { update() { draw(); } };
}

/* MR-057: on a phone each Measure section folds to its header and its top two items; a tap opens the rest. */
export function isPhone(host) { return (host && host.clientWidth > 0 ? host.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1440)) < 600; }
export function collapsible(section, label, grid, phone, o) {
  const items = Array.from(grid.children);
  if (!phone || items.length <= 2) { section.appendChild(h('h3', null, label)); section.appendChild(grid); return section; }
  let open = false;
  const more = items.length - 2;
  const btn = h('button', { class: 'fold-head', 'aria-expanded': 'false' }, h('h3', null, label), h('span', { class: 'small muted fold-more' }, more + ' more'));
  const paint = () => { items.forEach((el, i) => { el.style.display = open || i < 2 ? '' : 'none'; }); btn.setAttribute('aria-expanded', String(open)); btn.lastChild.textContent = open ? 'Fewer' : more + ' more ' + ((o && o.word) || 'items'); };
  btn.addEventListener('click', () => { open = !open; paint(); });
  section.classList.add('fold'); section.appendChild(btn); section.appendChild(grid); paint();
  return section;
}
export function kpi(app, m, def, t) {
  const coach = app.view === 'coach';
  const label = metricLabel(app, def);
  if (!m || m.status !== 'ok') {
    const needsList = (m && m.needs && m.needs.length) ? m.needs : ['inputs'];
    const tile = h('div', { class: 'kpi', role: 'button', tabindex: '0', dataset: { metric: def.id } }, h('div', { class: 'label', title: def.definition }, label), h('div', { class: 'value needs' }, 'Needs ' + needsList.slice(0, 2).join(', ') + (needsList.length > 2 ? ' and more' : '')));
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
  const tile = h('div', { class: 'kpi', role: 'button', tabindex: '0', 'aria-label': label + ' ' + text, dataset: { metric: def.id } }, h('div', { class: 'label', title: def.definition }, label), h('div', { class: 'value' + (v.rough ? ' rough' : '') + (isList ? ' list' : ''), title: text }, node || text), range ? h('div', { class: 'range', title: range }, range) : null, sparkFor(app, def.id));
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

export function drawLenses(panel, app, t, phone) {
  clear(panel);
  const coach = app.view === 'coach';
  const picks = app.record.sun.clientPicks || [];
  const all = app.result.lenses || [];
  const list = coach ? all : all.filter(l => picks.includes(l.id));
  panel.appendChild(h('h2', null, t('Lenses'), coach ? h('span', { class: 'tag' }, all.length + ' firing; tick the ones the client should see') : null));
  if (!list.length) { panel.appendChild(h('p', { class: 'muted' }, coach ? 'No lens fires yet. Lenses need income, spending and the planets they read.' : 'Nothing to show here yet.')); return; }
  const lensHost = h('div', { class: 'lens-list' }); panel.appendChild(lensHost);
  if (phone && list.length > 2) { let open = false; const btn = h('button', { class: 'btn small', 'aria-expanded': 'false', style: { marginBottom: '8px' } }, (list.length - 2) + ' more lenses'); btn.addEventListener('click', () => { open = !open; Array.from(lensHost.children).forEach((el, i) => { el.style.display = open || i < 2 ? '' : 'none'; }); btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? 'Fewer lenses' : (list.length - 2) + ' more lenses'; }); panel.appendChild(btn); setTimeout(() => Array.from(lensHost.children).forEach((el, i) => { if (i >= 2) el.style.display = 'none'; }), 0); }
  list.forEach(l => {
    const el = h('div', { class: 'lens', dataset: { lens: l.id } },
      h('div', { class: 'text' }, l.text),
      h('div', { class: 'impact' }, l.impactAnnual !== null ? F.dollarsWhole(l.impactAnnual, { rough: l.rough }) + ' a year' : (l.figure || '')),
      h('div', { class: 'foot' },
        h('span', null, l.name),
        h('button', { class: 'btn small quiet', onClick: () => app.openDrawer(h('div', null, h('h2', null, l.name), h('p', { style: { margin: '8px 0 12px' } }, l.text), h('table', { class: 'data math-table' }, h('tbody', null, l.inputs.map(i => h('tr', null, h('td', null, i[0]), h('td', { class: 'num' }, i[1]))))), l.reading ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Reading: ' + l.reading.title) : null)) }, 'Show the math'),
        l.reading ? h('span', { class: 'muted' }, 'Read: ' + l.reading.title) : null,
        coach ? h('label', null, h('input', { type: 'checkbox', checked: picks.includes(l.id), onChange: e => { app.mutate(rec => { const set = new Set(rec.sun.clientPicks || []); if (e.target.checked) set.add(l.id); else set.delete(l.id); rec.sun.clientPicks = Array.from(set); }, 'picks'); } }), 'Show to client') : null));
    lensHost.appendChild(el);
  });
}

export function drawCharts(host, app, t, phone) {
  clear(host);
  const coach = app.view === 'coach';
  const onPage = app.record.sun.onepager.charts || [];
  const visible = clientCharts(app);
  const extra = { sensitivity: cachedSensitivity(app) };
  const list = CHARTS.filter(c => (coach || (visible.includes(c.id) && !c.coachOnly)));
  const built = {}; list.forEach(c => { built[c.id] = c.build(app.result, extra); });
  const open = list.filter(c => built[c.id] && !built[c.id].needs).length;
  host.appendChild(h('h2', { style: { margin: '16px 0 8px' } }, t('Charts'), h('span', { class: 'tag' }, open + ' of ' + list.length + ' open')));
  /* filter by planet; a filter is remembered for the page */
  const planetsHere = PLANETS.filter(p => list.some(c => c.planet === p));
  const chips = h('div', { class: 'gallery-filter', role: 'group', 'aria-label': 'Filter charts by planet' });
  const paintChips = () => { clear(chips); [['all', 'All']].concat(planetsHere.map(p => [p, PLANET_LABELS[p]])).forEach(([id, label]) => chips.appendChild(h('button', { 'aria-pressed': String(galleryFilter === id), onClick: () => { galleryFilter = id; drawCharts(host, app, t, phone); } }, label))); };
  paintChips(); host.appendChild(chips);
  const grid = h('div', { class: 'grid grid-2' });
  let foldOpen = !phone;
  list.filter(c => galleryFilter === 'all' || c.planet === galleryFilter).forEach(c => {
    const data = built[c.id]; const locked = !data || data.needs;
    const title = locked ? (coach ? c.name : c.client) : chartTakeaway(app, c.id);
    const panel = h('section', { class: 'panel chart-panel' + (locked ? ' locked' : ''), dataset: { chart: c.id } }, h('header', null, h('h3', null, h('a', { href: '#/measure/charts/' + c.id, class: 'chart-link', title: 'Open this chart on its own' }, title)),
      coach && !locked ? h('label', { class: 'small muted', style: { display: 'inline-flex', gap: '4px' } }, h('input', { type: 'checkbox', checked: visible.includes(c.id), 'aria-label': 'Client sees ' + c.name, onChange: e => { app.mutate(rec => { const set = new Set(clientCharts(app)); if (e.target.checked) set.add(c.id); else set.delete(c.id); rec.sun.clientCharts = Array.from(set); }, 'picks'); } }), 'Client sees') : null,
      coach && !locked ? h('label', { class: 'small muted', style: { display: 'inline-flex', gap: '4px' } }, h('input', { type: 'checkbox', checked: onPage.includes(c.id), 'aria-label': 'On the one-pager: ' + c.name, onChange: e => { app.mutate(rec => { const set = new Set(rec.sun.onepager.charts || []); if (e.target.checked) set.add(c.id); else set.delete(c.id); rec.sun.onepager.charts = Array.from(set); }, 'picks'); } }), 'On the one-pager') : null));
    if (!locked && title !== (coach ? c.name : c.client)) panel.appendChild(h('div', { class: 'small muted', style: { marginBottom: '6px' } }, coach ? c.name : c.client));
    const body = h('div', { dataset: { chartBody: c.id } });
    panel.appendChild(body);
    if (locked) {
      const target = data && data.needs ? data.needs.map(n => targetFor(n, app.record, app.data)).find(Boolean) : null;
      panel.appendChild(h('div', { class: 'needs-row' }, h('span', { class: 'small muted' }, 'Needs ' + ((data && data.needs) || ['inputs']).join(', ') + '.'), target && coach && !(data && data.waiting) ? h('button', { class: 'btn small primary', onClick: () => goToProbe(app, Object.assign({ kind: target.planet === 'sun' ? 'sun' : 'field' }, target), '#/measure/charts') }, 'Add ' + target.label.toLowerCase()) : null));
    }
    grid.appendChild(panel);
  });
  host.appendChild(grid);
  const panels = Array.from(grid.children);
  const fold = () => panels.forEach((el, i) => { el.style.display = foldOpen || i < 2 ? '' : 'none'; });
  if (phone && panels.length > 2) { const btn = h('button', { class: 'btn small', 'aria-expanded': 'false', style: { margin: '8px 0' } }, (panels.length - 2) + ' more charts'); btn.addEventListener('click', () => { foldOpen = !foldOpen; fold(); btn.setAttribute('aria-expanded', String(foldOpen)); btn.textContent = foldOpen ? 'Fewer charts' : (panels.length - 2) + ' more charts'; paint(); }); host.appendChild(btn); fold(); }
  const paint = () => list.forEach(c => { const body = grid.querySelector('[data-chart-body="' + c.id + '"]'); if (body && body.parentNode.style.display !== 'none' && built[c.id] && !built[c.id].needs) Charts.render(c.id, body, built[c.id], { client: !coach }); });
  paint();
  if (list.some(c => built[c.id] && built[c.id].waiting)) getSensitivity(app, () => setTimeout(() => drawCharts(host, app, t, phone), 0));
  if (globalThis.ResizeObserver) { let tm = null; let last = grid.clientWidth; const ro = new ResizeObserver(() => { if (Math.abs(grid.clientWidth - last) < 24) return; last = grid.clientWidth; clearTimeout(tm); tm = setTimeout(paint, 150); }); ro.observe(grid); }
}
let galleryFilter = 'all';

/* The Overview (MR-061): the eight hero charts that have their inputs, each titled by its takeaway, each a link to its own page. */
export function drawOverview(host, app, t, phone) {
  clear(host);
  const coach = app.view === 'coach'; const visible = clientCharts(app);
  const extra = { sensitivity: cachedSensitivity(app) };
  const heroes = []; const waiting = [];
  HERO_ORDER.forEach(id => { if (heroes.length >= 8) return; const c = CHARTS.find(x => x.id === id); if (!c || (!coach && (!visible.includes(id) || c.coachOnly))) return; const d = c.build(app.result, extra); if (d && d.waiting) waiting.push(id); if (d && !d.needs) heroes.push({ c, d }); });
  const total = CHARTS.filter(c => coach || (visible.includes(c.id) && !c.coachOnly)).length;
  host.appendChild(h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '0 0 8px' } }, h('h2', null, coach ? 'The picture' : 'Your picture'), h('span', { class: 'small muted' }, heroes.length + ' of ' + total + ' charts shown. ', h('a', { href: '#/measure/charts' }, 'All charts'), ' or ', h('a', { href: '#/measure/unlocks' }, coach ? 'the Unlock Map' : 'what more would show'))));
  if (!heroes.length) { host.appendChild(h('div', { class: 'empty' }, h('h2', null, 'No chart has its inputs yet'), h('p', null, 'Income first, then spending; the first charts arrive with the first rows.'), h('p', null, h('a', { class: 'next', href: '#/measure/unlocks' }, 'See what would open them')))); return; }
  const grid = h('div', { class: 'overview-grid' });
  heroes.forEach(({ c }) => { grid.appendChild(h('section', { class: 'panel chart-panel hero', dataset: { chart: c.id } }, h('header', null, h('h3', null, h('a', { href: '#/measure/charts/' + c.id, class: 'chart-link' }, chartTakeaway(app, c.id)))), h('div', { class: 'small muted', style: { marginBottom: '6px' } }, coach ? c.name : c.client), h('div', { dataset: { chartBody: c.id } }))); });
  host.appendChild(grid);
  const shown = phone ? heroes.slice(0, 2) : heroes; let open = !phone;
  const paint = () => heroes.forEach(({ c, d }, i) => { const body = grid.querySelector('[data-chart-body="' + c.id + '"]'); if (!body) return; body.parentNode.style.display = open || i < 2 ? '' : 'none'; if (open || i < 2) Charts.render(c.id, body, d, { client: !coach }); });
  if (phone && heroes.length > 2) { const btn = h('button', { class: 'btn small', 'aria-expanded': 'false', style: { margin: '8px 0' } }, (heroes.length - 2) + ' more charts'); btn.addEventListener('click', () => { open = !open; btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? 'Fewer charts' : (heroes.length - 2) + ' more charts'; paint(); }); host.appendChild(btn); }
  paint();
  if (waiting.length) getSensitivity(app, () => setTimeout(() => drawOverview(host, app, t, phone), 0));
  if (globalThis.ResizeObserver) { let tm = null; let last = grid.clientWidth; const ro = new ResizeObserver(() => { if (Math.abs(grid.clientWidth - last) < 24) return; last = grid.clientWidth; clearTimeout(tm); tm = setTimeout(paint, 150); }); ro.observe(grid); }
}
