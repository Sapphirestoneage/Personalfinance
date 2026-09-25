/* ==========================================================================
   coach/shared/tables.js, the tables the coach app reads. CD-001.
   --------------------------------------------------------------------------
   Every table lives in coach/data/: the coach's own (the path, the entry
   fields, the quick-entry words) and the SPARKS tables its engines read,
   copied byte for byte by coach/tools/vendor.js. One key per file, the key
   SPARKS uses where the table is SPARKS'.

     Tables.FILES        { key: 'file.json' }
     Tables.load()       Promise<{ key: table }>, in the browser
     Tables.loadSync()   the same, in node (tests)
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tables = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var FILES = {
    sessionPaths: 'session_paths.json', coachFields: 'fields.json', quickEntry: 'quick_entry.json',
    effectiveTaxRates: 'effective_tax_rates_2026.json', expenseCategories: 'expense_categories.json', opening: 'opening.json',
    returnBands: 'return_bands.json', levers: 'levers.json', debtRules: 'debt_rules.json', retirementMilestones: 'retirement_milestones.json',
    milestones: 'milestones.json', fooRules: 'foo_rules.json', netWorthPercentiles: 'net_worth_percentiles_scf_2022.json', ratioBenchmarks: 'ratio_benchmarks.json'
  };
  function base() {
    var s = typeof document !== 'undefined' && document.querySelector('script[src*="shared/tables.js"]');
    return s ? s.src.replace(/shared\/tables\.js.*$/, 'data/') : 'data/';
  }
  function load() {
    var b = base();
    var keys = Object.keys(FILES);
    return Promise.all(keys.map(function (k) { return fetch(b + FILES[k]).then(function (r) { if (!r.ok) throw new Error(FILES[k] + ' did not load'); return r.json(); }); }))
      .then(function (list) { var out = {}; keys.forEach(function (k, i) { out[k] = list[i]; }); return out; });
  }
  function loadSync() {
    var fs = require('fs'), path = require('path'), out = {};
    Object.keys(FILES).forEach(function (k) { out[k] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', FILES[k]), 'utf8')); });
    return out;
  }
  return { FILES: FILES, load: load, loadSync: loadSync };
});
