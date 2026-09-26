/* ==========================================================================
   leads/sky.js, the Sky and the planet view (LD-005, LD-006).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.SLAF, UI = S.UI, el = UI.el, esc = UI.esc, Store = S.Store, Ladder = S.Ladder, Machine = S.Machine, Money = S.Money, Charts = S.Charts;
  var BOOK = null, current = null;      /* current: the open planet id, or null for the sky */
  var HUE = function (name) { return Charts.HUES[name] || Charts.HUES.blue; };
  var GOLD = '#E4B95A';                 /* the same gold leads.css names --lz-gold; a script may not lean on a stylesheet token */

  /* ---- Paint everything that is not a form ---------------------------------- */
  function state() { return Store.load(); }
  function paintHead() {
    var st = state();
    el('head').innerHTML = UI.header({ screen: current ? 'A planet' : 'The Sky', title: current ? Ladder.planetById(current).name : 'Nine bodies, five rings', demo: st.demo,
      sub: current ? '' : 'The book, ' + esc(BOOK.book.title) + ', laid out as a sky. Level a planet by doing its exercises; a ring turns gold when every planet has finished that band.' });
  }
  function paintStrip() {
    var st = state(), o = Ladder.overall(st), f = Machine.funnel(st.kpis), days = Machine.actionsByDay(st.log, 30);
    var goal = Ladder.entered(st.start.goal) ? st.start.goal : null;
    var perWeek = Money.isOk(f) ? f.engaged * 12 / 52 : null;
    el('strip').innerHTML = [
      tile('Levels', o.done + ' <span class="lz-faint">of ' + o.of + '</span>', o.done === 0 ? 'none yet' : Math.round(100 * o.done / o.of) + '% of the book'),
      tile('Rings cleared', o.rings + ' <span class="lz-faint">of ' + Ladder.bands().length + '</span>', o.rings === 0 ? 'the first is Learn' : Ladder.bands()[o.rings - 1].name + ' is done everywhere'),
      tile('The sun', Math.round(o.lit * 100) + '%', 'the magnet, ' + (o.lit >= 1 ? 'built' : 'not built yet')),
      tile('Hundred days', days.hundredDays + ' <span class="lz-faint">of 30</span>', days.streak ? days.streak + ' in a row' : 'log a day on the Machine'),
      tile('Engaged leads a week', perWeek === null ? '<span class="lz-faint">not yet</span>' : UI.count(perWeek, 1), goal === null ? 'set a goal in Start Here' : 'goal ' + UI.count(goal) + (perWeek !== null && perWeek >= goal ? ', hit' : ''))
    ].join('');
  }
  function tile(label, big, note) { return '<div class="lz-tile"><span class="lz-eyebrow">' + esc(label) + '</span><div class="lz-mid">' + big + '</div><div class="lz-faint">' + esc(note) + '</div></div>'; }

  /* ---- The sky itself ------------------------------------------------------ */
  function skySvg(grid, o, breathe, compact) {
    var W = compact ? 420 : 640, C = W / 2, base = compact ? 44 : 70, step = compact ? 32 : 46, sunR = compact ? 24 : 40, pr = compact ? 11 : 14;
    var nB = Ladder.bands().length, ringR = function (n) { return base + n * step; };
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + W + '" role="img" aria-label="The sky">'];
    /* the field where a draft already works: rings 1 to 3 */
    out.push('<circle class="zone" cx="' + C + '" cy="' + C + '" r="' + (ringR(3) + step / 2) + '"/>');
    out.push('<circle cx="' + C + '" cy="' + C + '" r="' + (ringR(0) + step / 2) + '" fill="var(--ink-950)"/>');
    var la = -112.5 * Math.PI / 180;
    Ladder.bands().forEach(function (b) {
      var clear = o.rings >= b.n, r = ringR(b.n);
      out.push('<circle class="ring' + (clear ? ' is-clear' : '') + '" cx="' + C + '" cy="' + C + '" r="' + r + '"/>');
      var lx = C + (r - 2) * Math.cos(la), ly = C + (r - 2) * Math.sin(la);
      out.push('<text class="ring-label' + (clear ? ' is-clear' : '') + '" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="end" dominant-baseline="middle">' + esc(b.name) + (clear ? ' ✓' : '') + '</text>');
    });
    var zx = C + (ringR(3) + step / 2 - 4) * Math.cos(-67.5 * Math.PI / 180), zy = C + (ringR(3) + step / 2 - 4) * Math.sin(-67.5 * Math.PI / 180);
    out.push('<text class="zone-label" x="' + zx.toFixed(1) + '" y="' + zy.toFixed(1) + '" text-anchor="start" dominant-baseline="middle">already useful</text>');
    var planets = grid.filter(function (p) { return !p.sun; }), sun = grid.filter(function (p) { return p.sun; })[0];
    planets.forEach(function (p, i) {
      var a = (-90 + i * 45) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      out.push('<line class="spoke" x1="' + (C + sunR * cos).toFixed(1) + '" y1="' + (C + sunR * sin).toFixed(1) + '" x2="' + (C + ringR(nB) * cos).toFixed(1) + '" y2="' + (C + ringR(nB) * sin).toFixed(1) + '"/>');
    });
    planets.forEach(function (p, i) {
      var a = (-90 + i * 45) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      p.bands.forEach(function (b) { if (b.clear && b.n < p.band) out.push('<circle class="trail" cx="' + (C + ringR(b.n) * cos).toFixed(1) + '" cy="' + (C + ringR(b.n) * sin).toFixed(1) + '" r="3"/>'); });
      var r = ringR(p.band), x = C + r * cos, y = C + r * sin, hue = HUE(p.hue);
      var cls = 'planet' + (!p.applies ? ' is-dim' : !p.started ? ' is-notyet' : '');
      var band = p.bands[p.band - 1], share = band && band.of ? band.done / band.of : 0;
      out.push('<g class="' + cls + '" tabindex="0" role="button" data-planet="' + p.id + '" aria-label="' + esc(p.name + ', ' + (p.applies ? band.name + ', ' + band.done + ' of ' + band.of : 'not yet: ' + p.why)) + '">');
      if (breathe === p.id) out.push('<circle class="halo" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (pr + 8) + '"/>');
      out.push('<circle class="body" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + pr + '" fill="' + hue + '"/>');
      out.push('<circle class="arc-track" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (pr + 5) + '"/>');
      if (share > 0) {
        var R = pr + 5, a0 = -Math.PI / 2, a1 = a0 + share * 2 * Math.PI;
        if (share >= 1) out.push('<circle class="arc" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + R + '" stroke="' + (p.finished ? GOLD : hue) + '"/>');
        else out.push('<path class="arc" d="M' + (x + R * Math.cos(a0)).toFixed(1) + ',' + (y + R * Math.sin(a0)).toFixed(1) + ' A' + R + ',' + R + ' 0 ' + (share > 0.5 ? 1 : 0) + ' 1 ' + (x + R * Math.cos(a1)).toFixed(1) + ',' + (y + R * Math.sin(a1)).toFixed(1) + '" stroke="' + hue + '"/>');
      }
      var lx = x + (pr + 12) * cos, ly = y + (pr + 12) * sin, anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
      var dy = sin < -0.3 ? -6 : sin > 0.3 ? 14 : 4;
      out.push('<text class="label" x="' + lx.toFixed(1) + '" y="' + (ly + dy).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(p.short) + '</text>');
      out.push('<text class="sublabel" x="' + lx.toFixed(1) + '" y="' + (ly + dy + 13).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(p.applies ? (p.finished ? 'done' : p.started ? band.name + ' ' + band.done + '/' + band.of : 'not yet') : 'not yet') + '</text>');
      out.push('</g>');
    });
    /* the sun: lit as far as the magnet is built */
    var lit = sun && sun.of ? sun.done / sun.of : 0;
    out.push('<g class="sun" tabindex="0" role="button" data-planet="magnet" aria-label="' + esc('The Lead Magnet, ' + Math.round(lit * 100) + '% built') + '">');
    out.push('<circle class="glow" cx="' + C + '" cy="' + C + '" r="' + (sunR + 10) + '" opacity="' + (0.06 + lit * 0.25).toFixed(2) + '"/>');
    for (var k = 0; k < 12; k++) { if (k / 12 < lit) { var ra = k * Math.PI / 6; out.push('<line class="ray" x1="' + (C + (sunR + 4) * Math.cos(ra)).toFixed(1) + '" y1="' + (C + (sunR + 4) * Math.sin(ra)).toFixed(1) + '" x2="' + (C + (sunR + 12) * Math.cos(ra)).toFixed(1) + '" y2="' + (C + (sunR + 12) * Math.sin(ra)).toFixed(1) + '"/>'); } }
    out.push('<circle class="core" cx="' + C + '" cy="' + C + '" r="' + sunR + '" opacity="' + (0.35 + lit * 0.65).toFixed(2) + '"/>');
    out.push('<text class="label" x="' + C + '" y="' + (C - 2) + '">Magnet</text><text class="label" x="' + C + '" y="' + (C + 12) + '" style="font-weight:500">' + Math.round(lit * 100) + '%</text>');
    out.push('</g></svg>');
    return out.join('');
  }
  function paintSky() {
    var st = state(), grid = Ladder.grid(st), o = Ladder.overall(st), nx = Ladder.next(st);
    var host = el('sky'), compact = host.clientWidth > 0 && host.clientWidth < 520;
    host.classList.toggle('is-compact', compact);
    host.innerHTML = skySvg(grid, o, nx.items[0] ? nx.items[0].planet.id : null, compact);
    var holding = grid.filter(function (p) { return p.applies && !(p.bands[o.rings] && p.bands[o.rings].clear); });
    var nextBand = Ladder.bands()[o.rings];
    el('sky-say').innerHTML = o.done === 0 ? 'Nothing answered yet. <b>Start here</b> above, then the sun.'
      : 'Ring <b>' + o.rings + ' of ' + Ladder.bands().length + '</b> cleared.' + (nextBand && holding.length ? ' ' + (holding.length === 1 ? '<b>' + esc(holding[0].name) + '</b> is' : holding.length + ' planets are') + ' holding up ' + esc(nextBand.name) + '.' : '');
    el('sky-list').innerHTML = '<table><thead><tr><th scope="col">Body</th><th scope="col">Band</th><th scope="col">Done</th><th scope="col">State</th><th scope="col">Next level</th></tr></thead><tbody>'
      + grid.map(function (p) {
        var nxt = p.levels.filter(function (l) { return Ladder.levelState(l, st).state !== 'done'; })[0];
        return '<tr><th scope="row"><button type="button" data-planet="' + p.id + '">' + esc(p.name) + '</button></th><td>' + esc(Ladder.bands()[p.band - 1].name) + '</td><td>' + p.done + ' of ' + p.of + '</td><td>' + esc(!p.applies ? 'not yet' : p.finished ? 'done' : p.started ? 'working' : 'not started') + '</td><td>' + (nxt ? esc(nxt.title) : 'none') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function paintNext() {
    var st = state(), nx = Ladder.next(st);
    el('next').innerHTML = nx.items.length ? nx.items.map(function (it, i) {
      return '<li' + (i === 0 ? ' class="is-first"' : '') + '><span class="n">' + (i + 1) + '</span><button type="button" data-planet="' + it.planet.id + '" data-level="' + it.level.id + '"><b>' + esc(it.level.title) + '</b><span class="meta"><span class="lz-dot" style="background:' + HUE(it.planet.hue) + ';width:8px;height:8px;vertical-align:middle"></span> ' + esc(it.planet.name) + ', ' + esc(Ladder.bands()[it.level.band - 1].name) + ', about ' + it.level.minutes + ' min</span></button></li>';
    }).join('') : '<li><span class="n">✓</span><div><b>Every level that applies is done.</b><span class="meta">Change an answer in Start Here to light more planets.</span></div></li>';
    el('next-why').textContent = nx.why;
    var later = Ladder.later(st);
    el('later-card').hidden = !later.length;
    el('later').innerHTML = later.map(function (lv) { return '<li><button type="button" data-planet="' + lv.planet + '" data-level="' + lv.id + '">' + esc(lv.title) + '</button> <span class="lz-faint">' + esc(Ladder.planetById(lv.planet).short) + '</span></li>'; }).join('');
  }
  function paintBookOnce() {
    el('book-title').textContent = BOOK.book.title + ', by ' + BOOK.book.author + ' (' + BOOK.book.year + ')';
    var map = [['Chapters 1 and 3', 'Start here: the core four, and which one first'], ['Chapter 12', 'Start here: the rule of 100, and the one-year promise']];
    BOOK.order.forEach(function (id) { var p = Ladder.planetById(id); map.push([p.chapter.split(',')[0], '<button type="button" class="slaf-linkbtn" data-planet="' + p.id + '">' + esc(p.name) + '</button>' + (p.sun ? ' (the sun)' : p.getter ? ' (a lead getter)' : ' (core four)')]); });
    el('book-map').innerHTML = map.map(function (m) { return '<li><span>' + esc(m[0]) + '</span><span>' + m[1] + '</span></li>'; }).join('');
    el('words').innerHTML = BOOK.words.map(function (w) { return '<div><dt>' + esc(w[0]) + '</dt><dd>' + esc(w[1]) + '</dd></div>'; }).join('');
    el('book-source').textContent = BOOK.source + ' ' + BOOK.confidenceNote;
    el('matrix').innerHTML = matrixSvg();
  }
  function matrixSvg() {
    var cell = function (x, y, id, name, who, how) { var p = Ladder.planetById(id); return '<g class="planet" tabindex="0" role="button" data-planet="' + id + '" aria-label="' + esc(name) + '"><rect x="' + x + '" y="' + y + '" width="150" height="90" rx="8" fill="' + HUE(p.hue) + '" fill-opacity="0.16" stroke="' + HUE(p.hue) + '"/><text x="' + (x + 12) + '" y="' + (y + 30) + '" font-size="14" font-weight="600" fill="var(--color-text)">' + esc(name) + '</text><text x="' + (x + 12) + '" y="' + (y + 52) + '" font-size="11" fill="var(--color-text-muted)">' + esc(who) + '</text><text x="' + (x + 12) + '" y="' + (y + 68) + '" font-size="11" fill="var(--color-text-muted)">' + esc(how) + '</text></g>'; };
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 260" role="img" aria-label="The core four: who and how">'
      + '<text x="115" y="14" font-size="11" text-anchor="middle" fill="var(--color-text-faint)" letter-spacing="1">ONE TO ONE</text><text x="285" y="14" font-size="11" text-anchor="middle" fill="var(--color-text-faint)" letter-spacing="1">ONE TO MANY</text>'
      + '<text transform="translate(12 75) rotate(-90)" font-size="11" text-anchor="middle" fill="var(--color-text-faint)" letter-spacing="1">KNOW YOU</text>'
      + '<text transform="translate(12 195) rotate(-90)" font-size="11" text-anchor="middle" fill="var(--color-text-faint)" letter-spacing="1">STRANGERS</text>'
      + cell(40, 30, 'warm', 'Warm outreach', 'People who know you', 'One to one')
      + cell(210, 30, 'content', 'Free content', 'People who know you', 'One to many')
      + cell(40, 150, 'cold', 'Cold outreach', 'Strangers', 'One to one')
      + cell(210, 150, 'paid', 'Paid ads', 'Strangers', 'One to many')
      + '</svg>';
  }

  /* ---- Start Here: built once ------------------------------------------------- */
  function buildStart() {
    var st = state(), s = BOOK.start;
    el('start-intro').textContent = s.intro;
    el('start-rule').textContent = s.rule;
    el('start-fields').innerHTML = s.fields.map(function (f) { return fieldHtml(f, st.start[f.key], 'start', f.key, f.type === 'text'); }).join('');
    el('start-fields').addEventListener('input', onStartChange);
    el('start-fields').addEventListener('change', onStartChange);
    paintStartSum();
  }
  function onStartChange(e) {
    var n = e.target, key = n.getAttribute('data-key'); if (!key) return;
    Store.setStart(key, readValue(n, n.getAttribute('data-unit')));
    paintStartSum(); paintStrip(); paintSky(); paintNext();
  }
  function paintStartSum() {
    var st = state(), n = BOOK.start.fields.filter(function (f) { return Ladder.entered(st.start[f.key]); }).length;
    el('start-sum').textContent = n === BOOK.start.fields.length ? 'answered' : n + ' of ' + BOOK.start.fields.length + ' answered';
    el('start').open = n < BOOK.start.fields.length && !current;
  }

  /* ---- Fields: the one way a box is drawn -------------------------------------- */
  function fieldHtml(f, v, scope, key, wide) {
    var attrs = ' data-key="' + esc(key) + '" data-scope="' + esc(scope) + '"' + (f.unit ? ' data-unit="' + f.unit + '"' : '');
    var eg = f.example !== undefined ? '<span class="lz-eg">for example: ' + esc(f.unit === 'dollars' ? '$' + f.example : f.example) + '</span>' : '';
    var hint = f.hint ? '<span class="lz-eg">' + esc(f.hint) + '</span>' : '';
    var inner;
    if (f.type === 'choice') inner = '<select' + attrs + '><option value="">Choose</option>' + f.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (v === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'multi') inner = '<div class="lz-multi">' + f.options.map(function (o) { var on = Array.isArray(v) && v.indexOf(o[0]) !== -1; return '<label class="' + (on ? 'is-on' : '') + '"><input type="checkbox" value="' + esc(o[0]) + '"' + attrs + (on ? ' checked' : '') + '/>' + esc(o[1]) + '</label>'; }).join('') + '</div>';
    else if (f.type === 'long') inner = '<textarea' + attrs + ' rows="3">' + esc(v || '') + '</textarea>';
    else if (f.type === 'number') {
      var shown = v === undefined || v === null ? '' : (f.unit === 'dollars' ? String(Math.round(v) / 100) : f.unit === 'rate' ? String(Math.round(v * 1000) / 10) : String(v));
      var pre = f.unit === 'dollars' ? '<span>$</span>' : '', post = f.unit === 'rate' ? '<span class="after">%</span>' : f.unit === 'minutes' ? '<span class="after">min</span>' : '';
      inner = '<div class="lz-affix">' + pre + '<input type="number" inputmode="decimal" step="any" min="0"' + attrs + ' value="' + esc(shown) + '"/>' + post + '</div>';
    } else inner = '<input type="text"' + attrs + ' value="' + esc(v || '') + '" maxlength="300"/>';
    return '<label class="lz-field' + (wide || f.type === 'long' || f.type === 'multi' ? ' lz-field--wide' : '') + '"><span>' + esc(f.label) + '</span>' + inner + eg + hint + '</label>';
  }
  function readValue(n, unit) {
    if (n.type === 'checkbox') {
      var boxes = n.closest('.lz-multi').querySelectorAll('input:checked');
      n.closest('.lz-multi').querySelectorAll('label').forEach(function (l) { l.classList.toggle('is-on', l.querySelector('input').checked); });
      return Array.prototype.map.call(boxes, function (b) { return b.value; });
    }
    if (n.type === 'number') { var x = n.value === '' ? null : parseFloat(n.value); if (x === null || !isFinite(x)) return null; return unit === 'dollars' ? Math.round(x * 100) : unit === 'rate' ? x / 100 : x; }
    return n.value;
  }

  /* ---- The planet view ------------------------------------------------------- */
  function openPlanet(id, levelId) {
    current = id;
    el('sky-screen').hidden = true; el('planet-screen').hidden = false;
    paintHead();
    buildLadder(id, levelId);
    var url = new URL(location.href); url.searchParams.set('planet', id); url.hash = levelId ? 'lv-' + levelId : ''; history.replaceState(null, '', url);
    var target = levelId && el('lv-' + levelId); if (target) { target.open = true; target.scrollIntoView({ block: 'start' }); } else window.scrollTo(0, 0);
  }
  function closePlanet() {
    current = null;
    el('planet-screen').hidden = true; el('sky-screen').hidden = false;
    var url = new URL(location.href); url.searchParams.delete('planet'); url.hash = ''; history.replaceState(null, '', url);
    paintHead(); paintStartSum(); paintStrip(); paintSky(); paintNext();
    window.scrollTo(0, 0);
  }
  function buildLadder(id, levelId) {
    var st = state(), p = Ladder.planet(id, st), pl = Ladder.planetById(id);
    el('planet-dot').style.background = HUE(pl.hue);
    el('planet-name').textContent = pl.name;
    el('planet-chip').textContent = pl.sun ? 'the sun' : pl.getter ? 'a lead getter' : 'core four: ' + pl.who.toLowerCase() + ', ' + pl.how.toLowerCase();
    el('planet-blurb').textContent = pl.blurb;
    el('planet-chapter').textContent = pl.chapter + '. ' + (pl.sun ? 'Everything orbits it. Its brightness in the sky is how much of it is built.' : 'Its five bands are the chapter turned into work: read it, write your version, run it with a checklist, measure it, then scale it.');
    UI.say('planet-dim', p.applies ? '' : pl.dimMessage, p.applies ? null : null);
    var firstOpen = levelId || (p.levels.filter(function (l) { return Ladder.levelState(l, st).state !== 'done'; })[0] || p.levels[0]).id;
    el('ladder').innerHTML = Ladder.bands().map(function (b) {
      var mine = p.levels.filter(function (l) { return l.band === b.n; });
      return '<section class="lz-band" id="band-' + b.n + '"><div class="lz-band-head"><b>' + b.n + '. ' + esc(b.name) + '</b><span class="means">' + esc(b.means) + '</span><span class="state" data-band-state="' + b.n + '"></span></div>'
        + mine.map(function (lv) { return levelHtml(lv, st, lv.id === firstOpen); }).join('') + '</section>';
    }).join('');
    p.levels.forEach(function (lv) { paintReading(lv); markLevel(lv.id); });
    paintBandStates();
    paintPlanetSide();
  }
  function levelHtml(lv, st, open) {
    var a = (st.levels[lv.id]) || { values: {}, ticks: [] }, b = Ladder.bands()[lv.band - 1];
    var body = '<p class="lz-says">' + esc(lv.says) + '</p>';
    if (lv.fields) body += '<div class="lz-fields">' + lv.fields.map(function (f) { return fieldHtml(f, a.values[f.key], lv.id, f.key); }).join('') + '</div>';
    if (lv.checklist) body += '<div class="lz-checklist">' + lv.checklist.map(function (item, i) { return '<label class="lz-check' + (a.ticks[i] ? ' is-on' : '') + '"><input type="checkbox" data-tick="' + i + '" data-level="' + lv.id + '"' + (a.ticks[i] ? ' checked' : '') + '/><span>' + esc(item) + '</span></label>'; }).join('') + '</div>';
    if (lv.needs) body += '<ul class="lz-needs">' + lv.needs.map(function (k) { var inp = Machine.INPUTS.filter(function (x) { return x.key === k; })[0]; return '<li data-need="' + k + '"><span class="mark-need"></span><a href="machine.html#k-' + k + '">' + esc(inp ? inp.label : k) + '</a></li>'; }).join('') + '</ul>';
    body += '<div class="lz-reading" data-reading="' + lv.id + '" hidden></div>';
    body += '<p class="lz-checkpoint">You have leveled this when: ' + esc(lv.checkpoint) + '</p>';
    body += '<div class="lz-btn-row">' + (lv.confirm ? '<button type="button" class="slaf-btn slaf-btn--primary" data-confirm="' + lv.id + '"' + (a.confirmed ? ' disabled' : '') + '>' + esc(a.confirmed ? 'Got it, marked' : lv.confirm) + '</button>' : '')
      + (lv.log ? '<a class="slaf-btn" href="machine.html#log">Log today\'s count</a>' : '')
      + '<button type="button" class="slaf-btn slaf-btn--quiet" data-later="' + lv.id + '" aria-pressed="' + (a.later ? 'true' : 'false') + '">' + (a.later ? 'On the come-back list' : 'Later') + '</button><span class="lz-faint" data-state="' + lv.id + '"></span></div>';
    return '<details class="lz-level" id="lv-' + lv.id + '"' + (open ? ' open' : '') + '><summary><span class="mark" aria-hidden="true"></span><div><div class="title">' + esc(lv.title) + '</div><div class="sum-meta">' + esc(b.name) + ' · about ' + lv.minutes + ' min · ' + esc(lv.chapter) + '</div></div><span class="count"></span></summary><div class="lz-level-body">' + body + '</div></details>';
  }
  function markLevel(id) {
    var st = state(), lv = Ladder.byId(id), s = Ladder.levelState(lv, st), node = el('lv-' + id); if (!node) return;
    node.classList.toggle('is-done', s.state === 'done'); node.classList.toggle('is-part', s.state === 'part'); node.classList.toggle('is-later', s.later);
    node.querySelector('.mark').textContent = s.state === 'done' ? '✓' : '';
    node.querySelector('.count').textContent = s.of ? s.filled + ' of ' + s.of : '';
    var stl = node.querySelector('[data-state="' + id + '"]'); if (stl) stl.textContent = s.state === 'done' ? 'Done.' : s.of - s.filled === 1 ? 'One thing left.' : (s.of - s.filled) + ' things left.';
    node.querySelectorAll('[data-need]').forEach(function (li) { var k = li.getAttribute('data-need'); var has = Ladder.entered(st.kpis[k]); li.querySelector('.mark-need').textContent = has ? '✓' : '·'; li.querySelector('.mark-need').style.color = has ? 'var(--color-positive)' : 'var(--color-text-faint)'; });
  }
  function paintBandStates() {
    var st = state(), p = Ladder.planet(current, st);
    p.bands.forEach(function (b) { var n = el('ladder').querySelector('[data-band-state="' + b.n + '"]'); if (n) { n.textContent = b.clear ? 'cleared' : b.done + ' of ' + b.of; n.classList.toggle('is-clear', b.clear); } });
  }
  function paintPlanetSide() {
    var st = state(), p = Ladder.planet(current, st);
    UI.chart(el('planet-rings'), 'planet-' + current, { kind: 'progress', title: 'The five bands', unit: 'count', items: p.bands.map(function (b) { return { id: b.id, label: b.name, value: b.done, total: b.of }; }) }, { width: 300 });
    el('planet-bands').innerHTML = Ladder.bands().map(function (b) { return '<li><span>' + esc(b.name) + '</span><span>' + esc(b.means) + '. Payoff: ' + esc(b.payoff.toLowerCase()) + '.</span></li>'; }).join('');
  }
  /* A level's own reading, from its own values: a share, a sum, a sentence,
     a small funnel, a cost per. Never a number the person did not type. */
  function paintReading(lv) {
    var host = el('ladder').querySelector('[data-reading="' + lv.id + '"]'); if (!host || !lv.reading) return;
    var st = state(), v = (st.levels[lv.id] && st.levels[lv.id].values) || {}, r = lv.reading, html = '';
    var num = function (k) { return Ladder.entered(v[k]) && typeof v[k] === 'number' ? v[k] : null; };
    if (r.kind === 'share') { var a = num(r.of), b = num(r.over); html = a !== null && b !== null && b > 0 ? '<div class="lz-mid">' + UI.rate(a / b) + '</div>' : '<div class="lz-faint">not yet</div>'; }
    else if (r.kind === 'sum') { var all = r.keys.every(function (k) { return num(k) !== null; }); html = all ? '<div class="lz-mid">' + UI.count(r.keys.reduce(function (s, k) { return s + v[k]; }, 0)) + ' people</div>' : '<div class="lz-faint">not yet: every count first</div>'; }
    else if (r.kind === 'sentence') { var ok = r.template.match(/\{(\w+)\}/g).every(function (m) { return Ladder.entered(v[m.slice(1, -1)]); }); html = ok ? '<p style="margin:0;font-size:var(--text-md)">' + esc(r.template.replace(/\{(\w+)\}/g, function (m, k) { return v[k]; })) + '</p>' : '<div class="lz-faint">fill every blank and it reads back here</div>'; }
    else if (r.kind === 'costPer') { var spent = r.keys.every(function (k) { return num(k) !== null; }), over = num(r.over); html = spent && over !== null && over > 0 ? '<div class="lz-mid">' + UI.money(Math.round(r.keys.reduce(function (s, k) { return s + v[k]; }, 0) / over)) + '</div>' : '<div class="lz-faint">not yet</div>'; }
    else if (r.kind === 'funnel') {
      var vals = r.keys.map(num);
      if (vals.every(function (x) { return x !== null; })) {
        host.hidden = false; host.innerHTML = '<span class="lz-eyebrow">' + esc(r.label) + '</span><div data-funnel></div>';
        UI.chart(host.querySelector('[data-funnel]'), 'lv-' + lv.id, { kind: 'compare', title: r.label, unit: 'count', oneColor: true, defaultType: 'hbar', slices: r.keys.map(function (k, i) { var f = lv.fields.filter(function (x) { return x.key === k; })[0]; return { id: k, label: f.label, value: vals[i] }; }) }, { width: 560, hideTitle: true });
        return;
      }
      html = '<div class="lz-faint">every number first, then the funnel draws here</div>';
    }
    host.hidden = false; host.innerHTML = '<span class="lz-eyebrow">' + esc(r.label) + '</span>' + html;
  }
  function afterLevelChange(id) {
    markLevel(id); paintReading(Ladder.byId(id)); paintBandStates();
    UI.redraw(el('planet-rings'), { kind: 'progress', title: 'The five bands', unit: 'count', items: Ladder.planet(current, state()).bands.map(function (b) { return { id: b.id, label: b.name, value: b.done, total: b.of }; }) });
  }
  el('ladder').addEventListener('input', onLevelInput);
  el('ladder').addEventListener('change', onLevelInput);
  function onLevelInput(e) {
    var n = e.target;
    if (n.hasAttribute('data-tick')) { Store.tick(n.getAttribute('data-level'), parseInt(n.getAttribute('data-tick'), 10), n.checked); n.closest('.lz-check').classList.toggle('is-on', n.checked); afterLevelChange(n.getAttribute('data-level')); return; }
    var key = n.getAttribute('data-key'), scope = n.getAttribute('data-scope'); if (!key || !scope) return;
    if (e.type === 'input' && (n.tagName === 'SELECT' || n.type === 'checkbox')) return;
    Store.answer(scope, key, readValue(n, n.getAttribute('data-unit')));
    afterLevelChange(scope);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-confirm],[data-later],[data-planet]') : null; if (!t) return;
    if (t.hasAttribute('data-confirm')) { var id = t.getAttribute('data-confirm'); Store.confirm(id); t.disabled = true; t.textContent = 'Got it, marked'; afterLevelChange(id); return; }
    if (t.hasAttribute('data-later')) { var id2 = t.getAttribute('data-later'), on = t.getAttribute('aria-pressed') !== 'true'; Store.later(id2, on); t.setAttribute('aria-pressed', String(on)); t.textContent = on ? 'On the come-back list' : 'Later'; afterLevelChange(id2); return; }
    e.preventDefault();
    openPlanet(t.getAttribute('data-planet'), t.getAttribute('data-level'));
  });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('g[data-planet]')) { e.preventDefault(); openPlanet(e.target.getAttribute('data-planet')); } });
  el('btn-back').addEventListener('click', closePlanet);
  el('btn-list').addEventListener('click', function () { var on = el('sky-list').hidden; el('sky-list').hidden = !on; el('sky').hidden = on; el('btn-list').setAttribute('aria-pressed', String(on)); el('btn-list').textContent = on ? 'Sky view' : 'List view'; });

  /* ---- The footer -------------------------------------------------------------- */
  el('btn-demo').addEventListener('click', function () { Store.demo(); location.href = 'index.html'; });
  el('btn-reset').addEventListener('click', function () { if (confirm('Forget every answer and every number in this browser?')) { Store.reset(); location.href = 'index.html'; } });
  el('btn-save').addEventListener('click', function () { UI.download('leads-ladder-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportJson()); UI.say('foot-say', 'Saved. Keep the file somewhere safe.', 'good'); });
  el('load-file').addEventListener('change', function () { UI.readFile(el('load-file')).then(function (t) { Store.importJson(t); location.href = 'index.html'; }).catch(function (err) { UI.say('foot-say', err.message, 'bad'); }); });

  /* ---- Go ---------------------------------------------------------------------- */
  S.Tables.load().then(function (T) {
    BOOK = T.book; Ladder.use(BOOK);
    paintHead(); buildStart(); paintBookOnce(); paintStrip(); paintSky(); paintNext();
    var want = UI.param('planet'); if (want && Ladder.planetById(want)) openPlanet(want, (location.hash || '').replace('#lv-', '') || null);
    else if (location.hash === '#book') el('book').scrollIntoView();
    window.addEventListener('resize', function () { if (!current) paintSky(); });
  }).catch(function (err) { el('main').innerHTML = '<p class="lz-say is-bad">The book did not load: ' + esc(err.message) + '. Serve this folder over http (python3 -m http.server) rather than opening the file.</p>'; });
})();
