/* Level 10: the program. Curricula shape, bending, urgent mode and Flex, the parking lot, knowledge targets and readiness, the account checklist, three steps, stress and the scorecard. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCurricula, sessionDef, planSession, bend, goDeeper, urgentPlan, pickCould, threeSteps, blockTimes, targetMinutes, OPENING, CLOSING } from '../../engine/curriculum.js';
import { programOf, startSession, blockStatus, moveBlock, closeSession, startUrgent, park, parkDone, recordStress, stressScores, setChecklist, checklistFor, homework, triggers, cardVariant, readiness, programRows, captureBaseline, nextSessionNumber, setNote } from '../../engine/program.js';
import { scorecard, snapshotValues, beforeAfter, testimonialPrompt, blindGuessTest } from '../../engine/outcomes.js';
import { setAnchor, AREAS } from '../../engine/anchors.js';
import { compute } from '../../engine/compute.js';
import { setField, createRow, addRow } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const TODAY = '2026-10-07'; const NOW = '2026-10-07T15:00:00.000Z';
const W = data.curricula.words;
const maya = () => { const rec = loadHousehold('maya-discovery'); return { rec, R: compute(rec, data, { today: TODAY }) }; };

test('the curricula load with the right shape: discovery plus twelve sessions, every session opens and closes the same way', () => {
  assert.deepEqual(validateCurricula(data), []);
  for (let n = 1; n <= 12; n++) { const s = sessionDef(data, n); assert.ok(s && s.name && s.goal, 'session ' + n); assert.deepEqual(s.blocks.slice(0, 2).map(b => b.id), OPENING.slice(0, 2)); assert.deepEqual(s.blocks.slice(-2).map(b => b.id), CLOSING); }
  const s1 = sessionDef(data, 1); const ids = s1.blocks.map(b => b.id);
  assert.deepEqual(ids, ['checkin', 'loops', 'plan', 'confirm', 'housing', 'gut', 'debtcheck', 'accounts1', 'picture', 'dream', 'match', 'roommateworst', 'forgotten', 'steps', 'close']);
  assert.deepEqual(s1.blocks.find(b => b.id === 'gut').minutes, { min: 8, target: 12, max: 20 });
  assert.equal(sessionDef(data, 2).blocks[3].id, 'dream', 'session 2 opens with the dream lap after the standing blocks');
});

test('planning session 1 for Maya: the debt check applies, the roommate card applies, the dream lap waits as a could block', () => {
  const { rec, R } = maya(); const p = planSession(rec, R, data, 1);
  const ids = p.blocks.map(b => b.id);
  assert.ok(ids.includes('roommateworst'), 'Maya has a roommate'); assert.ok(ids.includes('dream') && p.blocks.find(b => b.id === 'dream').priority === 'could');
  assert.equal(p.markers.behindAt, 35); assert.equal(p.markers.closeAt, 48);
  assert.equal(targetMinutes(p.blocks, 'steps') > 40, true);
});

test('bending: behind at minute 35 moves the should blocks not yet started; at minute 48 the close is protected; never-cut blocks never move', () => {
  const { rec, R } = maya(); const p = planSession(rec, R, data, 1);
  const behind = bend(p, { current: 'gut', started: ['checkin', 'loops', 'plan', 'confirm', 'housing', 'gut'], done: ['checkin', 'loops', 'plan', 'confirm', 'housing'] }, 36, { words: W });
  assert.equal(behind.action, 'behind'); assert.deepEqual(behind.moved.map(m => m.id + '>' + m.to), ['picture>2']); assert.equal(behind.note, 'First picture moved to next time');
  const onTime = bend(p, { current: 'steps', started: [], done: [] }, 36, { words: W }); assert.equal(onTime.action, 'none', 'at the close on time, nothing moves');
  const protect = bend(p, { current: 'accounts1', started: ['accounts1'], done: ['checkin', 'loops', 'plan', 'confirm', 'housing', 'gut'] }, 48, { words: W });
  assert.equal(protect.action, 'protect'); assert.equal(protect.jumpTo, 'steps');
  assert.ok(!protect.moved.some(m => ['steps', 'close', 'checkin', 'loops', 'plan'].includes(m.id)), 'never-cut and standing blocks stay');
  assert.ok(protect.moved.some(m => m.id === 'picture' && m.to === 2));
});

test('ahead: one could block is offered, picked by her goals; go deeper swaps a should block, never a must', () => {
  const { rec, R } = maya(); const p = planSession(rec, R, data, 1);
  const ahead = bend(p, { current: 'accounts1', started: [], done: [] }, 20, { words: W, record: rec });
  assert.equal(ahead.action, 'ahead'); assert.equal(ahead.offer, 'forgotten', 'Maya mentioned an old account');
  const rec2 = loadHousehold('maya'); rec2.discovery = { goals: [{ text: 'A life that feels different' }], form: { money: {} }, words: [] };
  assert.equal(pickCould(p, rec2, null).id, 'dream', 'a wish for something different points at the dream lap');
  const deeper = goDeeper(p, { started: ['gut'], done: [] }, 'gut', W);
  assert.deepEqual(deeper.moved.map(m => m.id), ['picture']); assert.ok(!deeper.moved.some(m => p.blocks.find(b => b.id === m.id).priority === 'must'));
  const none = goDeeper(p, { started: ['steps'], done: [] }, 'steps', W); assert.deepEqual(none.moved, []);
});

test('the dream lap moves from session 1 to session 2 and is planned there once', () => {
  const { rec, R } = maya();
  moveBlock(rec, 1, 'dream', 2, 'behind', { now: NOW });
  const p1 = planSession(rec, R, data, 1); assert.ok(!p1.blocks.some(b => b.id === 'dream')); assert.ok(p1.movedOut.some(m => m.block.id === 'dream' && m.to === 2));
  const p2 = planSession(rec, R, data, 2); assert.equal(p2.blocks.filter(b => b.id === 'dream').length, 1, 'session 2 already has the dream lap; no duplicate');
  moveBlock(rec, 1, 'picture', 2, 'behind', { now: NOW });
  const p2b = planSession(rec, R, data, 2); const pic = p2b.blocks.find(b => b.id === 'picture'); assert.ok(pic && pic.movedIn && pic.from === 1);
  assert.ok(p2b.blocks.indexOf(pic) < p2b.blocks.findIndex(b => b.id === 'steps'), 'moved-in blocks sit before the close');
});

test('urgent mode keeps check-in, the urgent thing, three steps and close; everything else moves to the next session; urgent sessions take no number; Flex absorbs overflow', () => {
  const { rec, R } = maya(); const p = planSession(rec, R, data, 1);
  const u = urgentPlan(p, data, 'overdraft');
  assert.deepEqual(u.blocks.map(b => b.id), ['checkin', 'urgent', 'steps', 'close']); assert.equal(u.note, 'Today is about an overdraft; everything else moves to next time');
  assert.ok(u.moved.every(m => m.to === 2) && u.moved.some(m => m.id === 'gut'));
  startSession(rec, 1, { now: NOW }); closeSession(rec, 1, {}, { now: NOW });
  startUrgent(rec, 'overdraft', 'rent bounced', false, { now: NOW });
  assert.equal(nextSessionNumber(rec), 2, 'the urgent session did not take a number');
  const rows = programRows(rec, R, data); const idx = rows.findIndex(r => r.key === 'u1'); assert.equal(rows[idx - 1].n, 1); assert.equal(rows[idx + 1].n, 2);
  moveBlock(rec, 10, 'promote', 11, 'behind', { now: NOW });
  assert.deepEqual(programOf(rec).flexAbsorbed.map(x => x.blockId), ['promote']); assert.ok(rows.find(r => r.n === 12), 'graduation stays at 12');
  assert.ok(rec.journal.filter(l => l.kind === 'program').length >= 4);
});

test('the parking lot carries into the next session until it is done', () => {
  const { rec, R } = maya(); const id = park(rec, 'Ask about the bonus', '#/ledger/income', { now: NOW, session: 's1' });
  const p2 = planSession(rec, R, data, 2); assert.equal(p2.parked.length, 1); assert.equal(p2.parked[0].text, 'Ask about the bonus');
  parkDone(rec, id, true, { now: NOW }); assert.equal(planSession(rec, R, data, 2).parked.length, 0);
});

test('knowledge targets and readiness: discovery leaves everything rough; session 1 counts the gut lap and the first accounts; unmet rolls forward in the text', () => {
  const { rec, R } = maya();
  assert.equal(readiness(rec, R, data, 0).text, 'Discovery targets: 3 of 3 met', 'guesses fill every area, so discovery leaves everything rough or a guess');
  let r1 = readiness(rec, R, data, 1); assert.equal(r1.met, 3); assert.ok(r1.missing.includes('tracking app linked') && r1.missing.includes('a gut figure for every area'));
  AREAS.forEach(c => setAnchor(rec, 'gut', 'spending:' + c, 30000, { now: NOW }));
  setAnchor(rec, 'gut', 'debt:total', 400000, { now: NOW });
  setChecklist(rec, 'rocket', { status: 'linked' }, { now: NOW, session: 1 }); setChecklist(rec, 'hysa', { status: 'opened' }, { now: NOW, session: 1 });
  r1 = readiness(rec, compute(rec, data, { today: TODAY }), data, 1); assert.equal(r1.text, 'Session 1 targets: 7 of 7 met');
  const r2 = readiness(rec, compute(rec, data, { today: TODAY }), data, 2); assert.ok(r2.missing.includes('guesses gone') && r2.missing.includes('Roth opened'));
});

test('the account checklist: order, triggers and the session split for Maya; unfinished session 1 items roll to session 2; a card balance shows the balance transfer', () => {
  const { rec, R } = maya(); const T = triggers(rec, R);
  assert.equal(T.movedOrForgotten, true, 'the old credit union account triggers the unclaimed property search'); assert.equal(T.employerBenefits, true); assert.equal(T.hsaEligible, false);
  const c1 = checklistFor(rec, R, data, 1); assert.deepEqual(c1.map(i => i.id), ['rocket', 'hysa', 'password']);
  assert.equal(c1[0].copy.indexOf('We are linking, not looking'), 0); assert.ok(c1[0].screenShare);
  setChecklist(rec, 'rocket', { status: 'linked', who: 'call' }, { now: NOW, session: 1 });
  const c2 = checklistFor(rec, R, data, 2); const ids = c2.map(i => i.id);
  assert.ok(!ids.includes('rocket'), 'linked is the end state for the tracking app, so it does not roll');
  assert.ok(ids.includes('hysa') && c2.find(i => i.id === 'hysa').rolled, 'the unopened savings rolls to session 2');
  assert.deepEqual(ids.filter(id => ['roth', 'k401', 'card', 'freeze'].includes(id)), ['roth', 'k401', 'card', 'freeze'], 'in order');
  assert.ok(ids.includes('unclaimed') && !ids.includes('hsa') && !ids.includes('ssa'));
  assert.equal(cardVariant(R).variant, 'rewards', 'no balance known yet');
  const card = createRow('debt', 'card', { nickname: 'Card', f: freshFacts(data.fields, 'debt', 'card') }); addRow(rec, card, { now: NOW });
  setField(rec, card.id, 'balance', 400000, 'known', 'client', { now: NOW }); setField(rec, card.id, 'apr', 0.24, 'known', 'client', { now: NOW }); setField(rec, card.id, 'minimum', 12000, 'known', 'client', { now: NOW, cad: 'month' });
  const R2 = compute(rec, data, { today: TODAY }); const v = cardVariant(R2); assert.equal(v.variant, 'balanceTransfer'); assert.equal(v.apr, 0.24);
  assert.equal(checklistFor(rec, R2, data, 2).find(i => i.id === 'card').variant.variant, 'balanceTransfer');
  const hw = homework(rec, R2, data, 2); assert.ok(hw.now.length <= 3 && hw.now.length + hw.waiting.length >= 4, 'at most three homework items a session');
});

test('three steps shows what she already did today and never more than three open items', () => {
  const s = threeSteps({ doneToday: [{ text: 'Opened your savings' }, { text: 'Linked your accounts' }], candidates: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] });
  assert.equal(s.done.length, 2); assert.equal(s.open.length, 3); assert.equal(s.text, 'Today you opened your savings, linked your accounts.');
});

test('block minutes feed the coach-only report across clients', () => {
  const { rec } = maya(); startSession(rec, 1, { now: NOW }); blockStatus(rec, 1, 'gut', 'done', 14.2, { now: NOW }); blockStatus(rec, 1, 'confirm', 'done', 6, { now: NOW });
  const rec2 = loadHousehold('maya'); startSession(rec2, 1, { now: NOW }); blockStatus(rec2, 1, 'gut', 'done', 10, { now: NOW });
  const rep = blockTimes([rec, rec2], data); const gut = rep.find(r => r.id === 'gut'); assert.equal(gut.n, 2); assert.equal(gut.target, 12); assert.equal(gut.max, 14.2);
});

test('stress scores are stored with dates and the scorecard compares discovery with now', () => {
  const { rec, R } = maya();
  recordStress(rec, 'discovery', 8, { now: '2026-10-01T15:00:00.000Z' }); recordStress(rec, 4, 5, { now: NOW }); recordStress(rec, 4, 6, { now: NOW });
  assert.deepEqual(stressScores(rec).map(s => [s.session, s.score, s.date]), [['discovery', 8, '2026-10-01'], [4, 6, '2026-10-07']]);
  captureBaseline(rec, Object.assign(snapshotValues(rec, R), { stress: 8 }), { now: '2026-10-01T15:00:00.000Z' });
  assert.equal(captureBaseline(rec, { stress: 1 }, { now: NOW }), null, 'the baseline is captured once');
  const sc = scorecard(rec, compute(rec, data, { today: TODAY })); const st = sc.find(r => r.id === 'stress');
  assert.equal(st.before, 8); assert.equal(st.now, 6); assert.equal(st.direction, 'better');
  const ba = beforeAfter(rec, compute(rec, data, { today: TODAY })); assert.ok(ba.every(r => r.beforeText && r.nowText));
  const t = testimonialPrompt(rec, compute(rec, data, { today: TODAY }), 'Maya'); assert.ok(t.ask.indexOf('went from 8 to 6') !== -1 && t.better >= 1);
  setNote(rec, 'routine', 'First Sunday, twenty minutes', { now: NOW }); assert.ok(readiness(rec, compute(rec, data, { today: TODAY }), data, 12).items.find(i => i.id === 'routine').met);
});

test('the session 9 blind guess test compares a fresh guess with the actuals and with session 4', () => {
  const { rec } = maya();
  rec.program = Object.assign(programOf(rec), { blindSpot: { s4: { pct: 0.3, perArea: { food: { ratio: 1.6 }, wants: { ratio: 2.0 } } } } });
  setAnchor(rec, 'blind', 'spending:food', 45000, { now: NOW }); setAnchor(rec, 'blind', 'spending:wants', 20000, { now: NOW });
  const t = blindGuessTest(rec, { food: 50000, wants: 25000, accommodation: 165000 });
  assert.equal(t.areas.find(a => a.area === 'food').ratio, 1.11); assert.equal(t.closer, 2); assert.equal(t.of, 2); assert.ok(t.blindSpotPct !== null && t.improved === false || t.improved === true);
});
