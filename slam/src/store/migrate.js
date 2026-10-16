// Brings any saved or imported household up to the current schema version,
// then fills missing keys with defaults so every screen can trust the shape.
// To change the stored shape: bump SCHEMA_VERSION, add a step to STEPS, and
// write a compatibility note in DECISIONS.md.

import { SCHEMA_VERSION, newHousehold, newCategory, newLine, newIncome, newDebt, newDeduction, newCaseOverrides } from './schema.js';
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
