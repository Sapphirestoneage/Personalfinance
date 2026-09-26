/* ==========================================================================
   safeword/site.js, what every marketing page shares. SF-011.
   --------------------------------------------------------------------------
   The header, the strip, the footer, the offers, the method, the guarantee,
   the questions and the booking button, all drawn from data/site.json so
   the owner changes the site by editing one file. No storage, no tracking:
   a marketing page reads nothing from the browser and writes nothing.

     Site.boot(pageId, function (site) {...})
     Site.money(cents), Site.esc(text), Site.bookHref(site, offerId)
     Site.offers(site), Site.method(site), Site.faq(site), Site.testimonials(site)
   ========================================================================== */
(function () {
  'use strict';
  var NAV = [
    { id: 'index', href: 'index.html', label: 'Home' },
    { id: 'dommes', href: 'for-dommes.html', label: 'Dommes and pros' },
    { id: 'creators', href: 'for-creators.html', label: 'Creators' },
    { id: 'houses', href: 'for-houses.html', label: 'Houses' },
    { id: 'services', href: 'services.html', label: 'Coaching' },
    { id: 'tools', href: 'tools.html', label: 'Free tools' },
    { id: 'resources', href: 'resources.html', label: 'Resources' },
    { id: 'about', href: 'about.html', label: 'About Eli' }
  ];
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(cents) { if (typeof cents !== 'number') return ''; return '$' + String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function base() { var s = document.querySelector('script[src*="site.js"]'); return s ? s.src.replace(/site\.js.*$/, '') : ''; }
  function load() { return fetch(base() + 'data/site.json').then(function (r) { if (!r.ok) throw new Error('site.json did not load'); return r.json(); }); }

  /* Where "book" goes: the owner's scheduling link when set, else an email with the offer in the subject. */
  function bookHref(site, offerId) {
    if (site.bookingUrl) return site.bookingUrl;
    var offer = (site.offers || []).filter(function (o) { return o.id === offerId; })[0];
    var subject = 'Book a call' + (offer ? ': ' + offer.name : '');
    var body = 'Hi Eli,\n\nI would like to book' + (offer ? ' ' + offer.name : ' a call') + '.\n\nName I go by: \nWhat I do: \nTimes that work: \n\n';
    return 'mailto:' + site.coach.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
  function header(site, active) {
    var out = '<header class="mk-head"><a class="mk-brand" href="index.html"><span class="mk-wordmark">' + esc(site.brand) + '</span><span class="mk-byline">' + esc(site.byline) + '</span></a>';
    out += '<nav class="mk-nav" aria-label="Site">' + NAV.map(function (n) { return '<a href="' + n.href + '"' + (n.id === active ? ' aria-current="page"' : '') + '>' + esc(n.label) + '</a>'; }).join('') + '</nav>';
    out += '<a class="slaf-btn slaf-btn--primary mk-book" href="book.html">Book a call</a></header>';
    return out;
  }
  function footer(site) {
    return '<footer class="mk-foot"><div class="mk-foot-grid"><div><span class="mk-wordmark">' + esc(site.brand) + '</span><p class="mk-note">' + esc(site.byline) + '. ' + esc(site.coach.name) + ', ' + esc(site.coach.title.toLowerCase()) + ', ' + esc(site.coach.city) + '.</p><p class="mk-note">Coaching is not tax or legal advice. The free tools keep every number in your own browser; this site sets no cookies and runs no tracking.</p></div>' +
      '<div><p class="mk-note"><b>Pages</b></p><p class="mk-note">' + NAV.map(function (n) { return '<a href="' + n.href + '">' + esc(n.label) + '</a>'; }).join(' &middot; ') + ' &middot; <a href="book.html">Book a call</a></p></div>' +
      '<div><p class="mk-note"><b>Reach Eli</b></p><p class="mk-note"><a href="mailto:' + esc(site.coach.email) + '">' + esc(site.coach.email) + '</a><br/><a href="' + esc(site.coach.linkedin) + '" rel="noopener">LinkedIn</a></p></div></div></footer>';
  }
  function offers(site, opts) {
    var o = opts || {};
    return '<div class="mk-offers">' + (site.offers || []).map(function (x) {
      return '<article class="mk-offer' + (x.featured ? ' is-featured' : '') + '" id="offer-' + esc(x.id) + '">' + (x.featured ? '<span class="mk-tag">The full system</span>' : '') +
        '<h3>' + esc(x.name) + '</h3><p class="mk-offer-for">' + esc(x.for) + '</p><p class="mk-price">' + money(x.priceCents) + ' <span>' + esc(x.priceNote) + '</span></p><p class="mk-note">' + esc(x.length) + '</p>' +
        '<ul class="mk-list">' + x.what.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
        (o.brief ? '' : '<p class="mk-note"><b>Best for.</b> ' + esc(x.bestFor) + '</p>') +
        '<a class="slaf-btn ' + (x.featured ? 'slaf-btn--primary' : '') + '" href="book.html?offer=' + esc(x.id) + '">' + esc(x.cta) + '</a></article>';
    }).join('') + '</div>';
  }
  function method(site) {
    return '<ol class="mk-method">' + (site.method || []).map(function (m) { return '<li><span class="mk-letter">' + esc(m.letter) + '</span><div><b>' + esc(m.name) + '</b><p>' + esc(m.what) + '</p></div></li>'; }).join('') + '</ol>';
  }
  function faq(site) {
    return '<div class="mk-faq">' + (site.faq || []).map(function (f) { return '<details class="sw-fold"><summary>' + esc(f.q) + '</summary><div><p>' + esc(f.a) + '</p></div></details>'; }).join('') + '</div>';
  }
  function testimonials(site) {
    var list = site.testimonials || [];
    if (!list.length) return '';
    return '<section class="mk-section" aria-label="What clients say"><h2>What clients say</h2><div class="mk-quotes">' + list.map(function (t) { return '<blockquote class="mk-quote"><p>' + esc(t.quote) + '</p><footer>' + esc(t.who) + '</footer></blockquote>'; }).join('') + '</div></section>';
  }
  function guarantee(site) {
    var g = site.guarantee; if (!g) return '';
    return '<div class="mk-guarantee"><span class="slaf-eyebrow">' + esc(g.name) + '</span><p>' + esc(g.text) + '</p></div>';
  }
  function boot(pageId, fn) {
    function go() {
      load().then(function (site) {
        var h = document.getElementById('mk-head'), f = document.getElementById('mk-foot');
        if (h) h.innerHTML = header(site, pageId);
        if (f) f.innerHTML = footer(site);
        Array.prototype.forEach.call(document.querySelectorAll('[data-book]'), function (a) { a.href = bookHref(site, a.getAttribute('data-book') || null); });
        Array.prototype.forEach.call(document.querySelectorAll('[data-fill]'), function (el) {
          var k = el.getAttribute('data-fill');
          if (k === 'offers') el.innerHTML = offers(site); else if (k === 'offers-brief') el.innerHTML = offers(site, { brief: true });
          else if (k === 'method') el.innerHTML = method(site); else if (k === 'faq') el.innerHTML = faq(site);
          else if (k === 'testimonials') el.innerHTML = testimonials(site); else if (k === 'guarantee') el.innerHTML = guarantee(site);
          else if (k === 'capacity') el.textContent = site.capacityLine; else if (k === 'email') { el.textContent = site.coach.email; el.href = 'mailto:' + site.coach.email; }
          else if (k === 'bio') el.innerHTML = site.coach.bio.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
          else if (k === 'stance') el.innerHTML = site.coach.stance.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
          else if (k === 'credentials') el.innerHTML = site.coach.credentials.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
        });
        if (fn) fn(site);
      }).catch(function (err) { var h = document.getElementById('mk-head'); if (h) h.innerHTML = '<p class="sw-error">The site did not load (' + esc(err.message) + '). Serve the folder rather than opening the file.</p>'; if (window.console) console.error(err); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  window.Site = { NAV: NAV, esc: esc, money: money, load: load, bookHref: bookHref, header: header, footer: footer, offers: offers, method: method, faq: faq, testimonials: testimonials, guarantee: guarantee, boot: boot };
})();
