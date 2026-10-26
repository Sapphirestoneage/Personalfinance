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
  assert.match(read('ui/dashboard.js'), /result: cf\.savingsRate\.net, shown: pct\(cf\.savingsRate\.net\.value, 1\) \+ ' of take-home'/);
  assert.doesNotMatch(read('ui/dashboard.js'), /' of gross'/);
  assert.match(read('ui/onepager.js'), /'of take-home'/);
  const { DASHBOARD_MATH } = await import('../engine/math.js');
  assert.deepEqual(DASHBOARD_MATH['tile-savings'], ['savingsRateNet', 'savingsRateGross']);
});

test('Batch 6: the Calendar has three numbers on top, the filters, several marked at once, the hint and the legend link', () => {
  const src = read('ui/calendar.js');
  for (const w of ["'Cash today'", "'Left this month'", "'Lowest point'", "['rough', 'Rough or missing']", "'Drag an item to another day to move it. '", "'What the colors mean')", "keys.reduce("]) assert.ok(src.includes(w), w);
  assert.match(read('ui/cash-chart.js'), /tag\(aheadPts, 'Cash'\); tag\(debtPts, 'Debt'\)/);
});
