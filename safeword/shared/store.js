/* ==========================================================================
   safeword/shared/store.js, one household in this browser. SF-002.
   --------------------------------------------------------------------------
   The whole of Safeword's memory: one object under `safeword.household.v1`
   in localStorage. Nothing of SPARKS (`slaf.`), the coach (`coach.`) or the
   game is ever read or written. No account, no server, no cookie.

     Store.load()            the household, normalised; a blank one if none
     Store.save(h)           write it, stamp `meta.updated`, tell listeners
     Store.update(fn)        load, let fn change it, save
     Store.onChange(fn)      called after every save on this page
     Store.useDemo(demo)     replace everything with the example household
     Store.wipe()            forget everything
     Store.exportJson(h)     the text of a backup file
     Store.importJson(text)  a household from a backup file, or an Error
   ========================================================================== */
(function (root, factory) {
  var Model = (typeof module === 'object' && module.exports) ? require('./model.js') : (root.SLAF && root.SLAF.Model);
  var api = factory(Model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Store = api; }
})(typeof self !== 'undefined' ? self : null, function (Model) {
  'use strict';
  var KEY = 'safeword.household.v1';
  var SIGNATURE = 'safewordExport';
  var listeners = [];
  function storage() { return typeof localStorage !== 'undefined' ? localStorage : null; }
  function load() {
    var s = storage(); if (!s) return Model.blank();
    var raw = s.getItem(KEY); if (!raw) return Model.blank();
    try { return Model.normalise(JSON.parse(raw)); } catch (e) { return Model.blank(); }
  }
  function save(h) {
    var out = Model.normalise(h);
    out.meta.updated = new Date().toISOString();
    var s = storage(); if (s) s.setItem(KEY, JSON.stringify(out));
    listeners.forEach(function (fn) { try { fn(out); } catch (e) { /* a listener's error is its own */ } });
    return out;
  }
  function update(fn) { var h = load(); fn(h); return save(h); }
  function onChange(fn) { listeners.push(fn); }
  function useDemo(demo) { var h = Model.normalise(demo); h.meta.demo = true; return save(h); }
  function wipe() { var s = storage(); if (s) s.removeItem(KEY); listeners.forEach(function (fn) { try { fn(Model.blank()); } catch (e) { /* as above */ } }); }
  function exportJson(h) { var out = {}; out[SIGNATURE] = Model.VERSION; out.exported = new Date().toISOString(); out.household = Model.normalise(h); return JSON.stringify(out, null, 2); }
  function importJson(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return new Error('That file is not a Safeword backup.'); }
    if (!parsed || typeof parsed !== 'object' || !parsed[SIGNATURE] || !parsed.household) return new Error('That file is not a Safeword backup.');
    return Model.normalise(parsed.household);
  }
  return { KEY: KEY, SIGNATURE: SIGNATURE, load: load, save: save, update: update, onChange: onChange, useDemo: useDemo, wipe: wipe, exportJson: exportJson, importJson: importJson };
});
