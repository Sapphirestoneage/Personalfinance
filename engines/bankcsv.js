/* ==========================================================================
   engines/bankcsv.js — bank CSV import, on-device. DECISIONS.md D-215 (J4).
   --------------------------------------------------------------------------
   A CSV downloaded from a bank or card site, parsed here, nothing sent.
   Columns are mapped once per bank and remembered by the header signature
   (a preference); every row is previewed before anything saves; every
   imported line lands in the expense log as a dated entry with its as-of
   date from the file. Dedupe by date, amount and description, so
   importing the same file twice changes nothing.

     BankCsv.parse(text)                 → { delimiter, headers, rows }
     BankCsv.signature(headers)          the key a bank is remembered by
     BankCsv.guessMap(headers)           → { date, description, amount, debit, credit } column indexes
     BankCsv.entries(parsed, map, h, T)  → preview lines, duplicates marked
     BankCsv.apply(lines, Spine)         writes the new ones, one batch
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Importer: require('../shared/importer.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Importer: root.SLAF && root.SLAF.Importer };
  }
  var api = factory(deps.Money, deps.Schema, deps.Importer);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.BankCsv = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Importer) {
  'use strict';
  function detectDelimiter(head) {
    var c = { ',': (head.match(/,/g) || []).length, ';': (head.match(/;/g) || []).length, '\t': (head.match(/\t/g) || []).length };
    return c[';'] > c[','] && c[';'] >= c['\t'] ? ';' : (c['\t'] > c[','] ? '\t' : ',');
  }
  function splitLine(line, d) {
    var out = [], field = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
      else if (ch === '"') q = true;
      else if (ch === d) { out.push(field); field = ''; }
      else field += ch;
    }
    out.push(field);
    return out.map(function (f) { return f.trim(); });
  }
  function parse(text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return { delimiter: ',', headers: [], rows: [] };
    var d = detectDelimiter(lines[0]);
    var headers = splitLine(lines[0], d);
    var rows = lines.slice(1).map(function (l) { return splitLine(l, d); }).filter(function (r) { return r.some(function (c) { return c !== ''; }); });
    return { delimiter: d, headers: headers, rows: rows };
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim(); }
  function signature(headers) { return (headers || []).map(norm).join('|'); }
  var WORDS = {
    date: ['posted date', 'transaction date', 'booking date', 'trans date', 'date'],
    description: ['description', 'payee', 'details', 'memo', 'narrative', 'text', 'merchant', 'name'],
    amount: ['amount', 'amount usd', 'transaction amount'],
    debit: ['debit', 'withdrawal', 'withdrawals', 'money out', 'out', 'paid out', 'charge'],
    credit: ['credit', 'deposit', 'deposits', 'money in', 'in', 'paid in', 'payment']
  };
  function guessMap(headers) {
    var hs = (headers || []).map(norm);
    var map = { date: -1, description: -1, amount: -1, debit: -1, credit: -1 };
    Object.keys(WORDS).forEach(function (k) {
      for (var w = 0; w < WORDS[k].length && map[k] === -1; w++) {
        for (var i = 0; i < hs.length; i++) { if (hs[i] === WORDS[k][w] || hs[i].indexOf(WORDS[k][w]) === 0) { if (Object.keys(map).every(function (o) { return map[o] !== i; })) { map[k] = i; break; } } }
      }
    });
    return map;
  }
  /* Dates: ISO, US month/day/year, and day.month.year; anything else is
     left blank and the line is shown as needing a date, never guessed. */
  function parseDate(s) {
    var t = String(s || '').trim(), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return null;
  }
  function cents(s) {
    var t = String(s || '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    if (t === '' || t === '-') return null;
    var n = Number(t);
    return isNaN(n) ? null : Math.round(n * 100);
  }
  function descKey(s) { return norm(s).replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim(); }
  function key(e) { return e.date + '|' + e.cents + '|' + descKey(e.description); }
  function categoryOf(description, amountCents, tables) {
    if (!Importer || !tables) return 'other';
    var r = Importer.classify(description + ' ' + (Math.abs(amountCents) / 100).toFixed(2), tables).rows[0];
    return r && r.kind === 'expense' && r.sub ? r.sub : 'other';
  }
  function entries(parsed, map, household, tables) {
    var h = household || {};
    var existing = {};
    ((h.expenses || {}).entries || []).forEach(function (e) {
      if (e && e.date && Money.isEntered(e.amountCents)) existing[e.date + '|' + e.amountCents + '|' + descKey(e.descriptor || '')] = true;
    });
    var seen = {};
    return (parsed.rows || []).map(function (r, i) {
      var date = map.date >= 0 ? parseDate(r[map.date]) : null;
      var desc = map.description >= 0 ? r[map.description] : '';
      var amt = null;
      if (map.amount >= 0) amt = cents(r[map.amount]);
      else {
        var d = map.debit >= 0 ? cents(r[map.debit]) : null, c = map.credit >= 0 ? cents(r[map.credit]) : null;
        if (d !== null && d !== 0) amt = -Math.abs(d); else if (c !== null && c !== 0) amt = Math.abs(c);
      }
      var kind = amt === null ? 'skip' : amt < 0 ? 'expense' : 'deposit';
      var spend = kind === 'expense' ? Math.abs(amt) : null;
      var line = { i: i, date: date, description: desc, cents: spend, signed: amt, kind: kind, categoryId: kind === 'expense' ? categoryOf(desc, spend, tables) : null, duplicate: false, why: null };
      if (!date) { line.kind = 'skip'; line.why = 'no date I can read'; }
      else if (amt === null) line.why = 'no amount';
      else if (kind === 'deposit') line.why = 'money in; the log holds spending';
      if (line.kind === 'expense') {
        var k = key({ date: date, cents: spend, description: desc });
        if (existing[k] || seen[k]) { line.duplicate = true; line.why = existing[k] ? 'already in the log' : 'listed twice in the file'; }
        seen[k] = true;
      }
      return line;
    });
  }
  function apply(lines, Spine) {
    var take = (lines || []).filter(function (l) { return l.kind === 'expense' && !l.duplicate; });
    if (!Spine) throw new Error('BankCsv.apply needs the spine');
    Spine.batch('Imported ' + take.length + ' bank line' + (take.length === 1 ? '' : 's'), function () {
      take.forEach(function (l) {
        Spine.upsertExpenseEntry(Schema.createExpenseEntry({ categoryId: l.categoryId || 'other', amountCents: l.cents, period: 'once', date: l.date, dateKind: 'exact', descriptor: l.description, source: 'log', categorizedBy: 'bank-csv' }));
      });
    });
    return take.length;
  }
  return { parse: parse, signature: signature, guessMap: guessMap, parseDate: parseDate, cents: cents, entries: entries, apply: apply, key: key, descKey: descKey };
});
