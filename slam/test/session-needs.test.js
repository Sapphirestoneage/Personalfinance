// The Session's Needs lines (S-243): one shape for every line, Need | Want | No on each, Details under the line, and a
// total on every part. Source checks: the screen runs in a browser, so the words and the pieces are read from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('every Needs line is one shape: name, amount a month, Need | Want | No, Details', () => {
  const src = read('ui/session.js');
  // One row builder, used for a line in your numbers and one that is not; no second shape for an empty line.
  assert.equal((src.match(/function needRow\(/g) || []).length, 1);
  assert.ok(!/if \(!e\) return lineRow\(/.test(src), 'an empty line is not a different row');
  assert.match(src, /h\('div', \{ class: 'nrow-main' \}, name, amt, needWantNo\(e, item, fat, key\), toggle\)/);
  // The three choices sit in one control; No on an empty line hides it, on a filled line takes it out (undoable).
  assert.match(src, /seg\('nw-' \+ key, need === true, 'Need'/);
  assert.match(src, /seg\('nw-' \+ key \+ '-want', need === false, 'Want'/);
  assert.match(src, /seg\('nw-' \+ key \+ '-no', false, 'No', no\)/);
  assert.match(src, /if \(e\) change\(\(s\) => removeItem\(s, 'expenses', e\.id\)/);
  // The amount box says what it is for; the day paid is under Details, with who pays and how sure.
  assert.match(src, /setLineAmount\(item, fat, x\), 'a month'\)/);
  assert.match(src, /field\('nday-' \+ key, 'Day paid'/);
  assert.match(src, /\['known', 'Known'\], \['rough', 'A rough guess'\]/);
  assert.match(src, /'aria-expanded': String\(open\), 'aria-controls': 'nd-' \+ key/);
});

test('each part of Needs says what it adds up to, from the step total\'s own figures', () => {
  const src = read('ui/session.js');
  assert.match(src, /function partTotal\(s, spine, ids\)/);
  assert.match(src, /s\.cashflow\.expenses\.items\.filter\(\(x\) => ids\.has\(x\.id\)/, 'the lines are summed from the cashflow, not refigured');
  assert.match(src, /partTotal\(s, spine, ids\)\)/);
  assert.match(src, /'Nothing yet'/);
});

test('the Needs line is in the design kit and the styles, in every state', () => {
  const kit = read('affordances.html');
  for (const s of ['class="srow nrow"', 'class="nrow-main"', 'class="nrow-detail"', 'aria-expanded="true"', 'aria-expanded="false"', 'class="cat-sum"']) assert.ok(kit.includes(s), s);
  const css = read('ui/spine.css');
  for (const s of ['.srow.nrow', '.nrow-main', '.nrow-detail', '.nrow-toggle[aria-expanded="true"] .chev', '.nw-seg .seg-btn + .seg-btn', '.cat-sum']) assert.ok(css.includes(s), s);
});
