/* ==========================================================================
   shared/explain.js — the ⓘ on a ratio: what it is, why it matters, what
   moves it, and links to every number it reads.
   --------------------------------------------------------------------------
   A ratio on a screen was a name and a coloured figure. Asked what
   "solvency ratio" meant, or what to do about a red one, the page had no
   answer. This puts one behind a small button on every ratio row, on the
   dashboard and in Every Ratio alike, from data/ratio_explainers.json —
   the same table engines/ratios.js attaches to each row as `explain`.

   Each field the ratio looks at renders as a link to the room that owns
   it (shared/ownership.js), so every term on the panel goes to the thing
   it is talking about. Nothing here computes; it only says.

   Markup: button(id) beside the name, panel(row, h, roomId) below it,
   bind(container) once to make the button toggle the panel. A panel is
   hidden with the `hidden` attribute, never rebuilt, so a page that holds
   inputs is not touched by opening one.
   ========================================================================== */
(function (root, factory) {
  var api = factory(root.SLAF && root.SLAF.Ownership, root.SLAF && root.SLAF.Money);
  root.SLAF = root.SLAF || {};
  root.SLAF.Explain = api;
})(typeof self !== 'undefined' ? self : this, function (Ownership, Money) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** The ⓘ. `id` is the ratio id; the panel it opens carries the same id. */
  function button(id) {
    return '<button type="button" class="slaf-info" data-explain="' + esc(id)
      + '" aria-expanded="false" aria-label="What this is and how to improve it" title="What this is and how to improve it">i</button>';
  }

  /* One field the ratio reads, as a link to its owner with the current
     value beside it. A field id the ownership map does not know is shown
     as words rather than dropped, so a typo in the table is visible. */
  function looksAt(fieldIds, household, roomId) {
    if (!Ownership || !fieldIds || !fieldIds.length) return '';
    var chips = fieldIds.map(function (f) {
      var d = Ownership.describe(f, household || {}, roomId);
      if (!d) return '<span class="slaf-explain-chip">' + esc(f.replace(/([A-Z])/g, ' $1').toLowerCase()) + '</span>';
      return '<a class="slaf-explain-chip' + (d.isSet ? '' : ' is-empty') + '" href="' + esc(d.href) + '" title="Owned by ' + esc(d.ownerTitle) + '">'
        + '<b>' + esc(d.label) + '</b> ' + esc(d.isSet ? d.display : 'not entered') + ' <small>' + esc(d.ownerTitle) + ' →</small></a>';
    });
    return '<div class="slaf-explain-row"><span class="slaf-explain-k">Looks at</span><span class="slaf-explain-chips">' + chips.join('') + '</span></div>';
  }

  /**
   * The panel for one ratio row from Ratios.all(): its `explain`, its
   * formula, and — when the caller passes one — the band in words.
   * Hidden until the button opens it.
   */
  function panel(row, household, roomId, extra) {
    var e = (row && row.explain) || null;
    var o = extra || {};
    var parts = [];
    if (e) {
      parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k">What it is</span><span>' + esc(e.what) + '</span></div>');
      parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k">Why it matters</span><span>' + esc(e.why) + '</span></div>');
      parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k">What moves it</span><span>' + esc(e.improve) + '</span></div>');
    } else {
      parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k">What it is</span><span>' + esc(row && row.needs ? 'Computed from ' + row.needs + '.' : '') + '</span></div>');
    }
    if (row && row.formula) parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k">Formula</span><span>' + esc(row.formula) + '</span></div>');
    if (o.band) parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k">The band</span><span>' + esc(o.band) + '</span></div>');
    if (row && !row.ok && row.result && row.result.reason) parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k">Right now</span><span>' + esc(row.result.reason) + '</span></div>');
    parts.push(looksAt(e ? e.looksAt : [], household, roomId));
    if (o.more) parts.push('<div class="slaf-explain-row"><span class="slaf-explain-k"></span><span><a href="' + esc(o.more.href) + '">' + esc(o.more.label) + '</a></span></div>');
    return '<div class="slaf-explain" data-explain-panel="' + esc(row ? row.id : '') + '" hidden>' + parts.join('') + '</div>';
  }

  /** Once per container: the button toggles the panel with its id. */
  function bind(container) {
    if (!container || container.__explainBound) return;
    container.__explainBound = true;
    container.addEventListener('click', function (evt) {
      var b = evt.target.closest && evt.target.closest('[data-explain]');
      if (!b || !container.contains(b)) return;
      evt.preventDefault(); evt.stopPropagation();
      var id = b.getAttribute('data-explain');
      var p = container.querySelector('[data-explain-panel="' + id + '"]');
      if (!p) return;
      var open = p.hidden;
      p.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
      b.classList.toggle('is-open', open);
    });
  }

  return { button: button, panel: panel, bind: bind, looksAt: looksAt };
});
