/* Level 11: the goal timeline. Maya's goals are typed here by hand and tied
   out to tests/households/expected-goals.py (goals-expected.json), which
   never reads the engine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocate, assess, planGoals, goalsOf, nextWin, finishChanges, MODES } from '../../engine/goals.js';
import { icsOf, goalEvents } from '../../engine/ics.js';
import { compute } from '../../engine/compute.js';
import { setGoals, createRecord, defaultGoals } from '../../engine/record.js';
import { loadData, loadHousehold } from './load-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const X = JSON.parse(fs.readFileSync(path.join(here, '..', 'households', 'goals-expected.json'), 'utf8'));
const data = loadData(); const TODAY = '2026-10-07';

/* Maya's goals, by hand: surplus about 700 a month, 2,500 in savings, one month of spending as the floor, a card at 24%, two dated goals, a trip. */
function mayaItems() {
  const I = X.inputs;
  return [
    { id: 'starter', type: 'floor', name: 'Starter cushion', targetCents: I.starter, balanceCents: Math.min(I.cash, I.starter), locked: true },
    { id: 'card', type: 'debt', name: 'Credit card', targetCents: I.card.balance, remainingCents: I.card.balance, rate: I.card.apr, minimum: I.card.minimum, promoApr: null, promoEnd: null, highInterest: true },
    { id: 'full', type: 'amount', name: 'Full cushion', targetCents: I.full, balanceCents: Math.max(0, I.cash - I.starter) },
    { id: 'bach', type: 'dated', name: 'Bachelorette', targetCents: 120000, balanceCents: 0, targetDate: '2027-04' },
    { id: 'wedding', type: 'dated', name: 'Wedding', targetCents: 200000, balanceCents: 0, targetDate: '2027-09' },
    { id: 'trip', type: 'amount', name: 'Nashville trip', targetCents: 150000, balanceCents: 0 },
    { id: 'rung:regularFi', type: 'long-term', name: 'FI', targetCents: 120000000, monthsAway: 264 },
  ].map((it, k) => Object.assign(it, { priority: k + 1 }));
}
const input = (extra) => Object.assign({ from: X.inputs.from_, surplusMonthly: X.inputs.surplus, items: mayaItems(), mode: 'deadlines-first', splits: {}, overrides: {}, starterTarget: X.inputs.starter, events: [] }, extra || {});

MODES.forEach(mode => test('Maya in ' + mode + ' ties out to the workpaper: finish months, interest, goals on time, the floor first', () => {
  const E = X[mode]; const r = allocate(input({ mode })); const a = assess(input({ mode }), r);
  Object.keys(E.finish).forEach(id => assert.equal(r.goals[id].finishMonth, E.finish[id], mode + ' ' + id));
  assert.equal(r.totalInterest, E.interest, 'interest');
  assert.equal(r.starterFills, E.starterFills);
  const onTime = ['bach', 'wedding'].filter(id => a[id].status === 'on-time').length; assert.equal(onTime, E.onTime);
  /* the floor: every goal dollar goes to the starter cushion in month 1, in every mode */
  Object.keys(E.fundedMonth1).forEach(id => assert.equal(r.goals[id].funded[0], E.fundedMonth1[id], mode + ' month 1 ' + id));
  Object.keys(E.fundedDec).forEach(id => assert.equal(r.goals[id].funded[2], E.fundedDec[id], mode + ' December ' + id));
}));

test('the starter cushion fills within two months and its money rolls into the mode the next month', () => {
  const r = allocate(input());
  assert.equal(r.starterFills, '2026-11');
  assert.equal(r.goals.starter.funded[0], 70000); assert.equal(r.goals.starter.funded[1], 70000); assert.equal(r.goals.starter.funded[2], 0);
  const roll = r.rollovers.find(x => x.from === 'starter'); assert.ok(roll); assert.equal(roll.month, '2026-12');
});

test('deadlines first lands both dated goals on time and the bachelorette money rolls forward in May', () => {
  const r = allocate(input()); const a = assess(input(), r);
  assert.equal(a.bach.status, 'on-time'); assert.equal(a.wedding.status, 'on-time');
  assert.equal(r.goals.bach.funded[6], X['deadlines-first'].fundedBachApril); assert.equal(r.goals.bach.funded[7], 0);
  const roll = r.rollovers.find(x => x.from === 'bach'); assert.ok(roll); assert.equal(roll.month, '2027-05'); assert.ok(roll.cents > 0);
});

test('a withdrawal from the cushion makes the floor first again, marks the refill, and names the floor as the reason the bachelorette slips', () => {
  const inp = input({ events: [{ month: '2027-03', kind: 'withdraw', cents: 100000 }] });
  const r = allocate(inp); const a = assess(inp, r);
  assert.equal(r.goals.starter.funded[5], X.withdraw.starterMarch); assert.equal(r.goals.bach.funded[5], X.withdraw.bachMarch);
  assert.deepEqual(r.goals.starter.refills, ['2027-03']);
  Object.keys(X.withdraw.finish).forEach(id => assert.equal(r.goals[id].finishMonth, X.withdraw.finish[id], id));
  assert.equal(a.bach.status, 'behind'); assert.equal(a.bach.floorReason, true); assert.ok(a.bach.shortfallMonthly > 0); assert.equal(a.bach.earliestMonth, '2027-05');
});

test('a windfall and an extra 100 a month move the dates the way the workpaper says', () => {
  const w = allocate(input({ events: [{ month: '2027-01', kind: 'windfall', cents: 200000 }] }));
  Object.keys(X.windfall.finish).forEach(id => assert.equal(w.goals[id].finishMonth, X.windfall.finish[id], 'windfall ' + id));
  const p = allocate(input({ surplusMonthly: X.inputs.surplus + 10000 }));
  Object.keys(X.plus100.finish).forEach(id => assert.equal(p.goals[id].finishMonth, X.plus100.finish[id], 'plus 100 ' + id));
});

test('a locked amount is honoured after the floor and never on the floor', () => {
  const r = allocate(input({ overrides: { trip: 30000, starter: 5000 } }));
  assert.equal(r.goals.trip.funded[0], 0, 'nothing while the floor is open'); assert.equal(r.goals.starter.funded[0], 70000, 'the floor ignores its own lock');
  assert.equal(r.goals.trip.funded[2], 30000); assert.equal(r.goals.trip.funded[3], 30000); assert.equal(r.goals.trip.finishMonth, '2027-04', 'five locked months of 300 finish the 1,500 trip');
});

test('a paid-off debt frees its minimum into the surplus the next month', () => {
  const r = allocate(input({ mode: 'one-at-a-time' }));
  const k = r.months.indexOf(r.goals.card.finishMonth);
  const total = m => Object.values(r.goals).reduce((s, g) => s + (g.funded[m] || 0), 0);
  assert.equal(total(k + 1) - total(k), X.inputs.card.minimum);
  assert.ok(r.goals.card.interest > 0);
  const roll = r.rollovers.find(x => x.from === 'card'); assert.ok(roll); assert.equal(roll.month, r.months[k + 1]);
});

test('all at once splits by percent and the default is even', () => {
  const r = allocate(input({ mode: 'all-at-once' }));
  const m = 2; const open = ['card', 'full', 'bach', 'wedding', 'trip'];
  open.forEach(id => assert.equal(r.goals[id].funded[m], 14000, id));
  const r2 = allocate(input({ mode: 'all-at-once', splits: { bach: 0.6, card: 0.1, full: 0.1, wedding: 0.1, trip: 0.1 } }));
  assert.equal(r2.goals.bach.funded[m], 42000);
});

test('a shortfall is never silent: one at a time says what the dated goals need and when they could land instead', () => {
  const inp = input({ mode: 'one-at-a-time' }); const r = allocate(inp); const a = assess(inp, r);
  assert.equal(a.bach.status, 'behind'); assert.ok(a.bach.shortfallMonthly > 0); assert.equal(a.bach.earliestMonth, X['one-at-a-time'].finish.bach); assert.equal(a.bach.floorReason, false);
});

test('the comparison runs all three modes with the floor identical in each', () => {
  const rec = loadHousehold('maya'); const R = compute(rec, data, { today: TODAY }); const P = R.goalPlan;
  assert.equal(P.compare.length, 3); assert.deepEqual(P.compare.map(c => c.mode), MODES);
  assert.ok(P.compare.every(c => c.starterFills === P.compare[0].starterFills));
  assert.ok(P.compare.every(c => typeof c.interest === 'number' && typeof c.onTime === 'number'));
});

test('long-term goals read the FI ladder and the full cushion reads the Rule of 5 target with the roommate gap', () => {
  const rec = loadHousehold('maya-discovery'); const R = compute(rec, data, { today: TODAY }); const G = goalsOf(rec, R);
  const full = G.items.find(i => i.id === 'full'); const starter = G.items.find(i => i.id === 'starter');
  assert.equal(starter.targetCents, R.sun.outputs.safety.spendingWithPremiums.cents);
  assert.equal(full.targetCents, R.sun.outputs.safety.ruleOf5Target.cents - starter.targetCents);
  assert.ok(R.sun.outputs.safety.roommateGap && R.sun.outputs.safety.roommateGap.cents > 0, 'the roommate gap is inside the target');
  const demo = compute(loadHousehold('maya'), data, { today: TODAY }); const items = goalsOf(loadHousehold('maya'), demo).items;
  const fi = items.find(i => i.id === 'rung:regularFi'); assert.equal(fi.type, 'long-term'); assert.equal(fi.monthsAway, demo.ladder.rungs.find(r => r.id === 'regularFi').months);
  assert.equal(demo.goalPlan.assessment['rung:regularFi'].status, 'projected');
  assert.ok(Math.abs(parseInt(demo.goalPlan.assessment['rung:regularFi'].finishMonth.slice(0, 4), 10) - parseInt(String(demo.metrics.fiDate.value.value).slice(0, 4), 10)) <= 1, 'the FI rung lands within a year of the FI date');
});

test('the order of operations is the default priority and the starter cushion is locked first', () => {
  const rec = loadHousehold('maya'); const R = compute(rec, data, { today: TODAY }); const G = goalsOf(rec, R);
  assert.equal(G.items[0].id, 'starter'); assert.equal(G.items[0].locked, true);
  assert.equal(G.items[1].type, 'debt'); assert.ok(G.items[1].highInterest);
  assert.equal(G.items[2].id, 'full');
  setGoals(rec, { order: ['full', 'debt:m-csp'] }, { now: TODAY + 'T00:00:00Z' });
  const G2 = goalsOf(rec, compute(rec, data, { today: TODAY }));
  assert.equal(G2.items[1].id, 'full'); assert.equal(G2.items[0].id, 'starter');
  setGoals(rec, { order: ['starter', 'full'] }, { now: TODAY + 'T00:00:00Z' });
  assert.equal(goalsOf(rec, compute(rec, data, { today: TODAY })).items[0].id, 'starter', 'nothing goes above the floor');
  assert.equal(rec.journal.filter(l => l.kind === 'goals').length, 2);
});

test('the next win sentence names the earliest finish and what-ifs never touch the record', () => {
  const inp = input(); const r = allocate(inp); const a = assess(inp, r);
  assert.deepEqual(nextWin(inp, r, a), { id: 'starter', month: '2026-11' });
  const rec = loadHousehold('maya'); const before = JSON.stringify(rec); const R = compute(rec, data, { today: TODAY });
  planGoals(rec, R, { surplusDelta: 10000, events: [{ month: '2027-01', kind: 'windfall', cents: 500000 }], mode: 'one-at-a-time' });
  assert.equal(JSON.stringify(rec), before);
});

test('since last time: finish changes read as moved up or back', () => {
  const ch = finishChanges({ bach: '2027-05', wedding: '2027-09', trip: null }, { bach: '2027-04', wedding: '2027-11', trip: '2029-07' }, mayaItems());
  assert.deepEqual(ch.map(c => c.text), ['Bachelorette moved up a month', 'Wedding moved back 2 months', 'Nashville trip now has a date']);
});

test('the calendar file is valid ics: all-day events, plain titles, CRLF', () => {
  const inp = input(); const r = allocate(inp); const a = assess(inp, r);
  const plan = { input: inp, run: r, assessment: a };
  const ev = goalEvents(plan, [{ id: 's1', label: 'Session 1', at: '2026-10-01T15:00:00.000Z' }]);
  assert.equal(ev[0].title, 'Session 1'); assert.ok(ev.some(e => e.title === 'Starter cushion complete' && e.date === '2026-11-01'));
  const text = icsOf(ev, { stamp: '2026-10-07T15:00:00.000Z', name: 'Maya goals' });
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, ev.length);
  assert.ok(text.indexOf('DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102') !== -1);
  assert.ok(text.indexOf('SUMMARY:Starter cushion complete') !== -1);
  assert.ok(!/\$\d/.test(text), 'no numbers in titles'); assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});

test('schema 4: a new record carries the goal settings and setGoals journals the change', () => {
  const rec = createRecord({ id: 'g', now: '2026-10-07T00:00:00.000Z' });
  assert.deepEqual(rec.goals, defaultGoals());
  const line = setGoals(rec, { mode: 'all-at-once' }, { now: '2026-10-07T00:00:01.000Z' });
  assert.equal(line.kind, 'goals'); assert.equal(rec.goals.mode, 'all-at-once');
  assert.equal(setGoals(rec, { mode: 'all-at-once' }, {}), null, 'no change, no line');
});
