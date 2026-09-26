/* binders/sky.js, the home map: twelve planets on six orbits. PB-001.
   READS  binders.v1 through Store; the tables through App.load.
   WRITES nothing but the example answers (behind a button) and a clear.
   SHOWS  the sky, the counts, the next three, the grid, the four systems.
   LIVE-FORM: built once; the only typed box is the import textarea, which
   sits outside anything repainted. */
(function () {
  'use strict';
  var B = window.BINDERS, App = B.App, Model = B.Model, Store = B.Store, esc = App.esc;
  var EX = null;

  function skySvg(state) {
    var g = Model.grid(state), bands = Model.bands(), size = 480, c = size / 2, base = 46, step = 27;
    var s = '<svg class="sky-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="Twelve planets on six orbits; a planet sits on the band it is working on">';
    bands.forEach(function (b) {
      var clear = Model.bandCleared(b.n, state);
      s += '<circle cx="' + c + '" cy="' + c + '" r="' + (base + b.n * step) + '" fill="none" stroke="' + (clear ? 'var(--color-accent)' : 'rgba(255,255,255,0.10)') + '" stroke-width="' + (clear ? 1.5 : 1) + '"' + (clear ? '' : ' stroke-dasharray="2 4"') + '/>';
      var la = -75 * Math.PI / 180, lr = base + b.n * step;
      s += '<text x="' + (c + lr * Math.cos(la)).toFixed(1) + '" y="' + (c + lr * Math.sin(la) + 3).toFixed(1) + '" text-anchor="middle" font-size="9" fill="' + (clear ? 'var(--color-accent-hover)' : 'var(--color-text-faint)') + '" font-family="var(--font-body)"><title>' + esc('Band ' + b.n + ', ' + b.name + ': ' + b.meaning) + '</title>' + b.n + '</text>';
    });
    s += '<circle cx="' + c + '" cy="' + c + '" r="' + (base - 14) + '" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)"/>';
    s += '<text x="' + c + '" y="' + (c + 4) + '" text-anchor="middle" font-size="10" fill="var(--color-text-muted)" font-family="var(--font-body)">the binder</text>';
    g.forEach(function (pl, i) {
      var hue = B.Charts.HUES[App.hueOf(pl.system)];
      var band = pl.band === null ? bands.length : pl.band;
      var r = base + band * step, ang = (-90 + i * 30) * Math.PI / 180;
      var x = c + r * Math.cos(ang), y = c + r * Math.sin(ang), pr = 9 + pl.pct / 100 * 8;
      var p = Model.byId(pl.id);
      s += '<a class="sky-planet" href="playbook.html?id=' + esc(pl.id) + '" aria-label="' + esc(pl.label + ': band ' + band + (pl.band === null ? ', complete' : '') + ', ' + pl.done + ' of ' + pl.of + ' levels done') + '">';
      if (pl.band === null) s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (pr + 5) + '" fill="none" stroke="' + hue + '" opacity="0.5"/>';
      s += '<circle class="body" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + pr.toFixed(1) + '" fill="' + hue + '" fill-opacity="' + (0.35 + pl.pct / 100 * 0.65).toFixed(2) + '" stroke="' + hue + '"><title>' + esc(pl.label + ': band ' + band + ', ' + Math.round(pl.pct) + '% answered') + '</title></circle>';
      s += '<text x="' + x.toFixed(1) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="600" fill="#fff" font-family="var(--font-body)" pointer-events="none">' + esc(p.letter) + '</text>';
      s += '</a>';
    });
    return s + '</svg>';
  }

  function paint() {
    var state = Store.load(), o = Model.overall(state), bands = Model.bands();
    document.getElementById('sky').innerHTML = skySvg(state);
    document.getElementById('sky-key').innerHTML = Model.systems().map(function (sy) { return '<span><i style="background:' + B.Charts.HUES[sy.hue] + '"></i>' + esc(sy.label) + '</span>'; }).join('') + '<span>Rings are the six bands, 1 inside to 6 outside. A planet sits on the band it is working on and fills as it is answered.</span>';
    document.getElementById('stats').innerHTML =
      '<div class="stat"><div class="k">Levels done</div><div class="v">' + o.done + ' of ' + o.of + '</div><div class="s">twelve playbooks, six bands each</div></div>'
      + '<div class="stat"><div class="k">Rings lit</div><div class="v">' + o.rings + ' of ' + bands.length + '</div><div class="s">a ring lights when every planet clears a band</div></div>'
      + '<div class="stat"><div class="k">Answers</div><div class="v">' + o.exercisesAnswered + '</div><div class="s">of 203 exercises</div></div>';
    var nx = Model.next(state);
    document.getElementById('next').innerHTML = nx.length ? nx.map(function (n) {
      return '<a href="playbook.html?id=' + esc(n.playbook.id) + '#band-' + n.level.band + '"><span class="e">' + esc(n.playbook.label) + ', band ' + n.level.band + '</span><b>' + esc(n.level.title) + '</b><small>' + esc(n.why) + ' About ' + n.minutes + ' min.</small></a>';
    }).join('') : '<p class="bd-note">Every level is done. The binder is yours.</p>';
    var grid = '<div class="grid-head"><span></span><div class="grid-bands">' + bands.map(function (b) { return '<span class="' + (Model.bandCleared(b.n, state) ? 'is-clear' : '') + '" title="' + esc(b.meaning) + '">' + b.n + ' ' + esc(b.name) + '</span>'; }).join('') + '</div></div>';
    var lastSys = null;
    o.planets.forEach(function (pl) {
      if (pl.system !== lastSys) { lastSys = pl.system; grid += '<div class="grid-sys">' + esc(Model.system(pl.system).label) + '</div>'; }
      grid += '<a class="grid-row" href="playbook.html?id=' + esc(pl.id) + '"><span class="grid-name"><b><i style="background:' + B.Charts.HUES[App.hueOf(pl.system)] + '"></i>' + esc(pl.label) + '</b><span>' + pl.done + ' of ' + pl.of + (pl.band ? ', on band ' + pl.band : ', complete') + '</span></span><span class="grid-cells">'
        + pl.levels.map(function (l) { return '<span class="grid-cell is-' + l.state + (Model.bandCleared(l.band, state) ? ' is-clear' : '') + '" title="' + esc('Band ' + l.band + ': ' + l.filled + ' of ' + l.of + ' answered, ' + l.ticked + ' of ' + l.ofChecks + ' ticked') + '"></span>'; }).join('') + '</span></a>';
    });
    document.getElementById('grid').innerHTML = grid;
    document.getElementById('systems').innerHTML = Model.systems().map(function (sy) {
      return '<div class="system" style="--sys:' + B.Charts.HUES[sy.hue] + '"><h3>' + esc(sy.label) + '</h3><p>' + esc(sy.question) + '</p><ul>' + o.planets.filter(function (p) { return p.system === sy.id; }).map(function (p) { return '<li><a href="playbook.html?id=' + esc(p.id) + '">' + esc(p.label) + '<span>' + p.done + '/' + p.of + '</span></a></li>'; }).join('') + '</ul></div>';
    }).join('');
    var welcome = document.getElementById('welcome');
    welcome.hidden = o.exercisesAnswered > 0 || Store.pref('welcomeDone') === true;
  }

  App.load().then(function (t) {
    EX = t.example;
    App.header(document.getElementById('head'), 'The sky', 'Twelve playbooks, six bands deep', 'A band means the same depth on every planet: read, facts, exercises, build, run, sharpen.',
      '<button type="button" class="slaf-btn slaf-btn--quiet" id="btn-example">Try with example answers</button>');
    App.footer(document.getElementById('foot'));
    document.getElementById('btn-example').addEventListener('click', function () {
      if (Object.keys(Store.load().answers).length && !confirm('Replace what is here with the example answers?')) return;
      Store.loadState(EX.state); paint(); App.say(document.getElementById('say'), 'Example answers loaded: a money coach for young professionals. Every number is made up.', true);
    });
    document.getElementById('btn-welcome-done').addEventListener('click', function () { Store.pref('welcomeDone', true); paint(); });
    document.getElementById('btn-export').addEventListener('click', function () { document.getElementById('io').value = Store.exportJson(); App.say(document.getElementById('say'), 'Copied into the box below. Save it somewhere safe.', true); });
    document.getElementById('btn-import').addEventListener('click', function () {
      try { Store.importJson(document.getElementById('io').value); paint(); App.say(document.getElementById('say'), 'Imported.', true); }
      catch (e) { App.say(document.getElementById('say'), 'That is not a Binders export.', false); }
    });
    document.getElementById('btn-clear').addEventListener('click', function () { if (confirm('Forget every answer and tick in this browser?')) { Store.clear(); paint(); App.say(document.getElementById('say'), 'Cleared.', true); } });
    paint();
  }).catch(function (e) { document.getElementById('main').insertAdjacentHTML('afterbegin', '<p class="bd-say is-bad">The tables did not load (' + esc(e.message) + '). Serve this folder over HTTP: python3 -m http.server, then open /binders/.</p>'); });
})();
