import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { validate } from '../engine/schema.js';
import { ledgerRows, stillGuessing, typeFor } from '../engine/ledger.js';
import { parseInput, editFact, parseCardRate, editCardRate, createHistory, commit, undo, redo, canUndo, canRedo, editIncome } from '../engine/edits.js';
import { cardRateRow, rowPathFor } from '../engine/ledger.js';
import { applyDefaults } from '../engine/defaults.js';
import { fact } from '../engine/spine.js';
import { getAt, listFacts } from '../engine/spine.js';
import { labelFor } from '../engine/labels.js';
import { readJson, loadRules, SLAM } from './spine-helpers.js';

const R = loadRules();
const demo = () => loadHousehold(readJson('fixtures/demo.json'));

test('ledger: every Fact is a row, in a DAITE group, with a label and type', () => {
  const s = demo();
  const groups = ledgerRows(s);
  assert.deepEqual(groups.map((g) => g.id), ['D', 'A', 'I', 'T', 'E', 'G']);
  const rows = groups.flatMap((g) => g.rows);
  // A card's APR, intro rate and intro end share one row.
  const cardIntro = listFacts(s).filter((x) => /^debts\.[^.]+\.(promoApr|promoEnds)$/.test(x.path) && getAt(s, x.path.split('.').slice(0, 2).join('.')).type === 'credit_card');
  // A pay day folds into its income or expense row (S-189, S-199).
  const payDays = listFacts(s).filter((x) => /^(income|expenses)\.[^.]+\.payDay$/.test(x.path));
  assert.equal(rows.length, listFacts(s).length - cardIntro.length - payDays.length);
  const find = (p) => rows.find((r) => r.path === p);
  assert.equal(find('debts.visa.apr').group, 'D');
  assert.equal(find('debts.visa.apr').type, 'cardRate');
  assert.equal(find('debts.sl.apr').type, 'rate', 'a loan keeps its plain APR row');
  assert.equal(find('debts.store.promoEnds'), undefined);
  assert.equal(find('accounts.hysa.balance').group, 'A');
  assert.equal(find('income.salary.amount').group, 'I');
  assert.equal(find('income.salary.withholding.federal').group, 'T');
  assert.equal(find('expenses.rent.amount').group, 'E');
  assert.equal(find('assumptions.withdrawalRate').group, 'G');
  assert.equal(labelFor(s, 'debts.visa.minimum'), 'Visa: minimum payment');
  assert.equal(typeFor(s, 'household.filingStatus').startsWith('choice:'), true);
});

test('still guessing: missing fields first, then rough ones by effect', () => {
  const s = demo();
  s.debts[0].limit = { value: null, asOf: null, source: 'test', kind: 'missing' };
  const g = stillGuessing(s, R);
  assert.equal(g.items[0].kind, 'missing');
  assert.equal(g.items[0].path, 'debts.visa.limit');
  assert.ok(g.items[0].blocks.includes('utilization'));
  const rough = g.items.filter((i) => i.kind === 'rough');
  for (let i = 1; i < rough.length; i++) assert.ok(rough[i - 1].score >= rough[i].score);
  const top = rough[0];
  assert.ok(top.score > 0, 'the biggest guess moves something');
  assert.ok(g.items.every((i) => i.kind === 'rough' || i.kind === 'missing'));
});

test('parse typed input by field type', () => {
  assert.deepEqual(parseInput('money', '$1,250'), { ok: true, value: 1250 });
  assert.deepEqual(parseInput('rate', '25%'), { ok: true, value: 0.25 });
  assert.deepEqual(parseInput('rate', '4.5'), { ok: true, value: 0.045 });
  assert.equal(parseInput('money', 'abc').ok, false);
  assert.equal(parseInput('money', '').ok, false);
  assert.deepEqual(parseInput('date', '2027-05-31'), { ok: true, value: '2027-05-31' });
  assert.deepEqual(parseInput('bool', 'yes'), { ok: true, value: true });
  assert.equal(parseInput('choice:a|b', 'c').ok, false);
  assert.deepEqual(parseInput('list', '[{"year":2026,"amount":1}]').value, [{ year: 2026, amount: 1 }]);
});

test('edit, confirm, not for me: each keeps the spine valid', () => {
  let s = demo();
  s = editFact(s, 'expenses.groceries.amount', 'set', { value: 450, kind: 'known', today: '2026-10-23' });
  assert.deepEqual(getAt(s, 'expenses.groceries.amount'), { value: 450, kind: 'known', asOf: '2026-10-23', source: 'ledger' });
  s = editFact(s, 'expenses.dining.amount', 'confirm', { today: '2026-10-23' });
  assert.equal(getAt(s, 'expenses.dining.amount').kind, 'known');
  assert.equal(getAt(s, 'expenses.dining.amount').value, 200);
  s = editFact(s, 'debts.visa.stress', 'notForMe', { today: '2026-10-23' });
  assert.deepEqual([getAt(s, 'debts.visa.stress').value, getAt(s, 'debts.visa.stress').kind], [null, 'notForMe']);
  const r = validate(s);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
});

test('undo and redo every edit', () => {
  const s0 = demo();
  let h = createHistory(s0);
  assert.equal(canUndo(h), false);
  const s1 = editFact(s0, 'expenses.rent.amount', 'set', { value: 1900, today: '2026-10-23' });
  h = commit(h, s1, 'Rent');
  const s2 = editFact(s1, 'expenses.rent.amount', 'set', { value: 2000, today: '2026-10-23' });
  h = commit(h, s2, 'Rent');
  h = undo(h);
  assert.equal(getAt(h.present, 'expenses.rent.amount').value, 1900);
  h = undo(h);
  assert.equal(getAt(h.present, 'expenses.rent.amount').value, 1800);
  assert.equal(canUndo(h), false);
  h = redo(h);
  assert.equal(getAt(h.present, 'expenses.rent.amount').value, 1900);
  assert.equal(canRedo(h), true);
  h = commit(h, editFact(h.present, 'expenses.rent.amount', 'set', { value: 1, today: '2026-10-23' }), 'Rent');
  assert.equal(canRedo(h), false, 'a new edit drops the redo branch');
});

// Views never calculate: the UI files hold no arithmetic on money.
test('views do no money math', () => {
  for (const f of readdirSync(SLAM + 'ui').filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(SLAM + 'ui/' + f, 'utf8');
    assert.ok(!/\.value\s*[-+*/]\s*[\w(]/.test(src), 'ui/' + f + ' computes with a result value');
    assert.ok(!/from '\.\.\/engine\/(cashflow|tax|debt|fi|emergency|projection|networth)\.js'/.test(src), 'ui/' + f + ' should read numbers through summary.js or ledger.js');
  }
});

// ------------------------------------------------------------------ card interest rate (S-160, S-161)
test('card rate row: one value with the intro, and the kind of its parts', () => {
  const s = demo();
  const store = cardRateRow(s, s.debts.find((d) => d.id === 'store'));
  assert.deepEqual(store.fact.value, { apr: 0.2999, intro: { rate: 0, ends: '2027-02-28' } });
  assert.equal(store.fact.kind, 'known');
  assert.equal(store.label, 'Store card: interest rate');
  const visa = cardRateRow(s, s.debts.find((d) => d.id === 'visa'));
  assert.deepEqual(visa.fact.value, { apr: 0.22, intro: null });
  assert.equal(rowPathFor(s, 'debts.store.promoEnds'), 'debts.store.apr');
  assert.equal(rowPathFor(s, 'debts.sl.apr'), 'debts.sl.apr');
});

test('the default card APR fills a blank as rough, and leaves real rates alone', () => {
  const s = demo();
  s.debts.find((d) => d.id === 'visa').apr = fact(null);
  delete s.debts.find((d) => d.id === 'ink').apr;
  const out = applyDefaults(s, R);
  for (const id of ['visa', 'ink']) {
    const a = getAt(out, 'debts.' + id + '.apr');
    assert.deepEqual([a.value, a.kind, a.source], [0.25, 'rough', 'DEFAULT_CARD_APR'], id);
  }
  assert.equal(getAt(out, 'debts.store.apr').value, 0.2999);
  assert.equal(getAt(out, 'debts.sl.apr').value, 0.05, 'loans are not touched');
  assert.equal(R.meta('DEFAULT_CARD_APR', 2026).verified, 'assumption');
  assert.ok(validate(out).ok);
});

test('parse the card rate panel', () => {
  assert.deepEqual(parseCardRate({ apr: '25', hasIntro: false }).value, { apr: 0.25, intro: null });
  assert.deepEqual(parseCardRate({ apr: '', hasIntro: true, introRate: '', introEnds: '2027-03-31' }).value, { apr: null, intro: { rate: 0, ends: '2027-03-31' } });
  assert.equal(parseCardRate({ apr: '24.99', hasIntro: true, introRate: '0', introEnds: '' }).ok, false);
  assert.match(parseCardRate({ apr: 'x', hasIntro: true, introRate: '0', introEnds: '2027-03-31' }).message, /^Rate after intro/);
});

test('edit a card rate: add an intro, take it away, a blank APR becomes the rough default', () => {
  let s = demo();
  s = editCardRate(s, 'visa', 'set', { value: { apr: null, intro: { rate: 0, ends: '2027-03-31' } }, kind: 'known', today: '2026-10-23' });
  s = applyDefaults(s, R);
  assert.deepEqual(cardRateRow(s, getAt(s, 'debts.visa')).fact.value, { apr: 0.25, intro: { rate: 0, ends: '2027-03-31' } });
  assert.equal(cardRateRow(s, getAt(s, 'debts.visa')).fact.kind, 'rough', 'the default after the intro is rough');
  s = editCardRate(s, 'visa', 'confirm', { today: '2026-10-23' });
  assert.equal(cardRateRow(s, getAt(s, 'debts.visa')).fact.kind, 'known');
  s = editCardRate(s, 'visa', 'set', { value: { apr: 0.2, intro: null }, kind: 'rough', today: '2026-10-23' });
  assert.equal(getAt(s, 'debts.visa.promoEnds').kind, 'notForMe');
  assert.deepEqual(cardRateRow(s, getAt(s, 'debts.visa')).fact.value, { apr: 0.2, intro: null });
  s = editCardRate(s, 'visa', 'notForMe', { today: '2026-10-23' });
  assert.equal(cardRateRow(s, getAt(s, 'debts.visa')).fact.kind, 'notForMe');
  assert.ok(validate(s).ok);
});

test('the default due day fills every debt with no due day as rough, never a statement close day', () => {
  const s = demo();
  s.debts.find((d) => d.id === 'visa').dueDay = fact(null);
  s.debts.push({ id: 'iou', family: 'debt', type: 'family_iou', name: fact('Loan from a friend'), balance: fact(300), apr: fact(0), minimum: fact(null) });
  const out = applyDefaults(s, R);
  for (const id of ['visa', 'sl']) {
    const d = getAt(out, 'debts.' + id + '.dueDay');
    assert.deepEqual([d.value, d.kind, d.source], [1, 'rough', 'DEFAULT_DUE_DAY'], id);
  }
  assert.equal(getAt(out, 'debts.store.dueDay').value, 3, 'a real due day stays');
  assert.equal(getAt(out, 'debts.iou.dueDay'), undefined, 'an IOU with no payment gets no due day');
  assert.ok(out.debts.every((d) => !d.statementCloseDay), 'no statement close day is invented');
  assert.equal(R.meta('DEFAULT_DUE_DAY', 2026).verified, 'assumption');
});

// ------------------------------------------------------------------ the tree, adding, removing, many at once (S-169)
import { ledgerTree, institutionOf } from '../engine/ledger-tree.js';
import { addItem, removeItem, bulkEdit } from '../engine/edits.js';
const INST = readJson('data/institutions.json');

test('tree: debt by kind then institution then card; assets by family then type; every field once', () => {
  const s = applyDefaults(demo(), R);
  s.debts.find((d) => d.id === 'visa').name = fact('Chase Freedom');
  const tree = ledgerTree(s, INST);
  const debt = tree.find((g) => g.key === 'D');
  const cards = debt.children.find((n) => n.key === 'D:credit_card');
  assert.equal(cards.label, 'Credit cards');
  assert.ok(cards.children.some((n) => n.label === 'Chase' && n.children[0].label === 'Chase Freedom'));
  const assets = tree.find((g) => g.key === 'A');
  const ira = assets.children.find((n) => n.label === 'IRA');
  assert.equal(ira.children[0].label, 'Roth IRA');
  assert.equal(ira.children[0].children[0].key, 'accounts.roth');
  const flat = ledgerRows(s).flatMap((g) => g.rows).map((r) => r.path).sort();
  const inTree = tree.flatMap((g) => g.allRows).map((r) => r.path).sort();
  assert.deepEqual(inTree, flat, 'the tree shows every field exactly once');
  assert.equal(institutionOf({ name: fact('American Express Gold') }, INST), 'Amex');
});

test('add an account, a card, income, an expense and a goal; each is valid and asks for its numbers', () => {
  let s = demo();
  for (const spec of [
    { collection: 'accounts', type: 'roth_ira', label: 'Second Roth' },
    { collection: 'debts', type: 'credit_card', label: 'Discover it' },
    { collection: 'income', type: '1099', label: 'Weekend gig', cadence: 'weekly' },
    { collection: 'expenses', label: 'Gym', fat: null },
    { collection: 'goals', type: 'savings', label: 'Trip' }
  ]) {
    const made = addItem(s, spec, '2026-10-23');
    s = applyDefaults(made.spine, R);
    assert.equal(getAt(s, made.firstPath).kind, 'missing', spec.label + ' starts with its number missing');
  }
  const r = validate(s);
  assert.ok(r.ok, r.errors.map((e) => e.path + ' ' + e.message).join('\n'));
  assert.equal(getAt(s, 'debts.discover-it.apr').kind, 'rough', 'house defaults fill the new card');
  const fewer = removeItem(s, 'debts', 'discover-it');
  assert.equal(fewer.debts.some((d) => d.id === 'discover-it'), false);
});

test('bulk: confirm, mark rough, not for me across several fields', () => {
  const s = applyDefaults(demo(), R);
  const rows = [{ path: 'expenses.groceries.amount', type: 'money' }, { path: 'expenses.dining.amount', type: 'money' }, { path: 'debts.store.apr', type: 'cardRate' }];
  const c = bulkEdit(s, rows, 'confirm', '2026-10-23');
  assert.deepEqual(rows.slice(0, 2).map((r) => getAt(c, r.path).kind), ['known', 'known']);
  const r2 = bulkEdit(s, rows, 'rough', '2026-10-23');
  assert.equal(getAt(r2, 'debts.store.apr').kind, 'rough');
  assert.equal(getAt(r2, 'debts.store.promoEnds').kind, 'rough');
  const n = bulkEdit(s, rows.slice(0, 1), 'notForMe', '2026-10-23');
  assert.equal(getAt(n, 'expenses.groceries.amount').kind, 'notForMe');
  assert.ok(validate(r2).ok);
});

// ------------------------------------------------------------------ shared and covered expenses (S-175, S-176)
import { editExpense, setSectionSharing } from '../engine/edits.js';
import { shareOf } from '../engine/sharing.js';
import { cashflow } from '../engine/cashflow.js';

test('sharing: not shared unless the expense or its section says so; your cost is your share', () => {
  let s = demo();
  const rent = () => getAt(s, 'expenses.rent');
  assert.equal(shareOf(s, rent()).shared, false, 'default: not shared');
  s = setSectionSharing(s, 'accommodation', { shared: true, sharedWith: 2, whoPays: 'part' }, '2026-10-23');
  assert.deepEqual([shareOf(s, rent()).shared, shareOf(s, rent()).share, shareOf(s, rent()).fromDefault], [true, 0.5, true]);
  const items = Object.fromEntries(cashflow(s, R, '2026-10').expenses.items.map((i) => [i.id, i]));
  assert.equal(items.rent.amount, 900, 'half of 1,800');
  assert.equal(items.rent.full, 1800);
  assert.equal(items.utilities.amount, 75, 'every housing bill follows the default');
  s = editExpense(s, 'utilities', { amount: 150, cadence: 'monthly', sharing: { shared: false } }, '2026-10-23');
  assert.equal(shareOf(s, getAt(s, 'expenses.utilities')).shared, false, 'one bill can opt out');
  s = editExpense(s, 'rent', { amount: 1800, cadence: 'monthly', sharing: { shared: true, sharedWith: 2, yourShare: null, whoPays: 'part' } }, '2026-10-23');
  assert.equal(getAt(s, 'expenses.rent.shared'), undefined, 'a choice that matches the default is not copied');
  s = editExpense(s, 'rent', { amount: 1800, cadence: 'monthly', sharing: { shared: true, sharedWith: 3, yourShare: 0.4, whoPays: 'whole' } }, '2026-10-23');
  assert.deepEqual([shareOf(s, rent()).people, shareOf(s, rent()).share, shareOf(s, rent()).whoPays], [3, 0.4, 'whole']);
  assert.ok(validate(s).ok);
});

test('covered by: a pick list with an Other that adds a name; covered counts $0', () => {
  let s = demo();
  s = editExpense(s, 'phone', { amount: 60, cadence: 'monthly', coveredBy: 'Grandma' }, '2026-10-23');
  assert.deepEqual(s.household.payers, ['Grandma'], 'a new name joins the list');
  assert.equal(getAt(s, 'expenses.phone.coveredBy').value, 'Grandma');
  assert.equal(cashflow(s, R, '2026-10').expenses.items.find((i) => i.id === 'phone').amount, 0);
  s = editExpense(s, 'gym', { amount: 50, cadence: 'monthly', coveredBy: 'Parents' }, '2026-10-23');
  assert.deepEqual(s.household.payers, ['Grandma'], 'built-in names are not added again');
  s = editExpense(s, 'phone', { amount: 60, cadence: 'monthly', coveredBy: null }, '2026-10-23');
  assert.equal(getAt(s, 'expenses.phone.covered'), undefined);
  assert.ok(validate(s).ok);
});

test('an expense row says how much, how often and who pays', () => {
  let s = setSectionSharing(demo(), 'accommodation', { shared: true, sharedWith: 2 }, '2026-10-23');
  const row = ledgerRows(s).flatMap((g) => g.rows).find((r) => r.path === 'expenses.rent.amount');
  assert.equal(row.type, 'expense');
  assert.deepEqual([row.fact.value.amount, row.fact.value.cadence, row.fact.value.shared, row.fact.value.yourMonthly], [1800, 'monthly', true, 900]);
  assert.equal(rowPathFor(s, 'expenses.rent.coveredBy'), 'expenses.rent.amount');
});

// ------------------------------------------------------------------ repayment plan (S-181)
import { LOAN_PLANS } from '../engine/schema.js';
import { showValue } from '../ui/view.js';

test('a federal loan plan: pick a plan, type another, or give only the payment', () => {
  const added = addItem(applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R), { collection: 'debts', type: 'student_loan' }, '2026-10-22');
  let s = added.spine;
  const loan = { id: added.id };
  const plan = 'debts.' + loan.id + '.plan';
  const type = typeFor(s, plan);
  assert.equal(type, 'suggest:' + LOAN_PLANS.join('|'));
  assert.ok(LOAN_PLANS.includes('not_sure'));
  assert.equal(showValue('ibr', type), 'Income-Based Repayment (IBR)');
  assert.deepEqual(parseInput(type, '  My own plan '), { ok: true, value: 'My own plan' }, 'Other keeps what was typed');
  assert.equal(showValue('My own plan', type), 'My own plan');
  // Only the payment: the plan is a not-sure guess and the payment is its own field, one step.
  s = editFact(s, plan, 'set', { value: 'not_sure', kind: 'rough', today: '2026-10-22' });
  s = editFact(s, 'debts.' + loan.id + '.minimum', 'set', { value: 210, kind: 'known', today: '2026-10-22' });
  assert.deepEqual([getAt(s, plan).value, getAt(s, plan).kind], ['not_sure', 'rough']);
  assert.equal(getAt(s, 'debts.' + loan.id + '.minimum').value, 210);
  assert.ok(validate(s).ok);
  const priv = addItem(s, { collection: 'debts', type: 'private_student_loan' }, '2026-10-22');
  assert.equal(typeFor(priv.spine, 'debts.' + priv.id + '.plan'), 'text', 'a private loan has its lender\'s plans');
});

// ------------------------------------------------------------------ your part of a shared bill (S-187)
import { evenShare, shareFromAmount } from '../engine/sharing.js';

test('your part of a shared bill: an even split, a percent, or the dollars you pay', () => {
  assert.equal(evenShare(4), 0.25);
  assert.equal(evenShare(1), null, 'one person is not sharing');
  assert.equal(shareFromAmount(70, 17.5), 0.25);
  assert.equal(shareFromAmount(0, 10), null, 'no bill, no share');
  assert.equal(shareFromAmount(70, null), null);
  // Saved as a percent, it gives back the dollars typed.
  const s = demo();
  const e = s.expenses.find((x) => x.amount.value > 0);
  const share = shareFromAmount(e.amount.value, 17.5);
  const d = editExpense(s, e.id, { amount: e.amount.value, cadence: e.cadence, sharing: { shared: true, sharedWith: 3, yourShare: share, whoPays: 'part' } }, '2026-10-22');
  assert.ok(Math.abs(shareOf(d, d.expenses.find((x) => x.id === e.id)).share * e.amount.value - 17.5) < 1e-9);
});

// ------------------------------------------------------------------ links and the card pay setting (S-189)
import { editPayment, duplicateItem } from '../engine/edits.js';
import { paymentRow, linkOptions } from '../engine/ledger.js';
import { mainChecking } from '../engine/defaults.js';
import { minimumsTotal } from '../engine/debt.js';

test('links: until said otherwise, money goes through the main checking, as a guess', () => {
  const s = applyDefaults(demo(), R);
  const main = mainChecking(s);
  assert.equal(s.accounts.find((a) => a.id === main).type, 'checking');
  for (const e of s.expenses) if (!(e.covered && e.covered.value)) assert.deepEqual([e.paidFrom.value, e.paidFrom.kind], [main, 'rough'], e.id);
  for (const x of s.income) assert.deepEqual([x.depositTo.value, x.depositTo.kind], [main, 'rough'], x.id);
  for (const d of s.debts) assert.equal(d.paidFrom.value, main, d.id);
  assert.deepEqual([s.household.cardPayPolicy.value, s.household.cardPayPolicy.kind], ['minimum', 'rough']);
  assert.ok(validate(s).ok, validate(s).errors.map((x) => x.path + ' ' + x.message).join('\n'));
  // A 401(k) contribution comes out of the paycheck.
  const k = s.accounts.find((a) => a.family === 'employerRetirement' && a.monthlyContribution);
  if (k) assert.equal(k.fundedFrom.value, 'paycheck');
});

test('an expense\'s payment: the account or card and the day, one row', () => {
  const s0 = applyDefaults(demo(), R);
  const card = s0.debts.find((d) => d.type === 'credit_card');
  const e = s0.expenses[0];
  assert.ok(linkOptions(s0, 'link:cash|card').some((o) => o.value === card.id && o.group === 'Cards'));
  const s = editPayment(s0, e.id, { from: card.id, day: 5 }, '2026-10-23');
  const row = paymentRow(s, s.expenses[0]);
  assert.deepEqual(row.fact.value, { from: card.id, day: 5 });
  assert.equal(row.display, card.name.value + ', on the 5th');
  assert.ok(validate(s).ok);
  const cleared = editPayment(s, e.id, { from: card.id, day: null }, '2026-10-23');
  assert.equal(cleared.expenses[0].payDay, undefined, 'a blank day clears it');
});

test('the card pay setting: the full statement pays off what a card carries', () => {
  const s = applyDefaults(demo(), R);
  const card = s.debts.find((d) => d.type === 'credit_card' && d.balance.value > 0);
  const iso = '2026-11-01';
  const before = minimumsTotal(s, R, iso).items.find((x) => x.id === card.id).amount;
  assert.ok(before < card.balance.value, 'the minimum to start');
  const all = { ...s, household: { ...s.household, cardPayPolicy: { value: 'statement', kind: 'known', asOf: '2026-10-23', source: 'test' } } };
  assert.equal(minimumsTotal(all, R, iso).items.find((x) => x.id === card.id).amount, card.balance.value, 'every card: the statement');
  const one = { ...s, debts: s.debts.map((d) => (d.id === card.id ? { ...d, payPolicy: { value: 'statement', kind: 'known', asOf: '2026-10-23', source: 'test' } } : d)) };
  assert.equal(minimumsTotal(one, R, iso).items.find((x) => x.id === card.id).amount, card.balance.value, 'one card overrides');
  assert.ok(validate(one).ok);
});

test('duplicate: a copy keeps everything but its name and amount', () => {
  const s = applyDefaults(demo(), R);
  const src = s.expenses.find((e) => e.amount.value > 0);
  const r = duplicateItem(s, 'expenses', src.id, '2026-10-23', 'Netflix');
  const copy = r.spine.expenses.find((e) => e.id === r.id);
  assert.equal(copy.label, 'Netflix');
  assert.deepEqual([copy.amount.value, copy.amount.kind], [null, 'missing']);
  assert.equal(copy.cadence, src.cadence);
  assert.deepEqual(copy.paidFrom, src.paidFrom);
  assert.equal(r.firstPath, 'expenses.' + r.id + '.amount');
  assert.ok(validate(r.spine).ok);
  const card = s.debts.find((d) => d.type === 'credit_card');
  const c = duplicateItem(s, 'debts', card.id, '2026-10-23', 'New card');
  const cc = c.spine.debts.find((d) => d.id === c.id);
  assert.deepEqual([cc.name.value, cc.balance.value, cc.apr.value], ['New card', null, card.apr.value]);
});

// ------------------------------------------------------------------ pick what you have (S-193)
import { STARTER, addPicked, haveCounts } from '../engine/starter.js';

test('pick what you have: everything ticked is added with its details blank, in one step', () => {
  const s = applyDefaults(demo(), R);
  const before = haveCounts(s).get('credit_card');
  const r = addPicked(s, [{ key: 'credit_card', count: 2 }, { key: 'ex-rent' }, { key: 'ex-streaming-and-apps' }, { key: 'in-1099' }], '2026-10-23');
  assert.equal(r.count, 5);
  assert.equal(haveCounts(r.spine).get('credit_card'), before + 2);
  for (const p of r.added) assert.equal(getAt(r.spine, p).kind, 'missing', p + ' starts blank');
  const stream = r.spine.expenses.find((e) => e.label === 'Streaming and apps');
  assert.equal(stream.subscription.value, true, 'streaming is a subscription');
  assert.equal(r.spine.expenses.find((e) => e.label === 'Rent').fat, 'accommodation');
  assert.ok(validate(applyDefaults(r.spine, R)).ok);
  assert.ok(STARTER.every((g) => g.items.length), 'every group has choices');
  assert.throws(() => addPicked(s, [{ key: 'nope' }], '2026-10-23'));
});

// ------------------------------------------------------------------ the profile file (S-195)
import { fingerprint } from '../ui/profile-file.js';

test('the profile file: a saved Ledger loads back the same, and its fingerprint tells edits apart', () => {
  const s = applyDefaults(demo(), R);
  const edited = editFact(s, 'debts.' + s.debts[0].id + '.balance', 'set', { value: 1234, kind: 'known', today: '2026-10-23' });
  const file = JSON.parse(JSON.stringify(edited, null, 2));
  const back = applyDefaults(loadHousehold(file), R);
  assert.deepEqual(back, edited, 'every field, kind, date and source comes back');
  assert.ok(validate(back).ok);
  assert.equal(fingerprint(back), fingerprint(edited));
  assert.notEqual(fingerprint(s), fingerprint(edited), 'an edit changes the fingerprint');
});

// S-199: an income stream's amount, how often, dates and pay day are one row with one panel.
test('income: one row says how much, how often, since when and the day paid; the panel edits all of it', () => {
  let s = demo();
  const row = ledgerRows(s).flatMap((g) => g.rows).find((r) => r.path === 'income.salary.amount');
  assert.equal(row.type, 'income');
  assert.deepEqual(row.fact.value, { amount: 6000, cadence: 'monthly', start: '2024-01-01', end: null, payDay: 15 });
  s = editIncome(s, 'salary', { amount: 6200, cadence: 'semimonthly', start: '2024-01-01', end: '2027-06-30', payDay: 15, kind: 'known', label: 'Salary (new title)' }, '2026-10-23');
  const x = s.income.find((i) => i.id === 'salary');
  assert.deepEqual([x.amount.value, x.cadence, x.start, x.end, x.payDay.value, x.label], [6200, 'semimonthly', '2024-01-01', '2027-06-30', 15, 'Salary (new title)']);
  assert.ok(validate(s).ok);
  // The pay day lives on the amount's row, never as a row of its own; every Fact still shows once.
  const rows = ledgerRows(s).flatMap((g) => g.rows);
  assert.equal(rows.filter((r) => r.path.startsWith('income.salary.')).some((r) => r.path.endsWith('.payDay')), false);
  assert.equal(rowPathFor(s, 'income.salary.payDay'), 'income.salary.amount');
  assert.equal(rows.length, listFacts(s).length - 2 - listFacts(s).filter((x) => /\.payDay$/.test(x.path)).length, 'the two card intro facts and every pay day fold into their rows');
  // A blank clears a date; a pay day of null drops the field; bad dates are refused.
  s = editIncome(s, 'salary', { amount: 6200, cadence: 'monthly', end: null, payDay: null }, '2026-10-23');
  assert.equal(s.income.find((i) => i.id === 'salary').end, null);
  assert.equal('payDay' in s.income.find((i) => i.id === 'salary'), false);
  assert.throws(() => editIncome(s, 'salary', { amount: 1, cadence: 'monthly', start: '2027-01-01', end: '2026-01-01' }, '2026-10-23'), /ends before/);
  assert.throws(() => editIncome(s, 'salary', { amount: 1, cadence: 'once', start: null }, '2026-10-23'), /date it is paid/);
  assert.throws(() => editIncome(s, 'salary', { amount: 1, cadence: 'monthly', payDay: 40 }, '2026-10-23'), /1 to 31/);
  // The month-by-month numbers follow the dates: a salary that ends in June is gone in July.
  s = editIncome(s, 'salary', { amount: 6000, cadence: 'monthly', end: '2027-06-30' }, '2026-10-23');
  assert.equal(cashflow(s, R, '2027-07').income.gross.value, 500, 'only the tutoring is left');
});

test('expense: the panel sets when it starts and ends; blank is open-ended', () => {
  let s = demo();
  s = editExpense(s, 'gym', { amount: 50, cadence: 'monthly', start: '2027-01-01', end: '2027-12-31' }, '2026-10-23');
  const e = s.expenses.find((x) => x.id === 'gym');
  assert.deepEqual([e.start, e.end], ['2027-01-01', '2027-12-31']);
  assert.equal(cashflow(s, R, '2026-11').expenses.items.some((i) => i.id === 'gym'), false, 'not yet');
  assert.equal(cashflow(s, R, '2027-03').expenses.items.find((i) => i.id === 'gym').amount, 50);
  s = editExpense(s, 'gym', { amount: 50, cadence: 'monthly', start: null, end: '' }, '2026-10-23');
  assert.deepEqual([s.expenses.find((x) => x.id === 'gym').start, s.expenses.find((x) => x.id === 'gym').end], [null, null]);
  assert.throws(() => editExpense(s, 'gym', { amount: 50, cadence: 'monthly', start: '2027-05-01', end: '2027-01-01' }, '2026-10-23'), /ends before/);
  assert.ok(validate(s).ok);
});
