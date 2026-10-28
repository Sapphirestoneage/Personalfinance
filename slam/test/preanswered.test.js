// Pre-answered, not blank (S-282): every yes / no question has a likely answer shown as a guess and a short phrase for
// the one-line summary; one choice is always chosen and the recommended one says so; Looks right (and Enter) keeps
// every guess on a screen; adding goes kind, then amount.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const cat = JSON.parse(read('data/type-features.json'));
const all = [...Object.values(cat.families).flatMap((f) => Object.values(f)), ...Object.values(cat.types).flatMap((t) => t.own), ...Object.values(cat.income).flat()];

test('every yes / no question has a likely answer and a short phrase', () => {
  for (const f of all.filter((x) => x.kind === 'has')) {
    assert.ok(['yes', 'no'].includes(f.likely), f.id + ' likely');
    assert.ok(f.short && f.short.length <= 32 && !/\?$/.test(f.short), f.id + ' short: ' + f.short);
  }
});

test('a choice row: the recommended answer shows chosen as a guess until answered, at most three, the rest behind More choices', () => {
  const src = read('ui/choice.js');
  assert.match(src, /const shown = value === null \? recommended : value;/);
  assert.match(src, /value === null && k === recommended \? ' is-guess' : ''/);
  assert.match(src, /value === null \? 'guess' : 'Recommended'/);
  assert.match(src, /'More choices \(' \+ rest\.length \+ '\)'/);
  assert.match(read('ui/ticks.js'), /choiceRow\(\{ id: idBase \+ '-' \+ f\.id, options: ANSWERS, value: ans, recommended: f\.likely \|\| null/);
  // Guesses are dashed and full-contrast, never faded.
  assert.match(read('ui/spine.css'), /\.choice-btn\.is-guess\[aria-pressed="true"\] \{ background: var\(--surface\); color: var\(--text\); border: 2px dashed var\(--accent\);/);
});

test('Looks right keeps every guess on the item, group, section and Guide me step; Enter does it with nothing in focus', () => {
  const led = read('ui/ledger.js');
  assert.match(led, /looksRight\(it\.rows, /);
  assert.match(led, /looksRight\(g\.node\.allRows\)/);
  assert.match(led, /looksRight\(sec\.allRows\)/);
  assert.match(led, /bulkEdit\(s, \[\.\.\.rough, \.\.\.filled\], 'confirm', today\(\)\)/);
  assert.match(read('ui/guide.js'), /stepLooksRight\(ctx\.spine, id\)/);
  assert.match(read('ui/shortcuts.js'), /const b = document\.getElementById\('looks-right'\);/);
});

test('the item shows its answers in one line, each phrase opening just its own question; the full list folds under it', () => {
  const src = read('ui/ticks.js');
  assert.match(src, /return \[answerLine\(spine, collection, item, features, 'tk-' \+ id\), list\];/);
  assert.match(src, /f\.short \+ ': ' \+ \(first \|\| ANSWER_WORDS\[a\]\.toLowerCase\(\)\)/);
});

test('adding goes in small steps: what kind, then how much; the name is optional', () => {
  const src = read('ui/add-form.js');
  assert.ok(src.indexOf("'1. What kind") < src.indexOf("h('div', { class: 'add-amt' }, amountLabel"), 'kind before amount');
  assert.match(src, /field\('add-name', 'Name \(optional\)'/);
  assert.doesNotMatch(src.slice(src.indexOf("return h('form', { class: 'editor add-form'")), /ticksBox/, 'the type questions are guessed on the item, not asked in the form');
});
