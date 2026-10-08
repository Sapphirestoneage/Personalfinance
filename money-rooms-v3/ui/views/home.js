/* Home (Level 14, MR-072). Coach view is Today: the next session and when,
   a prep card, one button to start the call, then the client list. Client
   view shows three things: what is safe to spend today, the next win and
   when, and the three steps; then one link each to the scoreboard and the
   one page. The completeness orbit is a small meter with a link; the
   journal lives on the Clients screen. Views never do math. */
import { h, clear } from '../dom.js';
import { clientName } from '../app.js';
import * as F from '../../engine/format.js';
import { PLANETS, PLANET_LABELS } from '../../engine/sun.js';
import { nextWins } from './goals.js';
import { programOf, nextSessionNumber, readiness, homework, programMode } from '../../engine/program.js';
import { sessionCount, sessionDef, planSession, threeSteps } from '../../engine/curriculum.js';
import { renderList, loadDemo } from './clients.js';
import { overallConfidence } from './onepager.js';
import { lowerFirst } from './ledger.js';
import { renderHomeUnlockCard } from '../unlocks.js';
export { parseDateText, parseBirthText } from '../sunpanel.js';

export function mount(host, app) {
  if (app.view === 'client') return mountClient(host, app);
  return mountToday(host, app);
}

/* ---- Coach: Today ---- */
function mountToday(host, app) {
  const today = app.result ? app.result.today : new Date().toISOString().slice(0, 10);
  host.appendChild(h('header', null, h('h1', null, 'Today'), h('span', { class: 'sub' }, F.dateLong(today))));
  const hero = h('div', { class: 'today-hero' }); const below = h('div', { class: 'stack' });
  host.appendChild(hero); host.appendChild(below);
  function draw() {
    clear(hero); clear(below);
    const list = app.store.list();
    if (!app.record) {
      if (!list.length) {
        hero.appendChild(h('section', { class: 'panel today-empty empty-start' }, h('h2', null, 'A new client starts with a call'),
          h('p', { class: 'big' }, 'Start the discovery call and type what you hear. The client, their rough numbers and the first session come out of it.'),
          h('div', { class: 'row', style: { marginTop: '12px' } }, h('a', { class: 'btn primary', href: '#/discovery' }, 'Start the discovery call'), h('button', { class: 'btn', onClick: () => loadDemo(app, 'maya-discovery') }, 'Or look around with Maya'))));
        const panel = h('section', { class: 'panel' }); below.appendChild(panel); renderList(panel, app);
      } else {
        hero.appendChild(h('section', { class: 'panel today-empty' }, h('h2', null, 'No client open'), h('p', { class: 'big' }, 'Open a client to see the next session and start the call.'), h('div', { class: 'row', style: { marginTop: '12px' } }, h('a', { class: 'btn primary', href: '#/clients' }, 'Open a client'), h('a', { class: 'btn', href: '#/discovery' }, 'Start a discovery call'))));
        const panel = h('section', { class: 'panel' }); below.appendChild(panel); renderList(panel, app);
      }
      return;
    }
    const rec = app.record; const R = app.result; const name = clientName(rec) || 'Household';
    const total = sessionCount(app.data); const n = nextSessionNumber(rec); const P = programOf(rec); const maint = programMode(rec) === 'maintenance';
    const def = n <= total ? sessionDef(app.data, n) : null;
    const when = P.nextDate ? F.dateLong(P.nextDate) : null;
    /* the next session, one button */
    hero.appendChild(h('section', { class: 'panel today-card' },
      h('h2', null, maint ? 'Next: the money date' : 'Next session'),
      h('p', { class: 'big' }, name + (maint ? ', a fifteen-minute money date' : n > total ? ', graduated' : ', session ' + n + ' of ' + total) + (when ? ', ' + when : '') + '.'),
      def ? h('p', { class: 'small muted' }, def.name + ': ' + def.goal) : null,
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('a', { class: 'btn primary', href: maint ? '#/money-date' : '#/call' }, 'Start the call'),
        maint ? null : h('a', { class: 'btn', href: '#/prep' }, 'Prepare'),
        h('a', { class: 'btn', href: '#/scoreboard' }, 'Progress'))));
    hero.appendChild(prepCard(app, n, def));
    /* a small meter, not the hero */
    const conf = R ? overallConfidence(R) : 0;
    const weakest = R ? PLANETS.slice().sort((a, b) => score(R, a) - score(R, b))[0] : null;
    below.appendChild(h('section', { class: 'panel' }, h('h2', null, 'The picture'),
      h('div', { class: 'meter-mini', role: 'group', 'aria-label': 'Picture completeness ' + Math.round(conf * 100) + '%' }, h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill', style: { width: Math.round(conf * 100) + '%' } })), h('span', { class: 'small' }, Math.round(conf * 100) + '% in')),
      h('p', { class: 'small', style: { marginTop: '8px' } }, weakest && R.rowCounts[weakest] === 0 ? PLANET_LABELS[weakest] + ' has nothing in it yet. ' : weakest ? lowerFirst(PLANET_LABELS[weakest]).charAt(0).toUpperCase() + lowerFirst(PLANET_LABELS[weakest]).slice(1) + ' is the thinnest part. ' : '', h('a', { href: weakest ? '#/ledger/' + weakest : '#/ledger' }, 'Open the plan'))));
    /* the unlock loop's card (MR-059) stays under the meter while the picture is still filling in */
    if (conf < 0.999) { const unlockCard = h('section', { class: 'panel unlock-card' }); below.appendChild(unlockCard); renderHomeUnlockCard(unlockCard, app); }
    const panel = h('section', { class: 'panel' }); below.appendChild(panel); renderList(panel, app);
  }
  draw();
  return { update() { draw(); } };
}
function score(R, p) { return R.fills[p] === null ? (R.rowCounts[p] ? 2 : -1) : R.fills[p]; }

/* The prep card: the session goal, open loops, homework, what is missing for this session's targets, her words. */
function prepCard(app, n, def) {
  const rec = app.record; const card = h('section', { class: 'panel today-prep' });
  card.appendChild(h('h2', null, 'Bring to the call'));
  if (!def) { card.appendChild(h('p', { class: 'small muted' }, 'The program is complete; the money dates carry on from here.')); return card; }
  const items = [];
  const plan = planSession(rec, app.result, app.data, n);
  const r = readiness(rec, app.result, app.data, n); const hw = homework(rec, app.result, app.data, n);
  const open = plan.parked.slice(0, 2); if (open.length) items.push(h('li', null, h('strong', null, 'Open loops: '), open.map(p => p.text).join('; ') + (plan.parked.length > 2 ? ' and ' + (plan.parked.length - 2) + ' more' : '')));
  if (hw.waiting.length) items.push(h('li', null, h('strong', null, 'Homework still out: '), hw.waiting.map(i => i.name).join(', ')));
  const missing = r.items.filter(i => !i.met).slice(0, 3); if (missing.length) items.push(h('li', null, h('strong', null, 'Still missing for today: '), missing.map(i => i.what).join('; ')));
  const words = (rec.discovery && rec.discovery.words) || []; if (words.length) items.push(h('li', null, h('strong', null, 'In their words: '), h('em', null, words[0])));
  card.appendChild(items.length ? h('ul', { class: 'small' }, items) : h('p', { class: 'small muted' }, 'Nothing is waiting. Open the Prepare screen for the plan of the session.'));
  card.appendChild(h('p', { class: 'small', style: { marginTop: '8px' } }, h('a', { href: '#/prep' }, 'Prepare the session')));
  return card;
}

/* ---- Client: three things ---- */
function mountClient(host, app) {
  const name = (clientName(app.record) || '').split(' ')[0];
  host.appendChild(h('header', null, h('h1', null, name ? 'Hello, ' + name : 'Home')));
  const stack = h('div', { class: 'stack client-home' }); host.appendChild(stack);
  function draw() {
    clear(stack);
    if (!app.record) { stack.appendChild(h('section', { class: 'panel' }, h('p', { class: 'big' }, 'Your coach opens your numbers here.'))); return; }
    const R = app.result; const M = R.metrics || {};
    /* 1. safe to spend today */
    const safe = M.safeToSpend && M.safeToSpend.status === 'ok' ? M.safeToSpend : null;
    stack.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Safe to spend today'),
      safe ? h('p', { class: 'big-number', dataset: { metric: 'safeToSpend' } }, F.dollarsWhole(safe.value.cents)) : h('p', { class: 'big' }, 'Your calendar is not set up yet.'),
      h('p', { class: 'small' }, safe ? (M.lowPoint && M.lowPoint.status === 'ok' ? 'Your tightest day is ' + F.dateShort(M.lowPoint.date) + ', at ' + F.dollarsWhole(M.lowPoint.value.cents) + '. ' : '') : 'It needs a checking balance and a paycheck date. ', h('a', { href: '#/calendar' }, 'See your month'))));
    /* 2. the next win */
    const win = nextWins(app, 1)[0];
    stack.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Your next win'),
      h('p', { class: 'big' }, win ? win.text + '.' : 'Your goals show here once your coach adds them.'),
      h('p', { class: 'small' }, h('a', { href: '#/goals' }, 'See your goals'))));
    /* 3. the three steps */
    const st = stepsFor(app);
    stack.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Your three steps'),
      st.open.length ? h('ol', { class: 'steps' }, st.open.map(o => h('li', null, o.text))) : h('p', { class: 'big' }, 'Nothing to carry right now.')));
    stack.appendChild(h('p', { class: 'small home-links' }, h('a', { href: '#/scoreboard' }, 'Your scoreboard'), ' and ', h('a', { href: '#/onepager' }, 'your one page')));
  }
  draw();
  return { update() { draw(); } };
}
/* The same three steps the call screen closes with, read from the program. */
export function stepsFor(app) {
  const rec = app.record; const P = programOf(rec); const total = sessionCount(app.data); const n = Math.min(total, nextSessionNumber(rec));
  const cands = [];
  const hw = homework(rec, app.result, app.data, n); hw.now.forEach(i => cands.push({ text: i.name + (i.steps ? ': ' + i.steps[0].toLowerCase() : ''), kind: 'homework' }));
  if (P.transactions && P.transactions.foundMoney) cands.unshift({ text: P.transactions.foundMoney.text, kind: 'found' });
  const wins = nextWins(app, 1); if (wins[0]) cands.push({ text: wins[0].text, kind: 'win' });
  if (Object.keys(rec.targets || {}).length) cands.push({ text: 'Keep to your targets this month', kind: 'targets' });
  return threeSteps({ doneToday: [], candidates: cands });
}
