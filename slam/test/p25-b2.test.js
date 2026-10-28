// Phase 2.5, Batch 2: smaller, calmer, written for the user. Sizes and colors in the stylesheet, the page's bottom at
// the tab bar's height, one map for the section names, and no code words in a sentence a client screen shows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTION_WORDS } from '../engine/schema.js';
import { TAG_WORDS } from '../engine/spending.js';

const SLAM = new URL('../', import.meta.url).pathname;
const read = (f) => readFileSync(SLAM + f, 'utf8');
// The code without its comments, so a comment's words are not read as the screen's.
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

test('sizes: 15px body, 40px buttons and 32px row actions, each with a 44px tap area; spacing about half', () => {
  const css = read('ui/spine.css');
  const b2 = css.slice(css.indexOf('Phase 2.5, Batch 2'));
  assert.match(b2, /--text-md: 0\.9375rem/, 'body 15px');
  assert.match(b2, /--btn-h: 40px; --row-btn-h: 32px;/);
  assert.match(b2, /\.btn \{ min-height: var\(--btn-h\);/);
  assert.match(b2, /\.btn\.small \{ min-height: var\(--row-btn-h\);/);
  assert.match(b2, /\.btn::after, \.filter-chip::after, \.tag-chip::after, \.seg-btn::after \{ content: ""; position: absolute; left: 0; right: 0; top: 50%; height: max\(100%, var\(--tap\)\);/, 'the target stays 44px');
  assert.match(b2, /--space-3: 8px; --space-4: 12px; --space-5: 16px;/);
  assert.match(b2, /\.card \{ padding: 10px var\(--space-4\);/);
});

test('the page ends at the tab bar\'s own height, measured by the shell', () => {
  const css = read('ui/spine.css');
  assert.match(css, /body\.has-tabs \{ padding-bottom: var\(--tabbar-h, 56px\); \}/, 'the measured height already holds the safe area');
  const shell = code('ui/shell.js');
  assert.match(shell, /measureTabs\(tabs\);/);
  assert.match(shell, /setProperty\('--tabbar-h', Math\.ceil\(bar\.getBoundingClientRect\(\)\.height\) \+ 'px'\)/);
  assert.match(shell, /new ResizeObserver\(set\)\.observe\(bar\)/);
});

test('three meaning colors: a stage, running hot and a deadline are watch, not red; under zero stays red', () => {
  const b2 = read('ui/spine.css').split('Phase 2.5, Batch 2')[1];
  for (const sel of ['.stage-red { color: var(--watch-ink)', '.hot-chip, .deadline-chip { color: var(--watch-ink)', '.flag-red { border-left-color: var(--watch)', '.pill-waiting { border-color: var(--watch-ink)'])
    assert.ok(b2.includes(sel), sel);
  assert.ok(b2.includes('.safe-big.low { color: var(--bad); }'), 'short of money is red');
});

test('one map for the section names; "Everything else" reads Miscellaneous', () => {
  assert.equal(SECTION_WORDS.other, 'Miscellaneous');
  assert.equal(TAG_WORDS, SECTION_WORDS);
  for (const f of ['engine/flow.js', 'engine/ledger-tree.js', 'engine/spending.js', 'engine/labels.js', 'fixtures/demo.json'])
    assert.ok(!read(f).includes("'Everything else'") && !read(f).includes('"Everything else"'), f);
});

// The client screens: the six tabs, the One-pager and Got extra money?, and what they draw from.
const CLIENT = ['ui/dashboard.js', 'ui/session.js', 'ui/ledger.js', 'ui/calendar.js', 'ui/cash-chart.js', 'ui/spending.js', 'ui/plan.js', 'ui/onepager.js', 'ui/windfall.js', 'ui/page.js', 'ui/shell.js', 'ui/flow-chart.js', 'ui/debt-tab.js', 'ui/maxit-panel.js', 'ui/onboard.js', 'ui/items.js', 'ui/answers.js', 'ui/boxes.js'];
const BANNED = /\b(engines?|registry|rules?|spine|kinds?|paths?|fields?|stored|simulations?|templates?|schema|computed|derived|stage|phase|batch|version)\b|\bthe Ledger\b|\bS-\d{2,3}\b|\u2014/i;
// The engine files whose words reach a client screen (flag titles, notes, tier and calendar labels).
const SAYS = ['engine/calendar.js', 'engine/cashsim.js', 'engine/flags.js', 'engine/spending.js', 'engine/plan.js', 'engine/labels.js', 'engine/ledger-tree.js', 'engine/needs.js', 'engine/count.js', 'engine/onboard.js'];
// Every quoted string in the code, read quote to quote (a regex literal with a quote in it is rare here).
function strings(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const q = src[i];
    if (q !== "'" && q !== '"' && q !== '`') continue;
    let j = i + 1, s = '';
    while (j < src.length && src[j] !== q && (q === '`' || src[j] !== '\n')) { if (src[j] === '\\') { s += src[j + 1]; j += 2; } else s += src[j++]; }
    // A quote that runs to the end of its line was not a string (a regex, an apostrophe): read on from the next line.
    if (src[j] === '\n') { i = j; continue; }
    out.push(s); i = j;
  }
  return out;
}
test('no code words in a sentence on a client screen', () => {
  const found = [];
  for (const f of [...CLIENT, ...SAYS]) {
    for (const s of strings(code(f))) {
      // A sentence: words with a space, not a class list, a selector or an id. The Rule of 5 is a name.
      if (!/\s/.test(s) || /^[a-z0-9 _:.#[\]="-]+$/.test(s)) continue;
      // labels.js names a reference value 'Rule <ID>' only on the Builder's pages.
      if (s === 'Rule ') continue;
      if (BANNED.test(s.replace(/Rule of 55?/g, ''))) found.push(f + ': ' + s);
    }
  }
  assert.deepEqual(found, []);
});

test('the copy pass: Add a purchase, never Log a spend, on every client screen', () => {
  for (const f of CLIENT) assert.ok(!code(f).includes('Log a spend'), f);
  assert.match(code('ui/spending.js'), /'Add a purchase '/);
  assert.match(read('docs/COPY_PASS.md'), /\| Before \| After \|/);
});
