// The big reveal (Part 7, S-286): End call opens on the FI date, large, with the three changes that moved it most and
// by how much. Pure: fiPoint reads one household; movers walks the history's steps (each a household and the words of
// the change that made it) and ranks them by how far each moved the FI date, in months. The shell keeps the last 25
// steps in this browser, so "this call" is those; the snapshot of the last call is kept by the screen (ui/end-call.js).

import { summarize } from './summary.js';
import { ageOn, addMonths, valueOf as v } from './spine.js';

// { years, ym, year, age, kind: 'on' | 'there' | 'notYet', rough }: where the FI date stands for this household.
export function fiPoint(spine, rules, s = summarize(spine, rules, { flags: false })) {
  const years = s.fi.yearsToFi.value, asOf = s.asOf;
  const rough = s.fi.yearsToFi.kind === 'rough' || (Array.isArray(s.fi.yearsToFi.rough) && s.fi.yearsToFi.rough.length > 0);
  if (years === null) return { years: null, ym: null, year: null, age: null, kind: 'notYet', rough: false };
  const ym = addMonths(asOf.slice(0, 7), Math.round(years * 12));
  const person = ((spine.household && spine.household.people) || [])[0] || {};
  const birth = v(person.birthDate);
  return { years, ym, year: +ym.slice(0, 4), age: birth ? Math.round(ageOn(birth, asOf) + years) : null, kind: years === 0 ? 'there' : 'on', rough };
}

// Months from a to b (b later is positive); null when either is not a date.
export const monthsBetween = (a, b) => (a && b ? (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) : null);

// How the FI date moved from one point to the next: { months } (negative is sooner), or { reach: 'in' | 'out' } when it
// came into or went out of reach, or null when nothing moved.
export function fiMove(before, after) {
  if (!before || !after) return null;
  if (before.ym && after.ym) { const m = monthsBetween(before.ym, after.ym); return m ? { months: m } : null; }
  if (!before.ym && after.ym) return { reach: 'in' };
  if (before.ym && !after.ym) return { reach: 'out' };
  return null;
}

// The changes that moved the FI date most: past is the history's steps [{ doc, label }] oldest first, present the
// household now. Each step's move is from its doc to the next. [{ label, move }] by size, at most n, moves of 0 left out.
export function movers(past, present, rules, n = 3) {
  if (!past || !past.length) return [];
  const points = [...past.map((x) => x.doc), present].map((doc) => { try { return fiPoint(doc, rules); } catch { return null; } });
  const out = [];
  for (let i = 0; i < past.length; i++) {
    const move = fiMove(points[i], points[i + 1]);
    if (move) out.push({ label: past[i].label || 'A change', move });
  }
  const size = (m) => (m.reach ? 1e6 : Math.abs(m.months));
  return out.sort((a, b) => size(b.move) - size(a.move)).slice(0, n);
}

// A move in words: "7 months sooner", "1 year 2 months later", "now in reach", "out of reach now".
export function moveWords(move) {
  if (!move) return 'no change';
  if (move.reach) return move.reach === 'in' ? 'now in reach' : 'out of reach now';
  const m = Math.abs(move.months), y = Math.floor(m / 12), r = m % 12;
  const span = [y ? y + (y === 1 ? ' year' : ' years') : null, r ? r + (r === 1 ? ' month' : ' months') : null].filter(Boolean).join(' ');
  return span + (move.months < 0 ? ' sooner' : ' later');
}
