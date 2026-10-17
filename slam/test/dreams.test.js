// The dream life (S-097): short-term dream (this year, or the next step) and
// long-term dream (everything after) are two answers on every category and
// line (S-075). They moved out of the budget into Eras: the budget is
// estimate vs actual (and the plan), and no budget number reads a dream.
//
// Every expected number is worked out by hand in the comments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newHousehold, newIncome, newEra } from '../src/store/schema.js';
import { makeValue } from '../src/store/value.js';
import { findCategory, findLine } from '../src/store/edits.js';
import { buildSummary } from '../src/calc/summary.js';
import { takeHomeFor, dreamReading } from '../src/calc/dream-life.js';
import { validateHousehold } from '../src/store/validate.js';
import { migrate } from '../src/store/migrate.js';
import { stripMeta } from '../src/store/records.js';
import { loadRefs, loadHousehold, near } from './helpers.js';

const refs = loadRefs();
const money = (a, e, label) => assert.ok(near(a, e, 2), label + ': got ' + a + ', expected ' + e);

function plan() {
  const d = newHousehold('Dreams');
  const inc = newIncome({ id: 'job', type: 'w2', payFrequency: 'monthly' });
  inc.takeHome = makeValue(3000, { cadence: 'paycheck' });
  d.income.push(inc);
  d.noDebts = true;
  findCategory(d, 'housing').dream = makeValue(1200);
  findCategory(d, 'housing').dreamLong = makeValue(2000);
  findLine(d, 'groceries').line.dreamLong = makeValue(500);
  findLine(d, 'eating-out').line.dreamLong = makeValue(300);
  return d;
}

test('the dream entry keeps both columns as typed, with their running totals', () => {
  const dl = buildSummary(plan(), refs).dreamLife;
  const food = dl.entry.rows.find((r) => r.id === 'food');
  // food long term from its lines: 500 + 300 = 800; no short-term food dream given
  assert.deepEqual([food.dreamLong, food.dreamLongFrom, food.dream], [800, 'lines', null]);
  // long term: housing 2,000 + food 800 + debts none 0 = 2,800; left 3,000 - 2,800 = 200
  assert.deepEqual([dl.entry.dreamLong.outflow, dl.entry.dreamLong.left], [2800, 200]);
  // short term: housing 1,200 + debts 0 = 1,200; left 3,000 - 1,200 = 1,800
  assert.deepEqual([dl.entry.dream.outflow, dl.entry.dream.left], [1200, 1800]);
});

test('no long-term dreams: the entry total is empty, not zero', () => {
  const d = plan();
  findCategory(d, 'housing').dreamLong = makeValue();
  findLine(d, 'groceries').line.dreamLong = makeValue();
  findLine(d, 'eating-out').line.dreamLong = makeValue();
  // Debts none (0) is a computed answer, so only it would count: the total is 0 from debts, never a dream.
  const dl = buildSummary(d, refs).dreamLife;
  assert.equal(dl.entry.rows.find((r) => r.id === 'housing').dreamLong, null);
  assert.equal(dl.entry.rows.find((r) => r.id === 'food').dreamLong, null);
});

test('compat: files before long-term dreams load with them blank, short-term dreams unchanged', () => {
  const raw = JSON.parse(JSON.stringify(plan()));
  for (const c of raw.categories) { delete c.dreamLong; for (const l of c.lines) delete l.dreamLong; }
  const m = migrate(raw);
  assert.equal(findCategory(m, 'housing').dreamLong.amount, null);
  assert.equal(findLine(m, 'groceries').line.dreamLong.status, null);
  assert.equal(findCategory(m, 'housing').dream.amount, 1200);
  assert.deepEqual(validateHousehold(m), []);
});

// MAYA, by hand (maya.json; take-home 3,900; every category has an actual, so today = actual).
// Short-term dream by category (from lines): housing 1,600 + 80 + 40 = 1,720; food 280 + 150 + 0 = 430;
//   transport 132; debt 300 (the minimum); health 40 + 120 = 160; bills 30; fun 80 (shopping; the concert
//   has no dream and no estimate); annual 1,200 a year = 100; fees 0; giving 100; savings 400.
// Long-term dream, added for this test: Housing 2,300 (one number for the category), Eating out 250,
//   Shopping 200. A line or category with no long-term answer follows its short-term dream:
//   housing 2,300; food 280 + 250 + 0 = 530; fun 200; the rest as short term.
// Today (actual): housing 1,750; food 840; transport 132; debt 300; health 145; bills 68; fun 370;
//   annual 120; fees 39; giving 50; savings 150 (shown, never added in).
// Spending (no savings):
//   today 1,750 + 840 + 132 + 300 + 145 + 68 + 370 + 120 + 39 + 50 = 3,814
//   short 1,720 + 430 + 132 + 300 + 160 + 30 + 80 + 100 + 0 + 100 = 3,052 -> 762 less than today
//   long  2,300 + 530 + 132 + 300 + 160 + 30 + 200 + 100 + 0 + 100 = 3,852 -> 38 more than today
// Long minus today by category: housing +550, food -310, transport 0, debt 0, health +15, bills -38,
//   fun -170, annual -20, fees -39, giving +50 (sum +38). Biggest increases: Housing, then Giving.
// Short minus today: housing -30, food -410, health +15, bills -38, fun -290, annual -20, fees -39,
//   giving +50 (sum -762). Biggest decreases: Food, then Personal and fun.
// % of take-home: housing today 1,750 / 3,900 = 0.448718; short 1,720 / 3,900 = 0.441026; long 2,300 / 3,900 = 0.589744.
// THE PAY THIS DREAM NEEDS (worked out for the long-term dream): today's savings share
//   150 / 3,900 = 0.038462; 1 - 0.038462 = 3,750 / 3,900.
//   3,852 x 3,900 / 3,750 = 3,852 x 1.04 = 4,006.08, which is 106.08 more than the 3,900 she brings home.
function mayaDreams() {
  const d = loadHousehold('maya');
  findCategory(d, 'housing').dreamLong = makeValue(2300);
  findLine(d, 'eating-out').line.dreamLong = makeValue(250);
  findLine(d, 'shopping').line.dreamLong = makeValue(200);
  return d;
}

test('Maya: today vs short-term vs long-term dream, by hand', () => {
  const dl = buildSummary(mayaDreams(), refs).dreamLife;
  const row = (id) => dl.rows.find((r) => r.id === id);
  const want = {
    housing: [1750, 1720, 2300], food: [840, 430, 530], transport: [132, 132, 132], debt: [300, 300, 300],
    health: [145, 160, 160], bills: [68, 30, 30], fun: [370, 80, 200], annual: [120, 100, 100],
    fees: [39, 0, 0], giving: [50, 100, 100], savings: [150, 400, 400]
  };
  for (const [id, [t, s, l]] of Object.entries(want)) {
    money(row(id).today, t, id + ' today');
    money(row(id).short, s, id + ' short');
    money(row(id).long, l, id + ' long');
  }
  assert.equal(row('housing').todayFrom, 'actual');
  assert.equal(row('food').longFrom, 'dream');
  assert.equal(row('bills').longFrom, 'short');
  money(row('housing').longDiff, 550, 'housing long minus today');
  money(row('food').shortDiff, -410, 'food short minus today');
  assert.ok(near(row('housing').todayShare, 0.448718, 6));
  assert.ok(near(row('housing').shortShare, 0.441026, 6));
  assert.ok(near(row('housing').longShare, 0.589744, 6));
  money(dl.today, 3814, 'today');
  money(dl.shortTotal, 3052, 'short');
  money(dl.longTotal, 3852, 'long');
  money(dl.longDiff, 38, 'long vs today');
  money(dl.shortDiff, -762, 'short vs today');
  assert.equal(dl.readings.long, 'Your long-term dream costs $38 a month more than today, mostly Housing and Giving.');
  assert.equal(dl.readings.short, 'Your short-term dream costs $762 a month less than today, mostly Food and Personal and fun.');
  assert.ok(near(dl.savingsShare, 0.038462, 6));
  money(dl.pay.needed, 4006.08, 'the pay the long-term dream needs');
  money(dl.pay.short, 106.08, 'short of what she brings home now');
});

test('the pay a dream needs: spending / (1 - savings share), and blanks stay blank', () => {
  // 3,000 a month spent, saving 25% of take-home: 3,000 / 0.75 = 4,000
  assert.equal(takeHomeFor(3000, 0.25), 4000);
  assert.equal(takeHomeFor(3000, 0), 3000);
  assert.equal(takeHomeFor(null, 0.1), null);
  assert.equal(takeHomeFor(3000, null), null);
  assert.equal(takeHomeFor(3000, 1), null, 'saving everything leaves nothing to spend');
  assert.equal(dreamReading('long-term dream', 1000, 1000, []), 'Your long-term dream costs about the same as today.');
});

test('Maya: an era can start its spending from today, a dream, or the template (the default)', () => {
  const d = mayaDreams();
  // A 12-month custom era (template: income 1 x take-home, spending 1 x today), blank take-home and spending.
  d.eras.list.push(newEra({ id: 'era-a', template: 'custom', name: 'Next chapter', months: 12 }));
  const era = () => buildSummary(d, refs).eras.eras[0];
  // Template (default): spending 3,814 x 1 = 3,814 (a guess); income 3,900 x 1 = 3,900; net +86.
  assert.deepEqual([era().spendFrom, era().spend, era().spendGuess, era().net], ['template', 3814, true, 86]);
  // Long-term dream: 3,852; net 3,900 - 3,852 = +48; whole era 48 x 12 = 576.
  d.eras.list[0].spendFrom = 'dreamLong';
  assert.deepEqual([era().spend, era().spendGuess, era().net, era().total], [3852, false, 48, 576]);
  // Short-term dream: 3,052; net 3,900 - 3,052 = +848.
  d.eras.list[0].spendFrom = 'dream';
  assert.deepEqual([era().spend, era().net], [3052, 848]);
  // Today's budget: 3,814, not a guess.
  d.eras.list[0].spendFrom = 'today';
  assert.deepEqual([era().spend, era().spendGuess], [3814, false]);
  // Spending typed for the era always wins.
  d.eras.list[0].spending = makeValue(2000);
  assert.equal(era().spend, 2000);
  assert.deepEqual(validateHousehold(d), []);
  d.eras.list[0].spendFrom = 'someday';
  assert.ok(validateHousehold(d).some((e) => e.includes('spendFrom')));
});

test('no budget number reads dream or dreamLong', () => {
  // Change every dream in Maya's file wildly: every budget number stays the same.
  const a = loadHousehold('maya');
  const b = loadHousehold('maya');
  for (const c of b.categories) {
    c.dream = makeValue(99999); c.dreamLong = makeValue(77777);
    for (const l of c.lines) { l.dream = makeValue(55555); l.dreamLong = makeValue(33333); }
  }
  const sa = buildSummary(a, refs);
  const sb = buildSummary(b, refs);
  const budget = (s) => { const { dreamLife, eras, ...rest } = s; return JSON.parse(JSON.stringify(rest)); };
  assert.deepEqual(budget(sb), budget(sa));
  assert.notDeepEqual(sb.dreamLife.longTotal, sa.dreamLife.longTotal);
  // And no calc file but the dream life and Eras (and Next stage, whose "dream" lens key is its own) reads a
  // dream column: no .dream, .dreamLong, 'dream', or 'dreamLong' anywhere else in src/calc.
  const dir = new URL('../src/calc/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (['dream-life.js', 'eras.js', 'next-stage.js'].includes(f)) continue;
    const code = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/(\.|['"])dream(Long)?\b(?!-)/.test(code), f + ' reads a dream column');
  }
});

test('old files load unchanged: dreams stay stored, show in Eras, and the budget has no dream column', () => {
  for (const name of ['maya', 'luis', 'tasha', 'sam', 'jordan', 'riley']) {
    const raw = JSON.parse(readFileSync(new URL('./households/' + name + '.json', import.meta.url), 'utf8'));
    const d = loadHousehold(name);
    // The stored dream answers are kept exactly as they were.
    for (const c of raw.categories) {
      const m = d.categories.find((x) => x.id === c.id);
      if (c.dream) assert.equal(m.dream.amount, c.dream.amount === undefined ? c.dream : c.dream.amount, name + ' ' + c.id);
    }
    assert.deepEqual(stripMeta(migrate(JSON.parse(JSON.stringify(d)))), stripMeta(d), name + ' loads the same again');
    const s = buildSummary(d, refs);
    assert.ok(s.dreamLife, name + ' has a dream life');
    assert.ok(s.rows.every((r) => !('dream' in r)), name + ' budget rows');
  }
  // Maya's short-term dreams are in Eras: 3,052 of spending.
  money(buildSummary(loadHousehold('maya'), refs).dreamLife.shortTotal, 3052, 'maya short');
});
