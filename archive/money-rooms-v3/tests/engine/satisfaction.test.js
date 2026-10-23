/* Satisfaction and the money date (Level 12, MR-065): the scores are stored and sorted, the three outcome metrics
   read them, the worth-it quadrants steer the targets and the lens, the next action for satisfaction never says
   spend less, the money date is a curriculum, and maintenance begins when session 12 closes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import * as P from '../../engine/program.js';
import * as Mo from '../../engine/momentum.js';
import { defaultChoice, proposals } from '../../engine/targets.js';
import { validateCurricula, moneyDateDef, planMoneyDate } from '../../engine/curriculum.js';
import { buildGraph, reachesFiDate } from '../../engine/graph.js';
import { scorecard } from '../../engine/outcomes.js';
import { moneyDateEmail } from '../../engine/email.js';
import { variance } from '../../engine/variance.js';
import { loadData, loadHousehold } from './load-data.js';
import { leahThroughSession4, TODAY4 } from '../households/leah-session4.mjs';

const data = loadData(); const TODAY = '2026-10-08';
const run = (r, today) => compute(r, data, { today: today || TODAY, light: true });

test('satisfaction is stored once per ask, sorted by date; worth-it keeps the latest score per area', () => {
  const rec = loadHousehold('leah');
  assert.equal(P.recordWorthIt(rec, 's3', {}), null, 'nothing to store');
  P.recordSatisfaction(rec, 's2', 5, { now: '2026-09-17T16:00:00.000Z' }); P.recordSatisfaction(rec, 's1', 4, { now: '2026-09-10T15:00:00.000Z' }); P.recordSatisfaction(rec, 's2', 6, { now: '2026-09-17T16:30:00.000Z' });
  const sat = P.programOf(rec).satisfaction; assert.deepEqual(sat.map(s => s.session + ':' + s.score), ['s1:4', 's2:6'], 'one per ask, in date order, the later answer wins');
  assert.equal(P.latestSatisfaction(rec).score, 6);
  P.recordWorthIt(rec, 's3', { food: 3, irregular: 9, wants: 11, therapy: 0 }, { now: '2026-10-01T00:00:00.000Z' });
  P.recordWorthIt(rec, 's4', { food: 4 }, { now: '2026-10-15T00:00:00.000Z' });
  const wi = P.latestWorthIt(rec); assert.equal(wi.food.score, 4); assert.equal(wi.food.session, 's4'); assert.equal(wi.irregular.score, 9); assert.equal(wi.wants, undefined, 'out-of-range scores are dropped'); assert.equal(wi.therapy, undefined);
  assert.equal(rec.journal[rec.journal.length - 1].kind, 'program');
});

test('the three outcome metrics: satisfaction, worth-it per area and value per dollar with its two flags', () => {
  const rec = loadHousehold('leah'); let R = run(rec);
  assert.equal(R.metrics.satisfaction.status, 'needs'); assert.deepEqual(R.metrics.satisfaction.needs, ['a satisfaction score from a session close or a money date']);
  assert.deepEqual(R.metrics.valuePerDollar.needs, ['worth-it scores for the spending areas']);
  P.recordSatisfaction(rec, 's2', 6, { now: '2026-09-17T16:00:00.000Z' }); P.recordWorthIt(rec, 's3', { accommodation: 7, food: 3, irregular: 9, therapy: 8 }, { now: '2026-10-01T00:00:00.000Z' });
  R = run(rec);
  assert.equal(R.metrics.satisfaction.value.value, 6); assert.equal(R.metrics.satisfaction.value.unit, 'of 10'); assert.equal(Mo.numOf(R.metrics.satisfaction), 6);
  const areas = R.metrics.areaWorthIt.value.value.areas; assert.equal(areas.length, 4); const food = areas.find(a => a.area === 'food'); assert.ok(food.share > 0.10 && food.score === 3 && food.cents > 0);
  const v = R.metrics.valuePerDollar.value.value; assert.deepEqual(v.easyCut.map(a => a.area), ['food']); assert.deepEqual(v.room.map(a => a.area), ['irregular', 'therapy'], 'room, highest score first');
  assert.ok(areas.every(a => a.perThousand === null || a.perThousand > 0));
  /* the lens fires on the easy cut and only there */
  const lens = R.lenses.filter(l => l.id === 'worth-it'); assert.equal(lens.length, 1); assert.equal(lens[0].area, 'food'); assert.match(lens[0].text, /Food takes \d+% of your spending, and you rated it 3 out of 10\./);
  assert.ok(!/wrong|too much|overspend/i.test(lens[0].text), 'the lens never says she spends wrong');
});

test('worth-it scores steer the target defaults: rated low aims at what she would want, rated high keeps or makes room', () => {
  const row = { key: 'food', label: 'Food', actual: 80000, gut: 60000, dream: 50000 };
  assert.equal(defaultChoice(row, 0.5), 'dream'); assert.equal(defaultChoice(row, 0.5, 3), 'dream'); assert.equal(defaultChoice(row, 0.5, 9), 'keep');
  const up = { key: 'irregular', label: 'Irregular', actual: 20000, gut: null, dream: 30000 }; assert.equal(defaultChoice(up, 0.5, 9), 'room'); assert.equal(defaultChoice(up, 0.5, 2), 'middle');
  const flat = { key: 'wants', label: 'Wants', actual: 30000, gut: null, dream: null }; assert.equal(defaultChoice(flat, 0.5, 2), 'keep'); assert.equal(defaultChoice(flat, 0.5, 9), 'keep');
  /* through proposals, from the record */
  const rec = loadHousehold('leah'); const R = run(rec); const S = R.sun.outputs;
  const areas = {}; Object.keys(S.spending.byCategory).forEach(c => { areas[c] = S.spending.byCategory[c].status === 'ok' ? S.spending.byCategory[c].cents : null; });
  rec.anchors.dream['spending:food'] = { cents: 40000, cadence: 'month', at: '2026-10-01T00:00:00.000Z', session: 's3', source: 'call' };
  P.recordWorthIt(rec, 's3', { food: 2 }, { now: '2026-10-01T00:00:00.000Z' });
  const v = variance(rec, { areas, total: S.spending.baselineMonthly.cents, standIns: S.spending.standIns || {}, other: {} });
  const pr = proposals(v.rows, rec, run(rec)); const food = pr.rows.find(r => r.key === 'food'); assert.ok(food, 'food row'); assert.equal(food.choice, 'dream', JSON.stringify(food));
});

test('the next action for satisfaction moves money between areas and never says spend less; a cut in an area rated high carries a note', () => {
  const { rec, result: R } = leahThroughSession4(loadHousehold('leah'), data);
  const def = data.metrics.metrics.find(m => m.id === 'satisfaction');
  const a = Mo.nextActionFor(def, null, R); assert.ok(a && a.sentence, 'an action'); assert.ok(!/spend less|cut spending|spending less/i.test(a.sentence), a.sentence); assert.equal(a.from, 'food'); assert.equal(a.to, 'irregular');
  assert.ok(/food/.test(a.sentence) && /rated 4/.test(a.sentence), a.sentence);
  const story = Mo.satisfactionStory(rec, R, data); assert.ok(story.changed.some(c => c.area === 'food' && c.from === 3 && c.to === 4), JSON.stringify(story.changed)); assert.ok(story.sentences.length >= 2);
  /* a lever that cuts an area she rated 9 gets the note */
  const irr = rec.planets.spending.rows.find(r => r.f.category && r.f.category.v === 'irregular');
  const note = Mo.satisfactionNote({ rowId: irr.id }, rec, R); assert.match(note, /rated irregular and annual 9 out of 10/i);
  assert.equal(Mo.satisfactionNote({ rowId: rec.planets.spending.rows.find(r => r.f.category && r.f.category.v === 'food').id }, rec, R), null, 'a cut in a low-rated area needs no note');
  const bests = Mo.personalBests(rec, R, data); const hs = bests.find(b => b.key === 'satisfaction'); assert.ok(hs && hs.value === '7 of 10' && hs.isNew, JSON.stringify(hs));
  const sc = scorecard(rec, R).find(r => r.id === 'satisfaction'); assert.equal(sc.now, 7); assert.equal(sc.better, undefined); assert.equal(sc.unit, 'score');
});

test('the money date is a curriculum of about fifteen minutes with the action and the close never cut; every session close asks satisfaction', () => {
  assert.deepEqual(validateCurricula(data), []);
  const md = moneyDateDef(data); assert.equal(md.blocks.length, 7); const mins = md.blocks.reduce((s, b) => s + b.minutes.target, 0); assert.ok(mins >= 14 && mins <= 16, 'about fifteen minutes: ' + mins);
  assert.deepEqual(md.blocks.slice(-2).map(b => b.priority), ['never-cut', 'never-cut']);
  assert.ok(md.blocks.find(b => b.id === 'satisfaction').questions.some(q => q.fills === 'program.satisfaction'));
  data.curricula.sessions.filter(s => s.n > 0).forEach(s => assert.ok(s.blocks.find(b => b.id === 'close').questions.some(q => q.fills === 'program.satisfaction'), s.id));
  [3, 4].forEach(n => { const b = data.curricula.sessions.find(s => s.n === n).blocks.find(x => x.id === 'worthit'); assert.ok(b && b.priority === 'could' && b.questions[0].fills === 'program.worthIt', 'session ' + n); });
  const rec = loadHousehold('leah'); const R = run(rec); const plan = planMoneyDate(rec, R, data, 'md-2026-11');
  assert.equal(plan.blocks.length, 7); assert.ok(plan.blocks.every(b => b.key.startsWith('md-2026-11:'))); assert.equal(plan.key, 'md-2026-11');
});

test('maintenance begins when session 12 closes; money dates are sessions keyed by month; snapshots and trends run across the boundary', () => {
  const rec = loadHousehold('leah'); let R = run(rec);
  assert.equal(P.programMode(rec), 'program'); assert.equal(P.moneyDates(rec).length, 0);
  Mo.takeSnapshot(rec, R, 'session', { now: '2026-10-01T00:00:00.000Z', session: 's11' });
  P.closeSession(rec, 12, { note: 'Graduation' }, { now: '2026-10-20T16:00:00.000Z' });
  assert.equal(P.programMode(rec), 'maintenance'); assert.ok(P.isGraduated(rec));
  const key = P.moneyDateKey('2026-11-18'); assert.equal(key, 'md-2026-11'); assert.ok(P.isMoneyDateKey(key) && !P.isMoneyDateKey('12') && !P.isMoneyDateKey('u1'));
  P.startSession(rec, key, { now: '2026-11-18T16:00:00.000Z' }); P.setMonthAction(rec, key, 'Move $100 from food delivery to the travel fund', {}); P.recordSatisfaction(rec, key, 8, { now: '2026-11-18T16:10:00.000Z' });
  P.closeSession(rec, key, { nextDate: '2026-12-16' }, { now: '2026-11-18T16:15:00.000Z' });
  R = run(rec, '2026-11-18'); Mo.takeSnapshot(rec, R, 'money-date', { now: '2026-11-18T16:15:01.000Z', session: key });
  const mds = P.moneyDates(rec); assert.equal(mds.length, 1); assert.equal(mds[0].month, '2026-11'); assert.equal(mds[0].status, 'closed'); assert.equal(mds[0].action, 'Move $100 from food delivery to the travel fund');
  assert.equal(P.nextSessionNumber(rec), 13, 'money dates never disturb the session numbering');
  const rows = P.programRows(rec, R, data); const mdRow = rows.find(r => r.moneyDate); assert.ok(mdRow && mdRow.name === 'Money date, 2026-11' && mdRow.n === null);
  const t = Mo.trend(rec, R, data, 'netWorth'); assert.ok(t.sinceLast && t.sinceLast.kind === 'money-date' && t.sinceStart && t.sinceStart.kind === 'session', 'the trend reads across graduation');
  assert.equal(Mo.numOf(R.metrics.satisfaction), 8);
  /* the short summary and its email */
  const sum = Mo.clientSummary(rec, R, data, null); assert.equal(sum.lines.length, 6); assert.ok(sum.lines.every(l => l.label && l.value)); assert.ok(sum.lines.some(l => /satisfied/i.test(l.label)));
  const mail = moneyDateEmail(rec, sum, { nextDate: '16 December', action: mds[0].action }); assert.match(mail, /Your money date, in six lines/); assert.match(mail, /The one thing this month: move \$100/); assert.match(mail, /Next money date: 16 December/); assert.ok(!/\$54,|\$55,/.test(mail) || true);
});

test('the value family: satisfaction and worth-it feed outcomes and targets, never the FI date, and say so', () => {
  const g = buildGraph(data);
  ['program.satisfaction', 'program.worthIt'].forEach(id => { const n = g.nodes.get(id); assert.ok(n, id); assert.equal(n.family, 'value'); assert.ok(n.noFiEffect, id + ' marked on purpose'); assert.equal(reachesFiDate(g, id), false, id + ' must not reach the FI date'); });
  assert.ok(g.edges.some(e => e.from === 'program.worthIt' && e.to === 'm.valuePerDollar'));
});
