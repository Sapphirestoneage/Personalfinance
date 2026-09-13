/* ==========================================================================
   shared/room.js — the one shape every room has.
   BRIEF step 4, DECISIONS.md D-097. FROZEN after Real Hourly Wage proved it.
   --------------------------------------------------------------------------
   A room is: one number, one chart (animated on change), the lens toggle,
   two to five inputs written to the spine, an assumptions drawer with
   sources, "why this matters at your stage", one out-of-scope line that
   points to Get Help, deep links to each of those, and a rendering with
   guesses when the spine is empty. The page holds the skeleton (the ids
   below, so deep links and the registry's subsection check are literal);
   this file fills it from a spec and keeps it live.

     Room.mount({
       id,                     the registry id (registerRoom, Progress)
       tables: [...] | null,   the reference tables to load (null = all)
       reads: ['fieldId'],     owned fields shown as chips (read-only links)
       number(h, T)  → { value, label, sub, zone, result }   the headline
       chart(h, T)   → html | ''                             one Charts.* call
       horizon: true           (optional) a projection room: paints the
                               today's-money line and the toggle (15.2)
       inputs: [...]           2–5 controls, each
                                { ctl, label, kind: money|number|pct|select|choice|text,
                                  placeholder, hint, options, read(h) → raw,
                                  write(raw), affix }
       more: [...]             the same, folded (optional)
       amounts(h, T) → [{ label, cents, href }]             what the lens reads
       assumptions(h, T) → [{ label, value, source }]       the drawer
       why(h, T)     → string                                per situation
       scope: string           the out-of-scope line (→ Get Help)
       guessAs: 'retired'      (optional) the situation to guess on an empty
                               spine, for a room that exists for one
       part: true              (optional) this is ONE READING inside a room
                               that registers itself, not the room. Added by
                               the 93-to-30 merge (D-229): a merged room owns
                               the registration, the sidebar and the hash,
                               and a reading that claimed any of them would
                               claim them twice. Everything else is the same.
       prefix: 'kids-'         (optional) TWO readings on one page, each
       root: 'view-kids'       built from this template (D-235). The skeleton
                               ids below are fixed names, so a second copy on
                               the same page would write into the first one's
                               nodes. `prefix` puts every id behind a name of
                               this reading's own (kids-room-number), which
                               also keeps them unique for deep links; `root`
                               is the id of the section the reading lives in,
                               so its document listeners ignore controls that
                               belong to the reading next door. Pass both or
                               neither.
     })

   LIVE-FORM: built once. Inputs are built from the spec on mount and only
   ever have .value set, never while focused. The chart is re-drawn only when
   its HTML changes, so typing in a box never re-animates it.

   THEMING: none this pass. A theme is a class on <body> and a palette in
   shared/theme.css; nothing here names a colour.
   ========================================================================== */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { if (typeof module === 'object' && module.exports) module.exports = { IDS: ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list'] }; return; }
  var S = root.SLAF || (root.SLAF = {});
  var Money = S.Money, Schema = S.Schema, Spine = S.Spine, Reference = S.Reference, Ownership = S.Ownership,
      Gate = S.Gate, Lens = S.Lens, Suggest = S.Suggest, Registry = S.Registry;

  var IDS = ['room-number', 'room-chart', 'room-inputs', 'room-lens', 'room-amounts', 'room-assumptions', 'room-why', 'room-scope', 'reading-list'];

  function el(id) { return document.getElementById(id); }
  function elIn(prefix, id) { return document.getElementById((prefix || '') + id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function control(spec, prefix) {
    var id = (prefix || '') + 'ctl-' + spec.ctl;
    var label = '<span class="slaf-label">' + esc(spec.label) + '</span>';
    var affix = spec.kind === 'money' ? '<span class="slaf-affix">$</span>' : '';
    var suffix = spec.kind === 'pct' ? '<span class="slaf-affix">%</span>' : spec.affix ? '<span class="slaf-affix">' + esc(spec.affix) + '</span>' : '';
    var box;
    if (spec.kind === 'select') {
      box = '<select data-ctl="' + esc(spec.ctl) + '" id="' + id + '" aria-label="' + esc(spec.label) + '">'
        + (spec.options || []).map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select>';
      return '<label class="slaf-field">' + label + '<span class="slaf-input-shell">' + box + '</span></label>';
    }
    if (spec.kind === 'choice') {
      return '<div class="slaf-field"><span class="slaf-label">' + esc(spec.label) + '</span><div class="choices" data-choices="' + esc(spec.ctl) + '">'
        + (spec.options || []).map(function (o) { return '<button type="button" class="choice" data-value="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'
        + (spec.hint ? '<span class="slaf-hint">' + esc(spec.hint) + '</span>' : '') + '</div>';
    }
    box = '<input type="text"' + (spec.kind === 'text' ? '' : ' inputmode="decimal"') + ' data-ctl="' + esc(spec.ctl) + '" id="' + id + '" placeholder="' + esc(spec.placeholder || '') + '" autocomplete="off" aria-label="' + esc(spec.label) + '"/>';
    return '<label class="slaf-field">' + label + '<span class="slaf-input-shell">' + affix + box + suffix + '</span>'
      + (spec.hint ? '<span class="slaf-hint">' + esc(spec.hint) + '</span>' : '') + '</label>';
  }

  function display(spec, raw) {
    if (!Money.isEntered(raw)) return '';
    if (spec.kind === 'money') return Money.formatCents(raw, { exact: true });   /* a typed value is shown as typed, never rounded (15.10) */
    if (spec.kind === 'pct') return String(Math.round(raw * 1000) / 10);
    return String(raw);
  }
  function parse(spec, text) {
    var t = String(text).trim();
    if (t === '') return null;
    if (spec.kind === 'money') return Money.parseMoney(t);
    if (spec.kind === 'text') return t;   /* 15.7: a name is words, not a number */
    var n = Number(t.replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(n)) return null;
    return spec.kind === 'pct' ? n / 100 : n;
  }

  function mount(spec) {
    var ROOM_ID = spec.id;
    var TABLES = null;
    var lastChart = null;
    /* Two readings from this template on one page: each names its own nodes
       and ignores the other's controls (D-235). With neither set this is the
       same lookup it always was. */
    var PREFIX = spec.prefix || '';
    var el = function (id) { return elIn(PREFIX, id); };
    var ROOT = spec.root ? document.getElementById(spec.root) : null;
    function mine(node) { return !ROOT || ROOT.contains(node); }
    var all = (spec.inputs || []).concat(spec.more || []);
    if (spec.inputs && (spec.inputs.length < 2 || spec.inputs.length > 5)) throw new Error('A room has two to five inputs; ' + ROOM_ID + ' has ' + spec.inputs.length);

    /* ---- Build once ------------------------------------------------------- */
    var inputsHost = el('room-inputs');
    if (inputsHost) {
      var ctl = function (c) { return control(c, PREFIX); };
      inputsHost.innerHTML = '<div class="room-grid">' + (spec.inputs || []).map(ctl).join('') + '</div>'
        + (spec.more && spec.more.length ? '<details class="room-more"><summary>' + esc(spec.moreLabel || 'Fine-tune') + '</summary><div class="room-grid">' + spec.more.map(ctl).join('') + '</div></details>' : '');
    }
    var byCtl = {};
    all.forEach(function (c) { byCtl[c.ctl] = c; });

    /* ---- The household this room renders ---------------------------------- */
    function standalone(h) {
      var room = Registry.byId(ROOM_ID);
      var needs = (room && room.needs) || [];
      var missing = needs.filter(function (f) { var d = Ownership.describe(f, h, ROOM_ID); return d && d.applies && !d.isSet; });
      return missing.length > 0;
    }
    function household() {
      var h = Spine.getProfile();
      if (spec.standalone === false || !TABLES || !standalone(h)) return h;
      return Gate.fillGuesses(h, TABLES, spec.guessAs || null);
    }

    /* ---- Paint --------------------------------------------------------------- */
    function paintInputs(h) {
      all.forEach(function (c) {
        if (c.kind === 'choice') {
          var v = c.read(h);
          Array.prototype.forEach.call(document.querySelectorAll('[data-choices="' + c.ctl + '"] .choice'), function (b) {
            b.setAttribute('aria-pressed', String(v !== null && v !== undefined && String(v) === b.getAttribute('data-value')));
          });
          return;
        }
        var node = document.querySelector('[data-ctl="' + c.ctl + '"]');
        if (!node || node === document.activeElement) return;
        var raw = c.read(h);
        if (c.kind === 'select') { node.value = raw === null || raw === undefined ? '' : String(raw); return; }
        if (Suggest && c.propose && !Money.isEntered(raw)) {
          var g = c.propose(h, TABLES);
          if (g) { Suggest.show(node, { value: g.value, display: display(c, g.value), source: g.source, onUse: function (v) { c.write(v); render(); } }); return; }
        }
        if (Suggest) Suggest.clear(node);
        node.value = display(c, raw);
      });
    }
    /* The dead spot is the door. Where the number should be, an incomplete room
       prints the words "Add your debts to see this" - and the app knows exactly
       which room owns that number, so the sentence should also take you there.
       The link carries the way back (D-161), so the trip is a round one.
       Only the first outstanding field is offered: a stack of links at the
       point of failure is a menu, not a next step. D-163. */
    function goHtml(h) {
      var room = Registry.byId(ROOM_ID);
      var needs = (room && room.needs) || [];
      for (var i = 0; i < needs.length; i++) {
        var d = Ownership.describe(needs[i], h, ROOM_ID);
        if (!d || !d.applies || d.isSet || d.isOwnHere) continue;
        return '<a class="slaf-go" href="' + esc(d.href) + '">'
          + esc(d.label) + ' is in ' + esc(d.ownerTitle) + ' \u2192</a>';
      }
      return '';
    }

    /* 15.10: the room's inputs (the registry's `needs`, plus anything the
       spec names in `reads`) decide the precision of every figure on the
       screen. One line at the top names the rough inputs; the money
       formatter rounds to match. D-181. */
    /* 15.2: a projection room (spec.horizon) says once, at the top, that
       every figure is today's money, and carries the future-dollars toggle.
       Mounted once; the callback repaints the room. D-181. */
    var horizonMounted = false;
    function paintHorizon() {
      if (!spec.horizon || horizonMounted || !root.SLAF.Horizon) return;
      var anchor = el('room-number');
      if (!anchor) return;
      var host = document.createElement('p');
      host.id = 'room-horizon';
      host.className = 'slaf-horizon';
      anchor.parentNode.insertBefore(host, anchor);
      horizonMounted = true;
      root.SLAF.Horizon.mount(host, { household: household, onChange: function () { lastChart = null; paint(); } });
    }
    function paintApproximate(h) {
      var room = Registry.byId(ROOM_ID);
      var ids = ((room && room.needs) || []).concat(spec.reads || []);
      var p = Schema.precisionOf(h, ids);
      Money.setDisplayRounding(p.roundToCents);
      var host = el('room-approx');
      if (!host) {
        var anchor = el('room-number');
        if (!anchor) return;
        host = document.createElement('p');
        host.id = 'room-approx';
        host.className = 'slaf-approx';
        anchor.parentNode.insertBefore(host, anchor);
      }
      if (!p.approximate) { host.hidden = true; host.textContent = ''; return; }
      var names = p.fieldIds.map(function (id) { var d = Ownership.describe(id, h, ROOM_ID); return d ? '<a href="' + esc(d.href) + '">' + esc(d.label.toLowerCase()) + '</a>' : esc(id); });
      host.hidden = false;
      host.innerHTML = 'Approximate: ' + names.join(', ') + (names.length === 1 ? ' is ' : ' are ') + (p.confidence === 'unknown' ? 'not confirmed yet' : 'rough') + ', so figures here are rounded to the nearest ' + (p.roundToCents >= 100000 ? 'thousand' : 'hundred') + ' dollars.';
    }
    function paintNumber(h) {
      var host = el('room-number');
      if (!host || !spec.number) return;
      var n = spec.number(h, TABLES) || {};
      var ok = n.value !== null && n.value !== undefined && n.value !== '';
      host.innerHTML = '<span class="cap">' + esc(n.label || '') + '</span>'
        + '<span class="big' + (ok ? (n.zone ? ' is-' + n.zone : '') : ' is-incomplete') + '">' + esc(ok ? n.value : (n.reason || Money.EM_DASH)) + '</span>'
        + (ok ? '' : goHtml(h))
        + (n.sub ? '<span class="sub">' + n.sub + '</span>' : '');
    }
    function paintChart(h) {
      var host = el('room-chart');
      if (!host || !spec.chart) return;
      var html = spec.chart(h, TABLES) || '';
      if (html === lastChart) return;
      lastChart = html;
      host.innerHTML = html;
      var c = host.querySelector('.slaf-chart');
      if (c) { c.classList.add('is-animated'); }
    }
    function paintLens(h) {
      var host = el('room-lens'), list = el('room-amounts');
      if (!host || !Lens) return;
      host.innerHTML = Lens.toggleHtml(h, TABLES, 'lens');
      if (!list || !spec.amounts) return;
      var mode = Lens.mode();
      var rows = spec.amounts(h, TABLES) || [];
      list.innerHTML = rows.map(function (r) {
        if (!Money.isEntered(r.cents)) return '';
        var shown = mode === '$' ? Money.formatCents(r.cents) : Lens.format(r.cents, mode, h, TABLES);
        var label = r.href ? '<a href="' + esc(r.href) + '">' + esc(r.label) + '</a>' : esc(r.label);
        return '<li>' + label + '<span>' + esc(shown) + '</span></li>';
      }).join('');
    }
    function paintAssumptions(h) {
      var host = el('room-assumptions');
      if (!host || !spec.assumptions) return;
      var rows = spec.assumptions(h, TABLES) || [];
      var body = host.querySelector('.room-assumptions-body') || host;
      body.innerHTML = '<dl>' + rows.map(function (r) {
        return '<dt>' + esc(r.label) + '</dt><dd><b>' + esc(r.value) + '</b>' + (r.source ? '<small>' + esc(r.source) + '</small>' : '') + '</dd>';
      }).join('') + '</dl>';
    }
    function paintWhy(h) {
      var host = el('room-why');
      if (!host || !spec.why) return;
      var text = spec.why(h, TABLES, Gate.situationOf(h));
      host.textContent = text || '';
      host.hidden = !text;
    }
    function paintScope() {
      var host = el('room-scope');
      if (!host) return;
      var help = Registry.byId('get-help');
      host.innerHTML = esc(spec.scope || '') + (help ? ' <a href="' + Ownership.linkTo('get-help', null) + '">' + esc(help.title) + ' →</a>' : '');
    }
    function paintReads(h, real) {
      var host = el('reading-list');
      if (!host || !spec.reads) return;
      host.innerHTML = spec.reads.map(function (f) { return Ownership.chip(f, real, ROOM_ID); }).join('');
    }
    function paintStandalone(h) {
      var host = el('room-standalone');
      if (!host) return;
      var filled = h.meta && h.meta.standalone;
      host.hidden = !(filled && filled.length);
      if (filled && filled.length) {
        host.innerHTML = 'Shown with guesses for ' + filled.map(function (f) { var d = Ownership.field(f); return d ? d.label.toLowerCase() : f; }).join(', ')
          + '. <a href="' + Ownership.linkTo('start', null) + '">Make it yours in Start Here →</a>';
      }
    }

    var queued = false;
    function paint() {
      if (!TABLES) return;
      var real = Spine.getProfile();
      var h = household();
      /* Display rounding (D-181) is a page-global, and since the merges a
         page holds several readings. A PART mount rounds its own figures
         and then puts the unit back, so the reading beside it — which
         computes from its own typed boxes, all of them sure — is not
         rounded to a precision that belongs to someone else's fields. The
         Deal showed a $714 cash flow as $1,000 and a $481 monthly loss as
         $0 that way, the moment it became a reading of Housing. D-258. */
      var outer = spec.part ? Money.displayRounding() : null;
      paintInputs(h);
      paintHorizon();
      paintApproximate(h);
      paintNumber(h);
      paintChart(h);
      paintLens(h);
      paintAssumptions(h);
      paintWhy(h);
      paintScope();
      paintReads(h, real);
      paintStandalone(h);
      if (typeof spec.after === 'function') spec.after(h, TABLES);
      if (outer !== null) Money.setDisplayRounding(outer);
    }
    function render() { if (queued) return; queued = true; setTimeout(function () { queued = false; paint(); }, 0); }

    /* One undo entry per box, named for it: "Paid hours a week → 40". */
    function labelled(c, raw, fn) {
      var shown = raw === null || raw === undefined ? '—' : (c.kind === 'money' ? Money.formatCents(raw, { exact: true }) : c.kind === 'pct' ? (Math.round(raw * 1000) / 10) + '%' : String(raw));
      Spine.batch(c.label + ' → ' + shown, fn);
    }

    /* ---- Events --------------------------------------------------------------- */
    document.addEventListener('focusin', function (evt) {
      var node = evt.target;
      var c = node.getAttribute && byCtl[node.getAttribute('data-ctl')];
      if (!c || node.tagName !== 'INPUT' || !mine(node)) return;
      if (Suggest && Suggest.isSuggested(node)) return;   /* Suggest clears it on focus */
      var raw = c.read(household());
      if (Money.isEntered(raw)) node.value = c.kind === 'money' ? String(raw / 100) : c.kind === 'pct' ? String(Math.round(raw * 1000) / 10) : String(raw);
      try { node.select(); } catch (e) { /* fine */ }
    });
    document.addEventListener('focusout', function (evt) {
      var node = evt.target;
      var c = node.getAttribute && byCtl[node.getAttribute('data-ctl')];
      if (!c || node.tagName !== 'INPUT' || !mine(node)) return;
      var text = Suggest ? Suggest.entered(node) : node.value;
      if (Suggest && Suggest.isSuggested(node) && String(text).trim() === '') return;
      var raw = parse(c, text);
      labelled(c, raw, function () { c.write(raw); });
      render();
    });
    document.addEventListener('change', function (evt) {
      var node = evt.target;
      var c = node.getAttribute && byCtl[node.getAttribute('data-ctl')];
      if (!c || node.tagName !== 'SELECT' || !mine(node)) return;
      var v = node.value === '' ? null : node.value;
      labelled(c, v, function () { c.write(v); });
      render();
    });
    document.addEventListener('click', function (evt) {
      var b = evt.target.closest('[data-choices] .choice');
      if (b && mine(b)) { var c = byCtl[b.closest('[data-choices]').getAttribute('data-choices')]; if (c) { var v = b.getAttribute('data-value'); labelled(c, v, function () { c.write(v); }); render(); } return; }
      if (b) return;
      var l = evt.target.closest('.slaf-lens-btn');
      if (l && mine(l) && Lens) { Lens.setMode(l.getAttribute('data-lens')); render(); }
    });
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' && evt.target.tagName === 'INPUT' && evt.target.getAttribute('data-ctl') && mine(evt.target)) { evt.preventDefault(); evt.target.blur(); }
    });

    function jumpToHash() {
      if (!location.hash) return;
      var t = document.getElementById(location.hash.slice(1));
      if (!t) return;
      var d = t.closest('details'); if (d) d.open = true;
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (!spec.part) window.addEventListener('hashchange', jumpToHash);

    /* A reading inside a merged room leaves registration, the sidebar and
       the hash to the room it sits in (D-232). Two registerRoom calls on one
       page mark the same room visited twice and mount a second sidebar. */
    if (!spec.part) {
      Spine.registerRoom(ROOM_ID);
      if (S.Progress) S.Progress.mount(ROOM_ID);
    }
    Spine.onChange(render);

    Reference.load(spec.tables || undefined).then(function (t) {
      TABLES = t;
      if (typeof spec.ready === 'function') spec.ready(t);
      paint();
      if (!spec.part) jumpToHash();
    }).catch(function (err) {
      var notice = el('load-notice');
      if (!notice) return;
      notice.hidden = false;
      notice.className = 'notice is-error';
      notice.textContent = 'Couldn’t load the reference tables in data/ (' + err.message + '). Serve this over HTTP — python3 -m http.server — rather than opening the file directly.';
    });

    return { render: render, household: household, tables: function () { return TABLES; } };
  }

  S.Room = { IDS: IDS, mount: mount, control: control };
})(typeof self !== 'undefined' ? self : this);
