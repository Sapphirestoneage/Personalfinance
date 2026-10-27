// Phase 2.5, Part B3: the Profile. Three Level 1 answer sets give visibly different fields with the right meaning;
// areas answered in any order give the same result; switching "with family" back to "rent" brings back the rent typed
// earlier; a balance never changes which fields show, a Profile answer does and is logged; the answers file round-trips;
// Level 2 opens only for what Level 1 ticked; the homework prints grouped by where to find each item.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { validate } from '../engine/schema.js';
import { cashflow } from '../engine/cashflow.js';
import { summarize } from '../engine/summary.js';
import { editFact, setPay, addItem, editExpense } from '../engine/edits.js';
import { valueOf, getAt } from '../engine/spine.js';
import { ledgerTree } from '../engine/ledger-tree.js';
import * as P from '../engine/profile.js';

const R = loadRules();
const TODAY = '2026-10-26';
// The demo carries a whole Profile so it demos well; these tests start from the same household with none.
const blankDemo = () => { const r = readJson('fixtures/demo.json'); delete r.profile; return r; };
const demo = () => applyDefaults(readHousehold(blankDemo(), { today: TODAY }).spine, R);
const keys = (a) => P.fieldsFor(a).shown.map((f) => f.key);
const label = (a, k) => (P.fieldsFor(a).shown.find((f) => f.key === k) || {}).label;
const answer = (s, a) => P.applyAnswers(s, a, { today: TODAY });

// The three answer sets of the brief.
const RENTER = { home: 'roommates', roommates: '2', work: 'w2', payType: 'salary', payOften: 'biweekly', getAround: 'transit' };
const FAMILY = { home: 'family', familyPay: 'nothing', work: 'w2', payType: 'hourly', payOften: 'weekly', getAround: 'rideshare' };
const OWNER = { home: 'own', ownLoan: 'mortgage', work: 'self', quarterly: 'notSure', getAround: 'car' };

test('three answer sets show visibly different fields, each with the right meaning', () => {
  const r = keys(RENTER), f = keys(FAMILY), o = keys(OWNER);
  // Renter with roommates, W-2 salary: rent and bills as your share; a yearly salary; no mortgage, no hourly pay.
  assert.ok(r.includes('rent') && r.includes('salary') && r.includes('renters-insurance'));
  assert.ok(!r.includes('mortgage') && !r.includes('hourly') && !r.includes('self-pay'));
  assert.equal(label(RENTER, 'rent'), 'Rent, your share');
  assert.equal(label(RENTER, 'utilities'), 'Utilities, your share');
  assert.equal(P.fieldsFor(RENTER).meaning.pay, 'yearly salary / 12, a month');
  // Lives with family, hourly, paying nothing: no rent at all, utilities on the family, pay is rate x hours.
  assert.ok(!f.includes('rent') && !f.includes('pay-family') && f.includes('hourly') && !f.includes('salary'));
  assert.deepEqual(P.fieldsFor(FAMILY).covered, { utilities: 'Family', internet: 'Family' });
  assert.equal(P.fieldsFor(FAMILY).meaning.pay, 'hourly rate x usual hours a week x 52 / 12, a month');
  // Self-employed homeowner, up-and-down pay, not sure about quarterly tax: the mortgage, property tax, 1099 pay and
  // a set-aside on every deposit; no rent, no W-2 pay.
  assert.ok(o.includes('mortgage') && o.includes('property-tax') && o.includes('self-pay') && o.includes('set-aside') && o.includes('car-gas'));
  assert.ok(!o.includes('rent') && !o.includes('salary') && !o.includes('hourly') && !o.includes('estimated-payments'));
  assert.ok(P.fieldsFor(OWNER).does.some((d) => d.id === 'setAsideEveryDeposit'));
  assert.notDeepEqual(r, f); assert.notDeepEqual(f, o); assert.notDeepEqual(r, o);
});

test('hourly means rate x hours: $20 an hour for 30 hours a week is $2,600 a month', () => {
  let s = answer(demo(), { work: 'w2', payType: 'hourly', payOften: 'monthly' });
  assert.equal(valueOf(s.income.find((x) => x.id === 'salary').payBasis), 'hourly');
  s = setPay(s, 'salary', { basis: 'hourly', hourlyRate: 20, hoursPerWeek: 30 }, TODAY);
  assert.equal(valueOf(getAt(s, 'income.salary.amount')), 2600, '20 x 30 x 52 / 12');
  // Back to salary: the salary typed before comes back (6,000 a month, 72,000 a year).
  s = answer(s, { payType: 'salary' });
  assert.equal(valueOf(getAt(s, 'income.salary.salary')), 72000);
  assert.equal(valueOf(getAt(s, 'income.salary.amount')), 6000);
});

test('areas answered in any order give the same profile, fields and numbers', () => {
  const all = { ...FAMILY, debts: ['cards', 'student'], cardsFull: 'sometimes', accounts: ['checking', 'k401'], health: 'work', tracking: 'app', goals: ['emergency', 'travel'], fi: 'curious', livesWith: ['alone'], tone: 'gentle', birthYear: 1994, state: 'NY' };
  const ids = Object.keys(all);
  const one = answer(demo(), all);
  const two = answer(demo(), Object.fromEntries([...ids].reverse().map((k) => [k, all[k]])));
  assert.deepEqual(P.answersOf(one), P.answersOf(two));
  assert.deepEqual(P.fieldsFor(P.answersOf(one)), P.fieldsFor(P.answersOf(two)));
  assert.deepEqual(cashflow(one, R, '2026-10').expenses.total.value, cashflow(two, R, '2026-10').expenses.total.value);
  const strip = (s) => ({ ...s, lifeChanges: undefined });
  assert.deepEqual(strip(one), strip(two), 'only the order of the log differs');
});

test('switching "with family" back to "rent" brings back the rent typed earlier', () => {
  let s = answer(demo(), { home: 'rent' });
  const rent = valueOf(getAt(s, 'expenses.rent.amount'));
  assert.equal(rent, 1800);
  assert.equal(cashflow(s, R, '2026-10').expenses.total.value, 3204);
  // With family, paying nothing: rent is hidden (kept, not counted) and utilities are on the family.
  s = answer(s, { home: 'family', familyPay: 'nothing' });
  assert.equal(P.hiddenLine(s, getAt(s, 'expenses.rent')), true);
  assert.equal(valueOf(getAt(s, 'expenses.rent.amount')), 1800, 'kept, not deleted');
  assert.equal(cashflow(s, R, '2026-10').expenses.total.value, 3204 - 1800 - 150, 'no rent, utilities covered');
  const hidden = ledgerTree(s, { names: [], aliases: {} }).find((n) => n.key === 'N').children.find((c) => c.key === 'N:hidden');
  assert.ok(hidden && hidden.children.some((x) => x.id === 'rent'), 'My numbers shows it apart, kept');
  // Back to renting: the 1,800 is there again and the utilities are yours.
  s = answer(s, { home: 'rent' });
  assert.equal(P.hiddenLine(s, getAt(s, 'expenses.rent')), false);
  assert.equal(cashflow(s, R, '2026-10').expenses.total.value, 3204);
  assert.equal(getAt(s, 'expenses.utilities.covered'), undefined);
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
});

test('a balance never changes which fields show; a Profile answer does, and is logged as a life change', () => {
  let s = answer(demo(), RENTER);
  const before = P.fieldsFor(P.answersOf(s));
  const log = s.lifeChanges.length;
  s = editFact(s, 'accounts.chk.balance', 'set', { value: 99999, kind: 'known', today: TODAY });
  s = editFact(s, 'expenses.rent.amount', 'set', { value: 0, kind: 'known', today: TODAY });
  assert.deepEqual(P.fieldsFor(P.answersOf(s)), before);
  assert.equal(s.lifeChanges.length, log, 'a number is not a life change');
  s = answer(s, { home: 'own', ownLoan: 'paidOff' });
  assert.notDeepEqual(P.fieldsFor(P.answersOf(s)), before);
  const last = s.lifeChanges.slice(-2);
  assert.deepEqual(last.map((c) => [c.question, c.from, c.to, c.date]), [['home', 'roommates', 'own', TODAY], ['ownLoan', null, 'paidOff', TODAY]]);
  assert.equal(P.changeWords(last[0]), 'Where do you live? With roommates to I own');
  // Answering the same again is not a change.
  assert.equal(answer(s, { home: 'own' }), s);
});

test('the client answers file round-trips, gut number and all', () => {
  const answers = { ...RENTER, firstName: 'Maya', birthYear: 1999, state: 'NY', debts: ['cards'], cardsFull: 'always', give: ['tzedakah'], goals: ['emergency', 'travel', 'home', 'car'] };
  const file = P.answersFile(answers, 2400, TODAY);
  assert.equal(file.answers.goals.length, 3, 'top 3 only');
  const read = P.readAnswersFile(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(read.problems, []);
  assert.deepEqual(read.answers, file.answers);
  assert.equal(read.gut, 2400);
  assert.equal(P.answersFileName('Maya', TODAY), 'answers-maya-2026-10-26.json');
  const s = P.loadAnswers(demo(), read, { today: TODAY });
  // The county and health coverage are the household's own fields (one stored answer), so they read back with the answers.
  assert.deepEqual(P.answersOf(s), { ...file.answers, county: 'Albany', health: 'work' });
  assert.equal(valueOf(s.household.state), 'NY', 'the state is stored on the household, once');
  assert.equal(s.profile.state, undefined);
  assert.equal(valueOf(s.household.gutSpending), 2400);
  assert.equal(s.household.gutSpending.kind, 'rough');
  assert.equal(s.household.people[0].name, 'Casey Rivera', 'a name already there is kept');
  assert.equal(valueOf(s.household.cardPayPolicy), 'statement', 'always paid in full');
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\n'));
  // Out again from the loaded profile: the same file.
  const { county, health, ...back } = P.answersOf(s);
  assert.equal(county, 'Albany');
  assert.deepEqual(P.answersFile(back, valueOf(s.household.gutSpending), TODAY), file);
  assert.throws(() => P.readAnswersFile({ kind: 'nope' }), /not a "Before our first call" answers file/);
  assert.deepEqual(P.readAnswersFile({ kind: P.ANSWERS_KIND, answers: { home: 'castle', zodiac: 'leo' } }).problems.length, 2);
});

test('Level 2 opens only for what Level 1 ticked; Level 3 makes the to-dos, grouped by where', () => {
  assert.deepEqual(P.level2({}).map((x) => x.area), []);
  const a = { work: 'w2', offers: ['k401'], debts: ['cards'], accounts: ['checking'] };
  assert.deepEqual(P.level2(a).map((x) => x.area), ['work', 'k401', 'cards', 'debtAll']);
  assert.ok(!P.level2(a).some((x) => x.area === 'ira' || x.area === 'mortgage'));
  let s = answer(demo(), a);
  s = P.setHomework(s, 'k401Match', 'lookup', { today: TODAY });
  s = P.setHomework(s, 'payRate', 'lookup', { today: TODAY });
  s = P.setHomework(s, 'cardDetails', 'lookup', { today: TODAY });
  s = P.setHomework(s, 'k401Contribution', 'notSure', { today: TODAY });
  assert.deepEqual(P.homeworkList(s), [{ where: 'Your benefits site or HR', items: ['The match formula and vesting'] }, { where: 'Your paystub', items: ['Your pay rate (yearly salary, or hourly rate and usual hours)'] }, { where: 'The card app or a statement', items: ['Each card: which card, business or personal, rate, due day, limit, any 0% promo and its end'] }]);
  assert.deepEqual(P.stillGuessing(s).map((x) => x.id), ['k401Contribution']);
  assert.ok(validate(s).ok);
  // The one-pager prints them.
  assert.match(readFileSync(new URL('../ui/onepager.js', import.meta.url), 'utf8'), /homeworkList\(spine, todayIso\(\)\)/);
});

test('every question changes something, says what; no question offers "Not sure" (owner, 2026-10-27)', () => {
  const q = readFileSync(new URL('../ui/profile-q.js', import.meta.url), 'utf8');
  assert.doesNotMatch(q, /'Not sure'/);
  for (const x of [...P.LEVEL1, ...P.LEVEL2]) assert.ok(!(x.options || []).some(([, w]) => /not sure/i.test(w)), x.id);
  const prof = readFileSync(new URL('../ui/profile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(prof, /\['known', 'lookup', 'notSure'\]/);
  for (const q of [...P.LEVEL1, ...P.LEVEL2]) {
    assert.ok(q.does || q.kind === 'field', q.id + ' says what it does');
    assert.equal(P.cleanAnswer(q.id, P.NOT_SURE), P.NOT_SURE, q.id);
  }
  // The before-call page never asks for account numbers or logins.
  const page = readFileSync(new URL('../ui/before.js', import.meta.url), 'utf8');
  assert.match(page, /never asks for account numbers or logins/);
  assert.match(page, /Your answers stay on your phone until you send them/);
  assert.match(page, /Email or text this file to Eli/);
  assert.ok(!P.LEVEL1.some((q) => /account number|password|login/i.test(q.label)));
});

test('an older file\'s Session answers move into the Profile; income security adds cushion months', () => {
  const raw = blankDemo();
  raw.household.home = { value: 'family', kind: 'known', asOf: '2026-10-25', source: 'session' };
  raw.household.getAround = { value: 'both', kind: 'known', asOf: '2026-10-25', source: 'session' };
  const s = readHousehold(raw, { today: TODAY }).spine;
  assert.equal(s.household.home, undefined);
  assert.deepEqual([valueOf(s.profile.home), valueOf(s.profile.getAround)], ['family', 'mix']);
  // An old answer never hides what it used to show: a car reads as a mix; none and other are asked again.
  const old = (home, around) => { const r = blankDemo(); r.household.home = { value: home, kind: 'known', asOf: '2026-10-25', source: 'session' }; r.household.getAround = { value: around, kind: 'known', asOf: '2026-10-25', source: 'session' }; return readHousehold(r, { today: TODAY }).spine; };
  assert.equal(valueOf(old('rent', 'car').profile.getAround), 'mix');
  assert.equal(old('other', 'none').profile, undefined);
  assert.ok(validate(s).ok);
  const base = summarize(demo(), R).emergency.targetMonths.value;
  const shaky = summarize(answer(demo(), { work: 'w2', incomeSecurity: 'shaky' }), R).emergency.targetMonths.value;
  assert.equal(Math.round((shaky - base) * 100) / 100, 3, 'shaky adds three months (Eli\'s default)');
});

test('a parent\'s plan puts the turning-26 switch on the dates; the birth year is a guess from the profile', () => {
  const s = answer(demo(), { health: 'parent' });
  const t = s.household.healthCoverage.find((x) => x.id === 'turning-26');
  assert.equal(t.from, '2020-03-10', 'Casey was born 1994-03-10');
  const fresh = answer(editFact(demo(), 'household.people.casey.birthDate', 'clear', { today: TODAY }), { birthYear: 2001, health: 'parent' });
  assert.equal(valueOf(fresh.household.people[0].birthDate), '2001-07-01');
  assert.equal(fresh.household.people[0].birthDate.kind, 'rough');
  assert.equal(fresh.household.healthCoverage.find((x) => x.id === 'turning-26').from, '2027-07-01');
  assert.equal(answer(fresh, { health: 'work' }).household.healthCoverage.find((x) => x.id === 'turning-26'), undefined);
});

test('the profile spec doc is written from the code and up to date', async () => {
  const { profileDoc } = await import('../tools/profile-doc.mjs');
  assert.equal(readFileSync(new URL('../docs/specs/profile-questions.md', import.meta.url), 'utf8'), profileDoc(), 'run node tools/profile-doc.mjs');
});

test('review fixes: nothing hidden before its question; hidden lines never paid; needs missing stays missing', async () => {
  const { cashsim } = await import('../engine/cashsim.js');
  // A Childcare line, with only the name answered: still counted.
  let s = addItem(answer(demo(), { firstName: 'Casey' }), { collection: 'expenses', label: 'Childcare' }, TODAY).spine;
  s = editFact(s, 'expenses.childcare.amount', 'set', { value: 500, kind: 'known', today: TODAY });
  assert.equal(P.hiddenLine(s, getAt(s, 'expenses.childcare')), false);
  assert.equal(cashflow(s, R, '2026-10').expenses.total.value, 3204 + 500);
  // Living with family, paying nothing: the cash run pays no rent either.
  const fam = answer(demo(), { home: 'family', familyPay: 'nothing' });
  const paid = (sp) => cashsim(sp, R, { months: 1 }).daily.flatMap((d) => d.events || []).filter((e) => /rent/i.test(e.label || '')).length;
  assert.ok(paid(demo()) > 0, 'rent is paid without a profile');
  assert.equal(paid(fam), 0, 'and not once the profile hides it');
  // No line marked need: the first cushion step is missing, never the minimums alone.
  let none = demo();
  for (const e of none.expenses) none = editFact(none, 'expenses.' + e.id + '.need', 'clear', { today: TODAY });
  const step = summarize(none, R).emergency.cushion[0];
  assert.equal(step.target.value, null);
  assert.equal(step.reached, null);
});

test('review fixes: a later answer never undoes typed pay; a stale answer stops counting; an old Family cover comes off', () => {
  let s = answer(demo(), { work: 'w2', payType: 'hourly' });
  s = setPay(s, 'salary', { basis: 'salary', salary: 90000 }, TODAY);
  s = answer(s, { tone: 'gentle' });
  assert.equal(valueOf(getAt(s, 'income.salary.amount')), 7500, 'the coach typed a salary after the answer');
  const shaky = answer(demo(), { work: 'w2', incomeSecurity: 'shaky' });
  const base = summarize(demo(), R).emergency.targetMonths.value;
  assert.equal(summarize(answer(shaky, { work: 'retired' }), R).emergency.targetMonths.value, base);
  // A cover the old Session put on utilities ("Family", source ledger) comes off when the Profile says rent.
  const old = editExpense(demo(), 'utilities', { amount: 150, kind: 'known', coveredBy: 'Family' }, TODAY);
  assert.equal(valueOf(getAt(old, 'expenses.utilities.covered')), true);
  assert.equal(getAt(answer(old, { home: 'rent' }), 'expenses.utilities.covered'), undefined);
});

test('Batch 10 fix: the goals picked before the call are set up, once, ready for an amount; nothing removes them', () => {
  let s = answer(demo(), { goals: ['emergency', 'travel'], moving: 'yes', fi: 'curious' });
  const keys = s.goals.filter((g) => g.key).map((g) => [g.id, g.label, g.target.kind]).sort();
  assert.deepEqual(keys, [['goal-emergency', 'An emergency fund', 'missing'], ['goal-moving', 'Moving costs', 'missing'], ['goal-travel', 'Travel', 'missing']]);
  assert.equal(s.goals.filter((g) => g.type === 'fi').length, 1, 'the demo already has its FI goal');
  s = answer(s, { goals: ['emergency'] });
  assert.ok(s.goals.some((g) => g.id === 'goal-travel'), 'unpicking keeps the goal and what was typed in it');
  assert.ok(validate(s).ok);
});

test('Part C review: a deleted goal is not put back; a goal id already taken gets its own; a payment never goes past the balance', async () => {
  const { removeItem, addItem: add, recordDebtPayment } = await import('../engine/edits.js');
  let s = add(demo(), { collection: 'goals', type: 'savings', label: 'Goal car' }, TODAY).spine;
  s = answer(s, { goals: ['car', 'travel'] });
  assert.ok(s.goals.some((g) => g.key === 'car' && g.id !== 'goal-car'), 'its own id');
  assert.ok(validate(s).ok, validate(s).errors.map((e) => e.path + ' ' + e.message).join('\\n'));
  const travel = s.goals.find((g) => g.key === 'travel').id;
  s = removeItem(s, 'goals', travel);
  s = answer(s, { tone: 'gentle' });
  s = answer(s, { goals: ['car', 'travel', 'home'] });
  assert.ok(!s.goals.some((g) => g.key === 'travel'), 'deleted, and not newly picked: stays deleted');
  assert.ok(s.goals.some((g) => g.key === 'home'));
  const paid = recordDebtPayment(demo(), 'visa', 5000, TODAY);
  assert.equal(valueOf(getAt(paid, 'debts.visa.balance')), 0);
  assert.equal(valueOf(getAt(paid, 'accounts.chk.balance')), 3000 - 3000, 'checking pays only what was owed');
});
