/* ==========================================================================
   shared/reopen.js — a life change reopens only what it touches. D-209 (G2.6).
   --------------------------------------------------------------------------
   When the situation changes (between jobs → working, and back) the spine
   records it in meta.reopen and this shows one short sheet, on the next
   page the person opens, listing only the rows that change meaning: the
   ones data/ledger-rows.json names under `reopen`, plus any row that
   newly applies under the new answer. Nothing is cleared, nothing restarts:
   every row shows what it holds, and the person confirms it or types over
   it, through the owner (Ownership.write), like anywhere else.

     rows(h, rec, tables)   the rows the change touches, each with status
     mount(host, opts)      the sheet, once per page; opts.force shows it
                            even after "Later"

   LIVE-FORM: built once — the sheet and its boxes are created once on
   mount and only hidden after Done; nothing is rebuilt under a finger.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Reopen = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  function g() { return typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : {}); }
  function deps() {
    if (typeof module === 'object' && module.exports) {
      return { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'), LedgerRows: require('./ledger-rows.js'), Spine: require('./spine-v2.js'), Ask: require('./ask.js'), Registry: require('./registry.js') };
    }
    var S = g().SLAF || {};
    return { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, LedgerRows: S.LedgerRows, Spine: S.Spine, Ask: S.Ask, Registry: S.Registry };
  }
  var WORDS = { employed: 'working for an employer', selfEmployed: 'self-employed', both: 'a job and your own work', unemployed: 'between jobs', student: 'a student', retired: 'retired' };
  function word(v) { return WORDS[v] || String(v || ''); }

  /* The household as it stood before the change: the same record with the
     old answer put back, so "newly applies" is a real diff, not a guess. */
  function before(household, rec) {
    var D = deps();
    var h = JSON.parse(JSON.stringify(household));
    if (rec.field === 'employmentStatus') { var p = D.Schema.primaryPerson(h); if (p) p.employmentStatus = rec.from; }
    return h;
  }
  function rows(household, rec, tables) {
    var D = deps();
    if (!rec || !D.LedgerRows) return [];
    var t = D.LedgerRows.table() || {};
    var listed = ((t.reopen || {})[rec.field] || {}).rows || [];
    var was = before(household, rec);
    var all = D.LedgerRows.rows(household, tables, { filter: 'all' });
    return all.filter(function (r) {
      if (r.kind === 'computed' || /^prefs\./.test(r.path)) return false;
      if (listed.indexOf(r.id) !== -1) return true;
      var row = D.LedgerRows.byId(r.id);
      return row && !D.LedgerRows.applies(row, was);          /* newly applies */
    });
  }
  function why(rec) {
    var D = deps();
    var t = D.LedgerRows && D.LedgerRows.table ? (D.LedgerRows.table() || {}) : {};
    return ((t.reopen || {})[rec.field] || {}).why || '';
  }

  /* ---- The sheet -------------------------------------------------------- */
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function display(D, row, v) {
    if (v === null || v === undefined) return '';
    if (row.unit === 'cents') return D.Money.formatCents(v, { exact: true }).replace(/^\$/, '');
    if (row.unit === 'rate') return String(Math.round(v * 10000) / 100);
    if (row.unit === 'percent') return row.id === 'contributionPercent' ? String(v) : String(Math.round(v * 10000) / 100);
    return String(v);
  }
  function current(D, h, row) {
    var f = D.Ownership.FIELDS[row.id];
    if (!f) return null;
    var r = f.read(h);
    return D.Money.isOk(r) ? r.value : null;
  }
  function mount(host, opts, tables) {
    var D = deps();
    var doc = g().document;
    if (!doc || !host || doc.getElementById('slaf-reopen')) return null;
    var rec = D.Spine.reopenPending();
    if (!rec || (rec.dismissed && !(opts && opts.force))) return null;
    var h = D.Spine.getProfile();
    var list = rows(h, rec, tables);
    if (!list.length) { D.Spine.setReopen(null); return null; }
    var card = doc.createElement('div');
    card.className = 'slaf-card slaf-ask slaf-reopen';
    card.id = 'slaf-reopen';
    card.setAttribute('role', 'region');
    card.innerHTML = '<span class="slaf-eyebrow">Your situation changed</span>'
      + '<p class="ask-q">' + esc(word(rec.from)) + ' → ' + esc(word(rec.to)) + ': ' + list.length + ' row' + (list.length === 1 ? '' : 's') + ' change' + (list.length === 1 ? 's' : '') + ' meaning.</p>'
      + '<p class="slaf-hint">' + esc(why(rec)) + ' Nothing else was touched; nothing was cleared. Each box shows what it holds.</p>'
      + '<div class="reopen-rows">' + list.map(function (r) {
        var f = D.Ownership.FIELDS[r.id]; var owner = f ? D.Registry.byId(f.owner) : null;
        return '<div class="reopen-row" data-reopen-row="' + esc(r.id) + '"><div class="lab">' + esc(r.label) + (D.LedgerRows.unitLabel(r) ? ' <span class="slaf-unit">' + esc(D.LedgerRows.unitLabel(r)) + '</span>' : '') + (owner ? ' <span class="slaf-hint">owned by ' + esc(owner.title) + '</span>' : '') + '</div>'
          + '<div class="ask-ctl">' + D.Ask.control(r) + '</div><span class="slaf-hint" data-reopen-saved></span></div>';
      }).join('') + '</div>'
      + '<div class="ask-acts"><button type="button" class="slaf-btn slaf-btn--primary" data-reopen-done>Done</button><button type="button" class="slaf-btn slaf-btn--quiet" data-reopen-later>Later</button></div>';
    var first = host.querySelector('.slaf-room-head, .room-head, header');
    if (first && first.parentNode === host) host.insertBefore(card, first.nextSibling); else host.insertBefore(card, host.firstChild);

    var NODES = {};
    Array.prototype.forEach.call(card.querySelectorAll('[data-reopen-row]'), function (n) {
      var row = D.LedgerRows.byId(n.getAttribute('data-reopen-row'));
      NODES[row.id] = { row: row, el: n, saved: n.querySelector('[data-reopen-saved]') };
    });
    function paint() {
      var hh = D.Spine.getProfile();
      Object.keys(NODES).forEach(function (id) {
        var n = NODES[id], v = current(D, hh, n.row);
        var inp = n.el.querySelector('[data-ask-input]');
        if (inp && inp !== doc.activeElement) inp.value = display(D, n.row, v);
        Array.prototype.forEach.call(n.el.querySelectorAll('[data-ask-val]'), function (b) { b.setAttribute('aria-pressed', v !== null && v !== undefined && String(v) === b.getAttribute('data-ask-val') ? 'true' : 'false'); });
      });
    }
    function said(n, t) { n.saved.textContent = t; }
    function write(n, v) {
      try { D.Ownership.write(n.row.id, v, null); said(n, v === null ? 'Cleared.' : 'Saved.'); }
      catch (e) { said(n, 'Could not save: ' + e.message); }
    }
    card.addEventListener('change', function (ev) {
      var r = ev.target.closest ? ev.target.closest('[data-reopen-row]') : null;
      if (!r || ev.target.hasAttribute('data-ask-period')) return;
      var n = NODES[r.getAttribute('data-reopen-row')];
      var inp = n.el.querySelector('[data-ask-input]');
      if (!inp) return;
      var raw = String(inp.value || '').trim();
      if (raw === '') return;                                  /* empty writes nothing */
      var v = n.row.unit === 'enum' || n.row.unit === 'text' ? raw : D.Ask.parse(n.row, raw);
      if (v === null) { said(n, 'A number, please.'); return; }
      var per = n.el.querySelector('[data-ask-period]');
      var conv = n.row.unit === 'cents' && per ? D.Ask.toRowPeriod(n.row, v, per.value) : { value: v, note: null };
      if (conv.value !== current(D, D.Spine.getProfile(), n.row)) write(n, conv.value);
      else said(n, 'Same as before.');
    });
    card.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-ask-val],[data-reopen-done],[data-reopen-later]') : null;
      if (!b) return;
      if (b.hasAttribute('data-reopen-done')) { D.Spine.setReopen(null); card.hidden = true; return; }
      if (b.hasAttribute('data-reopen-later')) { var r2 = D.Spine.reopenPending(); if (r2) { r2.dismissed = true; D.Spine.setReopen(r2); } card.hidden = true; return; }
      var n = NODES[b.closest('[data-reopen-row]').getAttribute('data-reopen-row')];
      var raw = b.getAttribute('data-ask-val');
      write(n, n.row.unit === 'bool' ? raw === 'true' : raw);
    });
    paint();
    D.Spine.onChange(paint);
    return card;
  }
  /* From Progress.mount: load what is missing, then the sheet. */
  function mountLater(host, opts) {
    var D = deps();
    if (!D.Ask || !D.Ask.ensure) return Promise.resolve(null);
    return D.Ask.ensure().then(function (t) { return mount(host, opts, t); }).catch(function () { return null; });
  }
  return { rows: rows, before: before, why: why, word: word, mount: mount, mountLater: mountLater, WORDS: WORDS };
});
