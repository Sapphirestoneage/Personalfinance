/* The call path (Level 8, MR-049): Session 1 and later sessions as one
   question at a time, a read-aloud sentence with the answer box under it.
   Stops: Confirm, What you spend, What you'd want, The real numbers, How far
   off, Your targets. Stop order and copy come from data/callpath.json; the
   questions from engine/callpath.js; the numbers from the computed result,
   engine/variance.js and engine/targets.js. Coach view only. */
import { h, clear } from '../dom.js';
import { closeOverlay } from '../app.js';
import * as F from '../../engine/format.js';
import { parseSaid, toMonthly } from '../../engine/parse.js';
import { stops as stopDefs, gutQuestions, dreamQuestions, actualItems, confirmQuestions, progressOf, areaLabel } from '../../engine/callpath.js';
import { getAnchor, dreamTotal, AREAS } from '../../engine/anchors.js';
import { variance, fiEffect, AREA_LABELS, tierComparison } from '../../engine/variance.js';
import { proposals } from '../../engine/targets.js';
import { session as leverage } from '../../engine/leverage.js';
import { roommateOutcome } from '../../engine/scenarios.js';
import { tierLabel, multiplierFor } from '../../engine/col.js';
import { isGuessRow } from '../../engine/guesses.js';
import { guessList } from './discovery.js';
import * as Charts from '../charts.js';

export function mount(host, app) {
  const CP = app.data.callpath; const sid = () => app.session || 'current';
  let stop = null; let qi = 0; let reveal = false; let pendingShare = null;
  const header = h('header', null, h('h1', null, 'Session'), h('span', { class: 'sub' }, 'One question at a time. Read it out loud; type what they say.'), h('div', { class: 'actions' },
    h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Session mode' }, ['standard', 'gentle'].map(m => h('button', { 'aria-pressed': String((app.record.sessionMode || 'standard') === m), onClick: () => app.setMode(m) }, m === 'gentle' ? 'Gentle' : 'Standard'))),
    h('a', { class: 'btn', href: '#/session' }, 'Session page')));
  host.appendChild(header);
  const progress = h('nav', { class: 'callpath', 'aria-label': 'Stops' }); const body = h('section', { class: 'panel call-body' });
  host.appendChild(progress); host.appendChild(body);
  const gentle = () => (app.record.sessionMode || 'standard') === 'gentle';
  function firstStop() { const c = confirmQuestions(app.record, app.result, app.data); return (c.said.length || c.guesses.length) ? 'confirm' : 'gut'; }
  function draw() {
    if (!stop) stop = firstStop();
    clear(progress); clear(body);
    const prog = progressOf(app.record, sid());
    stopDefs(app.data).forEach((s, i) => { const st = prog[s.id] || 'untouched'; progress.appendChild(h('button', { class: 'stop' + (stop === s.id ? ' current' : '') + ' st-' + st, 'aria-current': stop === s.id ? 'step' : null, onClick: () => { stop = s.id; qi = 0; draw(); } }, h('span', { class: 'stop-n' }, String(i + 1)), h('span', { class: 'stop-label' }, s.label), h('span', { class: 'stop-state small muted' }, st === 'done' ? 'done' : st === 'partly' ? 'partly' : ''))); });
    const def = stopDefs(app.data).find(s => s.id === stop);
    body.appendChild(h('h2', null, def.title));
    ({ confirm: drawConfirm, gut: drawGut, dream: drawDream, actual: drawActual, reconcile: drawReconcile, decide: drawDecide }[stop] || drawGut)(def);
  }
  const say = text => h('p', { class: 'readaloud big' }, text);
  const next = (label) => h('button', { class: 'btn', onClick: () => { qi++; draw(); } }, label || 'Next');
  const done = (status) => { app.callStop(stop, status || 'done'); };
  const money = c => F.dollarsWhole(c);
  function answerBox(label, onAnswer, opts) {
    const o = opts || {}; const input = h('input', { class: 'input wide big', type: 'text', 'aria-label': label, title: o.title || 'Type it the way they say it: 1900 every two weeks, like 100 a week, 2,500ish, my half is 1,650' });
    const heard = h('div', { class: 'small muted heard' });
    input.addEventListener('input', () => { const p = parseSaid(input.value, { defaultCadence: o.defaultCadence || 'month' }); heard.textContent = !input.value ? '' : !p ? '' : p.unknown ? 'Unknown' : p.none ? 'None' : money(toMonthly(p.cents, p.cadence, p.payFrequency)) + ' a month' + (p.state === 'rough' ? ', rough' : '') + (p.split ? ', your share ' + money(toMonthly(p.share, p.cadence, p.payFrequency)) : ''); });
    const go = () => { const p = parseSaid(input.value, { defaultCadence: o.defaultCadence || 'month' }); if (!p && input.value.trim()) { app.toast('I did not catch a number. Numbers, then how often: "like 100 a week".'); return; } onAnswer(p); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const wrap = h('div', { class: 'answer' }, input, heard, h('div', { class: 'row taps' }, h('button', { class: 'btn primary', onClick: go }, o.saveLabel || 'Save'), o.noUnknown ? null : h('button', { class: 'btn', onClick: () => onAnswer({ unknown: true, state: 'unknown' }) }, "I don't know"), o.noNone ? null : h('button', { class: 'btn', onClick: () => onAnswer({ none: true, cents: 0, state: 'none' }) }, 'None'), o.extra || null));
    setTimeout(() => input.focus(), 0);
    return wrap;
  }

  /* ---- Confirm ---- */
  function drawConfirm(def) {
    const c = confirmQuestions(app.record, app.result, app.data); const hh = app.record.household; const tier = app.result.colTier; const tiers = app.data.colTiers;
    body.appendChild(say(gentle() ? 'Let us start with what you told me. Nothing to look up; just whether it still feels right.' : def.intro));
    const said = h('div', { class: 'confirm-list' });
    if (!c.tierConfirmed) said.appendChild(confirmLine('You live in ' + (app.record.sun.f.city && app.record.sun.f.city.v || 'your city') + ', a ' + tierLabel(tier.tier, 'client', tiers) + '.', [['Still right', () => app.confirmDiscovery('tier')]], h('span', { class: 'row tierchips' }, ['HCOL', 'MCOL', 'LCOL'].map(tt => h('button', { class: 'chip toggle' + (tier.tier === tt ? ' on' : ''), 'aria-pressed': String(tier.tier === tt), onClick: () => { app.colTier({ tier: tt, source: 'client' }); app.confirmDiscovery('tier'); } }, tt)))));
    if (!c.householdConfirmed) said.appendChild(confirmLine(householdSentence(hh), [['Still right', () => app.confirmDiscovery('household')], ['Change it', () => app.openDrawer(householdEditor(app))]]));
    c.said.forEach(i => said.appendChild(confirmLine(i.sentence, [['Still right', () => { if (i.rowId !== 'sun') app.setFieldWhy(i.rowId, i.field, i.value, i.state === 'unknown' ? 'unknown' : i.state === 'will-send' ? 'will-send' : 'known', 'client', i.cad || undefined, null); app.confirmDiscovery(i.rowId + '|' + i.field); }], ['Change it', () => editInline(i)], ["Don't know", () => { if (i.rowId !== 'sun') app.setFieldWhy(i.rowId, i.field, null, 'unknown', 'client', undefined, 'correction'); app.confirmDiscovery(i.rowId + '|' + i.field); }]])));
    body.appendChild(h('h3', null, 'What you told me', h('span', { class: 'tag' }, said.children.length ? said.children.length + ' to confirm' : 'all confirmed')));
    body.appendChild(said.children.length ? said : h('p', { class: 'muted small' }, 'Everything from the first call is confirmed.'));
    /* my guesses */
    body.appendChild(h('h3', null, 'My guesses', h('span', { class: 'tag' }, c.guesses.length + (c.guesses.length === 1 ? ' guess' : ' guesses'))));
    if (c.guesses.length) {
      body.appendChild(say(def.guessIntro));
      const list = h('div', { class: 'confirm-list' });
      c.guesses.forEach(g => list.appendChild(confirmLine(g.sentence, [['Use mine', () => useMine(g)], ['Keep the guess for now', () => app.confirmDiscovery('guess|' + g.rowId)], ['Not for me', () => { app.setFieldWhy(g.rowId, 'amount', null, 'not-for-me', 'client', undefined, 'correction'); app.mutate(rec => { const r = rec.planets.spending.rows.find(x => x.id === g.rowId); if (r) r.guess = false; }, 'rows'); }]], h('span', { class: 'chip src src-estimated' }, 'Guess, ' + g.tier))));
      body.appendChild(list);
    } else body.appendChild(h('p', { class: 'muted small' }, 'No guesses left. Every area has their number.'));
    body.appendChild(soFarCard());
    body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { done(c.said.length || c.guesses.length ? 'partly' : 'done'); stop = 'gut'; qi = 0; draw(); } }, 'On to what you spend')));
  }
  function confirmLine(sentence, taps, extra) { return h('div', { class: 'confirm-line' }, h('p', { class: 'readaloud' }, sentence), h('div', { class: 'row taps' }, taps.map(([l, fn]) => h('button', { class: 'btn small' + (l === 'Still right' || l === 'Use mine' ? ' primary' : ''), onClick: fn }, l)), extra || null)); }
  function editInline(i) {
    const box = answerBox('New value for ' + i.label, p => { if (!p) return; if (p.unknown) { app.setFieldWhy(i.rowId, i.field, null, 'unknown', 'client', undefined, 'correction'); } else if (i.rowId === 'sun') { app.setFieldWhy('sun', i.field, i.field === 'birthDate' ? (parseBirthLike(p.raw) || p.raw) : p.raw, 'known', 'client', undefined, 'correction'); } else { app.setFieldWhy(i.rowId, i.field, p.none ? 0 : p.cents, p.none ? 'none' : (p.state === 'rough' ? 'rough' : 'known'), 'client', i.kind === 'money' ? p.cadence : undefined, 'correction'); } app.confirmDiscovery(i.rowId + '|' + i.field); closeOverlay(); draw(); }, { defaultCadence: i.cad || 'month', noNone: i.kind !== 'money' });
    app.openDrawer(h('div', null, h('h2', null, 'Change it'), h('p', { class: 'small muted' }, i.label), box), { label: 'Change it' });
  }
  function parseBirthLike(t) { return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; }
  function useMine(g) {
    const people = 1 + (app.record.household.roommates || []).length;
    const box = answerBox(g.label + ', their number', p => {
      if (!p) return;
      if (p.unknown) { app.confirmDiscovery('guess|' + g.rowId); return; }
      const monthly = p.none ? 0 : toMonthly(p.cents, p.cadence, p.payFrequency);
      let full = monthly, share = monthly;
      if (g.shared) { if (p.isShare || (p.split && p.share !== null && !p.full)) { share = toMonthly(p.share, p.cadence, p.payFrequency); full = p.full ? toMonthly(p.full, p.cadence, p.payFrequency) : Math.round(share * people); } else if (p.split) { full = monthly; share = Math.round(full / p.split); } else if (pendingShare === 'share') { share = monthly; full = Math.round(share * people); } else { full = monthly; share = Math.round(full / people); } }
      app.setFieldWhy(g.rowId, 'amount', full, p.none ? 'none' : (p.state === 'rough' ? 'rough' : 'known'), 'client', 'month', 'correction');
      if (g.shared) app.setFieldWhy(g.rowId, 'myShare', Math.round(share / Math.max(1, full) * 10000) / 10000, 'known', 'client', undefined, null);
      app.mutate(rec => { const r = rec.planets.spending.rows.find(x => x.id === g.rowId); if (r) { r.guess = false; r.notesPrivate = (r.notesPrivate ? r.notesPrivate + ' ' : '') + 'Was a guess (' + g.tier + ').'; } }, 'rows');
      app.anchor('gut', 'spending:' + g.category, share, { shared: !!g.shared, note: g.shared ? 'Full bill ' + money(full) + ', your share' : '' });
      app.confirmDiscovery('guess|' + g.rowId); pendingShare = null; closeOverlay(); draw();
    }, { extra: g.shared ? h('span', { class: 'view-toggle', role: 'group', 'aria-label': 'Whole bill or your part' }, [['full', 'Whole bill'], ['share', 'My part']].map(([k, l]) => h('button', { 'aria-pressed': String((pendingShare || 'full') === k), onClick: e => { pendingShare = k; e.target.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); e.target.setAttribute('aria-pressed', 'true'); } }, l))) : null });
    app.openDrawer(h('div', null, h('h2', null, 'Use theirs'), h('p', { class: 'small muted' }, g.label + (g.shared ? ': say whether it is the whole bill or their part' : '')), box), { label: 'Use theirs' });
  }
  function soFarCard() {
    const M = app.result.metrics; const S = app.result.sun.outputs; const g = app.result.guesses.count; const hh = app.record.household;
    const card = h('div', { class: 'panel sofar' }, h('h3', null, "Here's what we know so far", h('span', { class: 'tag' }, g ? 'Includes ' + g + (g === 1 ? ' guess' : ' guesses') : 'no guesses left')),
      h('div', { class: 'kpis' }, [['Spending a month', M.spending.status === 'ok' ? money(M.spending.value.cents) : 'needs inputs'], ['FI number', M.fiNumber.status === 'ok' ? money(M.fiNumber.value.cents) : 'needs inputs'], ['FI date', M.fiDate.status === 'ok' ? F.date(M.fiDate.value.value) + ', age ' + M.fiDate.ages.likely : 'not before 95 yet'], ['Cushion target', M.ruleOf5Target.status === 'ok' ? money(M.ruleOf5Target.value.cents) + (S.safety.roommateGap ? ' (incl. ' + money(S.safety.roommateGap.cents) + ' roommate gap)' : '') : 'needs inputs']].map(([l, v]) => h('div', { class: 'kpi' }, h('div', { class: 'label' }, l), h('div', { class: 'value rough' }, v)))),
      g ? h('p', { class: 'small' }, h('button', { class: 'linklike', onClick: () => app.openDrawer(guessList(app)) }, 'See the ' + g + ' guesses')) : null);
    if (hh.roommates.length && S.safety.roommateGap) { const o = roommateOutcome(app.result, { answers: { monthsToReplace: app.result.asm.roommateMonthsToReplace || 2, oneTime: 0, keepAlone: 0, yearsAlone: 30 } }, app.data.scenarioBlocks.types.roommate); if (o && !o.needs) card.appendChild(h('p', { class: 'small fallsonyou' }, h('strong', null, 'If it all falls on you: '), 'the shared bills go from ' + money(o.newSharedMonthly - o.jumpMonthly) + ' to ' + money(o.newSharedMonthly) + ' a month; ' + o.months + ' months to find someone takes about ' + money(o.bridge) + '. ', h('a', { href: '#/scenarios' }, 'Open the what-if'))); }
    return card;
  }
  /* ---- What you spend (gut) ---- */
  function drawGut(def) {
    const qs = gutQuestions(app.record, app.result, app.data);
    if (qi >= qs.length) qi = qs.length - 1;
    const q = qs[qi];
    body.appendChild(h('div', { class: 'small muted qcount' }, q.areaIndex ? 'Area ' + q.areaIndex + ' of ' + q.areaCount : 'Question ' + (qi + 1) + ' of ' + qs.length));
    if (q.kind === 'card') { body.appendChild(say(q.sentence)); body.appendChild(soFarCard()); body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { done('done'); stop = 'dream'; qi = 0; draw(); } }, gentle() ? "On to what you'd want" : "On to what you'd want"))); return; }
    body.appendChild(say(q.sentence));
    if (q.kind === 'confirm') { body.appendChild(h('div', { class: 'row taps' }, h('button', { class: 'btn primary', onClick: () => { qi++; draw(); } }, 'Still right'), h('button', { class: 'btn', onClick: () => { const box = answerBox('New figure', p => { if (!p || p.unknown) { qi++; draw(); return; } saveGut(q, p); }, { defaultCadence: 'month' }); body.appendChild(box); } }, 'Change it'), next('Skip'))); return; }
    const extra = q.shared ? h('span', { class: 'view-toggle', role: 'group', 'aria-label': q.sharedPrompt || 'Whole bill or your part' }, [['share', 'My part'], ['full', 'Whole bill']].map(([k, l]) => h('button', { 'aria-pressed': String((pendingShare || 'share') === k), onClick: e => { pendingShare = k; e.target.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); e.target.setAttribute('aria-pressed', 'true'); } }, l))) : null;
    body.appendChild(answerBox(q.sentence, p => { if (!p) return; if (p.unknown) { app.addQuickNote('Ask: ' + (q.area ? areaLabel(app.data, q.area) : q.id.replace(':', ' ')) + ' (they did not know on the call)'); qi++; draw(); return; } saveGut(q, p); }, { defaultCadence: q.defaultCadence || 'month', extra }));
    if (q.shared) body.appendChild(h('p', { class: 'small muted' }, q.sharedPrompt + ' Default: your part.'));
    if (q.kind === 'birth') body.appendChild(h('p', { class: 'small muted' }, 'A year or an age is enough.'));
  }
  function saveGut(q, p) {
    const people = 1 + (app.record.household.roommates || []).length;
    if (q.kind === 'birth') { app.setFieldWhy('sun', 'birthDate', p.raw, 'rough', 'client'); qi++; draw(); return; }
    if (q.kind === 'text') { app.setFieldWhy('sun', q.target.field, p.raw, 'known', 'client'); qi++; draw(); return; }
    let monthly = p.none ? 0 : toMonthly(p.cents, p.cadence, p.payFrequency); let shared = false; let note = '';
    if (q.shared) { shared = true; if (p.isShare || (p.split && p.share !== null)) { monthly = toMonthly(p.share, p.cadence, p.payFrequency); note = 'Full bill ' + money(toMonthly(p.full || p.share * (p.split || people), p.cadence, p.payFrequency)) + ', your share'; } else if (pendingShare === 'full') { note = 'Full bill ' + money(monthly) + ', your share'; monthly = Math.round(monthly / people); } }
    if (q.id === 'income:takeHome') { const job = app.record.planets.income.rows.find(r => r.type === 'w2' || r.type === 'c1099'); if (job) app.setFieldWhy(job.id, 'takeHome', p.cents, p.state === 'rough' ? 'rough' : 'known', 'client', p.cadence, 'correction'); }
    if (q.anchor) { if (getAnchor(app.record, 'gut', q.anchor)) app.reanchor('gut', q.anchor, monthly, { shared, note }); else app.anchor('gut', q.anchor, monthly, { shared, note }); }
    pendingShare = null; qi++; draw();
  }
  /* ---- What you'd want (dream) ---- */
  function drawDream(def) {
    const qs = dreamQuestions(app.record, app.result, app.data); if (qi >= qs.length) qi = qs.length - 1; const q = qs[qi];
    body.appendChild(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'small muted qcount' }, q.areaIndex ? 'Area ' + q.areaIndex + ' of ' + q.areaCount : 'Question ' + (qi + 1) + ' of ' + qs.length), h('label', { class: 'small muted' }, h('input', { type: 'checkbox', checked: reveal, onChange: e => { reveal = e.target.checked; draw(); } }), ' Show what they said')));
    if (q.kind === 'card') { body.appendChild(say(q.sentence)); body.appendChild(dreamCard()); body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { done('done'); stop = 'actual'; qi = 0; draw(); } }, 'On to the real numbers'))); return; }
    body.appendChild(say(q.sentence));
    if (reveal && q.gut) body.appendChild(h('p', { class: 'small muted' }, 'They said: ' + money(q.gut.cents) + ' a month.'));
    if (q.housingChoice) body.appendChild(h('div', { class: 'row taps' }, h('span', { class: 'small' }, q.housingChoice), h('span', { class: 'view-toggle', role: 'group', 'aria-label': 'Housing dream' }, [[false, 'With a roommate'], [true, 'On my own']].map(([v, l]) => { const cur = getAnchor(app.record, 'dream', 'housing:alone'); return h('button', { 'aria-pressed': String(!!(cur && cur.value === v)), onClick: () => { if (cur) app.reanchor('dream', 'housing:alone', { value: v }, {}); else app.anchor('dream', 'housing:alone', { value: v }, {}); } }, l); }))));
    if (q.kind === 'confirm') { body.appendChild(h('div', { class: 'row taps' }, h('button', { class: 'btn primary', onClick: () => { qi++; draw(); } }, 'Still'), h('button', { class: 'btn', onClick: () => { body.appendChild(answerBox('New figure', p => saveDream(q, p), { noNone: q.kind === 'age' })); } }, 'Change it'), next('Skip'))); return; }
    body.appendChild(answerBox(q.sentence, p => saveDream(q, p), { defaultCadence: 'month', noNone: q.kind === 'age', noUnknown: false }));
  }
  function saveDream(q, p) {
    if (!p || p.unknown) { qi++; draw(); return; }
    if (q.kind === 'age' || q.id === 'dream:fiAge') { const age = Math.round(p.cents / 100); if (getAnchor(app.record, 'dream', 'life:fiAge')) app.reanchor('dream', 'life:fiAge', { value: age }, {}); else app.anchor('dream', 'life:fiAge', { value: age }, {}); const ret = app.record.planets.life.rows.find(r => r.type === 'retirement'); if (ret) app.setField(ret.id, 'dreamFiAge', age, 'known', 'client'); qi++; draw(); return; }
    const monthly = p.none ? 0 : toMonthly(p.cents, p.cadence, p.payFrequency);
    if (getAnchor(app.record, 'dream', q.anchor)) app.reanchor('dream', q.anchor, monthly, {}); else app.anchor('dream', q.anchor, monthly, {});
    qi++; draw();
  }
  function dreamCard() {
    const M = app.result.metrics; const dt = dreamTotal(app.record); const wr = app.result.asm.withdrawalRate; const fiAge = getAnchor(app.record, 'dream', 'life:fiAge');
    const dreamFi = dt ? Math.round(dt.cents * 12 / wr) : null; const eff = dt && M.spending.status === 'ok' ? fiEffect(app.result, dt.cents - M.spending.value.cents) : null;
    return h('div', { class: 'panel sofar' }, h('h3', null, 'Today against the dream'), h('div', { class: 'kpis' }, [['FI number today', M.fiNumber.status === 'ok' ? money(M.fiNumber.value.cents) : 'needs inputs'], ["What you'd want, a month", dt ? money(dt.cents) : 'not yet'], ["FI number at what you'd want", dreamFi !== null ? money(dreamFi) : 'not yet'], ['FI date today', M.fiDate.status === 'ok' ? F.date(M.fiDate.value.value) + ', age ' + M.fiDate.ages.likely : 'not before 95'], ['FI date at the dream', eff && eff.months !== null ? (eff.months === 0 ? 'the same' : Math.abs(eff.months / 12).toFixed(1) + ' years ' + (eff.months < 0 ? 'earlier' : 'later')) : eff && eff.never ? 'not before 95' : 'not yet'], ['Age you want work optional', fiAge ? String(fiAge.value) : 'not yet']].map(([l, v]) => h('div', { class: 'kpi' }, h('div', { class: 'label' }, l), h('div', { class: 'value' }, v)))), h('p', { class: 'small muted' }, 'Both FI numbers show whichever basis the Assumptions screen uses (' + (app.result.asm.fiSpendingBasis === 'dream' ? 'the dream' : 'actual spending') + ').'));
  }
  /* ---- The real numbers ---- */
  function drawActual(def) {
    const s = leverage({ record: app.record, fields: app.data.fields, weights: app.data.weights });
    const items = actualItems(app.record, app.result, app.data, s.all.filter(i => !i.small));
    if (gentle()) { body.appendChild(say(def.homework)); body.appendChild(h('p', { class: 'small muted' }, app.data.discovery.gentleWords.homework)); body.appendChild(h('h3', null, 'What to bring')); body.appendChild(h('ul', null, items.slice(0, 8).map(i => h('li', null, i.label)))); body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { done('partly'); stop = 'decide'; draw(); } }, 'On to your targets'))); return; }
    body.appendChild(say(def.intro));
    if (!items.length) { body.appendChild(h('p', { class: 'muted' }, 'Every line has a real number.')); }
    body.appendChild(h('div', { class: 'actual-list' }, items.slice(0, 20).map((i, k) => h('div', { class: 'confirm-line' }, h('p', { class: 'readaloud' }, h('span', { class: 'small muted' }, (k + 1) + '. '), i.sentence), h('div', { class: 'row taps' }, h('a', { class: 'btn small primary', href: i.href || ('#/ledger/' + i.planet), onClick: () => { if (i.rowId) app.focusAfterRender = { rowId: i.rowId, field: i.field }; } }, i.kind === 'area' ? 'Add the lines' : 'Go to the cell'), i.dollarsAnnual ? h('span', { class: 'small muted' }, money(Math.abs(i.dollarsAnnual)) + ' a year') : null)))));
    body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { done(items.length ? 'partly' : 'done'); stop = 'reconcile'; draw(); } }, 'On to how far off')));
  }
  /* ---- How far off ---- */
  function drawReconcile(def) {
    if (gentle() && !hasActual()) { body.appendChild(say(def.gentleHold)); body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { stop = 'decide'; draw(); } }, 'On to your targets'))); return; }
    body.appendChild(say(def.intro));
    body.appendChild(variancePanel(app, { coach: true }));
    body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { done('done'); stop = 'decide'; draw(); } }, 'On to your targets')));
  }
  function hasActual() { const S = app.result.sun.outputs; return Object.keys(S.spending.byCategory).some(c => S.spending.byCategory[c].cents > 0 && !S.spending.standIns[c]); }
  /* ---- Your targets ---- */
  function drawDecide(def) {
    body.appendChild(say(def.intro));
    body.appendChild(targetsPanel(app));
    body.appendChild(nextSessionTodos(app));
    body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { done('done'); app.toast('Targets saved. Close the session on the Session page when you are done.'); } }, 'Done for today'), h('a', { class: 'btn', href: '#/session' }, 'Session page')));
  }
  draw();
  return { update() { draw(); } };
}

/* One sentence for who they live with and whose money counts (MR-050). */
export function householdSentence(hh) {
  const who = [];
  if (hh.partner) who.push(hh.partner.nickname || 'your partner');
  if (hh.roommates.length) who.push(hh.roommates.map(r => r.nickname).filter(Boolean).join(' and ') || (hh.roommates.length === 1 ? 'a roommate' : hh.roommates.length + ' roommates'));
  let t = who.length ? 'You live with ' + who.join(' and ') : 'You live alone';
  if (hh.roommates.length) t += ', lease ' + ({ mine: 'in your name', both: 'in both names', theirs: 'in their name', none: 'with no lease' }[hh.lease] || 'unknown');
  if (hh.partner) t += (hh.basis || 'together') === 'together' ? '; we count your money together' : '; we count just yours';
  return t + '.';
}
/* The household editor, shared with Confirm. */
export function householdEditor(app) {
  const hh = JSON.parse(JSON.stringify(app.record.household || { roommates: [], lease: 'none', partner: null, basis: 'together' }));
  const box = h('div', null, h('h2', null, 'Who you live with'));
  const draw = () => { clear(box); box.appendChild(h('h2', null, 'Who you live with'));
    box.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Roommates'), h('div', { class: 'control' }, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Roommates' }, [0, 1, 2, 3].map(n => h('button', { 'aria-pressed': String(hh.roommates.length === n), onClick: () => { hh.roommates = Array.from({ length: n }, (_, i) => hh.roommates[i] || { id: 'rm' + (i + 1), nickname: '' }); draw(); } }, n === 0 ? 'None' : String(n)))))));
    box.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Partner'), h('div', { class: 'control row' }, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Partner' }, [[false, 'No'], [true, 'Yes']].map(([v, l]) => h('button', { 'aria-pressed': String(!!hh.partner === v), onClick: () => { hh.partner = v ? (hh.partner || { nickname: '' }) : null; draw(); } }, l))), hh.partner ? h('input', { class: 'input', style: { width: '140px' }, 'aria-label': 'Partner nickname', value: hh.partner.nickname || '', onChange: e => { hh.partner.nickname = e.target.value.trim(); } }) : null)));
    if (hh.partner) box.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Whose money counts'), h('div', { class: 'control' }, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Whose money counts' }, [['together', 'Together'], ['mine', 'Just mine']].map(([v, l]) => h('button', { 'aria-pressed': String((hh.basis || 'together') === v), onClick: () => { hh.basis = v; draw(); } }, l))), h('div', { class: 'small muted' }, "Together adds their pay and counts shared bills in full. Just mine counts your pay and your share."))));
    hh.roommates.forEach((r, i) => box.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Roommate ' + (i + 1)), h('div', { class: 'control' }, h('input', { class: 'input', 'aria-label': 'Roommate ' + (i + 1) + ' nickname', value: r.nickname || '', onChange: e => { r.nickname = e.target.value.trim(); } })))));
    if (hh.roommates.length) box.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Lease'), h('div', { class: 'control' }, h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Lease' }, app.data.discovery.lease.map(l => h('button', { 'aria-pressed': String(hh.lease === l[0]), onClick: () => { hh.lease = l[0]; draw(); } }, l[1]))))));
    box.appendChild(h('p', { style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onClick: () => { const moved = (app.record.household.roommates || []).length > hh.roommates.length && app.record.discovery && app.record.discovery.confirmed && app.record.discovery.confirmed.household; app.household(hh, moved ? 'move' : null); app.confirmDiscovery('household'); app.toast(moved ? 'A roommate moved out: counted as a real change' : 'Household updated; the guesses were recomputed'); }, }, 'Save'))); };
  draw(); return box;
}

/* ---- the variance panel, shared by How far off, the Session page and the one-pager ---- */
export function actualsOf(app) { const S = app.result.sun.outputs; const areas = {}; Object.keys(S.spending.byCategory).forEach(c => { areas[c] = S.spending.byCategory[c].cents; }); const o = { 'income:takeHome': S.income.takeHomeMonthly.status === 'ok' ? S.income.takeHomeMonthly.cents : null, 'income:gross': S.income.grossMonthly.status === 'ok' ? S.income.grossMonthly.cents : null, 'debt:total': S.debt.totalDebt.status === 'ok' ? S.debt.totalDebt.cents : null, 'debt:minimums': S.debt.debtServiceMonthly.status === 'ok' ? S.debt.debtServiceMonthly.cents : null, 'safety:cash': S.invest.cashBalances.status === 'ok' ? S.invest.cashBalances.cents : null, 'invest:total': S.invest.investedAssets.status === 'ok' ? S.invest.investedAssets.cents : null }; return { areas, total: S.spending.baselineMonthly.status === 'ok' ? S.spending.baselineMonthly.cents : null, standIns: S.spending.standIns, other: o }; }
export function variancePanel(app, opts) {
  const o = opts || {}; const coach = app.view === 'coach' && o.coach !== false; const gentle = (app.record.sessionMode || 'standard') === 'gentle';
  const disc = app.record.discovery && app.record.discovery.form && app.record.discovery.form.spending && app.record.discovery.form.spending.gutTotal ? (parseSaid(app.record.discovery.form.spending.gutTotal) || {}).cents || null : null;
  const v = variance(app.record, actualsOf(app), { discoveryTotal: disc });
  const panel = h('div', { class: 'variance' });
  const money = c => F.dollarsWhole(c);
  const hl = v.headline; const parts = [hl.discovery !== null ? 'On our first call: ' + money(hl.discovery) : null, hl.gut !== null ? 'What you said: ' + money(hl.gut) : null, hl.actual !== null ? 'What it really is: ' + money(hl.actual) : null, hl.dream !== null ? "What you'd want: " + money(hl.dream) : null].filter(Boolean);
  if (parts.length) panel.appendChild(h('p', { class: 'headline-line' }, parts.join(' | ') + ' a month.'));
  if (hl.top2.length && hl.top2Share !== null) panel.appendChild(h('p', { class: 'small muted' }, 'The top ' + hl.top2.length + (hl.top2.length === 1 ? ' area explains' : ' areas explain') + ' ' + Math.round(hl.top2Share * 100) + '% of the gap: ' + hl.top2.map(k => AREA_LABELS[k].toLowerCase()).join(' and ') + '.'));
  const groups = [['bigger', coach && !gentle ? 'Bigger than you thought' : 'More than you thought'], ['smaller', 'Smaller than you thought (found money)'], ['aboveDream', "Above what you'd want"], ['roomToSpend', 'Room to spend more']];
  let any = false;
  groups.forEach(([k, label]) => { const rows = v.groups[k]; if (!rows.length) return; any = true; panel.appendChild(h('h3', null, label)); rows.forEach(r => panel.appendChild(varianceRow(app, r, k, coach, gentle))); });
  if (v.others.length) { panel.appendChild(h('h3', null, 'The rest')); v.others.forEach(r => panel.appendChild(h('div', { class: 'var-row' }, h('span', { class: 'var-label' }, r.label), h('span', { class: 'var-nums' }, 'you said ' + money(r.gut) + ', it is ' + money(r.actual) + ': ' + (r.awareness.direction === 'better' ? 'better than you thought' : r.awareness.direction === 'worse' ? (gentle ? 'a little more than you thought' : 'worse than you thought') : 'as you thought') + ' by ' + money(Math.abs(r.awareness.monthly)))))); }
  if (!any && !v.others.length) panel.appendChild(h('p', { class: 'muted small' }, 'Nothing to compare yet: this needs what they said and at least one area with real lines.'));
  const chartHost = h('div', { class: 'var-chart' }); panel.appendChild(chartHost);
  const marks = v.rows.filter(r => r.key !== 'total' && (r.gut !== null || r.dream !== null || r.actual !== null));
  if (marks.length) setTimeout(() => Charts.render('markers', chartHost, { rows: marks.map(r => ({ label: r.label, gut: r.gut, dream: r.dream, actual: r.actual })) }, { client: !coach }), 0);
  return panel;
}
function varianceRow(app, r, group, coach, gentle) {
  const money = c => F.dollarsWhole(c); const g = group === 'aboveDream' || group === 'roomToSpend' ? r.dreamGap : r.awareness;
  const eff = fiEffect(app.result, g.monthly);
  const text = group === 'bigger' ? (gentle ? 'about ' + money(g.monthly) + ' a month more than you thought' : money(g.monthly) + ' a month more than you said (' + Math.round(Math.abs(g.pct || 0) * 100) + '%)') : group === 'smaller' ? money(-g.monthly) + ' a month less than you said' : group === 'aboveDream' ? money(g.monthly) + " a month above what you'd want" : money(-g.monthly) + " a month below what you'd want";
  const cmp = coach && !gentle ? tierCmp(app, r) : null;
  return h('div', { class: 'var-row' }, h('span', { class: 'var-label' }, r.label, coach && !gentle && group === 'bigger' && r === app._culprit ? ' (culprit)' : ''), h('span', { class: 'var-nums' }, text), h('span', { class: 'var-fi small muted' }, (eff.fiNumberDelta > 0 ? '+' : '') + F.dollarsCompact(eff.fiNumberDelta) + ' of FI number' + (eff.months !== null && eff.months !== 0 ? ', ' + Math.abs(eff.months) + (Math.abs(eff.months) === 1 ? ' month' : ' months') + (eff.months > 0 ? ' later' : ' earlier') : eff.never ? ', past 95' : '')), cmp ? h('span', { class: 'var-cmp small muted' }, cmp) : null);
}
function tierCmp(app, r) {
  const tier = app.result.colTier; const d = app.data.defaults; if (!tier || !d.categories[r.key] || r.actual === null) return null;
  const size = '1'; const people = 1 + (app.record.household.roommates || []).length;
  let avg = (d.categories[r.key].lines[size] || []).reduce((s, l) => s + l[1], 0) * multiplierFor(tier, r.key, app.data.colTiers);
  if ((r.key === 'accommodation' || r.key === 'utilities') && d.housingByUnit) { const unit = d.housingByUnit[people === 1 ? '1bed' : people === 2 ? '2bed' : '3bed']; avg = Math.round((r.key === 'accommodation' ? unit.rent : unit.utilities) * multiplierFor(tier, r.key, app.data.colTiers) / people); }
  const c = tierComparison(r.actual, Math.round(avg)); if (!c) return null;
  return c.word + (people > 1 ? ' sharing a place' : '') + ' in a ' + tierLabel(tier.tier, 'client', app.data.colTiers);
}
/* To do next session (MR-050): every saved target is a to-do with the client's name on it; Keep it as is takes it off. */
export function nextSessionTodos(app) {
  const todos = ((app.record.sun.onepager || {}).todos || []).filter(t => t.target);
  const box = h('div', { class: 'panel sofar next-session' }, h('h3', null, 'To do next session', h('span', { class: 'tag' }, todos.length ? todos.length + (todos.length === 1 ? ' item' : ' items') : 'nothing yet')));
  if (!todos.length) box.appendChild(h('p', { class: 'small muted' }, 'Pick a target above and it lands here, and on the one-pager.'));
  else box.appendChild(h('ul', null, todos.map(t => h('li', null, t.task, h('span', { class: 'small muted' }, ' (' + t.owner + ')')))));
  return box;
}
/* ---- the targets panel, shared by Your targets and the Session page ---- */
export function targetsPanel(app, opts) {
  const o = opts || {}; const money = c => F.dollarsWhole(c);
  const v = variance(app.record, actualsOf(app)); const P = proposals(v.rows, app.record, app.result); const CP = app.data.callpath;
  const panel = h('div', { class: 'targets' });
  if (!P.rows.length) { panel.appendChild(h('p', { class: 'muted small' }, 'Targets need at least one area with real lines.')); return panel; }
  const table = h('table', { class: 'data targets-table' }, h('thead', null, h('tr', null, h('th', null, 'Area'), h('th', { class: 'num' }, 'Now'), h('th', null, 'Aim for'), h('th', { class: 'num' }, 'A month'), h('th', { class: 'num' }, 'FI number'), h('th', { class: 'num' }, 'FI date'))));
  const tb = h('tbody'); table.appendChild(tb);
  P.rows.forEach(t => {
    const choice = h('div', { class: 'view-toggle wrap', role: 'group', 'aria-label': 'Target for ' + t.label }, t.options.map(op => { const lbl = (CP.targetChoices.find(x => x[0] === (op.choice === 'room' ? 'dream' : op.choice)) || [])[1] || op.choice; return h('button', { 'aria-pressed': String((t.choice === 'room' ? 'dream' : t.choice) === op.choice), title: op.value !== null ? money(op.value) + ' a month' : '', onClick: () => app.target(t.key, op.choice, op.value, t.actual, t.label) }, lbl + (op.value !== null && op.choice !== 'keep' ? ' ' + F.dollarsCompact(op.value) : '')); }));
    const custom = t.choice === 'middle' && !o.readOnly ? h('input', { class: 'input num', style: { width: '96px' }, 'aria-label': 'Middle figure for ' + t.label, value: F.dollarsWhole(t.value), onChange: e => { const p = parseSaid(e.target.value); if (p && p.cents !== null) app.target(t.key, 'middle', p.cents, t.actual, t.label); } }) : null;
    tb.appendChild(h('tr', null, h('td', null, t.label), h('td', { class: 'num' }, money(t.actual)), h('td', null, o.readOnly ? ((CP.targetChoices.find(x => x[0] === (t.choice === 'room' ? 'dream' : t.choice)) || [])[1] || t.choice) : h('div', null, choice, custom)), h('td', { class: 'num' }, money(t.value) + (t.deltaMonthly ? ' (' + (t.deltaMonthly > 0 ? '+' : '') + money(t.deltaMonthly) + ')' : '')), h('td', { class: 'num' }, (t.fiNumberDelta > 0 ? '+' : '') + F.dollarsCompact(t.fiNumberDelta)), h('td', { class: 'num' }, t.fiMonths === null ? 'past 95' : t.fiMonths === 0 ? 'same' : Math.abs(t.fiMonths) + ' mo ' + (t.fiMonths < 0 ? 'earlier' : 'later'))));
  });
  table.appendChild(h('tfoot', null, h('tr', null, h('td', null, 'Total'), h('td'), h('td'), h('td', { class: 'num' }, (P.total.deltaMonthly > 0 ? '+' : '') + money(P.total.deltaMonthly)), h('td', { class: 'num' }, (P.total.fiNumberDelta > 0 ? '+' : '') + F.dollarsCompact(P.total.fiNumberDelta)), h('td', { class: 'num' }, P.total.fiMonths === null ? 'past 95' : P.total.fiMonths === 0 ? 'same' : Math.abs(P.total.fiMonths) + ' mo ' + (P.total.fiMonths < 0 ? 'earlier' : 'later')))));
  panel.appendChild(h('div', { class: 'tablewrap' }, table));
  panel.appendChild(h('p', { class: 'small muted' }, 'Meet in the middle is halfway from now toward the nearer of what you said and what you would want; type another figure to change it.'));
  return panel;
}
