// Loading a household: a spine file (slam-spine/1) is used as is; a profile
// file (the eli.profile.json shape, _meta.version 3) is turned into a spine.
// The profile file itself is never rewritten.

import { fact, monthEnd } from './spine.js';
import { SCHEMA_ID, PRESETS } from './schema.js';

// Bring a spine saved by an earlier version up to the current shape (S-167):
// fields a newer version requires are added as missing (or defaulted the way
// the profile loader does), never removed or overwritten.
export function upgradeSpine(spine) {
  const s = structuredClone(spine);
  const asOf = s.meta && s.meta.asOf;
  const stamp = { asOf, source: 'upgrade' };
  // Need or want became a Fact (S-171).
  for (const e of s.expenses || []) {
    if (e.need === undefined || e.need === null || typeof e.need === 'boolean') e.need = typeof e.need === 'boolean' ? fact(e.need, { ...stamp, kind: 'known' }) : fact(null, stamp);
  }
  for (const d of s.debts || []) {
    if (d.type !== 'credit_card') continue;
    if (!d.business) d.business = fact(null, stamp);
    if (!d.reportsToPersonalCredit) {
      const b = d.business.value;
      d.reportsToPersonalCredit = b === null ? fact(null, stamp) : b ? fact(false, { ...stamp, kind: 'rough' }) : fact(true, { ...stamp, kind: d.business.kind });
    }
  }
  return s;
}

export function loadHousehold(raw) {
  if (raw && raw.schema === SCHEMA_ID) return upgradeSpine(raw);
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
  // except a blank, which is missing. A debt may name a field's own kind in
  // `kinds` ({ apr: 'rough' }) when one number is less sure than the rest.
  const F = (value, kind, note) => fact(value === undefined ? null : value, { kind: value === null || value === undefined ? 'missing' : kind === 'missing' ? 'missing' : kind || 'known', asOf, source, note });
  // The kind of one field on a record: its own entry in `kinds`, else the record's.
  const K = (rec, field) => (rec.kinds && rec.kinds[field]) || rec.kind;
  const H = p.household;
  const people = H.people.map((x) => ({ id: x.id, name: x.name, birthDate: F(x.birthDate, x.kind) }));
  const personId = people[0].id;

  const situation = [{ id: 'now', from: null, value: F(H.situation.value, H.situation.kind) }];
  if (H.situation.changesTo) situation.push({ id: 'next', from: H.situation.on, value: F(H.situation.changesTo, H.situation.kind) });
  const hc = H.healthCoverage;
  const healthCoverage = [{ id: 'now', from: null, personId, value: F(hc.value, hc.kind) }];
  if (hc.after) healthCoverage.push({ id: 'next', from: hc.endsOn, personId, value: F(hc.after, hc.kind), planType: F(hc.afterPlanType ?? null, K(hc, 'afterPlanType')), enrolled: F(hc.enrolled ?? null, K(hc, 'enrolled')), setAside: F(hc.setAside ?? null, K(hc, 'setAside')) });

  const incomeIds = new Set();
  const income = (p.income || []).map((s) => {
    // A yearly amount over a window shorter than a year is that window's total
    // (the profile's "2026 only" W-2 line), not a yearly rate. S-143.
    let cadence = s.cadence;
    if (cadence === 'yearly' && s.start && s.end && (Date.parse(s.end) - Date.parse(s.start)) / 864e5 < 364) cadence = 'total';
    const noWithholding = s.type === '1099';
    const out = {
      id: s.id || slug(s.label, incomeIds), type: s.type, label: s.label, personId,
      amount: F(s.amount, K(s, 'amount')),
      cadence, start: s.start || null, end: s.end || null,
      withholding: {
        federal: s.federalWithholding !== undefined ? F(s.federalWithholding, K(s, 'federalWithholding')) : noWithholding ? fact(0, { kind: 'known', asOf, source: 'a 1099 has no withholding' }) : F(null),
        state: s.stateWithholding !== undefined ? F(s.stateWithholding, K(s, 'stateWithholding')) : noWithholding ? fact(0, { kind: 'known', asOf, source: 'a 1099 has no withholding' }) : F(null)
      }
    };
    // 1099 business expenses, in the stream's own cadence (S-179).
    if (s.businessExpenses !== undefined) out.businessExpenses = F(s.businessExpenses, K(s, 'businessExpenses'));
    if (s.likelihood !== undefined) out.likelihood = F(s.likelihood, (s.kinds && s.kinds.likelihood) || 'rough');
    if (s.notes) out.notes = s.notes;
    // A 0 written next to kind missing is a blank, not a typed zero.
    if (s.kind === 'missing' && s.amount === 0) out.amount = fact(null, { kind: 'missing', asOf, source, note: 'profile had 0 with kind missing' });
    return out;
  });

  const expIds = new Set();
  const expenses = (p.expenses || []).map((e) => {
    const out = {
      id: e.id || slug(e.label, expIds), label: e.label, amount: F(e.amount, K(e, 'amount')), cadence: e.cadence,
      start: e.start || null, end: e.end || null,
      fixed: typeof e.fixed === 'boolean' ? e.fixed : null,
      need: F(typeof e.need === 'boolean' ? e.need : null, 'known'),
      fat: e.fat || null
    };
    if (typeof e.covered === 'boolean') out.covered = F(e.covered, K(e, 'covered') === 'rough' ? 'rough' : 'known');
    if (e.coveredBy) out.coveredBy = F(e.coveredBy, K(e, 'coveredBy') === 'rough' ? 'rough' : 'known');
    if (e.notes) out.notes = e.notes;
    return out;
  });

  const accounts = (p.accounts || []).map((a) => {
    const out = { id: a.id, family: a.family, type: a.type, name: F([a.institution, PRESETS[a.type] ? PRESETS[a.type].label : a.type].filter(Boolean).join(' '), 'known'), institution: F(a.institution, K(a, 'institution') === 'rough' ? 'rough' : 'known'), balance: F(a.balance, K(a, 'balance')) };
    if ('apy' in a) out.apy = F(a.apy, K(a, 'apy'));
    if (a.contributions) out.contributions = F(a.contributions, K(a, 'contributions'));
    if (a.basis !== undefined) out.basis = F(a.basis, a.kind);
    if (a.firstRothYear !== undefined) out.firstRothYear = F(a.firstRothYear, a.kind);
    if (a.conversionYear !== undefined) out.conversions = F([{ year: a.conversionYear, amount: a.conversionTaxable ?? a.balance, taxable: a.conversionTaxable ?? null }], a.kind);
    const notes = [a.source, a.notes].filter(Boolean).join(' ');
    if (notes) out.notes = notes;
    return out;
  });
  const otherIds = new Set(accounts.map((a) => a.id));
  for (const o of p.otherAssets || []) {
    accounts.push({ id: o.id || slug(o.type, otherIds), family: 'otherAssets', type: o.type, name: F(o.label || PRESETS[o.type]?.label || o.type, 'known'), balance: F(o.value, K(o, 'value')), ...(o.appreciationRate !== undefined ? { appreciationRate: F(o.appreciationRate, K(o, 'appreciationRate')) } : {}), ...(o.notes ? { notes: o.notes } : {}) });
  }

  const debts = (p.debts || []).map((d) => {
    const out = { id: d.id, family: 'debt', type: d.type, name: F(d.lender || d.label || PRESETS[d.type]?.label || d.type, d.lender ? 'known' : 'rough'), balance: F(d.balance, d.kind) };
    for (const k of ['apr', 'promoApr', 'promoEnds', 'deferredInterest', 'limit', 'minimum', 'dueDay', 'federal', 'plan', 'stress', 'reasonsToKeep', 'business', 'reportsToPersonalCredit']) if (k in d) out[k] = F(d[k], (d.kinds && d.kinds[k]) || d.kind);
    if (d.payoff) out.payoffDate = F(d.payoff.length === 7 ? monthEnd(d.payoff) : d.payoff, d.kind);
    for (const k of DEBT_NEEDS[d.type] || DEBT_NEEDS.default) if (!(k in out)) out[k] = F(null);
    // A card says whether it is a business card and whether it reports to personal
    // credit (S-157). Unsaid, a personal card reports and a business card does not;
    // the business default is rough because some issuers do report.
    if (d.type === 'credit_card') {
      if (!out.business) out.business = F(null);
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
    income, expenses, accounts, debts, goals, assumptions,
    // The as-of year's tax entries. Nothing in the profile says estimates were
    // paid, so none is the rough starting answer.
    taxYears: [(() => {
      const ty = p.taxYear || {};
      const said = (k, note) => (ty[k] !== undefined ? F(ty[k], K(ty, k)) : fact(0, { kind: 'rough', asOf, source, note }));
      return {
        id: asOf.slice(0, 4), year: +asOf.slice(0, 4),
        estimatedPaidFederal: said('estimatedPaidFederal', 'assumed none paid'),
        estimatedPaidState: said('estimatedPaidState', 'assumed none paid'),
        setAside: said('setAside', 'assumed nothing set aside for the tax bill yet')
      };
    })()]
  };
}
