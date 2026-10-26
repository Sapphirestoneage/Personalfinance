// The numbers spreadsheet's answer parser (S-237): every case in js/parse-answer-cases.js (the Key shows the ones
// marked key), plus the rules that matter most: missing is never $0, and nothing is guessed silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswer, readSure } from '../js/parse-answer.js';
import { CASES, TODAY } from '../js/parse-answer-cases.js';

for (const c of CASES) {
  test('reads ' + JSON.stringify(c.answer) + ' as ' + c.expect + (c.sure ? ' (' + c.sure + ')' : ''), () => {
    const r = parseAnswer(c.answer, { expect: c.expect, sure: c.sure || '', spending: !!c.spending, today: TODAY });
    const { status, kind, noted, ...facts } = c.want;
    if (status) assert.equal(r.status, status, r.problems.join('; '));
    if (kind) assert.equal(r.kind, kind);
    if (noted) assert.ok(r.notes.length, 'an assumption is said, not silent');
    for (const [k, v] of Object.entries(facts)) assert.deepEqual(r.facts[k], v, k);
    // Never drops the text.
    assert.equal(r.text, c.answer);
  });
}

test('missing is never $0: every unknown word reads missing with no value', () => {
  for (const t of ['', '  ', "don't know", 'dont know', 'idk', '?', '??', 'n/a', 'N/A', 'not sure', 'unknown', 'TBD', 'no idea']) {
    for (const expect of ['money', 'expenses', 'income', 'debts', 'accounts', 'goals', 'rate', 'date', 'int']) {
      const r = parseAnswer(t, { expect, today: TODAY });
      assert.equal(r.status, 'missing', t + ' ' + expect);
      assert.deepEqual(r.facts, {}, t + ' ' + expect);
    }
  }
});

test('a real zero is a known 0', () => {
  for (const t of ['$0', '0', 'none', 'zero', 'nothing']) assert.equal(parseAnswer(t, { expect: 'money', today: TODAY }).facts.value, 0, t);
});

test('every case marked for the Key reads cleanly (the Key never shows an example that lands in review)', () => {
  for (const c of CASES.filter((x) => x.key)) {
    const r = parseAnswer(c.answer, { expect: c.expect, sure: c.sure || '', spending: !!c.spending, today: TODAY });
    assert.notEqual(r.status, 'review', c.answer);
  }
});

test('How sure? words', () => {
  assert.equal(readSure(''), null);
  for (const t of ['I know it', 'known', 'sure', 'Sure!']) assert.equal(readSure(t), 'known', t);
  for (const t of ['rough guess', 'rough', 'estimate', 'Estimate']) assert.equal(readSure(t), 'rough', t);
  for (const t of ["don't know", 'unknown', "I don't know"]) assert.equal(readSure(t), 'missing', t);
  assert.equal(readSure('purple'), undefined);
});

test('the reading is plain words', () => {
  const r = parseAnswer('$1,000 a month', { expect: 'expenses', sure: 'I know it', today: TODAY });
  assert.equal(r.reading, '$1,000 per month, known');
});
