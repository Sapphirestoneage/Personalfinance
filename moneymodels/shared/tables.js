/* ==========================================================================
   moneymodels/shared/tables.js, loads data/*.json. MM-001.
   --------------------------------------------------------------------------
   Browser: Tables.load() -> Promise<{ levels, recipes, plays, demo }>.
   Node:    Tables.loadSync() -> the same object, from disk.
   Every table carries id, version, asOf, source, confidence, confidenceNote.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.MM = root.MM || {}; root.MM.Tables = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var FILES = { levels: 'levels.json', recipes: 'recipes.json', plays: 'plays.json', demo: 'demo.json' };
  function load(base) {
    base = base || 'data/';
    var keys = Object.keys(FILES);
    return Promise.all(keys.map(function (k) {
      return fetch(base + FILES[k]).then(function (r) { if (!r.ok) throw new Error(FILES[k] + ' did not load (' + r.status + ')'); return r.json(); });
    })).then(function (all) { var out = {}; keys.forEach(function (k, i) { out[k] = all[i]; }); return out; });
  }
  function loadSync() {
    var fs = require('fs'), path = require('path'), out = {};
    Object.keys(FILES).forEach(function (k) { out[k] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', FILES[k]), 'utf8')); });
    return out;
  }
  return { FILES: FILES, load: load, loadSync: loadSync };
});
