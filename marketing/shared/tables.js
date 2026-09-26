/* ==========================================================================
   marketing/shared/tables.js, loads data/. MD-001.
   --------------------------------------------------------------------------
     Tables.loadSync()        node: { tables, help } read from disk
     Tables.load()            browser: Promise of the same, fetched
     Tables.byId(list, id)    one row of a table, or null
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.MktTables = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var NAMES = { tables: 'tables.json', help: 'help.json' };
  function loadSync() {
    var fs = require('fs'), path = require('path'), out = {};
    Object.keys(NAMES).forEach(function (k) { out[k] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', NAMES[k]), 'utf8')); });
    return out;
  }
  function load(base) {
    var out = {};
    return Promise.all(Object.keys(NAMES).map(function (k) {
      return fetch((base || 'data/') + NAMES[k]).then(function (r) { if (!r.ok) throw new Error(NAMES[k] + ' did not load'); return r.json(); }).then(function (j) { out[k] = j; });
    })).then(function () { return out; });
  }
  function byId(list, id) { for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i]; return null; }
  return { loadSync: loadSync, load: load, byId: byId };
});
