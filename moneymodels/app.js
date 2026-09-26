/* ==========================================================================
   moneymodels/app.js, the one page: the Sky, a planet, the figures, the
   plays, your model (MM-005). Draws only; every reading comes from
   engines/model.js, every picture from shared/charts.js, every value from
   shared/store.js.

   LIVE-FORM: #lv-panel is built once when a level opens (buildLevel) and is
   never rebuilt by a change in the store; typing repaints only the bands
   list and the payoff strip (paintAround). Quiz answers and ticks repaint
   their own row in place.
   ========================================================================== */
(function () {
  'use strict';
  var Tables = MM.Tables, Store = MM.Store, Model = MM.Model, Charts = MM.Charts;
  var T = null, view = null, openPlanet = null, openLevel = null, builtLevel = null;
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function say(t) { el('mm-say').textContent = t || ''; }
  function fmt(v, u, s) { return Model.fmt(v, u, s); }
  function levelHref(lv) { return '#planet/' + lv.planet + '/' + lv.id; }

  /* ---- Reading and writing a box ---------------------------------------------- */
  function parseNumber(kind, raw) {
    var s = String(raw || '').replace(/[$,%\s]/g, '');
    if (s === '' || s === '-' || s === '.') return null;
    var x = Number(s); if (!isFinite(x)) return null;
    if (kind === 'cents') return Math.round(x * 100);
    if (kind === 'count' || kind === 'days') return Math.round(x);
    return Math.round(x * 100) / 100;
  }
  function showNumber(kind, v) {
    if (v === null || v === undefined) return '';
    if (kind === 'cents') return (v / 100).toLocaleString('en-US', { minimumFractionDigits: v % 100 ? 2 : 0, maximumFractionDigits: 2 });
    return String(v);
  }
  var AFFIX = { cents: ['$', ''], percent: ['', '%'], count: ['', ''], days: ['', 'days'] };

  /* ---- Routing ------------------------------------------------------------------- */
  function route() {
    var h = location.hash || '#sky', m;
    if ((m = /^#planet\/([a-z]+)(?:\/([A-Z]\d+))?$/.exec(h))) { view = 'planet'; openPlanet = m[1]; openLevel = m[2] || null; }
    else if (/^#(kpis|plays|model)$/.test(h)) { view = h.slice(1); }
    else view = 'sky';
    ['sky', 'planet', 'kpis', 'plays', 'model'].forEach(function (v) { el('view-' + v).hidden = v !== view; });
    document.querySelectorAll('.mm-nav a').forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('data-nav') === (view === 'planet' ? 'sky' : view)); });
    paint(true);
    window.scrollTo(0, 0);
  }
  function paint(fresh) {
    var st = Store.load();
    if (view === 'sky') paintSky(st);
    else if (view === 'planet') paintPlanet(st, fresh);
    else if (view === 'kpis') paintKpis(st);
    else if (view === 'plays') paintPlays(st);
    else if (view === 'model') paintModel(st);
  }
  /* Everything but the open level's boxes. */
  function paintAround() { paint(false); }

  /* ---- The Sky --------------------------------------------------------------------- */
  function sunState(rec) { var r = rec.ratio30; return !r || !r.ready ? 0 : r.value >= 2 ? 2 : r.value >= 1 ? 1 : 0; }
  function recipesById(st) { var o = {}; Model.recipes(st).forEach(function (r) { o[r.id] = r; }); return o; }
  function paintSky(st) {
    var P = Model.planets(st), rec = recipesById(st), sun = sunState(rec);
    el('sky-actions').innerHTML = (Store.hasAnything(st) ? '' : '<button type="button" class="slaf-btn slaf-btn--primary" id="btn-demo">Try with example numbers</button>')
      + (Store.hasAnything(st) ? '<button type="button" class="slaf-btn" id="btn-demo">Replace with example numbers</button><button type="button" class="slaf-btn slaf-btn--quiet" id="btn-reset">Start over</button>' : '')
      + '<button type="button" class="slaf-btn slaf-btn--quiet" id="btn-export">Save a file</button>'
      + '<label class="slaf-btn slaf-btn--quiet">Load a file<input type="file" class="mm-file" id="in-import" accept="application/json"/></label>';
    el('sky-host').innerHTML = Charts.sky(P.planets, sun);
    var n = P.next;
    el('sky-next').innerHTML = '<span class="slaf-eyebrow">Next up</span><h2>' + (P.done ? esc(P.done + ' of ' + P.total + ' levels done') : 'Start here') + (P.rings ? ', band ' + P.rings + ' cleared on every planet' : '') + '</h2><div class="mm-nextrow">'
      + n.map(function (x) { return '<a href="' + levelHref(x.level) + '"><b>' + esc(x.planetLabel + ' ' + x.level.level + ': ' + x.level.title) + '</b><span>' + esc(x.why + ' About ' + x.level.minutes + (x.level.minutes === 1 ? ' minute.' : ' minutes.')) + '</span></a>'; }).join('')
      + (n.length ? '' : '<p class="mm-empty">Every level is done. Sharpen the numbers on the Prove bands as the runs come in.</p>') + '</div>';
    var r = rec.ratio30;
    el('sky-sun').innerHTML = '<span class="slaf-eyebrow">The sun: 30-day ratio</span>'
      + (r.ready ? '<div class="mm-big is-' + (Model.status('ratio30', r.value) || 'none') + '">' + esc(fmt(r.value, 'ratio')) + '</div><p>' + esc(fmt(rec.gp30.value, 'cents')) + ' of gross profit per customer in the first 30 days, against ' + esc(fmt(rec.cac.value, 'cents')) + ' to get one. ' + (r.value >= 2 ? 'Every customer pays for the next one.' : r.value >= 1 ? 'Break even inside the month. Twice the cost is the self-funding line.' : 'Not yet paying back inside the month.') + '</p>'
        : '<div class="mm-big">not yet</div><p>Needs ' + r.missing.length + ' more answers: ' + missingLinks(r, 4) + '</p>')
      + '<p><a href="#model">Your model</a> shows how the four offers add up.</p>';
    el('sky-planets').innerHTML = P.planets.map(function (p) {
      return '<a class="mm-planet" href="#planet/' + esc(p.id) + '">' + Charts.ring(p.done, p.total, p.hue) + '<span><b>' + esc(p.label) + '</b><span class="mm-count">' + esc(p.done + ' of ' + p.total + ' levels, ' + (p.orbit ? 'band ' + p.orbit + ' cleared' : 'band 1 open')) + '</span><p>' + esc(p.blurb) + '</p><span class="mm-dots">'
        + p.bands.map(function (b) { return b.rows.map(function (rw) { return '<i class="mm-dot' + (rw.state === 'done' ? ' is-done' : rw.state === 'part' ? ' is-part' : '') + '" title="' + esc(rw.level.id + ': ' + rw.level.title) + '"></i>'; }).join(''); }).join('<i style="width:4px"></i>')
        + '</span></span></a>';
    }).join('');
    var demo = el('btn-demo'); if (demo) demo.onclick = function () { Store.loadDemo(T.demo, T.levels.levels); say('Example numbers loaded: a made-up six-week fitness challenge. Every figure lights; replace them with yours whenever you like.'); paint(true); };
    var reset = el('btn-reset'); if (reset) reset.onclick = function () { if (confirm('Clear every answer in this browser? A saved file can bring them back.')) { Store.reset(); say('Cleared.'); paint(true); } };
    el('btn-export').onclick = function () {
      var blob = new Blob([Store.exportJson()], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'money-models-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    };
    el('in-import').onchange = function () {
      var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () { try { Store.importJson(String(rd.result)); say('Loaded ' + f.name + '.'); paint(true); } catch (e) { say(e.message); } };
      rd.readAsText(f);
    };
  }
  function missingLinks(r, cap) {
    var seen = {}, out = [];
    r.missing.forEach(function (m) { var lv = Model.level(m.level); if (!lv || seen[lv.id]) return; seen[lv.id] = true; out.push(lv); });
    var html = out.slice(0, cap).map(function (lv) { return '<a href="' + levelHref(lv) + '">' + esc(lv.id + ' ' + lv.title) + '</a>'; }).join(' ');
    return html + (out.length > cap ? ' <span>and ' + (out.length - cap) + ' more</span>' : '');
  }

  /* ---- A planet ---------------------------------------------------------------------- */
  function paintPlanet(st, fresh) {
    var P = Model.planets(st), p = P.planets.filter(function (x) { return x.id === openPlanet; })[0];
    if (!p) { location.hash = '#sky'; return; }
    el('pl-eyebrow').textContent = 'Planet ' + (P.planets.indexOf(p) + 1) + ' of 6';
    el('pl-h').textContent = p.label;
    el('pl-lede').textContent = p.blurb + ' ' + p.done + ' of ' + p.total + ' levels done.';
    if (!openLevel) { var first = null; p.bands.some(function (b) { return b.rows.some(function (r) { if (r.state !== 'done') { first = r.level.id; return true; } return false; }); }); openLevel = first || p.bands[0].rows[0].level.id; }
    var bands = Model.bandList();
    el('pl-bands').innerHTML = p.bands.map(function (b) {
      var meta = bands[b.band - 1];
      return '<div class="mm-band"><div class="mm-band-head"><b>' + esc('Band ' + b.band + ': ' + b.name) + '</b><span class="n">' + esc(b.done + ' of ' + b.rows.length) + '</span><span class="state' + (b.cleared ? ' is-clear' : '') + '">' + (b.cleared ? 'cleared' : '') + '</span></div><p class="why">' + esc(meta.meaning) + '.</p><ul class="mm-levels">'
        + b.rows.map(function (r) { return '<li><button type="button" class="mm-lv' + (r.state === 'done' ? ' is-done' : '') + (r.level.id === openLevel ? ' is-open' : '') + '" data-level="' + esc(r.level.id) + '" aria-expanded="' + (r.level.id === openLevel) + '"><span class="tag">' + esc(r.level.level) + '</span><span class="what">' + esc(r.level.title) + '</span><span class="mark' + (r.state === 'done' ? ' is-done' : '') + '">' + (r.state === 'done' ? 'done' : r.state === 'part' ? 'part' : T.levels.tags[r.level.tag]) + '</span></button></li>'; }).join('')
        + '</ul></div>';
    }).join('');
    el('pl-bands').querySelectorAll('.mm-lv').forEach(function (b) { b.onclick = function () { location.hash = '#planet/' + openPlanet + '/' + b.getAttribute('data-level'); }; });
    if (fresh || builtLevel !== openLevel) {
      buildLevel(st, Model.level(openLevel));
      /* On a phone the panel sits under the list: bring it up when a level is tapped. */
      if (fresh && window.matchMedia && window.matchMedia('(max-width: 820px)').matches && /\/[A-Z]\d+$/.test(location.hash)) setTimeout(function () { el('lv-panel').scrollIntoView({ block: 'start' }); }, 0);
    } else paintPayoff(st, Model.level(openLevel));
  }
  function buildLevel(st, lv) {
    builtLevel = lv.id;
    var all = Model.levels().filter(function (x) { return x.planet === lv.planet; }), i = all.indexOf(lv), prev = all[i - 1], next = all[i + 1];
    var html = '<div class="slaf-card"><div class="mm-lvhead"><span class="slaf-eyebrow">' + esc('Level ' + lv.level + ', band ' + lv.band + ' ' + Model.bandList()[lv.band - 1].name + ', ' + T.levels.tags[lv.tag]) + '</span><span class="mm-min">' + esc('about ' + lv.minutes + (lv.minutes === 1 ? ' minute' : ' minutes')) + '</span></div><h2>' + esc(lv.title) + '</h2>'
      + '<div class="mm-lesson">' + lv.lesson.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div><div class="mm-ex" id="lv-ex">' + exerciseHtml(st, lv) + '</div><div class="mm-payoff" id="lv-payoff"></div>'
      + '<div class="mm-lvnav">' + (prev ? '<a href="' + levelHref(prev) + '">Back: ' + esc(prev.level + ' ' + prev.title) + '</a>' : '<span></span>') + (next ? '<a href="' + levelHref(next) + '">Next: ' + esc(next.level + ' ' + next.title) + '</a>' : '<a href="#sky">Back to the Sky</a>') + '</div></div>';
    el('lv-panel').innerHTML = html;
    wireExercise(st, lv);
    paintPayoff(st, lv);
  }
  function exerciseHtml(st, lv) {
    if (lv.kind === 'quiz') return quizHtml(st, lv);
    if (lv.kind === 'checklist') return '<p class="help" style="margin:0 0 var(--space-2);font-size:var(--text-xs);color:var(--color-text-faint)">Tick each one as it becomes true.</p><ul class="mm-checks">' + lv.items.map(function (it) { var on = !!(st.checks[lv.id] || {})[it.id]; return '<li><label class="' + (on ? 'is-on' : '') + '"><input type="checkbox" data-item="' + esc(it.id) + '"' + (on ? ' checked' : '') + '/><span>' + esc(it.text) + '</span></label></li>'; }).join('') + '</ul>';
    return lv.fields.map(function (f) {
      var v = st.facts[f.key], id = 'f-' + f.key;
      if (f.kind === 'choice') return '<div class="mm-field"><span class="slaf-eyebrow">' + esc(f.label) + '</span><ul class="mm-opts">' + f.options.map(function (o) { return '<li><label><input type="radio" name="' + id + '" value="' + esc(o.id) + '" data-key="' + esc(f.key) + '"' + (v === o.id ? ' checked' : '') + '/><span>' + esc(o.label) + '</span></label></li>'; }).join('') + '</ul></div>';
      if (f.kind === 'text') return '<div class="mm-field"><label for="' + id + '">' + esc(f.label) + '</label><span class="help">' + esc(f.help || '') + '</span><textarea id="' + id + '" data-key="' + esc(f.key) + '" data-kind="text" rows="2">' + esc(v || '') + '</textarea></div>';
      var a = AFFIX[f.kind] || ['', ''];
      return '<div class="mm-field"><label for="' + id + '">' + esc(f.label) + '</label><span class="help">' + esc(f.help || '') + '</span><span class="mm-shell">' + (a[0] ? '<span class="affix">' + a[0] + '</span>' : '') + '<input id="' + id + '" type="text" inputmode="decimal" data-key="' + esc(f.key) + '" data-kind="' + esc(f.kind) + '" value="' + esc(showNumber(f.kind, v)) + '" placeholder="not yet"/>' + (a[1] ? '<span class="affix">' + a[1] + '</span>' : '') + '</span><button type="button" class="mm-clear" data-clear="' + esc(f.key) + '">I do not know this yet</button></div>';
    }).join('');
  }
  function quizHtml(st, lv) {
    var picked = st.quizzes[lv.id], q = lv.quiz, answered = picked !== undefined && picked !== null;
    return '<p style="font-size:var(--text-sm);margin:0 0 var(--space-2)"><b>' + esc(q.q) + '</b></p><ul class="mm-opts">' + q.options.map(function (o, i) {
      var cls = answered && i === picked ? (i === q.answer ? 'is-right' : 'is-wrong') : '';
      return '<li><label class="' + cls + '"><input type="radio" name="quiz-' + lv.id + '" value="' + i + '"' + (picked === i ? ' checked' : '') + '/><span>' + esc(o) + '</span></label></li>';
    }).join('') + '</ul>' + (answered ? '<p class="mm-why ' + (picked === q.answer ? 'is-right' : 'is-wrong') + '">' + (picked === q.answer ? 'Right. ' : 'Not quite. ') + esc(q.why) + '</p>' : '');
  }
  var timers = {};
  function wireExercise(st, lv) {
    var ex = el('lv-ex');
    if (lv.kind === 'quiz') {
      ex.querySelectorAll('input[type="radio"]').forEach(function (r) { r.onchange = function () { Store.setQuiz(lv.id, Number(r.value)); ex.innerHTML = quizHtml(Store.load(), lv); wireExercise(Store.load(), lv); paintAround(); }; });
      return;
    }
    if (lv.kind === 'checklist') {
      ex.querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.onchange = function () { Store.setCheck(lv.id, c.getAttribute('data-item'), c.checked); c.parentNode.classList.toggle('is-on', c.checked); paintAround(); }; });
      return;
    }
    ex.querySelectorAll('input[type="radio"]').forEach(function (r) { r.onchange = function () { Store.setFact(r.getAttribute('data-key'), r.value); paintAround(); }; });
    ex.querySelectorAll('textarea').forEach(function (t) {
      t.oninput = function () { var k = t.getAttribute('data-key'); clearTimeout(timers[k]); timers[k] = setTimeout(function () { Store.setFact(k, t.value.trim()); paintAround(); }, 350); };
    });
    ex.querySelectorAll('input[data-kind]').forEach(function (inp) {
      var k = inp.getAttribute('data-key'), kind = inp.getAttribute('data-kind');
      inp.oninput = function () { clearTimeout(timers[k]); timers[k] = setTimeout(function () { Store.setFact(k, parseNumber(kind, inp.value)); paintAround(); }, 350); };
      inp.onchange = function () { clearTimeout(timers[k]); var v = parseNumber(kind, inp.value); Store.setFact(k, v); inp.value = showNumber(kind, v); paintAround(); };
    });
    ex.querySelectorAll('.mm-clear').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-clear'); Store.setFact(k, null); var inp = ex.querySelector('input[data-key="' + k + '"]'); if (inp) inp.value = ''; paintAround(); }; });
  }
  function paintPayoff(st, lv) {
    var host = el('lv-payoff'); if (!host) return;
    var v = Model.values(st), state = Model.levelState(lv, st);
    var items = lv.payoff.metrics.map(function (id) { var r = Model.recipe(id, st, v); return '<span class="' + (r.ready ? 'lit' : '') + '">' + esc(r.label) + (r.ready && r.kind === 'number' ? ' ' + esc(fmt(r.value, r.unit)) : r.ready ? '' : ' (' + r.missing.length + ' more)') + '</span>'; });
    host.innerHTML = '<b>' + (state === 'done' ? 'Done. ' : state === 'part' ? 'Part answered. ' : '') + 'This level ' + (lv.payoff.currency === 'reveal' ? 'reveals' : lv.payoff.currency === 'power' ? 'gives you' : 'sharpens') + ':</b> ' + items.join(', ') + '. <a href="#kpis">All figures</a>.';
  }

  /* ---- Figures -------------------------------------------------------------------------- */
  function figHtml(r, st) {
    var isChart = r.kind === 'chart', cls = 'mm-fig' + (r.ready ? ' is-lit' : '') + (isChart && r.ready ? ' mm-fig--chart' : '');
    var val;
    if (!r.ready) val = '<span class="val is-text">not yet' + (r.note ? ': ' + esc(r.note) : '') + '</span>';
    else if (r.kind === 'badge') val = '<span class="val is-text">earned</span>';
    else if (r.kind === 'read') val = '<span class="val is-text">' + esc(r.value) + '</span>';
    else if (isChart) val = '<div class="mm-chartframe">' + Charts.draw(r.value, fmt) + '<details><summary>Show as a table</summary>' + Charts.table(r.value, fmt) + '</details></div>';
    else val = '<span class="val is-' + (Model.status(r.id, r.value) || 'none') + '">' + esc(fmt(r.value, r.unit)) + '</span>';
    return '<li class="' + cls + '"><span class="lbl">' + esc(r.label) + '</span>' + val + '<span class="says">' + esc(r.says) + '</span>' + (r.ready || r.note ? '' : '<span class="needs"><span>Needs</span> ' + missingLinks(r, 3) + '</span>') + '</li>';
  }
  function paintKpis(st) {
    var rec = recipesById(st), R = Model.recipes(st);
    var head = ['ratio30', 'ltgpCac', 'gp30', 'cac'].map(function (id) { var r = rec[id]; return '<div class="slaf-card"><span class="slaf-eyebrow">' + esc(r.label) + '</span><div class="mm-big is-' + (r.ready ? (Model.status(id, r.value) || 'none') : 'none') + '">' + (r.ready ? esc(fmt(r.value, r.unit)) : 'not yet') + '</div>' + (id === 'ratio30' && r.ready ? Charts.meter(r.value, [{ to: 1, label: 'under 1x: losing', status: 'out' }, { to: 2, label: '1x to 2x: break even', status: 'watch' }, { to: Math.max(4, Math.ceil(r.value)), label: '2x and up: self-funding', status: 'good' }], 'ratio', fmt) : id === 'ltgpCac' && r.ready ? Charts.meter(r.value, [{ to: 1, label: 'under 1x', status: 'out' }, { to: 3, label: '1x to 3x', status: 'watch' }, { to: Math.max(6, Math.ceil(r.value)), label: '3x and up', status: 'good' }], 'ratio', fmt) : '') + '<p>' + esc(r.says) + '</p></div>'; }).join('');
    el('k-head').innerHTML = '<div class="mm-headline">' + head + '</div>';
    var bands = Model.bandList();
    el('k-tiers').innerHTML = bands.map(function (b) {
      var list = R.filter(function (r) { return r.tier === b.band; }), lit = list.filter(function (r) { return r.ready; }).length;
      return '<div class="mm-tier"><h2>' + esc('Tier ' + b.band + ': ' + b.name) + '<span class="c' + (lit === list.length ? ' is-all' : '') + '">' + esc(lit + ' of ' + list.length + ' lit') + '</span></h2><ul class="mm-figs">' + list.map(function (r) { return figHtml(r, st); }).join('') + '</ul></div>';
    }).join('');
  }

  /* ---- Plays -------------------------------------------------------------------------- */
  function paintPlays(st) {
    var plays = Model.plays(st), planets = Model.planetList();
    el('p-list').innerHTML = planets.filter(function (p) { return plays.some(function (x) { return x.planet === p.id; }); }).map(function (p) {
      return '<div class="mm-playgroup"><h2>' + esc(p.label) + '</h2><div class="mm-plays">' + plays.filter(function (x) { return x.planet === p.id; }).map(function (x) {
        var t = (st.checks['play:' + x.id] || {});
        return '<div class="mm-play' + (x.open ? ' is-open' : '') + (x.chosen ? ' is-chosen' : '') + '"><h3>' + esc(x.label) + '<span class="st' + (x.open ? ' is-open' : '') + '">' + (x.chosen ? 'yours, ' : '') + (x.open ? 'open' : 'waiting') + '</span></h3><p>' + esc(x.what) + '</p>'
          + (x.open ? '' : '<p class="wait">Opens with ' + esc(x.waiting.join('; ')) + '.</p>')
          + '<details' + (x.chosen ? ' open' : '') + '><summary>The steps (' + x.ticked + ' of ' + x.steps.length + ')</summary><ul class="mm-checks">' + x.steps.map(function (s, i) { var on = !!t['s' + i]; return '<li><label class="' + (on ? 'is-on' : '') + '"><input type="checkbox" data-play="' + esc(x.id) + '" data-step="s' + i + '"' + (on ? ' checked' : '') + '/><span>' + esc(s) + '</span></label></li>'; }).join('') + '</ul></details></div>';
      }).join('') + '</div></div>';
    }).join('');
    el('p-list').querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.onchange = function () { Store.setCheck('play:' + c.getAttribute('data-play'), c.getAttribute('data-step'), c.checked); c.parentNode.classList.toggle('is-on', c.checked); var d = c.closest('details'); if (d) { var n = d.querySelectorAll('input:checked').length, tot = d.querySelectorAll('input').length; d.querySelector('summary').textContent = 'The steps (' + n + ' of ' + tot + ')'; } }; });
  }

  /* ---- Your model ----------------------------------------------------------------------- */
  function paintModel(st) {
    var rec = recipesById(st), v = Model.values(st), out = '';
    function step(eyebrow, priceKey, takeText, script, hueId) {
      var price = v[priceKey];
      return '<div class="mm-step" style="border-top-color:' + Charts.HUES[hueId] + '"><span class="slaf-eyebrow">' + esc(eyebrow) + '</span><div class="mm-stepval">' + (price === undefined ? 'not yet' : esc(fmt(price, 'cents'))) + '</div><span class="take">' + esc(takeText) + '</span>' + (script ? '<q>' + esc(script) + '</q>' : '') + '</div>';
    }
    out += '<div class="mm-flow">'
      + step('1. Attraction', 'attrPrice', v.attrConversion !== undefined ? fmt(v.attrConversion, 'percent') + ' of leads say yes' : 'take rate not yet', v.attrOffer, 'aqua')
      + step('2. Upsell', 'upPrice', v.upTake !== undefined ? fmt(v.upTake, 'percent') + ' of customers say yes' : 'take rate not yet', v.upScript, 'orange')
      + step('3. Downsell', 'downPrice', v.downTake !== undefined ? fmt(v.downTake, 'percent') + ' of the nos say yes' : 'take rate not yet', v.downScript, 'violet')
      + step('4. Continuity', 'contPrice', v.contJoin !== undefined ? fmt(v.contJoin, 'percent') + ' join' + (v.churn !== undefined ? ', ' + fmt(v.churn, 'percent') + ' leave each month' : '') : 'join rate not yet', v.contScript, 'yellow')
      + '</div>';
    var heads = [['ratio30', '30-day ratio'], ['paybackDays', 'Payback'], ['ltgpCac', 'LTGP to CAC'], ['maxCac', 'Most you could pay for a customer']];
    out += '<div class="mm-headline">' + heads.map(function (h) { var r = rec[h[0]]; return '<div class="slaf-card"><span class="slaf-eyebrow">' + esc(h[1]) + '</span><div class="mm-big is-' + (r.ready ? (Model.status(h[0], r.value) || 'none') : 'none') + '">' + (r.ready ? esc(fmt(r.value, r.unit)) : 'not yet') + '</div><p>' + esc(r.ready ? r.says : (r.note || 'Needs ' + r.missing.length + ' more answers.')) + '</p></div>'; }).join('') + '</div>';
    var charts = [['waterfall30', 'How the 30 days add up'], ['beforeAfter', 'Before and after'], ['planVsActual', 'Planned, measured, before'], ['paybackChart', 'Cash coming back, day by day'], ['funnel', 'From 100 leads'], ['unitEconomics', 'Where the first month\'s cash goes'], ['growthCurve', 'If you reinvest'], ['retentionCurve', 'Who is still paying'], ['health', 'Six ways to read it']];
    out += '<ul class="mm-figs">' + charts.map(function (c) { var r = rec[c[0]]; return r.ready ? figHtml(r, st) : '<li class="mm-fig"><span class="lbl">' + esc(c[1]) + '</span><span class="val is-text">not yet' + (r.note ? ': ' + esc(r.note) : '') + '</span><span class="needs"><span>Needs</span> ' + missingLinks(r, 3) + '</span></li>'; }).join('') + '</ul>';
    var lists = Model.levels().filter(function (l) { return l.kind === 'checklist'; });
    out += '<div class="slaf-card" style="margin-top:var(--space-4)"><span class="slaf-eyebrow">Every checklist</span><h2>Where the lists stand</h2><ul class="mm-launch">' + lists.map(function (l) { var t = st.checks[l.id] || {}, n = l.items.filter(function (it) { return t[it.id]; }).length, p = Model.planetList().filter(function (x) { return x.id === l.planet; })[0]; return '<li><a href="' + levelHref(l) + '">' + esc(p.label + ': ' + l.title.replace(/^Checklist: /, '')) + '</a><span class="n">' + esc(n + ' of ' + l.items.length) + '</span></li>'; }).join('') + '</ul></div>';
    el('m-body').innerHTML = out;
  }

  /* ---- Boot --------------------------------------------------------------------------- */
  Tables.load('data/').then(function (tables) {
    T = tables; Model.use(T);
    window.addEventListener('hashchange', route);
    route();
  }).catch(function (e) { say('The tables did not load (' + e.message + '). Serve this folder over http and reload.'); });
})();
