// Brings any saved or imported household up to the current schema version,
// then fills missing keys with defaults so every screen can trust the shape.
// To change the stored shape: bump SCHEMA_VERSION, add a step to STEPS, and
// write a compatibility note in DECISIONS.md.

import { SCHEMA_VERSION, newHousehold, newCategory, newLine, newIncome, newDebt, newDeduction, newCaseOverrides, newWithheld, WITHHELD_KEYS } from './schema.js';
import { normalizeValue, isBlank } from './value.js';

// STEPS[n] turns a version n document into version n + 1.
const STEPS = {
  // Version 0 = a document saved before versioning existed (no schemaVersion key).
  0: (doc) => ({ ...doc, schemaVersion: 1 })
};

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a household document');
  let doc = JSON.parse(JSON.stringify(raw));
  let v = doc.schemaVersion || 0;
  if (v > SCHEMA_VERSION) throw new Error('This file is from a newer version of SLAM (schema ' + v + ')');
  while (v < SCHEMA_VERSION) {
    doc = STEPS[v](doc);
    v = doc.schemaVersion;
  }
  return normalizeHousehold(doc);
}

// Compatibility (S-060): unemployment asks one number, the benefit, stored as gross.
// An old take-home moves to gross; if both were given, gross stays and take-home
// tells us about withholding (about 90% of gross = 10% withheld, equal = none).
function unemploymentCompat(inc) {
  const g = inc.gross;
  const t = inc.takeHome;
  if (isBlank(t)) return;
  if (isBlank(g)) {
    inc.gross = { ...t, cadence: t.cadence === 'paycheck' ? cadenceOf(inc.payFrequency) : t.cadence };
  } else if (inc.withholding === null && t.amount !== null && g.amount) {
    const per = (v) => (v.cadence === 'paycheck' ? v.amount * ({ weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[inc.payFrequency] || 0) : v.amount * ({ week: 52, month: 12, year: 1 }[v.cadence] || 0));
    const r = per(t) / per(g);
    if (Math.abs(r - 0.9) < 0.01) inc.withholding = 'ten-percent';
    else if (Math.abs(r - 1) < 0.005) inc.withholding = 'none';
  }
  inc.takeHome = { ...t, amount: null, status: null, cadence: 'paycheck' };
}

function cadenceOf(freq) {
  return freq === 'weekly' ? 'week' : freq === 'monthly' ? 'month' : 'paycheck';
}

function withDefaults(base, given, valueKeys) {
  const out = { ...base, ...given };
  for (const k of valueKeys) out[k] = normalizeValue(given[k] === undefined ? base[k] : given[k]);
  return out;
}

export function normalizeHousehold(doc) {
  const base = newHousehold(doc.profile && doc.profile.name);
  const out = { ...base, ...doc };
  out.id = doc.id || base.id;
  out.profile = { ...base.profile, ...(doc.profile || {}) };
  out.household = { ...base.household, ...(doc.household || {}) };
  out.household.dependents = { ...base.household.dependents, ...(out.household.dependents || {}) };
  // Compatibility: an old separate "yourShare" is dropped; the rent line is your share.
  const { yourShare, ...rm } = out.household.roommates || {};
  out.household.roommates = withDefaults(base.household.roommates, rm, ['totalRent']);
  out.household.family = { ...base.household.family, ...(out.household.family || {}) };
  // Compatibility: older files only had a roommate count.
  if (out.household.livingWith === undefined || out.household.livingWith === null) out.household.livingWith = rm.count > 0 ? 'roommates' : null;
  out.gut = normalizeValue(doc.gut);
  out.income = (doc.income || []).map((raw) => {
    // Compatibility: the old single "pretaxRetirement" amount becomes a retirement deduction.
    const { pretaxRetirement, ...i } = raw;
    const inc = withDefaults(newIncome({ id: i.id }), i, ['takeHome', 'gross', 'hourlyRate']);
    inc.deductions = (i.deductions || []).map((d) => ({ ...newDeduction({ id: d.id, kind: d.kind }), ...d, amount: normalizeValue(d.amount) }));
    const old = pretaxRetirement === undefined ? null : normalizeValue(pretaxRetirement);
    if (old && !isBlank(old)) inc.deductions.unshift({ ...newDeduction({ id: 'ded-' + inc.id + '-ret', kind: 'retirement', mode: 'amount' }), amount: old });
    // Compatibility (S-064): files before paystub taxes load with them all blank.
    inc.withheld = { ...newWithheld(), ...Object.fromEntries(Object.entries(i.withheld || {}).filter(([k]) => WITHHELD_KEYS.includes(k)).map(([k, v]) => [k, normalizeValue(v)])) };
    if (inc.type === 'unemployment') unemploymentCompat(inc);
    return inc;
  });
  out.debts = (doc.debts || []).map((d) => withDefaults(newDebt({ id: d.id }), d, ['balance', 'apr', 'minimum', 'dueDay']));
  out.categories = (doc.categories || base.categories).map((c) => {
    const cat = withDefaults(newCategory({ id: c.id }), c, ['estimate', 'dream']);
    cat.lines = (c.lines || []).map((l) => {
      const line = withDefaults(newLine({ id: l.id, savings: cat.savings, tag: cat.tag }), l, ['estimate', 'dream', 'actual', 'owedBack']);
      return line;
    });
    return cat;
  });
  out.settings = { ...base.settings, ...(doc.settings || {}) };
  out.months = doc.months || [];
  // Compatibility: files before per-month actuals have none stored.
  out.monthActuals = Object.fromEntries(Object.entries(doc.monthActuals || {}).map(([k, lines]) => [k, Object.fromEntries(Object.entries(lines).map(([id, v]) => [id, normalizeValue(v)]))]));
  // Compatibility: files before tags have none.
  out.tags = (doc.tags || []).map((t) => ({ id: t.id, name: t.name }));
  out.transactions = doc.transactions || [];
  out.merchantMemory = doc.merchantMemory || {};
  out.snapshots = doc.snapshots || [];
  out.passesSeen = doc.passesSeen || [];
  out.blindRounds = (doc.blindRounds || []).map((r) => ({
    ...r, estimates: Object.fromEntries(Object.entries(r.estimates || {}).map(([k, v]) => [k, normalizeValue(v)]))
  }));
  out.nextStage = doc.nextStage ? normalizeNextStage(doc.nextStage) : null;
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

// Compatibility: plans saved before the three lenses load with empty disaster
// and dream overrides (so both follow likely) and no cash on hand.
function normalizeNextStage(ns) {
  const item = (c) => ({ ...c, amount: normalizeValue(c.amount), disaster: normalizeValue(c.disaster), dream: normalizeValue(c.dream) });
  const cases = {};
  for (const id of ['disaster', 'dream']) {
    const given = (ns.cases && ns.cases[id]) || {};
    const base = newCaseOverrides();
    cases[id] = { ...base, ...given, takeHome: normalizeValue(given.takeHome), transitionTakeHome: normalizeValue(given.transitionTakeHome), laterTakeHome: normalizeValue(given.laterTakeHome) };
  }
  return {
    ...ns,
    takeHome: normalizeValue(ns.takeHome), transitionTakeHome: normalizeValue(ns.transitionTakeHome), laterTakeHome: normalizeValue(ns.laterTakeHome),
    cashOnHand: ns.cashOnHand ? normalizeValue(ns.cashOnHand) : { ...normalizeValue(null), cadence: 'one-off' },
    oneOffCosts: (ns.oneOffCosts || []).map(item), costChanges: (ns.costChanges || []).map(item),
    metrics: ns.metrics || [], cases
  };
}
