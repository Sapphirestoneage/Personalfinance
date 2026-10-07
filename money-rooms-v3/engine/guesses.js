/* Guesses (Level 8, MR-045): every spending area the client did not give is
   filled from data/defaults.json (national averages by household size),
   scaled by the cost-of-living tier (the housing component for housing and
   utilities, all items for the rest) and by household sharing (a unit sized
   for the whole household, divided evenly). Source "estimated", shown as
   "Guess", never an anchor, never counted as complete. Rows carry
   guess: true so a tier or household change can recompute the ones still
   untouched. Pure builders; the record API applies them. */
import { peopleOf, countsTogether } from './household.js';
import { createRow } from './record.js';
import { freshFacts } from './fields.js';
import { multiplierFor } from './col.js';
import { hasValue } from './states.js';

export const GUESS_AREAS = Object.freeze(['accommodation', 'utilities', 'food', 'transportation', 'therapy', 'wants', 'irregular']);
const UNIT_BY_HOUSEHOLD = { 1: '1bed', 2: '2bed', 3: '3bed', 4: '3bed' };

export function isGuessRow(r) { return !!(r && r.guess); }
/* Areas the client has given: a real (non-guess) line with a figure above zero. A zero line (a phone on the family plan) gives that line, not the area. */
export function realCategories(record) {
  const out = {};
  record.planets.spending.rows.forEach(r => { if (r.type !== 'line' || isGuessRow(r) || !r.f.category || !hasValue(r.f.category)) return; const a = r.f.amount; if (a && hasValue(a) && (a.state === 'none' ? false : (typeof a.v === 'number' ? a.v > 0 : true))) out[r.f.category.v] = true; });
  return out;
}
export function unitFor(record) {
  const hh = record.household || { roommates: [] };
  if (hh.unitSize) return hh.unitSize;
  const n = 1 + (hh.roommates || []).length;
  return UNIT_BY_HOUSEHOLD[Math.min(4, n)] || '3bed';
}

/* The guess lines a record needs: one per area the client has not given (no real line, no gut anchor), as plain row objects. */
export function buildGuesses(record, data, tierInfo) {
  const d = data.defaults; const tiers = data.colTiers; const fields = data.fields;
  const hh = record.household || { roommates: [] }; const people = peopleOf(hh);
  const dep = record.sun.f.dependents && hasValue(record.sun.f.dependents) ? record.sun.f.dependents.v : 0;
  /* a partner counted together is one more mouth in every area; a roommate is not (their food is theirs) */
  const size = String(Math.min(4, Math.max(1, 1 + (dep || 0) + (countsTogether(hh) ? 1 : 0))));
  const gut = (record.anchors && record.anchors.gut) || {};
  const real = record.planets.spending.rows.filter(r => r.type === 'line' && !isGuessRow(r) && r.f.category && hasValue(r.f.category));
  const given = realCategories(record);
  const names = new Set(real.map(r => (r.nickname || '').toLowerCase()));
  const out = [];
  GUESS_AREAS.forEach(cat => {
    if (given[cat]) return;
    if (gut['spending:' + cat]) return;
    const mult = multiplierFor(tierInfo, cat, tiers);
    const mk = (name, full, shared) => {
      if (names.has(name.toLowerCase())) return; /* a real line with this name already exists (a phone on the family plan) */
      const row = createRow('spending', 'line', { nickname: name, f: freshFacts(fields, 'spending', 'line') });
      row.guess = true; row.guessTier = tierInfo.tier; row.guessUnit = (cat === 'accommodation' || cat === 'utilities') ? unitFor(record) : null;
      row.f.category = { v: cat, state: 'known', source: 'estimated' };
      row.f.amount = { v: full, state: 'rough', source: 'estimated', cad: 'month' };
      row.f.needWant = { v: ['wants', 'irregular'].includes(cat) ? 'want' : 'need', state: 'known', source: 'estimated' };
      row.f.fatFloor = { v: ['accommodation', 'food', 'transportation'].includes(cat), state: 'known', source: 'estimated' };
      row.f.mistake = { v: 'unavoidable', state: 'known', source: 'estimated' };
      if (shared) { row.f.shared = { v: true, state: 'known', source: 'estimated' }; row.f.myShare = { v: Math.round(10000 / people) / 10000, state: 'known', source: 'estimated' }; }
      out.push(row);
    };
    if ((cat === 'accommodation' || cat === 'utilities') && d.housingByUnit) {
      const unit = d.housingByUnit[unitFor(record)] || d.housingByUnit['1bed'];
      const base = cat === 'accommodation' ? unit.rent : unit.utilities;
      const full = Math.round(base * mult);
      mk(cat === 'accommodation' ? 'Rent (' + unitFor(record).replace('bed', ' bed') + ')' : 'Utilities and internet', full, people > 1);
      if (cat === 'utilities') { const other = (d.categories.utilities.lines[size] || []).filter(l => !/utilit/i.test(l[0])); other.forEach(([name, cents]) => { if (names.has(name.toLowerCase())) return; const r2 = createRow('spending', 'line', { nickname: name, f: freshFacts(fields, 'spending', 'line') }); r2.guess = true; r2.guessTier = tierInfo.tier; r2.f.category = { v: cat, state: 'known', source: 'estimated' }; r2.f.amount = { v: Math.round(cents * mult), state: 'rough', source: 'estimated', cad: 'month' }; r2.f.needWant = { v: 'need', state: 'known', source: 'estimated' }; r2.f.fatFloor = { v: false, state: 'known', source: 'estimated' }; r2.f.mistake = { v: 'unavoidable', state: 'known', source: 'estimated' }; out.push(r2); }); }
      return;
    }
    (d.categories[cat] ? d.categories[cat].lines[size] : []).forEach(([name, cents]) => mk(name, Math.round(cents * mult), false));
  });
  return out;
}

/* Which guess rows are still guesses (untouched), by area. */
export function guessRows(record) { return record.planets.spending.rows.filter(isGuessRow); }
export function guessCount(record, asm) { return asm && asm.fillGapsWithGuesses === false ? 0 : guessRows(record).length; }
