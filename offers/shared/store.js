/* ==========================================================================
   offers/shared/store.js, the one offer this browser holds. OD-001.
   --------------------------------------------------------------------------
   Everything the Offer Builder keeps lives under two keys of its own:

     offers.offer.v1   { version, answers, confirmed, meta }
     offers.prefs.v1   small screen preferences

   Never a slaf.* key: this app is a lane beside SPARKS (D-339 pattern) and
   reads nothing of the household. Empty is not zero: setting '' or
   undefined removes the answer, and a missing key reads as null, never 0.
   Money is integer cents; the screens convert at the edge.

     OfferStore.load()            the offer (created empty on first read)
     OfferStore.answers()         the answers map, a copy
     OfferStore.get(key)          one answer, or null
     OfferStore.set(key, value)   write one answer (null clears it)
     OfferStore.setMany(map)
     OfferStore.confirm(levelId) / unconfirm(levelId) / confirmed()
     OfferStore.loadDemo(demo)    example numbers, marked as such
     OfferStore.isDemo()
     OfferStore.reset()           a blank offer
     OfferStore.exportJson() / importJson(text)
     OfferStore.onChange(fn)      called after every write in this tab
     OfferStore.pref(key[, value])
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.OFFERS = root.OFFERS || {}; root.OFFERS.Store = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var KEY = 'offers.offer.v1';
  var PREFS = 'offers.prefs.v1';
  var VERSION = 1;
  var listeners = [];

  function storage() {
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof global !== 'undefined' && global.localStorage) return global.localStorage;
    return null;
  }
  function now() { return new Date().toISOString(); }
  function blank() {
    return { version: VERSION, answers: {}, confirmed: {}, meta: { createdAt: now(), updatedAt: null, demo: false } };
  }
  function read() {
    var s = storage(); if (!s) return blank();
    var raw = null;
    try { raw = s.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return blank();
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return blank();
      o.version = VERSION;
      o.answers = o.answers && typeof o.answers === 'object' ? o.answers : {};
      o.confirmed = o.confirmed && typeof o.confirmed === 'object' ? o.confirmed : {};
      o.meta = o.meta && typeof o.meta === 'object' ? o.meta : { createdAt: now(), updatedAt: null, demo: false };
      return o;
    } catch (e) { return blank(); }
  }
  function write(o) {
    var s = storage(); if (!s) return o;
    o.meta.updatedAt = now();
    try { s.setItem(KEY, JSON.stringify(o)); } catch (e) { /* full or blocked: the screen still shows the value it has */ }
    listeners.forEach(function (fn) { try { fn(o); } catch (e) { /* one listener never stops the rest */ } });
    return o;
  }

  /* A value that is nothing: '', undefined, null, an empty list, a list of
     empty rows. Stored as absence. */
  function isNothing(v) {
    if (v === null || v === undefined || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    if (typeof v === 'number') return !Number.isFinite(v);
    return false;
  }

  function load() { return read(); }
  function answers() { return JSON.parse(JSON.stringify(read().answers)); }
  function get(key) { var a = read().answers; return Object.prototype.hasOwnProperty.call(a, key) ? a[key] : null; }
  function set(key, value) {
    var o = read();
    if (isNothing(value)) delete o.answers[key]; else o.answers[key] = value;
    return write(o);
  }
  function setMany(map) {
    var o = read();
    Object.keys(map || {}).forEach(function (k) { if (isNothing(map[k])) delete o.answers[k]; else o.answers[k] = map[k]; });
    return write(o);
  }
  function confirm(levelId) { var o = read(); o.confirmed[levelId] = now(); return write(o); }
  function unconfirm(levelId) { var o = read(); delete o.confirmed[levelId]; return write(o); }
  function confirmed() { return JSON.parse(JSON.stringify(read().confirmed)); }

  function loadDemo(demo) {
    var o = blank();
    o.answers = JSON.parse(JSON.stringify((demo && demo.answers) || {}));
    o.confirmed = JSON.parse(JSON.stringify((demo && demo.confirmed) || {}));
    o.meta.demo = true;
    return write(o);
  }
  function isDemo() { return !!read().meta.demo; }
  function reset() { return write(blank()); }

  function exportJson() {
    var o = read();
    return JSON.stringify({ app: 'offers', version: VERSION, exportedAt: now(), offer: o }, null, 2);
  }
  function importJson(text) {
    var p;
    try { p = JSON.parse(text); } catch (e) { throw new Error('That file is not one of ours.'); }
    var o = p && p.app === 'offers' && p.offer ? p.offer : null;
    if (!o || typeof o.answers !== 'object') throw new Error('That file is not an Offer Builder export.');
    var fresh = blank();
    fresh.answers = o.answers || {};
    fresh.confirmed = o.confirmed || {};
    fresh.meta.demo = !!(o.meta && o.meta.demo);
    fresh.meta.createdAt = (o.meta && o.meta.createdAt) || fresh.meta.createdAt;
    return write(fresh);
  }

  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  function pref(key, value) {
    var s = storage(); if (!s) return null;
    var p = {};
    try { p = JSON.parse(s.getItem(PREFS) || '{}') || {}; } catch (e) { p = {}; }
    if (arguments.length < 2) return Object.prototype.hasOwnProperty.call(p, key) ? p[key] : null;
    if (isNothing(value)) delete p[key]; else p[key] = value;
    try { s.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* ignore */ }
    return value;
  }

  return { KEY: KEY, PREFS: PREFS, VERSION: VERSION, isNothing: isNothing,
    load: load, answers: answers, get: get, set: set, setMany: setMany,
    confirm: confirm, unconfirm: unconfirm, confirmed: confirmed,
    loadDemo: loadDemo, isDemo: isDemo, reset: reset,
    exportJson: exportJson, importJson: importJson, onChange: onChange, pref: pref };
});
