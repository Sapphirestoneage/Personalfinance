// The map and "you are here" (S-280, S-281): the header, five tabs, second-level tabs, the trail from the client, the
// siblings strip, covered today. Source checks; the pages themselves are walked by tools/trunk-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the header holds the site ID, the client, search, Undo, Redo, End call and the gear: nothing else', () => {
  const src = read('ui/shell.js');
  const head = src.slice(src.indexOf('function siteHead()'), src.indexOf('// Under the header and the tabs'));
  const order = ["class: 'site-id'", 'whoseMenu(', 'searchButton(', 'doUndo', 'doRedo', "'End call'", "'coach-menu'"].map((x) => head.indexOf(x));
  assert.ok(order.every((x) => x > 0), 'all seven are there');
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'left to right in the brief\'s order');
  assert.match(head, /'Stress Less'/);
});

test('second-level tabs: Numbers and Plan, as the brief names them, marked with two cues', () => {
  const src = read('ui/shell.js');
  assert.match(src, /numbers: \[\['needs', 'Needs'[^\n]*\['debt', 'Debt'[^\n]*\['income', 'Income'[^\n]*\['assets', 'Assets'[^\n]*\['goals', 'Goals'[^\n]*\['protection', 'Protection'/);
  assert.match(src, /plan: \[\['overview', 'Overview'[^\n]*\['debt', 'Debt'[^\n]*\['retirement', 'Retirement and tax'[^\n]*\['protection', 'Protection'[^\n]*\['extra', 'Extra money', 'windfall\.html'\]/);
  const css = read('ui/spine.css');
  // The tab you are on: the page's own color (joined to it), bold, and a colored edge.
  assert.match(css, /\.tabbar \.tab-item\.is-here \.tab, \.subtabs \.tab-item\.is-here \.tab \{ background: var\(--bg\);[^}]*font-weight: 800;/);
});

test('the trail starts with the client, uses ">" and ends bold and unlinked', () => {
  const src = read('ui/shell.js');
  assert.match(src, /if \(opts\.household && hist\) steps\.push\(\[whose\(hist\.present\)\.name, HOME_HREF, null\]\);/);
  assert.match(src, /i === steps\.length - 1 \? h\('strong', \{\}, st\[0\]\) : link\(st\)/);
  assert.match(read('ui/spine.css'), /\.trail li \+ li::before \{ content: ">";/);
});

test('item and group screens show their siblings; rows covered today get a check', () => {
  const src = read('ui/ledger.js');
  assert.match(src, /g\.items \? itemSiblings\(sec, g, it\) : null,/);
  assert.match(src, /groupSiblings\(sec, g\),/);
  assert.match(src, /coveredMark\(coveredToday\(it\)\)/);
  assert.match(read('ui/siblings.js'), /'Jump to'/);
});

test('old addresses still land: Session is Guide me, the front door is Home, Got extra money? is Extra money', () => {
  assert.match(read('session.html'), /location\.replace\('ledger\.html\?guide=1'/);
  assert.match(read('index.html'), /location\.replace\('dashboard\.html'/);
  assert.match(read('ui/windfall.js'), /title: 'Extra money', subtab: \(\) => 'extra'/);
});
