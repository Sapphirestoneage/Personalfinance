// Delight, warm but calm (S-286, Part 7): the one-sentence summary, the Home sliders' moves, the End call reveal and
// the milestones that earn a calm check. Engines on the made-up demo household; the screens by their source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJson, loadRules } from './spine-helpers.js';
import { loadHousehold } from '../engine/normalize.js';
import { money } from '../src/ui/format.js';
import { sentencePieces, sentenceWords, monthWords } from '../engine/sentence.js';
import { movedSpine, housingLine } from '../engine/whatif.js';
import { fiPoint, fiMove, movers, moveWords, monthsBetween } from '../engine/reveal.js';
import { reached } from '../engine/cheers.js';
import { putFact } from '../engine/edits.js';
import { valueOf as v } from '../engine/spine.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const rules = loadRules();
const demo = () => loadHousehold(readJson('fixtures/demo.json'));

test('the sentence: what is kept, when the debt is gone, when work can stop; "about" only before a guessed part', () => {
  const spine = demo(), p = sentencePieces(spine, rules);
  assert.equal(p.empty, false);
  assert.ok(p.keep.value > 0 && p.debt.kind === 'hi' && p.fi.kind === 'on', JSON.stringify(p));
  const words = sentenceWords(p, money);
  assert.match(words, /^You keep (about )?\$[\d,]+ a month, your high-rate debt is gone by [A-Z][a-z]+ \d{4}, and you are on track to stop working at (about )?\d\d\.$/);
  // Guesses say "about"; a known part does not.
  assert.ok(words.includes('about $'), 'the surplus rests on a guessed default');
  assert.ok(!words.includes('by about'), 'the debt date rests on known numbers');
  // Every debt a card: "your cards are gone by".
  const cards = { ...spine, debts: spine.debts.filter((d) => d.type === 'credit_card') };
  assert.match(sentenceWords(sentencePieces(cards, rules), money), /your cards are gone by/);
  // No debt: two parts, joined with "and".
  const none = { ...spine, debts: [] };
  assert.match(sentenceWords(sentencePieces(none, rules), money), /^You keep .* a month, and you are on track/);
  assert.equal(monthWords('2027-04', '2026-10-22'), 'April 2027');
  assert.equal(monthWords('2026-12', '2026-10-22'), 'December');
});

test('the sentence on an empty household invites the first numbers; a short month says so', () => {
  const spine = demo();
  const blank = { ...spine, income: [], expenses: [], debts: [], accounts: [], goals: [] };
  assert.equal(sentenceWords(sentencePieces(blank, rules), money), 'Add a paycheck and a bill, and this sentence writes itself.');
  assert.match(sentenceWords({ empty: false, about: false, keep: { value: -200, rough: false }, debt: null, fi: { kind: 'notYet' }, asOf: '2026-10-22' }, money), /^You are short \$200 a month, and stopping work is out of reach at today's pace\.$/);
});

test('the sliders move the housing line, save more and a raise, and the FI date moves with them', () => {
  const spine = demo();
  assert.equal(housingLine(spine).id, 'rent');
  const moved = movedSpine(spine, rules, { rent: -300, saveMore: 100, earnMore: 500 }, '2026-10-28');
  assert.equal(v(moved.expenses.find((e) => e.id === 'rent').amount), 1500);
  assert.ok(v(moved.income.find((x) => x.id === 'salary').amount) > 6000, 'the raise lands on the biggest paycheck');
  const a = fiPoint(spine, rules), b = fiPoint(moved, rules);
  assert.ok(b.years < a.years, 'FI comes sooner');
  assert.match(moveWords(fiMove(a, b)), /sooner$/);
  // Nothing moved: the same household's numbers.
  assert.equal(fiMove(a, fiPoint(movedSpine(spine, rules, {}, '2026-10-28'), rules)), null);
  // Rent never goes under zero.
  const low = movedSpine(spine, rules, { rent: -5000 }, '2026-10-28');
  assert.equal(v(low.expenses.find((e) => e.id === 'rent').amount), 0);
});

test('the reveal: the FI point has a month and an age, and the movers rank the changes by months moved', () => {
  const spine = demo(), pt = fiPoint(spine, rules);
  assert.match(pt.ym, /^\d{4}-\d{2}$/);
  assert.equal(pt.age, 54);
  assert.equal(monthsBetween('2026-10', '2028-01'), 15);
  assert.equal(moveWords({ months: -14 }), '1 year 2 months sooner');
  assert.equal(moveWords({ months: 3 }), '3 months later');
  assert.equal(moveWords({ reach: 'in' }), 'now in reach');
  const step1 = movedSpine(spine, rules, { rent: -300 }, '2026-10-28');
  const step2 = movedSpine(step1, rules, { earnMore: 500 }, '2026-10-28');
  const top = movers([{ doc: spine, label: 'Rent changed to $1,500' }, { doc: step1, label: 'Salary changed' }], step2, rules);
  assert.equal(top.length, 2);
  assert.ok(Math.abs(top[0].move.months) >= Math.abs(top[1].move.months), 'biggest first');
  assert.ok(top.every((m) => m.move.months < 0), 'both moved it sooner');
  assert.deepEqual(movers([], spine, rules), []);
});

test('a cheer only for a real milestone: a debt paid off, a cushion step, an unlocked headline number; never for a plain edit', () => {
  const spine = demo();
  const paid = putFact(spine, 'debts.visa.balance', 0, 'known', '2026-10-28');
  assert.deepEqual(reached(spine, paid, rules).map((x) => x.words), ['Visa: paid off']);
  const edited = putFact(spine, 'expenses.rent.amount', 1700, 'known', '2026-10-28');
  assert.deepEqual(reached(spine, edited, rules), []);
  // Cash that reaches the next cushion step.
  const rich = putFact(spine, 'accounts.hysa.balance', 60000, 'known', '2026-10-28');
  assert.ok(reached(spine, rich, rules).some((x) => /^Cushion: /.test(x.words)), JSON.stringify(reached(spine, rich, rules)));
  // A headline number unlocked: a household with no income gets its first paycheck.
  const blank = { ...spine, income: [] };
  const first = { ...blank, income: spine.income };
  assert.ok(reached(blank, first, rules).some((x) => /unlocked$/.test(x.words)));
  assert.deepEqual(reached(spine, spine, rules), []);
});

test('the screens: the sentence leads Home, the sliders keep nothing until Keep this, the strip has the time switch, End call opens on the FI date, the shell cheers', () => {
  const home = read('ui/dashboard.js');
  assert.ok(home.indexOf('sentenceCard(baseOf(base, rules))') < home.indexOf('agendaCard(base, rules)'), 'the sentence comes before the agenda');
  assert.match(home, /futureCard\(base, rules, baseOf\(base, rules\)\.s, \{ onPreview: previewSentence \}\)/);
  const fut = read('ui/future.js');
  assert.match(fut, /keepBtn\.addEventListener\('click'/);
  assert.match(fut, /change\(\(x\) => movedSpine\(x, rules, mv, todayIso\(\)\), w \+ ' kept'\)/);
  assert.ok(!/keep\(\{/.test(fut), 'the moves are not kept with the screen: leaving Home springs back');
  assert.match(read('ui/strip.js'), /id: 'money-as-time'/);
  assert.match(read('ui/view.js'), /' of freedom'/);
  const ec = read('ui/end-call.js');
  assert.ok(ec.indexOf('revealCard(spine, rules, past, today)') < ec.indexOf("'End of the call'"), 'the reveal is first on End call');
  assert.match(ec, /class: 'reveal-big'/);
  const shell = read('ui/shell.js');
  assert.match(shell, /cheerReached\(before, hist\.present\)/);
  assert.match(shell, /export const householdHistory = \(\) => hist;/);
  const css = read('ui/spine.css');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.cheer, \.cheer\.is-on, \.headline-strip\.is-glow \{ animation: none/);
  assert.ok(!/canvas|confetti\(/i.test(fut + read('ui/cheer.js')), 'no confetti code: a line and a glow only');
});
