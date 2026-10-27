// Audit 7: protection gaps from the Profile rank right after the starter emergency fund; the Repayment Assistance
// Plan sits beside income-driven repayment, from rules marked verify. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { rankSteps } from '../engine/next-step.js';
import { protectionGaps, applyAnswer } from '../engine/profile.js';
import { idr } from '../engine/debtview.js';

const R = loadRules();
const demo = (edit = (r) => r) => applyDefaults(loadHousehold(edit(readJson('fixtures/demo.json'))), R);

test('a gap is only a gap when it applies; not sure is never one', () => {
  assert.deepEqual(protectionGaps({ work: 'w2', disability: 'none', homeInsurance: 'no', home: 'rent' }).map((g) => g.label), ['Get disability insurance', 'Get renters insurance']);
  assert.deepEqual(protectionGaps({ work: 'retired', disability: 'none', lifeInsurance: 'none', will: 'no', dependents: 'no' }), []);
  assert.deepEqual(protectionGaps({ dependents: 'yes', lifeInsurance: 'none', will: 'no', beneficiaries: 'notSure' }).map((g) => g.id), ['lifeInsurance', 'will']);
});

test('the demo has no gap, so its first step is still the debt one; a gap ranks right after the starter fund', () => {
  const s0 = demo();
  assert.equal(rankSteps(s0, R, summarize(s0, R)).first.label, 'Clear the Store card before its intro rate ends');
  const s1 = applyDefaults(applyAnswer(s0, 'disability', 'none', { today: '2026-10-27' }), R);
  const r = rankSteps(s1, R, summarize(s1, R));
  const starter = r.ladder.rungs.find((x) => x.id === 'deductibles');
  const i = r.steps.findIndex((x) => x.id === 'protect:disability');
  assert.ok(i >= 0);
  if (starter.done === true) assert.equal(i, 0, 'the starter fund is there, so protection leads');
  else assert.ok(i > r.steps.findIndex((x) => x.rung === 'deductibles'));
  assert.equal(r.steps[i].href, 'profile.html#/protect');
});

test('the Repayment Assistance Plan: share by $10,000 band, a dependent credit, a $10 floor, 30 years', () => {
  const s0 = demo((r) => { r.household.householdSize = { value: 3, kind: 'known', asOf: '2026-10-01', source: 'test' }; return r; });
  const s = summarize(s0, R);
  const l = idr(s0, R, s0.debts.find((d) => d.type === 'student_loan'), s);
  const share = Math.min(0.1, Math.floor(l.agi / 10000) * 0.01);
  assert.equal(l.rap.share, share);
  assert.equal(l.rap.payment, Math.max(10, Math.round((l.agi * share / 12 - 100) * 100) / 100));
  assert.equal(l.rap.payments, 360);
  for (const id of ['RAP_BAND', 'RAP_SHARE_PER_BAND', 'RAP_SHARE_MAX', 'RAP_MIN_PAYMENT', 'RAP_DEPENDENT_CREDIT', 'RAP_FORGIVENESS_PAYMENTS']) assert.ok(R.has(id, 2026), id);
});
