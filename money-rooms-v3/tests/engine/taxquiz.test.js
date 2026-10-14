import { test } from 'node:test';
import assert from 'node:assert/strict';
import { federalBrackets, federalTax, saversCredit } from '../../engine/tax.js';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { taxQuiz, setTaxAnswer, taxAnswersOf, quizCounts } from '../../engine/taxquiz.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const T = data.tax2026; const TODAY = '2026-10-12';

test('the federal brackets are the formula: the lines sum to the tax, the last line is the marginal rate, and a zero income has no lines', () => {
  const lines = federalBrackets(T, 7500000, 'single'); const tax = federalTax(T, 7500000, 'single');
  assert.equal(lines.reduce((s, l) => s + l.tax, 0), tax.tax); assert.equal(lines[lines.length - 1].rate, tax.marginal);
  assert.equal(lines.reduce((s, l) => s + l.base, 0), 7500000, 'the slices cover the taxable income');
  assert.deepEqual(federalBrackets(T, 0, 'single'), []); assert.equal(federalTax(T, 0, 'mfj').marginal, 0);
});

test("the saver's credit: a share by AGI tier, capped per person, two people when married, nothing above the last tier", () => {
  const c = T.credits.saversCredit;
  assert.deepEqual(saversCredit(T, 'single', c.tiers.single[0][0], 300000), { credit: 100000, share: 0.5 }, 'half of the capped 2,000');
  assert.equal(saversCredit(T, 'mfj', c.tiers.mfj[0][0], 600000).credit, 200000, 'two people, two caps');
  assert.equal(saversCredit(T, 'single', c.tiers.single[2][0] + 1, 200000).credit, 0);
  assert.equal(saversCredit(T, 'hoh', c.tiers.hoh[1][0], 100000).share, 0.2);
});

test('Leah: the return line by line reconciles with the breakdown; every line carries an amount, the taxed ones a base and a rate', () => {
  const rec = loadHousehold('leah'); const R = compute(rec, data, { today: TODAY }); const S = R.sun.outputs.taxes; const B = S.breakdown; const L = S.lines;
  const by = id => L.find(l => l.id === id);
  assert.ok(L.length >= 12); assert.ok(L.every(l => typeof l.amount === 'number' && l.label && l.kind));
  assert.equal(by('gross').amount, B.gross); assert.equal(by('pretax').amount, -B.pretax); assert.equal(by('deduction').amount, -B.deduction);
  assert.equal(L.filter(l => /^federal\d/.test(l.id)).reduce((s, l) => s + l.amount, 0), B.federalBeforeCredits, 'the bracket lines sum to federal before credits');
  assert.ok(L.filter(l => /^federal\d/.test(l.id)).every(l => l.base > 0 && l.rate > 0 && /percent/.test(l.label)));
  assert.equal(by('federal').amount, B.federal); assert.equal(by('state').amount, B.state); assert.equal(by('state').rate, B.stateRate);
  assert.equal(by('ss').amount, B.socialSecurity); assert.equal(by('ss').rate, T.fica.socialSecurityRate); assert.equal(by('medicare').rate, T.fica.medicareRate);
  assert.equal(by('se').amount, B.selfEmployment); assert.equal(by('total').amount, B.total); assert.equal(by('total').rate, S.totalRate); assert.equal(by('takeHome').amount, B.takeHome);
  assert.equal(L[L.length - 1].id, 'takeHome'); assert.equal(L[0].id, 'gross');
  assert.ok(!by('ctc') && !by('saver'), 'no credit line when none applies');
});

test('a low earner with a 401(k): the saver\'s credit counts as a credit line and a counted lever, and lowers federal after credits', () => {
  const rec = createRecord(); setField(rec, 'sun', 'filingStatus', 'single', 'known', 'client'); setField(rec, 'sun', 'state', 'TX', 'known', 'client');
  const job = createRow('income', 'w2', { nickname: 'Job', f: freshFacts(data.fields, 'income', 'w2') }); addRow(rec, job, { session: null });
  setField(rec, job.id, 'grossPay', 200000, 'known', 'client', { cad: 'month' }); setField(rec, job.id, 'pretaxRetirement', 10000, 'known', 'client', { cad: 'month' });
  const R = compute(rec, data, { today: TODAY }); const S = R.sun.outputs.taxes;
  const line = S.lines.find(l => l.id === 'saver'); assert.ok(line && line.amount < 0 && line.rate > 0 && line.base === 120000, JSON.stringify(line));
  assert.ok(S.levers.some(l => l.id === 'saver' && l.counted && l.savesAnnual === -line.amount));
  assert.equal(S.breakdown.federal, S.breakdown.federalBeforeCredits - S.breakdown.credits);
  assert.ok(S.breakdown.credits >= -line.amount);
});

test('the questions: answers live in record.tax and journal as a section; a yes without the fact says what to add; the fact once added counts; a counted fact answers its own question', () => {
  const rec = loadHousehold('leah'); const n0 = rec.journal.length;
  const q0 = taxQuiz(rec, data); assert.equal(q0.length, data.taxQuestions.questions.length);
  const sl = q0.find(x => x.id === 'studentLoan'); assert.ok(sl.done && sl.answer === true && sl.said === null, 'Leah has a student loan row, so the question reads yes');
  const ch = q0.find(x => x.id === 'charity'); assert.equal(ch.answer, null); assert.equal(ch.next, null);
  assert.equal(setTaxAnswer(rec, 'charity', true, { session: null }).kind, 'section'); assert.equal(rec.journal.length, n0 + 1); assert.deepEqual(taxAnswersOf(rec), { charity: true });
  const q1 = taxQuiz(rec, data); const ch1 = q1.find(x => x.id === 'charity');
  assert.ok(ch1.next && ch1.next.add.planet === 'taxes' && ch1.next.add.type === 'deduction' && ch1.next.add.value === 'charity' && ch1.next.href === '#/ledger/taxes/deduction');
  const row = createRow('taxes', 'deduction', { f: freshFacts(data.fields, 'taxes', 'deduction') }); addRow(rec, row, { session: null }); setField(rec, row.id, 'deductionKind', 'charity', 'known', 'client');
  const q2 = taxQuiz(rec, data); assert.ok(q2.find(x => x.id === 'charity').done && q2.find(x => x.id === 'charity').next === null);
  assert.equal(setTaxAnswer(rec, 'charity', true, { session: null }), null, 'the same answer again is no change');
  setTaxAnswer(rec, 'married', false, { session: null }); assert.equal(taxQuiz(rec, data).find(x => x.id === 'married').answer, false);
  const m = taxQuiz(rec, data).find(x => x.id === 'married'); assert.ok(m.next === null && !m.done);
  setTaxAnswer(rec, 'marketplace', true, { session: null }); const mk = taxQuiz(rec, data).find(x => x.id === 'marketplace'); assert.ok(mk.note && mk.next && mk.next.add === null);
  const R = compute(rec, data, { today: TODAY }); assert.ok(R.sun.outputs.taxes.levers.some(l => l.id === 'premium' && l.savesAnnual === null), 'a marketplace plan lists the premium tax credit as something to bring');
  const c = quizCounts(taxQuiz(rec, data)); assert.equal(c.total, q0.length); assert.ok(c.answered >= 3 && c.open === 0, JSON.stringify(c));
  setTaxAnswer(rec, 'married', null, { session: null }); assert.equal(taxAnswersOf(rec).married, undefined, 'a cleared answer goes');
});

test('the fact-shaped questions read Household facts and the any-shaped ones read every room they name', () => {
  const rec = createRecord(); const q = id => taxQuiz(rec, data).find(x => x.id === id);
  assert.ok(!q('married').done && !q('dependents').done && !q('retirement').done && !q('hsa').done && !q('home').done);
  setField(rec, 'sun', 'filingStatus', 'mfj', 'known', 'client'); setField(rec, 'sun', 'dependents', 2, 'known', 'client');
  assert.ok(q('married').done && q('dependents').done);
  const acct = createRow('invest', 'account', { f: freshFacts(data.fields, 'invest', 'account') }); addRow(rec, acct, { session: null }); setField(rec, acct.id, 'accountType', 'rothIra', 'known', 'client');
  assert.ok(q('retirement').done, 'an IRA account counts');
  const mort = createRow('debt', 'mortgage', { f: freshFacts(data.fields, 'debt', 'mortgage') }); addRow(rec, mort, { session: null });
  assert.ok(q('home').done, 'a mortgage row counts');
  setTaxAnswer(rec, 'hsa', true, { session: null }); assert.equal(q('hsa').next.add.planet, 'income', 'the first add of an any-shaped yes is the pay row');
});
