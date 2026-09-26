/* binders/book.js, one playbook: its idea, six bands, every exercise and
   checklist, and the pictures. PB-001.
   READS  binders.v1 through Store; the tables through App.load.
   WRITES one answer or one tick at a time through Store.
   LIVE-FORM: built once. The exercise inputs are rendered once at load and
   never rebuilt; a change repaints only the pictures, the band tabs and
   the level states (elements that hold no typed input). */
(function () {
  'use strict';
  var B = window.BINDERS, App = B.App, Model = B.Model, Store = B.Store, Reads = B.Reads, esc = App.esc;
  var P = null, HUE = 'blue';

  function val(ex, state) { var e = Model.resolve(ex); return e ? state.answers[e.key] : undefined; }
  function inputFor(ex, state) {
    var v = val(ex, state), id = 'ex-' + ex.key, rough = state.rough[ex.key] ? ' checked' : '';
    var roughBox = '<label class="rough"><input type="checkbox" data-rough="' + esc(ex.key) + '"' + rough + '/> roughly for now</label>';
    switch (ex.kind) {
      case 'rating': return '<div class="rating" role="radiogroup" aria-label="' + esc(ex.label) + '">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" aria-checked="' + (v === n) + '" class="' + (v === n ? 'is-on' : '') + '" data-rating="' + esc(ex.key) + '" data-n="' + n + '">' + n + '</button>'; }).join('') + '</div>';
      case 'number': return '<div class="row"><input type="number" id="' + id + '" inputmode="decimal" step="any" data-key="' + esc(ex.key) + '" data-kind="number" value="' + (typeof v === 'number' ? v : '') + '"/>' + roughBox + '</div>';
      case 'money': return '<div class="row"><span class="affix"><span>$</span><input type="number" id="' + id + '" inputmode="decimal" step="any" min="0" data-key="' + esc(ex.key) + '" data-kind="money" value="' + (typeof v === 'number' ? (v / 100) : '') + '"/></span>' + roughBox + '</div>';
      case 'pct': return '<div class="row"><span class="affix"><input type="number" id="' + id + '" inputmode="decimal" step="any" min="0" max="100" data-key="' + esc(ex.key) + '" data-kind="pct" value="' + (typeof v === 'number' ? v : '') + '"/><span>%</span></span>' + roughBox + '</div>';
      case 'text': return '<input type="text" id="' + id + '" data-key="' + esc(ex.key) + '" data-kind="text" maxlength="400" value="' + esc(typeof v === 'string' ? v : '') + '"/>';
      case 'long': return '<textarea id="' + id + '" data-key="' + esc(ex.key) + '" data-kind="long" maxlength="4000">' + esc(typeof v === 'string' ? v : '') + '</textarea>';
      case 'list': return '<textarea id="' + id + '" class="list" data-key="' + esc(ex.key) + '" data-kind="list" maxlength="8000" placeholder="one a line">' + esc(Array.isArray(v) ? v.join('\n') : '') + '</textarea><span class="count" data-count="' + esc(ex.key) + '">' + (Array.isArray(v) ? v.length : 0) + ' lines</span>';
      case 'choice': return '<select id="' + id + '" data-key="' + esc(ex.key) + '" data-kind="choice"><option value="">choose one</option>' + ex.options.map(function (o, i) { return '<option value="' + i + '"' + (v === i ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
      case 'log': {
        var rows = Array.isArray(v) ? v : [];
        var t = '<table class="log" data-log="' + esc(ex.key) + '"><thead><tr>' + ex.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>';
        rows.forEach(function (r) { t += logRow(ex, r); });
        t += '</tbody></table><div class="row" style="margin-top:6px"><button type="button" class="slaf-btn slaf-btn--quiet" data-addrow="' + esc(ex.key) + '">Add a row</button></div>';
        return t;
      }
      default: return '';
    }
  }
  function logRow(ex, r) {
    return '<tr>' + ex.columns.map(function (c, i) { var cell = Array.isArray(r) ? r[i] : ''; return '<td><input type="text" inputmode="' + (i === 0 ? 'text' : 'decimal') + '" aria-label="' + esc(c) + '" value="' + esc(cell === null || cell === undefined ? '' : cell) + '"/></td>'; }).join('') + '<td><button type="button" class="del" aria-label="Remove this row">remove</button></td></tr>';
  }
  function refBlock(ex, state) {
    var o = Model.exercise(ex.ref);
    if (!o) return '<div class="ex"><span class="lab">' + esc(ex.ref) + '</span><p class="help">This fact has no owner in the table.</p></div>';
    var v = state.answers[o.ex.key], has = !Store.isEmpty(v);
    var shown = !has ? 'not yet' : o.ex.kind === 'money' ? Reads.fmtMoney(v) : o.ex.kind === 'pct' ? v + '%' : String(v);
    return '<div class="ex"><span class="lab">' + esc(o.ex.label) + '</span><div class="ref"><b data-refval="' + esc(o.ex.key) + '">' + esc(shown) + '</b><span class="bd-note">read from</span><a href="playbook.html?id=' + esc(o.playbook.id) + '#band-' + o.level.band + '">' + esc(o.playbook.label) + ', band ' + o.level.band + '</a></div></div>';
  }

  function build() {
    var state = Store.load(), bands = Model.bands();
    var sys = Model.system(P.system);
    document.getElementById('book-head').innerHTML = '<div><span class="slaf-eyebrow">' + esc(sys.label) + ' system, planet ' + esc(P.letter) + '</span><h2 style="margin-top:4px">' + esc(P.oneLine) + '</h2><p class="idea">' + esc(P.idea) + '</p></div>';
    document.getElementById('bands').innerHTML = bands.map(function (b) { return '<button type="button" class="band-tab" data-band="' + b.n + '" title="' + esc(b.meaning) + '"><b>' + b.n + ' ' + esc(b.name) + '</b><small></small></button>'; }).join('');
    document.getElementById('levels').innerHTML = P.levels.map(function (l) {
      var b = bands[l.band - 1];
      return '<section class="level" id="band-' + l.band + '" data-level="' + esc(l.id) + '"><div class="level-head"><span class="eyebrow">Band ' + l.band + ', ' + esc(b.name) + ' · ' + esc(b.payoff) + ' · about ' + l.minutes + ' min</span><span class="state" data-state="' + esc(l.id) + '"></span></div>'
        + '<h2>' + esc(l.title) + '</h2><p class="why">' + esc(l.why) + '</p>'
        + l.exercises.map(function (ex) {
          if (ex.ref) return refBlock(ex, state);
          return '<div class="ex"><label for="ex-' + esc(ex.key) + '">' + esc(ex.label) + (ex.shared ? ' <span class="slaf-chip" title="Typed here, read by other playbooks">shared</span>' : '') + '</label>' + (ex.help ? '<p class="help">' + esc(ex.help) + '</p>' : '') + inputFor(ex, state) + '</div>';
        }).join('')
        + (l.checklist.length ? '<ul class="checklist" aria-label="Checklist"><h4>Checklist</h4>' + l.checklist.map(function (c, i) { var on = state.checks[l.id] && state.checks[l.id][i]; return '<li><label class="' + (on ? 'is-on' : '') + '"><input type="checkbox" data-tick="' + esc(l.id) + '" data-i="' + i + '"' + (on ? ' checked' : '') + '/><span>' + esc(c) + '</span></label></li>'; }).join('') + '</ul>' : '')
        + '<p class="checkpoint" data-checkpoint="' + esc(l.id) + '">' + esc(l.checkpoint) + '</p></section>';
    }).join('');
    wire();
    paint();
  }

  function paint() {
    var state = Store.load(), pl = Model.planet(P, state), bands = Model.bands();
    document.querySelectorAll('.band-tab').forEach(function (tab, i) {
      var l = pl.levels[i];
      tab.className = 'band-tab is-' + l.state + (pl.band === l.band ? ' is-on' : '');
      tab.querySelector('small').textContent = l.filled + '/' + l.of + ' · ' + l.ticked + '/' + l.ofChecks;
    });
    pl.levels.forEach(function (l) {
      var st = document.querySelector('[data-state="' + l.id + '"]');
      st.textContent = l.state === 'done' ? 'done' : l.filled + ' of ' + l.of + ' answered, ' + l.ticked + ' of ' + l.ofChecks + ' ticked';
      st.className = 'state' + (l.state === 'done' ? ' is-done' : '');
      var cp = document.querySelector('[data-checkpoint="' + l.id + '"]');
      cp.className = 'checkpoint' + (l.state === 'done' ? ' is-done' : '');
    });
    document.querySelectorAll('[data-refval]').forEach(function (el) {
      var o = Model.exercise(el.getAttribute('data-refval')), v = state.answers[o.ex.key], has = !Store.isEmpty(v);
      el.textContent = !has ? 'not yet' : o.ex.kind === 'money' ? Reads.fmtMoney(v) : o.ex.kind === 'pct' ? v + '%' : String(v);
    });
    var reads = Reads.forPlaybook(P.id, state.answers);
    document.getElementById('reads').innerHTML = reads.map(function (r) { return App.readCard(r, HUE); }).join('');
    var sub = document.getElementById('progress-say');
    sub.textContent = pl.done + ' of ' + pl.of + ' levels done' + (pl.band ? ', working on band ' + pl.band + ' (' + bands[pl.band - 1].name + ')' : ': this planet is complete') + '.';
  }

  function commit(input) {
    var key = input.getAttribute('data-key'), kind = input.getAttribute('data-kind'), raw = input.value, v = null;
    if (kind === 'number' || kind === 'pct') { var n = parseFloat(raw); v = isFinite(n) ? n : null; }
    else if (kind === 'money') { var d = parseFloat(raw); v = isFinite(d) ? Math.round(d * 100) : null; }
    else if (kind === 'text' || kind === 'long') v = raw.trim() ? raw : null;
    else if (kind === 'list') { v = raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); var c = document.querySelector('[data-count="' + key + '"]'); if (c) c.textContent = v.length + ' lines'; }
    else if (kind === 'choice') v = raw === '' ? null : parseInt(raw, 10);
    Store.answer(key, v);
    paint();
  }
  function commitLog(table) {
    var key = table.getAttribute('data-log'), rows = [];
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var cells = Array.prototype.map.call(tr.querySelectorAll('input'), function (i) { return i.value.trim(); });
      if (cells.some(Boolean)) rows.push(cells.map(function (c, i) { if (i === 0) return c; var n = parseFloat(c); return c === '' ? null : (isFinite(n) ? n : c); }));
    });
    Store.answer(key, rows);
    paint();
  }
  function wire() {
    var root = document.getElementById('levels');
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-key')) commit(t);
      else if (t.hasAttribute('data-rough')) { Store.rough(t.getAttribute('data-rough'), t.checked); }
      else if (t.hasAttribute('data-tick')) { Store.tick(t.getAttribute('data-tick'), parseInt(t.getAttribute('data-i'), 10), t.checked); t.closest('label').className = t.checked ? 'is-on' : ''; paint(); }
      else if (t.closest('table.log')) commitLog(t.closest('table.log'));
    });
    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.getAttribute('data-kind') === 'list') { var c = document.querySelector('[data-count="' + t.getAttribute('data-key') + '"]'); if (c) c.textContent = t.value.split('\n').filter(function (s) { return s.trim(); }).length + ' lines'; }
    });
    root.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-rating')) {
        var key = t.getAttribute('data-rating'), n = parseInt(t.getAttribute('data-n'), 10), cur = Store.load().answers[key];
        Store.answer(key, cur === n ? null : n);
        t.parentNode.querySelectorAll('button').forEach(function (b) { var on = b === t && cur !== n; b.className = on ? 'is-on' : ''; b.setAttribute('aria-checked', String(on)); });
        paint();
      } else if (t.hasAttribute('data-addrow')) {
        var ex = null; P.levels.forEach(function (l) { l.exercises.forEach(function (x) { if (x.key === t.getAttribute('data-addrow')) ex = x; }); });
        var tbody = t.parentNode.previousElementSibling.querySelector('tbody');
        tbody.insertAdjacentHTML('beforeend', logRow(ex, []));
        tbody.lastElementChild.querySelector('input').focus();
      } else if (t.classList.contains('del')) {
        var table = t.closest('table.log'); t.closest('tr').remove(); commitLog(table);
      }
    });
    document.getElementById('bands').addEventListener('click', function (e) {
      var t = e.target.closest('.band-tab'); if (!t) return;
      var el = document.getElementById('band-' + t.getAttribute('data-band')); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.querySelector('input, textarea, select, button') && el.querySelector('input, textarea, select, button').focus({ preventScroll: true }); }
    });
  }

  App.load().then(function () {
    var id = App.qs('id') || 'machine';
    P = Model.byId(id);
    if (!P) { P = Model.playbooks()[0]; }
    HUE = App.hueOf(P.system);
    var all = Model.playbooks(), idx = all.indexOf(P), prev = all[(idx + all.length - 1) % all.length], next = all[(idx + 1) % all.length];
    document.title = P.label + ', The Binders';
    App.header(document.getElementById('head'), 'A playbook', P.label, P.oneLine, '<a class="slaf-btn slaf-btn--quiet" href="index.html">The sky</a>');
    document.getElementById('book-nav').innerHTML = '<a href="playbook.html?id=' + esc(prev.id) + '">&larr; ' + esc(prev.label) + '</a><span class="bd-note">·</span><a href="playbook.html?id=' + esc(next.id) + '">' + esc(next.label) + ' &rarr;</a>';
    App.footer(document.getElementById('foot'));
    build();
    if (location.hash) { var el = document.querySelector(location.hash); if (el) el.scrollIntoView(); }
  }).catch(function (e) { document.getElementById('main').insertAdjacentHTML('afterbegin', '<p class="bd-say is-bad">The tables did not load (' + esc(e.message) + '). Serve this folder over HTTP: python3 -m http.server, then open /binders/.</p>'); });
})();
