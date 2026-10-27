// Phase 2.5, Part A audit fixes: the front door opens Today, the local file is only looked for on localhost with
// ?local=1, and the savings rate leads with take-home.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('index.html opens Today, and the old client list is reachable only from the Builder', () => {
  const idx = read('index.html');
  assert.match(idx, /dashboard\.html/);
  assert.doesNotMatch(idx, /src\/ui\/app\.js/);
  assert.match(read('clients.html'), /src\/ui\/app\.js/);
  assert.match(read('ui/builder.js'), /'Client list \(old\)', 'clients\.html'/);
  for (const f of ['dashboard.html', 'calendar.html', 'spending.html', 'plan.html', 'ledger.html', 'session.html']) assert.doesNotMatch(read(f), /clients\.html/);
  assert.doesNotMatch(read('ui/shell.js'), /clients\.html/);
});

test('the local file is looked for only on localhost with ?local=1', async () => {
  const { lookForLocalFile } = await import('../ui/household.js');
  const at = (u) => { const x = new URL(u); return { hostname: x.hostname, search: x.search }; };
  assert.equal(lookForLocalFile(at('http://localhost:8000/ledger.html?local=1')), true);
  assert.equal(lookForLocalFile(at('http://127.0.0.1:8000/ledger.html?local=1')), true);
  assert.equal(lookForLocalFile(at('http://localhost:8000/ledger.html')), false);
  assert.equal(lookForLocalFile(at('https://sapphirestoneage.github.io/Personalfinance/slam/ledger.html?local=1')), false);
  assert.equal(lookForLocalFile(at('https://claude.ai/artifact/x?local=1')), false);
  assert.equal(lookForLocalFile(null), false);
});

test('Today and the One-pager lead the savings rate with take-home; gross is in Show the math', async () => {
  // Krug pass: the tile shows the rate alone; its screen says "of take-home".
  assert.match(read('ui/dashboard.js'), /result: cf\.savingsRate\.net, shown: pct\(cf\.savingsRate\.net\.value, 0\)/);
  assert.match(read('ui/dashboard.js'), /h\('p', \{ class: 'tile-value' \}, pct\(cf\.savingsRate\.net\.value, 1\) \+ ' of take-home'\)/);
  assert.doesNotMatch(read('ui/dashboard.js'), /' of gross'/);
  assert.match(read('ui/onepager.js'), /'of take-home'/);
  const { DASHBOARD_MATH } = await import('../engine/math.js');
  assert.deepEqual(DASHBOARD_MATH['tile-savings'], ['savingsRateNet', 'savingsRateGross']);
});

test('Batch 6, made simple: the Calendar leads with its lowest point, the filters fold under Filter, all marked at once', () => {
  const src = read('ui/calendar.js');
  for (const w of ["'Lowest'", "'You stay above your floor through '", "['rough', 'Rough or missing']", "'Filter'", "'Mark all '", "keys.reduce("]) assert.ok(src.includes(w), w);
  // Each line named at its right end (now endLabel on the shared chart module, Track C).
  assert.match(read('ui/cash-chart.js'), /endLabel: 'Debt'[^]*endLabel: 'Cash'/);
});

test('Batch 7: Spending has Do and See; See says its range and has reference lines, never a verdict', async () => {
  const src = read('ui/spending.js');
  assert.match(src, /\[\['do', 'Do'\], \['see', 'Budget'\]\]/, 'See became the Budget view');
  assert.match(src, /'Showing ' \+ windowWords\(m\.compare\)/);
  assert.doesNotMatch(src, /running hot|'on track'/);
  const { referenceBands } = await import('../engine/spending.js');
  // Take-home 3,600 + 400 from pay = 4,000 of pay. Needs: rent 1,500 + groceries 300 + the car line that pays its loan
  // (200, a need) + the card's minimum (100, not on a line) = 2,100 = 52.5%; wants 600 = 15%; saving 800 = 20%.
  const cf = (items, linked) => ({ cashflow: { income: { takeHome: { value: 3600 } }, expenses: { items, linked, need: { value: null }, total: { value: null } }, debtMinimums: { total: { value: 300 } }, saving: { payroll: { value: 400 }, match: { value: 0 }, total: 800 } } });
  const items = [{ amount: 1500, need: true }, { amount: 300, need: true }, { amount: 600, need: false }, { amount: 90, need: true, covered: true }];
  const r = referenceBands(cf(items, [{ amount: 200, need: true }]), JSON.parse(read('data/benchmarks.json')));
  assert.deepEqual(r.rows.map((x) => [x.id, x.share, x.reference]), [['needs', 0.525, 0.5], ['wants', 0.15, 0.3], ['saving', 0.2, 0.2]]);
  assert.ok(r.rows.every((x) => !('verdict' in x) && !('grade' in x)));
  const none = referenceBands(cf([...items, { amount: 50, need: null }], []), JSON.parse(read('data/benchmarks.json')));
  assert.equal(none.rows[0].share, null, 'no needs marked is missing, never 0%');
});
