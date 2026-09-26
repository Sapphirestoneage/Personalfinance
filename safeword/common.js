/* ==========================================================================
   safeword/common.js, what every Safeword screen shares. SF-010.
   --------------------------------------------------------------------------
   The header and the strip of pages, the example-numbers banner, the "?"
   that opens plain words for a box, the money and rate inputs (typed in
   dollars and percent, stored as cents and fractions), and the one boot
   routine: load the tables, load the household, draw the header, hand the
   page its context.

     SW.boot({ page }, function (ctx) {...})   ctx: { h, T, save(fn), repaint() }
     SW.money(cents), SW.pct(rate), SW.fig(result, kind), SW.esc(text)
     SW.readMoney(input), SW.readRate(input), SW.readNum(input), SW.readDate(input)
     SW.moneyInput(id, cents, help), SW.rateInput(id, rate, help), SW.numInput(...)
     SW.help(id)                          the "?" button for a help id
     SW.fold(title, html)                 a details block

   LIVE-FORM: every page builds its form once from the stored household and
   never rebuilds a container that holds live inputs; only read-outs repaint.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.SLAF || {};
  var Money = S.Money, Store = S.Store, Tables = S.Tables, Demo = S.Demo;

  var PAGES = [
    { id: 'index', href: 'index.html', label: 'Home', short: 'Home' },
    { id: 'streams', href: 'streams.html', label: 'Streams', sub: 'Every way you earn, and what lands' },
    { id: 'house', href: 'house.html', label: 'The house', sub: 'What the practice costs to run' },
    { id: 'taxes', href: 'taxes.html', label: 'Taxes', sub: 'The jar, and the four dates' },
    { id: 'fund', href: 'fund.html', label: 'The safeword', sub: 'The money that lets you say no' },
    { id: 'rails', href: 'rails.html', label: 'Rails', sub: 'Where the money sits, and how it fails' },
    { id: 'longgame', href: 'longgame.html', label: 'The long game', sub: 'Retiring without a boss, and the exit' },
    { id: 'dynamic', href: 'dynamic.html', label: 'House rules', sub: 'The split, and money inside the dynamic' },
    { id: 'family', href: 'family.html', label: 'Chosen family', sub: 'The papers that make your people count' },
    { id: 'play', href: 'play.html', label: 'The life', sub: 'What the scene costs to live' },
    { id: 'plan', href: 'plan.html', label: 'The plan', sub: 'The whole picture, and the split' }
  ];

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(cents, opts) {
    if (!Money.isEntered(cents)) return '';
    var o = opts || {}, neg = cents < 0, abs = Math.abs(cents);
    var d = o.cents ? (abs / 100).toFixed(2) : String(Math.round(abs / 100));
    d = d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + '$' + d;
  }
  function pct(rate, digits) { if (!Money.isEntered(rate)) return ''; var d = digits === undefined ? 0 : digits; return (rate * 100).toFixed(d) + '%'; }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function fmt(value, kind) {
    if (!Money.isEntered(value) && kind !== 'text') return '';
    switch (kind) {
      case 'pct': return pct(value);
      case 'pct1': return pct(value, 1);
      case 'months': { var m = Math.round(value * 10) / 10; return m + ' ' + plural(m, 'month'); }
      case 'monthsWhole': return Math.round(value) + ' ' + plural(Math.round(value), 'month');
      case 'years': { var y = Math.round(value * 10) / 10; return y + ' ' + plural(y, 'year'); }
      case 'num': return String(Math.round(value * 10) / 10);
      case 'age': return 'age ' + Math.round(value);
      case 'text': return esc(value);
      default: return money(value);
    }
  }
  /* A Result as a figure: the number, or "not yet" and the reason. */
  function fig(result, kind, opts) {
    var o = opts || {};
    if (!result) return '<span class="sw-notyet">not yet</span>';
    if (result.status !== 'ok' || (!Money.isEntered(result.value) && kind !== 'text')) {
      return '<span class="sw-notyet" title="' + esc(result.reason || '') + '">not yet</span>' + (o.why === false ? '' : '<span class="sw-why">' + esc(result.reason || '') + '</span>');
    }
    return '<span class="sw-fig' + (result.value < 0 ? ' is-neg' : '') + '">' + fmt(result.value, kind) + '</span>';
  }
  function ok(r) { return Money.isOk(r); }

  /* ---- Inputs: typed in dollars and percent, stored as cents and fractions ---- */
  function readMoney(el) { if (!el) return null; var c = Money.parseMoney(el.value); return Money.isEntered(c) ? c : null; }
  function readRate(el) { if (!el) return null; var t = String(el.value).replace(/[%\s,]/g, ''); if (t === '') return null; var n = Number(t); return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : null; }
  function readNum(el) { if (!el) return null; var t = String(el.value).replace(/[,\s]/g, ''); if (t === '') return null; var n = Number(t); return Number.isFinite(n) ? n : null; }
  function readDate(el) { if (!el) return null; return /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : null; }
  function moneyText(cents) { if (!Money.isEntered(cents)) return ''; var d = cents / 100; return Number.isInteger(d) ? String(d) : d.toFixed(2); }
  function rateText(rate) { if (!Money.isEntered(rate)) return ''; var p = rate * 100; return Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100); }
  function label(id, text, helpId) { return '<span class="sw-label"><span>' + esc(text) + '</span>' + (helpId ? help(helpId) : '') + '</span>'; }
  function moneyInput(id, cents, text, helpId, extra) {
    return '<div class="sw-field">' + label(id, text, helpId) + '<span class="affix"><span>$</span><input type="text" inputmode="decimal" autocomplete="off" id="' + esc(id) + '" value="' + esc(moneyText(cents)) + '"' + (extra || '') + '/></span></div>';
  }
  function rateInput(id, rate, text, helpId, extra) {
    return '<div class="sw-field">' + label(id, text, helpId) + '<span class="affix"><input type="text" inputmode="decimal" autocomplete="off" id="' + esc(id) + '" value="' + esc(rateText(rate)) + '"' + (extra || '') + '/><span class="after">%</span></span></div>';
  }
  function numInput(id, value, text, helpId, extra) {
    return '<div class="sw-field">' + label(id, text, helpId) + '<input type="text" inputmode="numeric" autocomplete="off" id="' + esc(id) + '" value="' + esc(Money.isEntered(value) ? String(value) : '') + '"' + (extra || '') + '/></div>';
  }
  function textInput(id, value, text, helpId, extra) {
    return '<div class="sw-field">' + label(id, text, helpId) + '<input type="text" autocomplete="off" maxlength="80" id="' + esc(id) + '" value="' + esc(value || '') + '"' + (extra || '') + '/></div>';
  }
  function dateInput(id, value, text, helpId) {
    return '<div class="sw-field">' + label(id, text, helpId) + '<input type="date" id="' + esc(id) + '" value="' + esc(value || '') + '"/></div>';
  }
  function select(id, options, value, text, helpId) {
    return '<div class="sw-field">' + (text ? label(id, text, helpId) : '') + '<select id="' + esc(id) + '">' + options.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === value ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select></div>';
  }
  function help(id) { return '<button type="button" class="help-btn" data-help="' + esc(id) + '" aria-expanded="false" aria-label="What is this?">?</button>'; }
  function fold(title, html, open) { return '<details class="sw-fold"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary><div>' + html + '</div></details>'; }

  /* The plain words. A click on any "?" opens (or closes) the panel right after it. */
  var HELP = {};
  function helpPanel(id) {
    var w = HELP[id];
    if (!w) return '<div class="help-panel"><p>No words for this yet.</p></div>';
    var out = '<div class="help-panel" data-help-for="' + esc(id) + '">';
    if (w.what) out += '<p class="help-q">' + esc(w.what) + '</p>';
    if (w.counts) out += '<p><b>What counts.</b> ' + esc(w.counts) + '</p>';
    if (w.where) out += '<p><b>Where to look.</b> ' + esc(w.where) + '</p>';
    if (w.unsure) out += '<p><b>If you are not sure.</b> ' + esc(w.unsure) + '</p>';
    return out + '</div>';
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.help-btn');
    if (!btn) return;
    var id = btn.getAttribute('data-help');
    var host = btn.closest('.sw-field, .sw-row, .sw-help-host') || btn.parentNode;
    var open = host.querySelector('.help-panel[data-help-for="' + id + '"]');
    if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    host.insertAdjacentHTML('beforeend', helpPanel(id));
    btn.setAttribute('aria-expanded', 'true');
  });

  /* ---- The header ---- */
  function header(pageId, h) {
    var page = PAGES.filter(function (p) { return p.id === pageId; })[0] || PAGES[0];
    var blank = !h.streams.length && !Money.isEntered(h.personal.leanMonthCents) && !h.rails.length;
    var out = '<header class="sw-head">';
    out += '<div class="sw-brand"><a class="sw-wordmark" href="index.html">Safeword</a><span class="sw-screen">Money for kink, sex work and the domme’s house</span></div>';
    out += '<div class="sw-head-title"><h1>' + esc(page.label) + '</h1>' + (page.sub ? '<p class="sw-head-sub">' + esc(page.sub) + '</p>' : '') + '</div>';
    out += '<div class="sw-head-actions">' + (blank ? '<button type="button" class="slaf-btn slaf-btn--primary" id="sw-try-demo">Try with example numbers</button>' : '') + '</div>';
    out += '</header>';
    out += '<nav class="sw-nav" aria-label="Pages">' + PAGES.map(function (p) { return '<a href="' + p.href + '"' + (p.id === pageId ? ' aria-current="page"' : '') + '>' + esc(p.label) + '</a>'; }).join('') + '</nav>';
    if (h.meta.demo) out += '<div class="sw-banner" role="status"><span><b>These are Vesper’s example numbers</b>, not yours. Change any box and they become yours to keep, or start clean.</span><button type="button" class="slaf-btn slaf-btn--quiet" id="sw-clear-demo">Start with my own</button></div>';
    return out;
  }

  function toast(text) {
    var t = document.getElementById('sw-toast');
    if (!t) { t = document.createElement('div'); t.id = 'sw-toast'; t.className = 'sw-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.classList.add('is-on');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('is-on'); }, 2400);
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* ---- Boot ---- */
  function boot(opts, init) {
    function go() {
      var head = document.getElementById('head');
      Tables.load().then(function (T) {
        HELP = T.help && T.help.words ? T.help.words : {};
        var h = Store.load();
        if (head) head.innerHTML = header(opts.page, h);
        var ctx = {
          h: h, T: T, pages: PAGES,
          /* Change the household through fn, save it, and repaint the read-outs. Never rebuilds the form. */
          save: function (fn) { fn(ctx.h); ctx.h = Store.save(ctx.h); if (ctx.h.meta.demo && opts.page !== 'index') { /* the numbers are theirs now */ } if (ctx.paint) ctx.paint(ctx.h, T); },
          paint: null
        };
        document.addEventListener('click', function (e) {
          if (e.target.id === 'sw-try-demo') { Store.useDemo(Demo.household()); location.reload(); }
          if (e.target.id === 'sw-clear-demo') { if (confirm('Forget the example numbers and start with a clean page?')) { Store.wipe(); location.reload(); } }
        });
        init(ctx);
        if (ctx.paint) ctx.paint(ctx.h, T);
      }).catch(function (err) {
        if (head) head.innerHTML = '<p class="sw-error">The tables did not load (' + esc(err.message) + '). Serve the folder (python3 -m http.server) rather than opening the file.</p>';
        if (window.console) console.error(err);
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }

  /* When any box changes, the demo flag drops: the numbers are the person's now. */
  function ownIt(h) { if (h.meta.demo) h.meta.demo = false; }

  window.SW = { PAGES: PAGES, esc: esc, money: money, pct: pct, fmt: fmt, fig: fig, ok: ok, plural: plural,
    readMoney: readMoney, readRate: readRate, readNum: readNum, readDate: readDate, moneyText: moneyText, rateText: rateText,
    moneyInput: moneyInput, rateInput: rateInput, numInput: numInput, textInput: textInput, dateInput: dateInput, select: select, help: help, fold: fold, label: label,
    header: header, toast: toast, download: download, today: today, boot: boot, ownIt: ownIt };
})();
