/* ==========================================================================
   shared/seed.js — an explore room opens with your real numbers proposed.
   --------------------------------------------------------------------------
   The what-if rooms (runway, quick math, W2 vs 1099, side hustle, the
   credential) take their own local inputs and never write the household
   (D-052: hypotheticals stay local). But the household already knows your
   cash, your spending, your pay and your bracket, and asking for them again
   is the thing this app exists to stop.

   So a room declares SEEDS — which of its boxes can be filled from which
   household figure — and this mounts one toggle at the top of the room:

       Start from my numbers  |  Start blank

   In "my numbers" every seed whose box is still empty shows the figure as a
   SUGGESTION (shared/suggest.js, D-060): muted, dashed, "Use this" with the
   source named. Tapping it calls the room's own apply(), which writes the
   room's LOCAL state — never the spine. "Start blank" clears the proposals.
   Nothing is stored either way; the choice is remembered for the session.

   The toggle is built once. Rooms that repaint their inputs from state call
   refresh() afterwards so a proposal is put back into a box the repaint
   emptied. BRIEF §2.3, DECISIONS.md D-062.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Suggest: require('./suggest.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Suggest: root.SLAF && root.SLAF.Suggest };
  }
  var api = factory(deps.Money, deps.Suggest);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Seed = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Suggest) {
  'use strict';

  var KEY_PREFIX = 'slaf.seed.';

  function remember(roomId, mode) {
    try { sessionStorage.setItem(KEY_PREFIX + roomId, mode); } catch (e) { /* private mode */ }
  }
  function remembered(roomId) {
    try { return sessionStorage.getItem(KEY_PREFIX + roomId); } catch (e) { return null; }
  }

  /**
   * mount({ roomId, host, seeds })
   *   host   — the element the toggle is built into, once
   *   seeds  — () => [ { node, value, display, source, apply } ]
   *            called on every refresh so it can read the live household;
   *            entries with value null/undefined are skipped
   * Returns { refresh, mode, setMode }.
   */
  function mount(opts) {
    var roomId = opts.roomId;
    var host = opts.host;
    var seedsFn = opts.seeds;
    var mode = remembered(roomId) || 'mine';
    var built = false;
    var buttons = {};

    function build() {
      if (built || !host) return;
      built = true;
      host.className = (host.className ? host.className + ' ' : '') + 'slaf-seed';
      host.innerHTML = '<span class="slaf-seed-label">Open with</span>'
        + '<button type="button" class="slaf-seed-btn" data-seed-mode="mine">my numbers</button>'
        + '<button type="button" class="slaf-seed-btn" data-seed-mode="blank">a blank page</button>'
        + '<span class="slaf-seed-note" id="slaf-seed-note"></span>'
        + '<span class="slaf-seed-note" data-suggest-note></span>';
      Array.prototype.forEach.call(host.querySelectorAll('[data-seed-mode]'), function (b) {
        buttons[b.getAttribute('data-seed-mode')] = b;
        b.addEventListener('click', function () { setMode(b.getAttribute('data-seed-mode')); });
      });
    }

    function paintToggle(count) {
      if (!built) return;
      Object.keys(buttons).forEach(function (m) {
        buttons[m].setAttribute('aria-pressed', String(m === mode));
      });
      var note = host.querySelector('#slaf-seed-note');
      if (note) {
        note.textContent = count === 0
          ? 'Nothing to propose yet — answer Start Here and this room opens filled in.'
          : mode === 'mine'
            ? count + ' figure' + (count === 1 ? '' : 's') + ' proposed from what you have entered. Nothing here is written back.'
            : 'Proposals hidden. Nothing here is written back.';
      }
    }

    function refresh() {
      build();
      var seeds = (seedsFn && seedsFn()) || [];
      var live = seeds.filter(function (s) { return s && s.node && Money.isEntered(s.value); });
      live.forEach(function (s) {
        if (mode === 'mine') {
          Suggest.show(s.node, {
            value: s.value,
            display: s.display === undefined ? String(s.value) : s.display,
            source: s.source || 'what you entered',
            onUse: function (v) { if (typeof s.apply === 'function') s.apply(v); }
          });
        } else if (Suggest.isSuggested(s.node)) {
          Suggest.clear(s.node);
        }
      });
      /* A seed that no longer applies (the figure was removed) must not
         leave a stale proposal in the box. */
      seeds.forEach(function (s) {
        if (s && s.node && !Money.isEntered(s.value) && Suggest.isSuggested(s.node)) Suggest.clear(s.node);
      });
      if (host) host.hidden = false;
      paintToggle(live.length);
    }

    function setMode(m) {
      mode = m === 'blank' ? 'blank' : 'mine';
      remember(roomId, mode);
      refresh();
    }

    return { refresh: refresh, setMode: setMode, mode: function () { return mode; } };
  }

  return { mount: mount };
});
