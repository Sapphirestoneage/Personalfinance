import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownershipProblems, typesFor, freshFacts, primaryFieldOf, KINDS, fieldsOfType } from '../../engine/fields.js';
import { PLANETS } from '../../engine/sun.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fields = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'data', 'fields.json'), 'utf8'));

test('every field id has exactly one owner and is used by that owner only', () => {
  assert.deepEqual(ownershipProblems(fields), []);
});

test('every planet has an Other row type and at least one typed row type', () => {
  PLANETS.forEach(p => {
    assert.ok(fields.planets[p], p);
    assert.ok(fields.planets[p].types.other, p + ' has Other');
    /* a derived planet (Taxes) has no typed rows of its own: its numbers come from the others (MR-029) */
    if (!fields.planets[p].derived) assert.ok(Object.keys(fields.planets[p].types).length >= 2, p);
  });
});

test('every field has a known kind, a label, a weight 1..10 and a default source', () => {
  Object.values(fields.fields).forEach(d => {
    assert.ok(KINDS.includes(d.kind), d.id + ' kind ' + d.kind);
    assert.ok(d.label && d.label === d.label.trim(), d.id);
    assert.ok(d.weight >= 1 && d.weight <= 10, d.id + ' weight');
    assert.ok(['client', 'lookup-confirmed', 'lookup-verify', 'estimated', 'inferred', 'computed'].includes(d.defaultSource), d.id);
    if (d.kind === 'choice') assert.ok(Array.isArray(d.options) && d.options.length > 1, d.id + ' options');
    assert.ok(d.label.indexOf('!') === -1);
  });
});

test('labels are sentence case short nouns', () => {
  Object.values(fields.fields).forEach(d => {
    assert.ok(d.label.split(' ').length <= 5, d.id + ' label too long: ' + d.label);
    assert.ok(/^[A-Z0-9%]/.test(d.label), d.id + ' label starts lower case');
  });
});

test('the situation gate removes income types that do not fit', () => {
  const employed = typesFor(fields, 'income', 'employed').map(t => t.id);
  assert.ok(employed.includes('w2') && !employed.includes('c1099') && !employed.includes('unemployment'));
  const self = typesFor(fields, 'income', 'self-employed').map(t => t.id);
  assert.ok(self.includes('c1099') && !self.includes('w2'));
  const between = typesFor(fields, 'income', 'between-jobs').map(t => t.id);
  assert.ok(between.includes('unemployment'));
  const none = typesFor(fields, 'income', null).map(t => t.id);
  assert.ok(none.includes('w2') && none.includes('c1099'));
  assert.ok(typesFor(fields, 'spending', 'retired').map(t => t.id).includes('line'));
});

test('a fresh row has every field as unknown except declared defaults', () => {
  const f = freshFacts(fields, 'income', 'w2');
  assert.equal(f.grossPay.state, 'unknown');
  assert.equal(f.payFrequency.v, 'biweekly');
  assert.equal(f.payFrequency.state, 'known');
  assert.equal(Object.keys(f).length, fields.planets.income.types.w2.fields.length);
});

test('every row type has one primary money field (or a numeric headline)', () => {
  PLANETS.forEach(p => Object.keys(fields.planets[p].types).forEach(tid => {
    const prim = primaryFieldOf(fields, p, tid);
    assert.ok(prim, p + '/' + tid);
    const primaries = fieldsOfType(fields, p, tid).filter(f => f.primary);
    assert.ok(primaries.length <= 1, p + '/' + tid + ' has two primaries');
  }));
});

test('journey: no fact is asked twice (Sun fields and planet fields never share an id or a label)', () => {
  const sunIds = ['name', 'birthDate', 'state', 'city', 'workSituation', 'dependents', 'filingStatus', 'bigGoal'];
  sunIds.forEach(id => assert.ok(!fields.fields[id], id + ' is both a Sun fact and a planet field'));
  const labelsByPlanet = {};
  Object.values(fields.fields).forEach(d => {
    labelsByPlanet[d.owner] = labelsByPlanet[d.owner] || {};
    assert.ok(!labelsByPlanet[d.owner][d.label] || ['Amount', 'What it is', 'Label'].includes(d.label), d.owner + ' asks "' + d.label + '" twice (' + d.id + ' and ' + labelsByPlanet[d.owner][d.label] + ')');
    labelsByPlanet[d.owner][d.label] = d.id;
  });
});
