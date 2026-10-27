// Phase 2.5, Batch 1 fixes: getting around, read from the sources (the shell and the pages need a browser; each was
// also checked at 375px and 1024px). A step outside the household (a rule, a saved scenario) is undone from the
// header and by Ctrl/Cmd+Z, not only from the bar; a tab reopens its page as it was left; Back at the top of a Builder
// page does what the browser's back does; Show the math opens no Builder page; Today's cards open what they are named
// for and keep what was open; nothing focused hides under a bar; folds wear a chevron; a calendar row's chevron opens
// it; Still guessing and Subscriptions open a row in place; Select several clears its count. Every household is
// made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM } from './spine-helpers.js';

const read = (f) => readFileSync(SLAM + f, 'utf8');
const code = (f) => read(f).replace(/^\s*\/\/.*$/gm, '');

test('a step outside the household is the latest step: the header\'s Undo and Ctrl/Cmd+Z reach it, Redo brings it back', () => {
  const src = code('ui/shell.js');
  assert.match(src, /export function say\(text, undoFn = null, redoFn = null\)/);
  assert.match(src, /side = \{ words: end\(text\), undo: undoFn, redo: redoFn, done: true \}/);
  // The header draws Undo and Redo on a Builder page too while there is such a step.
  assert.match(src, /const undoing = opts\.household \|\| side \?/);
  assert.match(src, /if \(side && side\.done\) \{/, 'Undo runs the side step first');
  assert.match(src, /if \(!\(hist \|\| side\) \|\| !\(e\.ctrlKey \|\| e\.metaKey\)/, 'Ctrl/Cmd+Z works with no household (the Rules page)');
  assert.match(src, /notice = null; side = null;/, 'the next household change ends it');
  // The Rules page and the Plan's saved scenarios give a redo with the undo.
  assert.match(code('ui/rules-page.js'), /say\(words, \(\) => \{ putYear\(before\); refresh\(\); \}, \(\) => \{ putYear\(after\); refresh\(\); \}\)/);
  assert.match(code('ui/plan.js'), /putBack\(list, now, said\.deleted\('Scenario ' \+ x\.name\)\)/);
});

test('a tab reopens its page where it was left; the lit tab goes to its top; a plain link still opens the top', () => {
  const src = code('ui/shell.js');
  assert.match(src, /sessionStorage\.setItem\(RETURN_KEY, new URL\(href, location\.href\)\.pathname\)/, 'a tab tap marks the page it opens');
  assert.match(src, /const left = !location\.hash \? tabReturn\(\) : null;/, 'only a tab tap (no address of its own) reopens the screens');
  assert.match(src, /if \(opts && samePage\(href\)\) \{ e\.preventDefault\(\); if \(levelsNow\(\)\.length\) go\(\[\]\); else window\.scrollTo\(0, 0\); return; \}/);
  assert.match(src, /function remember\(\)/);
  assert.match(src, /export function keep\(patch\) \{ const e = entry\(\); if \(e\) \{ history\.replaceState\(stateWith\(\{ \.\.\.e, page: \{ \.\.\.e\.page, \.\.\.patch \} \}\), ''\); remember\(\); \} \}/);
  // Content figured after the first draw (Still guessing) gets the scroll it was left at.
  assert.match(src, /export function restoreScroll\(\)/);
  assert.match(code('ui/ledger.js'), /guess = res; guessFor = spine; refresh\(\); restoreScroll\(\);/);
});

test('Back at the top of a page opened from another page of the app goes back there, as the browser\'s back does', () => {
  const src = code('ui/shell.js');
  assert.match(src, /const browserBack = levels\.length \|\| \(!fromParent\(\) && fromApp\(\)\);/);
  assert.match(src, /onclick: \(\) => \(browserBack \? \(saveScroll\(\), history\.back\(\)\) : toParent\(0\)\)/);
});

test('Show the math names no rule by its id; it ends with See the formula, hidden in client view', () => {
  const src = code('ui/math-panel.js');
  assert.doesNotMatch(src, /rules\.html|'Rules: '|This formula on the math page/);
  assert.match(src, /prefs\(\)\.view === 'client' \? null : h\('p', \{ class: 'math-see' \}, h\('a', \{ href: 'math\.html#\/' \+ encodeURIComponent\(id\) \}, 'See the formula'\)\)/);
  for (const part of ['e.formula', 'e.plugged', 'e.note', 'g.label', 't.label', 'e.label']) assert.ok(src.includes('plainLabel(' + part), part + ' is worded for the screen');
  // The Plan and Today keep a panel open with the one helper.
  assert.match(src, /export function keptMath\(key, ids, ctx, label\)/);
  assert.match(code('ui/plan.js'), /const math = keptMath;/);
});

test('Today (Krug pass): four tiles, each one tap to its own screen; one Next step card; rows open the rest', () => {
  const src = code('ui/dashboard.js');
  const ids = [...src.matchAll(/tile\(spine, \{ id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['networth', 'surplus', 'savings', 'runway']);
  for (const [id, href] of [['networth', "'#/networth'"], ['surplus', "'#/surplus'"], ['savings', "'#/savings'"], ['runway', "'#/runway'"]]) assert.match(src, new RegExp("id: '" + id + "', label: [^\\n]*target: " + href), id);
  for (const w of ["'Also worth doing (' + others.length + ')'", "'Where the money goes'", "nextCard(m.spine, rank)"]) assert.ok(src.includes(w), w);
  assert.match(src, /keptMath\('flag-' \+ f\.id/);
  assert.match(src, /open: kept\(\)\.done \|\| null, ontoggle:/);
  assert.match(src, /listOpen: !!kept\(\)\.flowList/);
  assert.doesNotMatch(src, /real ledger/);
});

test('the money flow: links to your numbers, a Join on a phone, gutters as wide as the labels', () => {
  const src = code('ui/flow-chart.js');
  assert.match(src, /'Every flow, with links to your numbers'/);
  assert.doesNotMatch(src, /the Ledger/);
  assert.match(src, /'Join ' \+ flow\.sections\[sec\]/);
  assert.match(src, /function gutters\(flow, width, font\)/);
  assert.match(src, /viewBox: '0 ' \+ -PAD_TOP/);
});

test('nothing that takes the focus hides under the tab bar or Back; folds wear a chevron; a calendar row is one target', () => {
  const css = read('ui/spine.css');
  assert.match(css, /body\.has-tabs #app \*:not\(\.screen-top, \.screen-top \*\) \{ scroll-margin-bottom: calc\(76px/);
  assert.match(css, /body\.has-tabs #app \*:not\(\.screen-top, \.screen-top \*\) \{ scroll-margin-top: 72px; \}/);
  assert.match(css, /body\.has-tabs #app:has\(> \.screen-top:not\(:empty\)\) \*:not\(\.screen-top, \.screen-top \*\) \{ scroll-margin-top: 136px; \}/);
  assert.doesNotMatch(css, /#log, #import, #checkin \{ scroll-margin-top|#wf-result \{ scroll-margin-top/);
  assert.match(css, /\.flow-list > summary::before, \.later-list > summary::before \{ content: "\\203A";/);
  assert.match(css, /\.flow-list\[open\] > summary::before, \.later-list\[open\] > summary::before \{ transform: rotate\(90deg\); \}/);
  // The stretched link of a calendar row covers the row, so its chevron and amount open it.
  assert.match(css, /\.has-target a:not\(\.card-link\):not\(\.ev-go\), \.has-target button/);
  // The steps and the burn tiers: a number, the words, the amount and the months, each in its own column.
  assert.match(css, /\.tiers li \{ display: grid; grid-template-columns: auto minmax\(0, 1fr\) auto auto;/);
  assert.match(css, /^\.rung-why \{ color: var\(--text-muted\); display: block;/m);
  assert.match(css, /\.builder-link \{ [^}]*min-width: var\(--tap\);/);
});

test('the Builder link is plain words on the Builder itself', () => {
  assert.match(code('ui/page.js'), /\/\\\/builder\\\.html\$\/\.test\(location\.pathname\) \? h\('span', \{ class: 'builder-link', 'aria-current': 'page' \}, 'Builder'\)/);
});

test('My numbers: Still guessing and Subscriptions open a row in place; a linked debt opens its line in place', () => {
  const src = code('ui/ledger.js');
  assert.match(src, /return r \? rowEl\(r, open, \{ full: true, note: whyOf\(it\), sub: subOf\(it\) \}\)/, 'a guess opens its editor on Still guessing');
  assert.match(src, /return r \? h\('ul', \{ class: 'rows' \}, rowEl\(r, open, \{ full: true \}\)\)/, 'a subscription opens its editor on Subscriptions');
  assert.doesNotMatch(src.slice(src.indexOf('function guessList'), src.indexOf('function pickerCard')), /fieldLink\(/);
  assert.doesNotMatch(src.slice(src.indexOf('function subsScreen'), src.indexOf('const ADD_WORDS')), /fieldLink\(/);
  assert.doesNotMatch(src, /onclick: \(\) => openField\(row\.linePath\)/, 'a linked debt row no longer leaves its screen');
  assert.match(src, /isOpen \? \(line \? \[h\('p', \{ class: 'row-why' \}, 'Set by ' \+ lineName\(row\) \+ ' in Needs\. You can change it here\.'\), openEditor\(line\)\] : openEditor\(row\)\) : null/);
});

test('My numbers: Select several reads 0 selected after an action; the bar names what changed on an expense', () => {
  const src = code('ui/ledger.js');
  assert.match(src, /const was = selected;\n\s*selected = new Set\(\);\n\s*if \(change\(bulkEdit\(cur\(\), rows, action, today\(\)\), text\)\) return;\n\s*selected = was;/);
  assert.match(src, /label \+ \(subBox\.checked \? ' is now a subscription' : ' is no longer a subscription'\)/);
  assert.match(src, /e\.label \+ ' renamed to ' \+ label/);
  assert.match(src, /return costMoved \|\| !other\.length \? \[cost, \.\.\.other\]\.join\('\. '\) : other\.join\('\. '\);/);
  assert.doesNotMatch(src, /ledger-search/, 'search is in the header now (Krug pass)');
  assert.match(read('ui/search.js'), /e\.key !== '\/'/);
  assert.match(code('ui/calendar.js'), /'Find an item by name' \+ keyHint\('press \/'\)/);
  assert.doesNotMatch(src, /house assumption/);
});

test('the Calendar: the month is kept; a plan suggestion opens the plan; the debt words match the link; Year months are buttons', () => {
  const src = code('ui/calendar.js');
  assert.match(src, /if \(!YM\.test\(\(ctx\.state \|\| \{\}\)\.ym \|\| ''\)\) keep\(\{ ym: st\.ym \}\);/);
  assert.match(src, /: e\.kind === 'foo' \? \['plan\.html', 'See it in your plan'/);
  assert.match(src, /note \? h\('p', \{ class: 'tile-sub' \}, sentence\(cap\(note\)\)\) : null/);
  assert.doesNotMatch(src, /cap\(e\.note\) \+ '\.'/);
  assert.match(src, /debt: 'Set by the lender\\'s due date\. Change it in My numbers\.'/);
  assert.match(src, /h\('button', \{ type: 'button', class: 'btn small', onclick: \(\) => \{ setRoot\(\{ ym: m\.ym, view: 'list' \}\)/);
  assert.doesNotMatch(src + code('ui/debt-tab.js') + code('ui/spending.js'), /house guess|house 1%|day-by-day run|Budget app\\'s|Tap a slice/);
});

test('the Plan: the surplus intro, the deductible, life event words, money in a file\'s differences, nothing to apply', () => {
  const src = code('ui/plan.js');
  // Batch 2's copy pass: the surplus screen says only what is not already on it (its note, when there is one).
  assert.match(src, /w\.note \? h\('p', \{ class: 'muted' \}, w\.note\) : null,/);
  assert.match(src, /r\.id === 'deductibles' && r\.need === null \? 'Type the biggest deductible below\.' : r\.why/);
  assert.match(src, /money\(i\.cents \/ 100\) \+ \(EVENT_OFTEN\[i\.cadence\] \|\| ''\)/);
  assert.match(src, /showValue\(x, type\)/, 'a value in a file\'s differences is worded by its type ($1,950)');
  assert.match(src, /disabled: !preview\.diff\.length, onclick: \(\) => \{ const r = preview\.r/);
  const card = code('ui/maxit-panel.js');
  assert.doesNotMatch(card, /id: 'maxit-h'/, 'the screen\'s title is the only title');
  assert.match(card, /h\('li', \{ class: 'max-row has-target' \},\n\s*h\('a', \{ class: 'max-name card-link', href: maxHref\(r\.accountId\) \}/);
});
