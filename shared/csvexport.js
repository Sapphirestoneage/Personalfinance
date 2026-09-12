/* ==========================================================================
   shared/csvexport.js — the spreadsheet export. DECISIONS.md D-210 (J1).
   --------------------------------------------------------------------------
   Mint-proof: the app cannot be taken away. Beside the JSON backup, every
   row the Ledger holds as one CSV per DAITE door (D, A, I, T, E, you), one
   line per item for a repeat row, plus a README naming every column and
   its unit, all in one zip. Every number matches the app to the cent,
   a blank stays blank, "not sure yet" is words, never $0.

     CsvExport.rows(h, tables)       every line: { door, id, label, item,
                                     value, unit, state, asOf, source, level }
     CsvExport.files(h, tables)      { 'D.csv': text, ..., 'README.txt': text }
     CsvExport.zip(files)            a Uint8Array: store-only zip, CRC-32
     CsvExport.csv(rows)             one CSV text from lines
     CsvExport.parse(text)           back to rows (for the tests)
     CsvExport.single(h, tables)     every line as ONE CSV text (D-220)
     CsvExport.plan(text, h, tables) what importing a CSV would change: one
                                     entry a line, matched to its row by id or
                                     label and its item by name, the value read
                                     back by the row's unit, against what is held
     CsvExport.apply(plan, Spine)    write the changes through their owners in
                                     one undo batch. A blank cell on the way in
                                     leaves the row as it is, never a zero.

   Money is written in dollars to the cent (1234.56) from integer cents,
   never through a float formula; rates as a percent number (24.99).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), LedgerRows: require('./ledger-rows.js'), Doors: require('./doors.js'),
      Ownership: (function () { try { return require('./ownership.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, LedgerRows: S.LedgerRows, Doors: S.Doors, Ownership: S.Ownership };
  }
  var api = factory(deps.Money, deps.Schema, deps.LedgerRows, deps.Doors, deps.Ownership);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.CsvExport = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, LedgerRows, Doors, Ownership) {
  'use strict';
  var COLUMNS = ['door', 'level', 'row', 'label', 'item', 'value', 'unit', 'state', 'as_of', 'source'];
  var UNIT_WORDS = { cents: 'dollars, to the cent', rate: 'percent (24.99 means 24.99%)', percent: 'percent', months: 'months', years: 'years', count: 'a count', bool: 'yes or no', enum: 'one of the row’s choices', text: 'text', date: 'a date, YYYY-MM-DD', formula: 'match: percent of the first percent of pay' };

  function dollars(cents) {
    var neg = cents < 0 ? '-' : '';
    var c = Math.abs(Math.round(cents));
    var whole = Math.floor(c / 100), frac = c % 100;
    return neg + whole + '.' + (frac < 10 ? '0' : '') + frac;
  }
  function valueText(row, v) {
    if (v === null || v === undefined) return '';
    if (row.unit === 'cents') return dollars(v);
    if (row.unit === 'rate' || (row.unit === 'percent' && row.id !== 'contributionPercent')) return String(Math.round(v * 10000) / 100);
    if (row.unit === 'bool') return v ? 'yes' : 'no';
    if (row.unit === 'formula' && v && typeof v === 'object') return (Money.isEntered(v.matchPercent) ? Math.round(v.matchPercent * 100) : '') + '% of the first ' + (Money.isEntered(v.matchCapPercentOfSalary) ? Math.round(v.matchCapPercentOfSalary * 100) : '') + '%';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function stateWord(st, ns) {
    if (st === 'notSure') return 'not sure yet' + (ns && ns.expectedBy ? ' (by ' + ns.expectedBy + ')' : '');
    return { sure: 'confirmed', roughly: 'roughly', memory: 'from memory', stale: 'needs a look', missing: 'blank', computed: 'worked out' }[st] || st;
  }
  function itemName(it) { return it ? (it.label || it.source || it.type || '') : ''; }
  function has(v) { return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v)); }
  function rows(household, tables) {
    var h = household || {};
    var out = [];
    LedgerRows.rows(h, tables, { filter: 'all' }).forEach(function (r) {
      if (/^prefs\./.test(r.path)) return;
      var meta = r.meta || {};
      if (r.repeat) {
        var items = LedgerRows.items(h, r) || [];
        if (!items.length) { out.push(line(r, null, null, r.status, meta, h)); return; }
        items.forEach(function (it) {
          var v = LedgerRows.itemValue(r, it);
          var ns = Schema.notSure(h, r.id + ':' + it.id);
          var st = has(v) ? (r.status === 'missing' ? 'sure' : r.status) : (ns ? 'notSure' : 'missing');
          out.push(line(r, it, v, st, meta, h, ns));
        });
        return;
      }
      var val = r.kind === 'computed' ? (Money.isOk(r.result) ? r.result.value : null) : (r.entered && Money.isOk(r.result) ? r.result.value : null);
      if (r.unit === 'formula' && typeof val === 'number') { var pp = Schema.primaryPerson(h), src = pp && (pp.incomeSources || [])[0], em = src && src.employerMatch; val = em && Money.isEntered(em.matchPercent) ? em : null; }
      out.push(line(r, null, val, r.status, meta, h, r.notSure));
    });
    return out;
  }
  function line(r, it, v, st, meta, h, ns) {
    return { door: r.door, level: r.level, row: r.id, label: r.label, item: itemName(it), value: valueText(r, v), unit: r.unit, state: stateWord(st, ns),
      as_of: st === 'missing' || st === 'notSure' ? '' : (meta.asOf ? String(meta.asOf).slice(0, 10) : ''), source: st === 'missing' || st === 'notSure' ? '' : (meta.source || '') };
  }
  function cell(s) {
    var t = String(s === null || s === undefined ? '' : s);
    /* A cell starting with = + - @ is a formula to a spreadsheet: prefix it. */
    if (/^[=+\-@]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = '\'' + t;
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function csv(list) {
    return [COLUMNS.join(',')].concat(list.map(function (l) { return COLUMNS.map(function (c) { return cell(l[c]); }).join(','); })).join('\r\n') + '\r\n';
  }
  function parse(text) {
    var out = [], row = [], field = '', q = false, i = 0, s = String(text || '');
    while (i < s.length) {
      var ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(field); out.push(row); row = []; field = ''; }
      else field += ch;
      i++;
    }
    if (field !== '' || row.length) { row.push(field); out.push(row); }
    var head = out.shift() || [];
    return out.filter(function (r) { return r.length === head.length; }).map(function (r) { var o = {}; head.forEach(function (k, j) { o[k] = r[j]; }); return o; });
  }
  function readme(h, tables) {
    var lines = ['Money Rooms spreadsheet export', 'Made ' + Schema.localDay() + ' by Money Rooms v' + Schema.APP_VERSION + (Schema.BUILD ? ' build ' + Schema.BUILD : ''), '',
      'One file per door: D.csv (debt), A.csv (assets), I.csv (income), T.csv (taxes), E.csv (expenses), you.csv (the household).',
      'A row that is one line per item (each debt, account, source, yearly cost) has one line per item, named in the item column.', '',
      'Columns:',
      '  door    D, A, I, T, E or you',
      '  level   1 how much, 2 where it sits, 3 what it is made of, 4 what it costs and where it came from',
      '  row     the row id, the same id the app uses everywhere',
      '  label   the row in words',
      '  item    the debt, account, source or line this value belongs to; empty for a household-wide row',
      '  value   the number. Blank means not entered: never zero. Units are in the unit column.',
      '  unit    ' + Object.keys(UNIT_WORDS).map(function (k) { return k + ' = ' + UNIT_WORDS[k]; }).join('; '),
      '  state   confirmed, roughly, from memory, needs a look, not sure yet (with the month expected), blank, or worked out (a computed row)',
      '  as_of   the day the value was last entered or confirmed',
      '  source  how it arrived: typed, pasted, imported, screenshot, migrated, block-default, quote, suggested, memory', '',
      'Money is in dollars to the cent, written from the app’s integer cents; nothing was rounded.',
      'A worked-out row is what the app computes from the others at the moment of export; it is not stored.', '',
      'The full backup (every key this browser holds) is the JSON file from Your Data; this export is for spreadsheets and for reading without the app.'];
    return lines.join('\n') + '\n';
  }
  function files(household, tables) {
    var all = rows(household, tables);
    var out = {};
    Doors.DOORS.forEach(function (d) { out[d.id + '.csv'] = csv(all.filter(function (l) { return l.door === d.id; })); });
    out['README.txt'] = readme(household, tables);
    return out;
  }

  /* ---- A store-only zip (no compression), enough for any spreadsheet ---- */
  var CRC_TABLE = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, 'utf8'));
  }
  function le16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function le32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
  function dosDate(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }
  function zip(fileMap, now) {
    var d = now || new Date();
    var parts = [], central = [], offset = 0;
    Object.keys(fileMap).forEach(function (name) {
      var data = utf8(fileMap[name]), nm = utf8(name), crc = crc32(data);
      var head = [].concat([0x50, 0x4B, 0x03, 0x04], le16(20), le16(0x0800), le16(0), le16(dosTime(d)), le16(dosDate(d)), le32(crc), le32(data.length), le32(data.length), le16(nm.length), le16(0));
      parts.push(new Uint8Array(head), nm, data);
      central.push(new Uint8Array([].concat([0x50, 0x4B, 0x01, 0x02], le16(20), le16(20), le16(0x0800), le16(0), le16(dosTime(d)), le16(dosDate(d)), le32(crc), le32(data.length), le32(data.length), le16(nm.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset))), nm);
      offset += head.length + nm.length + data.length;
    });
    var cdSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    var end = new Uint8Array([].concat([0x50, 0x4B, 0x05, 0x06], le16(0), le16(0), le16(central.length / 2), le16(central.length / 2), le32(cdSize), le32(offset), le16(0)));
    var total = offset + cdSize + end.length, out = new Uint8Array(total), pos = 0;
    parts.concat(central, [end]).forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /* ---- One CSV out, and the same CSV back in (D-220) ------------------------ */
  function single(household, tables) { return csv(rows(household, tables)); }
  function filename(day) { return 'money-rooms-' + day + '.csv'; }

  /** The inverse of valueText: the cell as the row's own value, or
      { bad: why } when it cannot be read. '' is null (leave it). */
  function fromText(row, text) {
    var s = String(text === null || text === undefined ? '' : text).trim().replace(/^'/, '');
    if (s === '') return null;
    var u = row.unit;
    if (u === 'cents') { var m = Money.parseMoney(s); return Money.isEntered(m) ? m : { bad: 'an amount' }; }
    if (u === 'bool') { if (/^(yes|true|y|1)$/i.test(s)) return true; if (/^(no|false|n|0)$/i.test(s)) return false; return { bad: 'yes or no' }; }
    if (u === 'enum') { if (row.values && row.values.indexOf(s) < 0) return { bad: 'one of ' + row.values.join(', ') }; return s; }
    if (u === 'date') { return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : { bad: 'a date, YYYY-MM-DD' }; }
    if (u === 'text') return s;
    if (u === 'formula') {
      var f = /(\d+(?:\.\d+)?)\s*%\s*of the first\s*(\d+(?:\.\d+)?)\s*%/i.exec(s);
      return f ? { matchPercent: Number(f[1]) / 100, matchCapPercentOfSalary: Number(f[2]) / 100 } : { bad: 'a match like 50% of the first 6%' };
    }
    var n = Number(s.replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) return { bad: 'a number' };
    if (u === 'rate' || (u === 'percent' && row.id !== 'contributionPercent')) return Math.round(n * 100) / 10000;   /* 24.99 → 0.2499 */
    return n;
  }
  function norm(x) { return String(x === null || x === undefined ? '' : x).trim().toLowerCase(); }
  function findRow(cellRow, cellLabel) {
    if (cellRow) { var byId = LedgerRows.byId(String(cellRow).trim()); if (byId) return byId; }
    var lab = norm(cellLabel || cellRow);
    if (!lab) return null;
    return LedgerRows.all().filter(function (r) { return norm(r.label) === lab; })[0] || null;
  }
  /**
   * plan(text, household, tables) → { entries, counts }
   *   entries[i]: { n, row, label, item, itemId, unit, text, value, before, status, why }
   *   status: change | same | add (a new item) | covered (a total the item lines set) | skip (blank) | computed | unknown | noItem | noWrite | bad
   */
  /* The line that can bring a new item into being, per repeat kind: the one
     that carries the item's own amount. Other lines for that item follow it. */
  var CREATOR = { assets: 'assetValue', debts: 'debtBalance', incomeSources: 'grossAnnualIncome' };
  /* Start Here's totals are read off the items; a file that carries the
     items line by line covers them, and writing both would double up. */
  var AGGREGATE_OF = { cashSavings: 'assets', investments: 'assets' };
  function categoryFor(label, tables) {
    var kw = tables && tables.importKeywords, lower = norm(label);
    var groups = (kw && kw.asset) || [];
    for (var i = 0; i < groups.length; i++) for (var j = 0; j < (groups[i].words || []).length; j++) if (lower.indexOf(String(groups[i].words[j]).toLowerCase()) > -1) return groups[i].category;
    return 'other';
  }
  function plan(text, household, tables) {
    var h = household || {};
    var lines = parse(text);
    var held = rows(h, tables);
    var writable = Ownership && Ownership.writable ? Ownership.writable() : [];
    var pending = {};   /* repeat kind → { name → true }: items this file will add */
    var itemLines = {};
    lines.forEach(function (l) { var r0 = findRow(l.row, l.label); if (r0 && r0.repeat && norm(l.item)) itemLines[r0.repeat] = true; });
    var entries = lines.map(function (l, i) {
      var out = { n: i + 1, row: null, label: l.label || l.row || '', item: l.item || '', itemId: null, unit: null, text: l.value === undefined ? '' : l.value, value: null, before: '', status: 'unknown', why: null };
      var r = findRow(l.row, l.label);
      if (!r) { out.why = 'no row called that'; return out; }
      out.row = r.id; out.label = r.label; out.unit = r.unit;
      if (r.kind === 'computed' || /^prefs\./.test(r.path)) { out.status = 'computed'; out.why = 'worked out by the app, not typed'; return out; }
      if (writable.indexOf(r.id) < 0) { out.status = 'noWrite'; out.why = 'enter it in its own room'; return out; }
      if (AGGREGATE_OF[r.id] && itemLines[AGGREGATE_OF[r.id]]) { out.status = 'covered'; out.why = 'a total: the file\'s own lines for each account set it'; return out; }
      var it = null;
      if (r.repeat) {
        var items = LedgerRows.items(h, r) || [];
        var want = norm(l.item);
        it = want ? items.filter(function (x) { return norm(itemName(x)) === want; })[0] : (items.length === 1 ? items[0] : null);
        if (!it) {
          if (!want) { out.status = 'noItem'; out.why = 'which one? name the item'; return out; }
          var creator = CREATOR[r.repeat];
          var v0 = fromText(r, l.value);
          if (v0 === null) { out.status = 'skip'; out.why = 'blank: left as it is'; return out; }
          if (v0 && typeof v0 === 'object' && v0.bad) { out.status = 'bad'; out.why = 'expected ' + v0.bad; return out; }
          if (r.id === creator) { pending[r.repeat] = pending[r.repeat] || {}; pending[r.repeat][want] = true; out.status = 'add'; out.why = 'new: will be added'; out.value = v0; out.item = String(l.item).trim(); out.create = { repeat: r.repeat, label: out.item, category: r.repeat === 'assets' ? categoryFor(out.item, tables) : null }; return out; }
          if (pending[r.repeat] && pending[r.repeat][want]) { out.status = 'add'; out.why = 'on the new item above'; out.value = v0; out.item = String(l.item).trim(); out.create = { repeat: r.repeat, label: out.item }; return out; }
          out.status = 'noItem'; out.why = creator ? 'nothing called ' + l.item + ' yet: its ' + (LedgerRows.byId(creator) || {}).label + ' line would add it' : 'nothing called ' + l.item + ' yet: add it in its room first'; return out;
        }
        out.itemId = it.id; out.item = itemName(it);
      }
      var v = fromText(r, l.value);
      if (v === null) { out.status = 'skip'; out.why = 'blank: left as it is'; return out; }
      if (v && typeof v === 'object' && v.bad) { out.status = 'bad'; out.why = 'expected ' + v.bad; return out; }
      out.value = v;
      var current = held.filter(function (x) { return x.row === r.id && (!r.repeat || norm(x.item) === norm(out.item)); })[0];
      out.before = current ? current.value : '';
      out.status = current && current.value === valueText(r, v) ? 'same' : 'change';
      return out;
    });
    var counts = {};
    entries.forEach(function (e) { counts[e.status] = (counts[e.status] || 0) + 1; });
    return { entries: entries, counts: counts };
  }
  /* A new item, from its amount line: the plainest record its room would
     make, named as the file names it. Its other lines write onto it next. */
  function createItem(spec, value, Spine) {
    if (spec.repeat === 'assets') return Spine.upsertAsset(Schema.createAsset({ label: spec.label, category: spec.category || 'other', valueCents: value, liquid: spec.category === 'cash' })).id;
    if (spec.repeat === 'debts') return Spine.upsertDebt(Schema.createDebt({ label: spec.label, balanceCents: value })).id;
    if (spec.repeat === 'incomeSources') { var p = Spine.ensurePrimaryPerson('You'); return Spine.upsertIncomeSource(p.id, Schema.createIncomeSource({ personId: p.id, source: spec.label, grossAnnualIncomeCents: value })).id; }
    return null;
  }
  /** Writes every 'change' entry through its owner, adds every new item, in one undo batch. */
  function apply(planned, Spine) {
    if (!Ownership || !Ownership.write) throw new Error('CsvExport.apply needs shared/ownership.js');
    var todo = (planned.entries || []).filter(function (e) { return e.status === 'change' || e.status === 'add'; });
    var made = {};
    var run = function () {
      todo.forEach(function (e) {
        var itemId = e.itemId;
        if (e.status === 'add') {
          var key = e.create.repeat + ':' + norm(e.create.label);
          if (!made[key]) { made[key] = createItem(e.create, e.value, Spine); if (e.row === CREATOR[e.create.repeat]) return; }
          itemId = made[key];
          if (!itemId) return;
        }
        Ownership.write(e.row, e.value, itemId ? { itemId: itemId } : null);
      });
    };
    if (Spine && typeof Spine.batch === 'function') Spine.batch('CSV import: ' + todo.length + ' line' + (todo.length === 1 ? '' : 's'), run); else run();
    return todo.length;
  }

  return { rows: rows, files: files, csv: csv, parse: parse, readme: readme, zip: zip, crc32: crc32, dollars: dollars, COLUMNS: COLUMNS, UNIT_WORDS: UNIT_WORDS,
    single: single, filename: filename, fromText: fromText, plan: plan, apply: apply, valueText: valueText };
});
