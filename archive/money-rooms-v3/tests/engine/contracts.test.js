import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT, PLANETS, publish, readerFor, createSun, ContractError, READS } from '../../engine/sun.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const md = fs.readFileSync(path.join(here, '..', '..', 'CONTRACTS.md'), 'utf8');

const HEADINGS = { income: '## 1. Income', spending: '## 2. Spending', debt: '## 3. Debt and Credit', safety: '## 4. Safety Net', invest: '## 5. Investments and Accounts', taxes: '## 6. Taxes', life: '## 7. Life Plan' };

function keysInDoc(planet) {
  const start = md.indexOf(HEADINGS[planet]);
  assert.ok(start !== -1, 'heading for ' + planet);
  const rest = md.slice(start + HEADINGS[planet].length);
  const end = rest.indexOf('\n## ');
  const section = rest.slice(0, end === -1 ? undefined : end);
  return (section.match(/^\| `([A-Za-z0-9]+)` \|/gm) || []).map(m => m.replace(/^\| `/, '').replace(/` \|$/, ''));
}

test('every planet publishes exactly the keys CONTRACTS.md lists', () => {
  PLANETS.forEach(p => {
    assert.deepEqual(CONTRACT[p].slice(), keysInDoc(p), p);
  });
});

test('a planet cannot publish an extra key or skip one', () => {
  const sun = createSun();
  const full = {};
  CONTRACT.life.forEach(k => { full[k] = null; });
  publish(sun, 'life', full);
  assert.ok(sun.outputs.life);
  assert.throws(() => publish(sun, 'life', Object.assign({ extra: 1 }, full)), ContractError);
  const short = Object.assign({}, full); delete short.goals;
  assert.throws(() => publish(sun, 'life', short), ContractError);
});

test('planets never read each other directly: only listed slots and facts', () => {
  const sun = createSun();
  const r = readerFor(sun, 'spending');
  assert.throws(() => r.slot('debt.totalDebt'), ContractError);
  assert.throws(() => r.fact('name'), ContractError);
  assert.equal(r.slot('income.takeHomeMonthly'), undefined);
  PLANETS.forEach(p => {
    READS[p].slots.forEach(s => {
      const [other, key] = s.split('.');
      assert.notEqual(other, p, p + ' reads its own slot');
      assert.ok(CONTRACT[other].indexOf(key) !== -1, s + ' is a published key');
    });
  });
});

test('the doc read lines name the same slots the code allows', () => {
  PLANETS.forEach(p => {
    const start = md.indexOf(HEADINGS[p]);
    const section = md.slice(start, md.indexOf('\n## ', start + 5));
    const readLine = /Reads[^\n]*\n(?:[^\n|]*\n)?/.exec(section);
    assert.ok(readLine, 'a Reads line for ' + p);
    READS[p].slots.forEach(s => {
      const key = s.split('.')[1];
      assert.ok(readLine[0].indexOf('`' + key + '`') !== -1, p + ' doc names ' + key);
    });
  });
});
