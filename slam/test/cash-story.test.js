import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadHousehold } from '../engine/normalize.js';
import { cashsim } from '../engine/cashsim.js';
import { cashStory, safeToSpend } from '../engine/spending.js';
import { readJson, loadRules, SLAM } from './spine-helpers.js';

const R = loadRules();
const demo = () => loadHousehold(readJson('fixtures/demo.json'));

test('one cash story: the true lowest point in the window, before any move from savings, and the smallest fix', () => {
  const sim = cashsim(demo(), R, { months: 1 });
  const st = cashStory(sim);
  // The run moves money in from savings, so its own low sits at the floor; the story shows the dip it hides.
  assert.ok(st.low.amount < sim.low.amount, 'the story is the real dip, not the topped-up line');
  assert.deepEqual(st.low, { date: '2026-11-14', amount: -227.11, beforePayday: true });
  assert.equal(st.under, true);
  assert.deepEqual(st.fix, { amount: 228, from: { id: 'hysa', name: 'High-yield savings', balance: 9000 }, by: '2026-11-11', enough: true });
  // Spending's safe to spend reads the same low.
  assert.deepEqual([safeToSpend(sim).low.date, safeToSpend(sim).low.amount], [st.low.date, st.low.amount]);
  // A longer window never hides a later, lower day: the lowest is over the whole window.
  const long = cashStory(cashsim(demo(), R, { months: 12 }));
  assert.ok(long.low.amount <= st.low.amount);
});

test('Today, the Calendar, Spending and the Plan read the one forecast', () => {
  for (const f of ['ui/dashboard.js', 'ui/calendar.js', 'ui/spending.js', 'ui/plan.js']) assert.match(readFileSync(SLAM + f, 'utf8'), /from '\.\/forecast\.js'/, f);
  assert.match(readFileSync(SLAM + 'ui/dashboard.js', 'utf8'), /headlineStrip\(base, rules\),\n(?: {4}\/\/[^\n]*\n)* {4}sentenceCard\(baseOf\(base, rules\)\),\n {4}cashCard\(base, rules\),\n {4}agendaCard/, 'under the floor, it is Home\'s first card after the numbers and the sentence (S-286)');
});
