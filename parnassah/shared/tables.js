/* ==========================================================================
   parnassah/shared/tables.js, the reference data, loaded once. PN-002.
   --------------------------------------------------------------------------
   Every number that is not the family's own lives in parnassah/data/ as a
   year-versioned file with asOf, confidence, source and confidenceNote.
   Nothing is inlined in an engine or a page.

     Tables.loadSync()            node: every file, parsed
     Tables.load(base)            browser: Promise of the same object
     Tables.FILES                 { key: file }
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Tables = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var FILES = {
    tuition: 'tuition_2026.json',
    year: 'jewish_year_2026.json',
    tzedakah: 'tzedakah_rules.json',
    milestones: 'milestones_2026.json',
    communities: 'communities_2026.json',
    rules: 'rules_2026.json',
    help: 'help.json'
  };
  function loadSync() {
    var fs = require('fs'), path = require('path');
    var T = {};
    Object.keys(FILES).forEach(function (k) { T[k] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', FILES[k]), 'utf8')); });
    return T;
  }
  function load(base) {
    var keys = Object.keys(FILES);
    return Promise.all(keys.map(function (k) {
      return fetch((base || 'data/') + FILES[k], { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error(FILES[k] + ' did not load (' + r.status + ')');
        return r.json();
      });
    })).then(function (list) { var T = {}; keys.forEach(function (k, i) { T[k] = list[i]; }); return T; });
  }
  return { FILES: FILES, loadSync: loadSync, load: load };
});
