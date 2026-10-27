// A Social Security estimate (S-267), from each person's SSA statement: a month at 62, at full retirement age and at
// 70. Recorded only; the FI math does not count it yet, and the FI screens say so.

import { valueOf as v } from './spine.js';
import { SS_FIELDS } from './schema.js';

// [{ person, at62, atFra, at70, asOf }] for each person with any of it typed.
export function ssEstimates(spine) {
  const out = [];
  for (const p of (spine.household && spine.household.people) || []) {
    const x = Object.fromEntries(Object.keys(SS_FIELDS).map((k) => [k, p[k] ? v(p[k]) : null]));
    if ([x.ssAt62, x.ssAtFra, x.ssAt70].some((n) => typeof n === 'number')) out.push({ person: p.name || p.id, at62: x.ssAt62, atFra: x.ssAtFra, at70: x.ssAt70, asOf: x.ssAsOf });
  }
  return out;
}
export const SS_NOT_COUNTED = 'Social Security is not counted in this yet.';
