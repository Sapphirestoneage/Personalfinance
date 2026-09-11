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

   Money is written in dollars to the cent (1234.56) from integer cents,
   never through a float formula; rates as a percent number (24.99).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), LedgerRows: require('./ledger-rows.js'), Doors: require('./doors.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, LedgerRows: S.LedgerRows, Doors: S.Doors };
  }
  var api = factory(deps.Money, deps.Schema, deps.LedgerRows, deps.Doors);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.CsvExport = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, LedgerRows, Doors) {
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
  return { rows: rows, files: files, csv: csv, parse: parse, readme: readme, zip: zip, crc32: crc32, dollars: dollars, COLUMNS: COLUMNS, UNIT_WORDS: UNIT_WORDS };
});
