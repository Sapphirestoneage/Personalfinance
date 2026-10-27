// Shared expenses (S-175): a bill split with other people. An expense is not
// shared unless it says so, or its section (food, housing, transportation,
// everything else) is shared by default in household.expenseDefaults.
// Fields, on an expense or a section default, all Facts:
//   shared (bool), sharedWith (people, you included), yourShare (0..1),
//   whoPays: part (each pays their part) | whole (you pay it all and get paid back).
// Your cost is the bill times your share either way; whoPays says how the cash moves.

import { valueOf, round2 } from './spine.js';

const v = valueOf;
export const SHARE_FIELDS = ['shared', 'sharedWith', 'yourShare', 'whoPays', 'covered', 'coveredBy', 'sharers'];
// Who can cover a bill: built in, then the household's own names (S-176).
export const BUILT_IN_PAYERS = ['Parents', 'Partner', 'Partner\'s family', 'Roommate', 'Employer', 'Family'];
export const payersOf = (spine) => [...new Set([...BUILT_IN_PAYERS, ...(spine.household.payers || [])])];
// An expense someone else pays: covered, and by whom.
export const coverOf = (e) => ({ covered: !!e.covered && valueOf(e.covered) === true, by: e.coveredBy ? valueOf(e.coveredBy) : null });
export const sectionOf = (e) => e.fat || 'other';

// How an expense is shared, and where each answer came from.
export function shareOf(spine, e) {
  // A bill with its people listed (shared bills brief, engine/owed.js): your part is what is left after theirs.
  const list = e.sharers ? valueOf(e.sharers) : null;
  if (Array.isArray(list) && list.length) {
    const whoPays = e.whoPays && valueOf(e.whoPays) === 'whole' ? 'whole' : 'part';
    const share = yourPart({ people: list, whoPays }, valueOf(e.amount));
    const base = 'expenses.' + e.id + '.';
    return { shared: true, people: list.length + 1, share, whoPays, from: [base + 'sharers', base + 'whoPays'], rough: e.sharers.kind === 'rough' ? [base + 'sharers'] : [], missing: share === null && valueOf(e.amount) !== null ? [base + 'sharers'] : [], fromDefault: false, listed: true };
  }
  const def = (spine.household.expenseDefaults || {})[sectionOf(e)] || {};
  const pick = (k) => (e[k] && e[k].kind !== 'missing' ? { f: e[k], path: 'expenses.' + e.id + '.' + k } : def[k] && def[k].kind !== 'missing' ? { f: def[k], path: 'household.expenseDefaults.' + sectionOf(e) + '.' + k } : { f: e[k] || def[k] || null, path: e[k] ? 'expenses.' + e.id + '.' + k : null });
  const s = pick('shared');
  const shared = v(s.f) === true;
  if (!shared) return { shared: false, share: 1, people: 1, whoPays: null, from: s.path ? [s.path] : [], fromDefault: !!(s.path && s.path.startsWith('household.')) };
  const p = pick('sharedWith'), y = pick('yourShare'), w = pick('whoPays');
  const people = v(p.f);
  // Your share: as entered, else an even split, else missing.
  const share = v(y.f) ?? (people ? 1 / people : null);
  const missing = [p, y].filter((x) => x.f === null || (x.f && x.f.kind === 'missing')).map((x) => x.path).filter(Boolean);
  return {
    shared: true, people, share, whoPays: v(w.f) || 'part',
    from: [s.path, p.path, y.path, w.path].filter(Boolean),
    rough: [s, p, y, w].filter((x) => x.f && x.f.kind === 'rough').map((x) => x.path),
    missing: v(y.f) === null && !people ? missing : [],
    fromDefault: s.path.startsWith('household.')
  };
}

// Your monthly cost of a bill: the amount times your share.
export const yourCost = (amount, share) => (amount === null || share === null ? null : amount * share);

// Your part of a shared bill, three ways (S-187): an even split (1 / people),
// a percent, or the dollars you pay of it (17.50 of a 70 bill is 25%).
export const evenShare = (people) => (Number.isInteger(people) && people >= 2 ? 1 / people : null);
export function shareFromAmount(bill, yours) {
  if (typeof bill !== 'number' || !(bill > 0) || typeof yours !== 'number' || yours < 0) return null;
  return yours / bill;
}

// One person's part of one charge of a listed bill, in dollars: an even split (with you), a part, or dollars.
// exact: unrounded, for your part (so an even three-way split costs you exactly a third).
export function theirAmount(arr, p, bill, { exact = false } = {}) {
  if (bill === null || bill === undefined) return null;
  const r = exact ? (x) => x : round2;
  if (p.share.mode === 'amount') return p.share.value;
  if (p.share.mode === 'percent') return p.share.value === null ? null : r(bill * p.share.value);
  return r(bill / (arr.people.length + 1));
}
// Your part of a listed bill as a share (0..1): what is left after the others' parts, anyone you cover counted as
// yours. Null when a part is missing or there is no bill amount.
export function yourPart(arr, bill) {
  if (!arr.people.length || bill === null || bill === undefined) return null;
  if (bill === 0) return 1;
  let others = 0;
  for (const p of arr.people) {
    if (p.payBack === 'cover' && arr.whoPays === 'whole') continue;
    const x = theirAmount(arr, p, bill, { exact: true });
    if (x === null) return null;
    others += x;
  }
  return Math.max(0, Math.min(1, (bill - others) / bill));
}
