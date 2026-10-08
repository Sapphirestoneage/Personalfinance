/* Level 11: the goal timeline. Maya's goals are typed here by hand and tied
   out to tests/households/expected-goals.py (goals-expected.json), which
   never reads the engine. The cushion is one pot in three steps. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocate, assess, planGoals, goalsOf, nextWin, finishChanges, finishMonths, celebrations, cushionTargets, goalDraws, quickDraws, MODES, FLOOR_IDS } from '../../engine/goals.js';
import { goalFi, fiMonthOf } from '../../engine/fieffect.js';
import { project } from '../../engine/projection.js';
import { projectWith } from '../../engine/scenarios.js';
import { icsOf, goalEvents } from '../../engine/ics.js';
import { compute } from '../../engine/compute.js';
import { setGoals, createRecord, defaultGoals } from '../../engine/record.js';
import { loadData, loadHousehold } from './load-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const X = JSON.parse(fs.readFileSync(path.join(here, '..', 'households', 'goals-expected.json'), 'utf8'));
const data = loadData(); const TODAY = '2026-10-07';

/* Maya's goals, by hand: surplus about 700 a month, 2,500 in savings, a lean month of 2,450, a full month of 3,600, a card at 24%, two dated goals, a trip. */
function mayaItems(cash) {
  const I = X.inputs; const pot = cash === undefined ? I.cash : cash;
  return [
    { id: 'lean', step: 1, type: 'floor', name: 'Lean month', clientName: 'Lean month covered', doneWord: 'a lean month', targetCents: I.lean, balanceCents: Math.min(pot, I.lean), locked: true },
    { id: 'fullmonth', step: 2, type: 'floor', name: 'Full month', clientName: 'Full month covered', doneWord: 'a full month', targetCents: I.fullMonth, balanceCents: Math.min(pot, I.fullMonth), locked: true },
    { id: 'card', type: 'debt', name: 'Credit card', targetCents: I.card.balance, remainingCents: I.card.balance, rate: I.card.apr, minimum: I.card.minimum, promoApr: null, promoEnd: null, highInterest: true },
    { id: 'full', step: 3, type: 'amount', name: 'Full cushion', clientName: 'Full cushion', doneWord: 'the full cushion', targetCents: I.rule5, balanceCents: Math.min(pot, I.rule5) },
    { id: 'bach', type: 'dated', name: 'Bachelorette', targetCents: 120000, balanceCents: 0, targetDate: '2027-04' },
    { id: 'wedding', type: 'dated', name: 'Wedding', targetCents: 200000, balanceCents: 0, targetDate: '2027-09' },
    { id: 'trip', type: 'amount', name: 'Nashville trip', targetCents: 150000, balanceCents: 0 },
    { id: 'rung:regularFi', type: 'long-term', name: 'FI', targetCents: 120000000, monthsAway: 264 },
  ].map((it, k) => Object.assign(it, { priority: k + 1 }));
}
const input = (extra, cash) => Object.assign({ from: X.inputs.from_, surplusMonthly: X.inputs.surplus, items: mayaItems(cash), mode: 'deadlines-first', splits: {}, overrides: {}, events: [] }, extra || {});

MODES.forEach(mode => test('Maya in ' + mode + ' ties out to the workpaper: finish months, interest, goals on time, the floors first', () => {
  const E = X[mode]; const inp = input({ mode }); const r = allocate(inp); const a = assess(inp, r);
  Object.keys(E.finish).forEach(id => assert.equal(r.goals[id].finishMonth, E.finish[id], mode + ' ' + id));
  assert.equal(r.totalInterest, E.interest, 'interest');
  assert.equal(r.goals.lean.doneAtStart, true, 'step 1 is already met at creation'); assert.equal(a.lean.status, 'done'); assert.equal(a.lean.alreadyMet, true);
  assert.equal(r.floorsFull, '2026-11', 'step 2 fills within two months');
  const onTime = ['bach', 'wedding'].filter(id => a[id].status === 'on-time').length; assert.equal(onTime, E.onTime);
  Object.keys(E.fundedMonth1).forEach(id => assert.equal(r.goals[id].funded[0], E.fundedMonth1[id], mode + ' month 1 ' + id));
  Object.keys(E.fundedMonth2).forEach(id => assert.equal(r.goals[id].funded[1], E.fundedMonth2[id], mode + ' month 2 ' + id));
  Object.keys(E.fundedDec).forEach(id => assert.equal(r.goals[id].funded[2], E.fundedDec[id], mode + ' December ' + id));
}));

test('one pot, three steps in order: a smaller pot fills the lean month first, then the full month, then rolls into the mode', () => {
  const E = X.smallPot; const inp = input({}, 100000); const r = allocate(inp);
  Object.keys(E.finish).forEach(id => assert.equal(r.goals[id].finishMonth, E.finish[id], id));
  [E.fundedMonth1, E.fundedMonth2, E.fundedMonth3].forEach((F, m) => Object.keys(F).forEach(id => assert.equal(r.goals[id].funded[m], F[id], 'month ' + (m + 1) + ' ' + id)));
  assert.equal(r.goals.lean.balances[0], 170000, 'the pot counts toward step 1 first'); assert.equal(r.goals.fullmonth.balances[0], 170000); assert.equal(r.goals.full.balances[0], 170000);
  /* the lean month fills part way through December and the rest of that month's money moves to the full month the same month; the full month fills in January and the rest goes to the mode */
  const toStep2 = r.rollovers.find(x => x.from === 'lean'); assert.ok(toStep2); assert.equal(toStep2.to, 'fullmonth'); assert.equal(toStep2.month, '2026-12');
  const toMode = r.rollovers.find(x => x.from === 'fullmonth'); assert.ok(toMode); assert.equal(toMode.month, '2027-01'); assert.ok(!FLOOR_IDS.includes(toMode.to));
});

test('step 2 money rolls into the mode and the bachelorette money rolls forward in May', () => {
  const r = allocate(input()); const a = assess(input(), r);
  assert.equal(r.goals.fullmonth.funded[0], 70000); assert.equal(r.goals.fullmonth.funded[1], 40000); assert.equal(r.goals.fullmonth.funded[2], 0);
  assert.equal(a.bach.status, 'on-time'); assert.equal(a.wedding.status, 'on-time');
  assert.equal(r.goals.bach.funded[6], X['deadlines-first'].fundedBachApril); assert.equal(r.goals.bach.funded[7], 0);
  const roll = r.rollovers.find(x => x.from === 'bach'); assert.ok(roll); assert.equal(roll.month, '2027-05'); assert.ok(roll.cents > 0);
});

test('using the cushion reopens the steps above the pot: step 1 refills before step 2, the refills are marked, and the full month is named as the reason the bachelorette slips', () => {
  const inp = input({ events: [{ month: '2027-03', kind: 'withdraw', cents: 200000 }] });
  const r = allocate(inp); const a = assess(inp, r);
  assert.equal(r.goals.lean.funded[5], X.withdraw.leanMarch); assert.equal(r.goals.fullmonth.funded[5], X.withdraw.fullmonthMarch); assert.equal(r.goals.fullmonth.funded[6], X.withdraw.fullmonthApril); assert.equal(r.goals.bach.funded[5], X.withdraw.bachMarch);
  assert.deepEqual(r.goals.lean.refills, ['2027-03']); assert.deepEqual(r.goals.fullmonth.refills, ['2027-03']);
  Object.keys(X.withdraw.finish).forEach(id => assert.equal(r.goals[id].finishMonth, X.withdraw.finish[id], id));
  assert.equal(a.bach.status, 'behind'); assert.equal(a.bach.floorReason, true); assert.equal(a.bach.floorStep, 'fullmonth'); assert.equal(a.bach.after, '2027-05'); assert.ok(a.bach.shortfallMonthly > 0); assert.equal(a.bach.earliestMonth, '2027-06');
});

test('a windfall and an extra 100 a month move the dates the way the workpaper says', () => {
  const w = allocate(input({ events: [{ month: '2027-01', kind: 'windfall', cents: 200000 }] }));
  Object.keys(X.windfall.finish).forEach(id => assert.equal(w.goals[id].finishMonth, X.windfall.finish[id], 'windfall ' + id));
  const p = allocate(input({ surplusMonthly: X.inputs.surplus + 10000 }));
  Object.keys(X.plus100.finish).forEach(id => assert.equal(p.goals[id].finishMonth, X.plus100.finish[id], 'plus 100 ' + id));
});

test('a locked amount is honoured after the floors and never on steps 1 or 2', () => {
  const r = allocate(input({ overrides: { trip: 30000, lean: 5000, fullmonth: 5000 } }, 100000));
  assert.equal(r.goals.trip.funded[0], 0, 'nothing while a floor is open'); assert.equal(r.goals.lean.funded[0], 70000, 'the floors ignore their own locks');
  assert.equal(r.goals.trip.funded[3], 20000, 'the month the full month fills, the lock gets what is left'); assert.equal(r.goals.trip.funded[4], 30000);
});

test('a paid-off debt frees its minimum into the surplus the next month', () => {
  const r = allocate(input({ mode: 'one-at-a-time' }));
  const k = r.months.indexOf(r.goals.card.finishMonth);
  const total = m => Object.values(r.goals).reduce((s, g) => s + (g.funded[m] || 0), 0);
  assert.equal(total(k + 1) - total(k), X.inputs.card.minimum);
  assert.ok(r.goals.card.interest > 0);
  const roll = r.rollovers.find(x => x.from === 'card'); assert.ok(roll); assert.equal(roll.month, r.months[k], 'the card clears part way through the month, so the rest of that month already moved on');
});

test('all at once splits by percent and the default is even', () => {
  const r = allocate(input({ mode: 'all-at-once' }));
  const m = 2; const open = ['card', 'full', 'bach', 'wedding', 'trip'];
  open.forEach(id => assert.equal(r.goals[id].funded[m], 14000, id));
  const r2 = allocate(input({ mode: 'all-at-once', splits: { bach: 0.6, card: 0.1, full: 0.1, wedding: 0.1, trip: 0.1 } }));
  assert.equal(r2.goals.bach.funded[m], 42000);
});

test('a shortfall is never silent: one at a time says what the dated goals need and when they could land instead, and does not blame the cushion', () => {
  const inp = input({ mode: 'one-at-a-time' }); const r = allocate(inp); const a = assess(inp, r);
  assert.equal(a.bach.status, 'behind'); assert.ok(a.bach.shortfallMonthly > 0); assert.equal(a.bach.earliestMonth, X['one-at-a-time'].finish.bach); assert.equal(a.bach.floorReason, false);
});

test('the comparison runs all three modes with the floors identical in each', () => {
  const rec = loadHousehold('leah'); const R = compute(rec, data, { today: TODAY }); const P = R.goalPlan;
  assert.equal(P.compare.length, 3); assert.deepEqual(P.compare.map(c => c.mode), MODES);
  assert.ok(P.compare.every(c => c.floorsFull === P.compare[0].floorsFull));
  assert.ok(P.compare.every(c => typeof c.interest === 'number' && typeof c.onTime === 'number'));
});

test('cushion targets: step 1 from the FAT floor, step 2 one month of spending, step 3 the Rule of 5 target with the roommate gap; the three never decrease', () => {
  const rec = loadHousehold('maya-discovery'); const R = compute(rec, data, { today: TODAY }); const T = cushionTargets(rec, R); const S = R.sun.outputs;
  assert.equal(T.step1, S.spending.fatFloorMonthly.cents); assert.equal(T.step2, S.safety.spendingWithPremiums.cents); assert.equal(T.step3, S.safety.ruleOf5Target.cents);
  assert.ok(T.step1 <= T.step2 && T.step2 <= T.step3);
  assert.ok(S.safety.roommateGap && S.safety.roommateGap.cents > 0, 'the roommate gap is inside step 3');
  const G = goalsOf(rec, R); assert.deepEqual(G.items.slice(0, 2).map(i => i.id), FLOOR_IDS); assert.equal(G.items.find(i => i.id === 'fullmonth').aboveCents, T.step2 - T.step1);
  /* no flagged lines: the three categories stand in, marked rough */
  const rec2 = createRecord({ id: 'nofat', now: TODAY + 'T00:00:00Z' }); rec2.sun.f.birthDate = { v: '1995-05-05', state: 'known', source: 'client' };
  const R2 = compute(rec2, data, { today: TODAY }); const T2 = cushionTargets(rec2, R2); assert.equal(T2.step1, null, 'nothing to read yet');
  const demo = compute(loadHousehold('leah'), data, { today: TODAY }); const TD = cushionTargets(loadHousehold('leah'), demo); assert.equal(TD.step1Source, 'fatFloor'); assert.equal(TD.step1Rough, false);
});

test('a fixed lean month and a two-month full month come from the settings', () => {
  const rec = loadHousehold('leah'); rec.sun.assumptions = Object.assign({}, rec.sun.assumptions || {}, { cushionStep1: 'fixed' }); setGoals(rec, { cushion: { step1Cents: 200000, step2Months: 2 } }, { now: TODAY + 'T00:00:00Z' });
  const R = compute(rec, data, { today: TODAY }); const T = cushionTargets(rec, R);
  assert.equal(T.step1, 200000); assert.equal(T.step1Source, 'fixed'); assert.equal(T.step2, R.sun.outputs.safety.spendingWithPremiums.cents * 2);
});

test('long-term goals read the FI ladder', () => {
  const demo = compute(loadHousehold('leah'), data, { today: TODAY }); const items = goalsOf(loadHousehold('leah'), demo).items;
  const fi = items.find(i => i.id === 'rung:regularFi'); assert.equal(fi.type, 'long-term'); assert.equal(fi.monthsAway, demo.ladder.rungs.find(r => r.id === 'regularFi').months);
  assert.equal(demo.goalPlan.assessment['rung:regularFi'].status, 'projected');
  assert.ok(Math.abs(parseInt(demo.goalPlan.assessment['rung:regularFi'].finishMonth.slice(0, 4), 10) - parseInt(String(demo.metrics.fiDate.value.value).slice(0, 4), 10)) <= 1, 'the FI rung lands within a year of the FI date');
});

test('the order of operations is the default priority; the two floors are fixed first; step 3 moves like any goal', () => {
  const rec = loadHousehold('leah'); const R = compute(rec, data, { today: TODAY }); const G = goalsOf(rec, R);
  assert.deepEqual(G.items.slice(0, 2).map(i => i.id), ['lean', 'fullmonth']); assert.ok(G.items[0].locked && G.items[1].locked);
  /* MR-071: Leah's Sapphire is on statement autopay, so it is no debt goal; with no high-interest debt the full cushion comes right after the floors, then the dated goals, then the student loan */
  assert.ok(!G.items.some(i => i.id === 'debt:m-csp'), 'a card paid by autopay is not a debt to pay down');
  assert.equal(G.items[2].id, 'full');
  assert.equal(G.items[3].type, 'dated'); assert.equal(G.items[4].type, 'dated');
  assert.equal(G.items[5].id, 'debt:m-loan'); assert.ok(!G.items[5].highInterest);
  setGoals(rec, { order: ['life:m-goal2', 'full'] }, { now: TODAY + 'T00:00:00Z' });
  const G2 = goalsOf(rec, compute(rec, data, { today: TODAY }));
  assert.equal(G2.items[2].id, 'life:m-goal2'); assert.equal(G2.items[3].id, 'full'); assert.deepEqual(G2.items.slice(0, 2).map(i => i.id), ['lean', 'fullmonth']);
  setGoals(rec, { order: ['lean', 'full'] }, { now: TODAY + 'T00:00:00Z' });
  assert.deepEqual(goalsOf(rec, compute(rec, data, { today: TODAY })).items.slice(0, 2).map(i => i.id), ['lean', 'fullmonth'], 'nothing goes above the floors');
  assert.equal(rec.journal.filter(l => l.kind === 'goals').length, 2);
});

test('already met at creation: the celebration shows once and what-ifs never touch the record', () => {
  const rec = loadHousehold('leah'); const R = compute(rec, data, { today: TODAY }); const P = R.goalPlan;
  assert.ok(P.alreadyMet.includes('lean') && P.alreadyMet.includes('fullmonth'), 'the demo Leah has both floors covered');
  const c1 = celebrations(P, rec); assert.ok(c1.length >= 2 && c1[0].clientName === 'Lean month covered');
  setGoals(rec, { celebrated: Object.fromEntries(c1.map(i => [i.id, TODAY])) }, { now: TODAY + 'T00:00:00Z' });
  assert.equal(celebrations(compute(rec, data, { today: TODAY }).goalPlan, rec).length, 0, 'shown once');
  const inp = input(); const r = allocate(inp); const a = assess(inp, r);
  assert.deepEqual(nextWin(inp, r, a), { id: 'fullmonth', month: '2026-11' }, 'the lean month is already met, so the full month is the next win');
  const before = JSON.stringify(rec);
  planGoals(rec, compute(rec, data, { today: TODAY }), { surplusDelta: 10000, events: [{ month: '2027-01', kind: 'windfall', cents: 500000 }], mode: 'one-at-a-time' });
  assert.equal(JSON.stringify(rec), before);
});

test('since last time: a covered step and moved dates read in words', () => {
  const items = mayaItems();
  const ch = finishChanges({ fullmonth: '2026-11', bach: '2027-05', wedding: '2027-09', trip: null }, { fullmonth: 'done', bach: '2027-04', wedding: '2027-11', trip: '2029-07' }, items);
  assert.deepEqual(ch.map(c => c.text), ['you covered a full month', 'Bachelorette moved up a month', 'Wedding moved back 2 months', 'Nashville trip now has a date']);
  const inp = input(); const r = allocate(inp); const a = assess(inp, r); const fm = finishMonths({ input: inp, assessment: a });
  assert.equal(fm.lean, 'done'); assert.equal(fm.fullmonth, '2026-11');
});

test('the calendar file is valid ics: all-day events, plain titles, CRLF', () => {
  const inp = input(); const r = allocate(inp); const a = assess(inp, r);
  const plan = { input: inp, run: r, assessment: a };
  const ev = goalEvents(plan, [{ id: 's1', label: 'Session 1', at: '2026-10-01T15:00:00.000Z' }]);
  assert.equal(ev[0].title, 'Session 1'); assert.ok(ev.some(e => e.title === 'Full month covered' && e.date === '2026-11-01'));
  assert.ok(!ev.some(e => e.title === 'Lean month covered'), 'a step met before the timeline has no date to book');
  const text = icsOf(ev, { stamp: '2026-10-07T15:00:00.000Z', name: 'Maya goals' });
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'));
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, ev.length);
  assert.ok(text.indexOf('DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102') !== -1);
  assert.ok(text.indexOf('SUMMARY:Full month covered') !== -1);
  assert.ok(!/\$\d/.test(text), 'no numbers in titles'); assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});

test('schema 4: a new record carries the goal settings and setGoals journals the change', () => {
  const rec = createRecord({ id: 'g', now: '2026-10-07T00:00:00.000Z' });
  assert.deepEqual(rec.goals, defaultGoals());
  const line = setGoals(rec, { mode: 'all-at-once' }, { now: '2026-10-07T00:00:01.000Z' });
  assert.equal(line.kind, 'goals'); assert.equal(rec.goals.mode, 'all-at-once');
  assert.equal(setGoals(rec, { mode: 'all-at-once' }, {}), null, 'no change, no line');
});

/* MR-070: the goals spend along the way and the FI date carries them */
test('by hand: 12,000 a year saved toward a 25,000 target arrives in year three; spending 12,000 on a goal in year two makes it year four, cash first then invested', () => {
  const asm = { projectionEndAge: 40, cashRealReturn: 0, withdrawalRate: 0.04, slowgoAge: 75, nogoAge: 85, socialSecurityAge: 67 };
  const inp = { age: 30, year: 2026, today: '2026-10-07', invested: 0, cash: 0, debts: [], debtOrder: [], annualSpend: 100000, employeeAnnual: 0, employerAnnual: 0, leakAnnual: 1200000, debtServiceAnnual: 0, retirementAge: 65, ssMonthly: 0, asm, mult: { gogo: 1, slowgo: 0.85, nogo: 0.75 } };
  assert.equal(project(inp, 0).fiAge, 33, 'without goals: 1.2M, 2.4M, 3.6M >= 2.5M in year three');
  const withGoal = project(Object.assign({}, inp, { oneOffs: { 2028: 1200000 } }), 0);
  assert.equal(withGoal.fiAge, 34); assert.equal(withGoal.path[1].cash, 1200000, 'year two: 2.4M saved less 1.2M spent');
  /* the same draw through a scenario adjustment gives the same path, and a draw already on the inputs stays in every scenario */
  assert.deepEqual(projectWith(inp, 0, { 2028: { oneOff: 1200000, monthly: 0, pay: 0 } }).path.map(p => p.netWorth), withGoal.path.map(p => p.netWorth));
  assert.deepEqual(projectWith(Object.assign({}, inp, { oneOffs: { 2028: 1200000 } }), 0, {}).path.map(p => p.netWorth), withGoal.path.map(p => p.netWorth));
  const big = project(Object.assign({}, inp, { invested: 1000000, leakAnnual: 0, oneOffs: { 2027: 300000 } }), 0);
  assert.equal(big.path[0].cash, 0); assert.equal(big.path[0].invested, 700000, 'a draw bigger than cash comes out of invested');
});

test('goalDraws: a goal on time spends on its date, a late one when it lands, one already saved on its date, and one never reached is left out and named', () => {
  const items = mayaItems().concat([
    { id: 'saved', type: 'dated', name: 'Saved already', targetCents: 50000, balanceCents: 50000, targetDate: '2027-02', priority: 9 },
    { id: 'moon', type: 'amount', name: 'A house in cash', targetCents: 10000000000, balanceCents: 0, priority: 10 },
  ]);
  const inp = input({ items }); const r = allocate(inp); const a = assess(inp, r);
  const d = goalDraws(items, r, a, inp.from);
  assert.equal(d.byGoal.bach.month, '2027-04', 'on time: the date'); assert.equal(d.byGoal.wedding.month, '2027-09');
  assert.equal(d.byGoal.trip.month, r.goals.trip.finishMonth, 'no date: when it lands'); assert.equal(d.byGoal.saved.month, '2027-02', 'already saved: its date');
  assert.deepEqual(d.left, ['moon']); assert.ok(!d.byGoal.moon);
  assert.ok(!d.byGoal.lean && !d.byGoal.fullmonth && !d.byGoal.full && !d.byGoal.card && !d.byGoal['rung:regularFi'], 'the cushion, debts and the rungs never draw');
  assert.equal(d.byYear[2027], 120000 + 200000 + 50000); assert.equal(d.total, 370000 + 150000);
});

test('Leah: the headline FI date carries her two Life plan goals; a goal moved in a what-if moves the draws and the FI months, and nothing is saved', () => {
  const rec = loadHousehold('leah'); const r = compute(rec, data, { today: TODAY });
  const P = r.goalPlan; const draws = P.draws;
  assert.deepEqual(Object.keys(draws.byGoal).sort(), ['life:m-goal1', 'life:m-goal2']);
  assert.deepEqual(r.projectionInputs.oneOffs, draws.byYear, 'the projection spends what the timeline lands');
  assert.deepEqual(quickDraws(rec, { sun: r.sun, asm: r.asm, debts: r.debts, today: r.today, ladder: null, metrics: r.metrics }).byYear, draws.byYear, 'the pre-projection pass agrees with the full plan');
  const fi = r.goalFi;
  assert.ok(fi.deltaMonths > 0, 'the goals push the FI date out'); assert.equal(fi.fiYearWith, r.projection.likely.fiYear, 'the headline is the path with the goals');
  assert.equal(fiMonthOf(r, fi.fiYearWith), r.metrics.fiDate.value.value, 'the FI month reads like the fiDate metric');
  assert.ok(fi.byGoal['life:m-goal1'] > fi.byGoal['life:m-goal2'], 'the condo moves the date more than the trip');
  assert.ok(Math.abs(fi.baseMonths - 265) < 2 && Math.abs(fi.withMonths - 278.9) < 2, 'about 265 months without, about 279 with');
  /* a what-if: the condo at 40,000 by 2030-06 */
  const W = planGoals(rec, r, { goals: { 'life:m-goal1': { targetDate: '2030-06', targetCents: 4000000 } } });
  const it = W.input.items.find(i => i.id === 'life:m-goal1');
  assert.equal(it.targetCents, 4000000); assert.equal(it.targetDate, '2030-06'); assert.equal(it.type, 'dated'); assert.ok(it.moved);
  assert.equal(W.draws.byGoal['life:m-goal1'].year, 2030); assert.equal(W.draws.byYear[2030], 4000000); assert.equal(W.draws.byYear[2035], undefined);
  const fiW = goalFi(r, W.draws);
  assert.ok(fiW.withMonths < fi.withMonths, 'half the goal, sooner: the FI months fall');
  assert.equal(fiW.baseMonths, fi.baseMonths, 'without goals is the same path either way');
  /* dropping the date makes it an amount goal; the record is untouched by any of this */
  const U = planGoals(rec, r, { goals: { 'life:m-goal1': { targetDate: null } } });
  assert.equal(U.input.items.find(i => i.id === 'life:m-goal1').type, 'amount');
  assert.equal(rec.planets.life.rows.find(x => x.id === 'm-goal1').f.goalCost.v, 8000000); assert.equal(rec.journal.length, loadHousehold('leah').journal.length);
  /* a cushion step or a debt never moves this way */
  const N = planGoals(rec, r, { goals: { full: { targetCents: 1 }, 'debt:m-loan': { targetDate: '2030-01' } } });
  assert.ok(N.input.items.find(i => i.id === 'full').targetCents > 1); assert.equal(N.input.items.find(i => i.id === 'debt:m-loan').targetDate, null);
});
