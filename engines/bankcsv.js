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
     BankCsv.entries(parsed, map, h, T)  → preview lines, duplicates marked;
                                           map.flip = true reads a card
                                           statement, where a charge is
                                           positive (D-306); a merchant rule
                                           on the household beats the keywords
     BankCsv.looksLikeCard(parsed, map)  charges outnumber payments: a card
     BankCsv.apply(lines, Spine)         writes the new ones, one batch
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Importer: require('../shared/importer.js'), Csv: require('../shared/csv.js'), Merchants: require('./merchants.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Importer: root.SLAF && root.SLAF.Importer, Csv: root.SLAF && root.SLAF.Csv, Merchants: root.SLAF && root.SLAF.Merchants };
  }
  var api = factory(deps.Money, deps.Schema, deps.Importer, deps.Csv, deps.Merchants);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.BankCsv = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Importer, Csv, Merchants) {
  'use strict';
  /* One reader for every CSV (shared/csv.js, D-221): the delimiter, the
     byte-order mark, quotes across lines and ragged rows are its job. */
  function parse(text) { var p = Csv.parse(text); return { delimiter: p.delimiter, headers: p.headers, rows: p.rows }; }
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
  /* Dates and amounts, any common way (shared/csv.js); a date that cannot
     be read is left blank and the line is shown as needing one, never guessed. */
  function parseDate(s) { return Csv.date(s) || null; }
  function cents(s) { var c = Csv.amount(s); return c === undefined ? null : c; }
  function descKey(s) { return norm(s).replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim(); }
  function key(e) { return e.date + '|' + e.cents + '|' + descKey(e.description); }
  /* A card statement lists a charge as a positive number and a payment as
     a negative one, the mirror of a bank's. Spending is most of any
     statement, so a one-column file where the amounts above zero outnumber
     the ones below is probably a card (D-306). The person can untick it. */
  function looksLikeCard(parsed, map) {
    if (!parsed || !map || map.amount < 0) return false;
    var pos = 0, neg = 0;
    (parsed.rows || []).forEach(function (r) { var c = cents(r[map.amount]); if (c === null || c === 0) return; if (c < 0) neg++; else pos++; });
    return pos > neg;
  }
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
      if (map.amount >= 0) { amt = cents(r[map.amount]); if (amt !== null && map.flip) amt = -amt; }
      else {
        var d = map.debit >= 0 ? cents(r[map.debit]) : null, c = map.credit >= 0 ? cents(r[map.credit]) : null;
        if (d !== null && d !== 0) amt = -Math.abs(d); else if (c !== null && c !== 0) amt = Math.abs(c);
      }
      var kind = amt === null ? 'skip' : amt < 0 ? 'expense' : 'deposit';
      var spend = kind === 'expense' ? Math.abs(amt) : null;
      var ruled = kind === 'expense' && Merchants ? Merchants.categoryFor(desc, h) : null;
      var line = { i: i, date: date, description: desc, cents: spend, signed: amt, kind: kind, categoryId: kind === 'expense' ? (ruled || categoryOf(desc, spend, tables)) : null, categorizedBy: ruled ? 'rule' : 'bank-csv', duplicate: false, why: null };
      if (!date) { line.kind = 'skip'; line.why = 'no date I can read'; }
      else if (amt === null) line.why = 'no amount';
      else if (kind === 'deposit') line.why = map.flip ? 'a payment or a credit; the log holds spending' : 'money in; the log holds spending';
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
        Spine.upsertExpenseEntry(Schema.createExpenseEntry({ categoryId: l.categoryId || 'other', amountCents: l.cents, period: 'once', date: l.date, dateKind: 'exact', descriptor: l.description, source: 'log', categorizedBy: l.categorizedBy || 'bank-csv' }));
      });
    });
    return take.length;
  }
  return { parse: parse, signature: signature, guessMap: guessMap, looksLikeCard: looksLikeCard, parseDate: parseDate, cents: cents, entries: entries, apply: apply, key: key, descKey: descKey };
});
