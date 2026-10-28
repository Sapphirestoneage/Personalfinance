// Type it any way (S-285): money, dates, days and rates as people say them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readMoney, readDate, readDay, readRate } from '../engine/natural.js';
import { parseInput } from '../engine/edits.js';
const T = '2026-10-28';

test('money: 2k, $2,000, 2000/mo, 500 a week, 1.2k a year', () => {
  assert.equal(readMoney('2k').value, 2000);
  assert.equal(readMoney('$2,000').value, 2000);
  assert.deepEqual([readMoney('2000/mo').value, readMoney('2000/mo').words], [2000, '$2,000 a month']);
  assert.deepEqual([readMoney('500 a week').value, readMoney('500 a week').words], [2166.67, '$500 a week, about $2,166.67 a month']);
  assert.equal(readMoney('1.2k a year').value, 100);
  assert.equal(readMoney('$18k').value, 18000);
  assert.equal(readMoney('abc').ok, false);
  // The Ledger's boxes read the same way.
  assert.equal(parseInput('money', '2000/mo').value, 2000);
  assert.equal(parseInput('money', '500 a week').value, 2166.67);
});

test('dates: dec 6, the 15th, next friday, 12/6, with the other likely year offered', () => {
  assert.deepEqual([readDate('dec 6', T).value, readDate('dec 6', T).alt.value], ['2026-12-06', '2025-12-06']);
  assert.equal(readDate('march 3', T).value, '2027-03-03', 'already past this year: next year first');
  assert.equal(readDate('the 15th', T).value, '2026-11-15');
  assert.equal(readDate('the 30th', T).value, '2026-10-30');
  assert.equal(readDate('next friday', T).value, '2026-10-30', 'Oct 28, 2026 is a Wednesday');
  assert.equal(readDate('12/6/2027', T).value, '2027-12-06');
  assert.equal(readDate('2026-02-30', T).ok, false);
  assert.equal(parseInput('date', '2026-12-06').value, '2026-12-06');
  assert.match(parseInput('date', 'dec 6').value, /^\d{4}-12-06$/);
});

test('days and rates', () => {
  assert.deepEqual([readDay('the 15th').value, readDay('1st').value, readDay('32').ok], [15, 1, false]);
  assert.equal(parseInput('int', 'the 15th').value, 15);
  assert.equal(readRate('24%').value, 0.24);
  assert.equal(readRate('24').value, 0.24);
  assert.deepEqual([readRate('0.25').value, readRate('0.25').alt.value], [0.0025, 0.25], 'a quarter percent, or 25%: both offered');
});

test('quick add from the search box: a card, a fund in a Roth, a bill people have (S-285)', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseCommand } = await import('../engine/command.js');
  const { SLAM, readJson, loadRules } = await import('./spine-helpers.js');
  const { loadHousehold } = await import('../engine/normalize.js');
  const { applyDefaults } = await import('../engine/defaults.js');
  const R = loadRules();
  const s = applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
  const lib = { cards: JSON.parse(readFileSync(SLAM + 'data/library-cards-2026.json', 'utf8')).cards, funds: JSON.parse(readFileSync(SLAM + 'data/library-funds-2026.json', 'utf8')),
    expenses: [{ words: 'Gym', aliases: [], value: { fat: null, need: false, subscription: true } }] };
  const go = (text) => parseCommand(s, R, text, { today: T, library: lib });
  const card = go('amex gold 2000 24%');
  assert.match(card.words, /^Add American Express Gold.*owed \$2,000 at 24%/);
  const n1 = card.run(s), d = n1.debts.at(-1);
  assert.deepEqual([d.type, d.balance.value, d.apr.value, d.apr.kind, d.annualFee.kind], ['credit_card', 2000, 0.24, 'known', 'rough']);
  const fund = go('vtsax 18k roth');
  assert.match(fund.words, /Roth IRA holding VTSAX/);
  const a = fund.run(s).accounts.at(-1);
  assert.deepEqual([a.type, a.balance.value, a.expenseRatio.kind], ['roth_ira', 18000, 'rough']);
  assert.match(go('rent 2400').words, /^Set Rent amount to \$2,400/, 'a name the household has: set, not add');
  const gym = go('gym 45 the 3rd');
  assert.match(gym.words, /^Add Gym: \$45 a month, charged on the 3rd/);
  assert.equal(go('zzz 45'), null, 'nothing by that name: the box searches instead');
});
