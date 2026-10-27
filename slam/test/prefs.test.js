import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hoursOf, fiDaysOf, savedPerDay } from '../engine/money-as.js';
import { readJson, SLAM } from './spine-helpers.js';

test('every preference is one line of data with a label, a hint, options and a default; each control is in the design kit', () => {
  const { prefs } = readJson('data/preferences.json');
  assert.deepEqual(prefs.map((p) => p.id), ['moneyAs', 'hide', 'round', 'theme', 'textSize', 'weekStart', 'dateStyle', 'window', 'tone', 'todayTiles', 'view']);
  for (const p of prefs) {
    assert.ok(p.label && p.hint && Array.isArray(p.options) && p.options.length >= 2 && p.default !== undefined, p.id);
    if (p.kind === 'choice') assert.ok(p.options.some(([k]) => k === p.default), p.id + ' default is an option');
  }
  assert.equal(prefs.find((p) => p.id === 'tone').saved, 'client', 'tone is saved on the client');
  const kit = readFileSync(SLAM + 'affordances.html', 'utf8');
  for (const c of ['pref-seg', 'pref-tiles', 'as-row']) assert.ok(kit.includes(c), c + ' is in the design kit');
});

test('show money as: hours of work and days of FI, null when the number it needs is missing', () => {
  assert.equal(hoursOf(100, 25), 4);
  assert.equal(hoursOf(100, null), null);
  const perDay = savedPerDay(913.13);
  assert.equal(fiDaysOf(300, perDay), 10);
  assert.equal(savedPerDay(0), null, 'saving nothing: no days of FI, never infinite');
  assert.equal(fiDaysOf(300, null), null);
});
