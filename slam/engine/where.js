// Where to find a number and about how long it takes (Rough now and later, step 5), from data/where-to-find.json
// (Builder can change the words and minutes in this browser). Also the four sorts and three groupings Still guessing
// offers. Pure: the table is passed in.

import { getAt, valueOf as v } from './spine.js';
import { isSubscription } from './subscriptions.js';

const RETIREMENT = /k401|403b|457|tsp|ira|roth|sep|simple|pension/i;
const WHEN = {
  card: (x) => x.type === 'credit_card',
  loan: (x) => x.type !== 'credit_card',
  retirement: (x) => RETIREMENT.test(x.type || ''),
  subscription: (x) => isSubscription(x),
  housing: (x) => x.fat === 'accommodation' || /\b(rent|utilit|electric|gas|water|internet|mortgage)\b/i.test((x.label || '') + ' ' + x.id),
  insurance: (x) => /insurance|premium|deductible/i.test((x.label || '') + ' ' + x.id),
  property: (x) => /^(car|home|real_estate|vehicle|property|other_asset)$/.test(x.type || '')
};
// The kind of number at a path: the first kind whose match fits.
export function whereKind(spine, path, table) {
  const seg = path.split('.'), col = seg[0];
  const list = Array.isArray(spine[col]) ? spine[col] : null;
  const item = list ? list.find((x) => String(x.id) === seg[1]) : null;
  const field = list ? seg[2] : seg[1];
  const fits = (m) => (!m.collection || m.collection === col) && (!m.fields || m.fields.includes(field)) && (!m.when || (item && WHEN[m.when] && WHEN[m.when](item)));
  return table.kinds.find((k) => k.match.some(fits)) || table.kinds[table.kinds.length - 1];
}

// Each guess with its where and minutes: { ...item, where, short, minutes, whereId }.
export const withWhere = (spine, items, table) => items.map((it) => { const k = whereKind(spine, it.path, table); return { ...it, whereId: k.id, where: k.where, short: k.short, minutes: k.minutes }; });

const amountOf = (spine, path) => { const f = getAt(spine, path), x = f ? v(f) : null; return typeof x === 'number' ? Math.abs(x) : x && typeof x === 'object' && typeof x.amount === 'number' ? Math.abs(x.amount) : 0; };
// Impact: the ranking's own score; a missing number a result waits on comes first whatever its score.
const impact = (it) => (it.kind === 'missing' && it.blocks && it.blocks.length ? 1e6 : it.score || 0);
export const SORTS = {
  quick: { label: 'Quick wins', by: (spine) => (a, b) => impact(b) / b.minutes - impact(a) / a.minutes || a.minutes - b.minutes },
  urgent: { label: 'Most urgent', by: () => (a, b) => impact(b) - impact(a) },
  biggest: { label: 'Biggest amount', by: (spine) => (a, b) => amountOf(spine, b.path) - amountOf(spine, a.path) || impact(b) - impact(a) },
  easiest: { label: 'Easiest to find', by: () => (a, b) => a.minutes - b.minutes || impact(b) - impact(a) }
};
export function sortGuesses(spine, items, how = 'quick') {
  const s = SORTS[how] || SORTS.quick;
  return [...items].sort((a, b) => s.by(spine)(a, b) || a.path.localeCompare(b.path));
}
const GROUP_WORDS = { D: 'Debt', A: 'Assets', T: 'Taxes', I: 'Income', N: 'Needs', G: 'Goals', E: 'Needs', P: 'Profile' };
// Groups in order: { key, title, items, minutes }. By where: "Your paystub: 4 numbers, about 5 min" (one visit
// finds them all, so the minutes are the kind's, not added up).
export function groupGuesses(items, by = 'none') {
  if (by === 'none') return [{ key: 'all', title: null, items, minutes: null }];
  const groups = new Map();
  for (const it of items) {
    const key = by === 'where' ? it.whereId : it.group || '?';
    if (!groups.has(key)) groups.set(key, { key, where: it.where, minutes: it.minutes, items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()].map((g) => ({ ...g, title: by === 'where' ? g.where + ': ' + g.items.length + (g.items.length === 1 ? ' number' : ' numbers') + ', about ' + g.minutes + ' min' : (GROUP_WORDS[g.key] || 'Other') + ': ' + g.items.length }));
}
