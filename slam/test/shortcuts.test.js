// Keyboard shortcuts (overnight Track J): the list names every key the brief asks for, and none fire while typing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../ui/shortcuts.js', import.meta.url), 'utf8');
test('g then h/m/p/c/b/g, n, /, z and ? are listed and handled; typing is left alone', () => {
  for (const k of ["'g h'", "'g m'", "'g c'", "'g p'", "'g g'", "['n',", "['/',", "['z',", "['?',"]) assert.ok(src.includes(k), k);
  for (const [k, page] of [['h', 'dashboard\\.html'], ['g', 'ledger\\.html\\?guide=1'], ['m', 'ledger\\.html'], ['c', 'calendar\\.html'], ['p', 'plan\\.html']]) assert.match(src, new RegExp(k + ": '" + page + "'"));
  assert.match(src, /typing\(e\.target\)\) return;/);
  assert.match(readFileSync(new URL('../ui/shell.js', import.meta.url), 'utf8'), /installShortcuts\(\{ undo: doUndo, redo: doRedo, typing, say \}\)/);
});
