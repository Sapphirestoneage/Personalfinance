// Slim by default (the rest of the brief): no placeholder that looks typed, every "+ Add" the one shared form, an Add
// from a group starts on that group's kind. The tester (tools/qa-crawl.mjs) checks the same on every page in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { ledgerTree } from '../engine/ledger-tree.js';

const R = loadRules();
const code = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const UI = readdirSync(new URL('../ui/', import.meta.url)).filter((f) => f.endsWith('.js'));

test('no placeholder reads 0 or a number that looks typed (use "e.g. 400")', () => {
  const bad = UI.flatMap((f) => [...code('ui/' + f).matchAll(/placeholder: '([^']*)'/g)].map((m) => [f, m[1]])).filter(([, p]) => /^[$\d][\d,.$]*$/.test(p));
  assert.deepEqual(bad, []);
});

test('maybe money uses the shared add form; the Session goals save as they are typed (owner, 2026-10-28)', () => {
  assert.match(code('ui/calendar.js'), /addForm\(\{ spine: \(\) => current\(\)\.spine, collection: 'maybe'/);
  assert.doesNotMatch(code('ui/guide.js'), /'\+ Add a goal'/);
  assert.match(code('ui/guide.js'), /'Suggests as you type\. Enter or Tab keeps it\.'/);
  assert.match(code('ui/guide.js'), /cell\('Saved so far'/);
});

test('an Add from a group starts on that group\'s kind; only a general Add asks what kind', () => {
  const s = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  const nodes = [];
  const walk = (n) => { nodes.push(n); for (const c of n.children || []) walk(c); };
  for (const n of ledgerTree(s, { names: [], aliases: {} })) walk(n);
  const checking = nodes.find((n) => n.add && n.add.types && n.add.types.length === 1 && n.add.types[0] === 'checking');
  assert.ok(checking, 'the Checking group adds a checking account');
  assert.match(code('ui/add-form.js'), /const typeSel = typeList\.length > 1 \? \(accounts \? accountSelect\(typeList\.map\(\(\[k\]\) => k\), first\) : select\('add-type'/, 'the kind list shows only when there is a choice');
});
