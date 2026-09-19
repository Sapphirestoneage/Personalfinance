/* ==========================================================================
   shared/csvexport.js — the spreadsheet export, and the same sheet back in.
   DECISIONS.md D-210 (J1), D-220 (one CSV out and in), D-221 (made resilient).
   --------------------------------------------------------------------------
   Mint-proof: the app cannot be taken away. Beside the JSON backup, every
   row the Ledger holds as one CSV per DAITE door (D, A, I, T, E, you), one
   line per item for a repeat row, plus a README naming every column and
   its unit, all in one zip. Every number matches the app to the cent,
   a blank stays blank, "not sure yet" is words, never $0.

     CsvExport.rows(h, tables)       every line: { door, id, label, item,
                                     value, unit, state, asOf, source, level,
                                     item_id }
     CsvExport.files(h, tables)      { 'D.csv': text, ..., 'README.txt': text }
     CsvExport.zip(files)            a Uint8Array: store-only zip, CRC-32
     CsvExport.csv(rows)             one CSV text from lines
     CsvExport.parse(text)           back to lines, whatever the spreadsheet
                                     did to the file (shared/csv.js)
     CsvExport.single(h, tables)     every line as ONE CSV text (D-220)
     CsvExport.read(row, text)       a cell as the row's own value:
                                     { value, blank, bad, warn }
     CsvExport.plan(text, h, tables) what importing a CSV would change: one
                                     entry a line, matched to its row by id or
                                     label and its item by id or name, the value
                                     read by the row's unit, against what is
                                     held; nothing written
     CsvExport.apply(plan, Spine)    write the changes through their owners in
                                     one undo batch; { applied, added, failed }.
                                     A blank cell on the way in leaves the row
                                     as it is, never a zero.

   Money is written in dollars to the cent (1234.56) from integer cents,
   never through a float formula; rates as a percent number (24.99).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), LedgerRows: require('./ledger-rows.js'), Doors: require('./doors.js'), Csv: require('./csv.js'),
      Xlsx: require('./xlsx.js'), Zipfile: require('./zipfile.js'),
      Ownership: (function () { try { return require('./ownership.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, LedgerRows: S.LedgerRows, Doors: S.Doors, Csv: S.Csv, Xlsx: S.Xlsx, Zipfile: S.Zipfile, Ownership: S.Ownership };
  }
  var api = factory(deps.Money, deps.Schema, deps.LedgerRows, deps.Doors, deps.Csv, deps.Xlsx, deps.Zipfile, deps.Ownership);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.CsvExport = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, LedgerRows, Doors, Csv, Xlsx, Zipfile, Ownership) {
  'use strict';
  var COLUMNS = ['door', 'level', 'row', 'label', 'item', 'value', 'unit', 'state', 'as_of', 'source', 'item_id'];
  var UNIT_WORDS = { cents: 'dollars, to the cent', rate: 'percent (24.99 means 24.99%)', percent: 'percent', months: 'months', years: 'years', count: 'a count', bool: 'yes or no', enum: 'one of the row’s choices', text: 'text', date: 'a date, YYYY-MM-DD', formula: 'match: percent of the first percent of pay' };

  function dollars(cents) {
    var neg = cents < 0 ? '-' : '';
    var c = Math.abs(Math.round(cents));
    var whole = Math.floor(c / 100), frac = c % 100;
    return neg + whole + '.' + (frac < 10 ? '0' : '') + frac;
  }
  function wholePercent(row) { return row.unit === 'percent' && row.id === 'contributionPercent'; }
  function valueText(row, v) {
    if (v === null || v === undefined) return '';
    if (row.unit === 'cents') return dollars(v);
    if (row.unit === 'rate' || (row.unit === 'percent' && !wholePercent(row))) return String(Math.round(v * 10000) / 100);
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
    return { raw: v === undefined ? null : v, kind: r.kind, door: r.door, level: r.level, row: r.id, label: r.label, item: itemName(it), value: valueText(r, v), unit: r.unit, state: stateWord(st, ns),
      as_of: st === 'missing' || st === 'notSure' ? '' : (meta.asOf ? String(meta.asOf).slice(0, 10) : ''), source: st === 'missing' || st === 'notSure' ? '' : (meta.source || ''), item_id: it ? (it.id || '') : '' };
  }
  /* The byte-order mark up front is what makes Excel read the file as UTF-8
     (a plain UTF-8 file shows ’ as three odd characters on Windows). */
  function csv(list) {
    return Csv.BOM + [COLUMNS.join(',')].concat(list.map(function (l) { return COLUMNS.map(function (c) { return Csv.cell(l[c]); }).join(','); })).join('\r\n') + '\r\n';
  }
  /* The columns a sheet may call by another name. */
  var HEADER_ALIASES = {
    row: ['row', 'id', 'row_id', 'field', 'key', 'code'],
    label: ['label', 'name', 'question', 'row_label', 'title', 'what'],
    item: ['item', 'account', 'debt', 'which', 'item_name', 'line', 'for'],
    value: ['value', 'amount', 'new', 'new_value', 'number', 'entered', 'answer'],
    item_id: ['item_id', 'itemid', 'item_key'],
    /* the workbook's own headings (D-222) */
    unit: ['unit', 'in'],
    state: ['state', 'how_sure'],
    as_of: ['as_of', 'last_checked'],
    source: ['source', 'came_from']
  };
  var FRIENDLY = { what_it_is: 'label', which_one: 'item', your_number: 'value', row_id: 'row', item_id: 'item_id' };
  function canonical(key) {
    if (FRIENDLY[key]) return FRIENDLY[key];
    var ks = Object.keys(HEADER_ALIASES);
    for (var i = 0; i < ks.length; i++) if (HEADER_ALIASES[ks[i]].indexOf(key) > -1) return ks[i];
    return key;
  }
  /** Lines as objects under the export's column names, whatever the sheet
      called them, each with _n: its line in the file. */
  function parse(text) {
    return Csv.records(text).map(function (rec) {
      var o = { _n: rec._n };
      Object.keys(rec).forEach(function (k) { if (k === '_n') return; var c = canonical(k); if (!(c in o) || o[c] === '') o[c] = rec[k]; });
      return o;
    });
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
      '  source  how it arrived: typed, pasted, imported, screenshot, migrated, block-default, quote, suggested, memory',
      '  item_id the app\'s own id for the item, so a renamed account still lands on the right one when the file comes back', '',
      'Money is in dollars to the cent, written from the app’s integer cents; nothing was rounded.',
      'A worked-out row is what the app computes from the others at the moment of export; it is not stored.', '',
      'Bringing a file back (Your Data, "Bring a CSV back in"): edit the value column and choose the file. Only row (or label), item and value are read;',
      'the other columns are ignored. Any common way of writing a number, a date, a yes or a choice is understood: $1,234.56 or (1,234.56) or 1.234,56;',
      '24.99 or 24.99% or 0.2499 for a rate; 6/3/2026 or 3 Jun 2026 for a date; yes, y, true or x for yes. A blank, a dash or n/a leaves the row as it is.',
      'Every line is shown, with what it would do, before anything saves; one undo takes the whole import back.', '',
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

  /* One zip writer for the app (shared/zipfile.js): the doors zip and the
     workbook are both zips, so there is one of them, not two. */
  function zip(fileMap, now) { return Zipfile.write(fileMap, now); }
  function crc32(bytes) { return Zipfile.crc32(bytes); }

  /* ---- One CSV out, and the same CSV back in (D-220, D-221) ----------------- */
  function single(household, tables) { return csv(rows(household, tables)); }
  function filename(day) { return 'money-rooms-' + day + '.csv'; }

  /* Words, as a person would type them, without punctuation, case or the
     odd character a wrong encoding leaves behind: "Partner’s share" and
     "Partner�s share" both read "partner s share". */
  function norm(x) { return String(x === null || x === undefined ? '' : x).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function fieldOf(id) { return Ownership && Ownership.field ? Ownership.field(id) : null; }
  function formatOf(id, v) { var f = fieldOf(id); try { return f && typeof f.format === 'function' ? String(f.format(v)) : String(v); } catch (e) { return String(v); } }

  /* The choices of an enum row that the row table leaves open: the schema's
     own lists, and the state table's codes. Words a person might write for
     each come from the owner's format and the schema's labels. */
  function enumChoices(row, tables) {
    var ids = row.values ? row.values.slice() : null;
    var words = {};
    var add = function (id, w) { if (!w) return; words[id] = words[id] || []; String(w).split(/\s*\/\s*/).forEach(function (part) { if (words[id].indexOf(part) < 0) words[id].push(part); }); };
    if (!ids) {
      if (row.id === 'state' && tables && tables.states && tables.states.states) { ids = tables.states.states.map(function (s) { return s.code; }); tables.states.states.forEach(function (s) { add(s.code, s.name); }); }
      else if (row.id === 'employmentStatus') { ids = (Schema.EMPLOYMENT_STATUSES || []).map(function (s) { return s.id; }); (Schema.EMPLOYMENT_STATUSES || []).forEach(function (s) { add(s.id, s.label); add(s.id, s.short); }); }
      else if (row.id === 'filingStatus') { ids = []; Object.keys(Schema.FILING_ALIASES || {}).forEach(function (k) { var id = Schema.FILING_ALIASES[k]; if (ids.indexOf(id) < 0) ids.push(id); add(id, k); }); }
      else if (row.id === 'payCadence') ids = (Schema.PAY_CADENCES || []).slice();
      else if (row.id === 'loanPlan') ids = (Schema.LOAN_PLANS || []).slice();
      else if (row.id === 'splitMode') ids = (Schema.SPLIT_MODES || []).slice();
      else if (row.id === 'healthCover') ids = (Schema.HEALTH_TYPES || []).slice();
      else ids = [];
    }
    /* The owner's own words for a choice, where the owner formats the value
       itself: on a repeat row it formats the count ("2 listed"), not the
       choice, so the id stands as the label there. */
    var pretty = function (id) { var lab = row.repeat ? id : formatOf(row.id, id); return lab && lab !== id ? lab : null; };
    ids.forEach(function (id) { add(id, pretty(id)); });
    return ids.map(function (id) { return { id: id, label: pretty(id) || (words[id] || [])[0] || id, words: [id].concat(words[id] || []) }; });
  }
  function matchChoice(choices, s) {
    var want = norm(s), plain = want.replace(/ /g, '');
    if (!want) return null;
    var hit = choices.filter(function (c) { return c.words.some(function (w) { return norm(w) === want || norm(w).replace(/ /g, '') === plain; }); });
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) return null;
    var starts = choices.filter(function (c) { return c.words.some(function (w) { var n = norm(w); return n.indexOf(want) === 0 || want.indexOf(n) === 0; }); });
    return starts.length === 1 ? starts[0] : null;
  }
  var DAY_OF_MONTH = { nextPayday: true };
  var BIRTH_DATES = { dob: true };
  /* The partner is held by the year they were born, not the day (D-181). */
  var BIRTH_YEAR = { partnerDob: true };
  var LIMITS = { count: 50, months: 1200, years: 120 };
  /**
   * read(row, text, tables) → { value, blank, bad, warn }
   *   value  the row's own value (cents, a fraction, a whole number, a bool,
   *          an enum id, YYYY-MM-DD, the match object); null when blank or bad
   *   blank  nothing to write: '' or a word for nothing (-, n/a, ?)
   *   bad    why the text could not be read, in words for the preview
   *   warn   read, with a reading the person should glance at
   */
  function read(row, text, tables) {
    var s = String(text === null || text === undefined ? '' : text).replace(/^﻿/, '').trim().replace(/^'/, '').trim();
    var out = { value: null, blank: false, bad: null, warn: null };
    var u = row.unit;
    var blank = function () { out.blank = true; return out; };
    var bad = function (why) { out.bad = why; return out; };
    if (s === '') return blank();
    if (u === 'text') {
      if (row.id === 'zip') {
        if (Csv.isBlankWord(s)) return blank();
        var z = s.replace(/\D/g, '');
        if (z.length > 5 && /^\d{5}-?\d{4}$/.test(s)) z = z.slice(0, 5);
        if (z.length === 3 || z.length === 4) { out.warn = 'read as ' + ('00000' + z).slice(-5) + ': a spreadsheet drops the leading zero'; z = ('00000' + z).slice(-5); }
        if (z.length !== 5) return bad('a five-digit ZIP');
        out.value = z; return out;
      }
      out.value = s.slice(0, 80); return out;
    }
    if (u === 'bool') {
      if (Csv.isBlankWord(s) && !/^none$/i.test(s)) return blank();
      if (/^(yes|y|true|t|1|x|✓|✔|checked|on)$/i.test(s)) { out.value = true; return out; }
      if (/^(no|n|false|f|0|none|unchecked|off)$/i.test(s)) { out.value = false; return out; }
      return bad('yes or no');
    }
    if (u === 'enum') {
      if (/^(-{1,3}|—|–|n\/?a|\?+|tbd|not sure|blank|empty|skip|leave)$/i.test(s)) return blank();
      var choices = enumChoices(row, tables);
      /* A choice list the app cannot see (no table loaded): take the text as it is. */
      if (!choices.length) { out.value = row.id === 'state' ? s.toUpperCase().slice(0, 2) : s; return out; }
      var c = matchChoice(choices, s);
      if (!c) return bad('one of ' + choices.map(function (x) { return x.label; }).join(', '));
      out.value = c.id;
      if (norm(c.id) !== norm(s)) out.warn = 'read as ' + c.label;
      return out;
    }
    if (u === 'formula') {
      /* "none" here is an answer, not a blank: there is no match. */
      if (/^(no match|no|none|nothing|0|0%|zero)$/i.test(s)) { out.value = { matchPercent: 0, matchCapPercentOfSalary: 0 }; return out; }
      if (Csv.isBlankWord(s)) return blank();
      var f = /(\d+(?:[.,]\d+)?)\s*%?\D+?(\d+(?:[.,]\d+)?)\s*%?/.exec(s);
      if (!f) return bad('a match like 50% of the first 6%');
      var a = Number(f[1].replace(',', '.')), b = Number(f[2].replace(',', '.'));
      if (a <= 1 && b <= 1 && !/%/.test(s)) { a *= 100; b *= 100; out.warn = 'read as ' + a + '% of the first ' + b + '%'; }
      if (a < 0 || a > 200 || b < 0 || b > 100) return bad('a match like 50% of the first 6%');
      out.value = { matchPercent: Math.round(a * 100) / 10000, matchCapPercentOfSalary: Math.round(b * 100) / 10000 };
      return out;
    }
    if (u === 'date' && DAY_OF_MONTH[row.id]) {
      if (Csv.isBlankWord(s)) return blank();
      var full = Csv.date(s);
      var dm = /^(?:the\s*)?(\d{1,2})(?:st|nd|rd|th|\.)?(?:\s*of\s*(?:the|each|every)\s*month)?$/i.exec(s);
      var day = full ? Number(full.slice(8, 10)) : dm ? Number(dm[1]) : null;
      if (day === null || day < 1 || day > 31) return bad('a day of the month, 1 to 31');
      if (full) out.warn = 'read as the ' + day + (day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th') + ' of each month';
      out.value = day; return out;
    }
    if (u === 'date' && BIRTH_YEAR[row.id]) {
      if (Csv.isBlankWord(s)) return blank();
      var yr = /^(\d{4})$/.test(s) ? s : (Csv.date(s, { partial: true }) || '').slice(0, 4);
      if (!/^\d{4}$/.test(yr)) return bad('a year, like 1990');
      if (Number(yr) > Number(Schema.localDay().slice(0, 4)) || Number(yr) < 1900) return bad('a year between 1900 and now');
      out.value = yr;
      if (yr !== s) out.warn = 'read as the year ' + yr;
      return out;
    }
    if (u === 'date') {
      var d = Csv.date(s, { partial: !!BIRTH_DATES[row.id] });
      if (d === null) return blank();
      if (d === undefined) return bad('a date like 2026-06-03 or 6/3/2026');
      if (BIRTH_DATES[row.id]) {
        if (d > Schema.localDay()) return bad('a date in the past');
        if (/^\d{4}$/.test(s)) out.warn = 'read as July ' + s + ': the month was not given';
        else if (/^\d{4}[-\/. ]\d{1,2}$|^[a-z]+[\s\-,.]*\d{4}$/i.test(s)) out.warn = 'read as the 1st of that month';
      }
      out.value = d; return out;
    }
    /* Numbers: cents, rates and percents, counts, months, years. */
    var n = Csv.number(s, { suffix: u === 'cents' });
    if (n.blank) return blank();
    if (n.bad) return bad(n.bad !== 'a number' ? n.bad : u === 'cents' ? 'an amount like 1,234.56' : u === 'rate' || u === 'percent' ? 'a percent like 24.99' : 'a whole number');
    if (u === 'cents') {
      /* A worked-out row (a net worth) can be below zero; a row a person
         types cannot, and it is never written from here anyway. */
      if (n.value < 0 && row.kind !== 'computed') return bad('an amount of zero or more');
      if (n.value > 1e9) return bad('an amount under a billion dollars: check the units');
      if (n.percent) return bad('an amount in dollars, not a percent');
      out.value = Math.round(n.value * 100);
      if (n.decimals > 2) out.warn = 'rounded to the cent: ' + Money.formatCents(out.value, { exact: true, decimals: 2 });
      return out;
    }
    if (u === 'rate' || u === 'percent') {
      var pct = n.value;
      if (pct < 0) return bad('a percent of zero or more');
      if (pct > 100) return bad('a percent between 0 and 100');
      /* A cell under 1 with no percent sign is read as it is written: 0.5 is
         half a percent. Multiplying by a hundred on a hunch would turn a real
         0.5% rate into 50%, so the reading is literal and the note says how to
         write the other one. */
      if (!n.percent && pct > 0 && pct < 1) out.warn = 'read as ' + pct + '%; write ' + (Math.round(pct * 10000) / 100) + ' or ' + (Math.round(pct * 10000) / 100) + '% if that is what you meant';
      out.value = wholePercent(row) ? Math.round(pct * 100) / 100 : Math.round(pct * 100) / 10000;
      return out;
    }
    var whole = Math.round(n.value);
    if (n.value < 0) return bad('a number of zero or more');
    if (LIMITS[u] && whole > LIMITS[u]) return bad('a number of ' + UNIT_WORDS[u] + ' up to ' + LIMITS[u]);
    if (whole !== n.value) out.warn = 'rounded to ' + whole;
    out.value = whole;
    return out;
  }
  /** The inverse of valueText: the row's own value, null for blank, or
      { bad: why }. Kept for callers of D-220; plan() uses read(). */
  function fromText(row, text, tables) {
    var r = read(row, text, tables);
    if (r.blank) return null;
    if (r.bad) return { bad: r.bad };
    return r.value;
  }
  /** The value as the app will show it, for the preview's "will be" column. */
  function shown(row, v, tables) {
    if (v === null || v === undefined) return '';
    if (row.unit === 'cents') return Money.formatCents(v, { exact: true, decimals: v % 100 ? 2 : 0 });
    if (row.unit === 'rate' || row.unit === 'percent') return valueText(row, v) + '%';
    if (row.unit === 'enum') { var c = enumChoices(row, tables).filter(function (x) { return x.id === v; })[0]; return c ? c.label : String(v); }
    if (row.unit === 'date' && DAY_OF_MONTH[row.id]) return formatOf(row.id, v);
    if (row.unit === 'formula') return valueText(row, v);
    if (row.unit === 'months' || row.unit === 'years') return v + ' ' + row.unit;
    return valueText(row, v);
  }

  /* ---- Finding the row a line means ---------------------------------------- */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function rowIndex() {
    var byId = {}, byWords = {}, all = LedgerRows.all();
    all.forEach(function (r) {
      byId[r.id.toLowerCase()] = r;
      (r.aliases || []).forEach(function (a) { byId[String(a).toLowerCase()] = r; });
      var names = [r.label];
      var f = fieldOf(r.id); if (f && f.label) names.push(f.label);
      names.forEach(function (nm) { var k = norm(nm); if (k && !byWords[k]) byWords[k] = r; });
    });
    return { all: all, byId: byId, byWords: byWords };
  }
  /** { row, how } where how is 'id', 'label', 'near' (a close label, worth a
      glance) or null with a suggestion in `near` when nothing matches. */
  function findRow(idx, cellRow, cellLabel) {
    var id = String(cellRow === null || cellRow === undefined ? '' : cellRow).trim();
    if (id && idx.byId[id.toLowerCase()]) return { row: idx.byId[id.toLowerCase()], how: 'id' };
    var texts = [cellLabel, cellRow].map(norm).filter(Boolean);
    for (var t = 0; t < texts.length; t++) if (idx.byWords[texts[t]]) return { row: idx.byWords[texts[t]], how: 'label' };
    var want = texts[0];
    if (!want) return { row: null, how: null, near: null };
    /* The words of one label inside the other, whole ("Filing" in "Filing
       status", "Total balance" around "Balance"), and only one row fits. */
    var within = Object.keys(idx.byWords).filter(function (k) {
      var a = ' ' + k + ' ', b = ' ' + want + ' ';
      return (want.length >= 4 && a.indexOf(b) > -1) || (k.length >= 5 && b.indexOf(a) > -1);
    });
    if (within.length === 1) return { row: idx.byWords[within[0]], how: 'near' };
    /* Or every word of the line's label is in one row's label ("rent a month"). */
    var toks = want.split(' ').filter(function (t) { return t.length > 1; });
    if (toks.length >= 2) {
      var allIn = Object.keys(idx.byWords).filter(function (k) { var kt = k.split(' '); return toks.every(function (t) { return kt.indexOf(t) > -1; }); });
      if (allIn.length === 1) return { row: idx.byWords[allIn[0]], how: 'near' };
    }
    var best = null, bestScore = Infinity;
    Object.keys(idx.byWords).forEach(function (k) {
      var score = levenshtein(want, k);
      if (score < bestScore) { bestScore = score; best = k; }
    });
    /* A letter or two off (a typo) reads as the row, and says so; a little
       further off is only a suggestion; further still is no row at all. */
    if (best && bestScore <= Math.max(1, Math.floor(want.length / 5))) return { row: idx.byWords[best], how: 'near' };
    return { row: null, how: null, near: best && bestScore <= Math.max(2, Math.floor(want.length / 4)) ? idx.byWords[best].label : null };
  }

  /* The line that can bring a new item into being, per repeat kind: the one
     that carries the item's own amount. Other lines for that item follow it,
     wherever they sit in the file. */
  var CREATOR = { assets: 'assetValue', debts: 'debtBalance', incomeSources: 'grossAnnualIncome', annualLines: 'annualLine' };
  /* Start Here's totals are read off the items; a file whose account lines
     change or add something covers them, and writing both would double up. */
  var AGGREGATE_OF = { cashSavings: 'assets', investments: 'assets' };
  function categoryFor(label, tables) {
    var kw = tables && tables.importKeywords, lower = norm(label);
    var groups = (kw && kw.asset) || [];
    for (var i = 0; i < groups.length; i++) for (var j = 0; j < (groups[i].words || []).length; j++) if (lower.indexOf(String(groups[i].words[j]).toLowerCase()) > -1) return groups[i].category;
    return 'other';
  }
  var BANK_WORDS = /^(date|posted_date|transaction_date|description|payee|memo|amount|debit|credit|withdrawal|deposit|balance|details)$/;
  /**
   * plan(text, household, tables) → { entries, counts, problems, headers, delimiter, problem }
   *   entries[i]: { n, line, row, label, item, itemId, unit, text, value, before, after, status, why, warn, room, create }
   *   status: change | same | add (a new item) | covered (a total the item lines set) | skip (blank)
   *           | computed | pref | unknown | noItem | ambiguous | duplicate | noWrite | bad
   *   problem: 'noHeader' (no row, label or value column), 'bank' (a bank statement), 'empty'
   */
  function plan(text, household, tables) {
    if (!LedgerRows.all().length) throw new Error('The row table did not load; try again');
    var h = household || {};
    var table = Csv.parse(text);
    var keys = table.headers.map(function (k) { return canonical(Csv.headerKey(k)); });
    var hasValue = keys.indexOf('value') > -1, hasRow = keys.indexOf('row') > -1 || keys.indexOf('label') > -1;
    var out = { entries: [], counts: {}, problems: 0, headers: table.headers, delimiter: table.delimiter, problem: null };
    if (!table.headers.length) { out.problem = 'empty'; return out; }
    if (!hasValue || !hasRow) {
      var bankish = table.headers.map(Csv.headerKey).filter(function (k) { return BANK_WORDS.test(k); }).length >= 2;
      out.problem = bankish ? 'bank' : 'noHeader';
      return out;
    }
    var lines = parse(text).filter(function (l) { return norm(l.row) || norm(l.label) || norm(l.value) || norm(l.item); });
    var held = rows(h, tables);
    var heldById = {}, heldByName = {};
    held.forEach(function (x) { if (x.item_id) heldById[x.row + '#' + x.item_id] = x; heldByName[x.row + '|' + norm(x.item)] = x; });
    var writable = Ownership && Ownership.writable ? Ownership.writable() : [];
    var idx = rowIndex();

    /* Pass 1: the row and, for a repeat row, the item each line means. */
    var pre = lines.map(function (l, i) {
      var found = findRow(idx, l.row, l.label);
      var r = found.row;
      var e = { n: i + 1, line: l.sheet_row || l._n, row: r ? r.id : null, label: r ? r.label : (l.label || l.row || ''), item: l.item || '', itemId: null, unit: r ? r.unit : null, text: l.value === undefined ? '' : l.value, value: null, before: '', after: '', status: 'unknown', why: null, warn: null, room: r && fieldOf(r.id) ? fieldOf(r.id).owner : null, create: null };
      if (!r) { e.why = 'no row called that' + (found.near ? '; did you mean "' + found.near + '"?' : ''); return { e: e, r: null, l: l }; }
      if (found.how === 'near') e.warn = 'read as the row "' + r.label + '"';
      var want = norm(l.item), it = null, dup = false;
      if (r.repeat) {
        var items = LedgerRows.items(h, r) || [];
        var wantId = String(l.item_id || '').trim();
        if (wantId) it = items.filter(function (x) { return x.id === wantId; })[0] || null;
        if (!it && want) {
          var hits = items.filter(function (x) { return norm(itemName(x)) === want; });
          if (hits.length > 1) dup = true; else it = hits[0] || null;
        }
        if (!it && !want && !wantId && items.length === 1) it = items[0];
        if (it) { e.itemId = it.id; if (want && norm(itemName(it)) !== want) e.warn = (e.warn ? e.warn + '; ' : '') + 'named "' + itemName(it) + '" in the app'; e.item = itemName(it); }
        else if (want) e.item = String(l.item).trim();
      }
      return { e: e, r: r, l: l, want: want, it: it, dup: dup };
    });

    /* A line listed twice: the last one counts. */
    var lastOf = {};
    pre.forEach(function (p, i) { if (p.r) lastOf[p.r.id + '|' + (p.e.itemId || p.want || '')] = i; });

    /* New items, from their amount lines, wherever those sit. */
    var creators = {};
    pre.forEach(function (p, i) {
      if (!p.r || !p.r.repeat || p.it || p.dup || !p.want || CREATOR[p.r.repeat] !== p.r.id) return;
      if (lastOf[p.r.id + '|' + p.want] !== i) return;
      var v = read(p.r, p.l.value, tables);
      if (v.blank || v.bad) return;
      creators[p.r.repeat] = creators[p.r.repeat] || {};
      creators[p.r.repeat][p.want] = { repeat: p.r.repeat, label: String(p.l.item).trim(), value: v.value, category: p.r.repeat === 'assets' ? categoryFor(p.l.item, tables) : null };
    });

    /* The kinds this file lists item by item: their own lines are the answer
       for them, whatever a total elsewhere in the file says. */
    var itemLines = {};
    pre.forEach(function (p) { if (p.r && p.r.repeat && p.want) itemLines[p.r.repeat] = true; });

    /* Pass 2: what each line would do. A blank cell asks for nothing, so it
       is decided first: an export nobody edited shows no problems at all. */
    function decide(p, i) {
      var e = p.e, r = p.r, l = p.l;
      if (!r) return e;
      var v = read(r, l.value, tables);
      if (v.blank) { e.status = 'skip'; e.why = 'blank: left as it is'; return e; }
      if (/^prefs\./.test(r.path)) { e.status = 'pref'; e.why = 'a setting: change it in Settings'; return e; }
      if (r.kind === 'computed') { e.status = 'computed'; e.why = 'worked out by the app from other rows'; return e; }
      if (writable.indexOf(r.id) < 0) { e.status = 'noWrite'; e.why = 'enter it in its own room'; return e; }
      if (lastOf[r.id + '|' + (e.itemId || p.want || '')] !== i) { e.status = 'duplicate'; e.why = 'listed twice: the last one counts'; return e; }
      if (p.dup) { e.status = 'ambiguous'; e.why = 'two items are called "' + e.item + '": rename one in its room, or use the item_id column'; return e; }
      if (v.bad) { e.status = 'bad'; e.why = 'expected ' + v.bad; return e; }
      e.value = v.value; e.after = shown(r, v.value, tables);
      if (v.warn) e.warn = (e.warn ? e.warn + '; ' : '') + v.warn;
      if (r.repeat && !p.it) {
        if (!p.want) { e.status = 'noItem'; e.why = 'which one? name the item'; return e; }
        var made = creators[r.repeat] && creators[r.repeat][p.want];
        if (made) { e.status = 'add'; e.create = made; e.why = r.id === CREATOR[r.repeat] ? 'new: will be added' + (made.category ? ', as ' + made.category : '') : 'on the new item, from its ' + (LedgerRows.byId(CREATOR[r.repeat]) || {}).label + ' line'; return e; }
        var creator = CREATOR[r.repeat];
        e.status = 'noItem';
        e.why = !creator ? 'nothing called "' + e.item + '" yet: add it in its room first' : r.id === creator ? 'nothing called "' + e.item + '" yet' : 'nothing called "' + e.item + '" yet: a ' + (LedgerRows.byId(creator) || {}).label + ' line with an amount would add it';
        return e;
      }
      var current = e.itemId ? heldById[r.id + '#' + e.itemId] : heldByName[r.id + '|' + norm(e.item)];
      e.before = current ? current.value : '';
      /* Already so: nothing to write, and nothing worth a note about how it
         was read. */
      if (current && current.value === valueText(r, v.value)) { e.status = 'same'; e.warn = null; return e; }
      e.status = 'change';
      if (r.unit === 'cents' && current && current.value) {
        var b = Math.round(Number(current.value) * 100);
        if (b > 0 && v.value === b * 100) e.warn = (e.warn ? e.warn + '; ' : '') + '100 times what is held: cents by mistake?';
        else if (b > 0 && v.value * 100 === b) e.warn = (e.warn ? e.warn + '; ' : '') + 'a hundredth of what is held: check the units';
      }
      return e;
    }
    var entries = pre.map(function (p, i) {
      var e = decide(p, i);
      /* A total (Start Here's cash, its investments) is read off the accounts.
         When the file lists the accounts themselves, they are the answer: the
         total line is left alone, and a total that disagrees with them says so
         instead of winning now and being undone by the next import. */
      if (p.r && AGGREGATE_OF[p.r.id] && itemLines[AGGREGATE_OF[p.r.id]] && (e.status === 'change' || e.status === 'same')) {
        e.status = 'covered';
        e.why = e.before !== '' && e.before !== valueText(p.r, e.value)
          ? 'a total, worked out from the account lines; this says ' + e.after + ', which they do not come to'
          : 'a total: the file\'s own lines for each account set it';
      }
      return e;
    });
    var counts = {}, problems = 0, conflicts = 0;
    entries.forEach(function (e) {
      counts[e.status] = (counts[e.status] || 0) + 1;
      if (PROBLEM[e.status]) problems++;
      if (e.status === 'covered' && /do not come to/.test(e.why || '')) conflicts++;
    });
    out.entries = entries; out.counts = counts; out.problems = problems; out.conflicts = conflicts; out.tables = tables;
    if (!entries.length) out.problem = 'empty';
    return out;
  }
  var PROBLEM = { unknown: true, noItem: true, ambiguous: true, bad: true, noWrite: true };
  /** A short signature of what a plan would write, to tell a stale preview. */
  function signature(planned) {
    return (planned && planned.entries || []).filter(function (e) { return e.status === 'change' || e.status === 'add'; }).map(function (e) { return e.row + '|' + (e.itemId || norm(e.item)) + '|' + JSON.stringify(e.value); }).join('\n');
  }
  /* A new item, from its amount line: the plainest record its room would
     make, named as the file names it. Its other lines write onto it next. */
  function createItem(spec, Spine) {
    if (spec.repeat === 'assets') return Spine.upsertAsset(Schema.createAsset({ label: spec.label, category: spec.category || 'other', valueCents: spec.value, liquid: spec.category === 'cash' })).id;
    if (spec.repeat === 'debts') return Spine.upsertDebt(Schema.createDebt({ label: spec.label, balanceCents: spec.value })).id;
    if (spec.repeat === 'incomeSources') { var p = Spine.ensurePrimaryPerson('You'); return Spine.upsertIncomeSource(p.id, Schema.createIncomeSource({ personId: p.id, source: spec.label, grossAnnualIncomeCents: spec.value })).id; }
    if (spec.repeat === 'annualLines') return Spine.upsertAnnualLine(Schema.createAnnualLine({ label: spec.label, amountCents: spec.value })).id;
    return null;
  }
  /**
   * apply(plan, Spine) → { applied, added, failed, notKept, total }
   * Every 'change' and 'add' line, each through its owner, in one undo batch.
   * A line whose owner refuses it is reported, and the rest still land. So is
   * a line the app did not keep: a row it does not ask as things stand (the
   * employer match, once the sheet says you are self-employed) takes a value
   * and drops it, and saying so beats showing it as a change for ever.
   */
  function apply(planned, Spine) {
    if (!Ownership || !Ownership.write) throw new Error('CsvExport.apply needs shared/ownership.js');
    var todo = (planned && planned.entries || []).filter(function (e) { return e.status === 'change' || e.status === 'add'; });
    var made = {}, failed = [], applied = 0, added = 0;
    /* Every value says it came from a file, not from typing (15.1, D-181),
       so the Ledger and Refresh can tell the two apart later. */
    var tag = function () { if (Spine && typeof Spine.tagWrite === 'function') Spine.tagWrite({ source: 'imported', confidence: 'sure' }); };
    var run = function () {
      todo.forEach(function (e) {
        try {
          var itemId = e.itemId;
          if (e.status === 'add') {
            var key = e.create.repeat + ':' + norm(e.create.label);
            if (!(key in made)) { tag(); made[key] = createItem(e.create, Spine) || null; if (made[key]) added++; }
            itemId = made[key];
            if (!itemId) throw new Error('could not add ' + e.create.label);
            if (e.row === CREATOR[e.create.repeat]) { applied++; return; }
          }
          tag();
          Ownership.write(e.row, e.value, itemId ? { itemId: itemId } : null);
          applied++;
        } catch (err) { failed.push({ n: e.n, line: e.line, label: e.label, item: e.item, why: err && err.message ? err.message : String(err) }); }
      });
    };
    if (Spine && typeof Spine.batch === 'function') Spine.batch('CSV import: ' + todo.length + ' line' + (todo.length === 1 ? '' : 's'), run); else run();
    var notKept = [];
    if (planned && planned.tables && Spine && typeof Spine.getProfile === 'function') {
      var after = {};
      rows(Spine.getProfile(), planned.tables).forEach(function (x) { after[x.row + '|' + norm(x.item)] = x.value; });
      todo.forEach(function (e) {
        if (failed.some(function (f) { return f.n === e.n; })) return;
        var r = LedgerRows.byId(e.row);
        if (!r) return;
        var key = e.row + '|' + norm(e.item);
        if (!(key in after) || after[key] !== valueText(r, e.value)) notKept.push({ n: e.n, line: e.line, label: e.label, item: e.item, why: key in after ? 'the app worked out a different number from the rest' : 'not a question for you as things stand' });
      });
    }
    return { applied: applied, added: added, failed: failed, notKept: notKept, total: todo.length };
  }

  /* ---- A real spreadsheet, not a text file (D-222) --------------------------
     One tab a door, money in money cells, a percent in a percent cell, a date
     in a date cell, the headings in words, and the two ids the app needs to
     put a line back where it came from kept at the end, narrow and grey. */
  var SHEET_COLUMNS = [
    { header: 'What it is', key: 'label', width: 42 },
    { header: 'Which one', key: 'item', width: 22 },
    { header: 'Your number', key: 'value', width: 16 },
    { header: 'In', key: 'unit', width: 12 },
    { header: 'How sure', key: 'state', width: 14 },
    { header: 'Last checked', key: 'as_of', width: 13 },
    { header: 'Came from', key: 'source', width: 12 },
    { header: 'row id', key: 'row', width: 18 },
    { header: 'item id', key: 'item_id', width: 14 }
  ];
  var UNIT_IN = { cents: 'dollars', rate: 'a percent', percent: 'a percent', months: 'months', years: 'years', count: 'a number', bool: 'yes or no', enum: 'a choice', text: 'text', date: 'a date', formula: 'words' };
  /** The value cell for one line: a number where it is a number. */
  function sheetCell(l, tables) {
    var row = LedgerRows.byId(l.row) || { id: l.row, unit: l.unit };
    if (l.raw === null || l.raw === undefined || l.value === '') return '';
    if (l.unit === 'cents') return { v: Math.round(l.raw) / 100, kind: 'money' };
    if (l.unit === 'rate' || l.unit === 'percent') return { v: wholePercent(row) ? l.raw / 100 : l.raw, kind: 'percent' };
    if (l.unit === 'months' || l.unit === 'years' || l.unit === 'count') return { v: l.raw, kind: 'number' };
    if (l.unit === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(l.raw))) return { v: l.raw, kind: 'date' };
    return { v: shown(row, l.raw, tables) || l.value, kind: 'text' };
  }
  function sheetRow(l, tables) {
    return SHEET_COLUMNS.map(function (c) {
      if (c.key === 'value') return sheetCell(l, tables);
      if (c.key === 'unit') return UNIT_IN[l.unit] || l.unit;
      if (c.key === 'row' || c.key === 'item_id') return { v: l[c.key], kind: 'note' };
      return l[c.key];
    });
  }
  /** build(h, tables) → a workbook, one tab a door plus a page of notes. */
  function workbook(household, tables, opts) {
    if (!Xlsx) throw new Error('CsvExport.workbook needs shared/xlsx.js');
    var all = rows(household, tables);
    var sheets = Doors.DOORS.map(function (d) {
      var mine = all.filter(function (l) { return l.door === d.id; });
      return { name: d.label, columns: SHEET_COLUMNS, rows: mine.map(function (l) { return sheetRow(l, tables); }) };
    }).filter(function (s) { return s.rows.length; });
    sheets.push({
      name: 'How to use this',
      columns: [{ header: 'Money Rooms — your numbers, on one sheet a door', width: 110 }],
      rows: readme(household, tables).split('\n').map(function (t) { return [t]; })
    });
    return Xlsx.build(sheets, { title: 'Money Rooms', day: Schema.localDay(), now: opts && opts.now });
  }
  function workbookName(day) { return 'money-rooms-' + day + '.xlsx'; }
  /** The sheets a workbook was read into, as the one text the planner reads. */
  function fromWorkbook(sheets) {
    var head = ['row', 'label', 'item', 'value', 'item_id', 'sheet_row'];
    var out = [head.join(',')];
    (sheets || []).forEach(function (sheet) {
      var body = (sheet.rows || []).slice();
      var header = body.shift() || [];
      var keys = header.map(function (k) { return canonical(Csv.headerKey(k)); });
      if (keys.indexOf('value') < 0 || (keys.indexOf('row') < 0 && keys.indexOf('label') < 0)) return;
      body.forEach(function (cells, i) {
        if (!cells.some(function (c) { return String(c || '').trim() !== ''; })) return;
        var rec = {};
        keys.forEach(function (k, j) { if (k && !(k in rec)) rec[k] = cells[j] === undefined ? '' : cells[j]; });
        rec.sheet_row = sheet.name + ', row ' + (i + 2);
        out.push(head.map(function (k) { return Csv.cell(rec[k] === undefined ? '' : rec[k]); }).join(','));
      });
    });
    return out.join('\r\n') + '\r\n';
  }
  /** A file chosen in Your Data, whatever it is → the text the planner reads. */
  function fromFile(bytes) {
    if (Zipfile && Zipfile.isZip(bytes)) {
      if (!Xlsx) return Promise.reject(new Error('this build cannot read a workbook'));
      return Xlsx.read(bytes).then(function (sheets) { return fromWorkbook(sheets); });
    }
    return Promise.resolve(Zipfile ? Zipfile.text(bytes) : String(bytes));
  }

  return { rows: rows, files: files, csv: csv, parse: parse, readme: readme, zip: zip, crc32: crc32, dollars: dollars, COLUMNS: COLUMNS, UNIT_WORDS: UNIT_WORDS,
    workbook: workbook, workbookName: workbookName, fromWorkbook: fromWorkbook, fromFile: fromFile, SHEET_COLUMNS: SHEET_COLUMNS,
    single: single, filename: filename, read: read, fromText: fromText, shown: shown, plan: plan, apply: apply, signature: signature, valueText: valueText, norm: norm, findRow: findRow, rowIndex: rowIndex, enumChoices: enumChoices, CREATOR: CREATOR };
});
