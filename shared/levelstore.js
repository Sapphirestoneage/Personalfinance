/* ==========================================================================
   shared/levelstore.js, the 195 facts no room owns. D-340.
   --------------------------------------------------------------------------
   data/levels.json asks 180 levels' worth of questions. Fifty-seven of the
   facts behind them belong to a room already, and are typed through that
   room's owner (D-324). The rest, one hundred and ninety-five of them, had
   nowhere to be typed at all: the panel said "nowhere to type it yet" and
   the question could not be answered by anybody. docs/SOLAR-SYSTEM.md
   reserved the place for them from the start, `levels.<planet>.<key>`, and
   this is the file that puts them there.

     use(levels)             take data/levels.json (once per page)
     def(levelId, key)       the field as the table declares it, or null
     path(levelId, key)      'levels.<planet>.<key>', the one place it lives
     control(def)            what the screen should draw for that kind
     parse(def, raw)         typed text to a stored value, or null
     read(h, levelId, key)   Money.ok(value) or incomplete, never a zero
     display(h, levelId, key)  the value in words, or ''
     write(levelId, key, v)  through the spine, one undo entry

   THE ONLY WRITER. One owner per fact still holds: these facts are the
   Planets screen's own, no other room reads or writes them, and a fact that
   later earns a room moves out of here with a migration, not a copy.

   Empty is not zero. A blank box writes nothing and clears nothing; a typed
   0 is a figure and is kept. A list is an array of short strings, and an
   empty list means the question has not been answered rather than "none".
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Spine: (function () { try { return require('./spine-v2.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Spine: S.Spine };
  }
  var api = factory(deps.Money, function () {
    if (typeof module === 'object' && module.exports) { try { return require('./spine-v2.js'); } catch (e) { return null; } }
    var g = typeof self !== 'undefined' ? self : null;
    return g && g.SLAF ? g.SLAF.Spine || null : null;
  });
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.LevelStore = api; }
}(typeof self !== 'undefined' ? self : this, function (Money, spine) {
  'use strict';

  var TABLE = null, BY_LEVEL = {};
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function use(levels) {
    TABLE = levels && levels.levels ? levels : null;
    BY_LEVEL = {};
    if (TABLE) TABLE.levels.forEach(function (l) { BY_LEVEL[l.id] = l; });
    return TABLE;
  }
  function table() { return TABLE; }
  function level(levelId) { return BY_LEVEL[levelId] || null; }
  function def(levelId, key) {
    var l = level(levelId);
    if (!l) return null;
    var hit = (l.fields || []).filter(function (f) { return f.key === key; })[0];
    return hit ? Object.assign({}, hit, { planet: l.planet, levelId: l.id }) : null;
  }
  function path(levelId, key) {
    var l = level(levelId);
    return l ? 'levels.' + l.planet + '.' + key : null;
  }

  /* ---- What the screen draws -----------------------------------------------
     One shape per kind in data/levels.json's own fieldKinds list. `choices`
     carries the values the table declares; nothing is invented here, and a
     kind with no control says so rather than pretending. */
  function label(value) {
    var s = String(value === null || value === undefined ? '' : value).replace(/[_-]+/g, ' ').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function control(d) {
    if (!d) return null;
    switch (d.kind) {
      case 'cents':   return { type: 'money', affix: '$', placeholder: 'e.g. 1,200' };
      case 'percent': return { type: 'rate', affix: '%', placeholder: 'e.g. 3' };
      case 'number':  return { type: 'number', affix: '', placeholder: 'e.g. 2' };
      case 'age':     return { type: 'number', affix: 'years old', placeholder: 'e.g. 60' };
      case 'date':    return { type: 'month' };
      case 'yesno':   return { type: 'yesno', choices: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] };
      case 'enum':
      case 'choice':  return { type: 'choices', choices: (d.values || []).map(function (v) { return { value: v, label: label(v) }; }) };
      case 'text':    return { type: 'text', placeholder: 'A few words' };
      case 'list':    return { type: 'list', placeholder: 'Add one, then another' };
      default:        return null;
    }
  }

  /* ---- Typed text to a stored value ----------------------------------------
     The money and rate parsers are the app's own (shared/money.js), so a
     figure typed here reads exactly as it would anywhere else. A blank is
     null: nothing to write, and nothing cleared. */
  function parse(d, raw) {
    if (!d) return null;
    var s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (d.kind === 'yesno') return raw === true || raw === false ? raw : (s === 'true' ? true : s === 'false' ? false : null);
    if (d.kind === 'enum' || d.kind === 'choice') return (d.values || []).indexOf(s) >= 0 ? s : null;
    if (s === '') return null;
    if (d.kind === 'cents') return Money.parseMoney(s);
    if (d.kind === 'percent') return Money.parseRatePercent(s);
    if (d.kind === 'number' || d.kind === 'age') {
      var n = Number(s.replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? null : n;
    }
    if (d.kind === 'date') return /^\d{4}-\d{2}$/.test(s) ? s : null;
    if (d.kind === 'text') return s.slice(0, 280);
    if (d.kind === 'list') return [s.slice(0, 80)];
    return null;
  }

  /* ---- Reading it back -----------------------------------------------------
     A Result like every other reader in the app: ok with the value, or
     incomplete naming the field. A stored 0 is a figure and comes back ok. */
  function raw(h, levelId, key) {
    var l = level(levelId);
    if (!l) return undefined;
    var box = h && h.levels ? h.levels[l.planet] : null;
    return box ? box[key] : undefined;
  }
  function has(v) {
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
  }
  function read(h, levelId, key) {
    var v = raw(h, levelId, key);
    return has(v) ? Money.ok(v) : Money.incomplete('Not answered yet.', [key]);
  }
  function display(h, levelId, key) {
    var d = def(levelId, key);
    var v = raw(h, levelId, key);
    if (!d || !has(v)) return '';
    switch (d.kind) {
      case 'cents':   return Money.formatCents(v);
      case 'percent': return Money.formatRate(v, { decimals: 1 });
      case 'age':     return String(v);
      case 'number':  return String(v);
      case 'yesno':   return v ? 'yes' : 'no';
      case 'enum':
      case 'choice':  return label(v);
      case 'date':    return monthWords(v);
      case 'list':    return (v || []).join(', ');
      default:        return String(v);
    }
  }
  function monthWords(iso) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var i = Number(m[2]) - 1;
    return (MONTHS[i] || m[2]) + ' ' + m[1];
  }

  /* ---- Writing it ----------------------------------------------------------
     Through the spine, so it lands in the same undo stack as every other
     answer and every screen hears about it. A null clears the fact. */
  function write(levelId, key, value, labelText) {
    var S = spine();
    var where = path(levelId, key);
    if (!S || !where) return null;
    if (value === null || value === undefined) { S.set(where, undefined, labelText || null); return null; }
    return S.set(where, value, labelText || null);
  }
  /* One item in, one item out, for a list. The list is the value; adding is
     not a second field. */
  function addToList(h, levelId, key, item, labelText) {
    var s = String(item === null || item === undefined ? '' : item).trim().slice(0, 80);
    if (!s) return null;
    var cur = raw(h, levelId, key);
    var list = Array.isArray(cur) ? cur.slice() : [];
    if (list.indexOf(s) >= 0) return list;
    list.push(s);
    write(levelId, key, list, labelText);
    return list;
  }
  function removeFromList(h, levelId, key, item, labelText) {
    var cur = raw(h, levelId, key);
    var list = (Array.isArray(cur) ? cur : []).filter(function (s) { return s !== item; });
    write(levelId, key, list.length ? list : null, labelText);
    return list;
  }

  /** Every field this file is the home for: the ones data/levels.json asks
      about and no room owns. `owned` is the test the screen already uses. */
  function homeless(isOwned) {
    if (!TABLE) return [];
    var out = [];
    TABLE.levels.forEach(function (l) {
      (l.fields || []).forEach(function (f) {
        if (f.kind === 'confirm') return;
        if (typeof isOwned === 'function' && isOwned(f)) return;
        out.push({ levelId: l.id, planet: l.planet, key: f.key, kind: f.kind, label: f.label });
      });
    });
    return out;
  }

  return {
    use: use, table: table, def: def, path: path, control: control, parse: parse,
    read: read, display: display, write: write, raw: raw, has: has,
    addToList: addToList, removeFromList: removeFromList, homeless: homeless,
    label: label, monthWords: monthWords
  };
}));
