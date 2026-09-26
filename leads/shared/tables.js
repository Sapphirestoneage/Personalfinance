/* ==========================================================================
   leads/shared/tables.js, the tables the ladder reads. LD-001.
   --------------------------------------------------------------------------
   One table, data/book.json. Same shape as coach/shared/tables.js so the
   tests and the pages load it the same way.

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
  var FILES = { book: 'book.json' };
  function base() {
    var s = typeof document !== 'undefined' && document.querySelector('script[src*="shared/tables.js"]');
    return s ? s.src.replace(/shared\/tables\.js.*$/, 'data/') : 'data/';
  }
  function load() {
    var b = base(), keys = Object.keys(FILES);
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
