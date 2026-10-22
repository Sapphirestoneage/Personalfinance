// Loading a household: a spine file (slam-spine/1) is used as is; a profile
// file (the eli.profile.json shape, _meta.version 3) is turned into a spine.
// The profile file itself is never rewritten.

import { fact, monthEnd } from './spine.js';
import { SCHEMA_ID, PRESETS } from './schema.js';

export function loadHousehold(raw) {
  if (raw && raw.schema === SCHEMA_ID) return structuredClone(raw);
  if (raw && raw._meta && raw.household) return fromProfile(raw);
  throw new Error('Not a household file: expected ' + SCHEMA_ID + ' or a profile with _meta and household');
}

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

export function fromProfile(p) {
  const asOf = p._meta.asOf;
  const source = 'profile v' + p._meta.version + (p._meta.name ? ' (' + p._meta.name + ')' : '');
  // A Fact from the profile: the record's kind applies to every number in it,
  // except a blank, which is missing.
  const F = (value, kind, note) => fact(value === undefined ? null : value, { kind: value === null || value === undefined ? 'missing' : kind === 'missing' ? 'missing' : kind || 'known', asOf, source, note });
  const H = p.household;
  const people = H.people.map((x) => ({ id: x.id, name: x.name, birthDate: F(x.birthDate, x.kind) }));
  const personId = people[0].id;

  const situation = [{ id: 'now', from: null, value: F(H.situation.value, H.situation.kind) }];
  if (H.situation.changesTo) situation.push({ id: 'next', from: H.situation.on, value: F(H.situation.changesTo, H.situation.kind) });
  const hc = H.healthCoverage;
  const healthCoverage = [{ id: 'now', from: null, personId, value: F(hc.value, hc.kind) }];
  if (hc.after) healthCoverage.push({ id: 'next', from: hc.endsOn, personId, value: F(hc.after, hc.kind), planType: F(null) });

  const incomeIds = new Set();
  const income = (p.income || []).map((s) => {
    // A yearly amount over a window shorter than a year is that window's total
    // (the profile's "2026 only" W-2 line), not a yearly rate. S-143.
    let cadence = s.cadence;
    if (cadence === 'yearly' && s.start && s.end && (Date.parse(s.end) - Date.parse(s.start)) / 864e5 < 364) cadence = 'total';
    const noWithholding = s.type === '1099';
    const out = {
      id: s.id || slug(s.label, incomeIds), type: s.type, label: s.label, personId,
      amount: F(s.amount, s.kind),
      cadence, start: s.start || null, end: s.end || null,
      withholding: {
        federal: s.federalWithholding !== undefined ? F(s.federalWithholding, 'known') : noWithholding ? fact(0, { kind: 'known', asOf, source: 'a 1099 has no withholding' }) : F(null),
        state: s.stateWithholding !== undefined ? F(s.stateWithholding, 'known') : noWithholding ? fact(0, { kind: 'known', asOf, source: 'a 1099 has no withholding' }) : F(null)
      }
    };
    if (s.likelihood !== undefined) out.likelihood = F(s.likelihood, 'rough');
    if (s.notes) out.notes = s.notes;
    // A 0 written next to kind missing is a blank, not a typed zero.
    if (s.kind === 'missing' && s.amount === 0) out.amount = fact(null, { kind: 'missing', asOf, source, note: 'profile had 0 with kind missing' });
    return out;
  });

  const expIds = new Set();
  const expenses = (p.expenses || []).map((e) => {
    const out = {
      id: e.id || slug(e.label, expIds), label: e.label, amount: F(e.amount, e.kind), cadence: e.cadence,
      start: e.start || null, end: e.end || null,
      fixed: typeof e.fixed === 'boolean' ? e.fixed : null,
      need: typeof e.need === 'boolean' ? e.need : null,
      fat: e.fat || null
    };
    if (e.notes) out.notes = e.notes;
    return out;
  });

  const accounts = (p.accounts || []).map((a) => {
    const out = { id: a.id, family: a.family, type: a.type, name: F([a.institution, PRESETS[a.type] ? PRESETS[a.type].label : a.type].filter(Boolean).join(' '), 'known'), institution: F(a.institution, 'known'), balance: F(a.balance, a.kind) };
    if ('apy' in a) out.apy = F(a.apy, a.kind);
    if (a.contributions) out.contributions = F(a.contributions, a.kind);
    if (a.basis !== undefined) out.basis = F(a.basis, a.kind);
    if (a.firstRothYear !== undefined) out.firstRothYear = F(a.firstRothYear, a.kind);
    if (a.conversionYear !== undefined) out.conversions = F([{ year: a.conversionYear, amount: a.conversionTaxable ?? a.balance, taxable: a.conversionTaxable ?? null }], a.kind);
    const notes = [a.source, a.notes].filter(Boolean).join(' ');
    if (notes) out.notes = notes;
    return out;
  });
  const otherIds = new Set(accounts.map((a) => a.id));
  for (const o of p.otherAssets || []) {
    accounts.push({ id: o.id || slug(o.type, otherIds), family: 'otherAssets', type: o.type, name: F(o.label || PRESETS[o.type]?.label || o.type, 'known'), balance: F(o.value, o.kind), ...(o.notes ? { notes: o.notes } : {}) });
  }

  const debts = (p.debts || []).map((d) => {
    const out = { id: d.id, family: 'debt', type: d.type, name: F(d.lender || PRESETS[d.type]?.label || d.type, d.lender ? 'known' : 'rough'), balance: F(d.balance, d.kind) };
    for (const k of ['apr', 'promoApr', 'promoEnds', 'deferredInterest', 'limit', 'minimum', 'dueDay', 'federal', 'plan', 'stress', 'reasonsToKeep']) if (k in d) out[k] = F(d[k], d.kind);
    if (d.payoff) out.payoffDate = F(d.payoff.length === 7 ? monthEnd(d.payoff) : d.payoff, d.kind);
    for (const k of DEBT_NEEDS[d.type] || DEBT_NEEDS.default) if (!(k in out)) out[k] = F(null);
    // A promo balance needs to say whether interest is deferred (it changes the deadline's cost).
    if (out.promoEnds && !('deferredInterest' in out)) out.deferredInterest = F(null);
    if (d.notes) out.notes = d.notes;
    return out;
  });

  const goalIds = new Set();
  const goals = (p.goals || []).map((g) => {
    const type = /^fi$/i.test(g.label) || g.fiNumber !== undefined ? 'fi' : g.target !== undefined ? 'savings' : /paid off|payoff/i.test(g.label) ? 'payoff' : 'other';
    const out = { id: g.id || slug(g.label, goalIds), type, label: g.label };
    if (g.target !== undefined) out.target = F(g.target, g.kind);
    if (g.fiNumber !== undefined) out.fiNumber = F(g.fiNumber, g.kind);
    if (g.annualSpending !== undefined) out.annualSpending = F(g.annualSpending, g.kind);
    if (g.by) out.by = g.by;
    if (g.flavor) out.flavor = g.flavor;
    if (g.notes) out.notes = g.notes;
    return out;
  });

  const A = p.assumptions || {};
  const assumptions = {};
  for (const k of ['inflation', 'realReturn', 'withdrawalRate', 'lifeExpectancy', 'coastAge']) if (A[k]) assumptions[k] = F(A[k].value, A[k].kind);
  for (const k of ['inflation', 'realReturn', 'withdrawalRate', 'lifeExpectancy']) if (!assumptions[k]) assumptions[k] = F(null);

  return {
    schema: SCHEMA_ID,
    meta: { name: p._meta.name || 'Household', asOf, demo: false, from: source },
    household: {
      people,
      filingStatus: F(FILING[H.filingStatus.value] ?? H.filingStatus.value, H.filingStatus.kind),
      state: F(H.state.value, H.state.kind),
      county: F(H.county.value, H.county.kind),
      nycResident: F(H.nycResident.value, H.nycResident.kind),
      situation, healthCoverage
    },
    income, expenses, accounts, debts, goals, assumptions
  };
}
