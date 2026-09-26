/* ==========================================================================
   safeword/shared/tables.js, the tables Safeword reads. SF-001.
   --------------------------------------------------------------------------
   Every table lives in safeword/data/: the app's own (stream kinds, cost
   kinds, rails, papers, play, protocol rules, help) and the SPARKS tables
   its vendored engines read, copied byte for byte by tools/vendor.js. One
   key per file, the key SPARKS uses where the table is SPARKS'.

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
    streamKinds: 'stream_kinds.json', costKinds: 'cost_kinds.json', railKinds: 'rail_kinds.json', papers: 'papers.json',
    playKinds: 'play_kinds.json', protocolRules: 'protocol_rules.json', help: 'help.json',
    seTax: 'se_tax_2026.json', federalBrackets: 'federal_brackets_2026.json', stateBrackets: 'state_brackets_2026.json',
    irsLimits: 'irs_limits_2026.json', effectiveTaxRates: 'effective_tax_rates_2026.json'
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
