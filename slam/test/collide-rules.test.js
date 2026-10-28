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
  for (const cap of ["cell('Owed'", "cell('Rate (%)'", "cell('Payment a month'", "cell('Due day'", "cell('Paid in full each month?'"]) assert.ok(s.includes(cap), cap);
  assert.doesNotMatch(s, /Paid in full\? Not set \(counted as carried\)/, 'the question is in the label, not the choice');
});

// The "$" drawn inside a money box and the "%" inside a rate box never sit on a digit (rule 26, S-289): the box pads
// that side past the symbol, and the rule carries a tag so it outranks the app-wide field reset, which comes later in
// the file with one class of weight and would otherwise take the padding back (30000 read as $0000 on Goals).
test('a money or rate box keeps room for its symbol', () => {
  const css = read('ui/spine.css');
  assert.match(css, /\ndiv\.affix input \{[^}]*padding-left: 1\.6em/, 'the $ box pads the left past the symbol');
  assert.match(css, /\ndiv\.affix-end input \{[^}]*padding-right: 1\.8em/, 'the % box pads the right past the symbol');
  assert.doesNotMatch(css, /\n\.affix(-end)? input \{/, 'one class alone loses to the field reset');
  assert.doesNotMatch(css, /\.list-row \.affix input/, 'one affix rule covers every list');
});
