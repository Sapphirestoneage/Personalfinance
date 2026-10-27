// Loading a household: a spine file (slam-spine/1) is used as is; a profile
// file (the eli.profile.json shape, _meta.version 3, and 4, 5 or later read by
// the same rules) is turned into a spine. The profile file itself is never
// rewritten. readHousehold (S-228) reads any of them without throwing on a
// field: fields missing are added as missing, and a field SLAM cannot use is
// named in the problems the Ledger shows.

import { fact, monthEnd, getAt, isFact, isDay, KINDS } from './spine.js';
import { SCHEMA_ID, PRESETS, FAMILIES, validate, isSelfEmployment, ANSWER_ON_HOUSEHOLD } from './schema.js';
import { labelFor, namedPath } from './labels.js';

const list = (x) => (Array.isArray(x) ? x.filter((y) => y && typeof y === 'object') : []);

// Bring a spine saved by an earlier version up to the current shape (S-167):
// fields a newer version requires are added as missing (or defaulted the way
// the profile loader does), never removed or overwritten.
export function upgradeSpine(spine) {
  const s = structuredClone(spine);
  const asOf = s.meta && s.meta.asOf;
  const stamp = { asOf, source: 'upgrade' };
  // Why now and Worth it became choices (S-254): a typed answer becomes Other, its words go to Anything else (added to
  // what is there), with the same date and source.
  const CHOICES = { reachOut: ['debt', 'tight', 'change', 'other'], worthIt: ['plan', 'debtFree', 'saving', 'other'] };
  for (const [id, keys] of Object.entries(CHOICES)) {
    const f = s.profile && s.profile[id];
    const x = f && f.value;
    if (typeof x !== 'string' || x === 'notSure' || keys.includes(x)) continue;
    const before = s.profile.anythingElse && s.profile.anythingElse.value;
    s.profile.anythingElse = { ...f, value: before ? (before.includes(x) ? before : before + ' ' + x) : x };
    s.profile[id] = { ...f, value: 'other' };
  }
  // Need or want became a Fact (S-171).
  for (const e of list(s.expenses)) {
    if (e.need === undefined || e.need === null || typeof e.need === 'boolean') e.need = typeof e.need === 'boolean' ? fact(e.need, { ...stamp, kind: 'known' }) : fact(null, stamp);
  }
  for (const d of list(s.debts)) {
    if (d.type !== 'credit_card') continue;
    if (!d.business) d.business = fact(null, stamp);
    // A card's bank groups it in My numbers (2026-10-27); an older file's card asks for it.
    if (!d.institution) d.institution = fact(null, stamp);
    if (!d.reportsToPersonalCredit) {
      const b = d.business.value;
      d.reportsToPersonalCredit = b === null ? fact(null, stamp) : b ? fact(false, { ...stamp, kind: 'rough' }) : fact(true, { ...stamp, kind: d.business.kind });
    }
  }
  // The work and health answers moved onto the household's "now" rows (2026-10-27). An older file kept them in the
  // profile too; the client's answer wins and the profile copy goes, so the two can never disagree.
  for (const [id, { at, map }] of Object.entries(ANSWER_ON_HOUSEHOLD)) {
    const f = s.profile && s.profile[id], row = s.household && list(s.household[at]).find((x) => x.id === 'now');
    if (!f) continue;
    if (row && map[f.value]) row.value = fact(map[f.value], { kind: 'known', asOf: f.asOf ?? asOf, source: f.source ?? 'upgrade', by: f.by });
    if (row) delete s.profile[id];
  }
  return s;
}

export function loadHousehold(raw) {
  if (raw && raw.schema === SCHEMA_ID) return upgradeSpine(raw);
  if (raw && raw._meta && raw.household) return fromProfile(raw);
  throw new Error('Not a household file: expected ' + SCHEMA_ID + ' or a profile with _meta and household');
}

// Optional fields a later profile may carry under the spine's own names (S-228): read as Facts when present.
const INCOME_FACTS = ['depositTo', 'payDay', 'payDay2'];
const EXPENSE_FACTS = ['paidFrom', 'paysDebt', 'payDay', 'subscription', 'renews', 'reviewed', 'trialEnds', 'workRelated', 'shared', 'sharedWith', 'yourShare', 'whoPays'];
const GOAL_FACTS = ['priority', 'linkedAccount', 'sinkingFund', 'monthly', 'spendOn', 'repeatYearly'];
const ACCOUNT_SKIP = ['id', 'family', 'type', 'kind', 'kinds', 'notes', 'source', 'institution', 'balance', 'name', 'conversionYear', 'conversionTaxable', 'label', 'lender', 'value', 'payoff'];

const FILING = { single: 'single', married_joint: 'mfj', mfj: 'mfj', married_separate: 'mfs', mfs: 'mfs', head_of_household: 'hoh', hoh: 'hoh' };

// Fields a debt type always carries, so a blank shows as missing instead of vanishing.
const DEBT_NEEDS = {
  credit_card: ['apr', 'limit', 'minimum', 'dueDay'],
  default: ['apr', 'minimum']
};

const STOP_WORDS = ['and', 'the', 'of', 'from', 'to', 'a'];

function slug(label, taken) {
  const base = String(label).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => !STOP_WORDS.includes(w)).slice(0, 3).join('-') || 'item';
  let id = base, n = 2;
  while (taken.has(id)) id = base + '-' + n++;
  taken.add(id);
  return id;
}

// A field of a profile as { value, kind }: version 3 writes { value, kind } on the household and plain numbers on the
// records; a later version may write either in either place (S-228).
const vk = (x, kind) => (x && typeof x === 'object' && !Array.isArray(x) && 'value' in x ? { value: x.value, kind: x.kind || kind } : { value: x, kind });

export function fromProfile(p, { today = null } = {}) {
  const M = p._meta && typeof p._meta === 'object' ? p._meta : {};
  // No as-of date: today's (the repair names it).
  const asOf = isDay(M.asOf) ? M.asOf : null;
  const source = 'profile v' + (M.version ?? '?') + (M.name ? ' (' + M.name + ')' : '');
  // Version 4 and later may carry fields under the spine's own names (a role, a pay day): those are read too. A
  // version 3 file reads exactly as it always has.
  const later = Number(M.version) > 3;
  // A Fact from the profile: the record's kind applies to every number in it,
  // except a blank, which is missing. A debt may name a field's own kind in
  // `kinds` ({ apr: 'rough' }) when one number is less sure than the rest.
  // A number written as { value, kind } carries its own kind.
  const F = (raw, kind, note) => {
    const { value: v0, kind: k0 } = vk(raw, kind);
    const value = v0 === undefined ? null : v0;
    // A kind this app does not know (a later version's "estimate") reads as rough: a guess to confirm.
    const k = KINDS.includes(k0) ? k0 : k0 ? 'rough' : 'known';
    return fact(value, { kind: value === null ? 'missing' : k === 'missing' ? 'missing' : k, asOf: asOf || today, source, note });
  };
  // The kind of one field on a record: its own entry in `kinds`, else the record's.
  const K = (rec, field) => (rec.kinds && rec.kinds[field]) || rec.kind;
  const H = p.household && typeof p.household === 'object' ? p.household : {};
  const pIds = new Set();
  const people = list(H.people).map((x, i) => ({ id: typeof x.id === 'string' && x.id ? x.id : slug(x.name || 'person ' + (i + 1), pIds), name: typeof x.name === 'string' ? x.name : 'Person ' + (i + 1), birthDate: F(x.birthDate, x.kind) }));
  if (!people.length) people.push({ id: 'you', name: 'You', birthDate: F(null) });
  const personId = people[0].id;

  const sit = H.situation && typeof H.situation === 'object' ? H.situation : { value: H.situation ?? null };
  const situation = [{ id: 'now', from: null, value: F(sit.value, sit.kind) }];
  if (sit.changesTo) situation.push({ id: 'next', from: sit.on, value: F(sit.changesTo, sit.kind) });
  const hc = H.healthCoverage && typeof H.healthCoverage === 'object' ? H.healthCoverage : { value: H.healthCoverage ?? null };
  const healthCoverage = [{ id: 'now', from: null, personId, value: F(hc.value, hc.kind) }];
  if (hc.after) healthCoverage.push({ id: 'next', from: hc.endsOn, personId, value: F(hc.after, hc.kind), planType: F(hc.afterPlanType ?? null, K(hc, 'afterPlanType')), enrolled: F(hc.enrolled ?? null, K(hc, 'enrolled')), setAside: F(hc.setAside ?? null, K(hc, 'setAside')) });

  const incomeIds = new Set();
  const income = list(p.income).map((s) => {
    // A yearly amount over a window shorter than a year is that window's total
    // (the profile's "2026 only" W-2 line), not a yearly rate. S-143.
    let cadence = s.cadence;
    if (cadence === 'yearly' && s.start && s.end && (Date.parse(s.end) - Date.parse(s.start)) / 864e5 < 364) cadence = 'total';
    // Nothing is withheld from self-employment pay or from money from a person (Batch 3).
    const noWithholding = isSelfEmployment(s) || s.type === 'person';
    const out = {
      // A line names whose it is when the profile says so (personId or person); else the first person's (S-211).
      id: s.id || slug(s.label || 'income', incomeIds), type: s.type, label: typeof s.label === 'string' ? s.label : s.id || 'Income', personId: people.some((x) => x.id === (s.personId || s.person)) ? (s.personId || s.person) : personId,
      amount: F(s.amount, K(s, 'amount')),
      cadence, start: s.start || null, end: s.end || null,
      withholding: {
        federal: s.federalWithholding !== undefined ? F(s.federalWithholding, K(s, 'federalWithholding')) : noWithholding ? fact(0, { kind: 'known', asOf, source: 'a 1099 has no withholding' }) : F(null),
        state: s.stateWithholding !== undefined ? F(s.stateWithholding, K(s, 'stateWithholding')) : noWithholding ? fact(0, { kind: 'known', asOf, source: 'a 1099 has no withholding' }) : F(null)
      }
    };
    // 1099 business expenses, in the stream's own cadence (S-179).
    if (s.businessExpenses !== undefined) out.businessExpenses = F(s.businessExpenses, K(s, 'businessExpenses'));
    if (later) for (const k of INCOME_FACTS) if (s[k] !== undefined && s[k] !== null) out[k] = F(s[k], K(s, k));
    if (s.likelihood !== undefined) out.likelihood = F(s.likelihood, (s.kinds && s.kinds.likelihood) || 'rough');
    if (s.notes) out.notes = s.notes;
    // A 0 written next to kind missing is a blank, not a typed zero.
    if (s.kind === 'missing' && vk(s.amount).value === 0) out.amount = fact(null, { kind: 'missing', asOf, source, note: 'profile had 0 with kind missing' });
    return out;
  });

  const expIds = new Set();
  const expenses = list(p.expenses).map((e) => {
    const out = {
      id: e.id || slug(e.label || 'expense', expIds), label: typeof e.label === 'string' ? e.label : e.id || 'Expense', amount: F(e.amount, K(e, 'amount')), cadence: e.cadence,
      start: e.start || null, end: e.end || null,
      fixed: typeof e.fixed === 'boolean' ? e.fixed : null,
      need: F(typeof e.need === 'boolean' ? e.need : null, 'known'),
      fat: e.fat || null
    };
    if (typeof e.covered === 'boolean') out.covered = F(e.covered, K(e, 'covered') === 'rough' ? 'rough' : 'known');
    if (e.coveredBy) out.coveredBy = F(e.coveredBy, K(e, 'coveredBy') === 'rough' ? 'rough' : 'known');
    if (later) for (const k of EXPENSE_FACTS) if (e[k] !== undefined && e[k] !== null) out[k] = F(e[k], K(e, k));
    if (e.notes) out.notes = e.notes;
    return out;
  });

  const accounts = list(p.accounts).map((a) => {
    const out = { id: a.id, family: a.family, type: a.type, name: F([a.institution, PRESETS[a.type] ? PRESETS[a.type].label : a.type].filter(Boolean).join(' '), 'known'), institution: F(a.institution, K(a, 'institution') === 'rough' ? 'rough' : 'known'), balance: F(a.balance, K(a, 'balance')) };
    if ('apy' in a) out.apy = F(a.apy, K(a, 'apy'));
    if (a.contributions) out.contributions = F(a.contributions, K(a, 'contributions'));
    if (a.basis !== undefined) out.basis = F(a.basis, a.kind);
    if (a.firstRothYear !== undefined) out.firstRothYear = F(a.firstRothYear, a.kind);
    if (a.conversionYear !== undefined) out.conversions = F([{ year: a.conversionYear, amount: a.conversionTaxable ?? a.balance, taxable: a.conversionTaxable ?? null }], a.kind);
    // Any other field the account's family has (a role, a monthly amount, a match), from a later profile.
    const fam = FAMILIES[a.family] ? { ...FAMILIES.base.fields, ...FAMILIES[a.family].fields } : {};
    if (later) for (const [k, x] of Object.entries(a)) if (!(k in out) && !ACCOUNT_SKIP.includes(k) && k in fam && x !== undefined && x !== null) out[k] = F(x, K(a, k));
    const notes = [a.source, a.notes].filter(Boolean).join(' ');
    if (notes) out.notes = notes;
    return out;
  });
  const otherIds = new Set(accounts.map((a) => a.id));
  for (const o of list(p.otherAssets)) {
    accounts.push({ id: o.id || slug(o.type, otherIds), family: 'otherAssets', type: o.type, name: F(o.label || PRESETS[o.type]?.label || o.type, 'known'), balance: F(o.value, K(o, 'value')), ...(o.appreciationRate !== undefined ? { appreciationRate: F(o.appreciationRate, K(o, 'appreciationRate')) } : {}), ...(o.notes ? { notes: o.notes } : {}) });
  }

  const debts = list(p.debts).map((d) => {
    const out = { id: d.id, family: 'debt', type: d.type, name: F(d.lender || d.label || PRESETS[d.type]?.label || d.type, d.lender ? 'known' : 'rough'), balance: F(d.balance, d.kind) };
    for (const k of ['apr', 'promoApr', 'promoEnds', 'deferredInterest', 'limit', 'minimum', 'dueDay', 'federal', 'plan', 'stress', 'reasonsToKeep', 'business', 'reportsToPersonalCredit']) if (k in d) out[k] = F(d[k], (d.kinds && d.kinds[k]) || d.kind);
    if (d.payoff) out.payoffDate = F(typeof d.payoff === 'string' && /^\d{4}-\d{2}$/.test(d.payoff) ? monthEnd(d.payoff) : d.payoff, d.kind);
    for (const k of DEBT_NEEDS[d.type] || DEBT_NEEDS.default) if (!(k in out)) out[k] = F(null);
    // A card says whether it is a business card and whether it reports to personal
    // credit (S-157). Unsaid, a personal card reports and a business card does not;
    // the business default is rough because some issuers do report.
    if (d.type === 'credit_card') {
      if (!out.business) out.business = F(null);
      out.institution = F(d.institution ?? null, K(d, 'institution'));
      if (!out.reportsToPersonalCredit) {
        const b = out.business.value;
        out.reportsToPersonalCredit = b === null ? F(null)
          : b ? fact(false, { kind: 'rough', asOf, source, note: 'business cards usually do not report; confirm with the issuer' })
            : fact(true, { kind: out.business.kind, asOf, source, note: 'personal cards report' });
      }
    }
    // A promo balance needs to say whether interest is deferred (it changes the deadline's cost).
    if (out.promoEnds && !('deferredInterest' in out)) out.deferredInterest = F(null);
    if (d.notes) out.notes = d.notes;
    return out;
  });

  const goalIds = new Set();
  const goals = list(p.goals).map((g) => {
    if (typeof g.label !== 'string') g = { ...g, label: g.id || 'Goal' };
    const type = /^fi$/i.test(g.label) || g.fiNumber !== undefined ? 'fi' : g.target !== undefined ? 'savings' : /paid off|payoff/i.test(g.label) ? 'payoff' : 'other';
    const out = { id: g.id || slug(g.label, goalIds), type, label: g.label };
    if (g.target !== undefined) out.target = F(g.target, g.kind);
    if (g.fiNumber !== undefined) out.fiNumber = F(g.fiNumber, g.kind);
    if (g.annualSpending !== undefined) out.annualSpending = F(g.annualSpending, g.kind);
    if (g.by) out.by = g.by;
    if (later) for (const k of GOAL_FACTS) if (g[k] !== undefined && g[k] !== null) out[k] = F(g[k], K(g, k));
    if (g.flavor) out.flavor = g.flavor;
    if (g.notes) out.notes = g.notes;
    return out;
  });

  const A = p.assumptions && typeof p.assumptions === 'object' ? p.assumptions : {};
  const assumptions = {};
  for (const k of ['inflation', 'realReturn', 'withdrawalRate', 'lifeExpectancy', 'coastAge']) if (A[k] !== undefined && A[k] !== null) assumptions[k] = F(A[k], 'known');
  for (const k of ['inflation', 'realReturn', 'withdrawalRate', 'lifeExpectancy']) if (!assumptions[k]) assumptions[k] = F(null);

  return {
    schema: SCHEMA_ID,
    meta: { name: M.name || 'Household', asOf, demo: false, from: source },
    household: {
      people,
      filingStatus: (() => { const f = vk(H.filingStatus); return F({ value: FILING[f.value] ?? f.value, kind: f.kind }); })(),
      state: F(H.state), county: F(H.county), nycResident: F(H.nycResident),
      situation, healthCoverage
    },
    income, expenses, accounts, debts, goals, assumptions,
    // The as-of year's tax entries. Nothing in the profile says estimates were
    // paid, so none is the rough starting answer.
    taxYears: asOf ? [(() => {
      const ty = p.taxYear && typeof p.taxYear === 'object' ? p.taxYear : {};
      const said = (k, note) => (ty[k] !== undefined ? F(ty[k], K(ty, k)) : fact(0, { kind: 'rough', asOf, source, note }));
      return {
        id: asOf.slice(0, 4), year: +asOf.slice(0, 4),
        estimatedPaidFederal: said('estimatedPaidFederal', 'assumed none paid'),
        estimatedPaidState: said('estimatedPaidState', 'assumed none paid'),
        setAside: said('setAside', 'assumed nothing set aside for the tax bill yet')
      };
    })()] : []
  };
}

// ---------------------------------------------------------------- any household file (S-228)
const NOT_A_HOUSEHOLD = 'Not a household file: expected a SLAM household (' + SCHEMA_ID + '), a SLAM export, or a profile with _meta and household';
export const REPAIR_SOURCE = 'a field the file could not use';

// readHousehold(raw, { today }) -> { spine, problems }. A spine of any version, the Plan page's export (slam-export/1)
// or a profile of any version. Throws only when the file is not a household at all; anything else loads, and each
// field that could not be used is in `problems` ({ path, message, held, aside?, missing? }) and in spine.meta.problems.
export function readHousehold(raw, { today = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(NOT_A_HOUSEHOLD);
  const body = raw.format === 'slam-export/1' && raw.spine && typeof raw.spine === 'object' ? raw.spine : raw;
  let spine, skipped = [];
  if (typeof body.schema === 'string' && /^slam-spine\//.test(body.schema)) spine = upgradeSpine(body);
  else if (body._meta && typeof body.household === 'object' && body.household) { spine = fromProfile(body, { today }); skipped = profileSkips(body); }
  else throw new Error(NOT_A_HOUSEHOLD);
  const r = repairSpine(spine, { today });
  if (!skipped.length) return r;
  // What the profile reader passed over (a list that is not a list, an entry that is not a record) is named and kept
  // aside the same way the repair keeps a field aside, so nothing in the file disappears without a word.
  const m = r.spine.meta;
  const fresh = skipped.filter((x) => !(m.problems || []).some((y) => y.path === x.path));
  m.unread = { ...(m.unread || {}), ...Object.fromEntries(fresh.map((x) => [x.path, x.held])) };
  m.problems = [...(m.problems || []), ...fresh];
  return { spine: r.spine, problems: [...fresh, ...r.problems] };
}

// The lists a profile is read from. An entry the reader cannot use as a record is passed over there, so it is named here.
const PROFILE_LISTS = [['income', (p) => p.income], ['expenses', (p) => p.expenses], ['accounts', (p) => p.accounts], ['otherAssets', (p) => p.otherAssets], ['debts', (p) => p.debts], ['goals', (p) => p.goals], ['household.people', (p) => p.household && p.household.people]];
function profileSkips(p) {
  const out = [];
  const keep = (path, held, message) => out.push({ path, message: message + '; kept aside, not used', held: held === undefined ? null : held, aside: true });
  for (const [path, get] of PROFILE_LISTS) {
    const x = get(p);
    if (x === undefined || x === null) continue;
    if (!Array.isArray(x)) { keep(path, x, 'not a list'); continue; }
    x.forEach((y, i) => { if (!y || typeof y !== 'object' || Array.isArray(y)) keep(path + '[' + i + ']', y, 'not a record'); });
  }
  return out;
}

// What the file held that could not be used, for the Ledger to list (S-228).
// Each comes with words for the field (`label`) and, when it is a field the Ledger opens, its path (`link`).
const ROOT_WORDS = { income: 'An income line', expenses: 'An expense', accounts: 'An account', otherAssets: 'An asset', debts: 'A debt', goals: 'A goal', taxYears: 'A tax year', log: 'A logged entry', checkins: 'A check-in', calendar: 'A calendar choice', household: 'The household', meta: 'The file', debtPlan: 'The debt plan', feed: 'A learned merchant', assumptions: 'The assumptions', '': 'The file' };
export function fileProblems(spine) {
  const all = (spine && spine.meta && Array.isArray(spine.meta.problems)) ? spine.meta.problems.filter((x) => x && typeof x.path === 'string') : [];
  const named = (x) => {
    const field = !x.aside && namedPath(x.path) && getAt(spine, x.path) !== undefined;
    const label = x.path === 'meta.asOf' ? 'The as-of date' : field ? labelFor(spine, x.path) : (ROOT_WORDS[x.path.split(/[.[]/)[0]] || 'Something') + nameOf(x);
    return { ...x, label, words: x.missing ? 'could not be read, so it shows as missing until you enter it again' : x.aside ? 'could not be read, so it is set aside and not used' : 'could not be read as it was, so it was read another way; check it', link: field ? x.path : null };
  };
  // The record's own name in words (never its place in the file): the item still in the household, else what the file held.
  const nameOf = (x) => {
    const [top, id] = x.path.split(/[.[\]]/);
    const rec = (Array.isArray(spine && spine[top]) && spine[top].find((r) => r && r.id === id)) || (x.held && typeof x.held === 'object' && !Array.isArray(x.held) ? x.held : null);
    const nm = !rec ? null : typeof rec.label === 'string' ? rec.label : rec.name && typeof rec.name === 'object' ? rec.name.value : rec.name;
    return typeof nm === 'string' && nm.trim() ? ' (' + nm.trim() + ')' : '';
  };
  // Open: a field set to missing that has not been entered in the Ledger since (a house default may stand in for it
  // meanwhile). Other: the rest of what the file held that could not be used as it was (kept aside, or read another
  // way), said once. A field entered in the Ledger closes its problem.
  const at = (x) => (namedPath(x.path) ? getAt(spine, x.path) : undefined);
  const closed = (x) => !x.aside && isFact(at(x)) && at(x).source === 'ledger';
  const open = all.filter((x) => x.missing && !closed(x) && isFact(at(x)));
  const other = all.filter((x) => !open.includes(x) && !closed(x));
  return { open: open.map(named), other: other.map(named) };
}

const COLLECTIONS = ['income', 'expenses', 'accounts', 'debts', 'goals', 'taxYears', 'log', 'checkins', 'lifeChanges'];
const words = (x) => { try { const t = JSON.stringify(x); return t === undefined ? String(x) : t.length > 80 ? t.slice(0, 77) + '...' : t; } catch { return String(x); } };

// repairSpine(spine, { today }) -> { spine, problems }: a copy where every field the validator rejects is either set to
// missing (a Fact of kind missing whose note says what the file held) or, when it is not a field SLAM uses, kept aside
// in meta.unread under its path. Nothing is dropped: what the file held is in the problem's `held` or in meta.unread.
export function repairSpine(input, { today = null } = {}) {
  const s = structuredClone(input);
  const problems = [];
  const day = isDay(today) ? today : new Date().toISOString().slice(0, 10);
  // flag: 'aside' (kept in meta.unread, not used) or 'missing' (the field reads missing until it is entered).
  const say = (path, message, held, flag = null) => { if (!problems.some((x) => x.path === path)) problems.push({ path, message, held: held === undefined ? null : held, ...(flag ? { [flag]: true } : {}) }); };
  if (!s.meta || typeof s.meta !== 'object' || Array.isArray(s.meta)) s.meta = {};
  const unread = (s.meta.unread && typeof s.meta.unread === 'object') ? s.meta.unread : {};
  const aside = (path, value, message) => { unread[path] = value === undefined ? null : value; say(path, message + '; kept aside, not used', value, 'aside'); };
  if (!isDay(s.meta.asOf)) { say('meta.asOf', 'no as-of date; read as of ' + day, s.meta.asOf); s.meta.asOf = day; }
  const stamp = (note) => fact(null, { kind: 'missing', asOf: s.meta.asOf, source: REPAIR_SOURCE, note });
  s.schema = SCHEMA_ID;

  // Structure first: every list is a list of objects with a usable id, the household is an object.
  if (!s.household || typeof s.household !== 'object' || Array.isArray(s.household)) { if (s.household !== undefined) aside('household', s.household, 'not a household record'); s.household = {}; }
  const H = s.household;
  const ids = (path, arr, base) => {
    const seen = new Set();
    return arr.filter((x, i) => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) { aside(path + '[' + i + ']', x, 'not a record'); return false; }
      let id = typeof x.id === 'string' || typeof x.id === 'number' ? String(x.id).replace(/\./g, '-') : '';
      if (!id && path === 'taxYears' && Number.isInteger(x.year)) id = String(x.year);
      if (!id || seen.has(id)) { const was = x.id; let n = 1; id = base + '-' + n; while (seen.has(id) || arr.some((y) => y && y.id === id)) id = base + '-' + ++n; if (was !== undefined && was !== null && was !== '') say(path + '.' + id, 'its id ' + words(was) + ' was used twice or could not be read; read as ' + id, was); }
      else if (id !== String(x.id)) say(path + '.' + id, 'its id ' + words(x.id) + ' has a dot, which a path cannot hold; read as ' + id, x.id);
      x.id = id; seen.add(id); return true;
    });
  };
  for (const c of COLLECTIONS) {
    if (s[c] === undefined) continue;
    if (!Array.isArray(s[c])) { aside(c, s[c], 'not a list'); s[c] = []; continue; }
    s[c] = ids(c, s[c], c === 'income' ? 'income' : c.replace(/s$/, ''));
  }
  for (const k of ['income', 'expenses', 'accounts', 'debts', 'goals']) if (!Array.isArray(s[k])) s[k] = [];
  // A name is words: one written as { value } or as a number is read as its words, else as the id.
  for (const k of ['income', 'expenses', 'goals']) for (const x of s[k]) if (typeof x.label !== 'string') {
    const was = x.label;
    x.label = was && typeof was === 'object' && typeof was.value === 'string' ? was.value : typeof was === 'number' ? String(was) : x.id;
    if (was !== undefined && was !== null && !(was && typeof was === 'object' && typeof was.value === 'string')) say(k + '.' + x.id + '.label', 'its name could not be read; read as ' + words(x.label), was);
  }
  if (!Array.isArray(H.people) || !H.people.length) { if (H.people !== undefined && !(Array.isArray(H.people) && !H.people.length)) aside('household.people', H.people, 'not a list of people'); H.people = []; }
  H.people = ids('household.people', H.people, 'person');
  if (!H.people.length) { H.people.push({ id: 'you', name: 'You', birthDate: fact(null, { kind: 'missing', asOf: s.meta.asOf, source: 'upgrade' }) }); }
  for (const k of ['situation', 'healthCoverage']) {
    if (!Array.isArray(H[k]) || !H[k].length) { if (H[k] !== undefined && !Array.isArray(H[k])) aside('household.' + k, H[k], 'not a dated list'); H[k] = [{ id: 'now', from: null, value: fact(null, { kind: 'missing', asOf: s.meta.asOf, source: 'upgrade' }) }]; }
    H[k] = ids('household.' + k, H[k], k === 'situation' ? 'situation' : 'coverage');
    if (!H[k].length) H[k] = [{ id: 'now', from: null, value: fact(null, { kind: 'missing', asOf: s.meta.asOf, source: 'upgrade' }) }];
    if (!H[k].some((e) => e.from === null)) H[k][0].from = null;
  }
  // The Session's first questions moved into the Profile (Phase 2.5 B3): an older file's household.home and
  // household.getAround are read as profile.home and profile.getAround (both, none: a mix, rideshare).
  if (s.profile !== undefined && (!s.profile || typeof s.profile !== 'object' || Array.isArray(s.profile))) { aside('profile', s.profile, 'not a record of answers'); delete s.profile; }
  // An old answer maps to one that hides nothing it used to show: car and both read as a mix; none and other are not
  // moved (left for the Profile to ask again).
  for (const [k, map] of [['home', { other: null }], ['getAround', { car: 'mix', both: 'mix', none: null }]]) {
    if (H[k] === undefined) continue;
    const was = H[k];
    delete H[k];
    if (!isFact(was) || was.value === null || map[was.value] === null || (s.profile && s.profile[k])) continue;
    s.profile = { ...(s.profile || {}), [k]: { ...was, value: map[was.value] || was.value } };
  }
  if (!s.assumptions || typeof s.assumptions !== 'object' || Array.isArray(s.assumptions)) { if (s.assumptions !== undefined) aside('assumptions', s.assumptions, 'not a set of assumptions'); s.assumptions = {}; }
  // Entries the checks walk into: a list inside a Fact (contributions, conversions) holds records; the calendar's
  // decisions, the section defaults and the feed's memory are records too.
  for (const k of ['accounts', 'debts']) for (const x of s[k]) for (const f of ['contributions', 'conversions']) {
    const v = x[f] && x[f].value;
    if (Array.isArray(v)) x[f].value = v.filter((e, i) => { if (e && typeof e === 'object' && !Array.isArray(e)) return true; aside(k + '.' + x.id + '.' + f + '[' + i + ']', e, 'not an entry'); return false; });
  }
  const recs = (path, o) => { if (o === undefined) return; if (!o || typeof o !== 'object' || Array.isArray(o)) { aside(path, o, 'not a record'); return null; } for (const [k, v] of Object.entries(o)) if (!v || typeof v !== 'object' || Array.isArray(v)) { aside(path + '.' + k, v, 'not a record'); delete o[k]; } return o; };
  if (H.expenseDefaults !== undefined && recs('household.expenseDefaults', H.expenseDefaults) === null) delete H.expenseDefaults;
  if (s.calendar !== undefined) {
    if (!s.calendar || typeof s.calendar !== 'object' || Array.isArray(s.calendar)) { aside('calendar', s.calendar, 'not a record'); delete s.calendar; }
    else {
      if (recs('calendar.overrides', s.calendar.overrides) === null) delete s.calendar.overrides;
      if (s.calendar.maybe !== undefined) { if (!Array.isArray(s.calendar.maybe)) { aside('calendar.maybe', s.calendar.maybe, 'not a list'); delete s.calendar.maybe; } else s.calendar.maybe = ids('calendar.maybe', s.calendar.maybe, 'maybe'); }
      if (s.calendar.locks !== undefined && (!s.calendar.locks || typeof s.calendar.locks !== 'object' || Array.isArray(s.calendar.locks))) { aside('calendar.locks', s.calendar.locks, 'not a record'); delete s.calendar.locks; }
    }
  }
  if (s.feed !== undefined && s.feed !== null && typeof s.feed === 'object' && s.feed.memory !== undefined && (!s.feed.memory || typeof s.feed.memory !== 'object' || Array.isArray(s.feed.memory))) { aside('feed.memory', s.feed.memory, 'not a record'); delete s.feed.memory; }
  for (const k of ['debtPlan']) if (s[k] !== undefined && (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k]))) { aside(k, s[k], 'not a record'); delete s[k]; }
  for (const c of ['checkins']) for (const x of s[c] || []) for (const f of ['balances', 'forecast']) if (x[f] !== undefined && x[f] !== null && (typeof x[f] !== 'object' || Array.isArray(x[f]))) { aside(c + '.' + x.id + '.' + f, x[f], 'not a record'); delete x[f]; }

  // Then each field the validator rejects, a pass at a time, until it passes or nothing more can be done.
  const firstPerson = H.people[0].id;
  const isRecord = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const parent = (path) => { const i = path.lastIndexOf('.'); return i < 0 ? [s, path] : [getAt(s, path.slice(0, i)), path.slice(i + 1)]; };
  const put = (path, value) => { const [o, k] = parent(path); if (o && typeof o === 'object' && !Array.isArray(o)) { o[k] = value; return true; } return false; };
  const drop = (path) => { const [o, k] = parent(path); if (o && typeof o === 'object' && !Array.isArray(o) && k in o) { delete o[k]; return true; } return false; };
  // An item of a list, moved aside whole.
  const itemAside = (coll, id, message) => {
    const arr = coll.split('.').reduce((o, k) => (o ? o[k] : undefined), s);
    if (!Array.isArray(arr)) return false;
    const i = arr.findIndex((x) => x && x.id === id);
    if (i < 0) return false;
    aside(coll + '.' + id, arr[i], message);
    arr.splice(i, 1);
    return true;
  };
  const toMissing = (path, message) => { const held = getAt(s, path); if (!put(path, stamp('the file held ' + words(isFact(held) ? held.value : held) + ': ' + message))) return false; say(path, message, isFact(held) ? held.value : held, 'missing'); return true; };
  const FACT_SOFT = /^(Fact has no (asOf|source)|asOf is not a date|missing field|known with no value|rough with no value|computed with no value)/;

  function fix({ path, message }) {
    // A list entry inside a Fact (contributions[0].year): the entry is kept aside, the rest stay.
    const br = /^(.+?)\[(\d+)\]/.exec(path);
    if (br) {
      const f = getAt(s, br[1]);
      if (f && isFact(f) && Array.isArray(f.value) && f.value[+br[2]] !== undefined) { const [bad] = f.value.splice(+br[2], 1); aside(br[1] + '[' + br[2] + ']', bad, message); return true; }
      return false;
    }
    const seg = path.split('.');
    const cur = getAt(s, path);
    // Facts: a blank is missing; a plain value is wrapped; a value that cannot be used reads missing and is named.
    if (FACT_SOFT.test(message) && !(message.startsWith('missing field') && !isRecord(parent(path)[0]))) {
      if (message.startsWith('missing field')) return put(path, fact(null, { kind: 'missing', asOf: s.meta.asOf, source: 'upgrade' }));
      if (message.startsWith('Fact has no')) { cur.asOf = cur.asOf ?? null; cur.source = cur.source ?? null; return true; }
      if (message.startsWith('asOf')) { cur.asOf = null; return true; }
      cur.kind = 'missing'; cur.value = null; return true;
    }
    if (/^(missing|notForMe) must carry null/.test(message)) {
      if (cur.value === 0 || cur.value === '' ) { cur.value = null; return true; }
      return toMissing(path, 'a value marked ' + cur.kind);
    }
    if (message.startsWith('unknown kind')) {
      if (cur.value === null || cur.value === undefined) { cur.kind = 'missing'; cur.value = null; return true; }
      say(path, 'its kind ' + words(cur.kind) + ' is not one this app knows; read as rough', cur.kind); cur.kind = 'rough'; return true;
    }
    if (message.startsWith('not a Fact')) {
      if (cur === null || ['number', 'string', 'boolean'].includes(typeof cur) || Array.isArray(cur)) return put(path, fact(cur, { kind: cur === null ? 'missing' : 'known', asOf: s.meta.asOf, source: 'file' }));
      return toMissing(path, 'not a value this app can read');
    }
    // Fields that are not a field of the record, or of a section: kept aside.
    if (/^not a field of the|^not a tax year field|^not a debt plan field|^not a section$/.test(message)) { aside(path, cur, message.replace(/^not a field of the (\w+) family$/, 'not a field of a $1 account')); return drop(path); }
    // Per collection.
    const [top, id, field] = seg;
    if (top === 'household') {
      if (seg[1] === 'people' && seg[3] === 'name') { const p = getAt(s, 'household.people.' + seg[2]); if (p) { say(path, 'needs a name; read as "Person"', p.name); p.name = 'Person'; return true; } }
      if ((seg[1] === 'situation' || seg[1] === 'healthCoverage') && seg[3] === 'from') return itemAside('household.' + seg[1], seg[2], 'its start is not a date');
      if (seg[3] === 'personId') { const e = getAt(s, seg.slice(0, 3).join('.')); if (e) { say(path, 'names no one in the household; read as ' + firstPerson, e.personId); e.personId = firstPerson; return true; } }
      if (seg[1] === 'payers') { aside(path, cur, message); delete H.payers; return true; }
      if (seg[1] === 'expenseDefaults') { aside(path, cur, message); return drop(path); }
    }
    if (top === 'income' && id) {
      const x = getAt(s, 'income.' + id);
      if (!x) return false;
      if (field === 'type') { say(path, 'type ' + words(x.type) + ' is not one this app knows; read as other', x.type); x.type = 'other'; return true; }
      if (field === 'cadence' || ((field === 'start' || field === 'end') && /needs (a start|an end) date/.test(message))) { const was = x.cadence, held = x.amount && x.amount.value; say('income.' + id + '.amount', (field === 'cadence' ? 'how often ' + words(was) + ' is not one this app knows' : message) + '; the amount reads missing until you enter it', held, 'missing'); x.cadence = 'monthly'; x.amount = stamp('the file held ' + words(held) + ', ' + words(was)); return true; }
      if (field === 'start' || field === 'end') { say(path, message, x[field]); x[field] = null; return true; }
      if (field === 'personId') { say(path, 'names no one in the household; read as ' + firstPerson, x.personId); x.personId = firstPerson; return true; }
      if (field === 'withholding' && (!seg[3] || !x.withholding || typeof x.withholding !== 'object' || Array.isArray(x.withholding))) {
        if (x.withholding !== undefined && x.withholding !== null && (typeof x.withholding !== 'object' || Array.isArray(x.withholding))) aside('income.' + id + '.withholding', x.withholding, 'not federal and state withholding');
        x.withholding = { federal: stamp('no withholding in the file'), state: stamp('no withholding in the file') }; return true;
      }
      if (field === 'likelihood' && !cur) { x.likelihood = fact(null, { kind: 'missing', asOf: s.meta.asOf, source: 'upgrade' }); return true; }
    }
    if (top === 'expenses' && id) {
      const x = getAt(s, 'expenses.' + id);
      if (!x) return false;
      if (field === 'cadence') { const was = x.cadence, held = x.amount && x.amount.value; say('expenses.' + id + '.amount', 'how often ' + words(was) + ' is not one this app knows; the amount reads missing until you enter it', held, 'missing'); x.cadence = 'monthly'; x.amount = stamp('the file held ' + words(held) + ', ' + words(was)); return true; }
      if (field === 'start' || field === 'end' || field === 'fat' || field === 'fixed') { say(path, message, x[field]); x[field] = null; return true; }
    }
    if ((top === 'accounts' || top === 'debts') && id) {
      const x = getAt(s, top + '.' + id);
      if (!x) return false;
      if (field === 'type') return itemAside(top, id, 'type ' + words(x.type) + ' is not an account type this app knows');
      if (field === 'family') {
        const preset = PRESETS[x.type];
        const want = preset && preset.family === 'debt' ? 'debts' : 'accounts';
        if (want !== top) { const arr = s[top]; arr.splice(arr.indexOf(x), 1); if (!Array.isArray(s[want])) s[want] = []; if (s[want].some((y) => y.id === x.id)) x.id = x.id + '-2'; x.family = preset.family; s[want].push(x); say(want + '.' + x.id, 'was filed under ' + top + '; moved to ' + want, top); return true; }
        x.family = preset.family; return true;
      }
    }
    if (top === 'goals' && id) {
      const g = getAt(s, 'goals.' + id);
      if (g && field === 'type') { say(path, 'type ' + words(g.type) + ' is not one this app knows; read as other', g.type); g.type = 'other'; return true; }
      if (g && field === 'by') { say(path, message, g.by); g.by = null; return true; }
    }
    if (top === 'taxYears' && id && field === 'year') { const t = getAt(s, 'taxYears.' + id); if (t && /^\d{4}$/.test(id)) { t.year = +id; return true; } return itemAside('taxYears', id, 'its year could not be read'); }
    if (top === 'calendar') { aside(path, cur, message); if (seg.length >= 3 && (seg[1] === 'overrides' || seg[1] === 'locks')) { const key = path.slice(('calendar.' + seg[1] + '.').length); delete s.calendar[seg[1]][key]; return true; } if (seg[1] === 'maybe' && seg[2]) return itemAside('calendar.maybe', seg[2], message) || true; delete s.calendar[seg[1]]; return true; }
    if ((top === 'log' || top === 'checkins') && id) return itemAside(top, id, message);
    if (top === 'feed') { aside(path, cur, message); if (seg[1] === 'memory' && seg[2]) { delete s.feed.memory[seg.slice(2).join('.')]; return true; } delete s.feed; return true; }
    // Any other field of a record that cannot be used reads missing.
    if (cur !== undefined && isFact(cur)) return toMissing(path, message);
    // A record that cannot be read at all is kept aside whole.
    if (COLLECTIONS.includes(top) && id && getAt(s, top + '.' + id)) return itemAside(top, id, path.slice(top.length + id.length + 2) + ': ' + message);
    return false;
  }

  for (let pass = 0; pass < 12; pass++) {
    let r;
    try { r = validate(s); } catch (err) { say('', 'the file could not be checked all the way (' + err.message + '); read as far as it goes'); break; }
    if (r.ok) break;
    let moved = false;
    // One fix a field a pass: the validator can name a field twice, and the second reading is of the field as it was.
    const seen = new Set();
    for (const e of r.errors) { if (seen.has(e.path)) continue; seen.add(e.path); try { moved = fix(e) || moved; } catch { /* the next pass reads it again */ } }
    if (!moved) { for (const e of r.errors) say(e.path, e.message + '; left as it is'); break; }
  }
  if (Object.keys(unread).length) s.meta.unread = unread;
  // Problems from an earlier load stay listed until the field is filled (fileProblems); new ones join them.
  const before = Array.isArray(s.meta.problems) ? s.meta.problems.filter((x) => x && typeof x.path === 'string') : [];
  const all = [...before.filter((x) => !problems.some((y) => y.path === x.path)), ...problems];
  if (all.length) s.meta.problems = all;
  return { spine: s, problems };
}
