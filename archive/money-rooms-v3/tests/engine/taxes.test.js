import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateTax, localTax, childTaxCredit, eitc, creditFor, studentLoanDeduction, itemized, federalTax, standardDeduction } from '../../engine/tax.js';
import { compute } from '../../engine/compute.js';
import { createRecord, createRow, addRow, setField } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { taxFlow } from '../../engine/chartdata.js';
import { loadData, loadHousehold } from './load-data.js';

const data = loadData(); const T = data.tax2026; const TODAY = '2026-10-12';

test('state and local stand-ins: a flat rate by state, zero where there is none, a city rate where one exists, null when the state is unknown', () => {
  assert.equal(stateTax(T, 5000000, 'TX').tax, 0); assert.equal(stateTax(T, 5000000, 'CA').tax, Math.round(5000000 * T.stateIncomeTax.rates.CA));
  assert.equal(stateTax(T, 5000000, null).rate, null); assert.equal(stateTax(T, -100, 'CA').tax, 0);
  assert.equal(localTax(T, 6000000, 'new york').tax, Math.round(6000000 * 0.035)); assert.equal(localTax(T, 6000000, 'Oakland').tax, 0);
  assert.equal(Object.keys(T.stateIncomeTax.rates).length, 51);
});

test('credits: the child tax credit phases out, the EITC phases in and out and is refundable, the typed kinds follow their rules', () => {
  assert.deepEqual(childTaxCredit(T, 'single', 0, 5000000), { total: 0, refundable: 0 });
  const two = childTaxCredit(T, 'mfj', 2, 10000000); assert.equal(two.total, 440000); assert.equal(two.refundable, 340000);
  assert.ok(childTaxCredit(T, 'single', 1, 21000000).total < 220000, 'phased out above the start');
  assert.equal(eitc(T, 'single', 0, 0, 0), 0);
  const one = eitc(T, 'single', 1, 1500000, 1500000); assert.equal(one, T.credits.eitc.byChildren['1'].max, 'on the plateau');
  assert.ok(eitc(T, 'single', 1, 3000000, 3000000) < one && eitc(T, 'single', 1, 3000000, 3000000) > 0, 'phasing out');
  assert.equal(eitc(T, 'single', 1, 6000000, 6000000), 0, 'out of range');
  assert.equal(creditFor(T, 'childcare', 800000, 1), Math.round(300000 * 0.2)); assert.equal(creditFor(T, 'education', 500000, 0), 250000); assert.equal(creditFor(T, 'energy', 1000000, 0), 120000); assert.equal(creditFor(T, 'other', 50000, 0), 50000);
});

test('deductions: student loan interest up to the cap and phased out; itemizing sums charity, medical above the floor, mortgage interest and capped SALT', () => {
  assert.equal(studentLoanDeduction(T, 180000, 5000000, 'single'), 180000); assert.equal(studentLoanDeduction(T, 400000, 5000000, 'single'), 250000); assert.equal(studentLoanDeduction(T, 180000, 12000000, 'single'), 0);
  const it = itemized(T, { charity: 300000, medical: 1000000, mortgageInterest: 1200000, stateIncomeTax: 3000000, propertyTax: 2000000 }, 8000000);
  assert.equal(it.medical, 1000000 - 600000); assert.equal(it.salt, T.deductions.saltCap); assert.equal(it.total, 300000 + 400000 + 1200000 + T.deductions.saltCap);
});

test('Leah: the planet publishes the full picture; federalAnnual stays the plain figure; the all-in rate and the levers are there', () => {
  const rec = loadHousehold('leah'); const R = compute(rec, data, { today: TODAY }); const S = R.sun.outputs.taxes; const B = S.breakdown;
  assert.ok(B && B.gross > 0); assert.equal(B.stateRate, T.stateIncomeTax.rates.CA); assert.equal(B.local, 0, 'Oakland has no city tax');
  assert.equal(B.total, B.federal + B.state + B.local + B.socialSecurity + B.medicare + B.selfEmployment);
  assert.equal(S.totalRate, B.total / B.gross); assert.ok(S.totalRate > S.effectiveRate, 'every tax beats federal alone');
  assert.equal(R.metrics.totalTaxRate.status, 'ok'); assert.equal(R.metrics.totalTaxRate.value.value, S.totalRate);
  assert.ok(S.deductionChoice.studentLoanInterest > 0, 'the student loan interest is deducted');
  assert.ok(!S.deductionChoice.usesItemized);
  const ids = S.levers.map(l => l.id); assert.ok(ids.includes('itemize') && ids.includes('studentLoan'), ids.join(','));
  assert.ok(S.levers.every((l, i, a) => i === 0 || (a[i - 1].savesAnnual || 0) >= (l.savesAnnual || 0)), 'largest first');
  const flow = taxFlow(R); assert.ok(flow.nodes.length >= 5 && flow.links.every(l => l.value > 0));
  assert.ok(data.glossary.metrics.totalTaxRate && data.charts.charts.taxFlow);
});

test('the room\'s rows: a charity row and a childcare row count; a head-of-household lever appears with a dependent', () => {
  const rec = createRecord(); setField(rec, 'sun', 'filingStatus', 'single', 'known', 'client'); setField(rec, 'sun', 'state', 'NY', 'known', 'client'); setField(rec, 'sun', 'city', 'New York', 'known', 'client'); setField(rec, 'sun', 'dependents', 1, 'known', 'client');
  const job = createRow('income', 'w2', { nickname: 'Job', f: freshFacts(data.fields, 'income', 'w2') }); addRow(rec, job, { session: null }); setField(rec, job.id, 'grossPay', 600000, 'known', 'client', { cad: 'month' });
  const R0 = compute(rec, data, { today: TODAY }); const S0 = R0.sun.outputs.taxes;
  assert.ok(S0.breakdown.local > 0, 'New York has a city tax'); assert.ok(S0.levers.some(l => l.id === 'hoh' && l.savesAnnual > 0)); assert.ok(S0.levers.some(l => l.id === 'ctc' && l.counted));
  const ch = createRow('taxes', 'deduction', { nickname: 'Charity', f: freshFacts(data.fields, 'taxes', 'deduction') }); addRow(rec, ch, { session: null }); setField(rec, ch.id, 'deductionKind', 'charity', 'known', 'client'); setField(rec, ch.id, 'deductionAmount', 2500000, 'known', 'client', { cad: 'year' });
  const cc = createRow('taxes', 'credit', { nickname: 'Daycare', f: freshFacts(data.fields, 'taxes', 'credit') }); addRow(rec, cc, { session: null }); setField(rec, cc.id, 'creditKind', 'childcare', 'known', 'client'); setField(rec, cc.id, 'creditAmount', 600000, 'known', 'client', { cad: 'year' });
  const R = compute(rec, data, { today: TODAY }); const S = R.sun.outputs.taxes;
  assert.ok(S.deductionChoice.usesItemized, 'a large charity gift tips it to itemizing'); assert.ok(S.breakdown.credits > S0.breakdown.credits, 'the childcare credit counts');
  assert.ok(S.breakdown.federal < S0.breakdown.federal);
  assert.ok(S.levers.some(l => l.id === 'itemize' && l.counted) && S.levers.some(l => l.id.startsWith('credit:')));
});
