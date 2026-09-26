/* ==========================================================================
   leads/common.js, the pieces the two ladder screens share. LD-005.
   --------------------------------------------------------------------------
     UI.el(id), UI.esc(s)         the usual two
     UI.param(name)               a query parameter
     UI.say(id, text, kind)       a status line ('good' | 'bad' | null)
     UI.header(opts)              the one header both screens wear
     UI.chart(host, id, spec, opts)  a picture in its frame: the drawing,
                                  the legend, "Show as a table", hover and
                                  focus tips. Type and theme are kept in the
                                  store's prefs.
     UI.redraw(host, spec)        draw it again
     UI.download(name, text)      hand the person a file
     UI.readFile(input)           Promise<text>
     UI.money(cents), UI.rate(r), UI.count(n)   formatting, at display only
   ========================================================================== */
(function (root) {
  'use strict';
  var SLAF = root.SLAF = root.SLAF || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function param(name) { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location.search || ''); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null; }
  function say(id, text, kind) { var n = el(id); if (!n) return; n.textContent = text || ''; n.className = 'lz-say' + (kind === 'good' ? ' is-good' : kind === 'bad' ? ' is-bad' : ''); }
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function readFile(input) {
    return new Promise(function (resolve, reject) {
      var f = input && input.files && input.files[0]; if (!f) { reject(new Error('Choose a file first.')); return; }
      var r = new FileReader(); r.onload = function () { resolve(String(r.result)); }; r.onerror = function () { reject(new Error('That file did not read.')); }; r.readAsText(f);
    });
  }
  function money(c) { return SLAF.Money && SLAF.Money.isEntered(c) ? SLAF.Money.formatCents(c) : 'not yet'; }
  function rate(r) { return typeof r === 'number' && isFinite(r) ? (Math.round(r * 1000) / 10) + '%' : 'not yet'; }
  function count(n, d) { return typeof n === 'number' && isFinite(n) ? (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString('en-US') : 'not yet'; }

  function header(o) {
    var demo = o.demo ? '<span class="lz-demo" title="Every number on this page is invented">Example numbers</span>' : '';
    return '<header class="lz-head"><div class="lz-brand"><a class="lz-wordmark" href="index.html">The Leads Ladder</a><span class="lz-screen">' + esc(o.screen || '') + '</span></div>'
      + '<nav class="lz-nav" aria-label="Screens"><a href="index.html"' + (o.screen === 'The Sky' ? ' aria-current="page"' : '') + '>Sky</a><a href="machine.html"' + (o.screen === 'The Machine' ? ' aria-current="page"' : '') + '>Machine</a><a href="index.html#book">Book</a></nav>'
      + '<div class="lz-head-title"><h1>' + esc(o.title || '') + '</h1>' + (o.sub ? '<p class="lz-sub">' + o.sub + '</p>' : '') + demo + '</div></header>';
  }

  /* ---- Charts in their frame ---------------------------------------------------- */
  var frames = {}, seq = 0;
  function Charts() { return SLAF.Charts; }
  function prefsOf(id) { var p = SLAF.Store ? SLAF.Store.prefs() : { charts: {} }; return (p.charts && p.charts[id]) || {}; }
  function draw(host) {
    var f = frames[host.id]; if (!f) return;
    var pic = host.querySelector('.lz-ck-pic'), width = Math.max(240, Math.min(f.opts.width || 640, host.clientWidth ? host.clientWidth - 26 : 640));
    var r = Charts().render(f.spec, Object.assign({ width: width, height: f.opts.height }, prefsOf(f.id)));
    pic.innerHTML = r.svg; pic.setAttribute('data-tips', JSON.stringify(r.tips || []));
    host.querySelector('.lz-ck-legend').innerHTML = r.legend || '';
    var th = host.querySelector('.lz-ck-table'); if (!th.hidden) th.innerHTML = Charts().table(f.spec);
    var now = host.querySelector('.lz-ck-type'); if (now) now.textContent = '';
  }
  function chart(host, id, spec, opts) {
    if (!host) return;
    host.id = host.id || ('lz-ck-' + id + '-' + (++seq));
    frames[host.id] = { id: id, spec: spec, opts: opts || {} };
    host.classList.add('lz-ck');
    var types = Charts().types(spec.kind);
    host.innerHTML = '<div class="lz-ck-head">' + (opts && opts.hideTitle ? '' : '<h3 class="lz-ck-title">' + esc(spec.title) + '</h3>') + (opts && opts.note ? '<p class="lz-ck-note">' + esc(opts.note) + '</p>' : '')
      + '<div class="lz-ck-tools no-print"><button type="button" class="slaf-linkbtn lz-ck-tool" data-lz-table aria-expanded="false">Show as a table</button>'
      + (types.length > 1 ? '<span class="lz-ck-types">' + types.map(function (t) { return '<button type="button" class="slaf-linkbtn lz-ck-tool" data-lz-type="' + t.id + '">' + esc(t.label) + '</button>'; }).join('') + '</span>' : '') + '</div></div>'
      + '<div class="lz-ck-pic"></div><div class="lz-ck-legend"></div><div class="lz-ck-table" hidden></div><div class="lz-ck-tip" role="status" hidden></div>';
    draw(host);
  }
  function redraw(host, spec) { var f = frames[host.id]; if (!f) return; if (spec) f.spec = spec; draw(host); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-lz-table],[data-lz-type]') : null; if (!b) return;
    var host = b.closest('.lz-ck'); if (!host || !frames[host.id]) return;
    if (b.hasAttribute('data-lz-table')) { var th = host.querySelector('.lz-ck-table'); th.hidden = !th.hidden; b.setAttribute('aria-expanded', String(!th.hidden)); draw(host); return; }
    if (SLAF.Store) SLAF.Store.setChartPref(frames[host.id].id, { type: b.getAttribute('data-lz-type') });
    draw(host);
  });
  function showTip(host, text, x, y) {
    var tip = host.querySelector('.lz-ck-tip'); if (!tip) return;
    tip.textContent = text; tip.hidden = false;
    var r = host.getBoundingClientRect();
    tip.style.left = Math.max(0, Math.min(x - r.left + 12, r.width - tip.offsetWidth - 4)) + 'px';
    tip.style.top = Math.max(0, y - r.top - tip.offsetHeight - 10) + 'px';
  }
  function hideTip(host) { var tip = host.querySelector('.lz-ck-tip'); if (tip) tip.hidden = true; }
  function markTip(e) {
    var m = e.target.closest ? e.target.closest('.ck-mark') : null; if (!m) return;
    var host = m.closest('.lz-ck'); if (!host) return;
    var r = m.getBoundingClientRect();
    showTip(host, m.getAttribute('data-tip') || '', e.clientX || r.left + r.width / 2, e.clientY || r.top);
  }
  document.addEventListener('pointerover', markTip);
  document.addEventListener('focusin', markTip);
  document.addEventListener('pointerout', function (e) { var m = e.target.closest && e.target.closest('.ck-mark'); if (m) { var host = m.closest('.lz-ck'); if (host) hideTip(host); } });
  document.addEventListener('focusout', function (e) { var m = e.target.closest && e.target.closest('.ck-mark'); if (m) { var host = m.closest('.lz-ck'); if (host) hideTip(host); } });
  var resizeT = null;
  root.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { for (var id in frames) { var h = el(id); if (h) draw(h); } }, 150); });

  SLAF.UI = { el: el, esc: esc, param: param, say: say, header: header, chart: chart, redraw: redraw, download: download, readFile: readFile, money: money, rate: rate, count: count };
})(typeof self !== 'undefined' ? self : this);
