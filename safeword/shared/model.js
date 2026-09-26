/* ==========================================================================
   safeword/shared/model.js, the one household Safeword holds. SF-002.
   --------------------------------------------------------------------------
   Every stored shape starts here. A page never builds an object by hand: it
   calls a constructor, and an engine reads through the accessors. Empty is
   null, never zero; money is integer cents; a rate is a decimal fraction.

     Model.blank()                    a household with nothing entered
     Model.stream(o), cost(o), rail(o), person(o), play(o)   one row each
     Model.normalise(h)               fills what an older or partial copy lacks
     Model.rows(h, list)              the list with dead rows dropped
     Model.FILING, Model.ROLES        the choices a select offers
   ========================================================================== */
(function (root, factory) {
  var Money = (typeof module === 'object' && module.exports) ? require('./money.js') : (root.SLAF && root.SLAF.Money);
  var api = factory(Money);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Model = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';
  var VERSION = 1;
  var FILING = [
    { id: 'single', label: 'Single' }, { id: 'head_of_household', label: 'Head of household' },
    { id: 'married_joint', label: 'Married, filing together' }, { id: 'married_separate', label: 'Married, filing apart' }
  ];
  var ROLES = [
    { id: 'me', label: 'Me' }, { id: 'dominant', label: 'Dominant' }, { id: 'submissive', label: 'Submissive' },
    { id: 'switch', label: 'Switch' }, { id: 'partner', label: 'Partner' }, { id: 'housemate', label: 'Housemate' }, { id: 'other', label: 'Other' }
  ];
  var ACCOUNTS = [
    { id: 'none', label: 'Nothing yet' }, { id: 'roth', label: 'Roth IRA' }, { id: 'ira', label: 'Traditional IRA' },
    { id: 'sep', label: 'SEP IRA' }, { id: 'solo401k', label: 'Solo 401(k)' }, { id: 'job401k', label: 'A job’s 401(k)' }, { id: 'taxable', label: 'A plain brokerage account' }
  ];
  var RISKS = [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }];

  function n(v) { return Money.isEntered(v) ? v : null; }
  function cents(v) { return Money.isEntered(v) ? Math.round(v) : null; }
  function rate(v) { return Money.isEntered(v) && v >= 0 && v <= 1 ? v : null; }
  function str(v) { return typeof v === 'string' && v.length ? v : null; }
  function bool(v) { return v === true ? true : v === false ? false : null; }
  var seq = 0;
  function id(prefix) { seq += 1; return prefix + '-' + Date.now().toString(36) + '-' + seq.toString(36) + Math.random().toString(36).slice(2, 6); }

  function stream(o) { o = o || {}; return {
    id: o.id || id('s'), kind: str(o.kind) || 'other', label: str(o.label),
    lowMonthCents: cents(o.lowMonthCents), typicalMonthCents: cents(o.typicalMonthCents),
    platformFeeRate: rate(o.platformFeeRate), processorFeeRate: rate(o.processorFeeRate), cashShare: rate(o.cashShare),
    monthsActive: Money.isEntered(o.monthsActive) ? Math.min(12, Math.max(0, Math.round(o.monthsActive))) : null,
    railId: str(o.railId)
  }; }
  function cost(o) { o = o || {}; return {
    id: o.id || id('c'), kind: str(o.kind) || 'other', label: str(o.label), monthCents: cents(o.monthCents),
    fixed: bool(o.fixed), deductible: str(o.deductible)
  }; }
  function rail(o) { o = o || {}; return {
    id: o.id || id('r'), kind: str(o.kind) || 'bank', label: str(o.label), balanceCents: cents(o.balanceCents),
    closeRisk: str(o.closeRisk), forWork: bool(o.forWork), isFund: bool(o.isFund)
  }; }
  function person(o) { o = o || {}; return {
    id: o.id || id('p'), name: str(o.name), role: str(o.role) || 'partner', incomeMonthCents: cents(o.incomeMonthCents),
    leanMonthCents: cents(o.leanMonthCents), share: rate(o.share)
  }; }
  function play(o) { o = o || {}; return { id: o.id || id('k'), kind: str(o.kind) || 'other', label: str(o.label), yearCents: cents(o.yearCents) }; }

  function blank() { return {
    version: VERSION,
    you: { name: null, filingStatus: null, state: null, age: null, sessionCents: null, sessionsMonth: null },
    streams: [], costs: [], rails: [], play: [],
    personal: { leanMonthCents: null, typicalMonthCents: null },
    fund: { targetMonths: null, setAsideRate: null },
    taxes: { setAsideRate: null, priorYearLiabilityCents: null, priorYearAgiCents: null, paidThisYearCents: null, countSometimes: false },
    longgame: { account: 'none', balanceCents: null, monthCents: null, annualRate: null, stopAge: null, exitYear: null, cushionMonths: null },
    house: { people: [], sharedMonthCents: null, splitRule: 'proportional',
      protocol: { fromId: null, toId: null, monthCents: null, capCents: null, reviewDate: null, safeword: null } },
    papers: {},
    meta: { demo: false, updated: null }
  }; }

  /* Fill what a partial or older copy lacks, without inventing a number. */
  function normalise(raw) {
    var b = blank(), h = raw && typeof raw === 'object' ? raw : {};
    function merge(base, over) { var out = {}; Object.keys(base).forEach(function (k) { out[k] = over && Object.prototype.hasOwnProperty.call(over, k) ? over[k] : base[k]; }); return out; }
    var out = {
      version: VERSION,
      you: merge(b.you, h.you), personal: merge(b.personal, h.personal), fund: merge(b.fund, h.fund), taxes: merge(b.taxes, h.taxes),
      longgame: merge(b.longgame, h.longgame), papers: h.papers && typeof h.papers === 'object' ? h.papers : {},
      meta: merge(b.meta, h.meta),
      streams: (Array.isArray(h.streams) ? h.streams : []).map(stream),
      costs: (Array.isArray(h.costs) ? h.costs : []).map(cost),
      rails: (Array.isArray(h.rails) ? h.rails : []).map(rail),
      play: (Array.isArray(h.play) ? h.play : []).map(play),
      house: merge(b.house, h.house)
    };
    out.house.people = (Array.isArray(out.house.people) ? out.house.people : []).map(person);
    out.house.protocol = merge(b.house.protocol, out.house.protocol);
    if (!out.you.filingStatus || !FILING.some(function (f) { return f.id === out.you.filingStatus; })) out.you.filingStatus = null;
    return out;
  }

  /* A row with nothing typed in it is not a row. */
  function rows(list) { return (list || []).filter(function (r) { return Object.keys(r).some(function (k) { return k !== 'id' && k !== 'kind' && k !== 'role' && r[k] !== null && r[k] !== false; }); }); }

  return { VERSION: VERSION, FILING: FILING, ROLES: ROLES, ACCOUNTS: ACCOUNTS, RISKS: RISKS, blank: blank, normalise: normalise,
    stream: stream, cost: cost, rail: rail, person: person, play: play, rows: rows, n: n };
});
