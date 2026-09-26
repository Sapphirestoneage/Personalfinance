/* ==========================================================================
   marketing/common.js, the pieces the three screens share. MD-005.
   --------------------------------------------------------------------------
     MktUI.el(id), esc(s)          the usual two
     MktUI.say(id, text, kind)     a status line ('good' | 'bad' | null)
     MktUI.download(name, text, mime)
     MktUI.readFile(input)         Promise<text> of the chosen file
     MktUI.day(iso)                'Sep 24, 2026'
     MktUI.n(v), pct(v), money(cents)   'not yet' when null, never a fake 0
     MktUI.header(opts)            the one header, with the three screens
     MktUI.help(kind, id, T)       a "?" and its plain-words panel
     MktUI.words(T)                the Words panel
     MktUI.label(list, id)         a table row's label from data/tables.json
     MktUI.options(list, now)      <option>s from a table
     MktUI.chart(host, id, spec, opts)   a chart in its frame (the coach's
                                   charts.js): picture, legend, Customise,
                                   a table view, hover and focus tips
     MktUI.redraw(host, spec)
     MktUI.csv(rows, columns)      rows to CSV text, formula-safe
     MktUI.boot(fn)                tables loaded, then fn(T)
   ========================================================================== */
(function (root) {
  'use strict';
  var SLAF = root.SLAF = root.SLAF || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function say(id, text, kind) {
    var n = el(id); if (!n) return;
    n.textContent = text || '';
    n.className = 'mkt-say' + (kind === 'good' ? ' is-good' : kind === 'bad' ? ' is-bad' : '');
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
  function day(iso) {
    if (!iso) return '';
    var d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function n(v) { return num(v) ? v.toLocaleString('en-US') : 'not yet'; }
  function pct(v) { return num(v) ? (Math.round(v * 1000) / 10) + '%' : 'not yet'; }
  function money(cents) { return num(cents) ? (SLAF.Money ? SLAF.Money.formatCents(cents) : '$' + Math.round(cents / 100).toLocaleString('en-US')) : 'not yet'; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function label(list, id) { var row = (list || []).filter(function (r) { return r.id === id; })[0]; return row ? row.label : (id || ''); }
  function options(list, now) { return (list || []).map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === now ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }).join(''); }

  /* ---- The header ------------------------------------------------------------ */
  var SCREENS = [['index.html', 'Scoreboard'], ['posts.html', 'Content'], ['people.html', 'People']];
  function header(o) {
    var here = (root.location.pathname.split('/').pop() || 'index.html');
    var demo = SLAF.Mkt && SLAF.Mkt.isDemo();
    return '<header class="mkt-head">'
      + '<div class="mkt-head-brand"><a class="mkt-wordmark" href="index.html">Marketing Scoreboard</a><span class="mkt-screen">' + esc(o.screen || '') + '</span></div>'
      + '<div class="mkt-head-title"><h1>' + esc(o.title || '') + '</h1>' + (o.sub ? '<p class="mkt-head-sub">' + o.sub + '</p>' : '') + '</div>'
      + '<nav class="mkt-nav" aria-label="Screens">' + SCREENS.map(function (s) { return '<a href="' + s[0] + '"' + (here === s[0] ? ' aria-current="page"' : '') + '>' + s[1] + '</a>'; }).join('') + '</nav>'
      + (demo ? '<p class="mkt-demo-bar"><span class="demo-tag">Example data</span> These are made-up numbers. <button type="button" class="slaf-linkbtn" data-demo-clear="1">Clear them and start fresh</button></p>' : '')
      + '</header>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-demo-clear]'); if (!b) return;
    if (root.confirm('Clear the example data? Nothing of yours is in it.')) { SLAF.Mkt.clearAll(); root.location.reload(); }
  });

  /* ---- Help: the plain words --------------------------------------------------- */
  var seq = 0;
  function help(kind, id, T, lbl) {
    var H = T && T.help; if (!H) return '';
    var e = kind === 'field' ? H.fields[id] : H.readouts[id]; if (!e) return '';
    var pid = 'help-' + kind + '-' + id + '-' + (++seq);
    var body = kind === 'field' ? '<p class="help-q">' + esc(e.plain) + '</p><p>' + esc(e.means) + '</p>'
      : '<p>' + esc(e.what) + '</p>' + (e.good ? '<p class="help-good"><b>Good looks like:</b> ' + esc(e.good) + '</p>' : '');
    return '<button type="button" class="help-btn" aria-expanded="false" aria-controls="' + pid + '" aria-label="What is this? ' + esc(lbl || e.plain || id) + '"><span aria-hidden="true">?</span></button>'
      + '<div class="help-panel" id="' + pid + '" hidden>' + body + '</div>';
  }
  function words(T) {
    var H = T && T.help; if (!H) return '';
    return '<dl class="words">' + (H.words || []).map(function (w) { return '<div><dt>' + esc(w[0]) + '</dt><dd>' + esc(w[1]) + '</dd></div>'; }).join('') + '</dl>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.help-btn'); if (!b) return;
    var p = document.getElementById(b.getAttribute('aria-controls')); if (!p) return;
    var open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open)); p.hidden = open;
  });

  /* ---- Charts in their frame (the coach's module, the Scoreboard's prefs) ------ */
  var frames = {};
  function Charts() { return SLAF.Charts; }
  function Mkt() { return SLAF.Mkt; }
  function prefsOf(id) { var M = Mkt(); return M && M.chartPref ? M.chartPref(id) : {}; }
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
      return '<button type="button" class="ck-theme' + (t.id === themeNow ? ' is-on' : '') + '" data-ck-theme="' + esc(t.id) + '" aria-pressed="' + String(t.id === themeNow) + '" aria-label="' + esc(t.label) + ' colours"><span class="ck-theme-dots">' + t.order.slice(0, 4).map(function (nm) { return '<i style="background:' + C.HUES[nm] + '"></i>'; }).join('') + '</span>' + esc(t.label) + '</button>';
    }).join('') + '</div></div>';
    if (list.length && list.length <= 8 && f.spec.kind !== 'meter' && f.spec.kind !== 'range' && !f.spec.oneColor) {
      h += '<div class="ck-ctl-row"><span class="ck-ctl-label">One by one</span><div class="ck-series">' + list.map(function (s, i) {
        var id = s.id || ('s' + i), now = C.hueName(r.colors[i]);
        return '<div class="ck-series-row"><span class="ck-series-name"><span class="ck-key" style="background:' + r.colors[i] + '"></span>' + esc(s.label) + '</span><span class="ck-swatches" role="group" aria-label="Colour for ' + esc(s.label) + '">' + Object.keys(C.HUES).map(function (nm) {
          return '<button type="button" class="ck-swatch' + (nm === now ? ' is-on' : '') + '" data-ck-series="' + esc(id) + '" data-ck-hue="' + nm + '" aria-pressed="' + String(nm === now) + '" aria-label="' + nm + '" style="background:' + C.HUES[nm] + '"></button>';
        }).join('') + '</span></div>';
      }).join('') + '</div></div>';
    }
    h += '<div class="ck-ctl-row"><button type="button" class="slaf-linkbtn" data-ck-reset="1">Back to the usual</button></div>';
    return h;
  }
  function chart(host, id, spec, opts) {
    if (!host) return;
    var o = opts || {};
    host.id = host.id || ('ck-' + id + '-' + (++seq));
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
    if ((b = t.closest('[data-ck-type]'))) { ctx = frameOf(b); if (!ctx) return; Mkt().setChartPref(ctx.f.id, { type: b.getAttribute('data-ck-type') }); draw(ctx.host); return; }
    if ((b = t.closest('[data-ck-theme]'))) { ctx = frameOf(b); if (!ctx) return; Mkt().setChartPref(ctx.f.id, { theme: b.getAttribute('data-ck-theme'), colors: null }); draw(ctx.host); return; }
    if ((b = t.closest('[data-ck-series]'))) { ctx = frameOf(b); if (!ctx) return; var c = {}; c[b.getAttribute('data-ck-series')] = b.getAttribute('data-ck-hue'); Mkt().setChartPref(ctx.f.id, { colors: c }); draw(ctx.host); return; }
    if ((b = t.closest('[data-ck-reset]'))) { ctx = frameOf(b); if (!ctx) return; var P = Mkt().settings(); delete P.charts[ctx.f.id]; Mkt().setSettings({ charts: P.charts }); draw(ctx.host); return; }
  });
  function showTip(host, text, x, y) {
    var tip = host.querySelector('.ck-tip'); if (!tip) return;
    tip.textContent = ''; tip.hidden = false;
    if (typeof text === 'string') tip.textContent = text; else tip.appendChild(text);
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

  /* ---- CSV out ---------------------------------------------------------------- */
  function csv(rows, columns) {
    var C = SLAF.Csv;
    var cell = function (v) { return C ? C.cell(v === null || v === undefined ? '' : v) : '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; };
    return [columns.map(function (c) { return cell(c.label); }).join(',')].concat(rows.map(function (r) { return columns.map(function (c) { return cell(typeof c.get === 'function' ? c.get(r) : r[c.id]); }).join(','); })).join('\r\n') + '\r\n';
  }
  function boot(fn) {
    SLAF.MktTables.load().then(function (T) { fn(T); }).catch(function (e) { var m = el('main'); if (m) m.innerHTML = '<p class="mkt-off">The tables did not load (' + esc(e.message) + '). Serve this folder over http, not file://.</p>'; });
  }

  SLAF.MktUI = { el: el, esc: esc, say: say, download: download, readFile: readFile, day: day, n: n, pct: pct, money: money, today: today, label: label, options: options,
    header: header, help: help, words: words, chart: chart, redraw: redraw, csv: csv, boot: boot };
})(typeof self !== 'undefined' ? self : this);
