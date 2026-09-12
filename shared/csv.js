/* ==========================================================================
   shared/csv.js — the one CSV reader and the one loose number reader.
   DECISIONS.md D-221 (the CSV round trip made resilient).
   --------------------------------------------------------------------------
   Every spreadsheet writes CSV a little differently: Excel adds a byte-order
   mark and, in half the world, uses semicolons; Numbers quotes everything;
   Google Sheets ends lines with a bare newline; an old Mac with a bare
   carriage return; a hand-typed file has ragged rows. One reader takes all
   of them, so the bank box and the sheet box read the same way.

     Csv.parse(text)     → { delimiter, headers, rows, lineOf }   rows are
                           arrays padded to the header's width; all-blank
                           rows and repeated header lines are dropped; cells
                           are trimmed; lineOf[i] is row i's line in the file
     Csv.records(text)   → [{ _n, <headerKey>: cell, ... }]   _n is the line
                           number in the file (the header is line 1)
     Csv.headerKey(s)    'As Of ' → 'as_of'
     Csv.cell(s)         one cell, quoted when it must be, formula-safe
     Csv.number(text)    { value, blank, bad, percent, decimals } from any
                           way a person or a spreadsheet writes a number:
                           $1,234.56  (1,234.56)  1 234,56  1.234,56  24.99%
                           12k  1.2E+06  −5 (unicode minus)  '1234 (Excel text)
                           6 months  1234/mo
     Csv.amount(text)    integer cents, null when blank, undefined when bad
     Csv.date(text)      'YYYY-MM-DD' from ISO, 6/3/2026, 3.6.2026, 3 Jun 2026,
                           June 3, 2026, 3-Jun-26 or an Excel serial; with
                           { partial: true } also 2026-06, Jun 2026 and 1990;
                           null when blank, undefined when bad
     Csv.looksBinary(t)  a zip or workbook, not text
   No dependencies; the same code in the browser and in node.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Csv = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  var BOM = '﻿';
  var DELIMITERS = [',', ';', '\t', '|'];

  function stripBom(s) { return String(s === null || s === undefined ? '' : s).replace(/^﻿/, ''); }
  function headerKey(s) { return stripBom(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  /* The delimiter: the one that appears most on the first line, outside
     quotes; a comma when nothing does. */
  function detectDelimiter(firstLine) {
    var counts = {}, q = false, best = ',', n = 0;
    DELIMITERS.forEach(function (d) { counts[d] = 0; });
    for (var i = 0; i < firstLine.length; i++) {
      var ch = firstLine[i];
      if (ch === '"') q = !q;
      else if (!q && counts.hasOwnProperty(ch)) counts[ch]++;
    }
    DELIMITERS.forEach(function (d) { if (counts[d] > n) { n = counts[d]; best = d; } });
    return best;
  }
  /* The whole text into rows of cells: quotes may hold the delimiter and
     newlines; a doubled quote is one quote; \r\n, \n and \r all end a line. */
  function split(text, d) {
    var out = [], row = [], field = '', q = false, i = 0, s = text;
    while (i < s.length) {
      var ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
      else if (ch === '"' && field.trim() === '') { q = true; field = ''; }
      else if (ch === d) { row.push(field); field = ''; }
      else if (ch === '\r') { row.push(field); out.push(row); row = []; field = ''; if (s[i + 1] === '\n') i++; }
      else if (ch === '\n') { row.push(field); out.push(row); row = []; field = ''; }
      else field += ch;
      i++;
    }
    if (field !== '' || row.length) { row.push(field); out.push(row); }
    return out.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  }
  function firstLine(text) {
    var m = /^[^\r\n]*/.exec(text);
    return m ? m[0] : '';
  }
  function parse(text) {
    var s = stripBom(text);
    /* Excel's "sep=;" hint on line one. */
    var sep = /^sep=(.)\r?\n/i.exec(s);
    var d, skipped = 0;
    if (sep) { d = sep[1]; s = s.slice(sep[0].length); skipped = 1; } else d = detectDelimiter(firstLine(s));
    var all = split(s, d);
    var headers = null, width = 0, sig = '', repeats = false, body = [], lineOf = [];
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      if (!r.some(function (c) { return c !== ''; })) continue;
      if (!headers) {
        headers = r.slice();
        while (headers.length && headers[headers.length - 1] === '') headers.pop();
        width = headers.length;
        sig = headers.map(headerKey).join('|');
        /* One column of numbers has no header worth matching a row against:
           such a row is data, and dropping data is the worse mistake. */
        repeats = width > 1 && /[a-z]/.test(sig);
        continue;
      }
      if (repeats && r.map(headerKey).join('|') === sig) continue;  /* a repeated header, from two files pasted together */
      while (r.length < width) r.push('');
      if (r.length > width) r = r.slice(0, width);
      body.push(r); lineOf.push(i + 1 + skipped);
    }
    return { delimiter: d, headers: headers || [], rows: body, lineOf: lineOf };
  }
  function records(text) {
    var p = parse(text);
    var keys = p.headers.map(headerKey);
    return p.rows.map(function (r, i) {
      var o = { _n: p.lineOf[i] };
      keys.forEach(function (k, j) { if (k && !(k in o)) o[k] = r[j]; });
      return o;
    });
  }
  function cell(s) {
    var t = String(s === null || s === undefined ? '' : s);
    /* A cell starting with = + - @ is a formula to a spreadsheet: prefix it. */
    if (/^[=+\-@]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = '\'' + t;
    return /[",;\t\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function looksBinary(text) {
    var s = String(text || '').slice(0, 4096);
    return s.slice(0, 2) === 'PK' || s.indexOf('\u0000') > -1 || (s.charCodeAt(0) === 0xD0 && s.charCodeAt(1) === 0xCF) || /^%PDF/.test(s) || (s.charCodeAt(0) === 0x1F && s.charCodeAt(1) === 0x8B);
  }

  /* ---- Numbers, any way they come ---------------------------------------- */
  var BLANK_WORDS = /^(-{1,3}|—|–|n\/?a|none|null|nil|\?+|tbd|tba|unknown|not sure|blank|empty|skip|leave)$/i;
  function isBlankWord(s) { return s === '' || BLANK_WORDS.test(s); }
  /**
   * number(text, opts) → { value, blank, bad, percent, decimals, negative }
   *   value     a finite number, or null
   *   blank     nothing there (or a word for nothing: -, n/a, none, ?)
   *   bad       could not be read: a word, a formula, two decimal points
   *   percent   the text carried a % sign
   *   decimals  digits after the decimal point, as written
   *   opts.suffix   read 12k, 1.2m, 2b as thousands, millions, billions
   */
  function number(text, opts) {
    var o = opts || {};
    var raw = String(text === null || text === undefined ? '' : text);
    var trimmed = raw.replace(/^﻿/, '').replace(/^'/, '').trim();
    var s = trimmed.replace(/[   \s]+/g, '');
    var out = { value: null, blank: false, bad: null, percent: false, decimals: 0, negative: false };
    /* A word for nothing may be two words ("not sure"), so it is read before
       the spaces come out. */
    if (isBlankWord(trimmed) || isBlankWord(s)) { out.blank = true; return out; }
    if (/^[=@]/.test(s)) { out.bad = 'a number, not a formula'; return out; }
    s = s.replace(/^\+/, '');
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/^[−–—]/, '-');
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
    if (/^[$€£¥₹]+/.test(s) && /^[$€£¥₹]+-/.test(s)) { neg = !neg; s = s.replace(/^([$€£¥₹]+)-/, '$1'); }   /* $-5 */
    if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }          /* 1234- (some banks) */
    if (/%$/.test(s)) { out.percent = true; s = s.slice(0, -1); }
    if (/^%/.test(s)) { out.percent = true; s = s.slice(1); }
    s = s.replace(/^(usd|us\$|eur|gbp|cad|aud|nzd|chf|jpy|inr|mxn)/i, '').replace(/(usd|eur|gbp|cad|aud|nzd|chf|dollars?|bucks)$/i, '');
    s = s.replace(/^[$€£¥₹]+/, '').replace(/[$€£¥₹]+$/, '');
    if (/%$/.test(s)) { out.percent = true; s = s.slice(0, -1); }
    var mult = 1;
    if (o.suffix) {
      var suf = /^([\d.,]+)([kKmMbB])$/.exec(s);
      if (suf) { s = suf[1]; mult = { k: 1e3, m: 1e6, b: 1e9 }[suf[2].toLowerCase()]; }
    }
    /* Unit words after the number: 6months, 2yrs, 3people, 1234/mo, 5amonth
       (the spaces are already gone). The number is what comes first. */
    var lead = /^([\d.,]+(?:[eE][+-]?\d+)?)(?:[\/a-z].*)?$/i.exec(s);
    if (lead && /[\/a-z]/i.test(s.slice(lead[1].length))) s = lead[1];
    if (s === '' || !/\d/.test(s) || !/^[\d.,]+(?:[eE][+-]?\d+)?$/.test(s)) { out.bad = 'a number'; return out; }
    /* Thousands and decimals: whichever separator comes last is the decimal
       point when both appear; a lone comma before one or two digits is a
       decimal comma; three digits after it is a thousands comma. */
    var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    var plain;
    if (lastDot > -1 && lastComma > -1) {
      plain = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
    } else if (lastComma > -1) {
      var commas = s.split(',').length - 1, tail = s.slice(lastComma + 1).replace(/[eE].*$/, '');
      plain = commas === 1 && tail.length > 0 && tail.length !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (lastDot > -1) {
      var groups = s.split('.');
      /* More than one dot is thousands grouping only when every group after
         the first is exactly three digits: 1.234.567 yes, 1.2.3 no. */
      if (groups.length > 2) {
        if (!groups.slice(1).every(function (g) { return /^\d{3}$/.test(g); })) { out.bad = 'a number'; return out; }
        plain = groups.join('');
      } else plain = s;
    } else plain = s;
    if (!/^\d*\.?\d*(?:[eE][+-]?\d+)?$/.test(plain) || plain === '.' || plain === '') { out.bad = 'a number'; return out; }
    var n = Number(plain);
    if (!isFinite(n)) { out.bad = 'a number'; return out; }
    var dec = /\.(\d+)(?:[eE]|$)/.exec(plain);
    out.decimals = dec ? dec[1].replace(/0+$/, '').length : 0;
    if (/[eE]/.test(plain)) out.decimals = Math.max(0, out.decimals - Number(plain.replace(/^.*[eE]/, '')));
    out.value = (neg ? -n : n) * mult;
    out.negative = neg;
    return out;
  }
  /** Integer cents; null when blank; undefined when unreadable. */
  function amount(text) {
    var r = number(text, { suffix: true });
    if (r.blank) return null;
    if (r.bad || r.value === null) return undefined;
    return Math.round(r.value * 100);
  }

  /* ---- Dates, any way they come ------------------------------------------ */
  var MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function valid(y, m, d) {
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function iso(y, m, d) { return valid(y, m, d) ? y + '-' + pad2(m) + '-' + pad2(d) : undefined; }
  function year4(y) { var n = Number(y); return String(y).length === 2 ? (n <= 49 ? 2000 + n : 1900 + n) : n; }
  /**
   * date(text, opts) → 'YYYY-MM-DD' | null (blank) | undefined (unreadable)
   *   opts.dayFirst   read 3/6/2026 as 3 June (default: month first, unless
   *                   the first number cannot be a month, or the parts are
   *                   joined by dots, the day-first habit)
   *   opts.partial    a bare month or year is allowed; its day (and month)
   *                   are filled in: 2026-06 → 2026-06-01, 1990 → 1990-07-01
   */
  function date(text, opts) {
    var o = opts || {};
    var s = String(text === null || text === undefined ? '' : text).replace(/^﻿/, '').replace(/^'/, '').trim();
    if (isBlankWord(s)) return null;
    var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(s))) {
      var a = +m[1], b = +m[2], y = year4(m[3]);
      var dayFirst = o.dayFirst || a > 12 || s.indexOf('.') > -1;
      return dayFirst ? iso(y, b, a) : iso(y, a, b);
    }
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-]*([a-z]+)[\s\-,.]*(\d{2}|\d{4})$/i.exec(s)) && MONTHS[m[2].toLowerCase()]) return iso(year4(m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
    if ((m = /^([a-z]+)[\s\-.]*(\d{1,2})(?:st|nd|rd|th)?[\s\-,.]+(\d{2}|\d{4})$/i.exec(s)) && MONTHS[m[1].toLowerCase()]) return iso(year4(m[3]), MONTHS[m[1].toLowerCase()], +m[2]);
    if (o.partial) {
      if ((m = /^(\d{4})[-\/. ](\d{1,2})$/.exec(s))) return iso(+m[1], +m[2], 1);
      if ((m = /^(\d{1,2})[-\/. ](\d{4})$/.exec(s))) return iso(+m[2], +m[1], 1);
      if ((m = /^([a-z]+)[\s\-,.]*(\d{4})$/i.exec(s)) && MONTHS[m[1].toLowerCase()]) return iso(+m[2], MONTHS[m[1].toLowerCase()], 1);
      if ((m = /^([a-z]+)[\s\-]*(\d{2})$/i.exec(s)) && MONTHS[m[1].toLowerCase()]) return iso(year4(m[2]), MONTHS[m[1].toLowerCase()], 1);
      if ((m = /^(\d{4})$/.exec(s))) return iso(+m[1], 7, 1);
    }
    /* An Excel serial: days since 1899-12-30. 20000 is 1954; 60000 is 2064. */
    if (/^\d{5}$/.test(s) && +s >= 20000 && +s <= 60000) { var dt = new Date(Date.UTC(1899, 11, 30) + (+s) * 86400000); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
    return undefined;
  }

  return { parse: parse, records: records, headerKey: headerKey, cell: cell, number: number, amount: amount, date: date, looksBinary: looksBinary, isBlankWord: isBlankWord, detectDelimiter: detectDelimiter, BOM: BOM };
});
