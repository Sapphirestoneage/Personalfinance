// Every field fits its question (owner, 2026-10-28; S-276). A tick is a true yes / no about the item ("Does your
// employer match?"); a question that asks for the thing itself ("Which kind of federal loan?", "Do you know the
// rate?") is a detail: its boxes under a short title, never Yes / No / Not sure. No type shows a field twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featuresOf, tickCount } from '../engine/features.js';

const cat = JSON.parse(readFileSync(new URL('../data/type-features.json', import.meta.url)));
const all = [...Object.values(cat.families).flatMap((f) => Object.values(f)), ...Object.values(cat.types).flatMap((t) => t.own), ...Object.values(cat.income).flat()];
const collOf = (d) => (d.family === 'debt' ? 'debts' : d.family === 'policy' ? 'policies' : 'accounts');

test('a tick asks a yes / no question; "Do you know", which, what, when and how questions are details', () => {
  for (const f of all) {
    assert.ok(['has', 'ask'].includes(f.kind), f.id + ' has a kind');
    if (f.kind === 'has') {
      assert.match(f.question, /^(Do|Does|Is|Are|Did|Has|Have)\b/, f.id + ': ' + f.question);
      assert.doesNotMatch(f.question, /^Do you know\b|, or |\bwhich\b/i, f.id + ': ' + f.question);
    } else {
      assert.ok(f.title && f.title.length <= 70 && !/\?$/.test(f.title), f.id + ' has a short title');
    }
    assert.ok(f.reveals.length, f.id + ' opens at least one field');
  }
});
test('no type shows the same field under two questions', () => {
  for (const [t, d] of Object.entries(cat.types)) {
    const seen = new Map();
    for (const f of featuresOf(cat, { type: t }, collOf(d))) for (const r of f.reveals) {
      assert.ok(!seen.has(r.field), t + ': ' + r.field + ' under ' + seen.get(r.field) + ' and ' + f.id);
      seen.set(r.field, f.id);
    }
  }
});
test('the count is of yes / no questions only', () => {
  const fs = featuresOf(cat, { type: 'student_loan' }, 'debts');
  const c = tickCount(cat, { type: 'student_loan', ticks: {} }, 'debts');
  assert.equal(c.total, fs.filter((f) => f.kind === 'has').length);
  assert.ok(fs.some((f) => f.kind === 'ask'), 'the federal loan asks its kind and rate as details');
});
