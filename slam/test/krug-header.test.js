// Krug pass, step 1: one header line; search in the header finds any account, debt, bill, income, goal or screen by
// name. The demo household is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { searchIndex, searchFind } from '../ui/search.js';

test('search finds a debt, a bill, an account, income, a goal and a screen, names first', () => {
  const idx = searchIndex(loadHousehold(readJson('fixtures/demo.json')));
  const first = (q) => searchFind(idx, q)[0];
  assert.deepEqual([first('visa').kind, first('visa').href], ['Debt', 'ledger.html#debts.visa.balance']);
  assert.equal(first('rent').kind, 'Bill');
  assert.equal(first('high-yield').kind, 'Account');
  assert.equal(first('tutoring').kind, 'Income');
  assert.equal(first('subscriptions').href, 'ledger.html#/needs/subscriptions');
  assert.ok(searchFind(idx, 'financial independence').some((x) => x.kind === 'Goal'));
  assert.deepEqual(searchFind(idx, '  '), []);
});

test('the header line: wordmark to Today, Back or the trail, the title, then whose, search, Undo and Redo', () => {
  const shell = readFileSync(SLAM + 'ui/shell.js', 'utf8');
  // S-280: the header is the site ID, the client, search, Undo, Redo, End call and the gear; under the tabs, the
  // second-level tabs, the trail (deep levels) and the title.
  assert.match(shell, /h\('a', \{ class: 'site-id', href: HOME_HREF/);
  assert.match(shell, /whoseMenu\(hist\.present,[^]*searchButton\(\(\) => hist\.present[,)][^]*doUndo[^]*doRedo[^]*'End call'[^]*coach-menu/);
  assert.match(shell, /return \[sub, \.\.\.screenTop\(levels, names\), h\('h1', \{ class: 'page-h1' \}, title\)\];/);
});
