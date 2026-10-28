// Fields never collide (owner, 2026-10-28): the rules are written down, the check exists, and the Session's rows wrap
// rather than squeeze, label each box and keep their pickers' choices short.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
test('the collide rules, the check, and the Session rows that follow them', () => {
  const design = read('DESIGN.md');
  for (const n of ['23.', '24.', '25.', '26.', '27.']) assert.ok(design.includes('\n' + n + ' '), 'DESIGN.md rule ' + n);
  assert.ok(existsSync(new URL('../tools/collide-check.mjs', import.meta.url)));
  const css = read('ui/spine.css'), s = read('ui/guide.js');
  assert.doesNotMatch(css, /\.srow \{ flex-wrap: nowrap; \}/, 'a row wraps before it squeezes');
  assert.match(css, /\.srow-name \{ flex: 1 0 10rem;/, 'a name never shrinks below 10rem');
  assert.doesNotMatch(css, /\.srow \.pick-box \{ max-width: 12rem; \}/, 'a picker is as wide as its choice');
  // The Owed label carries the balance's guess chip (S-292); the rest are plain words.
  for (const cap of ["cell('Name', wrap, id)", "cell(['Owed', ' ', guessChip(", "cell('Rate (%)'", "cell('Payment a month'", "cell('Due day'", "cell('Paid in full each month?'"]) assert.ok(s.includes(cap), cap);
  assert.doesNotMatch(s, /Paid in full\? Not set \(counted as carried\)/, 'the question is in the label, not the choice');
});
