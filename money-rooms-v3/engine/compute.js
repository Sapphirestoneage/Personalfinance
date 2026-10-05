/* The engine's front door. Takes a record and the data libraries, runs every
   planet's five stations against the Sun, then the projection, metrics,
   lenses and leverage. Returns one frozen result that views read from.
   Level 0 publishes the confidence fill per planet and the Sun. */

import { PLANETS, SUN_FIELDS } from './sun.js';
import { confidenceOf } from './states.js';

export function fillOf(fields) {
  const list = fields.filter(f => f && f.state !== 'not-applicable' && f.state !== 'not-for-me');
  if (!list.length) return 0;
  const total = list.reduce((s, f) => s + confidenceOf(f), 0);
  return Math.round((total / list.length) * 1000) / 1000;
}

export function compute(record, data) {
  const fills = {};
  fills.sun = fillOf(SUN_FIELDS.map(id => record.sun.f[id]));
  PLANETS.forEach(p => {
    const fields = [];
    record.planets[p].rows.forEach(r => Object.keys(r.f).forEach(k => fields.push(r.f[k])));
    fills[p] = fields.length ? fillOf(fields) : null;
  });
  const rowCounts = {};
  PLANETS.forEach(p => { rowCounts[p] = record.planets[p].rows.length; });
  return Object.freeze({
    computedAt: new Date().toISOString(),
    fills: Object.freeze(fills),
    rowCounts: Object.freeze(rowCounts),
    data: data || null,
  });
}
