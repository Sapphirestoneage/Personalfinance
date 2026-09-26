/* ==========================================================================
   offers/app.js, the pieces the three Offer Builder screens share. OD-001.
   --------------------------------------------------------------------------
     UI.el(id), UI.esc(s), UI.param(name), UI.say(id, text, kind)
     UI.boot(cb)                 load data/levels.json and data/demo.json,
                                 hand the engine its table, then cb(ctx)
     UI.header(opts)             the one header every screen wears
     UI.fold(summary, html)      a details box in the app's style
     UI.levelHref(level)         planet.html?p=<planet>#<id>
     UI.gridHtml(grid)           six planets by four bands, the dots
     UI.nextCard(next)           the one next thing
     UI.payoff(level, a)         the reading a level pays with: words,
                                 lines, the picture, and its table
     UI.chartFrame(spec)         a picture in its frame with "Show as a table"
     UI.formHtml(level, a)       the open level's boxes (built once, D-034)
     UI.bindForm(host, level, onChange)   save on change, never rebuild
     UI.readsHtml(level, a)      the facts this level reads from elsewhere
     UI.valueText(field, v)      one stored value as words

   Money is typed in dollars and stored in cents (Money.parseMoney); a
   percent is typed as 40 and stored as 0.4. A blank box stores nothing.
   ========================================================================== */
(function (root) {
  'use strict';
  var O = root.OFFERS = root.OFFERS || {};
  var Money = root.SLAF && root.SLAF.Money;
  var Store = O.Store, Offer = O.Offer, Charts = O.Charts;

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location.search || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }
  function say(id, text, kind) {
    var n = el(id); if (!n) return;
    n.textContent = text || '';
    n.className = 'ob-say' + (kind === 'good' ? ' is-good' : '');
  }
  function base() {
    var s = document.querySelector('script[src$="app.js"]');
    return s ? s.getAttribute('src').replace(/app\.js$/, '') : '';
  }
  function boot(cb) {
    var b = base();
    Promise.all([fetch(b + 'data/levels.json'), fetch(b + 'data/demo.json')])
      .then(function (rs) { return Promise.all(rs.map(function (r) { if (!r.ok) throw new Error('A data file did not load.'); return r.json(); })); })
      .then(function (list) { Offer.use(list[0]); cb({ T: list[0], demo: list[1] }); })
      .catch(function (e) { var m = el('main'); if (m) m.insertAdjacentHTML('afterbegin', '<p class="ob-say">' + esc(e.message) + ' Serve the folder over http (for example python3 -m http.server) and open it again.</p>'); });
  }

  function header(o) {
    return '<header class="ob-head"><div class="ob-head-brand"><a class="ob-wordmark" href="index.html">Offer Builder</a>'
      + (o.screen ? '<span class="ob-screen">' + esc(o.screen) + '</span>' : '') + '</div>'
      + '<div class="ob-head-title"><h1>' + esc(o.title || '') + '</h1>' + (o.sub ? '<p class="ob-head-sub">' + o.sub + '</p>' : '') + '</div>'
      + '<nav class="ob-actions ob-head-actions" aria-label="Screens">' + (o.actions || '') + '</nav></header>';
  }
  function fold(summary, html, open) {
    return '<details class="ob-fold"' + (open ? ' open' : '') + '><summary>' + summary + '</summary><div class="ob-fold-body">' + html + '</div></details>';
  }
  function levelHref(level) { return 'planet.html?p=' + encodeURIComponent(level.planet) + '#' + encodeURIComponent(level.id); }
  function minutes(m) { return m < 1 ? 'under a minute' : m === 1 ? 'a minute' : 'about ' + m + ' minutes'; }

  /* ---- The grid: dots per level, a gold cell per cleared band ------------- */
  function dots(b) {
    return b.levels.map(function (x) { return '<span class="ob-dot is-' + x.state + '" title="' + esc(x.level.title) + '"></span>'; }).join('');
  }
  function gridHtml(grid) {
    var bandsRow = grid[0].bands.map(function (b) { var clear = grid.every(function (p) { return p.bands[b.band - 1].cleared; }); return '<span class="' + (clear ? 'is-clear' : '') + '">' + b.band + ' ' + esc(b.name) + '</span>'; }).join('');
    var rows = grid.map(function (p) {
      return '<a class="ob-row" href="planet.html?p=' + esc(p.id) + '"><span class="ob-name"><b>' + esc(p.label) + '</b><span>' + p.done + ' of ' + p.of + ' answered</span></span>'
        + '<span class="ob-cells">' + p.bands.map(function (b) { return '<span class="ob-cell' + (b.cleared ? ' is-clear' : '') + '">' + dots(b) + '</span>'; }).join('') + '</span></a>';
    }).join('');
    return '<div class="ob-grid"><div class="ob-gridhead"><span>Planet</span><span class="ob-bands">' + bandsRow + '</span></div>' + rows + '</div>';
  }
  function nextCard(n) {
    if (!n) return '<div class="ob-next is-done"><span class="slaf-eyebrow">Next</span><b>Every level is answered.</b><p>The offer sheet is complete. Refresh the wrapper on the rhythm you planned, and rate the value equation again after each launch.</p></div>';
    return '<a class="ob-next" href="' + levelHref(n.level) + '"><span class="slaf-eyebrow">Next</span><b>' + esc(n.planet.label) + ' ' + n.level.level + ': ' + esc(n.level.title) + '</b>'
      + '<p>' + esc(n.why) + ' ' + esc(minutes(n.level.minutes).charAt(0).toUpperCase() + minutes(n.level.minutes).slice(1)) + '.</p></a>';
  }

  /* ---- Charts in their frame ---------------------------------------------- */
  var frameSeq = 0;
  function chartFrame(spec) {
    var svg = Charts.render(spec); if (!svg) return '';
    var id = 'ob-tbl-' + (++frameSeq);
    return '<figure class="ob-chart"><div class="ob-chart-pic">' + svg + '</div>'
      + '<figcaption><button type="button" class="ob-link" data-table-toggle="' + id + '" aria-expanded="false">Show as a table</button></figcaption>'
      + '<div class="ob-chart-table" id="' + id + '" hidden>' + Charts.table(spec) + '</div></figure>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-table-toggle]'); if (!b) return;
    var t = el(b.getAttribute('data-table-toggle')); if (!t) return;
    var open = t.hidden; t.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.textContent = open ? 'Hide the table' : 'Show as a table';
  });

  /* ---- The payoff card ----------------------------------------------------- */
  function payoff(level, a, opts) {
    var r = Offer.reading(level.payoff.reading, a, opts);
    var head = '<span class="slaf-eyebrow">' + esc({ reveal: 'Reveal', certainty: 'Certainty', power: 'Power' }[level.payoff.currency] || 'Payoff') + '</span>';
    if (!Money.isOk(r)) {
      var seen = {};
      var waits = (r.missing || []).map(function (k) { var lv = Offer.levelOfKey(k); if (!lv || lv.id === level.id || seen[lv.id]) return null; seen[lv.id] = true; return '<a href="' + levelHref(lv) + '">' + esc(lv.title) + '</a>'; }).filter(Boolean);
      return '<div class="ob-payoff is-notyet">' + head + '<p class="ob-notyet"><b>Not yet.</b> ' + esc(r.reason || '') + (waits.length ? ' Waiting on ' + waits.join(', ') + '.' : '') + '</p><p class="ob-say-what">' + esc(level.payoff.say) + '</p></div>';
    }
    var lines = (r.lines || []).length ? '<ul class="ob-lines">' + r.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '';
    return '<div class="ob-payoff">' + head + '<p class="ob-payoff-say">' + esc(r.say || '') + '</p>' + lines + (r.chart ? chartFrame(r.chart) : '') + '</div>';
  }

  /* ---- Values as words ----------------------------------------------------- */
  function optionLabel(f, id) { var o = (f.options || []).filter(function (x) { return x.id === id; })[0]; return o ? o.label : id; }
  function valueText(f, v) {
    if (Store.isNothing(v)) return Money.NOT_YET;
    switch (f.kind) {
      case 'money': return Money.formatCents(v, { exact: true });
      case 'pct': return Money.formatRate(v, { decimals: 0 });
      case 'choice': return optionLabel(f, v);
      case 'multi': return v.map(function (id) { return optionLabel(f, id); }).join(', ');
      case 'check': var n = (f.items || []).filter(function (i) { return v[i.id] === true; }).length; return n + ' of ' + f.items.length + ' ticked';
      case 'list': { var o = {}; o[f.key] = v; var rows = Offer.fullRows(f, o); return rows.length + ' row' + (rows.length === 1 ? '' : 's'); }
      default: return String(v);
    }
  }
  function readsHtml(level, a) {
    if (!level.reads || !level.reads.length) return '';
    var items = level.reads.map(function (k) {
      var f = Offer.fieldByKey(k), lv = Offer.levelOfKey(k); if (!f || !lv) return '';
      var v = a[k], txt;
      if (f.kind === 'list') { var rows = Offer.fullRows(f, a); txt = rows.length ? rows.slice(0, 4).map(function (r) { return esc(r[f.cols[0].key]); }).join('; ') + (rows.length > 4 ? '; and ' + (rows.length - 4) + ' more' : '') : Money.NOT_YET; }
      else txt = esc(valueText(f, v));
      return '<li><span class="ob-read-label">' + esc(f.label) + '</span><span class="ob-read-val">' + txt + '</span><a class="ob-read-go" href="' + levelHref(lv) + '">' + esc(lv.planet.charAt(0).toUpperCase() + lv.planet.slice(1)) + ' ' + lv.level + '</a></li>';
    }).join('');
    return '<div class="ob-reads"><span class="slaf-eyebrow">Read from other planets</span><ul>' + items + '</ul></div>';
  }

  /* ---- The form ------------------------------------------------------------
     Built once when a level opens. Every box saves on change. Rows are
     added to the list in place; nothing here is rebuilt while it is in use. */
  function cellHtml(col, v, name) {
    var val = Store.isNothing(v) ? '' : v;
    if (col.kind === 'choice') return '<select data-cell="' + esc(col.key) + '" aria-label="' + esc(col.label) + '"><option value="">' + esc(col.label) + '…</option>' + col.options.map(function (o) { return '<option value="' + esc(o.id) + '"' + (val === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
    if (col.kind === 'money') return '<span class="ob-shell"><span class="ob-affix">$</span><input type="text" inputmode="decimal" data-cell="' + esc(col.key) + '" aria-label="' + esc(col.label) + '" placeholder="' + esc(col.label) + '" value="' + (val === '' ? '' : esc(Money.fromCents(val))) + '"/></span>';
    if (col.kind === 'number') return '<input type="text" inputmode="numeric" data-cell="' + esc(col.key) + '" aria-label="' + esc(col.label) + '" placeholder="' + esc(col.label) + '" value="' + esc(val) + '" class="is-short"/>';
    return '<input type="text" data-cell="' + esc(col.key) + '" aria-label="' + esc(col.label) + '" placeholder="' + esc(col.label) + '" value="' + esc(val) + '"' + (col.later ? ' class="is-later"' : '') + '/>';
  }
  function rowHtml(f, r) {
    var captions = f.cols.length > 2;
    return '<div class="ob-lrow" data-row>' + f.cols.map(function (c) { return '<span class="ob-lcell' + (f.cols.length > 3 ? ' is-narrow' : '') + '">' + (captions ? '<span class="ob-lcap">' + esc(c.label) + '</span>' : '') + cellHtml(c, r ? r[c.key] : null) + '</span>'; }).join('')
      + '<button type="button" class="ob-link ob-lrm" data-row-remove aria-label="Remove this row">Remove</button></div>';
  }
  function fieldHtml(f, a, level) {
    var v = a[f.key], hint = f.hint ? '<span class="ob-hint">' + esc(f.hint) + '</span>' : '';
    var lab = '<span class="ob-flabel">' + esc(f.label) + '</span>' + hint;
    var wrap = function (inner, cls) { return '<div class="ob-field' + (cls ? ' ' + cls : '') + '" data-field="' + esc(f.key) + '"' + (f.appliesWhen ? ' data-applies="' + esc(JSON.stringify(f.appliesWhen)) + '"' : '') + '>' + inner + '</div>'; };
    var sug = f.suggest ? Offer.suggest(f.suggest, a) : '';
    var sugHtml = sug ? '<div class="ob-suggest"><span>Start from: </span><q>' + esc(sug) + '</q> <button type="button" class="ob-link" data-suggest="' + esc(f.key) + '" data-text="' + esc(sug) + '">Use it</button></div>' : '';
    switch (f.kind) {
      case 'text': return wrap('<label>' + lab + '<input type="text" data-key="' + esc(f.key) + '" value="' + esc(Store.isNothing(v) ? '' : v) + '"/></label>' + sugHtml);
      case 'long': return wrap('<label>' + lab + '<textarea data-key="' + esc(f.key) + '" rows="3">' + esc(Store.isNothing(v) ? '' : v) + '</textarea></label>' + sugHtml);
      case 'money': return wrap('<label>' + lab + '<span class="ob-shell"><span class="ob-affix">$</span><input type="text" inputmode="decimal" data-key="' + esc(f.key) + '" value="' + (Store.isNothing(v) ? '' : esc(Money.fromCents(v))) + '"/></span></label>');
      case 'number': return wrap('<label>' + lab + '<input type="text" inputmode="numeric" class="is-short" data-key="' + esc(f.key) + '" value="' + esc(Store.isNothing(v) ? '' : v) + '"/></label>');
      case 'pct': return wrap('<label>' + lab + '<span class="ob-shell"><input type="text" inputmode="decimal" class="is-short" data-key="' + esc(f.key) + '" value="' + (Store.isNothing(v) ? '' : esc(Math.round(v * 1000) / 10)) + '"/><span class="ob-affix">%</span></span></label>');
      case 'date': return wrap('<label>' + lab + '<input type="date" data-key="' + esc(f.key) + '" value="' + esc(Store.isNothing(v) ? '' : v) + '"/></label>');
      case 'choice': return wrap('<label>' + lab + '<select data-key="' + esc(f.key) + '"><option value="">Choose…</option>' + f.options.map(function (o) { return '<option value="' + esc(o.id) + '"' + (v === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select></label>');
      case 'score': {
        var btns = ''; for (var i = f.min; i <= f.max; i++) btns += '<label class="ob-score-opt"><input type="radio" name="sc-' + esc(f.key) + '" value="' + i + '"' + (v === i ? ' checked' : '') + ' data-score="' + esc(f.key) + '"/><span>' + i + '</span></label>';
        return wrap('<fieldset class="ob-score"><legend>' + lab + '</legend><div class="ob-score-row">' + btns + '</div></fieldset>');
      }
      case 'multi': return wrap('<fieldset class="ob-checks"><legend>' + lab + '</legend>' + f.options.map(function (o) { return '<label class="ob-check"><input type="checkbox" data-multi="' + esc(f.key) + '" value="' + esc(o.id) + '"' + (Array.isArray(v) && v.indexOf(o.id) >= 0 ? ' checked' : '') + '/><span>' + esc(o.label) + '</span></label>'; }).join('') + '</fieldset>');
      case 'check': return wrap('<fieldset class="ob-checks is-list"><legend>' + lab + '</legend>' + f.items.map(function (it) { return '<label class="ob-check"><input type="checkbox" data-check="' + esc(f.key) + '" value="' + esc(it.id) + '"' + (v && v[it.id] === true ? ' checked' : '') + '/><span>' + esc(it.label) + '</span></label>'; }).join('') + '</fieldset>');
      case 'list': {
        var rows = Array.isArray(v) ? v : [];
        var min = f.minRows || 1; while (rows.length < Math.min(min, 3)) rows = rows.concat([null]);
        return wrap('<div class="ob-list" data-list="' + esc(f.key) + '">' + lab + '<div class="ob-lhead">' + f.cols.map(function (c) { return '<span class="ob-lcell' + (f.cols.length > 3 ? ' is-narrow' : '') + '">' + esc(c.label) + '</span>'; }).join('') + '</div><div class="ob-lrows">' + rows.map(function (r) { return rowHtml(f, r); }).join('') + '</div>'
          + '<button type="button" class="slaf-btn slaf-btn--quiet" data-row-add>Add a row</button><span class="ob-hint"> At least ' + min + '.</span></div>', 'is-wide');
      }
      case 'confirm': return wrap('<div class="ob-confirm"><div data-confirm-reading></div><button type="button" class="slaf-btn slaf-btn--primary" data-confirm="' + esc(level.id) + '">' + esc(f.label) + '</button><button type="button" class="ob-link" data-unconfirm="' + esc(level.id) + '" hidden>Take that back</button><span class="ob-said" data-confirm-said></span></div>');
      default: return '';
    }
  }
  function formHtml(level, a) {
    var timer = level.timer ? '<div class="ob-timer"><button type="button" class="slaf-btn" data-timer="' + level.timer + '">Start the ' + Math.round(level.timer / 60) + ' minute timer</button><span class="ob-timer-face" aria-live="polite"></span></div>' : '';
    return timer + level.fields.map(function (f) { return fieldHtml(f, a, level); }).join('');
  }

  function parseCell(col, node) {
    var t = node.value;
    if (col.kind === 'money') return Money.parseMoney(t);
    if (col.kind === 'number') { var c = String(t).replace(/[,\s]/g, ''); if (c === '') return null; var n = Number(c); return Number.isFinite(n) ? n : null; }
    return t.trim() === '' ? null : t.trim();
  }
  function collectList(f, listNode) {
    var rows = [];
    listNode.querySelectorAll('[data-row]').forEach(function (rn) {
      var r = {}, any = false;
      f.cols.forEach(function (c) { var n = rn.querySelector('[data-cell="' + c.key + '"]'); var v = n ? parseCell(c, n) : null; if (v !== null) { r[c.key] = v; any = true; } });
      if (any) rows.push(r);
    });
    return rows;
  }
  function applyGates(host, a) {
    host.querySelectorAll('[data-applies]').forEach(function (n) {
      var w = JSON.parse(n.getAttribute('data-applies'));
      n.hidden = !Offer.fieldApplies({ appliesWhen: w }, a);
    });
  }
  function bindForm(host, level, onChange) {
    var fieldOf = {}; level.fields.forEach(function (f) { fieldOf[f.key] = f; });
    function changed() { var a = Store.answers(); applyGates(host, a); onChange(a); }
    applyGates(host, Store.answers());
    /* One level's handlers at a time: opening another level on the same
       page takes the last pair off before the new pair goes on. */
    if (host._obUnbind) host._obUnbind();
    host._obUnbind = function () { host.removeEventListener('change', onChangeEvt); host.removeEventListener('click', onClickEvt); host._obUnbind = null; };
    host.addEventListener('change', onChangeEvt);
    host.addEventListener('click', onClickEvt);
    function onChangeEvt(e) {
      var n = e.target;
      if (n.hasAttribute('data-key')) {
        var f = fieldOf[n.getAttribute('data-key')], v;
        if (f.kind === 'money') v = Money.parseMoney(n.value);
        else if (f.kind === 'pct') v = Money.parseRatePercent(n.value);
        else if (f.kind === 'number') v = parseCell({ kind: 'number' }, n);
        else v = n.value.trim() === '' ? null : n.value.trim();
        Store.set(f.key, v); changed(); return;
      }
      if (n.hasAttribute('data-score')) { Store.set(n.getAttribute('data-score'), Number(n.value)); changed(); return; }
      if (n.hasAttribute('data-multi')) {
        var k = n.getAttribute('data-multi'), ids = [];
        host.querySelectorAll('[data-multi="' + k + '"]:checked').forEach(function (c) { ids.push(c.value); });
        Store.set(k, ids); changed(); return;
      }
      if (n.hasAttribute('data-check')) {
        var ck = n.getAttribute('data-check'), m = {};
        host.querySelectorAll('[data-check="' + ck + '"]:checked').forEach(function (c) { m[c.value] = true; });
        Store.set(ck, m); changed(); return;
      }
      if (n.hasAttribute('data-cell')) {
        var ln = n.closest('[data-list]'), lf = fieldOf[ln.getAttribute('data-list')];
        Store.set(lf.key, collectList(lf, ln)); changed();
      }
    }
    function onClickEvt(e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-row-add')) {
        var ln = b.closest('[data-list]'), lf = fieldOf[ln.getAttribute('data-list')];
        ln.querySelector('.ob-lrows').insertAdjacentHTML('beforeend', rowHtml(lf, null));
        var first = ln.querySelector('.ob-lrows [data-row]:last-child input, .ob-lrows [data-row]:last-child select'); if (first) first.focus();
        return;
      }
      if (b.hasAttribute('data-row-remove')) {
        var rn = b.closest('[data-row]'), ln2 = b.closest('[data-list]'), lf2 = fieldOf[ln2.getAttribute('data-list')];
        rn.remove(); Store.set(lf2.key, collectList(lf2, ln2)); changed(); return;
      }
      if (b.hasAttribute('data-suggest')) {
        var key = b.getAttribute('data-suggest'), box = host.querySelector('[data-key="' + key + '"]');
        if (box) { box.value = b.getAttribute('data-text'); Store.set(key, box.value); changed(); box.focus(); }
        return;
      }
      if (b.hasAttribute('data-confirm')) { Store.confirm(b.getAttribute('data-confirm')); changed(); return; }
      if (b.hasAttribute('data-unconfirm')) { Store.unconfirm(b.getAttribute('data-unconfirm')); changed(); return; }
      if (b.hasAttribute('data-timer')) { startTimer(b, Number(b.getAttribute('data-timer'))); }
    }
  }
  function startTimer(b, secs) {
    var face = b.parentNode.querySelector('.ob-timer-face'); var left = secs; b.disabled = true;
    function tick() {
      var m = Math.floor(left / 60), s = left % 60; face.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      if (left <= 0) { face.textContent = 'Time. Count what you have.'; b.disabled = false; return; }
      left--; setTimeout(tick, 1000);
    }
    tick();
  }
  /* The confirm box shows its reading and whether it is confirmed. Output
     only, so it may be redrawn on every change. */
  function drawConfirm(host, level, a) {
    var f = level.fields.filter(function (x) { return x.kind === 'confirm'; })[0]; if (!f) return;
    var box = host.querySelector('[data-confirm-reading]'); if (!box) return;
    var r = Offer.reading(f.reading, a);
    box.innerHTML = Money.isOk(r) ? '<p class="ob-payoff-say">' + esc(r.say) + '</p>' + (r.chart ? chartFrame(r.chart) : '') : '<p class="ob-notyet"><b>Not yet.</b> ' + esc(r.reason) + '</p>';
    var c = Store.confirmed()[level.id];
    host.querySelector('[data-confirm]').hidden = !!c || !Money.isOk(r);
    host.querySelector('[data-unconfirm]').hidden = !c;
    host.querySelector('[data-confirm-said]').textContent = c ? 'Confirmed.' : '';
  }

  O.UI = { el: el, esc: esc, param: param, say: say, boot: boot, header: header, fold: fold, levelHref: levelHref, minutes: minutes,
    gridHtml: gridHtml, nextCard: nextCard, chartFrame: chartFrame, payoff: payoff, valueText: valueText, readsHtml: readsHtml,
    formHtml: formHtml, bindForm: bindForm, drawConfirm: drawConfirm };
})(typeof self !== 'undefined' ? self : this);
