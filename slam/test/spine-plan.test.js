// The Plan page (S-208): the waterfall shared with the Windfall order and the
// answers on it (match, SE tax, the Roth cap), the FOO ladder, the allocator,
// the solvers, the real hourly wage, DRAFTT, the fixed floor, goals, the
// outlook, the income shock, life events, the diff, export and import.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { putFact, logSpend } from '../engine/edits.js';
import { windfall } from '../engine/windfall.js';
import { surplusWaterfall, fooLadder, allocator, solvers, realHourlyWage, hoursOf, draftt, fixedFloor, incomeShock, outlook, goalsView, applyLifeEvent, removeLifeEvent, diffSpines, exportJson, importJson, exportCsv } from '../engine/plan.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const T = '2026-10-22';
const S = (s) => summarize(s, R, { flags: false });

test('answer 23: the employer match step sits before the cards, is skipped and says so with no match, and counts the match lost', () => {
  // The demo's match words read as tiers (S-266); this starts from no match at all.
  let s = demo(); s = { ...s, accounts: s.accounts.map((a) => (a.id === 'k401' ? { ...a, matchTiers: undefined } : a)) };
  const w0 = windfall(s, R, S(s), { amount: 5000 });
  const ids = w0.steps.map((x) => x.id);
  assert.ok(ids.indexOf('employerMatch') < ids.indexOf('cards') && ids.indexOf('employerMatch') > ids.indexOf('promos'));
  const m0 = w0.steps.find((x) => x.id === 'employerMatch');
  assert.equal(m0.need, 0);
  assert.match(m0.why, /skipped/);
  // A 401(k) that matches 100% up to 4% of gross, with $100 a month going in against $240 needed (gross 6,000 a month).
  s = putFact(s, 'accounts.k401.matchRate', 1, 'known', T);
  s = putFact(s, 'accounts.k401.matchCap', 0.04, 'known', T);
  s = putFact(s, 'accounts.k401.monthlyContribution', 100, 'known', T);
  const w1 = windfall(s, R, S(s), { amount: 5000 });
  const m1 = w1.steps.find((x) => x.id === 'employerMatch');
  assert.ok(m1.need > 0, 'match left on the table: ' + m1.why);
  assert.equal(m1.need, Math.round(140 * 3 * 100) / 100, '$140 a month short for the three months left in the year');
  assert.match(m1.why, /\$420 of match/);
  // Monthly: the same step reads a month.
  const sw = surplusWaterfall(s, R, S(s));
  assert.equal(sw.monthly, true);
  assert.equal(sw.steps.find((x) => x.id === 'employerMatch').need, 140);
  assert.ok(sw.steps.every((x) => w1.steps.some((y) => y.id === x.id)), 'one order, one function');
});

test('answer 24: a 1099 lump sum owes self-employment tax on top of the marginal rate', () => {
  const s = demo();
  const sum = S(s);
  const w2 = windfall(s, R, sum, { amount: 5000, taxed: false, source: 'w2' });
  const se = windfall(s, R, sum, { amount: 5000, taxed: false, source: '1099' });
  const a = w2.steps.find((x) => x.id === 'taxOnIt'), b = se.steps.find((x) => x.id === 'taxOnIt');
  assert.ok(b.need > a.need, 'more is held back on 1099 money: ' + b.need + ' vs ' + a.need);
  assert.match(b.why, /self-employment tax/);
  assert.ok(b.rules.some((r) => r.startsWith('SE_')));
});

test('answer 25: the Roth step is capped at known earned income and reads missing while earned income is missing', () => {
  let s = demo();
  const ok = windfall(s, R, S(s), { amount: 5000 }).steps.find((x) => x.id === 'roth');
  assert.ok(ok.need !== null && ok.need > 0);
  const gone = putFact(s, 'income.salary.amount', null, 'missing', T);
  const r = windfall(gone, R, S(gone), { amount: 5000 }).steps.find((x) => x.id === 'roth');
  assert.equal(r.need, null);
  assert.match(r.why, /^Missing: 2026 earned income/);
  assert.ok(r.missing.includes('income.salary.amount'));
  assert.equal(r.kind, 'missing');
  // Earned income below the limit caps the room.
  let tiny = putFact(s, 'income.salary.amount', 200, 'known', T);
  tiny = putFact(tiny, 'income.tutoring.amount', 0, 'known', T);
  const c = windfall(tiny, R, S(tiny), { amount: 5000 }).steps.find((x) => x.id === 'roth');
  assert.ok(c.need <= 2400, 'capped at a year of earned income: ' + c.need);
  assert.match(c.why, /Capped at 2026 earned income/);
});

test('the FOO ladder: nine rungs in the rule order, a completion month per rung, three setup questions', () => {
  let s = demo();
  const f0 = fooLadder(s, R, S(s));
  assert.equal(f0.rungs.length, 9);
  assert.deepEqual(f0.rungs.map((r) => r.id), R.get('FOO_RUNGS', 2026));
  // Step 1 starts as the $1,000 starter fund (S-261), which the demo's cash covers.
  assert.deepEqual([f0.rungs[0].label, f0.rungs[0].done], ['Starter cushion', true]);
  assert.match(f0.rungs[0].why, /covers the starter fund \(\$1,000\)/);
  assert.equal(f0.setup.deductible, null);
  s = putFact(s, 'household.deductible', 2500, 'known', T);
  const f1 = fooLadder(s, R, S(s));
  const d = f1.rungs[0];
  assert.equal(d.done, true, 'cash of 12,000 covers a 2,500 deductible');
  assert.equal(d.completes, T);
  const hi = f1.rungs.find((r) => r.id === 'highInterest');
  assert.equal(hi.need, 4200, 'the Store card before its deferred-interest cliff, then the Visa at 22% (Krug pass)');
  assert.ok(hi.months > 0 && hi.completes > T, 'funded by the surplus month by month: ' + hi.completes);
  const later = f1.rungs.find((r) => r.id === 'reserves');
  assert.ok(later.completes === null || later.completes >= hi.completes, 'each rung starts after the one before');
  assert.equal(f1.current, 'highInterest');
  assert.ok(f1.rungs.every((r) => typeof r.label === 'string' && r.why));
});

test('the allocator: envelopes by due date, the 1099 set-aside on a 1099 deposit, what is free, the bonus months', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 3 });
  const a = allocator(s, R, sim, S(s));
  assert.ok(a.paychecks.length >= 4);
  const tutor = a.paychecks.find((p) => p.label === 'Weekend tutoring');
  assert.equal(tutor.is1099, true);
  assert.ok(tutor.setAsideRate > 0 && tutor.setAside > 0, 'tax set aside on the deposit: ' + tutor.setAside);
  assert.ok(tutor.envelopes.length >= 1);
  assert.equal(tutor.free, Math.round((tutor.amount - tutor.setAside - tutor.committed - tutor.everyday) * 100) / 100);
  const salary = a.paychecks.find((p) => p.label.startsWith('Salary'));
  assert.equal(salary.is1099, false);
  assert.equal(salary.setAside, 0);
  assert.ok(Array.isArray(a.bonusMonths));
});

test('the solvers: savings rate, spending, income and return needed to reach the FI number by an age', () => {
  const s = demo();
  const x = solvers(s, R, S(s), { byAge: 60 });
  assert.equal(x.rows.length, 4, x.note || '');
  const rate = x.rows.find((r) => r.id === 'savingsRate');
  assert.ok(rate.value === null || (rate.value >= 0 && rate.value <= 1));
  assert.ok(x.rows.every((r) => typeof r.words === 'string' && r.words.length));
  const spend = x.rows.find((r) => r.id === 'spending'), income = x.rows.find((r) => r.id === 'income');
  if (spend.value !== null && income.value !== null) assert.ok(income.value - spend.value > 0, 'income less spending is the saving needed');
  assert.ok(x.yearsNow === null || x.yearsNow >= 0);
});

test('the real hourly wage: take-home less the costs of working over hours plus the commute; hours of life', () => {
  let s = demo();
  assert.equal(realHourlyWage(s, R, S(s)).wage, null, 'needs hours a week');
  s = putFact(s, 'household.workHoursPerWeek', 40, 'known', T);
  const w0 = realHourlyWage(s, R, S(s));
  assert.ok(w0.wage > 0 && w0.wage === w0.naive, 'no commute, no costs: the naive wage');
  assert.ok(w0.rough.includes('household.commuteHoursPerWeek'));
  s = putFact(s, 'household.commuteHoursPerWeek', 5, 'known', T);
  s = putFact(s, 'expenses.transit.workRelated', true, 'known', T);
  const w1 = realHourlyWage(s, R, S(s));
  assert.ok(w1.wage < w0.wage, 'the commute and the bus pass come off: ' + w1.wage + ' vs ' + w0.wage);
  assert.equal(w1.costMonthly, 130);
  assert.equal(w1.hoursMonthly, Math.round(45 * R.get('APP_WEEKS_PER_MONTH', 2026) * 100) / 100);
  assert.equal(hoursOf(100, 20), 5);
  assert.equal(hoursOf(100, null), null);
});

test('DRAFTT: the letters as shares of the base, the housing reference at 35%, no verdict', () => {
  const s = demo();
  const d = draftt(s, R, S(s));
  assert.deepEqual(d.rows.map((r) => r.letter), ['D', 'R', 'A', 'F', 'T']);
  const a = d.rows.find((r) => r.key === 'accommodation');
  assert.equal(a.amount, 1950);
  assert.equal(a.reference, 0.35);
  assert.equal(a.referenceAmount, Math.round(d.base.takeHome * 0.35 * 100) / 100);
  // B2: each letter over take-home (4,711), Retirement over gross (6,500), worked by hand.
  assert.equal(a.share, 0.4139, '1,950 / 4,711');
  assert.equal(d.rows.find((r) => r.key === 'retirement').share, 0.1231, '(500 + 300) / 6,500');
  assert.equal(d.rows.find((r) => r.key === 'retirement').of, 'gross');
  assert.equal(a.overReference, 301.15, '1,950 - 35% of 4,711 (1,648.85)');
  assert.ok(!('verdict' in d) && !('stage' in d));
});

test('the fixed floor: fixed lines plus minimums, the runway on cash, and the day-by-day shock', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 6 });
  const f = fixedFloor(s, R, S(s), sim);
  assert.ok(f.floor !== null && f.floor >= f.minimums, 'floor ' + f.floor);
  assert.ok(f.runwayMonths > 0);
  assert.equal(f.shock.months, 3);
  assert.ok(f.shock.runwayDays === null || f.shock.runwayDays > 0);
  const sh = incomeShock(s, R, sim, { months: 6 });
  assert.equal(sh.months, 6);
  assert.ok(sh.low.amount <= sim.low.amount, 'no income for six months leaves less: ' + sh.low.amount);
});

test('the outlook: many runs give bad, typical and good cash, an interest range and a share under the floor', () => {
  const s = demo();
  const sim = cashsim(s, R, { months: 3 });
  const o = outlook(s, R, sim, { runs: 40 });
  assert.equal(o.runs, 40);
  assert.ok(o.low.bad <= o.low.typical && o.low.typical <= o.low.good);
  assert.ok(o.interest.low <= o.interest.high);
  assert.ok(o.shareBelowFloor >= 0 && o.shareBelowFloor <= 1);
});

test('goals: a sinking fund with a set-aside, the month it is reached, on time or not, what it costs the FI date', () => {
  let s = demo();
  s = { ...s, goals: [...(s.goals || []), { id: 'trip', type: 'savings', label: 'Trip', target: { value: 2400, kind: 'known', asOf: T, source: 'test' }, monthly: { value: 200, kind: 'known', asOf: T, source: 'test' }, by: '2027-12-01', sinkingFund: { value: true, kind: 'known', asOf: T, source: 'test' }, priority: { value: 1, kind: 'known', asOf: T, source: 'test' }, linkedAccount: { value: 'hysa', kind: 'known', asOf: T, source: 'test' } }] };
  assert.equal(validate(s).ok, true, JSON.stringify(validate(s).errors));
  const g = goalsView(s, R, S(s));
  const trip = g.rows.find((x) => x.id === 'trip');
  assert.equal(trip.held, 9000, 'the linked HYSA already holds it');
  assert.equal(trip.toGo, 0);
  assert.equal(trip.months, 0);
  assert.equal(trip.onTime, true);
  assert.ok(trip.fiCostMonths === null || trip.fiCostMonths >= 0);
  const far = { ...s, goals: s.goals.map((x) => (x.id === 'trip' ? { ...x, linkedAccount: undefined, by: '2027-04-01' } : x)) };
  const t2 = goalsView(far, R, S(far)).rows.find((x) => x.id === 'trip');
  assert.equal(t2.toGo, 2400);
  assert.equal(t2.months, 12);
  assert.equal(t2.onTime, false, 'twelve months at 200 misses April');
  assert.ok(t2.neededMonthly > 200);
  assert.equal(g.setAsideTotal, 200);
});

test('life events: a template lands rough lines from a date and can be removed again', () => {
  const s = demo();
  const templates = readJson('data/life-events.json').templates;
  const lose = templates.find((t) => t.id === 'lose-job');
  const r = applyLifeEvent(s, lose, '2026-11-01');
  assert.equal(r.added.length, lose.items.length);
  assert.ok(r.spine.income.some((x) => x.lifeEvent === 'lose-job' && x.amount.kind === 'rough'));
  assert.ok(r.spine.expenses.some((x) => x.lifeEvent === 'lose-job'));
  assert.equal(validate(r.spine).ok, true, JSON.stringify(validate(r.spine).errors));
  assert.equal(r.shockMonths, 3);
  const back = removeLifeEvent(r.spine, 'lose-job');
  assert.equal(back.income.length, s.income.length);
  assert.equal(back.expenses.length, s.expenses.length);
});

test('a diff between two households names every Fact that changed, was added or removed', () => {
  const a = demo();
  let b = putFact(a, 'expenses.rent.amount', 1900, 'known', T);
  b = { ...b, expenses: b.expenses.filter((e) => e.id !== 'gym') };
  const d = diffSpines(a, b);
  assert.ok(d.some((x) => x.path === 'expenses.rent.amount' && x.change === 'changed' && x.before === 1800 && x.after === 1900));
  assert.ok(d.some((x) => x.path === 'expenses.gym.amount' && x.change === 'removed'));
  assert.equal(diffSpines(a, a).length, 0);
});

test('export and import: a versioned file round-trips, upgrades, validates, and refuses junk; CSV of the log and the lines', () => {
  let s = demo();
  s = logSpend(s, { amount: 12.5, date: T, tag: 'food', merchant: 'Blue, Bottle' }).spine;
  const text = exportJson(s, { exportedAt: T });
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, 'slam-export/1');
  const back = importJson(text);
  assert.deepEqual(back.spine.log, s.log);
  assert.equal(back.exportedAt, T);
  assert.throws(() => importJson('not json'), /Not a JSON/);
  assert.throws(() => importJson('{"a":1}'), /Not a SLAM household/);
  assert.throws(() => importJson(JSON.stringify({ ...s, expenses: [{ id: 'x' }] })), /does not validate/);
  const csv = exportCsv(s, 'log');
  assert.match(csv, /^date,kind,amount/);
  assert.match(csv, /"Blue, Bottle"/);
  assert.match(exportCsv(s, 'lines'), /expenses,rent,Rent/);
  assert.throws(() => exportCsv(s, 'nope'));
});

test('What it takes with no age typed: the FI assumptions\' age, else 65 as a guess (morning answer 7)', () => {
  const s = demo();
  const a = solvers(s, R, summarize(s, R, { flags: false }));
  assert.deepEqual([a.targetAge, a.ageFrom], [65, 'assumptions']);
  assert.ok(a.rows.length && a.rows.every((r) => r.value === null || typeof r.value === 'number'));
  const none = { ...s, assumptions: { ...s.assumptions, coastAge: undefined } };
  const b = solvers(none, R, summarize(none, R, { flags: false }));
  assert.deepEqual([b.targetAge, b.ageFrom], [R.get('APP_COAST_AGE', 2026), 'guess']);
  assert.ok(b.rough.includes('assumptions.coastAge'), 'shown as a guess');
  assert.equal(solvers(s, R, summarize(s, R, { flags: false }), { byAge: 55 }).ageFrom, 'typed');
});

test('Step 1, the starter cushion: a fixed $1,000, the biggest deductible, a month of housing or a month of needs (S-261)', () => {
  const s = demo(), x = S(s);
  const at = (basis) => { const sp = putFact(s, 'household.starterBasis', basis, 'known', T); return fooLadder(sp, R, S(sp)).rungs[0]; };
  const cash = x.sheet.cash.value;
  assert.equal(at('fixed').need, Math.max(0, 1000 - cash));
  assert.equal(at('deductible').need, null, 'no deductible typed: a question');
  const housing = Math.ceil(x.cashflow.expenses.items.filter((i) => i.fat === 'accommodation' && !i.covered).reduce((a, i) => a + i.amount, 0));
  assert.match(at('housing').why, new RegExp('a month of housing \\(\\$' + housing.toLocaleString('en-US') + '\\)'));
  assert.match(at('needs').why, /a month of needs and debt minimums/);
  // An older file with a typed deductible and no choice keeps the deductible.
  const old = putFact(s, 'household.deductible', 2500, 'known', T);
  assert.match(fooLadder(old, R, S(old)).rungs[0].why, /the biggest deductible \(\$2,500\)/);
});

test('each saving step says when its gap is done at 3, 6 and 12 months, and at the whole surplus (S-263)', async () => {
  const { stepPaces } = await import('../engine/plan.js');
  const r = { need: 406, flow: false, done: false };
  const p = stepPaces(r, 0, '2026-10-27');
  assert.deepEqual(p.map((x) => [x.months, x.perMonth, x.by]), [[3, 136, '2027-01'], [6, 68, '2027-04'], [12, 34, '2027-10']]);
  assert.deepEqual(stepPaces(r, 100, '2026-10-27').find((x) => x.label).months, 5);
  assert.deepEqual(stepPaces({ need: 300, flow: true }, 100, '2026-10-27'), [], 'a monthly step has no gap');
  assert.deepEqual(stepPaces({ need: 0, done: true }, 100, '2026-10-27'), []);
});

// S-272: a two-tier match (100% of the first 3%, then 50% of the next 2%) on $6,000 a month: $300 a month in for the full
// match ($240 matched); $100 in gets $100.
test('match tiers: the windfall step counts the match lost tier by tier', () => {
  let s = demo();
  s = putFact(s, 'accounts.k401.matchTiers', [{ rate: 1, upTo: 0.03 }, { rate: 0.5, upTo: 0.02 }], 'known', T);
  s = putFact(s, 'accounts.k401.monthlyContribution', 100, 'known', T);
  const sw = surplusWaterfall(s, R, S(s));
  const m = sw.steps.find((x) => x.id === 'employerMatch');
  const gross = S(s).cashflow.income.streams.filter((x) => x.type === 'w2').reduce((a, x) => a + x.gross, 0);
  assert.equal(m.need, Math.round((0.05 * gross - 100) * 100) / 100);
  assert.match(m.why, /of match lost/);
});
