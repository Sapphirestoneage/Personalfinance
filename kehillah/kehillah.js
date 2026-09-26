/* ==========================================================================
   kehillah/kehillah.js, the pieces the nine pages share. KD-004.
   --------------------------------------------------------------------------
     K.el(id), K.esc(s)                the usual two
     K.money(cents), K.range(lo, hi)   whole dollars; "not yet" when null
     K.boot(page, fn)                  load the tables, wear the header, call fn(T, plan)
     K.header(page)                    the one header every page wears, with the nav
                                       and the "Try with example numbers" strip
     K.say(id, text, kind)             a status line ('good' | 'bad' | null)
     K.bindMoney(input, path, onChange)      a money box: cents in the store, null when cleared
     K.bindNumber(input, path, onChange)     a plain number (months, tries)
     K.bindText(el, path, onChange)          a note
     K.bindSelect(select, path, onChange)
     K.chips(host, options, path, onChange)  one-of buttons, aria-pressed
     K.stat(host, label, value, why, empty)  a figure tile
     K.bar(host, share, kind)                a progress bar
     K.words(host, T, terms)                 the glossary fold, for the words a page uses
     K.plan()                                the plan, fresh from the store
   Every innerHTML here goes through esc().
   ========================================================================== */
(function (root) {
  'use strict';
  var SLAF = root.SLAF = root.SLAF || {};
  var SITE = { name: 'Stress Less About Money', sub: 'Eli Saperstein, money coaching for queer Jewish life', toolkit: 'Kehillah, the free toolkit' };
  var MAIN = [
    { id: 'index', href: 'index.html', label: 'Home' },
    { id: 'work-with-me', href: 'work-with-me.html', label: 'Work with me' },
    { id: 'about', href: 'about.html', label: 'About Eli' },
    { id: 'resources', href: 'resources.html', label: 'Resources' }
  ];
  var TOOLS = [
    { id: 'year', href: 'year.html', label: 'The Year' },
    { id: 'tzedakah', href: 'tzedakah.html', label: 'Tzedakah' },
    { id: 'chosen-family', href: 'chosen-family.html', label: 'Chosen Family' },
    { id: 'family', href: 'family.html', label: 'Making a Family' },
    { id: 'care', href: 'care.html', label: 'Care' },
    { id: 'gemach', href: 'gemach.html', label: 'Gemach' },
    { id: 'elul', href: 'elul.html', label: 'Elul' }
  ];
  var PAGES = MAIN.concat(TOOLS, [{ id: 'book', href: 'book.html', label: 'Book a free call' }]);
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(cents, opts) { return SLAF.Money.formatCents(cents, Object.assign({ placeholder: 'not yet', roundTo: 100 }, opts || {})); }
  function range(lo, hi) {
    if (!SLAF.Money.isEntered(lo) || !SLAF.Money.isEntered(hi)) return '';
    if (lo === hi) return money(lo);
    return money(lo) + ' to ' + money(hi);
  }
  function plan() { return SLAF.Store.load(); }
  function say(id, text, kind) {
    var n = typeof id === 'string' ? el(id) : id; if (!n) return;
    n.textContent = text || '';
    n.className = 'k-say' + (kind === 'good' ? ' is-good' : kind === 'bad' ? ' is-bad' : '');
  }

  /* ---- The header ------------------------------------------------------- */
  function header(page) {
    var host = el('head'); if (!host) return;
    var demo = SLAF.Store.isDemo();
    var tool = TOOLS.some(function (t) { return t.id === page; });
    function nav(list) { return list.map(function (p) { return '<li><a href="' + esc(p.href) + '"' + (p.id === page ? ' aria-current="page"' : '') + '>' + esc(p.label) + '</a></li>'; }).join(''); }
    host.className = 'k-head';
    host.innerHTML =
      '<div class="k-head-top">' +
        '<a class="k-wordmark" href="index.html">' + esc(SITE.name) + '<small>' + esc(SITE.sub) + '</small></a>' +
        '<nav aria-label="Pages" class="k-nav-main"><ul class="k-nav">' + nav(MAIN) + '</ul>' +
        '<a class="slaf-btn slaf-btn--primary k-book" href="book.html"' + (page === 'book' ? ' aria-current="page"' : '') + '>Book a free call</a></nav>' +
      '</div>' +
      '<div class="k-band" aria-hidden="true"></div>' +
      '<nav aria-label="Free tools" class="k-tools"><span class="k-eyebrow">' + esc(SITE.toolkit) + '</span><ul class="k-nav">' + nav(TOOLS) + '</ul></nav>' +
      (tool || page === 'index' ? '<div class="k-demo" id="demo-strip">' +
        '<span id="demo-state">' + (demo ? '<span class="is-on">Example numbers are loaded.</span> They are invented; nothing here is anyone\'s real money.' : 'Free to use. Nothing leaves this browser. Blank means not entered yet; a typed 0 means zero.') + '</span>' +
        '<button type="button" class="slaf-btn slaf-btn--quiet" id="btn-demo">' + (demo ? 'Clear the example' : 'Try with example numbers') + '</button>' +
        (!demo ? '<button type="button" class="slaf-btn slaf-btn--quiet" id="btn-clear">Clear my numbers</button>' : '') +
      '</div>' : '');
    var bd = el('btn-demo');
    if (bd) bd.addEventListener('click', function () {
      if (SLAF.Store.isDemo()) { SLAF.Store.clear(); }
      else {
        var p = SLAF.Store.load();
        var has = p.updated !== null;
        if (has && !root.confirm('Replace what you have typed with the example numbers? Your numbers are not kept.')) return;
        SLAF.Store.save(SLAF.Store.withDefaults(SLAF.Demo.build()));
      }
      root.location.reload();
    });
    var clr = el('btn-clear');
    if (clr) clr.addEventListener('click', function () {
      if (!root.confirm('Forget every number on every page? There is no undo.')) return;
      SLAF.Store.clear(); root.location.reload();
    });
  }

  /* ---- The call to action every tool page ends with ------------------------ */
  function bookHref(T) {
    var b = T && T.practice && T.practice.booking;
    if (b && /^https:\/\//.test(b.url || '')) return b.url;
    return 'book.html';
  }
  function cta(host, T, page) {
    if (!host || !T.practice) return;
    var P = T.practice; var line = P.toolCtas[page] || 'Want to go through this with someone? The first call is free.';
    host.className = 'k-cta';
    host.innerHTML = '<div class="k-cta-body"><span class="k-eyebrow">A free tool from ' + esc(P.practice.name) + '</span><h2>' + esc(line) + '</h2><p class="k-note">' + esc(P.booking.plain) + '</p></div>' +
      '<div class="k-actions"><a class="slaf-btn slaf-btn--primary" href="' + esc(bookHref(T)) + '"' + (bookHref(T) !== 'book.html' ? ' rel="noopener"' : '') + '>' + esc(P.booking.label) + '</a><a class="slaf-btn" href="work-with-me.html">How coaching works</a></div>';
  }
  function siteFoot(host, T) {
    if (!host || !T.practice) return;
    var P = T.practice;
    host.className = 'k-sitefoot';
    host.innerHTML = '<div><b>' + esc(P.practice.name) + '</b> <span class="k-note">' + esc(P.person.name) + ' (' + esc(P.person.pronouns) + '), ' + esc(P.person.role.toLowerCase()) + '. ' + esc(P.person.where) + '</span></div>' +
      '<ul class="k-nav">' + MAIN.concat([{ href: 'book.html', label: 'Book a free call' }]).map(function (p) { return '<li><a href="' + esc(p.href) + '">' + esc(p.label) + '</a></li>'; }).join('') + '</ul>' +
      '<p class="k-note">Coaching, not financial, legal, tax or medical advice. The tools are free, keep nothing on a server, and their guide figures name their source on each page. Share them with anyone.</p>';
  }

  /* ---- Boot ------------------------------------------------------------- */
  function boot(page, fn) {
    header(page);
    SLAF.Tables.load().then(function (T) {
      fn(T, plan());
      cta(el('cta'), T, page);
      siteFoot(el('sitefoot'), T);
    }).catch(function (e) {
      var m = el('main') || document.body;
      var n = document.createElement('p'); n.className = 'k-say is-bad';
      n.textContent = 'The reference tables did not load (' + e.message + '). Open this page from a web server, not as a file.';
      m.insertBefore(n, m.firstChild.nextSibling);
    });
  }

  /* ---- Bindings: the box writes the store, the store fills the box -------- */
  function bindMoney(input, path, onChange) {
    var v = SLAF.Store.get(path);
    input.value = SLAF.Money.isEntered(v) ? String(v / 100) : '';
    input.setAttribute('inputmode', 'decimal');
    input.addEventListener('change', function () {
      var cents = SLAF.Money.parseMoney(input.value);
      if (input.value.trim() !== '' && !SLAF.Money.isEntered(cents)) { input.value = ''; cents = null; }
      SLAF.Store.set(path, cents);
      if (SLAF.Money.isEntered(cents)) input.value = String(cents / 100);
      if (onChange) onChange(cents);
    });
  }
  function bindNumber(input, path, onChange, opts) {
    var o = opts || {}; var v = SLAF.Store.get(path);
    input.value = SLAF.Money.isEntered(v) ? String(o.percent ? Math.round(v * 1000) / 10 : v) : '';
    input.setAttribute('inputmode', 'decimal');
    input.addEventListener('change', function () {
      var t = input.value.trim(); var n = t === '' ? null : Number(t.replace(/[%,\s]/g, ''));
      if (n !== null && !Number.isFinite(n)) { n = null; input.value = ''; }
      if (n !== null && o.integer) n = Math.round(n);
      if (n !== null && o.percent) n = n / 100;
      SLAF.Store.set(path, n);
      if (onChange) onChange(n);
    });
  }
  function bindText(node, path, onChange) {
    var v = SLAF.Store.get(path); node.value = typeof v === 'string' ? v : '';
    node.addEventListener('change', function () { var t = node.value.trim(); SLAF.Store.set(path, t === '' ? null : t); if (onChange) onChange(t); });
  }
  function bindSelect(select, path, onChange) {
    var v = SLAF.Store.get(path); select.value = v === null ? '' : String(v);
    if (select.value !== String(v === null ? '' : v)) select.value = '';
    select.addEventListener('change', function () { var t = select.value; SLAF.Store.set(path, t === '' ? null : t); if (onChange) onChange(t === '' ? null : t); });
  }
  /* One-of buttons. options: [{ id, label }]; the value stored is the id
     (a string), or `true`/`false` when an option's id is a boolean. */
  function chips(host, options, path, onChange) {
    var cur = SLAF.Store.get(path);
    host.className = 'k-choice'; host.setAttribute('role', 'group');
    host.innerHTML = options.map(function (o) {
      return '<button type="button" class="k-chip" data-id="' + esc(String(o.id)) + '" aria-pressed="' + (cur !== null && String(cur) === String(o.id) ? 'true' : 'false') + '">' + esc(o.label) + '</button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var id = b.getAttribute('data-id'); var val = id === 'true' ? true : id === 'false' ? false : id;
      var was = b.getAttribute('aria-pressed') === 'true';
      Array.prototype.forEach.call(host.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', 'false'); });
      if (was) { SLAF.Store.set(path, null); if (onChange) onChange(null); return; }
      b.setAttribute('aria-pressed', 'true'); SLAF.Store.set(path, val); if (onChange) onChange(val);
    });
  }

  /* ---- Read-outs ------------------------------------------------------- */
  function stat(host, label, value, why, isEmpty) {
    host.className = 'k-stat';
    host.innerHTML = '<span class="k-eyebrow">' + esc(label) + '</span><div class="now' + (isEmpty ? ' is-empty' : '') + '">' + esc(value) + '</div>' + (why ? '<div class="why">' + esc(why) + '</div>' : '');
  }
  function bar(host, share, kind) {
    var w = SLAF.Money.isEntered(share) ? Math.max(0, Math.min(100, Math.round(share * 100))) : 0;
    host.className = 'k-bar' + (kind ? ' is-' + kind : '');
    host.setAttribute('role', 'progressbar'); host.setAttribute('aria-valuemin', '0'); host.setAttribute('aria-valuemax', '100'); host.setAttribute('aria-valuenow', String(w));
    host.innerHTML = '<i style="width:' + w + '%"></i>';
  }
  function words(host, T, terms) {
    var list = T.words.words.filter(function (w) { return !terms || terms.indexOf(w[0]) !== -1; });
    if (!list.length) return;
    host.className = 'k-words';
    host.innerHTML = '<details class="k-card"><summary>The words on this page</summary><dl>' + list.map(function (w) { return '<dt>' + esc(w[0]) + '</dt><dd>' + esc(w[1]) + '</dd>'; }).join('') + '</dl></details>';
  }
  function day(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  function foot(host, T, key) {
    var t = T[key]; if (!host || !t) return;
    host.className = 'k-foot';
    host.innerHTML = '<p><b>Where the guide figures come from.</b> ' + esc(t.source) + '</p><p>' + esc(t.confidenceNote) + ' Table version ' + esc(t.version) + ', as of ' + esc(t.asOf) + '.</p><p>Nothing on this page is legal, tax or medical advice. It is arithmetic on what you typed.</p>';
  }

  SLAF.K = { PAGES: PAGES, MAIN: MAIN, TOOLS: TOOLS, SITE: SITE, bookHref: bookHref, cta: cta, siteFoot: siteFoot, el: el, esc: esc, money: money, range: range, plan: plan, say: say, header: header, boot: boot,
    bindMoney: bindMoney, bindNumber: bindNumber, bindText: bindText, bindSelect: bindSelect, chips: chips, stat: stat, bar: bar, words: words, day: day, foot: foot };
})(typeof self !== 'undefined' ? self : this);
