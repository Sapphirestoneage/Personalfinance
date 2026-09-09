/* ==========================================================================
   shared/scenarios.js — pinned ways through, beside the household, not in it.
   --------------------------------------------------------------------------
   A scenario is a URL's worth of state and a label: "House Hack, crash and
   job loss, low returns". It is not a fact about the household, so it never
   joins the profile, the export or a share link; it lives under its own key
   and a future branching timeline reads it from here. Capped at ten: the
   oldest drops, the caller shows a toast with Undo, and restore() puts it
   back. localStorage throws in some privacy modes; a memory fallback keeps
   the visit working. DECISIONS.md D-176.

     all()                       newest first
     pin({ room, label, query }) → { item, dropped }  (dropped: the one that fell off, or null)
     remove(id)                  → the removed item, or null
     restore(item)               put a dropped one back (drops the newest over the cap instead)
     onChange(fn)                subscribe; returns an unsubscribe
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Scenarios = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var KEY = 'slaf.scenarios.v1';
  var CAP = 10;
  var memory = null;
  var listeners = [];
  function isNumber(v) { return typeof v === 'number' && isFinite(v); }
  /* Newest last: by time, then by the order pinned within the same millisecond. */
  function byAge(a, b) { return (a.createdAt - b.createdAt) || ((a.seq || 0) - (b.seq || 0)); }

  function read() {
    if (memory) return memory;
    var raw = null;
    try { raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; } catch (e) { raw = null; }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    memory = parsed && Array.isArray(parsed.items) ? parsed : { version: 1, items: [], seq: 0 };
    if (!isNumber(memory.seq)) memory.seq = memory.items.length;
    return memory;
  }
  function write() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* memory only */ }
    listeners.slice().forEach(function (fn) { try { fn(all()); } catch (e) { /* a listener must not break the write */ } });
  }
  function all() { return read().items.slice().sort(byAge).reverse(); }
  function newId() { return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

  function pin(fields) {
    var f = fields || {};
    var m = read();
    m.seq = (m.seq || 0) + 1;
    var item = { id: newId(), room: f.room || 'adventure', label: String(f.label || 'A way through'), query: String(f.query || ''), createdAt: Date.now(), seq: m.seq };
    m.items.push(item);
    var dropped = null;
    while (m.items.length > CAP) {
      m.items.sort(byAge);
      dropped = m.items.shift();
    }
    write();
    return { item: item, dropped: dropped };
  }
  function remove(id) {
    var m = read();
    var i = m.items.map(function (x) { return x.id; }).indexOf(id);
    if (i === -1) return null;
    var out = m.items.splice(i, 1)[0];
    write();
    return out;
  }
  /** Put a dropped scenario back. Over the cap, the NEWEST goes instead, which
      is the one whose pin just pushed it out — that is what Undo means here. */
  function restore(item) {
    if (!item || !item.id) return null;
    var m = read();
    if (m.items.some(function (x) { return x.id === item.id; })) return item;
    m.items.push(item);
    var pushedOut = null;
    while (m.items.length > CAP) {
      m.items.sort(byAge);
      pushedOut = m.items.pop();
    }
    write();
    return { item: item, pushedOut: pushedOut };
  }
  function onChange(fn) {
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
  }
  /** Tests only. */
  function reset() { memory = { version: 1, items: [], seq: 0 }; write(); }

  return { KEY: KEY, CAP: CAP, all: all, pin: pin, remove: remove, restore: restore, onChange: onChange, reset: reset };
});
