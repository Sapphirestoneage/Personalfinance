// How much to max it? (S-211): for each tax-advantaged account and open tax
// year, the limit plus the catch-up, less what is in, is the room left; IRA
// room is capped at the year's earned income; deadlines are rules; a lump sum,
// a month and a paycheck to the deadline; the cash check on the day-by-day run;
// the calendar's deadline chips; the FOO rungs and the Windfall Roth step read
// the same rows. Every expected number below is worked by hand in its comment.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { makeRules } from '../engine/rules.js';
import { putFact, addContribution, editIncome, recordContribution, skipOccurrence, logSpend, confirmOccurrence } from '../engine/edits.js';
import { windfall } from '../engine/windfall.js';
import { fooLadder } from '../engine/plan.js';
import { calendar } from '../engine/calendar.js';
import { milestones, yearStrip } from '../engine/calendar-views.js';
import { maxIt, maxItRow, maxItSim, maxItCash, maxItDeadlines, deadlineOf, openYears, monthlyDates, maxItTypes } from '../engine/maxit.js';
import { earnedIncome, yearTax } from '../engine/tax.js';
import { cashflow, payrollShares } from '../engine/cashflow.js';
import { explainMetric } from '../engine/math.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const T = '2026-10-22';
const F = (value, kind = 'known') => ({ value, kind, asOf: '2026-10-01', source: 'test' });
const acct = (id, type, family, extra = {}) => ({ id, type, family, name: F(id), balance: F(1000), ...extra });
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
// The demo (Casey: single, New York, born 1994-03-10; a 401(k) at $500 a month, a Roth IRA at $300 a month)
// plus a traditional IRA, an HSA, a SEP IRA and a 529.
const every = () => {
  const d = demo();
  return { ...d, accounts: [...d.accounts,
    acct('trad', 'traditional_ira', 'ira', { contributions: F([{ year: 2026, amount: 1000 }, { year: 2026, amount: 5000, kind: 'rollover' }]) }),
    acct('hsa', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(100), employerSeed: F(500) }),
    acct('sep', 'sep_ira', 'ira'),
    acct('kid', 'k529', 'education')] };
};
const row = (mx, id) => mx.rows.find((r) => r.id === id);

test('deadlines are rules found by account type, with their sources, marked verify', () => {
  for (const id of ['DEADLINE_IRA', 'DEADLINE_HSA', 'DEADLINE_PAYROLL', 'DEADLINE_SOLO_ELECT', 'DEADLINE_SOLO_FUND', 'DEADLINE_SEP', 'DEADLINE_529_NY']) {
    const m = R.meta(id, 2026);
    assert.equal(m.verified, 'verify', id);
    assert.ok(m.source && m.notes, id + ' has a source and words');
  }
  // Tax filing day without extensions; payroll by December 31; the filing deadline with extensions; the NY 529 deduction by December 31.
  assert.equal(deadlineOf(R, 'roth_ira', 2026).date, '2027-04-15');
  assert.equal(deadlineOf(R, 'hsa', 2026).date, '2027-04-15');
  assert.equal(deadlineOf(R, 'k401', 2026).date, '2026-12-31');
  assert.equal(deadlineOf(R, 'k401', 2026).main, 'paycheck');
  assert.equal(deadlineOf(R, 'roth_ira', 2026).main, 'month');
  assert.equal(deadlineOf(R, 'sep_ira', 2026).date, '2027-10-15');
  const solo = deadlineOf(R, 'solo_k401', 2026);
  assert.deepEqual([solo.date, solo.elect.date], ['2027-10-15', '2026-12-31']);
  assert.equal(deadlineOf(R, 'k529', 2026).date, '2026-12-31');
  // Rollover and inherited IRAs have no limit to fill, so no deadline and no button.
  assert.equal(deadlineOf(R, 'rollover_ira', 2026), null);
  assert.ok(!maxItTypes(R, 2026).includes('inherited_ira'));
  // A filing-day deadline on a weekend says the IRS deadline moves (April 15, 2028 is a Saturday); December 31 never moves.
  assert.match(deadlineOf(R, 'roth_ira', 2027).words, /April 15, 2028 is a Saturday, so the IRS deadline is the next business day/);
  assert.equal(deadlineOf(R, 'roth_ira', 2026).weekend, false);
  assert.equal(deadlineOf(R, 'k401', 2028).weekend, false, 'December 31, 2028 is a Sunday, but payroll has no filing day');
  // A date changes in data, not code.
  const reg = readJson('data/rules-2026.json');
  const moved = makeRules({ ...reg, rules: reg.rules.map((r) => (r.id === 'DEADLINE_IRA' ? { ...r, value: '05-17' } : r)) });
  assert.equal(deadlineOf(moved, 'roth_ira', 2026).date, '2027-05-17');
});

test('a spine with contributions on a 401(k), an HSA or a 529 validates; a rollover entry says so', () => {
  const s = every();
  assert.deepEqual(validate(s).errors, []);
  const bad = { ...s, accounts: s.accounts.map((a) => (a.id === 'trad' ? { ...a, contributions: F([{ year: 2026, amount: 1, kind: 'gift' }]) } : a)) };
  assert.ok(validate(bad).errors.some((e) => /contribution, rollover, conversion/.test(e.message)));
});

test('the room for every account type on the demo, by hand', () => {
  const s = every();
  const mx = maxIt(s, R, { sim: maxItSim(s, R) });
  // 401(k): $24,500 less about $5,000 in ($500 a month for 10 months of pay) = $19,500. It fills only through pay, and the
  // salary pays on the 15th: 2 paychecks (Nov 15, Dec 15). The $500 already coming out of each puts in $1,000 more, so the
  // new money is $18,500, $9,250 a paycheck: set the deferral to $9,750, more than a paycheck holds.
  const k = row(mx, 'k401:2026');
  assert.deepEqual([k.limit.value, k.contributed.value, k.room, k.still.value, k.lump, k.perMonth, k.months.count], [24500, 5000, 19500, 1000, 18500, 9250, 2]);
  assert.deepEqual([k.paychecks.count, k.paychecks.extra, k.paychecks.current, k.paychecks.perPaycheck, k.paychecks.tooBig], [2, 9250, 500, 9750, true]);
  assert.deepEqual(k.paychecks.dates, ['2026-11-15', '2026-12-15']);
  assert.equal(k.kind, 'rough', 'what is in is a guess from the monthly amount');
  // The IRAs share one $7,500 limit: the Roth's about $3,000 ($300 x 10) plus the traditional's $1,000 (the $5,000 rollover
  // does not count) = $4,000 in, $3,500 left on both. The Roth's $300 still goes in for November and December ($600), so
  // the new money is $2,900, over 6 months $483.33 up to $483.34, the last one $483.30.
  for (const id of ['roth:2026', 'trad:2026']) assert.deepEqual([row(mx, id).room, row(mx, id).lump, row(mx, id).perMonth, row(mx, id).months.count, row(mx, id).months.last], [3500, 2900, 483.34, 6, 483.3], id);
  assert.deepEqual(row(mx, 'roth:2026').sharedWith, ['trad']);
  // HSA, self-only: $4,400 less $1,000 (10 months of $100 from pay) and the $500 from the employer = $2,900; $100 from the
  // November and December paychecks still goes in, so $2,700 of new money, / 6 months = $450.
  const h = row(mx, 'hsa:2026');
  assert.deepEqual([h.limit.value, h.contributed.value, h.room, h.still.value, h.perMonth], [4400, 1500, 2900, 200, 450]);
  // SEP: 20% of net self-employment earnings. Tutoring $6,000; SE tax $6,000 x 0.9235 x 15.3% = $847.77, half $423.89; $5,576.11 x 20% = $1,115.22.
  const sep = row(mx, 'sep:2026');
  assert.deepEqual([sep.limit.value, sep.room, sep.months.count, sep.perMonth], [1115.22, 1115.22, 12, 92.94]);
  // 529 in New York: the $5,000 single deduction cap, by December 31: 3 months, $1,666.67.
  assert.deepEqual([row(mx, 'kid:2026').room, row(mx, 'kid:2026').perMonth], [5000, 1666.67]);
  // Totals count the shared IRA room once: 19,500 + 3,500 + 2,900 + 1,115.22 + 5,000 of room; new money 18,500 + 2,900 +
  // 2,700 + 1,115.22 + 5,000. A month: $9,250 + $483.34 + $450 + $92.94 + $1,666.67 to December 31, then less as deadlines pass.
  // The 401(k) counts only what its paychecks hold: $4,111 lands from each (after the $500 deferral and the $100 to
  // the HSA), so 2 x $4,111 of its $18,500.
  assert.equal(k.paychecks.landed, 4111);
  assert.deepEqual(mx.totals.short, ['k401:2026']);
  assert.deepEqual([mx.totals.room, mx.totals.lump], [32015.22, 2 * 4111 + 2900 + 2700 + 1115.22 + 5000]);
  // The 401(k)'s step ends on its last 2026 payday, December 15 (S-214); the 529's runs to December 31.
  assert.deepEqual(mx.totals.steps, [{ until: '2026-12-15', perMonth: 4111 + 483.34 + 450 + 92.94 + 1666.67 }, { until: '2026-12-31', perMonth: 483.34 + 450 + 92.94 + 1666.67 }, { until: '2027-04-15', perMonth: 1026.28 }, { until: '2027-10-15', perMonth: 92.94 }]);
  // Without the day-by-day run nothing says what lands, so the whole $18,500 counts.
  assert.equal(maxIt(s, R).totals.lump, 30215.22);
  assert.equal(mx.totals.groups, 5);
});

test('catch-up by the age reached on December 31, and the 60 to 63 super catch-up', () => {
  const at = (birth) => { const s = every(); return maxIt({ ...s, household: { ...s.household, people: [{ ...s.household.people[0], birthDate: F(birth) }] } }, R); };
  // Turns 50 on December 31, 2026: the whole year gets the catch-up.
  const fifty = at('1976-12-31');
  assert.equal(row(fifty, 'k401:2026').limit.value, 24500 + 8000);
  assert.equal(row(fifty, 'roth:2026').limit.value, 7500 + 1100);
  assert.equal(row(fifty, 'hsa:2026').limit.value, 4400, 'the HSA catch-up waits for 55');
  const sixtyOne = at('1965-06-01');
  assert.equal(row(sixtyOne, 'k401:2026').limit.value, 24500 + 11250);
  assert.equal(row(sixtyOne, 'k401:2026').limit.catchUpRule, 'K401_CU6063');
  assert.equal(row(sixtyOne, 'hsa:2026').limit.value, 4400 + 1000);
  assert.equal(row(at('1962-01-01'), 'k401:2026').limit.catchUpRule, 'K401_CU50', 'at 64 the age 50 catch-up again');
});

test('IRA room is capped at the year\'s earned income, and unemployment does not count', () => {
  let s = demo();
  // A $500-a-month W-2 for January to March and $2,000 a month of unemployment: earned income is $1,500 less
  // nothing pre-tax (the 401(k) monthly amount is set to 0 here), so the Roth room is $1,500, not $4,500.
  s = putFact(s, 'accounts.k401.monthlyContribution', 0, 'known', T);
  s = { ...s, income: [{ ...s.income[0], amount: F(500), end: '2026-03-31' }, { ...s.income[1], amount: F(0) }, { id: 'ui', type: 'unemployment', label: 'Unemployment', personId: 'casey', amount: F(2000), cadence: 'monthly', start: '2026-04-01', end: '2026-12-31', withholding: { federal: F(0), state: F(0) } }] };
  const r = maxItRow(s, R, s.accounts.find((a) => a.id === 'roth'), 2026, { asOf: T });
  assert.equal(r.cap.value, 1500);
  assert.equal(r.room, 0, '$1,500 earned less about $3,000 in: nothing left');
  assert.match(r.why, /Capped at 2026 earned income/);
  // Earned income missing: an earning line for the year with no amount. The room is missing, never a number.
  const blank = putFact(demo(), 'income.tutoring.amount', null, 'missing', T);
  const m = maxIt(blank, R);
  const roth = row(m, 'roth:2026');
  assert.equal(roth.room, null);
  assert.equal(roth.perMonth, null);
  assert.equal(roth.missingLabel, 'missing: 2026 earned income');
  assert.ok(roth.missing.includes('income.tutoring.amount'));
  assert.equal(row(m, 'k401:2026').room, 19500, 'a 401(k) is not capped here, so it still has a number');
  const e = explainMetric('maxit:roth:2026:room', { spine: blank, rules: R, maxit: m });
  assert.equal(e.value, null);
  assert.match(e.plugged, /missing$/);
  // The FOO rung that reads it is missing too, and says why.
  const foo = fooLadder(blank, R, summarize(blank, R, { flags: false })).rungs.find((x) => x.id === 'rothHsa');
  assert.equal(foo.need, null);
  assert.match(foo.why, /missing: 2026 earned income/);
});

test('from January 1 to the IRA and HSA deadline, two tax years side by side, assigned to a year', () => {
  const s = every();
  const asOf = '2027-02-10';
  assert.deepEqual(openYears(R, 'roth_ira', asOf), [2026, 2027]);
  assert.deepEqual(openYears(R, 'k401', asOf), [2027], 'payroll closed on December 31');
  const mx = maxIt(s, R, { asOf });
  assert.equal(mx.window.both, true);
  assert.match(mx.window.words, /2026 or 2027/);
  assert.match(mx.window.words, /April 15, 2027/);
  // 2026: $7,500 less the Roth's 12 months of $300 and the traditional's $1,000 = $2,900, over 3 months (Feb 10, Mar 10, Apr 10).
  assert.deepEqual([row(mx, 'roth:2026').room, row(mx, 'roth:2026').months.count, row(mx, 'roth:2026').perMonth], [2900, 3, 966.67]);
  // 2027: $7,500 less 2 months of $300 = $6,900; March to December still put in $3,000, so $3,900 of new money over 15
  // months to April 15, 2028 = $260. The $300 a month from January on counts for 2027, never twice.
  assert.deepEqual([row(mx, 'roth:2027').room, row(mx, 'roth:2027').still.value, row(mx, 'roth:2027').months.count, row(mx, 'roth:2027').perMonth], [6900, 3000, 15, 260]);
  assert.equal(row(mx, 'roth:2026').still.value, 0, 'nothing more of the $300 a month counts for 2026');
  // After April 15 only one year is open again.
  assert.equal(maxIt(s, R, { asOf: '2027-04-16' }).window.both, false);
});

test('a lump sum, a month and a paycheck: the dates run from today to the deadline', () => {
  assert.deepEqual(monthlyDates('2026-10-31', '2027-01-15'), ['2026-10-31', '2026-11-30', '2026-12-31']);
  assert.deepEqual(monthlyDates('2026-12-31', '2026-12-31'), ['2026-12-31']);
  // On the last day a 529 still has one month; a 401(k) has no paycheck left (the salary pays on the 15th), so its room
  // cannot be filled and stays out of the totals. The day after, the year is closed.
  const s = every();
  const last = maxIt(s, R, { asOf: '2026-12-31' });
  assert.equal(row(last, 'kid:2026').months.count, 1);
  const k = row(last, 'k401:2026');
  assert.deepEqual([k.fillable, k.lump, k.perMonth, k.months.count], [false, null, null, 0]);
  assert.match(k.why, /cannot be filled/);
  assert.ok(last.totals.unfillable.includes('k401:2026'));
  assert.ok(!last.pools.some((p) => p.key.startsWith('deferral:')));
  assert.equal(row(maxIt(s, R, { asOf: '2027-01-01' }), 'k401:2026'), undefined);
  // Payroll money counts the as-of month only once its payday has passed: on October 10, 9 months of $500.
  const early = row(maxIt(demo(), R, { asOf: '2026-10-10' }), 'k401:2026');
  assert.deepEqual([early.contributed.value, early.paychecks.dates], [4500, ['2026-10-15', '2026-11-15', '2026-12-15']]);
});

test('the cash check: the per-month amounts through the day-by-day run, the floor and the payoff dates', () => {
  // The demo can not fill a $19,500 401(k) by December: the floor breaks and payments fall short.
  const s = demo();
  const sim = maxItSim(s, R);
  const mx = maxIt(s, R, { sim });
  const all = maxItCash(s, R, mx, { sim });
  assert.equal(all.breaks, true);
  assert.ok(all.newShortfalls > 0);
  assert.match(all.words, /breaks the cash floor/);
  // Only new money leaves checking (the $300 a month is in the run already): the Roth's $3,900, $650 a month for 6 months.
  const roth = maxItCash(s, R, mx, { sim, rows: mx.rows.filter((r) => r.id === 'roth:2026') });
  assert.equal(roth.total, 3900);
  assert.equal(roth.flows.length, 6);
  // A richer household keeps the floor on the Roth alone; the 401(k) (what its paychecks hold) pushes the store card's payoff.
  let rich = putFact(demo(), 'accounts.chk.balance', 10000, 'known', T);
  rich = applyDefaults(putFact(rich, 'debtPlan.extra', 400, 'known', T), R);
  const rsim = maxItSim(rich, R);
  const rmx = maxIt(rich, R, { sim: rsim });
  const ok = maxItCash(rich, R, rmx, { sim: rsim, rows: rmx.rows.filter((r) => r.id === 'roth:2026') });
  assert.equal(ok.breaks, false);
  assert.match(ok.words, /keeps the cash floor/);
  assert.match(ok.words, /No card or loan payoff date moves/);
  const k = maxItCash(rich, R, rmx, { sim: rsim, rows: rmx.rows.filter((r) => r.id === 'k401:2026') });
  assert.ok(k.pushed && k.pushed.days > 0, 'a payoff moves later');
  assert.match(k.words, /pushes the .+ payoff from .+ days later/);
  // Its math: the lowest day with it, recomputed from the terms the panel shows.
  const ctx = { spine: rich, rules: R, maxit: rmx, maxitCash: (key) => (key === 'k401:2026' ? k : null) };
  const low = explainMetric('maxit:k401:2026:low', ctx);
  assert.equal(low.value, k.after.low.cash);
  assert.equal(low.recomputed, low.value);
  assert.equal(explainMetric('maxit:k401:2026:payoff', ctx).value, k.pushed.days);
});

test('every number has its math: the room recomputes from the terms it shows', () => {
  const s = every();
  const sim = maxItSim(s, R);
  const mx = maxIt(s, R, { sim });
  for (const r of mx.rows) {
    const e = explainMetric('maxit:' + r.accountId + ':' + r.year + ':room', { spine: s, rules: R, maxit: mx });
    assert.equal(e.recomputed, e.value, r.id + ': ' + e.plugged);
    assert.ok(e.rules.length, r.id + ' names its rules');
    for (const what of ['lump', 'month', 'paycheck']) { const x = explainMetric('maxit:' + r.accountId + ':' + r.year + ':' + what, { spine: s, rules: R, maxit: mx }); assert.ok(Math.abs(x.value - x.recomputed) < 0.005, r.id + ' ' + what); }
  }
  const tot = explainMetric('maxit:all:month', { spine: s, rules: R, maxit: mx });
  assert.equal(tot.value, mx.totals.perMonth);
  assert.equal(tot.recomputed, tot.value);
});

test('deadline chips on the calendar: on the day, never added to a total, with the room in words', () => {
  const s = demo();
  const dec = calendar(s, R, { from: '2026-12', months: 1 }).months[0];
  const chip = dec.events.find((e) => e.kind === 'maxDeadline');
  assert.equal(chip.date, '2026-12-31');
  assert.equal(chip.counted, false);
  assert.equal(chip.path, 'accounts.k401.contributions');
  assert.match(chip.label, /Work 401\(k\): last day for 2026 contributions/);
  assert.match(chip.note, /\$19,500 of room left for 2026/);
  const plain = calendar(putFact(s, 'accounts.k401.balance', 45000, 'known', T), R, { from: '2026-12', months: 1 }).months[0];
  assert.equal(dec.out, plain.out, 'the chip moves no money');
  // Milestones and the year strip carry it too.
  const apr = calendar(s, R, { from: '2027-04', months: 1 });
  assert.ok(milestones(s, R, apr.sim || calendar(s, R, { from: '2026-10', months: 1 }).sim, apr.months).some((m) => m.kind === 'maxDeadline' && m.date === '2027-04-15'));
  const ys = yearStrip(s, R, {});
  assert.deepEqual(ys.months.filter((m) => m.deadlines.length).map((m) => m.ym), ['2026-12', '2027-04']);
  // A Solo 401(k) gets its December 31 election day too.
  const solo = { ...s, accounts: [...s.accounts, acct('solo', 'solo_k401', 'employerRetirement')] };
  const days = maxItDeadlines(solo, R, '2026-12-01', '2027-10-31').filter((e) => e.accountId === 'solo').map((e) => [e.date, e.source]);
  assert.deepEqual(days, [['2026-12-31', 'DEADLINE_SOLO_ELECT'], ['2027-10-15', 'DEADLINE_SOLO_FUND']]);
});

test('the FOO rungs and the Windfall Roth step read the same rows', () => {
  const s = every();
  const sum = summarize(s, R, { flags: false });
  const mx = maxIt(s, R);
  const foo = fooLadder(s, R, sum).rungs;
  // The surplus reaches these rungs about November 22, 2028, after the 2026 deadlines, so each limit is sized by its
  // steady month: a whole year's room less what already goes in, a twelfth. Roth and HSA: the IRAs ($7,500 - 12 x $300)
  // / 12 = $325 and the HSA ($4,400 - 12 x $100 - $500) / 12 = $225. Retirement: the 401(k) ($24,500 - 12 x $500) / 12
  // = $1,541.67 and the SEP $1,115.22 / 12 = $92.94.
  assert.equal(foo.find((r) => r.id === 'rothHsa').need, 550);
  assert.equal(foo.find((r) => r.id === 'maxRetirement').need, 1634.61);
  assert.match(foo.find((r) => r.id === 'maxRetirement').why, /Work 401\(k\): about \$1,542 a month in a whole year at 2026 limits/);
  assert.match(foo.find((r) => r.id === 'maxRetirement').why, /Work 401\(k\) 2026 closes on December 31, 2026, before the surplus reaches this rung/);
  // Open today: the rung reads the new money a month to each deadline.
  const now = fooLadder({ ...s, debts: [] }, R, summarize({ ...s, debts: [] }, R, { flags: false })).rungs.find((r) => r.id === 'rothHsa');
  assert.ok(now.need > 0);
  // The Windfall's Roth step takes the same new money, and in the monthly order the same amount a month.
  const w = windfall(s, R, sum, { amount: 50000, taxed: true }).steps.find((x) => x.id === 'roth');
  assert.equal(w.need, row(mx, 'roth:2026').lump);
  const m = windfall(s, R, sum, { amount: 0, taxed: true, monthly: true }).steps.find((x) => x.id === 'roth');
  assert.equal(m.need, row(mx, 'roth:2026').perMonth);
  assert.match(m.why, /a month for 6 months, to April 15, 2027/);
});

test('accounts that do not apply say why: a 529 outside New York, an HSA on a plan that is not eligible', () => {
  const s = every();
  const ca = { ...s, household: { ...s.household, state: F('CA') } };
  const kid = row(maxIt(ca, R), 'kid:2026');
  assert.equal(kid.applies, false);
  assert.match(kid.why, /not modeled/);
  const no = { ...s, accounts: s.accounts.map((a) => (a.id === 'hsa' ? { ...a, planEligible: F('no') } : a)) };
  const h = row(maxIt(no, R), 'hsa:2026');
  assert.deepEqual([h.applies, h.room], [false, 0]);
  // A missing coverage level reads as self-only, rough.
  const lvl = { ...s, accounts: s.accounts.map((a) => (a.id === 'hsa' ? { ...a, coverageLevel: F(null, 'missing') } : a)) };
  const hr = row(maxIt(lvl, R), 'hsa:2026');
  assert.equal(hr.limit.value, 4400);
  assert.ok(hr.rough.includes('accounts.hsa.coverageLevel'));
});

test('a married couple: each spouse has an IRA limit, and together they never pass the couple\'s earned income', () => {
  // Casey earns $1,000 a month January to March ($3,000) and put $2,000 into the Roth; Jamie earns nothing and has a spousal IRA.
  let s = putFact(demo(), 'accounts.k401.monthlyContribution', 0, 'known', T);
  s = { ...s, household: { ...s.household, filingStatus: F('mfj'), people: [...s.household.people, { id: 'jamie', name: 'Jamie Rivera', birthDate: F('1995-05-05') }] },
    income: [{ ...s.income[0], amount: F(1000), end: '2026-03-31' }, { ...s.income[1], amount: F(0) }],
    accounts: [...s.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 2000 }]) } : a)), acct('sp', 'spousal_ira', 'ira', { owner: F('partner') })] };
  assert.equal(earnedIncome(s, R, 2026, { personId: 'casey' }).value, 3000);
  assert.deepEqual([earnedIncome(s, R, 2026, { personId: 'jamie' }).value, earnedIncome(s, R, 2026, { personId: 'jamie' }).label], [0, '2026 earned income, Jamie Rivera']);
  const mx = maxIt(s, R);
  // Casey: $3,000 less $2,000 in = $1,000. Jamie: the couple's $3,000 less Casey's $2,000 = $1,000, in a separate pool.
  assert.deepEqual([row(mx, 'roth:2026').room, row(mx, 'roth:2026').pools], [1000, ['ira:casey']]);
  assert.deepEqual([row(mx, 'sp:2026').room, row(mx, 'sp:2026').cap.value, row(mx, 'sp:2026').pools], [1000, 1000, ['ira:jamie']]);
  // Together only $1,000 is left of the couple's $3,000, so the total counts $1,000, not $2,000.
  assert.equal(mx.totals.lump, 1000);
  assert.deepEqual(mx.pools.map((p) => [p.key, p.room]), [['ira:casey', 1000], ['ira:jamie', 0]]);
});

test('shared limits: a Solo 401(k) with a W-2 401(k), a SEP with a Solo 401(k), a SIMPLE with a 401(k)', () => {
  // Solo 401(k): employee deferral $24,500 less the 401(k)'s $5,000 = $19,500; employer 20% of $5,576.11 = $1,115.22;
  // in all no more than the $5,576.11 earned. The employer part goes first (no other plan can take it).
  const s = { ...demo(), accounts: [...demo().accounts, acct('solo', 'solo_k401', 'employerRetirement')] };
  const mx = maxIt(s, R);
  const solo = row(mx, 'solo:2026');
  assert.deepEqual([solo.room, solo.parts['employer:casey'], solo.parts['deferral:casey'], solo.deadline.date], [5576.11, 1115.22, 4460.89, '2027-10-15']);
  assert.deepEqual(row(mx, 'k401:2026').sharedWith, ['solo']);
  // The deferral limit is counted once (the 401(k)'s $19,500 room) plus the Solo's employer part and the Roth; the new
  // money takes off the $1,000 and $600 still set to go in: $18,500 + $1,115.22 + $3,900.
  assert.deepEqual([mx.totals.room, mx.totals.lump], [19500 + 1115.22 + 4500, 18500 + 1115.22 + 3900]);
  // After December 31 the employee deferral can no longer be elected for 2026: the employer part is the room.
  const late = row(maxIt(s, R, { asOf: '2027-01-10' }), 'solo:2026');
  assert.deepEqual([late.room, late.cap.electGone], [1115.22, true]);
  assert.match(late.why, /had to be elected by December 31, 2026/);
  // $1,000 of employer money recorded in the Solo 401(k) leaves a SEP on the same earnings $115.22.
  const both = { ...s, accounts: [...s.accounts.map((a) => (a.id === 'solo' ? { ...a, contributions: F([{ year: 2026, amount: 1000, kind: 'employer' }]) } : a)), acct('sep', 'sep_ira', 'ira')] };
  const m2 = maxIt(both, R);
  assert.equal(row(m2, 'sep:2026').room, 115.22);
  assert.equal(row(m2, 'solo:2026').room, 5576.11 - 1000);
  // A SIMPLE IRA at $1,000 a month: its own $17,000 less $10,000 = $7,000, inside the $24,500 it shares with the 401(k)
  // ($5,000 + $10,000 in leaves $9,500, which is also the 401(k)'s room).
  const sm = maxIt({ ...demo(), accounts: [...demo().accounts, acct('simple', 'simple_ira', 'ira', { monthlyContribution: F(1000) })] }, R);
  assert.deepEqual([row(sm, 'simple:2026').room, row(sm, 'k401:2026').room, row(sm, 'simple:2026').main], [7000, 9500, 'paycheck']);
});

test('an HSA: self-only coverage is per person, family coverage is one limit for the household', () => {
  let s = demo();
  s = { ...s, household: { ...s.household, filingStatus: F('mfj'), people: [...s.household.people, { id: 'jamie', name: 'Jamie Rivera', birthDate: F('1995-05-05') }] },
    accounts: [...s.accounts, acct('h1', 'hsa', 'hsaFsa', { coverageLevel: F('self') }), acct('h2', 'hsa', 'hsaFsa', { coverageLevel: F('self'), owner: F('partner') })] };
  const self = maxIt(s, R);
  assert.deepEqual(self.pools.filter((p) => p.key.startsWith('hsa')).map((p) => [p.key, p.room]), [['hsa:casey', 4400], ['hsa:jamie', 4400]]);
  // Family: $8,750 less $3,000 and $1,000 = $4,750, once.
  const fam = { ...s, accounts: s.accounts.map((a) => (a.type === 'hsa' ? { ...a, coverageLevel: F('family'), contributions: F([{ year: 2026, amount: a.id === 'h1' ? 3000 : 1000 }]) } : a)) };
  const mf = maxIt(fam, R);
  assert.deepEqual([row(mf, 'h1:2026').room, row(mf, 'h2:2026').room], [4750, 4750]);
  assert.deepEqual(mf.pools.filter((p) => p.key.startsWith('hsa')).map((p) => [p.key, p.room]), [['hsa:family', 4750]]);
});

test('the Roth phase-out: modified AGI leaves out conversions, rounds up to $10, never under $200', () => {
  const roth = (sal, extra = (x) => x) => row(maxIt(extra(putFact(demo(), 'income.salary.amount', sal, 'known', T)), R), 'roth:2026');
  // $13,000 a month: AGI $156,000 - $6,000 to the 401(k) + $5,576.11 of tutoring = $155,576.11, $2,576.11 into the
  // $153,000 to $168,000 range: $7,500 - $7,500 x 2,576.11 / 15,000 = $6,211.94, up to $6,220; less $3,000 in = $3,220.
  const a = roth(13000);
  assert.deepEqual([a.phase.magi, a.phase.limit, a.room], [155576.11, 6220, 3220]);
  // A $20,000 conversion raises AGI but not modified AGI: the same limit.
  const c = roth(13000, (s) => ({ ...s, accounts: s.accounts.map((x) => (x.id === 'roth' ? { ...x, conversions: F([{ year: 2026, amount: 20000, taxable: 20000 }]) } : x)) }));
  assert.deepEqual([c.phase.magi, c.phase.limit], [155576.11, 6220]);
  // $14,010 a month: $167,696.11, so $7,500 - $7,348.06 = $151.94, up to $160, and the $200 floor.
  assert.equal(roth(14010).phase.limit, 200);
  assert.match(roth(14010).phase.words, /never under \$200/);
});

test('missing stays missing: a blank filing status for a New York 529, a blank monthly amount', () => {
  const s = putFact(every(), 'household.filingStatus', null, 'missing', T);
  const mx = maxIt(s, R);
  const kid = row(mx, 'kid:2026');
  assert.deepEqual([kid.applies, kid.room, kid.perMonth, kid.kind], [true, null, null, 'missing']);
  assert.equal(kid.missingLabel, 'missing: the filing status (it sets the New York deduction cap)');
  assert.ok(mx.totals.missing.includes('kid:2026'));
  assert.ok(Number.isFinite(mx.totals.lump) && Number.isFinite(mx.totals.perMonth));
  // A blank 401(k) monthly amount counts nothing in and says so; the row is incomplete, not known.
  const k = row(maxIt(putFact(demo(), 'accounts.k401.monthlyContribution', null, 'missing', T), R), 'k401:2026');
  assert.deepEqual([k.room, k.kind, k.contributed.parts[0].kind], [24500, 'incomplete', 'missing']);
  assert.ok(k.missing.includes('accounts.k401.monthlyContribution'));
  // It is also what the year's earned income waits on (it comes off the pay), so the IRA names it, not an earning line.
  const roth = row(maxIt(putFact(demo(), 'accounts.k401.monthlyContribution', null, 'missing', T), R), 'roth:2026');
  assert.equal(roth.missingLabel, 'missing: 2026 earned income');
  assert.match(roth.why, /Work 401\(k\): monthly contribution is not entered\.$/);
  // A blank pay amount: the paychecks still come from its schedule and the panel names the blank, but that pay is not
  // in the run, so the 401(k) is left out of the totals (named missing) and the cash check cannot run it.
  const noPay = putFact(demo(), 'income.salary.amount', null, 'missing', T);
  const noSim = maxItSim(noPay, R);
  const noMx = maxIt(noPay, R, { sim: noSim });
  const pay = row(noMx, 'k401:2026');
  assert.deepEqual([pay.paychecks.count, pay.paychecks.blank.path, pay.blankLabel], [2, 'income.salary.amount', 'missing: Salary at Hudson Valley Health amount']);
  assert.ok(noMx.totals.missing.includes('k401:2026'));
  assert.ok(!noMx.pools.some((p) => p.key.startsWith('deferral:')));
  const c = maxItCash(noPay, R, noMx, { sim: noSim, rows: [pay] });
  assert.equal(c.words, 'Cannot be checked against cash until Salary at Hudson Valley Health has an amount: that pay is not in the run.');
  assert.deepEqual([c.flows.length, c.breaks, c.kind], [0, null, 'incomplete']);
  assert.ok(c.missing.includes('income.salary.amount'));
  // With a 529 (which does not wait on pay) in the same check: the run has no salary in it, so the 529's money is
  // named but gets no verdict on the floor (S-214).
  const with529 = { ...noPay, accounts: [...noPay.accounts, acct('kid', 'k529', 'education')] };
  const sim529 = maxItSim(with529, R);
  const both = maxItCash(with529, R, maxIt(with529, R, { sim: sim529 }), { sim: sim529 });
  assert.deepEqual([both.words, both.breaks], ['Cannot be checked against cash until Salary at Hudson Valley Health has an amount: that pay is not in the run. $5,000 more would leave checking by December 22, 2026.', null]);
});

test('over the limit says so; a passed deadline says the year closed, with no amount', () => {
  const s = { ...demo(), accounts: demo().accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 8000 }]) } : a)) };
  const r = row(maxIt(s, R), 'roth:2026');
  assert.deepEqual([r.room, r.over], [0, 500]);
  assert.match(r.why, /Over the 2026 limit by \$500: an excess contribution/);
  const april = maxItDeadlines(demo(), R, '2026-04-01', '2026-04-30');
  assert.deepEqual(april.map((e) => [e.date, e.passed, e.amount]), [['2026-04-15', true, null]]);
  assert.match(april[0].note, /^The 2025 year closed on this day/);
});

test('recording what went in: one entry for the year; a rollover is kept but does not count', () => {
  const s = demo();
  // The demo Roth lists 2021 and 2022 only, so 2026 is a guess from $300 a month; a recorded $1,500 replaces the guess.
  const a = addContribution(s, 'roth', { year: 2026, amount: 1500 }, T);
  assert.deepEqual(a.accounts.find((x) => x.id === 'roth').contributions.value.slice(-1), [{ year: 2026, amount: 1500 }]);
  assert.deepEqual(validate(a).errors, []);
  assert.equal(row(maxIt(a, R), 'roth:2026').room, 6000);
  const b = addContribution(a, 'roth', { year: 2026, amount: 500, kind: 'rollover' }, T);
  assert.deepEqual(b.accounts.find((x) => x.id === 'roth').contributions.value.slice(-1), [{ year: 2026, amount: 500, kind: 'rollover' }]);
  assert.equal(row(maxIt(b, R), 'roth:2026').room, 6000);
  assert.throws(() => addContribution(s, 'roth', { year: 2026, amount: 0 }, T), /above \$0/);
  assert.throws(() => addContribution(s, 'nope', { year: 2026, amount: 10 }, T), /No account nope/);
});

// A W-2 line for a test household, and a married couple.
const w2 = (id, pid, amt, extra = {}) => ({ id, type: 'w2', label: id, personId: pid, amount: F(amt), cadence: 'monthly', start: '2024-01-01', end: null, withholding: { federal: F(0), state: F(0) }, ...extra });
const couple = (s, name = 'Sam') => ({ ...s, household: { ...s.household, filingStatus: F('mfj'), people: [...s.household.people, { id: 'sam', name, birthDate: F('1995-05-05') }] } });

test('married filing jointly: the spouse who earns more is held to their own pay; the Roth phase-out starts from the lesser of the limit and pay', () => {
  // Casey earns $400 a month ($4,800), Sam $250 ($3,000). Casey's Roth: $4,800, Casey's own pay. Sam's IRA counts the
  // couple's $7,800, but together only $7,800 can go in: $4,800 + $3,000.
  let s = putFact(demo(), 'accounts.k401.monthlyContribution', 0, 'known', T);
  s = couple(s);
  s = { ...s, income: [{ ...s.income[0], amount: F(400) }, { ...s.income[1], amount: F(0) }, w2('samjob', 'sam', 250)], accounts: [...s.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined } : a)), acct('st', 'traditional_ira', 'ira', { owner: F('partner') })] };
  const mx = maxIt(s, R);
  assert.deepEqual([row(mx, 'roth:2026').room, row(mx, 'roth:2026').cap.joint], [4800, false]);
  assert.deepEqual([row(mx, 'st:2026').room, row(mx, 'st:2026').cap.value, row(mx, 'st:2026').cap.joint], [7500, 7800, true]);
  assert.deepEqual(mx.pools.filter((p) => p.key.startsWith('ira')).map((p) => [p.key, p.room]), [['ira:casey', 4800], ['ira:sam', 3000]]);
  // $7,500 in Casey's Roth is $2,700 over Casey's own pay.
  const o = { ...s, accounts: s.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 7500 }]) } : a)) };
  assert.equal(row(maxIt(o, R), 'roth:2026').over, 2700);
  // Two people with the filing status blank: whether the couple's pay counts is missing, never $0.
  const blank = putFact(s, 'household.filingStatus', null, 'missing', T);
  assert.deepEqual([row(maxIt(blank, R), 'st:2026').room, row(maxIt(blank, R), 'st:2026').missingLabel], [null, 'missing: the filing status']);
  // Worksheet 2-2 line 6: $4,800 of pay and $160,500 of modified AGI (with $155,700 of unemployment), single: half of
  // $4,800, $2,400 (not half of $7,500).
  let w = putFact(demo(), 'accounts.k401.monthlyContribution', 0, 'known', T);
  w = { ...w, income: [{ ...w.income[0], amount: F(400) }, { ...w.income[1], amount: F(0) }, { id: 'ui', type: 'unemployment', label: 'UI', personId: 'casey', amount: F(155700), cadence: 'yearly', start: '2024-01-01', end: null, withholding: { federal: F(0), state: F(0) } }], accounts: w.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined } : a)) };
  const r = row(maxIt(w, R), 'roth:2026');
  assert.deepEqual([r.phase.magi, r.phase.base, r.phase.limit, r.room], [160500, 4800, 2400, 2400]);
});

test('over the limit by kind: a SIMPLE against its own limit and the shared one, a Solo 401(k) and a SEP on one total, a deferral, a 529, a Roth past its phase-out', () => {
  const d = demo();
  const simple = (k401, simpleIn) => row(maxIt({ ...d, accounts: [...d.accounts.map((a) => (a.id === 'k401' ? { ...a, contributions: F([{ year: 2026, amount: k401 }]) } : a)), acct('simple', 'simple_ira', 'ira', { contributions: F([{ year: 2026, amount: simpleIn }]) })] }, R), 'simple:2026');
  // $15,000 + $10,000 is $500 past the shared $24,500; the SIMPLE's own $10,000 is under its $17,000.
  assert.equal(simple(15000, 10000).over, 500);
  assert.equal(simple(18000, 0).over, null, 'the 401(k) alone under $24,500 is no SIMPLE excess');
  assert.equal(simple(0, 18000).over, 1000, '$18,000 is $1,000 past the SIMPLE\'s own limit');
  // A SEP with $1,000 in leaves a Solo 401(k) on the same $5,576.11 of earnings $4,576.11 (one 100% of earnings).
  const sep = maxIt({ ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement'), acct('sep', 'sep_ira', 'ira', { contributions: F([{ year: 2026, amount: 1000 }]) })] }, R);
  assert.deepEqual([row(sep, 'solo:2026').room, row(sep, 'solo:2026').cap.sepIn, row(sep, 'sep:2026').room], [4576.11, 1000, 115.22]);
  // $5,000 of Solo deferrals leaves a SEP $576.11 of the same earnings.
  const solo = maxIt({ ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 5000 }]) }), acct('sep', 'sep_ira', 'ira')] }, R);
  assert.deepEqual([row(solo, 'sep:2026').room, row(solo, 'solo:2026').room], [576.11, 576.11]);
  // A 401(k) at $25,000 is an excess deferral, paid back by April 15 of the next year.
  const k = row(maxIt({ ...d, accounts: d.accounts.map((a) => (a.id === 'k401' ? { ...a, contributions: F([{ year: 2026, amount: 25000 }]) } : a)) }, R), 'k401:2026');
  assert.equal(k.over, 500);
  assert.match(k.overWords, /an excess deferral\. Have the plan pay it back, with what it earned, by April 15, 2027, or it is taxed twice\./);
  // A 529 past the New York deduction cap is not an excess: that part is not deductible.
  const kid = row(maxIt({ ...d, accounts: [...d.accounts, acct('kid', 'k529', 'education', { contributions: F([{ year: 2026, amount: 8000 }]) })] }, R), 'kid:2026');
  assert.deepEqual([kid.over, kid.aboveCap], [null, 3000]);
  // A Roth at $4,000 when the phase-out leaves $3,220: $780 over.
  const hi = putFact({ ...d, accounts: d.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 4000 }]) } : a)) }, 'income.salary.amount', 13500, 'known', T);
  assert.deepEqual([row(maxIt(hi, R), 'roth:2026').phase.limit, row(maxIt(hi, R), 'roth:2026').over], [3220, 780]);
  // The FOO rung names the excess and is not done.
  const over = { ...d, accounts: d.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 8000 }]) } : a)) };
  const f = fooLadder(over, R, summarize(over, R, { flags: false })).rungs.find((x) => x.id === 'rothHsa');
  assert.equal(f.done, false);
  assert.match(f.why, /Roth IRA 2026: over the limit by \$500/);
  assert.equal(f.need, 325, 'the steady month never counts money over the limit as room');
});

test('a family HSA: one family limit, each spouse\'s own age 55 catch-up on top, filled first by their own money', () => {
  const hsa = (cBirth, sBirth, cIn, sIn, cCov = 'family', sCov = 'family') => {
    let s = couple(demo());
    s = { ...s, household: { ...s.household, people: [{ ...s.household.people[0], birthDate: F(cBirth) }, { ...s.household.people[1], birthDate: F(sBirth) }] }, accounts: [...s.accounts, acct('h1', 'hsa', 'hsaFsa', { coverageLevel: F(cCov), contributions: F([{ year: 2026, amount: cIn }]) }), acct('h2', 'hsa', 'hsaFsa', { coverageLevel: F(sCov), owner: F('partner'), contributions: F([{ year: 2026, amount: sIn }]) })] };
    const mx = maxIt(s, R);
    return { c: row(mx, 'h1:2026'), s: row(mx, 'h2:2026'), pools: mx.pools.filter((p) => p.key.startsWith('hsa')).map((p) => [p.key, p.room]) };
  };
  // Both 55 or older, nothing in: $8,750 + $1,000 + $1,000.
  const both = hsa('1965-01-01', '1966-01-01', 0, 0);
  assert.deepEqual([both.c.room, both.s.room], [9750, 9750]);
  assert.deepEqual(both.pools, [['hsa:family', 8750], ['hsa55:casey', 1000], ['hsa55:sam', 1000]]);
  // $5,375 each: full, and legal.
  const full = hsa('1965-01-01', '1966-01-01', 5375, 5375);
  assert.deepEqual([full.c.room, full.c.over, full.s.room, full.s.over], [0, null, 0, null]);
  // Casey (under 55) put in $9,750: $1,000 over; Sam (55) still has a catch-up of $1,000 and no excess.
  const one = hsa('1994-01-01', '1966-01-01', 9750, 0);
  assert.deepEqual([one.c.over, one.s.room, one.s.over], [1000, 1000, null]);
  // Self-only on one, family on the other: both are family, $8,750 less $2,000 and $6,000.
  const mixed = hsa('1994-01-01', '1995-01-01', 2000, 6000, 'self', 'family');
  assert.deepEqual([mixed.c.room, mixed.s.room, mixed.pools], [750, 750, [['hsa:family', 750]]]);
});

test('whose pay: a plan filled from pay needs its owner\'s pay line; once it is theirs, its paydays are theirs', () => {
  // Jordan's pay was entered under Casey, so Jordan's 401(k) cannot know its paydays: missing, not "cannot be filled".
  let s = couple(demo(), 'Jordan');
  s = { ...s, income: [...s.income, w2('jjob', 'casey', 2500, { cadence: 'semimonthly' })], accounts: [...s.accounts, acct('jk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(250) }), acct('jh', 'hsa', 'hsaFsa', { owner: F('partner'), coverageLevel: F('self'), monthlyContribution: F(150) })] };
  const mx = maxIt(s, R);
  assert.deepEqual([row(mx, 'jk:2026').room, row(mx, 'jk:2026').missingLabel], [null, 'missing: whose pay is Jordan\'s']);
  // An HSA with no pay of its owner's is funded from take-home: 10 months of $150.
  assert.equal(row(mx, 'jh:2026').contributed.value, 1500);
  // Saying whose pay it is: Jordan's semimonthly pay (the 15th and the last day). 9.5 months of $250 are in by October 22
  // (October 15 has passed, October 31 has not); 5 paychecks are left; $250 x 2.5 months still comes out, so $21,500 of
  // new money, $4,300 a paycheck on top of the $125 that comes out of each now: set it to $4,425.
  const fixed = maxIt(editIncome(s, 'jjob', { amount: 2500, cadence: 'semimonthly', personId: 'sam' }, T), R);
  const jk = row(fixed, 'jk:2026');
  assert.deepEqual([jk.contributed.value, jk.room, jk.still.value, jk.paychecks.count, jk.paychecks.perPaycheck], [2375, 22125, 625, 5, 4425]);
  assert.equal(row(fixed, 'k401:2026').paychecks.count, 2, 'Casey\'s 401(k) reads only Casey\'s paydays');
  assert.throws(() => editIncome(s, 'jjob', { amount: 2500, cadence: 'semimonthly', personId: 'nobody' }, T), /No such person/);
});

test('paydays and dates: a payday on the as-of date is still to come; a month part paid counts its share; a biweekly line with no first pay date is missing', () => {
  // October 15 is payday: 9 months are in, 3 paychecks left ($6,666.67, $6,666.67, $6,666.66), and it adds up to $24,500.
  const r = row(maxIt(demo(), R, { asOf: '2026-10-15' }), 'k401:2026');
  assert.deepEqual([r.contributed.value, r.still.value, r.paychecks.count, r.paychecks.perPaycheck, r.paychecks.last], [4500, 1500, 3, 6666.67, 6666.66]);
  assert.equal(Math.round((r.contributed.value + r.paychecks.perPaycheck * 2 + r.paychecks.last) * 100) / 100, 24500);
  // Paid twice a month, on October 20: one of October's two paydays is in.
  const d = demo();
  const semi = row(maxIt({ ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'semimonthly', amount: F(3000) } : x)) }, R, { asOf: '2026-10-20' }), 'k401:2026');
  assert.deepEqual([semi.contributed.value, semi.still.value], [4750, 1250]);
  assert.match(semi.contributed.parts[0].words, /9\.5 months of pay/);
  // Every two weeks with no first pay date: the paydays are missing, named, and the row can still be filled.
  const bi = row(maxIt({ ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'biweekly', start: null } : x)) }, R), 'k401:2026');
  assert.deepEqual([bi.fillable, bi.paychecks.blank.what, bi.paychecks.blank.path, bi.kind], [true, 'first pay date', 'income.salary.payDay', 'incomplete']);
});

test('missing never borrows a number: an earlier year with no rules file, a 529 with no state; a rollover alone leaves the guess', () => {
  // On March 1, 2026 the 2025 IRA year is open, but there are no 2025 limits: missing, not 2026's larger ones.
  const mx = maxIt(demo(), R, { asOf: '2026-03-01' });
  assert.deepEqual([row(mx, 'roth:2025').room, row(mx, 'roth:2025').missingLabel], [null, 'missing: the 2025 limits (the rules file starts at 2026)']);
  // A 529 with the state blank is missing (it may be New York), and its December 31 chip says so.
  const d = demo();
  const kid = putFact({ ...d, accounts: [...d.accounts, acct('kid', 'k529', 'education')] }, 'household.state', null, 'missing', T);
  const k = row(maxIt(kid, R), 'kid:2026');
  assert.deepEqual([k.applies, k.room, k.missingLabel], [true, null, 'missing: the state (only New York\'s 529 deduction is a limit to fill)']);
  assert.ok(maxItDeadlines(kid, R, '2026-12-01', '2026-12-31').some((e) => e.accountId === 'kid' && e.missing));
  // A $50,000 rollover recorded for 2026 and nothing else: the $300 a month guess still stands.
  const roll = row(maxIt({ ...d, accounts: d.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 50000, kind: 'rollover' }]) } : a)) }, R), 'roth:2026');
  assert.equal(roll.room, 4500);
  // A Solo 401(k)'s passed election day says the employer part is still open, not that the year closed.
  const solo = { ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement')] };
  const elect = maxItDeadlines(solo, R, '2026-12-01', '2027-10-31', { asOf: '2027-01-10' }).find((e) => e.accountId === 'solo' && e.passed);
  assert.match(elect.note, /^The day to elect the 2026 employee deferral has passed; the employer part stays open to October 15, 2027/);
});

test('the cash check per tax year adds up to the Plan card\'s: from January to April each year moves only its own new money', () => {
  const d = demo();
  const asOf = '2027-02-10';
  const sim = maxItSim(d, R, { asOf });
  const mx = maxIt(d, R, { asOf, sim });
  const one = (id) => maxItCash(d, R, mx, { sim, rows: mx.rows.filter((r) => r.id === id) }).total;
  const all = maxItCash(d, R, mx, { sim }).flows.filter((f) => f.pool.startsWith('ira')).reduce((s, f) => s + f.amount, 0);
  // 2026: $7,500 less 12 x $300 = $3,900; 2027: $7,500 less February's $600 and March to December's $3,000 = $3,900.
  assert.deepEqual([one('roth:2026'), one('roth:2027'), Math.round(all * 100) / 100], [3900, 3900, 7800]);
});

test('HSA money lowers AGI, so the Roth phase-out reads it; a conversion with no amount does not stop the check (S-212)', () => {
  const noRoth = (s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)) });
  // $13,900 a month and $300 a month to an HSA through pay (a cafeteria plan): wages $166,800 - $6,000 to the 401(k) -
  // $3,600 = $157,200, FICA wages $166,800 - $3,600; AGI with the tutoring $162,776.11. Roth: $7,500 - $7,500 x
  // 9,776.11 / 15,000 = $2,611.94, up to $2,620.
  const s = noRoth(putFact(demo(), 'income.salary.amount', 13900, 'known', T));
  const pay = { ...s, accounts: [...s.accounts, acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(300) })] };
  const tx = yearTax(pay, R, 2026);
  assert.deepEqual([tx.inputs.wages, tx.inputs.ficaWages, tx.lines.agi.value], [157200, 163200, 162776.11]);
  assert.equal(row(maxIt(pay, R), 'roth:2026').phase.limit, 2620);
  assert.equal(earnedIncome(pay, R, 2026).value, 162776.11, 'HSA money from pay is not earned income (W-2 box 1)');
  // $4,000 put in directly (recorded, no monthly amount): a deduction on the return, $157,576.11 of AGI at $13,500 a month: $5,220.
  const t = noRoth(putFact(demo(), 'income.salary.amount', 13500, 'known', T));
  const direct = { ...t, accounts: [...t.accounts, acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), contributions: F([{ year: 2026, amount: 4000 }, { year: 2026, amount: 400, kind: 'employer' }]) })] };
  assert.deepEqual([yearTax(direct, R, 2026).lines.hsaDeduction.value, yearTax(direct, R, 2026).lines.agi.value], [4000, 157576.11]);
  // $500 from the employer: the $4,400 limit leaves $3,900 to deduct; the $100 over is not deductible (S-214).
  const over = { ...direct, accounts: direct.accounts.map((x) => (x.id === 'h' ? { ...x, contributions: F([{ year: 2026, amount: 4000 }, { year: 2026, amount: 500, kind: 'employer' }]) } : x)) };
  assert.equal(yearTax(over, R, 2026).lines.hsaDeduction.value, 3900);
  assert.equal(row(maxIt(direct, R), 'roth:2026').phase.limit, 5220);
  // A conversion with no amount: the year's AGI is missing, but modified AGI leaves conversions out, so the Roth limit
  // is still known ($3,220 at $13,500 a month), not a rough $7,500.
  const conv = { ...putFact(demo(), 'income.salary.amount', 13500, 'known', T) };
  const c = { ...conv, accounts: [...conv.accounts, acct('trad', 'traditional_ira', 'ira', { conversions: F([{ year: 2026, amount: 10000 }]) })] };
  assert.equal(yearTax(c, R, 2026).lines.agi.value, null);
  const r = row(maxIt(c, R), 'roth:2026');
  assert.deepEqual([r.phase.unknown || false, r.phase.magi, r.phase.limit, r.room], [false, 161576.11, 3220, 220]);
  // Self-employed (a $14,000 a month 1099, no W-2) with $300 a month into an HSA from take-home: a whole year of it,
  // $3,600, is the deduction: modified AGI $152,531.18, under $153,000, the full $7,500.
  const se = { ...t, income: [{ ...t.income[1], amount: F(14000) }], accounts: [...t.accounts.filter((x) => x.id !== 'k401'), acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(300) })] };
  assert.deepEqual([yearTax(se, R, 2026).lines.hsaDeduction.value, row(maxIt(se, R), 'roth:2026').phase.magi, row(maxIt(se, R), 'roth:2026').phase.limit], [3600, 152531.18, 7500]);
  // $3,000 recorded and $300 a month still to come: the same $3,600.
  const part = { ...se, accounts: se.accounts.map((x) => (x.id === 'h' ? { ...x, contributions: F([{ year: 2026, amount: 3000 }]) } : x)) };
  assert.equal(yearTax(part, R, 2026).lines.hsaDeduction.value, 3600);
  // The demo, with no HSA, is unchanged.
  assert.equal(yearTax(demo(), R, 2026).lines.agi.value, 71576.11);
});

test('a couple\'s IRAs: the spouse who earns less counts what the other put in and still has set to go in; together never past the couple\'s pay', () => {
  // Casey earns $500 a month ($6,000), Sam $300 ($3,600): $9,600 together. Casey's Roth has $3,000 in and $300 a month
  // still to come ($600). Casey: $6,000 - $3,000 = $3,000 of room, $2,400 new. Sam: $9,600 - $3,000 - $600 = $6,000
  // alone, but together only $6,600 is left, so Sam's part of the total is $3,600.
  let s = putFact(demo(), 'accounts.k401.monthlyContribution', 0, 'known', T);
  s = couple(s);
  s = { ...s, income: [{ ...s.income[0], amount: F(500) }, { ...s.income[1], amount: F(0) }, w2('samjob', 'sam', 300)], accounts: [...s.accounts, acct('st', 'roth_ira', 'ira', { owner: F('partner') })] };
  const mx = maxIt(s, R);
  const c = row(mx, 'roth:2026'), j = row(mx, 'st:2026');
  assert.deepEqual([c.room, c.still.value, c.lump, j.room, j.cap.value], [3000, 600, 2400, 6000, 6000]);
  assert.deepEqual([c.sharedWith, j.sharedWith], [['st'], ['Roth IRA']]);
  assert.match(j.why, /Shares the couple's \$9,600 of 2026 earned income with Casey Rivera's Roth IRA/);
  assert.deepEqual(mx.pools.filter((p) => p.key.startsWith('ira')).map((p) => [p.key, p.fill]), [['ira:casey', 2400], ['ira:sam', 3600]]);
  // Sam already put in $3,000 and Casey nothing (and no monthly amount): $6,600 left; Casey's own $6,000 first, Sam $600.
  const s8 = { ...s, accounts: s.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a.id === 'st' ? { ...a, contributions: F([{ year: 2026, amount: 3000 }]) } : a)) };
  assert.deepEqual(maxIt(s8, R).pools.filter((p) => p.key.startsWith('ira')).map((p) => [p.key, p.room]), [['ira:casey', 6000], ['ira:sam', 600]]);
});

test('set to go over: money a monthly amount still puts in past the limit is named before it happens', () => {
  const d = demo();
  const r = row(maxIt({ ...d, accounts: d.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 7500 }]) } : a)) }, R), 'roth:2026');
  assert.deepEqual([r.room, r.over, r.overSoon, r.still.soon], [0, null, 600, 600]);
  assert.equal(r.overSoonWords, 'What is set up already puts $600 more in by December 31, 2026, $600 over the 2026 limit: lower or stop it before then.');
});

test('payroll saving comes off its owner\'s own pay; skipped or $0 paydays hold nothing; blank paydays are missing, not counted', () => {
  // Casey's $500 to the 401(k) comes off Casey's pay only: $4,211 lands, as when Casey is alone; Sam's $200 a month
  // ($92.31 a paycheck, 26 a year) off Sam's $3,000 every two weeks, less Social Security and Medicare: $2,678.19.
  let s = couple(demo());
  s = { ...s, income: [...s.income, w2('samjob', 'sam', 3000, { cadence: 'biweekly', start: '2026-01-09' })], accounts: [...s.accounts, acct('sk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(200) })] };
  const sim = maxItSim(s, R);
  const mx = maxIt(s, R, { sim });
  assert.deepEqual([row(mx, 'k401:2026').paychecks.landed, row(mx, 'sk:2026').paychecks.landed], [4211, 2678.19]);
  // November 15 and December 15 skipped on the calendar: no paycheck is left for 2026, with or without the run.
  let d = demo();
  d = skipOccurrence(skipOccurrence(d, 'salary|2026-11-15'), 'salary|2026-12-15');
  const r1 = row(maxIt(d, R), 'k401:2026'), r2 = row(maxIt(d, R, { sim: maxItSim(d, R) }), 'k401:2026');
  assert.deepEqual([r1.fillable, r1.still.value, r2.fillable], [false, 0, false]);
  // A salary of $0: no pay, nothing out of it, and no paycheck to fill the 401(k).
  const z = row(maxIt(putFact(demo(), 'income.salary.amount', 0, 'known', T), R), 'k401:2026');
  assert.deepEqual([z.fillable, z.contributed.value], [false, 0]);
  // Every two weeks with no first pay date: the 401(k) is named missing and left out of the totals and the cash check.
  const b = { ...demo(), income: demo().income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'biweekly', start: null } : x)) };
  const bsim = maxItSim(b, R);
  const bmx = maxIt(b, R, { sim: bsim });
  assert.deepEqual([bmx.totals.missing, bmx.totals.lump], [['k401:2026'], 2620]);
  // The run is short the whole salary, so the Roth's money gets no verdict either: no red "breaks the floor" from it.
  const bc = maxItCash(b, R, bmx, { sim: bsim });
  assert.deepEqual([bc.words, bc.breaks, bc.kind], ['Cannot be checked against cash until Salary at Hudson Valley Health has a first pay date: that pay is not in the run. $2,620 more would leave checking by March 22, 2027.', null, 'incomplete']);
  assert.ok(bc.missing.includes('income.salary.payDay'));
});

test('a Solo 401(k) beside a W-2 401(k): the W-2 deferrals still to come never shrink the Solo\'s own room; a capped 401(k) leaves the rest to the Solo', () => {
  // The Solo's $5,576.11 (its earnings) fits under the 402(g) room left ($19,500 less $1,000 still to come from pay):
  // all of it is new money, $464.68 a month for 12 months to October 15, 2027, the last $464.63.
  const d = demo();
  const s = { ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement')] };
  const sim = maxItSim(s, R);
  const mx = maxIt(s, R, { sim });
  const r = row(mx, 'solo:2026');
  assert.deepEqual([r.lump, r.perMonth, r.months.last], [5576.11, 464.68, 464.63]);
  // The 401(k) holds only $4,211 a paycheck (2 x $4,211 of its $18,500): the Solo's deferral takes $4,460.89 more of
  // the same limit. $8,422 + $4,460.89 + $1,115.22 + $3,900.
  assert.equal(mx.totals.lump, 17898.11);
  assert.ok(mx.pools.some((p) => p.key === 'deferral:casey' && p.spill && p.fill === 4460.89));
  // A $500 employer entry leaves the $200 a month employee guess in place: $5,576.11 less $2,000 and $500.
  const e = { ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement', { monthlyContribution: F(200), contributions: F([{ year: 2026, amount: 500, kind: 'employer' }]) })] };
  assert.equal(row(maxIt(e, R), 'solo:2026').room, 3076.11);
});

test('recording a total replaces the year\'s total: one deposit never erases the months before it', () => {
  // The Roth's $300 a month is about $3,000 so far; the form starts there. A total of $4,000 leaves $3,500.
  const d = demo();
  const a = recordContribution(d, 'roth', { year: 2026, amount: 4000 }, T);
  assert.equal(row(maxIt(a, R), 'roth:2026').room, 3500);
  const b = recordContribution(a, 'roth', { year: 2026, amount: 4500 }, T);
  assert.deepEqual(b.accounts.find((x) => x.id === 'roth').contributions.value.filter((c) => c.year === 2026), [{ year: 2026, amount: 4500, through: '2026-10-22' }]);
  // A rollover is one more entry, not a total.
  const c = recordContribution(b, 'roth', { year: 2026, amount: 9000, kind: 'rollover' }, T);
  assert.equal(c.accounts.find((x) => x.id === 'roth').contributions.value.filter((x) => x.year === 2026).length, 2);
  assert.equal(row(maxIt(c, R), 'roth:2026').room, 3000);
  // A total of $0 is a typed zero: nothing went in.
  assert.equal(row(maxIt(recordContribution(d, 'roth', { year: 2026, amount: 0 }, T), R), 'roth:2026').room, 7500);
});

test('the FOO rungs count from the rung\'s start: a 401(k) with no paycheck left reads its steady month; no start date when the surplus never gets there', () => {
  // December 20: the last 2026 payday has passed but the salary runs on: about $1,541.67 a month, not "done".
  const d = demo();
  const late = { ...d, meta: { ...d.meta, asOf: '2026-12-20' } };
  const f = fooLadder(late, R, summarize(late, R, { flags: false })).rungs.find((x) => x.id === 'maxRetirement');
  assert.deepEqual([f.need, f.done], [1541.67, false]);
  assert.match(f.why, /Work 401\(k\) 2026 has no paycheck left before December 31, 2026\./);
  // The salary ended in June: no surplus reaches the rung, so it has no date.
  const ended = { ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-06-30' } : x)) };
  const lad = fooLadder(ended, R, summarize(ended, R, { flags: false }));
  assert.equal(lad.allDated, false);
  assert.equal(lad.rungs.find((x) => x.id === 'rothHsa').completes, null);
});

test('tax per person (S-214): a $0 pay line has no months of pay, saving never passes its owner\'s pay, a recorded total is the year\'s amount, the HSA limit caps the deduction, self-employment tax is each person\'s own', () => {
  const c = couple(demo());
  const sk = (m) => acct('sk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(m) });
  const wages = (s) => yearTax(s, R, 2026).inputs.wages;
  // The demo couple: Casey's $6,000 a month less the 401(k)'s $500 a month = $66,000.
  assert.equal(wages(c), 66000);
  // Sam's job pays $0: no months of pay, so Sam's $1,000 a month 401(k) takes nothing off anyone's wages.
  assert.equal(wages({ ...c, income: [...c.income, w2('samjob', 'sam', 0)], accounts: [...c.accounts, sk(1000)] }), 66000);
  // Sam earns $12,000 and sets $2,000 a month: $24,000 is more than Sam's pay, so only $12,000 comes off, none of Casey's.
  assert.equal(wages({ ...c, income: [...c.income, w2('samjob', 'sam', 1000)], accounts: [...c.accounts, sk(2000)] }), 66000);
  // A recorded 401(k) total is the year's amount: $9,000 with no monthly amount is $72,000 - $9,000 = $63,000; $4,000
  // recorded through September 30 and $500 a month after (October 15, November 15, December 15) is $5,500 off.
  const d = demo();
  const rec = (extra) => ({ ...d, accounts: d.accounts.map((a) => (a.id === 'k401' ? { ...a, ...extra } : a)) });
  assert.equal(wages(rec({ monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 9000 }]) })), 63000);
  assert.equal(wages(rec({ contributions: F([{ year: 2026, amount: 4000, through: '2026-09-30' }]) })), 66500);
  // Family coverage: $6,000 and $4,000 put in directly, but the family limit is $8,750 (neither is 55), so $8,750 comes off.
  const fam = { ...c, accounts: [...c.accounts, acct('h1', 'hsa', 'hsaFsa', { coverageLevel: F('family'), contributions: F([{ year: 2026, amount: 6000 }]) }), acct('h2', 'hsa', 'hsaFsa', { owner: F('partner'), coverageLevel: F('self'), contributions: F([{ year: 2026, amount: 4000 }]) })] };
  assert.equal(yearTax(fam, R, 2026).lines.hsaDeduction.value, 8750);
  // Casey earns $192,000 (past the $184,500 Social Security wage base) and tutors for $6,000; Sam's $60,000 of gigs pay
  // Social Security in full. Casey: $6,000 x 0.9235 x 2.9% = $160.69. Sam: $60,000 x 0.9235 x 15.3% = $8,477.73. Together $8,638.42.
  const hi = putFact(c, 'income.salary.amount', 16000, 'known', T);
  const se = { ...hi, income: [...hi.income, { ...hi.income[1], id: 'samgig', personId: 'sam', amount: F(5000) }] };
  assert.equal(yearTax(se, R, 2026).lines.seTax.value, 8638.42);
  // An HSA from take-home with a blank monthly amount: the deduction is a guess, so AGI is rough and names the blank.
  const solo = { ...d, income: [{ ...d.income[1], amount: F(14000) }], accounts: [...d.accounts.filter((x) => x.id !== 'k401'), acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(null, 'missing') })] };
  assert.ok(yearTax(solo, R, 2026).lines.agi.rough.includes('accounts.h.monthlyContribution'));
});

test('payroll saving waits for its owner\'s pay: a spouse whose job ended has nothing taken from the other\'s paycheck (S-214)', () => {
  const c = couple(demo());
  // Sam's job ran January to June; Sam's 401(k) is $1,000 a month. In November only Casey's $500 comes out of pay.
  const s = { ...c, income: [...c.income, w2('samjob', 'sam', 4000, { end: '2026-06-30' })], accounts: [...c.accounts, acct('sk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(1000) })] };
  const nov = cashflow(s, R, '2026-11');
  assert.equal(nov.saving.payroll.value, 500);
  assert.deepEqual(payrollShares(s, nov), { salary: 500 });
  // In May both come out, each from its owner's own pay.
  const may = cashflow(s, R, '2026-05');
  assert.equal(may.saving.payroll.value, 1500);
  assert.deepEqual(payrollShares(s, may), { salary: 500, samjob: 1000 });
  // Sam's line is $0, or not started yet: still nothing from Casey's pay.
  for (const line of [w2('samjob', 'sam', 0), w2('samjob', 'sam', 4000, { start: '2027-01-01' })]) {
    const z = { ...s, income: [...c.income, line] };
    assert.deepEqual([cashflow(z, R, '2026-11').saving.payroll.value, payrollShares(z, cashflow(z, R, '2026-11'))], [500, { salary: 500 }]);
  }
  // An owner with no pay line at all: it comes out of the household's pay, as before.
  const none = { ...c, accounts: [...c.accounts, acct('sk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(1000) })] };
  assert.deepEqual(payrollShares(none, cashflow(none, R, '2026-11')), { salary: 1500 });
});

test('round 3 (S-214): the spouse who earns more is held to the couple\'s pay too; the year-end excess is named; the cash check runs the lump; the FOO counts real paydays', () => {
  const d = demo();
  // MFJ: Casey earns $9,600 (no 401(k), no tutoring), Sam earns nothing and has $2,500 in a traditional IRA. Casey's
  // own pay allows $7,500, but the couple can add only $9,600 - $2,500 = $7,100 (IRC 219(c)).
  const c = couple(d);
  const m1 = { ...c, income: [{ ...c.income[0], amount: F(800) }], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('st', 'traditional_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 2500 }]) })] };
  const r1 = row(maxIt(m1, R), 'roth:2026');
  assert.deepEqual([r1.room, r1.lump, r1.over || 0], [7100, 7100, 0]);
  assert.equal(r1.couple.words, 'Shares the couple\'s $9,600 of 2026 earned income with Sam\'s st: together at most $7,100 more ($2,500 in, $0 still set to go in).');
  // Sam also has $300 a month set to go in (November and December, $600): $6,500.
  const m2 = { ...m1, accounts: m1.accounts.map((a) => (a.id === 'st' ? { ...a, monthlyContribution: F(300) } : a)) };
  assert.equal(row(maxIt(m2, R), 'roth:2026').lump, 6500);
  // $8,000 in a Roth against $7,500 and $300 a month still to come (November, December): $500 over now, $1,100 by
  // December 31, named in the panel, the chip and the FOO rung; the correction deadline includes extensions.
  const ov = { ...d, accounts: d.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 8000 }]) } : a)) };
  const r = row(maxIt(ov, R), 'roth:2026');
  assert.deepEqual([r.over, r.overSoon, r.overByYearEnd], [500, 600, 1100]);
  assert.match(r.overSoonWords, /making it \$1,100 over the 2026 limit/);
  assert.match(r.overWords, /by the 2026 tax filing due date, extensions included,/);
  assert.match(maxItDeadlines(ov, R, '2027-04-01', '2027-04-30')[0].note, /^Over the 2026 limit by \$500, \$1,100 by December 31 if nothing changes\./);
  assert.match(fooLadder(ov, R, summarize(ov, R, { flags: false })).rungs.find((x) => x.id === 'rothHsa').why, /over the limit by \$500, \$1,100 by December 31 if nothing changes/);
  // A Solo 401(k) beside the W-2 401(k): its own cash check runs its lump, $5,576.11, in October and in March.
  for (const asOf of ['2026-10-22', '2026-03-05']) {
    const s = { ...d, meta: { ...d.meta, asOf }, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement')] };
    const sim = maxItSim(s, R), mx = maxIt(s, R, { sim }), sr = row(mx, 'solo:2026');
    assert.deepEqual([sr.lump, maxItCash(s, R, mx, { sim, rows: [sr] }).total], [5576.11, 5576.11]);
  }
  // A salary of $0, or one that ends December 31 with its last payday on December 15 (as of December 20): the FOO
  // retirement rung is done, the 401(k) cannot be filled, and no steady month is asked for.
  const z = putFact(d, 'income.salary.amount', 0, 'known', T);
  const e = { ...d, meta: { ...d.meta, asOf: '2026-12-20' }, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-12-31' } : x)) };
  for (const s of [z, e]) {
    const f = fooLadder(s, R, summarize(s, R, { flags: false })).rungs.find((x) => x.id === 'maxRetirement');
    assert.deepEqual([f.need, f.done, f.why], [0, true, 'Work 401(k) 2026 cannot be filled: no paycheck before December 31, 2026.']);
  }
  // Sam's pay line is $0: Sam's 401(k) is Sam's and cannot be filled, not "missing: whose pay".
  const cz = { ...c, income: [...c.income, w2('samjob', 'sam', 0)], accounts: [...c.accounts, acct('sk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(200) })] };
  const zr = row(maxIt(cz, R), 'sk:2026');
  assert.deepEqual([zr.room, zr.fillable, zr.missingLabel], [24500, false, null]);
  // Sam's job starts December 4, every two weeks at $3,000: the run has Sam's December 4 and 18 paychecks ($3,000 less
  // $229.50 of FICA and $92.31 to the 401(k) = $2,678.19 each), and Casey's still land $4,211.
  const cs = { ...c, income: [...c.income, { ...w2('samjob', 'sam', 3000), cadence: 'biweekly', start: '2026-12-04' }], accounts: [...c.accounts, acct('sk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(200) })] };
  const ssim = maxItSim(cs, R), smx = maxIt(cs, R, { sim: ssim }), sr2 = row(smx, 'sk:2026');
  assert.deepEqual([sr2.fillable, sr2.paychecks.dates, sr2.paychecks.landed, row(smx, 'k401:2026').paychecks.landed], [true, ['2026-12-04', '2026-12-18'], 2678.19, 4211]);
});

test('the FOO rung for a payroll limit: its last payday names when it closes; every payday month counts, not only the first payday of each (S-214)', () => {
  const d = demo();
  const noCards = { ...d, debts: d.debts.filter((x) => x.type !== 'credit_card') };
  const rung = (s) => fooLadder(s, R, summarize(s, R, { flags: false })).rungs.find((x) => x.id === 'maxRetirement');
  const hysa = (s, bal) => ({ ...s, accounts: s.accounts.map((a) => (a.id === 'hysa' ? { ...a, balance: F(bal) } : a)) });
  // Paid on the 15th; the surplus reaches the rung about December 22, after the last 2026 payday (December 15) but
  // before December 31: the rung names that payday, not "closes on December 31 ... (about December 22)".
  assert.match(rung(hysa(noCards, 17785)).why, /Work 401\(k\) 2026: its last payday before December 31, 2026 is December 15, 2026, before the surplus reaches this rung \(about December 22, 2026\)\./);
  // Every two weeks from January 9 (October 30, November 13 and 27, December 11 and 25): from about November 22 the
  // paydays fall in November and December, two months, $18,500 / 2 = $9,250 a month; from about December 22, only
  // December 25 is left: one month, $18,500, still open (the first payday of December, the 11th, has passed).
  const bi = { ...noCards, income: noCards.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'biweekly', start: '2026-01-09', amount: F(2769.23), withholding: { federal: F(253.85), state: F(129.23) } } : x)) };
  assert.equal(rung(hysa(bi, 18600)).need, 9250);
  assert.match(rung(hysa(bi, 17785)).why, /^Work 401\(k\) 2026: \$18,500 a month to December 31, 2026/);
});

test('a recorded total is through the day it was recorded: the monthly amount adds what goes in after it; the form starts without 529 money (S-214)', () => {
  const d = demo();
  // $3,000 in the Roth recorded October 22; on December 20 November's and December's $300 have gone in too: $7,500 - $3,600.
  const a = recordContribution(d, 'roth', { year: 2026, amount: 3000 }, T);
  assert.equal(row(maxIt({ ...a, meta: { ...a.meta, asOf: '2026-12-20' } }, R), 'roth:2026').room, 3900);
  // $5,000 in the 401(k) recorded October 22; by December 16 the November 15 and December 15 paychecks put in $1,000.
  const k = recordContribution(d, 'k401', { year: 2026, amount: 5000 }, T);
  assert.equal(row(maxIt({ ...k, meta: { ...k.meta, asOf: '2026-12-16' } }, R), 'k401:2026').room, 18500);
  // $2,000 rolled in from a 529 adds to the $3,000 guess: $2,500 of room. The form starts at the $3,000, not $5,000,
  // so saving it unchanged leaves the room where it is.
  const f = recordContribution(d, 'roth', { year: 2026, amount: 2000, kind: 'from529' }, T);
  const r = row(maxIt(f, R), 'roth:2026');
  assert.deepEqual([r.room, r.record.total, r.record.events, r.record.estimated], [2500, 3000, 2000, true]);
  assert.equal(row(maxIt(recordContribution(f, 'roth', { year: 2026, amount: r.record.total }, T), R), 'roth:2026').room, 2500);
  // A Solo 401(k)'s employer form starts at its recorded employer part.
  const e = { ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 500, kind: 'employer' }]) })] };
  assert.equal(row(maxIt(e, R), 'solo:2026').record.employer, 500);
  // The through date is checked when it is there.
  const bad = { ...d, accounts: d.accounts.map((x) => (x.id === 'roth' ? { ...x, contributions: F([{ year: 2026, amount: 1, through: 'soon' }]) } : x)) };
  assert.ok(validate(bad).errors.some((x) => x.path === 'accounts.roth.contributions[0].through'));
});

test('round 4 (S-214): an ineligible HSA lowers nothing; a payroll plan with no payday after its deadline asks nothing; the excess lands on the right spouse; a $0 line is not a blank; a moved payday moves', () => {
  const d = demo();
  const c = couple(d);
  // An HSA on a plan that is not HSA-eligible has a $0 limit: its $300 a month stays in wages, so modified AGI is
  // $161,576.11 and the Roth limit $3,220 ($220 of room), as with no HSA.
  const h = putFact(d, 'income.salary.amount', 13500, 'known', T);
  const hi = { ...h, accounts: [...h.accounts, acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), planEligible: F('no'), monthlyContribution: F(300) })] };
  const r1 = row(maxIt(hi, R), 'roth:2026');
  assert.deepEqual([r1.phase.magi, r1.phase.limit, r1.room], [161576.11, 3220, 220]);
  // The salary ends December 31 (last payday December 15): when the surplus reaches the rung in 2028 the 401(k) can take
  // nothing, so no steady month is asked for. Pay is tested from the day the surplus gets there (S-216).
  const e = { ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-12-31' } : x)) };
  const f = fooLadder(e, R, summarize(e, R, { flags: false })).rungs.find((x) => x.id === 'maxRetirement');
  assert.deepEqual([f.need, f.done, f.why], [0, true, 'Work 401(k) 2026: no paycheck after July 22, 2028, so nothing goes in once the surplus reaches this rung.']);
  // MFJ: Casey earns $9,000 with $5,000 in a Roth and $400 a month (November, December); Sam earns $2,400 with $6,000 in
  // a traditional IRA and $300 a month. Casey's $5,800 is under Casey's own $7,500: not over. Sam may put in $11,400 -
  // $5,800 = $5,600: $400 over now, $1,000 by December 31.
  const x1 = { ...c, income: [{ ...c.income[0], amount: F(750) }, w2('samjob', 'sam', 200)], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: F(400), contributions: F([{ year: 2026, amount: 5000 }]) } : a)), acct('st', 'traditional_ira', 'ira', { owner: F('partner'), monthlyContribution: F(300), contributions: F([{ year: 2026, amount: 6000 }]) })] };
  const m3 = maxIt(x1, R);
  assert.deepEqual([row(m3, 'roth:2026').over || 0, row(m3, 'roth:2026').overSoon || 0], [0, 0]);
  assert.deepEqual([row(m3, 'st:2026').over, row(m3, 'st:2026').overByYearEnd], [400, 1000]);
  // Sam is set to put $12,000 into an IRA against Sam's own $7,500: only $7,500 of it counts against the couple's $13,200,
  // so Casey can still add $5,700 (not $1,200); Sam's excess is Sam's.
  const x4 = { ...c, income: [{ ...c.income[0], amount: F(800) }, w2('samjob', 'sam', 300)], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('st', 'traditional_ira', 'ira', { owner: F('partner'), monthlyContribution: F(300), contributions: F([{ year: 2026, amount: 11400 }]) })] };
  const m4 = maxIt(x4, R);
  assert.deepEqual([row(m4, 'roth:2026').lump, row(m4, 'st:2026').over, row(m4, 'st:2026').overByYearEnd], [5700, 3900, 4500]);
  // Sam's only pay is a maybe line: it is still Sam's pay line, so Sam's 401(k) is "cannot be filled", not "whose pay".
  const x5 = { ...c, income: [...c.income, { ...w2('samjob', 'sam', 1200), cadence: 'weekly', start: '2026-01-02', likelihood: F(0.5) }], accounts: [...c.accounts, acct('sk', 'k401', 'employerRetirement', { owner: F('partner'), monthlyContribution: F(100) })] };
  const r5 = row(maxIt(x5, R), 'sk:2026');
  assert.deepEqual([r5.fillable, r5.missingLabel], [false, null]);
  // Tips typed as $0: nothing lands from them, and nothing is missing; the cash check reads as without the line.
  const x6 = { ...d, income: [...d.income, { ...w2('tips', 'casey', 0), type: 'tips', label: 'Cafe tips' }] };
  const s6 = maxItSim(x6, R), mx6 = maxIt(x6, R, { sim: s6 }), s0 = maxItSim(d, R), mx0 = maxIt(d, R, { sim: s0 });
  assert.equal(maxItCash(x6, R, mx6, { sim: s6, rows: [row(mx6, 'k401:2026')] }).words, maxItCash(d, R, mx0, { sim: s0, rows: [row(mx0, 'k401:2026')] }).words);
  // As of December 10, the December 15 payday moved to January 4: no 2026 paycheck is left, with or without the run.
  const x7 = { ...d, meta: { ...d.meta, asOf: '2026-12-10' }, calendar: { ...(d.calendar || {}), overrides: { ...((d.calendar || {}).overrides || {}), 'salary|2026-12-15': { date: '2027-01-04' } } } };
  const sim7 = maxItSim(x7, R), m7 = maxIt(x7, R, { sim: sim7 });
  assert.deepEqual([row(m7, 'k401:2026').fillable, row(m7, 'k401:2026').lump, m7.totals.unfillable, row(maxIt(x7, R), 'k401:2026').fillable], [false, null, ['k401:2026'], false]);
});

test('cents (S-214): a few cents over many months takes fewer of them, never a negative one; the Plan step matches the row', () => {
  const d = demo();
  // $0.03 of Roth room over 6 months: $0.01 in each of 3 months (it was $0.01 then a last one of -$0.02).
  const x = { ...d, accounts: d.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 7499.97 }]) } : a)) };
  const r = row(maxIt(x, R), 'roth:2026');
  assert.deepEqual([r.room, r.perMonth, r.months.count, r.months.last], [0.03, 0.01, 3, 0.01]);
  // A Solo 401(k) beside the W-2 401(k): its last step is $464.68 a month, as on its row (12 x $464.69 was too much).
  const so = { ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement')] };
  const sim = maxItSim(so, R), mx = maxIt(so, R, { sim });
  assert.deepEqual([mx.totals.steps[mx.totals.steps.length - 1].perMonth, row(mx, 'solo:2026').perMonth], [464.68, 464.68]);
});

test('round 5 (S-216): pay is tested when the surplus gets there; the couple\'s numbers count each spouse only to their limit; the first person\'s pay is never a spouse\'s; idle lines and early paychecks', () => {
  const d = demo(), c = couple(d);
  const hysa = (s, bal) => ({ ...s, accounts: s.accounts.map((a) => (a.id === 'hysa' ? { ...a, balance: F(bal) } : a)) });
  const rung = (s) => fooLadder(s, R, summarize(s, R, { flags: false })).rungs.find((x) => x.id === 'maxRetirement');
  // The salary ends January 31, 2027 and the surplus reaches the rung about August 22, 2027: no pay then, nothing asked.
  const j = hysa({ ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2027-01-31' } : x)) }, 17000);
  assert.deepEqual([rung(j).need, rung(j).why], [0, 'Work 401(k) 2026: no paycheck after August 22, 2027, so nothing goes in once the surplus reaches this rung.']);
  // The salary ends November 20 and a new job starts January 15, 2028, before the rung's start (about April 22, 2028):
  // there is pay then, so the steady month stands.
  const rv = { ...d, income: [...d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-11-20' } : x)), { ...d.income[0], id: 'newjob', label: 'New job', start: '2028-01-15', end: null }] };
  assert.equal(rung(rv).need, 1541.67);
  // Casey earns $72,000 with $2,000 in a Roth; Sam earns $1,200 with an empty IRA. Each may add up to their own limit:
  // $5,500 + $7,500 = $13,000 together (not $73,200 - $2,000).
  const g3 = { ...c, income: [c.income[0], w2('samjob', 'sam', 100)], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 2000 }]) } : a)), acct('st', 'traditional_ira', 'ira', { owner: F('partner') })] };
  assert.deepEqual([row(maxIt(g3, R), 'roth:2026').couple.together, row(maxIt(g3, R), 'st:2026').couple.together], [13000, 13000]);
  // Sam (pay $3,000) has $9,000 in a Roth, past Sam's own $7,500: only $7,500 of it uses the couple's $15,000, so the
  // Plan counts Casey's full $7,500.
  const a3 = { ...c, income: [{ ...c.income[0], amount: F(1000) }, w2('samjob', 'sam', 250)], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 9000 }]) })] };
  assert.equal(maxIt(a3, R).totals.lump, 7500);
  // Casey (the first person) has only the tutoring, and every pay line names Sam: Casey's 401(k) cannot be filled (not
  // "whose pay"), and its $500 a month never comes out of Sam's paycheck.
  const x4 = { ...c, income: [c.income[1], { ...w2('samjob', 'sam', 6000), payDay: F(15) }] };
  const r4 = row(maxIt(x4, R), 'k401:2026'), cf4 = cashflow(x4, R, '2026-11');
  assert.deepEqual([r4.fillable, r4.missingLabel, cf4.saving.payroll.value, payrollShares(x4, cf4)], [false, null, 0, {}]);
  // An old job that ended in 2025 with no amount: it cannot pay in the run, so the cash check reads as without it.
  const x5 = { ...d, income: [...d.income, { ...w2('old', 'casey', 0), label: 'Old job', amount: F(null, 'missing'), end: '2025-12-31' }] };
  const s5 = maxItSim(x5, R), s0 = maxItSim(d, R), mx5 = maxIt(x5, R, { sim: s5 }), mx0 = maxIt(d, R, { sim: s0 });
  assert.equal(maxItCash(x5, R, mx5, { sim: s5, rows: [row(mx5, 'k401:2026')] }).words, maxItCash(d, R, mx0, { sim: s0, rows: [row(mx0, 'k401:2026')] }).words);
  // As of December 15, the December 15 paycheck came in a day early and was imported: no 2026 paycheck is left.
  const a6 = logSpend({ ...d, meta: { ...d.meta, asOf: '2026-12-15' } }, { amount: 4211, date: '2026-12-14', kind: 'income', source: 'import', importKey: 'bank:2026-12-14:payroll', merchant: 'HUDSON VALLEY HEALTH PAYROLL' }).spine;
  const s6 = maxItSim(a6, R), m6 = maxIt(a6, R, { sim: s6 });
  assert.deepEqual([row(m6, 'k401:2026').fillable, m6.totals.unfillable], [false, ['k401:2026']]);
  const a6b = confirmOccurrence({ ...d, meta: { ...d.meta, asOf: '2026-12-14' } }, 'salary|2026-12-15', { amount: 4100, date: '2026-12-11' });
  assert.equal(row(maxIt(a6b, R, { sim: maxItSim(a6b, R) }), 'k401:2026').fillable, false);
  // A Solo 401(k)'s cash check pays its two pools as one: $464.68 a month and a last $464.63, as on its row.
  const so = { ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement')] };
  const ssim = maxItSim(so, R), smx = maxIt(so, R, { sim: ssim }), sr = row(smx, 'solo:2026');
  const fl = maxItCash(so, R, smx, { sim: ssim, rows: [sr] }).flows;
  assert.deepEqual([fl.length, fl[0].amount, fl[fl.length - 1].amount], [12, sr.perMonth, sr.months.last]);
  // Show the math gives the cents: "The last one is $0.05, ... add up to $0.50" (not "$0 ... $1").
  const x8 = { ...d, accounts: d.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 7499.5 }]) } : a)) };
  assert.equal(explainMetric('maxit:roth:2026:month', { spine: x8, rules: R, maxit: maxIt(x8, R) }).note, 'The last one is $0.05, what is left, so they add up to $0.50.');
});
