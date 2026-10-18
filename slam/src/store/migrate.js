// Brings any saved or imported household up to the current schema version,
// then fills missing keys with defaults so every screen can trust the shape.
// To change the stored shape: bump SCHEMA_VERSION, add a step to STEPS, and
// write a compatibility note in DECISIONS.md.

import { SCHEMA_VERSION, newHousehold, newCategory, newLine, newIncome, newDebt, newDeduction, newCaseOverrides, newWithheld, WITHHELD_KEYS, newEra, newAccount, newCashflow, makeDate, newCoverage } from './schema.js';
import { normalizeValue, isBlank, makeValue } from './value.js';
import { CATEGORY_TYPE_IDS, DEFAULT_LINE_TYPES, guessLineType } from './types.js';
import { toMonthly } from '../calc/normalize.js';
import { stampAll, META } from './records.js';

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
  7: (doc) => logOwnsActuals(doc),
  // Version 8 to 9 (S-090): estimate history. Older files load with an empty log.
  8: (doc) => ({ ...doc, estimateLog: doc.estimateLog || [], schemaVersion: 9 }),
  // Version 9 to 10 (S-096): every record gets an id (existing ids kept), createdAt and updatedAt
  // from the file's last saved time, createdBy and updatedBy "coach", and version 1. Nothing else changes.
  9: (doc) => ({ ...doc, schemaVersion: 10, sync: doc.sync || { versions: {}, at: null } }),
  // Version 10 to 11 (S-110): every account gets a liquidity tier and countsForFI from its type
  // (in normalizing, below); deductions can name an account. No amount changes.
  10: (doc) => ({ ...doc, schemaVersion: 11 }),
  // Version 11 to 12 (S-113): a home or vehicle gets its alternative costs (blank) and coach notes
  // (empty) in normalizing; the return assumption is 5% a year until the coach sets one. No amount changes.
  11: (doc) => ({ ...doc, schemaVersion: 12 }),
  // Version 12 to 13 (S-116): the old "Investment" and "Retirement" account types become "Type not set"
  // (tier 2 and tier 3, counting toward FI; balances kept); debts get a paying line (null), a promo APR
  // (blank) and promo end (null) in normalizing. A debt with no minimum is linked to the one budget line
  // of a matching type that has an amount (a car loan to the Car payment line). No amount changes.
  12: (doc) => ({
    ...doc, schemaVersion: 13,
    accounts: (doc.accounts || []).map((a) => (a.type === 'investment' ? { ...a, type: 'unset', tier: 2 } : a.type === 'retirement' ? { ...a, type: 'unset', tier: 3 } : a)),
    debts: (doc.debts || []).map((d) => ({ ...d, lineId: d.lineId === undefined ? autoLink(doc, d) : d.lineId }))
  }),
  // Version 13 to 14 (S-117): health coverage moves to doc.coverage. A parent's plan (household.parentsPlan)
  // becomes how = parent. A premium line with an amount becomes the premium paid directly (the same
  // amount and cadence); an income with a health deduction and no premium line amount becomes the premium
  // from that paycheck. Nothing else is guessed. No amount changes.
  13: (doc) => {
    const { parentsPlan, ...household } = doc.household || {};
    return { ...doc, schemaVersion: 14, household, coverage: doc.coverage || coverageFrom(doc, !!parentsPlan) };
  },
  // Version 14 to 15 (S-118): typed income actuals (none yet) and a month's plan for side income (none
  // yet). A closed month saved before this has no income in its snapshot; its income is read from the log.
  14: (doc) => ({ ...doc, schemaVersion: 15, incomeActuals: doc.incomeActuals || {} }),
  // Version 15 to 16 (S-123): no Fees category. Its lines that hold anything (an amount or answer, a log
  // entry, a month's actual, a plan amount) move to Bills and subscriptions with their ids, amounts,
  // tags, and types; empty ones go, and so does the category (its own estimate was 0 or blank in every
  // file). Totals do not change; Bills and subscriptions holds what Fees held.
  15: (doc) => ({ ...doc, schemaVersion: 16, categories: withoutFees(doc) }),
  // Version 16 to 17 (S-130): an opening Paid ahead on each line, blank (no line had one before).
  16: (doc) => ({ ...doc, schemaVersion: 17, categories: (doc.categories || []).map((c) => ({ ...c, lines: (c.lines || []).map((l) => ({
    ...l, openingAhead: l.openingAhead || makeValue(null, { cadence: 'one-off' }), openingAheadMonths: l.openingAheadMonths || makeValue(null, { cadence: 'one-off' }) })) })) })
};

const LOGGED = new Set(['spend', 'fee', 'refund', 'reimbursement']);

// S-123: Fees folds into Bills and subscriptions (or the first spending category when there is none).
function withoutFees(doc) {
  const cats = (doc.categories || []).map((c) => ({ ...c, lines: [...(c.lines || [])] }));
  const fees = cats.find((c) => c.id === 'fees');
  if (!fees) return cats;
  const answered = (v) => !!v && ((v.amount !== null && v.amount !== undefined) || (v.status !== null && v.status !== undefined));
  const used = new Set([
    ...(doc.transactions || []).map((t) => t.lineId),
    ...Object.values(doc.monthActuals || {}).flatMap((m) => Object.keys(m)),
    ...Object.values(doc.plans || {}).flatMap((p) => Object.keys(p.lines || {}))
  ]);
  const keep = fees.lines.filter((l) => answered(l.estimate) || answered(l.actual) || answered(l.dream) || used.has(l.id));
  const to = cats.find((c) => c.id === 'bills') || cats.find((c) => !c.savings && c.id !== 'debt' && c.id !== 'fees' && c.id !== 'everything');
  // A line keeps what it was: Fees' own tag (a mistake, say) stays on each line it held.
  if (to) to.lines.push(...keep.map((l) => ({ ...l, tag: l.tag || fees.tag || 'planned' })));
  return cats.filter((c) => c.id !== 'fees');
}

// S-117: the coverage answers an older file already holds.
function coverageFrom(doc, onParentsPlan) {
  const c = newCoverage();
  const has = (v) => !!v && v.amount !== null && v.amount !== undefined;
  const premiumLine = (doc.categories || []).flatMap((x) => x.lines || []).find((l) => (l.type || DEFAULT_LINE_TYPES[l.id]) === 'health-insurance' && l.state !== 'archived' && has(l.estimate));
  const fromPay = (doc.income || []).find((i) => (i.deductions || []).some((d) => d.kind === 'health'));
  if (onParentsPlan) c.how = 'parent';
  if (premiumLine) { c.premiumFrom = 'direct'; c.premium = { ...premiumLine.estimate }; }
  else if (fromPay) { c.premiumFrom = 'paycheck'; c.premiumIncomeId = fromPay.id; }
  return c;
}

// S-116: the one line of a matching type with an amount, for a debt with no minimum of its own.
const LINK_TYPES = { 'car-loan': ['car-payment'], mortgage: ['rent'], 'student-loan': ['loan'], 'personal-loan': ['loan'] };
function autoLink(doc, d) {
  const min = d.minimum;
  if (min && min.amount !== null && min.amount !== undefined) return null;
  const types = LINK_TYPES[d.type] || [];
  const has = (v) => !!v && v.amount !== null && v.amount !== undefined;
  const hits = (doc.categories || []).filter((c) => !c.savings && c.id !== 'debt').flatMap((c) => c.lines || [])
    .filter((l) => types.includes(l.type || DEFAULT_LINE_TYPES[l.id]) && l.state !== 'archived' && (has(l.estimate) || has(l.actual)));
  return hits.length === 1 ? hits[0].id : null;
}

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
  out.incomeActuals = Object.fromEntries(Object.entries(doc.incomeActuals || {}).map(([k, src]) => [k, Object.fromEntries(Object.entries(src).map(([id, v]) => [id, normalizeValue(v)]))]));
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
  const cv = doc.coverage || {};
  out.coverage = { ...newCoverage(), ...cv, premium: normalizeValue(cv.premium), deductible: { ...normalizeValue(cv.deductible), cadence: (cv.deductible && cv.deductible.cadence) || 'year' }, outOfPocketMax: { ...normalizeValue(cv.outOfPocketMax), cadence: (cv.outOfPocketMax && cv.outOfPocketMax.cadence) || 'year' } };
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
    // Additional withholding (S-101) is optional: only files that have it carry it.
    if (i.extraWithholding !== undefined) inc.extraWithholding = { ...makeValue(null, { cadence: 'paycheck' }), ...normalizeValue(i.extraWithholding) };
    if (inc.type === 'unemployment') unemploymentCompat(inc);
    return inc;
  });
  out.debts = (doc.debts || []).map((d) => {
    const debt = withDefaults(newDebt({ id: d.id }), d, ['balance', 'apr', 'minimum', 'dueDay', 'promoApr']);
    debt.promoApr = { ...debt.promoApr, cadence: 'one-off' };
    return debt;
  });
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
  out.coachNotes = typeof doc.coachNotes === 'string' ? doc.coachNotes : '';
  out.months = doc.months || [];
  // Compatibility: files before per-month actuals have none stored.
  out.monthActuals = Object.fromEntries(Object.entries(doc.monthActuals || {}).map(([k, lines]) => [k, Object.fromEntries(Object.entries(lines).map(([id, v]) => [id, normalizeValue(v)]))]));
  // Compatibility (S-067): files before eras load with none.
  const er = doc.eras || {};
  out.eras = { list: (er.list || []).map((e) => ({ ...newEra({ id: e.id }), ...e, takeHome: normalizeValue(e.takeHome), spending: normalizeValue(e.spending), oneTime: normalizeValue(e.oneTime) })) };
  const nv = (v) => normalizeValue(v);
  out.plans = Object.fromEntries(Object.entries(doc.plans || {}).map(([m, p]) => [m, {
    createdFrom: p.createdFrom || 'manual',
    ...(p.income ? { income: Object.fromEntries(Object.entries(p.income).map(([k, v]) => [k, nv(v)])) } : {}),
    lines: Object.fromEntries(Object.entries(p.lines || {}).map(([k, e]) => [k, {
      ...meta(e),
      amount: nv(e.amount), start: nv(e.start === undefined ? e.amount : e.start), decision: e.decision || 'keep',
      reviewed: !!e.reviewed, note: e.note || '', stop: !!e.stop
    }]))
  }]));
  // Compatibility: files before tags have none.
  out.tags = (doc.tags || []).map((t) => ({ ...meta(t), id: t.id, name: t.name }));
  out.estimateLog = (doc.estimateLog || []).map((e) => ({ ...e }));
  out.sync = doc.sync || { versions: {}, at: null };
  out.transactions = doc.transactions || [];
  out.merchantMemory = doc.merchantMemory || {};
  out.snapshots = doc.snapshots || [];
  out.passesSeen = doc.passesSeen || [];
  out.blindRounds = (doc.blindRounds || []).map((r) => ({
    ...r, estimates: Object.fromEntries(Object.entries(r.estimates || {}).map(([k, v]) => [k, normalizeValue(v)]))
  }));
  out.nextStage = doc.nextStage ? normalizeNextStage(doc.nextStage) : null;
  out.accounts = (doc.accounts || []).map((a) => {
    const acct = { ...newAccount({ id: a.id, type: a.type }), ...a };
    if (acct.purchasePrice) acct.purchasePrice = { ...normalizeValue(acct.purchasePrice), cadence: 'one-off' };
    if (acct.purchaseDate) acct.purchaseDate = { ...makeDate(), ...acct.purchaseDate };
    for (const k of ['rentAlt', 'rideshareAlt', 'transitAlt', 'rentalAlt']) if (acct[k]) acct[k] = { ...normalizeValue(acct[k]), cadence: acct[k].cadence || 'month' };
    return acct;
  });
  out.balances = Object.fromEntries(Object.entries(doc.balances || {}).map(([m, accts]) => [m, Object.fromEntries(Object.entries(accts).map(([id, b]) => [id, {
    ...meta(b || {}),
    start: { ...normalizeValue(b && b.start), cadence: 'one-off' }, end: { ...normalizeValue(b && b.end), cadence: 'one-off' },
    // The day each was read (S-100), only when one was picked.
    ...(b && b.startOn ? { startOn: b.startOn } : {}), ...(b && b.endOn ? { endOn: b.endOn } : {})
  }]))]));
  out.schemaVersion = SCHEMA_VERSION;
  // Any record still without bookkeeping gets it now (S-096).
  stampAll(out, doc.updatedAt || doc.createdAt || '2026-01-01T00:00:00.000Z');
  return out;
}

// A record's bookkeeping, kept through normalizing (S-096).
function meta(r) {
  return Object.fromEntries(META.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
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
