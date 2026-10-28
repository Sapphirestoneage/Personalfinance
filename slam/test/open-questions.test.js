// One list of open questions (morning answer 10, S-252): missing numbers and guesses worth checking now, each with
// its section; every count reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { stillGuessing } from '../engine/ledger.js';
import { openQuestions, openCounts, isOpenItem } from '../engine/questions.js';
import { worthNow } from '../ui/urgency.js';

const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const SRC = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the demo\'s open questions: each missing number and each guess worth checking now, by section', () => {
  const s = demo(), g = stillGuessing(s, R), list = openQuestions(s, g);
  assert.equal(list.length, g.items.filter((x) => isOpenItem(x) && !x.path.startsWith('profile.')).length);
  assert.ok(list.every((q) => ['missing', 'checkNow'].includes(q.kind) && q.section && q.label));
  assert.ok(g.items.filter((x) => x.kind === 'missing' && x.urgency !== 'later').every((x) => list.some((q) => q.path === x.path)), 'every missing number is open');
  assert.ok(!list.some((q) => q.kind === 'checkNow' && g.items.find((x) => x.path === q.path).urgency !== 'now'), 'a guess fine for now is not');
  const c = openCounts(list);
  assert.equal(c.total, ['debt', 'assets', 'taxes', 'income', 'needs', 'goals', 'profile'].reduce((n, k) => n + c[k], 0), 'the sections add up to the total');
  assert.equal(list.find((q) => q.path === 'assumptions.realReturn').section, 'profile', 'the assumptions sit under Profile in My numbers');
});

test('a row\'s mark and the counts use the same rule', () => {
  const s = demo(), g = stillGuessing(s, R), list = openQuestions(s, g);
  const map = new Map(g.items.map((x) => [x.path, { urgency: x.urgency }]));
  for (const x of g.items) assert.equal(worthNow(map, x.path, x.kind), list.some((q) => q.path === x.path) || x.path.startsWith('profile.'), x.path);
  // A missing number set to check later is not open until its day.
  assert.equal(isOpenItem({ kind: 'missing', urgency: 'later' }), false);
});

test('My numbers, Taxes, Session, Still guessing, Today and the Profile all count from the one list', () => {
  assert.match(SRC('ui/ledger.js'), /const toFill = \(x\) => openRows\(/);
  assert.match(SRC('ui/ledger.js'), /const nowCount = \(\) => \(guess \? openQuestions\(cur\(\), guess\)\.length : null\);/);
  assert.match(SRC('ui/guide.js'), /openCounts\(openQuestions\(ctx\.spine, g\)\)/);
  assert.match(SRC('ui/profile.js'), /openQuestions\(spine, guessesFor\(spine, rules/);
  assert.match(SRC('ui/dashboard.js'), /openQuestions\(base, g\)\.length/);
  assert.match(SRC('tools/agree-check.mjs'), /'ledger\.html#\/taxes', 'ledger\.html#\/profile', 'ledger\.html#\/still-guessing', 'profile\.html'/);
});
