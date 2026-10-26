// The household spine's smallest pieces: the Fact, paths, dates, and the Result
// every engine returns. No household math here.

// A Fact is one stored answer: { value, asOf, source, kind }.
// kind: known (they told us), rough (a guess to confirm), computed (derived and
// stored on purpose), missing (not given yet), notForMe (does not apply).
// missing and notForMe always carry value null. Missing is never 0.
export const KINDS = ['known', 'rough', 'computed', 'missing', 'notForMe'];

export function fact(value, opts = {}) {
  const kind = opts.kind || (value === null || value === undefined ? 'missing' : 'known');
  const f = {
    value: kind === 'missing' || kind === 'notForMe' ? null : value ?? null,
    asOf: opts.asOf ?? null,
    source: opts.source ?? null,
    kind: (kind === 'known' || kind === 'rough' || kind === 'computed') && (value === null || value === undefined) ? 'missing' : kind
  };
  if (opts.note) f.note = opts.note;
  if (opts.by && SUPPLIERS.includes(opts.by)) f.by = opts.by;
  return f;
}

// The four tags every number keeps (docs/DATA_LAYERS.md): where it came from (source), as of when (asOf), how sure
// (kind: known, rough, guess is rough, missing, notForMe) and who supplies it (by). A Fact saved before Phase 2.5 has
// no `by`; it is read from the source: a house default's id is Eli's default, typical amounts are looked up, anything
// else is the client's.
export const SUPPLIERS = ['client', 'coach', 'lookedUp', 'default'];
export const SUPPLIER_WORDS = { client: 'you', coach: 'Eli', lookedUp: 'looked up', default: "Eli's default" };
const HOUSE_SOURCES = /^(DEFAULT_[A-Z0-9_]+|APP_CARD_MIN_FLOOR|APP_CARD_MIN_PCT|house:[a-z0-9-]+)$/;
export function whoSupplies(f) {
  if (!f || typeof f !== 'object') return null;
  if (f.by && SUPPLIERS.includes(f.by)) return f.by;
  const src = String(f.source || '');
  if (HOUSE_SOURCES.test(src)) return 'default';
  if (/^(typical|reference)\b/i.test(src)) return 'lookedUp';
  return 'client';
}

export const isFact = (x) => !!x && typeof x === 'object' && 'value' in x && 'kind' in x && KINDS.includes(x.kind);

// The usable value of a Fact (null when missing, not for me, or absent).
export const valueOf = (f) => (isFact(f) && f.kind !== 'missing' && f.kind !== 'notForMe' ? f.value : null);
// Whose an account is (S-211): the partner's when its owner says so and there is a partner (a spousal IRA with no
// owner set is the partner's, the IRA of the spouse who earns less); everything else is the first person's.
export function accountOwner(spine, a) {
  const ps = (spine.household && spine.household.people) || [], o = a.owner ? valueOf(a.owner) : null;
  return (o === 'partner' || (o === null && a.type === 'spousal_ira')) && ps[1] ? ps[1] : ps[0];
}
// Whose an income line is: its person, else the first person's.
export const incomeOwner = (spine, s) => s.personId || (((spine.household && spine.household.people) || [])[0] || {}).id;

// ---------------------------------------------------------------- paths
// A path names one field: "household.filingStatus", "debts.visa.apr",
// "household.people.casey.birthDate", "income.salary.withholding.federal".
// An array segment is matched by the item's id.
export function getAt(root, path) {
  let cur = root;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = Array.isArray(cur) ? cur.find((x) => x && String(x.id) === seg) : cur[seg];
  }
  return cur;
}

// Replace the value at a path in a copy of root (the original is not touched).
export function setAt(root, path, next) {
  const segs = path.split('.');
  const copy = (node, i) => {
    if (i === segs.length) return next;
    const seg = segs[i];
    if (Array.isArray(node)) {
      const idx = node.findIndex((x) => x && String(x.id) === seg);
      if (idx < 0) throw new Error('No item ' + seg + ' at ' + path);
      const out = node.slice();
      out[idx] = copy(node[idx], i + 1);
      return out;
    }
    // A missing container along the way (a new optional section such as debtPlan) is created.
    if (node === undefined) node = {};
    if (node === null || typeof node !== 'object') throw new Error('Cannot set ' + path);
    return { ...node, [seg]: copy(node[seg], i + 1) };
  };
  return copy(root, 0);
}

// Every Fact in the spine with its path, in document order.
export function listFacts(spine) {
  const out = [];
  const walk = (node, path) => {
    if (isFact(node)) { out.push({ path, fact: node }); return; }
    if (Array.isArray(node)) { for (const x of node) if (x && x.id !== undefined) walk(x, path + '.' + x.id); return; }
    if (node && typeof node === 'object') for (const k of Object.keys(node)) if (k !== 'meta' && k !== 'schema') walk(node[k], path ? path + '.' + k : k);
  };
  walk(spine, '');
  return out;
}

// ---------------------------------------------------------------- dates
// Dates are ISO strings (YYYY-MM-DD). All date math is in UTC days.
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// A real day on the calendar written YYYY-MM-DD (2026-02-30 and 2026-13-45 are not), S-228.
export const isDay = (x) => { if (typeof x !== 'string' || !ISO_DATE.test(x)) return false; const t = Date.parse(x + 'T00:00:00Z'); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === x; };
export const toDay = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
export const fromDay = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromDay(toDay(iso) + n);
export const daysBetween = (a, b) => toDay(b) - toDay(a);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
export const monthKey = (iso) => iso.slice(0, 7);
export function addMonths(ym, n) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
  return yy + '-' + String(mm).padStart(2, '0');
}
export const monthStart = (ym) => ym + '-01';
// The date a day-of-month falls on in month ym, moved to the last day when the month is short.
export const dayIn = (ym, day) => ym + '-' + String(Math.min(day, daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7)))).padStart(2, '0');
export const monthEnd = (ym) => ym + '-' + String(daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7))).padStart(2, '0');

// Whole years of age on a date.
export function ageOn(birthIso, iso) {
  let age = +iso.slice(0, 4) - +birthIso.slice(0, 4);
  if (iso.slice(5) < birthIso.slice(5)) age--;
  return age;
}

// The entry of a dated timeline in force on a date: entries are { from, ... },
// from null means "since always".
export function inForce(timeline, iso) {
  let pick = null;
  for (const e of timeline || []) if (e.from === null || e.from <= iso) if (!pick || (e.from || '') >= (pick.from || '')) pick = e;
  return pick;
}

// ---------------------------------------------------------------- results
// Every engine number is a Result: the value plus what it was built from.
// kind: computed (all inputs known), rough (some input rough), incomplete
// (some input missing, value built from the rest), missing (cannot be built).
export function tracker() {
  const from = new Set(), rough = new Set(), missing = new Set(), rules = new Set();
  const t = {
    // Read a Fact at a path of the spine and record it.
    read(spine, path) { return t.useFact(path, getAt(spine, path)); },
    useFact(path, f) {
      from.add(path);
      if (!isFact(f) || f.kind === 'missing') { missing.add(path); return null; }
      if (f.kind === 'rough') rough.add(path);
      return valueOf(f);
    },
    rule(R, id, year) { rules.add(id); return R.get(id, year); },
    addRough(path) { rough.add(path); from.add(path); },
    addMissing(path) { missing.add(path); from.add(path); },
    absorb(res) {
      if (!res) return res;
      for (const p of res.from || []) from.add(p);
      for (const p of res.rough || []) rough.add(p);
      for (const p of res.missing || []) missing.add(p);
      for (const r of res.rules || []) rules.add(r);
      return res.value;
    },
    out(value, extra = {}) { return result(value, { from, rough, missing, rules, ...extra }); },
    snapshot: () => ({ from: [...from], rough: [...rough], missing: [...missing], rules: [...rules] })
  };
  return t;
}

export function result(value, { from = [], rough = [], missing = [], rules = [], ...extra } = {}) {
  const m = [...missing], r = [...rough];
  const kind = value === null || value === undefined ? 'missing' : m.length ? 'incomplete' : r.length ? 'rough' : 'computed';
  return { value: value ?? null, kind, from: [...from], rough: r, missing: m, rules: [...rules], ...extra };
}

export const round2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
