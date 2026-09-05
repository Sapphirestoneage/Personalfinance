/* ==========================================================================
   shared/suggest.js — a value the app proposes, shown but not taken.
   --------------------------------------------------------------------------
   Three states for a box, never collapsed (DECISIONS.md D-060):

     empty      — nothing shown but a format-only placeholder.
     suggested  — a value the app derived or looked up, rendered muted with a
                  dashed underline and a "use this" chip that names where it
                  came from. THE HOUSEHOLD DOES NOT HAVE IT. Progress counts
                  it unanswered; no engine ever sees it.
     entered    — the person typed it or tapped "use this"; the room wrote it
                  through its own path.

   This file never touches the spine. It paints and it reports; the room
   that owns the field does every write. That is what keeps "no formula
   reads a suggested value" true by construction rather than by discipline:
   a suggested value exists only in a DOM node's display, and the moment
   the node is focused the display is cleared, so a blur handler that reads
   node.value gets '' — exactly what it would get for an empty box.

   Nothing is rebuilt. show() writes .value and classes on a node that is
   already in the page and adds one chip beside it, once, on first use.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Suggest = api; }
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  var CLS_INPUT = 'slaf-input--suggested';
  var CLS_SHELL = 'is-suggested';
  var CLS_CHIP  = 'slaf-use-this';
  var CLS_SRC   = 'slaf-suggest-source';

  function shellOf(node) {
    return node && node.closest ? node.closest('.slaf-input-shell') : null;
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* The chip lives once per node, INSIDE the input shell as its last
     flex item — beside the affix, never below the box — so a suggestion
     adds no height and a row of side-by-side boxes stays a row. (Below the
     box it made one grid cell 80px taller than its neighbour.) Without a
     shell it sits right after the node. The source sentence goes to the
     nearest [data-suggest-note] in the card if the room provides one, and
     to the chip's title regardless. Created on first show(), then only
     toggled; it keeps its space when off (visibility, not [hidden]) so
     nothing under a finger moves. Same family of bug as D-046. */
  function chipFor(node) {
    if (node._slafChip) return node._slafChip;
    var shell = shellOf(node);
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = CLS_CHIP + ' is-off';
    var src = noteHostFor(node) || document.createElement('span');
    if (!src.hasAttribute('data-suggest-note')) {
      src.className = CLS_SRC + ' is-off';
      (shell || node).insertAdjacentElement('afterend', src);
    }
    if (shell) shell.appendChild(chip); else node.insertAdjacentElement('afterend', chip);
    chip.addEventListener('click', function () {
      var s = node._slafSuggest;
      if (!s) return;
      var value = s.value;
      clear(node);
      /* The room writes. This file does not. */
      if (typeof s.onUse === 'function') s.onUse(value);
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    node._slafChip = chip;
    node._slafSource = src;
    node.addEventListener('focus', function () {
      /* Typing starts from a blank, so a blur handler reading node.value
         can never pick the suggestion up as an answer. */
      if (isSuggested(node)) {
        node.value = '';
        node.classList.remove(CLS_INPUT);
        /* From here on what is in the box is the person's, so it must read
           as entered — otherwise a commit on the way out would drop it. */
        node.removeAttribute('data-suggested');
        var shell = shellOf(node); if (shell) shell.classList.remove(CLS_SHELL);
      }
    });
    node.addEventListener('blur', function () {
      /* Left it blank: offer the suggestion again rather than an empty box. */
      if (node._slafSuggest && String(node.value || '').trim() === '') paint(node);
    });
    return chip;
  }

  function noteHostFor(node) {
    var card = node.closest ? (node.closest('.slaf-card') || node.closest('section') || node.closest('form')) : null;
    return card ? card.querySelector('[data-suggest-note]') : null;
  }

  function paint(node) {
    var s = node._slafSuggest;
    if (!s) return;
    /* A box the person is already in is theirs. Remember the proposal (blur
       offers it if the box is left blank) but do not mark the box: marking
       it would make whatever they type read as "only suggested". */
    if (node === document.activeElement) { chipFor(node); return; }
    node.value = s.display;
    node.classList.add(CLS_INPUT);
    var shell = shellOf(node); if (shell) shell.classList.add(CLS_SHELL);
    node.setAttribute('data-suggested', '1');
    node.setAttribute('data-suggest-source', s.source || '');
    var chip = chipFor(node);
    chip.classList.remove('is-off');
    chip.textContent = s.useLabel || 'Use';
    chip.setAttribute('title', s.source ? 'From: ' + s.source : 'Suggested');
    node._slafSource.classList.remove('is-off');
    node._slafSource.hidden = false;
    node._slafSource.innerHTML = 'Suggested' + (s.source ? ' — ' + escapeHtml(s.source) : '') + '. Tap “Use”, or type your own.';
  }

  /**
   * show(node, { value, display, source, onUse, useLabel })
   *   value    — what onUse receives (cents, a rate, a string)
   *   display  — what the box shows (already formatted); defaults to value
   *   source   — a short sentence naming where it came from
   *   onUse    — the room's write, called with `value` on "use this"
   * A node that already holds an ENTERED value is left alone: a suggestion
   * never overwrites an answer.
   */
  function show(node, spec) {
    if (!node || !spec) return false;
    if (!isSuggested(node) && String(node.value || '').trim() !== '') return false;
    node._slafSuggest = {
      value: spec.value,
      display: spec.display === undefined ? String(spec.value) : String(spec.display),
      source: spec.source || '',
      onUse: spec.onUse,
      useLabel: spec.useLabel
    };
    paint(node);
    return true;
  }

  /** Drop the suggestion and its chip; the box reads as empty. */
  function clear(node) {
    if (!node) return;
    var had = !!node._slafSuggest;
    node._slafSuggest = null;
    if (had && node !== document.activeElement) node.value = '';
    node.classList.remove(CLS_INPUT);
    node.removeAttribute('data-suggested');
    node.removeAttribute('data-suggest-source');
    var shell = shellOf(node); if (shell) shell.classList.remove(CLS_SHELL);
    if (node._slafChip) {
      node._slafChip.classList.add('is-off');
      /* A shared note host is cleared, not just faded: another box in the
         same card may be using it next. */
      if (node._slafSource.hasAttribute('data-suggest-note')) node._slafSource.textContent = '';
      else node._slafSource.classList.add('is-off');
    }
  }

  function isSuggested(node) {
    return !!(node && node.getAttribute && node.getAttribute('data-suggested') === '1');
  }

  /** node.value, or '' when what is showing is only a suggestion. */
  function entered(node) {
    if (!node) return '';
    return isSuggested(node) ? '' : String(node.value || '');
  }

  /** Everything currently suggested inside a root, for a room's summary. */
  function all(rootNode) {
    var host = rootNode || (typeof document !== 'undefined' ? document : null);
    if (!host || !host.querySelectorAll) return [];
    return Array.prototype.slice.call(host.querySelectorAll('[data-suggested="1"]'));
  }

  return {
    show: show,
    clear: clear,
    isSuggested: isSuggested,
    entered: entered,
    all: all,
    CLASS_INPUT: CLS_INPUT,
    CLASS_SHELL: CLS_SHELL,
    CLASS_CHIP: CLS_CHIP
  };
});
