// The picker's libraries and matching (S-284).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchPicks, placeOf, glideShare, fundFills, cardEntries, fundEntries, institutionEntries } from '../engine/library.js';
const lib = (n) => JSON.parse(readFileSync(new URL('../data/library-' + n + '-2026.json', import.meta.url), 'utf8'));
const cards = lib('cards'), funds = lib('funds'), inst = lib('institutions'), places = lib('places');

test('each library says where it is from and its year, and holds about the brief\'s size', () => {
  for (const l of [cards, funds, inst, places]) { assert.equal(l.year, 2026); assert.ok(l.source && l.source.length > 20); }
  assert.ok(cards.cards.length >= 40, cards.cards.length + ' cards');
  assert.ok(funds.funds.length >= 100, funds.funds.length + ' funds');
  assert.ok(inst.institutions.some((x) => x.kind === 'servicer') && inst.institutions.some((x) => x.kind === 'insurer') && inst.institutions.some((x) => x.kind === 'lender'));
  for (const f of funds.funds.filter((x) => x.mix)) assert.equal(Math.round((f.mix.stocks + f.mix.bonds + f.mix.cash) * 100), 100, f.name);
});

test('shorthand finds the top match: amex, boa, 401k-style words, tickers', () => {
  assert.equal(matchPicks(cardEntries(cards), 'amex gold')[0].words, 'American Express Gold Card');
  assert.equal(matchPicks(cardEntries(cards), 'csp')[0].words, 'Chase Sapphire Preferred');
  assert.equal(matchPicks(institutionEntries(inst), 'boa')[0].words, 'Bank of America');
  assert.equal(matchPicks(fundEntries(funds), 'vtsax')[0].value.ticker, 'VTSAX');
  assert.ok(matchPicks(cardEntries(cards), 'chase').length <= 5, 'never more than five');
});

test('this client\'s own first, then recent, then the library', () => {
  const list = [{ words: 'Chase Freedom (lib)', from: 'library' }, { words: 'Chase checking', from: 'recent' }, { words: 'Chase Sapphire mine', from: 'mine' }];
  assert.deepEqual(matchPicks(list, 'chase').map((x) => x.from), ['mine', 'recent', 'library']);
});

test('a city or ZIP fills the state and New York City or Yonkers', () => {
  assert.deepEqual([placeOf('11215', places).state, placeOf('11215', places).locality], ['NY', 'nyc'], 'Brooklyn');
  assert.equal(placeOf('10703', places).locality, 'yonkers');
  assert.equal(placeOf('11530', places).locality, null, 'Garden City, Nassau: New York State, not the city');
  assert.equal(placeOf('94110', places).state, 'CA');
  assert.equal(placeOf('nyc', places).locality, 'nyc');
  assert.equal(placeOf('Hoboken', places).state, 'NJ');
});

test('a target-date fund\'s mix follows its glide path', () => {
  assert.equal(glideShare(funds.glide, 2060, 2026), 0.9, '34 years out');
  assert.equal(glideShare(funds.glide, 2026, 2026), 0.5, 'at the date');
  const f = funds.funds.find((x) => x.name === 'Vanguard Target Retirement 2050');
  assert.equal(f.ticker, 'VFIFX');
  // 24 years out: a fifth of the way from 90% (25 years) to 82% (20 years).
  assert.deepEqual(fundFills(f, funds, 2026), { expenseRatio: 0.0008, stockShare: 0.884 });
});

test('the picker is one component: on the add form\'s name, item fields with a known set, the place, and every long list', () => {
  const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  assert.match(read('ui/shell.js'), /enhanceSelects\(screenEl\);/);
  assert.match(read('ui/picker.js'), /if \(opts\.length <= 3 \|\| sel\.multiple \|\| !sel\.id\) continue;/);
  assert.match(read('ui/picker.js'), /'Use what I typed: "' \+ q \+ '"'/);
  assert.match(read('ui/add-form.js'), /const nameWrap = attachPicker\(name, \{/);
  assert.match(read('ui/ledger.js'), /const pickWrap = pickField \? attachPicker\(input,/);
  assert.match(read('ui/guide.js'), /const wrap = attachPicker\(box, \{ source: 'place'/);
  // A pick's numbers land as guesses from the library, never as known: applyFills, shared by the add form and the
  // Session's name box (S-291).
  assert.match(read('engine/library.js'), /setAt\(s, base \+ '\.' \+ k, \{ value: x, kind: 'rough', asOf: today, source: LIBRARY_SOURCE \}\)/);
  assert.match(read('ui/add-form.js'), /applyFills\(made\.spine, base, pickFills, today\)/);
  assert.match(read('ui/guide.js'), /const wrap = attachPicker\(box, \{ source: 'name:debts'/);
});
