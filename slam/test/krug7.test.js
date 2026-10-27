// The Krug pass, step 7: the long pages made short. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const code = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the One-pager money flow is a short table: what comes in, then each end of the flow added up', async () => {
  const { moneyFlow, flowTable } = await import('../engine/flow.js');
  const { summarize } = await import('../engine/summary.js');
  const s = demo(), sum = summarize(s, R, { flags: false });
  const rows = flowTable(moneyFlow(s, R, sum.cashflow, { open: [] }));
  const ins = rows.filter((r) => r.side === 'in'), outs = rows.filter((r) => r.side === 'out');
  const total = (list) => Math.round(list.reduce((t, r) => t + r.amount, 0));
  assert.equal(total(ins), total(outs), 'everything that comes in ends up somewhere');
  assert.equal(outs.find((r) => r.label === 'Debt payments').amount, 342, 'card payments and the loan, added up once');
  assert.ok(!rows.some((r) => /Checking|Visa|Store card/.test(r.label)), 'accounts and cards in between are not rows');
});

test('Before our first call is one section at a time; the birth year is a number box', () => {
  const src = code('ui/before.js');
  assert.match(src, /'Step ' \+ \(at \+ 1\) \+ ' of ' \+ steps\.length/);
  assert.match(src, /role: 'progressbar'/);
  assert.match(code('ui/profile-q.js'), /if \(q\.kind === 'year'\) \{/);
  assert.doesNotMatch(code('ui/profile-q.js'), /Array\.from\(\{ length: 2015 - 1920/, 'no 95-line year list');
});

test('Assumptions groups start closed and each row is one line; a card folds stress and its charges; Plan has three rows', () => {
  assert.match(code('ui/assumptions.js'), /function oneLine\(name, value, chipEl, action, body\)/);
  assert.match(code('ui/assumptions.js'), /class: 'card as-group done-group', open: openGroups\(\)\.has\(g\.id\) \|\| null/);
  assert.match(code('ui/ledger.js'), /'How you feel about it'/);
  assert.match(code('ui/card-charges.js'), /h\('details', \{ class: 'card charges done-group'/);
  for (const t of ['Your money each month', 'Your future', 'Saved and files']) assert.match(code('ui/plan.js'), new RegExp("fold\\('[a-z]+', '" + t + "'"));
});
