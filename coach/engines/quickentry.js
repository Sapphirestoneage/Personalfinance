/* ==========================================================================
   coach/engines/quickentry.js, a line of shorthand into entries. CD-005.
   --------------------------------------------------------------------------
   The coach types while the client talks:
       car 450/mo 5.9% 38 left      rent 2100
       401k 38k match 4%            hysa 12.5k
   and this reads the line into a PLAN: which entries it writes, with
   what, and a one-line preview in words. It never writes; the console
   saves the plan (coach/shared/coach.js applyQuick, through fields.js).

   The words live in data/quick_entry.json. The rules:
     - The first word (or words) names the row; a line that names nothing,
       or carries no number, is a NOTE, whole, never a guessed number.
     - An amount with /mo is a month, /yr a year; "12.5k", "$2,100", "1.2m".
     - A rate needs its % sign; a bare number is never read as a rate.
     - One of each: two balances, two payments or two rates on one line are
       ambiguous, and the line is a note.
     - What is left over ("38 left") is kept as a note beside the rows,
       said in the preview, never folded into a figure (a balance is not
       worked back from payments left: the client did not say it).
     - A debt or account of a kind the household already has exactly one of
       is updated, not duplicated; with two or more, a new line is added.

     parse(text, table, household) -> plan
       { kind: 'rows' | 'note' | 'empty', label, preview, add, writes, note, text }
       add     { list: 'debt' | 'asset', fields } when a new line is made
       writes  [{ field, value, ctx, item: 'new' | <id> | null }]
       note    the words kept as a note (null when none)
     tokens(text)   the reading of each word, for the tests
   ========================================================================== */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { Money: require('../shared/money.js') }
    : { Money: root.SLAF && root.SLAF.Money };
  var api = factory(deps.Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.QuickEntry = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  var PERIOD = { '/mo': 'month', '/month': 'month', 'mo': 'month', 'month': 'month', 'monthly': 'month', 'a month': 'month', 'per month': 'month',
                 '/yr': 'year', '/year': 'year', 'yr': 'year', 'year': 'year', 'yearly': 'year', 'a year': 'year', 'per year': 'year', 'annual': 'year', 'annually': 'year',
                 '/wk': 'week', '/week': 'week', 'weekly': 'week', 'a week': 'week' };

  /* '5.9' percent as the fraction 0.059, without the float's tail. */
  function pct(s) { return Number((Number(s) / 100).toFixed(8)); }
  function clean(text) { return String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ').trim(); }

  /* Amount words into cents, exactly: "12.5k" is 1,250,000 cents. */
  function amountCents(num, suffix) {
    var s = String(num).replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var parts = s.split('.');
    var whole = parseInt(parts[0], 10);
    var frac = parts[1] || '';
    var scale = suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : 1;
    /* cents = (whole + frac) * scale * 100, done in integers */
    var digits = frac.length;
    var fracInt = digits ? parseInt(frac, 10) : 0;
    var num100 = (whole * Math.pow(10, digits) + fracInt) * scale * 100;
    var den = Math.pow(10, digits);
    if (num100 % den !== 0) return null;           /* finer than a cent: not a sum of money */
    var cents = num100 / den;
    return Number.isSafeInteger(cents) ? cents : null;
  }

  /* Read the words after the row's name, one token at a time. */
  function tokens(rest) {
    var words = clean(rest).toLowerCase().split(' ').filter(Boolean);
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var two = i + 1 < words.length ? w + ' ' + words[i + 1] : null;
      var m;
      if ((m = /^(\d+(?:\.\d+)?)%$/.exec(w))) { out.push({ t: 'rate', value: pct(m[1]), raw: w }); continue; }
      if ((m = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k|m)?(\/[a-z]+)?$/.exec(w))) {
        var cents = amountCents(m[1] + (m[2] || ''), m[3] || null);
        var period = m[4] ? (PERIOD[m[4]] || 'unknown') : null;
        if (!period && two && PERIOD[words[i + 1]]) { period = PERIOD[words[i + 1]]; i++; }
        else if (!period && i + 2 < words.length && PERIOD[words[i + 1] + ' ' + words[i + 2]]) { period = PERIOD[words[i + 1] + ' ' + words[i + 2]]; i += 2; }
        /* "38 left", "38 payments left", "38 months left" */
        var nextW = words[i + 1], after = words[i + 2];
        if (!m[3] && !m[4] && !m[2] && !period && (nextW === 'left' || ((nextW === 'payments' || nextW === 'months') && after === 'left'))) {
          var n = parseInt(m[1].replace(/,/g, ''), 10);
          out.push({ t: 'left', value: n, raw: w + ' ' + (nextW === 'left' ? 'left' : nextW + ' left') });
          i += nextW === 'left' ? 1 : 2;
          continue;
        }
        if (cents === null) { out.push({ t: 'word', raw: w }); continue; }
        out.push({ t: 'amount', cents: cents, period: period, raw: w });
        continue;
      }
      if (w === 'match') {
        var r1 = words[i + 1] && /^(\d+(?:\.\d+)?)%$/.exec(words[i + 1]);
        if (r1) {
          var joiner = words[i + 2], r2 = words[i + 3] && /^(\d+(?:\.\d+)?)%$/.exec(words[i + 3]);
          if ((joiner === 'of' || joiner === 'up' && words[i + 3] === 'to') && (r2 || (joiner === 'up' && words[i + 4] && /^(\d+(?:\.\d+)?)%$/.test(words[i + 4])))) {
            var capWord = joiner === 'of' ? words[i + 3] : words[i + 4];
            out.push({ t: 'match', matchPercent: pct(r1[1]), capPercent: pct(capWord.replace('%', '')), raw: words.slice(i, i + (joiner === 'of' ? 4 : 5)).join(' ') });
            i += joiner === 'of' ? 3 : 4;
          } else {
            /* "match 4%": dollar for dollar up to 4% of pay, said so in the preview. */
            out.push({ t: 'match', matchPercent: 1, capPercent: pct(r1[1]), raw: 'match ' + words[i + 1] });
            i += 1;
          }
          continue;
        }
      }
      out.push({ t: 'word', raw: w });
    }
    return out;
  }

  function entriesOf(table) {
    var list = [];
    ((table && table.entries) || []).forEach(function (e) { (e.words || []).forEach(function (w) { list.push({ word: String(w).toLowerCase(), entry: e }); }); });
    return list.sort(function (a, b) { return b.word.length - a.word.length; });
  }
  function nameOf(text, table) {
    var lower = clean(text).toLowerCase();
    var list = entriesOf(table);
    for (var i = 0; i < list.length; i++) {
      var w = list[i].word;
      if (lower === w || lower.indexOf(w + ' ') === 0) return { entry: list[i].entry, rest: clean(text).slice(w.length) };
    }
    return null;
  }

  function money(c) { return Money.formatCents(c); }
  function rate(r) { var s = (Math.round(r * 10000) / 100).toString(); return s + '%'; }

  function note(text, why) {
    var t = clean(text);
    return { kind: t ? 'note' : 'empty', label: 'A note', preview: t ? 'Not a row I know' + (why ? ' (' + why + ')' : '') + ': saved as a note on this stop. Enter to save.' : '', add: null, writes: [], note: t || null, text: t };
  }

  function existing(household, entry) {
    var h = household || {};
    if (entry.kind === 'debt') return (h.debts || []).filter(function (d) { return d.type === entry.type; });
    if (entry.kind === 'asset') return (h.assets || []).filter(function (a) { return a.accountType === entry.accountType; });
    return [];
  }

  function parse(text, table, household) {
    var t = clean(text);
    if (!t) return note('');
    var named = nameOf(t, table);
    if (!named) return note(t, 'no row starts with that word');
    var e = named.entry;
    var toks = tokens(named.rest);
    var amounts = toks.filter(function (x) { return x.t === 'amount'; });
    var rates = toks.filter(function (x) { return x.t === 'rate'; });
    var matches = toks.filter(function (x) { return x.t === 'match'; });
    var lefts = toks.filter(function (x) { return x.t === 'left'; });
    var words = toks.filter(function (x) { return x.t === 'word'; });
    if (!amounts.length && !rates.length && !matches.length) return note(t, 'no number in it');
    if (amounts.some(function (a) { return a.period === 'unknown' || a.period === 'week'; })) return note(t, 'a period I will not convert');

    var leftover = lefts.map(function (l) { return l.value + ' payments left'; }).concat(words.length ? [words.map(function (w) { return w.raw; }).join(' ')] : []);
    var writes = [], bits = [], add = null;
    var have = existing(household, e);
    var item = have.length === 1 ? have[0].id : 'new';

    if (e.kind === 'debt') {
      var monthly = amounts.filter(function (a) { return a.period === 'month'; });
      var bare = amounts.filter(function (a) { return a.period === null; });
      if (monthly.length > 1 || bare.length > 1 || rates.length > 1 || matches.length || amounts.some(function (a) { return a.period === 'year'; })) return note(t, 'more than one of a kind, or a figure a debt does not have');
      if (bare.length) { writes.push({ field: 'debtBalance', value: bare[0].cents }); bits.push(money(bare[0].cents) + ' owed'); }
      if (monthly.length) { writes.push({ field: 'debtMinPayment', value: monthly[0].cents }); bits.push(money(monthly[0].cents) + ' a month'); }
      if (rates.length) { writes.push({ field: 'debtRate', value: rates[0].value }); bits.push(rate(rates[0].value)); }
      if (item === 'new') add = { list: 'debt', fields: { type: e.type, label: e.label } };
    } else if (e.kind === 'asset') {
      var value = amounts.filter(function (a) { return a.period === null; });
      var flows = amounts.filter(function (a) { return a.period !== null; });
      if (value.length > 1 || rates.length || matches.length > 1) return note(t, 'more than one of a kind, or a rate an account does not have');
      if (value.length) { writes.push({ field: 'assetValue', value: value[0].cents }); bits.push(money(value[0].cents)); }
      flows.forEach(function (f) { leftover.unshift(money(f.cents) + ' a ' + f.period + ' going in'); });
      if (matches.length) {
        var mt = matches[0];
        writes.push({ field: 'employerMatch', value: { matchPercent: mt.matchPercent, matchCapPercentOfSalary: mt.capPercent }, item: null });
        bits.push(mt.matchPercent === 1 ? 'match: dollar for dollar up to ' + rate(mt.capPercent) + ' of pay' : 'match: ' + rate(mt.matchPercent) + ' of the first ' + rate(mt.capPercent) + ' of pay');
      }
      if (!value.length && !matches.length) return note(t, 'no balance in it');
      if (item === 'new' && value.length) add = { list: 'asset', fields: { label: e.label } };
      if (value.length) writes.push({ field: 'assetAccountType', value: e.accountType });
    } else {
      if (amounts.length !== 1 || rates.length || matches.length) return note(t, 'one amount is what that row takes');
      var a = amounts[0];
      var period = a.period || e.period;
      var cents = a.cents;
      var said = money(a.cents) + (a.period ? ' a ' + a.period : '');
      if (period !== e.period) cents = e.period === 'month' ? Math.round(a.cents / 12) : a.cents * 12;
      writes.push({ field: e.row, value: cents });
      bits.push(said + (period !== e.period ? ', ' + money(cents) + ' a ' + e.period : (a.period ? '' : ' a ' + e.period)));
      item = null;
    }
    writes.forEach(function (w) {
      if (w.item === undefined) w.item = (e.kind === 'field') ? null : item;
    });
    var noteText = leftover.length ? e.label + ': ' + leftover.join(', ') : null;
    var label = e.label + (e.kind !== 'field' && item !== 'new' ? ' (updates the one on file)' : '');
    var preview = label + ': ' + bits.concat(leftover).join(', ') + (noteText ? ' (' + (leftover.length === 1 ? 'the last part is' : 'the last ' + leftover.length + ' parts are') + ' kept as a note)' : '') + '. Enter to save.';
    return { kind: 'rows', label: e.label, preview: preview, add: add, writes: writes, note: noteText, text: t, entry: { kind: e.kind, type: e.type || null, accountType: e.accountType || null, row: e.row || null } };
  }

  return { parse: parse, tokens: tokens, amountCents: amountCents };
});
