// Type depth (S-266): what each account, debt and income type has, from data/type-features.json (passed in as `cat`,
// so this stays pure). A feature is a yes, no or not sure question about one item; yes opens its fields (a house default
// or a guess fills as a guess, never as known), no sets them to not for me (what was typed is kept on the Fact as
// `was`, so yes brings it back), not sure leaves them missing and makes a to-do for whoever supplies them.
//
// Compatibility: items gain an optional `ticks` map { featureId: 'yes' | 'no' | 'notSure' }; older files have none.

import { getAt, valueOf as v } from './spine.js';
import { putFact } from './edits.js';

// The features of one item, in the catalog's order: [{ id, question, tier, engines, reveals, note }].
export function featuresOf(cat, item, collection) {
  if (!cat || !item) return [];
  if (collection === 'income') return cat.income[item.type] || [];
  const t = cat.types[item.type];
  if (!t) return [];
  const fam = cat.families[t.family] || {};
  return [...t.uses.map((id) => fam[id]).filter(Boolean), ...t.own];
}
// The features for a type before the item exists (the add form).
export function featuresOfType(cat, type, collection) { return featuresOf(cat, { type }, collection); }

// "4 of 9 checked": how many have an answer.
export function tickCount(cat, item, collection, { tier = null } = {}) {
  const fs = featuresOf(cat, item, collection).filter((f) => !tier || f.tier === tier);
  const ticks = item.ticks || {};
  return { checked: fs.filter((f) => ticks[f.id]).length, total: fs.length };
}

const stamp = (today) => ({ asOf: today, source: 'type default' });
// The value a field starts with when its feature is ticked yes: a house default (a rule) or a guess, as rough.
function startValue(r, rules, year) {
  if (!r.default) return undefined;
  if ('value' in r.default) return { value: r.default.value, kind: 'known' };
  if ('guess' in r.default) return { value: r.default.guess, kind: 'rough' };
  if ('rule' in r.default && rules) { const x = rules.get(r.default.rule, year); return x === null || x === undefined ? undefined : { value: x, kind: 'rough' }; }
  return undefined;
}

// Answers one feature for the item at `base` ("accounts.k401"): yes, no, notSure or null (no answer). Returns the spine.
export function tickFeature(spine, base, feature, answer, { rules = null, today }) {
  const item = getAt(spine, base);
  if (!item) throw new Error('No item at ' + base);
  const year = +today.slice(0, 4);
  let s = spine;
  for (const r of feature.reveals) {
    const path = base + '.' + r.field, f = getAt(s, path);
    const typed = f && f.kind !== 'missing' && f.kind !== 'notForMe' && f.value !== null && f.value !== undefined;
    if (answer === 'no') {
      if (f && f.kind === 'notForMe') continue;
      s = putFact(s, path, null, 'notForMe', today);
      if (typed) s = setWas(s, path, f);
    } else if (answer === 'yes' || answer === 'notSure') {
      if (f && f.kind === 'notForMe' && f.was) { s = putFact(s, path, f.was.value, f.was.kind, today); continue; }
      if (typed) continue;
      const start = answer === 'yes' ? startValue(r, rules, year) : undefined;
      s = start ? putFact(s, path, start.value, start.kind, today) : putFact(s, path, null, 'missing', today);
      if (start) s = setSource(s, path, start.kind === 'rough' ? 'type default (a guess)' : 'type default');
    }
  }
  const it = getAt(s, base), ticks = { ...(it.ticks || {}) };
  if (answer === null) delete ticks[feature.id]; else ticks[feature.id] = answer;
  return setItem(s, base, { ...it, ticks });
}
// The Fact keeps what was typed while it is "no", so a later yes restores it.
function setWas(s, path, was) { const f = getAt(s, path); return setFactAt(s, path, { ...f, was: { value: was.value, kind: was.kind } }); }
function setSource(s, path, source) { const f = getAt(s, path); return setFactAt(s, path, { ...f, source }); }
function setFactAt(s, path, fact) {
  const parts = path.split('.'), field = parts.pop(), base = parts.join('.');
  return setItem(s, base, { ...getAt(s, base), [field]: fact });
}
function setItem(s, base, item) {
  const [coll, id] = base.split('.');
  return { ...s, [coll]: s[coll].map((x) => (x.id === id ? item : x)) };
}

// The fields a "no" hides on screen.
export function hiddenFields(cat, item, collection) {
  const ticks = item.ticks || {};
  return new Set(featuresOf(cat, item, collection).filter((f) => ticks[f.id] === 'no').flatMap((f) => f.reveals.map((r) => r.field)));
}

// To-dos from "not sure" (S-266): each feature not sure on any item, for the client (a field the client knows) or for
// the coach (all its fields are ones the coach can look up). [{ who, words, path }].
export function tickTodos(cat, spine) {
  const out = [];
  for (const coll of ['accounts', 'debts', 'income']) for (const item of spine[coll] || []) {
    const ticks = item.ticks || {};
    for (const f of featuresOf(cat, item, coll)) {
      if (ticks[f.id] !== 'notSure') continue;
      const open = f.reveals.filter((r) => { const x = item[r.field]; return !x || x.value === null || x.value === undefined; });
      if (!open.length) continue;
      const who = open.some((r) => r.supplier === 'client') ? 'client' : 'coach';
      const name = coll === 'income' ? item.label : (v(item.name) || item.id);
      out.push({ who, words: name + ': ' + f.question, path: coll + '.' + item.id + '.' + open[0].field });
    }
  }
  return out;
}

// Match tiers (S-266): what a plan matches, as [{ rate, upTo }] (upTo: the width of pay this tier covers). From
// matchTiers when there, else the one tier of matchRate and matchCap, else none.
export function matchTiersOf(a) {
  const t = a && a.matchTiers && Array.isArray(v(a.matchTiers)) ? v(a.matchTiers) : null;
  if (t && t.length) return t;
  const rate = a && a.matchRate ? v(a.matchRate) : null, cap = a && a.matchCap ? v(a.matchCap) : null;
  return typeof rate === 'number' && rate > 0 && typeof cap === 'number' && cap > 0 ? [{ rate, upTo: cap }] : [];
}
// The employer's match a month on `put` a month in, at `wage` a month of pay: each tier matches its share of what goes in.
export function matchOn(tiers, put, wage) {
  let from = 0, out = 0;
  for (const t of tiers) { const band = Math.max(0, Math.min(put, (from + t.upTo) * wage) - from * wage); out += t.rate * band; from += t.upTo; }
  return out;
}
// The share of pay that gets the full match.
export const fullMatchShare = (tiers) => tiers.reduce((a, t) => a + t.upTo, 0);

// Reads old match words ("100% of the first 3%, 50% of the next 2%", "50% up to 6%", "dollar for dollar up to 4%") as
// tiers; null when it cannot.
export function parseMatchText(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const t = text.toLowerCase().replace(/dollar[- ]for[- ]dollar/g, '100%');
  const re = /(\d+(?:\.\d+)?)\s*%[^%\d]*?(?:of\s+(?:the\s+)?(?:first|next)|up\s+to|on\s+(?:the\s+)?(?:first|next)?)\s*(\d+(?:\.\d+)?)\s*%/g;
  const out = [];
  for (let m = re.exec(t); m; m = re.exec(t)) out.push({ rate: +m[1] / 100, upTo: +m[2] / 100 });
  return out.length && out.every((x) => x.rate >= 0 && x.rate <= 2 && x.upTo > 0 && x.upTo <= 1) ? out : null;
}
