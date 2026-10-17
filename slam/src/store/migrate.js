// Brings any saved or imported household up to the current schema version,
// then fills missing keys with defaults so every screen can trust the shape.
// To change the stored shape: bump SCHEMA_VERSION, add a step to STEPS, and
// write a compatibility note in DECISIONS.md.

import { SCHEMA_VERSION, newHousehold, newCategory, newLine, newIncome, newDebt, newDeduction, newCaseOverrides, newWithheld, WITHHELD_KEYS, newEra, newAccount, newCashflow, makeDate } from './schema.js';
import { normalizeValue, isBlank } from './value.js';
import { CATEGORY_TYPE_IDS, DEFAULT_LINE_TYPES, guessLineType } from './types.js';
import { toMonthly } from '../calc/normalize.js';

// STEPS[n] turns a version n document into version n + 1.
const STEPS = {
  // Version 0 = a document saved before versioning existed (no schemaVersion key).
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
  // Version 1 to 2 (S-070): ZIP and the cost-of-living tier are gone; nothing read ZIP,
  // and the tier only scaled placeholder averages.
  1: (doc) => {
    const { zip, colTier, colTierSetBy, ...profile } = doc.profile || {};
    return { ...doc, profile, schemaVersion: 2 };
  },
  // Version 2 to 3 (S-072): DRAFTT has no bands, so there is no benchmark source to pick.
  2: (doc) => {
    const { benchmarkSource, ...settings } = doc.settings || {};
    return { ...doc, settings, schemaVersion: 3 };
  },
  // Version 3 to 4 (S-076): monthly plans. Older files have none.
  3: (doc) => ({ ...doc, plans: doc.plans || {}, schemaVersion: 4 }),
  // Version 4 to 5 (S-084): accounts and month balances. Next stage cash on hand and
  // Eras cash now are no longer asked; they read the balances. A typed amount moves
  // into a "Cash on hand" account as the start of the month being worked on.
  4: (doc) => cashIntoAccounts(doc),
  // Version 5 to 6 (S-085): transactions are the log. Every entry has a source
  // (old ones were imported) and an account id; an account name used by old
  // imports becomes an account.
  5: (doc) => logWithAccounts(doc),
  // Version 6 to 7 (S-086): cash flow dates. Every new field starts blank (pay dates,
  // due days, accounts, cushion); nothing is guessed.
  6: (doc) => ({ ...doc, cashflow: doc.cashflow || newCashflow(), schemaVersion: 7 }),
  // Version 7 to 8 (S-087): a line's actual comes from its log entries. A typed actual
  // for a line and month that also has entries is kept as it was: when the entries
  // add up to something else, a "kept your typed actual" entry makes up the difference,
  // then the typed number is cleared (the log owns it now). No month's actual changes.
  7: (doc) => logOwnsActuals(doc)
};

const LOGGED = new Set(['spend', 'fee', 'refund', 'reimbursement']);

function logOwnsActuals(doc) {
  const out = { ...doc, schemaVersion: 8 };
  const txs = (doc.transactions || []).map((t) => ({ ...t }));
  const first = (doc.income || []).find((i) => i.state !== 'archived');
  const freq = first ? first.payFrequency || 'biweekly' : null;
  const closed = new Set((doc.months || []).map((m) => m.key));
  const sumFor = (lineId, month) => {
    const list = txs.filter((t) => t.lineId === lineId && t.date && t.date.startsWith(month) && LOGGED.has(t.kind) && !(t.possible && t.possible.length));
    return { n: list.length, total: Math.round(list.reduce((a, t) => a + t.amount, 0) * 100) / 100 };
  };
  const keep = (line, month, typed) => {
    const lineId = line.id;
    const s = sumFor(lineId, month);
    if (!s.n || closed.has(month)) return typed;
    let monthly = toMonthly(normalizeValue(typed), freq);
    if (monthly === null) return typed;
    // A typed reimbursable line marked received counted only the client's share.
    const owed = line.path === 'reimbursable' && line.owedBackReceived ? toMonthly(normalizeValue(line.owedBack), freq) : null;
    if (owed !== null) monthly -= owed;
    const diff = Math.round((monthly - s.total) * 100) / 100;
    if (diff !== 0) {
      const [y, m] = month.split('-').map(Number);
      const last = month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
      txs.push({ id: 'tx-kept-' + lineId + '-' + month, date: last, amount: diff, description: '', account: null, kind: diff > 0 ? 'spend' : 'refund',
        merchant: '', lineId, bnpl: false, source: 'manual', note: 'Kept your typed actual when the log took over', adjust: true });
    }
    return null;
  };
  out.categories = (doc.categories || []).map((c) => ({ ...c, lines: (c.lines || []).map((l) => {
    if (!l.actual || l.actual.amount === null || l.actual.amount === undefined) return l;
    return keep(l, doc.currentMonth, l.actual) ? l : { ...l, actual: null };
  }) }));
  const lineById = Object.fromEntries((doc.categories || []).flatMap((c) => (c.lines || []).map((l) => [l.id, l])));
  out.monthActuals = Object.fromEntries(Object.entries(doc.monthActuals || {}).map(([month, lines]) => [month,
    Object.fromEntries(Object.entries(lines).filter(([id, v]) => !(v && v.amount !== null && v.amount !== undefined) || !lineById[id] || keep(lineById[id], month, v)))]).filter(([, lines]) => Object.keys(lines).length));
  out.transactions = txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

const guessAccountType = (name) => (/card|visa|amex|master|discover|credit/i.test(name) ? 'credit-card' : /saving/i.test(name) ? 'savings' : /cash|wallet/i.test(name) ? 'cash' : 'checking');

function logWithAccounts(doc) {
  const accounts = [...(doc.accounts || [])];
  const idFor = (name) => {
    if (!name) return null;
    if (accounts.some((a) => a.id === name)) return name;
    let a = accounts.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!a) {
      a = newAccount({ id: 'acct-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: String(name), type: guessAccountType(name) });
      accounts.push(a);
    }
    return a.id;
  };
  const transactions = (doc.transactions || []).map((t) => ({ ...t, source: t.source || 'import', note: t.note || '', account: idFor(t.account) }));
  return { ...doc, accounts, transactions, schemaVersion: 6 };
}

function cashIntoAccounts(doc) {
  const { cashOnHand, ...ns } = doc.nextStage || {};
  const { cashNow, ...eras } = doc.eras || {};
  const out = { ...doc, accounts: doc.accounts || [], balances: doc.balances || {}, schemaVersion: 5 };
  if (doc.nextStage) out.nextStage = ns;
  if (doc.eras) out.eras = eras;
  const typed = (v) => (v && typeof v === 'object' && v.amount !== null && v.amount !== undefined ? v : typeof v === 'number' ? { amount: v } : null);
  const found = [[typed(cashOnHand), 'Next stage cash on hand'], [typed(cashNow), 'Eras cash now']].filter(([v]) => v);
  if (!found.length || !/^\d{4}-\d{2}$/.test(doc.currentMonth || '')) return out;
  out.balances = { ...out.balances, [doc.currentMonth]: { ...(out.balances[doc.currentMonth] || {}) } };
  // Two different answers: the first counts, the other is kept on an archived account so nothing is lost.
  const kept = found[1] && found[1][0].amount === found[0][0].amount ? [found[0]] : found;
  kept.forEach(([v, from], i) => {
    const acct = newAccount({ id: 'acct-cash-on-hand' + (i ? '-2' : ''), name: i ? 'Cash on hand (' + from + ')' : 'Cash on hand', type: 'cash', state: i ? 'archived' : 'active' });
    out.accounts = [...out.accounts, acct];
    const start = { amount: v.amount, cadence: 'one-off', status: v.status || 'known', source: v.source || 'client', asOf: v.asOf || null, note: 'Moved from ' + from };
    out.balances[doc.currentMonth][acct.id] = { start, end: null };
  });
  return out;
}

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
    inc.nextPayDate = { ...makeDate(), ...(i.nextPayDate || {}) };
    inc.deductions = (i.deductions || []).map((d) => ({ ...newDeduction({ id: d.id, kind: d.kind }), ...d, amount: normalizeValue(d.amount) }));
    const old = pretaxRetirement === undefined ? null : normalizeValue(pretaxRetirement);
    if (old && !isBlank(old)) inc.deductions.unshift({ ...newDeduction({ id: 'ded-' + inc.id + '-ret', kind: 'retirement', mode: 'amount' }), amount: old });
    // Compatibility (S-064): files before paystub taxes load with them all blank.
    inc.withheld = { ...newWithheld(), ...Object.fromEntries(Object.entries(i.withheld || {}).filter(([k]) => WITHHELD_KEYS.includes(k)).map(([k, v]) => [k, normalizeValue(v)])) };
    if (inc.type === 'unemployment') unemploymentCompat(inc);
    return inc;
  });
  out.debts = (doc.debts || []).map((d) => withDefaults(newDebt({ id: d.id }), d, ['balance', 'apr', 'minimum', 'dueDay']));
  const cf = doc.cashflow || {};
  out.cashflow = { ...newCashflow(), ...cf, cushion: { ...normalizeValue(cf.cushion), cadence: 'one-off' }, moves: cf.moves || {}, forecasts: cf.forecasts || {},
    checks: (cf.checks || []).map((c) => ({ ...c, amount: { ...normalizeValue(c.amount), cadence: 'one-off' } })) };
  out.categories = (doc.categories || base.categories).map((c) => {
    const cat = withDefaults(newCategory({ id: c.id }), c, ['estimate', 'dream', 'dreamLong']);
    // Compatibility (S-068): files before types get them from the default ids, else from the name.
    if (!c.type) cat.type = CATEGORY_TYPE_IDS.includes(c.id) ? c.id : 'other';
    cat.lines = (c.lines || []).map((l) => {
      const line = withDefaults(newLine({ id: l.id, savings: cat.savings, tag: cat.tag }), l, ['estimate', 'dream', 'dreamLong', 'actual', 'owedBack', 'dueDay', 'dueMonth']);
      if (!l.type) line.type = DEFAULT_LINE_TYPES[l.id] || guessLineType(line.name, cat.type);
      return line;
    });
    return cat;
  });
  out.settings = { ...base.settings, ...(doc.settings || {}) };
  out.months = doc.months || [];
  // Compatibility: files before per-month actuals have none stored.
  out.monthActuals = Object.fromEntries(Object.entries(doc.monthActuals || {}).map(([k, lines]) => [k, Object.fromEntries(Object.entries(lines).map(([id, v]) => [id, normalizeValue(v)]))]));
  // Compatibility (S-067): files before eras load with none.
  const er = doc.eras || {};
  out.eras = { list: (er.list || []).map((e) => ({ ...newEra({ id: e.id }), ...e, takeHome: normalizeValue(e.takeHome), spending: normalizeValue(e.spending), oneTime: normalizeValue(e.oneTime) })) };
  const nv = (v) => normalizeValue(v);
  out.plans = Object.fromEntries(Object.entries(doc.plans || {}).map(([m, p]) => [m, {
    createdFrom: p.createdFrom || 'manual',
    lines: Object.fromEntries(Object.entries(p.lines || {}).map(([k, e]) => [k, {
      amount: nv(e.amount), start: nv(e.start === undefined ? e.amount : e.start), decision: e.decision || 'keep',
      reviewed: !!e.reviewed, note: e.note || '', stop: !!e.stop
    }]))
  }]));
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
  out.accounts = (doc.accounts || []).map((a) => ({ ...newAccount({ id: a.id }), ...a }));
  out.balances = Object.fromEntries(Object.entries(doc.balances || {}).map(([m, accts]) => [m, Object.fromEntries(Object.entries(accts).map(([id, b]) => [id, {
    start: { ...normalizeValue(b && b.start), cadence: 'one-off' }, end: { ...normalizeValue(b && b.end), cadence: 'one-off' }
  }]))]));
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

// Compatibility: plans saved before the three lenses load with empty disaster
// and dream overrides (so both follow likely).
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
    oneOffCosts: (ns.oneOffCosts || []).map(item), costChanges: (ns.costChanges || []).map(item),
    metrics: ns.metrics || [], cases
  };
}
