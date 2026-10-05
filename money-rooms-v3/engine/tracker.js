/* The fill tracker (MR-035): one ordered list of what is still needed, from
   the household facts through every planet's headline figures to the facts
   behind Details. Tags never count; a cadence-tied field counts only in its
   cadence; a type assumed none counts as answered; a rough total stands in
   for detail rows. The first open step is "do this now". */
import { PLANETS, SUN_ASKED, PLANET_LABELS } from './sun.js';
import { typesFor, primaryFieldOf, askedOnRow, isNoneRow } from './fields.js';
import { hasValue } from './states.js';

const SUMMARY = { spending: 'summary', debt: 'summary', invest: 'summary' };
const empty = f => !f || f.state === 'unknown' || f.state === 'will-send' || (!hasValue(f) && f.state !== 'none' && f.state !== 'not-applicable' && f.state !== 'not-for-me');

export function trackerSteps(record, fields) {
  const steps = [];
  const SUN_LABELS = { birthDate: 'Birth date', state: 'State', workSituation: 'Work situation', filingStatus: 'Filing status' };
  SUN_ASKED.forEach(id => {
    const f = record.sun.f[id];
    steps.push({ kind: 'sun', label: SUN_LABELS[id] || id, where: 'Household', href: '#/home', field: id, rowId: 'sun', done: !!(f && f.v !== null && f.v !== undefined && f.v !== '') });
  });
  const work = record.sun.f.workSituation ? record.sun.f.workSituation.v : null;
  /* stage 1: every planet has its rows (or a rough total, or none) */
  const planets = PLANETS.filter(p => p !== 'taxes');
  planets.forEach(p => {
    const rows = record.planets[p].rows;
    const types = typesFor(fields, p, work).map(t => t.id || t).filter(t => t !== 'other' && t !== 'summary');
    const summaryRow = rows.find(r => r.type === 'summary');
    const summaryIn = summaryRow && Object.values(summaryRow.f).some(f => f && hasValue(f));
    types.forEach(t => {
      const tdef = fields.planets[p].types[t];
      const have = rows.filter(r => r.type === t);
      if (tdef.assumeNone) return;
      if (have.length) return;
      if (SUMMARY[p] && summaryIn) return; /* a rough total stands in for the detail rows */
      steps.push({ kind: 'rows', label: 'Add ' + (tdef.plural || tdef.label).toLowerCase() + ', or none', where: PLANET_LABELS[p], href: '#/ledger/' + p + '/' + t, planet: p, typeId: t, done: false });
    });
  });
  /* stage 2: every row's headline figure, then its other counted facts */
  const headline = [], details = [];
  planets.forEach(p => {
    record.planets[p].rows.forEach(r => {
      if (isNoneRow(fields, r)) return;
      const tdef = fields.planets[p].types[r.type]; if (!tdef) return;
      const prim = primaryFieldOf(fields, p, r.type);
      const name = r.nickname || tdef.label;
      tdef.fields.forEach(id => {
        const d = fields.fields[id]; if (!d || d.tag || d.optional || !askedOnRow(fields, r, id)) return;
        const f = r.f[id];
        const step = { kind: prim && id === prim.id ? 'headline' : 'detail', label: name + ': ' + d.label.toLowerCase(), where: PLANET_LABELS[p], href: '#/ledger/' + p + '/' + r.type, rowId: r.id, field: id, done: !empty(f) };
        (step.kind === 'headline' ? headline : details).push(step);
      });
    });
  });
  const all = steps.concat(headline, details);
  const open = all.filter(s => !s.done);
  return { steps: all, total: all.length, done: all.length - open.length, next: open[0] || null, headlineOpen: headline.filter(s => !s.done).length, detailOpen: details.filter(s => !s.done).length };
}
