// The rules registry: every limit, bracket, rate and threshold an engine uses.
// Values live in data/rules-<year>.json; no engine writes a number like these inline.
// Engines take a Rules object as an argument, so they stay pure and testable.

// makeRules(registry, registry, ...) -> { get, meta, has, ids, years, cite }
// get(id, year) returns the value for that year. A year with no registry falls
// back to the latest earlier one (projections into later years use today's rules,
// in today's dollars) and meta() says which year was used.
export function makeRules(...registries) {
  const byYear = new Map();
  for (const reg of registries) {
    if (!reg || !Number.isInteger(reg.year) || !Array.isArray(reg.rules)) throw new Error('A rules registry needs a year and a rules list');
    const map = new Map();
    for (const r of reg.rules) {
      if (map.has(r.id)) throw new Error('Duplicate rule id ' + r.id + ' in ' + reg.year);
      map.set(r.id, r);
    }
    byYear.set(reg.year, map);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (!years.length) throw new Error('No rules registry loaded');

  function yearFor(year) {
    if (year === undefined || year === null) return years[years.length - 1];
    let pick = null;
    for (const y of years) if (y <= year) pick = y;
    return pick === null ? years[0] : pick;
  }

  function meta(id, year) {
    const used = yearFor(year);
    const rec = byYear.get(used).get(id);
    if (!rec) throw new Error('Unknown rule id ' + id);
    return { ...rec, year: used, requestedYear: year ?? used, fallback: year != null && used !== year };
  }

  return {
    get: (id, year) => meta(id, year).value,
    meta,
    has: (id, year) => byYear.get(yearFor(year)).has(id),
    ids: (year) => [...byYear.get(yearFor(year)).keys()],
    years: () => years.slice(),
    // A short citation an engine attaches to a number it produced.
    cite: (id, year) => {
      const m = meta(id, year);
      return { id, year: m.year, verified: m.verified };
    }
  };
}

// The per-filing-status rule ids, so engines never spell out a status table.
const STATUS_SUFFIX = { single: 'S', mfj: 'J', mfs: 'MFS', hoh: 'H' };

export function statusRuleId(prefix, filingStatus) {
  const suffix = STATUS_SUFFIX[filingStatus];
  if (!suffix) throw new Error('Unknown filing status ' + filingStatus);
  return prefix + '_' + suffix;
}

// ---------------------------------------------------------------- rules changed in this browser (S-230)
// The Builder's Rules page edits a rule, or imports a rules file, as overrides kept in this browser: for one year,
// { <id>: { value?, rule?, source?, notes?, ... } }, laid over that year's file. A rule the file does not have is
// added whole. An override whose value is not the same sort as the file's (a number, words, a list) is left out, so
// a bad override never stops a page. The file itself is never changed.
const sortOf = (v) => (v === null || v === undefined ? 'none' : Array.isArray(v) ? 'list' : typeof v);
export const RULE_SORT_WORDS = { number: 'a number', string: 'words', list: 'a list', object: 'a record', boolean: 'yes or no', none: 'nothing' };
export const sameSort = (a, b) => sortOf(a) === 'none' || sortOf(a) === sortOf(b);
export function withOverrides(registry, overrides) {
  if (!overrides || typeof overrides !== 'object' || !Object.keys(overrides).length) return registry;
  const seen = new Set();
  const rules = registry.rules.map((r) => {
    const o = overrides[r.id];
    if (!o || typeof o !== 'object') return r;
    seen.add(r.id);
    return 'value' in o && !sameSort(r.value, o.value) ? r : { ...r, ...o, id: r.id };
  });
  for (const [id, o] of Object.entries(overrides)) if (!seen.has(id) && o && typeof o === 'object' && 'value' in o && sortOf(o.value) !== 'none') rules.push({ ...o, id });
  return { ...registry, rules };
}

// Equal as data, whatever order an object's keys are in.
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

// A rules file read in the browser, against the rules in use now: what it adds, what it changes (each key with its
// old and new), what it leaves out, and what it holds that cannot be used. A key the file leaves out keeps today's.
// Nothing is applied here.
export function diffRules(current, incoming) {
  const now = new Map(current.rules.map((r) => [r.id, r]));
  const added = [], changed = [], removed = [], refused = [], seen = new Set();
  for (const r of incoming.rules) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || !('value' in r)) { refused.push({ id: r && typeof r.id === 'string' ? r.id : null, why: 'it has no id or no value' }); continue; }
    if (seen.has(r.id)) { refused.push({ id: r.id, why: 'it is in the file twice' }); continue; }
    seen.add(r.id);
    const old = now.get(r.id);
    if (!old) { if (sortOf(r.value) === 'none') refused.push({ id: r.id, why: 'it has no value' }); else added.push({ id: r.id, after: r }); continue; }
    if (!sameSort(old.value, r.value)) { refused.push({ id: r.id, why: 'its value is ' + RULE_SORT_WORDS[sortOf(r.value)] + ', and the app needs ' + RULE_SORT_WORDS[sortOf(old.value)] }); continue; }
    const keys = Object.keys(r).filter((k) => k !== 'id' && !same(old[k], r[k]));
    if (keys.length) changed.push({ id: r.id, before: old, after: r, keys });
  }
  for (const r of current.rules) if (!seen.has(r.id)) removed.push({ id: r.id, before: r });
  return { year: incoming.year, added, changed, removed, refused, count: added.length + changed.length };
}

// The overrides after applying a file's differences: an added rule whole, a changed rule's changed keys. A rule the
// file leaves out is kept as it is (the app still reads it).
export function importOverrides(overrides, diff) {
  const next = { ...(overrides || {}) };
  for (const a of diff.added) next[a.id] = { ...a.after };
  for (const c of diff.changed) next[c.id] = { ...(next[c.id] || {}), ...Object.fromEntries(c.keys.map((k) => [k, c.after[k]])) };
  return next;
}

// A rules file in plain words when it is not one: null when it is.
export const notRulesWords = (x) => (!x || typeof x !== 'object' || Array.isArray(x) ? 'It is not a rules file.' : !Number.isInteger(x.year) ? 'It does not say which year its rules are for.' : !Array.isArray(x.rules) ? 'It has no list of rules.' : null);

// House defaults (Phase 2.5 B1, docs/DATA_LAYERS.md layer 3): Eli's method applied to everyone (a card's rate when it
// is not known, the due day, the Rule of 5, the housing reference, the FOO order, what is too small to matter). They
// live in data/house-defaults.json, not the law's yearly file, and the Builder's House defaults page edits them (kept
// in this browser under overrides.house). Engines read them through the same get() as a law, every year.
export const HOUSE = 'house';
export function withHouse(registry, house, houseOverrides) {
  if (!house || !Array.isArray(house.rules)) return registry;
  const own = withOverrides({ year: registry.year, rules: house.rules.map((r) => ({ ...r, layer: HOUSE })) }, houseOverrides).rules.map((r) => ({ ...r, layer: HOUSE }));
  const ids = new Set(own.map((r) => r.id));
  return { ...registry, rules: [...registry.rules.filter((r) => !ids.has(r.id)), ...own] };
}
export const isHouseRule = (r) => !!r && r.layer === HOUSE;

// Browser and Node loaders. The engines never call these; pages and tests do. overrides: { <year>: { <id>: {...} },
// house: { <id>: {...} } }.
export async function fetchRules(baseUrl, years = [2026], overrides = {}) {
  const [regs, house] = await Promise.all([
    Promise.all(years.map((y) => fetch(new URL('rules-' + y + '.json', baseUrl)).then((r) => r.json()))),
    fetch(new URL('house-defaults.json', baseUrl)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  ]);
  return makeRules(...regs.map((r) => withHouse(withOverrides(r, overrides && overrides[r.year]), house, overrides && overrides[HOUSE])));
}
