// Keyboard shortcuts (overnight Track J): the list names every key the brief asks for, and none fire while typing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../ui/shortcuts.js', import.meta.url), 'utf8');
test('g then t/s/m/c/p, n, /, z and ? are listed and handled; typing is left alone', () => {
  for (const k of ["'g t'", "'g s'", "'g m'", "'g c'", "'g p'", "['n',", "['/',", "['z',", "['?',"]) assert.ok(src.includes(k), k);
  for (const [k, page] of [['t', 'dashboard'], ['s', 'session'], ['m', 'ledger'], ['c', 'calendar'], ['p', 'plan']]) assert.match(src, new RegExp(k + ": '" + page + "\\.html'"));
  assert.match(src, /typing\(e\.target\)\) return;/);
  assert.match(readFileSync(new URL('../ui/shell.js', import.meta.url), 'utf8'), /installShortcuts\(\{ undo: doUndo, redo: doRedo, typing, say \}\)/);
});
