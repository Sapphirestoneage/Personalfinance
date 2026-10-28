// Phase 2.5, Batch 4: My numbers reads like a financial statement. Liquid and total net worth side by side, each with
// Show the math; the six DATING sections; groups and items biggest first, each group with its total, incomplete (never
// smaller) when a line has no amount.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { summarize } from '../engine/summary.js';
import { ledgerTree, numbersScreens, statementOrder } from '../engine/ledger-tree.js';
import { explainMetric } from '../engine/math.js';
import { editFact } from '../engine/edits.js';

const R = loadRules();
const demo = () => applyDefaults(readHousehold(readJson('fixtures/demo.json'), { today: '2026-10-22' }).spine, R);
const screens = (s) => statementOrder(numbersScreens(ledgerTree(s, { names: [], aliases: {} })), s, summarize(s, R, { flags: false }));

test('groups and items biggest first, each group with its total', () => {
  const sc = screens(demo());
  const sec = (slug) => sc.sections.find((x) => x.slug === slug);
  for (const slug of ['debt', 'assets', 'needs', 'income']) {
    const totals = sec(slug).groups.map((g) => g.total ?? -Infinity);
    assert.deepEqual(totals, [...totals].sort((a, b) => b - a), slug + ' groups biggest first');
    for (const g of sec(slug).groups) {
      const amts = g.items.map((it) => it.amount ?? -Infinity);
      for (const p of g.parts) { const a = p.items.map((it) => it.amount ?? -Infinity); assert.deepEqual(a, [...a].sort((x, y) => y - x), g.label + ' items biggest first'); }
      assert.equal(g.items.length, g.slugs.length);
      if (g.total !== null && g.total !== undefined && !g.totalIncomplete) assert.equal(g.total, Math.round(amts.filter((x) => x !== -Infinity).reduce((a, b) => a + b, 0) * 100) / 100);
    }
  }
  const food = sec('needs').groups.find((g) => g.label === 'Food');
  assert.deepEqual(food.items.map((it) => it.label), ['Groceries', 'Eating out']);
  assert.equal(food.total, 700);
});

test('a blank amount makes its group incomplete, never smaller', () => {
  const s = editFact(demo(), 'expenses.groceries.amount', 'clear', { today: '2026-10-25' });
  const food = screens(s).sections.find((x) => x.slug === 'needs').groups.find((g) => g.label === 'Food');
  assert.equal(food.totalIncomplete, true);
  assert.equal(food.items[food.items.length - 1].label, 'Groceries', 'a blank sorts last');
  const none = editFact(s, 'expenses.dining.amount', 'clear', { today: '2026-10-25' });
  const f2 = screens(none).sections.find((x) => x.slug === 'needs').groups.find((g) => g.label === 'Food');
  assert.equal(f2.total, null, 'every line blank: missing, never $0');
});

test('reachable net worth with Show the math listing what it counts; net worth itself is in the strip', () => {
  const s = demo(), sum = summarize(s, R, { flags: false });
  assert.equal(sum.sheet.liquidNetWorth.value, sum.sheet.liquid.value - sum.sheet.debts.value);
  const e = explainMetric('liquidAssets', { spine: s, rules: R, s: sum });
  assert.deepEqual(e.terms.map((t) => t.label), ['Checking', 'High-yield savings', 'Roth IRA (contributions)', 'Brokerage']);
  const src = readFileSync(new URL('../ui/ledger.js', import.meta.url), 'utf8');
  // Net worth itself is in the headline strip (S-283), so the one tile's Show the math covers both figures.
  assert.match(src, /one\('liquid', 'Reachable after all debts', s\.sheet\.liquidNetWorth, .*\['liquidNetWorth', 'netWorth'\]\)/);
  assert.doesNotMatch(src, /one\('total', 'Net worth'/);
});
