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

   Blocks (D-178) live in the same sibling store: a block is a hypothetical
   layered on the real household - a home, a car, a kid - as DAITE deltas
   with dates. It never dissolves into household facts.
     blocks() · blockById(id) · activeBlocks()
     addBlock(fields)            validates every line's path (DAITE only,
                                 rejected at write), labels "<Type> n"
     updateBlock(id, patch)      a line's first estimate is kept forever
     removeBlock(id) / restoreBlock(block)     undoable
     duplicateBlock(id, { replacing })         next label, blank dates
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
    memory = parsed && Array.isArray(parsed.items) ? parsed : { version: 1, items: [], blocks: [], seq: 0 };
    if (!isNumber(memory.seq)) memory.seq = memory.items.length;
    if (!Array.isArray(memory.blocks)) memory.blocks = [];
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
  function reset() { memory = { version: 1, items: [], blocks: [], seq: 0 }; write(); }

  /* ---- Blocks (D-178) ---------------------------------------------------- */
  var TYPES = [
    { id: 'home', label: 'Home' }, { id: 'car', label: 'Car' }, { id: 'kid', label: 'Kid' },
    { id: 'jobchange', label: 'Job change' }, { id: 'sabbatical', label: 'Sabbatical' }, { id: 'geo', label: 'Move' },
    { id: 'hustle', label: 'Side hustle' }, { id: 'inheritance', label: 'Inheritance' }, { id: 'marriage', label: 'Marriage' }
  ];
  var STATUSES = ['considering', 'planned', 'happened'];
  var FAMILIES = ['debt', 'assets', 'income', 'taxes', 'expenses'];
  var KINDS = ['oneoff', 'monthly', 'annual'];
  function typeById(id) { return TYPES.filter(function (t) { return t.id === id; })[0] || null; }

  /** A line is a DAITE delta or it is not a line: anything else is rejected here, at write. */
  function validateLine(line) {
    if (!line || typeof line !== 'object') throw new Error('A block line must be an object.');
    var head = String(line.path || '').split('.')[0].replace(/\[\]$/, '');
    if (FAMILIES.indexOf(head) === -1) throw new Error('Block line path "' + line.path + '" is not under debt / assets / income / taxes / expenses.');
    if (KINDS.indexOf(line.kind) === -1) throw new Error('Block line kind must be oneoff, monthly or annual.');
    if (line.delta !== null && typeof line.delta !== 'number') throw new Error('Block line delta must be a number in cents (or null for a setting).');
    return true;
  }
  function normaliseLine(line, previous) {
    validateLine(line);
    var out = {
      id: line.id || null, label: line.label || line.id || line.path, path: line.path, delta: line.delta, kind: line.kind,
      source: line.source || 'national', confidence: line.confidence || 'convention', note: line.note || '',
      extra: line.extra === undefined ? null : line.extra, real: line.real === true,
      /* The first default is kept forever once the person overwrites delta. */
      estimate: line.estimate !== undefined ? line.estimate : (previous && previous.estimate !== undefined ? previous.estimate : line.delta)
    };
    return out;
  }
  function normaliseDates(dates) {
    return (Array.isArray(dates) ? dates : []).map(function (d) {
      return { start: d && d.start ? String(d.start).slice(0, 7) : null, end: d && d.end ? String(d.end).slice(0, 7) : null };
    }).filter(function (d) { return d.start; });
  }
  function nextLabel(type) {
    var t = typeById(type);
    var base = t ? t.label : String(type || 'Block');
    var m = read();
    var used = m.blocks.filter(function (b) { return b.type === type; }).map(function (b) { var x = /(\d+)$/.exec(b.label || ''); return x ? parseInt(x[1], 10) : 0; });
    return base + ' ' + (used.length ? Math.max.apply(null, used) + 1 : 1);
  }
  function blocks() { return read().blocks.map(function (b) { return JSON.parse(JSON.stringify(b)); }); }
  function blockById(id) { var b = read().blocks.filter(function (x) { return x.id === id; })[0]; return b ? JSON.parse(JSON.stringify(b)) : null; }
  function activeBlocks() { return blocks().filter(function (b) { return b.active !== false; }); }

  function addBlock(fields) {
    var f = fields || {};
    if (!typeById(f.type)) throw new Error('Unknown block type "' + f.type + '".');
    var m = read();
    var block = {
      id: f.id || newId().replace(/^s_/, 'b_'),
      type: f.type,
      label: f.label ? String(f.label) : nextLabel(f.type),
      status: STATUSES.indexOf(f.status) > -1 ? f.status : 'considering',
      active: f.active !== false,
      dates: normaliseDates(f.dates),
      replaces: f.replaces || null,
      answers: f.answers && typeof f.answers === 'object' ? JSON.parse(JSON.stringify(f.answers)) : {},
      lines: (f.lines || []).map(function (l) { return normaliseLine(l); }),
      note: f.note || null,
      createdAt: Date.now()
    };
    m.blocks.push(block);
    write();
    return JSON.parse(JSON.stringify(block));
  }
  function updateBlock(id, patch) {
    var m = read();
    var b = m.blocks.filter(function (x) { return x.id === id; })[0];
    if (!b) return null;
    var p = patch || {};
    if (p.label !== undefined) b.label = String(p.label);
    if (p.status !== undefined && STATUSES.indexOf(p.status) > -1) b.status = p.status;
    if (p.active !== undefined) b.active = !!p.active;
    if (p.dates !== undefined) b.dates = normaliseDates(p.dates);
    if (p.replaces !== undefined) b.replaces = p.replaces || null;
    if (p.answers !== undefined) b.answers = JSON.parse(JSON.stringify(p.answers || {}));
    if (p.note !== undefined) b.note = p.note || null;
    if (p.lines !== undefined) {
      b.lines = (p.lines || []).map(function (l) {
        var prev = b.lines.filter(function (x) { return x.id && x.id === l.id; })[0] || null;
        return normaliseLine(l, prev);
      });
    }
    write();
    return JSON.parse(JSON.stringify(b));
  }
  function removeBlock(id) {
    var m = read();
    var i = m.blocks.map(function (x) { return x.id; }).indexOf(id);
    if (i === -1) return null;
    var out = m.blocks.splice(i, 1)[0];
    write();
    return out;
  }
  function restoreBlock(block) {
    if (!block || !block.id) return null;
    var m = read();
    if (m.blocks.some(function (x) { return x.id === block.id; })) return block;
    m.blocks.push(block);
    write();
    return block;
  }
  /** A copy: the next label number, blank dates, and one question answered
      by the caller - in addition to, or replacing (which sets `replaces`). */
  function duplicateBlock(id, opts) {
    var src = blockById(id);
    if (!src) return null;
    var copy = JSON.parse(JSON.stringify(src));
    delete copy.id; delete copy.createdAt;
    copy.label = nextLabel(src.type);
    copy.dates = [];
    copy.replaces = opts && opts.replacing ? id : null;
    return addBlock(copy);
  }

  return { KEY: KEY, CAP: CAP, all: all, pin: pin, remove: remove, restore: restore, onChange: onChange, reset: reset,
    TYPES: TYPES, STATUSES: STATUSES, FAMILIES: FAMILIES, typeById: typeById, validateLine: validateLine, nextLabel: nextLabel,
    blocks: blocks, blockById: blockById, activeBlocks: activeBlocks, addBlock: addBlock, updateBlock: updateBlock,
    removeBlock: removeBlock, restoreBlock: restoreBlock, duplicateBlock: duplicateBlock };
});
