// Protection (S-275): policies are their own list; a premium counts once, as its own Needs line (through work, out of
// pay before take-home); the checks read the policies and name their method.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { summarize } from '../engine/summary.js';
import { addItem, putFact } from '../engine/edits.js';
import { validate } from '../engine/schema.js';
import { protectionChecks, protectionLine, premiumMonthly } from '../engine/protection.js';
import { applyAnswer } from '../engine/profile.js';

const R = loadRules(), T = '2026-10-22';
const demo = () => loadHousehold(readJson('fixtures/demo.json'));
const S = (s) => summarize(s, R, { flags: false });
const add = (s, type, f) => { const r = addItem(s, { collection: 'policies', type, label: type }, T); let x = r.spine; for (const [k, val] of Object.entries(f)) x = putFact(x, 'policies.' + r.id + '.' + k, val, 'known', T); return x; };

test('a premium is a Needs line once; a yearly one is a twelfth; a line for the same bill is not counted again', () => {
  const base = demo(), before = S(base).cashflow.expenses.total.value;
  const withLine = (() => { const r = addItem(base, { collection: 'expenses', label: "Renter's insurance" }, T); return putFact(r.spine, 'expenses.' + r.id + '.amount', 15, 'known', T); })();
  assert.equal(S(withLine).cashflow.expenses.total.value, before + 15);
  const s = add(withLine, 'renters', { premium: 180, premiumCadence: 'yearly' });
  assert.deepEqual(validate(s).errors, []);
  const cf = S(s).cashflow;
  assert.equal(cf.expenses.total.value, before + 15, 'the policy\'s $15 a month replaces the line, never both');
  assert.ok(cf.expenses.items.some((i) => i.fromProtection && i.amount === 15));
  assert.equal(premiumMonthly(s.policies[0]), 15);
});

test('through work: out of pay before take-home, not a Needs line', () => {
  const base = demo(), th = S(base).cashflow.income.takeHome.value, ex = S(base).cashflow.expenses.total.value;
  const s = add(base, 'ltd', { premium: 20, throughWork: true, benefitPct: 0.6, eliminationDays: 90 });
  const cf = S(s).cashflow;
  assert.equal(cf.income.takeHome.value, Math.round((th - 20) * 100) / 100);
  assert.equal(cf.expenses.total.value, ex);
});

test('the checks: life against the need, disability share, liability, gaps', () => {
  let s = applyAnswer(demo(), 'dependents', 'yes', { today: T, by: 'coach' });
  s = applyAnswer(s, 'home', 'rent', { today: T, by: 'coach' });
  s = add(s, 'group_life', { coverage: 100000, throughWork: true, endsWithJob: true });
  s = add(s, 'ltd', { throughWork: true, benefitPct: 0.6, eliminationDays: 90 });
  s = add(s, 'umbrella', { premium: 25, liabilityLimit: 1000000 });
  const sum = S(s), c = Object.fromEntries(protectionChecks(s, R, sum).map((x) => [x.id, x]));
  const gross = sum.cashflow.income.gross.value * 12, debts = sum.sheet.debts.value;
  assert.deepEqual(c.life.need, { low: Math.round((gross * 5 + debts) * 100) / 100, high: Math.round((gross * 10 + debts) * 100) / 100 });
  assert.equal(c.life.stage, 'yellow');
  assert.match(c.life.method, /5 to 10 years of your pay/);
  assert.ok(c.disability.share > 0 && /after 90 days/.test(c.disability.headline));
  assert.equal(c.liability.stage, 'green');
  assert.ok(c.gaps.gaps.some((g) => /rent/.test(g)) && c.gaps.gaps.some((g) => /through work/.test(g)) && c.gaps.gaps.some((g) => /car/.test(g)));
  assert.deepEqual(c.gaps.short, ['no renters policy', 'no auto policy', 'life insurance only through work']);
  assert.match(protectionLine(Object.values(c)), /^Protection: covered for life \$100,000, disability about \d+% of take-home; gaps: /);
  assert.ok(sum.emergency.backstop.disability.monthly > 0);
});

test('no one depends on the income: the life check is skipped, not a gap', () => {
  const s = applyAnswer(demo(), 'dependents', 'no', { today: T, by: 'coach' });
  const life = protectionChecks(s, R, S(s)).find((x) => x.id === 'life');
  assert.equal(life.stage, null); assert.match(life.headline, /Not needed now/);
});
