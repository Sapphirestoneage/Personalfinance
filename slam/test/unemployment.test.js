// Unemployment (owner's ask, 2026-10-26): between jobs, the benefit a week and a month, the weeks left and what is
// still to come, federal tax taken out or set aside, and what the cash does when it stops. Worked by hand below.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { putFact, addItem } from '../engine/edits.js';
import { setAt, fact } from '../engine/spine.js';
import { validate } from '../engine/schema.js';
import { unemploymentView, weeksLeft, betweenJobs, tenPercentOf } from '../engine/unemployment.js';

const R = loadRules();
const T = '2026-10-22';
const K = (x) => fact(x, { kind: 'known', asOf: T, source: 'test' });
// The demo (made up), laid off: no salary from Oct 1, a weekly benefit of $450 paid Mondays from Sep 7 to Dec 28.
function laidOff({ fed = 0 } = {}) {
  let s = applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: T }).spine, R);
  s = setAt(s, 'income', s.income.map((x) => (x.id === 'salary' ? { ...x, end: '2026-09-30' } : x)));
  s = setAt(s, 'household.situation', [{ id: 'now', from: null, value: K('between_jobs') }]);
  s = { ...s, income: [...s.income, { id: 'ui', type: 'unemployment', label: 'Unemployment benefit', personId: 'casey', amount: K(450), cadence: 'weekly', start: '2026-09-07', end: '2026-12-28', withholding: { federal: K(fed), state: K(0) } }] };
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  return s;
}

test('between jobs: the situation now or the Profile says so', () => {
  assert.equal(betweenJobs(laidOff()), true);
  const s = laidOff();
  assert.deepEqual(unemploymentView(s, summarize(s, R)).jobsStillPaying, [], 'the salary ended Sep 30');
  const still = setAt(laidOff(), 'income', laidOff().income.map((x) => (x.id === 'salary' ? { ...x, end: null } : x)));
  assert.deepEqual(unemploymentView(still, summarize(still, R)).jobsStillPaying.map((j) => j.id), ['salary'], 'a job with no end date is named');
  const demo = applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: T }).spine, R);
  assert.equal(betweenJobs(demo), false);
});

test('weeks left: the Mondays from Oct 26 through Dec 28 are 10', () => {
  // From Sep 7 the next payday on or after Oct 22 is Oct 26 (7 weeks on); Oct 26 to Dec 28 is 63 days, 9 more weeks.
  assert.equal(weeksLeft({ start: '2026-09-07', end: '2026-12-28' }, T), 10);
  assert.equal(weeksLeft({ start: '2026-09-07', end: null }, T), null, 'no end: missing, never 0');
  assert.equal(weeksLeft({ start: '2026-09-07', end: '2026-10-01' }, T), 0);
});

test('the benefit: $1,950 a month, $4,500 still to come; none taken out for tax, so tax is set aside', () => {
  const s = laidOff();
  const u = unemploymentView(s, summarize(s, R), { rules: R });
  const x = u.streams[0];
  assert.equal(x.weekly, 450);
  assert.equal(x.monthly, 1950, '450 x 52 / 12');
  assert.equal(x.weeksLeft, 10);
  assert.equal(x.stillToCome, 4500, '450 x 10');
  assert.equal(x.withholds, false);
  assert.equal(x.afterTaxMonthly, Math.round((1950 - x.setAsideMonthly) * 100) / 100);
  assert.equal(u.endsOn, '2026-12-28');
  // January 2027, with only the tutoring left: its own month, short or not, and the months cash covers when short.
  assert.equal(u.after.ym, '2027-01');
  assert.ok(u.after.left !== null);
  if (u.after.left < 0) assert.equal(u.after.months, Math.round(u.cash / -u.after.left * 100) / 100);
});

test('10% taken out: $45 a week (Form W-4V); a blank benefit reads missing', () => {
  assert.equal(tenPercentOf(450), 45);
  assert.equal(tenPercentOf(null), null);
  const s = laidOff({ fed: 45 });
  assert.equal(unemploymentView(s, summarize(s, R)).streams[0].withholds, true);
  const blank = putFact(laidOff(), 'income.ui.amount', null, 'missing', T);
  const x = unemploymentView(blank, summarize(blank, R)).streams[0];
  assert.deepEqual([x.weekly, x.stillToCome], [null, null]);
});

test('My numbers shows the Unemployment card on Income and on Your situation', () => {
  const src = readFileSync(new URL('../ui/ledger.js', import.meta.url), 'utf8');
  assert.match(src, /if \(sec\.slug === 'income'\) return unemploymentCard\(\);/);
  assert.match(src, /it\.key === 'household\.situation' \? unemploymentCard\(\) : null/);
  assert.match(src, /'Add the weekly benefit'/);
  assert.match(src, /removeItem\(sp, 'income', x\.id\)[^\n]*'Delete this benefit'/, 'each benefit can be deleted, undoably');
  void addItem;
});

test('a benefit whose last payment was last week shows as ended, and the month now is the month after', () => {
  const s = setAt(laidOff(), 'income', laidOff().income.map((x) => (x.id === 'ui' ? { ...x, end: '2026-10-19' } : x)));
  const u = unemploymentView(s, summarize(s, R), { rules: R });
  const x = u.streams[0];
  assert.deepEqual([x.ended, x.weeksLeft, x.stillToCome], [true, 0, 0], 'ended Oct 19, before the Oct 22 numbers');
  assert.equal(u.after.now, true);
  assert.equal(u.after.ym, '2026-10');
  // Ended over a year ago: not shown.
  const old = setAt(laidOff(), 'income', laidOff().income.map((x) => (x.id === 'ui' ? { ...x, end: '2025-09-01' } : x)));
  assert.equal(unemploymentView(old, summarize(old, R), { rules: R }).streams.length, 0);
});
