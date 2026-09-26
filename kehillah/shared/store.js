/* ==========================================================================
   kehillah/shared/store.js, the one plan this browser holds. KD-002.
   --------------------------------------------------------------------------
   One object under `kehillah.plan.v1`. Never a `slaf.` key: Kehillah is a
   separate app (D-340) and reads nothing of the household in Money Rooms.

   Empty is not zero: every money field starts as null (not entered) and a
   page writes null back when its box is cleared. Money is integer cents.

     Store.KEY               'kehillah.plan.v1'
     Store.empty()           a fresh plan, every field null
     Store.load()            the plan, defaults filled in for any missing branch
     Store.save(plan)        write it (stamps `updated`)
     Store.get(path)         'care.items.top.cents' -> value or null
     Store.set(path, value)  write one path and save; returns the plan
     Store.clear()           forget everything
     Store.isDemo()          true while the example numbers are loaded
     Store.markDemo(flag)
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Store = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var KEY = 'kehillah.plan.v1';

  function empty() {
    return {
      v: 1, demo: false, updated: null,
      year: { lines: {}, savedCents: null },
      tzedakah: { incomeCents: null, base: 'net', rate: 0.10, rateId: 'maaser', gifts: [] },
      protections: { shape: null, status: {}, notes: {} },
      cushion: { monthCents: null, savedCents: null, monthlyCents: null },
      family: { path: null, tries: null, perTryCents: null, onceCents: null, coveredCents: null, savedCents: null, monthlyCents: null, afterward: {} },
      care: { insured: null, deductibleCents: null, oopMaxCents: null, items: {}, hsa: { type: null, soFarCents: null }, savedCents: null, monthlyCents: null, names: {} },
      gemach: { amountCents: null, termMonths: null, cardApr: null, loanApr: null, monthlyCents: null },
      elul: { yearly: {}, monthly: {}, yearlyAt: null, monthlyAt: null }
    };
  }

  function storage() { return typeof localStorage !== 'undefined' ? localStorage : null; }

  /* Fill a loaded plan's missing branches from a fresh one, one level deep
     for objects, so an older shape still opens. */
  function withDefaults(plan) {
    var base = empty();
    if (!plan || typeof plan !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (plan[k] === undefined || plan[k] === null) { plan[k] = base[k]; return; }
      if (typeof base[k] === 'object' && !Array.isArray(base[k]) && typeof plan[k] === 'object') {
        Object.keys(base[k]).forEach(function (j) { if (plan[k][j] === undefined) plan[k][j] = base[k][j]; });
      }
    });
    return plan;
  }

  function load() {
    var s = storage();
    if (!s) return empty();
    try { var raw = s.getItem(KEY); return withDefaults(raw ? JSON.parse(raw) : null); } catch (e) { return empty(); }
  }
  function save(plan) {
    plan.updated = new Date().toISOString();
    var s = storage();
    if (s) s.setItem(KEY, JSON.stringify(plan));
    return plan;
  }
  function get(path, plan) {
    var p = plan || load();
    var v = path.split('.').reduce(function (o, k) { return o && o[k] !== undefined ? o[k] : undefined; }, p);
    return v === undefined ? null : v;
  }
  function set(path, value, plan) {
    var p = plan || load();
    var keys = path.split('.'), o = p;
    for (var i = 0; i < keys.length - 1; i++) { if (o[keys[i]] === undefined || o[keys[i]] === null || typeof o[keys[i]] !== 'object') o[keys[i]] = {}; o = o[keys[i]]; }
    o[keys[keys.length - 1]] = value === undefined ? null : value;
    return save(p);
  }
  function clear() { var s = storage(); if (s) s.removeItem(KEY); }
  function isDemo() { return load().demo === true; }
  function markDemo(flag) { var p = load(); p.demo = !!flag; return save(p); }

  return { KEY: KEY, empty: empty, load: load, save: save, get: get, set: set, clear: clear, isDemo: isDemo, markDemo: markDemo, withDefaults: withDefaults };
});
