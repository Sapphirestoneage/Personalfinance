/* The one-pager: header, key numbers, changes since last time, most important
   to know, where you are amazing, where you are struggling (each with a
   reading), do more of and less of, to-dos, goals, bring next time. Prints
   to exactly one page. Every number links to its math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { ALL_CHARTS as CHARTS } from '../../engine/charts-all.js';
import * as Charts from '../charts.js';
import { openMath } from './measure.js';
import { theirPlate, byInstitution, sinceLastSession, changeText } from '../../engine/plates.js';
import { clientName } from '../app.js';
import { translator } from '../glossary.js';
import { PLANET_SHORT } from '../../engine/sun.js';
import { renderShelf } from '../shelf.js';
import { variance, AREA_LABELS } from '../../engine/variance.js';
import { proposals } from '../../engine/targets.js';
import { actualsOf } from './call.js';
import { nextWins } from './goals.js';
import { programOf } from '../../engine/program.js';
import { beforeAfter } from '../../engine/outcomes.js';


export function mount(host, app) {
  const t = translator(app);
  const coach = app.view === 'coach';
  let editing = false;
  const header = h('header', { class: 'no-print' }, h('h1', null, t('One-pager')), h('div', { class: 'actions' },
    coach ? h('button', { class: 'btn', onClick: () => { editing = !editing; page.classList.toggle('editing', editing); } }, 'Edit') : null,
    h('button', { class: 'btn primary', onClick: () => window.print() }, 'Print')));
  const page = h('article', { class: 'onepager' });
  host.appendChild(header); host.appendChild(page);
  function draw() {
    clear(page);
    const R = app.result; const M = R.metrics; const rec = app.record;
    const op = rec.sun.onepager;
    const conf = overallConfidence(R);
    page.appendChild(h('header', { class: 'op-head' }, h('div', null, h('h2', { class: 'op-title' }, clientName(rec) || 'Household'), h('div', { class: 'muted small' }, rec.sun.f.bigGoal && rec.sun.f.bigGoal.v ? rec.sun.f.bigGoal.v : '')),
      h('div', { class: 'op-meta' }, F.dateLong(R.today), h('br'), ((rec.sessions || []).length ? 'After session ' + rec.sessions.length : 'Before the first session'), h('br'), 'Overall confidence ' + Math.round(conf * 100) + '%')));
    /* key numbers */
    const nums = h('div', { class: 'op-shelf-host' });
    /* the one-pager is the client's page: client labels whatever the view */
    const clientApp = Object.assign(Object.create(Object.getPrototypeOf(app)), app, { view: 'client' });
    if (M) renderShelf(nums, clientApp, { compact: true, title: 'Key numbers', ladder: false });
    page.appendChild(h('section', { class: 'op-shelf' }, M ? nums : h('p', { class: 'muted small' }, 'Numbers appear as income and spending come in.')));
    /* since last time */
    const since = sinceLastSession(rec, app.data.fields, (def, o, n, l) => changeText(def, o, n, l));
    page.appendChild(h('section', null, h('h3', null, 'Changes since last time' + (since.since ? ' (' + F.dateLocal(since.since) + ')' : '')), since.changes.length ? h('ul', null, since.changes.slice(0, 3).map(c => h('li', null, c.row + ': ' + c.label.toLowerCase() + ' ' + c.text))) : h('p', { class: 'muted small' }, since.since ? 'No changes since the last session.' : 'First session.')));
    /* Level 8: what you said, what it really is, what you'd want; your targets; guesses; if it all falls on you */
    saidSection(page, R, rec);
    /* Level 11: the next wins, the starter cushion first until it is full */
    const wins = nextWins(clientApp, 3);
    if (wins.length) page.appendChild(h('section', { class: 'op-wins' }, h('h3', null, 'Your next wins'), h('ul', null, wins.map(w => h('li', null, w.text)))));
    /* Level 10 (MR-056): at graduation the one-pager carries before and after */
    const PG = programOf(rec); if (PG.sessions['12'] && PG.sessions['12'].status === 'closed') { const rows = beforeAfter(rec, R, { money: c => F.dollarsWhole(c), date: d => F.date(d) }); page.appendChild(h('section', { class: 'op-beforeafter' }, h('h3', null, 'Before and after'), h('table', { class: 'data' }, h('tbody', null, rows.map(r => h('tr', null, h('td', null, r.label), h('td', { class: 'num' }, r.beforeText), h('td', { class: 'num' }, r.nowText))))))); }
    const grid = h('div', { class: 'op-grid' });
    grid.appendChild(listSection('Most important to know', op.important || suggestImportant(R), 'important', 3, suggestImportant(R)));
    grid.appendChild(listSection('What is working', op.amazing || [], 'amazing', 3));
    grid.appendChild(strugglingSection(R, op));
    grid.appendChild(h('section', null, h('h3', null, 'Do more, do less'), h('div', { class: 'op-read' }, h('p', null, h('strong', null, 'More: '), op.doMore || h('span', { class: 'empty-token' }, 'Not written yet')), h('p', null, h('strong', null, 'Less: '), op.doLess || h('span', { class: 'empty-token' }, 'Not written yet'))),
      h('div', { class: 'op-edit' }, h('textarea', { class: 'input', 'aria-label': 'Do more of', value: op.doMore || '', onChange: e => app.mutate(r => { r.sun.onepager.doMore = e.target.value; }, 'onepager') }), h('textarea', { class: 'input', 'aria-label': 'Do less of', style: { marginTop: '8px' }, value: op.doLess || '', onChange: e => app.mutate(r => { r.sun.onepager.doLess = e.target.value; }, 'onepager') }))));
    page.appendChild(grid);
    /* to-dos */
    const todos = op.todos || [];
    page.appendChild(h('section', null, h('h3', null, 'To-dos'),
      todos.length ? h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Task'), h('th', null, 'Owner'), h('th', null, 'Due'))), h('tbody', null, todos.map(td => h('tr', null, h('td', null, td.task), h('td', null, td.owner), h('td', null, td.due ? F.dateLong(td.due) : ''))))) : h('p', { class: 'muted small op-read' }, 'None yet.'),
      h('div', { class: 'op-edit' }, h('button', { class: 'btn small', onClick: () => app.mutate(r => { r.sun.onepager.todos = (r.sun.onepager.todos || []).concat([{ task: 'New task', owner: clientName(r) || 'Client', due: '' }]); }, 'onepager') }, 'Add a to-do'),
        todos.map((td, i) => h('div', { class: 'row', style: { marginTop: '8px' } }, h('input', { class: 'input', style: { width: '240px' }, value: td.task, 'aria-label': 'Task', onChange: e => app.mutate(r => { r.sun.onepager.todos[i].task = e.target.value; }, 'onepager') }), h('input', { class: 'input', style: { width: '112px' }, value: td.owner, 'aria-label': 'Owner', onChange: e => app.mutate(r => { r.sun.onepager.todos[i].owner = e.target.value; }, 'onepager') }), h('input', { class: 'input', style: { width: '112px' }, value: td.due, 'aria-label': 'Due (YYYY-MM-DD)', onChange: e => app.mutate(r => { r.sun.onepager.todos[i].due = e.target.value; }, 'onepager') }), h('button', { class: 'btn small quiet', onClick: () => app.mutate(r => { r.sun.onepager.todos.splice(i, 1); }, 'onepager') }, 'Remove'))))));
    /* goals */
    const goals = R.sun ? R.sun.outputs.life.goals : [];
    page.appendChild(h('section', null, h('h3', null, 'Goals'), goals.length ? h('ul', null, goals.map(g => h('li', null, g.name + ': ' + (g.cents !== null ? F.dollarsWhole(g.cents, { rough: g.costQ && g.costQ.rough }) : 'cost not entered') + (g.targetDate ? ' by ' + F.date(g.targetDate) : '')))) : h('p', { class: 'muted small' }, 'No goals entered.')));
    /* bring next time */
    const theirs = byInstitution(theirPlate(rec, app.data.fields));
    page.appendChild(h('section', null, h('h3', null, 'Bring next time'), theirs.length ? h('ul', null, theirs.slice(0, 6).map(g => h('li', null, h('strong', null, g.institution + ': '), g.items.slice(0, 4).map(i => bringText(i)).join(', ') + (g.items.length > 4 ? ' and ' + (g.items.length - 4) + ' more' : '')))) : h('p', { class: 'muted small' }, 'Nothing outstanding.')));
    /* charts picked */
    const pickedIds = (op.charts && op.charts.length) ? op.charts : ['netWorth', 'sankey'];
    const picked = pickedIds.map(id => CHARTS.find(c => c.id === id)).filter(Boolean).slice(0, 2);
    if (picked.length) { const g2 = h('div', { class: 'op-grid' }); const bodies = []; picked.forEach(c => { const body = h('div'); bodies.push([c, body]); g2.appendChild(h('section', null, h('h3', null, c.client), body)); }); page.appendChild(g2); page.appendChild(assumptionsLine(R, rec)); bodies.forEach(([c, body]) => Charts.render(c.id, body, c.build(R), { client: true })); }
    page.classList.toggle('editing', editing);
  }
  function listSection(title, items, key, max, suggestions) {
    const op = app.record.sun.onepager;
    return h('section', null, h('h3', null, title),
      h('div', { class: 'op-read' }, items.length ? h('ul', null, items.slice(0, max).map(x => h('li', null, x))) : h('p', { class: 'muted small' }, 'Not written yet.')),
      h('div', { class: 'op-edit' }, h('textarea', { class: 'input', 'aria-label': title + ', one per line', value: (op[key] || items).join('\n'), onChange: e => app.mutate(r => { r.sun.onepager[key] = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); }, 'onepager') }),
        suggestions && suggestions.length ? h('p', { class: 'suggest' }, 'The app suggests, from today\'s numbers: ' + suggestions.join(' | ')) : null));
  }
  function saidSection(page, R, rec) {
    const gut = rec.anchors && rec.anchors.gut ? Object.keys(rec.anchors.gut).length : 0;
    const S = R.sun && R.sun.outputs; const money = c => F.dollarsWhole(c);
    const bits = [];
    if (R.guesses && R.guesses.count) bits.push('Includes ' + R.guesses.count + (R.guesses.count === 1 ? ' guess' : ' guesses') + ' (averages for a ' + (R.colTier ? (app.data.colTiers.labels.client[R.colTier.tier] || '') : 'typical') + ', not your numbers).');
    if (S && S.safety.runway && S.safety.runway.fullAlone !== null && S.safety.runway.fullAlone !== undefined && S.spending.sharedFullMonthly && S.spending.sharedFullMonthly.status === 'ok') bits.push('If it all falls on you: the shared bills become ' + money(S.spending.sharedFullMonthly.cents) + ' a month and cash covers ' + F.months(S.safety.runway.fullAlone) + '.');
    if (!gut && !bits.length) return;
    const sec = h('section', { class: 'op-said' }, h('h3', null, "What you said, what it really is, what you'd want"));
    let shown = 0;
    if (gut) {
      /* a row earns its place when what they said or what they would want differs from what it is; a backfilled anchor equal to the lines says nothing */
      const v = variance(rec, actualsOf(app)); const rows = v.rows.filter(r => r.key !== 'total' && r.actual !== null && ((r.gut !== null && r.gut !== r.actual) || (r.dream !== null && r.dream !== r.actual))).sort((a, b) => Math.abs((b.awareness && b.awareness.monthly) || 0) - Math.abs((a.awareness && a.awareness.monthly) || 0)).slice(0, 3);
      shown += rows.length;
      if (rows.length) sec.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Area'), h('th', { class: 'num' }, 'What you said'), h('th', { class: 'num' }, 'What it really is'), h('th', { class: 'num' }, "What you'd want"))), h('tbody', null, rows.map(r => h('tr', null, h('td', null, r.label), h('td', { class: 'num' }, r.gut !== null ? money(r.gut) : h('span', { class: 'empty-token' }, 'Not asked')), h('td', { class: 'num' }, money(r.actual)), h('td', { class: 'num' }, r.dream !== null ? money(r.dream) : h('span', { class: 'empty-token' }, 'Not asked'))))))));
      const T = rec.targets || {}; const keys = Object.keys(T);
      if (keys.length) { const P = proposals(v.rows, rec, R); const picked = P.rows.filter(t => T[t.key]); shown += picked.length; const word = c => c === 'dream' || c === 'room' ? "what you'd want" : c === 'gut' ? 'what you said' : c === 'middle' ? 'meet in the middle' : 'keep it as is'; sec.appendChild(h('h3', null, 'Your targets')); sec.appendChild(h('ul', null, picked.map(t => h('li', null, t.label + ': ' + money(t.value) + ' a month (' + word(t.choice) + ', now ' + money(t.actual) + ')')))); }
    }
    bits.forEach(b => sec.appendChild(h('p', { class: 'small' }, b)));
    if (!shown && !bits.length) return;
    if (!shown) sec.querySelector('h3').textContent = 'Good to know';
    page.appendChild(sec);
  }
  function strugglingSection(R, op) {
    const picks = app.record.sun.clientPicks || [];
    const lenses = (R.lenses || []).filter(l => app.view === 'coach' || picks.includes(l.id));
    /* a reading is shown only when the bullet is a lens sentence; coach-written bullets carry none */
    const items = op.struggling && op.struggling.length ? op.struggling.map(s => { const l = (R.lenses || []).find(x => x.text === s); return { text: s, reading: l ? l.reading : null }; }) : lenses.slice(0, 3).map(l => ({ text: l.text, reading: l.reading }));
    return h('section', null, h('h3', null, 'What needs work'),
      h('div', { class: 'op-read' }, items.length ? h('ul', null, items.map(i => h('li', null, i.text, i.reading ? h('span', { class: 'muted' }, ' Read: ' + i.reading.title) : null))) : h('p', { class: 'muted small' }, 'Nothing flagged.')),
      h('div', { class: 'op-edit' }, h('textarea', { class: 'input', 'aria-label': 'Where you are struggling, one per line', value: (op.struggling || items.map(i => i.text)).join('\n'), onChange: e => app.mutate(r => { r.sun.onepager.struggling = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); }, 'onepager') })));
  }
  draw();
  return { update() { draw(); } };
}

function bringText(i) {
  const label = i.label.toLowerCase();
  const row = (i.row || '').trim();
  if (!row) return label;
  const rowWords = row.toLowerCase().split(/\s+/);
  const trimmed = label.split(' ').filter(w => !rowWords.includes(w)).join(' ');
  return row + ' (' + (trimmed || label) + ')';
}


function suggestImportant(R) {
  const M = R.metrics; if (!M) return [];
  const out = [];
  if (M.shelterRate.status === 'ok') out.push('Housing takes ' + F.percent(M.shelterRate.value.value, { rough: M.shelterRate.value.rough }) + ' of take-home');
  if (M.runway.status === 'ok') out.push('Cash covers ' + F.months(M.runway.value.value.full, { rough: M.runway.value.rough }) + ' of full spending');
  if (M.savingsRateGross.status === 'ok') out.push('The savings rate, match included, is ' + F.percent(M.savingsRateGross.value.value, { rough: M.savingsRateGross.value.rough }));
  return out.slice(0, 3);
}

export function overallConfidence(R) {
  const fills = Object.keys(R.fills).map(k => R.fills[k]).filter(v => v !== null);
  return fills.length ? fills.reduce((s, v) => s + v, 0) / fills.length : 0;
}

/* One line under the charts: the assumptions every projection on the page rests on. */
function assumptionsLine(R, rec) {
  const a = R.asm; const pct = v => F.percent(v, { places: 0 });
  const set = Object.keys(rec.sun.assumptions || {}).length > 0;
  return h('p', { class: 'small muted op-asm' }, 'Assumes ' + pct(a.returnLikely) + ' a year after inflation (' + pct(a.returnWorst) + ' to ' + pct(a.returnBest) + '), a ' + F.percent(a.withdrawalRate, { places: a.withdrawalRate * 1000 % 10 ? 2 : 1 }) + ' withdrawal rate and Social Security from ' + a.socialSecurityAge + ', in today\'s dollars.' + (set ? ' Set for this client.' : ''));
}
