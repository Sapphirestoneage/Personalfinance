/* ==========================================================================
   shared/fillcard.js — the hybrid Next card, and the one row editor the
   Next card and Loose Ends share. The owner's brief of 2026-09-19 (D-264).
   --------------------------------------------------------------------------
   One hero (the single most useful row to fill), two small cards under it
   ("After that"), a finish line above, and four buttons: Save, Roughly,
   Don't know yet, Not for me. Every button is one call into Fill.act, which
   writes through the owner (Ownership.write) or marks the row in the spine;
   nothing here keeps a value, and the same editor is what a Loose Ends row
   opens, so no number can be typed in two places.

     FillCard.mount(host, opts)   the card; opts:
         roomId      where it sits (links carry ?from=)
         tables      the reference tables (ledgerRows, nextWeights, ...)
         scope       'queue' (the Next queue) | 'loose' (loose ends only)
         onDone(el)  called when the scope has nothing left (loose)
         before      insert before this node (else the host's first child)
     FillCard.editorHtml(row)     the control and the four buttons, for a row
     FillCard.wire(el, row, opts) bind the editor: opts.onAct(result, action)
     FillCard.ensure()            load what the page does not carry; resolves
                                  to the tables (shared with Ask.ensure)

   LIVE-FORM: built once per hero. The hero holds a live input; a change
   elsewhere (undo, another tab) repaints the finish line and the two small
   cards, and replaces the hero ONLY when the row it shows has left the
   queue or another was promoted, never while a finger is in the box.
   No em dashes in any copy here: the owner reads it on a phone.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.FillCard = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';
  function g() { return typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : {}); }
  function S() { return g().SLAF || {}; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function minutesWord(m) {
    if (!m) return 'a minute';
    if (m < 1) return 'under a minute';
    if (m === 1) return 'about a minute';
    return 'about ' + Math.round(m) + ' minutes';
  }
  function reduced() { try { return g().matchMedia && g().matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  /* ---- Loading what a page does not carry ---------------------------------- */
  var ensured = null;
  function ensure() {
    if (ensured) return ensured;
    var A = S().Ask;
    var base = (typeof location !== 'undefined' && location.pathname.indexOf('/rooms/') !== -1) ? '../' : '';
    function load(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('could not load ' + src)); };
        document.head.appendChild(s);
      });
    }
    var first = A && A.ensure ? A.ensure() : load(base + 'shared/ask.js').then(function () { return S().Ask.ensure(); });
    ensured = first.then(function (t) {
      var chain = Promise.resolve();
      if (!S().Fill) chain = chain.then(function () { return load(base + 'shared/fill.js'); });
      return chain.then(function () {
        return S().Reference.load(['nextWeights', 'fooRules', 'plausibleRanges']).then(function (more) {
          var all = Object.assign({}, t, more);
          S().Fill.use(more.nextWeights, more.fooRules);
          return all;
        }).catch(function () { S().Fill.use(null, null); return t; });
      });
    });
    return ensured;
  }

  /* ---- The editor: one control, four buttons -------------------------------- */
  /* One line per item opens in the Ledger. The pay rows are one line per
     source too, but a household with one source (or none yet) types its pay
     on the card: Ownership.write with no item patches the primary source. */
  function isList(row) {
    if (!row.repeat) return false;
    if (row.repeat !== 'incomeSources') return true;
    var Spine = S().Spine, Schema = S().Schema;
    var p = Spine && Schema && Schema.primaryPerson ? Schema.primaryPerson(Spine.getProfile()) : null;
    return !!(p && p.incomeSources && p.incomeSources.length > 1);
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** The control for one row: the ask's for a number, a choice or a bool;
      the Ledger's shapes for a birth date, a match and the state list. */
  function control(row, tables) {
    var Ask = S().Ask;
    var u = row.unit;
    if (u === 'date' && (row.id === 'dob' || row.id === 'partnerDob')) {
      return '<span class="slaf-input-shell"><select data-fc-month aria-label="Month"><option value="">Month</option>' + MONTHS.map(function (m, i) { var v = String(i + 1); if (v.length < 2) v = '0' + v; return '<option value="' + v + '">' + m + '</option>'; }).join('') + '</select>'
        + '<input type="text" inputmode="numeric" placeholder="Year, e.g. 1992" data-fc-year aria-label="Year"/></span>';
    }
    if (u === 'date') return '<span class="slaf-input-shell"><input type="date" data-fc-date aria-label="' + esc(row.label) + '"/></span>';
    if (u === 'formula') return '<span class="slaf-input-shell"><input type="text" inputmode="decimal" placeholder="e.g. 50" data-fc-match aria-label="Match, cents on the dollar"/><span class="affix">% of the first</span><input type="text" inputmode="decimal" placeholder="e.g. 6" data-fc-cap aria-label="Cap, share of pay"/><span class="affix">% of pay</span></span>';
    if (u === 'enum') {
      var vals;
      if (row.id === 'state' && tables && tables.states) vals = (tables.states.states || []).map(function (st) { return { v: st.code, l: st.code + ' ' + st.name }; });
      else { var labels = Ask.ENUM_LABELS[row.id] || {}; vals = (row.values || Object.keys(labels)).map(function (v) { return { v: v, l: labels[v] || v }; }); }
      if (vals.length > 8) return '<select data-fc-select aria-label="' + esc(row.label) + '"><option value="">Choose…</option>' + vals.map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>'; }).join('') + '</select>';
    }
    return Ask.control(row);
  }
  function editorHtml(row, opts) {
    var o = opts || {};
    var Fill = S().Fill;
    var listRow = isList(row);
    var ctl = listRow
      ? '<a class="slaf-btn slaf-btn--primary fc-open" href="' + esc(Fill.ledgerHref(row, o.roomId)) + '">Open in the Ledger →</a>'
      : control(row, o.tables);
    return '<div class="fc-ctl">' + ctl + '</div>'
      + '<div class="fc-ballpark" data-fc-ballpark hidden></div>'
      + '<div class="fc-slip" data-fc-slip hidden></div>'
      + '<div class="fc-acts">'
      + (listRow ? '' : '<button type="button" class="slaf-btn slaf-btn--primary" data-fc-act="save">Save</button>'
        + '<button type="button" class="slaf-btn" data-fc-act="roughly">Roughly</button>')
      + '<button type="button" class="slaf-btn slaf-btn--quiet" data-fc-act="unknown">Don’t know yet</button>'
      + '<button type="button" class="slaf-btn slaf-btn--quiet" data-fc-act="na">Not for me</button>'
      + '</div>'
      + '<p class="slaf-hint fc-note" data-fc-note hidden></p>';
  }
  /** The ballpark helper (Roughly with an empty box): the row's own "roughly"
      sentence, the app's suggestion if it has one, and the plausible range. */
  function ballparkHtml(row, tables) {
    var Sg = S().Suggest, Money = S().Money, Spine = S().Spine;
    var out = [];
    if (row.roughly) out.push('<p class="fc-bp-say">' + esc(row.roughly) + '</p>');
    var chips = [];
    try {
      var list = Sg && Sg.suggestions && Spine ? Sg.suggestions(Spine.getProfile(), tables) : [];
      var s = list.filter(function (x) { return x.key === row.id && !x.na; })[0];
      if (s) chips.push('<button type="button" class="choice" data-fc-bp="' + esc(String(s.value)) + '" title="' + esc(s.how) + '">' + esc(s.display) + ' <small>suggested</small></button>');
    } catch (e) { /* no suggestion is fine */ }
    var pr = tables && tables.plausibleRanges && tables.plausibleRanges.rows && tables.plausibleRanges.rows[row.id];
    if (pr && row.unit === 'cents' && Money) {
      var lo = pr.low, hi = pr.high, mid = Math.round((lo + hi) / 2 / 10000) * 10000;
      [lo, mid, hi].forEach(function (v, i) {
        if (i === 0 && v <= 0) return;
        chips.push('<button type="button" class="choice" data-fc-bp="' + v + '">' + esc(Money.formatCents(v)) + ' <small>' + (i === 0 ? 'low' : i === 1 ? 'middle' : 'high') + '</small></button>');
      });
    }
    if (chips.length) out.push('<div class="choices">' + chips.join('') + '</div>');
    out.push('<p class="slaf-hint">Tap one, or type your own ballpark and tap Roughly again.</p>');
    return out.join('');
  }
  /**
   * wire(el, row, opts): bind the editor inside `el`. opts.tables, opts.roomId,
   * opts.onAct(result, action, row). The value is read from the control on
   * each tap; nothing is stored between taps.
   */
  function wire(el, row, opts) {
    var o = opts || {};
    var Ask = S().Ask, Fill = S().Fill;
    var note = el.querySelector('[data-fc-note]');
    function say(text) { if (!note) return; note.hidden = !text; note.textContent = text || ''; }
    function input() { return el.querySelector('[data-ask-input]'); }
    function typed() {
      var mo = el.querySelector('[data-fc-month]');
      if (mo) {
        var y = String(el.querySelector('[data-fc-year]').value || '').replace(/\D/g, '');
        if (!mo.value && !y) return { empty: true, value: null };
        if (!mo.value || y.length !== 4) return { bad: true, value: null };
        return { value: y + '-' + mo.value + '-01' };
      }
      var dt = el.querySelector('[data-fc-date]');
      if (dt) return dt.value ? { value: dt.value } : { empty: true, value: null };
      var mt = el.querySelector('[data-fc-match]');
      if (mt) {
        var cp = el.querySelector('[data-fc-cap]');
        if (mt.value === '' && cp.value === '') return { empty: true, value: null };
        var m = Number(mt.value), c = Number(cp.value);
        if (mt.value === '' || cp.value === '' || isNaN(m) || isNaN(c)) return { bad: true, value: null };
        return { value: { matchPercent: m / 100, matchCapPercentOfSalary: c / 100 } };
      }
      var sel = el.querySelector('[data-fc-select]');
      if (sel) return sel.value ? { value: sel.value } : { empty: true, value: null };
      var inp = input();
      if (!inp) return { empty: true, value: null };
      var raw = inp.value;
      if (String(raw).trim() === '') return { empty: true, value: null };
      var sl = Ask.slip(row, raw);
      if (sl) return { slip: sl };
      var v;
      if (row.unit === 'enum' || row.unit === 'text') v = raw.trim();
      else if (row.unit === 'date') v = Number(String(raw).replace(/\D/g, '')) || null;
      else v = Ask.parse(row, raw);
      if (v === null) return { bad: true, value: null };
      var per = el.querySelector('[data-ask-period]');
      var conv = row.unit === 'cents' && per ? Ask.toRowPeriod(row, v, per.value) : { value: v, note: null };
      return { value: conv.value, note: conv.note };
    }
    function finish(res, action) {
      say(res.note);
      if (o.onAct) o.onAct(res, action, row);
    }
    function run(action, value, extra) {
      var res;
      if (o.onBefore) o.onBefore(row, action);
      try { res = Fill.act(action, row, value, Object.assign({ tables: o.tables }, extra || {})); }
      catch (e) { res = { ok: false, note: 'Could not save: ' + e.message }; }
      finish(res, action);
    }
    function showSlip(sl, action) {
      var box = el.querySelector('[data-fc-slip]');
      if (!box) return;
      box.hidden = false;
      box.innerHTML = '<p class="ask-q">' + esc(sl.question) + '</p><div class="choices">' + sl.options.map(function (op, i) { return '<button type="button" class="choice" data-fc-slipopt="' + i + '">' + esc(op.label) + '</button>'; }).join('') + '</div>';
      box.onclick = function (ev) {
        var b = ev.target.closest ? ev.target.closest('[data-fc-slipopt]') : null;
        if (!b) return;
        var op = sl.options[Number(b.getAttribute('data-fc-slipopt'))];
        box.hidden = true; box.innerHTML = '';
        if (op.value === null) { var inp = input(); if (inp) { inp.value = ''; inp.focus(); } return; }
        run(action, op.value);
      };
    }
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-fc-act],[data-ask-val],[data-fc-bp]') : null;
      if (!b || !el.contains(b)) return;
      if (b.hasAttribute('data-ask-val')) {
        var raw = b.getAttribute('data-ask-val');
        run('save', row.unit === 'bool' ? raw === 'true' : raw);
        return;
      }
      if (b.hasAttribute('data-fc-bp')) {
        var bp = b.getAttribute('data-fc-bp');
        var v = row.unit === 'cents' || row.unit === 'count' || row.unit === 'months' || row.unit === 'years' ? Number(bp) : (row.unit === 'bool' ? bp === 'true' : (isNaN(Number(bp)) ? bp : Number(bp)));
        run('roughly', v, { source: 'suggested' });
        return;
      }
      var action = b.getAttribute('data-fc-act');
      if (action === 'unknown' || action === 'na') { run(action, null); return; }
      var t = typed();
      if (t.slip) { showSlip(t.slip, action); return; }
      if (t.bad) { say('A number, please.'); return; }
      if (action === 'save') {
        if (t.empty) { say('Type the number first, or tap Roughly for a ballpark.'); return; }
        run('save', t.value);
        return;
      }
      if (action === 'roughly') {
        if (t.empty) {
          var st = Fill.stateOf(S().Spine.getProfile(), row, o.tables);
          if (st.state === 'known' || st.state === 'rough') { run('roughly', null); return; }
          var bpBox = el.querySelector('[data-fc-ballpark]');
          if (bpBox && bpBox.hidden) { bpBox.hidden = false; bpBox.innerHTML = ballparkHtml(row, o.tables); say('A ballpark is fine. It counts as answered until you sharpen it.'); return; }
          say('A ballpark number, please.');
          return;
        }
        run('roughly', t.value);
      }
    });
    var inp = input();
    if (inp) inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { var sb = el.querySelector('[data-fc-act="save"]'); if (sb) sb.click(); } });
    return { say: say };
  }

  /* ---- The hero card ------------------------------------------------------------ */
  function heroHtml(row, tables, roomId) {
    var Fill = S().Fill;
    var listRow = isList(row);
    var st = row.fill || {};
    var partial = st.partial ? ' <span class="fc-partial">' + esc(st.display) + ' have it</span>' : '';
    return '<span class="slaf-eyebrow">Next</span>'
      + '<h3 class="fc-name">' + esc(row.label) + partial + '</h3>'
      + '<p class="fc-why">' + esc(Fill.whyLine(row)) + '</p>'
      + '<p class="fc-meta"><span class="fc-min">' + esc(minutesWord(row.minutes)) + '</span>'
      + (row.where ? ' <span class="fc-where">' + esc(row.where) + '</span>' : (row.kind === 'know' ? ' <span class="fc-where">From your head: no document needed.</span>' : '')) + '</p>'
      + editorHtml(row, { roomId: roomId, tables: tables })
      + (listRow ? '<p class="slaf-hint">One line per item, so it opens in the Ledger. Save there and come back.</p>' : '');
  }
  function smallHtml(row) {
    return '<button type="button" class="fc-small" data-fc-promote="' + esc(row.id) + '"><b>' + esc(row.label) + '</b><span>' + esc(minutesWord(row.minutes)) + '</span></button>';
  }
  function mount(host, opts) {
    var o = opts || {};
    var doc = g().document;
    if (!doc || !host) return null;
    var Fill = S().Fill, Spine = S().Spine;
    if (!Fill || !Spine) return null;
    var tables = o.tables || {};
    var scope = o.scope || 'queue';
    var roomId = o.roomId || null;
    var promoted = null, heroId = null, lastSnap = null, pendingChange = null;

    var card = doc.createElement('section');
    card.className = 'slaf-card fill-next';
    card.id = o.id || 'fill-next';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'What to fill next');
    card.innerHTML = '<div class="fc-line"><p class="fc-count" data-fc-count></p><div class="fc-meter" aria-hidden="true"><span data-fc-meter></span></div></div>'
      + '<div class="fc-hero" data-fc-hero></div>'
      + '<p class="fc-changed" data-fc-changed hidden></p>'
      + '<p class="fc-after-label" data-fc-after-label hidden>After that</p>'
      + '<div class="fc-after" data-fc-after></div>';
    if (o.before && o.before.parentNode === host) host.insertBefore(card, o.before);
    else host.insertBefore(card, host.firstChild);

    function list() {
      var h = Spine.getProfile();
      if (scope === 'loose') return Fill.looseEnds(h, tables, 'all').rows;
      return Fill.queue(h, tables);
    }
    function paintLine() {
      var f = Fill.finishLine(Spine.getProfile(), tables);
      var c = card.querySelector('[data-fc-count]');
      var m = card.querySelector('[data-fc-meter]');
      if (scope === 'loose') {
        var n = list().length;
        c.textContent = n ? n + (n === 1 ? ' loose end' : ' loose ends') + ' to go through.' : 'Nothing left to go through.';
        m.style.width = '0%';
        card.querySelector('.fc-line').classList.add('is-quiet');
        return;
      }
      c.textContent = f.sentence;
      m.style.width = (f.fieldsTotal ? Math.round(100 * f.fieldsDone / f.fieldsTotal) : 0) + '%';
    }
    function focused() { var a = doc.activeElement; return a && card.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA'); }
    function paintHero(rows, animate) {
      var hero = card.querySelector('[data-fc-hero]');
      var pick = rows.filter(function (r) { return r.id === promoted; })[0] || rows[0] || null;
      var id = pick ? pick.id : null;
      if (id === heroId && hero.childNodes.length) return;      /* same row: keep the live box as it is */
      if (focused() && heroId !== null && rows.some(function (r) { return r.id === heroId; })) return;
      heroId = id;
      function paint() {
        if (!pick) {
          hero.innerHTML = scope === 'loose'
            ? '<p class="fc-name">All gone through.</p><p class="slaf-hint">Everything you marked roughly or unknown has had its turn.</p>'
            : '<p class="fc-name">Nothing to ask.</p><p class="slaf-hint">Every number the plan needs is in. The Ledger holds the deeper rows, and Loose Ends holds what you marked roughly.</p>';
          if (scope === 'loose' && o.onDone) o.onDone(card);
          return;
        }
        /* A fresh body each time, so the click listener wired below dies
           with the row it was wired for: a listener left on the container
           would fire for every hero this card has ever shown. */
        hero.innerHTML = '';
        var body = doc.createElement('div');
        body.className = 'fc-hero-body';
        body.innerHTML = heroHtml(pick, tables, roomId);
        hero.appendChild(body);
        wire(body, pick, { tables: tables, roomId: roomId,
          /* The snapshot is taken BEFORE the write, and the spine's own
             change notice is held off while one is pending, so the
             sentence compares the plan before the tap with the plan after. */
          onBefore: function (row, action) { pendingChange = { before: lastSnap, row: row, action: action }; },
          onAct: function (res) {
            if (!res.ok) { pendingChange = null; return; }
            promoted = null;
            render(true);
          } });
      }
      if (animate && !reduced()) {
        hero.classList.add('is-leaving');
        setTimeout(function () { hero.classList.remove('is-leaving'); paint(); hero.classList.add('is-arriving'); setTimeout(function () { hero.classList.remove('is-arriving'); }, 260); }, 180);
      } else paint();
    }
    function paintAfter(rows) {
      var heroRow = rows.filter(function (r) { return r.id === heroId; })[0] || rows[0];
      var rest = rows.filter(function (r) { return !heroRow || r.id !== heroRow.id; }).slice(0, 2);
      card.querySelector('[data-fc-after]').innerHTML = rest.map(smallHtml).join('');
      card.querySelector('[data-fc-after-label]').hidden = !rest.length;
    }
    function paintChanged() {
      var p = card.querySelector('[data-fc-changed]');
      if (!pendingChange) return;
      var after = Fill.snapshot(Spine.getProfile(), tables, roomId);
      var s = Fill.whatChanged(pendingChange.before, after);
      var row = pendingChange.row, action = pendingChange.action;
      var lead = action === 'save' ? 'Saved ' + row.label.toLowerCase() + '.' : action === 'roughly' ? row.label + ', roughly.' : action === 'unknown' ? row.label + ' parked until you know.' : row.label + ' is out of the plan.';
      p.hidden = false;
      p.textContent = lead + (s ? ' ' + s : '');
      pendingChange = null;
    }
    function render(advance) {
      var rows = list();
      paintLine();
      paintHero(rows, !!advance);
      paintAfter(rows);
      paintChanged();
      lastSnap = Fill.snapshot(Spine.getProfile(), tables, roomId);
    }
    card.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-fc-promote]') : null;
      if (!b) return;
      promoted = b.getAttribute('data-fc-promote');
      render(true);
    });
    render(false);
    if (Spine.onChange) Spine.onChange(function () { if (!pendingChange) render(false); });
    return card;
  }

  return { mount: mount, editorHtml: editorHtml, wire: wire, ensure: ensure, ballparkHtml: ballparkHtml, minutesWord: minutesWord };
});
