// Tests of the tests (S-288, Part 9): the trunk test, the squint kit and the friction audit's new columns are there and
// say what they check. Source checks; the tools themselves need a browser (node tools/trunk-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the trunk test checks the seven things and the accessibility basics, at both widths', () => {
  const src = read('tools/trunk-check.mjs');
  for (const k of ['siteId', 'pageName', 'sections', 'options', 'youAreHere', 'search', 'firstThing', 'headings', 'labels', 'skipLink', 'zoom', 'tapSize']) assert.match(src, new RegExp('out\\.' + k + ' = '), k);
  assert.match(src, /\['phone', 375, 740\], \['computer', 1280, 800\]/);
  assert.match(src, /docs\/TRUNK_TEST\.md/);
  assert.ok(existsSync(new URL('../docs/TRUNK_TEST.md', import.meta.url)), 'the report is written');
  assert.match(read('docs/TRUNK_TEST.md'), /Result: every check passes/);
});

test('the squint kit: six screens, at least two deep, blurred, with the two-minute instructions', () => {
  const src = read('tools/squint-kit.mjs');
  assert.match(src, /filter\(\(p\) => p\[2\] >= 3\)\)\.slice\(0, 2\)/);
  assert.match(src, /slice\(0, 4\)/);
  const page = read('docs/squint-test.html');
  assert.equal((page.match(/class="shot"/g) || []).length, 6);
  assert.match(page, /filter: blur\(/);
  assert.match(page, /two minutes/i);
  for (const w of ['site ID', 'page name', 'main sections', 'options at this level', 'you are here', 'search']) assert.ok(page.includes(w), w);
  assert.match(read('BOARD.md'), /squint-test\.html/);
});

test('the friction audit reports keys per number, page changes and typed against confirmed, before and after', () => {
  const src = read('tools/friction-audit.mjs');
  assert.match(src, /Keys per number/);
  assert.match(src, /Page changes/);
  assert.match(src, /Fields typed \/ confirmed/);
  assert.match(src, /r\.looksRight = async/);
  assert.match(src, /ledger\.html\?guide=1/);
});
