// Onboarding (2026-10-28, engine/onboard.js): the Profile step in one call (people, ages, state, home, work, filing,
// the Profile's own answers), a paycheck typed as take-home with the gross solved to the cent (or before tax with the
// withholding estimated), the finish numbers from the one summary, the rough and not-now lists, done or not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson, loadRules } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { summarize } from '../engine/summary.js';
import { cashflow } from '../engine/cashflow.js';
import { valueOf, getAt } from '../engine/spine.js';
import { addToGroup } from '../engine/count.js';
import { setEstimate } from '../engine/needs.js';
import { answersOf } from '../engine/profile.js';
import * as O from '../engine/onboard.js';
import { setIncomeFirstPass } from '../engine/paycheck.js';

const R = loadRules();
const T = '2026-10-28';
const blank = (f = 'maya') => applyDefaults(readHousehold(readJson('test/clients/' + f + '-start.json'), { today: T }).spine, R);

test('the Profile step: defaults where one makes sense, then the answers in one call, and the Profile agrees', () => {
  let s = blank();
  const p = O.profileOf(s, T);
  assert.deepEqual([p.couple, p.state, p.home, p.work, p.filing], [false, 'NY', 'rent', 'w2', 'single']);
  assert.deepEqual(p.answered, { couple: false, state: false, home: false, work: false, filing: true });
  s = O.applyProfile(s, { ...p, names: ['Maya', ''], ages: [27, null] }, T);
  assert.equal(s.household.people[0].name, 'Maya');
  assert.deepEqual([valueOf(s.household.people[0].birthDate), s.household.people[0].birthDate.kind], ['1999-07-01', 'rough']);
  assert.deepEqual([valueOf(s.household.state), valueOf(s.household.filingStatus), valueOf(s.household.situation[0].value)], ['NY', 'single', 'employed']);
  const a = answersOf(s);
  assert.deepEqual([a.firstName, a.birthYear, a.state, a.home, a.work], ['Maya', 1999, 'NY', 'rent', 'w2']);
  assert.ok(s.lifeChanges.length >= 5, 'each Profile answer is a life change');
  // The same again changes nothing at all.
  assert.equal(O.applyProfile(s, O.profileOf(s, T), T), s);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
});

test('a couple adds the second person and suggests filing jointly; single again drops them; work sets the situation', () => {
  let s = blank('jordan-sam');
  // A tap saves one answer at a time: the couple first.
  s = O.applyProfile(s, { couple: true }, T);
  s = O.applyProfile(s, { names: ['Jordan', 'Sam'], ages: [31, 29], state: 'IL' }, T);
  assert.deepEqual(s.household.people.map((x) => x.name), ['Jordan', 'Sam']);
  assert.equal(valueOf(s.household.people[1].birthDate), '1997-07-01');
  assert.equal(O.profileOf(s, T).filing, 'mfj', 'suggested for a couple, not yet saved');
  assert.equal(valueOf(s.household.filingStatus), null, 'a tap saves only what it answers');
  // Next saves the suggested answers too.
  s = O.applyProfile(s, O.profileOf(s, T), T);
  assert.deepEqual([valueOf(s.household.filingStatus), valueOf(s.household.state), answersOf(s).home], ['mfj', 'IL', 'rent']);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  s = O.applyProfile(s, { work: 'between' }, T);
  assert.equal(valueOf(s.household.situation[0].value), 'between_jobs');
  assert.equal(answersOf(s).work, 'between');
  s = O.applyProfile(s, { couple: false }, T);
  assert.equal(s.household.people.length, 1);
  assert.ok(validate(s).ok);
});

test('the finish numbers are the summary\'s own; rough and not-now items group by section; done is a mark', () => {
  let s = blank();
  s = O.applyProfile(s, { ...O.profileOf(s, T), names: ['Maya', ''], ages: [27, null] }, T);
  const r = addToGroup(s, 'income', 'w2', T);
  s = setIncomeFirstPass(r.spine, R, r.id, { amount: 2150, basis: 'takeHome' }, T);
  const c = addToGroup(s, 'accounts', 'checking', T);
  s = { ...c.spine, accounts: c.spine.accounts.map((a) => ({ ...a, balance: { value: 2400, kind: 'known', asOf: T, source: 'test' } })) };
  s = setEstimate(s, 'housing', 1650, 'rough', T);
  s = applyDefaults(setEstimate(s, 'food', 600, 'known', T), R);
  const sum = summarize(s, R, { flags: false });
  const n = O.finishNumbers(s, R, sum);
  assert.equal(n.takeHome, sum.cashflow.income.takeHome);
  assert.equal(n.owed.value, 0);
  assert.deepEqual([n.liquid.value, n.total.value], [2400, 2400]);
  assert.equal(n.needs.value, 2250);
  assert.equal(n.fiNumber.value, sum.fi.fiNumber.value);
  assert.ok(n.fiYm === null || /^\d{4}-\d{2}$/.test(n.fiYm));
  const open = O.openItems(s, (p) => p === 'expenses.est-food.amount');
  assert.ok(open.rough.some((g) => g.id === 'I' && g.items.some((x) => /Paycheck/.test(x.label))), 'the solved gross is rough, under Income');
  assert.ok(open.rough.some((g) => g.id === 'E' && g.items.some((x) => x.path === 'expenses.est-housing.amount')));
  assert.ok(!open.rough.flatMap((g) => g.items).some((x) => x.path === 'expenses.est-food.amount'), 'a known number is not rough');
  assert.ok(open.later.some((g) => g.items.some((x) => x.path === 'expenses.est-food.amount')) === false, 'not now applies to a blank or rough number only');
  assert.ok(open.defaults >= 2 && !open.rough.flatMap((g) => g.items).some((x) => /paid from|paid into|APY/.test(x.label)), 'the assumed links and the house APY are the app\'s guesses, counted apart');
  assert.equal(O.isComplete(s), false);
  s = O.markComplete(s, T);
  assert.deepEqual(s.onboarding, { complete: true, completedOn: T });
  assert.equal(O.markComplete(s, T), s);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  assert.ok(validate({ ...s, onboarding: { complete: 'yes' } }).errors.some((e) => e.path === 'onboarding.complete'));
  assert.deepEqual(O.STEPS.map(([k]) => k), ['profile', 'income', 'debt', 'assets', 'needs', 'goals', 'finish']);
  assert.deepEqual([O.stepAfter('goals'), O.stepAfter('finish'), O.stepBefore('profile')], ['finish', null, null]);
  void getAt;
});

test('the screens: Home offers Start onboarding until done, the gear menu reopens it, the steps are screens of My numbers', () => {
  const dash = readFileSync(SLAM + 'ui/dashboard.js', 'utf8'), shell = readFileSync(SLAM + 'ui/shell.js', 'utf8'), ledger = readFileSync(SLAM + 'ui/ledger.js', 'utf8'), onb = readFileSync(SLAM + 'ui/onboard.js', 'utf8');
  assert.match(dash, /if \(isComplete\(spine\)\) return null;/);
  assert.match(dash, /h\('a', \{ class: 'btn primary', href: 'ledger\.html#\/onboard' \}, 'Start onboarding'\)/);
  assert.match(shell, /h\('a', \{ href: 'ledger\.html#\/onboard' \}, 'Run onboarding again'\)/);
  assert.doesNotMatch(dash, /Run onboarding again/, 'never from the main screens');
  assert.match(ledger, /else if \(levels\[0\] === 'onboard'\) \{ bindKeys\(\); body = onboardScreen\(ctx, H\); \}/);
  assert.match(ledger, /if \(COLLECTION_OF\[sec\.slug\]\) return countSection\(sec\);/);
  assert.match(ledger, /if \(sec\.slug === 'needs'\) return needsSection\(sec\);/);
  assert.match(onb, /const btn = document\.getElementById\('onb-next'\);\n\s*if \(btn\) \{ btn\.focus\(\); return; \}/, 'Enter on the last box reaches Next');
  assert.match(onb, /'Done, go to Home'/);
  // The four answers on every number: the box, Rough, Not now, Not for me.
  const ans = readFileSync(SLAM + 'ui/answers.js', 'utf8');
  for (const w of ["'Rough'", "'Not now'", "'Not for me'"]) assert.ok(ans.includes(w), w);
  const items = readFileSync(SLAM + 'ui/items.js', 'utf8');
  for (const w of ["'Duplicate'", "'Delete'", "'More detail'"]) assert.ok(items.includes(w), w);
});
