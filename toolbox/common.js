/* ==========================================================================
   toolbox/common.js, what every Toolbox page shares (TB-001).
   --------------------------------------------------------------------------
     TB.el(id), TB.esc(s)          the usual two
     TB.header(opts)               the head every tool wears; opts: { title, lede, num }
     TB.form(spec, onChange)       bind the typed boxes once. spec: { id: kind };
                                   kind is money | rate | num | int | date | text |
                                   select | check. Returns { v, touched, read, set,
                                   setAll, clear }. Empty is null, never zero.
     TB.prefill(f, id, value, note) fill an untouched, empty box from the
                                   household and say where it came from
     TB.example(f, map)            "Try with example numbers": fills, marks the page
     TB.household()                the SPARKS household, read only, or null
     TB.verdict(id, text, kind)    the big line; kind: good | bad | incomplete | null
     TB.rows(id, rows)             a dl of [label, value, strong?]
     TB.options(id, list, bestKey) side-by-side option cards
     TB.table(id, head, rows)      a plain table
     TB.money(c), TB.rate(r, d), TB.span(months), TB.day(iso), TB.pct(x)
     TB.chart(id, html, caption)   a picture in its frame
     TB.SERIES                     the three validated chart hues

   Rules carried from SPARKS: a box left blank is "not entered" (null); every
   engine returns an incomplete Result for it and the page shows the reason,
   never a zero. Money is integer cents until it is formatted. The boxes are
   in the HTML and only ever have .value set, never while focused, never
   rebuilt (LIVE-FORM: built once, D-034). Nothing here writes to the
   household: the Toolbox reads SPARKS, SPARKS never reads the Toolbox.
   ========================================================================== */
(function (root) {
  'use strict';
  var SLAF = root.SLAF = root.SLAF || {};
  var Money = SLAF.Money;

  var SERIES = { a: '#3987e5', b: '#d95926', c: '#199e70' };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---- The head ---------------------------------------------------------- */
  function header(o) {
    var host = el('tb-head');
    if (!host) return;
    host.innerHTML = '<div class="tb-bar">'
      + '<a class="tb-wordmark" href="index.html">The Toolbox<small>ten calculators</small></a>'
      + '<nav><a href="index.html">All tools</a><a href="../index.html">SPARKS home</a><a href="../rooms/ledger.html">The Ledger</a></nav></div>'
      + (o && o.title ? '<h1 class="tb-title">' + (o.num ? '<span class="tb-num" style="display:block;font-size:var(--text-xs);color:var(--color-text-faint);letter-spacing:var(--tracking-eyebrow);margin-bottom:var(--space-1)">Tool ' + esc(o.num) + ' of 10</span>' : '') + esc(o.title) + '</h1>' : '')
      + (o && o.lede ? '<p class="tb-lede">' + esc(o.lede) + '</p>' : '')
      + '<div class="tb-acts" id="tb-acts"></div>'
      + '<p class="tb-demo">Example numbers, not yours. Type over any box to make it yours.</p>';
  }

  /* ---- The form --------------------------------------------------------- */
  function parse(kind, node) {
    if (kind === 'check') return !!node.checked;
    var raw = node.value;
    if (raw === null || raw === undefined) return null;
    raw = String(raw).trim();
    if (raw === '') return null;
    if (kind === 'money') return Money.parseMoney(raw);
    if (kind === 'rate') return Money.parseRatePercent(raw);
    if (kind === 'num' || kind === 'int') {
      var n = Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(n)) return null;
      return kind === 'int' ? Math.round(n) : n;
    }
    return raw;
  }
  function write(kind, node, value) {
    if (kind === 'check') { node.checked = !!value; return; }
    if (value === null || value === undefined) { node.value = ''; return; }
    if (kind === 'money') { node.value = Money.forInput(value).replace(/^\$/, '').replace(/^-\$/, '-'); return; }
    if (kind === 'rate') { node.value = String(Math.round(value * 10000) / 100); return; }
    node.value = String(value);
  }
  function form(spec, onChange) {
    var f = { v: {}, touched: {}, spec: spec };
    var queued = false;
    function fire() { if (queued) return; queued = true; setTimeout(function () { queued = false; f.read(); onChange(f.v); }, 0); }
    f.read = function () {
      Object.keys(spec).forEach(function (id) { var n = el(id); if (n) f.v[id] = parse(spec[id], n); });
      return f.v;
    };
    f.set = function (id, value, opts) {
      var n = el(id); if (!n || document.activeElement === n) return;
      write(spec[id], n, value);
      if (opts && opts.touched) f.touched[id] = true;
      f.v[id] = parse(spec[id], n);
    };
    f.setAll = function (map, opts) { Object.keys(map).forEach(function (id) { f.set(id, map[id], opts); }); fire(); };
    f.clear = function () {
      Object.keys(spec).forEach(function (id) { var n = el(id); if (n) { write(spec[id], n, null); var fr = el(id + '-from'); if (fr) fr.textContent = ''; } });
      f.touched = {}; document.body.classList.remove('is-demo'); fire();
    };
    Object.keys(spec).forEach(function (id) {
      var n = el(id); if (!n) return;
      var ev = spec[id] === 'select' || spec[id] === 'check' || spec[id] === 'date' ? 'change' : 'input';
      n.addEventListener(ev, function () { f.touched[id] = true; var fr = el(id + '-from'); if (fr) fr.textContent = ''; fire(); });
      if (ev === 'input') n.addEventListener('change', fire);
    });
    f.read();
    return f;
  }
  function prefill(f, id, value, note) {
    if (f.touched[id]) return false;
    if (value === null || value === undefined) return false;
    var n = el(id); if (!n || document.activeElement === n) return false;
    if (String(n.value).trim() !== '' && f.v[id] !== null && f.v[id] !== undefined && !n.dataset.prefilled) return false;
    write(f.spec[id], n, value);
    n.dataset.prefilled = '1';
    f.v[id] = parse(f.spec[id], n);
    var fr = el(id + '-from'); if (fr) fr.textContent = note || 'from your Ledger';
    return true;
  }
  function example(f, map) {
    document.body.classList.add('is-demo');
    Object.keys(map).forEach(function (id) { var fr = el(id + '-from'); if (fr) fr.textContent = 'example'; });
    f.setAll(map, { touched: true });
  }
  function actions(f, exampleMap, extraHtml) {
    var host = el('tb-acts'); if (!host) return;
    host.innerHTML = '<button type="button" class="slaf-btn slaf-btn--primary" id="tb-example">Try with example numbers</button>'
      + '<button type="button" class="slaf-btn slaf-btn--quiet" id="tb-clear">Clear</button>' + (extraHtml || '');
    el('tb-example').addEventListener('click', function () { example(f, typeof exampleMap === 'function' ? exampleMap() : exampleMap); });
    el('tb-clear').addEventListener('click', function () { f.clear(); });
  }

  /* ---- The household, read only ------------------------------------------ */
  function household() {
    try { return SLAF.Spine && SLAF.Spine.getProfile ? SLAF.Spine.getProfile() : null; } catch (e) { return null; }
  }
  function okValue(r) { return r && r.status === 'ok' ? r.value : null; }

  /* ---- Formatting --------------------------------------------------------- */
  function money(c) { return Money.formatCents(c); }
  function rate(r, d) { return Money.formatRate(r, { decimals: d === undefined ? 2 : d }); }
  function pct(x, d) { return Money.formatRate(x, { decimals: d === undefined ? 0 : d }); }
  function span(months) {
    if (!Money.isEntered(months)) return Money.NOT_YET;
    var m = Math.round(months);
    if (m < 1) return 'under a month';
    var y = Math.floor(m / 12), r = m % 12;
    var parts = [];
    if (y) parts.push(y + (y === 1 ? ' year' : ' years'));
    if (r) parts.push(r + (r === 1 ? ' month' : ' months'));
    return parts.join(' ');
  }
  function day(iso, opts) {
    if (!iso) return '';
    var d = new Date(iso.length <= 10 ? iso + 'T12:00:00Z' : iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', Object.assign({ month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }, opts || {}));
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ---- Rendering pieces -------------------------------------------------- */
  function verdict(id, text, kind) {
    var n = el(id); if (!n) return;
    n.textContent = text || '';
    n.className = 'tb-verdict' + (kind ? ' is-' + kind : '');
  }
  function incomplete(id, result, alsoClear) {
    verdict(id, (result && result.reason) || 'Fill in the boxes above to see this.', 'incomplete');
    (alsoClear || []).forEach(function (x) { var n = el(x); if (n) { n.innerHTML = ''; n.hidden = true; } });
  }
  function rows(id, list) {
    var n = el(id); if (!n) return;
    n.hidden = false;
    n.innerHTML = '<dl>' + list.map(function (r) {
      var s = r[2] ? ' class="is-strong"' : '';
      return '<dt' + s + '>' + esc(r[0]) + '</dt><dd' + s + '>' + esc(r[1]) + '</dd>';
    }).join('') + '</dl>';
  }
  function options(id, list, bestKey) {
    var n = el(id); if (!n) return;
    n.hidden = false;
    n.innerHTML = list.map(function (o) {
      return '<div class="tb-option' + (o.key === bestKey ? ' is-best' : '') + '">'
        + (o.key === bestKey ? '<span class="tb-tag">' + esc(o.tag || 'cheapest') + '</span>' : '')
        + '<span class="tb-k">' + (o.color ? '<i class="tb-swatch" style="background:' + o.color + '"></i>' : '') + esc(o.label) + '</span>'
        + '<span class="tb-v">' + esc(o.value) + '</span>'
        + (o.sub ? '<span class="tb-s">' + o.sub + '</span>' : '') + '</div>';
    }).join('');
  }
  function table(id, head, body, opts) {
    var n = el(id); if (!n) return;
    n.hidden = false;
    n.innerHTML = '<table class="tb-table">' + (head ? '<tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' : '')
      + body.map(function (r) {
        var cls = r.cls ? ' class="' + r.cls + '"' : '';
        return '<tr' + cls + '>' + r.cells.map(function (c) { return typeof c === 'object' && c ? '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c.html !== undefined ? c.html : esc(c.text)) + '</td>' : '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table>';
  }
  function chart(id, html, caption) {
    var n = el(id); if (!n) return;
    n.hidden = false;
    n.innerHTML = html + (caption ? '<p class="tb-cap">' + caption + '</p>' : '');
  }
  function flag(id, html, kind) {
    var n = el(id); if (!n) return;
    if (!html) { n.hidden = true; n.innerHTML = ''; return; }
    n.hidden = false; n.className = 'tb-flag' + (kind ? ' is-' + kind : ''); n.innerHTML = html;
  }
  function show(id, on) { var n = el(id); if (n) n.hidden = !on; }

  /* The engines register under SLAF.TB before this file loads; merge, never replace. */
  var TB = SLAF.TB = SLAF.TB || {};
  var api = {
    SERIES: SERIES, el: el, esc: esc, header: header, form: form, prefill: prefill, example: example, actions: actions,
    household: household, okValue: okValue,
    money: money, rate: rate, pct: pct, span: span, day: day, today: today,
    verdict: verdict, incomplete: incomplete, rows: rows, options: options, table: table, chart: chart, flag: flag, show: show
  };
  Object.keys(api).forEach(function (k) { TB[k] = api[k]; });
})(typeof self !== 'undefined' ? self : this);
/* A household accessor hands back a Result or a plain value; this takes either. */
(function (root) {
  var TB = root.SLAF && root.SLAF.TB; if (!TB) return;
  TB.val = function (x) { if (x === null || x === undefined) return null; if (typeof x === 'object' && 'status' in x) return x.status === 'ok' ? x.value : null; return x; };
})(typeof self !== 'undefined' ? self : this);
