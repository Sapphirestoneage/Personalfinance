/* The session screen: the next-question card (one big, two smaller), the
   circle-back list, my plate and their plate with a Small Wins tab, the
   follow-up email, session snapshots and what changed since last time.
   Coach view only; nothing here reaches the client view or the one-pager. */
import { h, clear, qs } from '../dom.js';
import * as F from '../../engine/format.js';
import { session as leverage } from '../../engine/leverage.js';
import { followUpEmail } from '../../engine/email.js';
import { sinceLastSession, changeText } from '../../engine/plates.js';
import { PLANET_LABELS, PLANET_SHORT } from '../../engine/sun.js';
import { clientName, closeOverlay } from '../app.js';
import { append } from '../../engine/journal.js';
import { STATES, SOURCES } from '../../engine/states.js';
import { renderShelf } from '../shelf.js';
import { getSensitivity } from '../levers-bridge.js';
import { progress, goalProgress } from '../../engine/progress.js';
import { variancePanel, targetsPanel, actualsOf } from './call.js';
import { variance, AREA_LABELS } from '../../engine/variance.js';
import { proposals } from '../../engine/targets.js';
import { targetsEmail } from '../../engine/email.js';
import { finishChanges, finishMonths, celebrations } from '../../engine/goals.js';
import { nextWins } from './goals.js';
import { takeSnapshot, celebrate, seedCelebrations, overallNextAction } from '../../engine/momentum.js';
import { recordSatisfaction, programOf } from '../../engine/program.js';
import { cachedSensitivity } from '../levers-bridge.js';

export function mount(host, app) {
  const noteInput = h('input', { class: 'input session-note', type: 'text', 'aria-label': 'Session note' });
  const header = h('header', null, h('h1', null, 'Session'), h('span', { class: 'sub' }, 'The next question is the unsure fact that moves the most money. ', h('a', { href: '#/calculators' }, 'Calculators')), h('div', { class: 'actions' },
    h('label', { class: 'small muted' }, 'Note for this session'), noteInput,
    h('a', { class: 'btn primary', href: '#/prep' }, 'Prepare the next session'),
    h('a', { class: 'btn', href: '#/call' }, 'Run it'),
    h('a', { class: 'btn', href: '#/goals' }, 'Goals'),
    h('button', { class: 'btn', onClick: () => askSatisfactionThenClose(app, () => { snapshot(app, noteInput.value.trim()); noteInput.value = ''; }) }, 'Close this session')));
  host.appendChild(header);
  const meters = h('div', { class: 'meters' }); host.appendChild(meters);
  const grid = h('div', { class: 'grid grid-2' });
  const left = h('div', { class: 'stack' }); const right = h('div', { class: 'stack' });
  grid.appendChild(left); grid.appendChild(right);
  host.appendChild(grid);
  const shelf = h('section', { class: 'panel shelf-panel' }); host.insertBefore(shelf, grid);
  let tab = 'all'; let sens = null;
  function draw() {
    clear(left); clear(right); clear(meters);
    meters.appendChild(meterRow(app));
    renderShelf(shelf, app, { compact: true, ladder: false });
    getSensitivity(app, r => { if (r !== sens) { sens = r; setTimeout(draw, 0); } }); /* redraw on the next tick, never inside this draw */
    const s = leverage({ record: app.record, fields: app.data.fields, weights: app.data.weights, sensitivity: sens });
    left.appendChild(nextCard(app, s));
    left.appendChild(cheerPanel(app));
    left.appendChild(progressPanel(app));
    left.appendChild(plates(app, s, tab, t => { tab = t; draw(); }));
    right.appendChild(sinceLast(app));
    right.appendChild(variancePanelCompact(app));
    right.appendChild(emailPanel(app, s));
    right.appendChild(sessionsPanel(app));
  }
  draw();
  return { update() { draw(); } };
}

/* Two header meters (MR-048): Picture completeness moves with paperwork, Goal progress moves with real life. */
function meterRow(app) {
  const c = app.result.completeness; const g = goalProgress(app.result); const guesses = app.result.guesses ? app.result.guesses.count : 0;
  const bar = (label, share, text, sub) => h('div', { class: 'meter', role: 'group', 'aria-label': label + (share !== null ? ' ' + Math.round(share * 100) + '%' : ' needs inputs') },
    h('div', { class: 'meter-head' }, h('span', { class: 'meter-label' }, label), h('span', { class: 'meter-value' }, text)),
    h('div', { class: 'meter-track' }, share !== null ? h('div', { class: 'meter-fill', style: { width: Math.round(Math.max(0, Math.min(1, share)) * 100) + '%' } }) : null),
    h('div', { class: 'small muted' }, sub));
  return h('div', { class: 'meter-row' },
    bar('Picture completeness', c ? c.share : null, c && c.share !== null ? Math.round(c.share * 100) + '%' : 'Needs inputs', (c && c.share !== null ? 'of the dollars in the picture are known or verified' : 'No amounts yet') + (guesses ? '. Includes ' + guesses + (guesses === 1 ? ' guess' : ' guesses') : '')),
    bar('Goal progress', g ? g.share : null, g && g.share !== null ? Math.round(g.share * 100) + '%' : 'Needs inputs', g && g.share !== null ? 'of the FI number is invested' + (g.fiAge ? '; FI at ' + g.fiAge : '') + (g.monthlyGap ? '; ' + F.dollarsWhole(g.monthlyGap) + ' a month short of on track' : '') : 'Needs invested balances and spending'));
}

/* A cushion step the pot already covers (MR-052): the card shows in the session that creates it until Got it. */
function cheerPanel(app) {
  const GP = app.result.goalPlan; if (!GP) return h('div');
  const won = celebrations(GP, app.record); if (!won.length) return h('div');
  return h('section', { class: 'panel cheer', role: 'status' }, h('h2', null, 'Already there'), h('p', { class: 'big' }, won.map(i => 'You already have ' + (i.step === 1 ? 'a lean month' : i.step === 2 ? 'a full month' : 'the full cushion') + ' covered.').join(' ')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onClick: () => { const c = Object.assign({}, app.record.goals.celebrated || {}); won.forEach(i => { c[i.id] = new Date().toISOString(); }); app.goals({ celebrated: c }); } }, 'Got it'), h('a', { class: 'btn', href: '#/goals' }, 'Goals')));
}

/* Progress versus paperwork (MR-048): what moved since the last closed session, by why. */
function progressPanel(app) {
  const panel = h('section', { class: 'panel progress-panel' });
  const P = progress(app.record, app.result, app.data.fields);
  panel.appendChild(h('h2', null, 'Progress vs paperwork', P.since ? h('span', { class: 'tag' }, 'since ' + F.dateLocal(P.since)) : h('span', { class: 'tag' }, 'since the start')));
  const total = P.counts.correction + P.counts.move + P.counts.paperwork;
  if (!total) { panel.appendChild(h('p', { class: 'muted small' }, 'Nothing has changed yet.')); return panel; }
  const months = e => e.months === null ? '' : e.months === 0 ? 'FI date unchanged' : Math.abs(e.months) + (Math.abs(e.months) === 1 ? ' month' : ' months') + ' of FI date ' + (e.months < 0 ? 'earlier' : 'later');
  const rows = [
    ['Corrections', P.counts.correction - P.counts.guessReplaced, 'we learned what it really is', months(P.corrections)],
    ['Guesses replaced', P.counts.guessReplaced, 'a guess became a real number', months(P.guessesReplaced)],
    ['Moves', P.counts.move, 'real life changed', months(P.moves)],
    ['Paperwork', P.counts.paperwork, 'confidence only; no number moved', ''],
  ];
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, rows.map(r => h('tr', null, h('td', null, r[0]), h('td', { class: 'num' }, String(r[1])), h('td', { class: 'small muted' }, r[2]), h('td', { class: 'small' }, r[3])))))));
  if (P.plannedMonthly) panel.appendChild(h('p', { class: 'small' }, 'Planned moves (targets): ' + (P.plannedMonthly > 0 ? '+' : '') + F.dollarsWhole(P.plannedMonthly) + ' a month' + (P.planned.months !== null ? ', ' + months(P.planned) : '') + '.'));
  if (P.moveList.length) panel.appendChild(h('ul', { class: 'small move-list' }, P.moveList.slice(0, 5).map(m => h('li', null, h('span', { class: 'chip ' + (m.direction === 'Forward' ? 'state-known' : m.direction === 'Backward' ? 'amber' : 'src') }, m.direction), ' ' + (m.line.rowId === 'sun' ? 'Household' : (Object.values(app.record.planets).flatMap(p => p.rows).find(r => r.id === m.line.rowId) || {}).nickname || m.line.rowId) + ', ' + m.field + (m.deltaMonthly ? ' ' + (m.deltaMonthly > 0 ? '+' : '') + F.dollarsWhole(m.deltaMonthly) + ' a month' : '')))));
  return panel;
}

function variancePanelCompact(app) {
  const panel = h('section', { class: 'panel' });
  panel.appendChild(h('h2', null, 'What you said, what it really is', h('a', { class: 'small', href: '#/call', style: { marginLeft: '8px' } }, 'Open the call')));
  const gut = app.record.anchors && app.record.anchors.gut && Object.keys(app.record.anchors.gut).length;
  if (!gut) { panel.appendChild(h('p', { class: 'muted small' }, 'Nothing to compare yet. The call path asks what they think each area costs before the real lines come in.')); return panel; }
  panel.appendChild(variancePanel(app, { coach: true }));
  const targets = Object.keys(app.record.targets || {}).length;
  if (targets) { panel.appendChild(h('h3', null, 'Your targets')); panel.appendChild(targetsPanel(app, { readOnly: true })); }
  return panel;
}

function itemKey(i) { return i.rowId + '|' + i.field; }
function isDone(app, i) { const plate = i.plate === 'mine' ? app.record.myPlate : app.record.theirPlate; return !!(plate.done && plate.done[itemKey(i)]); }
function markDone(app, i, done) {
  app.mutate(rec => { const plate = i.plate === 'mine' ? rec.myPlate : rec.theirPlate; plate.done = plate.done || {}; if (done) plate.done[itemKey(i)] = new Date().toISOString(); else delete plate.done[itemKey(i)]; if (i.note) { const n = rec.quickNotes.find(x => x.id === i.rowId); if (n) n.filed = done; } }, 'plates');
}
/* "Could cut: could cut per month" reads badly; when the fact label already starts with the row name, show the label alone. */
function factLabel(i) {
  const label = i.label.toLowerCase();
  if (i.row && label.indexOf(i.row.toLowerCase()) === 0) return i.label.charAt(0).toUpperCase() + i.label.slice(1);
  return (i.row ? i.row + ': ' : '') + label;
}
function hrefFor(i) { return i.rowId === 'sun' ? '#/home' : '#/ledger/' + i.planet + '/' + (i.rowType || ''); }
function askLink(app, i, label, primary) {
  const row = i.rowId === 'sun' ? null : Object.values(app.record.planets).flatMap(p => p.rows).find(r => r.id === i.rowId);
  const href = i.rowId === 'sun' ? '#/home' : row ? '#/ledger/' + i.planet + '/' + row.type : '#/home';
  return h('a', { class: primary ? 'btn primary' : 'btn', href, onClick: () => { app.focusAfterRender = { rowId: i.rowId, field: i.field }; } }, label || 'Ask it');
}
function stateChipOf(i) {
  if (i.note) return h('span', { class: 'chip src' }, 'Note');
  if (i.source === 'estimated' || i.source === 'lookup-verify') return h('span', { class: 'chip src src-' + i.source }, i.source === 'estimated' ? 'Guess' : 'Verify');
  return h('span', { class: 'chip state-' + i.state }, STATES[i.state].label);
}

function nextCard(app, s) {
  const panel = h('section', { class: 'panel next-card' });
  panel.appendChild(h('h2', null, 'Next question'));
  if (!s.next.length) { panel.appendChild(h('p', { class: 'muted' }, 'Nothing unsure is left above the materiality line. Open Small wins or the Ledger to add facts.')); return panel; }
  const [big, ...rest] = s.next;
  const stake = i => i.monthsAtStake !== null && i.monthsAtStake !== undefined ? h('span', { class: 'small muted', title: i.why }, 'about ' + monthsWord(i.monthsAtStake) + ' of FI date at stake') : (i.moneyFact && i.dollarsAnnual ? h('span', { class: 'small muted', title: i.why }, F.dollarsWhole(Math.abs(i.dollarsAnnual), { rough: true }) + ' a year at stake') : null);
  panel.appendChild(h('p', { class: 'small muted' }, s.rankedBy === 'ask' ? 'Ranked by ask priority: the months of FI date each unsure figure could move (Level 9).' : 'Ranked by leverage: weight x (1 - confidence) x dollars a year. A FI date switches this to months of FI date at stake.'));
  panel.appendChild(h('div', { class: 'ask big' }, h('div', { class: 'ask-text' }, big.question), h('div', { class: 'ask-meta' }, h('span', { class: 'chip src' }, PLANET_SHORT[big.planet] || 'Household'), stateChipOf(big), stake(big), askLink(app, big, 'Ask it', true)), h('div', { class: 'small muted why' }, big.why || '')));
  rest.forEach(i => panel.appendChild(h('div', { class: 'ask' }, h('div', { class: 'ask-text' }, i.question), h('div', { class: 'ask-meta' }, h('span', { class: 'chip src' }, PLANET_SHORT[i.planet] || 'Household'), stake(i), askLink(app, i, 'Go to row')))));
  return panel;
}

function plates(app, s, tab, setTab) {
  const panel = h('section', { class: 'panel' });
  const tabs = [['all', 'All, ranked', s.circleBack], ['theirs', 'Their plate', s.theirPlate], ['mine', 'My plate', s.myPlate], ['small', 'Small wins', s.smallWins]];
  panel.appendChild(h('h2', null, 'Everything unsure', h('span', { class: 'tag' }, 'one table, ranked by leverage; the tabs filter it')));
  panel.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } }, tabs.map(t => h('button', { class: 'btn small' + (tab === t[0] ? ' primary' : ''), 'aria-pressed': String(tab === t[0]), onClick: () => setTab(t[0]) }, t[1] + ' (' + t[2].filter(i => !isDone(app, i)).length + ')'))));
  const list = tabs.find(t => t[0] === tab)[2];
  if (!list.length) { panel.appendChild(h('p', { class: 'muted small' }, tab === 'theirs' ? 'Nothing for the client to bring.' : tab === 'mine' ? 'Nothing to look up. Quick notes you have not filed land here.' : tab === 'small' ? 'No small items.' : 'Nothing else above the line.')); return panel; }
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data plates' }, h('thead', null, h('tr', null, h('th', null, 'Done'), h('th', null, 'Fact'), h('th', { class: 'hide-narrow' }, 'Where'), h('th', null, 'State'), h('th', { class: 'num' }, 'A year'), h('th', null, ''))),
    h('tbody', null, list.slice(0, 40).map(i => { const done = isDone(app, i); return h('tr', { class: done ? 'muted' : null },
      h('td', null, h('input', { type: 'checkbox', class: 'pick', 'aria-label': 'Mark done: ' + (i.note ? i.label : factLabel(i)), checked: done, onChange: e => markDone(app, i, e.target.checked) })),
      h('td', { class: 'wrap', style: done ? { textDecoration: 'line-through' } : null }, i.note ? i.label : factLabel(i)),
      h('td', { class: 'small muted hide-narrow' }, (PLANET_SHORT[i.planet] || 'Household') + (i.institution ? ', ' + i.institution : '')),
      h('td', null, stateChipOf(i)),
      h('td', { class: 'num' }, i.moneyFact ? F.dollarsWhole(Math.abs(i.dollarsAnnual)) : ''),
      h('td', null, i.note ? '' : askLink(app, i, 'Go', false))); })))));
  return panel;
}

function emailPanel(app, s) {
  const panel = h('section', { class: 'panel' });
  const hasTargets = Object.keys(app.record.targets || {}).length > 0;
  const text = hasTargets ? targetsEmail(app.record, proposals(variance(app.record, actualsOf(app)).rows, app.record, app.result).rows.map(t => Object.assign({}, t, { saved: !!app.record.targets[t.key] })), AREA_LABELS) : followUpEmail(app.record, app.data.fields, s.theirPlate.filter(i => !isDone(app, i)), { nextWin: (nextWins(Object.assign(Object.create(Object.getPrototypeOf(app)), app, { view: 'client' }), 1)[0] || {}).text || null, milestone: ((app.record.celebrations || []).filter(c => !c.seeded).slice(-1)[0] || {}).text || null, action: (overallNextAction(cachedSensitivity(app), app.record, app.result) || {}).sentence || null });
  panel.appendChild(h('h2', null, hasTargets ? 'Targets email' : 'Follow-up email', h('span', { class: 'tag' }, hasTargets ? 'what they said, in their words' : 'by institution')));
  const ta = h('textarea', { class: 'input email', readOnly: true, 'aria-label': 'Follow-up email draft', value: text });
  panel.appendChild(ta);
  panel.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn', onClick: () => { ta.select(); document.execCommand('copy'); app.toast('Email copied'); } }, 'Copy')));
  return panel;
}

function sessionsPanel(app) {
  const panel = h('section', { class: 'panel' });
  const list = app.record.sessions || [];
  panel.appendChild(h('h2', null, 'Sessions', h('span', { class: 'tag' }, list.length + ' closed')));
  if (!list.length) panel.appendChild(h('p', { class: 'muted small' }, 'Closing a session takes a snapshot; the one-pager then shows what changed since.'));
  else panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, list.slice().reverse().map(sn => h('tr', null, h('td', null, sn.label), h('td', { class: 'small muted' }, F.dateLong(sn.at.slice(0, 10))), h('td', { class: 'small' }, sn.note || '')))))));
  return panel;
}

function sinceLast(app) {
  const panel = h('section', { class: 'panel' });
  const r = sinceLastSession(app.record, app.data.fields, changeText);
  panel.appendChild(h('h2', null, 'Since last time', r.since ? h('span', { class: 'tag' }, F.dateLocal(r.since)) : null));
  const moves = app.result.goalPlan && app.record.goals && app.record.goals.lastFinish ? finishChanges(app.record.goals.lastFinish, finishMonths(app.result.goalPlan), app.result.goalPlan.input.items) : [];
  if (!r.changes.length && !moves.length) { panel.appendChild(h('p', { class: 'muted small' }, r.since ? 'No changes since the last session.' : 'No session closed yet.')); return panel; }
  if (moves.length) panel.appendChild(h('p', { class: 'small goal-moves' }, 'Since last time, ' + moves.slice(0, 3).map(m => /^you /.test(m.text) ? m.text : m.text.charAt(0).toLowerCase() + m.text.slice(1)).join('; ') + '.'));
  if (r.changes.length) panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, r.changes.slice(0, 8).map(c => h('tr', null, h('td', { class: 'wrap' }, c.row + ': ' + c.label.toLowerCase()), h('td', { class: 'small muted' }, c.text)))))));
  return panel;
}

/* Level 12 (MR-065): the ten-second satisfaction question sits inside every close; the score is stored on the program before the snapshot is taken */
export function askSatisfactionThenClose(app, onClose) {
  const n = (app.record.sessions || []).length + 1; const key = app.session && /^md-/.test(app.session) ? app.session : 's' + n;
  const cur = (programOf(app.record).satisfaction || []).find(s => s.session === key);
  const body = h('div', { class: 'satisfaction-ask' }, h('h2', null, 'Before we close'), h('p', { class: 'readaloud big' }, 'How satisfied are you with where your money is going right now, one to ten?'),
    h('div', { class: 'row taps stress-scale', role: 'group', 'aria-label': 'Satisfaction, one to ten' }, Array.from({ length: 10 }, (_, k) => h('button', { class: 'btn' + (cur && cur.score === k + 1 ? ' primary' : ''), 'aria-pressed': String(!!(cur && cur.score === k + 1)), onClick: () => { app.mutate(rec => { recordSatisfaction(rec, key, k + 1, { session: key }); }, 'program'); closeOverlay(); onClose(); } }, String(k + 1)))),
    h('p', { class: 'small muted' }, 'One tap closes the session. '), h('button', { class: 'btn quiet', onClick: () => { closeOverlay(); onClose(); } }, 'Skip this time'));
  app.openDrawer(body, { label: 'Satisfaction', title: 'Close this session' });
}

export function snapshot(app, note) {
  const n = (app.record.sessions || []).length + 1;
  const finish = app.result && app.result.goalPlan ? finishMonths(app.result.goalPlan) : null;
  let cheers = [];
  app.mutate(rec => {
    const at = new Date().toISOString();
    rec.sessions.push({ id: 's' + n, label: 'Session ' + n, at, note: note || '' });
    /* Level 12 (MR-063): every metric's value at the close, and any milestone crossed since the last one */
    if (app.result) { const seeded = seedCelebrations(rec, app.result, app.data, { now: at, session: 's' + n }); cheers = seeded.length ? [] : celebrate(rec, app.result, app.data, { now: at, session: 's' + n }); takeSnapshot(rec, app.result, 'session', { now: at, session: 's' + n }); }
    if (finish) { rec.goals = rec.goals || {}; rec.goals.lastFinish = finish; }
    append(rec.journal, { kind: 'session', planet: 'sun', rowId: 'sun', field: null, owner: 'sun', old: null, new: 's' + n, source: 'client', state: 'known', session: 's' + n }, at);
  }, 'sessions');
  app.toast('Session ' + n + ' closed. ' + (cheers.length ? cheers[0].text + '. ' : '') + 'The scoreboard now compares against it.', { label: 'Scoreboard', action: () => { location.hash = '#/scoreboard'; } });
}

function monthsWord(m) { const a = Math.abs(m); return a >= 12 ? (Math.round(a / 12 * 10) / 10) + ' years' : (Math.round(a * 10) / 10) + (a === 1 ? ' month' : ' months'); }
