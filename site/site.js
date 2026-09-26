/* ==========================================================================
   site/site.js, what every page of the site shares. SD-001, SD-007.
   --------------------------------------------------------------------------
   The header, the footer, the call-to-action strip and three helpers. It
   reads data/coach.json (the coach's details, the booking link, the offers)
   and the SPARKS version file; it never touches a household, never writes
   a `slaf.` key. The pages that need an engine load it themselves from
   ../shared and ../engines, the same files the rooms run.
   ========================================================================== */
(function (root) {
  'use strict';

  var PAGES = [
    { id: 'home',     title: 'Home',       href: 'index.html' },
    { id: 'coaching', title: 'Coaching',   href: 'coaching.html' },
    { id: 'tools',    title: 'Free tools', href: 'tools.html' },
    { id: 'learn',    title: 'Learn',      href: 'learn.html' },
    { id: 'about',    title: 'About Eli',  href: 'about.html' }
  ];

  var APP = '../';                       /* the SPARKS app, one folder up */
  var REPO = 'https://github.com/sapphirestoneage/Personalfinance';
  var BRAND = 'Stress Less About Money';
  var config = null, waiting = [];

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

  /* The coach's details, fetched once; callbacks run when it is here. */
  function load(cb) {
    if (config) { cb(config); return; }
    waiting.push(cb);
    if (waiting.length > 1) return;
    fetch('data/coach.json').then(function (r) { if (!r.ok) throw new Error('coach.json ' + r.status); return r.json(); })
      .then(function (c) { config = c; waiting.splice(0).forEach(function (f) { f(c); }); })
      .catch(function (e) { if (root.ErrLog) root.ErrLog.record('load', String(e && e.message), 'site'); waiting.splice(0).forEach(function (f) { f(null); }); });
  }

  /* The booking button. Always a link to the Book page, which carries the
     outside link, so the header never waits on the config. */
  function bookButton(cls) {
    return '<a class="slaf-btn slaf-btn--primary ' + (cls || '') + '" href="book.html">Book a free call</a>';
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
        '<a class="site-mark" href="index.html"><img src="../favicon.svg" alt="" width="22" height="22"/>' + esc(BRAND) + '</a>' +
        '<nav aria-label="Site"><ul class="site-nav">' + nav + '<li class="site-nav-cta">' + bookButton('slaf-btn--sm') + '</li></ul></nav>' +
      '</div>';
  }

  /* The strip at the foot of every free tool: the offer, in one line. */
  function cta(text) {
    var host = document.getElementById('site-cta');
    if (!host) return;
    host.innerHTML =
      '<div class="site-wrap"><div class="site-cta-card">' +
        '<div><span class="slaf-eyebrow">Want a person, not just a page?</span>' +
        '<p>' + esc(text || 'Thirty minutes with Eli, free. You talk, he asks, you leave with one number you did not have before.') + '</p></div>' +
        '<div class="site-doors">' + bookButton() + '<a class="slaf-btn slaf-btn--quiet" href="coaching.html">How coaching works</a></div>' +
      '</div></div>';
  }

  function foot() {
    var host = document.getElementById('site-foot');
    if (!host) return;
    host.innerHTML =
      '<div class="site-wrap">' +
        '<p><b>' + esc(BRAND) + '</b> is Eli Saperstein, money coach. Coaching is education and arithmetic with your figures in it; it is not investment, tax or legal advice. ' +
        'A decision about your own money deserves a person who knows your whole picture, and Eli will say when that person needs a licence.</p>' +
        '<p><b>Nothing you type on this site leaves your browser.</b> No account, no server, no tracking. The free tools run the same formulas Eli uses on a call.</p>' +
        '<p><a href="book.html">Book a free call</a> · <a href="coaching.html">Coaching</a> · <a href="tools.html">Free tools</a> · <a href="about.html">About Eli</a> · ' +
        '<a href="' + APP + 'index.html">The SPARKS app</a> · <a href="' + REPO + '" rel="noopener">Source on GitHub</a>' +
        '<span id="site-version"></span></p>' +
      '</div>';
    if (typeof fetch === 'function') {
      fetch(APP + 'version.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
        if (!v || !v.version) return;
        var el = document.getElementById('site-version');
        if (el) el.textContent = ' · SPARKS ' + v.version;
      }).catch(function () {});
    }
  }

  root.Site = { PAGES: PAGES, APP: APP, REPO: REPO, BRAND: BRAND, esc: esc, readDollars: readDollars, load: load, bookButton: bookButton, head: head, cta: cta, foot: foot };
})(typeof self !== 'undefined' ? self : this);
