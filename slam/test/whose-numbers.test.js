// Bug sweep, step 2: whose numbers. The example, once edited, is the person's own: the header never says "Example
// household" over numbers someone changed. The first edit says once to keep a copy. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson } from './spine-helpers.js';
import { readHousehold } from '../engine/normalize.js';
import { whose, yours } from '../ui/household.js';

const demo = () => readHousehold(readJson('fixtures/demo.json'), { today: '2026-10-27' }).spine;

test('an edited example is not the example; it reads the person\'s name, or "Your household"', () => {
  assert.equal(whose(demo()).name, 'Example household');
  const edited = yours(demo());
  assert.equal(edited.meta.demo, false);
  assert.notEqual(whose(edited).name, 'Example household');
  assert.equal(whose(edited).name, 'Casey Rivera');
  const nameless = yours(demo()); nameless.household = { ...nameless.household, people: [{ ...nameless.household.people[0], name: '' }] };
  assert.equal(whose(nameless).name, 'Your household');
});

test('the shell makes the first edit theirs and says once to keep a copy; the example asks before it replaces', () => {
  const shell = readFileSync(SLAM + 'ui/shell.js', 'utf8');
  assert.match(shell, /if \(mine\) doc = yours\(doc\);/);
  assert.match(shell, /'These are your numbers now\. Download a copy to keep them safe\.'/);
  const builder = readFileSync(SLAM + 'ui/builder.js', 'utf8');
  assert.match(builder, /if \(keptIsYours\(\) && !confirm\(/);
  assert.match(builder, /'Try with example numbers'/);
});
