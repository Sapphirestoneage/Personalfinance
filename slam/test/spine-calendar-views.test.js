// The calendar's views and timing decisions (S-204): weeks, the agenda, the year
// strip, paychecks with bonus chips, milestones, search, and the edits that move,
// skip, re-price, lock and park an occurrence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { calendar } from '../engine/calendar.js';
import { weeks, agenda, yearStrip, paychecks, milestones, searchEvents } from '../engine/calendar-views.js';
import { editIncome, putFact, moveOccurrence, skipOccurrence, repriceOccurrence, lockOccurrence, addMaybe, setMaybeDate, removeMaybe } from '../engine/edits.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const near = (a, b, msg = '', eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' is not ' + b + (msg ? ': ' + msg : ''));

test('weeks: in, out and the ending balance per week, each week starting where the last ended', () => {
  const sim = cashsim(demo(), R, { months: 2 });
  const w = weeks(sim);
  assert.ok(w.length >= 6, String(w.length));
  assert.equal(w[0].from, '2026-10-22');
  assert.equal(w[0].to, '2026-10-24', 'the first week runs to Saturday');
  assert.equal(w[1].from, '2026-10-25');
  for (let i = 1; i < w.length; i++) assert.equal(w[i].start, w[i - 1].end, 'week ' + i + ' starts where the last ended');
  const nov1 = w.find((x) => x.from <= '2026-11-01' && x.to >= '2026-11-01');
  assert.ok(nov1.out > 1800, 'the rent week');
  assert.ok(w.some((x) => x.hasLow), 'one week holds the lowest day');
  for (const x of w) assert.ok(x.events.every((e) => e.kind !== 'everyday'));
});

test('agenda: the next 14 days with what lands and where checking ends; everyday spending as one line', () => {
  const sim = cashsim(demo(), R, { months: 2 });
  const a = agenda(sim, 14);
  assert.ok(a.length >= 3 && a.length <= 14);
  assert.ok(a.every((d) => d.events.length && typeof d.end === 'number'));
  assert.ok(a.every((d) => d.events.filter((e) => e.kind === 'everyday').length <= 1));
  assert.ok(a.some((d) => d.date === '2026-11-01' && d.events.some((e) => /Rent/.test(e.label))));
});

test('year strip: twelve months with in, out, net, the lowest day, and the tight ones flagged', () => {
  const y = yearStrip(demo(), R);
  assert.equal(y.months.length, 12);
  assert.equal(y.months[0].ym, '2026-10');
  for (const m of y.months) { assert.ok(typeof m.low === 'number'); near(m.net, m.in - m.out, m.ym); assert.equal(m.tight, m.low < y.floor + y.tightWeek); }
  assert.equal(y.tightCount, y.months.filter((m) => m.tight).length);
  assert.ok(['computed', 'rough', 'incomplete'].includes(y.kind));
});

test('paychecks: each one covers the bills until the next; a third biweekly paycheck in a month is a bonus with a job', () => {
  let s = demo();
  s = editIncome(s, 'salary', { amount: 2769.23, cadence: 'biweekly', start: '2026-10-02' }, '2026-10-23');
  s = applyDefaults(s, R);
  const sum = summarize(s, R);
  const sim = cashsim(s, R, { months: 7 });
  const list = paychecks(s, R, sim, sum);
  const salary = list.filter((p) => p.streamId === 'salary');
  assert.ok(salary.length >= 13, String(salary.length));
  // Biweekly from Oct 2: October's third pay (Oct 30) is counted over the whole month, two of its pays being before the as-of date; the next third falls on April 30.
  const oct = salary.filter((p) => p.ym === '2026-10');
  assert.deepEqual(oct.map((p) => [p.date, p.n, p.of, p.bonus]), [['2026-10-30', 3, 3, true]]);
  const apr = salary.filter((p) => p.ym === '2027-04');
  assert.deepEqual(apr.map((p) => p.bonus), [false, false, true]);
  assert.match(apr[2].bonusWhy, /third biweekly/);
  assert.ok(apr[2].couldDo && apr[2].couldDo.amount > 0, 'the bonus money gets a job from the windfall order: ' + JSON.stringify(apr[2].couldDo));
  assert.ok(salary.filter((p) => p.ym === '2026-11').every((p) => !p.bonus));
  for (const p of list) { near(p.left, p.amount - p.bills.reduce((x, b) => x + b.amount, 0), 'left is the paycheck less what it covers'); assert.equal(p.path, p.streamId ? 'income.' + p.streamId + '.amount' : null); }
  // Monthly pay is never a bonus.
  const plain = paychecks(demo(), R, cashsim(demo(), R, { months: 3 }), summarize(demo(), R));
  assert.ok(plain.every((p) => !p.bonus));
});

test('milestones: a card cleared, a loan paid off, every card clear, promo ends; sorted by date, no duplicates', () => {
  let s = demo();
  s = putFact(s, 'debts.visa.payPolicy', 'statement', 'known', '2026-10-23');
  s = putFact(s, 'debts.store.payPolicy', 'statement', 'known', '2026-10-23');
  const c = calendar(s, R, { months: 6 });
  const ms = milestones(s, R, c.sim, c.months);
  assert.ok(ms.some((m) => /Visa cleared/.test(m.label) && m.path === 'debts.visa.balance'));
  assert.ok(ms.some((m) => m.kind === 'cardsFree'));
  assert.ok(ms.some((m) => m.kind === 'promoEnds' && m.date === '2027-03-01'));
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i].date >= ms[i - 1].date);
  assert.equal(new Set(ms.map((m) => m.date + m.label)).size, ms.length);
});

test('search finds events by their words across the months', () => {
  const c = calendar(demo(), R, { months: 3 });
  const hits = searchEvents(c.months, 'visa');
  assert.ok(hits.length >= 3 && hits.every((e) => /Visa/i.test(e.label)));
  assert.deepEqual(searchEvents(c.months, ''), []);
});

test('timing decisions: move, skip, re-price, lock and the tray; the calendar and the simulation both follow them', () => {
  let s = demo();
  const key = 'utilities|2026-11-10';
  s = moveOccurrence(s, key, '2026-11-20');
  s = repriceOccurrence(s, 'rent|2026-12-01', 1700);
  s = skipOccurrence(s, 'gym|2026-11-01');
  s = lockOccurrence(s, 'rent|2026-11-01');
  const added = addMaybe(s, { label: 'Birthday gift', amount: 200, likelihood: 0.9, direction: 'in' });
  s = added.spine;
  assert.ok(validate(s).ok, JSON.stringify(validate(s).errors));
  let c = calendar(s, R, { from: '2026-11', months: 2 });
  const nov = c.months[0], dec = c.months[1];
  const on = (m, date, re) => m.events.some((e) => e.date === date && re.test(e.label));
  assert.ok(!on(nov, '2026-11-10', /Utilities/) && on(nov, '2026-11-20', /Utilities/), 'moved on the calendar');
  assert.ok(nov.events.find((e) => e.key === key).moved);
  assert.ok(!on(nov, '2026-11-01', /Gym/), 'skipped');
  assert.ok(dec.events.find((e) => e.key === 'rent|2026-12-01').amount === 1700 && dec.events.find((e) => e.key === 'rent|2026-12-01').repriced);
  assert.ok(nov.events.find((e) => e.key === 'rent|2026-11-01').pills.includes('locked'));
  assert.ok(nov.events.find((e) => e.key === 'utilities|2026-11-10').pills.includes('repeat'));
  assert.equal(c.tray.length, 1, 'an undated maybe item is in the tray');
  assert.ok(!nov.events.some((e) => e.kind === 'maybe'));
  // The simulation follows the same decisions.
  const sim = c.sim;
  assert.ok(sim.daily.find((d) => d.date === '2026-11-20').events.some((e) => /Utilities/.test(e.label)));
  assert.ok(sim.daily.find((d) => d.date === '2026-12-01').events.some((e) => /Rent/.test(e.label) && e.amount === -1700));
  // Lock refuses a move; unlock allows it; moving back to the original day clears the override.
  assert.throws(() => moveOccurrence(s, 'rent|2026-11-01', '2026-11-03'), /locked/);
  s = lockOccurrence(s, 'rent|2026-11-01', false);
  s = moveOccurrence(s, 'rent|2026-11-01', '2026-11-03');
  s = moveOccurrence(s, 'rent|2026-11-01', '2026-11-01');
  assert.equal(s.calendar.overrides['rent|2026-11-01'], undefined);
  // Put the tray item on a day: it shows as maybe money on the calendar and in the cash line, weighted; back to the tray it goes.
  s = setMaybeDate(s, added.id, '2026-11-05');
  c = calendar(s, R, { from: '2026-11', months: 1 });
  const mb = c.months[0].events.find((e) => e.kind === 'maybe');
  assert.ok(mb && mb.date === '2026-11-05' && mb.pills.includes('maybe') && mb.counted === false);
  assert.ok(c.sim.daily.find((d) => d.date === '2026-11-05').events.some((e) => e.kind === 'maybe-in' && e.amount === 180));
  assert.equal(c.tray.length, 0);
  s = setMaybeDate(s, added.id, null);
  assert.equal(calendar(s, R, { from: '2026-11', months: 1 }).tray.length, 1);
  s = removeMaybe(s, added.id);
  assert.equal((s.calendar.maybe || []).length, 0);
  assert.throws(() => addMaybe(s, { label: '', amount: 5 }), /name/);
  assert.throws(() => addMaybe(s, { label: 'x', amount: 0 }), /more than/);
  // A move into another month shows up there, from its original month.
  s = moveOccurrence(s, 'utilities|2026-11-10', '2026-12-02');
  const dec2 = calendar(s, R, { from: '2026-12', months: 1 }).months[0];
  assert.ok(dec2.events.some((e) => e.key === 'utilities|2026-11-10' && e.date === '2026-12-02' && e.moved));
  assert.ok(!calendar(s, R, { from: '2026-11', months: 1 }).months[0].events.some((e) => e.key === 'utilities|2026-11-10'));
});

test('a paycheck carries its gross and what came off it, for the fold-out', () => {
  const c = calendar(demo(), R, { from: '2026-11', months: 1 });
  const pay = c.months[0].events.find((e) => e.id === 'pay:salary');
  near(pay.gross, 6000); near(pay.withheld, 830); near(pay.fica, 459); near(pay.saved, 500);
  near(pay.amount, pay.gross - pay.withheld - pay.fica - pay.saved, 'what lands is the gross less the three');
});
