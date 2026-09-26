/* ==========================================================================
   coach/common.js, the pieces the three coach screens share (CD-006, CD-009, CD-010).
   --------------------------------------------------------------------------
     CoachUI.el(id), esc(s)       the usual two
     CoachUI.param(name)          a query parameter
     CoachUI.say(id, text, kind)  a status line ('good' | 'bad' | null)
     CoachUI.download(name, text, mime)
     CoachUI.readFile(input)      Promise<text> of the chosen file
     CoachUI.clientOr(id)         the roster entry, or null (never a guess)
     CoachUI.duration(ms)         '1h 05m' / '12m'
     CoachUI.day(iso)             'Sep 24, 2026'
     CoachUI.header(opts)         the one header every screen wears
     CoachUI.help(kind, id, T)    a "What is this?" toggle and its panel, from
                                  data/help.json (kind: 'field' | 'readout' | 'stop')
     CoachUI.words(T)             the Words panel: every term in one sentence
     CoachUI.chart(host, id, spec, opts)   a chart in its frame: the picture,
                                  the legend, Customise (type, theme, a swatch a
                                  series), Show as a table, and hover or focus
                                  tips. Choices are kept in coach.prefs.v1.
     CoachUI.redraw(host)         draw it again (the numbers changed)
   ========================================================================== */
(function (root) {
  'use strict';
  var SLAF = root.SLAF = root.SLAF || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location.search || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }
  function say(id, text, kind) {
    var n = el(id); if (!n) return;
    n.textContent = text || '';
    n.className = 'coach-say' + (kind === 'good' ? ' is-good' : kind === 'bad' ? ' is-bad' : '');
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function readFile(input) {
    return new Promise(function (resolve, reject) {
      var f = input && input.files && input.files[0];
      if (!f) { reject(new Error('Choose a file first.')); return; }
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('That file did not read.')); };
      r.readAsText(f);
    });
  }
  function clientOr(id) { return id && SLAF.Coach ? SLAF.Coach.client(id) : null; }
  function duration(ms) {
    if (typeof ms !== 'number' || ms < 0) return '';
    var m = Math.round(ms / 60000), h = Math.floor(m / 60);
    return h ? h + 'h ' + ('0' + (m - h * 60)).slice(-2) + 'm' : m + 'm';
  }
  function day(iso) {
    if (!iso) return '';
    var d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ---- The header ------------------------------------------------------------
     opts: { screen, title, sub, actions (html), presenter } */
  function header(o) {
    return '<header class="coach-head' + (o.presenter ? ' coach-head--presenter' : '') + '">'
      + '<div class="coach-head-brand">' + (o.presenter ? '<span class="coach-wordmark">Your plan</span>' : '<a class="coach-wordmark" href="index.html">Money Coach</a>')
      + (o.screen ? '<span class="coach-screen">' + esc(o.screen) + '</span>' : '') + '</div>'
      + '<div class="coach-head-title"><h1>' + esc(o.title || '') + '</h1>' + (o.sub ? '<p class="coach-head-sub">' + o.sub + '</p>' : '') + '</div>'
      + '<div class="coach-actions coach-head-actions">' + (o.actions || '') + '</div></header>';
  }

  /* ---- Help: the plain words beside every box, read-out and stop ------------- */
  var helpSeq = 0;
  function helpEntry(kind, id, T) {
    var H = T && T.coachHelp; if (!H) return null;
    if (kind === 'field') return H.fields[id] || null;
    if (kind === 'readout') return H.readouts[id] || null;
    if (kind === 'stop') return H.stops[id] || null;
    return null;
  }
  function help(kind, id, T, label) {
    var e = helpEntry(kind, id, T); if (!e) return '';
    var pid = 'help-' + kind + '-' + id + '-' + (++helpSeq);
    var body;
    if (kind === 'field') body = '<p class="help-q">' + esc(e.plain) + '</p><dl>'
      + '<dt>What it means</dt><dd>' + esc(e.means) + '</dd>'
      + '<dt>Where to find it</dt><dd>' + esc(e.look) + '</dd>'
      + (e.example ? '<dt>For example</dt><dd>' + esc(e.example) + '</dd>' : '')
      + '<dt>Not sure?</dt><dd>' + esc(e.unsure) + '</dd></dl>';
    else if (kind === 'readout') body = '<p>' + esc(e.what) + '</p>' + (e.good ? '<p class="help-good"><b>Good looks like:</b> ' + esc(e.good) + '</p>' : '');
    else body = '<p>' + esc(e.intro) + '</p><p class="help-good"><b>Done when:</b> ' + esc(e.done) + '</p>';
    return '<button type="button" class="help-btn" aria-expanded="false" aria-controls="' + pid + '" aria-label="What is this? ' + esc(label || e.label || e.plain || e.title || id) + '"><span aria-hidden="true">?</span></button>'
      + '<div class="help-panel" id="' + pid + '" hidden>' + body + '</div>';
  }
  function words(T) {
    var H = T && T.coachHelp; if (!H) return '';
    return '<dl class="words">' + (H.words || []).map(function (w) { return '<div><dt>' + esc(w[0]) + '</dt><dd>' + esc(w[1]) + '</dd></div>'; }).join('') + '</dl>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.help-btn'); if (!b) return;
    var p = document.getElementById(b.getAttribute('aria-controls')); if (!p) return;
    var open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open)); p.hidden = open;
  });

  /* ---- Charts in their frame ------------------------------------------------- */
  var frames = {};              /* host element id -> { id, spec, opts } */
  function Charts() { return SLAF.Charts; }
  function Coach() { return SLAF.Coach; }
  function prefsOf(id) { var C = Coach(); return C && C.chartPref ? C.chartPref(id) : {}; }
  function widthOf(host) { return Math.max(240, (host.clientWidth || host.parentElement && host.parentElement.clientWidth || 600) - 2); }
  function draw(host) {
    var f = frames[host.id]; if (!f) return;
    var p = prefsOf(f.id), C = Charts();
    var r = C.render(f.spec, { type: p.type || f.opts.type, theme: p.theme || f.opts.theme, colors: p.colors || {}, width: widthOf(host) - (f.opts.pad || 0), height: f.opts.height });
    var pic = host.querySelector('.ck-pic'); pic.innerHTML = r.svg;
    host.querySelector('.ck-legend-host').innerHTML = r.legend;
    host.querySelector('.ck-table-host').innerHTML = C.table(f.spec);
    host.setAttribute('data-type', r.type);
    pic.setAttribute('data-tips', JSON.stringify(r.tips || []));
    /* the Customise panel: the types that fit, the themes, a swatch a series */
    var ctl = host.querySelector('.ck-controls');
    if (ctl && ctl.hidden === false) ctl.innerHTML = controls(f, r);
    var typeBtn = host.querySelector('.ck-type-now'); if (typeBtn) typeBtn.textContent = (C.types(f.spec.kind).filter(function (t) { return t.id === r.type; })[0] || {}).label || '';
    host.querySelector('.ck-picked').textContent = '';
  }
  function controls(f, r) {
    var C = Charts(), p = prefsOf(f.id);
    var types = C.types(f.spec.kind);
    var list = f.spec.slices || f.spec.series || f.spec.items || [];
    var themeNow = p.theme || f.opts.theme || 'sapphire';
    var h = '<div class="ck-ctl-row"><span class="ck-ctl-label">Draw it as</span><div class="ck-ctl-btns">' + types.map(function (t) {
      return '<button type="button" class="slaf-btn slaf-btn--small' + (t.id === r.type ? ' slaf-btn--primary' : '') + '" data-ck-type="' + esc(t.id) + '" aria-pressed="' + String(t.id === r.type) + '">' + esc(t.label) + '</button>';
    }).join('') + '</div></div>';
    h += '<div class="ck-ctl-row"><span class="ck-ctl-label">Colours</span><div class="ck-ctl-btns">' + C.THEMES.map(function (t) {
      return '<button type="button" class="ck-theme' + (t.id === themeNow ? ' is-on' : '') + '" data-ck-theme="' + esc(t.id) + '" aria-pressed="' + String(t.id === themeNow) + '" aria-label="' + esc(t.label) + ' colours"><span class="ck-theme-dots">' + t.order.slice(0, 4).map(function (n) { return '<i style="background:' + C.HUES[n] + '"></i>'; }).join('') + '</span>' + esc(t.label) + '</button>';
    }).join('') + '</div></div>';
    if (list.length && list.length <= 8 && f.spec.kind !== 'meter' && f.spec.kind !== 'range' && !f.spec.oneColor) {
      h += '<div class="ck-ctl-row"><span class="ck-ctl-label">One by one</span><div class="ck-series">' + list.map(function (s, i) {
        var id = s.id || ('s' + i), now = C.hueName(r.colors[i]);
        return '<div class="ck-series-row"><span class="ck-series-name"><span class="ck-key" style="background:' + r.colors[i] + '"></span>' + esc(s.label) + '</span><span class="ck-swatches" role="group" aria-label="Colour for ' + esc(s.label) + '">' + Object.keys(C.HUES).map(function (n) {
          return '<button type="button" class="ck-swatch' + (n === now ? ' is-on' : '') + '" data-ck-series="' + esc(id) + '" data-ck-hue="' + n + '" aria-pressed="' + String(n === now) + '" aria-label="' + n + '" style="background:' + C.HUES[n] + '"></button>';
        }).join('') + '</span></div>';
      }).join('') + '</div></div>';
    }
    h += '<div class="ck-ctl-row"><button type="button" class="slaf-linkbtn" data-ck-reset="1">Back to the usual</button></div>';
    return h;
  }
  function chart(host, id, spec, opts) {
    if (!host) return;
    var o = opts || {};
    host.id = host.id || ('ck-' + id + '-' + (++helpSeq));
    frames[host.id] = { id: id, spec: spec, opts: o };
    host.classList.add('ck');
    host.innerHTML = '<div class="ck-head">' + (o.hideTitle ? '' : '<h3 class="ck-title">' + esc(spec.title) + '</h3>') + (o.note ? '<p class="ck-note">' + esc(o.note) + '</p>' : '')
      + (o.bare ? '' : '<div class="ck-tools no-print"><button type="button" class="slaf-linkbtn ck-tool" data-ck-open="table" aria-expanded="false">Show as a table</button>'
        + '<button type="button" class="slaf-linkbtn ck-tool" data-ck-open="controls" aria-expanded="false">Customise <span class="ck-type-now"></span></button></div>') + '</div>'
      + '<div class="ck-body"><div class="ck-pic"></div><div class="ck-legend-host"></div><span class="ck-picked" aria-live="polite"></span></div>'
      + '<div class="ck-controls" hidden></div><div class="ck-table-host" hidden></div><div class="ck-tip" role="status" hidden></div>';
    draw(host);
  }
  function redraw(host, spec) { var f = frames[host.id]; if (!f) return; if (spec) f.spec = spec; draw(host); }
  function frameOf(node) { var host = node.closest('.ck'); return host && frames[host.id] ? { host: host, f: frames[host.id] } : null; }
  document.addEventListener('click', function (e) {
    var t = e.target, b, ctx;
    if ((b = t.closest('[data-ck-open]'))) {
      ctx = frameOf(b); if (!ctx) return;
      var which = b.getAttribute('data-ck-open'), panel = ctx.host.querySelector(which === 'table' ? '.ck-table-host' : '.ck-controls');
      var open = !panel.hidden;
      panel.hidden = open; b.setAttribute('aria-expanded', String(!open));
      if (!open && which === 'controls') { var r = Charts().render(ctx.f.spec, Object.assign({ width: 400 }, prefsOf(ctx.f.id))); panel.innerHTML = controls(ctx.f, r); }
      return;
    }
    if ((b = t.closest('[data-ck-type]'))) { ctx = frameOf(b); if (!ctx) return; Coach().setChartPref(ctx.f.id, { type: b.getAttribute('data-ck-type') }); draw(ctx.host); return; }
    if ((b = t.closest('[data-ck-theme]'))) { ctx = frameOf(b); if (!ctx) return; Coach().setChartPref(ctx.f.id, { theme: b.getAttribute('data-ck-theme'), colors: null }); var o = Coach().prefs(); delete o.charts[ctx.f.id].colors; Coach().setChartPref(ctx.f.id, {}); draw(ctx.host); return; }
    if ((b = t.closest('[data-ck-series]'))) { ctx = frameOf(b); if (!ctx) return; var c = {}; c[b.getAttribute('data-ck-series')] = b.getAttribute('data-ck-hue'); Coach().setChartPref(ctx.f.id, { colors: c }); draw(ctx.host); return; }
    if ((b = t.closest('[data-ck-reset]'))) { ctx = frameOf(b); if (!ctx) return; var P = Coach().prefs(); delete P.charts[ctx.f.id]; Coach().setPref('charts', P.charts); draw(ctx.host); return; }
  });
  /* Tips: a mark's own on hover or focus; the crosshair on a line or area. */
  function showTip(host, text, x, y) {
    var tip = host.querySelector('.ck-tip'); if (!tip) return;
    tip.textContent = ''; tip.hidden = false;
    if (typeof text === 'string') tip.textContent = text;
    else { tip.appendChild(text); }
    var r = host.getBoundingClientRect();
    var left = Math.max(0, Math.min(x - r.left + 12, r.width - tip.offsetWidth - 4)), top = Math.max(0, y - r.top - tip.offsetHeight - 10);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideTip(host) { var tip = host.querySelector('.ck-tip'); if (tip) tip.hidden = true; var cross = host.querySelector('.ck-cross'); if (cross) cross.style.display = 'none'; }
  function markTip(e) {
    var m = e.target.closest ? e.target.closest('.ck-mark') : null; if (!m) return;
    var host = m.closest('.ck'); if (!host) return;
    var r = m.getBoundingClientRect();
    showTip(host, m.getAttribute('data-tip') || '', e.clientX || r.left + r.width / 2, e.clientY || r.top);
  }
  document.addEventListener('pointerover', markTip);
  document.addEventListener('focusin', function (e) { markTip(e); var m = e.target.closest && e.target.closest('.ck-mark'); if (m) { var host = m.closest('.ck'); var live = host && host.querySelector('.ck-picked'); if (live) live.textContent = m.getAttribute('data-tip') || ''; } });
  document.addEventListener('pointerout', function (e) { var m = e.target.closest && e.target.closest('.ck-mark, .ck-hover'); if (m) { var host = m.closest('.ck'); if (host) hideTip(host); } });
  document.addEventListener('focusout', function (e) { var m = e.target.closest && e.target.closest('.ck-mark'); if (m) { var host = m.closest('.ck'); if (host) hideTip(host); } });
  document.addEventListener('pointermove', function (e) {
    var hv = e.target.closest ? e.target.closest('.ck-hover') : null; if (!hv) return;
    var host = hv.closest('.ck'), svg = hv.closest('svg'), pic = host.querySelector('.ck-pic'); if (!host || !svg) return;
    var tips = []; try { tips = JSON.parse(pic.getAttribute('data-tips') || '[]'); } catch (err) { tips = []; }
    if (!tips.length) return;
    var box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, scale = vb.width / box.width;
    var px = (e.clientX - box.left) * scale;
    var best = 0; tips.forEach(function (t, i) { if (Math.abs(t.x - px) < Math.abs(tips[best].x - px)) best = i; });
    var cross = svg.querySelector('.ck-cross'); if (cross) { cross.style.display = ''; cross.setAttribute('x1', tips[best].x); cross.setAttribute('x2', tips[best].x); }
    var frag = document.createDocumentFragment();
    var head = document.createElement('b'); head.textContent = tips[best].label; frag.appendChild(head);
    tips[best].rows.forEach(function (row) { var d = document.createElement('div'); var k = document.createElement('span'); k.className = 'ck-key ck-key--line'; k.style.background = row.color; d.appendChild(k); var v = document.createElement('strong'); v.textContent = row.text + ' '; d.appendChild(v); d.appendChild(document.createTextNode(row.label)); frag.appendChild(d); });
    showTip(host, frag, box.left + tips[best].x / scale, e.clientY);
  });
  var resizeTimer = null;
  root.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { Object.keys(frames).forEach(function (id) { var host = document.getElementById(id); if (host) draw(host); else delete frames[id]; }); }, 150); });

  SLAF.CoachUI = { el: el, esc: esc, param: param, say: say, download: download, readFile: readFile, clientOr: clientOr, duration: duration, day: day,
    header: header, help: help, words: words, chart: chart, redraw: redraw };
})(typeof self !== 'undefined' ? self : this);
