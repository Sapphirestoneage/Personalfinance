/* Running a session (Level 10, MR-053): the slim timeline on top (blocks as
   segments sized by their planned minutes, the current one lit, the clock,
   soft markers), one block at a time below, and the bending the app does on
   its own: protect the close, move the should blocks when behind, offer one
   more when ahead, swap a should block for a deeper dive. Urgent mode, the
   parking lot, the pause, go deeper and the rehearsal clock live in the
   header. The Level 8 stops render inside their blocks. Views never do
   math: engine/curriculum.js bends, engine/program.js writes. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { planSession, planMoneyDate, bend, goDeeper, urgentPlan, threeSteps, sessionCount, CLOSING } from '../../engine/curriculum.js';
import { recordSatisfaction, recordWorthIt, latestWorthIt, isMoneyDateKey, setMonthAction, programMode } from '../../engine/program.js';
import { takeSnapshot, celebrate, seedCelebrations, headlineIds, textOf, personalBests, clientSummary, whyMoved, nextActionFor, overallNextAction } from '../../engine/momentum.js';
import { moneyDateEmail } from '../../engine/email.js';
import { trendLine, nextActionCard, defOf } from '../scorebits.js';
import { metricLabel } from '../glossary.js';
import { cachedSensitivity } from '../levers-bridge.js';
import { AREAS } from '../../engine/anchors.js';
import { AREA_LABELS } from '../../engine/scoremetrics.js';
import { openMetric } from '../metricdrawer.js';
import { programOf, nextSessionNumber, startSession, blockStatus, moveBlock, closeSession, startUrgent, setUrgentNotes, park, parkDone, recordStress, setChecklist, checklistFor, homework, readiness, setNote, captureBaseline, blockKey } from '../../engine/program.js';
import { snapshotValues, beforeAfter, testimonialPrompt, blindGuessTest } from '../../engine/outcomes.js';
import { parseSaid, toMonthly } from '../../engine/parse.js';
import { getAnchor } from '../../engine/anchors.js';
import { roommateOutcome } from '../../engine/scenarios.js';
import { mountStop, householdEditor, householdSentence, variancePanel, targetsPanel } from './call.js';
import { nextWins } from './goals.js';
import { snapshot } from './session.js';
import { renderShelf } from '../shelf.js';
import { clientName, closeOverlay } from '../app.js';

const LEVEL8 = { confirm: 'confirm', gut: 'gut', dream: 'dream', lock: 'actual', reveal: 'reconcile', targets: 'decide' };
const AREA_WORDS = { accommodation: 'your home', utilities: 'phone, internet and subscriptions', food: 'food', transportation: 'getting around', therapy: 'health and therapy', wants: 'fun and wants', irregular: 'the once-a-year things' };

export function mount(host, app) {
  const total = sessionCount(app.data); const C = app.data.curricula;
  /* Level 12 (MR-065): a money date runs through the same runner, keyed by month (md-YYYY-MM); the client never runs it alone */
  const mdKey = isMoneyDateKey(app.route.params.id) ? app.route.params.id : null; const isMd = !!mdKey;
  const n = isMd ? mdKey : (app.route.params.id ? Math.max(1, Math.min(total, parseInt(app.route.params.id, 10) || 1)) : Math.min(total, nextSessionNumber(app.record)));
  const sKey = () => urgentKey || String(n);
  let urgentKey = null; let plan = null; let idx = 0; let note = ''; let offered = null; const added = new Set(); let offsetMin = 0; let paused = null; let pausedMin = 0; let blockStartedAt = Date.now(); let stepsNote = '';
  const started = () => (programOf(app.record).sessions[sKey()] || {}).startedAt;
  const sessId = isMd ? mdKey : 's' + n;
  if (!programOf(app.record).sessions[String(n)] || programOf(app.record).sessions[String(n)].status !== 'running') app.mutate(rec => { startSession(rec, n, { session: sessId }); if (n === 1) captureBaseline(rec, snapshotValues(rec, app.result), {}); }, 'program');
  app.session = sessId;
  const minute = () => { const s = started(); if (!s) return 0; const live = (Date.now() - Date.parse(s)) / 60000; return Math.max(0, Math.round((live + offsetMin - pausedMin - (paused ? (Date.now() - paused) / 60000 : 0)) * 10) / 10); };
  const doneIds = () => Object.keys((programOf(app.record).sessions[sKey()] || { blocks: {} }).blocks || {}).filter(k => (programOf(app.record).sessions[sKey()].blocks[k] || {}).status === 'done').map(k => k.split(':')[1]);
  const state = () => ({ current: plan.blocks[idx] ? plan.blocks[idx].id : null, done: doneIds(), started: plan.blocks.slice(0, idx + 1).map(b => b.id) });

  const header = h('header', null, h('h1', null, isMd ? 'Money date, ' + F.date(mdKey.slice(3) + '-01') : 'Session ' + n), h('span', { class: 'sub' }), h('div', { class: 'actions' }));
  const tl = h('nav', { class: 'runner-tl', 'aria-label': 'Today' }); const noteLine = h('p', { class: 'runner-note small', role: 'status' }); const body = h('section', { class: 'panel call-body run-body' }); const foot = h('div', { class: 'row runner-foot' });
  host.appendChild(header); host.appendChild(tl); host.appendChild(noteLine); host.appendChild(body); host.appendChild(foot);
  const gentle = () => (app.record.sessionMode || 'standard') === 'gentle';
  const money = c => F.dollarsWhole(c);

  function rebuild() { plan = isMd ? planMoneyDate(app.record, app.result, app.data, mdKey) : planSession(app.record, app.result, app.data, n); if (plan && !plan.goal) plan.goal = plan.def ? plan.def.goal : ''; if (urgentKey) { const u = urgentPlan(plan, app.data, programOf(app.record).sessions[urgentKey].urgent.kind); plan.blocks = u.blocks; } plan.blocks = plan.blocks.filter(b => b.status !== 'moved' && (b.status !== 'skipped' || added.has(b.id))); }
  function drawHeader() {
    const sub = header.querySelector('.sub'); sub.textContent = plan.goal;
    const acts = header.querySelector('.actions'); clear(acts);
    acts.appendChild(h('button', { class: 'btn small', 'aria-label': 'Park something for next time', onClick: parkSomething }, 'Park it'));
    acts.appendChild(h('button', { class: 'btn small', 'aria-pressed': String(!!paused), onClick: () => { if (paused) { pausedMin += (Date.now() - paused) / 60000; paused = null; } else paused = Date.now(); draw(); } }, paused ? 'Resume' : 'Pause'));
    const cur = plan.blocks[idx];
    if (cur && !CLOSING.includes(cur.id) && !urgentKey && !isMd) acts.appendChild(h('button', { class: 'btn small', onClick: deeper }, 'Go deeper here'));
    acts.appendChild(h('span', { class: 'view-toggle', role: 'group', 'aria-label': 'Rehearsal clock' }, h('button', { title: 'Rehearsal: move the clock five minutes', 'aria-label': 'Rehearsal: five minutes on', onClick: () => { offsetMin += 5; tick(); } }, '+5 min')));
    acts.appendChild(h('a', { class: 'btn small', href: isMd ? '#/money-date' : '#/prep/' + n }, 'Prep'));
  }
  function drawTimeline() {
    clear(tl); const m = minute(); const blocks = plan.blocks; const tot = blocks.reduce((s, b) => s + b.minutes.target, 0) || 1;
    const bar = h('div', { class: 'tl-bar' });
    blocks.forEach((b, k) => { const done = doneIds().includes(b.id); bar.appendChild(h('div', { class: 'tl-seg' + (k === idx ? ' current' : '') + (done ? ' done' : '') + ' prio-' + b.priority, style: { flex: String(b.minutes.target) }, title: b.name + ', about ' + b.minutes.target + ' minutes', onClick: () => { idx = k; blockStartedAt = Date.now(); draw(); } }, h('span', { class: 'tl-num' }, String(k + 1)), h('span', { class: 'tl-name' }, b.name))); });
    /* MR-057: a name that does not fit its segment is never cut short; the segment shows its number and the legend below carries the names */
    const legend = h('ol', { class: 'tl-legend small muted', style: { display: 'none' } }, blocks.map((b, k) => h('li', { class: k === idx ? 'current' : null }, b.name)));
    requestAnimationFrame(() => { let tight = false; bar.querySelectorAll('.tl-seg').forEach(seg => { const nm = seg.querySelector('.tl-name'); if (nm && (nm.offsetWidth === 0 || nm.scrollWidth > nm.clientWidth + 1)) { seg.classList.add('tight'); tight = true; } }); legend.style.display = tight ? '' : 'none'; });
    const pct = v => Math.min(100, v / Math.max(tot, plan.markers.closeAt + 7) * 100) + '%';
    const marks = h('div', { class: 'tl-marks' }, h('span', { class: 'tl-mark', style: { left: pct(plan.markers.behindAt) }, title: 'Minute ' + plan.markers.behindAt }), h('span', { class: 'tl-mark close', style: { left: pct(plan.markers.closeAt) }, title: 'Minute ' + plan.markers.closeAt }), h('span', { class: 'tl-now', style: { left: pct(m) } }));
    tl.appendChild(h('div', { class: 'tl-head row' }, h('span', { class: 'tl-clock', 'aria-live': 'polite' }, 'Minute ' + Math.floor(m) + (paused ? ', paused' : '')), h('span', { class: 'small muted' }, 'Part ' + (idx + 1) + ' of ' + blocks.length + ': ' + (blocks[idx] ? blocks[idx].name : ''))));
    tl.appendChild(bar); tl.appendChild(marks); tl.appendChild(legend);
  }
  function applyBend() {
    if (!plan.blocks[idx]) return;
    const m = minute(); const b = bend(plan, state(), m, { words: C.words, record: app.record });
    if (b.action === 'none') return;
    if (b.moved.length) { app.mutate(rec => { b.moved.forEach(mv => { moveBlock(rec, n, mv.id, mv.to, mv.reason, { session: 's' + n }); blockStatus(rec, n, mv.key || blockKey(n, mv.id), 'moved', null, { session: 's' + n }); }); }, 'program'); note = b.note; const curId = plan.blocks[idx].id; rebuild(); idx = Math.max(0, plan.blocks.findIndex(x => x.id === curId)); }
    if (b.action === 'protect') { note = b.note; idx = plan.blocks.findIndex(x => x.id === 'steps'); blockStartedAt = Date.now(); }
    if (b.action === 'ahead') { offered = b.offer; note = b.note; }
  }
  function tick() { applyBend(); drawTimeline(); noteLine.textContent = note; if (offered && plan.blocks[idx] && plan.blocks[idx].id !== offered) drawOffer(); }
  function drawOffer() { const b = plan.blocks.find(x => x.id === offered); if (!b || noteLine.querySelector('button')) return; noteLine.appendChild(h('button', { class: 'btn small', style: { marginLeft: '8px' }, onClick: () => { added.add(b.id); idx = plan.blocks.indexOf(b); offered = null; note = ''; blockStartedAt = Date.now(); draw(); } }, 'Add ' + b.name)); }
  function deeper() { const r = goDeeper(plan, state(), plan.blocks[idx].id, C.words); if (r.moved.length) app.mutate(rec => { r.moved.forEach(mv => { moveBlock(rec, n, mv.id, mv.to, 'deeper', { session: 's' + n }); blockStatus(rec, n, mv.key, 'moved', null, { session: 's' + n }); }); }, 'program'); note = r.note; const curId = plan.blocks[idx].id; rebuild(); idx = plan.blocks.findIndex(x => x.id === curId); draw(); }
  function parkSomething() {
    const input = h('input', { class: 'input wide', 'aria-label': 'What to park' }); const save = () => { if (!input.value.trim()) return; app.mutate(rec => { park(rec, input.value.trim(), '#/' + app.route.name, { session: 's' + n }); }, 'program'); closeOverlay(); app.toast('Parked for next time'); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    app.openDrawer(h('div', null, h('h2', null, 'Park it for next time'), input, h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onClick: save }, 'Park'), h('button', { class: 'btn', onClick: closeOverlay }, 'Cancel'))), { label: 'Park it' });
    setTimeout(() => input.focus(), 0);
  }
  function advance(status) {
    const b = plan.blocks[idx]; if (!b) return;
    const mins = Math.round((Date.now() - blockStartedAt) / 6000) / 10 + (offsetMin ? 0 : 0);
    app.mutate(rec => { blockStatus(rec, urgentKey || n, b.key || blockKey(n, b.id), status || 'done', mins, { session: 's' + n }); }, 'program');
    /* could blocks are offered when there is room, never walked into */
    if (idx < plan.blocks.length - 1) { idx++; while (idx < plan.blocks.length - 1 && plan.blocks[idx].priority === 'could' && !added.has(plan.blocks[idx].id)) { const c = plan.blocks[idx]; app.mutate(rec => { blockStatus(rec, urgentKey || n, c.key || blockKey(n, c.id), 'skipped', null, { session: 's' + n }); }, 'program'); idx++; } blockStartedAt = Date.now(); }
    offered = null; note = ''; draw();
  }
  const say = text => h('p', { class: 'readaloud big' }, text);
  const nextBtn = (label) => h('button', { class: 'btn primary', onClick: () => advance('done') }, label || 'Next');
  const skipBtn = () => h('button', { class: 'btn', onClick: () => advance('skipped') }, 'Not today');

  function draw() {
    rebuild(); drawHeader(); drawTimeline(); noteLine.textContent = note; clear(body); clear(foot);
    const b = plan.blocks[idx]; if (!b) { body.appendChild(h('p', null, 'Nothing left today.')); return; }
    body.appendChild(h('h2', null, b.name, h('span', { class: 'tag' }, 'about ' + b.minutes.target + ' minutes')));
    const kind = b.kind || 'field';
    if (LEVEL8[kind]) { const sub = h('div'); body.appendChild(sub); mountStop(sub, app, LEVEL8[kind], () => advance('done')); foot.appendChild(nextBtn('Done with this part')); foot.appendChild(skipBtn()); return; }
    ({ checkin: drawCheckin, loops: drawLoops, plan: drawPlan, housing: drawHousing, debtcheck: drawDebt, checklist: drawChecklist, picture: drawPicture, card: drawCard, stress: drawStress, steps: drawSteps, close: drawClose, worthit: drawWorthIt, refresh: drawRefresh, changed: drawChanged, milestones: drawMilestones, satisfaction: drawSatisfaction, action: drawAction, mdclose: drawMdClose, transactions: drawTransactions, variance: drawVariance, blind: drawBlind, scorecard: drawScorecard, testimonial: drawTestimonial, urgent: drawUrgent, absorbed: drawAbsorbed, goals: drawRoom, room: drawRoom, lens: drawLens }[kind] || drawField)(b);
  }

  /* ---- blocks ---- */
  function drawCheckin(b) {
    body.appendChild(say(b.questions[0].text));
    body.appendChild(h('p', { class: 'small muted' }, 'If something is on fire, tap it and today becomes about that.'));
    body.appendChild(h('div', { class: 'chipbar', role: 'group', 'aria-label': 'Anything urgent' }, C.urgentKinds.map(([id, label]) => h('button', { class: 'chip toggle', onClick: () => goUrgent(id) }, label))));
    foot.appendChild(nextBtn('All clear, on we go'));
  }
  function goUrgent(kind) {
    app.mutate(rec => { startUrgent(rec, kind, '', false, { session: 's' + n }); }, 'program');
    const P = programOf(app.record); urgentKey = 'u' + P.urgentCount;
    const u = urgentPlan(plan, app.data, kind);
    app.mutate(rec => { u.moved.forEach(mv => moveBlock(rec, n, mv.id, mv.to, 'urgent', { session: 's' + n })); }, 'program');
    note = u.note; idx = 1; blockStartedAt = Date.now(); draw();
  }
  function drawUrgent(b) {
    const u = programOf(app.record).sessions[urgentKey].urgent;
    body.appendChild(say(b.questions[0].text));
    const ta = h('textarea', { class: 'input wide', 'aria-label': 'Notes on the urgent thing', value: u.notes || '', onChange: e => app.mutate(rec => { setUrgentNotes(rec, urgentKey, e.target.value, { session: 's' + n }); }, 'program') });
    body.appendChild(ta);
    body.appendChild(h('p', { class: 'small muted' }, 'Open the room that fits: ', h('a', { href: '#/ledger/debt' }, 'Debts'), ', ', h('a', { href: '#/ledger/safety' }, 'Safety net'), ', ', h('a', { href: '#/ledger/spending' }, 'Spending'), ', ', h('a', { href: '#/goals' }, 'Goals'), '.'));
    foot.appendChild(nextBtn());
  }
  function drawLoops(b) {
    body.appendChild(say(b.questions[0].text));
    const parked = plan.parked;
    if (parked.length) body.appendChild(h('ul', { class: 'disc-list' }, parked.map(p => h('li', null, h('label', null, h('input', { type: 'checkbox', 'aria-label': 'Done: ' + p.text, onChange: () => app.mutate(rec => { parkDone(rec, p.id, true, { session: 's' + n }); }, 'program') }), ' ' + p.text)))));
    const hw = checklistFor(app.record, app.result, app.data, n).filter(i => i.who === 'homework' && !i.finished && i.session < n);
    if (hw.length) body.appendChild(h('div', null, h('h3', null, 'Homework'), hw.map(i => checklistCard(i, true))));
    if (!parked.length && !hw.length) body.appendChild(h('p', { class: 'muted small' }, 'Nothing open from last time.'));
    foot.appendChild(nextBtn());
  }
  function drawPlan() {
    body.appendChild(say(plan.goal));
    body.appendChild(h('ol', { class: 'plan-list' }, plan.blocks.filter(x => !['checkin', 'loops', 'plan'].includes(x.id)).map(x => h('li', null, x.name))));
    foot.appendChild(nextBtn("Let's go"));
  }
  function drawHousing(b) {
    body.appendChild(say(householdSentence(app.record.household) + ' Still right?'));
    body.appendChild(householdEditor(app));
    body.appendChild(say(b.questions[0].text));
    body.appendChild(saidInput('Rent, their words', p => { const people = 1 + (app.record.household.roommates || []).length; const monthly = toMonthly(p.cents, p.cadence, p.payFrequency); const share = p.isShare || (p.split && p.share !== null) ? toMonthly(p.share, p.cadence, p.payFrequency) : (app.record.household.roommates.length ? Math.round(monthly / people) : monthly); if (getAnchor(app.record, 'gut', 'spending:accommodation')) app.reanchor('gut', 'spending:accommodation', share, { shared: people > 1 }); else app.anchor('gut', 'spending:accommodation', share, { shared: people > 1 }); app.toast('Rent noted: ' + money(share) + ' a month, your part'); }));
    body.appendChild(say(b.questions[2].text));
    body.appendChild(h('div', { class: 'row taps' }, [['car', 'A car'], ['nocar', 'No car']].map(([v, l]) => h('button', { class: 'btn', 'aria-pressed': String((programOf(app.record).notes.car || '') === v), onClick: () => app.mutate(rec => { setNote(rec, 'car', v, { session: 's' + n }); }, 'program') }, l))));
    foot.appendChild(nextBtn());
  }
  function saidInput(label, onAnswer, opts) {
    const o = opts || {}; const input = h('input', { class: 'input wide big', type: 'text', 'aria-label': label, title: 'Type it the way they say it: 1900 every two weeks, like 100 a week, 2,500ish, my half is 1,650' }); const heard = h('div', { class: 'small muted heard' });
    input.addEventListener('input', () => { const p = parseSaid(input.value, { defaultCadence: o.defaultCadence || 'month' }); heard.textContent = !input.value ? '' : !p ? '' : p.unknown ? 'Unknown' : p.none ? 'None' : money(toMonthly(p.cents, p.cadence, p.payFrequency)) + ' a month' + (p.state === 'rough' ? ', rough' : ''); });
    const go = () => { const p = parseSaid(input.value, { defaultCadence: o.defaultCadence || 'month' }); if (!p || p.unknown) { if (o.onUnknown) o.onUnknown(); return; } onAnswer(p); input.value = ''; heard.textContent = 'Saved'; };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    return h('div', { class: 'answer' }, input, heard, h('div', { class: 'row taps' }, h('button', { class: 'btn primary', onClick: go }, 'Save'), h('button', { class: 'btn', onClick: () => { if (o.onUnknown) o.onUnknown(); else app.toast('Noted as unknown'); } }, "I don't know")));
  }
  function drawDebt(b) {
    b.questions.forEach(q => { body.appendChild(say(q.text)); const key = q.fills.replace('anchor.', ''); body.appendChild(saidInput(q.text, p => { const v = p.none ? 0 : (key === 'debt:total' ? p.cents : toMonthly(p.cents, p.cadence, p.payFrequency)); if (getAnchor(app.record, 'gut', key)) app.reanchor('gut', key, v, {}); else app.anchor('gut', key, v, {}); app.toast('Noted'); }, { defaultCadence: key === 'debt:total' ? 'oneoff' : 'month' })); });
    body.appendChild(h('p', { class: 'small muted' }, 'A range is fine; the real balances come from the statements in session 2. ', h('a', { href: '#/ledger/debt' }, 'Open Debts')));
    foot.appendChild(nextBtn());
  }
  function checklistCard(i, compact) {
    const CL = app.data.accountsChecklist; const st = i.state;
    const card = h('div', { class: 'panel checklist-card' + (i.finished ? ' finished' : ''), dataset: { item: i.id } }, h('h3', null, i.name, i.rolled ? h('span', { class: 'tag' }, 'from session ' + i.session) : null));
    if (!compact) {
      card.appendChild(h('p', { class: 'readaloud' }, i.id === 'card' && i.variant ? (i.variant.variant === 'balanceTransfer' ? i.variants.balanceTransfer.replace('{apr}', F.percent(i.variant.apr, { places: 0 })) : i.variants[i.variant.variant]) : i.copy));
      if (i.screenShare) card.appendChild(h('p', { class: 'small callout' }, 'Stop sharing your screen while you log in. ' + (gentle() && i.gentle ? i.gentle : '')));
      if (i.info === 'order') card.appendChild(h('p', { class: 'small muted' }, CL.orderInfo));
      if (i.steps) card.appendChild(h('ol', { class: 'small' }, i.steps.map(s => h('li', null, s))));
      if (i.bucketsFromGoals) { const wins = nextWins(app, 6); const GP = app.result.goalPlan; card.appendChild(h('p', { class: 'small' }, h('strong', null, 'Buckets, in your words: '), (GP ? GP.input.items.filter(x => typeof x.step === 'number').map(x => x.clientName + (GP.assessment[x.id] && GP.assessment[x.id].status === 'done' ? ' (covered already)' : '')) : []).concat(wins.filter(w => !/cushion|month/i.test(w.name)).map(w => w.name)).join('; '))); }
    }
    card.appendChild(h('div', { class: 'row' }, h('div', { class: 'view-toggle wrap', role: 'group', 'aria-label': 'Status of ' + i.name }, CL.statuses.filter(s => i.id === 'rocket' || s[0] !== 'linked').map(([v, l]) => h('button', { 'aria-pressed': String(st.status === v), onClick: () => app.mutate(rec => { setChecklist(rec, i.id, { status: v }, { session: n }); }, 'program') }, l))),
      h('div', { class: 'view-toggle wrap', role: 'group', 'aria-label': 'Who does ' + i.name }, CL.who.map(([v, l]) => h('button', { 'aria-pressed': String(i.who === v), onClick: () => app.mutate(rec => { setChecklist(rec, i.id, { who: v }, { session: n }); }, 'program') }, l)))));
    if (!compact) card.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, h('input', { class: 'input', 'aria-label': 'Provider note for ' + i.name, title: 'Your note, for this client only', value: st.provider || '', onChange: e => app.mutate(rec => { setChecklist(rec, i.id, { provider: e.target.value.trim() }, { session: n }); }, 'program') }), h('input', { class: 'input wide', 'aria-label': 'Notes for ' + i.name, value: st.notes || '', onChange: e => app.mutate(rec => { setChecklist(rec, i.id, { notes: e.target.value.trim() }, { session: n }); }, 'program') })));
    return card;
  }
  function drawChecklist(b) {
    const list = checklistFor(app.record, app.result, app.data, n).filter(i => !b.uses || b.uses.includes(i.id) || (i.rolled && b.id === 'accounts2') || (i.optional && b.id === 'accounts2' && i.session <= n));
    if (!list.length) body.appendChild(h('p', { class: 'muted' }, 'Nothing to open here today.'));
    list.forEach(i => body.appendChild(checklistCard(i, false)));
    const hw = homework(app.record, app.result, app.data, n);
    if (hw.now.length) body.appendChild(h('p', { class: 'small muted' }, 'Homework this session: ' + hw.now.map(i => i.name).join(', ') + (hw.waiting.length ? '. Waiting: ' + hw.waiting.map(i => i.name).join(', ') : '') + '.'));
    foot.appendChild(nextBtn()); foot.appendChild(skipBtn());
  }
  function drawPicture() { const shelf = h('section', { class: 'shelf-panel' }); renderShelf(shelf, app, { compact: true, ladder: false }); body.appendChild(shelf); body.appendChild(h('p', { class: 'small muted' }, 'Rough, with guesses where she has not given a number yet.')); foot.appendChild(nextBtn()); }
  function drawCard() { const o = roommateOutcome(app.result, { answers: { monthsToReplace: app.result.asm.roommateMonthsToReplace || 2, oneTime: 0, keepAlone: 0, yearsAlone: 30 } }, app.data.scenarioBlocks.types.roommate); body.appendChild(o && !o.needs ? h('div', { class: 'fallsonyou-card' }, h('h3', null, 'If it all falls on you'), h('p', { class: 'big' }, 'The shared bills go from ' + money(o.newSharedMonthly - o.jumpMonthly) + ' to ' + money(o.newSharedMonthly) + ' a month; ' + o.months + ' months to find someone takes about ' + money(o.bridge) + '.'), h('p', { class: 'small muted' }, o.leaseNote)) : h('p', { class: 'muted' }, 'Needs a shared bill first.')); foot.appendChild(nextBtn()); }
  function drawStress(b) {
    body.appendChild(say(b.questions[0].text));
    const cur = (programOf(app.record).stress.find(s => s.session === n) || {}).score;
    body.appendChild(h('div', { class: 'row taps stress-scale', role: 'group', 'aria-label': 'Stress, one to ten' }, Array.from({ length: 10 }, (_, k) => h('button', { class: 'btn' + (cur === k + 1 ? ' primary' : ''), 'aria-pressed': String(cur === k + 1), onClick: () => { app.mutate(rec => { recordStress(rec, n, k + 1, { session: 's' + n }); }, 'program'); draw(); } }, String(k + 1)))));
    const prev = programOf(app.record).stress.filter(s => s.session !== n);
    if (prev.length) body.appendChild(h('p', { class: 'small muted' }, 'Before: ' + prev.map(s => (s.session === 'discovery' ? 'first call' : 'session ' + s.session) + ' ' + s.score).join(', ')));
    foot.appendChild(nextBtn());
  }
  function drawSteps() {
    const P = programOf(app.record); const s = P.sessions[sKey()] || { blocks: {} };
    const doneToday = []; const CL = app.data.accountsChecklist.items;
    Object.keys(P.checklist).forEach(id => { const c = P.checklist[id]; const it = CL.find(x => x.id === id); if (it && c.session === n && ['opened', 'linked', 'done'].includes(c.status)) doneToday.push({ text: c.status === 'linked' ? 'Linked your accounts' : (c.status === 'opened' ? 'Opened ' : 'Finished ') + it.name.toLowerCase() }); });
    if (P.stress.some(x => x.session === n)) doneToday.push({ text: 'Said how money feels right now' });
    const cands = [];
    const hw = homework(app.record, app.result, app.data, n); hw.now.forEach(i => cands.push({ text: i.name + (i.steps ? ': ' + i.steps[0].toLowerCase() : ''), kind: 'homework' }));
    if (P.transactions && P.transactions.foundMoney && n === 4) cands.unshift({ text: P.transactions.foundMoney.text, kind: 'found' });
    const wins = nextWins(app, 1); if (wins[0]) cands.push({ text: wins[0].text, kind: 'win' });
    const T = Object.keys(app.record.targets || {}); if (T.length) cands.push({ text: 'Keep to your targets this month', kind: 'targets' });
    const st = threeSteps({ doneToday, candidates: cands });
    if (st.done.length) body.appendChild(h('p', { class: 'readaloud big' }, st.text));
    body.appendChild(h('h3', null, st.open.length ? 'Three steps' : 'Nothing to carry'));
    body.appendChild(h('ol', { class: 'steps-list' }, st.done.map(d => h('li', { class: 'done' }, d.text, h('span', { class: 'chip state-known' }, 'Done'))).concat(st.open.map(o => h('li', null, o.text)))));
    stepsNote = st.open.map(o => o.text).join('; ');
    foot.appendChild(nextBtn('On to booking'));
  }
  function drawClose(b) {
    const P = programOf(app.record); const r = readiness(app.record, app.result, app.data, n);
    const satQ = b.questions.find(q => q.fills === 'program.satisfaction'); if (satQ) satisfactionScale(satQ.text);
    body.appendChild(say((b.questions.find(q => q.fills === 'program.nextDate') || b.questions[0]).text));
    const date = h('input', { class: 'input', type: 'date', 'aria-label': 'Next session date', value: P.nextDate || '' });
    const noteIn = h('input', { class: 'input wide', 'aria-label': 'Session note', value: '' });
    body.appendChild(h('div', { class: 'row' }, h('label', { class: 'small' }, 'Next time'), date, h('label', { class: 'small' }, 'Note'), noteIn));
    body.appendChild(h('p', { class: 'small readiness-line' }, r.text + (r.missing.length ? '; still open: ' + r.missing.join(', ') : '')));
    if (r.missing.length) body.appendChild(h('p', { class: 'small muted' }, 'What is still open rolls into the next session on its own.'));
    foot.appendChild(h('button', { class: 'btn primary', onClick: () => {
      const key = sKey(); const cur = plan.blocks[idx];
      app.mutate(rec => { blockStatus(rec, key, cur.key || blockKey(n, cur.id), 'done', Math.round((Date.now() - blockStartedAt) / 6000) / 10, { session: 's' + n }); closeSession(rec, key, { nextDate: date.value || null, note: noteIn.value.trim(), readiness: { met: r.met, total: r.total } }, { session: 's' + n }); }, 'program');
      snapshot(app, (noteIn.value.trim() ? noteIn.value.trim() + '. ' : '') + (stepsNote ? 'Steps: ' + stepsNote : ''));
      app.session = null; location.hash = '#/session';
    } }, 'Close the session'));
    foot.appendChild(h('a', { class: 'btn', href: '#/session' }, 'Follow-up email'));
  }
  function drawTransactions(b) {
    const T = programOf(app.record).transactions;
    body.appendChild(say(b.questions[0] ? b.questions[0].text : b.outputs[0]));
    body.appendChild(T ? h('p', { class: 'small' }, T.count + ' transactions over ' + Math.round(T.spanDays / 7) + ' weeks are in. ' + (T.foundMoney ? 'Found money: ' + T.foundMoney.text + '.' : '')) : h('p', { class: 'muted small' }, 'No export yet.'));
    body.appendChild(h('p', null, h('a', { class: 'btn primary', href: '#/transactions' }, 'Open the transactions')));
    foot.appendChild(nextBtn()); foot.appendChild(skipBtn());
  }
  function drawVariance() { body.appendChild(variancePanel(app, { coach: true })); foot.appendChild(nextBtn()); }
  function drawBlind(b) {
    const areas = Object.keys(AREA_WORDS); const blind = (app.record.anchors && app.record.anchors.blind) || {};
    const open = areas.filter(a => !blind['spending:' + a]);
    if (open.length) { const a = open[0]; body.appendChild(h('div', { class: 'small muted qcount' }, 'Area ' + (areas.length - open.length + 1) + ' of ' + areas.length)); body.appendChild(say(b.questions[0].text.replace('{area}', AREA_WORDS[a]))); body.appendChild(saidInput('Blind guess for ' + AREA_WORDS[a], p => { app.anchor('blind', 'spending:' + a, p.none ? 0 : toMonthly(p.cents, p.cadence, p.payFrequency), {}); draw(); }, { onUnknown: () => { app.anchor('blind', 'spending:' + a, 0, { note: 'did not know' }); draw(); } })); return; }
    const T = programOf(app.record).transactions; const t = blindGuessTest(app.record, (T && T.monthly) || {});
    if (t) { body.appendChild(h('p', { class: 'big' }, t.blindSpotPct !== null ? Math.round(t.blindSpotPct * 100) + '% of what goes out was not in your guess' + (t.blindSpotS4 !== null ? ', down from ' + Math.round(t.blindSpotS4 * 100) + '% in session 4' : '') + '.' : 'No actuals to compare yet.')); body.appendChild(h('p', { class: 'small' }, t.closer + ' of ' + t.of + ' areas are closer than in session 4.')); app.mutate(rec => { const P = programOf(rec); if (!P.blindSpot.s9 || P.blindSpot.s9.pct !== t.blindSpotPct) { P.blindSpot.s9 = { pct: t.blindSpotPct, at: new Date().toISOString() }; rec.program = P; } }, 'program'); }
    foot.appendChild(nextBtn());
  }
  function drawScorecard() { const rows = beforeAfter(app.record, app.result, { money: c => money(c), date: d => F.date(d) }); body.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'First call'), h('th', { class: 'num' }, 'Now'))), h('tbody', null, rows.map(r => h('tr', null, h('td', { class: 'wrap' }, r.label), h('td', { class: 'num' }, r.beforeText), h('td', { class: 'num' }, r.nowText))))))); body.appendChild(h('p', null, h('a', { class: 'btn', href: '#/program' }, 'Print it'))); foot.appendChild(nextBtn()); }
  function drawTestimonial(b) { const t = testimonialPrompt(app.record, app.result, (clientName(app.record) || 'you').split(' ')[0]); body.appendChild(say(t.ask)); body.appendChild(h('textarea', { class: 'input wide', 'aria-label': 'Her words', value: programOf(app.record).testimonial || '', onChange: e => app.mutate(rec => { const P = programOf(rec); P.testimonial = e.target.value; rec.program = P; }, 'program') })); foot.appendChild(nextBtn()); foot.appendChild(skipBtn()); }
  function drawAbsorbed() { const abs = programOf(app.record).flexAbsorbed; body.appendChild(abs.length ? h('ul', null, abs.map(a => h('li', null, (app.data.curricula.sessions.flatMap(s => s.blocks).find(x => x.id === a.blockId) || { name: a.blockId }).name + ' (from session ' + a.from + ')'))) : h('p', { class: 'muted' }, 'Nothing was moved here.')); foot.appendChild(nextBtn()); }
  function drawRoom(b) { body.appendChild(say(b.outputs[0])); if (b.room) body.appendChild(h('p', null, h('a', { class: 'btn primary', href: b.room }, 'Open it'))); if (b.questions.length) drawQuestions(b); foot.appendChild(nextBtn()); }
  function drawLens(b) { const id = (b.uses || [])[0]; const lens = (app.result.lenses || []).find(l => l.id === id); body.appendChild(lens ? h('div', null, h('p', { class: 'big' }, lens.text), lens.reading ? h('p', { class: 'small muted' }, 'Read: ' + lens.reading.title) : null) : h('p', { class: 'muted' }, 'This reading does not apply today.')); foot.appendChild(nextBtn()); }
  /* Level 12 (MR-065): the satisfaction scale, the worth-it grid, and the money date's own blocks */
  function satisfactionScale(text) {
    const cur = (programOf(app.record).satisfaction || []).find(s => s.session === sessId);
    body.appendChild(say(text));
    body.appendChild(h('div', { class: 'row taps stress-scale satisfaction-scale', role: 'group', 'aria-label': 'Satisfaction, one to ten' }, Array.from({ length: 10 }, (_, k) => h('button', { class: 'btn' + (cur && cur.score === k + 1 ? ' primary' : ''), 'aria-pressed': String(!!(cur && cur.score === k + 1)), onClick: () => { app.mutate(rec => { recordSatisfaction(rec, sessId, k + 1, { session: sessId }); }, 'program'); draw(); } }, String(k + 1)))));
    const prev = (programOf(app.record).satisfaction || []).filter(s => s.session !== sessId).slice(-3);
    if (prev.length) body.appendChild(h('p', { class: 'small muted' }, 'Before: ' + prev.map(s => (/^md-/.test(String(s.session)) ? 'money date ' + String(s.session).slice(3) : 'session ' + String(s.session).replace(/^s/, '')) + ' ' + s.score).join(', ')));
  }
  function worthItGrid(text, into) {
    const host = into || body;
    if (text) host.appendChild(say(text));
    const S = app.result.sun && app.result.sun.outputs; const by = S && S.spending.byCategory ? S.spending.byCategory : {}; const latest = latestWorthIt(app.record);
    const scores = {}; AREAS.forEach(a => { if (latest[a] && latest[a].session === sessId) scores[a] = latest[a].score; });
    const table = h('table', { class: 'data worthit-grid' }, h('tbody', null, AREAS.filter(a => by[a] && by[a].status === 'ok' && by[a].cents > 0).map(a => h('tr', null, h('td', null, AREA_LABELS[a] || a, h('span', { class: 'small muted' }, ' ' + F.dollarsWhole(by[a].cents) + ' a month')), h('td', null, h('div', { class: 'row taps worthit-scale', role: 'group', 'aria-label': 'Worth it: ' + (AREA_LABELS[a] || a) }, Array.from({ length: 10 }, (_, k) => h('button', { class: 'btn small' + (scores[a] === k + 1 ? ' primary' : ''), 'aria-pressed': String(scores[a] === k + 1), onClick: () => { scores[a] = k + 1; app.mutate(rec => { recordWorthIt(rec, sessId, scores, { session: sessId }); }, 'program'); draw(); } }, String(k + 1)))))))));
    host.appendChild(h('div', { class: 'tablewrap' }, table));
    host.appendChild(h('p', { class: 'small muted' }, 'You rated it; nothing here says you spend wrong. Low scores point at the easy place to move money from, high scores at where there is room.'));
  }
  function drawWorthIt(b) { worthItGrid(b.questions[0].text); foot.appendChild(nextBtn()); foot.appendChild(skipBtn()); }
  function drawSatisfaction(b) { satisfactionScale(b.questions[0].text); if (b.questions[1]) { const fold = h('details', { class: 'worthit-fold' }, h('summary', { class: 'small' }, b.questions[1].text), h('div')); body.appendChild(fold); worthItGrid('', fold.querySelector('div')); } foot.appendChild(nextBtn()); }
  function drawRefresh(b) { body.appendChild(h('p', { class: 'small' }, h('a', { class: 'btn small', href: '#/calendar' }, 'Open the cash flow calendar'), ' ', h('span', { class: 'muted' }, 'Safe to spend and the next tight day, from the day-by-day run.')));
    body.appendChild(say(b.questions[0].text));
    const rows = []; const F2 = { debt: 'balance', invest: 'accountBalance' };
    Object.keys(F2).forEach(p => app.record.planets[p].rows.forEach(r => { const f = r.f[F2[p]]; if (!f || ['none', 'not-applicable', 'not-for-me'].includes(f.state)) return; rows.push({ planet: p, row: r, field: F2[p], f }); }));
    if (!rows.length) body.appendChild(h('p', { class: 'muted' }, 'No debts or accounts with a balance yet.'));
    else body.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data md-balances' }, h('thead', null, h('tr', null, h('th', null, 'Account'), h('th', { class: 'num' }, 'Last'), h('th', null, 'Today'))), h('tbody', null, rows.map(x => { const cur = typeof x.f.v === 'number' ? x.f.v : null; return h('tr', null, h('td', null, x.row.nickname || x.planet, h('span', { class: 'small muted' }, ' ' + (x.row.institution || ''))), h('td', { class: 'num' }, cur !== null ? F.dollarsWhole(cur) : h('span', { class: 'empty-token' }, 'Not entered')), h('td', null, h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': 'New balance for ' + (x.row.nickname || x.planet), title: 'Type the balance as of today', onChange: e => { const cents = F.parseMoney(e.target.value); if (cents === null || cents === undefined) return; app.setFieldWhy(x.row.id, x.field, cents, typeof cents === 'object' ? 'rough' : 'known', 'client', undefined, 'move'); e.target.value = ''; app.toast((x.row.nickname || 'Balance') + ' updated.'); } }))); })))));
    body.appendChild(h('p', { class: 'small' }, h('a', { class: 'btn', href: '#/transactions' }, 'Import this month\'s transactions'), ' ', h('span', { class: 'muted' }, 'Each figure is logged as a move, not a correction.')));
    foot.appendChild(nextBtn());
  }
  function drawChanged() {
    const ids = headlineIds(app.record, app.result, app.data);
    body.appendChild(say('Here is what moved since last time.'));
    body.appendChild(h('ul', { class: 'score-list md-moved' }, ids.map(id => { const def = defOf(app, id); const m = app.result.metrics[id]; const ok = m && m.status === 'ok'; return h('li', { class: ok ? '' : 'locked' }, h('button', { class: 'linklike score-row', onClick: () => openMetric(app, id) }, h('span', { class: 'row-label' }, metricLabel(app, def)), h('span', { class: 'row-value' }, ok ? textOf(m) : 'needs inputs')), ok ? h('span', { class: 'row-meta' }, trendLine(app, id)) : null); })));
    const run = (r, today) => app.compute(r, app.data, { today });
    ['fiDate', 'netWorth'].forEach(id => { try { const w = whyMoved(app.record, app.result, app.data, id, { compute: run }); if (w && w.total !== null && w.total !== 0) body.appendChild(h('p', { class: 'small' }, h('strong', null, metricLabel(app, defOf(app, id)) + ': '), w.sentences.join(' ') + (w.marketNote ? ' ' + w.marketNote : ''))); } catch (e) { /* no history yet */ } });
    foot.appendChild(nextBtn());
  }
  function drawMilestones() {
    const last = app.record.snapshots && app.record.snapshots.length ? app.record.snapshots[app.record.snapshots.length - 1] : null;
    const crossed = (app.record.celebrations || []).filter(c => !c.seeded && (!last || c.ts >= last.ts));
    body.appendChild(say(crossed.length ? 'Worth marking: ' + crossed.map(c => c.text.charAt(0).toLowerCase() + c.text.slice(1)).join('; ') + '.' : 'No rung crossed this month; the ladders are in each number\'s drawer.'));
    const bests = personalBests(app.record, app.result, app.data).filter(b => b.isNew);
    if (bests.length) body.appendChild(h('p', { class: 'small' }, h('strong', null, 'New personal best: '), bests.map(b => b.label.toLowerCase() + ' ' + b.value).join('; ') + '.'));
    foot.appendChild(nextBtn()); foot.appendChild(skipBtn());
  }
  function drawAction(b) {
    body.appendChild(say(b.questions[0].text));
    body.appendChild(nextActionCard(app, { noLink: true }));
    const def = defOf(app, 'satisfaction'); const sa = nextActionFor(def, cachedSensitivity(app), app.result); if (sa) body.appendChild(h('p', { class: 'small' }, h('strong', null, 'For satisfaction: '), sa.sentence));
    const cur = (programOf(app.record).sessions[sKey()] || {}).action || '';
    const input = h('input', { class: 'input wide', 'aria-label': 'The one action for the month', value: cur, onChange: e => app.mutate(rec => { setMonthAction(rec, sKey(), e.target.value.trim(), { session: sessId }); }, 'program') });
    body.appendChild(h('div', { class: 'row' }, h('label', { class: 'small' }, 'Written down'), input));
    foot.appendChild(nextBtn('On to booking'));
  }
  function drawMdClose(b) {
    const P = programOf(app.record);
    body.appendChild(say(b.questions[0].text));
    const date = h('input', { class: 'input', type: 'date', 'aria-label': 'Next money date', value: P.nextDate || '' });
    body.appendChild(h('div', { class: 'row' }, h('label', { class: 'small' }, 'Next month'), date));
    const sat = (P.satisfaction || []).find(s => s.session === sessId); if (!sat) body.appendChild(h('p', { class: 'small muted' }, 'The satisfaction score is still open; it can be asked here too.'));
    if (!sat) satisfactionScale('How satisfied are you with where your money is going right now, one to ten?');
    foot.appendChild(h('button', { class: 'btn primary', onClick: () => {
      const key = sKey(); const cur = plan.blocks[idx]; const now = new Date().toISOString(); let cheers = [];
      app.mutate(rec => { blockStatus(rec, key, cur.key || blockKey(key, cur.id), 'done', Math.round((Date.now() - blockStartedAt) / 6000) / 10, { session: sessId }); closeSession(rec, key, { nextDate: date.value || null }, { session: sessId, now }); const seeded = seedCelebrations(rec, app.result, app.data, { now, session: sessId }); cheers = seeded.length ? [] : celebrate(rec, app.result, app.data, { now, session: sessId }); takeSnapshot(rec, app.result, 'money-date', { now, session: sessId }); }, 'program');
      const summary = clientSummary(app.record, app.result, app.data, cachedSensitivity(app)); const action = (programOf(app.record).sessions[key] || {}).action || summary.action;
      app.lastMoneyDateEmail = moneyDateEmail(app.record, summary, { nextDate: date.value ? F.dateLong(date.value) : null, action });
      app.toast('Money date saved. ' + (cheers.length ? cheers[0].text + '. ' : '') + 'The summary is on the Money date screen.', { label: 'Open', action: () => { location.hash = '#/money-date'; } });
      app.session = null; location.hash = '#/money-date';
    } }, 'Close the money date'));
  }
  function drawQuestions(b) {
    b.questions.forEach(q => {
      body.appendChild(say(q.text));
      if (q.fills === 'program.satisfaction') { body.removeChild(body.lastChild); satisfactionScale(q.text); return; }
      if (q.fills === 'program.worthIt') { body.removeChild(body.lastChild); worthItGrid(q.text); return; }
      if (/^program\./.test(q.fills)) { const key = q.fills.replace('program.', ''); body.appendChild(h('textarea', { class: 'input wide', 'aria-label': q.text, value: programOf(app.record).notes[key] || '', onChange: e => app.mutate(rec => { setNote(rec, key, e.target.value.trim(), { session: 's' + n }); }, 'program') })); }
      else body.appendChild(h('p', { class: 'small muted' }, 'Type it where it lives: ', h('a', { href: b.room || '#/ledger/' + (q.fills.split('.')[0] === 'anchor' ? 'spending' : q.fills.split('.')[0]) }, 'open the room')));
    });
  }
  function drawField(b) { if (b.outputs.length) body.appendChild(h('p', { class: 'small muted' }, 'Leaves: ' + b.outputs.join('; '))); drawQuestions(b); if (b.room) body.appendChild(h('p', null, h('a', { class: 'btn', href: b.room }, 'Open the room'))); foot.appendChild(nextBtn()); foot.appendChild(skipBtn()); }

  draw();
  const timer = setInterval(() => { if (!document.body.contains(tl)) { clearInterval(timer); return; } tick(); }, 20000);
  return { update() { draw(); } };
}
