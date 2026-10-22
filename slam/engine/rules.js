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

// Browser and Node loaders. The engines never call these; pages and tests do.
export async function fetchRules(baseUrl, years = [2026]) {
  const regs = await Promise.all(years.map((y) => fetch(new URL('rules-' + y + '.json', baseUrl)).then((r) => r.json())));
  return makeRules(...regs);
}
