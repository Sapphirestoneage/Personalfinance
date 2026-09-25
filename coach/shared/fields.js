/* ==========================================================================
   coach/shared/fields.js, where each coach entry lives in a household. CD-003.
   --------------------------------------------------------------------------
   The coach app writes a client's household itself (it owns every one of
   them: no SPARKS room ever reads a coach client). Each field id is the
   SPARKS Ledger row of the same name and lands at the same path SPARKS'
   Ownership writes it to, through the same Schema constructors, so the
   engines read a coach household exactly as they read a SPARKS one.

     read(h, id, itemId)           the stored value, or null (not entered)
     write(h, id, value, itemId)   sets it on h (mutates, returns h); null
                                   clears it. A list field needs itemId.
     addItem(h, list, fields)      a new debt, account or goal; returns its id
     removeItem(h, list, itemId)
     items(h, list)                the lines of a list
     text(id, value)               the value in words, for the page
     parse(id, raw)                what a box typed means: { ok, value } or
                                   { ok: false, why }; '' is null, never 0
     readings(h)                   { id: { label, text } } for every single field
     use(table)                    data/fields.json (labels, units, choices)
   ========================================================================== */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = node ? { Money: require('./money.js'), Schema: require('./schema.js') }
    : { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  var api = factory(deps.Money, deps.Schema);
  if (node) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Fields = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';
  var TABLE = null;
  function use(t) { TABLE = t; }
  function def(id) { return TABLE && TABLE.fields && TABLE.fields[id] ? TABLE.fields[id] : null; }
  function entered(v) { return v !== null && v !== undefined && !(typeof v === 'number' && isNaN(v)); }

  function primary(h) {
    if (!h.people || !h.people.length) h.people = [Schema.createPerson({ label: 'You', role: 'adult' })];
    return h.people[0];
  }
  function source(h, create) {
    var p = primary(h);
    p.incomeSources = p.incomeSources || [];
    if (!p.incomeSources.length && create) p.incomeSources.push(Schema.createIncomeSource({ personId: p.id, source: 'Primary job', type: 'w2' }));
    return p.incomeSources[0] || null;
  }
  var CASH_ID = 'tier0_cash', INVEST_ID = 'tier0_investments';    /* the ids SPARKS gives the one-total accounts */
  function oneTotal(h, categories, canonical, liquid, label, cents) {
    var p = primary(h);
    var a = (h.assets || []).filter(function (x) { return categories.indexOf(x.category) !== -1; })[0];
    if (!a) {
      if (!entered(cents)) return;
      a = Schema.createAsset({ id: canonical === 'cash' ? CASH_ID : INVEST_ID, label: label, category: canonical, liquid: liquid, ownerIds: [p.id] });
      h.assets.push(a);
    }
    a.valueCents = entered(cents) ? Math.round(cents) : null;
  }
  function sumCategory(h, cats) {
    var n = 0, any = false;
    (h.assets || []).forEach(function (a) { if (cats.indexOf(a.category) !== -1 && entered(a.valueCents)) { n += a.valueCents; any = true; } });
    return any ? n : null;
  }
  function cents(v) { return entered(v) ? Math.round(v) : null; }

  var LISTS = {
    debt: { path: 'debts', make: function (f, h) { return Schema.createDebt(Object.assign({ label: 'A debt', type: 'other', ownerIds: [primary(h).id] }, f || {})); } },
    asset: { path: 'assets', make: function (f, h) { return Schema.createAsset(Object.assign({ label: 'An account', category: 'other', ownerIds: [primary(h).id] }, f || {})); } },
    goal: { path: 'goals', make: function (f) { return Schema.createGoal(Object.assign({ name: 'A goal' }, f || {})); } }
  };
  function items(h, list) { return (h[LISTS[list].path] || []); }
  function item(h, list, id) { return items(h, list).filter(function (x) { return x.id === id; })[0] || null; }

  /* id -> [read(h, item), write(h, value, item)] */
  var ACCESS = {
    dob: [function (h) { return h.people && h.people[0] ? h.people[0].dob || null : null; }, function (h, v) { primary(h).dob = v || null; }],
    dependents: [function (h) { return Array.isArray(h.dependents) ? h.dependents.length : null; },
      function (h, v) { h.dependents = entered(v) ? Schema.createDependents(v === 0 ? false : new Array(Math.round(v)).fill(null).map(function () { return {}; })) : null; }],
    grossAnnualIncome: [function (h) { var s = source(h, false); return s ? cents(s.grossAnnualIncomeCents) : null; }, function (h, v) { source(h, true).grossAnnualIncomeCents = cents(v); }],
    takeHomeMonthly: [function (h) { return h.takeHome ? cents(h.takeHome.monthlyCents) : null; }, function (h, v) { h.takeHome = Schema.createTakeHome({ monthlyCents: cents(v), typedCents: cents(v), per: 'month' }); }],
    payVaries: [function (h) { return h.sketch && typeof h.sketch.payVaries === 'boolean' ? h.sketch.payVaries : null; }, function (h, v) { h.sketch = Schema.createSketch(Object.assign({}, h.sketch, { payVaries: typeof v === 'boolean' ? v : null })); }],
    accommodationMonthly: need('accommodation'), foodMonthly: need('food'), transportationMonthly: need('transportation'),
    wantsMonthly: [function (h) { return cents(h.expenses.wants.totalCents); }, function (h, v) { h.expenses.wants.totalCents = cents(v); }],
    hasDebt: [function (h) { return h.meta && typeof h.meta.hasDebt === 'boolean' ? h.meta.hasDebt : null; }, function (h, v) { h.meta.hasDebt = typeof v === 'boolean' ? v : null; }],
    cashSavings: [function (h) { return sumCategory(h, ['cash']); }, function (h, v) { oneTotal(h, ['cash'], 'cash', true, 'Cash and savings', v); }],
    investments: [function (h) { return sumCategory(h, ['investment', 'retirement']); }, function (h, v) { oneTotal(h, ['investment', 'retirement'], 'investment', false, 'Investments and retirement', v); }],
    highestDeductible: ins('highestDeductibleCents'), termLife: ins('termLifeCents'), disabilityMonthly: ins('disabilityMonthlyCents'),
    employerMatch: [function (h) { var s = source(h, false), m = s && s.employerMatch; return m && entered(m.matchPercent) && entered(m.matchCapPercentOfSalary) ? m : null; },
      function (h, v) { source(h, true).employerMatch = v && typeof v === 'object' && entered(v.matchPercent) && entered(v.matchCapPercentOfSalary) ? { matchPercent: v.matchPercent, matchCapPercentOfSalary: v.matchCapPercentOfSalary } : null; }],
    contributionPercent: [function (h) { return h.retirement && entered(h.retirement.contributionPercent) ? h.retirement.contributionPercent : null; }, function (h, v) { h.retirement = Object.assign({}, h.retirement, { contributionPercent: entered(v) ? v : null }); }],
    filingStatus: [function (h) { return h.filingStatus || null; }, function (h, v) { h.filingStatus = Schema.filingStatusOf(v || null); }],
    state: [function (h) { return h.state || null; }, function (h, v) { h.state = v ? String(v).trim().toUpperCase().slice(0, 2) : null; }],
    marginalRate: [function (h) { return entered((h.assumptionOverrides || {}).marginalRate) ? h.assumptionOverrides.marginalRate : null; },
      function (h, v) { h.assumptionOverrides = h.assumptionOverrides || {}; if (entered(v)) h.assumptionOverrides.marginalRate = v; else delete h.assumptionOverrides.marginalRate; }],
    debtLabel: on('debt', 'label', 'text'), debtType: on('debt', 'type', 'text'), debtBalance: on('debt', 'balanceCents', 'cents'),
    debtRate: on('debt', 'rate', 'num'), debtMinPayment: on('debt', 'minPaymentCents', 'cents'),
    assetLabel: on('asset', 'label', 'text'), assetValue: on('asset', 'valueCents', 'cents'),
    assetAccountType: [function (h, it) { return it ? it.accountType || null : null; }, function (h, v, it) { Object.assign(it, Schema.applyAccountType(it, v || null)); }],
    goalName: on('goal', 'name', 'text'), goalDate: on('goal', 'targetDate', 'text'), goalAmount: on('goal', 'lumpTargetCents', 'cents'),
    goalSaved: on('goal', 'savedCents', 'cents'), goalMonthly: on('goal', 'monthlyContributionCents', 'cents')
  };
  function need(k) { return [function (h) { return cents(h.expenses.needs[k].monthlyCents); }, function (h, v) { h.expenses.needs[k].monthlyCents = cents(v); }]; }
  function ins(k) { return [function (h) { return h.insurance ? cents(h.insurance[k]) : null; }, function (h, v) { h.insurance = Schema.createInsurance(Object.assign({}, h.insurance, (function () { var o = {}; o[k] = cents(v); return o; })())); }]; }
  function on(list, key, kind) {
    return [function (h, it) { return it && entered(it[key]) ? it[key] : null; },
      function (h, v, it) { it[key] = kind === 'cents' ? cents(v) : kind === 'text' ? (v ? String(v) : null) : (entered(v) ? v : null); }];
  }

  function listOf(id) { var d = def(id); return d && d.list ? d.list : null; }
  function known(id) { return !!ACCESS[id]; }
  function read(h, id, itemId) {
    var a = ACCESS[id]; if (!a) return null;
    var l = listOf(id);
    if (l) { var it = item(h, l, itemId); return it ? a[0](h, it) : null; }
    return a[0](h);
  }
  /* Writes stamp meta.fields like SPARKS does, so "rough" and "stale"
     read the same way: { asOf, source: 'coach', confidence }. */
  function write(h, id, value, itemId, opts) {
    var a = ACCESS[id]; if (!a) throw new Error('No coach field ' + id);
    var l = listOf(id);
    if (l) {
      var it = item(h, l, itemId);
      if (!it) throw new Error('No such line: ' + itemId);
      a[1](h, value, it);
    } else a[1](h, value);
    h.meta = h.meta || {};
    h.meta.fields = h.meta.fields || {};
    var key = l ? id + ':' + itemId : id;
    if (entered(value)) h.meta.fields[key] = { asOf: (opts && opts.now) || new Date().toISOString(), source: 'coach', confidence: opts && opts.rough ? 'roughly' : 'sure', room: null };
    else delete h.meta.fields[key];
    if (l === 'debt' && entered(value) && h.meta.hasDebt !== true) h.meta.hasDebt = true;
    return h;
  }
  function addItem(h, list, fields) {
    var L = LISTS[list]; if (!L) throw new Error('No such list: ' + list);
    var rec = L.make(fields, h);
    if (list === 'asset' && fields && fields.accountType) Object.assign(rec, Schema.applyAccountType(rec, fields.accountType));
    h[L.path] = (h[L.path] || []).concat([rec]);
    if (list === 'debt') h.meta.hasDebt = true;
    return rec.id;
  }
  function removeItem(h, list, itemId) {
    var L = LISTS[list];
    h[L.path] = (h[L.path] || []).filter(function (x) { return x.id !== itemId; });
    Object.keys((h.meta && h.meta.fields) || {}).forEach(function (k) { if (k.slice(-itemId.length - 1) === ':' + itemId) delete h.meta.fields[k]; });
    return h;
  }

  function pct(v, d) { return entered(v) ? (Math.round(v * Math.pow(10, 2 + d)) / Math.pow(10, d)) + '%' : null; }
  function text(id, v) {
    var d = def(id) || {};
    if (!entered(v)) return null;
    switch (d.unit) {
      case 'cents': return Money.formatCents(v) + (d.per === 'month' ? ' a month' : d.per === 'year' ? ' a year' : '');
      case 'rate': return pct(v, 2);
      case 'bool': return v ? 'Yes' : 'No';
      case 'count': return String(v);
      case 'match': return v.matchPercent === 1 ? 'dollar for dollar up to ' + pct(v.matchCapPercentOfSalary, 2) + ' of pay' : pct(v.matchPercent, 2) + ' of the first ' + pct(v.matchCapPercentOfSalary, 2) + ' of pay';
      case 'enum': { var c = (d.choices || []).filter(function (x) { return x[0] === v; })[0]; return c ? c[1] : String(v); }
      default: return String(v);
    }
  }
  /* What a typed box means. Empty is not zero: '' is null. */
  function parse(id, raw) {
    var d = def(id) || {};
    var s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (s === '') return { ok: true, value: null };
    if (d.unit === 'cents') { var c = Money.parseMoney(s); return entered(c) && isFinite(c) ? { ok: true, value: Math.round(c) } : { ok: false, why: 'not an amount' }; }
    if (d.unit === 'rate') { var n = Number(s.replace('%', '')); return isFinite(n) && n >= 0 && n <= 100 ? { ok: true, value: Number((n / 100).toFixed(8)) } : { ok: false, why: 'a percent, like 5.9' }; }
    if (d.unit === 'count') { var k = Number(s); return Number.isInteger(k) && k >= 0 && k < 30 ? { ok: true, value: k } : { ok: false, why: 'a whole number' }; }
    if (d.unit === 'bool') return { ok: true, value: s === 'yes' || s === 'true' };
    if (d.unit === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { ok: true, value: s } : { ok: false, why: 'a date' };
    return { ok: true, value: s };
  }
  /* Every single field as { label, text }, for the recap's "numbers that
     changed" (the lists are compared line by line there). */
  function readings(h) {
    var out = {};
    Object.keys(ACCESS).forEach(function (id) { var d = def(id); if (!d || d.list) return; out[id] = { label: d.label, text: text(id, read(h, id)) }; });
    return out;
  }
  return { readings: readings, use: use, def: def, known: known, read: read, write: write, addItem: addItem, removeItem: removeItem, items: items, item: item, text: text, parse: parse, listOf: listOf, LISTS: Object.keys(LISTS) };
});
