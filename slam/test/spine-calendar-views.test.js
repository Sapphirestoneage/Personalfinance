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

test('it happened (S-209): one log entry keyed to the occurrence, a logged pill, never twice, undone by Not yet', async () => {
  const { confirmOccurrence, unconfirmOccurrence, occurrenceLogKey } = await import('../engine/edits.js');
  const { estimatedVsActual } = await import('../engine/compare.js');
  let s = demo();
  const c0 = calendar(s, R, { from: '2026-11', months: 1 });
  const rent = c0.months[0].events.find((e) => e.sourceId === 'rent');
  assert.equal(rent.confirmable, true);
  assert.equal(rent.logged, null);
  s = confirmOccurrence(s, rent.key, { amount: rent.amount });
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors));
  const entry = s.log.find((x) => x.importKey === occurrenceLogKey(rent.key));
  assert.deepEqual([entry.amount, entry.date, entry.kind, entry.expenseId, entry.source], [1800, rent.date, 'spend', 'rent', 'scheduled']);
  const c1 = calendar(s, R, { from: '2026-11', months: 1 });
  const after = c1.months[0].events.find((e) => e.key === rent.key);
  assert.ok(after.pills.includes('logged') && !after.pills.includes('done'));
  assert.throws(() => confirmOccurrence(s, rent.key, { amount: 1800 }), /Already logged/);
  assert.equal(estimatedVsActual(s, R, { months: 1, asOf: '2026-11-30' }).lines.find((r) => r.id === 'rent').actual, 1800);
  // A paycheck logs as income; a different amount is the amount given.
  const pay = c0.months[0].events.find((e) => e.kind === 'pay');
  const s2 = confirmOccurrence(s, pay.key, { amount: 4100 });
  assert.equal(s2.log.find((x) => x.importKey === occurrenceLogKey(pay.key)).kind, 'income');
  assert.equal(s2.log.find((x) => x.importKey === occurrenceLogKey(pay.key)).amount, 4100);
  // A debt minimum is not a line: not confirmable.
  assert.ok(c0.months[0].events.filter((e) => e.kind === 'debt').every((e) => !e.confirmable));
  assert.throws(() => confirmOccurrence(s, 'nope|2026-11-01', { amount: 1 }), /paycheck or a bill/);
  const back = unconfirmOccurrence(s, rent.key);
  assert.equal(back.log.length, 0);
});

test('pay-later flags and bill timing (S-209): what the Budget calendar flagged, on the run', async () => {
  const { payLaterFlags, billTiming } = await import('../engine/calendar-views.js');
  const s = demo();
  const sim = cashsim(s, R, { months: 2 });
  const pl = payLaterFlags(sim);
  assert.equal(pl.line, Math.round((sim.floor.amount + sim.everydayPerDay * 7) * 100) / 100);
  for (const f of pl.flags) {
    assert.ok(f.cashThatDay < pl.line, 'only on a tight day');
    assert.ok(f.paidBy > f.due && f.gap === Math.round((Date.parse(f.paidBy) - Date.parse(f.due)) / 86400000));
  }
  // Rent lands on a payday, so it is not flagged; Utilities on Nov 10 and the Visa minimum on Nov 12 land on tight days before the Nov 15 salary.
  assert.ok(!pl.flags.some((f) => f.label === 'Rent'), JSON.stringify(pl.flags));
  assert.ok(pl.flags.some((f) => f.label === 'Utilities' && f.due === '2026-11-10' && f.paidBy === '2026-11-15' && f.gap === 5), JSON.stringify(pl.flags));
  assert.ok(pl.flags.some((f) => /^Visa minimum/.test(f.label) && f.due === '2026-11-12'), 'the carried Visa minimum: ' + JSON.stringify(pl.flags));
  const t = billTiming(sim, R);
  assert.ok(t.tried >= 1);
  for (const f of t.fixes) { assert.ok(f.gain > 0 && f.lowAfter.amount > t.lowNow.amount); assert.match(f.script, /move the due date/); }
});

test('a typed entry the run matched to an occurrence shows on the calendar as happened, with the logged amount (S-209)', async () => {
  const { logSpend } = await import('../engine/edits.js');
  const s = logSpend(demo(), { amount: 1850, date: '2026-10-29', expenseId: 'rent' }).spine;
  const c = calendar(s, R, { from: '2026-11', months: 1 });
  const rent = c.months[0].events.find((e) => e.key === 'rent|2026-11-01');
  assert.deepEqual([rent.logged.amount, rent.logged.date], [1850, '2026-10-29']);
  assert.ok(rent.pills.includes('logged'));
});

test('the month breakdown names what the log moved, and still adds up to the run (S-209)', async () => {
  const { logSpend } = await import('../engine/edits.js');
  const { rangeCashTerms } = await import('../engine/calendar.js');
  const s = logSpend(demo(), { amount: 120, date: '2026-10-26', tag: 'accommodation' }).spine;
  const sim = cashsim(s, R, { months: 1 });
  const t = rangeCashTerms(sim, '2026-10-22', '2026-10-31');
  const g = t.groups.find((x) => x.label.startsWith('From the log'));
  assert.equal(g.amount, -120);
  near(t.start + t.groups.reduce((a, x) => a + x.amount, 0), t.end);
});

test('the month cash reading in words: checking today, the lowest day and the day before payday, and the days topped up from the cushion (S-209)', async () => {
  const { cashReading } = await import('../engine/calendar-views.js');
  const sim = cashsim(demo(), R, { months: 2 });
  const oct = cashReading(sim, '2026-10');
  assert.deepEqual(oct.today, { date: '2026-10-22', amount: sim.daily[0].primary });
  const nov = cashReading(sim, '2026-11');
  assert.equal(nov.today, null);
  assert.equal(nov.low.amount, Math.min(...sim.daily.filter((d) => d.date.slice(0, 7) === '2026-11').map((d) => d.primary)));
  assert.equal(nov.toppedUp.first, '2026-11-11', 'checking runs dry on Nov 11 and the cushion covers it');
  assert.equal(nov.toppedUp.days, 4, 'Nov 11 to Nov 14, until the Nov 15 paycheck');
  assert.equal(nov.belowZero.days, 0, 'the cushion keeps checking at zero');
  assert.equal(cashReading(null, '2026-11'), null);
});

test('semimonthly pay lands on the same two days on the calendar and in the run, so "It happened" keys match (S-209)', () => {
  let s = demo();
  s = { ...s, income: s.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'semimonthly' } : x)) };
  s = putFact(s, 'income.salary.payDay', 20, 'known', '2026-10-23');
  const c = calendar(s, R, { from: '2026-11', months: 1 });
  const cal = c.months[0].events.filter((e) => e.sourceId === 'salary').map((e) => e.date);
  const run = c.sim.daily.filter((d) => d.date.slice(0, 7) === '2026-11' && d.events.some((e) => e.kind === 'income' && e.label.startsWith('Salary'))).map((d) => d.date);
  assert.deepEqual(cal, ['2026-11-05', '2026-11-20']);
  assert.deepEqual(run, cal);
});

test('a line marked "does not apply" is neither a cost nor a missing amount in the run (S-209)', () => {
  const s = putFact(demo(), 'expenses.gym.amount', null, 'notForMe', '2026-10-23');
  const sim = cashsim(s, R, { months: 1 });
  assert.ok(!sim.needs.some((n) => n.path === 'expenses.gym.amount'));
  assert.ok(!sim.model.bills.some((b) => b.id === 'gym'));
});

test('It happened on a moved item logs the moved day; It did not happen takes back a happened entry (S-209)', async () => {
  const { confirmOccurrence } = await import('../engine/edits.js');
  const moved = moveOccurrence(demo(), 'rent|2026-11-01', '2026-11-03');
  const hap = confirmOccurrence(moved, 'rent|2026-11-01', { amount: 1800 });
  assert.equal(hap.log.find((x) => x.importKey === 'sched:rent|2026-11-01').date, '2026-11-03');
  const back = skipOccurrence(hap, 'rent|2026-11-01', true);
  assert.ok(!back.log.some((x) => x.importKey === 'sched:rent|2026-11-01'));
  assert.equal(back.calendar.overrides['rent|2026-11-01'].skip, true);
});

test('a bill paid on a card counts in the month plan but not in its day\'s checking in and out (S-209)', () => {
  const s = putFact(demo(), 'expenses.phone.paidFrom', 'visa', 'known', '2026-10-23');
  const m = calendar(s, R, { from: '2026-11', months: 1 }).months[0];
  const base = calendar(demo(), R, { from: '2026-11', months: 1 }).months[0];
  const phone = m.events.find((e) => e.sourceId === 'phone');
  assert.equal(phone.card, 'visa');
  assert.match(phone.note, /checking pays it through the card payment/);
  const day = (mm) => mm.days.find((d) => d.date === '2026-11-20');
  assert.equal(day(m).out, Math.round((day(base).out - 60) * 100) / 100);
  assert.equal(m.out, base.out, 'the month plan still counts it');
});

test('a paycheck or a debt with no amount is on the calendar, named, and moves nothing (S-209)', () => {
  let s = putFact(demo(), 'income.salary.amount', null, 'missing', '2026-10-23');
  s = putFact(s, 'debts.sl.minimum', null, 'missing', '2026-10-23');
  const m = calendar(s, R, { from: '2026-11', months: 1 }).months[0];
  const pay = m.events.find((e) => e.sourceId === 'salary');
  assert.equal(pay.amount, null);
  assert.match(pay.note, /not entered/);
  const sl = m.events.find((e) => e.id === 'debt:sl');
  assert.equal(sl.amount, null);
  assert.match(sl.note, /not entered/);
  assert.ok(m.events.filter((e) => e.amount === null).every((e) => !m.days.some((d) => d.events.includes(e) && Number.isNaN(d.in + d.out))));
});

test('a yearly bill with a date is on the calendar once a year at the whole amount, the same day as the run (S-209)', () => {
  let s = demo();
  s = { ...s, expenses: s.expenses.map((x) => (x.id === 'gym' ? { ...x, cadence: 'yearly', start: '2026-12-05' } : x)) };
  s = putFact(s, 'expenses.gym.amount', 480, 'known', '2026-10-23');
  const c = calendar(s, R, { from: '2026-11', months: 2 });
  const [nov, dec] = c.months;
  assert.ok(!nov.events.some((e) => e.sourceId === 'gym'));
  const gym = dec.events.find((e) => e.sourceId === 'gym');
  assert.deepEqual([gym.date, gym.amount, gym.pills.includes('yearly')], ['2026-12-05', 480, true]);
  assert.ok(c.sim.daily.find((d) => d.date === '2026-12-05').events.some((e) => e.label === gym.label && e.amount === -480));
});

test('card interest from the run is on its statement day, on the card, and not added to the month (S-209)', () => {
  const c = calendar(demo(), R, { from: '2026-11', months: 1 });
  const m = c.months[0];
  const runInterest = c.sim.daily.filter((d) => d.date.slice(0, 7) === '2026-11').flatMap((d) => d.events.filter((e) => e.kind === 'interest' && e.amount).map((e) => [d.date, e.card, Math.abs(e.amount)]));
  const shown = m.events.filter((e) => e.kind === 'interest').map((e) => [e.date, e.card, e.amount]);
  assert.ok(runInterest.length > 0, 'the demo Visa revolves');
  assert.deepEqual(shown, runInterest);
  assert.ok(m.events.filter((e) => e.kind === 'interest').every((e) => e.counted === false));
});

test('accounts the run left out are named with the field that fills them; no cash account at all is said once (S-209)', async () => {
  const { accountGaps } = await import('../engine/calendar-views.js');
  const s = demo();
  assert.deepEqual(accountGaps(s, cashsim(s, R, { months: 1 })), { none: false, checking: true, missing: [], fix: 'accounts.chk.balance' });
  const noSavings = putFact(s, 'accounts.hysa.balance', null, 'missing', '2026-10-23');
  const g = accountGaps(noSavings, cashsim(noSavings, R, { months: 1 }));
  assert.deepEqual(g.missing.map((m) => m.path), ['accounts.hysa.balance']);
  assert.equal(g.none, false);
  const nothing = putFact(noSavings, 'accounts.chk.balance', null, 'missing', '2026-10-23');
  assert.equal(accountGaps(nothing, cashsim(nothing, R, { months: 1 })).none, true);
});

test('cash by day: ahead is the run; the past runs from each check-in with the cash in the log, and walks back before the first (S-209)', async () => {
  const { cashLine } = await import('../engine/calendar-views.js');
  const { logSpend } = await import('../engine/edits.js');
  let s = demo();
  s = { ...s, checkins: [{ id: 'c1', date: '2026-10-10', balances: { chk: 3500 }, forecast: {} }] };
  s = logSpend(s, { amount: 200, date: '2026-10-12', tag: 'food' }).spine;
  s = logSpend(s, { amount: 50, date: '2026-10-05', tag: 'food' }).spine;
  s = logSpend(s, { amount: 999, date: '2026-10-13', tag: 'food', paidWith: 'visa' }).spine;
  const sim = cashsim(s, R, { months: 1 });
  const line = cashLine(s, sim);
  const day = (d) => line.days.find((x) => x.date === d);
  assert.equal(line.days[0].date, '2026-10-01');
  assert.equal(day('2026-10-10').checking, 3500, 'the check-in day');
  assert.equal(day('2026-10-12').checking, 3300, 'less the 200 logged on the 12th');
  assert.equal(day('2026-10-13').checking, 3300, 'a card spend moves no cash');
  assert.equal(day('2026-10-04').checking, 3550, 'walked back from the first check-in: before the 50 on the 5th, checking held 50 more');
  assert.equal(day('2026-10-05').checking, 3500);
  assert.equal(day('2026-10-09').checking, 3500);
  assert.ok(day('2026-10-21').past && !day('2026-10-22').past);
  assert.equal(day('2026-10-22').checking, sim.daily[0].primary);
  assert.equal(day('2026-10-22').savings, sim.daily[0].balances.hysa);
  assert.equal(line.backTo, null);
  assert.ok(line.days.filter((d) => !d.past).some((d) => d.payday));
  assert.ok(line.min <= 0 && line.max >= line.days[0].checking);
});

test('with no balance on checking, nothing that reads checking is a number: savings never stand in for it (S-209)', async () => {
  const { accountGaps, cashReading, cashLine } = await import('../engine/calendar-views.js');
  const { safeToSpend } = await import('../engine/spending.js');
  const s = putFact(demo(), 'accounts.chk.balance', null, 'missing', '2026-10-23');
  const sim = cashsim(s, R, { months: 1 });
  assert.deepEqual([sim.checking.known, sim.checking.path, sim.checking.ids], [false, 'accounts.chk.balance', []]);
  const f = safeToSpend(sim);
  assert.equal(f.today, null);
  assert.equal(f.kind, 'incomplete');
  assert.ok(f.missing.includes('accounts.chk.balance'));
  assert.equal(cashReading(sim, '2026-10'), null);
  assert.equal(cashLine(s, sim), null);
  const g = accountGaps(s, sim);
  assert.deepEqual([g.none, g.checking, g.fix], [false, false, 'accounts.chk.balance']);
  const m = calendar(s, R, { from: '2026-10', months: 1 }).months[0];
  assert.equal(m.cash.value, null);
  assert.equal(m.cash.kind, 'missing');
});

test('waiting: paychecks and bills on or before today, not marked happened or skipped; the month counts what was marked (S-209)', async () => {
  const { waiting } = await import('../engine/calendar-views.js');
  const { confirmOccurrence } = await import('../engine/edits.js');
  const s = demo();
  const w = waiting(s, R, { today: '2026-10-23' });
  assert.ok(w.length > 0);
  assert.ok(w.every((e) => e.date <= '2026-10-23' && e.date >= '2026-10-01' && e.confirmable && !e.logged));
  const rent = w.find((e) => e.key === 'rent|2026-10-01');
  assert.ok(rent);
  const hap = confirmOccurrence(s, rent.key, { amount: 1800 });
  assert.ok(!waiting(hap, R, { today: '2026-10-23' }).some((e) => e.key === rent.key));
  assert.ok(!waiting(skipOccurrence(s, rent.key, true), R, { today: '2026-10-23' }).some((e) => e.key === rent.key));
  const m = calendar(hap, R, { from: '2026-10', months: 1 }).months[0];
  assert.equal(m.confirm.happened, 1);
  assert.ok(m.confirm.scheduled >= w.length);
});

test('by date: each movement with checking after it, ending at the day\'s balance, and where it came from (S-209)', async () => {
  const { logSpend, confirmOccurrence } = await import('../engine/edits.js');
  let s = logSpend(demo(), { amount: 120, date: '2026-10-26', tag: 'accommodation' }).spine;
  s = confirmOccurrence(s, 'salary|2026-11-15', { amount: 4211 });
  const sim = cashsim(s, R, { months: 2 });
  const a = agenda(sim, sim.daily.length);
  for (const d of a) {
    const onChecking = d.events.filter((e) => e.after !== null);
    if (onChecking.length) near(onChecking[onChecking.length - 1].after, d.end, d.date);
  }
  const day = (x) => a.find((d) => d.date === x);
  assert.equal(day('2026-10-26').events.find((e) => e.kind === 'log').source, 'logged');
  assert.equal(day('2026-11-15').events.find((e) => e.kind === 'income').source, 'happened');
  assert.equal(day('2026-11-01').events.find((e) => e.label === 'Rent').source, 'scheduled');
});

test('waiting does not ask about a bill already typed or imported before the as-of date, and It happened cannot log it twice (S-209 review)', async () => {
  const { waiting } = await import('../engine/calendar-views.js');
  const { logSpend } = await import('../engine/edits.js');
  const typed = logSpend(demo(), { amount: 1800, date: '2026-10-02', expenseId: 'rent' }).spine;
  assert.ok(!waiting(typed, R, { today: '2026-10-23' }).some((e) => e.key === 'rent|2026-10-01'));
  const rent = calendar(typed, R, { from: '2026-10', months: 1 }).months[0].events.find((e) => e.key === 'rent|2026-10-01');
  assert.deepEqual([rent.logged.amount, rent.logged.date], [1800, '2026-10-02']);
  // A dollar on the rent line is not the rent: it is still asked about.
  const dollar = logSpend(demo(), { amount: 1, date: '2026-10-02', expenseId: 'rent' }).spine;
  assert.ok(waiting(dollar, R, { today: '2026-10-23' }).some((e) => e.key === 'rent|2026-10-01'));
});

test('with two checking accounts the month breakdown adds up, and the lowest days read the same line (S-209 review)', async () => {
  const { rangeCashTerms, monthCashTerms } = await import('../engine/calendar.js');
  let s = demo();
  s = { ...s, accounts: [...s.accounts, { ...s.accounts.find((a) => a.id === 'chk'), id: 'joint', name: { value: 'Joint checking', kind: 'known', asOf: '2026-10-22', source: 'user' } }] };
  s = putFact(s, 'accounts.joint.balance', 2000, 'known', '2026-10-23');
  s = putFact(s, 'income.salary.depositTo', 'joint', 'known', '2026-10-23');
  const sim = cashsim(s, R, { months: 3 });
  for (const ym of ['2026-10', '2026-11', '2026-12']) {
    const t = monthCashTerms(sim, ym);
    near(t.start + t.groups.reduce((a, g) => a + g.amount, 0), t.end, ym);
    near(sim.monthly[ym].low, Math.min(...sim.daily.filter((d) => d.date.slice(0, 7) === ym).map((d) => d.primary)), ym + ' low');
  }
  near(sim.low.amount, Math.min(...sim.daily.map((d) => d.primary)));
  const w = weeks(sim);
  near(w[0].start, sim.checking.open);
});

test('by date: a payment the floor held back is shown but never leaves checking, so each day ends where it says (S-209 review)', () => {
  const s = putFact(demo(), 'accounts.chk.balance', 100, 'known', '2026-10-23');
  const sim = cashsim(s, R, { months: 2 });
  assert.ok(sim.daily.some((d) => d.events.some((e) => e.kind === 'shortfall')), 'the floor holds something back');
  for (const d of agenda(sim, sim.daily.length)) {
    const on = d.events.filter((e) => e.after !== null);
    if (on.length) near(on[on.length - 1].after, d.end, d.date);
    assert.ok(d.events.filter((e) => e.kind === 'shortfall').every((e) => e.after === null));
  }
});
