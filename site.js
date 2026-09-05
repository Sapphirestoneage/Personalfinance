/* ==========================================================================
   site.js — the one script every page of stresslessaboutmoney.com loads.
   --------------------------------------------------------------------------
   Everything here is optional: a page with none of the hooks below runs
   nothing. There is no framework, no build step and no third-party code.

   What it does, by hook:
     [data-toggle="theme"|"calm"]   the two footer toggles, persisted as
                                    slam.theme / slam.calm (the site's only
                                    storage; the inline <head> script reads
                                    them before first paint so nothing
                                    flashes)
     a[href*="{{"], form[action*="{{"]
                                    placeholder guard — a link or form whose
                                    destination Eli has not filled in yet
                                    says so instead of 404ing
     form[data-email]               the email form: posts natively once the
                                    action is real
     [data-testimonials]            renders site/testimonials.json, consent
                                    and first name required, hidden if empty
     [data-rooms]                   /tools: the registry as cards by kind
     [data-can-i]                   the home page's Can I? widget
     [data-mirror]                  the Money Mirror teaser

   The page says where the repo root is with <html data-root="../">, so the
   same file works from any depth. DECISIONS.md D-092.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var ROOT = root.getAttribute('data-root') || './';
  var STORE = { theme: 'slam.theme', calm: 'slam.calm' };

  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) {
    try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function all(sel, from) { return Array.prototype.slice.call((from || document).querySelectorAll(sel)); }
  function isPlaceholder(s) { return /\{\{[A-Z0-9_]+\}\}/.test(String(s || '')); }

  /* ---- Toggles -------------------------------------------------------------- */

  function paintToggles() {
    var explicit = root.getAttribute('data-theme');
    var dark = explicit ? explicit === 'dark'
      : !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    all('[data-toggle="theme"]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(!dark));
      b.textContent = dark ? 'Light mode' : 'Dark mode';
    });
    var calm = root.getAttribute('data-calm') === 'on';
    all('[data-toggle="calm"]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(calm));
      b.textContent = calm ? 'Calm mode: on' : 'Calm mode';
    });
  }

  all('[data-toggle="theme"]').forEach(function (b) {
    b.addEventListener('click', function () {
      var explicit = root.getAttribute('data-theme');
      var dark = explicit ? explicit === 'dark'
        : !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      write(STORE.theme, next);
      paintToggles();
    });
  });
  all('[data-toggle="calm"]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = root.getAttribute('data-calm') !== 'on';
      if (on) root.setAttribute('data-calm', 'on'); else root.removeAttribute('data-calm');
      write(STORE.calm, on ? 'on' : null);
      paintToggles();
    });
  });
  paintToggles();

  /* ---- Placeholder guard ---------------------------------------------------- */

  function noteAfter(el, text, warn) {
    var next = el.nextElementSibling;
    if (!next || !next.classList.contains('form-note')) {
      next = document.createElement('p');
      next.className = 'form-note';
      el.insertAdjacentElement('afterend', next);
    }
    next.className = 'form-note' + (warn ? ' is-warn' : '');
    next.textContent = text;
  }

  all('a[href*="{{"]').forEach(function (a) {
    a.addEventListener('click', function (evt) {
      evt.preventDefault();
      noteAfter(a.closest('.btn-row') || a, 'This link is not connected yet — see TODO-ELI.md.', true);
    });
  });

  /* ---- Email form ----------------------------------------------------------- */

  all('form[data-email]').forEach(function (form) {
    form.addEventListener('submit', function (evt) {
      if (isPlaceholder(form.getAttribute('action'))) {
        evt.preventDefault();
        noteAfter(form, 'The email list is not connected yet — see TODO-ELI.md.', true);
      }
    });
  });

  /* ---- Testimonials ---------------------------------------------------------
     Only entries with consent === true AND a first name render. Anything
     else in the file is ignored without comment. */

  all('[data-testimonials]').forEach(function (host) {
    var section = host.closest('section') || host;
    section.hidden = true;
    fetch(ROOT + 'site/testimonials.json').then(function (r) { return r.ok ? r.json() : { entries: [] }; })
      .then(function (json) {
        var ok = (json.entries || []).filter(function (t) {
          return t && t.consent === true && typeof t.firstName === 'string' && t.firstName.trim() && typeof t.quote === 'string' && t.quote.trim();
        });
        if (!ok.length) return;
        host.innerHTML = ok.map(function (t) {
          var who = esc(t.firstName.trim()) + (t.context ? ', ' + esc(t.context) : '');
          return '<li><blockquote><p>' + esc(t.quote.trim()) + '</p><footer>— ' + who + '</footer></blockquote></li>';
        }).join('');
        section.hidden = false;
      }).catch(function () { /* no file, no section */ });
  });

  /* ---- /tools: the registry as cards ----------------------------------------
     Reads SLAF.Registry, which the tools page loads from shared/registry.js.
     The grouping is the map's own: core / read / about-you / explore. */

  all('[data-rooms]').forEach(function (host) {
    var Registry = window.SLAF && window.SLAF.Registry;
    if (!Registry) return;
    var starters = (host.getAttribute('data-start-here') || '').split(/\s*,\s*/).filter(Boolean);
    var GROUPS = [
      { kind: 'core', title: 'Start with these four', blurb: 'The rooms everything else reads from. Answer once here and the others open already filled in.' },
      { kind: 'read', title: 'What it all means', blurb: 'Nothing to type. These read what you have entered and tell you what it adds up to.' },
      { kind: 'about-you', title: 'When you want to go deeper', blurb: 'Optional self-reports: what you want, not just what you have.' },
      { kind: 'explore', title: 'What if', blurb: 'Try a decision on without touching your real numbers.' }
    ];
    var rooms = Registry.inOrder().filter(function (r) { return !r.utility; });
    var byKind = {};
    rooms.forEach(function (r) { (byKind[r.kind] = byKind[r.kind] || []).push(r); });
    var html = GROUPS.map(function (g) {
      var list = byKind[g.kind] || [];
      if (!list.length) return '';
      return '<div class="card-group"><h2>' + esc(g.title) + '</h2><p>' + esc(g.blurb) + '</p><ul class="cards">'
        + list.map(function (r) {
          var href = ROOT + r.href;
          var ribbon = starters.indexOf(r.id) !== -1 ? '<span class="ribbon">Start here</span>' : '';
          return '<li class="card">' + ribbon
            + '<h3><a href="' + esc(href) + '">' + esc(r.title) + '</a></h3>'
            + '<p>' + esc(r.blurb) + '</p>'
            + '<div class="card-meta">'
            + '<button type="button" class="btn btn--small btn--ghost" data-share="' + esc(href) + '">Share this room</button></div>'
            + '</li>';
        }).join('') + '</ul></div>';
    }).join('');
    host.innerHTML = html;

    all('[data-share]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var url = new URL(b.getAttribute('data-share'), location.href).href;
        var done = function () { b.textContent = 'Link copied'; setTimeout(function () { b.textContent = 'Share this room'; }, 2000); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link', url); });
        } else { window.prompt('Copy this link', url); }
      });
    });
  });

  /* ---- The Can I? widget ------------------------------------------------------
     Three inputs, one sentence. Money is integer cents throughout
     (shared/money.js, loaded by the home page). Empty is not zero: an empty
     field gives no sentence, never a sentence built on $0. The thresholds
     are the widget's own and are logged in DECISIONS.md D-093.

     If the spine has a household in localStorage, take-home and monthly
     expenses are proposed from it — shown, and said so, not silently taken.
     The modules that read it load only then, so a first-time visitor pays
     nothing for them. LIVE-FORM: built once — the three inputs are in the
     HTML and only ever have their .value written. */

  all('[data-can-i]').forEach(function (widget) {
    var Money = window.SLAF && window.SLAF.Money;
    if (!Money) return;
    var inTake = widget.querySelector('[data-field="takehome"]');
    var inBills = widget.querySelector('[data-field="bills"]');
    var inThing = widget.querySelector('[data-field="thing"]');
    var out = widget.querySelector('[data-verdict]');
    var basisBtns = all('[data-basis]', widget);
    var prefillNote = widget.querySelector('[data-prefill-note]');
    var basis = 'month';

    function fmt(c) { return Money.formatCents(c); }

    function paint() {
      var take = Money.parseMoney(inTake.value);
      var bills = Money.parseMoney(inBills.value);
      var thing = Money.parseMoney(inThing.value);
      out.className = 'verdict';
      if (!Money.isEntered(take) || !Money.isEntered(bills) || !Money.isEntered(thing)) {
        out.classList.add('is-empty');
        out.textContent = 'Fill in all three and the answer appears here.';
        return;
      }
      var left = take - bills;
      if (left <= 0) {
        out.textContent = 'Right now the fixed bills use up the whole month' + (left < 0 ? ' and ' + fmt(-left) + ' more' : '') + '. That is the thing to look at first, and the Cash Flow room is built for exactly that.';
        return;
      }
      if (thing === 0) { out.classList.add('is-okay'); out.textContent = 'A cost of $0 is fine. You have ' + fmt(left) + ' a month after fixed bills.'; return; }
      if (basis === 'month') {
        var share = thing / left;
        var pct = Math.round(share * 100);
        if (share <= 0.25) {
          out.classList.add('is-okay');
          out.textContent = 'Yes. After fixed bills you have ' + fmt(left) + ' a month, and ' + fmt(thing) + ' is about ' + pct + '% of it.';
        } else if (share <= 0.6) {
          out.textContent = 'Probably, but it is a real commitment: ' + fmt(thing) + ' is about ' + pct + '% of the ' + fmt(left) + ' you have after fixed bills.';
        } else if (share <= 1) {
          out.textContent = 'It fits on paper, and it takes most of what is left: ' + fmt(thing) + ' of ' + fmt(left) + ' after fixed bills. Worth a slower look before saying yes.';
        } else {
          out.textContent = 'Not on this month’s numbers. ' + fmt(thing) + ' is more than the ' + fmt(left) + ' left after fixed bills. That is a fact about the month, not about you.';
        }
      } else {
        var months = thing / left;
        var shown = months < 1 ? 'less than a month' : (Math.round(months * 10) / 10) + ' month' + (months >= 1.95 ? 's' : '');
        if (months <= 1) {
          out.classList.add('is-okay');
          out.textContent = 'Yes. ' + fmt(thing) + ' is ' + shown + ' of what is left after fixed bills (' + fmt(left) + ' a month).';
        } else if (months <= 4) {
          out.textContent = 'Yes, with a plan: ' + fmt(thing) + ' is about ' + shown + ' of what is left after fixed bills, set aside at ' + fmt(left) + ' a month.';
        } else {
          out.textContent = 'It is a saving-up job rather than a yes or no: about ' + shown + ' of everything left after fixed bills, at ' + fmt(left) + ' a month. The Goals room turns that into a date.';
        }
      }
    }

    [inTake, inBills, inThing].forEach(function (i) { i.addEventListener('input', paint); });
    basisBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        basis = b.getAttribute('data-basis');
        basisBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        paint();
      });
    });
    paint();

    /* Prefill from the spine, only if there is one. */
    var stored = read('slaf.household.v2');
    if (!stored) return;
    var files = ['shared/schema.js', 'shared/reference.js', 'engines/projection.js', 'engines/tier0.js', 'shared/spine-v2.js'];
    (function next(i) {
      if (i >= files.length) return prefill();
      var s = document.createElement('script');
      s.src = ROOT + files[i];
      s.onload = function () { next(i + 1); };
      s.onerror = function () { /* leave the widget blank */ };
      document.head.appendChild(s);
    })(0);

    function prefill() {
      var S = window.SLAF;
      if (!S || !S.Spine || !S.Schema || !S.Tier0 || !S.Reference) return;
      var h = S.Spine.getProfile();
      var filled = [];
      var expenses = S.Schema.monthlyExpensesCents(h);
      if (Money.isOk(expenses) && !inBills.value) {
        inBills.value = String(Math.round(expenses.value / 100));
        filled.push('monthly spending');
      }
      S.Reference.load(['effectiveTaxRates'], ROOT + 'data/').then(function (tables) {
        var take = S.Tier0.takeHomeMonthlyCents(h, tables);
        if (Money.isOk(take) && !inTake.value) {
          inTake.value = String(Math.round(take.value / 100));
          filled.unshift('take-home');
        }
      }).catch(function () {}).then(function () {
        if (!filled.length) return;
        if (prefillNote) {
          prefillNote.textContent = 'Filled in from the numbers already in your Money Rooms (' + filled.join(' and ') + '). Change them here freely; nothing is written back.';
          prefillNote.hidden = false;
        }
        paint();
      });
    }
  });

  /* ---- The Money Mirror teaser ----------------------------------------------
     Three questions with points on each option, scored on the page. The
     questions come from the only personality quiz in this repo — Dungeons &
     Dividends, dnd/data/dnd_scoring.json — see the home page's comment. */

  all('[data-mirror]').forEach(function (form) {
    var out = form.querySelector('[data-mirror-result]');
    var lines = JSON.parse(form.getAttribute('data-mirror-lines') || '{}');
    function paint() {
      var groups = all('fieldset', form);
      var answered = 0, total = 0;
      groups.forEach(function (g) {
        var picked = g.querySelector('input:checked');
        if (picked) { answered++; total += Number(picked.value) || 0; }
      });
      if (answered < groups.length) {
        out.className = 'verdict is-empty';
        out.textContent = answered ? (groups.length - answered) + ' to go.' : 'Three questions. One line back.';
        return;
      }
      var max = groups.length * 6;
      var band = total >= max * 0.67 ? 'high' : total >= max * 0.34 ? 'mid' : 'low';
      out.className = 'verdict';
      out.textContent = lines[band] || '';
    }
    form.addEventListener('change', paint);
    paint();
  });
})();
