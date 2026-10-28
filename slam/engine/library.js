// The picker's libraries and matching (S-284). Pure: the libraries are passed in (data/library-*.json, fetched by the
// page). Every value a library fills is a typical guess, stored rough with its source, never the client's own number.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9&+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const GROUP_ORDER = { mine: 0, recent: 1, library: 2 };

// How well an entry matches what was typed: 0 its name or a short form starts with it, 1 a word in it does, 2 it is
// inside; null no match. Short forms ("amex", "boa", "401k", "hysa") count as names.
export function matchScore(entry, q) {
  const t = norm(q);
  if (!t) return 3;
  const names = [entry.words, ...(entry.aliases || [])].map(norm);
  if (names.some((n) => n === t || n.startsWith(t))) return 0;
  if (names.some((n) => n.split(' ').some((w) => w.startsWith(t)) || n.replace(/ /g, '').startsWith(t.replace(/ /g, '')))) return 1;
  if (names.some((n) => n.includes(t))) return 2;
  return null;
}
// At most max matches: this client's own first, then recently used, then the library; best match first in each.
export function matchPicks(entries, q, max = 5) {
  const seen = new Set();
  return entries
    .map((e, i) => ({ e, i, s: matchScore(e, q) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => (GROUP_ORDER[a.e.from || 'library'] - GROUP_ORDER[b.e.from || 'library']) || (a.s - b.s) || (a.i - b.i))
    .map((x) => x.e)
    .filter((e) => { const k = norm(e.words); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max);
}

// A city or ZIP code: { state, locality: 'nyc' | 'yonkers' | null, words } or null.
// A New York ZIP's county from the ranges (first ZIP, last ZIP, county), or null. A ZIP between two ranges takes their
// county when both sides agree; otherwise it is left for the coach to type.
export function nyCountyOf(z, ranges) {
  if (!Array.isArray(ranges) || !ranges.length) return null;
  let lo = 0, hi = ranges.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ranges[mid][0] <= z) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  if (at < 0) return null;
  if (z <= ranges[at][1]) return ranges[at][2];
  return ranges[at + 1] && ranges[at + 1][2] === ranges[at][2] ? ranges[at][2] : null;
}
// What a place fills in the household: [path, value] pairs, so the ZIP answers the state, the county and whether New
// York City or Yonkers tax applies in one change. A county is written only when the ZIP names one.
export const placeFacts = (pl) => [['household.state', pl.state], ...(pl.zip ? [['household.zip', pl.zip]] : []), ...(pl.county ? [['household.county', pl.county]] : []), ['household.nycResident', pl.locality === 'nyc'], ['household.yonkersResident', pl.locality === 'yonkers']];
export function placeOf(text, places) {
  const t = String(text || '').trim();
  const zip = t.match(/^(\d{5})(?:-\d{4})?$/);
  if (zip) {
    const z = +zip[1], z3 = Math.floor(z / 100);
    const row = places.zip3.find(([a, b]) => z3 >= a && z3 <= b);
    if (!row) return null;
    const county = row[2] === 'NY' ? nyCountyOf(z, places.nyZipCounty) : null;
    // New York City is its five counties when the county is known, else the ZIP's first three digits.
    const nyc = county ? (places.nycCounties || []).includes(county) : places.nycZip3.includes(z3);
    const locality = z >= places.yonkersZip[0] && z <= places.yonkersZip[1] ? 'yonkers' : nyc ? 'nyc' : null;
    const where = locality === 'nyc' ? 'New York City' : locality === 'yonkers' ? 'Yonkers' : county ? county + ' County' : null;
    return { state: row[2], county, locality, zip: zip[1], words: 'ZIP ' + zip[1] + ' (' + (where ? where + ', ' : '') + row[2] + ')' };
  }
  const c = places.cities.find((x) => matchScore({ words: x.name, aliases: x.aliases }, t) === 0 && norm(t).length >= 2);
  return c ? { state: c.state, locality: c.locality || null, words: c.name + ', ' + c.state } : null;
}

// A target-date fund's stock share for a year, from the glide path (years to the target date, stock share).
export function glideShare(glide, targetYear, year) {
  const left = targetYear - year;
  if (left >= glide[0][0]) return glide[0][1];
  for (let i = 0; i < glide.length - 1; i++) {
    const [y1, s1] = glide[i], [y2, s2] = glide[i + 1];
    if (left <= y1 && left >= y2) return Math.round((s1 + (s2 - s1) * (y1 - left) / (y1 - y2)) * 1000) / 1000;
  }
  return glide[glide.length - 1][1];
}
// What picking a fund fills on an account: its fee and its stock share.
export function fundFills(fund, lib, year) {
  const stocks = fund.mix ? fund.mix.stocks : glideShare(lib.glide, fund.targetYear, year);
  return { expenseRatio: fund.expenseRatio, stockShare: stocks };
}
// What picking a card fills: its fee, its everyday rewards and a typical rate.
export const cardFills = (card) => ({ annualFee: card.annualFee, rewardsRate: card.rewardsRate, apr: card.typicalApr, institution: card.issuer });
export const LIBRARY_SOURCE = 'library (a typical guess)';

// Entries for the picker from each library.
export const cardEntries = (lib) => lib.cards.map((c) => ({ words: c.name, aliases: [...c.aliases, c.issuer], hint: c.issuer + (c.annualFee ? ', $' + c.annualFee + ' a year' : ', no annual fee'), value: c, source: 'card' }));
export const fundEntries = (lib) => lib.funds.map((f) => ({ words: f.ticker ? f.ticker + ': ' + f.name : f.name, aliases: [...(f.ticker ? [f.ticker] : []), f.name, ...f.aliases], hint: (Math.round(f.expenseRatio * 10000) / 100) + '% a year', value: f, source: 'fund' }));
export const institutionEntries = (lib, kinds = null) => lib.institutions.filter((x) => !kinds || kinds.includes(x.kind)).map((x) => ({ words: x.name, aliases: x.aliases, hint: { servicer: 'loan servicer', insurer: 'insurer', lender: 'lender', bank: 'bank or broker' }[x.kind], value: x, source: 'institution' }));
export const placeEntries = (lib) => lib.cities.map((c) => ({ words: c.name, aliases: c.aliases, hint: c.state + (c.locality === 'nyc' ? ', New York City tax' : c.locality === 'yonkers' ? ', Yonkers tax' : ''), value: c, source: 'place' }));
