/* binders/app.js, what the two screens share: loading the tables, the
   header, the formatting. PB-001. Browser only. */
(function () {
  'use strict';
  var B = window.BINDERS = window.BINDERS || {};
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fetchJson(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
  function load() {
    return Promise.all([fetchJson('data/playbooks.json'), fetchJson('data/example.json')]).then(function (rs) {
      B.Model.use(rs[0]); B.Reads.use(rs[0]);
      return { table: rs[0], example: rs[1] };
    });
  }
  function hueOf(systemId) { var s = B.Model.system(systemId); return s ? s.hue : 'blue'; }
  function header(el, screen, title, sub, actions) {
    el.innerHTML = '<header class="bd-head"><div class="bd-brand"><a class="bd-wordmark" href="index.html">The Binders</a><span class="bd-screen">' + esc(screen) + '</span></div>'
      + '<div class="bd-head-title"><h1>' + esc(title) + '</h1>' + (sub ? '<p class="bd-head-sub">' + esc(sub) + '</p>' : '') + '</div>'
      + '<div class="bd-actions bd-head-actions">' + (actions || '') + '</div></header>';
  }
  function say(el, text, good) { if (!el) return; el.textContent = text || ''; el.className = 'bd-say' + (good === true ? ' is-good' : good === false ? ' is-bad' : ''); }
  function qs(name) { var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null; }
  function readCard(read, hue) {
    var R = B.Reads, C = B.Charts;
    var head = '<h3><span>' + esc(read.label) + '</span>' + (read.status === 'ok' && read.value !== null ? '<span class="v">' + esc(R.fmt(read.value, read.unit)) + '</span>' : '<span class="v" style="color:var(--color-text-faint)">not yet</span>') + '</h3>';
    if (read.status !== 'ok') return '<div class="read" data-read="' + esc(read.id) + '">' + head + '<p class="missing">Waiting on <b>' + esc(read.missing.join(', ')) + '</b>.</p></div>';
    var pic = read.chart ? C.render(read.chart, { hue: hue }) : null;
    return '<div class="read" data-read="' + esc(read.id) + '">' + head + (pic ? pic.svg : '') + (read.text ? '<p class="t">' + esc(read.text) + '</p>' : '') + (pic ? '<details><summary>Show as a table</summary>' + pic.table + '</details>' : '') + '</div>';
  }
  function footer(el) {
    el.innerHTML = '<footer class="bd-foot"><p>A workbook in your browser. Nothing you type leaves this device; there is no account and no server. Written as a companion to the four systems and twelve playbooks of the $100M playbook binder, in its own words: no book or playbook text is reproduced here, and this is not affiliated with Acquisition.com. Rules of thumb are rules of thumb. <a href="README.md">How it works</a>.</p></footer>';
  }
  B.App = { esc: esc, load: load, hueOf: hueOf, header: header, say: say, qs: qs, readCard: readCard, footer: footer };
})();
