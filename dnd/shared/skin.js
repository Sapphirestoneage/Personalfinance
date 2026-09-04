/* ==========================================================================
   shared/skin.js — which of the two looks this browser is showing.
   --------------------------------------------------------------------------
   Deliberately NOT stored in the character. A skin is a preference about this
   browser, not a fact about the person's money, so it lives under its own key
   and never appears in the export — otherwise sending someone your character
   would also send them your opinion about backgrounds.

   Applied to <body> as data-skin, which shared/skin.css keys off. Set before
   first paint where possible so the page does not flash navy on its way to
   parchment.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.Skin = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var KEY = 'dnd.skin.v1';
  var SKINS = [
    { id: 'navy', label: 'Screen' },
    { id: 'parchment', label: 'Paper' }
  ];
  var DEFAULT = 'navy';

  function isValid(id) {
    return SKINS.some(function (s) { return s.id === id; });
  }

  function get() {
    var v = null;
    try { v = self.localStorage.getItem(KEY); } catch (e) { v = null; }
    return isValid(v) ? v : DEFAULT;
  }

  function apply(id) {
    var skin = isValid(id) ? id : DEFAULT;
    if (self.document && self.document.body) {
      self.document.body.setAttribute('data-skin', skin);
    }
    return skin;
  }

  function set(id) {
    var skin = isValid(id) ? id : DEFAULT;
    try { self.localStorage.setItem(KEY, skin); } catch (e) { /* private mode */ }
    apply(skin);
    return skin;
  }

  /**
   * Render the two-way control into a container and wire it.
   * Built once; selecting only flips aria-pressed, so this never replaces a
   * node someone might be mid-tap on.
   */
  function mount(container) {
    if (!container) return;
    container.innerHTML = '<div class="skin-toggle" role="group" aria-label="Sheet appearance">'
      + SKINS.map(function (s) {
          return '<button type="button" data-skin-choice="' + s.id + '" aria-pressed="false">'
            + s.label + '</button>';
        }).join('')
      + '</div>';
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-skin-choice]');
      if (!btn) return;
      set(btn.getAttribute('data-skin-choice'));
      sync(container);
    });
    sync(container);
  }

  function sync(container) {
    var current = get();
    var btns = container.querySelectorAll('[data-skin-choice]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed',
        String(btns[i].getAttribute('data-skin-choice') === current));
    }
  }

  /** Call as early as the body exists, to avoid a flash of the wrong skin. */
  function init() { return apply(get()); }

  return { KEY: KEY, SKINS: SKINS, DEFAULT: DEFAULT, get: get, set: set, apply: apply, init: init, mount: mount };
});
