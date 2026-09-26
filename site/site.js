/* ==========================================================================
   site/site.js, what every page of the community front shares. SD-001.
   --------------------------------------------------------------------------
   The header, the footer and three helpers. It reads the SPARKS version file
   for the footer and nothing else; it never touches a household, never
   writes a `slaf.` key. The pages that need an engine load it themselves
   from ../shared and ../engines, the same files the rooms run.
   ========================================================================== */
(function (root) {
  'use strict';

  var PAGES = [
    { id: 'home',     title: 'Home',        href: 'index.html' },
    { id: 'number',   title: 'Your number', href: 'number.html' },
    { id: 'learn',    title: 'Learn',       href: 'learn.html' },
    { id: 'tools',    title: 'The rooms',   href: 'tools.html' },
    { id: 'glossary', title: 'Glossary',    href: 'glossary.html' },
    { id: 'about',    title: 'About',       href: 'about.html' }
  ];

  var APP = '../';                       /* the SPARKS app, one folder up */
  var REPO = 'https://github.com/sapphirestoneage/Personalfinance';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Dollars from a box: empty is null, never zero (the rule the rooms keep). */
  function readDollars(input) {
    var v = input && input.value != null ? String(input.value).trim() : '';
    if (v === '') return null;
    var n = Number(v.replace(/[$,\s]/g, ''));
    if (!isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  function head(current) {
    var host = document.getElementById('site-head');
    if (!host) return;
    var nav = PAGES.map(function (p) {
      var cur = p.id === current ? ' aria-current="page"' : '';
      return '<li><a href="' + p.href + '"' + cur + '>' + esc(p.title) + '</a></li>';
    }).join('');
    host.innerHTML =
      '<div class="site-wrap">' +
        '<a class="site-mark" href="index.html"><img src="../favicon.svg" alt="" width="22" height="22"/>SPARKS<small>for the FIRE community</small></a>' +
        '<nav aria-label="Site"><ul class="site-nav">' + nav + '</ul></nav>' +
      '</div>';
  }

  function foot() {
    var host = document.getElementById('site-foot');
    if (!host) return;
    host.innerHTML =
      '<div class="site-wrap">' +
        '<p><b>Nothing you type here leaves your browser.</b> There is no account, no server and no tracking. ' +
        'The numbers on this site come from the same formulas the rooms run.</p>' +
        '<p>Example figures are invented for demonstration. This is education, not advice; ' +
        'a decision about your own money deserves a person who knows your whole picture.</p>' +
        '<p><a href="' + APP + 'index.html">Open the app</a> · <a href="' + APP + 'map.html">Every room</a> · ' +
        '<a href="' + APP + 'coach/index.html">Coach Mode</a> · <a href="' + REPO + '" rel="noopener">Source on GitHub</a>' +
        '<span id="site-version"></span></p>' +
      '</div>';
    if (typeof fetch === 'function') {
      fetch(APP + 'version.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
        if (!v || !v.version) return;
        var el = document.getElementById('site-version');
        if (el) el.textContent = ' · SPARKS ' + v.version + (v.build ? ', built ' + v.build : '');
      }).catch(function () {});
    }
  }

  root.Site = { PAGES: PAGES, APP: APP, REPO: REPO, esc: esc, readDollars: readDollars, head: head, foot: foot };
})(typeof self !== 'undefined' ? self : this);
