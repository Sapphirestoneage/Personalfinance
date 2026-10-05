/* Doors always open: a household with only some planets filled computes
   without throwing, and every metric is either ok or says what it needs.
   Found by the keyboard flow: income typed before spending once crashed DRAFTT. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../../engine/compute.js';
import { createRecord } from '../../engine/record.js';
import { loadData, loadHousehold } from './load-data.js';
import { PLANETS } from '../../engine/sun.js';

const data = loadData();
const full = loadHousehold('jordan');

function subset(planets, keepSun) {
  const rec = JSON.parse(JSON.stringify(full));
  PLANETS.forEach(p => { if (!planets.includes(p)) rec.planets[p].rows = []; });
  if (!keepSun) rec.sun.f = createRecord({ id: 'x' }).sun.f;
  return rec;
}

const combos = [[], ['income'], ['spending'], ['income', 'spending'], ['debt'], ['invest'], ['income', 'debt'], ['income', 'spending', 'debt'], ['income', 'spending', 'invest'], ['income', 'spending', 'debt', 'invest'], ['safety'], ['taxes'], ['life'], ['income', 'invest', 'safety', 'taxes', 'life']];
for (const keepSun of [true, false]) {
  for (const planets of combos) {
    test('partial household computes: ' + (planets.join('+') || 'nothing') + (keepSun ? ' with the Sun' : ' without the Sun'), () => {
      const R = compute(subset(planets, keepSun), data, { today: '2026-10-05' });
      Object.values(R.metrics).forEach(m => assert.ok(m.status === 'ok' || (m.status === 'needs' && m.needs.length > 0), m.id + ' is ' + m.status));
    });
  }
}
test('every planet alone, with the Sun, keeps every contract key present', () => {
  PLANETS.forEach(p => {
    const R = compute(subset([p], true), data, { today: '2026-10-05' });
    PLANETS.forEach(q => assert.ok(R.sun.outputs[q], q + ' published'));
  });
});
