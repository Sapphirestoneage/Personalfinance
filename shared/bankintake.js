/* ==========================================================================
   shared/bankintake.js — one door for a bank or card statement.
   DECISIONS.md D-306 (the widget), D-215 (the import it drives).
   --------------------------------------------------------------------------
   The same intake in Your Data and in Expenses, built once per host: pick
   or drop a CSV, the columns matched once per bank and remembered, a
   switch for a card statement (a charge is a positive number there),
   every line previewed with the category it will file under, lines already
   in the log skipped, then one Import. It reads through engines/bankcsv.js
   and writes through the spine, the way the inline code in Your Data did;
   nothing is sent anywhere.

     BankIntake.mount(host, { onImported(n), room })  → { take(text, name) }
       take(text, name)  hand over a CSV already read as text (the one
                         intake in Your Data sniffs a file and passes a
                         statement here)

   LIVE-FORM: built once. The selects are filled once per file; every later
   change only toggles text and [hidden].
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.BankIntake = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  function g() { return typeof window !== 'undefined' ? window : {}; }
  function S() { return g().SLAF || {}; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var MAP_KEYS = ['date', 'description', 'amount', 'debit', 'credit'];
  var MAP_LABEL = { date: 'Date', description: 'Description', amount: 'Amount', debit: 'Money out', credit: 'Money in' };
  var PREF = 'bankcsv.maps';

  function markup(uid) {
    return ''
      + '<div class="slaf-bank-pick">'
      + '<label class="slaf-btn slaf-btn--primary" for="' + uid + '-file">Choose a bank or card CSV…</label>'
      + '<input type="file" id="' + uid + '-file" accept=".csv,text/csv" hidden/>'
      + '<span class="slaf-hint">Most bank and card sites offer CSV beside PDF. Nothing is uploaded.</span>'
      + '</div>'
      + '<div class="slaf-bank-map" data-bank="map" hidden>'
      + MAP_KEYS.map(function (k) { return '<label class="slaf-hint">' + MAP_LABEL[k] + ' <select data-bank-col="' + k + '" aria-label="' + MAP_LABEL[k] + ' column"></select></label>'; }).join('')
      + '<label class="slaf-bank-flip"><input type="checkbox" data-bank="flip"/> A card statement: a charge is a positive number</label>'
      + '</div>'
      + '<p class="slaf-bank-tally" data-bank="tally" hidden></p>'
      + '<div class="slaf-bank-preview" data-bank="preview"></div>'
      + '<div class="slaf-bank-acts" data-bank="acts" hidden>'
      + '<button type="button" class="slaf-btn slaf-btn--primary" data-bank="import">Import the new lines</button>'
      + '<button type="button" class="slaf-btn slaf-btn--quiet" data-bank="clear">Clear</button>'
      + '</div>'
      + '<p class="slaf-bank-note" data-bank="note" hidden></p>';
  }

  function mount(host, opts) {
    var doc = g().document;
    if (!doc) return null;
    var el = typeof host === 'string' ? doc.querySelector(host) : host;
    if (!el) return null;
    var o = opts || {};
    var uid = 'bank-' + Math.random().toString(36).slice(2, 8);
    el.classList.add('slaf-bank');
    el.innerHTML = markup(uid);
    var q = function (name) { return el.querySelector('[data-bank="' + name + '"]'); };
    var cols = {}; MAP_KEYS.forEach(function (k) { cols[k] = el.querySelector('[data-bank-col="' + k + '"]'); });
    var state = { parsed: null, map: null, lines: [], name: '' };
    var TABLES = null;

    function note(text, cls) { var n = q('note'); n.hidden = !text; n.textContent = text || ''; n.className = 'slaf-bank-note' + (cls ? ' ' + cls : ''); }
    function readMap() {
      var m = {}; MAP_KEYS.forEach(function (k) { m[k] = Number(cols[k].value); });
      m.flip = q('flip').checked;
      return m;
    }
    function fillSelects() {
      var opts = '<option value="-1">none</option>' + state.parsed.headers.map(function (h, i) { return '<option value="' + i + '">' + esc(h) + '</option>'; }).join('');
      MAP_KEYS.forEach(function (k) { cols[k].innerHTML = opts; cols[k].value = String(state.map[k] === undefined ? -1 : state.map[k]); });
      q('flip').checked = !!state.map.flip;
    }
    function catLabel(id) {
      var cats = ((TABLES && TABLES.expenseCategories) || {}).categories || [];
      var c = cats.filter(function (x) { return x.id === id; })[0];
      return c ? c.label : (id || '');
    }
    function preview() {
      if (!state.parsed) return;
      state.map = readMap();
      var B = S().BankCsv, Spine = S().Spine;
      var go = function () {
        state.lines = B.entries(state.parsed, state.map, Spine.getProfile(), TABLES);
        var fresh = state.lines.filter(function (l) { return l.kind === 'expense' && !l.duplicate; });
        var dup = state.lines.filter(function (l) { return l.duplicate; }).length;
        var skip = state.lines.filter(function (l) { return l.kind !== 'expense'; }).length;
        var byRule = fresh.filter(function (l) { return l.categorizedBy === 'rule'; }).length;
        var t = q('tally'); t.hidden = false;
        t.textContent = fresh.length + ' new spending line' + (fresh.length === 1 ? '' : 's')
          + (byRule ? ', ' + byRule + ' filed by your rules' : '')
          + (dup ? ', ' + dup + ' already in the log' : '')
          + (skip ? ', ' + skip + ' left out (' + (state.map.flip ? 'payments, credits' : 'deposits') + ' or no date)' : '') + '.';
        q('preview').innerHTML = '<table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Files under</th><th></th></tr></thead><tbody>'
          + state.lines.slice(0, 200).map(function (l) {
            return '<tr' + (l.kind !== 'expense' || l.duplicate ? ' class="is-out"' : '') + '><td>' + esc(l.date || '?') + '</td><td>' + esc(l.description) + '</td>'
              + '<td class="amt">' + (l.cents !== null ? esc(S().Money.formatCents(l.cents)) : l.signed !== null ? esc(S().Money.formatCents(l.signed)) : '') + '</td>'
              + '<td>' + esc(l.categoryId ? catLabel(l.categoryId) : '') + (l.categorizedBy === 'rule' && l.kind === 'expense' ? ' <small>your rule</small>' : '') + '</td>'
              + '<td class="slaf-hint">' + esc(l.why || '') + '</td></tr>';
          }).join('') + '</tbody></table>' + (state.lines.length > 200 ? '<p class="slaf-hint">Showing the first 200 of ' + state.lines.length + ' lines; every line is read.</p>' : '');
        q('acts').hidden = false;
        q('import').disabled = fresh.length === 0;
        q('import').textContent = fresh.length ? 'Import ' + fresh.length + ' new line' + (fresh.length === 1 ? '' : 's') : 'Nothing new to import';
      };
      if (TABLES) go();
      else S().Reference.load(['importKeywords', 'expenseCategories']).then(function (t) { TABLES = t; go(); }).catch(function (err) { note('Could not read the category table: ' + err.message, 'is-error'); });
    }
    function clear() {
      state = { parsed: null, map: null, lines: [], name: '' };
      q('map').hidden = true; q('preview').innerHTML = ''; q('tally').hidden = true; q('acts').hidden = true; note('');
      el.querySelector('#' + uid + '-file').value = '';
    }
    function take(text, name) {
      var B = S().BankCsv, Csv = S().Csv, Prefs = S().Prefs;
      clear();
      state.name = name || '';
      if (Csv && Csv.looksBinary && Csv.looksBinary(text)) { note('That is not a CSV. Most bank and card sites offer CSV beside PDF and Excel; choose CSV.', 'is-error'); return; }
      state.parsed = B.parse(text);
      if (!state.parsed.headers.length) { note('That file has no rows I can read.', 'is-error'); return; }
      if (Csv && Csv.headerKey) {
        var keys = state.parsed.headers.map(Csv.headerKey);
        if (keys.indexOf('row') > -1 && keys.indexOf('value') > -1 && keys.indexOf('unit') > -1) { note('That is a Money Rooms sheet, not a statement. Bring it in through Your Data.', 'is-error'); state.parsed = null; return; }
      }
      var sig = B.signature(state.parsed.headers);
      var remembered = (Prefs.get(PREF, {}) || {})[sig];
      state.map = remembered || B.guessMap(state.parsed.headers);
      var card = !remembered && B.looksLikeCard(state.parsed, state.map);
      if (card) state.map.flip = true;
      q('map').hidden = false;
      fillSelects();
      note(remembered ? 'Columns remembered from the last file with these headings.'
        : card ? 'Columns guessed from the headings. Most amounts are above zero, so this reads as a card statement: a charge is a positive number, a payment a negative one. Untick the switch if that is wrong.'
        : 'Columns guessed from the headings; change any that are wrong.', 'is-good');
      preview();
    }
    function importLines() {
      if (!state.parsed) return;
      var B = S().BankCsv, Spine = S().Spine, Prefs = S().Prefs;
      var n = B.apply(state.lines, Spine);
      var maps = Prefs.get(PREF, {}) || {}; maps[B.signature(state.parsed.headers)] = state.map; Prefs.set(PREF, maps);
      note('Imported ' + n + ' line' + (n === 1 ? '' : 's') + ' into the log, each dated from the file. One undo takes them all back.', 'is-good');
      preview();
      if (typeof o.onImported === 'function') o.onImported(n);
    }

    MAP_KEYS.forEach(function (k) { cols[k].addEventListener('change', preview); });
    q('flip').addEventListener('change', preview);
    q('import').addEventListener('click', importLines);
    q('clear').addEventListener('click', clear);
    el.querySelector('#' + uid + '-file').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { take(String(r.result || ''), f.name); };
      r.onerror = function () { note('Could not read that file.', 'is-error'); };
      r.readAsText(f);
    });
    return { take: take, clear: clear };
  }

  return { mount: mount, MAP_KEYS: MAP_KEYS };
});
