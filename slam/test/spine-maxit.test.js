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
import { putFact, addContribution, editIncome, recordContribution, skipOccurrence, logSpend, confirmOccurrence, moveOccurrence } from '../engine/edits.js';
import { windfall } from '../engine/windfall.js';
import { fooLadder } from '../engine/plan.js';
import { calendar } from '../engine/calendar.js';
import { milestones, yearStrip } from '../engine/calendar-views.js';
import { maxIt, maxItRow, maxItSim, maxItCash, maxItDeadlines, deadlineOf, openYears, monthlyDates, maxItTypes } from '../engine/maxit.js';
import { earnedIncome, yearTax } from '../engine/tax.js';
import { cashflow, payrollShares } from '../engine/cashflow.js';
import { cashsim } from '../engine/cashsim.js';
import { explainMetric } from '../engine/math.js';
import { readJson, loadRules } from './spine-helpers.js';

const R = loadRules();
const T = '2026-10-22';
const F = (value, kind = 'known') => ({ value, kind, asOf: '2026-10-01', source: 'test' });
// Answer 43 (S-227): a year with nothing recorded and no monthly amount reads missing, never $0. A made-up account with
// neither records $0 in for 2025 to 2027, as the owner would, unless the test gives it its own (nothing: true leaves it bare).
// Answer 47 (S-227): an HSA is paid in from take-home unless it is set to go through payroll; the hand-worked HSAs here
// go through payroll as they did before (the test for answer 47 leaves it off).
const acct = (id, type, family, { nothing = false, ...extra } = {}) => ({ id, type, family, name: F(id), balance: F(1000), ...(nothing || extra.contributions || extra.monthlyContribution ? {} : { contributions: F([2025, 2026, 2027].map((year) => ({ year, amount: 0 }))) }), ...(type === 'hsa' ? { throughPayroll: F(true) } : {}), ...extra });
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
  const asOf = '2027-02-10';
  // Answer 43 (S-227): the traditional IRA has nothing recorded for 2027 and no monthly amount, so the 2027 IRA room
  // it shares reads missing, naming it; recorded as $0, it is figured.
  const bare = maxIt(every(), R, { asOf });
  assert.deepEqual([row(bare, 'roth:2027').room, row(bare, 'roth:2027').missingLabel], [null, 'missing: what went in for 2027 on trad']);
  assert.ok(bare.totals.missing.includes('roth:2027') && bare.totals.missing.includes('trad:2027'));
  const e0 = every();
  const s = { ...e0, accounts: e0.accounts.map((a) => (a.id === 'trad' ? { ...a, contributions: F([...a.contributions.value, { year: 2027, amount: 0 }]) } : a)) };
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
const noK401 = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401') }; };
const couple = (s, name = 'Sam') => ({ ...s, household: { ...s.household, filingStatus: F('mfj'), people: [...s.household.people, { id: 'sam', name, birthDate: F('1995-05-05') }] } });

test('married filing jointly: the spouse who earns more is held to their own pay; the Roth phase-out starts from the lesser of the limit and pay', () => {
  // Casey earns $400 a month ($4,800), Sam $250 ($3,000). Casey's Roth: $4,800, Casey's own pay. Sam's IRA counts the
  // couple's $7,800, but together only $7,800 can go in: $4,800 + $3,000. No 401(k): its new money from pay would come
  // off Casey's pay first (S-225).
  let s = couple(noK401());
  s = { ...s, income: [{ ...s.income[0], amount: F(400) }, { ...s.income[1], amount: F(0) }, w2('samjob', 'sam', 250)], accounts: [...s.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('st', 'traditional_ira', 'ira', { owner: F('partner') })] };
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
  w = { ...w, income: [{ ...w.income[0], amount: F(400) }, { ...w.income[1], amount: F(0) }, { id: 'ui', type: 'unemployment', label: 'UI', personId: 'casey', amount: F(155700), cadence: 'yearly', start: '2024-01-01', end: null, withholding: { federal: F(0), state: F(0) } }], accounts: w.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)) };
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

test('missing never borrows a number: an earlier year with no rules file is closed, a 529 with no state; a rollover alone leaves the guess', () => {
  // Answer 55 (S-227): on March 1, 2026 there are no 2025 limits, and the owner's 2025 IRA and HSA money closed on
  // April 15, 2026: the 2025 rows read "Closed April 15, 2026", never missing and never 2026's larger limits. They are
  // not missing, carry no amount, and do not put two years side by side.
  const mx = maxIt(demo(), R, { asOf: '2026-03-01' });
  const r25 = row(mx, 'roth:2025');
  assert.deepEqual([r25.closed, r25.room, r25.lump, r25.perMonth, r25.why, r25.kind, r25.missingLabel], [true, null, null, null, 'Closed April 15, 2026.', 'computed', null]);
  assert.ok(!mx.totals.missing.includes('roth:2025'));
  assert.equal(mx.window.both, false);
  assert.ok(!mx.pools.some((p) => p.year === 2025), 'nothing counted for 2025');
  const chip = maxItDeadlines(demo(), R, '2026-04-01', '2026-04-30', { asOf: '2026-03-01' }).find((e) => e.accountId === 'roth' && e.taxYear === 2025);
  assert.deepEqual([chip.amount, chip.missing, chip.passed], [null, false, true]);
  assert.match(chip.note, /^Closed April 15, 2026\. April 15 for prior year\./);
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
  // alone, but together only $6,600 is left, so Sam's part of the total is $3,600. No 401(k), as above.
  let s = couple(noK401());
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

test('the Money Guy order (answer 63): the 401(k) up to the match, then the IRA, then the rest of the 401(k); new pre-tax money from pay is not pay an IRA can count', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const plan = (s) => { const mx = maxIt(s, R, { sim: maxItSim(s, R) }); return [...mx.pools.map((p) => [p.key, p.fill]), ...mx.rows.filter((r) => r.counted).map((r) => [r.id, r.counted.why])]; };
  // Casey earns $1,000 a month ($12,000), nothing withheld, no match. On February 1 the Roth comes before the 401(k): its
  // $7,500 keeps $7,500 of the pay, so the empty 401(k) takes the $4,500 of pay left (new money from pay is not in box 1,
  // so more would leave the Roth an excess). Before answer 63 the 401(k) took all its paychecks hold ($10,158.50) and the
  // Roth got $1,841.50.
  let s = putFact(demo(), 'accounts.k401.monthlyContribution', 0, 'known', T);
  s = at({ ...s, income: [{ ...s.income[0], amount: F(1000), withholding: { federal: F(0), state: F(0) } }, { ...s.income[1], amount: F(0) }, ...s.income.slice(2)], accounts: s.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)) }, '2026-02-01');
  assert.deepEqual(plan(s), [['deferral:casey', 4500], ['ira:casey', 7500], ['k401:2026', 'preIra']]);
  // $5,000 already in the Roth: $2,500 of new Roth money, and the 401(k) still $4,500 ($12,000 - $7,500).
  const kept = { ...s, accounts: s.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 5000 }]) } : a)) };
  assert.deepEqual(plan(kept), [['deferral:casey', 4500], ['ira:casey', 2500], ['k401:2026', 'preIra']]);
  // $500 a month ($6,000) with a 50% match on up to 6% of pay: only the pay still to come can be matched (11 paychecks
  // from February 15, $5,500), so the 401(k)'s $330 that gets the match comes first, the Roth gets the $5,670 of pay
  // left, the rest of the 401(k) nothing. With no match, the Roth takes all $6,000.
  const small = { ...s, income: [{ ...s.income[0], amount: F(500), withholding: { federal: F(0), state: F(0) } }, ...s.income.slice(1)], accounts: s.accounts.map((a) => (a.id === 'k401' ? { ...a, matchRate: F(0.5), matchCap: F(0.06) } : a)) };
  assert.deepEqual(plan(small), [['deferral:casey', 330], ['ira:casey', 5670], ['k401:2026', 'preIra'], ['roth:2026', 'match']]);
  const noMatch = { ...small, accounts: small.accounts.map((a) => (a.id === 'k401' ? { ...a, matchRate: undefined, matchCap: undefined } : a)) };
  assert.deepEqual(plan(noMatch), [['deferral:casey', 0], ['ira:casey', 6000], ['k401:2026', 'preIra']]);
  // The FOO ladder reads the same count: the Roth and HSA rung takes the Roth's $5,670 ($378 a month over the 15 months
  // to April 15, 2027), the retirement rung the 401(k)'s $330 (each says why it counts less than the account alone).
  const sm = summarize(small, R, { flags: false }), foo = fooLadder(small, R, sm, { sim: maxItSim(small, R) });
  assert.match(foo.rungs.find((r) => r.id === 'rothHsa').why, /Roth IRA 2026: \$378 a month to April 15, 2027 \(less than the account alone could take: the 401\(k\) money up to the employer match comes first/);
  assert.match(foo.rungs.find((r) => r.id === 'maxRetirement').why, /the IRA comes before the rest of the 401\(k\)/);
  // A couple: Casey earns $2,500 a month ($30,000) with $7,000 in the Roth, Sam $200 a month ($2,400). Casey's Roth takes
  // its last $500 first; her IRA money then rests on $7,500 of her own pay, so the 401(k) takes $22,500.
  let c = couple(putFact(demo(), 'accounts.k401.monthlyContribution', 0, 'known', T));
  c = at({ ...c, income: [{ ...c.income[0], amount: F(2500), withholding: { federal: F(0), state: F(0) } }, { ...c.income[1], amount: F(0) }, w2('samjob', 'sam', 200)], accounts: c.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 7000 }]) } : a)) }, '2026-02-01');
  const both = [['deferral:casey', 22500], ['ira:casey', 500], ['k401:2026', 'preIra']];
  assert.deepEqual(plan(c), both);
  // A third person's pay is their own, never the couple's: the same.
  const three = { ...c, household: { ...c.household, people: [...c.household.people, { id: 'riley', name: 'Riley', birthDate: F('2004-03-03') }] }, income: [...c.income, w2('rileyjob', 'riley', 1000)] };
  assert.deepEqual(plan(three), both);
});

test('round 15 (S-225): a Solo 401(k) counts once, a couple never depends on the order, the cash check and the FOO ladder follow the cut, separate filers keep the reduced Roth limit, 27 paydays', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const run = (s) => { const sim = maxItSim(s, R); return { sim, mx: maxIt(s, R, { sim }) }; };
  const fills = (mx) => Object.fromEntries(mx.pools.filter((p) => !p.spill).map((p) => [p.row.id, p.fill]));
  const empty401 = () => putFact(demo(), 'accounts.k401.monthlyContribution', 0, 'known', T);
  const pay = (s, amt) => ({ ...s.income[0], amount: F(amt), withholding: { federal: F(0), state: F(0) } });
  // $12,000 of W-2 pay and $40,000 of 1099 pay with $12,000 already in a Solo 401(k): the tax figures take the Solo off
  // the W-2 wages, so it came off twice. Counted once, the 401(k) keeps all its paychecks hold ($10,158.50) and the
  // Roth's pay is $12,000 + $37,174.09 - $12,000 = $37,174.09 (not $25,174.09).
  let s = empty401();
  s = at({ ...s, income: [pay(s, 1000), { ...s.income[1], amount: F(40000 / 12), start: '2024-01-01' }], accounts: [...s.accounts, acct('solo', 'solo_k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 12000 }]) })] }, '2026-02-01');
  const one = run(s).mx;
  assert.deepEqual([fills(one)['k401:2026'], row(one, 'roth:2026').cap.value, row(one, 'roth:2026').cap.seUsed], [10158.5, 37174.09, 0]);
  // A couple, as of January 5, nothing withheld: Casey $1,000 a month and an empty 401(k); Sam $2,500 a month, an empty
  // 401(k) and $7,000 in a Roth. Sam's Roth takes its last $500 first (answer 63), so his 401(k) stops at $22,500 and his
  // own $7,500 of pay holds his Roth; Casey keeps all her paychecks hold. The same with the accounts listed the other way.
  const two = (flip) => {
    const c = couple(demo()), mine = [acct('ck', 'k401', 'employerRetirement'), acct('sk', 'k401', 'employerRetirement', { owner: F('partner') }), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 7000 }]) })];
    return fills(run(at({ ...c, income: [w2('cj', 'casey', 1000), w2('sj', 'sam', 2500)], accounts: [...c.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth'), ...(flip ? mine.reverse() : mine)] }, '2026-01-05')).mx);
  };
  assert.deepEqual([two(false), two(true)].map((f) => [f['ck:2026'], f['sk:2026'], f['sr:2026']]), [[10158.5, 22500, 500], [10158.5, 22500, 500]]);
  // Casey's $7,000 Roth is already over her own $6,000 and Sam ($3,000) can never earn more: cutting his 401(k) cannot
  // help, so it keeps what his paychecks hold; her row says she is over.
  let o = couple(demo());
  o = at({ ...o, income: [w2('cj', 'casey', 500), w2('sj', 'sam', 250)], accounts: [...o.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 7000 }]) } : a)), acct('sk', 'k401', 'employerRetirement', { owner: F('partner') })] }, '2026-01-05');
  const over = run(o).mx;
  assert.deepEqual([fills(over)['sk:2026'], over.totals.over], [2539.68, ['roth:2026']]);
  // Married filing separately, Casey's $3,000 of pay and $1,500 in a Roth: the Roth limit is reduced ($0 to $10,000
  // phase-out at $3,000 of modified AGI, 70%) to $2,100, so $600 more fits, and it comes first (answer 63): the $2,100
  // needs $2,985.72 of pay (70% of it, rounded up to $10, is $2,100); the 401(k) takes the other $14.28.
  let m = { ...couple(demo()) };
  m = at({ ...m, household: { ...m.household, filingStatus: F('mfs') }, income: [w2('cj', 'casey', 250), w2('sj', 'sam', 4000)], accounts: [...m.accounts.filter((a) => a.id !== 'roth').map((a) => (a.id === 'k401' ? { ...a, monthlyContribution: F(0) } : a)), acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 1500 }]) })] }, '2026-02-01');
  const mfs = run(m).mx;
  assert.deepEqual([fills(mfs)['k401:2026'], fills(mfs)['cr:2026'], mfs.totals.over], [14.28, 600, []]);
  // The cash check moves what the Plan counts: $5,000 in the Roth, so its last $2,500 comes first (answer 63), over the
  // 15 months to April 15, 2027 ($166.67, the last $166.62), and the 401(k) takes the $4,500 of pay left over 11
  // paychecks.
  let k = empty401();
  k = at({ ...k, income: [pay(k, 1000), { ...k.income[1], amount: F(0) }, ...k.income.slice(2)], accounts: k.accounts.map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 5000 }]) } : a)) }, '2026-02-01');
  const kr = run(k), cash = maxItCash(k, R, kr.mx, { sim: kr.sim });
  const kf = cash.flows.filter((x) => x.row === 'k401:2026'), rf = cash.flows.filter((x) => x.row === 'roth:2026');
  assert.deepEqual([kr.mx.totals.lump, cash.total, kf.length, Math.round(kf.reduce((x, y) => x + y.amount, 0) * 100) / 100, rf.length, rf[0].amount, rf[14].amount], [7000, 7000, 11, 4500, 15, 166.67, 166.62]);
  assert.doesNotMatch(cash.words, /only what a paycheck holds/);
  // A few cents ($1,841.53 in the Roth): $5,658.47 more into it, and the 401(k) $4,500: still to the cent.
  const tiny = { ...k, accounts: k.accounts.map((a) => (a.id === 'roth' ? { ...a, contributions: F([{ year: 2026, amount: 1841.53 }]) } : a)) };
  const tr = run(tiny);
  assert.deepEqual([tr.mx.totals.lump, maxItCash(tiny, R, tr.mx, { sim: tr.sim }).total], [10158.47, 10158.47]);
  // The FOO ladder counts what the Plan counts, so following its rungs in turn never uses the same pay twice. The IRA
  // comes before the rest of the 401(k) (answer 63): the Roth rung takes the Roth's whole $3,900 of new money ($260 a
  // month), and the retirement rung says why the 401(k) counts less than it alone could take.
  let f = empty401();
  f = at({ ...f, income: [{ ...pay(f, 1500), withholding: { federal: F(0), state: F(50) } }, { ...f.income[1], amount: F(0) }, ...f.income.slice(2)] }, '2026-02-01');
  const rung = fooLadder(f, R, summarize(f, R, { flags: false }), { sim: maxItSim(f, R) }).rungs.find((r) => r.id === 'rothHsa');
  assert.equal(rung.why, 'Roth IRA 2026: $260 a month to April 15, 2027, on top of the $3,000 already set to go in.');
  const ret = fooLadder(f, R, summarize(f, R, { flags: false }), { sim: maxItSim(f, R) }).rungs.find((r) => r.id === 'maxRetirement');
  assert.match(ret.why, /less than the account alone could take: the IRA comes before the rest of the 401\(k\)/);
  // 27 biweekly paydays in 2027: $500 a month from pay is $230.77 on each of 27 paychecks, $6,230.79 off wages (not $6,000).
  let b = putFact(demo(), 'accounts.k401.monthlyContribution', 500, 'known', T);
  b = at({ ...b, income: [{ ...pay(b, 1000), cadence: 'biweekly', start: '2024-01-05' }, { ...b.income[1], amount: F(0) }] }, '2027-02-01');
  assert.equal(earnedIncome(b, R, 2027).value, 27000 - 6230.79);
});

test('round 16 (S-225): no account order decides the Plan, a Solo never crowds pay money out, a couple keeps the gap it has, an excess never grows', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const run = (s) => maxIt(s, R, { sim: maxItSim(s, R) });
  const fills = (mx) => Object.fromEntries(mx.pools.filter((p) => !p.spill).map((p) => [p.row.id + ' ' + p.key, p.fill]));
  const bare = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth') }; };
  const round2 = (x) => Math.round(x * 100) / 100;
  const gig = (id, pid, amt) => ({ ...w2(id, pid, amt), type: '1099' });
  const both = (accts, make) => [false, true].map((flip) => fills(run(make(flip ? [...accts].reverse() : accts))));
  // $7,200 of W-2 pay with $1,800 into an HSA through pay ($5,400 in box 1), $24,000 of 1099 pay and $13,000 in a Solo
  // 401(k): the tax figures take the Solo off the wages last, so the HSA still comes out of pay. The Roth comes first
  // (answer 63): its $7,500 rests on the $5,400 of W-2 pay and $2,100 of the $9,304.45 of self-employment pay left, so
  // the Solo's new money is the other $7,204.45.
  const a = run(at({ ...bare(), income: [w2('job', 'casey', 600), gig('gig', 'casey', 2000)], accounts: [...bare().accounts, acct('solo', 'solo_k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 13000 }]) }), acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(150) }), acct('r', 'roth_ira', 'ira')] }, '2026-02-01'));
  assert.deepEqual([fills(a)['r:2026 ira:casey'], round2(fills(a)['solo:2026 deferral:casey'] + fills(a)['solo:2026 employer:casey'])], [7500, 7204.45]);
  // A Solo listed before or after a 401(k) at $100 a month: the same Plan. The Roth comes first (answer 63) and takes
  // all the pay it can count ($6,000 less the 401(k)'s $1,200, and the $1,364.17 of self-employment pay left after the
  // Solo's $7,000): $6,164.17 either way, and the 401(k) and Solo nothing more.
  const solo = [acct('solo', 'solo_k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 7000 }]) }), acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(100) }), acct('r', 'roth_ira', 'ira')];
  const [s1, s2] = both(solo, (xs) => at({ ...bare(), income: [w2('job', 'casey', 500), gig('gig', 'casey', 750)], accounts: [...bare().accounts, ...xs] }, '2026-02-01'));
  assert.deepEqual([s1, s1['r:2026 ira:casey']], [s2, 6164.17]);
  // An empty 401(k) and an empty Roth 401(k) tie for the one deferral limit: the Roth 401(k) takes it in either order (it
  // leaves the Roth IRA its pay).
  const [t1, t2] = both([acct('k', 'k401', 'employerRetirement'), acct('rk', 'roth_k401', 'employerRetirement'), acct('r', 'roth_ira', 'ira')], (xs) => at({ ...bare(), income: [w2('job', 'casey', 500)], accounts: [...bare().accounts, ...xs] }, '2026-02-01'));
  assert.deepEqual([t1, t1], [t2, { 'rk:2026 deferral:casey': 5079.25, 'r:2026 ira:casey': 6000 }]);
  // A couple: Sam earns $3,060, $60 more than Casey, whose $5,000 Roth rests on the couple's pay. His 401(k) gives way so
  // he still earns $60 more (never less than the gap they already have); her Roth may take $1,060 more.
  let d = couple(bare());
  d = at({ ...d, income: [w2('cj', 'casey', 250), w2('sj', 'sam', 255)], accounts: [...d.accounts, acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 5000 }]) }), acct('sk', 'k401', 'employerRetirement', { owner: F('partner') })] }, '2026-01-05');
  assert.deepEqual([fills(run(d)), run(d).totals.over], [{ 'cr:2026 ira:casey': 1060, 'sk:2026 deferral:sam': 0 }, []]);
  // Casey's $7,000 Roth is already $539.11 over the couple's pay and Sam earns more from 1099 pay: his Solo takes nothing,
  // so the excess does not grow.
  let e = couple(bare());
  e = at({ ...e, income: [w2('cj', 'casey', 2000 / 12), gig('sg', 'sam', 400)], accounts: [...e.accounts, acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 7000 }]) }), acct('ss', 'solo_k401', 'employerRetirement', { owner: F('partner') })] }, '2026-01-05');
  const em = run(e);
  assert.deepEqual([round2(fills(em)['ss:2026 deferral:sam'] + fills(em)['ss:2026 employer:sam']), row(em, 'cr:2026').over], [0, 539.11]);
  // Married filing separately past the top of the Roth phase-out: no pay can make the $3,000 Roth fit, so the 401(k) is
  // not cut for it (it takes what the paychecks hold).
  let g = couple(bare());
  g = at({ ...g, household: { ...g.household, filingStatus: F('mfs') }, income: [w2('cj', 'casey', 1500), w2('sj', 'sam', 3000)], accounts: [...g.accounts, acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 3000 }]) }), acct('ck', 'k401', 'employerRetirement')] }, '2026-02-01');
  assert.deepEqual(row(run(g), 'ck:2026').counted.why, 'paycheck');
  // A pay line counted as likely (90%): the expected tax still takes its 401(k) money off the wages, as likely as the pay
  // ($54,000 of expected wages less 90% of $6,000).
  const h = { ...bare(), income: [{ ...w2('job', 'casey', 5000), likelihood: F(0.9) }], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] };
  assert.equal(yearTax(h, R, 2026, 'expected').lines.agi.value, 48600);
});

test('round 17 (S-225): the least excess on the gap terms, new IRA money keeps the gap, reasons that match, a fixed fill and cut order, nothing held back with no IRA', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const run = (s) => maxIt(s, R, { sim: maxItSim(s, R) });
  const fills = (mx) => Object.fromEntries(mx.pools.map((p) => [p.row.id + ' ' + p.key + (p.spill ? ' spill' : ''), p.fill]));
  const bare = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth') }; };
  const gig = (id, pid, amt) => ({ ...w2(id, pid, amt), type: '1099' });
  // Casey earns $3,220 with $7,500 already in her Roth, Sam $2,870; both have empty 401(k)s. Nothing makes the Roth fit
  // (it is $4,280 over): Casey's 401(k) takes $450, so Sam earns $100 more and her Roth rests on the couple's pay, $1,860
  // over, the least it can be.
  let c = couple(bare());
  c = at({ ...c, income: [w2('cj', 'casey', 3220 / 12), w2('sj', 'sam', 2870 / 12)], accounts: [...c.accounts, acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 7500 }]) }), acct('ck', 'k401', 'employerRetirement'), acct('sk', 'k401', 'employerRetirement', { owner: F('partner') })] }, '2026-01-05');
  const cm = fills(run(c));
  assert.deepEqual([cm['ck:2026 deferral:casey'], cm['sk:2026 deferral:sam']], [450, 0]);
  // No IRA money yet; Sam earns $150 more. Casey's new Roth money comes before the rest of Sam's 401(k) (answer 63): it
  // rests on the couple's $6,150, so Sam's 401(k) takes nothing and he stays $150 ahead (before, his 401(k) took
  // $124.84, which left him too close, $25.16 ahead, and her Roth $3,000 on her own pay).
  let g = couple(bare());
  g = at({ ...g, income: [w2('cj', 'casey', 250), w2('sj', 'sam', 262.5, { withholding: { federal: F(180), state: F(0) } })], accounts: [...g.accounts, acct('cr', 'roth_ira', 'ira'), acct('sk', 'k401', 'employerRetirement', { owner: F('partner') })] }, '2026-10-25');
  assert.deepEqual(fills(run(g)), { 'cr:2026 ira:casey': 6150, 'sk:2026 deferral:sam': 0 });
  // Married filing separately, $7,000 of pay and $2,500 in a Roth: its limit is $2,100 at any pay from $6,966.67 up ($10
  // steps), so the 401(k) may take $33.33 without making it more over.
  let m = couple(bare());
  m = at({ ...m, household: { ...m.household, filingStatus: F('mfs') }, income: [w2('cj', 'casey', 7000 / 12), w2('sj', 'sam', 4000)], accounts: [...m.accounts, acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 2500 }]) }), acct('ck', 'k401', 'employerRetirement')] }, '2026-02-01');
  assert.equal(fills(run(m))['ck:2026 deferral:casey'], 33.33);
  // A job from July 1 at $4,000 a month and $20,000 already recorded in the 401(k) (from a job not in the Ledger). With
  // no IRA, nothing needs the pay: the 401(k) takes the $4,500 of limit left. With $1,000 in a Roth, the pay the tax
  // figures see ($24,000 less the $20,000) is $4,000, and the Roth comes first (answer 63): its $1,000 and $3,000 of new
  // money keep all of it, so the 401(k) takes nothing more, and says why.
  const n = at({ ...bare(), income: [w2('job', 'casey', 4000, { start: '2026-07-01' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 20000 }]) })] }, '2026-08-01');
  assert.deepEqual([fills(run(n))['k:2026 deferral:casey'], row(run(n), 'k:2026').counted], [4500, undefined]);
  const n2 = { ...n, accounts: [...n.accounts, acct('r', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 1000 }]) })] };
  assert.deepEqual(row(run(n2), 'k:2026').counted, { fill: 0, why: 'preIra', words: 'the IRA comes before the rest of the 401(k) (past the employer match), so IRA money keeps the pay it needs' });
  assert.equal(fills(run(n2))['r:2026 ira:casey'], 3000);
  // A 401(k) fills from pay before a 457(b), and the 457(b) gives way first: $7,500 in the Roth leaves $32,500 of $40,000.
  const k = at({ ...bare(), income: [w2('job', 'casey', 40000 / 12)], accounts: [...bare().accounts, acct('q', 'k457b', 'employerRetirement'), acct('k', 'k401', 'employerRetirement'), acct('r', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 7500 }]) })] }, '2026-02-01');
  const km = fills(run(k));
  assert.deepEqual([km['k:2026 deferral:casey'], km['q:2026 k457b:casey']], [24500, 8000]);
  // A traditional and a Roth IRA tie: the Roth takes the new money, whatever their ids or order (question 64).
  assert.deepEqual(fills(run(at({ ...bare(), income: [w2('job', 'casey', 5000)], accounts: [...bare().accounts, acct('a_trad', 'traditional_ira', 'ira'), acct('z_roth', 'roth_ira', 'ira')] }, '2026-02-01'))), { 'z_roth:2026 ira:casey': 7500 });
  // Two empty Solo 401(k)s: the same Plan in either order, spill included.
  const sp = (flip) => { const xs = [acct('solo_a', 'solo_k401', 'employerRetirement'), acct('solo_b', 'solo_k401', 'employerRetirement')]; return fills(run(at({ ...bare(), income: [w2('job', 'casey', 500), gig('gig', 'casey', 5000)], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement'), ...(flip ? xs.reverse() : xs)] }, '2026-02-01'))); };
  assert.deepEqual(sp(true), sp(false));
  // The expected tax takes a 401(k)'s monthly amount off every month of pay, a likely line's months as likely as it is:
  // $51,600 of expected wages less $3,000 (January to June, certain) and 90% of $3,000 (July to December).
  const h = { ...bare(), income: [w2('job', 'casey', 5000, { end: '2026-06-30' }), { ...w2('job2', 'casey', 2000), likelihood: F(0.9) }], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] };
  assert.equal(yearTax(h, R, 2026, 'expected').lines.agi.value, 45900);
});

test('round 18 (S-225): a couple\'s reason names the money that caused it; the tax modes agree when all pay is certain', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const bare = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth') }; };
  // Casey earns $2,000, Sam $12,000 with an empty 401(k). Casey's Roth comes before the rest of Sam's 401(k) (answer 63):
  // it rests on the couple's pay, so his 401(k) stops at $6,500 ($14,000 - $7,500) and says why. (Before, his 401(k)
  // took $10,158.50, he earned less than Casey, and her Roth was held to her own $2,000.)
  let c = couple(bare());
  c = at({ ...c, income: [w2('cj', 'casey', 2000 / 12), w2('sj', 'sam', 1000)], accounts: [...c.accounts, acct('cr', 'roth_ira', 'ira'), acct('sk', 'k401', 'employerRetirement', { owner: F('partner') })] }, '2026-02-01');
  const cx = maxIt(c, R, { sim: maxItSim(c, R) });
  assert.deepEqual([row(cx, 'cr:2026').counted, cx.pools.map((p) => [p.key, p.fill])], [undefined, [['ira:casey', 7500], ['deferral:sam', 6500]]]);
  assert.deepEqual(row(cx, 'sk:2026').counted, { fill: 6500, why: 'preIra', words: 'the IRA comes before the rest of the 401(k) (past the employer match), so IRA money keeps the pay it needs' });
  // 27 biweekly paydays, all pay certain: the committed and expected tax take the same $6,230.79 off.
  const b = { ...bare(), income: [w2('job', 'casey', 2000, { cadence: 'biweekly', start: '2025-12-18' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] };
  assert.deepEqual([yearTax(b, R, 2026).lines.agi.value, yearTax(b, R, 2026, 'expected').lines.agi.value], [47769.21, 47769.21]);
  // A job from January to June, another from July: a 401(k) is one employer's (answer 60, S-227), so it is paid through
  // one job, by default the one that pays the most (a tie: the first by id), 6 months of $500 off in both modes.
  const j = { ...bare(), income: [w2('a', 'casey', 5000, { start: '2026-01-01', end: '2026-06-30' }), w2('b', 'casey', 5000, { start: '2026-07-01' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] };
  assert.deepEqual([yearTax(j, R, 2026).lines.agi.value, yearTax(j, R, 2026, 'expected').lines.agi.value], [57000, 57000]);
});

test('round 19 (S-225): Solo money always held to the self-employment pay; money from pay cut only for the pay it removes', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const run = (s) => maxIt(s, R, { sim: maxItSim(s, R) });
  const fills = (mx) => Object.fromEntries(mx.pools.map((p) => [p.row.id + ' ' + p.key + (p.spill ? ' spill' : ''), p.fill]));
  const bare = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth') }; };
  const gig = (id, pid, amt) => ({ ...w2(id, pid, amt), type: '1099' });
  // $24,000 of 1099 pay ($22,304.45 to count) and a Solo 401(k) at $200 a month ($2,400): with no IRA at all, the Solo's
  // new money is still held to the $19,904.45 of self-employment pay left (the deferral spilled from the 401(k) too).
  const solo = run(at({ ...bare(), income: [w2('job', 'casey', 500), gig('gig', 'casey', 2000)], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement'), acct('so', 'solo_k401', 'employerRetirement', { monthlyContribution: F(200) })] }, '2026-05-01'));
  const sf = fills(solo);
  assert.deepEqual([Math.round((sf['so:2026 employer:casey'] + sf['so:2026 deferral:casey spill']) * 100) / 100, solo.totals.over], [19904.45, []]);
  // Casey's new job's 401(k), with $8,000 in already from a job not in the Ledger: Sam's IRA money rests on his own
  // $200,000, so her 401(k) keeps all its paychecks hold either way.
  const u = (amount) => { let c = couple(bare()); c = at({ ...c, income: [w2('cj', 'casey', 1000, { start: '2026-07-01' }), w2('sj', 'sam', 200000 / 12)], accounts: [...c.accounts, acct('ck', 'k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 8000 }]) }), acct('st', 'traditional_ira', 'ira', { owner: F('partner'), ...(amount ? { contributions: F([{ year: 2026, amount }]) } : {}) })] }, '2026-08-01'); return fills(run(c))['ck:2026 deferral:casey']; };
  assert.deepEqual([u(0), u(1000)], [4617.5, 4617.5]);
  // The same job alone, with 1099 pay, an empty SEP and an empty Roth: the 401(k) lowers no pay (none is left after the
  // $8,000), and the Roth comes before the SEP (answer 63): it takes all $4,646.76 of self-employment pay, and the SEP,
  // cut to nothing, says why.
  const w = run(at({ ...bare(), income: [w2('job', 'casey', 1000, { start: '2026-07-01' }), gig('gig', 'casey', 5000 / 12)], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 8000 }]) }), acct('sep', 'sep_ira', 'ira'), acct('r', 'roth_ira', 'ira')] }, '2026-08-01'));
  assert.deepEqual([row(w, 'r:2026').counted, row(w, 'r:2026').lump, row(w, 'sep:2026').counted.why], [undefined, 4646.76, 'seIra']);
  // All 2026 pay certain (a likely job only from 2027): both tax modes count the 27 paychecks.
  const f = { ...bare(), income: [w2('job', 'casey', 2000, { cadence: 'biweekly', start: '2025-12-18' }), { ...w2('later', 'casey', 3000, { start: '2027-01-01' }), likelihood: F(0.8) }], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] };
  assert.deepEqual([yearTax(f, R, 2026).lines.agi.value, yearTax(f, R, 2026, 'expected').lines.agi.value], [47769.21, 47769.21]);
  // Two jobs, January to June and July on: the 401(k) is paid through one of them (answer 60), 6 months of pay, and the
  // line says so; paid through the July job, its 6 months.
  const j = { ...bare(), income: [w2('a', 'casey', 5000, { start: '2026-01-01', end: '2026-06-30' }), w2('b', 'casey', 5000, { start: '2026-07-01' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] };
  assert.deepEqual(earnedIncome(j, R, 2026).lines.filter((l) => /pre-tax/.test(l.label)).map((l) => [l.label, l.amount]), [['k: pre-tax saving from pay (6 months)', -3000]]);
});

test('round 20 (S-225): months of pay by paydays, a blank spouse never lifts the Solo hold, a couple cut by dollars, a Solo row keeps its own deferral', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const run = (s) => maxIt(s, R, { sim: maxItSim(s, R) });
  const fills = (mx) => Object.fromEntries(mx.pools.map((p) => [p.row.id + ' ' + p.key + (p.spill ? ' spill' : ''), p.fill]));
  const bare = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth') }; };
  const gig = (id, pid, amt) => ({ ...w2(id, pid, amt), type: '1099' });
  // A job to June 30 and a one-time severance in July: 7 months of pay, so 7 months of 401(k) and HSA money from pay
  // ($12,000 - $3,500 - $1,400), and the $5,000 IRA is not over.
  const sv = at({ ...bare(), income: [w2('job', 'casey', 1500, { end: '2026-06-30' }), w2('sev', 'casey', 3000, { cadence: 'once', start: '2026-07-15' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) }), acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(200) }), acct('ti', 'traditional_ira', 'ira', { contributions: F([{ year: 2026, amount: 5000 }]) })] }, '2026-03-01');
  assert.deepEqual([earnedIncome(sv, R, 2026).value, row(run(sv), 'ti:2026').over], [7100, null]);
  // Sam's pay amount blank: Casey's Solo is still held to her self-employment pay left ($19,904.45).
  let ns = couple(bare());
  ns = at({ ...ns, income: [w2('cj', 'casey', 500), gig('cg', 'casey', 2000), { ...w2('sj', 'sam', 0), amount: F(null, 'missing') }], accounts: [...ns.accounts, acct('k', 'k401', 'employerRetirement'), acct('so', 'solo_k401', 'employerRetirement', { monthlyContribution: F(200) })] }, '2026-05-01');
  const nf = fills(run(ns));
  assert.equal(Math.round((nf['so:2026 employer:casey'] + nf['so:2026 deferral:casey spill']) * 100) / 100, 19904.45);
  // Casey's IRA, $2,000 in and $5,500 of new money first (answer 63), needs $7,500 of the couple's pay. Cutting her
  // 401(k) would also drop its $1,617.50 past her W-2 pay; cutting Sam's Solo by $7,500 costs less, so the Plan does
  // that: $1,793.52 of the Solo is left.
  let pc = couple(bare());
  pc = at({ ...pc, income: [w2('cj', 'casey', 1000, { start: '2026-07-01' }), gig('sg', 'sam', 10000 / 12)], accounts: [...pc.accounts, acct('k', 'k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 3000, through: '2026-07-31' }]) }), acct('ci', 'traditional_ira', 'ira', { contributions: F([{ year: 2026, amount: 2000 }]) }), acct('so', 'solo_k401', 'employerRetirement', { owner: F('partner') })] }, '2026-08-01');
  const pf = fills(run(pc));
  assert.deepEqual([pf['k:2026 deferral:casey'], Math.round((pf['so:2026 employer:sam'] + pf['so:2026 deferral:sam']) * 100) / 100, pf['ci:2026 ira:casey']], [4617.5, 1793.52, 5500]);
  // Sam earns more; his IRA comes before his own SEP (answer 63) and takes all $7,434.82 of his self-employment pay, so
  // his SEP gives way, and says why (Casey's 401(k) is not cut for it).
  let wh = couple(bare());
  wh = at({ ...wh, income: [w2('cj', 'casey', 500), gig('sg', 'sam', 8000 / 12)], accounts: [...wh.accounts, acct('k', 'k401', 'employerRetirement'), acct('sep', 'sep_ira', 'ira', { owner: F('partner') }), acct('si', 'traditional_ira', 'ira', { owner: F('partner') })] }, '2026-03-01');
  const whm = run(wh);
  assert.deepEqual([row(whm, 'si:2026').counted, row(whm, 'si:2026').lump, row(whm, 'sep:2026').counted.why, row(whm, 'k:2026').counted.why], [undefined, 7434.82, 'seIra', 'paycheck']);
  // A Solo with $7,600 in and $100 a month still to come ($1,000) on $9,293.52 of self-employment pay: its own deferral
  // keeps its place, so the row offers $693.52 more and is not set to go over.
  const so = run(at({ ...bare(), income: [gig('g', 'casey', 10000 / 12)], accounts: [...bare().accounts, acct('so', 'solo_k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 7600 }]), monthlyContribution: F(100) })] }, '2026-02-01'));
  assert.deepEqual([row(so, 'so:2026').lump, row(so, 'so:2026').overSoon], [693.52, undefined]);
  // A likely one-time bonus in 2025 leaves 2026's pay certain: both tax modes count the 27 paychecks.
  const f2 = { ...bare(), income: [w2('job', 'casey', 2000, { cadence: 'biweekly', start: '2025-12-18' }), { ...w2('bonus', 'casey', 1000, { cadence: 'once', start: '2025-12-15' }), likelihood: F(0.5) }], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] };
  assert.deepEqual([yearTax(f2, R, 2026).lines.agi.value, yearTax(f2, R, 2026, 'expected').lines.agi.value], [47769.21, 47769.21]);
});

test('round 21 (S-225): one count of money from pay; a yearly line; a Solo employer total; the Solo reserve within 402(g)', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const run = (s) => maxIt(s, R, { sim: maxItSim(s, R) });
  const fills = (mx) => Object.fromEntries(mx.pools.map((p) => [p.row.id + ' ' + p.key + (p.spill ? ' spill' : ''), p.fill]));
  const bare = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth') }; };
  const gig = (id, pid, amt) => ({ ...w2(id, pid, amt), type: '1099' });
  const earned = (s, mode = 'committed') => earnedIncome(s, R, 2026, { mode }).value;
  // With a likely job in the expected mode the saving is counted month by month: a job to June 30 with $250 to a 401(k)
  // and $150 to an HSA a month, and a one-time $200 check in September, which holds at most $200 of that saving, so
  // expected earned income does not go down.
  const a0 = at({ ...bare(), income: [w2('job', 'casey', 1500, { end: '2026-06-30' }), { ...w2('maybe', 'casey', 100, { start: '2026-11-01' }), likelihood: F(0.5) }], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(250) }), acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(150) })] }, '2026-03-01');
  const a1 = { ...a0, income: [...a0.income, w2('x', 'casey', 200, { cadence: 'once', start: '2026-09-15' })] };
  assert.ok(earned(a1, 'expected') >= earned(a0, 'expected'));
  // The tax figures take money from pay off the wages by the Plan's own count, so recording the Plan's 401(k) money
  // never takes back the IRA pay it counted: following the Plan leaves nothing over (a job ending April 10 and a
  // one-time payout; a monthly job and a one-time check in November).
  const follow = (s, mx) => ({ ...s, accounts: s.accounts.map((a) => { const r = mx.rows.find((x) => x.accountId === a.id && x.year === 2026); const add = mx.pools.filter((q) => q.row.accountId === a.id && q.year === 2026).reduce((x, q) => x + q.fill, 0); return r && add ? { ...a, contributions: F([{ year: 2026, amount: Math.round((r.contributed.value + add) * 100) / 100, through: s.meta.asOf }]) } : a; }) });
  for (const p of [
    at({ ...bare(), income: [w2('job', 'casey', 5000, { end: '2026-04-10' }), w2('pay', 'casey', 3000, { cadence: 'once', start: '2026-05-15' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(2000) }), acct('ti', 'traditional_ira', 'ira')] }, '2026-03-01'),
    at({ ...bare(), income: [w2('job', 'casey', 1000), { ...w2('one', 'casey', 6000, { cadence: 'once', start: '2026-11-20' }), withholding: { federal: F(2400), state: F(0) } }], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(1500) }), acct('r', 'roth_ira', 'ira')] }, '2026-03-01')
  ]) assert.deepEqual(run(follow(p, run(p))).totals.over, []);
  // A salary entered by the year ($72,000) or the quarter: paid monthly, so $500 a month comes out now and the 401(k)
  // reads $2,350 a paycheck on its 10 paychecks ($18,500 more), not a year's worth a paycheck.
  for (const [cadence, amount] of [['yearly', 72000], ['quarterly', 18000]]) {
    const y = at({ ...bare(), income: [w2('sal', 'casey', amount, { cadence })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] }, '2026-03-01');
    const pc = row(run(y), 'k:2026').paychecks;
    assert.deepEqual([pc.count, pc.current, pc.perPaycheck], [10, 500, 2350]);
  }
  // A salary and a yearly bonus line: $500 a month from pay is $6,000, not 12 times more.
  const b = at({ ...bare(), income: [w2('sal', 'casey', 5000), w2('bonus', 'casey', 12000, { cadence: 'yearly' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(500) })] }, '2026-03-01');
  assert.deepEqual(earnedIncome(b, R, 2026).lines.filter((l) => /pre-tax/.test(l.label)).map((l) => l.amount), [-6000]);
  // A Solo at $1,000 a month on $13,940.28 of self-employment pay: recording a $1 employer amount keeps the deferral's
  // monthly guess, so the IRA's pay stays $1,940.28 less that $1.
  const e0 = at({ ...bare(), income: [gig('g', 'casey', 1250)], accounts: [...bare().accounts, acct('so', 'solo_k401', 'employerRetirement', { monthlyContribution: F(1000) }), acct('ti', 'traditional_ira', 'ira')] }, '2026-07-01');
  const e1 = { ...e0, accounts: e0.accounts.map((x) => (x.id === 'so' ? { ...x, contributions: F([{ year: 2026, amount: 1, kind: 'employer' }]) } : x)) };
  assert.deepEqual([row(run(e0), 'ti:2026').cap.value, row(run(e1), 'ti:2026').cap.value], [1940.28, 1939.28]);
  // $200,000 of 1099 pay and a Solo at $3,000 a month ($36,000, $11,500 past the $24,500 deferral limit): the deferral
  // keeps only the $15,500 of limit it can use, so the employer part keeps all of its 20% ($37,176.57).
  const so = run(at({ ...bare(), income: [gig('g', 'casey', 200000 / 12)], accounts: [...bare().accounts, acct('so', 'solo_k401', 'employerRetirement', { monthlyContribution: F(3000) })] }, '2026-03-01'));
  assert.deepEqual([row(so, 'so:2026').parts['employer:casey'], row(so, 'so:2026').overSoon], [37176.57, 11500]);
  // Casey's IRA rests on the couple's pay and comes before the rest of Sam's 401(k) and her own Solo (answer 63): it
  // takes its $7,500, so Sam's 401(k) stops at $10,558.70 (it took $13,852.50 before) and her Solo's new money gives
  // way; each says why.
  let mj = couple(bare());
  mj = at({ ...mj, income: [gig('cg', 'casey', 2000 / 12), w2('sj', 'sam', 1500)], accounts: [...mj.accounts, acct('cso', 'solo_k401', 'employerRetirement', { monthlyContribution: F(150) }), acct('ci', 'traditional_ira', 'ira'), acct('sk', 'k401', 'employerRetirement', { owner: F('partner') })] }, '2026-03-01');
  const mjm = run(mj);
  assert.deepEqual([row(mjm, 'ci:2026').counted, row(mjm, 'ci:2026').lump, row(mjm, 'sk:2026').counted.fill, row(mjm, 'sk:2026').counted.why, row(mjm, 'cso:2026').counted.why], [undefined, 7500, 10558.7, 'preIra', 'seIra']);
});

test('round 22 (S-225): an FSA by paychecks to its election, an employer-only total, a stale one-time line, an ended line, a family HSA', () => {
  const at = (s, asOf) => ({ ...s, meta: { ...s.meta, asOf } });
  const run = (s) => maxIt(s, R, { sim: maxItSim(s, R) });
  const bare = () => { const d = demo(); return { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth') }; };
  const gig = (id, pid, amt) => ({ ...w2(id, pid, amt), type: '1099' });
  const pre = (s) => earnedIncome(s, R, 2026).lines.filter((l) => /pre-tax/.test(l.label)).map((l) => [l.label, l.amount]);
  // A dependent care FSA at $250 a month on a job that ends June 30: six paychecks, $1,500.
  const fs = at({ ...bare(), income: [w2('job', 'casey', 1500, { end: '2026-06-30', payDay: F(15) })], accounts: [...bare().accounts, acct('fsa', 'dc_fsa', 'hsaFsa', { monthlyContribution: F(250) })] }, '2026-03-01');
  assert.deepEqual(pre(fs), [['fsa: pre-tax saving from pay (6 months)', -1500]]);
  // A dependent care FSA at its $625 a month election in a 27-payday year: never past the year's $7,500.
  const f27 = { ...bare(), income: [w2('job', 'casey', 3000, { cadence: 'biweekly', start: '2026-01-01' })], accounts: [...bare().accounts, acct('f', 'dc_fsa', 'hsaFsa', { monthlyContribution: F(625) })] };
  assert.deepEqual(pre(f27), [['f: pre-tax saving from pay (12 months)', -7500]]);
  // An HSA with only the employer's $500 recorded: the owner's own $300 a month still counts (January 1 to 19 is in,
  // $183.87; the rest of the year still to come), so its new money is $300 and the year ends at the $4,400 limit.
  const he = row(run(at({ ...bare(), income: [w2('job', 'casey', 2000, { cadence: 'biweekly', start: null })], accounts: [...bare().accounts, acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(300), contributions: F([{ year: 2026, amount: 500, kind: 'employer' }]) })] }, '2026-01-20')), 'h:2026');
  assert.deepEqual([he.contributed.value, he.still.value, he.lump], [683.87, 3416.13, 300]);
  // A SEP's employer total is the whole account (its monthly amount is employer money too): $6,000 through June 30 and
  // $1,000 a month is $7,000 in and $5,000 still to come, not the monthly amount on top again.
  const sep = row(run(at({ ...bare(), income: [gig('g', 'casey', 8000)], accounts: [...bare().accounts, acct('sep', 'sep_ira', 'ira', { monthlyContribution: F(1000), contributions: F([{ year: 2026, amount: 6000, kind: 'employer', through: '2026-06-30' }]) })] }, '2026-07-10')), 'sep:2026');
  assert.deepEqual([sep.contributed.value, sep.still.value, sep.lump, sep.overSoon], [7000, 5000, 5843.56, undefined]);
  // A 401(k) at $2,000 a month with a $6,000 employer match recorded: the match is not an employee deferral (402(g)),
  // so $14,000 is in, $10,000 still to come, and $500 of the limit is left.
  const k = row(run(at({ ...bare(), income: [w2('job', 'casey', 10000)], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(2000), contributions: F([{ year: 2026, amount: 6000, kind: 'employer' }]) })] }, '2026-07-10')), 'k:2026');
  assert.deepEqual([k.contributed.value, k.still.value, k.lump, k.over], [14000, 10000, 500, null]);
  // An HSA beside a W-2 line goes in from pay: with that job ended, nothing goes in this year, and the Plan, the tax
  // figures and the cash flow agree on it.
  const d = bare();
  const rt = at({ ...d, household: { ...d.household, people: d.household.people.map((x, i) => (i ? x : { ...x, birthDate: F('1966-01-01') })) }, income: [w2('old', 'casey', 3000, { end: '2025-06-30' }), gig('g', 'casey', 2000)], accounts: [...d.accounts, acct('h', 'hsa', 'hsaFsa', { coverageLevel: F('self'), monthlyContribution: F(300) })] }, '2026-03-01');
  const h = row(run(rt), 'h:2026');
  assert.deepEqual([yearTax(rt, R, 2026).lines.hsaDeduction.value, h.contributed.value, h.still.value], [0, 0, 0]);
  // A one-time bonus paid in 2025 does not turn 2026's 27 biweekly paydays into months: $2,000 a month is $24,923.16,
  // $423.16 past the limit, and the tax figures take that much off.
  const o = at({ ...bare(), income: [w2('job', 'casey', 4000, { cadence: 'biweekly', start: '2026-01-01' }), w2('bonus', 'casey', 1000, { cadence: 'once', start: '2025-11-15' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(2000) })] }, '2026-03-01');
  assert.deepEqual([row(run(o), 'k:2026').overSoon, pre(o)[0][1]], [423.16, -24923.16]);
  // A weekly job with no first pay date that ended June 10: on June 20 nothing is still to come.
  const en = at({ ...bare(), income: [w2('job', 'casey', 1000, { cadence: 'weekly', start: null, end: '2026-06-10' })], accounts: [...bare().accounts, acct('k', 'k401', 'employerRetirement', { monthlyContribution: F(2000), contributions: F([{ year: 2026, amount: 12000 }]) })] }, '2026-06-20');
  assert.deepEqual([row(run(en), 'k:2026').still.value, pre(en)[0][1]], [0, -12000]);
  // A family HSA: money from pay a spouse's wages cannot hold does not use the shared limit, whichever HSA comes first.
  const fam = (ids) => { let c = couple(bare()); c = at({ ...c, income: [w2('cj', 'casey', 6000), w2('sj', 'sam', 300), w2('sb', 'sam', 100, { cadence: 'once', start: '2026-07-15' })], accounts: [...c.accounts, acct(ids[0], 'hsa', 'hsaFsa', { coverageLevel: F('family'), monthlyContribution: F(500) }), acct(ids[1], 'hsa', 'hsaFsa', { coverageLevel: F('family'), monthlyContribution: F(500), owner: F('partner') })] }, '2026-03-01'); return yearTax(c, R, 2026).lines.agi.value; };
  assert.equal(fam(['h1', 'h2']), fam(['h2', 'h1']));
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
  // paydays fall in November and December, two months, about $18,500 / 2 a month; from about December 22, only
  // December 25 is left: one month, $18,500, still open (the first payday of December, the 11th, has passed).
  const bi = { ...noCards, income: noCards.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'biweekly', start: '2026-01-09', amount: F(2769.23), withholding: { federal: F(253.85), state: F(129.23) } } : x)) };
  // (Each biweekly paycheck already put in $230.77 to the cent, as the run deducts it, so the room is $18,499.98: $9,249.99.)
  assert.equal(rung(hysa(bi, 18600)).need, 9249.99);
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
  assert.deepEqual([f.need, f.done, f.why], [0, true, 'Work 401(k) 2026: no paycheck after September 22, 2028, so nothing goes in once the surplus reaches this rung.']);
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
  assert.deepEqual([rung(j).need, rung(j).why], [0, 'Work 401(k) 2026: no paycheck after October 22, 2027, so nothing goes in once the surplus reaches this rung.']);
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

test('round 6 (S-217): a couple\'s Roth phase-out after the higher earner fills; a child\'s or joint IRA; two pay lines; old and moved paychecks; the FOO reads the run', () => {
  const d = demo(), c = couple(d);
  // MFJ, Casey earns $7,500, Sam nothing, modified AGI $247,000 (inside the $242,000 to $252,000 phase-out), both Roths
  // empty. Casey: $7,500 x (252,000 - 247,000) / 10,000 = $3,750. Sam's base is then $7,500 - $3,750 = $3,750, reduced
  // the same way to $1,875, rounded up to $1,880. Together $5,630 (not $7,500).
  const s15 = { ...c, income: [{ ...c.income[0], amount: F(625) }, { id: 'rent', type: 'rental', label: 'Rent', personId: 'casey', amount: F(239500 / 12), cadence: 'monthly', start: '2024-01-01', end: null, withholding: { federal: F(0), state: F(0) } }], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 0 }]) })] };
  const m15 = maxIt(s15, R);
  assert.deepEqual([row(m15, 'roth:2026').phase.magi, m15.totals.lump, row(m15, 'roth:2026').couple.together, row(m15, 'sr:2026').couple.together], [247000, 5630, 5630, 5630]);
  // A child's Roth IRA is not figured and never takes Casey's limit; a joint IRA waits on whose it is.
  const ch = { ...d, accounts: [...d.accounts, acct('kid', 'roth_ira', 'ira', { owner: F('child'), contributions: F([{ year: 2026, amount: 2000 }]) })] };
  const mch = maxIt(ch, R);
  assert.deepEqual([row(mch, 'roth:2026').room, row(mch, 'kid:2026').applies], [4500, false]);
  const jt = { ...d, accounts: [...d.accounts, acct('jnt', 'traditional_ira', 'ira', { owner: F('joint') })] };
  const rj = row(maxIt(jt, R), 'jnt:2026');
  assert.deepEqual([row(maxIt(jt, R), 'roth:2026').room, rj.room, rj.missingLabel, rj.missing], [4500, null, 'missing: whose Traditional IRA this is', ['accounts.jnt.owner']]);
  // Tips paid every two weeks through the same employer (a second job's pay never feeds this 401(k), answer 60): 7
  // paychecks (October 30 to December 25, and the salary's November 15 and December 15). An even $2,642.86 more each is
  // more than a tips paycheck lands, and the $18,500 is more than all 7 hold
  // ($17,592.51): each gives all that lands from it ($4,420.68 a salary paycheck, $1,750.23 a tips one), and the
  // rest cannot go in through payroll (S-220).
  const two = { ...d, income: [...d.income, { ...w2('job2', 'casey', 2000), type: 'tips', label: 'Tips', cadence: 'biweekly', start: '2026-01-09' }] };
  const p3 = row(maxIt(two, R, { sim: maxItSim(two, R) }), 'k401:2026').paychecks;
  assert.deepEqual([p3.count, p3.multi, p3.perPaycheck, p3.tooBig, p3.holdsTotal, p3.perLine.map((l) => [l.count, l.per])], [7, true, null, true, 17592.51, [[2, 4420.68], [5, 1750.23]]]);
  // A one-time bonus from November 2025 with no amount cannot pay in the run: the cash check reads as without it.
  const x4 = { ...d, income: [...d.income, { ...w2('bonus', 'casey', 0), label: 'Signing bonus', cadence: 'once', start: '2025-11-01', amount: F(null, 'missing') }] };
  const s4 = maxItSim(x4, R), s0 = maxItSim(d, R);
  assert.equal(maxItCash(x4, R, maxIt(x4, R, { sim: s4 }), { sim: s4 }).words, maxItCash(d, R, maxIt(d, R, { sim: s0 }), { sim: s0 }).words);
  // The salary ended October 20, but its October 15 payday was moved to October 25: one paycheck left, in the run and on
  // the schedule.
  const x5 = moveOccurrence({ ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-10-20' } : x)) }, 'salary|2026-10-15', '2026-10-25');
  const k5 = row(maxIt(x5, R, { sim: maxItSim(x5, R) }), 'k401:2026'), k5n = row(maxIt(x5, R), 'k401:2026');
  assert.deepEqual([k5.fillable, k5.paychecks.dates, k5n.fillable, k5n.paychecks.dates], [true, ['2026-10-25'], true, ['2026-10-25']]);
  // As of December 12, the December 15 paycheck was logged as happened on December 11: none is left, and nothing is
  // still set to go in.
  const x6 = confirmOccurrence({ ...d, meta: { ...d.meta, asOf: '2026-12-12' } }, 'salary|2026-12-15', { amount: 4211, date: '2026-12-11' });
  const k6 = row(maxIt(x6, R), 'k401:2026');
  assert.deepEqual([k6.fillable, k6.room, k6.still.value], [false, 18500, 0]);
  // Imported a day early instead: the run knows it, and the FOO reads the run as the card does (the steady month, not
  // $18,500 in December).
  const x6b = logSpend({ ...d, debts: [], meta: { ...d.meta, asOf: '2026-12-12' }, accounts: d.accounts.map((a) => (a.id === 'hysa' ? { ...a, balance: F(80000) } : a)) }, { amount: 4211, date: '2026-12-11', kind: 'income', source: 'import', importKey: 'bank:2026-12-11:payroll', merchant: 'HUDSON VALLEY HEALTH PAYROLL' }).spine;
  assert.equal(fooLadder(x6b, R, summarize(x6b, R, { flags: false }), { sim: maxItSim(x6b, R) }).rungs.find((x) => x.id === 'maxRetirement').need, 1541.67);
  // The spousal cap's Show the math adds each spouse's own earned income ($1,200 + $66,000), not the household's.
  const g = { ...c, income: [c.income[0], w2('samjob', 'sam', 100)], accounts: [...c.accounts, acct('st', 'traditional_ira', 'ira', { owner: F('partner') })] };
  const st = row(maxIt(g, R), 'st:2026');
  const ex = explainMetric(st.cap.metric, { spine: g, rules: R });
  assert.deepEqual([st.cap.metric, ex.value, ex.terms.map((x) => x.value)], ['earned:2026:sam+casey', 67200, [1200, 66000]]);
});

test('round 7 (S-218): the lower earner\'s Roth money stays within their reduced limit; two pay lines hold what each paycheck lands; early deposits and moved last paydays', () => {
  const d = demo(), c = couple(d);
  const rent = (amt) => ({ id: 'rent', type: 'rental', label: 'Rent', personId: 'casey', amount: F(amt / 12), cadence: 'monthly', start: '2024-01-01', end: null, withholding: { federal: F(0), state: F(0) } });
  const base = (pay, other, accts) => ({ ...c, income: [{ ...c.income[0], amount: F(pay / 12) }, ...other], accounts: [...c.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth'), ...accts] });
  // MFJ, modified AGI $247,000 (half the way through the $242,000 to $252,000 phase-out), Casey earns $8,000, Sam
  // nothing and already has $3,750 in a Roth. Sam's limit is half the couple's pay left after Casey's year, so Casey may
  // add only what keeps that at $3,750 or more: $8,000 - $7,480.01 = $519.99 (half of $7,480.01, rounded up to $10, is
  // $3,750).
  const b = base(8000, [rent(239000)], [acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 0 }]) }), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 3750 }]) })]);
  const mb = maxIt(b, R);
  assert.deepEqual([mb.pools.map((p) => [p.key, p.fill]), mb.totals.lump], [[['ira:casey', 519.99], ['ira:sam', 0]], 519.99]);
  // A child's IRA never counts as Casey's, even in the couple's lists: Sam's row names only Casey's own IRA, and the
  // phase-out cut still runs on Casey's Roth ($3,750 + $3,630 = $7,380).
  const k3 = { ...c, income: [{ ...c.income[0], amount: F(2000 / 12) }, w2('samjob', 'sam', 750), rent(236000)], accounts: [...c.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth'), acct('cr', 'roth_ira', 'ira', { contributions: F([{ year: 2026, amount: 0 }]) }), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 0 }]) }), acct('kid', 'traditional_ira', 'ira', { owner: F('child') })] };
  const m3 = maxIt(k3, R);
  assert.deepEqual([m3.totals.lump, row(m3, 'sr:2026').sharedWith], [7380, ['cr']]);
  // Weekly tips beside the salary: the 401(k) is held to what all 12 paychecks land ($12,081.54), not the smallest
  // paycheck times 12; the cash check moves each paycheck's own amount, the same total.
  const t4 = { ...d, income: [...d.income, { ...w2('tips', 'casey', 400), type: 'tips', label: 'Bar tips', cadence: 'weekly', start: '2026-01-02' }] };
  const s4 = maxItSim(t4, R), m4 = maxIt(t4, R, { sim: s4 }), k4 = row(m4, 'k401:2026');
  assert.deepEqual([k4.paychecks.count, k4.paychecks.holdsTotal, k4.paychecks.shortLines, m4.pools.find((p) => p.key === 'deferral:casey').fill, maxItCash(t4, R, m4, { sim: s4, rows: [k4] }).total], [12, 12081.54, ['Bar tips'], 12081.54, 12081.54]);
  // As of December 12, the December 15 paycheck came in early on the 11th (a bank import the run matched): $6,000 is in,
  // nothing is still to come, $18,500 of room, and no paycheck is left.
  const e5 = logSpend({ ...d, meta: { ...d.meta, asOf: '2026-12-12' } }, { amount: 4211, date: '2026-12-11', kind: 'income', source: 'import', importKey: 'bank:2026-12-11:payroll', merchant: 'HUDSON VALLEY HEALTH PAYROLL' }).spine;
  const k5 = row(maxIt(e5, R, { sim: maxItSim(e5, R) }), 'k401:2026');
  assert.deepEqual([k5.fillable, k5.room, k5.still.value, k5.contributed.value], [false, 18500, 0, 6000]);
  // A twice-a-month salary that ended September 30, with its September 30 payday moved to October 23: the run pays it
  // ($1,690.50 lands), the calendar shows that amount, and the 401(k) has that one paycheck.
  const x6 = moveOccurrence({ ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'semimonthly', amount: F(3000), end: '2026-09-30' } : x)) }, 'salary|2026-09-30', '2026-10-23');
  const k6 = row(maxIt(x6, R, { sim: maxItSim(x6, R) }), 'k401:2026');
  assert.deepEqual([k6.fillable, k6.paychecks.dates, k6.paychecks.landed], [true, ['2026-10-23'], 1690.5]);
  assert.deepEqual(calendar(x6, R, { start: '2026-10', months: 1 }).months[0].events.filter((e) => e.kind === 'pay' && e.date).map((e) => [e.date, e.amount]), [['2026-10-23', 1690.5]]);
  // The salary ends November 10, before its November 15 payday: nothing more comes out of pay, and the calendar shows
  // no November 15 paycheck (as the run has none).
  const x7 = { ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-11-10' } : x)) };
  const k7 = row(maxIt(x7, R, { sim: maxItSim(x7, R) }), 'k401:2026');
  assert.deepEqual([k7.still.value, k7.toFill], [0, 19500]);
  assert.ok(!calendar(x7, R, { start: '2026-11', months: 1 }).months[0].events.some((e) => e.kind === 'pay' && e.date === '2026-11-15'));
});

test('round 8 (S-219): partners who do not file jointly each read their own income; payroll counts its paychecks; two pay lines split by what each paycheck lands; deadline chips read the run', () => {
  const d = demo();
  const two = (fs) => ({ ...d, household: { ...d.household, filingStatus: F(fs), people: [...d.household.people, { id: 'sam', name: 'Sam', birthDate: F('1995-05-05') }] } });
  const pair = (fs, a, b) => { const c = two(fs); return { ...c, income: [{ ...c.income[0], amount: F(a / 12) }, w2('samjob', 'sam', b / 12)], accounts: [...c.accounts.filter((x) => x.id !== 'k401').map((x) => (x.id === 'roth' ? { ...x, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : x)), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 0 }]) })] }; };
  // Unmarried, each filing single: $120,000 and $60,000 are each under the $153,000 phase-out start, so each has the
  // full $7,500 (the household's $180,000 together is no one's modified AGI).
  const m1 = maxIt(pair('single', 120000, 60000), R);
  assert.deepEqual([row(m1, 'roth:2026').room, row(m1, 'roth:2026').phase.magi, row(m1, 'sr:2026').room, row(m1, 'sr:2026').phase.magi], [7500, 120000, 7500, 60000]);
  // Married filing separately, $6,000 each: $6,000 x (10,000 - 6,000) / 10,000 = $2,400 each, on each one's own income.
  const m2 = maxIt(pair('mfs', 6000, 6000), R);
  assert.deepEqual([row(m2, 'roth:2026').room, row(m2, 'sr:2026').room], [2400, 2400]);
  assert.match(row(m2, 'roth:2026').phase.words, /^Casey Rivera's modified AGI of \$6,000/);
  // Biweekly pay with $20,000 recorded: 5 paychecks are left, each already putting in $230.77 (12 x $500 / 26), so
  // $1,153.85 is still to come; $900 a paycheck ends the year at exactly $24,500.
  const b3 = { ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'biweekly', start: '2026-01-13', amount: F(2769.23), withholding: { federal: F(253.85), state: F(129.23) } } : x)), accounts: d.accounts.map((a) => (a.id === 'k401' ? { ...a, contributions: F([{ year: 2026, amount: 20000 }]) } : a)) };
  const k3 = row(maxIt(b3, R, { sim: maxItSim(b3, R) }), 'k401:2026');
  assert.deepEqual([k3.still.value, k3.paychecks.count, k3.paychecks.perPaycheck, Math.round((20000 + 5 * k3.paychecks.perPaycheck) * 100) / 100], [1153.85, 5, 900, 24500]);
  // A weekly $100 stipend beside the salary, $18,000 recorded through October 22: $5,489.66 of new money fits what the
  // 12 paychecks land ($9,335.16), but not evenly; each takes its share by what lands from it ($2,496.13 on each salary
  // paycheck, the cents left on the largest; $49.73 on each stipend one), never more than it holds, and the cash check
  // moves the same amounts.
  const s4 = { ...d, income: [...d.income, { ...w2('stip', 'casey', 100), type: 'tips', label: 'Tips', cadence: 'weekly', start: '2026-01-02' }], accounts: d.accounts.map((a) => (a.id === 'k401' ? { ...a, contributions: F([{ year: 2026, amount: 18000, through: '2026-10-22' }]) } : a)) };
  const sim4 = maxItSim(s4, R), mx4 = maxIt(s4, R, { sim: sim4 }), p4 = row(mx4, 'k401:2026').paychecks;
  assert.deepEqual([p4.tooBig, p4.perLine.map((l) => [l.count, l.per]), p4.plan.every((x, i) => x.amount <= p4.each[i].landed)], [false, [[2, 2496.13], [10, 49.73]], true]);
  assert.equal(Math.round(maxItCash(s4, R, mx4, { sim: sim4, rows: [row(mx4, 'k401:2026')] }).flows.reduce((x, f) => x + f.amount, 0) * 100) / 100, 5489.66);
  // A 401(k) and a 457(b) take from the same two paychecks: together no more than the $8,422 they land.
  const s5 = { ...d, accounts: [...d.accounts, acct('g', 'k457b', 'employerRetirement')] };
  const m5 = maxIt(s5, R, { sim: maxItSim(s5, R) });
  assert.equal(m5.pools.filter((p) => p.row.deadline.payrollOnly).reduce((x, p) => x + p.fill, 0), 8422);
  // As of December 15, that day's pay was typed on the 14th: the calendar's deadline chip reads $18,500, as the panel.
  const s6 = logSpend({ ...d, meta: { ...d.meta, asOf: '2026-12-15' } }, { amount: 4211, date: '2026-12-14', kind: 'income', source: 'typed' }).spine;
  assert.equal(calendar(s6, R, { start: '2026-12', months: 1 }).months[0].events.find((e) => e.kind === 'maxDeadline' && /401/.test(e.label)).amount, 18500);
  // The room is full and the salary ended: nothing to fill, so not "cannot be filled".
  const s7 = { ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-09-30' } : x)), accounts: d.accounts.map((a) => (a.id === 'k401' ? { ...a, contributions: F([{ year: 2026, amount: 24500 }]) } : a)) };
  const m7 = maxIt(s7, R, { sim: maxItSim(s7, R) });
  assert.deepEqual([row(m7, 'k401:2026').fillable, m7.totals.unfillable], [true, []]);
});

test('round 9 (S-220): a split paycheck amount shows with its math; a paycheck logged on the as-of day is paid; a Solo 401(k) or SEP lowers the pay an IRA counts; cents', () => {
  const d = demo();
  // A weekly stipend beside the salary: the per-line amounts are the row's main number, with their math.
  const s3 = { ...d, income: [...d.income, { ...w2('stip', 'casey', 100), type: 'tips', label: 'Tips', cadence: 'weekly', start: '2026-01-02' }], accounts: d.accounts.map((a) => (a.id === 'k401' ? { ...a, contributions: F([{ year: 2026, amount: 18000, through: '2026-10-22' }]) } : a)) };
  const mx3 = maxIt(s3, R, { sim: maxItSim(s3, R) }), p3 = row(mx3, 'k401:2026').paychecks;
  assert.deepEqual([p3.perPaycheck, p3.perLine[0].per], [null, 2496.13]);
  assert.equal(explainMetric('maxit:k401:2026:paycheck', { spine: s3, rules: R, maxit: mx3 }).value, 2496.13);
  // As of December 15, that day's pay logged that day: it has been paid, so nothing is still to come and no paycheck is
  // left ($18,500 of room, cannot be filled).
  const s4 = logSpend({ ...d, meta: { ...d.meta, asOf: '2026-12-15' } }, { amount: 4211, date: '2026-12-15', kind: 'income', source: 'typed' }).spine;
  const k4 = row(maxIt(s4, R, { sim: maxItSim(s4, R) }), 'k401:2026');
  assert.deepEqual([k4.fillable, k4.room, k4.still.value], [false, 18500, 0]);
  // One person with $30,000 of 1099 pay, a Solo 401(k) and a Roth: the Solo takes $5,576.11 + $22,304.46, which is all
  // the self-employment pay, so the Roth can take nothing (Pub 590-A: pay less the Solo money). $27,880.57 in all.
  const s1 = { ...d, income: [{ ...d.income[1], amount: F(2500) }], accounts: [...d.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('solo', 'solo_k401', 'employerRetirement')] };
  assert.equal(maxIt(s1, R).totals.lump, 27880.57);
  // $8,000 of 1099 pay with a SEP and a Roth: the SEP's $1,486.96 comes off the pay the Roth counts: $7,434.82 in all.
  const s2 = { ...d, income: [{ ...d.income[1], amount: F(8000 / 12) }], accounts: [...d.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('sep', 'sep_ira', 'ira')] };
  assert.equal(maxIt(s2, R).totals.lump, 7434.82);
  // Biweekly at $200 a month with $20,000 recorded: still to come is 6 x $92.31 = $553.86, to the cent, so the plan ends
  // at exactly $24,500.
  const b = { ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'biweekly', start: '2026-01-02', amount: F(2769.23), withholding: { federal: F(253.85), state: F(129.23) } } : x)), accounts: d.accounts.map((a) => (a.id === 'k401' ? { ...a, monthlyContribution: F(200), contributions: F([{ year: 2026, amount: 20000 }]) } : a)) };
  const kb = row(maxIt(b, R, { sim: maxItSim(b, R) }), 'k401:2026'), pb = kb.paychecks;
  assert.equal(Math.round((20000 + pb.perPaycheck * (pb.count - 1) + pb.last) * 100) / 100, 24500);
  // A 401(k) with no paycheck left: the calendar chip says it cannot be filled.
  const s6 = { ...d, income: d.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-06-30' } : x)) };
  assert.match(maxItDeadlines(s6, R, '2026-12-01', '2026-12-31')[0].note, /^Cannot be filled: no paycheck before December 31, 2026 \(\$21,500 of room for 2026\)/);
  // A spousal IRA whose owner has no pay: the household's paychecks fund it.
  const c = { ...couple(d), accounts: [...d.accounts, acct('sp', 'spousal_ira', 'ira', { owner: F('partner') })] };
  assert.ok(row(maxIt(c, R, { sim: maxItSim(c, R) }), 'sp:2026').paychecks.count > 0);
});

test('round 10 (S-221): IRA money already in keeps the self-employment pay it needs; a couple\'s pay is less each spouse\'s Solo or SEP money; the Plan says what it counts and why', () => {
  const d = demo();
  const gig = (pid, yr) => ({ ...d.income[1], id: 'gig' + pid, personId: pid, amount: F(yr / 12) });
  const solo = (yr, roth, plan = 'solo_k401') => ({ ...d, income: [gig('casey', yr)], accounts: [...d.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: roth }]) } : a)), acct('se', plan, plan === 'sep_ira' ? 'ira' : 'employerRetirement')] });
  // $30,000 of 1099 pay ($27,880.57 after half the self-employment tax) and $7,500 already in the Roth: the Roth keeps
  // $7,500 of that pay, so the Solo 401(k) can take $20,380.57, not $27,880.57 (which would make the Roth an excess).
  const b = maxIt(solo(30000, 7500), R);
  assert.deepEqual([b.totals.lump, row(b, 'roth:2026').over || 0], [20380.57, 0]);
  // With the Roth empty, the Roth comes first (answer 63): its $7,500, then the Solo the other $20,380.57, and the Plan
  // says why the Solo counts less than it alone could take.
  const b3 = maxIt(solo(30000, 0), R);
  assert.deepEqual([b3.totals.lump, row(b3, 'roth:2026').counted, row(b3, 'roth:2026').lump, row(b3, 'se:2026').counted], [27880.57, undefined, 7500, { fill: 20380.57, why: 'seIra', words: 'the IRA comes before the Solo 401(k) or SEP, so IRA money keeps the self-employment pay it needs' }]);
  // MFJ: Sam has $36,000 of 1099 pay ($33,456.68 to count) and a Solo 401(k), Casey $4,000 of W-2 pay. The IRAs come
  // first (answer 63): Casey's $7,500 on the couple's pay and Sam's own $7,500, so the Solo takes the $22,456.68 left
  // ($4,000 + $33,456.68 - $15,000).
  const c = couple(d);
  const m2 = { ...c, income: [{ ...c.income[0], amount: F(4000 / 12) }, gig('sam', 36000)], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('se', 'solo_k401', 'employerRetirement', { owner: F('partner') }), acct('st', 'traditional_ira', 'ira', { owner: F('partner') })] };
  const mm2 = maxIt(m2, R);
  assert.deepEqual(mm2.pools.map((p) => [p.key, p.fill]), [['ira:casey', 7500], ['employer:sam', 6691.34], ['deferral:sam', 15765.34], ['ira:sam', 7500]]);
  // MFJ: Casey has $15,000 of 1099 pay ($13,940.28 to count) and a SEP, Sam none: the couple's IRAs come first and take
  // all of it together ($7,500 and $6,440.28), and the SEP nothing (it took $2,788.06 before answer 63).
  const m1 = { ...c, income: [gig('casey', 15000)], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('se', 'sep_ira', 'ira'), acct('st', 'traditional_ira', 'ira', { owner: F('partner') })] };
  const mm1 = maxIt(m1, R);
  assert.equal(Math.round(mm1.pools.filter((p) => p.key.startsWith('ira')).reduce((x, p) => x + p.fill, 0) * 100) / 100, 13940.28);
  assert.equal(mm1.pools.find((p) => p.key === 'employer:casey').fill, 0);
});

test('round 11 (S-222): a married couple is one unit for self-employment pay; a spousal IRA alone meets the other\'s Solo money; a past IRA year still keeps its pay', () => {
  const d = demo(), c = couple(d);
  const gig = (pid, yr) => ({ ...d.income[1], id: 'gig' + pid, personId: pid, amount: F(yr / 12) });
  const base = (inc, extra, roth = { contributions: F([{ year: 2026, amount: 0 }]) }) => ({ ...c, income: inc, accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, ...roth } : a)), ...extra] });
  const soloSam = acct('se', 'solo_k401', 'employerRetirement', { owner: F('partner') });
  // Sam has $30,000 of 1099 pay and a Solo 401(k); Casey has no pay and an empty Roth (Sam has no IRA). Casey's Roth
  // comes first on the couple's pay (answer 63), $7,500, and the Solo takes the other $20,380.57 of Sam's $27,880.57:
  // $27,880.57 in all (not $35,380.57).
  const ra = maxIt(base([gig('sam', 30000)], [soloSam]), R);
  assert.deepEqual([ra.totals.lump, ra.pools.find((p) => p.key === 'ira:casey').fill], [27880.57, 7500]);
  // A SEP on $9,000 instead: Casey's Roth $7,500 first, the SEP the $864.17 left of the $8,364.17.
  const sep = maxIt(base([gig('sam', 9000)], [acct('se', 'sep_ira', 'ira', { owner: F('partner') })]), R);
  assert.deepEqual(sep.pools.map((p) => [p.key, p.fill]), [['ira:casey', 7500], ['employer:sam', 864.17]]);
  // Casey already has $7,500 in a Roth on the couple's pay: Sam's Solo takes $20,380.57, so Casey's Roth is never over.
  const two = maxIt(base([gig('sam', 30000)], [soloSam], { contributions: F([{ year: 2026, amount: 7500 }]) }), R);
  assert.deepEqual([two.totals.lump, two.rows.filter((r) => r.over || r.overSoon).length], [20380.57, 0]);
  // Single, after the April 15 IRA deadline (as of June 1, 2027): the 2026 Roth has $7,500 in and the 2026 Solo
  // deferral $24,500. The 2026 employer part, still open to October 15, takes only the $1,456.68 of pay the Roth leaves.
  const s3 = { ...d, meta: { ...d.meta, asOf: '2027-06-01' }, income: [{ ...gig('casey', 36000), start: '2026-01-01', end: '2026-12-31' }], accounts: [...d.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 7500 }]) } : a)), acct('se', 'solo_k401', 'employerRetirement', { contributions: F([{ year: 2026, amount: 24500 }]) })] };
  assert.equal(maxIt(s3, R).pools.find((p) => p.key === 'employer:casey' && p.year === 2026).fill, 1456.68);
});

test('round 12 (S-223): a spouse who still earns more after the Solo money is held to their own pay; who earns less is told by pay after Solo or SEP money', () => {
  const d = demo(), c = couple(d);
  const gig = (pid, yr) => ({ ...d.income[1], id: 'gig' + pid, personId: pid, amount: F(yr / 12) });
  const sal = (yr) => ({ ...c.income[0], amount: F(yr / 12) });
  const rest = c.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth');
  const solo = (extra = {}) => acct('se', 'solo_k401', 'employerRetirement', { owner: F('partner'), ...extra });
  // Casey earns $2,000 (no IRA); Sam has $30,000 of 1099 pay ($27,880.57), an empty Solo and $7,500 in a Roth. Sam
  // still earns more than Casey after the Solo, so Sam's Roth must rest on Sam's own pay: the Solo takes $20,380.57.
  const f3 = maxIt({ ...c, income: [sal(2000), gig('sam', 30000)], accounts: [...rest, solo(), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 7500 }]) })] }, R);
  assert.deepEqual([f3.totals.lump, f3.rows.filter((r) => r.over || r.overSoon).length], [20380.57, 0]);
  // $35,000 of 1099 pay, a Roth at $625 a month, Casey at $3,000: the Solo takes $25,027.33.
  const g9 = maxIt({ ...c, income: [sal(3000), gig('sam', 35000)], accounts: [...rest, solo(), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), monthlyContribution: F(625) })] }, R);
  assert.equal(g9.totals.lump, 25027.33);
  // Sam already has $25,000 in the Solo, leaving $2,880.57 of pay, less than Casey's $10,000: Sam earns less, so Sam's
  // $7,500 Roth rests on the couple's pay and is not over (the Solo's own $500 past the deferral limit is).
  const m3 = maxIt({ ...c, income: [sal(10000), gig('sam', 30000)], accounts: [...rest, solo({ contributions: F([{ year: 2026, amount: 25000 }]) }), acct('sr', 'roth_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 7500 }]) })] }, R);
  assert.deepEqual([row(m3, 'sr:2026').over || 0, row(m3, 'sr:2026').cap.joint, row(m3, 'se:2026').over], [0, true, 500]);
});

test('round 13 (S-224): the Plan\'s Solo money never makes the spouse with less pay the one with more', () => {
  const d = demo(), c = couple(d);
  const gig = (pid, yr) => ({ ...d.income[1], id: 'gig' + pid, personId: pid, amount: F(yr / 12) });
  const solo = acct('se', 'solo_k401', 'employerRetirement', { owner: F('partner') });
  const casey = (roth) => c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, ...roth } : a));
  // Casey earns $6,000 and has a Roth at $625 a month ($7,500, more than her own pay: legal while she earns less). Sam
  // has $40,000 of 1099 pay ($37,174.09) and an empty Solo. The Solo stops where Sam still earns more than Casey, by the
  // $100 gap (S-225): $31,074.09, leaving Sam $6,100 (filled to $31,934.82 it would leave him $5,239.27 and her Roth
  // $1,500 over).
  const m = maxIt({ ...c, income: [{ ...c.income[0], amount: F(500) }, gig('sam', 40000)], accounts: [...casey({ monthlyContribution: F(625) }), solo] }, R);
  assert.equal(m.totals.lump, 31074.09);
  // When her own pay covers her Roth ($10,000), the Solo takes all it may.
  const ctl = maxIt({ ...c, income: [{ ...c.income[0], amount: F(10000 / 12) }, gig('sam', 40000)], accounts: [...casey({ contributions: F([{ year: 2026, amount: 7500 }]) }), solo] }, R);
  assert.equal(ctl.totals.lump, 31934.82);
});

// ------------------------------------------------------------------ answers 40 to 64 (S-227)
test('answer 40: the deadline words are the Account Rules tab\'s, word for word, with their IRS or New York sources, marked verify', () => {
  const words = { k401: 'Deferrals by Dec 31 (payroll).', roth_k401: 'Deferrals by Dec 31.', k403b: 'Dec 31.', k457b: 'Dec 31.', tsp: 'Dec 31.', simple_ira: 'Dec 31.', traditional_ira: 'Tax filing deadline (April 15) for prior year.', roth_ira: 'April 15 for prior year.', spousal_ira: 'April 15 for prior year.', hsa: 'April 15 for prior year.', sep_ira: 'Tax filing deadline including extensions.', solo_k401: 'Plan set up by Dec 31 (or by tax deadline for first year under SECURE 2.0); employee deferral election by Dec 31; employer part by tax deadline.', k529: 'NY deduction by Dec 31.' };
  for (const [type, w] of Object.entries(words)) assert.equal(deadlineOf(R, type, 2026).words, w, type);
  assert.equal(deadlineOf(R, 'solo_k401', 2026).elect.words, words.solo_k401);
  for (const id of R.ids(2026).filter((x) => x.startsWith('DEADLINE_'))) {
    const m = R.meta(id, 2026);
    assert.equal(m.verified, 'verify', id);
    assert.match(m.source, /IRS|IRC|NY/, id + ' keeps its IRS or New York source');
    for (const t of m.types) assert.ok(m.wording[t], id + ' has the words for ' + t);
  }
  // The calendar's deadline chip reads the same words.
  const chip = maxItDeadlines(demo(), R, '2026-12-01', '2026-12-31').find((e) => e.accountId === 'k401');
  assert.match(chip.note, /\. Deferrals by Dec 31 \(payroll\)\.$/);
});

test('answer 47: an HSA goes in from take-home unless it is set through payroll; the cash flow, the run, the tax and the panel follow the switch', () => {
  const d = demo();
  const hsa = (extra) => ({ ...d, accounts: [...d.accounts, { id: 'hsa', type: 'hsa', family: 'hsaFsa', name: F('HSA'), balance: F(1000), coverageLevel: F('self'), monthlyContribution: F(100), ...extra }] });
  const off = hsa({}), on = hsa({ throughPayroll: F(true) });
  assert.ok(validate(on).ok);
  // Off (the default): $100 a month from take-home, a transfer out of checking, deducted on the return ($1,200).
  const cOff = cashflow(off, R, '2026-10'), cOn = cashflow(on, R, '2026-10');
  assert.deepEqual([cOff.saving.payroll.value, cOff.saving.afterTax.value, cOff.income.takeHome.value], [500, 400, 4711]);
  const tOff = yearTax(off, R, 2026), tOn = yearTax(on, R, 2026);
  assert.deepEqual([tOff.inputs.wages, tOff.inputs.ficaWages, tOff.inputs.hsaDeduction], [66000, 72000, 1200]);
  const sOff = cashsim(off, R, { months: 2 }), sOn = cashsim(on, R, { months: 2 });
  assert.deepEqual([sOff.model.transfers.filter((x) => x.id === 'save:hsa').map((x) => x.cents), sOff.model.incomes.find((i) => i.id === 'salary').cents], [[10000], 421100]);
  // On: it comes out of the paycheck before tax, off wages and Social Security and Medicare wages alike.
  assert.deepEqual([cOn.saving.payroll.value, cOn.saving.afterTax.value, cOn.income.takeHome.value], [600, 300, 4611]);
  assert.deepEqual([tOn.inputs.wages, tOn.inputs.ficaWages, tOn.inputs.hsaDeduction], [64800, 70800, 0]);
  assert.deepEqual([sOn.model.transfers.some((x) => x.id === 'save:hsa'), sOn.model.incomes.find((i) => i.id === 'salary').cents], [false, 411100]);
  // The surplus is the same either way; the panel's words say where the $100 comes from.
  assert.equal(cOff.surplus.value, cOn.surplus.value);
  const words = (s) => row(maxIt(s, R), 'hsa:2026').still.parts[0].words;
  assert.deepEqual([words(off), words(on)], ['$100 a month for 2 months more of 2026', '$100 a month from pay for 2 months more of 2026']);
});

test('answers 49 and 53: a Solo 401(k) after December 31 counts the employer part and says why; more than a paycheck holds reads as the contribution to raise to', () => {
  const d = demo();
  // 49: on January 10, 2027 the 2026 employee deferral had to be elected by December 31: the room is the employer part.
  const solo = maxIt({ ...d, accounts: [...d.accounts, acct('solo', 'solo_k401', 'employerRetirement')] }, R, { asOf: '2027-01-10' });
  const sr = row(solo, 'solo:2026');
  assert.equal(sr.employerOnly, 'Only the employer part counts here: the employee part had to be chosen by December 31, 2026.');
  assert.equal(sr.room, sr.cap.employer);
  // 53: the demo 401(k) needs $9,250 more on each of 2 paychecks; about $4,211 lands from each and $500 comes out now, so
  // the most a $6,000 paycheck can hold is $4,711: raise the contribution to 78% (78.5%, rounded down); the other
  // $18,500 - 2 x $4,211 = $10,078 cannot go in through payroll. The cap stays.
  const sim = maxItSim(d, R), mx = maxIt(d, R, { sim }), k = row(mx, 'k401:2026');
  assert.deepEqual([k.paychecks.tooBig, k.paychecks.holds, k.paychecks.gross, k.paychecks.raiseTo, k.paychecks.gap], [true, 4711, 6000, 0.78, 10078]);
  assert.ok(mx.totals.short.includes('k401:2026'), 'the Plan still counts only what the paychecks hold');
  const ex = explainMetric('maxit:k401:2026:raise', { spine: d, rules: R, maxit: mx });
  assert.equal(ex.value, 0.78);
  assert.equal(ex.recomputed, 0.78);
});

test('answer 50: a SIMPLE IRA from pay comes off wages for income tax, not for Social Security and Medicare, and out of the paycheck', () => {
  const d = demo();
  const base = { ...d, accounts: d.accounts.filter((a) => a.id !== 'k401') };
  const s = { ...base, accounts: [...base.accounts, acct('simple', 'simple_ira', 'ira', { monthlyContribution: F(500) })] };
  const t0 = yearTax(base, R, 2026), t1 = yearTax(s, R, 2026);
  assert.deepEqual([t1.inputs.wages, t1.inputs.ficaWages], [t0.inputs.wages - 6000, t0.inputs.ficaWages]);
  assert.equal(earnedIncome(s, R, 2026).value, Math.round((earnedIncome(base, R, 2026).value - 6000) * 100) / 100);
  assert.equal(cashflow(s, R, '2026-10').saving.payroll.value, 500, 'out of the paycheck, not from take-home');
});

test('answer 58: the spouse who earns more is shown the safe amount, labeled as such', () => {
  // Casey earns $4,800, Sam $3,000 with $5,000 already in his IRA: Casey's own cap is $4,800, but only $2,800 fits without
  // pushing Sam's IRA over the couple's $7,800.
  const d = demo();
  let c = couple(d);
  c = { ...c, income: [{ ...c.income[0], amount: F(400) }, { ...c.income[1], amount: F(0) }, w2('samjob', 'sam', 250)], accounts: [...c.accounts.filter((a) => a.id !== 'k401').map((a) => (a.id === 'roth' ? { ...a, monthlyContribution: undefined, contributions: F([{ year: 2026, amount: 0 }]) } : a)), acct('st', 'traditional_ira', 'ira', { owner: F('partner'), contributions: F([{ year: 2026, amount: 5000 }]) })] };
  const mx = maxIt(c, R);
  assert.equal(row(mx, 'roth:2026').room, 2800);
  assert.match(row(mx, 'roth:2026').safe, /^Safe amount, could be higher: this is what fits without pushing Sam's IRA over\. The tax rule lets the spouse who earns more put in up to their own pay \(\$4,800\)/);
  assert.equal(row(mx, 'st:2026').safe, undefined, 'the spouse who earns less is not');
});

test('answer 59: the FOO retirement rung asks no more than the paychecks left from its start can hold', () => {
  // Paid every two weeks; each paycheck lands $1,943.53. From about December 22 only December 25 is left: the rung asks
  // $1,943.53 (it asked $18,500 in one month before). From about November 22, three paychecks over two months: $2,915.30.
  const d = demo();
  const noCards = { ...d, debts: d.debts.filter((x) => x.type !== 'credit_card') };
  const bi = { ...noCards, income: noCards.income.map((x) => (x.id === 'salary' ? { ...x, cadence: 'biweekly', start: '2026-01-09', amount: F(2769.23), withholding: { federal: F(253.85), state: F(129.23) } } : x)) };
  const hysa = (s, bal) => ({ ...s, accounts: s.accounts.map((a) => (a.id === 'hysa' ? { ...a, balance: F(bal) } : a)) });
  const rung = (s) => fooLadder(s, R, summarize(s, R, { flags: false }), { sim: maxItSim(s, R) }).rungs.find((x) => x.id === 'maxRetirement');
  const dec = rung(hysa(bi, 17785));
  assert.equal(dec.need, 1943.53);
  assert.equal(dec.why, 'Work 401(k) 2026: $1,944 a month to December 31, 2026, on top of the $1,154 already set to go in (only what its paychecks from December 22, 2026 hold).');
  assert.equal(rung(hysa(bi, 18600)).need, 2915.3);
});

test('answer 60: a 401(k) is paid through one job, the sponsoring one by default; another job\'s paychecks never fill it', () => {
  // Casey's salary ($6,000 a month) and a second job ($2,000 a month every two weeks). By default the 401(k) is paid
  // through the salary (it pays the most): only its 2 paychecks count. Paid through the second job: only its 5.
  const d = demo();
  const two = { ...d, income: [...d.income, { ...w2('job2', 'casey', 2000), label: 'Second job', cadence: 'biweekly', start: '2026-01-09', withholding: { federal: F(150), state: F(60) } }] };
  const pcOf = (s) => row(maxIt(s, R, { sim: maxItSim(s, R) }), 'k401:2026').paychecks;
  assert.deepEqual([pcOf(two).count, pcOf(two).streams], [2, ['Salary at Hudson Valley Health']]);
  assert.ok(row(maxIt(two, R), 'k401:2026').rough.includes('accounts.k401.paidThrough'), 'the default job is a guess until it is chosen');
  const chosen = putFact(two, 'accounts.k401.paidThrough', 'job2', 'known', T);
  assert.ok(validate(chosen).ok, JSON.stringify(validate(chosen).errors));
  assert.deepEqual([pcOf(chosen).count, pcOf(chosen).streams], [5, ['Second job']]);
  // The paycheck the 401(k) comes out of in the cash flow follows the choice.
  assert.deepEqual(Object.keys(payrollShares(chosen, cashflow(chosen, R, '2026-11'))).sort(), ['job2']);
  assert.deepEqual(Object.keys(payrollShares(two, cashflow(two, R, '2026-11'))).sort(), ['salary']);
  // A job that is not a W-2 line is refused.
  assert.equal(validate(putFact(two, 'accounts.k401.paidThrough', 'tutoring', 'known', T)).ok, false);
});

test('answer 64: a Roth and a pre-tax account with one limit: the Roth at 12% or below, pre-tax at 24% and up, both shown with the reason in between', () => {
  const d = demo();
  const pair = (monthly) => { const s = { ...d, income: [{ ...d.income[0], amount: F(monthly) }], accounts: [...d.accounts.filter((a) => a.id !== 'k401' && a.id !== 'roth'), acct('k', 'k401', 'employerRetirement'), acct('rk', 'roth_k401', 'employerRetirement')] }; return maxIt(s, R, { sim: maxItSim(s, R) }); };
  // $36,000 a year: 12%, the Roth 401(k).
  const lo = pair(3000);
  assert.deepEqual(lo.pools.map((p) => p.row.id), ['rk:2026']);
  assert.equal(row(lo, 'k:2026').pick.words, 'At a 12% federal rate (12% or below) the Plan picks the Roth: the tax on it now is low.');
  // $96,000 a year: 22%, either fits, both rows say so; the Plan counts the Roth (one limit, never both).
  const mid = pair(8000);
  assert.deepEqual([mid.pools.map((p) => p.row.id), row(mid, 'k:2026').pick.both, row(mid, 'rk:2026').pick.both], [['rk:2026'], true, true]);
  assert.match(row(mid, 'k:2026').pick.words, /^At a 22% federal rate either fits: a Roth if you expect a higher rate later, pre-tax for the 22% it saves now\./);
  // $180,000 a year: 24%, the pre-tax 401(k).
  const hi = pair(15000);
  assert.deepEqual([hi.pools.map((p) => p.row.id), hi.pools[0].fill], [['k:2026'], 24500]);
  assert.equal(row(hi, 'rk:2026').pick.words, 'At a 24% federal rate (24% and up) the Plan picks pre-tax: it saves tax at that rate now.');
  // The cutoffs are rules, not code.
  assert.deepEqual([R.get('ROTH_PICK_MAX_RATE', 2026), R.get('PRETAX_PICK_MIN_RATE', 2026)], [0.12, 0.24]);
});
