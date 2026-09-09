/* ==========================================================================
   shared/prefs.js — per-user preferences, outside the household.
   --------------------------------------------------------------------------
   A preference is how THIS person wants things shown: which source a DRAFTT
   band reads, whether framework names appear on a lens card, which sidebar
   groups are open. It is not a fact about the household, so it lives under
   its own key, is never exported with the household and never travels in a
   share link. localStorage throws in some privacy modes; a memory fallback
   keeps the page working for the visit. DECISIONS.md D-173.

     get(key, fallback)    the stored value, or the fallback
     set(key, value)       store (null removes), notify listeners
     all()                 a copy of everything stored
     onChange(fn)          subscribe; returns an unsubscribe
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Prefs = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var KEY = 'slaf.prefs.v1';
  var memory = null;
  var listeners = [];

  function read() {
    if (memory) return memory;
    var raw = null;
    try { raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; } catch (e) { raw = null; }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    memory = (parsed && typeof parsed === 'object') ? parsed : {};
    return memory;
  }
  function write() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* memory only */ }
  }
  function get(key, fallback) {
    var m = read();
    return Object.prototype.hasOwnProperty.call(m, key) && m[key] !== null && m[key] !== undefined ? m[key] : fallback;
  }
  function set(key, value) {
    var m = read();
    if (value === null || value === undefined) delete m[key]; else m[key] = value;
    write();
    listeners.slice().forEach(function (fn) { try { fn(key, value); } catch (e) { /* a listener must not break the write */ } });
    return value;
  }
  function all() { return JSON.parse(JSON.stringify(read())); }
  function onChange(fn) {
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
  }
  /** Tests only: forget everything, including the memory copy. */
  function reset() { memory = {}; write(); }

  return { KEY: KEY, get: get, set: set, all: all, onChange: onChange, reset: reset };
});
