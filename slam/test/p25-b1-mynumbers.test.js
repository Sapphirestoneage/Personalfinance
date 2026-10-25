// Phase 2.5, Batch 1: My numbers on the shell (S-231). DATING order (D Debt, A Assets, T Taxes, I Income, N Needs,
// G Goals), screen by screen (a section, a group, an item, each its own address), old links landing on the right
// screen, Need or Want as two plain tags, and the page itself on the shell with one change function and no undo stack
// of its own. Every household here is made up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLAM, readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { ledgerTree, numbersScreens, screenAt, levelsFor } from '../engine/ledger-tree.js';
import { ledgerRows } from '../engine/ledger.js';
import { labelFor } from '../engine/labels.js';
import { removeItem, editFact, addItem } from '../engine/edits.js';

const R = loadRules();
const INST = readJson('data/institutions.json');
const read = (f) => readFileSync(SLAM + f, 'utf8');
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const screens = (s) => numbersScreens(ledgerTree(s, INST));
const JARGON = /\b(engine|registry|rules|spine|kind|path|field|stored|simulation|template|schema|computed|derived)\b|S-\d{3}|the Ledger/i;
const strings = (src) => [...src.replace(/^\s*\/\/.*$/gm, '').matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((x) => /\s/.test(x) && /^[A-Z ]/.test(x));

test('DATING: six sections in order, each with its letter and the address the shell links to', () => {
  const sc = screens(demo());
  assert.deepEqual(sc.sections.map((x) => x.letter + ' ' + x.label), ['D Debt', 'A Assets', 'T Taxes', 'I Income', 'N Needs', 'G Goals']);
  // The shell's section words (numbersHref) open these screens; Session links to five of them.
  const shell = read('ui/shell.js');
  const ids = [...shell.slice(shell.indexOf('export const SECTIONS')).matchAll(/(\w+): '/g)].slice(0, 6).map((m) => m[1]);
  for (const id of ids) assert.ok(screenAt(sc, [id]), id + ' opens a section');
  // Needs holds every expense (the stored key stays expenses); Goals holds the goals and the assumptions.
  const needs = sc.sections.find((x) => x.slug === 'needs');
  assert.deepEqual(needs.allRows.filter((r) => r.path.startsWith('expenses.')).length, ledgerRows(demo()).flatMap((g) => g.rows).filter((r) => r.path.startsWith('expenses.')).length);
  const goals = sc.sections.find((x) => x.slug === 'goals');
  assert.ok(goals.groups.some((g) => g.label === 'Assumptions') && goals.groups.some((g) => g.items.some((it) => it.key === 'goals.cushion')));
});

test('screen by screen: every row opens on one screen, a section, a group, an item; never deeper', () => {
  const s = demo(), sc = screens(s);
  const rows = ledgerRows(s).flatMap((g) => g.rows);
  for (const r of rows) {
    const lv = sc.rowLevels.get(r.path);
    assert.ok(lv && lv.length >= 2 && lv.length <= 3, r.path + ': ' + JSON.stringify(lv));
    const at = screenAt(sc, lv);
    assert.ok(at && at.item && at.item.rows.some((x) => x.path === r.path), r.path + ' is on its screen');
  }
  assert.deepEqual(sc.rowLevels.get('debts.visa.balance'), ['debt', 'credit-cards', 'visa']);
  // A group of one item with nothing to add opens it straight away.
  assert.deepEqual(sc.rowLevels.get('household.filingStatus'), ['taxes', 'filing']);
  assert.equal(screenAt(sc, ['taxes', 'filing', 'anything']), null);
  // A bad or gone level is null, so the shell goes up to the deepest one that is there.
  assert.equal(screenAt(sc, ['debt', 'credit-cards', 'no-such-card']), null);
  assert.equal(screenAt(sc, ['nowhere']), null);
  assert.equal(screenAt(sc, ['debt', 'credit-cards', 'visa', 'deeper']), null);
});

test('an item keeps its address when it is renamed, and loses it when deleted', () => {
  const s = demo();
  const renamed = editFact(s, 'debts.visa.name', 'set', { value: 'Amex Blue', kind: 'known', today: '2026-10-25' });
  const at = screenAt(screens(renamed), ['debt', 'credit-cards', 'visa']);
  assert.equal(at.item.label, 'Amex Blue');
  assert.equal(screenAt(screens(removeItem(s, 'debts', 'visa')), ['debt', 'credit-cards', 'visa']), null);
  // A new item opens on its own screen at once.
  const made = addItem(s, { collection: 'debts', type: 'credit_card', label: 'Amex Blue' }, '2026-10-25');
  const sc = screens(applyDefaults(made.spine, R));
  assert.deepEqual(levelsFor(sc, made.spine, made.firstPath).levels, ['debt', 'credit-cards', 'amex-blue']);
});

test('old links land: a field opens its screen with its row open; an account, a list and a bad link go where they can', () => {
  const s = demo(), sc = screens(s);
  // A card's intro end lives on its interest rate row; a pay day on its payment row.
  assert.deepEqual(levelsFor(sc, s, 'debts.store.promoEnds'), { levels: ['debt', 'credit-cards', 'store'], row: 'debts.store.apr' });
  assert.deepEqual(levelsFor(sc, s, 'expenses.rent.payDay'), { levels: ['needs', 'housing', 'rent'], row: 'expenses.rent.paidFrom' });
  assert.deepEqual(levelsFor(sc, s, 'income.salary.withholding.federal').levels, ['taxes', 'tax-withheld', 'salary']);
  // ledger.html#max:roth opens the account (the page opens its panel there).
  assert.deepEqual(sc.itemLevels.get('accounts.roth'), ['assets', 'ira', 'roth']);
  assert.deepEqual(levelsFor(sc, s, 'accounts'), { levels: ['assets'], row: null });
  assert.deepEqual(levelsFor(sc, s, 'nothing.here'), { levels: [], row: null });
});

test('Need or want: two plain tags on each line in Needs, never "a need, not a want"', () => {
  const s = demo(), sc = screens(s);
  assert.equal(labelFor(s, 'expenses.rent.need'), 'Rent: need or want');
  const rent = screenAt(sc, ['needs', 'housing', 'rent']).item;
  assert.equal(rent.need, true);
  assert.equal(rent.rows.find((r) => r.path === 'expenses.rent.need').field, 'Need or want');
  const src = read('ui/ledger.js');
  assert.match(src, /const needWords = \(v\) => \(v === true \? 'Need' : v === false \? 'Want' : null\)/);
  assert.match(src, /\[\['true', 'Need'\], \['false', 'Want'\]\]/);
  for (const f of ['engine/labels.js', 'ui/ledger.js', 'engine/ledger-tree.js']) assert.doesNotMatch(read(f), /not a want/, f);
});

test('My numbers is on the shell: one change function, no undo stack or page links of its own, deletes never ask', () => {
  const src = read('ui/ledger.js');
  assert.match(src, /startPage\(\{ tab: 'numbers', title: 'My numbers', name: nameOf, actions, render \}\)/);
  assert.doesNotMatch(src, /page-links|createHistory|commit\(|\bundo\(|\bredo\(|loadAll\(\)\.then|mountPage\(|whoseLine|saved-line|lastSaved|View ›|'Remove '|confirm'\s*\}, 'Remove/);
  assert.doesNotMatch(src, /addEventListener\('keydown', \(e\) => \{\s*if \(!hist/, 'Ctrl+Z is the shell\'s');
  assert.match(src, /change\(\(s\) => removeItem\(s, it\.collection, it\.id\), said\.deleted\(it\.label\)\)/);
  assert.match(read('ledger.html'), /<title>SLAM My numbers<\/title>/);
  // The rows that open a deeper screen are whole-row links with a chevron (go-row), one level per screen.
  assert.match(src, /h\('a', \{ class: mark \? 'go-row' : 'go-row plain', href, id \}/);
});

test('client words on My numbers follow THE COPY RULE', () => {
  const said = strings(read('ui/ledger.js'));
  assert.ok(said.length > 50, 'found its words');
  for (const w of said) assert.doesNotMatch(w, JARGON, w);
  assert.doesNotMatch(read('ui/household.js'), /top of the Ledger/);
});
