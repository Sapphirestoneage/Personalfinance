/* The field registry: reads data/fields.json. Which row types a planet has,
   which fields a type carries, what applies to the household's work
   situation, and the default state and source for a fresh row. */

import { field as mkField } from './states.js';

export function typesFor(fields, planet, workSituation) {
  const pl = fields.planets[planet];
  if (!pl) throw new Error('no planet ' + planet);
  return Object.keys(pl.types).filter(tid => {
    const t = pl.types[tid];
    if (!t.situations || !workSituation) return true;
    return t.situations.indexOf(workSituation) !== -1;
  }).map(tid => Object.assign({ id: tid }, pl.types[tid]));
}

export function typeDef(fields, planet, typeId) {
  const pl = fields.planets[planet];
  const t = pl && pl.types[typeId];
  if (!t) throw new Error('no row type ' + planet + '/' + typeId);
  return Object.assign({ id: typeId }, t);
}

export function fieldDef(fields, fieldId) {
  const d = fields.fields[fieldId];
  if (!d) throw new Error('no field ' + fieldId);
  return d;
}

export function fieldsOfType(fields, planet, typeId) {
  return typeDef(fields, planet, typeId).fields.map(id => fieldDef(fields, id));
}

export function primaryFieldOf(fields, planet, typeId) {
  const list = fieldsOfType(fields, planet, typeId);
  return list.find(f => f.primary) || list.find(f => f.kind === 'money') || list[0];
}

/* A fresh row's facts: every field present as unknown, choice defaults filled as known. */
export function freshFacts(fields, planet, typeId) {
  const t = typeDef(fields, planet, typeId);
  const f = {};
  t.fields.forEach(id => {
    const d = fieldDef(fields, id);
    const dv = t.defaults && t.defaults[id];
    const ev = t.estimates && t.estimates[id];
    if (dv !== undefined) f[id] = mkField(dv, 'known', d.defaultSource === 'estimated' ? 'estimated' : 'client');
    else if (ev !== undefined) f[id] = mkField(ev, 'rough', 'estimated'); /* MR-060: a standard stand-in (a card at 20% APR with a $5,000 limit) until the real figure arrives */
    else f[id] = mkField(null, 'unknown', d.defaultSource || 'client');
  });
  return f;
}

/* Every field id has exactly one owner: the planet whose type lists it. */
export function ownershipProblems(fields) {
  const problems = [];
  const seenIn = {};
  Object.keys(fields.planets).forEach(p => {
    Object.keys(fields.planets[p].types).forEach(tid => {
      fields.planets[p].types[tid].fields.forEach(id => {
        const d = fields.fields[id];
        if (!d) { problems.push(p + '/' + tid + ' lists unknown field ' + id); return; }
        if (d.owner !== p) problems.push(id + ' is owned by ' + d.owner + ' but used by ' + p);
        seenIn[id] = seenIn[id] || new Set();
        seenIn[id].add(p);
      });
    });
  });
  Object.keys(fields.fields).forEach(id => {
    if (!seenIn[id]) problems.push(id + ' is defined but no row type uses it');
    else if (seenIn[id].size > 1) problems.push(id + ' is used by two planets: ' + Array.from(seenIn[id]).join(','));
  });
  return problems;
}

export const KINDS = Object.freeze(['money', 'percent', 'int', 'text', 'date', 'month', 'choice', 'bool', 'hours', 'credits']);

/* "I do not have this" (MR-025): one row named None whose primary figure is a typed zero in the
   None state and whose other facts are not applicable. Fills count it as answered; totals read 0. */
export function noneRow(fields, planet, typeId) {
  const tdef = typeDef(fields, planet, typeId);
  const prim = primaryFieldOf(fields, planet, typeId);
  const f = freshFacts(fields, planet, typeId);
  tdef.fields.forEach(id => {
    const def = fieldDef(fields, id);
    if (prim && id === prim.id && def.kind === 'money') f[id] = { v: 0, state: 'none', source: 'client' };
    else f[id] = { v: null, state: 'not-applicable', source: 'client' };
  });
  return { nickname: 'None', f };
}
export function isNoneRow(fields, row) {
  const prim = primaryFieldOf(fields, row.planet, row.type);
  const pf = prim && row.f[prim.id];
  return row.nickname === 'None' && !!pf && pf.state === 'none';
}

/* A field tied to a cadence (pay frequency) is asked only while the row's headline figure is typed in that cadence (MR-032). */
export function askedOnRow(fields, row, fieldId) {
  const def = fields.fields[fieldId]; if (!def || !def.onlyWhenCadence) return true;
  const headId = Object.keys(row.f).find(k => fields.fields[k] && fields.fields[k].cadence);
  if (!headId) return true;
  const hf = row.f[headId]; const cad = (hf && hf.cad) || fields.fields[headId].defaultCadence || 'month';
  return cad === def.onlyWhenCadence;
}
