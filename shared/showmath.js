/* ==========================================================================
   shared/showmath.js — tap any number, see the math. DECISIONS.md D-211 (H1).
   --------------------------------------------------------------------------
   Every computed row in data/ledger-rows.json names its formula: the one
   engine function behind it (fn), the formula in words, its terms, and the
   reference tables it reads. This turns that into a small sheet:

     the formula in plain words
     the same formula with the household's actual values plugged in
     each input, linked to its row
     the data/ file and year behind any reference number
     what would change this most (the inputs with the biggest effect)

   Rough inputs mark the result rough right here. The build fails when a
   computed row names no function, or names one that does not exist.

     ShowMath.of(rowId, h, tables)  → { row, fn, words, plugged, inputs,
                                        references, most, rough, missing }
     ShowMath.resolve(fn)           the function, or null
     ShowMath.mount()               the sheet, once a page; any element with
                                    data-math="rowId" opens it on tap
   (shared/explain.js is the older ⓘ on a ratio; this is the math behind
   a computed row. Different attributes, so both can share a page.)

   LIVE-FORM: built once — the sheet is one node, filled on open; it holds
   no input. Nothing is rebuilt under a finger.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'), LedgerRows: require('./ledger-rows.js'), Reference: require('./reference.js'), Registry: require('./registry.js'),
      Statement: (function () { try { return require('../engines/statement.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, LedgerRows: S.LedgerRows, Reference: S.Reference, Registry: S.Registry, Statement: S.Statement };
  }
  var api = factory(deps);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.ShowMath = api; }
})(typeof self !== 'undefined' ? self : null, function (D) {
  'use strict';
  var Money = D.Money, Schema = D.Schema, Ownership = D.Ownership, LedgerRows = D.LedgerRows, Reference = D.Reference;

  /* fn is "Module.path.to.function"; the module is one of the shared ones. */
  function resolve(fn) {
    if (!fn || typeof fn !== 'string') return null;
    var parts = fn.split('.');
    var mods = { Schema: Schema, Ownership: Ownership, Money: Money, Statement: D.Statement, LedgerRows: LedgerRows };
    var cur = mods[parts[0]];
    for (var i = 1; cur && i < parts.length; i++) cur = cur[parts[i]];
    return typeof cur === 'function' ? cur : null;
  }
  function display(row, v) {
    if (v === null || v === undefined) return 'blank';
    if (row.unit === 'cents') return Money.formatCents(v);
    if (row.unit === 'rate' || (row.unit === 'percent' && row.id !== 'contributionPercent')) return (Math.round(v * 10000) / 100) + '%';
    if (row.unit === 'bool') return v ? 'yes' : 'no';
    if (typeof v === 'object') return Money.isEntered(v.matchPercent) ? Math.round(v.matchPercent * 100) + '% of the first ' + Math.round((v.matchCapPercentOfSalary || 0) * 100) + '%' : 'entered';
    return String(v);
  }
  function itemName(it) { return it ? (it.label || it.source || it.type || 'one line') : ''; }
  function hrefOf(id, h) {
    var d = Ownership.describe ? Ownership.describe(id, h, 'ledger') : null;
    return d && d.href ? d.href : null;
  }
  function roughState(st) { return st === 'roughly' || st === 'memory' || st === 'stale' || st === 'suggested'; }

  /** The inputs of a computed row as lines: one per item for a repeat row. */
  function inputs(row, h, tables) {
    var terms = (row.formula && row.formula.terms) || [];
    var out = [];
    terms.forEach(function (t) {
      var r = LedgerRows.byId(t.id);
      if (!r) return;
      var st = LedgerRows.status(h, r, tables);
      if (r.repeat) {
        var items = LedgerRows.items(h, r) || [];
        if (!items.length) { out.push({ id: r.id, label: r.label, item: null, value: null, display: 'none listed', href: hrefOf(r.id, h), state: 'missing', coef: t.coef, rough: false, missing: true }); return; }
        items.forEach(function (it) {
          var v = LedgerRows.itemValue(r, it);
          var entered = v !== null && v !== undefined;
          out.push({ id: r.id, label: r.label, item: itemName(it), itemId: it.id, value: entered ? v : null, display: display(r, entered ? v : null), href: hrefOf(r.id, h), state: entered ? st.state : 'missing', coef: t.coef, rough: entered && roughState(st.state), missing: !entered });
        });
        return;
      }
      var v = st.entered && Money.isOk(st.value) ? st.value.value : null;
      out.push({ id: r.id, label: r.label, item: null, value: v, display: display(r, v), href: hrefOf(r.id, h), state: st.state, coef: t.coef, rough: roughState(st.state), missing: v === null || v === undefined });
    });
    return out;
  }
  /* The formula with the values in: for a sum, the terms joined with + and
     −; otherwise the words with each input's value beside its name. */
  function plugged(row, ins, result) {
    var isSum = ins.length && ins.every(function (i) { return i.coef === 1 || i.coef === -1; });
    var lhs = Money.isOk(result) ? display(row, result.value) : 'not yet';
    if (isSum) {
      var parts = ins.filter(function (i) { return !i.missing || true; }).map(function (i, k) {
        var sign = i.coef === -1 ? '− ' : (k === 0 ? '' : '+ ');
        return sign + (i.missing ? '(' + (i.item ? i.item + ' ' : '') + i.label.toLowerCase() + ': blank)' : i.display);
      });
      return lhs + ' = ' + parts.join(' ');
    }
    return lhs + ' from ' + (ins.length ? ins.map(function (i) { return i.label.toLowerCase() + (i.item ? ' (' + i.item + ')' : '') + ' = ' + i.display; }).join(', ') : 'the log');
  }
  /* What would change this most: for a sum, a tenth of each input, ranked
     by size; the two biggest. For anything else, the single input named. */
  function most(row, ins) {
    var isSum = ins.length && ins.every(function (i) { return i.coef === 1 || i.coef === -1; });
    if (!isSum) return ins.slice(0, 2).map(function (i) { return { id: i.id, label: i.label + (i.item ? ' (' + i.item + ')' : ''), effect: null, line: 'The only lever: ' + i.label.toLowerCase() + '.' }; });
    return ins.filter(function (i) { return !i.missing && typeof i.value === 'number'; }).map(function (i) {
      var e = Math.round(Math.abs(i.value) * 0.1);
      return { id: i.id, label: i.label + (i.item ? ' (' + i.item + ')' : ''), effect: e, line: 'A tenth more or less on ' + i.label.toLowerCase() + (i.item ? ' (' + i.item + ')' : '') + ' moves this by ' + display(row, e) + '.' };
    }).sort(function (a, b) { return b.effect - a.effect; }).slice(0, 2);
  }
  function references(row) {
    var names = (row.formula && row.formula.references) || [];
    return names.map(function (n) {
      var file = Reference && Reference.TABLE_FILES ? Reference.TABLE_FILES[n] : null;
      var t = Reference && Reference._cache ? Reference._cache[n] : null;
      var year = t && Reference.yearOf ? Reference.yearOf(t) : null;
      return { table: n, file: file ? 'data/' + file : null, year: year, asOf: t && t.asOf ? t.asOf : null, note: Reference && Reference.yearNote && t ? Reference.yearNote(t) : null };
    });
  }
  function of(rowId, household, tables) {
    var h = household || {};
    var row = LedgerRows.byId(rowId);
    if (!row || row.kind !== 'computed') return null;
    var f = row.formula || {};
    var fn = resolve(f.fn);
    var st = LedgerRows.status(h, row, tables);
    var ins = inputs(row, h, tables);
    var missing = ins.filter(function (i) { return i.missing; }).map(function (i) { return i.label + (i.item ? ' (' + i.item + ')' : ''); });
    var rough = ins.some(function (i) { return i.rough; });
    return { row: row, id: row.id, label: row.label, fn: f.fn || null, fnResolved: !!fn, words: f.words || '', result: st.value,
      display: Money.isOk(st.value) ? display(row, st.value.value) : 'not yet: ' + (st.value && st.value.reason ? st.value.reason : 'needs its inputs'),
      plugged: plugged(row, ins, st.value), inputs: ins, references: references(row), most: most(row, ins), rough: rough, missing: missing,
      roughLine: rough ? 'Rough: ' + ins.filter(function (i) { return i.rough; }).map(function (i) { return i.label.toLowerCase() + (i.item ? ' (' + i.item + ')' : ''); }).join(', ') + ' ' + (ins.filter(function (i) { return i.rough; }).length === 1 ? 'is' : 'are') + ' not confirmed yet.' : null };
  }

  /* ---- The sheet ------------------------------------------------------------ */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sheetHtml(x) {
    var out = '<button type="button" class="slaf-btn slaf-btn--quiet ex-close" data-math-close aria-label="Close">Close</button>'
      + '<span class="slaf-eyebrow">The math</span><h2 class="ex-title">' + esc(x.label) + ': ' + esc(x.display) + '</h2>'
      + (x.rough ? '<p class="ex-rough">' + esc(x.roughLine) + '</p>' : '')
      + '<p class="ex-words">' + esc(x.words) + '</p>'
      + '<p class="ex-plugged">' + esc(x.plugged) + '</p>'
      + '<h3>Each input</h3><ul class="ex-inputs">' + x.inputs.map(function (i) {
        return '<li><a href="' + esc(i.href || '#') + '">' + esc(i.label + (i.item ? ' · ' + i.item : '')) + '</a> <b>' + esc(i.display) + '</b> <span class="slaf-hint">' + esc(i.missing ? 'blank' : i.rough ? i.state === 'memory' ? 'from memory' : i.state : 'confirmed') + '</span></li>';
      }).join('') + '</ul>'
      + (x.references.length ? '<h3>Reference numbers</h3><ul class="ex-refs">' + x.references.map(function (r) { return '<li>' + esc(r.file || r.table) + (r.year ? ', the ' + r.year + ' table' : r.asOf ? ', as of ' + esc(r.asOf) : '') + (r.note ? ' (' + esc(r.note) + ')' : '') + '</li>'; }).join('') + '</ul>' : '<p class="slaf-hint">No reference table: this is your numbers only.</p>')
      + (x.most.length ? '<h3>What would change this most</h3><ul class="ex-most">' + x.most.map(function (m) { return '<li>' + esc(m.line) + '</li>'; }).join('') + '</ul>' : '')
      + '<p class="slaf-hint ex-fn">Worked out by ' + esc(x.fn || 'no named function') + ' in the shared engine.</p>';
    return out;
  }
  var mounted = false;
  function mount(tables) {
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc || mounted) return null;
    mounted = true;
    var sheet = doc.createElement('div');
    sheet.id = 'slaf-math';
    sheet.className = 'slaf-math';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.hidden = true;
    /* A backdrop, because the sheet floats over the room. Without one the
       page behind stayed live, stayed lit, and on a phone the two sets of
       words landed on top of each other. Tapping it closes, the way every
       sheet on a phone does. D-222. */
    var back = doc.createElement('div');
    back.className = 'slaf-math-backdrop';
    back.hidden = true;
    doc.body.appendChild(back);
    doc.body.appendChild(sheet);
    var opener = null;
    function close() {
      if (sheet.hidden) return;
      sheet.hidden = true; back.hidden = true;
      doc.documentElement.classList.remove('has-math');
      if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* gone from the page */ } }
      opener = null;
    }
    function open(x, from) {
      opener = from || null;
      sheet.innerHTML = sheetHtml(x);
      back.hidden = false;
      sheet.hidden = false;
      doc.documentElement.classList.add('has-math');
      sheet.scrollTop = 0;
      var c = sheet.querySelector('[data-math-close]');
      if (c && c.focus) { try { c.focus(); } catch (e) { /* fine */ } }
    }
    back.addEventListener('click', close);
    doc.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
    doc.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-math],[data-math-close]') : null;
      if (!t) return;
      if (t.hasAttribute('data-math-close')) { close(); return; }
      var S = (typeof self !== 'undefined' ? self : root).SLAF;
      var x = of(t.getAttribute('data-math'), S.Spine.getProfile(), tables || (S.Reference && S.Reference._cache) || {});
      if (!x) return;
      ev.preventDefault();
      open(x, t);
    });
    return sheet;
  }
  return { of: of, resolve: resolve, inputs: inputs, most: most, plugged: plugged, sheetHtml: sheetHtml, mount: mount, display: display };
});
