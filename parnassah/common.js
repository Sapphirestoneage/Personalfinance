/* ==========================================================================
   parnassah/common.js, what every page shares. PN-011.
   --------------------------------------------------------------------------
     PN.el, PN.esc, PN.fmt(cents), PN.pct(rate)
     PN.header(pageId, h)          the wordmark, the eight pages, the family and how old its numbers are
     PN.help(kind, id, T)          a "?" and its panel of plain words, from data/help.json
     PN.bind(root, h)              every [data-path] box writes its path on change (built once)
     PN.fill(root, h)              every [data-path] box shows its value (after a load, the demo, a backup)
     PN.chart(host, drawn, opts)   the picture in its frame: legend, "Show as a table", tooltips
     PN.figure(id, text, kind)     a headline figure and its state
     PN.boot(pageId, render)       load the tables and the family, draw the header, bind, render;
                                   render(h, T) runs again after every save
   The form is built once per page (D-034): typed boxes are never rebuilt
   while in use; lists (children, gifts) are rebuilt only on add or remove.
   ========================================================================== */
(function (root) {
  'use strict';
  var SLAF = root.SLAF = root.SLAF || {};
  var Money = SLAF.Money, Store = SLAF.Store;
  var PAGES = [
    { id: 'index', href: 'index.html', label: 'Home' },
    { id: 'tuition', href: 'tuition.html', label: 'Tuition' },
    { id: 'year', href: 'year.html', label: 'The year' },
    { id: 'tzedakah', href: 'tzedakah.html', label: 'Tzedakah' },
    { id: 'milestones', href: 'milestones.html', label: 'Simchas' },
    { id: 'home', href: 'home.html', label: 'The home' },
    { id: 'plan', href: 'plan.html', label: 'The picture' },
    { id: 'guide', href: 'guide.html', label: 'Guide' }
  ];
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(cents) { return Money.formatCents(cents, { roundTo: 1 }); }
  function pct(rate) { return Money.formatRate(rate, { decimals: 0 }); }

  function age(iso) {
    if (!iso) return 'nothing saved yet';
    var ms = Date.now() - new Date(iso).getTime(), d = Math.floor(ms / 86400000);
    if (d <= 0) return 'saved today';
    if (d === 1) return 'saved yesterday';
    if (d < 30) return 'saved ' + d + ' days ago';
    return 'saved ' + Math.floor(d / 30) + ' months ago: worth a fresh look';
  }

  function header(pageId, h) {
    var nav = PAGES.map(function (p) { return '<a href="' + p.href + '"' + (p.id === pageId ? ' aria-current="page"' : '') + '>' + esc(p.label) + '</a>'; }).join('');
    return '<header class="pn-head"><div class="pn-brand"><a class="pn-wordmark" href="index.html">Parnassah</a><span class="pn-tag">Money planning for the Modern Orthodox household</span></div>'
      + '<nav class="pn-nav" aria-label="Pages">' + nav + '</nav>'
      + '<div class="pn-family"><span id="pn-family-name">' + esc(h.household.name || 'Your household') + '</span><span class="pn-age" id="pn-age">' + esc(age(h.savedAt)) + '</span></div></header>';
  }

  /* ---- Help: the plain words ------------------------------------------------ */
  var helpSeq = 0;
  function help(kind, id, T) {
    var H = T.help && T.help[kind] && T.help[kind][id];
    if (!H) return '';
    var pid = 'help-' + (++helpSeq);
    var body = '<p class="help-q">' + esc(H.q) + '</p>' + (H.what ? '<p>' + esc(H.what) + '</p>' : '')
      + (H.where ? '<p><b>Where to look:</b> ' + esc(H.where) + '</p>' : '') + (H.unsure ? '<p><b>If you are not sure:</b> ' + esc(H.unsure) + '</p>' : '');
    return '<button type="button" class="help-btn" aria-expanded="false" aria-controls="' + pid + '" aria-label="What is this?" data-help="' + pid + '">?</button><div class="help-panel" id="' + pid + '" hidden>' + body + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-help]'); if (!b) return;
    var p = el(b.getAttribute('data-help')); if (!p) return;
    var open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', open ? 'false' : 'true'); p.hidden = open;
  });

  /* ---- Paths ------------------------------------------------------------------- */
  function read(h, path) { return path.split('.').reduce(function (o, k) { return o === null || o === undefined ? undefined : o[k]; }, h); }
  function write(h, path, v) { var ks = path.split('.'), o = h; for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }
  function parse(input) {
    var t = input.getAttribute('data-type') || 'text', raw = input.value;
    if (t === 'cents') return Money.parseMoney(raw);
    if (t === 'rate') return Money.parseRatePercent(raw);
    if (t === 'int') { var s = String(raw).trim(); if (s === '') return null; var n = Number(s); return Number.isFinite(n) ? Math.round(n) : null; }
    if (t === 'bool') return raw === 'yes' ? true : raw === 'no' ? false : null;
    if (t === 'select') return raw === '' ? null : raw;
    if (t === 'check') return input.checked;
    return String(raw).trim() === '' ? null : String(raw).trim();
  }
  function show(input, v) {
    var t = input.getAttribute('data-type') || 'text';
    if (t === 'cents') input.value = Money.isEntered(v) ? Money.forInput(v).replace(/^\$/, '') : '';
    else if (t === 'rate') input.value = Money.isEntered(v) ? String(Math.round(v * 10000) / 100) : '';
    else if (t === 'int') input.value = Money.isEntered(v) ? String(v) : '';
    else if (t === 'bool') input.value = v === true ? 'yes' : v === false ? 'no' : '';
    else if (t === 'check') input.checked = v === true;
    else input.value = v === null || v === undefined ? '' : String(v);
  }
  function bind(root, h) {
    root.querySelectorAll('[data-path]').forEach(function (input) {
      if (input.getAttribute('data-bound')) return;
      input.setAttribute('data-bound', '1');
      input.addEventListener('change', function () { write(h, input.getAttribute('data-path'), parse(input)); Store.save(h); });
    });
  }
  function fill(root, h) { root.querySelectorAll('[data-path]').forEach(function (input) { show(input, read(h, input.getAttribute('data-path'))); }); }

  /* ---- Charts in their frame ----------------------------------------------------- */
  function chart(host, drawn, opts) {
    var o = opts || {};
    host.innerHTML = '<figure class="pn-chart slaf-chart">' + (o.title ? '<figcaption>' + esc(o.title) + '</figcaption>' : '') + drawn.svg
      + (drawn.legend.length ? '<ul class="pn-legend">' + drawn.legend.map(function (l) { return '<li><i style="background:' + l.color + '"></i>' + esc(l.label) + '</li>'; }).join('') + '</ul>' : '')
      + '<details class="pn-details"><summary>Show as a table</summary>' + drawn.table + '</details></figure>';
  }
  var tip;
  function tips() {
    if (tip) return;
    tip = document.createElement('div'); tip.className = 'pn-tip'; tip.hidden = true; document.body.appendChild(tip);
    function showTip(t, x, y) { tip.textContent = t; tip.hidden = false; tip.style.left = Math.min(x + 12, window.innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (y + 14) + 'px'; }
    document.addEventListener('mousemove', function (e) { var m = e.target.closest && e.target.closest('[data-tip]'); if (m) showTip(m.getAttribute('data-tip'), e.clientX, e.clientY); else tip.hidden = true; });
    document.addEventListener('focusin', function (e) { var m = e.target.closest && e.target.closest('[data-tip]'); if (!m) return; var r = m.getBoundingClientRect(); showTip(m.getAttribute('data-tip'), r.left + r.width / 2, r.top); });
    document.addEventListener('focusout', function () { tip.hidden = true; });
  }

  /* ---- One field, built once ------------------------------------------------------
     spec: { label, path, type ('cents' | 'rate' | 'int' | 'text' | 'select' | 'bool'), options, help, hint, affix } */
  function field(spec, T) {
    var id = 'f-' + spec.path.replace(/[^a-z0-9]/gi, '-');
    var h = '<div class="field"><div class="field-label"><label for="' + id + '">' + esc(spec.label) + '</label>' + (spec.help ? help('fields', spec.help, T) : '') + '</div>';
    if (spec.type === 'select' || spec.type === 'bool') {
      var opts = spec.type === 'bool' ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] : spec.options;
      h += '<select id="' + id + '" data-path="' + esc(spec.path) + '" data-type="' + spec.type + '"><option value="">' + esc(spec.empty || 'Not sure yet') + '</option>' + opts.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') + '</select>';
    } else if (spec.type === 'text') {
      h += '<input type="text" id="' + id + '" data-path="' + esc(spec.path) + '" data-type="text" autocomplete="off"/>';
    } else {
      var affix = spec.affix || (spec.type === 'cents' ? '$' : spec.type === 'rate' ? '%' : '');
      h += '<span class="affix">' + (affix && spec.type === 'cents' ? '<span>' + esc(affix) + '</span>' : '') + '<input type="text" inputmode="decimal" id="' + id + '" data-path="' + esc(spec.path) + '" data-type="' + spec.type + '" autocomplete="off"/>' + (affix && spec.type !== 'cents' ? '<span class="after">' + esc(affix) + '</span>' : '') + '</span>';
    }
    if (spec.hint) h += '<span class="pn-hint">' + esc(spec.hint) + '</span>';
    return h + '</div>';
  }
  function band(dollars, T) { return 'Typical ' + Money.formatCents(dollars.typical * 100) + ' (from ' + Money.formatCents(dollars.low * 100) + ' to ' + Money.formatCents(dollars.high * 100) + ')'; }

  function figure(id, text, kind, note) {
    var n = el(id); if (!n) return;
    n.querySelector('.pn-figure-value').textContent = text;
    n.className = 'pn-figure' + (kind ? ' is-' + kind : '');
    var nn = n.querySelector('.pn-figure-note'); if (nn) nn.textContent = note || '';
  }
  function say(id, text, kind) { var n = el(id); if (!n) return; n.textContent = text || ''; n.className = 'pn-say' + (kind ? ' is-' + kind : ''); }

  /* ---- The actions every page carries ------------------------------------------- */
  function actions(h, T, render) {
    var host = el('pn-actions'); if (!host) return;
    host.innerHTML = '<button type="button" class="slaf-btn" id="pn-demo">Try with example numbers</button>'
      + '<button type="button" class="slaf-btn slaf-btn--quiet" id="pn-save">Save a backup</button>'
      + '<label class="slaf-btn slaf-btn--quiet pn-file">Load a backup<input type="file" accept="application/json" id="pn-load" hidden/></label>'
      + '<button type="button" class="slaf-btn slaf-btn--quiet" id="pn-clear">Start over</button><span class="pn-say" id="pn-actions-say"></span>';
    el('pn-demo').addEventListener('click', function () { var d = Store.demo(); Object.keys(d).forEach(function (k) { h[k] = d[k]; }); Store.save(h); fill(document, h); if (render.lists) render.lists(h, T); say('pn-actions-say', 'The Adlers are an invented family. Every number is an example.', 'good'); });
    el('pn-save').addEventListener('click', function () {
      var blob = new Blob([Store.exportJson(h)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'parnassah-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
      say('pn-actions-say', 'Saved. Keep the file somewhere private; it holds your numbers.', 'good');
    });
    el('pn-load').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var d = Store.importJson(String(r.result)); Object.keys(d).forEach(function (k) { h[k] = d[k]; }); Store.save(h); fill(document, h); if (render.lists) render.lists(h, T); say('pn-actions-say', 'Loaded.', 'good'); } catch (e) { say('pn-actions-say', e.message, 'bad'); } };
      r.readAsText(f);
    });
    el('pn-clear').addEventListener('click', function () {
      if (!confirm('Forget every number in this browser? A backup you saved is unaffected.')) return;
      Store.clear(); var b = Store.blank(); Object.keys(b).forEach(function (k) { h[k] = b[k]; }); Store.save(h); fill(document, h); if (render.lists) render.lists(h, T); say('pn-actions-say', 'Cleared.', null);
    });
  }

  function boot(pageId, render) {
    var h = Store.load();
    el('pn-head').innerHTML = header(pageId, h);
    SLAF.Tables.load('data/').then(function (T) {
      Money.setDisplayRounding(1);
      if (render.form) render.form(h, T);
      if (render.lists) render.lists(h, T);
      bind(document, h); fill(document, h); tips(); actions(h, T, render);
      render.draw(h, T);
      Store.onChange(function () {
        el('pn-family-name').textContent = h.household.name || 'Your household';
        el('pn-age').textContent = age(h.savedAt);
        render.draw(h, T);
      });
    }).catch(function (e) {
      el('main').insertAdjacentHTML('afterbegin', '<p class="slaf-error">The reference data did not load (' + esc(e.message) + '). Serve the folder over http, for example with python3 -m http.server, and open it again.</p>');
    });
  }
  SLAF.PN = { el: el, esc: esc, fmt: fmt, pct: pct, PAGES: PAGES, header: header, help: help, field: field, band: band, read: read, write: write, bind: bind, fill: fill, chart: chart, figure: figure, say: say, boot: boot, age: age };
})(typeof self !== 'undefined' ? self : this);
